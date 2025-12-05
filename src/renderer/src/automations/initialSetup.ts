import { AutomationService } from '../services/AutomationService';

interface Player {
  id: string;
  status: string;
  posCode: string;
  name: string;
}

interface LineupInfo {
  availablePlayers: Player[];
  availablePitchers: Player[];
  isDh: boolean;
  rowCount: number;
}

/**
 * Scrape roster and DH setting from the page
 */
const getLineupInfo = async (service: AutomationService): Promise<LineupInfo> => {
  return service.execute<LineupInfo>(`
    (function() {
      const rosterRows = Array.from(document.querySelectorAll('#lineup-scroller > div > table > tbody > tr'));
      
      const availablePlayers = rosterRows.map(row => {
          const id = row.getAttribute('data-id');
          const status = row.getAttribute('data-status');
          const posCodeCell = row.querySelector('td:nth-child(1)');
          const posCode = posCodeCell ? posCodeCell.textContent.trim() : '';
          const nameCell = row.querySelector('td:nth-child(3)');
          const name = nameCell ? nameCell.textContent.trim() : 'Unknown';
          return { id, status, posCode, name };
      }).filter(p => p.status === 'A');

      const availablePitchers = availablePlayers.filter(p => p.posCode === '1');
      
      // Check DH Setting
      const dhCheckbox = document.querySelector('#dhOption');
      const isDh = dhCheckbox && dhCheckbox.checked;
      const rowCount = isDh ? 10 : 9;

      return {
        availablePlayers,
        availablePitchers,
        isDh,
        rowCount
      };
    })()
  `);
};

/**
 * Set a single row in the lineup
 */
const setLineupRow = async (
  service: AutomationService, 
  row: number, 
  positionIndexToSelect: number, 
  shouldSelectPitcher: boolean,
  usedPlayerIds: string[],
  availablePlayers: Player[],
  availablePitchers: Player[]
): Promise<string | null> => {
  
  // Pass data to the browser context
  const args = {
    row,
    positionIndexToSelect,
    shouldSelectPitcher,
    usedPlayerIds,
    availablePlayers,
    availablePitchers
  };

  return service.execute<string | null>(`
    (async function() {
      const args = ${JSON.stringify(args)};
      const { row, positionIndexToSelect, shouldSelectPitcher, usedPlayerIds, availablePlayers, availablePitchers } = args;
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const usedSet = new Set(usedPlayerIds);

      const playerInputSelector = \`#mainContainer > div.content > div > div.view-wrap.pure-u-2-3 > div:nth-child(2) > table > tbody > tr:nth-child(\${row}) > td:nth-child(3) > div > div.selectize-input.items\`;
      const positionInputSelector = \`#mainContainer > div.content > div > div.view-wrap.pure-u-2-3 > div:nth-child(2) > table > tbody > tr:nth-child(\${row}) > td:nth-child(4) > div > div.selectize-input.items\`;

      // --- Select Position ---
      const positionInput = document.querySelector(positionInputSelector);
      if (positionInput) {
          positionInput.click();
          await delay(300);

          const activeDropdown = document.querySelector('.selectize-dropdown.single.position:not([style*="display: none"])');
          if (activeDropdown) {
              const items = activeDropdown.querySelectorAll('.selectize-dropdown-content > div[data-value]');
              let targetPosItem = null;
              if (positionIndexToSelect === -1) {
                  targetPosItem = items[items.length - 1]; // DH is usually last
              } else if (items.length > positionIndexToSelect) {
                  targetPosItem = items[positionIndexToSelect];
              }

              if (targetPosItem) {
                  targetPosItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              }
          }
      }
      await delay(300);

      // --- Select Player ---
      const playerInput = document.querySelector(playerInputSelector);
      let selectedId = null;

      if (playerInput) {
          playerInput.click();
          await delay(300);

          const activeDropdown = document.querySelector('.selectize-dropdown.single.player:not([style*="display: none"])');
          if (activeDropdown) {
              const items = Array.from(activeDropdown.querySelectorAll('.selectize-dropdown-content > div[data-value]'));
              
              let targetOption = items.find(opt => {
                  const val = opt.getAttribute('data-value');
                  if (!val || usedSet.has(val)) return false;
                  const isAvailable = availablePlayers.some(p => p.id === val);
                  if (!isAvailable) return false;
                  const isPitcher = availablePitchers.some(p => p.id === val);
                  return shouldSelectPitcher ? isPitcher : !isPitcher;
              });

              // Fallback
              if (!targetOption && !shouldSelectPitcher) {
                  targetOption = items.find(opt => {
                      const val = opt.getAttribute('data-value');
                      return val && !usedSet.has(val) && availablePlayers.some(p => p.id === val);
                  });
              }

              if (targetOption) {
                  selectedId = targetOption.getAttribute('data-value');
                  targetOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              }
          }
      }
      await delay(300);
      return selectedId;
    })()
  `);
};

