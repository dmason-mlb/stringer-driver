import { AutomationService } from '../services/AutomationService';

const SELECTORS = {
  PITCH_AREA: '.field.responsive-pitch-fx',
  PITCH_MENU: '#stringer-client-ingame > div.content > div.panelMenu',
  MATCHUP_STATUS: '#matchup > div:nth-child(2) > div.matchup-progress-container > div.matchup-atbat-status',
  MATCHUP_INNING: '#matchup > div:nth-child(2) > div.matchup-progress-container > div.matchup-inning',
  FIRST_PITCH_DIALOG: '#templated-dialog',
  FIRST_PITCH_HEADER: '#templated-dialog-header',
  FIRST_PITCH_COMMIT: '#templated-dialog > div.templated-dialog-content > button',
  NEXT_BATTER_BUTTON: '#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button',
  
  // Hit Selectors
  HIT_LOCATION: '#hit-location > svg',
  HIT_LOCATION_HR_PATH: '#hit-location > svg > path:nth-child(8)',
  CENTER_FIELDER: '#field-dialog > div.view-wrap.field-view-wrap.pure-g > div.pure-u-1-2.field-view-column > div > div.fielder-selection > div:nth-child(9)',
  FIRST_BASEMAN: '#field-dialog > div.view-wrap.field-view-wrap.pure-g > div.pure-u-1-2.field-view-column > div > div.fielder-selection > div:nth-child(4)',
  COMMIT_FIELDERS: '#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span.commit-fielders-button-wrap.no-sub > button',
  COMMIT_RUNNERS: 'button.commit-runners-button.pure-button.submit.commit',
  
  // Runner Selectors
  RUNNER_FIRST: '.bases_container .base.first.active',
  RUNNER_SECOND: '.bases_container .base.second.active',
  RUNNER_THIRD: '.bases_container .base.third.active',

  // Special Strikeout Commit (when runners on base)
  COMMIT_RUNNERS_STRIKEOUT: '#runner-dialog > div.pure-u-1-1.baseball-interrupt-actions > span.button-success.commit-runners-button-wrap.no-sub > button',
  
  // Walk Selectors
  COMMIT_PITCH_WALK: '#panelMenuCommitBtnLabel',

  // ABS Challenge
  ABS_CHALLENGE_BUTTON: '#abs-challenge-button',

  // Manager Challenge
  REVIEW_BUTTON: '#stringer-client-ingame > div.content > div.gameday-view-menu-wrapper > div > span.review-button',
  REVIEW_START_BUTTON: '#templated-dialog-large > div > div > div.review-tab-content > form > button',

  // Score Selectors
  VISITING_SCORE: '#matchup > div:nth-child(2) > div.matchup-team.matchup-away-team > span.matchup-runs',
  HOME_SCORE: '#matchup > div:nth-child(2) > div.matchup-team.matchup-home-team > span.matchup-runs'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getRunnersOnBase(service: AutomationService): Promise<{ first: boolean, second: boolean, third: boolean }> {
  const [first, second, third] = await Promise.all([
    service.exists(SELECTORS.RUNNER_FIRST),
    service.exists(SELECTORS.RUNNER_SECOND),
    service.exists(SELECTORS.RUNNER_THIRD)
  ]);
  return { first, second, third };
}

export async function getScore(service: AutomationService): Promise<{ home: number, visiting: number }> {
  try {
    const [homeText, visitingText] = await Promise.all([
      service.getText(SELECTORS.HOME_SCORE),
      service.getText(SELECTORS.VISITING_SCORE)
    ]);
    return {
      home: parseInt(homeText || '0', 10),
      visiting: parseInt(visitingText || '0', 10)
    };
  } catch (error) {
    console.warn('Failed to get score, defaulting to 0-0', error);
    return { home: 0, visiting: 0 };
  }
}

export async function getInning(service: AutomationService): Promise<string> {
    try {
        return await service.getText(SELECTORS.MATCHUP_INNING);
    } catch (error) {
        console.warn('Failed to get inning text', error);
        return '';
    }
}

export async function getGameState(service: AutomationService): Promise<{ strikes: number, outs: number }> {
  try {
    const text = await service.getText(SELECTORS.MATCHUP_STATUS);
    // Expected format: "0-1 0 out" (Balls-Strikes Outs)
    // Regex handles "out" and "outs"
    const match = text.match(/(\d+)-(\d+)\s+(\d+)\s+outs?/i);
    if (match) {
      return {
        strikes: parseInt(match[2], 10),
        outs: parseInt(match[3], 10)
      };
    }
  } catch (error) {
    console.warn('Failed to get game state, defaulting to 0-0 0 outs', error);
  }
  return { strikes: 0, outs: 0 };
}

async function ensurePitchMenu(service: AutomationService): Promise<void> {
  // 1. Click Pitch Area to open menu
  await service.clickCenter(SELECTORS.PITCH_AREA);
  await delay(500); // Wait for UI response

  // 2. Check for First Pitch Dialog
  const dialogExists = await service.exists(SELECTORS.FIRST_PITCH_DIALOG);
  if (dialogExists) {
    const headerText = await service.getText(SELECTORS.FIRST_PITCH_HEADER);
    if (headerText.includes('First Pitch')) {
      console.log('Handling First Pitch dialog');
      await service.click(SELECTORS.FIRST_PITCH_COMMIT);
      await delay(1000); // Wait for dialog to close
      
      // Click pitch area again to actually bring up the menu if it wasn't a pitch
      await service.clickCenter(SELECTORS.PITCH_AREA);
      await delay(500);
    }
  }

  // 3. Wait for Pitch Menu
  const menuOpen = await service.waitFor(SELECTORS.PITCH_MENU, 3000);
  if (!menuOpen) {
    throw new Error('Pitch menu did not appear after clicking field');
  }
}

export async function performStrikeout(service: AutomationService): Promise<void> {
  const { strikes: currentStrikes, outs: currentOuts } = await getGameState(service);
  const strikesNeeded = 3 - currentStrikes;

  console.log(`Starting strikeout sequence. Current: ${currentStrikes} strikes, ${currentOuts} outs. Needed: ${strikesNeeded} strikes.`);

  for (let i = 0; i < strikesNeeded; i++) {
    console.log(`Performing strike ${i + 1} of ${strikesNeeded}`);
    
    await ensurePitchMenu(service);

    // 4. Perform Pitch Sequence: P -> S -> S
    await service.sendKey('p');
    await delay(200);
    await service.sendKey('s');
    await delay(200);
    await service.sendKey('s');
    
    // Wait for pitch to process
    await delay(1500);
  }

  // 5. Finalize Strikeout
  console.log('Finalizing strikeout with K event');
  await service.sendKey('k');
  await delay(1000);

  // 6. Handle Runners Commit (if runners on base and not ending inning)
  if (currentOuts < 2) {
    const runners = await getRunnersOnBase(service);
    const anyRunners = runners.first || runners.second || runners.third;
    
    if (anyRunners) {
      console.log('Runners on base, checking for Runner Commit button...');
      const runnerCommitExists = await service.waitFor(SELECTORS.COMMIT_RUNNERS_STRIKEOUT, 3000);
      if (runnerCommitExists) {
        await service.click(SELECTORS.COMMIT_RUNNERS_STRIKEOUT);
        console.log('Clicked Runner Commit (Strikeout)');
        await delay(1000);
      } else {
        console.warn('Runner Commit button (Strikeout) expected but not found');
      }
    }
  }

  // 7. Handle Next Batter (only if inning isn't ending)
  if (currentOuts < 2) {
    console.log('Checking for Next Batter button...');
    const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER_BUTTON, 3000);
    if (nextBatterBtnExists) {
      await service.click(SELECTORS.NEXT_BATTER_BUTTON);
      console.log('Clicked Next Batter');
    } else {
      console.warn('Next Batter dialog did not appear');
    }
  } else {
    console.log('Inning ending (2 outs previously), skipping Next Batter button check');
  }
}

