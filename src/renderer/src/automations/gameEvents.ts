import { AutomationService } from '../services/AutomationService';

const SELECTORS = {
  PITCH_AREA: '.field.responsive-pitch-fx',
  PITCH_MENU: '#stringer-client-ingame > div.content > div.panelMenu',
  MATCHUP_STATUS: '#matchup > div:nth-child(2) > div.matchup-progress-container > div.matchup-atbat-status',
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
  COMMIT_RUNNERS_STRIKEOUT: '#runner-dialog > div.pure-u-1-1.baseball-interrupt-actions > span.button-success.commit-runners-button-wrap.no-sub > button'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getRunnersOnBase(service: AutomationService): Promise<{ first: boolean, second: boolean, third: boolean }> {
  const [first, second, third] = await Promise.all([
    service.exists(SELECTORS.RUNNER_FIRST),
    service.exists(SELECTORS.RUNNER_SECOND),
    service.exists(SELECTORS.RUNNER_THIRD)
  ]);
  return { first, second, third };
}

async function getGameState(service: AutomationService): Promise<{ strikes: number, outs: number }> {
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
  const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER_BUTTON, 5000);
  if (nextBatterBtnExists) {
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