/**
 * Process the lineup for the current team
 */
const processLineup = async (service: AutomationService) => {
  console.log('[InitialSetup] Analyzing roster...');
  const info = await getLineupInfo(service);
  console.log(`[InitialSetup] Found ${info.availablePlayers.length} players, DH: ${info.isDh}`);

  const usedPlayerIds: string[] = [];

  for (let row = 1; row <= info.rowCount; row++) {
    await service.checkpoint(); // Check for pause/cancel

    let positionIndexToSelect = row; 
    let shouldSelectPitcher = false;

    if (info.isDh) {
        if (row === 1) {
            positionIndexToSelect = -1; // DH (last)
            shouldSelectPitcher = false;
        } else if (row === 10) {
            positionIndexToSelect = 1; // Pitcher
            shouldSelectPitcher = true;
        } else {
            shouldSelectPitcher = false;
        }
    } else {
        shouldSelectPitcher = (row === 1);
    }

    try {
      const selectedId = await setLineupRow(
        service, 
        row, 
        positionIndexToSelect, 
        shouldSelectPitcher, 
        usedPlayerIds, 
        info.availablePlayers, 
        info.availablePitchers
      );

      if (selectedId) {
        usedPlayerIds.push(selectedId);
      }
      
    } catch (err) {
      console.error(`Row ${row} error:`, err);
    }
    
    await service.delay(100); // Small delay between rows
  }
  console.log('[InitialSetup] Lineup population done.');
};

const confirmLineup = async (service: AutomationService) => {
  await service.execute(`
    (function() {
      const confirmBtnSelector = '#mainContainer > div.content > div > div.pure-u-1-1.baseball-interrupt-actions > button:nth-child(1)';
      const confirmBtn = document.querySelector(confirmBtnSelector);
      if (confirmBtn) {
          confirmBtn.click();
      }
    })()
  `);
};

const processPreGameData = async (service: AutomationService) => {
  console.log('[InitialSetup] Populating Pre-Game Data...');
  
  // Pairs: [input selector, item selector]
  // We execute these one by one to allow interruption
  const dropdownPairs = [
      // Stringer 1
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(1) > fieldset > div:nth-child(3) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(1) > fieldset > div:nth-child(3) > div.selectize-dropdown.single.stringer > div > div:nth-child(2)'],
      // Official Scorer
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(2) > fieldset > div > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(2) > fieldset > div > div.selectize-dropdown.single.scorer > div > div:nth-child(2)'],
      // Home Plate Umpire
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(3) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(3) > div.selectize-dropdown.single.umpire > div > div:nth-child(2)'],
      // Left Field Umpire
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(4) > fieldset > div:nth-child(3) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(4) > fieldset > div:nth-child(3) > div.selectize-dropdown.single.umpire > div > div:nth-child(3)'],
      // First Base Umpire
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(5) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(5) > div.selectize-dropdown.single.umpire > div > div:nth-child(4)'],
      // Right Field Umpire
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(4) > fieldset > div:nth-child(5) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(4) > fieldset > div:nth-child(5) > div.selectize-dropdown.single.umpire > div > div:nth-child(5)'],
      // Second Base Umpire
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(7) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(7) > div.selectize-dropdown.single.umpire > div > div:nth-child(6)'],
      // Third Base Umpire
      ['#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(9) > div.selectize-input.items', '#mainContainer > div.content > div.pure-g.pregame-data-container > form:nth-child(3) > fieldset > div:nth-child(9) > div.selectize-dropdown.single.umpire > div > div:nth-child(7)']
  ];

  for (const [inputSelector, itemSelector] of dropdownPairs) {
      await service.checkpoint();
      await service.execute(`
        (async function() {
           const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
           const input = document.querySelector('${inputSelector}');
           if (input) {
               input.click();
               await delay(500);
               const item = document.querySelector('${itemSelector}');
               if (item) {
                   item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
               }
           }
        })()
      `);
      await service.delay(400);
  }

  await service.checkpoint();
  // Confirm pre-game data
  await service.execute(`
     (function() {
        const confirmBtn = document.querySelector('#mainContainer > div.content > button');
        if (confirmBtn) confirmBtn.click();
     })()
  `);
};