export async function performStrikeoutsToEndInning(service: AutomationService): Promise<void> {
  console.log('Starting Strikeouts to End Inning...');
  const { outs: initialOuts } = await getGameState(service);
  const outsNeeded = 3 - initialOuts;

  console.log(`Current outs: ${initialOuts}. Performing ${outsNeeded} strikeouts.`);

  for (let i = 0; i < outsNeeded; i++) {
    console.log(`Strikeout sequence ${i + 1} of ${outsNeeded}`);
    await performStrikeout(service);
    
    // Wait for UI to settle/transition to next batter if we are not at the last one
    if (i < outsNeeded - 1) {
      console.log('Waiting for next batter transition...');
      await delay(3000); 
    }
  }
  console.log('Strikeouts to End Inning completed.');
}

export type HitType = 'Single' | 'Double' | 'Triple' | 'Home Run';

export async function performHit(service: AutomationService, hitType: HitType): Promise<void> {
  console.log(`Starting performHit: ${hitType}`);

  await ensurePitchMenu(service);

  // Check runners on base to determine if a run will score
  const runners = await getRunnersOnBase(service);
  console.log('Runners on base:', runners);

  let willScore = false;
  if (hitType === 'Single') {
    willScore = runners.third;
  } else if (hitType === 'Double') {
    willScore = runners.second || runners.third;
  } else if (hitType === 'Triple') {
    willScore = runners.first || runners.second || runners.third;
  } else if (hitType === 'Home Run') {
    willScore = true; // Always scores on HR
  }

  // 2. Send keys: 'p' -> 'x' -> ('n' or 'r') -> ('s'/'d'/'t'/'h')
  await service.sendKey('p');
  await delay(200);
  await service.sendKey('x');
  await delay(200);

  if (hitType === 'Home Run') {
    await service.sendKey('r'); // r for Home Run
    await delay(200);
    await service.sendKey('h'); // h for Home Run
  } else {
    // Use 'r' if a run scores, otherwise 'n'
    const runKey = willScore ? 'r' : 'n';
    console.log(`Sending run key: ${runKey} (willScore: ${willScore})`);
    await service.sendKey(runKey);
    await delay(200);
    
    const typeKey = hitType === 'Single' ? 's' : hitType === 'Double' ? 'd' : 't';
    await service.sendKey(typeKey);
  }
  await delay(1000); // Wait for hit location overlay

  // 3. Click Hit Location
  if (hitType === 'Home Run') {
    // Click just inside top-left of the HR path (5% down, 5% right)
    await service.clickRelative(SELECTORS.HIT_LOCATION_HR_PATH, 5, 5);
  } else {
    // Click exact center for S/D/T
    await service.clickCenter(SELECTORS.HIT_LOCATION);
  }
  await delay(1000);

  // 4. Send key: 'l' (Line drive?)
  await service.sendKey('l');
  await delay(1500);

  // 5. Fielder Selection (for non-HR)
  if (hitType !== 'Home Run') {
    console.log('Selecting fielders...');
    await service.click(SELECTORS.CENTER_FIELDER);
    await delay(500);
    await service.click(SELECTORS.FIRST_BASEMAN);
    await delay(500);
    await service.click(SELECTORS.COMMIT_FIELDERS);
    await delay(1000);
  }

  // 6. Click Commit Runners
  console.log('Committing runners...');
  const commitRunnersExists = await service.waitFor(SELECTORS.COMMIT_RUNNERS, 5000);
  if (commitRunnersExists) {
    await service.click(SELECTORS.COMMIT_RUNNERS);
  } else {
    console.warn('Commit Runners button not found');
  }
  await delay(1500);

  // 7. Click Next Batter
  console.log('Checking for Next Batter button...');
  // Increase timeout and add retry logic?
  // Sometimes it takes a bit for the button to become interactable.
  const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER_BUTTON, 10000);
  
  if (nextBatterBtnExists) {
    // Add a small delay to ensure button is ready
    await delay(500);
    await service.click(SELECTORS.NEXT_BATTER_BUTTON);
    console.log('Clicked Next Batter');
  } else {
    console.warn('Next Batter dialog did not appear');
  }
}

