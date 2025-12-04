import { AutomationService } from '../services/AutomationService';

const SELECTORS = {
  PITCH_AREA: '.field.responsive-pitch-fx',
  PITCH_MENU: '#stringer-client-ingame > div.content > div.panelMenu',
  MATCHUP_STATUS: '#matchup > div:nth-child(2) > div.matchup-progress-container > div.matchup-atbat-status',
  FIRST_PITCH_DIALOG: '#templated-dialog',
  FIRST_PITCH_HEADER: '#templated-dialog-header',
  FIRST_PITCH_COMMIT: '#templated-dialog > div.templated-dialog-content > button',
  NEXT_BATTER_BUTTON: '#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

export async function performStrikeout(service: AutomationService): Promise<void> {
  const { strikes: currentStrikes, outs: currentOuts } = await getGameState(service);
  const strikesNeeded = 3 - currentStrikes;

  console.log(`Starting strikeout sequence. Current: ${currentStrikes} strikes, ${currentOuts} outs. Needed: ${strikesNeeded} strikes.`);

  for (let i = 0; i < strikesNeeded; i++) {
    console.log(`Performing strike ${i + 1} of ${strikesNeeded}`);
    
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

  // 6. Handle Next Batter (only if inning isn't ending)
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
