import { AutomationService } from '../services/AutomationService';

export const runInitialSetup = async (service: AutomationService) => {
  console.log('Running Initial Setup...');

  try {
    await service.execute(`
      (async function() {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const log = (msg) => console.log('[Automation] ' + msg);

        // --- Reusable Lineup Population Function ---
        async function populateLineup() {
            log('Analyzing roster...');
            
            // 1. Analyze Roster for Available Players
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
            const availableFielders = availablePlayers.filter(p => p.posCode !== '1');

            log(\`Found \${availablePlayers.length} available players (\${availablePitchers.length} pitchers)\`);

            // 2. Check DH Setting
            const dhCheckbox = document.querySelector('#dhOption');
            const isDh = dhCheckbox && dhCheckbox.checked;
            const rowCount = isDh ? 10 : 9;
            log(\`DH is \${isDh ? 'ON' : 'OFF'}. Rows: \${rowCount}\`);

            const usedPlayerIds = new Set();

            // 3. Populate Rows
            for (let row = 1; row <= rowCount; row++) {
                try {
                    const playerInputSelector = \`#mainContainer > div.content > div > div.view-wrap.pure-u-2-3 > div:nth-child(2) > table > tbody > tr:nth-child(\${row}) > td:nth-child(3) > div > div.selectize-input.items\`;
                    const positionInputSelector = \`#mainContainer > div.content > div > div.view-wrap.pure-u-2-3 > div:nth-child(2) > table > tbody > tr:nth-child(\${row}) > td:nth-child(4) > div > div.selectize-input.items\`;

                    // Logic for Position / Pitcher
                    let positionIndexToSelect = row; 
                    let shouldSelectPitcher = false;

                    if (isDh) {
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

                    // --- Select Position ---
                    const positionInput = document.querySelector(positionInputSelector);
                    if (positionInput) {
                        positionInput.click();
                        await delay(500);

                        const activeDropdown = document.querySelector('.selectize-dropdown.single.position:not([style*="display: none"])');
                        if (activeDropdown) {
                            const items = activeDropdown.querySelectorAll('.selectize-dropdown-content > div[data-value]');
                            let targetPosItem = null;
                            if (positionIndexToSelect === -1) {
                                targetPosItem = items[items.length - 1];
                            } else if (items.length > positionIndexToSelect) {
                                targetPosItem = items[positionIndexToSelect];
                            }

                            if (targetPosItem) {
                                targetPosItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            } else {
                                log(\`Row \${row}: Position index \${positionIndexToSelect} not found.\`);
                            }
                        }
                    }
                    await delay(500);

                    // --- Select Player ---
                    const playerInput = document.querySelector(playerInputSelector);
                    if (playerInput) {
                        playerInput.click();
                        await delay(500);

                        const activeDropdown = document.querySelector('.selectize-dropdown.single.player:not([style*="display: none"])');
                        if (activeDropdown) {
                            const items = Array.from(activeDropdown.querySelectorAll('.selectize-dropdown-content > div[data-value]'));
                            
                            let targetOption = items.find(opt => {
                                const val = opt.getAttribute('data-value');
                                if (!val || usedPlayerIds.has(val)) return false;
                                const isAvailable = availablePlayers.some(p => p.id === val);
                                if (!isAvailable) return false;
                                const isPitcher = availablePitchers.some(p => p.id === val);
                                return shouldSelectPitcher ? isPitcher : !isPitcher;
                            });

                            // Fallback
                            if (!targetOption && !shouldSelectPitcher) {
                                targetOption = items.find(opt => {
                                    const val = opt.getAttribute('data-value');
                                    return val && !usedPlayerIds.has(val) && availablePlayers.some(p => p.id === val);
                                });
                            }

                            if (targetOption) {
                                usedPlayerIds.add(targetOption.getAttribute('data-value'));
                                targetOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            } else {
                                log(\`Row \${row}: No player found.\`);
                            }
                        }
                    }
                    await delay(500);

                } catch (rowErr) {
                    console.error(\`Row \${row} error:\`, rowErr);
                }
            }
            log('Lineup population done.');
        }

        async function confirmLineup() {
            const confirmBtnSelector = '#mainContainer > div.content > div > div.pure-u-1-1.baseball-interrupt-actions > button:nth-child(1)';
            const confirmBtn = document.querySelector(confirmBtnSelector);
            if (confirmBtn) {
                confirmBtn.click();
                log('Clicked Confirm Lineup.');
                return true;
            }
            log('Confirm button not found.');
            return false;
        }

        async function populatePreGameData() {
            log('Populating Pre-Game Data...');
            
            // Pairs: [input selector, item selector]
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

            const labels = ['Stringer 1', 'Official Scorer', 'Home Plate', 'Left Field', 'First Base', 'Right Field', 'Second Base', 'Third Base'];

            for (let i = 0; i < dropdownPairs.length; i++) {
                const [inputSelector, itemSelector] = dropdownPairs[i];
                const label = labels[i];

                try {
                    const input = document.querySelector(inputSelector);
                    if (input) {
                        input.click();
                        await delay(500);
                        const item = document.querySelector(itemSelector);
                        if (item) {
                            item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            log(\`\${label}: Selected.\`);
                        } else {
                            log(\`\${label}: Item not found.\`);
                        }
                    } else {
                        log(\`\${label}: Input not found.\`);
                    }
                    await delay(400);
                } catch (err) {
                    console.error(\`\${label} error:\`, err);
                }
            }

            // Confirm pre-game data
            const confirmBtnSelector = '#mainContainer > div.content > button';
            const confirmBtn = document.querySelector(confirmBtnSelector);
            if (confirmBtn) {
                confirmBtn.click();
                log('Clicked Confirm Pre-Game Data.');
            } else {
                log('Confirm Pre-Game Data button not found.');
            }
        }

        async function populateWeather() {
            log('Populating Weather...');

            // 1. Weather Condition: "Clear"
            // Selector for the container that triggers the dropdown
            const conditionInputSelector = '#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(1) > fieldset > div > div.selectize-input';
            const conditionInput = document.querySelector(conditionInputSelector);
            if (conditionInput) {
                conditionInput.click();
                await delay(500);
                const clearOption = document.querySelector('.selectize-dropdown.single.weather-condition div[data-value="Clear"]');
                if (clearOption) {
                    clearOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    log('Weather Condition: Selected Clear');
                } else {
                    log('Weather Condition: "Clear" option not found');
                }
            } else {
                log('Weather Condition input not found');
            }
            await delay(500);

            // 2. Temperature: 70
            const tempInput = document.querySelector('#weather-temperature');
            if (tempInput) {
                tempInput.value = "70";
                tempInput.dispatchEvent(new Event('input', { bubbles: true }));
                tempInput.dispatchEvent(new Event('change', { bubbles: true }));
                log('Temperature: Set to 70');
            } else {
                log('Temperature input not found');
            }
            await delay(500);

            // 3. Wind Direction: "Calm"
            const windDirSelector = '#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(3) > fieldset > div.selectize-control.wind-direction.single > div.selectize-input';
            const windDirInput = document.querySelector(windDirSelector);
            if (windDirInput) {
                windDirInput.click();
                await delay(500);
                const calmOption = document.querySelector('.selectize-dropdown.single.wind-direction div[data-value="Calm"]');
                if (calmOption) {
                    calmOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    log('Wind Direction: Selected Calm');
                } else {
                    log('Wind Direction: "Calm" option not found');
                }
            } else {
                log('Wind Direction input not found');
            }
            await delay(500);

            // 4. Wind Speed: 0
            const windSpeedInput = document.querySelector('#weather-wind-speed');
            if (windSpeedInput) {
                windSpeedInput.value = "0";
                windSpeedInput.dispatchEvent(new Event('input', { bubbles: true }));
                windSpeedInput.dispatchEvent(new Event('change', { bubbles: true }));
                log('Wind Speed: Set to 0');
            } else {
                log('Wind Speed input not found');
            }
            await delay(500);

            // 5. Confirm Weather
            const confirmBtnSelector = '#mainContainer > div.content > button'; // Reused selector
            const confirmBtn = document.querySelector(confirmBtnSelector);
            if (confirmBtn) {
                confirmBtn.click();
                log('Clicked Confirm Weather Data.');
            } else {
                log('Confirm Weather button not found.');
            }
        }

        // --- Main Flow ---
        console.log('Starting Initial Setup Automation...');
        try {
            // 1. Navigate to Visiting
            const xpath = "/html/body/div[3]/core-drawer-panel/core-selector/div[2]/core-header-panel/div/div/div[1]/core-menu/core-item[8]/div";
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
                log("Clicking 'Visiting Starting Lineups'...");
                result.singleNodeValue.click();
            } else {
                throw new Error("Visiting menu item not found");
            }
            
            await delay(2000);

            // 2. Populate Visiting
            log('--- Processing Visiting Team ---');
            await populateLineup();
            
            // 3. Confirm Visiting
            await confirmLineup();

            // 4. Wait for Home Screen
            log('Waiting for Home screen...');
            await delay(3000); 

            // 5. Populate Home
            log('--- Processing Home Team ---');
            await populateLineup();

            // 6. Confirm Home
            await confirmLineup();
            
            // 7. Wait for Pre-Game Data Screen
            log('Waiting for Pre-Game Data screen...');
            await delay(3000);

            // 8. Populate Pre-Game Data
            log('--- Processing Pre-Game Data ---');
            await populatePreGameData();

            // 9. Wait for Weather Screen
            log('Waiting for Weather screen...');
            await delay(3000);

            // 10. Populate Weather
            log('--- Processing Weather ---');
            await populateWeather();
            
            log('Initial Setup sequence completed.');

        } catch (e) {
            console.error('Initial Setup script error:', e);
            throw e;
        }
      })();
    `);
    
  } catch (error) {
    console.error('Initial Setup failed:', error);
  }
};
