/**
 * Fantasy Football Draft Strategist - Core Logic & State Management
 * Refactored for clean architecture, performance, and maintainability.
 */

(function () {
    'use strict';

    // --- STATE MANAGEMENT ---
    const State = {
        players: JSON.parse(localStorage.getItem('ds_players')) || [],
        draftedPlayers: JSON.parse(localStorage.getItem('ds_drafted')) || [],
        myTeam: JSON.parse(localStorage.getItem('ds_myTeam')) || [],
        rawDraftPicks: JSON.parse(localStorage.getItem('ds_raw_picks')) || [],
        leagueDraftSettings: JSON.parse(localStorage.getItem('ds_draft_settings')) || { teams: 12, rounds: 15 },
        rankingsMeta: JSON.parse(localStorage.getItem('ds_meta')) || null,
        adpMeta: JSON.parse(localStorage.getItem('ds_adp_meta')) || null,
        dsLimits: JSON.parse(localStorage.getItem('ds_limits')) || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6, TOTAL: 14 },
        activePosFilter: 'ALL',
        autoSyncTimer: null,
        deferredPrompt: null,
        touchstartX: 0,
        touchendX: 0,
        tabOrder: ['tracker', 'team', 'board']
    };

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

    // --- PWA INSTALLATION ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        State.deferredPrompt = e;
        const installCard = document.getElementById('installCard');
        if (installCard) installCard.style.display = 'block';
    });

    const installAppBtn = document.getElementById('installAppBtn');
    if (installAppBtn) {
        installAppBtn.addEventListener('click', async () => {
            if (State.deferredPrompt) {
                State.deferredPrompt.prompt();
                const { outcome } = await State.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    const installCard = document.getElementById('installCard');
                    if (installCard) installCard.style.display = 'none';
                }
                State.deferredPrompt = null;
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        const installCard = document.getElementById('installCard');
        if (installCard) installCard.style.display = 'none';
    });

    // --- SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .catch(err => console.warn('Service Worker registration failed: ', err));
        });
    }

    // --- UI HELPERS ---
    function flashButton(btn, text, isError = false, fallbackText = null) {
        if (!btn) return;
        const originalText = fallbackText || btn.innerText;
        const originalBg = btn.style.backgroundColor;

        btn.innerText = text;
        btn.style.backgroundColor = isError ? "var(--error-color, #ea4335)" : "var(--success-color, #4ade80)";
        btn.style.color = isError ? "white" : "var(--bg-main, #0b132b)";

        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = originalBg;
            btn.style.color = "";
        }, 2500);
    }
    
    window.toggleMenu = function() {
        const menu = document.getElementById('hamburgerMenu');
        const overlay = document.getElementById('menuOverlay');
        if (!menu || !overlay) return;
        menu.classList.toggle('open');
        overlay.style.display = menu.classList.contains('open') ? 'block' : 'none';
    };

    // --- GESTURE HANDLING ---
    function handleGesture() {
        const menu = document.getElementById('hamburgerMenu');
        if (!menu) return;
        const isOpen = menu.classList.contains('open');
        let diffX = State.touchendX - State.touchstartX;

        if (diffX > 50 && State.touchstartX < 40 && !isOpen) {
            window.toggleMenu();
            return;
        }
        if (diffX < -50 && isOpen) {
            window.toggleMenu();
            return;
        }

        if (!isOpen && Math.abs(diffX) > 80) {
            let activeTabEl = document.querySelector('.tab-content.active');
            if (!activeTabEl) return;
            let currentId = activeTabEl.id.replace('Tab', '');
            if (currentId === 'board') return;

            let currentIndex = State.tabOrder.indexOf(currentId);
            if (currentIndex !== -1) {
                if (diffX < 0 && currentIndex < State.tabOrder.length - 1) {
                    window.showTab(State.tabOrder[currentIndex + 1]);
                } else if (diffX > 0 && currentIndex > 0) {
                    window.showTab(State.tabOrder[currentIndex - 1]);
                }
            }
        }
    }

    document.addEventListener('touchstart', e => { State.touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    document.addEventListener('touchend', e => { State.touchendX = e.changedTouches[0].screenX; handleGesture(); }, {passive: true});

    // --- INITIALIZE SETTINGS INPUTS ---
    function initSettingsUI() {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        setVal('sleeperUsername', localStorage.getItem('ds_username') || "");
        setVal('sleeperDraftId', localStorage.getItem('ds_draftId') || "");
        setVal('targetList', localStorage.getItem('ds_targets') || "");
        setVal('avoidList', localStorage.getItem('ds_avoids') || "");
        setVal('dartList', localStorage.getItem('ds_darts') || "");
        setCheck('stackToggle', localStorage.getItem('ds_stacks') === 'true');
        setCheck('byeWarningToggle', localStorage.getItem('ds_bye_warnings') === 'true');
        
        setVal('leagueTeams', State.leagueDraftSettings.teams || 12);
        setVal('leagueRounds', State.leagueDraftSettings.rounds || 15);
        setVal('limitQB', State.dsLimits.QB);
        setVal('limitRB', State.dsLimits.RB);
        setVal('limitWR', State.dsLimits.WR);
        setVal('limitTE', State.dsLimits.TE);
        setVal('limitFLEX', State.dsLimits.FLEX);
        setVal('limitSFLEX', State.dsLimits.SFLEX);
        setVal('limitBENCH', State.dsLimits.BENCH);
    }
    initSettingsUI();

    function updateTotalRounds() {
        const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
        const total = getNum('limitQB') + getNum('limitRB') + getNum('limitWR') + getNum('limitTE') + getNum('limitFLEX') + getNum('limitSFLEX') + getNum('limitBENCH');
        const roundsEl = document.getElementById('leagueRounds');
        if (roundsEl) roundsEl.value = total;
    }

    ['limitQB', 'limitRB', 'limitWR', 'limitTE', 'limitFLEX', 'limitSFLEX', 'limitBENCH'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateTotalRounds);
    });

    function updateMetaDisplay() {
        const metaEl = document.getElementById('metaDisplay');
        if (metaEl) {
            if (State.rankingsMeta) {
                metaEl.style.display = 'block';
                metaEl.innerText = `Loaded: ${State.rankingsMeta.count} players on ${State.rankingsMeta.date}`;
            } else {
                metaEl.style.display = 'none';
            }
        }

        const adpEl = document.getElementById('adpStatusDisplay');
        if (adpEl) {
            if (State.adpMeta) {
                adpEl.style.display = 'block';
                adpEl.innerText = `Fetched: ${State.adpMeta.format} on ${State.adpMeta.date}`;
            } else {
                adpEl.style.display = 'none';
            }
        }
    }
    updateMetaDisplay();

    window.saveSettings = function(btnElement, skipRender = false) {
        const getVal = id => document.getElementById(id)?.value.trim() || "";
        const getCheck = id => document.getElementById(id)?.checked || false;

        localStorage.setItem('ds_username', getVal('sleeperUsername'));
        localStorage.setItem('ds_draftId', getVal('sleeperDraftId'));
        localStorage.setItem('ds_targets', document.getElementById('targetList')?.value || "");
        localStorage.setItem('ds_avoids', document.getElementById('avoidList')?.value || "");
        localStorage.setItem('ds_darts', document.getElementById('dartList')?.value || "");
        localStorage.setItem('ds_stacks', getCheck('stackToggle'));
        localStorage.setItem('ds_bye_warnings', getCheck('byeWarningToggle'));
        
        State.leagueDraftSettings.teams = parseInt(getVal('leagueTeams')) || 12;
        State.leagueDraftSettings.rounds = parseInt(getVal('leagueRounds')) || 15;
        localStorage.setItem('ds_draft_settings', JSON.stringify(State.leagueDraftSettings));

        State.dsLimits = {
            QB: parseInt(getVal('limitQB')) || 0,
            RB: parseInt(getVal('limitRB')) || 0,
            WR: parseInt(getVal('limitWR')) || 0,
            TE: parseInt(getVal('limitTE')) || 0,
            FLEX: parseInt(getVal('limitFLEX')) || 0,
            SFLEX: parseInt(getVal('limitSFLEX')) || 0,
            BENCH: parseInt(getVal('limitBENCH')) || 0,
        };
        State.dsLimits.TOTAL = State.dsLimits.QB + State.dsLimits.RB + State.dsLimits.WR + State.dsLimits.TE + State.dsLimits.FLEX + State.dsLimits.SFLEX + State.dsLimits.BENCH;
        localStorage.setItem('ds_limits', JSON.stringify(State.dsLimits));

        if (!skipRender) {
            renderBoard();
        }
        
        if (btnElement) flashButton(btnElement, "Settings Saved");
    };

    function saveDraftState() {
        localStorage.setItem('ds_drafted', JSON.stringify(State.draftedPlayers));
        localStorage.setItem('ds_myTeam', JSON.stringify(State.myTeam));
        localStorage.setItem('ds_raw_picks', JSON.stringify(State.rawDraftPicks));
        localStorage.setItem('ds_draft_settings', JSON.stringify(State.leagueDraftSettings));
        renderBoard();
        renderDraftMatrix();
    }

    window.resetPicksOnly = function() {
        if (window.confirm("Reset all draft picks back to pick 1.01? (Your rankings will remain loaded).")) {
            State.draftedPlayers = [];
            State.myTeam = [];
            State.rawDraftPicks = [];
            localStorage.setItem('ds_total_picks', 0);
            saveDraftState();
        }
    };

    window.hardReset = function() {
        if (window.confirm("WARNING: This will delete ALL data including your uploaded rankings and settings.")) {
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
            localStorage.clear();
            window.location.reload();
        }
    };

    window.showTab = function(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const targetTab = document.getElementById(tabId + 'Tab');
        if (targetTab) targetTab.classList.add('active');

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.hamburger-menu .nav-btn[data-target="${tabId}"], .nav-bar .nav-btn[data-target="${tabId}"]`)
            .forEach(btn => btn.classList.add('active'));

        const menu = document.getElementById('hamburgerMenu');
        if (menu && menu.classList.contains('open')) {
            window.toggleMenu();
        }

        if (['tracker', 'team', 'board'].includes(tabId)) renderBoard();
        window.scrollTo(0, 0);
    };

    window.setPosFilter = function(pos) {
        State.activePosFilter = pos;
        renderBoard();
    };

    window.toggleEditBar = function(id) {
        const bar = document.getElementById(`inline-edit-${id}`);
        if (bar) bar.style.display = bar.style.display === 'flex' ? 'none' : 'flex';
    };

    window.saveInlineEdit = function(id) {
        let p = State.players.find(x => x.id === id);
        if (!p) return;

        const getVal = elId => document.getElementById(elId)?.value;
        let newRank = parseInt(getVal(`edit-rank-val-${id}`));
        let newTier = getVal(`edit-tier-val-${id}`)?.trim() || "-";
        let newTeam = getVal(`edit-team-val-${id}`)?.trim().toUpperCase();
        let newBye = getVal(`edit-bye-val-${id}`)?.trim();

        if (!isNaN(newRank) && newRank !== p.rank) {
            let oldRank = p.rank;
            State.players.forEach(other => {
                if (other.id !== id) {
                    if (newRank < oldRank && other.rank >= newRank && other.rank < oldRank) other.rank += 1;
                    else if (newRank > oldRank && other.rank > oldRank && other.rank <= newRank) other.rank -= 1;
                }
            });
            p.rank = newRank;
        }
        p.tier = newTier;
        if (newTeam) p.team = newTeam;
        if (newBye) p.bye = newBye;

        State.players.sort((a, b) => a.rank - b.rank);
        localStorage.setItem('ds_players', JSON.stringify(State.players));
        renderBoard();
    };

    // --- FILE PARSING & DATA IMPORT ---
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'csv') {
                Papa.parse(file, { header: true, skipEmptyLines: true, complete: results => processData(results.data) });
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
                window.alert("Please upload a .csv, .xlsx, or .xls file");
            }
        });
    }

    window.processPaste = function(btn) {
        const text = document.getElementById('csvPasteArea')?.value;
        if (text) Papa.parse(text, { header: true, skipEmptyLines: true, complete: results => processData(results.data, btn) });
    };

    async function processData(data, btn = null) {
        const metaEl = document.getElementById('metaDisplay');
        if (metaEl) {
            metaEl.style.display = 'block';
            metaEl.innerText = "Processing players and building database...";
        }

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
            let getVal = possibleNames => {
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
            
            for (let [sId, sp] of Object.entries(sleeperMap)) {
                if (sp.first_name && sp.last_name) {
                    let fullName = `${sp.first_name} ${sp.last_name}`;
                    let isName = typeof isNameMatch === 'function' ? isNameMatch(cleanName, fullName) : cleanName.toLowerCase() === fullName.toLowerCase();
                    let isPos = posGroup === "FLEX" || (sp.position || "").toUpperCase() === posGroup;
                    
                    if (isName && isPos) {
                        fallbackId = sId;
                        if (team && team !== "FA" && sp.team && sp.team.toUpperCase() === team) {
                            bestMatchId = sId;
                            break;
                        } else if (sp.team) {
                            bestMatchId = sId;
                        }
                    }
                }
            }
            
            let masterId = bestMatchId || fallbackId || null;
            if (masterId && sleeperMap[masterId]) {
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

        if (newPlayers.length > 0) {
            State.players = newPlayers;
            State.draftedPlayers = []; 
            State.myTeam = []; 
            State.rawDraftPicks = [];

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            State.rankingsMeta = { count: State.players.length, date: dateString };

            localStorage.setItem('ds_meta', JSON.stringify(State.rankingsMeta));
            localStorage.setItem('ds_players', JSON.stringify(State.players));
            updateMetaDisplay();
            saveDraftState();

            if (btn) flashButton(btn, "Loaded Successfully");
        } else {
            if (metaEl) metaEl.style.display = 'none';
            if (btn) flashButton(btn, "Error Parsing Data", true);
            window.alert("Error: Could not detect player names.");
        }
    }

    // --- LEAGUE LOGS INTEGRATION ---
    window.quickStartLeagueLogs = async function(btn) {
        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return;
        const profileKey = formatSelect.value;
        const formatText = formatSelect.options[formatSelect.selectedIndex].text;

        const originalText = btn.innerText;
        btn.innerText = "Building Quick-Start...";

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
            let sortedMarket = llMarket.data.sort((a, b) => parseFloat(a.overallRank) - parseFloat(b.overallRank));

            sortedMarket.forEach(item => {
                let sId = item.sleeperPlayerId;
                let sp = sleeperMap[sId];
                if (!sp || !sp.first_name) return;

                let cleanName = `${sp.first_name} ${sp.last_name}`;
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
                    id: newPlayers.length + 1, sleeperId: sId, rank: newPlayers.length + 1,
                    name: cleanName, posGroup: posGroup, posDisplay: posDisplay, tier: "-", 
                    team: team, bye: bye, adp: isNaN(adpNum) ? "-" : adpNum.toFixed(1), isRookie: isRookie
                });
            });

            if (newPlayers.length > 0) {
                State.players = newPlayers;
                State.draftedPlayers = []; State.myTeam = []; State.rawDraftPicks = [];

                let now = new Date();
                let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                State.rankingsMeta = { count: State.players.length, date: dateString };
                State.adpMeta = { format: "LeagueLogs: " + formatText, date: dateString };

                localStorage.setItem('ds_meta', JSON.stringify(State.rankingsMeta));
                localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
                localStorage.setItem('ds_players', JSON.stringify(State.players));
                
                updateMetaDisplay();
                saveDraftState();
                flashButton(btn, "Quick-Start Loaded!", false, originalText);
            } else {
                throw new Error("No players generated.");
            }
        } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            window.alert(`Failed to load Quick-Start.\n\n${err.message}`);
        }
    };

    window.fetchLeagueLogsADP = async function(btn) {
        if (State.players.length === 0) {
            flashButton(btn, "Load Rankings First", true);
            window.alert("You must load a set of player rankings before fetching Market Value.");
            return;
        }

        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return;
        const profileKey = formatSelect.value;
        const formatText = formatSelect.options[formatSelect.selectedIndex].text;

        const originalText = btn.innerText;
        btn.innerText = "Fetching...";

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

            State.players.forEach(p => {
                if (adpMap[p.sleeperId] !== undefined) p.adp = adpMap[p.sleeperId];
                let meta = playerMetaMap[p.sleeperId];
                p.isRookie = meta ? (meta.yearsExp === 0 || meta.yearsExp === "0" || meta.yearsExp === null) : false;
            });

            localStorage.setItem('ds_players', JSON.stringify(State.players));
            renderBoard();

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            State.adpMeta = { format: "LeagueLogs: " + formatText, date: dateString };
            localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
            updateMetaDisplay();

            flashButton(btn, "Complete!", false, originalText);
        } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            window.alert(`Failed to fetch live Market Value.\n\n${err.message}`);
        }
    };

    window.processManualADP = function(btn) {
        const text = document.getElementById('adpPasteArea')?.value;
        if (!text) {
            flashButton(btn, "Paste Rank First", true);
            return;
        }

        let matchedCount = 0;
        text.split('\n').forEach(row => {
            let parts = row.split(/\t|,/); 
            if (parts.length >= 2) {
                let pName = parts[0];
                let newAdp = parts[parts.length - 1].trim(); 
                if (pName && newAdp && !isNaN(parseFloat(newAdp))) {
                    let matchedPlayer = State.players.find(p => typeof isNameMatch === 'function' ? isNameMatch(p.name, pName) : p.name.toLowerCase() === pName.toLowerCase());
                    if (matchedPlayer) { matchedPlayer.adp = parseFloat(newAdp).toFixed(1); matchedCount++; }
                }
            }
        });

        if (matchedCount > 0) {
            localStorage.setItem('ds_players', JSON.stringify(State.players));
            renderBoard();
            flashButton(btn, "Updated!");
        } else {
            flashButton(btn, "No Matches", true);
        }
    };

    window.toggleAutoSync = function(isLive) {
        const liveInd = document.getElementById('liveIndicator');
        if (isLive) {
            if (liveInd) liveInd.style.display = 'inline-block';
            window.syncSleeper(true, null);
            State.autoSyncTimer = setInterval(() => window.syncSleeper(true, null), 1000);
        } else {
            if (liveInd) liveInd.style.display = 'none';
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
        }
    };

    window.syncSleeper = async function(isSilent = false, btn = null) {
        const username = document.getElementById('sleeperUsername')?.value.trim();
        const draftId = document.getElementById('sleeperDraftId')?.value.trim();

        if (!username || !draftId) {
            if (!isSilent && btn) window.alert("Please enter both Username and Draft ID.");
            return;
        }
        
        // Pass isSilent so background syncs don't force a re-render
        window.saveSettings(null, isSilent); 

        try {
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
            if (!userRes.ok) throw new Error("Could not find Sleeper User.");
            const userId = (await userRes.json()).user_id;

            const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
            if (draftRes.ok) {
                let dInfo = await draftRes.json();
                let numTeams = dInfo.settings?.teams || 12;
                let numRounds = dInfo.settings?.rounds || 15;
                State.leagueDraftSettings = { teams: numTeams, rounds: numRounds };
                
                const lTeamsEl = document.getElementById('leagueTeams');
                const lRoundsEl = document.getElementById('leagueRounds');
                if (lTeamsEl) lTeamsEl.value = numTeams;
                if (lRoundsEl) lRoundsEl.value = numRounds;

                // NEW: Fetch league details to get positional roster limits
                if (dInfo.league_id) {
                    try {
                        const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${dInfo.league_id}`);
                        if (leagueRes.ok) {
                            let lInfo = await leagueRes.json();
                            if (lInfo.roster_positions) {
                                let posCounts = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, BENCH: 0 };
                                
                                // Count how many of each slot the league uses
                                lInfo.roster_positions.forEach(pos => {
                                    if (pos === 'FLEX' || pos === 'W/R/T') posCounts.FLEX++;
                                    else if (pos === 'SUPER_FLEX' || pos === 'Q/W/R/T') posCounts.SUPER_FLEX++;
                                    else if (posCounts[pos] !== undefined) posCounts[pos]++;
                                });
                                
                                // Apply the counts to the UI inputs
                                const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
                                setVal('limitQB', posCounts.QB);
                                setVal('limitRB', posCounts.RB);
                                setVal('limitWR', posCounts.WR);
                                setVal('limitTE', posCounts.TE);
                                setVal('limitFLEX', posCounts.FLEX);
                                setVal('limitSFLEX', posCounts.SUPER_FLEX);
                                setVal('limitBENCH', posCounts.BENCH);

                                // Save these newly fetched limits to state quietly
                                window.saveSettings(null, true);
                            }
                        }
                    } catch(err) {
                        console.warn("Could not fetch Sleeper league roster positions.", err);
                    }
                }
            }
            }

            const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            if (!picksRes.ok) throw new Error("Could not fetch Draft ID picks.");
            const picksData = await picksRes.json();

            if (!picksData || picksData.length === 0) return;

            // Check if the number of picks has actually changed before doing heavy processing
            let previousTotal = parseInt(localStorage.getItem('ds_total_picks')) || 0;
            if (picksData.length === previousTotal) {
                return; // Board is up to date, do nothing.
            }

            State.rawDraftPicks = picksData;
            let sleeperDrafted = [];
            let sleeperMyTeam = [];

            picksData.forEach(pick => {
                let matchedPlayer = State.players.find(p => p.sleeperId === pick.player_id);
                if (!matchedPlayer && pick.metadata) {
                    let fullName = `${pick.metadata.first_name} ${pick.metadata.last_name}`;
                    matchedPlayer = State.players.find(p => typeof isNameMatch === 'function' ? isNameMatch(p.name, fullName) : p.name.toLowerCase() === fullName.toLowerCase());
                }

                if (matchedPlayer) {
                    sleeperDrafted.push(matchedPlayer.id);
                    if (pick.picked_by === userId) sleeperMyTeam.push(matchedPlayer.id);
                }
            });

            State.draftedPlayers = Array.from(new Set([...State.draftedPlayers, ...sleeperDrafted]));
            State.myTeam = Array.from(new Set([...State.myTeam, ...sleeperMyTeam]));

            localStorage.setItem('ds_total_picks', picksData.length);
            saveDraftState();

            if (!isSilent && btn) flashButton(btn, "Sync Complete!");
        } catch(err) {
            console.error(err);
            if (!isSilent && btn) window.alert(`Sleeper Sync Error:\n${err.message}`);
        }
    };

    window.draftPlayer = function(id, isMine) {
        if (!State.draftedPlayers.includes(id)) {
            State.draftedPlayers.push(id);
            if (isMine) State.myTeam.push(id);
            saveDraftState();
        }
    };

    window.undoDraft = function(id) {
        State.draftedPlayers = State.draftedPlayers.filter(pId => pId !== id);
        State.myTeam = State.myTeam.filter(pId => pId !== id);
        saveDraftState();
    };

    function getCallOutStyle(playerName) {
        let n = playerName.toLowerCase();
        let targets = (localStorage.getItem('ds_targets') || "").split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        let avoids = (localStorage.getItem('ds_avoids') || "").split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        let darts = (localStorage.getItem('ds_darts') || "").split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);

        if (targets.some(t => n.includes(t))) return `border-left: 5px solid var(--target-border); background-color: var(--target-bg);`;
        if (avoids.some(a => n.includes(a))) return `border-left: 5px solid var(--avoid-border); background-color: var(--avoid-bg);`;
        if (darts.some(d => n.includes(d))) return `border-left: 5px solid var(--dart-border); background-color: var(--dart-bg);`;
        return '';
    }

    function getTierTrackerData() {
        let trackers = { QB: null, RB: null, WR: null, TE: null };
        let available = State.players.filter(p => !State.draftedPlayers.includes(p.id));

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

    // --- RENDER DRAFT MATRIX ---
    function renderDraftMatrix() {
        const container = document.getElementById('draftMatrixContainer');
        if (!container) return;

        // 1. Capture the current scroll position
        let currentScroll = 0;
        const existingGrid = container.querySelector('.draft-grid');
        if (existingGrid) {
            currentScroll = existingGrid.scrollLeft;
        } else {
            currentScroll = container.scrollLeft; 
        }

        let totalTeams = State.leagueDraftSettings.teams || 12;
        let totalRounds = State.leagueDraftSettings.rounds || 15;

        let gridHTML = `<div class="draft-grid" style="grid-template-columns: repeat(${totalTeams}, minmax(78px, 1fr));">`;

        // BUILD HEADERS
        for (let t = 1; t <= totalTeams; t++) {
            let isMyCol = false;
            for (let r = 1; r <= totalRounds; r++) {
                let pNum = (r % 2 !== 0) ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                
                if (State.rawDraftPicks && State.rawDraftPicks.length > 0) {
                    let matched = State.rawDraftPicks.find(p => p.pick_no === pNum);
                    if (matched) {
                        let pl = State.players.find(x => x.sleeperId === matched.player_id);
                        if (pl && State.myTeam.includes(pl.id)) { isMyCol = true; break; }
                    }
                } else {
                    let manualPId = State.draftedPlayers[pNum - 1];
                    if (manualPId && State.myTeam.includes(manualPId)) { isMyCol = true; break; }
                }
            }
            gridHTML += `<div class="draft-col-header ${isMyCol ? 'mine' : ''}">T${t}</div>`;
        }

        // BUILD CELLS
        for (let r = 1; r <= totalRounds; r++) {
            for (let t = 1; t <= totalTeams; t++) {
                let pickNum = (r % 2 !== 0) ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                let displayTeamNum = (r % 2 !== 0) ? t : (totalTeams - t + 1);

                let pObj = null;
                let pName = "";
                let pPos = "";

                if (State.rawDraftPicks && State.rawDraftPicks.length > 0) {
                    let matchedPick = State.rawDraftPicks.find(p => p.pick_no === pickNum);
                    if (matchedPick) {
                        pObj = State.players.find(pl => pl.sleeperId === matchedPick.player_id);
                        pName = pObj ? pObj.name : (matchedPick.metadata?.first_name?.[0] + ". " + matchedPick.metadata?.last_name) || "Player";
                        pPos = pObj ? pObj.posGroup : matchedPick.metadata?.position || "";
                    }
                } else {
                    let manualPlayerId = State.draftedPlayers[pickNum - 1];
                    if (manualPlayerId) {
                        pObj = State.players.find(pl => pl.id === manualPlayerId);
                        if (pObj) { pName = pObj.name; pPos = pObj.posGroup; }
                    }
                }

                let cellClass = "draft-cell";
                let cellContent = `<span style="opacity:0.35; font-size:0.58rem;">${r}.${displayTeamNum < 10 ? '0'+displayTeamNum : displayTeamNum}</span>`;

                if (pName) {
                    let nameParts = pName.split(' ');
                    let firstName = nameParts[0];
                    let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

                    cellClass += ` picked ${pPos}`;
                    if (pObj && State.myTeam.includes(pObj.id)) cellClass += " mine";

                    cellContent = `
                        <div class="draft-cell-first" title="${pName}">${firstName}</div>
                        <div class="draft-cell-last" title="${pName}">${lastName}</div>
                    `;
                }

                gridHTML += `<div class="${cellClass}">${cellContent}</div>`;
            }
        }

        // Close the .draft-grid wrapper
        gridHTML += `</div>`;
        
        // 2. Inject the new HTML
        container.innerHTML = gridHTML;

        // 3. Immediately restore the scroll position
        const newGrid = container.querySelector('.draft-grid');
        if (newGrid && currentScroll > 0) {
            newGrid.scrollLeft = currentScroll;
        } else if (currentScroll > 0) {
            container.scrollLeft = currentScroll;
        }
    }

    function renderFantasyRoster() {
        let myPlayersObjects = State.myTeam.map(id => State.players.find(p => p.id === id)).filter(Boolean);
        let availablePool = [...myPlayersObjects];
        let rosterSlotsHTML = '';

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
            let count = State.dsLimits[pos] || 0;
            let color = `var(--pos-${pos.toLowerCase()}-border)`;
            for (let i = 0; i < count; i++) {
                let idx = availablePool.findIndex(p => p.posGroup === pos);
                let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
                rosterSlotsHTML += buildSlotHTML(`${pos}${i+1}`, color, p);
            }
        });

        for (let i = 0; i < (State.dsLimits.FLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('FLX', '#86efac', p);
        }

        for (let i = 0; i < (State.dsLimits.SFLEX || 0); i++) {
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
        
        if (bannerContainer && showByeWarnings && myPlayersObjects.length > 0) {
            let byeCounts = {};
            let starterSlotsCount = (State.dsLimits.QB||0) + (State.dsLimits.RB||0) + (State.dsLimits.WR||0) + (State.dsLimits.TE||0) + (State.dsLimits.FLEX||0) + (State.dsLimits.SFLEX||0);
            let activeStarters = myPlayersObjects.slice(0, starterSlotsCount);

            activeStarters.forEach(sp => {
                if (sp.bye && sp.bye !== "-") byeCounts[sp.bye] = (byeCounts[sp.bye] || 0) + 1;
            });

            let heavyByes = Object.keys(byeCounts).filter(bye => byeCounts[bye] >= 3);
            if (heavyByes.length > 0) {
                bannerContainer.innerHTML = `<div class="bye-warning-banner"><span>⚠️ WARNING: You have ${byeCounts[heavyByes[0]]} starting players on Bye in Week ${heavyByes[0]}!</span></div>`;
            } else {
                bannerContainer.innerHTML = '';
            }
        } else if (bannerContainer) {
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
        let totalPicksDone = Math.max(State.draftedPlayers.length, syncedPicks);
        let currentOverallPick = totalPicksDone + 1;
        
        let teamsInLeague = State.leagueDraftSettings.teams || 12;
        let round = Math.ceil(currentOverallPick / teamsInLeague);
        let pickInRound = currentOverallPick - ((round - 1) * teamsInLeague);
        
        const pickTrackerEl = document.getElementById('pickTracker');
        if (pickTrackerEl) pickTrackerEl.innerText = `Pick: ${round}.${pickInRound.toString().padStart(2, '0')}`;

        const trackers = getTierTrackerData();
        let trackerHTML = `<div class="badge badge-all pos-filter ${State.activePosFilter === 'ALL' ? 'active-filter' : ''}" onclick="setPosFilter('ALL')"><span>ALL</span></div>`;

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let isActive = State.activePosFilter === pos ? 'active-filter' : '';
            let tText = trackers[pos] ? `T${trackers[pos].tier} (${trackers[pos].count})` : "—";
            trackerHTML += `<div class="badge pos-badge ${pos} pos-filter ${isActive}" onclick="setPosFilter('${pos}')"><span>${pos}</span><span style="font-size:0.65rem; opacity:0.9;">${tText}</span></div>`;
        });
        const tierTrackerEl = document.getElementById('tierTracker');
        if (tierTrackerEl) tierTrackerEl.innerHTML = trackerHTML;

        let showStacks = localStorage.getItem('ds_stacks') === 'true';
        let myQbs = State.myTeam.map(id => State.players.find(p => p.id === id)).filter(p => p && p.posGroup === 'QB').map(p => p.team).filter(t => t !== "FA");
        let myPassCatchers = State.myTeam.map(id => State.players.find(p => p.id === id)).filter(p => p && ['WR', 'TE'].includes(p.posGroup)).map(p => p.team).filter(t => t !== "FA");

        let lastTier = null;

        State.players.forEach(p => {
            const isDrafted = State.draftedPlayers.includes(p.id);
            const isMine = State.myTeam.includes(p.id);

            if (isMine && posCounts[p.posGroup] !== undefined) posCounts[p.posGroup]++;

            if (!isDrafted) {
                if (State.activePosFilter !== 'ALL' && p.posGroup !== State.activePosFilter) return;

                if (p.name.toLowerCase().includes(searchTerm)) {
                    if (searchTerm === "" && p.tier !== lastTier && p.tier !== "-") {
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

                    let stackBadge = isStack ? `<span class="badge" style="background: var(--stack-color); color: white;">Stack</span>` : "";
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
                                        <span style="cursor:pointer; font-size: 0.85rem; opacity: 0.7; margin-left: 2px;" onclick="toggleEditBar(${p.id})" title="Edit Details">Edit</span>
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

        if (poolEl) poolEl.innerHTML = newPoolHTML;
        if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster();

        let otherDraftedIds = State.draftedPlayers.filter(id => !State.myTeam.includes(id)).slice().reverse();
        let newOtherHTML = '';
        otherDraftedIds.forEach(id => {
            let p = State.players.find(player => player.id === id);
            if (p) {
                newOtherHTML += `
                    <div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                        <div style="color: var(--text-muted);"><strike>${p.name}</strike> <span class="badge">${p.posGroup}</span></div>
                        <button class="btn-sm btn-draft" style="padding:2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                    </div>`;
            }
        });
        if (otherEl) otherEl.innerHTML = newOtherHTML;

        let flexOverflow = Math.max(0, posCounts['RB'] - State.dsLimits.RB) + Math.max(0, posCounts['WR'] - State.dsLimits.WR) + Math.max(0, posCounts['TE'] - State.dsLimits.TE);
        let flexUsed = Math.min(flexOverflow, State.dsLimits.FLEX);
        let sflexOverflow = Math.max(0, posCounts['QB'] - State.dsLimits.QB) + Math.max(0, flexOverflow - State.dsLimits.FLEX);
        let sflexUsed = Math.min(sflexOverflow, State.dsLimits.SFLEX);

        const limitsBodyEl = document.getElementById('limitsBody');
        if (limitsBodyEl) {
            limitsBodyEl.innerHTML = `
                <tr>
                    <td>${posCounts['QB']} / ${State.dsLimits.QB}</td>
                    <td>${posCounts['RB']} / ${State.dsLimits.RB}</td>
                    <td>${posCounts['WR']} / ${State.dsLimits.WR}</td>
                    <td>${posCounts['TE']} / ${State.dsLimits.TE}</td>
                    <td>${flexUsed} / ${State.dsLimits.FLEX}</td>
                    <td>${sflexUsed} / ${State.dsLimits.SFLEX}</td>
                    <td><strong>${State.myTeam.length} / ${State.dsLimits.TOTAL}</strong></td>
                </tr>`;
        }

        renderDraftMatrix();
    }

    if (State.players.length > 0) renderBoard();

    const searchBarEl = document.getElementById('searchBar');
    if (searchBarEl) {
        searchBarEl.addEventListener('input', renderBoard);
    }

})();