const processWeather = async (service: AutomationService) => {
    console.log('[InitialSetup] Populating Weather...');
    await service.checkpoint();

    // 1. Weather Condition
    await service.execute(`
      (async function() {
         const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
         const conditionInput = document.querySelector('#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(1) > fieldset > div > div.selectize-input');
         if (conditionInput) {
             conditionInput.click();
             await delay(500);
             const sunnyOption = document.querySelector('#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(1) > fieldset > div > div.selectize-dropdown.single.weather-condition > div > div:nth-child(2)');
             if (sunnyOption) {
                 sunnyOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
             } else {
                const fallback = document.querySelector('.selectize-dropdown.single.weather-condition div[data-value="Sunny"]');
                if (fallback) fallback.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
             }
         }
      })()
    `);
    await service.delay(500);

    // 2. Temperature
    await service.execute(`
      (function() {
         const tempInput = document.querySelector('#weather-temperature');
         if (tempInput) {
             tempInput.value = "70";
             tempInput.dispatchEvent(new Event('input', { bubbles: true }));
             tempInput.dispatchEvent(new Event('change', { bubbles: true }));
         }
      })()
    `);
    await service.delay(500);

    // 3. Wind Direction
    await service.execute(`
      (async function() {
         const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
         const windDirInput = document.querySelector('#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(3) > fieldset > div.selectize-control.wind-direction.single > div.selectize-input');
         if (windDirInput) {
             windDirInput.click();
             await delay(500);
             const calmOption = document.querySelector('.selectize-dropdown.single.wind-direction div[data-value="Calm"]');
             if (calmOption) {
                 calmOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
             }
         }
      })()
    `);
    await service.delay(500);

    // 4. Wind Speed
    await service.execute(`
      (function() {
         const windSpeedInput = document.querySelector('#weather-wind-speed');
         if (windSpeedInput) {
             windSpeedInput.value = "0";
             windSpeedInput.dispatchEvent(new Event('input', { bubbles: true }));
             windSpeedInput.dispatchEvent(new Event('change', { bubbles: true }));
         }
      })()
    `);
    await service.delay(500);

    // 5. Confirm Weather
    await service.execute(`
      (function() {
         const confirmBtn = document.querySelector('#mainContainer > div.content > button');
         if (confirmBtn) confirmBtn.click();
      })()
    `);
    
    console.log('[InitialSetup] Waiting for Weather confirmation dialog...');
    await service.delay(1000); // wait for dialog to appear

    // Handle Alertify dialogs (1 or 2)
    const clickedFirst = await service.execute<boolean>(`
      (function() {
         const okBtn = document.querySelector('#alertify-ok');
         if (okBtn && okBtn.offsetParent !== null) {
             okBtn.click();
             return true;
         }
         return false;
      })()
    `);

    if (clickedFirst) {
        await service.delay(1000);
        await service.execute(`
          (function() {
             const okBtn = document.querySelector('#alertify-ok');
             if (okBtn && okBtn.offsetParent !== null) {
                 okBtn.click();
             }
          })()
        `);
    }
};

