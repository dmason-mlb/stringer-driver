import { AutomationService } from '../services/AutomationService';

export const runInitialSetup = async (service: AutomationService): Promise<string | null> => {
  console.log('Running Initial Setup...');

  try {
    // 1. Attempt to get the game name immediately (before starting the long process)
    const gameName = await service.execute<string | null>(`
      (function() {
        const infoEl = document.querySelector('#mainContainer > core-menu > div:nth-child(3)');
        return infoEl ? infoEl.textContent : null;
      })()
    `);

    // 2. Run the setup automation asynchronously (fire and forget from the perspective of the name return, 
    //    BUT we probably want to await it for the UI loading state... 
    //    However, the user wants the rename to happen *immediately* when clicked, or at least as part of the trigger.
    //    If we return the name, the UI updates. Then we can await the rest.)
    
    // Actually, the user said: "Do this every time the initialSetup action is triggered... Manual tab names should be overwritten by the initial setup button."
    // And: "Renaming the tab should be the first thing that the Initial Setup script does when the button is clicked."
    
    // So we should return the name first, but we still need to run the script.
    // To do this properly in the Sidebar component, we might need to split this function or return the promise of the automation along with the name?
    // OR, we can just return the name if found, and then continue execution.
    
    // The issue is that `await service.execute(...)` waits for the WHOLE script to finish.
    // So we must split the script into:
    // A. Get Name
    // B. Run Setup
    
    // Let's perform the setup now.
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

            // 1. Weather Condition: "Sunny"
            // Selector for the container that triggers the dropdown
            const conditionInputSelector = '#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(1) > fieldset > div > div.selectize-input';
            const conditionInput = document.querySelector(conditionInputSelector);
            if (conditionInput) {
                conditionInput.click();
                await delay(500);
                // User provided specific selector for "Sunny"
                const sunnyOptionSelector = '#mainContainer > div.content > div.weather-wrap.pure-g > form:nth-child(1) > fieldset > div > div.selectize-dropdown.single.weather-condition > div > div:nth-child(2)';
                const sunnyOption = document.querySelector(sunnyOptionSelector);
                
                if (sunnyOption) {
                    sunnyOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    log('Weather Condition: Selected Sunny');
                } else {
                    // Fallback to finding by text or data-value if specific selector fails
                    const fallbackOption = document.querySelector('.selectize-dropdown.single.weather-condition div[data-value="Sunny"]');
                     if (fallbackOption) {
                        fallbackOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        log('Weather Condition: Selected Sunny (via fallback)');
                    } else {
                        log('Weather Condition: "Sunny" option not found');
                    }
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
                
                log('Waiting for Weather confirmation dialog...');
                let okBtn = null;
                // Wait up to 10 seconds for the dialog
                for(let i=0; i<20; i++) {
                    okBtn = document.querySelector('#alertify-ok');
                    if(okBtn && okBtn.offsetParent !== null) break;
                    await delay(500);
                }

                if (okBtn) {
                    okBtn.click();
                    log('Clicked OK on Weather confirmation dialog (1st time).');
                    await delay(500);
                    
                    const okBtn2 = document.querySelector('#alertify-ok');
                    if (okBtn2 && okBtn2.offsetParent !== null) {
                        okBtn2.click();
                        log('Clicked OK on Weather confirmation dialog (2nd time).');
                    }
                } else {
                    log('Weather confirmation OK button not found within timeout.');
                }
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

            // --- Post-Setup Automation ---
            function showChoiceAlert(message, btn1Text, btn2Text, onBtn1, onBtn2) {
                const overlay = document.createElement('div');
                overlay.id = 'automation-alert-overlay';
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;justify-content:center;align-items:center;';
                
                const box = document.createElement('div');
                box.style.cssText = 'background:white;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);text-align:center;min-width:300px;color:black;font-family:sans-serif;';
                
                const msg = document.createElement('p');
                msg.textContent = message;
                msg.style.cssText = 'margin-bottom:20px;font-size:16px;color:#333;white-space: pre-wrap;';
                
                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = 'display:flex;justify-content:space-around;gap:10px;';
                
                const btn1 = document.createElement('button');
                btn1.textContent = btn1Text;
                btn1.style.cssText = 'padding:8px 16px;background:#2196F3;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px;';
                
                const btn2 = document.createElement('button');
                btn2.textContent = btn2Text;
                btn2.style.cssText = 'padding:8px 16px;background:#e0e0e0;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
                
                btn1.onclick = async () => {
                    document.body.removeChild(overlay);
                    if (onBtn1) {
                        try {
                            await onBtn1();
                        } catch (err) {
                            console.error(err);
                            alert('Automation Error: ' + err.message);
                        }
                    }
                };
                
                btn2.onclick = () => {
                    document.body.removeChild(overlay);
                    if (onBtn2) onBtn2();
                };
                
                btnContainer.appendChild(btn1);
                btnContainer.appendChild(btn2);
                box.appendChild(msg);
                box.appendChild(btnContainer);
                overlay.appendChild(box);
                document.body.appendChild(overlay);
            }

            showChoiceAlert("Initial setup is complete", "Send Warmups", "Cancel", async () => {
                 log('Starting Send Warmups sequence...');
                 
                 try {
                     // 1. Click Network Status
                     const networkStatus = document.querySelector('#mainContainer > core-menu > div.app-status-pregame > div.connection-status-container > div:nth-child(1) > span.is-editable');
                     if(networkStatus) {
                         networkStatus.click();
                         log('Clicked Network Status');
                     } else throw new Error("Network Status link not found");
                     
                     await delay(1000);
                     
                     // 2. Click Yes on alertify
                     const yesBtn1 = document.querySelector('#alertify-ok');
                     if(yesBtn1) {
                         yesBtn1.click();
                         log('Clicked Yes (1)');
                     } else throw new Error("First Yes button not found");
                     
                     await delay(1000);
                     
                     // 3. Check checkboxes
                     const dfe = document.querySelector('#dfe_connection_toggle');
                     if(dfe) {
                        if(!dfe.checked) dfe.click();
                        log('Checked DFE toggle');
                     } else log('DFE toggle not found');
                     
                     const trackman = document.querySelector('#trackman_toggle');
                     if(trackman) {
                        if(!trackman.checked) trackman.click();
                        log('Checked Trackman toggle');
                     } else log('Trackman toggle not found');
                     
                     await delay(500);
                     
                     // 4. Commit
                     const commitBtn = document.querySelector('#templated-dialog > div.templated-dialog-content > div > form > div.pure-button.submit');
                     if(commitBtn) {
                         commitBtn.click();
                         log('Clicked Commit Connection');
                     } else throw new Error("Commit Connection button not found");
                     
                     await delay(1000);

                     // New Step: Click Yes on intermediate alert (after Commit)
                     const intermediateYesBtn = document.querySelector('#alertify-ok');
                     if(intermediateYesBtn) {
                         intermediateYesBtn.click();
                         log('Clicked Intermediate Yes button');
                     } else {
                        // It's possible this alert doesn't always show, or shows up fast/slow.
                        // But user says "immediate after". We'll just log if not found for now or assume it's optional/timing dependent.
                        // Given "you need to click", we should probably try to find it.
                        log('Intermediate Yes button not found (might have been skipped or already clicked)');
                     }

                     await delay(1000);
                     
                     // 5. Click Send Warmups
                     let sendWarmupsBtn = document.querySelector('#mainContainer > core-menu > div.app-status-pregame > button');
                     
                     // Fallback: Search by text content if specific selector fails
                     if (!sendWarmupsBtn) {
                         const allButtons = Array.from(document.querySelectorAll('button'));
                         sendWarmupsBtn = allButtons.find(b => {
                             const text = b.textContent || '';
                             return text.includes('Send') && text.includes('Warmups');
                         });
                     }

                     if(sendWarmupsBtn) {
                         sendWarmupsBtn.click();
                         log('Clicked Send Warmups button');
                     } else throw new Error("Send Warmups button not found");
                     
                     await delay(1000);
                     
                     // 6. Click Yes (handling potential multiple dialogs)
                     log('Waiting for Warmups confirmation dialog...');
                     let warmupsOkBtn = null;
                     // Wait up to 10 seconds for the dialog
                     for(let i=0; i<20; i++) {
                         warmupsOkBtn = document.querySelector('#alertify-ok');
                         if(warmupsOkBtn && warmupsOkBtn.offsetParent !== null) break;
                         await delay(500);
                     }

                     if (warmupsOkBtn) {
                         warmupsOkBtn.click();
                         log('Clicked OK on Warmups confirmation dialog (1st time).');
                         await delay(500);
                         
                         const warmupsOkBtn2 = document.querySelector('#alertify-ok');
                         if (warmupsOkBtn2 && warmupsOkBtn2.offsetParent !== null) {
                             warmupsOkBtn2.click();
                             log('Clicked OK on Warmups confirmation dialog (2nd time).');
                         }
                     } else {
                         throw new Error("Warmups confirmation dialog not found");
                     }
                     
                     await delay(1000);
                     
                     // 7. Show second alert
                     showChoiceAlert("Warmups have been sent", "Start Game", "Cancel", async () => {
                         log('Starting Start Game sequence...');
                         
                         try {
                             // a. Click Play Ball
                             const playBall = document.querySelector('#mainContainer > core-menu > button');
                             if(playBall) {
                                 playBall.click();
                                 log('Clicked Play Ball');
                             } else throw new Error("Play Ball button not found");
                             
                             // b. Wait for Umpire Confirmation (variable time)
                             log('Waiting for Umpire Confirmation...');
                             let attempts = 0;
                             const maxAttempts = 120; // 60 seconds
                             let umpireCommit = null;
                             
                             while(attempts < maxAttempts) {
                                 umpireCommit = document.querySelector('#templated-dialog > div.templated-dialog-content > button');
                                 if(umpireCommit && umpireCommit.offsetParent !== null) break; 
                                 await delay(500);
                                 attempts++;
                             }
                             
                             if(umpireCommit) {
                                 umpireCommit.click();
                                 log('Clicked Commit Umpires');
                             } else {
                                 throw new Error("Commit Umpires button not found or timed out");
                             }
                             
                             await delay(2000);
                             
                             // d. Confirm Defense
                             log('Waiting for Confirm Defense...');
                             attempts = 0;
                             let defenseCommit = null;
                             while(attempts < maxAttempts) {
                                 defenseCommit = document.querySelector('#field-dialog > div.pure-u-1-1.baseball-interrupt-actions > span:nth-child(2) > button.commit-fielders-button.pure-button.submit.commit');
                                 if(defenseCommit && defenseCommit.offsetParent !== null) break;
                                 await delay(500);
                                 attempts++;
                             }
                             
                             if(defenseCommit) {
                                 defenseCommit.click();
                                 log('Clicked Confirm Defense');
                             } else {
                                 log("Confirm Defense button not found - might be skipped or timed out");
                             }
                             
                             await delay(1000);
                             
                             // f. First Batter
                             log('Waiting for First Batter...');
                             attempts = 0;
                             let firstBatter = null;
                             while(attempts < 40) {
                                 firstBatter = document.querySelector('#templated-dialog > div.templated-dialog-content > button.pure-button.submit.default-focus-button');
                                 if(firstBatter && firstBatter.offsetParent !== null) break;
                                 await delay(500);
                                 attempts++;
                             }
                             
                             if(firstBatter) {
                                 firstBatter.click();
                                 log('Clicked First Batter');
                             } else {
                                 log("First Batter button not found");
                             }
                             
                             log("Automation Complete");
                             
                         } catch(err) {
                             console.error("Start Game Error", err);
                             alert("Error starting game: " + err.message);
                         }
                     });
                     
                 } catch(err) {
                     console.error("Send Warmups Error", err);
                     alert("Error sending warmups: " + err.message);
                 }
            });

        } catch (e) {
            console.error('Initial Setup script error:', e);
            throw e;
        }
      })();
    `);

    return gameName;
    
  } catch (error) {
    console.error('Initial Setup failed:', error);
    return null;
  }
};
