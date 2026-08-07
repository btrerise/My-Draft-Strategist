    // --- PWA INSTALLATION PROMPT HANDLING ---
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome from automatically showing the generic prompt
        e.preventDefault();
        // Stash the event so it can be triggered later via our custom button
        deferredPrompt = e;
        // Show the install card on the setup page
        document.getElementById('installCard').style.display = 'block';
    });

    document.getElementById('installAppBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('installCard').style.display = 'none';
            }
            deferredPrompt = null;
        }
    });

    window.addEventListener('appinstalled', () => {
        // Hide the install button if installed successfully
        document.getElementById('installCard').style.display = 'none';
    });

    // --- REGISTER SERVICE WORKER ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered!'))
                .catch(err => console.log('Service Worker registration failed: ', err));
        });
    }

    // --- STATE MANAGEMENT ---
    let players = JSON.parse(localStorage.getItem('ds_players')) || [];
    let draftedPlayers = JSON.parse(localStorage.getItem('ds_drafted')) || [];
    let myTeam = JSON.parse(localStorage.getItem('ds_myTeam')) || [];
    let rawDraftPicks = JSON.parse(localStorage.getItem('ds_raw_picks')) || [];
    let leagueDraftSettings = JSON.parse(localStorage.getItem('ds_draft_settings')) || { teams: 12, rounds: 15 };
    let rankingsMeta = JSON.parse(localStorage.getItem('ds_meta')) || null;
    let adpMeta = JSON.parse(localStorage.getItem('ds_adp_meta')) || null;
    let dsLimits = JSON.parse(localStorage.getItem('ds_limits')) || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6, TOTAL: 14 };
    let autoSyncTimer = null;

    let activePosFilter = 'ALL';

    const BYE_WEEKS_2026 = {
        "CAR": 5, "KC": 5,
        "CIN": 6, "DET": 6, "MIA": 6, "MIN": 6,
        "BUF": 7, "JAX": 7, "LAC": 7, "WAS": 7,
        "HOU": 8, "NO": 8, "NYG": 8, "SF": 8,
        "PIT": 9, "TEN": 9,
        "CHI": 10, "DEN": 10, "PHI": 10, "TB": 10,
        "ATL": 11, "CLE": 11, "GB": 11, "LAR": 11, "NE": 11, "SEA": 11,
        "BAL": 13, "IND": 13, "LV": 13, "NYJ": 13,
        "ARI": 14, "DAL": 14
    };

    // --- UI HELPERS ---
    function flashButton(btn, text, isError = false, fallbackText = null) {
        if (!btn) return;
        const originalText = fallbackText || btn.innerText;
        const originalBg = btn.style.backgroundColor;

        btn.innerText = text;
        btn.style.backgroundColor = isError ? "#ea4335" : "#4ade80";
        btn.style.color = isError ? "white" : "#0b132b";

        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = originalBg;
            btn.style.color = "";
        }, 2500);
    }
    
    function toggleMenu() {
        const menu = document.getElementById('hamburgerMenu');
        const overlay = document.getElementById('menuOverlay');
        menu.classList.toggle('open');
        overlay.style.display = menu.classList.contains('open') ? 'block' : 'none';
    }

    // --- SWIPE GESTURES FOR TABS & MENU ---
    let touchstartX = 0;
    let touchendX = 0;
    const tabOrder = ['tracker', 'team', 'board'];

    function handleGesture() {
        const menu = document.getElementById('hamburgerMenu');
        const isOpen = menu.classList.contains('open');
        
        let diffX = touchendX - touchstartX;

        if (diffX > 50 && touchstartX < 40 && !isOpen) {
            toggleMenu();
            return;
        }
        if (diffX < -50 && isOpen) {
            toggleMenu();
            return;
        }

        // Tab swipe navigation (Only if menu is closed)
        if (!isOpen && Math.abs(diffX) > 80) {
            let activeTabEl = document.querySelector('.tab-content.active');
            if (!activeTabEl) return;
            let currentId = activeTabEl.id.replace('Tab', '');
            
            // Disable tab-swipe gesture when on the Board tab to preserve grid horizontal scrolling
            if (currentId === 'board') return;

            let currentIndex = tabOrder.indexOf(currentId);

            if (currentIndex !== -1) {
                if (diffX < 0 && currentIndex < tabOrder.length - 1) {
                    showTab(tabOrder[currentIndex + 1]);
                } else if (diffX > 0 && currentIndex > 0) {
                    showTab(tabOrder[currentIndex - 1]);
                }
            }
        }
    }

    document.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    }, {passive: true});

    document.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        handleGesture();
    }, {passive: true});

    // Load Settings
    document.getElementById('sleeperUsername').value = localStorage.getItem('ds_username') || "";
    document.getElementById('sleeperDraftId').value = localStorage.getItem('ds_draftId') || "";
    document.getElementById('targetList').value = localStorage.getItem('ds_targets') || "";
    document.getElementById('avoidList').value = localStorage.getItem('ds_avoids') || "";
    document.getElementById('dartList').value = localStorage.getItem('ds_darts') || "";
    document.getElementById('stackToggle').checked = localStorage.getItem('ds_stacks') === 'true';
    document.getElementById('byeWarningToggle').checked = localStorage.getItem('ds_bye_warnings') === 'true';
    
    // Load Roster & League Settings
    document.getElementById('leagueTeams').value = leagueDraftSettings.teams || 12;
    document.getElementById('leagueRounds').value = leagueDraftSettings.rounds || 15;
    document.getElementById('limitQB').value = dsLimits.QB;
    document.getElementById('limitRB').value = dsLimits.RB;
    document.getElementById('limitWR').value = dsLimits.WR;
    document.getElementById('limitTE').value = dsLimits.TE;
    document.getElementById('limitFLEX').value = dsLimits.FLEX;
    document.getElementById('limitSFLEX').value = dsLimits.SFLEX;
    document.getElementById('limitBENCH').value = dsLimits.BENCH;

    // Auto-calculate total rounds based on roster inputs
    function updateTotalRounds() {
        const qb = parseInt(document.getElementById('limitQB').value) || 0;
        const rb = parseInt(document.getElementById('limitRB').value) || 0;
        const wr = parseInt(document.getElementById('limitWR').value) || 0;
        const te = parseInt(document.getElementById('limitTE').value) || 0;
        const flex = parseInt(document.getElementById('limitFLEX').value) || 0;
        const sflex = parseInt(document.getElementById('limitSFLEX').value) || 0;
        const bench = parseInt(document.getElementById('limitBENCH').value) || 0;
        document.getElementById('leagueRounds').value = qb + rb + wr + te + flex + sflex + bench;
    }

    ['limitQB', 'limitRB', 'limitWR', 'limitTE', 'limitFLEX', 'limitSFLEX', 'limitBENCH'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateTotalRounds);
    });

    function updateMetaDisplay() {
        const metaEl = document.getElementById('metaDisplay');
        if(rankingsMeta) {
            metaEl.style.display = 'block';
            metaEl.innerText = `✅ Loaded: ${rankingsMeta.count} players on ${rankingsMeta.date}`;
        } else {
            metaEl.style.display = 'none';
        }

        const adpEl = document.getElementById('adpStatusDisplay');
        if(adpMeta) {
            adpEl.style.display = 'block';
            adpEl.innerText = `✅ Fetched: ${adpMeta.format} on ${adpMeta.date}`;
        } else {
            adpEl.style.display = 'none';
        }
    }
    updateMetaDisplay();

    function saveSettings(btnElement) {
        localStorage.setItem('ds_username', document.getElementById('sleeperUsername').value.trim());
        localStorage.setItem('ds_draftId', document.getElementById('sleeperDraftId').value.trim());
        localStorage.setItem('ds_targets', document.getElementById('targetList').value);
        localStorage.setItem('ds_avoids', document.getElementById('avoidList').value);
        localStorage.setItem('ds_darts', document.getElementById('dartList').value);
        localStorage.setItem('ds_stacks', document.getElementById('stackToggle').checked);
        localStorage.setItem('ds_bye_warnings', document.getElementById('byeWarningToggle').checked);
        
        leagueDraftSettings.teams = parseInt(document.getElementById('leagueTeams').value) || 12;
        leagueDraftSettings.rounds = parseInt(document.getElementById('leagueRounds').value) || 15;
        localStorage.setItem('ds_draft_settings', JSON.stringify(leagueDraftSettings));

        dsLimits = {
            QB: parseInt(document.getElementById('limitQB').value) || 0,
            RB: parseInt(document.getElementById('limitRB').value) || 0,
            WR: parseInt(document.getElementById('limitWR').value) || 0,
            TE: parseInt(document.getElementById('limitTE').value) || 0,
            FLEX: parseInt(document.getElementById('limitFLEX').value) || 0,
            SFLEX: parseInt(document.getElementById('limitSFLEX').value) || 0,
            BENCH: parseInt(document.getElementById('limitBENCH').value) || 0,
        };
        dsLimits.TOTAL = dsLimits.QB + dsLimits.RB + dsLimits.WR + dsLimits.TE + dsLimits.FLEX + dsLimits.SFLEX + dsLimits.BENCH;
        localStorage.setItem('ds_limits', JSON.stringify(dsLimits));

        renderBoard();
        if(btnElement) flashButton(btnElement, "✅ Saved!");
    }

    function saveDraftState() {
        localStorage.setItem('ds_drafted', JSON.stringify(draftedPlayers));
        localStorage.setItem('ds_myTeam', JSON.stringify(myTeam));
        localStorage.setItem('ds_raw_picks', JSON.stringify(rawDraftPicks));
        localStorage.setItem('ds_draft_settings', JSON.stringify(leagueDraftSettings));
        renderBoard();
        renderDraftMatrix();
    }

    function resetPicksOnly() {
        if(confirm("Reset all draft picks back to pick 1.01? (Your rankings will remain loaded).")) {
            draftedPlayers = [];
            myTeam = [];
            rawDraftPicks = [];
            localStorage.setItem('ds_total_picks', 0);
            saveDraftState();
        }
    }

    function hardReset() {
        if(confirm("WARNING: This will delete ALL data including your uploaded rankings and settings.")) {
            if(autoSyncTimer) clearInterval(autoSyncTimer);
            localStorage.clear();
            location.reload();
        }
    }

    function showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        
        const targetTab = document.getElementById(tabId + 'Tab');
        if(targetTab) targetTab.classList.add('active');

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const menuBtn = document.querySelector(`.hamburger-menu .nav-btn[data-target="${tabId}"]`);
        if(menuBtn) menuBtn.classList.add('active');

        const bottomBtn = document.querySelector(`.nav-bar .nav-btn[data-target="${tabId}"]`);
        if(bottomBtn) bottomBtn.classList.add('active');

        const menu = document.getElementById('hamburgerMenu');
        if(menu.classList.contains('open')) {
            toggleMenu();
        }

        if(tabId === 'tracker' || tabId === 'team' || tabId === 'board') renderBoard();
        window.scrollTo(0, 0);
    }

    function setPosFilter(pos) {
        activePosFilter = pos;
        renderBoard();
    }

    function toggleEditBar(id) {
        let bar = document.getElementById(`inline-edit-${id}`);
        if(bar) bar.style.display = bar.style.display === 'flex' ? 'none' : 'flex';
    }

    function saveInlineEdit(id) {
        let p = players.find(x => x.id === id);
        if(!p) return;

        let newRank = parseInt(document.getElementById(`edit-rank-val-${id}`).value);
        let newTier = document.getElementById(`edit-tier-val-${id}`).value.trim() || "-";
        let newTeam = document.getElementById(`edit-team-val-${id}`).value.trim().toUpperCase();
        let newBye = document.getElementById(`edit-bye-val-${id}`).value.trim();

        if (!isNaN(newRank) && newRank !== p.rank) {
            let oldRank = p.rank;
            players.forEach(other => {
                if (other.id !== id) {
                    if (newRank < oldRank && other.rank >= newRank && other.rank < oldRank) other.rank += 1;
                    else if (newRank > oldRank && other.rank > oldRank && other.rank <= newRank) other.rank -= 1;
                }
            });
            p.rank = newRank;
        }
        p.tier = newTier;
        if(newTeam) p.team = newTeam;
        if(newBye) p.bye = newBye;

        players.sort((a,b) => a.rank - b.rank);
        localStorage.setItem('ds_players', JSON.stringify(players));
        renderBoard();
    }

    document.getElementById('fileInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: function(results) { processData(results.data); } });
        } else if (ext === 'xlsx' || ext === 'xls') {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                processData(XLSX.utils.sheet_to_json(firstSheet, {defval: ""}));
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert("Please upload a .csv, .xlsx, or .xls file");
        }
    });

    function processPaste(btn) {
        const text = document.getElementById('csvPasteArea').value;
        if(text) Papa.parse(text, { header: true, skipEmptyLines: true, complete: function(results) { processData(results.data, btn); } });
    }

    async function processData(data, btn = null) {
        const metaEl = document.getElementById('metaDisplay');
        metaEl.style.display = 'block';
        metaEl.innerText = "⏳ Processing players and building database...";

        let newPlayers = [];
        let posCounters = {}; 
        let sleeperMap = {};

        try {
            let res = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (res.ok) sleeperMap = await res.json();
        } catch(err) {
            console.warn("Could not fetch Sleeper database.");
        }

        data.forEach((row, index) => {
            let keys = Object.keys(row);
            let getVal = (possibleNames) => {
                let key = keys.find(k => possibleNames.includes(k.toLowerCase().trim().replace(/['"]/g, '')));
                return key ? row[key] : "";
            };

            let name = getVal(['player', 'name', 'player name']);
            if (!name) return;

            let cleanName = String(name).trim();
            let team = getVal(['team', 'tm', 'franchise']);
            let bye = getVal(['bye', 'bye week']);

            let nameMatch = cleanName.match(/(.+)\s+\(([A-Z]{2,3})\)/i);
            if (nameMatch) {
                cleanName = nameMatch[1].trim();
                if (!team) team = nameMatch[2].toUpperCase();
            }

            let posRaw = getVal(['position', 'pos', 'pos rank', 'posn']);
            let posGroup = posRaw ? String(posRaw).replace(/[0-9]/g, '').toUpperCase().trim() : "FLEX";
            let posDisplay = posRaw ? String(posRaw).toUpperCase().trim() : posGroup;

            if (!posCounters[posGroup]) posCounters[posGroup] = 1;
            if (!/\d/.test(posDisplay)) posDisplay = posGroup + posCounters[posGroup];
            posCounters[posGroup]++;

            let tier = getVal(['tier', '#', 'tier #']) || "-";
            let adp = getVal(['adp', 'auction', 'value', 'auction value', 'rank/auction value']) || "-";

            let bestMatchId = null;
            let fallbackId = null;
            
            // Loop through Sleeper DB to find best match
            for (let [sId, sp] of Object.entries(sleeperMap)) {
                if (sp.first_name && sp.last_name) {
                    let isName = isNameMatch(cleanName, sp.first_name + " " + sp.last_name);
                    let isPos = posGroup === "FLEX" || (sp.position || "").toUpperCase() === posGroup;
                    
                    if (isName && isPos) {
                        fallbackId = sId; // Save first match found as a backup
                        
                        // Prioritize active players or exact team matches (fixes duplicate names like Kyle Williams)
                        if (team && team !== "FA" && sp.team && sp.team.toUpperCase() === team) {
                            bestMatchId = sId;
                            break;
                        } else if (sp.team) {
                            bestMatchId = sId; // They have a valid team in sleeper, prioritize them over retired FAs
                        }
                    }
                }
            }
            
            let masterId = bestMatchId || fallbackId || null;
            
            // Apply proper team formatting from Sleeper if found
            if (masterId) {
                let sp = sleeperMap[masterId];
                if (!team || team === "FA") team = sp.team || "FA";
            }

            if (team && team !== "FA" && (!bye || bye === "-" || String(bye).trim() === "")) {
                bye = BYE_WEEKS_2026[team.toUpperCase()] || "-";
            }

            newPlayers.push({ 
                id: index + 1, sleeperId: masterId || `custom_${index}`, rank: index + 1, name: cleanName, 
                posGroup: posGroup, posDisplay: posDisplay, tier: tier, 
                team: (team ? String(team).toUpperCase() : "FA"), bye: (bye || "-"), adp: adp,
                isRookie: false
            });
        });

        if(newPlayers.length > 0) {
            players = newPlayers;
            draftedPlayers = []; myTeam = []; rawDraftPicks = [];

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            rankingsMeta = { count: players.length, date: dateString };

            localStorage.setItem('ds_meta', JSON.stringify(rankingsMeta));
            localStorage.setItem('ds_players', JSON.stringify(players));
            updateMetaDisplay();
            saveDraftState();

            if(btn) flashButton(btn, "✅ Loaded Successfully");
        } else {
            metaEl.style.display = 'none';
            if(btn) flashButton(btn, "⚠️ Error Parsing Data", true);
            alert("Error: Could not detect player names.");
        }
    }

    async function quickStartLeagueLogs(btn) {
        const formatSelect = document.getElementById('adpFormatSelect');
        const profileKey = formatSelect.value;
        const formatText = formatSelect.options[formatSelect.selectedIndex].text;

        const originalText = btn.innerText;
        btn.innerText = "⏳ Building Quick-Start...";

        try {
            let sleeperMap = {};
            try {
                let res = await fetch('https://api.sleeper.app/v1/players/nfl');
                if (res.ok) sleeperMap = await res.json();
            } catch(e) { console.warn("Sleeper DB fetch failed", e); }

            const marketRes = await fetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();

            let playerMetaMap = {};
            try {
                let pRes = await fetch(`https://developer.leaguelogs.com/v1/players`);
                if (pRes.ok) {
                    let pData = await pRes.json();
                    pData.data.forEach(lp => { playerMetaMap[lp.sleeperPlayerId] = lp; });
                }
            } catch(e) { console.warn("LeagueLogs Meta fetch failed", e); }

            let newPlayers = [];
            let posCounters = {};
            let sortedMarket = llMarket.data.sort((a,b) => parseFloat(a.overallRank) - parseFloat(b.overallRank));

            sortedMarket.forEach((item) => {
                let sId = item.sleeperPlayerId;
                let sp = sleeperMap[sId];
                if (!sp || !sp.first_name) return;

                let cleanName = sp.first_name + " " + sp.last_name;
                let team = sp.team || "FA";
                let bye = BYE_WEEKS_2026[team] || "-";
                
                let posGroup = (sp.position || "FLEX").toUpperCase();
                if (!['QB', 'RB', 'WR', 'TE'].includes(posGroup)) return;

                if (!posCounters[posGroup]) posCounters[posGroup] = 1;
                let posDisplay = posGroup + posCounters[posGroup];
                posCounters[posGroup]++;

                let lp = playerMetaMap[sId];
                let isRookie = lp ? (lp.yearsExp === 0 || lp.yearsExp === "0" || lp.yearsExp === null) : false;
                
                let adpNum = parseFloat(item.overallRank);

                newPlayers.push({
                    id: newPlayers.length + 1,
                    sleeperId: sId,
                    rank: newPlayers.length + 1,
                    name: cleanName,
                    posGroup: posGroup,
                    posDisplay: posDisplay,
                    tier: "-", 
                    team: team,
                    bye: bye,
                    adp: isNaN(adpNum) ? "-" : adpNum.toFixed(1),
                    isRookie: isRookie
                });
            });

            if(newPlayers.length > 0) {
                players = newPlayers;
                draftedPlayers = []; myTeam = []; rawDraftPicks = [];

                let now = new Date();
                let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                rankingsMeta = { count: players.length, date: dateString };
                adpMeta = { format: "LeagueLogs: " + formatText, date: dateString };

                localStorage.setItem('ds_meta', JSON.stringify(rankingsMeta));
                localStorage.setItem('ds_adp_meta', JSON.stringify(adpMeta));
                localStorage.setItem('ds_players', JSON.stringify(players));
                
                updateMetaDisplay();
                saveDraftState();

                flashButton(btn, "✅ Quick-Start Loaded!", false, originalText);
            } else {
                throw new Error("No players generated.");
            }

        } catch(err) {
            console.error(err);
            flashButton(btn, "⚠️ Fetch Error", true, originalText);
            alert(`Failed to load Quick-Start.\n\n${err.message}`);
        }
    }

    async function fetchLeagueLogsADP(btn) {
        if (players.length === 0) {
            flashButton(btn, "⚠️ Load Rankings First", true);
            alert("You must load a set of player rankings before fetching Market Value.");
            return;
        }

        const formatSelect = document.getElementById('adpFormatSelect');
        const profileKey = formatSelect.value;
        const formatText = formatSelect.options[formatSelect.selectedIndex].text;

        const originalText = btn.innerText;
        btn.innerText = "⏳ Fetching...";

        try {
            const marketRes = await fetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`LeagueLogs Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();

            const adpMap = {};
            llMarket.data.forEach(item => { adpMap[item.sleeperPlayerId] = item.overallRank; });

            let playerMetaMap = {};
            let pRes = await fetch(`https://developer.leaguelogs.com/v1/players`);
            if (pRes.ok) {
                let pData = await pRes.json();
                pData.data.forEach(lp => { playerMetaMap[lp.sleeperPlayerId] = lp; });
            }

            players.forEach(p => {
                if (adpMap[p.sleeperId] !== undefined) p.adp = adpMap[p.sleeperId];

                let meta = playerMetaMap[p.sleeperId];
                if (meta) {
                    let exp = meta.yearsExp;
                    p.isRookie = (exp === 0 || exp === "0" || exp === null);
                } else {
                    p.isRookie = false;
                }
            });

            localStorage.setItem('ds_players', JSON.stringify(players));
            renderBoard();

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            adpMeta = { format: "LeagueLogs: " + formatText, date: dateString };
            localStorage.setItem('ds_adp_meta', JSON.stringify(adpMeta));
            updateMetaDisplay();

            flashButton(btn, `✅ Complete!`, false, originalText);

        } catch(err) {
            console.error(err);
            flashButton(btn, "⚠️ Fetch Error", true, originalText);
            alert(`Failed to fetch live Market Value.\n\n${err.message}`);
        }
    }

    function processManualADP(btn) {
        const text = document.getElementById('adpPasteArea').value;
        if (!text) {
            flashButton(btn, "⚠️ Paste Rank First", true);
            return;
        }

        let matchedCount = 0;
        text.split('\n').forEach(row => {
            let parts = row.split(/\t|,/); 
            if (parts.length >= 2) {
                let pName = parts[0];
                let newAdp = parts[parts.length - 1].trim(); 
                if (pName && newAdp && !isNaN(parseFloat(newAdp))) {
                    let matchedPlayer = players.find(p => isNameMatch(p.name, pName));
                    if (matchedPlayer) { matchedPlayer.adp = parseFloat(newAdp).toFixed(1); matchedCount++; }
                }
            }
        });

        if (matchedCount > 0) {
            localStorage.setItem('ds_players', JSON.stringify(players));
            renderBoard();
            flashButton(btn, `✅ Updated!`);
        } else {
            flashButton(btn, "⚠️ No Matches", true);
        }
    }

    function toggleAutoSync(isLive) {
        const liveInd = document.getElementById('liveIndicator');
        if(isLive) {
            liveInd.style.display = 'inline-block';
            syncSleeper(true, null);
            autoSyncTimer = setInterval(() => syncSleeper(true, null), 3000);
        } else {
            liveInd.style.display = 'none';
            if(autoSyncTimer) clearInterval(autoSyncTimer);
        }
    }

    async function syncSleeper(isSilent = false, btn = null) {
        const username = document.getElementById('sleeperUsername').value.trim();
        const draftId = document.getElementById('sleeperDraftId').value.trim();

        if(!username || !draftId) {
            if(!isSilent && btn) alert("Please enter both Username and Draft ID.");
            return;
        }

        saveSettings(null); 

        try {
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
            if(!userRes.ok) throw new Error("Could not find Sleeper User.");
            const userId = (await userRes.json()).user_id;

            const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
            if(draftRes.ok) {
                let dInfo = await draftRes.json();
                let numTeams = dInfo.settings?.teams || 12;
                let numRounds = dInfo.settings?.rounds || 15;
                leagueDraftSettings = { teams: numTeams, rounds: numRounds };
                
                document.getElementById('leagueTeams').value = numTeams;
                document.getElementById('leagueRounds').value = numRounds;
            }

            const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            if(!picksRes.ok) throw new Error("Could not fetch Draft ID picks.");
            const picksData = await picksRes.json();

            if(!picksData || picksData.length === 0) return;

            rawDraftPicks = picksData;
            let sleeperDrafted = [];
            let sleeperMyTeam = [];

            picksData.forEach(pick => {
                let matchedPlayer = players.find(p => p.sleeperId === pick.player_id);
                if (!matchedPlayer) {
                    matchedPlayer = players.find(p => isNameMatch(p.name, pick.metadata.first_name + " " + pick.metadata.last_name));
                }

                if(matchedPlayer) {
                    sleeperDrafted.push(matchedPlayer.id);
                    if(pick.picked_by === userId) sleeperMyTeam.push(matchedPlayer.id);
                }
            });

            draftedPlayers = Array.from(new Set([...draftedPlayers, ...sleeperDrafted]));
            myTeam = Array.from(new Set([...myTeam, ...sleeperMyTeam]));

            localStorage.setItem('ds_total_picks', picksData.length);
            saveDraftState();

            if(!isSilent && btn) flashButton(btn, "✅ Sync Complete!");

        } catch(err) {
            console.error(err);
            if(!isSilent && btn) alert(`Sleeper Sync Error:\n${err.message}`);
        }
    }

    function draftPlayer(id, isMine) {
        if (!draftedPlayers.includes(id)) {
            draftedPlayers.push(id);
            if (isMine) myTeam.push(id);
            saveDraftState();
        }
    }

    function undoDraft(id) {
        draftedPlayers = draftedPlayers.filter(pId => pId !== id);
        myTeam = myTeam.filter(pId => pId !== id);
        saveDraftState();
    }

    function getCallOutStyle(playerName) {
        let n = playerName.toLowerCase();
        let targets = (localStorage.getItem('ds_targets')||"").split(/[\n,]+/).map(s=>s.trim().toLowerCase()).filter(s=>s);
        let avoids = (localStorage.getItem('ds_avoids')||"").split(/[\n,]+/).map(s=>s.trim().toLowerCase()).filter(s=>s);
        let darts = (localStorage.getItem('ds_darts')||"").split(/[\n,]+/).map(s=>s.trim().toLowerCase()).filter(s=>s);

        if(targets.some(t => n.includes(t))) return `border-left: 5px solid var(--target-border); background-color: var(--target-bg);`;
        if(avoids.some(a => n.includes(a))) return `border-left: 5px solid var(--avoid-border); background-color: var(--avoid-bg);`;
        if(darts.some(d => n.includes(d))) return `border-left: 5px solid var(--dart-border); background-color: var(--dart-bg);`;
        return '';
    }

    function getTierTrackerData() {
        let trackers = { QB: null, RB: null, WR: null, TE: null };
        let available = players.filter(p => !draftedPlayers.includes(p.id));

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let posPlayers = available.filter(p => p.posGroup === pos && p.tier !== "-");
            if (posPlayers.length > 0) {
                let minTier = Math.min(...posPlayers.map(p => parseInt(p.tier) || 99));
                let count = posPlayers.filter(p => (parseInt(p.tier) || 99) === minTier).length;
                trackers[pos] = { tier: minTier, count: count };
            }
        });
        return trackers;
    }

    // --- DRAFT BOARD RENDERER (Sleeper Sync + Manual Fallback) ---
    function renderDraftMatrix() {
        const container = document.getElementById('draftMatrixContainer');
        if (!container) return;

        let totalTeams = leagueDraftSettings.teams || 12;
        let totalRounds = leagueDraftSettings.rounds || 15;

        let gridHTML = `<div class="draft-grid" style="grid-template-columns: repeat(${totalTeams}, minmax(78px, 1fr));">`;

        for (let t = 1; t <= totalTeams; t++) {
            let isMyCol = false;
            for (let r = 1; r <= totalRounds; r++) {
                let pNum = (r % 2 !== 0) ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                
                if (rawDraftPicks && rawDraftPicks.length > 0) {
                    let matched = rawDraftPicks.find(p => p.pick_no === pNum);
                    if (matched) {
                        let pl = players.find(x => x.sleeperId === matched.player_id);
                        if (pl && myTeam.includes(pl.id)) { isMyCol = true; break; }
                    }
                } else {
                    let manualPId = draftedPlayers[pNum - 1];
                    if (manualPId && myTeam.includes(manualPId)) { isMyCol = true; break; }
                }
            }
            gridHTML += `<div class="draft-col-header ${isMyCol ? 'mine' : ''}">T${t}</div>`;
        }

        for (let r = 1; r <= totalRounds; r++) {
            for (let t = 1; t <= totalTeams; t++) {
                let pickNum = (r % 2 !== 0) ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                let displayTeamNum = (r % 2 !== 0) ? t : (totalTeams - t + 1);

                let pObj = null;
                let pName = "";
                let pPos = "";

                if (rawDraftPicks && rawDraftPicks.length > 0) {
                    let matchedPick = rawDraftPicks.find(p => p.pick_no === pickNum);
                    if (matchedPick) {
                        pObj = players.find(pl => pl.sleeperId === matchedPick.player_id);
                        pName = pObj ? pObj.name : (matchedPick.metadata.first_name?.[0] + ". " + matchedPick.metadata.last_name) || "Player";
                        pPos = pObj ? pObj.posGroup : matchedPick.metadata.position || "";
                    }
                } else {
                    let manualPlayerId = draftedPlayers[pickNum - 1];
                    if (manualPlayerId) {
                        pObj = players.find(pl => pl.id === manualPlayerId);
                        if (pObj) {
                            pName = pObj.name;
                            pPos = pObj.posGroup;
                        }
                    }
                }

                let cellClass = "draft-cell";
                let cellContent = `<span style="opacity:0.35; font-size:0.58rem;">${r}.${displayTeamNum < 10 ? '0'+displayTeamNum : displayTeamNum}</span>`;

                if (pName) {
                    let nameParts = pName.split(' ');
                    let firstName = nameParts[0];
                    let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

                    cellClass += ` picked ${pPos}`;
                    if (pObj && myTeam.includes(pObj.id)) cellClass += " mine";

                    cellContent = `
                        <div class="draft-cell-first" title="${pName}">${firstName}</div>
                        <div class="draft-cell-last" title="${pName}">${lastName}</div>
                    `;
                }

                gridHTML += `<div class="${cellClass}">${cellContent}</div>`;
            }
        }

        gridHTML += `</div>`;
        container.innerHTML = gridHTML;
    }

    function renderFantasyRoster() {
        let myPlayersObjects = myTeam.map(id => players.find(p => p.id === id)).filter(p => p);
        let availablePool = [...myPlayersObjects];
        let rosterSlotsHTML = '';

        let extractNextPos = (posGroup) => {
            let idx = availablePool.findIndex(p => p.posGroup === posGroup);
            if (idx !== -1) return availablePool.splice(idx, 1)[0];
            return null;
        };

        const buildSlotHTML = (label, color, p) => {
            if (p) {
                let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
                return `
                <div class="roster-slot">
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="roster-label" style="color:${color}">${label}</span>
                        <div>
                            <div style="font-weight: bold;">${p.name} ${rookieBadge}</div>
                            <div style="margin-top: 2px;">
                                <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span>
                                <span class="badge">${p.team}</span>
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Bye: ${p.bye}</div>
                        <button class="btn-sm btn-draft" style="padding: 2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                    </div>
                </div>`;
            } else {
                return `
                <div class="roster-slot empty">
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="roster-label" style="color:var(--text-muted)">${label}</span>
                        <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                    </div>
                    <div></div>
                </div>`;
            }
        };

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let count = dsLimits[pos] || 0;
            let color = `var(--pos-${pos.toLowerCase()}-border)`;
            for (let i = 0; i < count; i++) {
                rosterSlotsHTML += buildSlotHTML(`${pos}${i+1}`, color, extractNextPos(pos));
            }
        });

        for (let i = 0; i < (dsLimits.FLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('FLX', '#86efac', p);
        }

        for (let i = 0; i < (dsLimits.SFLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['QB', 'RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('SFLX', '#fca5a5', p);
        }

        if (availablePool.length > 0) {
            rosterSlotsHTML += `<div style="font-weight:bold; margin: 0.8rem 0 0.4rem 0; font-size: 0.85rem; color:var(--text-muted);">BENCH</div>`;
            availablePool.forEach(p => { rosterSlotsHTML += buildSlotHTML('BN', 'var(--text-muted)', p); });
        }

        const bannerContainer = document.getElementById('byeWarningContainer');
        const showByeWarnings = localStorage.getItem('ds_bye_warnings') === 'true';
        
        if (showByeWarnings && myPlayersObjects.length > 0) {
            let byeCounts = {};
            let starterPool = [...myTeam.map(id => players.find(p => p.id === id)).filter(p => p)];
            let starterSlotsCount = (dsLimits.QB||0) + (dsLimits.RB||0) + (dsLimits.WR||0) + (dsLimits.TE||0) + (dsLimits.FLEX||0) + (dsLimits.SFLEX||0);
            let activeStarters = starterPool.slice(0, starterSlotsCount);

            activeStarters.forEach(sp => {
                if (sp.bye && sp.bye !== "-") {
                    byeCounts[sp.bye] = (byeCounts[sp.bye] || 0) + 1;
                }
            });

            let heavyByes = Object.keys(byeCounts).filter(bye => byeCounts[bye] >= 3);
            if (heavyByes.length > 0) {
                bannerContainer.innerHTML = `
                    <div class="bye-warning-banner">
                        <span>⚠️ WARNING: You have ${byeCounts[heavyByes[0]]} starting players on Bye in Week ${heavyByes[0]}!</span>
                    </div>`;
            } else {
                bannerContainer.innerHTML = '';
            }
        } else {
            bannerContainer.innerHTML = '';
        }

        return rosterSlotsHTML;
    }

    function renderBoard() {
        const poolEl = document.getElementById('playerPool');
        const myTeamEl = document.getElementById('myTeamList');
        const otherEl = document.getElementById('otherDraftedList');
        const searchEl = document.getElementById('searchBar');
        const searchTerm = searchEl ? searchEl.value.toLowerCase() : "";

        let newPoolHTML = '';
        let posCounts = { "QB": 0, "RB": 0, "WR": 0, "TE": 0 };

        let syncedPicks = parseInt(localStorage.getItem('ds_total_picks')) || 0;
        let totalPicksDone = Math.max(draftedPlayers.length, syncedPicks);
        let currentOverallPick = totalPicksDone + 1;
        
        // Dynamically use the saved league settings for the Pick counter
        let teamsInLeague = leagueDraftSettings.teams || 12;
        let round = Math.ceil(currentOverallPick / teamsInLeague);
        let pickInRound = currentOverallPick - ((round - 1) * teamsInLeague);
        document.getElementById('pickTracker').innerText = `Pick: ${round}.${pickInRound.toString().padStart(2, '0')}`;

        const trackers = getTierTrackerData();
        
        let trackerHTML = `<div class="badge badge-all pos-filter ${activePosFilter === 'ALL' ? 'active-filter' : ''}" onclick="setPosFilter('ALL')"><span>ALL</span></div>`;

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let isActive = activePosFilter === pos ? 'active-filter' : '';
            let tText = trackers[pos] ? `T${trackers[pos].tier} (${trackers[pos].count})` : "—";
            trackerHTML += `<div class="badge pos-badge ${pos} pos-filter ${isActive}" onclick="setPosFilter('${pos}')"><span>${pos}</span><span style="font-size:0.65rem; opacity:0.9;">${tText}</span></div>`;
        });
        document.getElementById('tierTracker').innerHTML = trackerHTML;

        let showStacks = localStorage.getItem('ds_stacks') === 'true';
        let myQbs = myTeam.map(id => players.find(p => p.id === id)).filter(p => p && p.posGroup === 'QB').map(p => p.team).filter(t => t !== "FA");
        let myPassCatchers = myTeam.map(id => players.find(p => p.id === id)).filter(p => p && ['WR', 'TE'].includes(p.posGroup)).map(p => p.team).filter(t => t !== "FA");

        let lastTier = null;

        players.forEach(p => {
            const isDrafted = draftedPlayers.includes(p.id);
            const isMine = myTeam.includes(p.id);

            if (isMine && posCounts[p.posGroup] !== undefined) posCounts[p.posGroup]++;

            if (!isDrafted) {
                if (activePosFilter !== 'ALL' && p.posGroup !== activePosFilter) return;

                if(p.name.toLowerCase().includes(searchTerm)) {

                    if(searchTerm === "" && p.tier !== lastTier && p.tier !== "-") {
                        newPoolHTML += `<div class="tier-divider">Tier ${p.tier}</div>`;
                        lastTier = p.tier;
                    }

                    let customStyle = getCallOutStyle(p.name);
                    
                    let valueBadgeHTML = "";
                    let diff = currentOverallPick - p.rank;
                    if (diff > 0) {
                        valueBadgeHTML = ` | <span class="badge badge-value">+${diff} Value</span>`;
                    } else if (diff < 0) {
                        valueBadgeHTML = ` | <span class="badge badge-reach">${diff} Reach</span>`;
                    } else {
                        valueBadgeHTML = ` | <span class="badge" style="background:#3a506b;">At Rank</span>`;
                    }
                    
                    let adpText = (p.adp && p.adp !== "-") ? ` | Market: ${p.adp}` : "";

                    let isStack = false;
                    if (showStacks && p.team !== "FA") {
                        if (['WR', 'TE'].includes(p.posGroup) && myQbs.includes(p.team)) isStack = true;
                        if (p.posGroup === 'QB' && myPassCatchers.includes(p.team)) isStack = true;
                    }

                    let stackBadge = isStack ? `<span class="badge" style="background: var(--stack-color); color: white;">🔥 Stack</span>` : "";
                    let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";

                    newPoolHTML += `
                        <div class="player-card" style="${customStyle}">
                            <div class="player-card-main">
                                <div class="player-info">
                                    <h4>
                                        ${p.rank}. ${p.name} 
                                        <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span> 
                                        ${rookieBadge}
                                        ${stackBadge}
                                        <span style="cursor:pointer; font-size: 0.85rem; opacity: 0.7; margin-left: 2px;" onclick="toggleEditBar(${p.id})" title="Edit Player Details">✏️</span>
                                    </h4>
                                    <div class="player-stats">${p.team} | Bye: ${p.bye}${adpText}${valueBadgeHTML}</div>
                                </div>
                                <div class="actions">
                                    <button class="btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)">Taken</button>
                                    <button class="btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)">My Pick</button>
                                </div>
                            </div>
                            
                            <div class="inline-editor" id="inline-edit-${p.id}">
                                <div style="display:flex; gap:0.4rem; width:100%; flex-wrap:wrap; align-items:center;">
                                    <div>
                                        <label style="font-size:0.75rem; font-weight:bold; display:block;">Rank</label>
                                        <input type="number" id="edit-rank-val-${p.id}" value="${p.rank}" style="width:55px;">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem; font-weight:bold; display:block;">Tier</label>
                                        <input type="text" id="edit-tier-val-${p.id}" value="${p.tier}" style="width:45px;">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem; font-weight:bold; display:block;">Team</label>
                                        <input type="text" id="edit-team-val-${p.id}" value="${p.team}" style="width:55px;">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem; font-weight:bold; display:block;">Bye</label>
                                        <input type="text" id="edit-bye-val-${p.id}" value="${p.bye}" style="width:45px;">
                                    </div>
                                    <div style="margin-left:auto; display:flex; gap:4px; align-self:flex-end;">
                                        <button class="btn-sm btn-mine" style="padding:0.4rem 0.8rem;" onclick="saveInlineEdit(${p.id})">Save</button>
                                        <button class="btn-sm btn-draft" style="padding:0.4rem 0.6rem;" onclick="toggleEditBar(${p.id})">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                }
            }
        });

        poolEl.innerHTML = newPoolHTML;
        myTeamEl.innerHTML = renderFantasyRoster();

        let otherDraftedIds = draftedPlayers.filter(id => !myTeam.includes(id)).slice().reverse();
        let newOtherHTML = '';
        otherDraftedIds.forEach(id => {
            let p = players.find(player => player.id === id);
            if (p) {
                newOtherHTML += `
                    <div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                        <div style="color: var(--text-muted);"><strike>${p.name}</strike> <span class="badge">${p.posGroup}</span></div>
                        <button class="btn-sm btn-draft" style="padding:2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                    </div>`;
            }
        });
        otherEl.innerHTML = newOtherHTML;

        let flexOverflow = Math.max(0, posCounts['RB'] - dsLimits.RB) + Math.max(0, posCounts['WR'] - dsLimits.WR) + Math.max(0, posCounts['TE'] - dsLimits.TE);
        let flexUsed = Math.min(flexOverflow, dsLimits.FLEX);
        let sflexOverflow = Math.max(0, posCounts['QB'] - dsLimits.QB) + Math.max(0, flexOverflow - dsLimits.FLEX);
        let sflexUsed = Math.min(sflexOverflow, dsLimits.SFLEX);

        document.getElementById('limitsBody').innerHTML = `
            <tr>
                <td>${posCounts['QB']} / ${dsLimits.QB}</td>
                <td>${posCounts['RB']} / ${dsLimits.RB}</td>
                <td>${posCounts['WR']} / ${dsLimits.WR}</td>
                <td>${posCounts['TE']} / ${dsLimits.TE}</td>
                <td>${flexUsed} / ${dsLimits.FLEX}</td>
                <td>${sflexUsed} / ${dsLimits.SFLEX}</td>
                <td><strong>${myTeam.length} / ${dsLimits.TOTAL}</strong></td>
            </tr>`;

        renderDraftMatrix();
    }

    if(players.length > 0) renderBoard();
