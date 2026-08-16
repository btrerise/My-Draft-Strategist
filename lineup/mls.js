/**
 * Fantasy Football Season & Lineup Strategist - Core Logic
 * Refactored for modular encapsulation, performance, and clean architecture.
 */

(function () {
    'use strict';

    // --- CONSTANTS & CONFIGURATION ---
    const NFL_TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];
    
    const TEAM_BYES = {
        "ARI": 11, "ATL": 12, "BAL": 14, "BUF": 12, "CAR": 11, "CHI": 7, "CIN": 12, "CLE": 10,
        "DAL": 7, "DEN": 14, "DET": 5, "GB": 10, "HOU": 14, "IND": 14, "JAX": 12, "KC": 6,
        "LAC": 5, "LAR": 6, "LV": 10, "MIA": 6, "MIN": 6, "NE": 14, "NO": 12, "NYG": 11,
        "NYJ": 12, "PHI": 5, "PIT": 9, "SEA": 10, "SF": 9, "TB": 11, "TEN": 5, "WAS": 14
    };

    // --- STATE MANAGEMENT ---
    const State = {
        leagues: JSON.parse(localStorage.getItem('mds_season_leagues')) || [],
        activeLeagueId: localStorage.getItem('mds_season_active_league') || null,
        earlyTeams: JSON.parse(localStorage.getItem('mds_season_early_teams')) || [],
        rosRankings: JSON.parse(localStorage.getItem('mds_season_ros')) || [],
        weeklyRankings: JSON.parse(localStorage.getItem('mds_season_weekly')) || [],
        marketRankings: JSON.parse(localStorage.getItem('mds_season_market')) || [],
        sosMap: JSON.parse(localStorage.getItem('mds_season_sos')) || {},
        lockedPlayersMap: JSON.parse(localStorage.getItem('mds_season_locks_map')) || {},
        manualStartersMap: JSON.parse(localStorage.getItem('mds_season_manual_starters')) || {},
        manualBenchMap: JSON.parse(localStorage.getItem('mds_season_manual_bench')) || {},
        swapSourceId: null,
        touchStartX: 0,
        touchEndX: 0
    };

    // --- UTILITY HELPERS ---
    function normalizeName(name) {
        return name ? name.toLowerCase().replace(/[^a-z]/g, '') : '';
    }

    function flashButton(btn, text, isError = false, fallbackText = null, duration = 2500) {
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
        }, duration);
    }

    // --- DRAWER & SWIPE LOGIC ---
    window.toggleDrawer = function() {
        const drawer = document.getElementById('drawer');
        const overlay = document.getElementById('drawerOverlay');
        if (!drawer || !overlay) return;
        drawer.classList.toggle('open');
        overlay.style.display = drawer.classList.contains('open') ? 'block' : 'none';
    };

    window.navigateFromDrawer = function(tabId) {
        document.querySelectorAll('.hamburger-menu .nav-btn').forEach(l => l.classList.remove('active-link'));
        const targetBtn = document.querySelector(`.hamburger-menu .nav-btn[data-drawer-target="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active-link');
        
        window.toggleDrawer();
        window.showTab(tabId);
    };

    const mainAppEl = document.getElementById('mainApp');
    if (mainAppEl) {
        mainAppEl.addEventListener('touchstart', e => { State.touchStartX = e.changedTouches[0].screenX; }, {passive: true});
        mainAppEl.addEventListener('touchend', e => { State.touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, {passive: true});
    }

    function handleSwipe() {
        const swipeThreshold = 120; 
        const activeTabBtn = document.querySelector('.nav-bar .nav-btn.active');
        if (!activeTabBtn) return;
        
        const tabs = ['roster', 'lineup', 'scout'];
        const currentIdx = tabs.indexOf(activeTabBtn.getAttribute('data-target'));
        
        if (State.touchEndX < State.touchStartX - swipeThreshold) {
            if (currentIdx < tabs.length - 1) {
                window.showTab(tabs[currentIdx + 1]);
                updateDrawerActiveState(tabs[currentIdx + 1]);
            }
        }
        if (State.touchEndX > State.touchStartX + swipeThreshold) {
            if (currentIdx > 0) {
                window.showTab(tabs[currentIdx - 1]);
                updateDrawerActiveState(tabs[currentIdx - 1]);
            }
        }
    }

    function updateDrawerActiveState(tabId) {
        document.querySelectorAll('.hamburger-menu .nav-btn').forEach(l => l.classList.remove('active-link'));
        const targetBtn = document.querySelector(`.hamburger-menu .nav-btn[data-drawer-target="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active-link');
    }

    // --- NAVIGATION LOGIC ---
    window.showTab = function(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const targetTab = document.getElementById(tabId + 'Tab');
        if (targetTab) targetTab.classList.add('active');

        document.querySelectorAll('.nav-bar .nav-btn').forEach(b => b.classList.remove('active'));
        const activeNavBtn = document.querySelector(`.nav-bar .nav-btn[data-target="${tabId}"]`);
        if (activeNavBtn) activeNavBtn.classList.add('active');
        
        if (tabId === 'lineup') window.optimizeLineup(false);
        if (tabId === 'roster') loadRosterTab();
        if (tabId === 'setup') refreshLeagueDropdown();
        window.scrollTo(0, 0);
    };
    
    window.factoryReset = function() {
        if (window.confirm("DANGER ZONE\n\nAre you sure you want to clear ALL leagues, cached rankings, custom SoS data, and settings?\n\nThis cannot be undone.")) {
            localStorage.clear();
            window.location.reload();
        }
    };

    // --- INITIALIZATION ---
    window.onload = function() {
        populateEarlyGameDropdown();
        refreshLeagueDropdown();
        updateRankingsMetaDisplay();
        generateSoSGrid();

        if (State.leagues.length > 0 && !State.activeLeagueId) {
            State.activeLeagueId = State.leagues[0].leagueId;
        }
        if (State.activeLeagueId) {
            const leagueSelect = document.getElementById('headerLeagueSelect');
            if (leagueSelect) leagueSelect.value = State.activeLeagueId;
            loadActiveLeagueData();
        }
        window.showTab('setup');
    };

    // --- EARLY GAMES LOGIC ---
    function populateEarlyGameDropdown() {
        const sel = document.getElementById('earlyTeamSelect');
        if (!sel) return;
        let html = `<option value="">-- Add an Early Team --</option>`;
        NFL_TEAMS.forEach(t => { html += `<option value="${t}">${t}</option>`; });
        sel.innerHTML = html;
        renderEarlyChips();
        checkEarlyBannerVisibility();
    }

    window.addEarlyTeam = function(team) {
        if (!team) return;
        if (!State.earlyTeams.includes(team)) {
            State.earlyTeams.push(team);
            localStorage.setItem('mds_season_early_teams', JSON.stringify(State.earlyTeams));
            renderEarlyChips();
        }
        const sel = document.getElementById('earlyTeamSelect');
        if (sel) sel.value = "";
        checkEarlyBannerVisibility();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'lineupTab') renderLineupUI();
    };

    window.removeEarlyTeam = function(team) {
        State.earlyTeams = State.earlyTeams.filter(t => t !== team);
        localStorage.setItem('mds_season_early_teams', JSON.stringify(State.earlyTeams));
        renderEarlyChips();
        checkEarlyBannerVisibility();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'lineupTab') renderLineupUI();
    };

    function renderEarlyChips() {
        const container = document.getElementById('earlyTeamChips');
        if (!container) return;
        if (State.earlyTeams.length === 0) {
            container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">No teams selected.</span>`;
            return;
        }
        let html = "";
        State.earlyTeams.forEach(t => {
            html += `<div class="team-chip">${t} <span class="close-chip" onclick="removeEarlyTeam('${t}')">✕</span></div>`;
        });
        container.innerHTML = html;
    }

    function checkEarlyBannerVisibility() {
        const banner = document.getElementById('earlyBanner');
        if (banner) banner.style.display = State.earlyTeams.length > 0 ? 'block' : 'none';
    }

    function isEarlyPlayer(teamStr) {
        if (!teamStr || teamStr === "FA") return false;
        return State.earlyTeams.includes(teamStr.toUpperCase());
    }

    // --- LEAGUE & SYNC LOGIC ---
    function refreshLeagueDropdown() {
        const select = document.getElementById('headerLeagueSelect');
        if (!select) return;
        if (State.leagues.length === 0) {
            select.innerHTML = `<option value="">No Leagues</option>`;
            return;
        }
        let html = "";
        State.leagues.forEach(l => {
            let sel = l.leagueId === State.activeLeagueId ? "selected" : "";
            html += `<option value="${l.leagueId}" ${sel}>${l.name}</option>`;
        });
        select.innerHTML = html;
    }

    window.switchActiveLeague = function(leagueId) {
        if (!leagueId) return;
        State.activeLeagueId = leagueId;
        localStorage.setItem('mds_season_active_league', State.activeLeagueId);
        
        // HYDRATION: Unpack rankings for this specific league
        let league = getActiveLeague();
        if (league) {
            State.rosRankings = league.rosRankings && league.rosRankings.length > 0 
                ? [...league.rosRankings] 
                : JSON.parse(localStorage.getItem('mds_season_ros')) || [];
                
            State.weeklyRankings = league.weeklyRankings && league.weeklyRankings.length > 0 
                ? [...league.weeklyRankings] 
                : JSON.parse(localStorage.getItem('mds_season_weekly')) || [];

            // Update the global fallbacks so the UI stays in sync
            localStorage.setItem('mds_season_ros', JSON.stringify(State.rosRankings));
            localStorage.setItem('mds_season_weekly', JSON.stringify(State.weeklyRankings));
            
            updateRankingsMetaDisplay();
        }

        loadActiveLeagueData();
        State.swapSourceId = null;

        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') window.optimizeLineup(false);
        if (activeTab === 'rosterTab') loadRosterTab();
        
        const waiverInput = document.getElementById('waiverInput');
        const waiverOutput = document.getElementById('waiverOutput');
        if (waiverInput && waiverInput.value.trim() !== '') runScout('waiver');
        else if (waiverOutput) waiverOutput.innerHTML = '';
        
        const buyInput = document.getElementById('buyInput');
        const sellInput = document.getElementById('sellInput');
        const tradeOutput = document.getElementById('tradeOutput');
        if (buyInput && sellInput && (buyInput.value.trim() !== '' || sellInput.value.trim() !== '')) runScout('trade');
        else if (tradeOutput) tradeOutput.innerHTML = '';
    };

    function getActiveLeague() {
        return State.leagues.find(l => l.leagueId === State.activeLeagueId) || null;
    }
    function saveActiveLeagueState() {
    let league = getActiveLeague();
    if (league) {
        // Save current rankings specifically to this league
        league.rosRankings = [...State.rosRankings];
        league.weeklyRankings = [...State.weeklyRankings];
    }
    localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
}
    function loadActiveLeagueData() {
        let league = getActiveLeague();
        if (!league) return;
        
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('reqQB', reqs.QB);
        setVal('reqRB', reqs.RB);
        setVal('reqWR', reqs.WR);
        setVal('reqTE', reqs.TE);
        setVal('reqFLEX', reqs.FLEX);
        setVal('reqSFLEX', reqs.SFLEX);
        
        const titleEl = document.getElementById('activeLeagueReqTitle');
        if (titleEl) titleEl.innerText = `(${league.name})`;
        setVal('sleeperUsername', league.username !== "Manual" ? league.username : "");
    }

    window.saveRequirements = function(btn) {
        let league = getActiveLeague();
        if (!league) { window.alert("Please select or add a league first."); return; }
        const getInt = id => parseInt(document.getElementById(id)?.value) || 0;
        league.reqs = {
            QB: getInt('reqQB'), RB: getInt('reqRB'), WR: getInt('reqWR'),
            TE: getInt('reqTE'), FLEX: getInt('reqFLEX'), SFLEX: getInt('reqSFLEX')
        };
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        if (btn) flashButton(btn, "Requirements Saved");
        window.optimizeLineup(true);
    };

    window.createManualLeague = function() {
        const nameInput = document.getElementById('newLeagueName');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) { window.alert("Please enter a League Name to create a manual league."); return; }

        let newId = 'manual_' + Date.now();
        let leagueObj = {
            leagueId: newId, name: name, username: "Manual",
            reqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0 }, roster: [], globalRosterMap: {},
            rosRankings: [...State.rosRankings],       
            weeklyRankings: [...State.weeklyRankings]  
        };
        State.leagues.push(leagueObj);
        State.activeLeagueId = newId;
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        localStorage.setItem('mds_season_active_league', State.activeLeagueId);

        if (nameInput) nameInput.value = "";
        refreshLeagueDropdown(); 
        loadActiveLeagueData();
        
        let msgEl = document.getElementById('manualAddMsg');
        if (msgEl) {
            msgEl.innerText = `Manual League '${name}' Created`;
            setTimeout(() => msgEl.innerText = "", 3000);
        }
    };

    window.addManualPlayer = function() {
        let league = getActiveLeague();
        if (!league) { window.alert("Please add or select a league first."); return; }
        const nameInput = document.getElementById('manualName');
        const posInput = document.getElementById('manualPos');
        const teamInput = document.getElementById('manualTeam');

        const name = nameInput ? nameInput.value.trim() : "";
        const pos = posInput ? posInput.value : "FLEX";
        const team = teamInput ? teamInput.value.trim().toUpperCase() || "FA" : "FA";

        if (!name) { window.alert("Please enter a player name."); return; }

        let newP = { id: 'p_' + Date.now(), name: name, cleanName: normalizeName(name), pos: pos, team: team };
        league.roster = league.roster || [];
        league.roster.push(newP);
        
        league.globalRosterMap = league.globalRosterMap || {};
        league.globalRosterMap[newP.cleanName] = "You";
        
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        if (nameInput) nameInput.value = ""; 
        if (teamInput) teamInput.value = "";
        window.optimizeLineup(true); 
        loadRosterTab();
        
        let msgEl = document.getElementById('manualAddMsg');
        if (msgEl) {
            msgEl.innerText = `Added ${name}`;
            setTimeout(() => msgEl.innerText = "", 3000);
        }
    };

    window.deletePlayer = function(playerId) {
        let league = getActiveLeague();
        if (!league) return;
        if (window.confirm("Remove player from active roster?")) {
            let pToRemove = league.roster.find(p => p.id === playerId);
            if (pToRemove && league.globalRosterMap) { delete league.globalRosterMap[pToRemove.cleanName]; }
            league.roster = league.roster.filter(p => p.id !== playerId);
            localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
            window.optimizeLineup(true); 
            loadRosterTab();
        }
    };

    async function processSleeperData(username, leagueId, btn, isRefresh = false) {
        try {
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
            if (!userRes.ok) throw new Error("User not found.");
            const userId = (await userRes.json()).user_id;

            const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
            if (!leagueRes.ok) throw new Error("League ID not found.");
            const leagueData = await leagueRes.json();
            let leagueName = leagueData.name || "My League";

            let autoReqs = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SFLEX: 0 };
            if (leagueData.roster_positions) {
                leagueData.roster_positions.forEach(pos => {
                    if (pos === 'QB') autoReqs.QB++;
                    else if (pos === 'RB') autoReqs.RB++;
                    else if (pos === 'WR') autoReqs.WR++;
                    else if (pos === 'TE') autoReqs.TE++;
                    else if (['FLEX', 'REC_FLEX', 'WRRB_FLEX'].includes(pos)) autoReqs.FLEX++;
                    else if (pos === 'SUPER_FLEX') autoReqs.SFLEX++;
                });
            } else {
                autoReqs = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };
            }

            if (btn) btn.innerText = "Mapping League...";
            const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
            const usersData = await usersRes.json();
            let userMap = {};
            usersData.forEach(u => userMap[u.user_id] = u.display_name);

            const rosterRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
            const rosters = await rosterRes.json();
            
            if (btn) btn.innerText = "Loading Players...";
            const mapRes = await fetch(`https://api.sleeper.app/v1/players/nfl`);
            const playerMap = await mapRes.json();

            let myTeam = rosters.find(r => r.owner_id === userId);
            if (!myTeam && !isRefresh) throw new Error("Could not find your team in this league.");
            
            let globalRosterMap = {}; 
            rosters.forEach(r => {
                let ownerName = userMap[r.owner_id] || "Unknown Team";
                if (r.owner_id === userId) ownerName = "You";
                
                if (r.players) {
                    r.players.forEach(pId => {
                        let p = playerMap[pId];
                        if (p) {
                            let clean = normalizeName(`${p.first_name} ${p.last_name}`);
                            globalRosterMap[clean] = ownerName;
                        }
                    });
                }
            });

            let rosterDetails = [];
            if (myTeam && myTeam.players) {
                myTeam.players.forEach(id => {
                    let p = playerMap[id];
                    if (p) {
                        let inj = null;
                        if (p.injury_status && p.injury_status !== "None" && p.injury_status !== "Active") inj = p.injury_status;
                        else if (p.status && ['Suspended', 'PUP', 'IR', 'NFI'].includes(p.status)) inj = p.status;
                        
                        let shortInj = null;
                        if (inj) {
                            let iUpper = inj.toUpperCase();
                            if (iUpper.includes('QUESTIONABLE')) shortInj = 'Q';
                            else if (iUpper.includes('DOUBTFUL')) shortInj = 'D';
                            else if (iUpper.includes('OUT')) shortInj = 'OUT';
                            else if (iUpper.includes('SUSPENDED')) shortInj = 'SUS';
                            else if (iUpper.includes('IR') || iUpper.includes('INJURED RESERVE')) shortInj = 'IR';
                            else if (iUpper.includes('PUP')) shortInj = 'PUP';
                            else if (iUpper.includes('NFI')) shortInj = 'NFI';
                            else shortInj = inj;
                        }

                        rosterDetails.push({
                            id: id,
                            name: `${p.first_name} ${p.last_name}`,
                            cleanName: normalizeName(`${p.first_name} ${p.last_name}`),
                            pos: p.position || "FLEX",
                            team: p.team || "FA",
                            inj: shortInj
                        });
                    }
                });
            }

            let leagueObj = {
                leagueId: leagueId, name: leagueName, username: username,
                reqs: autoReqs, roster: rosterDetails, globalRosterMap: globalRosterMap,
                rosRankings: [...State.rosRankings],   
            weeklyRankings: [...State.weeklyRankings]  
            };

            let existingIdx = State.leagues.findIndex(l => l.leagueId === leagueId);
            if (existingIdx !== -1) State.leagues[existingIdx] = leagueObj;
            else State.leagues.push(leagueObj);

            State.activeLeagueId = leagueId;
            localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
            localStorage.setItem('mds_season_active_league', State.activeLeagueId);

            if (!isRefresh) {
                const nLeagueNameEl = document.getElementById('newLeagueName');
                const sLeagueIdEl = document.getElementById('sleeperLeagueId');
                if (nLeagueNameEl) nLeagueNameEl.value = "";
                if (sLeagueIdEl) sLeagueIdEl.value = "";
                refreshLeagueDropdown(); 
                loadActiveLeagueData();
            }
            
            window.optimizeLineup(true); 
            loadRosterTab();
            
            if (btn) flashButton(btn, isRefresh ? "Sync Complete" : "Synced Successfully", false, isRefresh ? "🔄 Sync Sleeper Waivers & Trades" : "Sync Sleeper");

        } catch(err) {
            console.error(err);
            if (btn) flashButton(btn, "Sync Failed", true, isRefresh ? "🔄 Sync Sleeper Waivers & Trades" : "Sync Sleeper");
            window.alert(`Sync Error:\n${err.message}`);
        }
    }

    window.addAndSyncLeague = function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim() || "";
        const leagueId = document.getElementById('sleeperLeagueId')?.value.trim() || "";
        if (!username || !leagueId) { window.alert("Please enter both Sleeper Username and League ID to sync."); return; }
        if (btn) { btn.innerText = "Syncing..."; btn.style.backgroundColor = "var(--accent-color, #8b5cf6)"; }
        processSleeperData(username, leagueId, btn, false);
    };

    window.syncActiveLeague = function() {
        let league = getActiveLeague();
        if (!league || !league.leagueId || league.leagueId.startsWith('manual_') || !league.username) {
            window.alert("Only Sleeper-synced leagues can be refreshed via this button."); return;
        }
        const btn = document.getElementById('rosterSyncBtn');
        if (btn) btn.innerText = "Syncing...";
        processSleeperData(league.username, league.leagueId, btn, true);
    };

    // --- SOS ENGINE ---
    function generateSoSGrid() {
        const tbody = document.getElementById('sosGridBody');
        if (!tbody) return;
        let html = '';
        NFL_TEAMS.forEach(team => {
            let qb = State.sosMap[team]?.QB || "";
            let rb = State.sosMap[team]?.RB || "";
            let wr = State.sosMap[team]?.WR || "";
            let te = State.sosMap[team]?.TE || "";
            html += `<tr>
                <td style="font-weight:bold;">${team}</td>
                <td><input type="number" class="sos-input" id="sos_${team}_QB" value="${qb}"></td>
                <td><input type="number" class="sos-input" id="sos_${team}_RB" value="${rb}"></td>
                <td><input type="number" class="sos-input" id="sos_${team}_WR" value="${wr}"></td>
                <td><input type="number" class="sos-input" id="sos_${team}_TE" value="${te}"></td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }

    window.saveManualSoS = function(btn) {
        NFL_TEAMS.forEach(team => {
            if (!State.sosMap[team]) State.sosMap[team] = {};
            const getVal = id => document.getElementById(id)?.value || "";
            State.sosMap[team].QB = getVal(`sos_${team}_QB`);
            State.sosMap[team].RB = getVal(`sos_${team}_RB`);
            State.sosMap[team].WR = getVal(`sos_${team}_WR`);
            State.sosMap[team].TE = getVal(`sos_${team}_TE`);
        });
        localStorage.setItem('mds_season_sos', JSON.stringify(State.sosMap));
        
        if (btn) flashButton(btn, "SoS Saved");
        
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') window.optimizeLineup(true);
        else if (activeTab === 'rosterTab') loadRosterTab();
    };

    const sosFileInput = document.getElementById('sosFileInput');
    if (sosFileInput) {
        sosFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: function(results) {
                    results.data.forEach(row => {
                        let teamKey = Object.keys(row).find(k => k.toLowerCase().includes('team') || k.toLowerCase().includes('tm'));
                        let team = teamKey ? row[teamKey].trim().toUpperCase() : null;

                        if (team && NFL_TEAMS.includes(team)) {
                            if (!State.sosMap[team]) State.sosMap[team] = {};
                            let isMatrix = Object.keys(row).some(k => ['qb','rb','wr','te'].includes(k.toLowerCase()));
                            
                            if (isMatrix) {
                                for (let key in row) {
                                    let k = key.toLowerCase();
                                    if (['qb', 'rb', 'wr', 'te'].includes(k)) {
                                        State.sosMap[team][k.toUpperCase()] = row[key].replace(/[^0-9]/g, '');
                                    }
                                }
                            } else {
                                let posKey = Object.keys(row).find(k => k.toLowerCase() === 'pos' || k.toLowerCase() === 'position');
                                let sosKey = Object.keys(row).find(k => k.toLowerCase() === 'sos' || k.toLowerCase() === 'schedule' || k.toLowerCase() === 'matchup');
                                
                                if (posKey && sosKey) {
                                    let posStr = row[posKey].toUpperCase();
                                    let sosVal = row[sosKey].replace(/[^0-9]/g, '');
                                    let posGroup = posStr.includes('QB') ? 'QB' : posStr.includes('RB') ? 'RB' : posStr.includes('WR') ? 'WR' : posStr.includes('TE') ? 'TE' : null;

                                    if (posGroup && sosVal) State.sosMap[team][posGroup] = sosVal;
                                }
                            }
                        }
                    });
                    localStorage.setItem('mds_season_sos', JSON.stringify(State.sosMap));
                    generateSoSGrid();
                    
                    let msgEl = document.getElementById('sosSuccessMsg');
                    if (msgEl) {
                        msgEl.style.display = 'block';
                        setTimeout(() => msgEl.style.display = 'none', 3000);
                    }
                }
            });
        });
    }

    function getSoSBadgeHTML(team, pos) {
        if (!team || team === "FA" || !pos) return "";
        let teamData = State.sosMap[team];
        if (!teamData) return "";
        
        let rankStr = teamData[pos];
        if (!rankStr || rankStr === "") return "";
        
        let rank = parseInt(rankStr);
        if (isNaN(rank) || rank < 1 || rank > 32) return "";
        
        let hue = Math.max(0, 120 - ((rank - 1) * 3.87));
        let color = `hsl(${hue}, 80%, 65%)`;
        let bg = `hsl(${hue}, 80%, 15%)`;
        
        return `<span class="badge" style="background:${bg}; border:1px solid ${color}; color:${color}; font-size:0.65rem; margin-left:4px;">SoS: ${rank}</span>`;
    }

    // --- SCOUT TAB ENGINE ---
    window.runScout = function(type) {
        const inputEl = document.getElementById(type === 'waiver' ? 'waiverInput' : 'buyInput');
        const sellEl = document.getElementById('sellInput');
        const outputEl = document.getElementById(type === 'waiver' ? 'waiverOutput' : 'tradeOutput');
        if (!inputEl || !outputEl) return;
        
        let targetNames = inputEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        let sellNames = (type === 'trade' && sellEl) ? sellEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
        
        if (targetNames.length === 0 && sellNames.length === 0) {
            outputEl.innerHTML = `<span style="color:var(--error-color, #fca5a5);">Please enter at least one player name.</span>`;
            return;
        }

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};

        const buildCard = (name, roleLabel = null) => {
            let clean = normalizeName(name);
            let rosObj = State.rosRankings.find(r => r.cleanName === clean);
            let weekObj = State.weeklyRankings.find(r => r.cleanName === clean);
            
            let displayName = rosObj?.name || weekObj?.name || name;
            let wRank = weekObj ? weekObj.rank : "UR";
            let rRank = rosObj ? rosObj.rank : "UR";
            let owner = rosterMap[clean];
            let statusHTML = "";
            
            if (roleLabel === "SELL") {
                if (owner === "You") statusHTML = `<div class="scout-status status-owned">On Your Roster<br>(Ready to Sell)</div>`;
                else if (owner) statusHTML = `<div class="scout-status status-avail">Already Dropped<br>/ Traded</div>`;
                else statusHTML = `<div class="scout-status status-avail">Not on your<br>roster</div>`;
            } else {
                if (!owner) statusHTML = `<div class="scout-status status-avail">Free Agent<br>(Available)</div>`;
                else if (owner === "You") statusHTML = `<div class="scout-status status-mine">On Your<br>Roster</div>`;
                else statusHTML = `<div class="scout-status status-owned">Rostered by:<br>${owner}</div>`;
            }

            let roleTag = roleLabel ? `<span class="badge" style="background:#112233;">${roleLabel} Target</span>` : "";

            return `
            <div class="scout-result-card">
                <div>
                    <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                        ${displayName} ${roleTag}
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:0.8rem;">
                        <span>Wk Rank: <strong style="color:#93c5fd;">${wRank}</strong></span>
                        <span>ROS Rank: <strong style="color:#86efac;">${rRank}</strong></span>
                    </div>
                </div>
                <div style="text-align:right;">${statusHTML}</div>
            </div>`;
        };

        let html = "";
        if (targetNames.length > 0) {
            html += type === 'trade' ? `<div style="font-weight:bold; color:#4ade80; margin-bottom:0.5rem;">Buy Targets</div>` : "";
            targetNames.forEach(n => html += buildCard(n, type === 'trade' ? "BUY" : null));
        }
        
        if (sellNames.length > 0) {
            html += `<div style="font-weight:bold; color:#fca5a5; margin:1rem 0 0.5rem 0;">Sell / Drop Candidates</div>`;
            sellNames.forEach(n => html += buildCard(n, "SELL"));
        }

        outputEl.innerHTML = html;
    };

    // --- RANKINGS ENGINE ---
    function updateRankingsMetaDisplay() {
        const rosMetaEl = document.getElementById('rosMetaDisplay');
        if (rosMetaEl) {
            if (State.rosRankings.length > 0) { rosMetaEl.style.display = 'block'; rosMetaEl.innerText = `Loaded: ${State.rosRankings.length} players`; }
            else { rosMetaEl.style.display = 'none'; }
        }

        const weeklyMetaEl = document.getElementById('weeklyMetaDisplay');
        if (weeklyMetaEl) {
            if (State.weeklyRankings.length > 0) { weeklyMetaEl.style.display = 'block'; weeklyMetaEl.innerText = `Loaded: ${State.weeklyRankings.length} players`; }
            else { weeklyMetaEl.style.display = 'none'; }
        }
    }

    function processRankingsUpload(fileInputId, isWeekly, successMsgId) {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || !fileInput.files[0]) return;
        const file = fileInput.files[0];

        const filename = file.name.toLowerCase();
        if (filename.endsWith('.csv')) {
            Papa.parse(file, { header: false, skipEmptyLines: true, complete: results => parseRankingsData(results.data, isWeekly, successMsgId) });
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            loadSheetJS(() => {
                const reader = new FileReader();
            reader.onload = e => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
                Papa.parse(csvStr, { header: false, skipEmptyLines: true, complete: results => parseRankingsData(results.data, isWeekly, successMsgId) });
            };
            reader.readAsArrayBuffer(file);
            });
            } else {
            window.alert("Unsupported file format. Please upload a .csv or .xlsx file.");
        }
    }

    function parseRankingsData(rows, isWeekly, successMsgId) {
        let parsed = [];
        if (rows.length < 1) return;

        let headers = rows[0].map(h => String(h).trim().toLowerCase());
        let isHorizontal = headers.includes('quarterback') || headers.includes('running back');
        let hasNewSos = false;

        if (isHorizontal) {
            let playerRanks = {};
            headers.forEach((h, idx) => {
                let isFlex = (h === 'flex');
                let isPos = ['quarterback', 'running back', 'wide receiver', 'tight end', 'kicker', 'defense'].includes(h);
                
                if (isFlex || isPos) {
                    for (let r = 1; r < rows.length; r++) {
                        let pName = rows[r][idx];
                        let pRank = rows[r][idx - 1];
                        if (pName && pName.trim() && pRank && !isNaN(parseInt(pRank))) {
                            let clean = normalizeName(pName.trim());
                            if (!playerRanks[clean]) playerRanks[clean] = { name: pName.trim(), cleanName: clean, posRank: 999, flexRank: 999, rank: 999 };
                            if (isFlex) { playerRanks[clean].flexRank = parseInt(pRank); playerRanks[clean].rank = parseInt(pRank); } 
                            else { playerRanks[clean].posRank = parseInt(pRank); playerRanks[clean].rank = parseInt(pRank); }
                        }
                    }
                }
            });
            parsed = Object.values(playerRanks);
        } else {
            let nameColIdx = -1; 
            let sosColIdx = headers.findIndex(h => h === 'sos' || h === 'schedule' || h === 'matchup');
            let teamColIdx = headers.findIndex(h => h === 'team' || h === 'tm');
            let posColIdx = headers.findIndex(h => h === 'pos' || h === 'position');
            
            let hasHeaders = headers.some(h => h === 'player' || h === 'name' || h === 'player name');
            let rankColIdx = hasHeaders ? headers.findIndex(h => h === 'rank' || h === 'overall' || h === 'pos rank' || h === 'tier') : (!isNaN(parseInt(rows[0][0])) ? 0 : -1);
            nameColIdx = hasHeaders ? headers.findIndex(h => h === 'player' || h === 'name' || h === 'player name') : (!isNaN(parseInt(rows[0][0])) ? 1 : 0);

            let startIndex = hasHeaders ? 1 : 0;
            for (let i = startIndex; i < rows.length; i++) {
                let nameStr = rows[i][nameColIdx];
                if (nameStr && nameStr.trim()) {
                    let rankVal = (rankColIdx !== -1 && rows[i][rankColIdx]) ? parseInt(rows[i][rankColIdx]) : (i + 1 - startIndex);
                    if (isNaN(rankVal)) rankVal = i + 1 - startIndex;
                    parsed.push({ name: nameStr.trim(), cleanName: normalizeName(nameStr.trim()), rank: rankVal, posRank: rankVal, flexRank: rankVal });
                    
                    if (sosColIdx !== -1 && teamColIdx !== -1 && posColIdx !== -1) {
                        let teamStr = rows[i][teamColIdx] ? rows[i][teamColIdx].toString().trim().toUpperCase() : "";
                        let posStr = rows[i][posColIdx] ? rows[i][posColIdx].toString().trim().toUpperCase() : "";
                        let sosVal = rows[i][sosColIdx] ? rows[i][sosColIdx].toString().replace(/[^0-9]/g, '') : "";

                        if (teamStr && posStr && sosVal && NFL_TEAMS.includes(teamStr)) {
                            let posGroup = posStr.includes('QB') ? 'QB' : posStr.includes('RB') ? 'RB' : posStr.includes('WR') ? 'WR' : posStr.includes('TE') ? 'TE' : null;
                            if (posGroup) {
                                if (!State.sosMap[teamStr]) State.sosMap[teamStr] = {};
                                State.sosMap[teamStr][posGroup] = sosVal;
                                hasNewSos = true;
                            }
                        }
                    }
                }
            }
        }

        if (isWeekly) { 
            State.weeklyRankings = parsed; 
            localStorage.setItem('mds_season_weekly', JSON.stringify(State.weeklyRankings)); 
        } else { 
            State.rosRankings = parsed; 
            localStorage.setItem('mds_season_ros', JSON.stringify(State.rosRankings)); 
        }
        saveActiveLeagueState();
        updateRankingsMetaDisplay();
        
        if (hasNewSos) {
            localStorage.setItem('mds_season_sos', JSON.stringify(State.sosMap));
            generateSoSGrid();
        }
        
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') window.optimizeLineup(true);
        if (activeTab === 'rosterTab') loadRosterTab();
        
        let msgEl = document.getElementById(successMsgId);
        if (msgEl) {
            msgEl.style.display = 'block'; 
            setTimeout(() => msgEl.style.display = 'none', 2500);
        }
    }

    const rosFileEl = document.getElementById('rosFileInput');
    const weeklyFileEl = document.getElementById('weeklyFileInput');
    if (rosFileEl) rosFileEl.addEventListener('change', () => processRankingsUpload('rosFileInput', false, 'rosSuccessMsg'));
    if (weeklyFileEl) weeklyFileEl.addEventListener('change', () => processRankingsUpload('weeklyFileInput', true, 'weeklySuccessMsg'));
// --- MARKET DISCONNECT ENGINE ---
    const marketFileEl = document.getElementById('marketFileInput');
    if (marketFileEl) {
        marketFileEl.addEventListener('change', () => processMarketUpload('marketFileInput', 'marketSuccessMsg'));
    }

    window.toggleDisconnectMode = function() {
        const mode = document.getElementById('disconnectMode')?.value;
        const label = document.getElementById('thresholdLabel');
        const input = document.getElementById('disconnectThreshold');
        if (!label || !input) return;

        if (mode === 'percent') {
            label.innerText = "Min Percentage Shift (%)";
            input.value = "20";
        } else {
            label.innerText = "Minimum Rank Gap";
            input.value = "10";
        }
    };

    function processMarketUpload(fileInputId, successMsgId) {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || !fileInput.files[0]) return;
        const file = fileInput.files[0];

        const filename = file.name.toLowerCase();
        if (filename.endsWith('.csv')) {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: results => parseMarketData(results.data, successMsgId) });
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            loadSheetJS(() => {            
            const reader = new FileReader();
            reader.onload = e => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
                Papa.parse(csvStr, { header: true, skipEmptyLines: true, complete: results => parseMarketData(results.data, successMsgId) });
            };
            reader.readAsArrayBuffer(file);
            });
        } else {
            window.alert("Unsupported file format. Please upload a .csv or .xlsx file.");
        }
    }
    window.fetchLeagueLogsADP = async function(btn) {
    const outputEl = document.getElementById('marketDisconnectOutput');
    const msgEl = document.getElementById('marketSuccessMsg');
    
    const sourceSelect = document.getElementById('marketSourceSelect');
    if (!sourceSelect) return;
    const source = sourceSelect.value;
    
    const origText = btn.innerText;
    btn.innerText = "Fetching...";
    btn.style.opacity = "0.7";
    btn.disabled = true;

    try {
        let parsed = [];
        let formatText = "";

        // Common settings extracted from dropdowns
        const isDynastyVal = document.getElementById('marketType')?.value || 'redraft';
        const numQbsVal = document.getElementById('marketQbs')?.value || '1';
        const isDynastyBool = isDynastyVal === 'dynasty';

        // --- 1. FANTASYCALC ---
        if (source === 'fantasycalc') {
            const ppr = document.getElementById('marketPpr')?.value || '1';
            const isTEP = document.getElementById('marketTep')?.checked ? 'true' : 'false';

            // Pull team count from active league settings if available, default to 12
            let teamCount = (typeof getActiveLeague === 'function' && getActiveLeague()?.settings?.teams) || 12;

            const fcRes = await fetch(`https://api.fantasycalc.com/values/current?isDynasty=${isDynastyBool}&numQbs=${numQbsVal}&numTeams=${teamCount}&ppr=${ppr}&isTEP=${isTEP}`);
            if (!fcRes.ok) throw new Error(`FantasyCalc API Error: ${fcRes.status}`);
            const fcData = await fcRes.json();

            fcData.forEach(item => {
                if (item.player && item.player.name) {
                    let fullName = item.player.name;
                    let rankVal = parseFloat(item.overallRank);

                    if (!isNaN(rankVal)) {
                        parsed.push({
                            name: fullName,
                            cleanName: normalizeName(fullName),
                            marketVal: rankVal
                        });
                    }
                }
            });
            formatText = `${isDynastyVal.toUpperCase()} (${numQbsVal === '2' ? 'Superflex' : '1QB'}, PPR: ${ppr})`;
        } 
        
        // --- 2. LEAGUELOGS ---
        else if (source === 'leaguelogs') {
            // Map common selections to LeagueLogs profile keys
            let pprKey = "ppr1";
            let qbKey = numQbsVal === '2' ? '2qb' : '1qb';
            let typeKey = isDynastyVal; // 'redraft' or 'dynasty'
            let profileKey = `${typeKey}-${qbKey}-12t-${pprKey}`;
            
            formatText = `${typeKey.toUpperCase()} - ${qbKey.toUpperCase()} (PPR)`;

            // Fetch Sleeper DB for name mapping
            let sleeperMap = {};
            let sleeperRes = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (sleeperRes.ok) {
                sleeperMap = await sleeperRes.json();
            }

            const marketRes = await fetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();

            llMarket.data.forEach(item => {
                let sId = item.sleeperPlayerId;
                let sp = sleeperMap[sId];
                if (!sp || !sp.first_name) return; 

                let fullName = `${sp.first_name} ${sp.last_name}`;
                let rankVal = parseFloat(item.overallRank);

                if (!isNaN(rankVal)) {
                    parsed.push({
                        name: fullName,
                        cleanName: normalizeName(fullName),
                        marketVal: rankVal
                    });
                }
            });
        }

        // Save to state and local storage
        State.marketRankings = parsed;
        localStorage.setItem('mls_season_market', JSON.stringify(State.marketRankings));
        
        // Update UI
        updateMarketMetaDisplay(); 
        if (msgEl) {
            msgEl.innerText = `Market Data (${formatText}) Pulled Successfully!`;
            msgEl.style.display = 'block';
            setTimeout(() => msgEl.style.display = 'none', 3500);
        }
        
        if (outputEl) outputEl.innerHTML = ''; 

    } catch (error) {
        console.error("Error fetching market data:", error);
        window.alert(`Could not pull live market data.\n\n${error.message}`);
    } finally {
        btn.innerText = origText;
        btn.style.opacity = "1";
        btn.disabled = false;
    }
};
// --- UI TOGGLE HELPER FOR MARKET SOURCE ---
window.toggleMarketSourceUI = function() {
    const source = document.getElementById('marketSourceSelect')?.value;
    const fcControls = document.getElementById('fantasycalcSpecificControls');
    const brandEl = document.getElementById('attributionBrand');
    const attrLink = document.getElementById('attributionLink');

    if (source === 'fantasycalc') {
        if (fcControls) fcControls.style.display = 'block';
        if (brandEl) brandEl.innerText = "FantasyCalc";
        if (attrLink) attrLink.href = "https://fantasycalc.com";
    } else {
        // LeagueLogs doesn't use PPR dropdown or TEP toggle directly, so hide them
        if (fcControls) fcControls.style.display = 'none';
        if (brandEl) brandEl.innerText = "LeagueLogs";
        if (attrLink) attrLink.href = "https://leaguelogs.com";
    }
};
    function parseMarketData(rows, successMsgId) {
        let parsed = [];
        if (rows.length < 1) return;

        // Automatically detect KTC / FantasyCalc column headers (prioritizing overall rank over value)
        let sample = rows[0];
        let nameKey = Object.keys(sample).find(k => /player|name/i.test(k));
        let rankKey = Object.keys(sample).find(k => /overall[_\s]?rank/i.test(k)) ||
                      Object.keys(sample).find(k => /^rank$/i.test(k)) ||
                      Object.keys(sample).find(k => /overall/i.test(k) && !/value/i.test(k));

        if (!nameKey || !rankKey) {
            window.alert("Could not automatically detect 'Player' and 'Overall Rank' columns in your market file.");
            return;
        }

        rows.forEach((row, idx) => {
            let nameStr = row[nameKey];
            let valStr = row[rankKey] ? String(row[rankKey]).replace(/[^0-9.]/g, '') : "";
            if (nameStr && nameStr.trim() && valStr) {
                let numVal = parseFloat(valStr);
                parsed.push({
                    name: nameStr.trim(),
                    cleanName: normalizeName(nameStr.trim()),
                    marketVal: numVal // Represents the player's overall market rank
                });
            }
        });

        State.marketRankings = parsed;
        localStorage.setItem('mds_season_market', JSON.stringify(State.marketRankings));
        updateMarketMetaDisplay();

        let msgEl = document.getElementById(successMsgId);
        if (msgEl) {
            msgEl.style.display = 'block';
            setTimeout(() => msgEl.style.display = 'none', 2500);
        }
    }

    function updateMarketMetaDisplay() {
        const metaEl = document.getElementById('marketMetaDisplay');
        if (metaEl) {
            if (State.marketRankings.length > 0) {
                metaEl.style.display = 'block';
                metaEl.innerText = `Market Consensus Loaded: ${State.marketRankings.length} players`;
            } else {
                metaEl.style.display = 'none';
            }
        }
    }

    window.runMarketDisconnectAnalysis = function() {
        const outputEl = document.getElementById('marketDisconnectOutput');
        if (!outputEl) return;

        if (State.marketRankings.length === 0) {
            outputEl.innerHTML = `<span style="color:var(--error-color, #fca5a5);">Please upload a market consensus file (KTC/FantasyCalc) first.</span>`;
            return;
        }
        if (State.rosRankings.length === 0) {
            outputEl.innerHTML = `<span style="color:var(--error-color, #fca5a5);">Please upload your Rest-of-Season (ROS) rankings on the Roster tab first.</span>`;
            return;
        }

        const mode = document.getElementById('disconnectMode')?.value || 'flat';
        const threshold = parseFloat(document.getElementById('disconnectThreshold')?.value) || 10;

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};

        let analysisList = [];

        State.marketRankings.forEach(m => {
            let userObj = State.rosRankings.find(r => r.cleanName === m.cleanName);
            if (!userObj) return; // Skip if user didn't rank this player

            let userRank = userObj.rank;
            let marketVal = m.marketVal;

            let delta = 0;
            let isSignificant = false;

            // Corrected sign convention: Market Rank - User Rank
            // Positive delta = User ranks them HIGHER/BETTER than market (Buy target)
            // Negative delta = User ranks them LOWER/WORSE than market (Sell candidate)
            let diff = marketVal - userRank; 

            if (mode === 'flat') {
                delta = diff; 
                isSignificant = Math.abs(delta) >= threshold;
            } else {
                // Percentage shift calculation based on consistent rank difference
                let pct = (Math.abs(diff) / marketVal) * 100;
                delta = diff;
                isSignificant = pct >= threshold;
            }

            if (isSignificant) {
                let tradeType = delta > 0 ? 'BUY' : 'SELL';
                let owner = rosterMap[userObj.cleanName];

                // For SELL opportunities, ensure the player is actually on your roster
                if (tradeType === 'SELL' && owner !== 'You') {
                    return; // Skip if you don't own them
                }

                // For BUY opportunities, ensure the player is NOT already on your roster
                if (tradeType === 'BUY' && owner === 'You') {
                    return; // Skip if you already own them
                }

                analysisList.push({
                    name: userObj.name,
                    cleanName: userObj.cleanName,
                    userRank: userRank,
                    marketVal: marketVal,
                    delta: delta,
                    type: tradeType,
                    owner: owner
                });
            }
        });

        // Sort by magnitude of disconnect
        analysisList.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        if (analysisList.length === 0) {
            outputEl.innerHTML = `<div class="scout-result-card" style="justify-content:center; color:var(--text-muted);">No significant market disconnects found matching your threshold. Try adjusting the filter limit.</div>`;
            return;
        }

        let html = "";
        let buyItems = analysisList.filter(x => x.type === 'BUY');
        let sellItems = analysisList.filter(x => x.type === 'SELL');

        if (buyItems.length > 0) {
            html += `<div style="font-weight:bold; color:var(--primary-green); margin: 0.75rem 0 0.5rem 0;">🟢 High-Value Targets (Market Sleeping)</div>`;
            buyItems.forEach(item => {
                let ownerStr = item.owner === "You" ? `<span style="color:#60a5fa;">On your roster</span>` : (item.owner ? `Rostered by: ${item.owner}` : `<span style="color:var(--primary-green);">Free Agent</span>`);
                html += `
                <div class="scout-result-card">
                    <div>
                        <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px;">${item.name}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:0.8rem;">
                            <span>Your Board: <strong style="color:#86efac;">#${item.userRank}</strong></span>
                            <span>Market: <strong style="color:#93c5fd;">#${item.marketVal}</strong></span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span class="badge" style="background:var(--target-bg); color:var(--primary-green); border:1px solid var(--target-border);">+${item.delta} Edge</span>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${ownerStr}</div>
                    </div>
                </div>`;
            });
        }

        if (sellItems.length > 0) {
            html += `<div style="font-weight:bold; color:#fca5a5; margin: 1.25rem 0 0.5rem 0;">🔴 Overvalued Assets (Sell High Opportunities)</div>`;
            sellItems.forEach(item => {
                html += `
                <div class="scout-result-card">
                    <div>
                        <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px;">${item.name}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:0.8rem;">
                            <span>Your Board: <strong style="color:#fca5a5;">#${item.userRank}</strong></span>
                            <span>Market: <strong style="color:#93c5fd;">#${item.marketVal}</strong></span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${item.delta} Edge</span>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;"><strong style="color:#fca5a5;">On your roster (Sell High!)</strong></div>
                    </div>
                </div>`;
            });
        }

        outputEl.innerHTML = html;
    };
    // --- SCREENSHOT EXPORT ---
    window.exportLineup = async function() {
    if (typeof html2canvas === 'undefined') { 
        window.alert("Screenshot library loading. Please try again in a moment."); 
        return; 
    }
    
    const container = document.getElementById('optimalLineupContainer');
    const exportBtn = document.getElementById('exportBtn');
    if (!container || !exportBtn) return;

    const origText = exportBtn.innerText;
    exportBtn.innerText = "Capturing...";
    
    const buttons = container.querySelectorAll('.swap-btn, .lock-btn');
    buttons.forEach(b => b.style.display = 'none');
    
    try {
        const canvas = await html2canvas(container, { 
            backgroundColor: '#1c2541', 
            scale: 2,
            onclone: (clonedDoc) => {
                const clonedContainer = clonedDoc.getElementById('optimalLineupContainer');
                if (clonedContainer) {
                    clonedContainer.style.width = '480px';
                    clonedContainer.style.maxWidth = '100%';
                    clonedContainer.style.margin = '0 auto';
                    clonedContainer.style.padding = '1rem';
                    clonedContainer.style.borderRadius = '8px';
                    clonedContainer.style.background = '#1c2541';
                    clonedContainer.style.boxSizing = 'border-box';
                }
            }
        });

        const link = document.createElement('a');
        link.download = `My_Lineup_Strategist.png`; 
        link.href = canvas.toDataURL('image/png'); 
        link.click();
    } catch (err) {
        console.error("Export failed:", err); 
        window.alert("Export failed. Please try again.");
    } finally {
        buttons.forEach(b => b.style.display = 'inline-block');
        exportBtn.innerText = origText;
    }
};

    // --- RENDERERS ---
    function loadRosterTab() {
        let league = getActiveLeague();
        const syncBtn = document.getElementById('rosterSyncBtn');
        if (syncBtn) {
            if (league && league.leagueId && !league.leagueId.startsWith('manual_') && league.username) syncBtn.style.display = 'block';
            else syncBtn.style.display = 'none';
        }

        const rosterListEl = document.getElementById('rosterList');
        if (!rosterListEl) return;

        if (!league || !league.roster || league.roster.length === 0) {
            rosterListEl.innerHTML = "Select or create a league on the Setup tab to view your roster.";
            return;
        }
        
        let displayRoster = league.roster.map(p => {
            let rObj = State.rosRankings.find(rk => rk.cleanName === p.cleanName);
            return { ...p, rosRank: rObj ? rObj.rank : 999 };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        displayRoster.sort((a, b) => {
            if (a.rosRank !== 999 || b.rosRank !== 999) return a.rosRank - b.rosRank;
            return (posOrder[a.pos] || 99) - (posOrder[b.pos] || 99);
        });

        let html = "";
        displayRoster.forEach(p => {
            let rankBadge = p.rosRank !== 999 ? `ROS Rank: ${p.rosRank}` : "Unranked";
            let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
            let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";
            let sosBadge = getSoSBadgeHTML(p.team, p.pos);
            
            html += `
            <div class="roster-item">
                <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden;">
                    <span class="badge pos-badge ${p.pos}" style="min-width:26px; padding:2px 4px; text-align:center;">${p.pos}</span>
                    <div style="display:flex; flex-direction:column; align-items:flex-start; text-align:left;">
                        <div class="player-name-wrap">${p.name}${byeStr} ${injBadge}</div>
                        <div style="margin-top:3px; display:flex; align-items:center; gap:0.3rem; flex-wrap:wrap;">
                            <span class="badge">${p.team}</span>
                            <span class="badge" style="background:#1c2541; border:1px solid var(--border);">${rankBadge}</span>
                            ${sosBadge}
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.3rem; flex-shrink:0;">
                    <button class="btn-danger" style="padding:4px 8px; border-radius:4px;" onclick="deletePlayer('${p.id}')">✕</button>
                </div>
            </div>`;
        });
        rosterListEl.innerHTML = html;
    }

    window.toggleLock = function(playerId) {
        if (!State.activeLeagueId) return;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        if (locks.includes(playerId)) locks = locks.filter(id => id !== playerId);
        else locks.push(playerId);
        
        State.lockedPlayersMap[State.activeLeagueId] = locks;
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));
        
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        starters.forEach(s => { if (s.player && s.player.id === playerId) s.player.isLocked = locks.includes(playerId); });
        bench.forEach(p => { if (p.id === playerId) p.isLocked = locks.includes(playerId); });
        
        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = bench;
        if (typeof window.showToast === 'function') window.showToast("${p.name} is locked");
        renderLineupUI();
    };

    window.initiateSwap = function(playerId) {
        if (State.swapSourceId === null) { State.swapSourceId = playerId; } 
        else if (State.swapSourceId === playerId) { State.swapSourceId = null; } 
        else {
            let starters = State.manualStartersMap[State.activeLeagueId] || [];
            let bench = State.manualBenchMap[State.activeLeagueId] || [];
            let p1StarterIdx = starters.findIndex(s => s.player && s.player.id === State.swapSourceId);
            let p1BenchIdx = bench.findIndex(p => p.id === State.swapSourceId);
            let p2StarterIdx = starters.findIndex(s => s.player && s.player.id === playerId);
            let p2BenchIdx = bench.findIndex(p => p.id === playerId);

            let p1Obj = (p1StarterIdx !== -1) ? starters[p1StarterIdx].player : bench[p1BenchIdx];
            let p2Obj = (p2StarterIdx !== -1) ? starters[p2StarterIdx].player : bench[p2BenchIdx];

            if (p1StarterIdx !== -1 && p2StarterIdx !== -1) { starters[p1StarterIdx].player = p2Obj; starters[p2StarterIdx].player = p1Obj; } 
            else if (p1StarterIdx !== -1 && p2BenchIdx !== -1) { starters[p1StarterIdx].player = p2Obj; bench[p2BenchIdx] = p1Obj; }
            else if (p1BenchIdx !== -1 && p2StarterIdx !== -1) { starters[p2StarterIdx].player = p1Obj; bench[p1BenchIdx] = p2Obj; }
            else if (p1BenchIdx !== -1 && p2BenchIdx !== -1) { bench[p1BenchIdx] = p2Obj; bench[p2BenchIdx] = p1Obj; }

            State.manualStartersMap[State.activeLeagueId] = starters;
            State.manualBenchMap[State.activeLeagueId] = bench;
            localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
            localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
            State.swapSourceId = null;
        }
        renderLineupUI();
    };

    window.optimizeLineup = function(forceReset = true) {
        let league = getActiveLeague();
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');

        if (!league || !league.roster || league.roster.length === 0) {
            if (container) container.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Please select and sync a league first.</div>`;
            if (benchContainer) benchContainer.innerHTML = "No bench data."; 
            return;
        }

        if (!forceReset && State.manualStartersMap[State.activeLeagueId] && State.manualBenchMap[State.activeLeagueId]) {
            renderLineupUI(); 
            return;
        }

        let activeDataSet = State.weeklyRankings.length > 0 ? State.weeklyRankings : State.rosRankings;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };

        let scoredRoster = league.roster.map(p => {
            let rObj = activeDataSet.find(rk => rk.cleanName === p.cleanName);
            return { ...p, posRank: rObj ? rObj.posRank : 999, flexRank: rObj ? rObj.flexRank : 999, isLocked: locks.includes(p.id) };
        });

        let pool = [...scoredRoster];
        let starters = [];

        const fillSlot = (slotLabel, posFilter, useFlexRank) => {
            pool.sort((a, b) => {
                if (useFlexRank) {
                    if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
                    if (a.flexRank !== 999 && b.flexRank === 999) return -1;
                    if (a.flexRank === 999 && b.flexRank !== 999) return 1;
                    return a.posRank - b.posRank;
                } else { return a.posRank - b.posRank; }
            });

            let lockedIndex = pool.findIndex(p => p.isLocked && posFilter(p.pos));
            if (lockedIndex !== -1) { starters.push({ slot: slotLabel, player: pool.splice(lockedIndex, 1)[0], usedFlex: useFlexRank }); return; }

            let bestIndex = pool.findIndex(p => posFilter(p.pos));
            if (bestIndex !== -1) starters.push({ slot: slotLabel, player: pool.splice(bestIndex, 1)[0], usedFlex: useFlexRank });
            else starters.push({ slot: slotLabel, player: null, usedFlex: useFlexRank });
        };

        for (let i = 0; i < reqs.QB; i++) fillSlot(`QB${i+1}`, pos => pos === 'QB', false);
        for (let i = 0; i < reqs.RB; i++) fillSlot(`RB${i+1}`, pos => pos === 'RB', false);
        for (let i = 0; i < reqs.WR; i++) fillSlot(`WR${i+1}`, pos => pos === 'WR', false);
        for (let i = 0; i < reqs.TE; i++) fillSlot(`TE${i+1}`, pos => pos === 'TE', false);
        for (let i = 0; i < reqs.FLEX; i++) fillSlot(`FLEX${i+1}`, pos => ['RB', 'WR', 'TE'].includes(pos), true);
        
        for (let i = 0; i < reqs.SFLEX; i++) {
            let slotLabel = `SFLEX${i+1}`;
            let lockedIndex = pool.findIndex(p => p.isLocked && ['QB', 'RB', 'WR', 'TE'].includes(p.pos));
            if (lockedIndex !== -1) { starters.push({ slot: slotLabel, player: pool.splice(lockedIndex, 1)[0], usedFlex: !['QB'].includes(pool[lockedIndex]?.pos) }); continue; }

            let bestQBIdx = pool.findIndex(p => p.pos === 'QB' && p.posRank !== 999);
            if (bestQBIdx !== -1) {
                let highest = -1; let maxRk = 9999;
                pool.forEach((p, idx) => { if (p.pos === 'QB' && p.posRank < maxRk) { maxRk = p.posRank; highest = idx; } });
                starters.push({ slot: slotLabel, player: pool.splice(highest, 1)[0], usedFlex: false });
            } else {
                let bestFlexIdx = -1; let maxFlexRk = 9999;
                pool.forEach((p, idx) => { if (['RB', 'WR', 'TE'].includes(p.pos) && p.flexRank < maxFlexRk) { maxFlexRk = p.flexRank; bestFlexIdx = idx; } });
                if (bestFlexIdx !== -1 && maxFlexRk !== 999) { starters.push({ slot: slotLabel, player: pool.splice(bestFlexIdx, 1)[0], usedFlex: true }); } 
                else {
                    let bestPosIdx = -1; let maxPosRk = 9999;
                    pool.forEach((p, idx) => { if (['RB', 'WR', 'TE'].includes(p.pos) && p.posRank < maxPosRk) { maxPosRk = p.posRank; bestPosIdx = idx; } });
                    if (bestPosIdx !== -1) starters.push({ slot: slotLabel, player: pool.splice(bestPosIdx, 1)[0], usedFlex: false });
                    else starters.push({ slot: slotLabel, player: null, usedFlex: false });
                }
            }
        }

        pool.sort((a, b) => {
            if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
            if (a.flexRank !== 999 && b.flexRank === 999) return -1;
            if (a.flexRank === 999 && b.flexRank !== 999) return 1;
            return a.posRank - b.posRank;
        });

        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = pool;
        
        localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
        localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
        if (typeof window.showToast === 'function') window.showToast("Optimal lineup set");
        renderLineupUI();
    };

    function renderLineupUI() {
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');
        if (!container || !benchContainer) return;
        
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let benchPool = State.manualBenchMap[State.activeLeagueId] || [];

        let html = "";
        starters.forEach(s => {
            let slotType = s.slot.replace(/[0-9]/g, '');

            if (s.player) {
                let p = s.player;
                let lockIcon = p.isLocked 
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary-green);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` 
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); opacity: 0.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
                let lockClass = p.isLocked ? "locked" : "";
                if (State.swapSourceId === p.id) lockClass += " swapping";

                let displayRank = s.usedFlex && p.flexRank !== 999 ? p.flexRank : p.posRank;
                let rankLabel = s.usedFlex && p.flexRank !== 999 ? "Flex Rk" : "Pos Rk";
                let rankBadge = displayRank !== 999 ? `${rankLabel}: ${displayRank}` : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";

                html += `
                <div class="lineup-slot ${lockClass}">
                    <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden;">
                        <span class="slot-label slot-${slotType}">${s.slot}</span>
                        <span class="badge pos-badge ${p.pos}" style="min-width:26px; padding:2px 4px; text-align:center;">${p.pos}</span>
                        <div style="display:flex; flex-direction:column; align-items:flex-start; text-align:left;">
                            <div class="player-name-wrap">${p.name}${byeStr} ${injBadge} ${earlyTag}</div>
                            <div style="margin-top:3px; display:flex; align-items:center; gap:0.3rem; flex-wrap:wrap;">
                                <span class="badge">${p.team}</span>
                                <span class="badge" style="background:#1c2541; border:1px solid var(--border);">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.3rem; flex-shrink:0;">
                        <button class="btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                        <button class="btn-sm lock-btn" style="background:none; cursor:pointer; padding:0 4px;" onclick="toggleLock('${p.id}')">${lockIcon}</button>
                    </div>
                </div>`;
            } else {
                html += `
                <div class="lineup-slot empty">
                    <span class="slot-label slot-${slotType}">${s.slot}</span>
                    <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                </div>`;
            }
        });
        container.innerHTML = html;

        let benchHTML = "";
        if (benchPool.length > 0) {
            benchContainer.classList.remove('bench-empty-state');
            benchPool.forEach(p => {
                let lockClass = State.swapSourceId === p.id ? "swapping" : "";
                let displayRank = p.flexRank !== 999 ? p.flexRank : p.posRank;
                let rankLabel = p.flexRank !== 999 ? "Flex Rk" : "Pos Rk";
                let rankBadge = displayRank !== 999 ? `${rankLabel}: ${displayRank}` : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";

                benchHTML += `
                <div class="lineup-slot ${lockClass}">
                    <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden;">
                        <span class="slot-label slot-BN">BN</span>
                        <span class="badge pos-badge ${p.pos}" style="min-width:26px; padding:2px 4px; text-align:center;">${p.pos}</span>
                        <div style="display:flex; flex-direction:column; align-items:flex-start; text-align:left;">
                            <div class="player-name-wrap">${p.name}${byeStr} ${injBadge} ${earlyTag}</div>
                            <div style="margin-top:3px; display:flex; align-items:center; gap:0.3rem; flex-wrap:wrap;">
                                <span class="badge">${p.team}</span>
                                <span class="badge" style="background:#1c2541; border:1px solid var(--border);">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.3rem; flex-shrink:0;">
                        <button class="btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                    </div>
                </div>`;
            });
        } else { 
            benchContainer.classList.add('bench-empty-state');
            benchHTML = "No bench players."; 
        }
        benchContainer.innerHTML = benchHTML;
    }
    // --- AUTO-LOAD SHARED LEAGUE ID FROM MDS ---
