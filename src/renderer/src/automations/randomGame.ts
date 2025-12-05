import { AutomationService } from '../services/AutomationService';
import {
    getGameState,
    getScore,
    getInning,
    performHit,
    performOut,
    performStrikeout,
    performWalk
} from './gameEvents';

const SELECTORS = {
    CONFIRM_DEFENSE: '#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span:nth-child(2) > button.commit-fielders-button.pure-button.submit.commit',
    NEXT_BATTER: '#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button'
};

// Weighted outcome probabilities (percentages)
// Based on MLB average at-bat outcomes
type AtBatOutcome = 'Ground Out' | 'Strikeout' | 'Fly Out' | 'Single' | 'Walk' | 'Double' | 'Home Run' | 'Triple';

interface OutcomeWeight {
    outcome: AtBatOutcome;
    weight: number;
}

const OUTCOME_WEIGHTS: OutcomeWeight[] = [
    { outcome: 'Ground Out', weight: 23.5 },
    { outcome: 'Strikeout', weight: 22.2 },
    { outcome: 'Fly Out', weight: 21.8 },
    { outcome: 'Single', weight: 14.3 },
    { outcome: 'Walk', weight: 8.4 },
    { outcome: 'Double', weight: 4.2 },
    { outcome: 'Home Run', weight: 3.1 },
    { outcome: 'Triple', weight: 0.3 }
];

// Calculate cumulative weights for selection
function selectRandomOutcome(): AtBatOutcome {
    const totalWeight = OUTCOME_WEIGHTS.reduce((sum, o) => sum + o.weight, 0);
    const random = Math.random() * totalWeight;

    let cumulative = 0;
    for (const item of OUTCOME_WEIGHTS) {
        cumulative += item.weight;
        if (random < cumulative) {
            return item.outcome;
        }
    }

    // Fallback (should never reach here)
    return 'Ground Out';
}

async function performRandomAtBat(service: AutomationService): Promise<{ isOut: boolean }> {
    const outcome = selectRandomOutcome();
    console.log(`Random outcome selected: ${outcome}`);

    let isOut = false;

    switch (outcome) {
        case 'Ground Out':
            await performOut(service, 'Ground Out');
            isOut = true;
            break;
        case 'Strikeout':
            await performStrikeout(service);
            isOut = true;
            break;
        case 'Fly Out':
            await performOut(service, 'Fly Out');
            isOut = true;
            break;
        case 'Single':
            await performHit(service, 'Single');
            break;
        case 'Double':
            await performHit(service, 'Double');
            break;
        case 'Triple':
            await performHit(service, 'Triple');
            break;
        case 'Home Run':
            await performHit(service, 'Home Run');
            break;
        case 'Walk':
            await performWalk(service);
            break;
    }

    return { isOut };
}

function parseInningNumber(text: string): number {
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
        // Tie -> Go to next inning (extra innings)
        return false;
    }
}

export async function performRandomGameSimulation(service: AutomationService): Promise<void> {
    console.log('Starting Random Outcome Game Simulation (9 innings)...');

    let currentScore = await getScore(service);
    let inningText = await getInning(service);
    let inningNumber = parseInningNumber(inningText);
    let isTop = inningText.toUpperCase().includes('TOP');

    console.log(`Initial State: Home ${currentScore.home} - Visitor ${currentScore.visiting}, Inning: ${inningText}`);

    let atBatCount = 0;

    while (true) {
        await service.checkpoint(); // Check for pause/cancel

        // Check Game Over Conditions before starting a new at-bat
        if (inningNumber >= 9) {
            if (!isTop && currentScore.home > currentScore.visiting) {
                console.log("Game Over: Home leads in Bottom 9+");
                break;
            }
        }

        // Get current game state
        const { outs: currentOuts } = await getGameState(service);

        console.log(`\n--- At-Bat #${++atBatCount} ---`);
        console.log(`Inning: ${isTop ? 'Top' : 'Bot'} ${inningNumber}, Outs: ${currentOuts}`);
        console.log(`Score: Home ${currentScore.home} - Visitor ${currentScore.visiting}`);

        // Perform random at-bat
        const { isOut } = await performRandomAtBat(service);

        // Update score after at-bat
        currentScore = await getScore(service);

        // Check for walk-off in bottom of 9th or later
        if (!isTop && inningNumber >= 9 && currentScore.home > currentScore.visiting) {
            console.log("Walk-off! Home wins.");
            break;
        }

        // Check if the inning ended (3 outs)
        const { outs: newOuts } = await getGameState(service);

        // If outs went back to 0, inning has changed
        // Or we can detect by re-reading inning text
        const newInningText = await getInning(service);
        const newInningNumber = parseInningNumber(newInningText);
        const newIsTop = newInningText.toUpperCase().includes('TOP');

        // Detect half-inning transition
        if (newInningNumber !== inningNumber || newIsTop !== isTop) {
            console.log(`Half-inning ended. Transitioning from ${isTop ? 'Top' : 'Bot'} ${inningNumber} to ${newIsTop ? 'Top' : 'Bot'} ${newInningNumber}`);

            // Check if game is over
            const gameOver = checkGameOver(inningNumber, isTop, currentScore.home, currentScore.visiting);
            if (gameOver) {
                console.log("Game Over (end of regulation or extra inning).");
                break;
            }

            // Handle transition buttons if needed
            // The performStrikeout/performOut functions should handle Next Batter
            // But we may need to handle Confirm Defense between half-innings

            const defenseBtnExists = await service.waitFor(SELECTORS.CONFIRM_DEFENSE, 3000);
            if (defenseBtnExists) {
                await service.click(SELECTORS.CONFIRM_DEFENSE);
                console.log('Clicked Confirm Defense');
                await service.delay(1000);
            }

            const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER, 3000);
            if (nextBatterBtnExists) {
                await service.click(SELECTORS.NEXT_BATTER);
                console.log('Clicked Next Batter (transition)');
                await service.delay(2000);
            }

            // Update state for new half-inning
            inningNumber = newInningNumber;
            isTop = newIsTop;

            // Re-read inning in case it changed during transition
            const updatedInningText = await getInning(service);
            inningNumber = parseInningNumber(updatedInningText);
            isTop = updatedInningText.toUpperCase().includes('TOP');
        }

        // Small delay between at-bats
        await service.delay(1000);
    }

    // Final score
    const finalScore = await getScore(service);
    console.log(`\nRandom Game Simulation Complete!`);
    console.log(`Final Score: Home ${finalScore.home} - Visitor ${finalScore.visiting}`);
    console.log(`Total At-Bats: ${atBatCount}`);
}