const showChoiceDialog = async (service: AutomationService, message: string, btn1Text: string, btn2Text: string): Promise<'btn1' | 'btn2'> => {
  // Inject UI
  await service.execute(`
    (function() {
      const overlay = document.createElement('div');
      overlay.id = 'automation-alert-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;justify-content:center;align-items:center;';
      
      const box = document.createElement('div');
      box.style.cssText = 'background:white;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);text-align:center;min-width:300px;color:black;font-family:sans-serif;';
      
      const msg = document.createElement('p');
      msg.textContent = ${JSON.stringify(message)};
      msg.style.cssText = 'margin-bottom:20px;font-size:16px;color:#333;white-space: pre-wrap;';
      
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;justify-content:space-around;gap:10px;';
      
      const btn1 = document.createElement('button');
      btn1.textContent = ${JSON.stringify(btn1Text)};
      btn1.id = 'automation-btn-1';
      btn1.style.cssText = 'padding:8px 16px;background:#2196F3;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px;';
      
      const btn2 = document.createElement('button');
      btn2.textContent = ${JSON.stringify(btn2Text)};
      btn2.id = 'automation-btn-2';
      btn2.style.cssText = 'padding:8px 16px;background:#e0e0e0;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
      
      // Store result in window.automationResult
      window.automationResult = null;
      
      btn1.onclick = () => { window.automationResult = 'btn1'; };
      btn2.onclick = () => { window.automationResult = 'btn2'; };
      
      btnContainer.appendChild(btn1);
      btnContainer.appendChild(btn2);
      box.appendChild(msg);
      box.appendChild(btnContainer);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    })()
  `);

  // Poll for result
  while (true) {
    await service.checkpoint();
    const result = await service.execute<string | null>('window.automationResult');
    if (result) {
      // Clean up
      await service.execute(`
        (function() {
          const overlay = document.getElementById('automation-alert-overlay');
          if (overlay) overlay.remove();
          delete window.automationResult;
        })()
      `);
      return result as 'btn1' | 'btn2';
    }
    await service.delay(200);
  }
};

const runWarmups = async (service: AutomationService) => {
  console.log('[InitialSetup] Starting Send Warmups sequence...');
  await service.checkpoint();

  // 1. Click Network Status
  await service.click('#mainContainer > core-menu > div.app-status-pregame > div.connection-status-container > div:nth-child(1) > span.is-editable');
  await service.delay(1000);

  // 2. Click Yes on alertify
  await service.execute(`
    (function() {
       const btn = document.querySelector('#alertify-ok');
       if(btn) btn.click();
    })()
  `);
  await service.delay(1000);

  // 3. Check checkboxes
  await service.execute(`
    (function() {
       const dfe = document.querySelector('#dfe_connection_toggle');
       if(dfe && !dfe.checked) dfe.click();
       const trackman = document.querySelector('#trackman_toggle');
       if(trackman && !trackman.checked) trackman.click();
    })()
  `);
  await service.delay(500);

  // 4. Commit
  await service.click('#templated-dialog > div.templated-dialog-content > div > form > div.pure-button.submit');
  await service.delay(1000);

  // Intermediate Yes (might not exist)
  await service.execute(`
    (function() {
      const btn = document.querySelector('#alertify-ok');
      if(btn) btn.click();
    })()
  `);
  await service.delay(1000);

  // 5. Click Send Warmups
  await service.execute(`
    (function() {
       let btn = document.querySelector('#mainContainer > core-menu > div.app-status-pregame > button');
       if (!btn) {
           const all = Array.from(document.querySelectorAll('button'));
           btn = all.find(b => b.textContent && b.textContent.includes('Send') && b.textContent.includes('Warmups'));
       }
       if (btn) btn.click();
       else throw new Error("Send Warmups button not found");
    })()
  `);
  await service.delay(1000);

  // 6. Confirm Warmups (handling potential double dialogs)
  // Poll for dialog
  let foundDialog = false;
  for(let i=0; i<20; i++) {
      await service.checkpoint();
      const exists = await service.execute(`
          (function() {
            return !!(document.querySelector('#alertify-ok') && document.querySelector('#alertify-ok').offsetParent);
          })()
      `);
      if (exists) {
          foundDialog = true;
          break;
      }
      await service.delay(500);
  }

  if (foundDialog) {
      await service.execute(`
        (function() {
          document.querySelector('#alertify-ok').click();
        })()
      `);
      await service.delay(1000);
      // Second confirmation?
       await service.execute(`
          (function() {
            const btn = document.querySelector('#alertify-ok');
            if(btn && btn.offsetParent) btn.click();
          })()
       `);
  } else {
      throw new Error("Warmups confirmation dialog not found");
  }
};