export type OutType = 'Fly Out' | 'Ground Out';

export async function performOut(service: AutomationService, outType: OutType): Promise<void> {
  console.log(`Starting performOut: ${outType}`);

  await ensurePitchMenu(service);
  
  // 1. Click Pitch Area (already done in ensurePitchMenu)
  
  // 2. Send keys: 'p' -> 'x' -> 'o' -> 'o'
  await service.sendKey('p');
  await delay(200);
  await service.sendKey('x');
  await delay(200);
  await service.sendKey('o');
  await delay(200);
  await service.sendKey('o');
  await delay(1000); // Wait for hit location overlay
  
  // 3. Click Hit Location
  await service.clickCenter(SELECTORS.HIT_LOCATION);
  await delay(1000);

  // 4. Send key: 'f' (Fly Out) or 'g' (Ground Out)
  const outKey = outType === 'Fly Out' ? 'f' : 'g';
  await service.sendKey(outKey);
  await delay(1500); // Wait for fielder selection dialog

  // 5. Fielder Selection
  console.log('Selecting fielders...');
  // (8) is Center Fielder
  await service.click(SELECTORS.CENTER_FIELDER);
  await delay(500);
  
  if (outType === 'Ground Out') {
    // (3) is First Baseman
    await service.click(SELECTORS.FIRST_BASEMAN);
    await delay(500);
  }

  await service.click(SELECTORS.COMMIT_FIELDERS);
  await delay(1500); // Wait for next step

  // 6. Handle Runners Commit (if runners on base)
  const runners = await getRunnersOnBase(service);
  const anyRunners = runners.first || runners.second || runners.third;

  if (anyRunners) {
      console.log('Runners on base, checking for Runner Commit button...');
      const commitRunnersExists = await service.waitFor(SELECTORS.COMMIT_RUNNERS, 3000);
      if (commitRunnersExists) {
        await service.click(SELECTORS.COMMIT_RUNNERS);
        console.log('Clicked Runner Commit');
        await delay(1500);
      } else {
         console.warn('Runner Commit button expected but not found, or not needed');
      }
  }
  
  // 7. Click Next Batter (check if outs < 3, but we don't track outs strictly here locally for flow control inside the function, we rely on UI)
  // Note: If it's the 3rd out, "Next Batter" might not appear? Or it might be "End Inning"?
  // In performStrikeout we check outs. Here we assume user knows what they are doing or we handle timeout gracefully.
  console.log('Checking for Next Batter button...');
  const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER_BUTTON, 5000);
  if (nextBatterBtnExists) {
    await service.click(SELECTORS.NEXT_BATTER_BUTTON);
    console.log('Clicked Next Batter');
  } else {
    console.warn('Next Batter dialog did not appear');
  }
}

