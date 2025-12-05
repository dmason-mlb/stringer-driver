import { AutomationService } from '../services/AutomationService';
import { 
    getGameState, 
    getScore, 
    getInning, 
    getRunnersOnBase, 
    performHit, 
    performStrikeoutsToEndInning 
} from './gameEvents';

const SELECTORS = {
    // Same as advanceGame.ts for transitions
    CONFIRM_DEFENSE: '#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span:nth-child(2) > button.commit-fielders-button.pure-button.submit.commit',
    NEXT_BATTER: '#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button'
};

interface GameState {
    homeScore: number;
    visitingScore: number;
    inningNumber: number;
    isTop: boolean;
}

export async function performFullGameSimulation(
    service: AutomationService, 
    targetHomeScore: number, 
    targetVisitingScore: number
): Promise<void> {
    console.log(`Starting Full Game Simulation. Target: Home ${targetHomeScore} - Visitor ${targetVisitingScore}`);

    let currentScore = await getScore(service);
    let inningText = await getInning(service);
    let inningNumber = parseInningNumber(inningText);
    let isTop = inningText.toUpperCase().includes('TOP');

    console.log(`Initial State: Home ${currentScore.home} - Visitor ${currentScore.visiting}, Inning: ${inningText}`);

    // Plan when to score runs
    // We need to score (Target - Current) runs for each team
    // We can only score Visiting runs in TOP innings, Home runs in BOT innings
    // We will distribute these runs randomly across remaining innings (current to 9+)
    
    // Note: If we are in the middle of an inning, we can score immediately if it's the right half.
    
    while (true) {
        await service.checkpoint(); // Check for pause/cancel

        // Check Game Over Conditions
        // 1. If we are past 9th inning (or end of 9th top)
        if (inningNumber >= 9) {
            if (isTop) {
                // Just started Top 9 (or later). 
                // If we finish this half inning, we check scores.
            } else {
                // We are in Bottom 9 (or later).
                // If Home > Visiting, game is over immediately (Walk-off or already leading after top)
                // Actually, if Home was leading after Top 9, the game would have ended and we wouldn't be in Bot 9 (usually).
                // But in this sim, we might be controlling it.
                // The prompt says: "if the home team's score is greater than the visiting team's score at the end of the top of the 9th... the game ends"
                
                // So if we are in BOT 9+, and Home > Visiting, we should probably stop (game technically over).
                if (currentScore.home > currentScore.visiting) {
                    console.log("Game Over: Home leads in Bottom 9+");
                    break;
                }
            }
        }

        // Determine runs needed for this half
        let runsNeededForCurrentTeam = 0;
        if (isTop) {
            runsNeededForCurrentTeam = targetVisitingScore - currentScore.visiting;
        } else {
            runsNeededForCurrentTeam = targetHomeScore - currentScore.home;
        }

        // If we have already reached or exceeded target, don't score more
        // (Unless user entered a target lower than current, which UI should prevent, but let's be safe)
        if (runsNeededForCurrentTeam < 0) runsNeededForCurrentTeam = 0;

        // Decision: Should we score in this inning?
        // Simple algorithm: 
        // Calculate remaining innings for this team (including this one).
        // If inning >= 9, we must score now if we are behind/tied and need to reach target? 
        // Or distribute evenly? 
        // Random distribution: Probability = RunsNeeded / RemainingInnings.
        // Remaining Innings estimation: (9 - currentInning + 1). If > 9, assume 1.
        
        const remainingInnings = Math.max(1, 9 - inningNumber + 1);
        // We can score multiple runs in one inning.
        // Let's determine how many runs to score THIS inning.
        // We want to ensure we reach the target by the 9th (or asap if >9).
        
        let runsToScoreNow = 0;
        if (runsNeededForCurrentTeam > 0) {
            if (inningNumber >= 9) {
                // Late game, score everything needed now?
                // If we are Visitor in Top 9, we score all needed.
                // If we are Home in Bot 9, we score all needed.
                runsToScoreNow = runsNeededForCurrentTeam;
            } else {
                // Distribute. 
                // Logic: iterate runs needed, flip coin based on remaining innings?
                // Or just pick a random number between 0 and RunsNeeded, weighted?
                // Let's try to spread them out.
                // Chance to score a run = 1 / remainingInnings?
                // If we need 5 runs in 5 innings, avg 1 per inning.
                
                // Better approach:
                // For each needed run, assign it to a bucket (future inning).
                // But we are in a loop, so we just decide for *this* inning.
                
                // Simplification: Score a random amount of the needed runs, 
                // but ensure we don't leave too many for the end?
                // Let's just use a probabilistic approach for each needed run.
                
                for (let k = 0; k < runsNeededForCurrentTeam; k++) {
                    // Chance to score this run in this inning
                    if (Math.random() < (1 / remainingInnings) * 1.5) { // 1.5x multiplier to be slightly aggressive early
                         runsToScoreNow++;
                    }
                }
                
                // Ensure we score at least 1 if we have a lot needed and few innings left?
                if (runsNeededForCurrentTeam > 0 && runsToScoreNow === 0 && Math.random() < 0.2) {
                    runsToScoreNow = 1;
                }
            }
        }

        console.log(`Inning: ${inningText} (${isTop ? 'Top' : 'Bot'} ${inningNumber}). Need: ${runsNeededForCurrentTeam}. Scoring Now: ${runsToScoreNow}`);

        // EXECUTE RUNS
        for (let r = 0; r < runsToScoreNow; r++) {
            await service.checkpoint(); // Check for pause/cancel
            // Check runners to see how many a HR will score
            const runners = await getRunnersOnBase(service);
            let runValue = 1; // Batter
            if (runners.first) runValue++;
            if (runners.second) runValue++;
            if (runners.third) runValue++;

            // If hitting a HR would overshoot the target significantly?
            // The prompt says: "Use the home run automation to score runs".
            // "If there are runners on base, then a home run will score 1 + number of runners on base"
            // We might score more than intended.
            
            // If current + runValue > target, maybe we should try to clear bases or just accept it?
            // Prompt validation says: "error ... if either of the input scores are greater than the CURRENT score".
            // It implies target is exact. But Baseball scoring is discrete. 
            // If I need 1 run and bases are loaded (4 runs on HR), I might overshoot.
            // I'll just proceed with HR as instructed. The prompt implies "Use the home run automation to score runs".
            
            // NOTE: If we hit a HR, `r` increments by 1, but score increments by runValue.
            // We should adjust `r` or the loop limit.
            // Actually `runsToScoreNow` is "How many runs we want to add".
            
            if (runValue > (runsToScoreNow - r)) {
                // We are about to score more than we planned for this inning.
                // Should we stop? 
                // If we are in the 9th and NEED these runs, we take them.
                // If we are early, maybe we skip this hit? 
                // Let's just hit the HR. Over-scoring is better than under-scoring in a "Sim to Final" usually,
                // unless exact score is required. The prompt asks for "final scores", implying exact.
                // But we only have "Home Run" tool instructed. 
                // Using HR clears bases.
            }
            
            await performHit(service, 'Home Run');
            
            // Update loop progress
            // If we scored 4 runs, we count that against runsToScoreNow?
            // `runsToScoreNow` was a rough target.
            // Let's just decrement runsNeededForCurrentTeam by runValue
            
            // Re-read score to be accurate
             const newScore = await getScore(service);
             if (isTop) {
                 const gained = newScore.visiting - currentScore.visiting;
                 // Adjust loop if we scored multiple
                 // Actually, we should just break this inner loop if we reached the target for this inning?
                 // Or if we reached the *Game Target*.
                 if (newScore.visiting >= targetVisitingScore) break;
             } else {
                 const gained = newScore.home - currentScore.home;
                 if (newScore.home >= targetHomeScore) break;
             }
             
             // Update local state
             currentScore = newScore;
        }

        // Check if we reached game target for this team. 
        // If we are Home team in Bot 9+ and passed Visiting, game ends immediately.
        if (!isTop && inningNumber >= 9 && currentScore.home > currentScore.visiting) {
             console.log("Walk-off! Home wins.");
             break;
        }

        // FINISH HALF INNING
        // "Use the strikeout automation to get outs in an inning"
        await performStrikeoutsToEndInning(service);

        // UPDATE STATE AFTER HALF INNING
        // We need to check if game ended.
        // Prompt: "if the home team's score is greater than the visiting team's score at the end of the top of the 9th... game ends"
        
        currentScore = await getScore(service);
        
        if (isTop && inningNumber >= 9) {
            if (currentScore.home > currentScore.visiting) {
                console.log("Game Over: Home leads after Top " + inningNumber);
                break;
            }
        }

        // Need to handle End of Game detection if the app shows a dialog or changes state?
        // Usually "Strikeouts to End Inning" handles the 3 outs.
        // If the game ended, "Confirm Defense" won't appear.
        
        // TRANSITION TO NEXT HALF INNING
        // Check if game is actually over (Target reached AND Innings satisfied)
        // Conditions to continue:
        // 1. Inning < 9
        // 2. OR Score is tied
        // 3. OR (Top 9+ ended AND Visitor > Home) -> Must play Bottom
        // 4. OR (Bot 9+ ended AND Visitor == Home) -> Must play Top next (Extra innings)
        
        const gameOver = checkGameOver(inningNumber, isTop, currentScore.home, currentScore.visiting);
        if (gameOver) {
            console.log("Simulation Complete (Game Over Logic).");
            break;
        }
        
        // Perform Transition
        console.log("Transitioning to next half inning...");
        
        // Wait for Confirm Defense (switching sides)
        const defenseBtnExists = await service.waitFor(SELECTORS.CONFIRM_DEFENSE, 10000);
        if (defenseBtnExists) {
            await service.click(SELECTORS.CONFIRM_DEFENSE);
            await service.delay(1000);
        } else {
             // If game is over, this might not appear. 
             // But we checked gameOver above? Maybe we missed something.
             console.warn("Confirm Defense not found. Game might be over or stuck.");
        }

        // Wait for Next Batter
        const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER, 10000);
        if (nextBatterBtnExists) {
            await service.click(SELECTORS.NEXT_BATTER);
            await service.delay(2000); // Wait for next inning to start
        }

        // UPDATE INNING STATE
        inningText = await getInning(service);
        inningNumber = parseInningNumber(inningText);
        isTop = inningText.toUpperCase().includes('TOP');
        currentScore = await getScore(service); // Sync score
    }
    
    console.log("Full Game Simulation Finished.");
}

function parseInningNumber(text: string): number {
    // "TOP 1", "BOT 10"
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
}

function checkGameOver(inning: number, isTop: boolean, home: number, visitor: number): boolean {
    if (inning < 9) return false;
    
    if (isTop) {
        // Just finished Top of Inning N (>=9)
        if (home > visitor) return true; // Home wins
        // If Tie or Visitor leads, must play Bottom
        return false; 
    } else {
        // Just finished Bottom of Inning N (>=9)
        if (home != visitor) return true; // Someone won
        // Tie -> Go to next inning
        return false;
    }
}

