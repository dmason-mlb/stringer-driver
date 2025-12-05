import { AutomationService } from '../services/AutomationService';
import { performStrikeoutsToEndInning } from './gameEvents';

const SELECTORS = {
    CONFIRM_DEFENSE: '#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span:nth-child(2) > button.commit-fielders-button.pure-button.submit.commit',
    NEXT_BATTER: '#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const performAdvanceTwoFullInnings = async (service: AutomationService) => {
  console.log('Starting Advance Two Full Innings...');

  // 2 innings = 4 half innings
  const halfInnings = 4;

  for (let i = 0; i < halfInnings; i++) {
    console.log(`Starting half-inning ${i + 1} of ${halfInnings}`);
    
    // 1. Perform Strikeouts to End Inning
    await performStrikeoutsToEndInning(service);

    // If we are not at the very end, we need to transition to the next half inning
    if (i < halfInnings - 1) {
        console.log('Transitioning to next half-inning...');
        
        // 2. Confirm Defense
        // Wait for the dialog to appear. It might take a moment after the 3rd out.
        // Using a longer timeout because the "Switching Sides" animation or logic might take time.
        console.log('Waiting for Confirm Defense button...');
        const defenseBtnExists = await service.waitFor(SELECTORS.CONFIRM_DEFENSE, 15000); 
        
        if (defenseBtnExists) {
            await service.click(SELECTORS.CONFIRM_DEFENSE);
            console.log('Clicked Confirm Defense');
        } else {
            console.warn('Confirm Defense button not found within timeout. This might be expected if the inning transition is different or manual intervention occurred.');
        }

        await delay(1000);

        // 3. Next Batter
        console.log('Waiting for Next Batter button...');
        const nextBatterBtnExists = await service.waitFor(SELECTORS.NEXT_BATTER, 10000);
        
        if (nextBatterBtnExists) {
            await service.click(SELECTORS.NEXT_BATTER);
            console.log('Clicked Next Batter');
        } else {
            console.warn('Next Batter button not found within timeout.');
        }
        
        await delay(2000); // Give time for the next inning to visually start
    }
  }
  
  console.log('Advance Two Full Innings completed.');
};