document.addEventListener('DOMContentLoaded', () => {
    const sharedLeagueId = localStorage.getItem('shared_sleeper_league_id');
    
    const mlsLeagueInput = document.getElementById('sleeperLeagueId'); 
    
    if (sharedLeagueId && mlsLeagueInput && !mlsLeagueInput.value) {
        mlsLeagueInput.value = sharedLeagueId;
        
        // Optional: If you want it to auto-trigger the sync button right away, uncomment the lines below
        const syncBtn = document.getElementById('syncSleeperBtn');
        if (syncBtn) syncBtn.click();
    }
});
// --- AUTO-LOAD SHARED LEAGUE ID FROM MDS ---
(function autoLoadLeagueId() {
    const sharedLeagueId = localStorage.getItem('shared_sleeper_league_id');
    const mlsLeagueInput = document.getElementById('sleeperLeagueId'); 
    
    if (sharedLeagueId && mlsLeagueInput && !mlsLeagueInput.value) {
        mlsLeagueInput.value = sharedLeagueId;
    }
})();
// --- POWER-USER KEYBOARD SHORTCUTS (MLS) ---
document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
    
    if (isInputActive) return;

    switch(e.key) {
        case '1': if (typeof window.showTab === 'function') window.showTab('setup'); break;
        case '2': if (typeof window.showTab === 'function') window.showTab('roster'); break;
        case '3': if (typeof window.showTab === 'function') window.showTab('lineup'); break;
        case '4': if (typeof window.showTab === 'function') window.showTab('scout'); break;
        case '5': if (typeof window.showTab === 'function') window.showTab('guide'); break;
    }
});
})();
// Add this helper function at the bottom of mls.js
function loadSheetJS(callback) {
    if (typeof XLSX !== 'undefined') {
        callback();
    } else {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = callback;
        document.head.appendChild(script);
    }
}