export async function performWalk(service: AutomationService): Promise<void> {
  console.log('Starting Walk sequence...');
  await ensurePitchMenu(service);

  // Press 'p' then 'h'
  await service.sendKey('p');
  await delay(200);
  await service.sendKey('h');
  
  // Wait for/Click "Commit Pitch" button
  console.log('Waiting for Commit Pitch button...');
  const commitBtnExists = await service.waitFor(SELECTORS.COMMIT_PITCH_WALK, 3000);
  if (commitBtnExists) {
      await service.click(SELECTORS.COMMIT_PITCH_WALK);
      console.log('Clicked Commit Pitch (Walk)');
  } else {
      console.warn('Commit Pitch button (Walk) not found');
  }
  
  await delay(1000);

  // Click Next Batter
  console.log('Checking for Next Batter button...');
  const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER_BUTTON, 3000);
  if (nextBatterBtnExists) {
    await service.click(SELECTORS.NEXT_BATTER_BUTTON);
    console.log('Clicked Next Batter');
  } else {
    console.warn('Next Batter dialog did not appear');
  }
}

export async function performABSChallenge(service: AutomationService): Promise<void> {
  console.log('Starting ABS Challenge sequence...');
  
  await ensurePitchMenu(service);
  
  // Sequence: p -> b -> b
  await service.sendKey('p');
  await delay(200);
  await service.sendKey('b');
  await delay(200);
  await service.sendKey('b');
  
  await delay(1500); // Wait for modals/buttons
  
  console.log('Waiting for ABS Challenge button...');
  const absBtnExists = await service.waitFor(SELECTORS.ABS_CHALLENGE_BUTTON, 3000);
  
  if (absBtnExists) {
    await service.click(SELECTORS.ABS_CHALLENGE_BUTTON);
    console.log('Clicked ABS Challenge button');
  } else {
    console.warn('ABS Challenge button not found');
  }
}