const runStartGame = async (service: AutomationService) => {
  console.log('[InitialSetup] Starting Start Game sequence...');
  await service.checkpoint();

  // a. Click Play Ball
  await service.click('#mainContainer > core-menu > button');
  
  // b. Wait for Umpire Confirmation
  console.log('[InitialSetup] Waiting for Umpire Confirmation...');
  let found = await service.waitFor('#templated-dialog > div.templated-dialog-content > button', 60000);
  if (found) {
      await service.click('#templated-dialog > div.templated-dialog-content > button');
  } else {
      throw new Error("Commit Umpires button not found or timed out");
  }
  
  await service.delay(2000);

  // d. Confirm Defense
  console.log('[InitialSetup] Waiting for Confirm Defense...');
  found = await service.waitFor('#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span:nth-child(2) > button.commit-fielders-button.pure-button.submit.commit', 60000);
  if (found) {
      await service.click('#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span:nth-child(2) > button.commit-fielders-button.pure-button.submit.commit');
  } else {
      console.log("Confirm Defense button not found - might be skipped");
  }

  await service.delay(1000);

  // f. First Batter
  console.log('[InitialSetup] Waiting for First Batter...');
  found = await service.waitFor('#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button', 20000);
  if (found) {
      await service.click('#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button');
  } else {
      console.log("First Batter button not found");
  }
};

export const runInitialSetup = async (service: AutomationService): Promise<string | null> => {
  console.log('Running Initial Setup...');

  try {
    // 1. Get Game Name
    const gameName = await service.execute<string | null>(`
      (function() {
        const infoEl = document.querySelector('#mainContainer > core-menu > div:nth-child(3)');
        return infoEl ? infoEl.textContent : null;
      })()
    `);

    // 2. Navigate to Visiting
    const xpath = "/html/body/div[3]/core-drawer-panel/core-selector/div[2]/core-header-panel/div/div/div[1]/core-menu/core-item[8]/div";
    await service.execute(`
      (function() {
        const result = document.evaluate('${xpath}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
            result.singleNodeValue.click();
        } else {
            throw new Error("Visiting menu item not found");
        }
      })()
    `);
    
    await service.delay(2000);

    // 3. Populate Visiting
    console.log('--- Processing Visiting Team ---');
    await processLineup(service);
    await confirmLineup(service);

    // 4. Wait for Home Screen
    console.log('Waiting for Home screen...');
    await service.delay(3000);
    
    // 5. Populate Home
    console.log('--- Processing Home Team ---');
    await processLineup(service);
    await confirmLineup(service);

    // 6. Wait for Pre-Game Data
    console.log('Waiting for Pre-Game Data screen...');
    await service.delay(3000);

    // 7. Populate Pre-Game Data
    console.log('--- Processing Pre-Game Data ---');
    await processPreGameData(service);

    // 8. Wait for Weather Screen
    console.log('Waiting for Weather screen...');
    await service.delay(3000);

    // 9. Populate Weather
    console.log('--- Processing Weather ---');
    await processWeather(service);
    
    console.log('Initial Setup sequence completed.');

    // --- Post-Setup Flow ---
    const choice1 = await showChoiceDialog(service, "Initial setup is complete", "Send Warmups", "Cancel");
    if (choice1 === 'btn1') {
        await runWarmups(service);
        
        const choice2 = await showChoiceDialog(service, "Warmups have been sent", "Start Game", "Cancel");
        if (choice2 === 'btn1') {
            await runStartGame(service);
        } else {
            console.log("Start Game cancelled by user");
        }
    } else {
        console.log("Send Warmups cancelled by user");
    }

    return gameName;

  } catch (error) {
    console.error('Initial Setup failed:', error);
    // If cancelled, we might want to re-throw or handle gracefully.
    // The automation context usually handles the error logging.
    throw error;
  }
};
