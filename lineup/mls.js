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
        rosRankingsUpdatedAt: localStorage.getItem('mds_season_ros_updated') || null,
        rankingSets: {
            ros: JSON.parse(localStorage.getItem('mls_ranking_sets_ros')) || [],
            weekly: JSON.parse(localStorage.getItem('mls_ranking_sets_weekly')) || []
        },
        weeklyRankingsUpdatedAt: localStorage.getItem('mds_season_weekly_updated') || null,
        marketRankings: JSON.parse(localStorage.getItem('mds_season_market')) || [],
        marketSettings: JSON.parse(localStorage.getItem('mls_market_settings')) || { source: 'fantasycalc', type: 'redraft', qbs: '1', ppr: '1', tep: false },
        sosMap: JSON.parse(localStorage.getItem('mds_season_sos')) || {},
        lockedPlayersMap: JSON.parse(localStorage.getItem('mds_season_locks_map')) || {},
        manualStartersMap: JSON.parse(localStorage.getItem('mds_season_manual_starters')) || {},
        manualBenchMap: JSON.parse(localStorage.getItem('mds_season_manual_bench')) || {},
        swapSourceId: null,
        touchStartX: 0,
        touchEndX: 0
    };

    // --- UTILITY HELPERS ---
    // normalizeName intentionally NOT redeclared here -- it previously shadowed the
    // shared, alias-aware version in js/utils.js (loaded before this file), which caused
    // Sleeper-sourced names to fail matching against user-uploaded rankings for any player
    // needing suffix stripping, accent stripping, or the alias map (e.g. Gabe Davis /
    // Gabriel Davis). Calls to normalizeName() below now resolve to that shared version.
    // Do not add a local normalizeName() back without updating utils.js instead.

    // flashButton intentionally NOT declared here either -- previously a separate near-duplicate
    // of mds.js's local copy. Both now consolidated into the single shared version in
    // js/utils.js. Calls below resolve to that shared version.

    // --- DRAWER & SWIPE LOGIC ---
    window.toggleDrawer = function() {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');
    const hamburgerBtn = document.querySelector('.hamburger-btn'); // Grab the button
    
    if (!drawer || !overlay) return;
    
    const isOpen = drawer.classList.toggle('open');
    overlay.style.display = isOpen ? 'block' : 'none';
    
    // Announce the new state to screen readers
    if (hamburgerBtn) {
        hamburgerBtn.setAttribute('aria-expanded', isOpen);
    }
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
        // --- NEW: Pass 'e' to handleSwipe ---
        mainAppEl.addEventListener('touchend', e => { State.touchEndX = e.changedTouches[0].screenX; handleSwipe(e); }, {passive: true});
    }

    function handleSwipe(e) {
        // --- NEW: Prevent tab swipe if touching tables, grids, or inputs ---
        if (e && e.target && e.target.closest('.roster-container-wrapper, .lineup-container-wrapper, .sos-table-wrapper, select, input, textarea')) {
            return; 
        }

        const swipeThreshold = 120; 
        const activeTabBtn = document.querySelector('.nav-bar .nav-btn.active');
        if (!activeTabBtn) return;
        
        const tabs = ['setup', 'roster', 'lineup', 'scout', 'guide'];
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
    window.showTab = function(tabId, skipHistory = false) {
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

    // --- NEW: Push to browser history so the back button works ---
    if (!skipHistory) {
        history.pushState({ tab: tabId }, '', `#${tabId}`);
    }
};
// --- NEW: Catch the native back button ---
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) {
        window.showTab(e.state.tab, true); 
    } else {
        window.showTab('setup', true);
    }
});
    
    // --- BACKUP & RESTORE ---
    // Counterpart to MDS's exportMdsSettings/importMdsSettings/hardReset in mds.js -- see that
    // file's comment for why key-prefix scoping matters on a shared origin. MLS's own keys are
    // mds_season_*, mls_*, and shared_sleeper_league_id. mds_handoff_roster is excluded --
    // transient signal from MDS, not a persistent MLS setting.
    function getMlsOwnedKeys() {
        return Object.keys(localStorage).filter(k =>
            (k.startsWith('mds_season_') || k.startsWith('mls_') || k === 'shared_sleeper_league_id')
            && k !== 'mds_handoff_roster'
        );
    }

    window.exportMlsSettings = function() {
        const keys = getMlsOwnedKeys();
        const data = {};
        keys.forEach(k => data[k] = localStorage.getItem(k));

        const payload = {
            app: "MLS",
            appName: "My Lineup Strategist",
            exportedAt: new Date().toISOString(),
            data: data
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-lineup-strategist-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showToast) window.showToast("Backup downloaded!");
    };

    window.importMlsSettings = function(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            let payload;
            try {
                payload = JSON.parse(e.target.result);
            } catch (err) {
                if (window.showToast) window.showToast("That file isn't valid JSON -- couldn't read it as a backup.", { isError: true });
                fileInput.value = "";
                return;
            }

            if (!payload || payload.app !== "MLS" || typeof payload.data !== 'object') {
                if (window.showToast) window.showToast("This doesn't look like a My Lineup Strategist backup file. If it's an MDS (Draft Strategist) backup, use the Import button on that app instead.", { isError: true });
                fileInput.value = "";
                return;
            }

            const keyCount = Object.keys(payload.data).length;
            const exportedDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : "an unknown date";
            const confirmMsg = `This will REPLACE your current My Lineup Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately. Continue?`;

            if (!window.confirm(confirmMsg)) {
                fileInput.value = "";
                return;
            }

            getMlsOwnedKeys().forEach(k => localStorage.removeItem(k));
            Object.keys(payload.data).forEach(k => localStorage.setItem(k, payload.data[k]));

            if (window.showToast) window.showToast("Backup restored! Reloading now.");
            setTimeout(() => { window.location.reload(); }, 900);
        };
        reader.readAsText(file);
    };

    window.factoryReset = function() {
        if (window.confirm("DANGER ZONE\n\nAre you sure you want to clear ALL leagues, cached rankings, custom SoS data, and settings?\n\n(My Draft Strategist data is not affected.)\n\nThis cannot be undone.")) {
            getMlsOwnedKeys().forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };

    // --- INITIALIZATION ---
    function updatePulsePrompts() {
        // Sync Button Pulse
        const syncBtn = document.getElementById('mainSyncBtn');
        if (syncBtn) {
            if (State.leagues.length === 0) syncBtn.classList.add('btn-pulse');
            else syncBtn.classList.remove('btn-pulse');
        }
        
        // Weekly Rankings Pulse
        const weeklyCard = document.getElementById('weeklyRankingsCard');
        if (weeklyCard) {
            if (State.leagues.length > 0 && State.weeklyRankings.length === 0) weeklyCard.classList.add('pulse-border');
            else weeklyCard.classList.remove('pulse-border');
        }
    }

    window.onload = function() {
        populateEarlyGameDropdown();
        refreshLeagueDropdown();
        updateRankingsMetaDisplay();
        generateSoSGrid();
        checkForDraftStrategistHandoff();
        applyMarketSettingsToUI();
        updatePulsePrompts();

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
        renderLeagueManager();
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

    function renderLeagueManager() {
        const container = document.getElementById('leagueManagerContainer');
        if (!container) return;
        if (State.leagues.length === 0) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No leagues synced yet.</div>`;
            return;
        }
        
        let html = "";
        State.leagues.forEach((l, index) => {
            let formatText = l.formatBadge ? `<span style="color:var(--text-muted); font-size: 0.75rem;">${l.formatBadge}</span>` : "";
            html += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border);">
                <div style="display: flex; flex-direction: column;">
                    <strong style="color: var(--text-main); font-size: 0.9rem;">${l.name}</strong>
                    ${formatText}
                </div>
                <div style="display: flex; gap: 0.4rem;">
                    <button class="btn-sm btn-secondary" style="padding: 0.2rem 0.5rem;" onclick="moveLeague(${index}, -1)" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
                    <button class="btn-sm btn-secondary" style="padding: 0.2rem 0.5rem;" onclick="moveLeague(${index}, 1)" ${index === State.leagues.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
                    <button class="btn-sm btn-danger" style="padding: 0.2rem 0.5rem; margin-left: 0.5rem;" onclick="deleteLeagueManager('${l.leagueId}')">✕</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    window.moveLeague = function(index, direction) {
        if (index + direction < 0 || index + direction >= State.leagues.length) return;
        let temp = State.leagues[index];
        State.leagues[index] = State.leagues[index + direction];
        State.leagues[index + direction] = temp;
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        refreshLeagueDropdown();
    };

    window.deleteLeagueManager = function(leagueId) {
        if (!window.confirm("Are you sure you want to remove this league?")) return;
        State.leagues = State.leagues.filter(l => l.leagueId !== leagueId);
        if (State.activeLeagueId === leagueId) {
            State.activeLeagueId = State.leagues.length > 0 ? State.leagues[0].leagueId : null;
            localStorage.setItem('mds_season_active_league', State.activeLeagueId || "");
        }
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        refreshLeagueDropdown();
        loadActiveLeagueData();
        if (typeof loadRosterTab === 'function') loadRosterTab();
        if (typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
    };

    window.switchActiveLeague = function(leagueId) {
        if (!leagueId) return;
        State.activeLeagueId = leagueId;
        localStorage.setItem('mds_season_active_league', State.activeLeagueId);
        
        // HYDRATION: Unpack rankings for this specific league. Priority: named set assignment,
        // then legacy per-league data (from before named ranking sets existed), then empty --
        // deliberately NOT falling back to the global flat key anymore. That fallback used to
        // be exactly why a league with nothing of its own could appear to "inherit" whatever
        // another league had most recently active, rather than genuinely remembering its own.
        let league = getActiveLeague();
        if (league) {
            ['ros', 'weekly'].forEach(type => {
                const cfg = RANKING_TYPE_CONFIG[type];
                const setId = league[cfg.leagueSetIdKey];
                const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;

                if (set) {
                    State[cfg.stateKey] = [...set.data];
                    State[cfg.updatedAtKey] = set.updatedAt;
                } else if (Array.isArray(league[cfg.leagueLegacyDataKey]) && league[cfg.leagueLegacyDataKey].length > 0) {
                    State[cfg.stateKey] = [...league[cfg.leagueLegacyDataKey]];
                    State[cfg.updatedAtKey] = league[cfg.leagueLegacyUpdatedKey] || null;
                } else {
                    State[cfg.stateKey] = [];
                    State[cfg.updatedAtKey] = null;
                }
            });
            
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
        // Only sync the legacy per-league copy when this league ISN'T using a named ranking
        // set -- once a set is assigned, its data lives once in State.rankingSets (referenced
        // by id, not copied per league), so writing a full copy here on every save would
        // silently reintroduce the exact duplication named ranking sets exist to avoid.
        if (!league.rosRankingSetId) {
            league.rosRankings = [...State.rosRankings];
            league.rosRankingsUpdatedAt = State.rosRankingsUpdatedAt;
        }
        if (!league.weeklyRankingSetId) {
            league.weeklyRankings = [...State.weeklyRankings];
            league.weeklyRankingsUpdatedAt = State.weeklyRankingsUpdatedAt;
        }
    }
    localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
}
    function loadActiveLeagueData() {
        let league = getActiveLeague();
        if (!league) return;
        
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('reqQB', reqs.QB);
        setVal('reqRB', reqs.RB);
        setVal('reqWR', reqs.WR);
        setVal('reqTE', reqs.TE);
        setVal('reqFLEX', reqs.FLEX);
        setVal('reqSFLEX', reqs.SFLEX);
        setVal('reqK', reqs.K !== undefined ? reqs.K : 1);
        setVal('reqDEF', reqs.DEF !== undefined ? reqs.DEF : 1);
        
        const titleEl = document.getElementById('activeLeagueReqTitle');
        if (titleEl) titleEl.innerText = `(${league.name})`;
        setVal('sleeperUsername', league.username !== "Manual" ? league.username : "");
    }

    window.saveRequirements = function(btn) {
        let league = getActiveLeague();
        if (!league) { if (window.showToast) window.showToast("Please select or add a league first.", { isError: true }); return; }
        const getInt = id => parseInt(document.getElementById(id)?.value) || 0;
        league.reqs = {
            QB: getInt('reqQB'), RB: getInt('reqRB'), WR: getInt('reqWR'),
            TE: getInt('reqTE'), FLEX: getInt('reqFLEX'), SFLEX: getInt('reqSFLEX'),
            K: getInt('reqK'), DEF: getInt('reqDEF')
        };
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        if (btn) flashButton(btn, "Requirements Saved");
        window.optimizeLineup(true);
    };

    window.createManualLeague = function() {
        const nameInput = document.getElementById('newLeagueName');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) { if (window.showToast) window.showToast("Please enter a League Name to create a manual league.", { isError: true }); return; }

        let newId = 'manual_' + Date.now();
        let leagueObj = {
            leagueId: newId, name: name, username: "Manual",
            reqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1 }, roster: [], globalRosterMap: {},
            rosRankings: [], weeklyRankings: [], rosRankingsUpdatedAt: null, weeklyRankingsUpdatedAt: null,
            rosRankingSetId: null, weeklyRankingSetId: null
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

    // --- DRAFT STRATEGIST ROSTER HANDOFF ---
    // Counterpart to sendRosterToLineupStrategist() in MDS's mds.js. Same-origin localStorage
    // is the transport -- see that function's comment for why no URL params/backend are needed.
    function checkForDraftStrategistHandoff() {
        const raw = localStorage.getItem('mds_handoff_roster');
        if (!raw) return;

        let payload;
        try { payload = JSON.parse(raw); } catch (e) { localStorage.removeItem('mds_handoff_roster'); return; }
        if (!payload || !Array.isArray(payload.players) || payload.players.length === 0) {
            localStorage.removeItem('mds_handoff_roster');
            return;
        }

        const banner = document.getElementById('handoffBanner');
        const textEl = document.getElementById('handoffBannerText');
        if (textEl) {
            textEl.innerHTML = `<strong>Roster found from My Draft Strategist:</strong> "${payload.sourceLeagueName}" (${payload.players.length} players). Import it as a new league here?`;
        }
        if (banner) banner.style.display = 'flex';
    }

    window.importDraftStrategistRoster = function() {
        const raw = localStorage.getItem('mds_handoff_roster');
        if (!raw) return;
        let payload;
        try { payload = JSON.parse(raw); } catch (e) { return; }

        let newId = 'handoff_' + Date.now();
        let roster = [];
        let globalRosterMap = {};
        payload.players.forEach((p, i) => {
            let clean = normalizeName(p.name);
            let newP = { id: 'p_' + Date.now() + '_' + i, name: p.name, cleanName: clean, pos: p.pos || 'FLEX', team: p.team || 'FA' };
            roster.push(newP);
            globalRosterMap[clean] = "You";
        });

        let leagueObj = {
            leagueId: newId, name: payload.sourceLeagueName || "Drafted Team", username: "From Draft Strategist",
            reqs: payload.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1 },
            roster: roster, globalRosterMap: globalRosterMap,
            rosRankings: [], weeklyRankings: [], rosRankingsUpdatedAt: null, weeklyRankingsUpdatedAt: null,
            rosRankingSetId: null, weeklyRankingSetId: null
        };
        State.leagues.push(leagueObj);
        State.activeLeagueId = newId;
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        localStorage.setItem('mds_season_active_league', State.activeLeagueId);
        localStorage.removeItem('mds_handoff_roster');

        const banner = document.getElementById('handoffBanner');
        if (banner) banner.style.display = 'none';

        refreshLeagueDropdown();
        const leagueSelect = document.getElementById('headerLeagueSelect');
        if (leagueSelect) leagueSelect.value = newId;
        loadActiveLeagueData();

        if (window.showToast) window.showToast(`Imported "${leagueObj.name}" with ${roster.length} players.`);
    };

    window.dismissDraftStrategistHandoff = function() {
        localStorage.removeItem('mds_handoff_roster');
        const banner = document.getElementById('handoffBanner');
        if (banner) banner.style.display = 'none';
    };

    window.addManualPlayer = function() {
        let league = getActiveLeague();
        if (!league) { if (window.showToast) window.showToast("Please add or select a league first.", { isError: true }); return; }
        const nameInput = document.getElementById('manualName');
        const posInput = document.getElementById('manualPos');
        const teamInput = document.getElementById('manualTeam');

        const name = nameInput ? nameInput.value.trim() : "";
        const pos = posInput ? posInput.value : "FLEX";
        const team = teamInput ? teamInput.value.trim().toUpperCase() || "FA" : "FA";

        if (!name) { if (window.showToast) window.showToast("Please enter a player name.", { isError: true }); return; }

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

    async function processSleeperData(username, leagueId, btn, isRefresh = false, preloaded = {}, suppressErrorToast = false) {
        try {
            let userId = preloaded.userId;
            if (!userId) {
                const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
                if (!userRes.ok) throw new Error("User not found.");
                userId = (await userRes.json()).user_id;
            }

            const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
            if (!leagueRes.ok) throw new Error("League ID not found.");
            const leagueData = await leagueRes.json();
            let leagueName = leagueData.name || "My League";
            
            let formatBadge = "";
            if (leagueData.settings) {
                let typeStr = leagueData.settings.type === 2 ? "Dynasty" : (leagueData.settings.type === 1 ? "Keeper" : "Redraft");
                if (leagueData.settings.best_ball === 1) typeStr = "Best Ball";
                let pprVal = leagueData.scoring_settings?.rec || 0;
                let pprStr = pprVal === 1 ? "PPR" : (pprVal === 0.5 ? "Half-PPR" : "Std");
                let isSF = leagueData.roster_positions?.includes("SUPER_FLEX") ? "SF" : "1QB";
                let tepVal = leagueData.scoring_settings?.bonus_rec_te || 0;
                let tepStr = tepVal > 0 ? `TEP (+${tepVal})` : "";
                formatBadge = `${typeStr} ${isSF} ${pprStr} ${tepStr}`.trim();
            }

            let autoReqs = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SFLEX: 0, K: 0, DEF: 0 };
            if (leagueData.roster_positions) {
                leagueData.roster_positions.forEach(pos => {
                    if (pos === 'QB') autoReqs.QB++;
                    else if (pos === 'RB') autoReqs.RB++;
                    else if (pos === 'WR') autoReqs.WR++;
                    else if (pos === 'TE') autoReqs.TE++;
                    else if (['FLEX', 'REC_FLEX', 'WRRB_FLEX'].includes(pos)) autoReqs.FLEX++;
                    else if (pos === 'SUPER_FLEX') autoReqs.SFLEX++;
                    else if (pos === 'K') autoReqs.K++;
                    else if (pos === 'DEF') autoReqs.DEF++;
                });
            } else {
                autoReqs = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };
            }

            if (btn) btn.innerText = "Mapping League...";
            const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
            const usersData = await usersRes.json();
            let userMap = {};
            usersData.forEach(u => userMap[u.user_id] = u.display_name);

            const rosterRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
            const rosters = await rosterRes.json();
            
            if (btn) btn.innerText = "Loading Players...";
            const playerMap = preloaded.playerMap || await (await fetch(`https://api.sleeper.app/v1/players/nfl`)).json();

            let myTeam = rosters.find(r => r.owner_id === userId);
            if (!myTeam && !isRefresh) throw new Error("Could not find your team in this league.");
            
            let globalRosterMap = {};
            let globalPosMap = {}; 
            rosters.forEach(r => {
                let ownerName = userMap[r.owner_id] || "Unknown Team";
                if (r.owner_id === userId) ownerName = "You";
                
                if (r.players) {
                    r.players.forEach(pId => {
                        let p = playerMap[pId];
                        if (p) {
                            let clean = normalizeName(`${p.first_name} ${p.last_name}`);
                            globalRosterMap[clean] = ownerName;
                            globalPosMap[clean] = p.position || "FLEX";
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

            let existingIdx = State.leagues.findIndex(l => l.leagueId === leagueId);
            let existingLeague = existingIdx !== -1 ? State.leagues[existingIdx] : null;

            let leagueObj = {
                leagueId: leagueId, name: leagueName, username: username, formatBadge: formatBadge,
                reqs: autoReqs, roster: rosterDetails, globalRosterMap: globalRosterMap,
                globalPosMap: globalPosMap,
                // Preserve this league's existing rankings assignment across a re-sync rather
                // than rebuilding it from whatever happens to be currently active in State --
                // a re-sync should only refresh roster/matchup data, not silently reassign
                // rankings. A genuinely new league starts with nothing assigned.
                rosRankings: existingLeague ? existingLeague.rosRankings : [],
                weeklyRankings: existingLeague ? existingLeague.weeklyRankings : [],
                rosRankingsUpdatedAt: existingLeague ? existingLeague.rosRankingsUpdatedAt : null,
                weeklyRankingsUpdatedAt: existingLeague ? existingLeague.weeklyRankingsUpdatedAt : null,
                rosRankingSetId: existingLeague ? existingLeague.rosRankingSetId : null,
                weeklyRankingSetId: existingLeague ? existingLeague.weeklyRankingSetId : null
            };

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
            
            if (btn) flashButton(btn, isRefresh ? "Sync Complete" : "Synced Successfully", false, isRefresh ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-icon"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Sync Sleeper Waivers & Trades' : "Sync Sleeper");
            return true;

        } catch(err) {
            console.error(err);
            if (btn) flashButton(btn, "Sync Failed", true, isRefresh ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-icon"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Sync Sleeper Waivers & Trades' : "Sync Sleeper");
            if (!suppressErrorToast && window.showToast) window.showToast(`Sync Error:\n${err.message}`, { isError: true });
            return false;
        }
    }

    window.addAndSyncLeague = function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim() || "";
        const leagueId = document.getElementById('sleeperLeagueId')?.value.trim() || "";
        if (!username || !leagueId) { if (window.showToast) window.showToast("Please enter both Sleeper Username and League ID to sync.", { isError: true }); return; }
        if (btn) { btn.innerText = "Syncing..."; btn.style.backgroundColor = "var(--accent-color, #8b5cf6)"; }
        processSleeperData(username, leagueId, btn, false);
    };

    // --- IMPORT ALL LEAGUES (by username only) ---
    // Pulls every league a Sleeper username belongs to for the current NFL season and syncs
    // each one, so the user doesn't have to find and paste in each League ID individually.
    // Reuses processSleeperData() per league (same logic as the single-league sync above) but
    // fetches the user lookup and the ~5MB players list ONCE up front and passes them in via
    // the preloaded param, rather than every league in the loop re-fetching both -- Sleeper's
    // own docs ask callers not to hit the players endpoint more than once a day.
    window.importAllSleeperLeagues = async function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim() || "";
        if (!username) {
            if (window.showToast) window.showToast("Please enter your Sleeper Username first.", { isError: true });
            return;
        }

        const origText = btn ? btn.innerText : "";
        if (btn) { btn.innerText = "Finding your leagues..."; btn.disabled = true; btn.style.opacity = "0.7"; }

        try {
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
            if (!userRes.ok) throw new Error("Sleeper username not found.");
            const userId = (await userRes.json()).user_id;

            // Sleeper's "current" season isn't necessarily the calendar year during the
            // offseason -- league_season (not the more general "season" field) is what
            // Sleeper's own docs describe as the active season for league membership, and
            // it shifts earlier than "season" during the transition into a new year.
            const stateRes = await fetch(`https://api.sleeper.app/v1/state/nfl`);
            const stateData = stateRes.ok ? await stateRes.json() : null;
            const season = stateData?.league_season || stateData?.season || String(new Date().getFullYear());

            const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
            if (!leaguesRes.ok) throw new Error("Could not fetch leagues for this user.");
            const leagues = await leaguesRes.json();

            if (!leagues || leagues.length === 0) {
                if (window.showToast) window.showToast(`No ${season} NFL leagues found for that username.`, { isError: true });
                return;
            }

            if (btn) btn.innerText = "Loading player data...";
            const playerMap = await (await fetch(`https://api.sleeper.app/v1/players/nfl`)).json();
            const preloaded = { userId, playerMap };

            let successCount = 0;
            let failCount = 0;
            for (let i = 0; i < leagues.length; i++) {
                if (btn) btn.innerText = `Syncing ${i + 1}/${leagues.length}...`;
                const ok = await processSleeperData(username, leagues[i].league_id, null, true, preloaded, true);
                if (ok) successCount++; else failCount++;
            }

            refreshLeagueDropdown();
            if (State.leagues.length > 0 && !State.activeLeagueId) {
                State.activeLeagueId = State.leagues[0].leagueId;
                localStorage.setItem('mds_season_active_league', State.activeLeagueId);
            }
            loadActiveLeagueData();

            const summary = failCount > 0
                ? `Imported ${successCount} league${successCount === 1 ? '' : 's'} (${failCount} failed -- check console for details).`
                : `Imported ${successCount} league${successCount === 1 ? '' : 's'}!`;
            if (window.showToast) window.showToast(summary, { isError: failCount > 0 });

        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast(`Could not import leagues:\n${err.message}`, { isError: true });
        } finally {
            if (btn) { btn.innerText = origText; btn.disabled = false; btn.style.opacity = "1"; }
        }
    };

    window.syncActiveLeague = function() {
        let league = getActiveLeague();
        if (!league || !league.leagueId || league.leagueId.startsWith('manual_') || !league.username) {
            if (window.showToast) window.showToast("Only Sleeper-synced leagues can be refreshed via this button.", { isError: true }); return;
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
            outputEl.innerHTML = `<span class="mls-error-text">Please enter at least one player name.</span>`;
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
                    <div class="mls-meta-row">
                        <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong></span>
                        <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong></span>
                    </div>
                </div>
                <div class="mls-text-right">${statusHTML}</div>
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

    window.autoFindWaiverUpgrades = async function() {
        const outputEl = document.getElementById('waiverOutput');
        const posFilter = document.getElementById('waiverPosFilter') ? document.getElementById('waiverPosFilter').value : 'FLEX';
        if (!outputEl) return;

        let league = getActiveLeague();
        if (!league || !league.globalRosterMap || !league.globalPosMap) {
            outputEl.innerHTML = `<span class="mls-error-text">Please sync a Sleeper league on the Setup tab first to analyze waivers.</span>`;
            return;
        }

        // Default to ROS rankings for waiver wire decisions, but fallback to Weekly if needed
        let activeRankings = State.rosRankings.length > 0 ? State.rosRankings : State.weeklyRankings;
        let rankType = State.rosRankings.length > 0 ? "ROS" : "Weekly";

        if (activeRankings.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please upload Rest-of-Season or Weekly rankings first.</span>`;
            return;
        }

        // --- UI LOADING STATE ---
        const btn = document.querySelector('button[onclick="autoFindWaiverUpgrades()"]');
        const origText = btn ? btn.innerText : "Auto-Find Upgrades";
        if (btn) {
            btn.innerText = "Scanning...";
            btn.style.opacity = "0.7";
            btn.style.pointerEvents = "none";
        }
        outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Analyzing global free agent pool...</div>`;

        try {
            // --- FA POSITION RESOLVER ---
            if (!window.sleeperPosByName) {
                try {
                    let res = await fetch('https://api.sleeper.app/v1/players/nfl');
                    if (res.ok) {
                        let map = await res.json();
                        window.sleeperPosByName = {};
                        Object.values(map).forEach(p => {
                            if (p.first_name) {
                                window.sleeperPosByName[normalizeName(`${p.first_name} ${p.last_name}`)] = p.position || "UNK";
                            }
                        });
                    }
                } catch(e) {
                    console.warn("Could not fetch Sleeper player map for FA positions. Falling back to cached market data.");
                }
            }

            let rosterMap = league.globalRosterMap;

            const getPos = (cleanName) => {
                if (league.globalPosMap && league.globalPosMap[cleanName]) return league.globalPosMap[cleanName];
                if (window.sleeperPosByName && window.sleeperPosByName[cleanName]) return window.sleeperPosByName[cleanName];
                let mPlayer = State.marketRankings.find(m => m.cleanName === cleanName);
                if (mPlayer && mPlayer.pos) return mPlayer.pos;
                return "UNK";
            };

            const isMatch = (pos) => {
                if (posFilter === 'ALL') return true;
                if (posFilter === 'FLEX') return ['RB', 'WR', 'TE'].includes(pos) || pos === 'FLEX';
                return pos === posFilter;
            };

            // 1. Find user's lowest-ranked players matching the position filter
            let myRoster = league.roster.filter(p => isMatch(getPos(p.cleanName))).map(p => {
                let rObj = activeRankings.find(rk => rk.cleanName === p.cleanName);
                return {
                    name: p.name,
                    cleanName: p.cleanName,
                    rank: rObj ? rObj.rank : 999,
                    pos: getPos(p.cleanName)
                };
            });

            if (myRoster.length === 0) {
                let posLabel = posFilter === 'FLEX' ? 'FLEX (RB/WR/TE)' : posFilter;
                outputEl.innerHTML = `<span class="mls-error-text">You have no ${posLabel} players on your roster to drop.</span>`;
                return;
            }

            // Sort descending so the absolute worst player is first
            myRoster.sort((a, b) => b.rank - a.rank);
            
            let benchmarkPlayer = myRoster[0];
            let worstRank = benchmarkPlayer.rank;

            // 2. Find all Free Agents definitively matching the position filter
            let freeAgents = activeRankings.filter(r => !rosterMap[r.cleanName] && isMatch(getPos(r.cleanName)));

            // 3. Filter FA upgrades (Rank numerically lower/better than the benchmark player)
            let upgrades = freeAgents.filter(fa => fa.rank < worstRank);
            upgrades.sort((a, b) => a.rank - b.rank);

            if (upgrades.length === 0) {
                let posLabel = posFilter === 'FLEX' ? 'FLEX' : posFilter;
                let benchmarkText = benchmarkPlayer.rank === 999 ? `${benchmarkPlayer.name} (Unranked)` : `${benchmarkPlayer.name} (#${benchmarkPlayer.rank})`;
                outputEl.innerHTML = `
                    <div class="scout-result-card" style="justify-content: center; text-align: center; padding: 1.25rem 1rem;">
                        <div style="color: var(--text-muted); line-height: 1.5;">
                            No free agents found ranked higher than your lowest-ranked ${posLabel} player, <strong style="color: var(--text-main);">${benchmarkText}</strong>.
                            <div style="margin-top: 0.35rem; color: var(--primary-green); font-weight: 600;">Your roster is optimized at this position!</div>
                        </div>
                    </div>`;
                return;
            }

            // Cap to top 15
            let topUpgrades = upgrades.slice(0, 15);

            let benchmarkText = benchmarkPlayer.rank === 999 ? `${benchmarkPlayer.name} (Unranked)` : `${benchmarkPlayer.name} (#${benchmarkPlayer.rank})`;
            
            // Collect next 2 lowest players for bench context
            let nextCandidates = myRoster.slice(1, 3).map(p => {
                let rText = p.rank === 999 ? "Unranked" : `#${p.rank}`;
                return `${p.name} (${rText})`;
            });
            let benchContext = nextCandidates.length > 0 ? `<br><span style="color: var(--text-muted); font-size: 0.8rem;">Other bench depth in this group: ${nextCandidates.join(', ')}</span>` : '';

            let html = `
            <div style="background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 6px; border-left: 3px solid #fca5a5; font-size: 0.85rem; color: var(--text-main); margin-bottom: 1rem; line-height: 1.5;">
                <div style="color: #fca5a5; font-weight: bold; margin-bottom: 4px;">Benchmark Drop Candidate:</div>
                Your lowest-ranked player in this position group is <strong>${benchmarkText}</strong>. Here are the top available Free Agents ranked higher than <strong>${benchmarkPlayer.name}</strong>:${benchContext}
            </div>
            <div style="font-weight:bold; color:var(--primary-green); margin-bottom:0.5rem;">Top Available Upgrades (Based on ${rankType})</div>`;

            topUpgrades.forEach(fa => {
                let wRankObj = State.weeklyRankings.find(r => r.cleanName === fa.cleanName);
                let rRankObj = State.rosRankings.find(r => r.cleanName === fa.cleanName);
                let pos = getPos(fa.cleanName);
                
                let wRank = wRankObj ? wRankObj.rank : "UR";
                let rRank = rRankObj ? rRankObj.rank : "UR";
                
                let badgeClass = pos === "UNK" ? "FLEX" : pos;
                let displayPos = pos === "UNK" ? "FA" : pos;

                html += `
                <div class="scout-result-card">
                    <div>
                        <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px; display:flex; align-items:center;">
                            <span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing" style="margin-right: 8px;">${displayPos}</span>
                            ${fa.name}
                        </div>
                        <div class="mls-meta-row">
                            <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong></span>
                            <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong></span>
                        </div>
                    </div>
                    <div class="mls-text-right">
                        <div class="scout-status status-avail">Free Agent<br>(Available)</div>
                    </div>
                </div>`;
            });

            outputEl.innerHTML = html;

        } catch (err) {
            console.error(err);
            outputEl.innerHTML = `<span class="mls-error-text">An error occurred while analyzing waivers. Please try again.</span>`;
        } finally {
            if (btn) {
                btn.innerText = origText;
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
            }
        }
    };

    // --- RANKINGS ENGINE ---
    // Formats a stored timestamp into a short relative string, and flags it as "stale" past
    // the given threshold (in days) so the UI can call attention to rankings that likely need
    // a refresh. Returns null if there's no timestamp at all (e.g. rankings from before this
    // tracking existed) so the caller can fall back to a neutral message rather than claim
    // false freshness.
    function getRankingsFreshness(timestamp, staleAfterDays) {
        if (!timestamp) return null;
        const ms = Date.now() - Number(timestamp);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        let label;
        if (days <= 0) label = "Updated today";
        else if (days === 1) label = "Updated yesterday";
        else label = `Updated ${days} days ago`;
        return { label, isStale: days > staleAfterDays };
    }

    // --- NAMED RANKING SETS ---
    // Rankings are now named, reusable sets that a league REFERENCES (by id) rather than owns
    // a full copy of -- so uploading "Dynasty PPR 2026" once and applying it to five leagues
    // stores that data once, not five times, and switching to a league shows exactly the set
    // you last picked for it rather than silently inheriting whatever another league last had
    // active. ROS and Weekly are kept as two separate pools, matching how they already work.
    //
    // Migration note: leagues that accumulated their own rankings copy under the old model
    // (league.rosRankings / league.weeklyRankings, still populated from before this existed)
    // are NOT auto-converted into a named set. That legacy data stays available as a distinct
    // "Unassigned Upload (legacy)" option in the dropdown until the user picks or creates a
    // real named set for that league -- nothing is silently discarded, but nothing is silently
    // promoted into the new system either.
    const RANKING_TYPE_CONFIG = {
        ros: {
            stateKey: 'rosRankings', updatedAtKey: 'rosRankingsUpdatedAt',
            leagueLegacyDataKey: 'rosRankings', leagueLegacyUpdatedKey: 'rosRankingsUpdatedAt',
            leagueSetIdKey: 'rosRankingSetId', setsKey: 'ros',
            localStorageSetsKey: 'mls_ranking_sets_ros',
            globalDataKey: 'mds_season_ros', globalUpdatedKey: 'mds_season_ros_updated',
            selectId: 'rosRankingSetSelect', nameInputWrapId: 'rosNewSetNameWrap',
            nameInputId: 'rosNewSetName', deleteBtnId: 'rosDeleteSetBtn',
            label: 'ROS', staleAfterDays: 14
        },
        weekly: {
            stateKey: 'weeklyRankings', updatedAtKey: 'weeklyRankingsUpdatedAt',
            leagueLegacyDataKey: 'weeklyRankings', leagueLegacyUpdatedKey: 'weeklyRankingsUpdatedAt',
            leagueSetIdKey: 'weeklyRankingSetId', setsKey: 'weekly',
            localStorageSetsKey: 'mls_ranking_sets_weekly',
            globalDataKey: 'mds_season_weekly', globalUpdatedKey: 'mds_season_weekly_updated',
            selectId: 'weeklyRankingSetSelect', nameInputWrapId: 'weeklyNewSetNameWrap',
            nameInputId: 'weeklyNewSetName', deleteBtnId: 'weeklyDeleteSetBtn',
            label: 'Weekly', staleAfterDays: 6
        }
    };

    // Called after a successful upload or auto-fetch with the freshly parsed data. Updates the
    // currently-selected set in place if one's selected in the dropdown; otherwise creates a new
    // named set (using the name field, or a sensible default) and assigns it to the active league.
    function saveRankingsAsSet(type, parsedData) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const nameInput = document.getElementById(cfg.nameInputId);
        const currentSelection = selectEl ? selectEl.value : '__new__';

        let league = getActiveLeague();
        let setId = null;

        if (currentSelection && currentSelection !== '__new__' && currentSelection !== '__legacy__') {
            let existing = State.rankingSets[cfg.setsKey].find(s => s.id === currentSelection);
            if (existing) {
                existing.data = parsedData;
                existing.updatedAt = Date.now();
                setId = existing.id;
            }
        }

        if (!setId) {
            const defaultName = `${cfg.label} Rankings – ${new Date().toLocaleDateString()}`;
            const name = (nameInput && nameInput.value.trim()) || defaultName;
            const newSet = { id: 'rset_' + Date.now(), name, createdAt: Date.now(), updatedAt: Date.now(), data: parsedData };
            State.rankingSets[cfg.setsKey].push(newSet);
            setId = newSet.id;
            if (nameInput) nameInput.value = '';
        }

        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));

        State[cfg.stateKey] = [...parsedData];
        State[cfg.updatedAtKey] = Date.now();
        // Keep the flat global fallback keys updated too, for consistency with how they're
        // already used elsewhere (e.g. a brand new league with nothing assigned yet).
        localStorage.setItem(cfg.globalDataKey, JSON.stringify(parsedData));
        localStorage.setItem(cfg.globalUpdatedKey, State[cfg.updatedAtKey]);

        if (league) league[cfg.leagueSetIdKey] = setId;
        saveActiveLeagueState();
        updateRankingsMetaDisplay();
    }

    // Fills a type's <select> with the active league's legacy data (if any), every named set,
    // and a "+ Create New Set" option -- then selects whichever one the active league is
    // actually using right now, and shows/hides the name input and delete button to match.
    function populateRankingSetDropdown(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        if (!selectEl) return;

        const league = getActiveLeague();
        const sets = State.rankingSets[cfg.setsKey];
        const assignedId = league ? league[cfg.leagueSetIdKey] : null;
        const legacyData = league ? league[cfg.leagueLegacyDataKey] : null;
        const hasLegacy = Array.isArray(legacyData) && legacyData.length > 0;

        let optionsHTML = '';
        if (hasLegacy) {
            optionsHTML += `<option value="__legacy__">Unassigned Upload (legacy) — ${legacyData.length} players</option>`;
        }
        sets.forEach(s => {
            optionsHTML += `<option value="${s.id}">${s.name} (${s.data.length} players)</option>`;
        });
        optionsHTML += `<option value="__new__">+ Create New Set</option>`;
        selectEl.innerHTML = optionsHTML;

        let selectedVal = '__new__';
        if (assignedId && sets.some(s => s.id === assignedId)) {
            selectedVal = assignedId;
        } else if (hasLegacy) {
            selectedVal = '__legacy__';
        }
        selectEl.value = selectedVal;

        const nameWrap = document.getElementById(cfg.nameInputWrapId);
        const deleteBtn = document.getElementById(cfg.deleteBtnId);
        if (nameWrap) nameWrap.style.display = (selectedVal === '__new__') ? 'flex' : 'none';
        if (deleteBtn) deleteBtn.style.display = (selectedVal !== '__new__' && selectedVal !== '__legacy__') ? 'inline-block' : 'none';
        
        if (typeof updatePulsePrompts === 'function') updatePulsePrompts();
    }

    // User manually picked a different set (or legacy data, or "create new") from the dropdown.
    window.onRankingSetSelectChange = function(type, selectEl) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const val = selectEl.value;
        const nameWrap = document.getElementById(cfg.nameInputWrapId);
        const deleteBtn = document.getElementById(cfg.deleteBtnId);

        if (val === '__new__') {
            if (nameWrap) nameWrap.style.display = 'flex';
            if (deleteBtn) deleteBtn.style.display = 'none';
            return; // don't touch State yet -- wait for an actual upload/fetch to create the set
        }
        if (nameWrap) nameWrap.style.display = 'none';

        let league = getActiveLeague();
        if (!league) return;

        if (val === '__legacy__') {
            State[cfg.stateKey] = league[cfg.leagueLegacyDataKey] || [];
            State[cfg.updatedAtKey] = league[cfg.leagueLegacyUpdatedKey] || null;
            league[cfg.leagueSetIdKey] = null;
            if (deleteBtn) deleteBtn.style.display = 'none';
        } else {
            const set = State.rankingSets[cfg.setsKey].find(s => s.id === val);
            if (!set) return;
            State[cfg.stateKey] = [...set.data];
            State[cfg.updatedAtKey] = set.updatedAt;
            league[cfg.leagueSetIdKey] = set.id;
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
        }

        saveActiveLeagueState();
        updateRankingsMetaDisplay();

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'rosterTab' && typeof loadRosterTab === 'function') loadRosterTab();
        if (activeTab && activeTab.id === 'lineupTab' && typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
    };

    // Deletes the currently-selected named set entirely. Any league referencing it (not just
    // the active one) falls back to unassigned, since the data it pointed to no longer exists.
    window.deleteRankingSet = function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const setId = selectEl ? selectEl.value : null;
        if (!setId || setId === '__new__' || setId === '__legacy__') return;

        const set = State.rankingSets[cfg.setsKey].find(s => s.id === setId);
        if (!set) return;

        if (!window.confirm(`Delete "${set.name}"? Any league using this set will need a new one selected. This can't be undone.`)) return;

        State.rankingSets[cfg.setsKey] = State.rankingSets[cfg.setsKey].filter(s => s.id !== setId);
        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));

        State.leagues.forEach(l => {
            if (l[cfg.leagueSetIdKey] === setId) l[cfg.leagueSetIdKey] = null;
        });
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));

        let league = getActiveLeague();
        if (league && league[cfg.leagueSetIdKey] === null) {
            State[cfg.stateKey] = [];
            State[cfg.updatedAtKey] = null;
        }

        if (window.showToast) window.showToast(`Deleted "${set.name}".`);
        updateRankingsMetaDisplay();
    };


    window.toggleRankingsCard = function(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const nowExpanded = card.classList.toggle('expanded');
        const header = card.querySelector('.rankings-card-header');
        if (header) header.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
    };

    function setRankingsCardExpanded(cardId, expanded) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.classList.toggle('expanded', expanded);
        const header = card.querySelector('.rankings-card-header');
        if (header) header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function updateRankingsMetaDisplay() {
        const rosMetaEl = document.getElementById('rosMetaDisplay');
        const rosHeaderEl = document.getElementById('rosHeaderFreshness');
        if (rosMetaEl) {
            if (State.rosRankings.length > 0) {
                rosMetaEl.style.display = 'block';
                const fresh = getRankingsFreshness(State.rosRankingsUpdatedAt, 14); // ROS: occasional refresh is normal
                const countText = `Loaded: ${State.rosRankings.length} players`;
                if (fresh) {
                    rosMetaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'rankings-stale' : 'rankings-fresh'}">• ${fresh.label}${fresh.isStale ? ' — consider refreshing' : ''}</span>`;
                    if (rosHeaderEl) {
                        rosHeaderEl.textContent = fresh.label;
                        rosHeaderEl.classList.toggle('rankings-stale', fresh.isStale);
                    }
                } else {
                    rosMetaEl.innerText = countText;
                    if (rosHeaderEl) { rosHeaderEl.textContent = `${State.rosRankings.length} players`; rosHeaderEl.classList.remove('rankings-stale'); }
                }
            } else {
                rosMetaEl.style.display = 'none';
                if (rosHeaderEl) rosHeaderEl.textContent = '';
                setRankingsCardExpanded('rosRankingsCard', true); // nothing loaded yet -- show the actionable UI
            }
        }

        const weeklyMetaEl = document.getElementById('weeklyMetaDisplay');
        const weeklyHeaderEl = document.getElementById('weeklyHeaderFreshness');
        if (weeklyMetaEl) {
            if (State.weeklyRankings.length > 0) {
                weeklyMetaEl.style.display = 'block';
                const fresh = getRankingsFreshness(State.weeklyRankingsUpdatedAt, 6); // Weekly: expected to refresh every week
                const countText = `Loaded: ${State.weeklyRankings.length} players`;
                if (fresh) {
                    weeklyMetaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'rankings-stale' : 'rankings-fresh'}">• ${fresh.label}${fresh.isStale ? ' — likely stale, re-upload for this week' : ''}</span>`;
                    if (weeklyHeaderEl) {
                        weeklyHeaderEl.textContent = fresh.label;
                        weeklyHeaderEl.classList.toggle('rankings-stale', fresh.isStale);
                    }
                } else {
                    weeklyMetaEl.innerText = countText;
                    if (weeklyHeaderEl) { weeklyHeaderEl.textContent = `${State.weeklyRankings.length} players`; weeklyHeaderEl.classList.remove('rankings-stale'); }
                }
            } else {
                weeklyMetaEl.style.display = 'none';
                if (weeklyHeaderEl) weeklyHeaderEl.textContent = '';
                setRankingsCardExpanded('weeklyRankingsCard', true); // nothing loaded yet -- show the actionable UI
            }
        }

        populateRankingSetDropdown('ros');
        populateRankingSetDropdown('weekly');
    }

    window.toggleUploadMode = function(type) {
        const mode = document.getElementById(`${type}UploadMode`).value;
        document.getElementById(`${type}SingleMode`).style.display = mode === 'single' ? 'block' : 'none';
        document.getElementById(`${type}MultiMode`).style.display = mode === 'multi' ? 'block' : 'none';
    };

    window.togglePosInput = function(type, pos) {
        const wrap = document.getElementById(`${type}-input-wrap-${pos}`);
        if (wrap.style.display === 'none') {
            wrap.style.display = 'flex';
        } else {
            wrap.style.display = 'none';
            const input = document.getElementById(`${type}FileInput-${pos}`);
            if (input) input.value = ''; // Clear file if unchecked
        }
    };

    const parseFiles = async (filesWithContext, isWeekly, successMsgId) => {
        let combinedPlayers = {};
        let hasNewSos = false;

        const parseSingleFile = (fileObj) => new Promise((resolve) => {
            const file = fileObj.file;
            const parseContext = fileObj.context; // 'SINGLE', 'QB', 'FLEX', etc.

            if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                loadSheetJS(() => {
                    const reader = new FileReader();
                    reader.onload = e => {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            workbook.SheetNames.forEach(sheetName => {
                                const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                                Papa.parse(csvStr, {
                                    header: false,
                                    skipEmptyLines: true,
                                    complete: results => parseRowsIntoCombined(results.data, parseContext)
                                });
                            });
                        } catch (err) {
                            console.error("Error reading Excel file:", err);
                        }
                        resolve();
                    };
                    reader.readAsArrayBuffer(file);
                });
            } else {
                Papa.parse(file, {
                    header: false,
                    skipEmptyLines: true,
                    complete: results => {
                        parseRowsIntoCombined(results.data, parseContext);
                        resolve();
                    }
                });
            }
        });

        function parseRowsIntoCombined(rows, context) {
            if (!rows || rows.length < 1) return;

            let headers = rows[0].map(h => String(h).trim().toLowerCase());
            
            // Check if this is a combined horizontal sheet (either old format or new 'wk1' format)
            let isHorizontal = (context === 'SINGLE') && headers.some(h => 
                h.includes('quarterback') || 
                h.includes('running back') || 
                h === 'flex' || 
                h.includes('qb player') || 
                h.includes('rb player') ||
                h.includes('flex player')
            );

            if (isHorizontal) {
                headers.forEach((h, idx) => {
                    // Name columns end in 'player', or are exactly 'def team' for defense
                    if (h.includes('player') || h === 'def team') {
                        let rankColIdx = idx - 1;
                        let isFlexCol = h.includes('flex');
                        let posMatch = h.match(/(qb|rb|wr|te|k)\s+player/);
                        let isDefCol = (h === 'def team');
                        let isPosCol = (posMatch !== null) || isDefCol;

                        if ((isFlexCol || isPosCol) && rankColIdx >= 0) {
                            for (let r = 1; r < rows.length; r++) {
                                let pName = rows[r][idx];
                                let pRank = rows[r][rankColIdx];
                                
                                if (pName && pName.trim() && pRank && !isNaN(parseInt(pRank))) {
                                    let clean = normalizeName(pName.trim());
                                    if (!combinedPlayers[clean]) {
                                        combinedPlayers[clean] = { name: pName.trim(), cleanName: clean, posRank: 999, flexRank: 999, rank: 999 };
                                    }
                                    let rVal = parseInt(pRank);
                                    if (isFlexCol) {
                                        combinedPlayers[clean].flexRank = rVal;
                                        combinedPlayers[clean].rank = rVal;
                                    } else {
                                        combinedPlayers[clean].posRank = rVal;
                                        if (combinedPlayers[clean].rank === 999) combinedPlayers[clean].rank = rVal;
                                    }
                                }
                            }
                        }
                    }
                });
            } else {
            // Vertical Parsing Engine
                let sosColIdx = headers.findIndex(h => h === 'sos' || h === 'schedule' || h === 'matchup');
                let teamColIdx = headers.findIndex(h => h === 'team' || h === 'tm');
                let posColIdx = headers.findIndex(h => h === 'pos' || h === 'position');
                let explicitPosRankColIdx = headers.findIndex(h => h === 'pos rank' || h === 'position rank' || h === 'positional rank');

                // Include position names as valid player name headers
                const validNameHeaders = ['player', 'name', 'player name', 'quarterback', 'running back', 'wide receiver', 'tight end', 'kicker', 'defense', 'flex'];
                let hasHeaders = headers.some(h => validNameHeaders.includes(h));
                let rankColIdx = hasHeaders ? headers.findIndex(h => h === 'rank' || h === 'overall' || h === 'tier') : (!isNaN(parseInt(rows[0][0])) ? 0 : -1);
                let nameColIdx = hasHeaders ? headers.findIndex(h => validNameHeaders.includes(h)) : (!isNaN(parseInt(rows[0][0])) ? 1 : 0);

                let startIndex = hasHeaders ? 1 : 0;

                for (let i = startIndex; i < rows.length; i++) {
                    let nameStr = rows[i][nameColIdx];
                    if (nameStr && nameStr.trim()) {
                        let clean = normalizeName(nameStr.trim());
                        
                        let overallRankVal = (rankColIdx !== -1 && rows[i][rankColIdx]) ? parseInt(rows[i][rankColIdx]) : (i + 1 - startIndex);
                        if (isNaN(overallRankVal)) overallRankVal = i + 1 - startIndex;
                        
                        let extractedPosRank = 999;
                        if (explicitPosRankColIdx !== -1 && rows[i][explicitPosRankColIdx]) {
                            extractedPosRank = parseInt(rows[i][explicitPosRankColIdx]);
                            if (isNaN(extractedPosRank)) extractedPosRank = 999;
                        }

                        if (!combinedPlayers[clean]) {
                            combinedPlayers[clean] = { name: nameStr.trim(), cleanName: clean, rank: 999, posRank: 999, flexRank: 999 };
                        }

                        // Determine where ranks go based on user UI selection
                        if (context === 'FLEX') {
                            combinedPlayers[clean].flexRank = overallRankVal;
                            combinedPlayers[clean].rank = overallRankVal; 
                        } else if (context !== 'SINGLE') {
                            // Specific position like QB, RB
                            combinedPlayers[clean].posRank = overallRankVal;
                            if (combinedPlayers[clean].rank === 999) combinedPlayers[clean].rank = overallRankVal;
                        } else {
                            // Single File
                            combinedPlayers[clean].rank = overallRankVal;
                            if (extractedPosRank !== 999) {
                                combinedPlayers[clean].posRank = extractedPosRank;
                            } else if (combinedPlayers[clean].posRank === 999) {
                                combinedPlayers[clean].posRank = overallRankVal; // Fallback
                            }
                            combinedPlayers[clean].flexRank = overallRankVal; 
                        }

                        // SoS Extraction
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
        }

        await Promise.all(filesWithContext.map(f => parseSingleFile(f)));

        const parsedData = Object.values(combinedPlayers);
        if (parsedData.length === 0) return;

        if (isWeekly) saveRankingsAsSet('weekly', parsedData);
        else saveRankingsAsSet('ros', parsedData);

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
        if (typeof window.showToast === 'function') {
            let rankType = isWeekly ? "Weekly" : "ROS";
            let isFirstTime = !localStorage.getItem('mls_has_seen_rankings_toast');
            
            if (isFirstTime) {
                window.showToast(`${rankType} Rankings loaded! \n\nTip: We saved this as a reusable set. When you switch to another league, select it from the dropdown to apply it there too!`, { duration: 6000 });
                localStorage.setItem('mls_has_seen_rankings_toast', 'true');
            } else {
                window.showToast(`${rankType} Rankings loaded successfully!`);
            }
        }
    };

    window.processSingleRankingUpload = function(type, successMsgId) {
        const fileInput = document.getElementById(`${type}FileInput`);
        if (!fileInput || !fileInput.files[0]) return;
        
        const isWeekly = type === 'weekly';
        parseFiles([{ file: fileInput.files[0], context: 'SINGLE' }], isWeekly, successMsgId);
    };

    window.processMultiRankings = function(type, successMsgId) {
        const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
        let filesWithContext = [];

        positions.forEach(pos => {
            const input = document.getElementById(`${type}FileInput-${pos}`);
            if (input && input.parentElement.style.display !== 'none' && input.files[0]) {
                filesWithContext.push({ file: input.files[0], context: pos });
            }
        });

        if (filesWithContext.length === 0) {
            if (window.showToast) window.showToast("Please select and upload at least one positional file.", { isError: true });
            return;
        }

        const isWeekly = type === 'weekly';
        parseFiles(filesWithContext, isWeekly, successMsgId);
    };

    const rosFileEl = document.getElementById('rosFileInput');
    const weeklyFileEl = document.getElementById('weeklyFileInput');
    if (rosFileEl) rosFileEl.addEventListener('change', () => processSingleRankingUpload('ros', 'rosSuccessMsg'));
    if (weeklyFileEl) weeklyFileEl.addEventListener('change', () => processSingleRankingUpload('weekly', 'weeklySuccessMsg'));
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
        } else if (filename.endsWith('.numbers')) {
            if (window.showToast) window.showToast("Numbers files aren't supported directly. In Numbers, use File > Export To > CSV, then upload that file instead.", { isError: true });
        } else {
            if (window.showToast) window.showToast("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.", { isError: true });
        }
    }
    // --- SHARED MARKET-CONSENSUS FETCH ---
    // Extracted from what used to be inline inside fetchLeagueLogsADP() so both the Scout tab's
    // Power Rankings feature AND the ROS Rankings auto-fetch (Roster tab) can reuse the exact
    // same, already-proven fetch/parse logic instead of duplicating it. Pure data in/out --
    // no DOM access, no state writes -- callers handle their own UI and State updates.
    async function fetchMarketConsensusData(source, isDynastyVal, numQbsVal, ppr, isTEP, teamCount) {
        let parsed = [];
        let formatText = "";
        const isDynastyBool = isDynastyVal === 'dynasty';

        // --- 1. FANTASYCALC ---
        if (source === 'fantasycalc') {
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
                            marketVal: rankVal,
                            pos: item.player.position || ""
                        });
                    }
                }
            });
            formatText = `${isDynastyVal.toUpperCase()} (${numQbsVal === '2' ? 'Superflex' : '1QB'}, PPR: ${ppr})`;
        } 
        
        // --- 2. LEAGUELOGS ---
        else if (source === 'leaguelogs') {
            let pprKey = "ppr1";
            let qbKey = numQbsVal === '2' ? '2qb' : '1qb';
            let typeKey = isDynastyVal; 
            let profileKey = `${typeKey}-${qbKey}-12t-${pprKey}`;
            
            formatText = `${typeKey.toUpperCase()} - ${qbKey.toUpperCase()} (PPR)`;

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
                        marketVal: rankVal,
                        pos: sp.position || ""
                    });
                }
            });
        }

        return { parsed, formatText };
    }

    // --- ROS RANKINGS AUTO-FETCH ---
    // Reuses the exact same market-consensus fetch already proven for Scout's Power Rankings.
    // This is a deliberately narrower feature than "auto-fetch rankings" in general: ROS
    // (rest-of-season) value maps directly onto what FantasyCalc/LeagueLogs already provide
    // (a single overall value per player, no week-specific data). Weekly Rankings do NOT get
    // an equivalent auto-fetch -- the real expert-consensus weekly rankings source (FantasyPros)
    // requires a paid/partnership API key, and the free alternatives found either return raw
    // stats/projections rather than a ready-made ranking, or are of uncertain reliability. Rather
    // than guess at an unverified integration, Weekly Rankings stay upload-only for now.
    window.autoFetchRosRankings = async function(btn) {
        if (!btn) return;
        const origText = btn.innerText;
        btn.innerText = "Fetching...";
        btn.style.opacity = "0.7";
        btn.disabled = true;

        try {
            // Shared with the Scout tab's Power Rankings settings -- see updateMarketSetting()
            // and the "ros"-prefixed controls on this tab for where this gets configured.
            const s = State.marketSettings;
            const isTEP = s.tep ? 'true' : 'false';
            let teamCount = (typeof getActiveLeague === 'function' && getActiveLeague()?.settings?.teams) || 12;

            const { parsed, formatText } = await fetchMarketConsensusData(s.source, s.type, s.qbs, s.ppr, isTEP, teamCount);
            if (parsed.length === 0) throw new Error("No players returned from the market data source.");

            // Convert to the same shape manual ROS uploads use (rank/posRank/flexRank), computed
            // by sorting on marketVal (lower = better) both overall and within each position.
            let sorted = [...parsed].sort((a, b) => a.marketVal - b.marketVal);
            let posCounters = {};
            let rosRankings = sorted.map((p, i) => {
                const posKey = (p.pos || '').toUpperCase();
                posCounters[posKey] = (posCounters[posKey] || 0) + 1;
                return { name: p.name, cleanName: p.cleanName, rank: i + 1, posRank: posCounters[posKey], flexRank: i + 1 };
            });

            saveRankingsAsSet('ros', rosRankings);

            if (window.showToast) window.showToast(`ROS Rankings pulled: ${rosRankings.length} players (${formatText})`);

            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id === 'rosterTab') loadRosterTab();

        } catch (error) {
            console.error("Error auto-fetching ROS rankings:", error);
            let adBlockerTip = error.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block requests containing the word 'logs' -- try pausing yours.)" : "";
            if (window.showToast) window.showToast(`Could not auto-fetch ROS rankings.\n\n${error.message}${adBlockerTip}`, { isError: true });
        } finally {
            btn.innerText = origText;
            btn.style.opacity = "1";
            btn.disabled = false;
        }
    };

    window.fetchLeagueLogsADP = async function(btn) {
    const outputEl = document.getElementById('marketDisconnectOutput');
    const msgEl = document.getElementById('marketSuccessMsg');
    
    const origText = btn.innerText;
    btn.innerText = "Fetching...";
    btn.style.opacity = "0.7";
    btn.disabled = true;

    try {
        const s = State.marketSettings;
        const isTEP = s.tep ? 'true' : 'false';
        let teamCount = (typeof getActiveLeague === 'function' && getActiveLeague()?.settings?.teams) || 12;

        const { parsed, formatText } = await fetchMarketConsensusData(s.source, s.type, s.qbs, s.ppr, isTEP, teamCount);

        // Save to state and local storage
        State.marketRankings = parsed;
        localStorage.setItem('mds_season_market', JSON.stringify(State.marketRankings)); // was 'mls_season_market' -- State.marketRankings is always read back from 'mds_season_market' on load (see State init above), so this key must match or fetched data silently disappears on reload
        
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
        let adBlockerTip = error.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block URLs containing the word 'logs'. Please pause your ad-blocker to use this feature.)" : "";
        if (window.showToast) window.showToast(`Could not pull live market data.\n\n${error.message}${adBlockerTip}`, { isError: true });
    } finally {
        btn.innerText = origText;
        btn.style.opacity = "1";
        btn.disabled = false;
    }
};
// --- SHARED MARKET SETTINGS (Scout tab + Roster tab's ROS auto-fetch) ---
// Both tabs have their own copy of these controls (different element IDs, prefixed "ros" on
// the Roster tab) so the user doesn't have to navigate to Scout just to configure them before
// auto-fetching ROS rankings. Single source of truth is State.marketSettings; every control's
// onchange calls updateMarketSetting(), which persists it and re-syncs BOTH tabs' controls so
// they never drift out of sync with each other.
window.updateMarketSetting = function(key, value) {
    State.marketSettings[key] = value;
    localStorage.setItem('mls_market_settings', JSON.stringify(State.marketSettings));
    applyMarketSettingsToUI();
};

