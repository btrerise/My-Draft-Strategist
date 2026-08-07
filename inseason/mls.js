    // NFL Teams List & Bye Week Dictionary
    const nflTeams = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];
    
    // Users can easily update this mapping each season
    const teamByes = {
        "ARI": 11, "ATL": 12, "BAL": 14, "BUF": 12, "CAR": 11, "CHI": 7, "CIN": 12, "CLE": 10,
        "DAL": 7, "DEN": 14, "DET": 5, "GB": 10, "HOU": 14, "IND": 14, "JAX": 12, "KC": 6,
        "LAC": 5, "LAR": 6, "LV": 10, "MIA": 6, "MIN": 6, "NE": 14, "NO": 12, "NYG": 11,
        "NYJ": 12, "PHI": 5, "PIT": 9, "SEA": 10, "SF": 9, "TB": 11, "TEN": 5, "WAS": 14
    };

    // --- STATE MANAGEMENT ---
    let leagues = JSON.parse(localStorage.getItem('mds_season_leagues')) || [];
    let activeLeagueId = localStorage.getItem('mds_season_active_league') || null;
    let earlyTeams = JSON.parse(localStorage.getItem('mds_season_early_teams')) || [];
    
    let rosRankings = JSON.parse(localStorage.getItem('mds_season_ros')) || [];
    let weeklyRankings = JSON.parse(localStorage.getItem('mds_season_weekly')) || [];
    let sosMap = JSON.parse(localStorage.getItem('mds_season_sos')) || {};
    let lockedPlayersMap = JSON.parse(localStorage.getItem('mds_season_locks_map')) || {};
    
    // Manual Lineup Layout Override State
    let manualStartersMap = JSON.parse(localStorage.getItem('mds_season_manual_starters')) || {};
    let manualBenchMap = JSON.parse(localStorage.getItem('mds_season_manual_bench')) || {};
    let swapSourceId = null;

    function normalizeName(name) {
        if (!name) return "";
        let n = String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, '').replace(/(jr|sr|iii|ii|iv|v)$/, ''); 
        const aliasMap = {
            'kennygainwell': 'kennethgainwell', 'gabedavis': 'gabrieldavis', 'joshpalmer': 'joshuapalmer', 
            'mitchtrubisky': 'mitchelltrubisky', 'tankdell': 'nathanieldell', 'hollywoodbrown': 'marquisebrown',
            'scottymiller': 'scottmiller', 'djchark': 'djcharkjr', 'jeffwilson': 'jefferywilson',
            'nicholassingleton': 'nicksingleton', 'kennethwalker': 'kenwalker'
        };
        return aliasMap[n] || n;
    }

    // --- DRAWER & SWIPE LOGIC ---
    function toggleDrawer() {
        const drawer = document.getElementById('drawer');
        const overlay = document.getElementById('drawerOverlay');
        drawer.classList.toggle('open');
        overlay.style.display = drawer.classList.contains('open') ? 'block' : 'none';
    }

    function navigateFromDrawer(tabId) {
        document.querySelectorAll('.hamburger-menu .nav-btn').forEach(l => l.classList.remove('active-link'));
        const targetBtn = document.querySelector(`.hamburger-menu .nav-btn[data-drawer-target="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active-link');
        
        toggleDrawer();
        showTab(tabId);
    }

    let touchStartX = 0; let touchEndX = 0;
    document.getElementById('mainApp').addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    document.getElementById('mainApp').addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, {passive: true});

    function handleSwipe() {
        const swipeThreshold = 120; 
        const activeTabBtn = document.querySelector('.nav-bar .nav-btn.active');
        if (!activeTabBtn) return;
        
        const tabs = ['roster', 'lineup', 'scout'];
        const currentIdx = tabs.indexOf(activeTabBtn.getAttribute('data-target'));
        
        if (touchEndX < touchStartX - swipeThreshold) {
            if (currentIdx < tabs.length - 1) {
                showTab(tabs[currentIdx + 1]);
                updateDrawerActiveState(tabs[currentIdx + 1]);
            }
        }
        if (touchEndX > touchStartX + swipeThreshold) {
            if (currentIdx > 0) {
                showTab(tabs[currentIdx - 1]);
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
    function showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(tabId + 'Tab').classList.add('active');
        document.querySelectorAll('.nav-bar .nav-btn').forEach(b => b.classList.remove('active'));
        
        const activeNavBtn = document.querySelector(`.nav-bar .nav-btn[data-target="${tabId}"]`);
        if (activeNavBtn) activeNavBtn.classList.add('active');
        
        if (tabId === 'lineup') optimizeLineup(false);
        if (tabId === 'roster') loadRosterTab();
        if (tabId === 'setup') refreshLeagueDropdown();
        window.scrollTo(0, 0);
    }
    
    function factoryReset() {
        if (confirm("⚠️ DANGER ZONE ⚠️\n\nAre you absolutely sure you want to clear ALL leagues, cached rankings, custom SoS data, and settings?\n\nThis cannot be undone.")) {
            localStorage.clear();
            location.reload();
        }
    }

    // --- INITIALIZATION ---
    window.onload = function() {
        populateEarlyGameDropdown();
        refreshLeagueDropdown();
        updateRankingsMetaDisplay();
        generateSoSGrid();

        if (leagues.length > 0 && !activeLeagueId) {
            activeLeagueId = leagues[0].leagueId;
        }
        if (activeLeagueId) {
            document.getElementById('headerLeagueSelect').value = activeLeagueId;
            loadActiveLeagueData();
        }
        showTab('setup'); // Force default load to setup screen
    };

    // --- EARLY GAMES LOGIC ---
    function populateEarlyGameDropdown() {
        const sel = document.getElementById('earlyTeamSelect');
        let html = `<option value="">-- Add an Early Team --</option>`;
        nflTeams.forEach(t => { html += `<option value="${t}">${t}</option>`; });
        sel.innerHTML = html;
        renderEarlyChips();
        checkEarlyBannerVisibility();
    }

    function addEarlyTeam(team) {
        if (!team) return;
        if (!earlyTeams.includes(team)) {
            earlyTeams.push(team);
            localStorage.setItem('mds_season_early_teams', JSON.stringify(earlyTeams));
            renderEarlyChips();
        }
        document.getElementById('earlyTeamSelect').value = "";
        checkEarlyBannerVisibility();
        if (document.querySelector('.tab-content.active').id === 'lineupTab') renderLineupUI();
    }

    function removeEarlyTeam(team) {
        earlyTeams = earlyTeams.filter(t => t !== team);
        localStorage.setItem('mds_season_early_teams', JSON.stringify(earlyTeams));
        renderEarlyChips();
        checkEarlyBannerVisibility();
        if (document.querySelector('.tab-content.active').id === 'lineupTab') renderLineupUI();
    }

    function renderEarlyChips() {
        const container = document.getElementById('earlyTeamChips');
        if (earlyTeams.length === 0) {
            container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">No teams selected.</span>`;
            return;
        }
        let html = "";
        earlyTeams.forEach(t => {
            html += `<div class="team-chip">${t} <span class="close-chip" onclick="removeEarlyTeam('${t}')">✖</span></div>`;
        });
        container.innerHTML = html;
    }

    function checkEarlyBannerVisibility() {
        const banner = document.getElementById('earlyBanner');
        banner.style.display = earlyTeams.length > 0 ? 'block' : 'none';
    }

    function isEarlyPlayer(teamStr) {
        if (!teamStr || teamStr === "FA") return false;
        return earlyTeams.includes(teamStr.toUpperCase());
    }

    // --- LEAGUE & SYNC LOGIC ---
    function refreshLeagueDropdown() {
        const select = document.getElementById('headerLeagueSelect');
        if (leagues.length === 0) {
            select.innerHTML = `<option value="">No Leagues</option>`;
            return;
        }
        let html = "";
        leagues.forEach(l => {
            let sel = l.leagueId === activeLeagueId ? "selected" : "";
            html += `<option value="${l.leagueId}" ${sel}>${l.name}</option>`;
        });
        select.innerHTML = html;
    }

    function switchActiveLeague(leagueId) {
        if (!leagueId) return;
        activeLeagueId = leagueId;
        localStorage.setItem('mds_season_active_league', activeLeagueId);
        loadActiveLeagueData();
        swapSourceId = null;

        const activeTab = document.querySelector('.tab-content.active').id;
        if (activeTab === 'lineupTab') optimizeLineup(false);
        if (activeTab === 'rosterTab') loadRosterTab();
        
        // Auto-refresh Scout tab data on league switch to prevent displaying stale ownership info
        if (document.getElementById('waiverInput').value.trim() !== '') runScout('waiver');
        else document.getElementById('waiverOutput').innerHTML = '';
        
        if (document.getElementById('buyInput').value.trim() !== '' || document.getElementById('sellInput').value.trim() !== '') runScout('trade');
        else document.getElementById('tradeOutput').innerHTML = '';
    }

    function getActiveLeague() {
        return leagues.find(l => l.leagueId === activeLeagueId) || null;
    }

    function loadActiveLeagueData() {
        let league = getActiveLeague();
        if (!league) return;
        
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };
        document.getElementById('reqQB').value = reqs.QB;
        document.getElementById('reqRB').value = reqs.RB;
        document.getElementById('reqWR').value = reqs.WR;
        document.getElementById('reqTE').value = reqs.TE;
        document.getElementById('reqFLEX').value = reqs.FLEX;
        document.getElementById('reqSFLEX').value = reqs.SFLEX;
        document.getElementById('activeLeagueReqTitle').innerText = `(${league.name})`;
        document.getElementById('sleeperUsername').value = league.username !== "Manual" ? league.username : "";
    }

    function saveRequirements(btn) {
        let league = getActiveLeague();
        if (!league) { alert("Please select or add a league first."); return; }
        league.reqs = {
            QB: parseInt(document.getElementById('reqQB').value) || 0,
            RB: parseInt(document.getElementById('reqRB').value) || 0,
            WR: parseInt(document.getElementById('reqWR').value) || 0,
            TE: parseInt(document.getElementById('reqTE').value) || 0,
            FLEX: parseInt(document.getElementById('reqFLEX').value) || 0,
            SFLEX: parseInt(document.getElementById('reqSFLEX').value) || 0
        };
        localStorage.setItem('mds_season_leagues', JSON.stringify(leagues));
        if (btn) { btn.innerText = "✅ Saved!"; setTimeout(() => btn.innerText = "Save Requirements", 2000); }
        optimizeLineup(true);
    }

    function createManualLeague() {
        const name = document.getElementById('newLeagueName').value.trim();
        if (!name) { alert("Please enter a League Name to create a manual league."); return; }

        let newId = 'manual_' + Date.now();
        let leagueObj = {
            leagueId: newId, name: name, username: "Manual",
            reqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0 }, roster: [], globalRosterMap: {}
        };
        leagues.push(leagueObj);
        activeLeagueId = newId;
        localStorage.setItem('mds_season_leagues', JSON.stringify(leagues));
        localStorage.setItem('mds_season_active_league', activeLeagueId);

        document.getElementById('newLeagueName').value = "";
        refreshLeagueDropdown(); loadActiveLeagueData();
        let msgEl = document.getElementById('manualAddMsg');
        msgEl.innerText = `✅ Manual League '${name}' Created!`;
        setTimeout(() => msgEl.innerText = "", 3000);
    }

    function addManualPlayer() {
        let league = getActiveLeague();
        if (!league) { alert("Please add or select a league first."); return; }
        const name = document.getElementById('manualName').value.trim();
        const pos = document.getElementById('manualPos').value;
        const team = document.getElementById('manualTeam').value.trim().toUpperCase() || "FA";

        if (!name) { alert("Please enter a player name."); return; }

        let newP = { id: 'p_' + Date.now(), name: name, cleanName: normalizeName(name), pos: pos, team: team };
        league.roster = league.roster || [];
        league.roster.push(newP);
        
        league.globalRosterMap = league.globalRosterMap || {};
        league.globalRosterMap[newP.cleanName] = "You";
        
        localStorage.setItem('mds_season_leagues', JSON.stringify(leagues));
        document.getElementById('manualName').value = ""; document.getElementById('manualTeam').value = "";
        optimizeLineup(true); loadRosterTab();
        
        let msgEl = document.getElementById('manualAddMsg');
        msgEl.innerText = `✅ Added ${name}!`;
        setTimeout(() => msgEl.innerText = "", 3000);
    }

    function deletePlayer(playerId) {
        let league = getActiveLeague();
        if (!league) return;
        if (confirm("Remove player from active roster?")) {
            let pToRemove = league.roster.find(p => p.id === playerId);
            if(pToRemove && league.globalRosterMap) { delete league.globalRosterMap[pToRemove.cleanName]; }
            league.roster = league.roster.filter(p => p.id !== playerId);
            localStorage.setItem('mds_season_leagues', JSON.stringify(leagues));
            optimizeLineup(true); loadRosterTab();
        }
    }

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

            btn.innerText = "⏳ Mapping League...";
            const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
            const usersData = await usersRes.json();
            let userMap = {};
            usersData.forEach(u => userMap[u.user_id] = u.display_name);

            const rosterRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
            const rosters = await rosterRes.json();
            
            btn.innerText = "⏳ Loading Players...";
            const mapRes = await fetch(`https://api.sleeper.app/v1/players/nfl`);
            const playerMap = await mapRes.json();

            let myTeam = rosters.find(r => r.owner_id === userId);
            if (!myTeam && !isRefresh) throw new Error("Could not find your team in this league.");
            
            let globalRosterMap = {}; 
            
            rosters.forEach(r => {
                let ownerName = userMap[r.owner_id] || "Unknown Team";
                if(r.owner_id === userId) ownerName = "You";
                
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
                leagueId: leagueId,
                name: leagueName,
                username: username,
                reqs: autoReqs,
                roster: rosterDetails,
                globalRosterMap: globalRosterMap
            };

            let existingIdx = leagues.findIndex(l => l.leagueId === leagueId);
            if (existingIdx !== -1) leagues[existingIdx] = leagueObj;
            else leagues.push(leagueObj);

            activeLeagueId = leagueId;
            localStorage.setItem('mds_season_leagues', JSON.stringify(leagues));
            localStorage.setItem('mds_season_active_league', activeLeagueId);

            if(!isRefresh) {
                document.getElementById('newLeagueName').value = "";
                document.getElementById('sleeperLeagueId').value = "";
                refreshLeagueDropdown(); loadActiveLeagueData();
            }
            
            optimizeLineup(true); loadRosterTab();
            
            btn.innerText = "✅ Synced!";
            btn.style.backgroundColor = "#4ade80"; btn.style.color = "#0b132b";
            
            setTimeout(() => {
                btn.innerText = isRefresh ? "🔄 Sync Sleeper Waivers & Trades" : "Sync Sleeper";
                btn.style.backgroundColor = isRefresh ? "#34A853" : "#4285f4";
                btn.style.color = "white";
            }, 2500);

        } catch(err) {
            console.error(err);
            btn.innerText = "⚠️ Error"; btn.style.backgroundColor = "#ea4335";
            alert(`Sync Error:\n${err.message}`);
            setTimeout(() => {
                btn.innerText = isRefresh ? "🔄 Sync Sleeper Waivers & Trades" : "Sync Sleeper";
                btn.style.backgroundColor = isRefresh ? "#34A853" : "#4285f4";
            }, 2500);
        }
    }

    function addAndSyncLeague(btn) {
        const username = document.getElementById('sleeperUsername').value.trim();
        const leagueId = document.getElementById('sleeperLeagueId').value.trim();
        if (!username || !leagueId) { alert("Please enter both Sleeper Username and League ID to sync."); return; }
        btn.innerText = "⏳ Syncing..."; btn.style.backgroundColor = "#8b5cf6";
        processSleeperData(username, leagueId, btn, false);
    }

    function syncActiveLeague() {
        let league = getActiveLeague();
        if (!league || !league.leagueId || league.leagueId.startsWith('manual_') || !league.username) {
            alert("Only Sleeper-synced leagues can be refreshed via this button."); return;
        }
        const btn = document.getElementById('rosterSyncBtn');
        btn.innerText = "⏳ Syncing...";
        processSleeperData(league.username, league.leagueId, btn, true);
    }

    // --- SOS ENGINE ---
    function generateSoSGrid() {
        const tbody = document.getElementById('sosGridBody');
        let html = '';
        nflTeams.forEach(team => {
            let qb = sosMap[team]?.QB || "";
            let rb = sosMap[team]?.RB || "";
            let wr = sosMap[team]?.WR || "";
            let te = sosMap[team]?.TE || "";
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

    function saveManualSoS(btn) {
        nflTeams.forEach(team => {
            if(!sosMap[team]) sosMap[team] = {};
            sosMap[team].QB = document.getElementById(`sos_${team}_QB`).value;
            sosMap[team].RB = document.getElementById(`sos_${team}_RB`).value;
            sosMap[team].WR = document.getElementById(`sos_${team}_WR`).value;
            sosMap[team].TE = document.getElementById(`sos_${team}_TE`).value;
        });
        localStorage.setItem('mds_season_sos', JSON.stringify(sosMap));
        
        btn.innerText = "✅ Saved!";
        setTimeout(() => btn.innerText = "Save Manual SoS", 2000);
        
        if(document.querySelector('.tab-content.active').id === 'lineupTab') optimizeLineup(true);
        else if(document.querySelector('.tab-content.active').id === 'rosterTab') loadRosterTab();
    }

    document.getElementById('sosFileInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: function(results) {
                results.data.forEach(row => {
                    let teamKey = Object.keys(row).find(k => k.toLowerCase().includes('team') || k.toLowerCase().includes('tm'));
                    let team = teamKey ? row[teamKey].trim().toUpperCase() : null;

                    if(team && nflTeams.includes(team)) {
                        if(!sosMap[team]) sosMap[team] = {};
                        
                        let isMatrix = Object.keys(row).some(k => ['qb','rb','wr','te'].includes(k.toLowerCase()));
                        
                        if (isMatrix) {
                            for(let key in row) {
                                let k = key.toLowerCase();
                                if (['qb', 'rb', 'wr', 'te'].includes(k)) {
                                    sosMap[team][k.toUpperCase()] = row[key].replace(/[^0-9]/g, '');
                                }
                            }
                        } else {
                            let posKey = Object.keys(row).find(k => k.toLowerCase() === 'pos' || k.toLowerCase() === 'position');
                            let sosKey = Object.keys(row).find(k => k.toLowerCase() === 'sos' || k.toLowerCase() === 'schedule' || k.toLowerCase() === 'matchup');
                            
                            if (posKey && sosKey) {
                                let posStr = row[posKey].toUpperCase();
                                let sosVal = row[sosKey].replace(/[^0-9]/g, '');
                                
                                let posGroup = null;
                                if(posStr.includes('QB')) posGroup = 'QB';
                                else if(posStr.includes('RB')) posGroup = 'RB';
                                else if(posStr.includes('WR')) posGroup = 'WR';
                                else if(posStr.includes('TE')) posGroup = 'TE';

                                if (posGroup && sosVal) {
                                    sosMap[team][posGroup] = sosVal;
                                }
                            }
                        }
                    }
                });
                localStorage.setItem('mds_season_sos', JSON.stringify(sosMap));
                generateSoSGrid();
                
                let msgEl = document.getElementById('sosSuccessMsg');
                msgEl.style.display = 'block';
                setTimeout(() => msgEl.style.display = 'none', 3000);
            }
        });
    });

    function getSoSBadgeHTML(team, pos) {
        if (!team || team === "FA" || !pos) return "";
        let teamData = sosMap[team];
        if (!teamData) return "";
        
        let rankStr = teamData[pos];
        if (!rankStr || rankStr === "") return "";
        
        let rank = parseInt(rankStr);
        if (isNaN(rank) || rank < 1 || rank > 32) return "";
        
        let hue = Math.max(0, 120 - ((rank - 1) * 3.87));
        let color = `hsl(${hue}, 80%, 65%)`; // Bright text/border
        let bg = `hsl(${hue}, 80%, 15%)`;    // Dark background
        
        return `<span class="badge" style="background:${bg}; border:1px solid ${color}; color:${color}; font-size:0.65rem; margin-left:4px;">SoS: ${rank}</span>`;
    }

    // --- SCOUT TAB ENGINE ---
    function runScout(type) {
        const inputEl = document.getElementById(type === 'waiver' ? 'waiverInput' : 'buyInput');
        const sellEl = document.getElementById('sellInput');
        const outputEl = document.getElementById(type === 'waiver' ? 'waiverOutput' : 'tradeOutput');
        
        let targetNames = inputEl.value.split(/[\n,]+/).map(s => s.trim()).filter(s => s);
        let sellNames = type === 'trade' ? sellEl.value.split(/[\n,]+/).map(s => s.trim()).filter(s => s) : [];
        
        if (targetNames.length === 0 && sellNames.length === 0) {
            outputEl.innerHTML = `<span style="color:#fca5a5;">Please enter at least one player name.</span>`;
            return;
        }

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};

        const buildCard = (name, roleLabel = null) => {
            let clean = normalizeName(name);
            let rosObj = rosRankings.find(r => r.cleanName === clean);
            let weekObj = weeklyRankings.find(r => r.cleanName === clean);
            
            let displayName = (rosObj && rosObj.name) ? rosObj.name : ((weekObj && weekObj.name) ? weekObj.name : name);
            
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
                <div style="text-align:right;">
                    ${statusHTML}
                </div>
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
    }

    // --- RANKINGS ENGINE ---
    function updateRankingsMetaDisplay() {
        const rosMetaEl = document.getElementById('rosMetaDisplay');
        if (rosRankings.length > 0) { rosMetaEl.style.display = 'block'; rosMetaEl.innerText = `✅ Loaded: ${rosRankings.length} players`; }
        else { rosMetaEl.style.display = 'none'; }

        const weeklyMetaEl = document.getElementById('weeklyMetaDisplay');
        if (weeklyRankings.length > 0) { weeklyMetaEl.style.display = 'block'; weeklyMetaEl.innerText = `✅ Loaded: ${weeklyRankings.length} players`; }
        else { weeklyMetaEl.style.display = 'none'; }
    }

    function processRankingsUpload(fileInputId, isWeekly, successMsgId) {
        const file = document.getElementById(fileInputId).files[0];
        if (!file) return;

        const filename = file.name.toLowerCase();
        if (filename.endsWith('.csv')) {
            Papa.parse(file, { header: false, skipEmptyLines: true, complete: (results) => parseRankingsData(results.data, isWeekly, successMsgId) });
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
                Papa.parse(csvStr, { header: false, skipEmptyLines: true, complete: (results) => parseRankingsData(results.data, isWeekly, successMsgId) });
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert("Unsupported file format. Please upload a .csv or .xlsx file.");
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
            let nameColIdx = -1; let rankColIdx = -1;
            
            let sosColIdx = headers.findIndex(h => h === 'sos' || h === 'schedule' || h === 'matchup');
            let teamColIdx = headers.findIndex(h => h === 'team' || h === 'tm');
            let posColIdx = headers.findIndex(h => h === 'pos' || h === 'position');
            
            let hasHeaders = headers.some(h => h === 'player' || h === 'name' || h === 'player name');
            if (hasHeaders) {
                nameColIdx = headers.findIndex(h => h === 'player' || h === 'name' || h === 'player name');
                rankColIdx = headers.findIndex(h => h === 'rank' || h === 'overall' || h === 'pos rank' || h === 'tier');
            } else {
                let col0IsNum = !isNaN(parseInt(rows[0][0]));
                nameColIdx = col0IsNum ? 1 : 0; rankColIdx = col0IsNum ? 0 : -1;
            }

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

                        if (teamStr && posStr && sosVal && nflTeams.includes(teamStr)) {
                            let posGroup = "FLEX";
                            if(posStr.includes('QB')) posGroup = 'QB';
                            else if(posStr.includes('RB')) posGroup = 'RB';
                            else if(posStr.includes('WR')) posGroup = 'WR';
                            else if(posStr.includes('TE')) posGroup = 'TE';

                            if (posGroup !== "FLEX") {
                                if (!sosMap[teamStr]) sosMap[teamStr] = {};
                                sosMap[teamStr][posGroup] = sosVal;
                                hasNewSos = true;
                            }
                        }
                    }
                }
            }
        }

        if (isWeekly) { weeklyRankings = parsed; localStorage.setItem('mds_season_weekly', JSON.stringify(weeklyRankings)); } 
        else { rosRankings = parsed; localStorage.setItem('mds_season_ros', JSON.stringify(rosRankings)); }
        
        updateRankingsMetaDisplay();
        
        if (hasNewSos) {
            localStorage.setItem('mds_season_sos', JSON.stringify(sosMap));
            generateSoSGrid();
        }
        
        const activeTab = document.querySelector('.tab-content.active').id;
        if (activeTab === 'lineupTab') optimizeLineup(true);
        if (activeTab === 'rosterTab') loadRosterTab();
        
        let msgEl = document.getElementById(successMsgId);
        msgEl.style.display = 'block'; setTimeout(() => msgEl.style.display = 'none', 2500);
    }

    document.getElementById('rosFileInput').addEventListener('change', () => processRankingsUpload('rosFileInput', false, 'rosSuccessMsg'));
    document.getElementById('weeklyFileInput').addEventListener('change', () => processRankingsUpload('weeklyFileInput', true, 'weeklySuccessMsg'));

    // --- SCREENSHOT EXPORT ---
    async function exportLineup() {
        if (typeof html2canvas === 'undefined') { alert("Screenshot library loading. Please try again in a second."); return; }
        const container = document.getElementById('optimalLineupContainer');
        const exportBtn = document.getElementById('exportBtn');
        const origText = exportBtn.innerText;
        exportBtn.innerText = "📸 Capturing...";
        
        const buttons = container.querySelectorAll('.swap-btn, .lock-btn');
        buttons.forEach(b => b.style.display = 'none');
        const originalBg = container.style.background;
        container.style.background = '#1c2541'; container.style.padding = '1rem'; container.style.borderRadius = '8px';
        
        try {
            const canvas = await html2canvas(container, { backgroundColor: '#1c2541', scale: 2 });
            const link = document.createElement('a');
            link.download = `My_Lineup_Strategist.png`; link.href = canvas.toDataURL('image/png'); link.click();
        } catch (err) {
            console.error("Export failed:", err); alert("Sorry, export failed. Please try again.");
        } finally {
            buttons.forEach(b => b.style.display = 'inline-block');
            container.style.background = originalBg; container.style.padding = '0'; exportBtn.innerText = origText;
        }
    }

    // --- RENDERERS ---
    function loadRosterTab() {
        let league = getActiveLeague();
        const syncBtn = document.getElementById('rosterSyncBtn');
        if (league && league.leagueId && !league.leagueId.startsWith('manual_') && league.username) syncBtn.style.display = 'block';
        else syncBtn.style.display = 'none';

        if (!league || !league.roster || league.roster.length === 0) {
            document.getElementById('rosterList').innerHTML = "Select or create a league on the Setup tab to view your roster.";
            return;
        }
        
        let displayRoster = league.roster.map(p => {
            let rObj = rosRankings.find(rk => rk.cleanName === p.cleanName);
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
            let byeStr = teamByes[p.team] ? ` (${teamByes[p.team]})` : "";
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
        document.getElementById('rosterList').innerHTML = html;
    }

    function toggleLock(playerId) {
        if (!activeLeagueId) return;
        let locks = lockedPlayersMap[activeLeagueId] || [];
        if (locks.includes(playerId)) locks = locks.filter(id => id !== playerId);
        else locks.push(playerId);
        
        lockedPlayersMap[activeLeagueId] = locks;
        localStorage.setItem('mds_season_locks_map', JSON.stringify(lockedPlayersMap));
        
        let starters = manualStartersMap[activeLeagueId] || [];
        let bench = manualBenchMap[activeLeagueId] || [];
        starters.forEach(s => { if(s.player && s.player.id === playerId) s.player.isLocked = locks.includes(playerId); });
        bench.forEach(p => { if(p.id === playerId) p.isLocked = locks.includes(playerId); });
        
        manualStartersMap[activeLeagueId] = starters;
        manualBenchMap[activeLeagueId] = bench;
        renderLineupUI();
    }

    function initiateSwap(playerId) {
        if (swapSourceId === null) { swapSourceId = playerId; } 
        else if (swapSourceId === playerId) { swapSourceId = null; } 
        else {
            let starters = manualStartersMap[activeLeagueId] || [];
            let bench = manualBenchMap[activeLeagueId] || [];
            let p1StarterIdx = starters.findIndex(s => s.player && s.player.id === swapSourceId);
            let p1BenchIdx = bench.findIndex(p => p.id === swapSourceId);
            let p2StarterIdx = starters.findIndex(s => s.player && s.player.id === playerId);
            let p2BenchIdx = bench.findIndex(p => p.id === playerId);

            let p1Obj = (p1StarterIdx !== -1) ? starters[p1StarterIdx].player : bench[p1BenchIdx];
            let p2Obj = (p2StarterIdx !== -1) ? starters[p2StarterIdx].player : bench[p2BenchIdx];

            if (p1StarterIdx !== -1 && p2StarterIdx !== -1) { starters[p1StarterIdx].player = p2Obj; starters[p2StarterIdx].player = p1Obj; } 
            else if (p1StarterIdx !== -1 && p2BenchIdx !== -1) { starters[p1StarterIdx].player = p2Obj; bench[p2BenchIdx] = p1Obj; }
            else if (p1BenchIdx !== -1 && p2StarterIdx !== -1) { starters[p2StarterIdx].player = p1Obj; bench[p1BenchIdx] = p2Obj; }
            else if (p1BenchIdx !== -1 && p2BenchIdx !== -1) { bench[p1BenchIdx] = p2Obj; bench[p2BenchIdx] = p1Obj; }

            manualStartersMap[activeLeagueId] = starters;
            manualBenchMap[activeLeagueId] = bench;
            localStorage.setItem('mds_season_manual_starters', JSON.stringify(manualStartersMap));
            localStorage.setItem('mds_season_manual_bench', JSON.stringify(manualBenchMap));
            swapSourceId = null;
        }
        renderLineupUI();
    }

    function optimizeLineup(forceReset = true) {
        let league = getActiveLeague();
        if (!league || !league.roster || league.roster.length === 0) {
            document.getElementById('optimalLineupContainer').innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Please select and sync a league first.</div>`;
            document.getElementById('benchContainer').innerHTML = "No bench data."; return;
        }

        if (!forceReset && manualStartersMap[activeLeagueId] && manualBenchMap[activeLeagueId]) {
            renderLineupUI(); return;
        }

        let activeDataSet = weeklyRankings.length > 0 ? weeklyRankings : rosRankings;
        let locks = lockedPlayersMap[activeLeagueId] || [];
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

        manualStartersMap[activeLeagueId] = starters;
        manualBenchMap[activeLeagueId] = pool;
        
        localStorage.setItem('mds_season_manual_starters', JSON.stringify(manualStartersMap));
        localStorage.setItem('mds_season_manual_bench', JSON.stringify(manualBenchMap));
        renderLineupUI();
    }

    function renderLineupUI() {
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');
        
        let starters = manualStartersMap[activeLeagueId] || [];
        let benchPool = manualBenchMap[activeLeagueId] || [];

        let html = "";
        starters.forEach(s => {
            let slotType = s.slot.replace(/[0-9]/g, '');

            if (s.player) {
                let p = s.player;
                let lockIcon = p.isLocked ? "🔒" : "🔓";
                let lockClass = p.isLocked ? "locked" : "";
                if (swapSourceId === p.id) lockClass += " swapping";

                let displayRank = s.usedFlex && p.flexRank !== 999 ? p.flexRank : p.posRank;
                let rankLabel = s.usedFlex && p.flexRank !== 999 ? "Flex Rk" : "Pos Rk";
                let rankBadge = displayRank !== 999 ? `${rankLabel}: ${displayRank}` : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = teamByes[p.team] ? ` (${teamByes[p.team]})` : "";
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
                        <button class="btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
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
            benchPool.forEach(p => {
                let lockClass = swapSourceId === p.id ? "swapping" : "";
                let displayRank = p.flexRank !== 999 ? p.flexRank : p.posRank;
                let rankLabel = p.flexRank !== 999 ? "Flex Rk" : "Pos Rk";
                let rankBadge = displayRank !== 999 ? `${rankLabel}: ${displayRank}` : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = teamByes[p.team] ? ` (${teamByes[p.team]})` : "";
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
                        <button class="btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                    </div>
                </div>`;
            });
        } else { benchHTML = "No bench players."; }
        benchContainer.innerHTML = benchHTML;
    }