export async function performManagerChallenge(service: AutomationService): Promise<void> {
  console.log('Starting Manager Challenge...');

  // 1. Perform Single Hit
  await performHit(service, 'Single');
  await delay(1000);

  // 2. Read Inning Status
  let isTopInning = false;
  try {
    const inningText = await service.getText(SELECTORS.MATCHUP_INNING);
    console.log(`Inning status: ${inningText}`);
    isTopInning = inningText.includes('Top');
  } catch (error) {
    console.warn('Failed to read inning status, assuming Bottom', error);
  }

  // 3. Click Review Button
  console.log('Clicking Review button...');
  await service.click(SELECTORS.REVIEW_BUTTON);
  await delay(1500);

  // 4. Select Team
  const teamValue = isTopInning ? 'home_team' : 'away_team';
  console.log(`Selecting Team: ${teamValue} (Top: ${isTopInning})`);
  
  await service.execute(`
    (function() {
        // 1. Click Input
        const input = document.querySelector('.selectize-control.reviewer .selectize-input');
        if (input) {
            input.click();
        } else {
            throw new Error('Reviewer input not found');
        }
    })()
  `);
  
  await delay(500);

  await service.execute(`
    (function() {
        // 2. Select Option by data-value
        const val = '${teamValue}';
        const option = document.querySelector('.selectize-dropdown.single.reviewer .selectize-dropdown-content div[data-value="' + val + '"]');
        
        if (option) {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            option.click(); // Redundant but safe
        } else {
            throw new Error('Team option ' + val + ' not found');
        }
    })()
  `);
  
  await delay(500);

  // 5. Select Reason: Close play at 1st (F)
  console.log('Selecting Reason: Close play at 1st (F)...');
  
  await service.execute(`
    (function() {
        // 1. Click Input
        const input = document.querySelector('.selectize-control.review_reason .selectize-input');
        if (input) {
            input.click();
        } else {
            throw new Error('Review Reason input not found');
        }
    })()
  `);

  await delay(500);

  await service.execute(`
    (function() {
        // 2. Select Option 'F'
        const option = document.querySelector('.selectize-dropdown.single.review_reason .selectize-dropdown-content div[data-value="F"]');
        if (option) {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            option.click();
        } else {
            throw new Error('Reason option F not found');
        }
    })()
  `);

  await delay(500);

  // 6. Click Start Review
  console.log('Clicking Start Review...');
  await service.click(SELECTORS.REVIEW_START_BUTTON);
  await delay(500);
  
  console.log('Manager Challenge setup complete.');
}