function applyMarketSettingsToUI() {
    const s = State.marketSettings;
    const instances = [
        { source: 'marketSourceSelect', type: 'marketType', qbs: 'marketQbs', ppr: 'marketPpr', tep: 'marketTep', fcBlock: 'fantasycalcSpecificControls' },
        { source: 'rosMarketSourceSelect', type: 'rosMarketType', qbs: 'rosMarketQbs', ppr: 'rosMarketPpr', tep: 'rosMarketTep', fcBlock: 'rosFantasycalcSpecificControls' }
    ];

    instances.forEach(ids => {
        const sourceEl = document.getElementById(ids.source);
        const typeEl = document.getElementById(ids.type);
        const qbsEl = document.getElementById(ids.qbs);
        const pprEl = document.getElementById(ids.ppr);
        const tepEl = document.getElementById(ids.tep);
        const fcBlock = document.getElementById(ids.fcBlock);

        if (sourceEl) sourceEl.value = s.source;
        if (typeEl) typeEl.value = s.type;
        if (qbsEl) qbsEl.value = s.qbs;
        if (pprEl) pprEl.value = s.ppr;
        if (tepEl) tepEl.checked = s.tep;
        // LeagueLogs doesn't use PPR dropdown or TEP toggle directly, so hide them
        if (fcBlock) fcBlock.style.display = (s.source === 'fantasycalc') ? 'block' : 'none';
    });

    const brandEl = document.getElementById('attributionBrand');
    const attrLink = document.getElementById('attributionLink');
    if (brandEl) brandEl.innerText = (s.source === 'fantasycalc') ? "FantasyCalc" : "LeagueLogs";
    if (attrLink) attrLink.href = (s.source === 'fantasycalc') ? "https://fantasycalc.com" : "https://leaguelogs.com";
}
    function parseMarketData(rows, successMsgId) {
        let parsed = [];
        if (rows.length < 1) return;

        let sample = rows[0];
        let nameKey = Object.keys(sample).find(k => /player|name/i.test(k));
        let rankKey = Object.keys(sample).find(k => /overall[_\s]?rank/i.test(k)) ||
                      Object.keys(sample).find(k => /^rank$/i.test(k)) ||
                      Object.keys(sample).find(k => /overall/i.test(k) && !/value/i.test(k));
        let posKey = Object.keys(sample).find(k => /^pos/i.test(k) || /position/i.test(k));

        if (!nameKey || !rankKey) {
            if (window.showToast) window.showToast("Could not automatically detect 'Player' and 'Overall Rank' columns in your market file.", { isError: true });
            return;
        }

        rows.forEach((row, idx) => {
            let nameStr = row[nameKey];
            let valStr = row[rankKey] ? String(row[rankKey]).replace(/[^0-9.]/g, '') : "";
            let posStr = (posKey && row[posKey]) ? String(row[posKey]).trim().toUpperCase() : "";
            if (nameStr && nameStr.trim() && valStr) {
                let numVal = parseFloat(valStr);
                parsed.push({
                    name: nameStr.trim(),
                    cleanName: normalizeName(nameStr.trim()),
                    marketVal: numVal, // Added missing comma
                    pos: posStr
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
            outputEl.innerHTML = `<span class="mls-error-text">Please upload a market consensus file (KTC/FantasyCalc) first.</span>`;
            return;
        }
        if (State.rosRankings.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please upload your Rest-of-Season (ROS) rankings on the Roster tab first.</span>`;
            return;
        }

        const mode = document.getElementById('disconnectMode')?.value || 'flat';
        const threshold = parseFloat(document.getElementById('disconnectThreshold')?.value) || 10;
        const posFilter = document.getElementById('disconnectPosFilter')?.value || 'ALL';

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};

        let analysisList = [];

        State.marketRankings.forEach(m => {
            if (posFilter !== 'ALL') {
                if (!m.pos || !m.pos.includes(posFilter)) return; 
            }
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
            html += `<div style="font-weight:bold; color:var(--primary-green); margin: 0.75rem 0 0.5rem 0; display: flex; align-items: center; gap: 6px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                High-Value Targets (Market Sleeping)
            </div>`;
            buyItems.forEach(item => {
                let ownerStr = item.owner === "You" ? `<span style="color:#60a5fa;">On your roster</span>` : (item.owner ? `Rostered by: ${item.owner}` : `<span style="color:var(--primary-green);">Free Agent</span>`);
                html += `
                <div class="scout-result-card">
                    <div>
                        <div class="mls-item-name">${item.name}</div>
                        <div class="mls-meta-row">
                            <span>Your Board: <strong class="mls-stat-green">#${item.userRank}</strong></span>
                            <span>Market: <strong class="mls-stat-blue">#${item.marketVal}</strong></span>
                        </div>
                    </div>
                    <div class="mls-text-right">
                        <span class="badge" style="background:var(--target-bg); color:var(--primary-green); border:1px solid var(--target-border);">+${item.delta} Edge</span>
                        <div class="mls-item-subtext">${ownerStr}</div>
                    </div>
                </div>`;
            });
        }

        if (sellItems.length > 0) {
            html += `<div style="font-weight:bold; color:#fca5a5; margin: 1.25rem 0 0.5rem 0; display: flex; align-items: center; gap: 6px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
                Overvalued Assets (Sell High Opportunities)
            </div>`;
            sellItems.forEach(item => {
                html += `
                <div class="scout-result-card">
                    <div>
                        <div class="mls-item-name">${item.name}</div>
                        <div class="mls-meta-row">
                            <span>Your Board: <strong class="mls-stat-red">#${item.userRank}</strong></span>
                            <span>Market: <strong class="mls-stat-blue">#${item.marketVal}</strong></span>
                        </div>
                    </div>
                    <div class="mls-text-right">
                        <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${item.delta} Edge</span>
                        <div class="mls-item-subtext"><strong class="mls-stat-red">On your roster (Sell High!)</strong></div>
                    </div>
                </div>`;
            });
        }

        outputEl.innerHTML = html;
    };
    // --- SCREENSHOT EXPORT ---
    window.exportLineup = async function() {
    if (typeof html2canvas === 'undefined') { 
        if (window.showToast) window.showToast("Screenshot library loading. Please try again in a moment.", { isError: true });
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
        if (window.showToast) window.showToast("Export failed. Please try again.", { isError: true });
    } finally {
        buttons.forEach(b => b.style.display = 'inline-block');
        exportBtn.innerText = origText;
    }
};

    // --- RENDERERS ---
    function loadRosterTab() {
        let league = getActiveLeague();
        const syncBtn = document.getElementById('rosterSyncBtn');
        const headerNameEl = document.getElementById('rosterLeagueHeader');
        const headerFormatEl = document.getElementById('rosterFormatBadge');

        // Dynamically update the header
        if (headerNameEl) {
            headerNameEl.innerText = league ? league.name : "Active Roster";
        }
        if (headerFormatEl) {
            headerFormatEl.innerText = league && league.formatBadge ? `(${league.formatBadge})` : "(Sorted by ROS)";
        }

        if (syncBtn) {
            if (league && league.leagueId && !league.leagueId.startsWith('manual_') && league.username) syncBtn.style.display = 'block';
            else syncBtn.style.display = 'none';
        }

        const rosterListEl = document.getElementById('rosterList');
        if (!rosterListEl) return;

        if (!league || !league.roster || league.roster.length === 0) {
            rosterListEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to your Roster</div>
                <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green);">⬜</span> 1. Sync your Sleeper League (Setup Tab)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green);">⬜</span> 2. Upload ROS Rankings (Above)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green);">⬜</span> 3. Evaluate your team</div>
                </div>
            </div>`;
            return;
        }
        
        let displayRoster = league.roster.map(p => {
            let rObj = State.rosRankings.find(rk => rk.cleanName === p.cleanName);
            return { 
                ...p, 
                rosRank: rObj ? rObj.rank : 999,
                posRank: rObj ? rObj.posRank : 999 
            };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        displayRoster.sort((a, b) => {
            if (a.rosRank !== 999 || b.rosRank !== 999) return a.rosRank - b.rosRank;
            return (posOrder[a.pos] || 99) - (posOrder[b.pos] || 99);
        });

        let html = "";
        displayRoster.forEach(p => {
            let ovrStr = p.rosRank !== 999 ? `#${p.rosRank}` : "-";
            let posStr = p.posRank !== 999 ? `#${p.posRank}` : "-";
            let rankBadge = (p.rosRank !== 999 || p.posRank !== 999) ? `Ovr: ${ovrStr} | Pos: ${posStr}` : "Unranked";
            let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
            let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";
            let sosBadge = getSoSBadgeHTML(p.team, p.pos);
            
            html += `
            <div class="roster-item">
                <div class="mls-player-row-info">
                    <span class="badge pos-badge ${p.pos} mls-pos-badge-sizing">${p.pos}</span>
                    <div class="mls-player-row-text">
                        <div class="player-name-wrap">${p.name}${byeStr} ${injBadge}</div>
                        <div class="mls-player-row-meta">
                            <span class="badge">${p.team}</span>
                            <span class="badge mls-rank-badge">${rankBadge}</span>
                            ${sosBadge}
                        </div>
                    </div>
                </div>
                <div class="mls-row-actions">
                    <button class="btn-danger" style="padding:4px 8px; border-radius:4px;" onclick="deletePlayer('${p.id}')">✕</button>
                </div>
            </div>`;
        });
        rosterListEl.innerHTML = html;
    }

    window.toggleLock = function(playerId) {
        if (!State.activeLeagueId) return;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        
        // Track whether we are actively locking or unlocking
        let isLocking = !locks.includes(playerId);
        
        if (locks.includes(playerId)) locks = locks.filter(id => id !== playerId);
        else locks.push(playerId);
        
        State.lockedPlayersMap[State.activeLeagueId] = locks;
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));
        
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        
        let playerName = 'Player'; // Fallback
        
        starters.forEach(s => { 
            if (s.player && s.player.id === playerId) {
                s.player.isLocked = locks.includes(playerId);
                playerName = s.player.name; // Extract name
            } 
        });
        bench.forEach(p => { 
            if (p.id === playerId) {
                p.isLocked = locks.includes(playerId);
                playerName = p.name; // Extract name
            } 
        });
        
        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = bench;
        
        // Use backticks to evaluate the variables dynamically
        if (typeof window.showToast === 'function') {
            window.showToast(`${playerName} is ${isLocking ? 'locked' : 'unlocked'}`);
        }
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
            if (container) {
                container.innerHTML = `
                <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                    <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to the Lineup Optimizer</div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green);">⬜</span> 1. Sync your Sleeper League (Setup Tab)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green);">⬜</span> 2. Upload Weekly Rankings (Above)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green);">⬜</span> 3. Click 'Optimize Lineup'</div>
                    </div>
                </div>`;
            }
            if (benchContainer) benchContainer.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 1rem; font-size:0.9rem; font-style:italic;">No bench data yet.</div>`; 
            return;
        }

        if (!forceReset && State.manualStartersMap[State.activeLeagueId] && State.manualBenchMap[State.activeLeagueId]) {
            renderLineupUI(); 
            return;
        }

        let activeDataSet = State.weeklyRankings.length > 0 ? State.weeklyRankings : State.rosRankings;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };

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

        for (let i = 0; i < (reqs.QB || 0); i++) fillSlot(`QB${i+1}`, pos => pos === 'QB', false);
        for (let i = 0; i < (reqs.RB || 0); i++) fillSlot(`RB${i+1}`, pos => pos === 'RB', false);
        for (let i = 0; i < (reqs.WR || 0); i++) fillSlot(`WR${i+1}`, pos => pos === 'WR', false);
        for (let i = 0; i < (reqs.TE || 0); i++) fillSlot(`TE${i+1}`, pos => pos === 'TE', false);
        for (let i = 0; i < (reqs.FLEX || 0); i++) fillSlot(`FLEX${i+1}`, pos => ['RB', 'WR', 'TE'].includes(pos), true);
        
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
        for (let i = 0; i < (reqs.K || 0); i++) fillSlot(`K${i+1}`, pos => pos === 'K', false);
        for (let i = 0; i < (reqs.DEF || 0); i++) fillSlot(`DEF${i+1}`, pos => pos === 'DEF', false);

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

                let posStr = p.posRank !== 999 ? `#${p.posRank}` : "-";
                let flexStr = p.flexRank !== 999 ? `#${p.flexRank}` : "-";
                let rankBadge = (p.posRank !== 999 || p.flexRank !== 999)
                    ? (['QB', 'K', 'DEF'].includes(p.pos) || p.flexRank === 999 ? `Pos: ${posStr}` : `Pos: ${posStr} | Flex: ${flexStr}`)
                    : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";

                html += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-label slot-${slotType}">${s.slot}</span>
                        <span class="badge pos-badge ${p.pos} mls-pos-badge-sizing">${p.pos}</span>
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${p.name}${byeStr} ${injBadge} ${earlyTag}</div>
                            <div class="mls-player-row-meta">
                                <span class="badge">${p.team}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
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
                let posStr = p.posRank !== 999 ? `#${p.posRank}` : "-";
                let flexStr = p.flexRank !== 999 ? `#${p.flexRank}` : "-";
                let rankBadge = (p.posRank !== 999 || p.flexRank !== 999)
                    ? (['QB', 'K', 'DEF'].includes(p.pos) || p.flexRank === 999 ? `Pos: ${posStr}` : `Pos: ${posStr} | Flex: ${flexStr}`)
                    : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";

                benchHTML += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-label slot-BN">BN</span>
                        <span class="badge pos-badge ${p.pos} mls-pos-badge-sizing">${p.pos}</span>
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${p.name}${byeStr} ${injBadge} ${earlyTag}</div>
                            <div class="mls-player-row-meta">
                                <span class="badge">${p.team}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        <button class="btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                    </div>
                </div>`;
            });
        } else { 
            benchContainer.classList.add('bench-empty-state');
            benchHTML = `
                <div style="display:flex; justify-content:center; align-items:center; height: 60px; color:var(--text-muted); font-style:italic; font-size:0.9rem;">
                    [ No bench players available ]
                </div>`; 
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
// --- POWER-USER KEYBOARD SHORTCUTS (MLS) ---
document.addEventListener('keydown', (e) => {
    // Escape closes the hamburger drawer from anywhere, so keyboard users have a way to
    // dismiss it without a mouse. The drawerOverlay backdrop is intentionally NOT a tab
    // stop (standard pattern for backdrops); this plus the existing visible close button
    // are the two keyboard-accessible ways to exit the menu.
    const openDrawer = document.getElementById('drawer');
    if (e.key === 'Escape' && openDrawer && openDrawer.classList.contains('open')) {
        window.toggleDrawer();
        return;
    }

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
window.runPositionalStrength = function() {
    let league = getActiveLeague();
    if (!league || !league.globalRosterMap || !league.globalPosMap) {
        if (window.showToast) window.showToast("Please sync a league on the Setup tab first.", { isError: true });
        return;
    }

    const source = document.getElementById('powerRankingsSource')?.value || 'custom';
    const activeRankings = source === 'market' ? State.marketRankings : State.rosRankings;

    if (!activeRankings || activeRankings.length === 0) {
        let msg = source === 'market' 
            ? "Please pull live Market Value data below first." 
            : "Please upload your Rest of Season rankings first.";
        if (window.showToast) window.showToast(msg, { isError: true });
        return;
    }

    let teamScoresMap = {};

    // 1. Initialize scoring objects for every manager
    Object.values(league.globalRosterMap).forEach(owner => {
        if (!teamScoresMap[owner]) {
            teamScoresMap[owner] = { 
                owner: owner, 
                scores: { QB: 0, RB: 0, WR: 0, TE: 0 }, 
                total: 0,
                players: { QB: [], RB: [], WR: [], TE: [] } // For our tooltips
            };
        }
    });

    // 2. Assign Power Points to EVERY rostered player
    Object.keys(league.globalRosterMap).forEach(cleanName => {
        let owner = league.globalRosterMap[cleanName];
        let pos = league.globalPosMap[cleanName];
        
        let data = activeRankings.find(r => r.cleanName === cleanName);
        
        // Use custom rank, or market rank. Default to 300 if not on the board.
        let rank = data ? (data.rank || data.marketVal) : 300; 
        let actualName = data ? data.name : cleanName;
        
        // Power Curve: Heavily weights studs, incrementally adds value for depth
        let powerValue = Math.round(100000 / (rank + 5));
        
        if (teamScoresMap[owner] && ['QB', 'RB', 'WR', 'TE'].includes(pos)) {
            teamScoresMap[owner].scores[pos] += powerValue;
            teamScoresMap[owner].total += powerValue;
            teamScoresMap[owner].players[pos].push({ name: actualName, rank: rank });
        }
    });

    let teamScores = Object.values(teamScoresMap);

    if (teamScores.length === 0) {
        if (window.showToast) window.showToast("Not enough roster data to evaluate.", { isError: true });
        return;
    }

    // 3. Sort player arrays so the tooltip shows the best players at the top
    teamScores.forEach(team => {
        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            team.players[pos].sort((a, b) => a.rank - b.rank);
        });
    });

    // 4. Rank teams 1 to N (Highest Power Score = Rank 1)
    const assignRanks = (arr, posKey, rankKey) => {
        let sorted = [...arr].sort((a, b) => {
            let scoreA = posKey === 'total' ? a.total : a.scores[posKey];
            let scoreB = posKey === 'total' ? b.total : b.scores[posKey];
            return scoreB - scoreA; // Descending Sort
        });
        
        sorted.forEach((team, idx) => {
            let original = arr.find(t => t.owner === team.owner);
            original[rankKey] = idx + 1;
        });
    };

    assignRanks(teamScores, 'QB', 'qbRank');
    assignRanks(teamScores, 'RB', 'rbRank');
    assignRanks(teamScores, 'WR', 'wrRank');
    assignRanks(teamScores, 'TE', 'teRank');
    assignRanks(teamScores, 'total', 'overallRank');

    // Final sort by overall rank for the table display
    teamScores.sort((a, b) => a.overallRank - b.overallRank);
    renderPowerRankingsTable(teamScores);
};

window.renderPowerRankingsTable = function(teamScores) {
    let out = document.getElementById('powerRankingsOutput');
    if (!out) return;
    
    let totalTeams = teamScores.length;

    // Hardcoded hex values prevent CSS root variables from clashing
    const getRankColor = (rank) => {
        if (rank <= Math.ceil(totalTeams / 3)) return '#4ade80'; // Top Tier (Green)
        if (rank > Math.floor(totalTeams * 2 / 3)) return '#fca5a5'; // Bottom Tier (Red)
        return 'var(--text-main, #f8fafc)'; // Middle Tier (Neutral)
    };

    // Helper to generate the nested player tooltips
    const buildTooltip = (players, posName, isRightEdge = false) => {
        let shiftStyle = isRightEdge ? "right: 0; left: auto; transform: translateY(-4px);" : "";
        let html = `<div class="tooltip-text" style="width: 220px; font-weight: normal; z-index: 1005; ${shiftStyle}">`;
        html += `<div style="font-weight: 700; color: var(--text-main); margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border);">${posName} Room</div>`;
        
        if (players.length === 0) {
            html += `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem;">No players rostered.</div>`;
        } else {
            // Show up to the top 6 players at the position
            let listHtml = players.slice(0, 6).map(p => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 12px; font-size: 0.8rem;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;">${p.name}</span>
                    <span style="color: var(--text-muted); font-weight: 600; flex-shrink: 0;">#${p.rank}</span>
                </div>
            `).join('');
            
            html += listHtml;
            if (players.length > 6) {
                html += `<div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 6px; text-align: center;">+ ${players.length - 6} more</div>`;
            }
        }
        return html + `</div>`;
    };

    // Note: We use overflow: visible here so the tooltips don't get clipped by the scroll container
    let html = `
        <div style="overflow: visible; border-radius: 6px; border: 1px solid var(--border-color, #334155); margin-top: 15px;">
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.9rem;">
            <thead>
                <tr style="border-bottom: 2px solid var(--border-color, #334155); color: var(--text-muted, #94a3b8); font-size: 0.8rem; text-transform: uppercase;">
                    <th style="padding: 12px 10px; text-align: left;">Manager</th>
                    <th class="mls-table-header-cell">Ovr</th>
                    <th class="mls-table-header-cell">QB</th>
                    <th class="mls-table-header-cell">RB</th>
                    <th class="mls-table-header-cell">WR</th>
                    <th class="mls-table-header-cell">TE</th>
                </tr>
            </thead>
            <tbody>
    `;

    teamScores.forEach(t => {
        let isYou = t.owner === "You" ? "font-weight: bold; background: rgba(147, 197, 253, 0.08);" : "";
        
        html += `
            <tr style="border-bottom: 1px solid var(--border-color, #334155); ${isYou}">
                <td style="padding: 12px 10px; text-align: left; color: var(--text-main, #f8fafc);">${t.owner}</td>
                
                <td style="padding: 12px 10px; font-weight: 800; color: ${getRankColor(t.overallRank)};">
                    ${t.overallRank}
                </td>
                
                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.qbRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.qbRank}</span>
                        ${buildTooltip(t.players.QB, 'QB')}
                    </div>
                </td>
                
                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.rbRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.rbRank}</span>
                        ${buildTooltip(t.players.RB, 'RB')}
                    </div>
                </td>
                
                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.wrRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.wrRank}</span>
                        ${buildTooltip(t.players.WR, 'WR', true)}
                    </div>
                </td>
                
                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.teRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.teRank}</span>
                        ${buildTooltip(t.players.TE, 'TE', true)}
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    out.innerHTML = html;
    
    out.style.display = 'none';
    setTimeout(() => {
        out.style.display = 'block';
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
};

window.runGlobalInjuryAudit = async function(btn) {
    const outputEl = document.getElementById('injuryAuditOutput');
    const origText = btn.innerHTML;
    btn.innerHTML = "Scanning Leagues...";
    btn.disabled = true;
    btn.style.opacity = "0.7";
    outputEl.innerHTML = "";

    try {
        if (!State.leagues || State.leagues.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">No leagues synced.</span>`;
            return;
        }

        // Fetch global player map to check current injury status
        const playerMapRes = await fetch('https://api.sleeper.app/v1/players/nfl');
        const playerMap = await playerMapRes.json();

        let auditResults = [];

        for (let league of State.leagues) {
            if (!league.leagueId || league.leagueId.startsWith('manual_')) continue;

            const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${league.leagueId}/rosters`);
            const rosters = await rostersRes.json();
            
            // Resolve User ID
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${league.username}`);
            const userData = await userRes.json();
            const userId = userData.user_id;

            const myRoster = rosters.find(r => r.owner_id === userId);
            if (!myRoster) continue;

            const starters = myRoster.starters || [];
            const reserve = myRoster.reserve || [];
            const allPlayers = myRoster.players || [];
            let leagueIssues = [];

            allPlayers.forEach(pId => {
                let p = playerMap[pId];
                if (!p) return;

                let isInjured = p.injury_status === "Out" || ["IR", "PUP", "NFI", "Suspended"].includes(p.status);
                
                if (isInjured) {
                    let isStarting = starters.includes(pId);
                    let isBench = !isStarting && !reserve.includes(pId);

                    if (isStarting) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Starting Lineup" });
                    } else if (isBench) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Active Bench (Move to IR)" });
                    }
                }
            });

            if (leagueIssues.length > 0) {
                auditResults.push({ leagueName: league.name, format: league.formatBadge || "", issues: leagueIssues });
            }
        }

        if (auditResults.length === 0) {
            outputEl.innerHTML = `<div class="scout-result-card" style="justify-content:center; color:var(--primary-green);">All clear! No injured players found in active slots across your leagues.</div>`;
        } else {
            let html = "";
            auditResults.forEach(res => {
                html += `<div style="font-weight:bold; color:#fca5a5; margin: 1rem 0 0.5rem 0;">${res.leagueName} <span style="color:var(--text-muted); font-size: 0.75rem; font-weight: normal;">${res.format}</span></div>`;
                res.issues.forEach(issue => {
                    html += `
                    <div class="scout-result-card" style="border-color: #ef4444;">
                        <div>
                            <div class="mls-item-name">${issue.name}</div>
                            <div class="mls-meta-row">
                                <span style="color: #fca5a5; font-weight: bold;">${issue.status}</span>
                            </div>
                        </div>
                        <div class="mls-text-right">
                            <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${issue.location}</span>
                        </div>
                    </div>`;
                });
            });
            outputEl.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        outputEl.innerHTML = `<span class="mls-error-text">Failed to run audit. Check console for details.</span>`;
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
};
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