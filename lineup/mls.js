/**
 * Fantasy Football Season & Lineup Strategist - Core Logic
 * Refactored for modular encapsulation, performance, and clean architecture.
 */

// Pilot ES module extraction (see rankingsParser.js for rationale) -- this is the only
// piece of mls.js currently split out. import statements must live at a module's top
// level, which is why this sits above the IIFE rather than inside it; the imported
// function is still just a normal binding the IIFE's closures can reference below.
import { parseRankingsFiles } from './rankingsParser.js';
import { getNflState, getSleeperUser, getSleeperLeague, getSleeperLeagueUsers, getSleeperLeagueRosters, getSleeperUserLeagues, getSleeperPlayerMap } from './sleeperApi.js';
import { fetchMarketConsensusData } from './marketDataApi.js';

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

    // ESPN's scoreboard endpoint (see refreshGameTimes below) abbreviates a handful of teams
    // differently than Sleeper/this app do. Washington is the current known mismatch (ESPN:
    // "WSH", everywhere else in this app: "WAS") -- mapped here so State.gameTimesByTeam keys
    // line up with the same team codes used by TEAM_BYES, league.roster, etc.
    const ESPN_TEAM_ALIASES = { "WSH": "WAS" };

    // Per-type field/key mapping shared by the Named Ranking Sets feature (see the full
    // explanation further down, near saveRankingsAsSet) -- keeping ROS and Weekly's parallel
    // state keys, localStorage keys, and DOM element ids in one lookup table instead of two
    // near-duplicate code paths. Declared up here (rather than next to its main usage) because
    // switchActiveLeague(), just below, already needs it during page load.
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
        tradeSettings: JSON.parse(localStorage.getItem('mls_trade_settings')) || { waiverAdjustment: true, waiverAdjustmentValue: 500 },
        syncLogs: JSON.parse(localStorage.getItem('mls_sync_logs')) || [],
        sosMap: JSON.parse(localStorage.getItem('mds_season_sos')) || {},
        lockedPlayersMap: JSON.parse(localStorage.getItem('mds_season_locks_map')) || {},
        // Per-league, per-week list of player ids the person has explicitly told the auto-lock
        // feature (see optimizeLineup) to back off of -- the failsafe for when gameTimesByTeam
        // or Sleeper's synced starters turn out to be wrong about a specific player. Deliberately
        // NOT part of lockedPlayersMap: that list is a season-long, user-curated set of "always
        // start this player" decisions, while this is a narrow, week-scoped correction for one
        // player's auto-detected state. Shape: { [leagueId]: { week: N, ids: [...] } } -- the
        // week is stored alongside the ids so a stale override from a prior week (which would no
        // longer make sense once gameTimesByTeam has moved on) is ignored rather than silently
        // carried forward; see isAutoLockOverridden below.
        autoLockOverridesMap: JSON.parse(localStorage.getItem('mls_autolock_overrides_map')) || {},
        manualStartersMap: JSON.parse(localStorage.getItem('mds_season_manual_starters')) || {},
        manualBenchMap: JSON.parse(localStorage.getItem('mds_season_manual_bench')) || {},
        swapSourceId: null,
        touchStartX: 0,
        touchEndX: 0,
        // Not persisted -- refreshed once per page load from Sleeper's state endpoint (see
        // refreshCurrentNflWeek() below). Starts null and stays null if that fetch fails or
        // hasn't resolved yet; every consumer below treats null as "unknown" and simply skips
        // bye-week detection rather than guessing, so a slow/failed fetch degrades to the old
        // (bye-unaware) behavior instead of showing wrong information.
        currentNflWeek: null,
        // Not persisted -- team -> ISO kickoff timestamp for the current week, refreshed from
        // ESPN's scoreboard endpoint (see refreshGameTimes() below) once currentNflWeek is
        // known. Starts empty and stays empty if the fetch fails; every consumer treats a
        // missing entry as "unknown kickoff" and skips FLEX-kickoff reordering / the kickoff
        // badge for that player rather than guessing.
        gameTimesByTeam: {},
        // Which week gameTimesByTeam was last successfully fetched for, so a stale cache from
        // an earlier week doesn't silently get reused if currentNflWeek changes mid-session.
        gameTimesFetchedForWeek: null,
        // Not persisted -- undo/redo history for lineup edits (swaps, lock toggles, and
        // optimizer re-runs), per league. Deliberately session-only rather than saved to
        // localStorage: this is "undo my last few clicks," not part of the lineup itself,
        // and most users' mental model of undo (browser, text editors, etc.) is that it
        // doesn't survive closing the tab. Capped at MAX_UNDO_STACK_SIZE entries per league
        // (see pushLineupUndoSnapshot) since a long session could otherwise accumulate an
        // unbounded number of small snapshots.
        lineupUndoStackMap: {},
        lineupRedoStackMap: {}
    };

    const MAX_UNDO_STACK_SIZE = 20;

    // Deep-copies the current lineup-relevant state for one league (starters, bench, and the
    // manual lock list) into a plain snapshot object, suitable for pushing onto the undo/redo
    // stacks below. JSON round-trip is fine here -- everything in these three structures is
    // plain data (no functions, dates, etc), and the arrays involved are small (one roster's
    // worth of players), so the cost of this is negligible even called on every lineup edit.
    function snapshotLineupState(leagueId) {
        return {
            starters: JSON.parse(JSON.stringify(State.manualStartersMap[leagueId] || [])),
            bench: JSON.parse(JSON.stringify(State.manualBenchMap[leagueId] || [])),
            locks: JSON.parse(JSON.stringify(State.lockedPlayersMap[leagueId] || []))
        };
    }

    function restoreLineupState(leagueId, snapshot) {
        State.manualStartersMap[leagueId] = snapshot.starters;
        State.manualBenchMap[leagueId] = snapshot.bench;
        State.lockedPlayersMap[leagueId] = snapshot.locks;
        localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
        localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));
    }

    // Called at the start of every lineup-mutating action (swap, lock toggle, unlock-all,
    // optimizer re-run) with a snapshot of the state as it was JUST BEFORE that action, so
    // Ctrl+Z has something to restore. Making a new edit always clears the redo stack -- the
    // same convention as every other undo/redo system: redo only makes sense for undos you
    // haven't since invalidated by doing something new.
    function pushLineupUndoSnapshot(leagueId) {
        if (!leagueId) return;
        if (!State.lineupUndoStackMap[leagueId]) State.lineupUndoStackMap[leagueId] = [];
        State.lineupUndoStackMap[leagueId].push(snapshotLineupState(leagueId));
        if (State.lineupUndoStackMap[leagueId].length > MAX_UNDO_STACK_SIZE) {
            State.lineupUndoStackMap[leagueId].shift();
        }
        State.lineupRedoStackMap[leagueId] = [];
    }

    window.undoLineupChange = function() {
        const leagueId = State.activeLeagueId;
        const undoStack = State.lineupUndoStackMap[leagueId];
        if (!leagueId || !undoStack || undoStack.length === 0) return;

        if (!State.lineupRedoStackMap[leagueId]) State.lineupRedoStackMap[leagueId] = [];
        State.lineupRedoStackMap[leagueId].push(snapshotLineupState(leagueId));

        restoreLineupState(leagueId, undoStack.pop());
        renderLineupUI();
        if (typeof window.showToast === 'function') window.showToast("Undid last lineup change");
    };

    window.redoLineupChange = function() {
        const leagueId = State.activeLeagueId;
        const redoStack = State.lineupRedoStackMap[leagueId];
        if (!leagueId || !redoStack || redoStack.length === 0) return;

        if (!State.lineupUndoStackMap[leagueId]) State.lineupUndoStackMap[leagueId] = [];
        State.lineupUndoStackMap[leagueId].push(snapshotLineupState(leagueId));

        restoreLineupState(leagueId, redoStack.pop());
        renderLineupUI();
        if (typeof window.showToast === 'function') window.showToast("Redid lineup change");
    };

    // Refreshes State.currentNflWeek from Sleeper's public NFL state endpoint. Fire-and-forget:
    // called once from window.onload, with no loading indicator and no retry, since this only
    // upgrades the lineup optimizer's bye-week awareness -- if it's slow or fails, the app works
    // exactly as it did before this existed.
    function refreshCurrentNflWeek() {
        getNflState()
            .then(data => {
                if (data && typeof data.week === 'number') {
                    State.currentNflWeek = data.week;
                    // Kickoff times are keyed by week, so we can't fetch them until we know
                    // which week we're on -- chain it here rather than firing both requests
                    // independently at page load.
                    refreshGameTimes();
                }
            })
            .catch(() => { /* leave State.currentNflWeek as null; see comment above */ });
    }

    // Refreshes State.gameTimesByTeam (team -> ISO kickoff timestamp) for the current NFL week
    // from ESPN's public scoreboard endpoint. Like refreshCurrentNflWeek above, this is
    // fire-and-forget with no loading indicator and no retry: it only powers the FLEX-kickoff
    // optimizer and the kickoff badge, both of which degrade gracefully (no reordering, no
    // badge) if this never resolves. Note this is an unofficial/undocumented ESPN endpoint --
    // like the Sleeper endpoints elsewhere in this app, it could change shape or start
    // rate-limiting without notice, which is exactly why every consumer treats a missing team
    // entry as "unknown" instead of assuming success.
    function refreshGameTimes() {
        const week = State.currentNflWeek;
        if (week == null) return;
        if (State.gameTimesFetchedForWeek === week && Object.keys(State.gameTimesByTeam).length > 0) return;

        fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data || !Array.isArray(data.events)) return;
                const map = {};
                data.events.forEach(evt => {
                    const iso = evt.date; // ISO 8601 UTC kickoff, shared by both competitors in the event
                    const comp = evt.competitions && evt.competitions[0];
                    if (!iso || !comp || !Array.isArray(comp.competitors)) return;
                    comp.competitors.forEach(c => {
                        let abbr = c.team && c.team.abbreviation;
                        if (!abbr) return;
                        abbr = ESPN_TEAM_ALIASES[abbr] || abbr;
                        map[abbr] = iso;
                    });
                });
                if (Object.keys(map).length === 0) return; // treat an empty/malformed response as a failed fetch
                State.gameTimesByTeam = map;
                State.gameTimesFetchedForWeek = week;

                // If the person is already looking at the lineup tab, refresh it so kickoff
                // badges and FLEX ordering reflect the newly-arrived data without requiring a
                // manual re-optimize.
                const activeTab = document.querySelector('.tab-content.active');
                if (activeTab && activeTab.id === 'lineupTab' && typeof window.optimizeLineup === 'function') {
                    window.optimizeLineup(false);
                }
            })
            .catch(() => { /* leave State.gameTimesByTeam as {}; see comment above */ });
    }

    // Statuses from Sleeper's player sync (see rosterDetails in processSleeperData) that mean
    // a player has ~zero chance of playing this week. Deliberately excludes "Q" (Questionable)
    // and "D" (Doubtful) -- those are still game-time calls, not a reason to auto-bench someone
    // your rankings already have rated highly.
    const HARD_OUT_STATUSES = ['OUT', 'IR', 'SUS', 'PUP', 'NFI'];

    // True if a player should be avoided as an optimizer pick this week -- on bye, or flagged
    // with a hard-out status above -- unless no eligible alternative exists at all (see
    // findBestStarterIndex), in which case they're started anyway rather than leaving a slot
    // empty. Locked players bypass this check entirely at the call sites below: a lock is an
    // explicit instruction to start someone regardless of bye/injury status.
    function isUnavailableThisWeek(p) {
        const onBye = State.currentNflWeek != null && TEAM_BYES[p.team] === State.currentNflWeek;
        const hardOut = p.inj && HARD_OUT_STATUSES.includes(p.inj);
        return onBye || hardOut;
    }

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
        const hamburgerBtn = document.querySelector('.hamburger-btn');

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
        // handleSwipe needs the event itself (not just the recorded X positions) so it can tell
        // whether the touch ended inside a scrollable/interactive element and skip the tab swipe.
        mainAppEl.addEventListener('touchend', e => { State.touchEndX = e.changedTouches[0].screenX; handleSwipe(e); }, {passive: true});
    }

    function handleSwipe(e) {
        // Skip the tab-swipe gesture entirely if the touch happened over a scrollable table,
        // grid, or form control -- otherwise a horizontal scroll/drag inside those elements
        // gets misread as a request to switch tabs.
        if (e && e.target && e.target.closest('.roster-container-wrapper, .lineup-container-wrapper, .sos-table-wrapper, select, input, textarea')) {
            return; 
        }

        // 20% of viewport width, with a floor so this doesn't get too twitchy on narrow
        // phones (e.g. 20% of a 320px-wide screen would be 64px, which is on the edge of
        // triggering from an imprecise scroll/tap rather than a deliberate swipe).
        const swipeThreshold = Math.max(80, window.innerWidth * 0.2);
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

        // Announced to screen readers via the aria-live region in index.html -- covers every
        // way a tab can change (swipe, number-key shortcuts, hamburger menu, browser back/
        // forward), not just one of them, since they all funnel through this one function.
        // Reads the nav button's own visible label rather than a separate hardcoded name map,
        // so it can't drift out of sync if a tab's label is ever renamed.
        const announcer = document.getElementById('tabChangeAnnouncer');
        if (announcer && activeNavBtn) {
            const label = activeNavBtn.querySelector('span');
            if (label) announcer.textContent = `${label.textContent} tab`;
        }

        if (tabId === 'lineup') window.optimizeLineup(false);
        if (tabId === 'roster') loadRosterTab();
        if (tabId === 'setup') refreshLeagueDropdown();
        window.scrollTo(0, 0);

        if (typeof updatePulsePrompts === 'function') updatePulsePrompts();

        // Push to browser history (unless explicitly skipped, e.g. when we're the ones
        // responding to a popstate event below) so the native back button works.
        if (!skipHistory) {
            history.pushState({ tab: tabId }, '', `#${tabId}`);
        }
    };

    // Catches the native back/forward button and replays it as a tab switch, passing
    // skipHistory=true so we don't push a duplicate entry back onto the history stack.
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
        
        // Dashboard Sync Card Pulse
        const syncCard = document.getElementById('setupSyncCard');
        if (syncCard) {
            if (State.leagues.length === 0) syncCard.classList.add('pulse-border');
            else syncCard.classList.remove('pulse-border');
        }

        // ROS Rankings Pulse
        const rosCard = document.getElementById('rosRankingsCard');
        if (rosCard) {
            if (State.leagues.length > 0 && State.rosRankings.length === 0) rosCard.classList.add('pulse-border');
            else rosCard.classList.remove('pulse-border');
        }

        // Weekly Rankings Pulse
        const weeklyCard = document.getElementById('weeklyRankingsCard');
        if (weeklyCard) {
            if (State.leagues.length > 0 && State.weeklyRankings.length === 0) weeklyCard.classList.add('pulse-border');
            else weeklyCard.classList.remove('pulse-border');
        }

        // Navigation Element Pulses (Only Logo, and only when NOT on Dashboard tab)
        const setupNav = document.querySelector('.logo-container');
        const setupTab = document.getElementById('setupTab');
        
        if (setupNav) {
            setupNav.classList.remove('nav-pulse');
            // Only pulse the logo if they have zero leagues AND they are currently on another tab
            if (State.leagues.length === 0 && setupTab && !setupTab.classList.contains('active')) {
                setupNav.classList.add('nav-pulse');
            }
        }
    }

// Minimal HTML-attribute escaping for safe rendering
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Parses an HTML string into a DocumentFragment using a detached <template>, then swaps
// it into `container` in one operation. The parsing happens off-DOM (the template's
// content is never attached to the live tree), and the fragment's children are moved
// into place in a single call -- avoids the container sitting attached-but-empty
// mid-rebuild the way `container.innerHTML = html` does.
function renderHTMLInto(container, html) {
    if (!container) return;
    const template = document.createElement('template');
    template.innerHTML = html;
    container.replaceChildren(template.content);
}

// --- INDEXEDDB CACHE FOR THE SLEEPER PLAYER MAP ---
// Moved to sleeperApi.js -- getSleeperPlayerMap is now imported at the top of this file.

// Autocomplete Search Index
let _playerSearchIndexPromise = null;
// Shown at most once per outage -- getPlayerSearchIndex() is called on every autocomplete
// keystroke, so without this a network failure would toast repeatedly as the user kept
// typing. Resets to false on the next successful fetch, so a later, separate outage still
// gets its own toast rather than being silenced forever by this one.
let _playerSearchIndexErrorShown = false;
function getPlayerSearchIndex() {
    if (_playerSearchIndexPromise) return _playerSearchIndexPromise;
    _playerSearchIndexPromise = getSleeperPlayerMap().then(map => {
        _playerSearchIndexErrorShown = false;
        const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
        const index = [];
        Object.values(map).forEach(p => {
            if (!p.first_name || !FANTASY_POS.includes(p.position)) return;
            const name = `${p.first_name} ${p.last_name}`.trim();
            index.push({ name, pos: p.position, team: p.team || 'FA', searchKey: name.toLowerCase() });
        });
        return index;
    }).catch(err => {
        // Clear the cached promise so the next attempt (next keystroke, or after
        // reconnecting) actually retries instead of replaying this same rejected promise
        // forever -- unlike a successful result, a rejection here was never being retried.
        _playerSearchIndexPromise = null;
        if (!_playerSearchIndexErrorShown && typeof window.showToast === 'function') {
            _playerSearchIndexErrorShown = true;
            window.showToast("Couldn't load player data for search. Check your connection and try again.", { isError: true });
        }
        throw err;
    });
    return _playerSearchIndexPromise;
}

// Autocomplete Dropdown Logic
function attachPlayerAutocomplete(inputEl, onSelect) {
    if (!inputEl || inputEl.dataset.autocompleteAttached) return;
    inputEl.dataset.autocompleteAttached = '1';

    const wrap = document.createElement('div');
    wrap.className = 'autocomplete-wrap';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);

    let matches = [];
    let highlightedIdx = -1;

    function render() {
        if (matches.length === 0) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; return; }
        dropdown.innerHTML = matches.map((p, i) => `
            <div class="autocomplete-item${i === highlightedIdx ? ' highlighted' : ''}" role="option" data-idx="${i}">
                <span>${escapeHtml(p.name)}</span>
                <span class="autocomplete-meta">${p.pos} ·${p.team}</span>
            </div>
        `).join('');
        dropdown.style.display = 'block';
    }

    function close() {
        matches = [];
        highlightedIdx = -1;
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }

    function select(p) {
        inputEl.value = p.name;
        close();
        if (typeof onSelect === 'function') onSelect(p);
    }

    inputEl.addEventListener('input', () => {
        const q = inputEl.value.trim().toLowerCase();
        highlightedIdx = -1;
        if (q.length < 2) { close(); return; }
        getPlayerSearchIndex().then(index => {
            if (inputEl.value.trim().toLowerCase() !== q) return;
            const starts = [], contains = [];
            for (const p of index) {
                if (p.searchKey.startsWith(q)) { starts.push(p); if (starts.length >= 8) break; }
                else if (contains.length < 8 && p.searchKey.includes(q)) contains.push(p);
            }
            matches = starts.concat(contains).slice(0, 8);
            render();
        }).catch(() => {});
    });

    dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        e.preventDefault();
        select(matches[parseInt(item.dataset.idx, 10)]);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (matches.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); highlightedIdx = Math.min(highlightedIdx + 1, matches.length - 1); render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlightedIdx = Math.max(highlightedIdx - 1, 0); render(); }
        else if (e.key === 'Enter') { if (highlightedIdx !== -1) { e.preventDefault(); select(matches[highlightedIdx]); } }
        else if (e.key === 'Escape') { close(); }
    });

    inputEl.addEventListener('blur', () => setTimeout(close, 150));
}

// Levenshtein (edit) distance math
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let curr = [i];
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr.push(Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost));
        }
        prev = curr;
    }
    return prev[n];
}

// "Did you mean" Matcher
function findClosestRankedName(inputName) {
    const candidates = new Map();
    (State.rosRankings || []).forEach(r => candidates.set(r.cleanName, r.name));
    (State.weeklyRankings || []).forEach(r => candidates.set(r.cleanName, r.name));

    const target = normalizeName(inputName);
    if (!target) return null;

    let best = null, bestDist = Infinity;
    candidates.forEach((displayName, cleanName) => {
        const dist = levenshtein(target, cleanName);
        if (dist < bestDist) { bestDist = dist; best = displayName; }
    });

    const threshold = Math.max(2, Math.floor(target.length * 0.25));
    return (best && bestDist > 0 && bestDist <= threshold) ? best : null;
}

function attachScoutSuggestionHandler(outputElId) {
    const el = document.getElementById(outputElId);
    if (!el) return;
    el.addEventListener('click', (e) => {
        const link = e.target.closest('.scout-suggest-link');
        if (!link) return;
        e.preventDefault();
        const inputEl = document.getElementById(link.dataset.inputId);
        if (!inputEl) return;
        const original = link.dataset.original;
        const idx = inputEl.value.indexOf(original);
        if (idx !== -1) {
            inputEl.value = inputEl.value.slice(0, idx) + link.dataset.suggested + inputEl.value.slice(idx + original.length);
        }
        window.runScout(link.dataset.scoutType);
    });
}

    window.onload = function() {
        attachPlayerAutocomplete(document.getElementById('manualName'), (p) => {
        const posEl = document.getElementById('manualPos');
        const teamEl = document.getElementById('manualTeam');
        if (posEl) posEl.value = p.pos;
        if (teamEl) teamEl.value = p.team;
        });
        attachScoutSuggestionHandler('waiverOutput');
        attachScoutSuggestionHandler('tradeOutput');
        populateEarlyGameDropdown();
        refreshLeagueDropdown();
        updateRankingsMetaDisplay();
        generateSoSGrid();
        checkForDraftStrategistHandoff();
        applyMarketSettingsToUI();
        applyTradeSettingsToUI();
        updatePulsePrompts();
        refreshCurrentNflWeek();
        if (typeof renderSyncLogs === 'function') renderSyncLogs();

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

    // Returns a "BYE" badge only when the player's team is on a bye THIS week (per the
    // currently-known NFL week) -- not just whenever they have a bye scheduled at some point
    // this season. Returns "" (no badge) if the current week isn't known yet, rather than
    // guessing. Used alongside the always-present "(##)" bye-week text so a roster/lineup card
    // still shows the raw week number for season-long planning either way.
    function getByeBadgeHTML(team) {
        if (State.currentNflWeek == null || TEAM_BYES[team] !== State.currentNflWeek) return "";
        return `<span class="badge bye-badge">BYE</span>`;
    }

    // Formats an ISO kickoff timestamp into a short label in the person's local timezone, e.g.
    // "Sun 1:05 PM". Returns "" for anything unparseable so callers can treat it the same as
    // "no data" rather than rendering a broken badge.
    function formatKickoffLabel(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return `${weekday} ${time}`;
    }

    // Returns a kickoff-time badge for a team, or "" if we don't have a kickoff time for them
    // this week (fetch hasn't resolved, team not found in this week's schedule, bye week, etc).
    // Once kickoff has passed, shows "Started" instead of the (now-stale) clock time -- this is
    // also the visual cue that pairs with the auto-lock behavior below (see hasKickedOff and
    // optimizeLineup's autoLocked handling).
    function getKickoffBadgeHTML(team) {
        if (!team || team === "FA") return "";
        const iso = State.gameTimesByTeam[team];
        if (!iso) return "";
        const kickoffMs = new Date(iso).getTime();
        if (isNaN(kickoffMs)) return "";
        if (Date.now() >= kickoffMs) return `<span class="badge kickoff-badge kickoff-started">Started</span>`;
        const label = formatKickoffLabel(iso);
        if (!label) return "";
        return `<span class="badge kickoff-badge">${label}</span>`;
    }

    // True once a player's team has kicked off this week per State.gameTimesByTeam, false if
    // that game hasn't started yet OR we simply don't have kickoff data for them (never assume
    // a game has started without evidence -- see refreshGameTimes' graceful-degradation notes).
    function hasKickedOff(player) {
        if (!player || !player.team) return false;
        const iso = State.gameTimesByTeam[player.team];
        if (!iso) return false;
        const ms = new Date(iso).getTime();
        return !isNaN(ms) && Date.now() >= ms;
    }

    // Finds every current starter who shares the single soonest upcoming kickoff moment
    // (not just one player), and renders a small status line for the top of the lineup card.
    // The point is specifically to catch "I switched leagues to check on something and forgot
    // I still need to set a starter here" -- so this only fires while there's a real starter
    // slot filled with a player whose game hasn't started, not for bench players or empty
    // slots. Returns "" (nothing rendered) once every starter with known kickoff data has
    // already locked -- an "all clear" state doesn't need a persistent banner competing for
    // attention.
    //
    // Grouping by the exact earliest timestamp (not just showing whoever happens to be first
    // in the starters array) matters on a slate where several starters kick off at once, e.g.
    // a full Sunday 1pm slot -- showing only one name there would wrongly imply the others
    // aren't also about to lock. With more than one name, the banner collapses to a count by
    // default (so a big slate doesn't turn this into a wall of text) and expands on tap to
    // show exactly who, without needing to scroll into the lineup below to find out.
    function getNextLockCountdownHTML(starters) {
        let earliestMs = null;
        starters.forEach(s => {
            if (!s.player || !s.player.team || hasKickedOff(s.player)) return;
            const iso = State.gameTimesByTeam[s.player.team];
            if (!iso) return;
            const ms = new Date(iso).getTime();
            if (isNaN(ms)) return;
            if (earliestMs === null || ms < earliestMs) earliestMs = ms;
        });

        if (earliestMs === null) return "";

        const lockingPlayers = starters
            .filter(s => {
                if (!s.player || !s.player.team || hasKickedOff(s.player)) return false;
                const iso = State.gameTimesByTeam[s.player.team];
                return iso && new Date(iso).getTime() === earliestMs;
            })
            .map(s => s.player);

        const totalMinutes = Math.max(0, Math.round((earliestMs - Date.now()) / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const countdownStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        const label = formatKickoffLabel(new Date(earliestMs).toISOString());
        const clockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

        if (lockingPlayers.length <= 1) {
            const p = lockingPlayers[0];
            return `<div class="lineup-lock-countdown">
                ${clockSvg}
                <span>Next lock: <strong>${escapeHtml(p.name)}</strong> &middot; ${label} <span class="lineup-lock-countdown-time">(in ${countdownStr})</span></span>
            </div>`;
        }

        const namesHTML = lockingPlayers.map(p => escapeHtml(p.name)).join(', ');
        const chevronSvg = `<svg class="chevron-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        return `<div id="lockCountdownCard" class="lineup-lock-countdown-collapsible">
            <div class="lock-countdown-header" onclick="toggleLockCountdown()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleLockCountdown();}" role="button" tabindex="0" aria-expanded="false">
                ${clockSvg}
                <span>Next lock: <strong>${lockingPlayers.length} players</strong> &middot; ${label} <span class="lineup-lock-countdown-time">(in ${countdownStr})</span></span>
                ${chevronSvg}
            </div>
            <div class="lock-countdown-detail">${namesHTML}</div>
        </div>`;
    }

    // Sleeper's own snapshot of who's actually starting, as of the last sync -- the ground
    // truth for "did this player actually get started in real life" once their game has
    // kicked off, independent of anything this app previously recommended. Shared by
    // renderLineupUI (the "matches Sleeper" banner / per-player mismatch badges) and
    // optimizeLineup (auto-lock, below) so both read the exact same filtered list.
    function getValidSleeperStarterIds(league) {
        return (league && league.sleeperStarters) ? league.sleeperStarters.filter(id => id && id !== "0") : [];
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
        if (typeof updateLeagueNavUI === 'function') updateLeagueNavUI();
    }

    function renderLeagueManager() {
        const cmdCenter = document.getElementById('dashboardCommandCenter');
        const tbody = document.getElementById('dashboardMatrixBody');
        
        if (!cmdCenter || !tbody) return;

        if (State.leagues.length === 0) {
            cmdCenter.style.display = 'none';
            return;
        }

        cmdCenter.style.display = 'block';
        let html = "";
        
        State.leagues.forEach((l, index) => {
            // --- Rankings Status Check ---
            let wDate = null;
            let wSet = l.weeklyRankingSetId ? State.rankingSets.weekly.find(s => s.id === l.weeklyRankingSetId) : null;
            if (wSet) wDate = wSet.updatedAt;
            else if (l.weeklyRankingsUpdatedAt) wDate = l.weeklyRankingsUpdatedAt;
            
            let wFresh = getRankingsFreshness(wDate, 6);
            let wIsStale = !wFresh || wFresh.isStale;

            let rankIcon = wIsStale 
                ? `<span class="status-icon status-warn tooltip-container"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span class="tooltip-text">Weekly Rankings Stale or Missing</span></span>`
                : `<span class="status-icon status-good tooltip-container"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="tooltip-text">Weekly Rankings Fresh</span></span>`;

            // --- Lineup Match Check ---
            let isBestBall = l.formatBadge && l.formatBadge.toLowerCase().includes("best ball");
            let starters = State.manualStartersMap[l.leagueId] || [];
            let optStarterIds = starters.filter(s => s.player).map(s => s.player.id);
            let sleeperStarters = (l.sleeperStarters || []).filter(id => id && id !== "0");
            
            let isMatch = false;
            let isSetup = optStarterIds.length > 0;
            
            if (isSetup && sleeperStarters.length > 0) {
                let sleeperSet = new Set(sleeperStarters);
                let optSet = new Set(optStarterIds);
                isMatch = sleeperSet.size === optSet.size && [...sleeperSet].every(id => optSet.has(id));
            } else if (isSetup && l.leagueId.startsWith('manual_')) {
                isMatch = true; 
            }

            let lineupIcon = '';
            if (isBestBall) {
                lineupIcon = `<span class="badge tooltip-container" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border); padding: 2px 6px;">BB<span class="tooltip-text">Best Ball (No Lineup Management)</span></span>`;
            } else if (!isSetup) {
                lineupIcon = `<span class="status-icon tooltip-container" style="background: rgba(255,255,255,0.05); color: var(--text-muted);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span class="tooltip-text">Not Optimized Yet</span></span>`;
            } else if (isMatch) {
                lineupIcon = `<span class="status-icon status-good tooltip-container"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="tooltip-text">Matches Sleeper Lineup</span></span>`;
            } else {
                lineupIcon = `<span class="status-icon status-danger tooltip-container"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span class="tooltip-text">Action Required: Differs from Sleeper Lineup</span></span>`;
            }

            // --- Early Game Check ---
            let hasEarly = false;
            if (isSetup) {
                hasEarly = starters.some(s => s.player && isEarlyPlayer(s.player.team));
            }
            let earlyIcon = hasEarly ? `<span class="badge early-badge tooltip-container" style="padding: 2px 4px; font-size: 0.6rem; margin-left: 6px; cursor: help;">EARLY<span class="tooltip-text">Starter has an Early Game</span></span>` : '';

            // --- Layout ---
            let formatText = l.formatBadge ? `<div style="color:var(--text-muted); font-size: 0.75rem; margin-top: 2px; font-weight: normal;">${l.formatBadge}</div>` : "";
            let activeStyle = l.leagueId === State.activeLeagueId ? 'background: rgba(16, 185, 129, 0.08);' : '';
            let activeIndicator = l.leagueId === State.activeLeagueId ? `<div style="width: 3px; height: 100%; background: var(--primary-green); position: absolute; left: 0; top: 0;"></div>` : '';

            html += `
            <tr style="position: relative; ${activeStyle}">
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); position: relative; cursor: pointer;" onclick="switchActiveLeague('${l.leagueId}')">
                    ${activeIndicator}
                    <div style="padding-left: 6px;">
                        <strong style="color: var(--text-main); font-size: 0.9rem;">${l.name}</strong>
                        ${formatText}
                    </div>
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); text-align: center;">
                    ${rankIcon}
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); text-align: center; white-space: nowrap;">
                    ${lineupIcon} ${earlyIcon}
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap;">
                    <button class="btn-sm btn-secondary" style="padding: 0.3rem 0.5rem;" onclick="moveLeague(${index}, -1)" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
                    <button class="btn-sm btn-secondary" style="padding: 0.3rem 0.5rem;" onclick="moveLeague(${index}, 1)" ${index === State.leagues.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
                    <button class="btn-sm btn-danger" style="padding: 0.3rem 0.5rem; margin-left: 0.3rem;" onclick="deleteLeagueManager('${l.leagueId}')">✕</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
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
        
        // Keep UI elements in sync with the active state
        const headerSelect = document.getElementById('headerLeagueSelect');
        if (headerSelect && headerSelect.value !== leagueId) headerSelect.value = leagueId;
        if (typeof renderLeagueManager === 'function') renderLeagueManager();
        
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

        if (typeof updateLeagueNavUI === 'function') updateLeagueNavUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });

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

    window.cycleLeague = function(direction) {
        if (!State.leagues || State.leagues.length <= 1) return;
        
        const currentIndex = State.leagues.findIndex(l => l.leagueId === State.activeLeagueId);
        if (currentIndex === -1) return;
        
        let newIndex = currentIndex + direction;
        
        // Wrap around seamlessly
        if (newIndex < 0) newIndex = State.leagues.length - 1;
        if (newIndex >= State.leagues.length) newIndex = 0;
        
        const newLeagueId = State.leagues[newIndex].leagueId;
        
        // Ensure the dropdown UI updates visually before triggering the data switch
        const selectEl = document.getElementById('headerLeagueSelect');
        if (selectEl) selectEl.value = newLeagueId;
        
        switchActiveLeague(newLeagueId);
    };

    function updateLeagueNavUI() {
        const prevBtn = document.getElementById('prevLeagueBtn');
        const nextBtn = document.getElementById('nextLeagueBtn');
        
        if (!State.leagues || State.leagues.length <= 1) {
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        if (prevBtn) prevBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = false;
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

    // Compares two roster arrays (same shape as rosterDetails: {cleanName, name, inj, ...}) by
    // cleanName and returns:
    //   - added/dropped: display names for players who entered/left the roster
    //   - newlyOut: display names for players who were still rostered but crossed into a
    //     HARD_OUT_STATUSES injury status they weren't in before (e.g. Q -> OUT, or nothing -> IR)
    // Deliberately does NOT surface Q/D fluctuations, recoveries, or team/bye changes -- those
    // are either too noisy (Q/D shift constantly) or effectively never happen mid-season (team,
    // bye), so they'd add clutter without adding much signal to a re-sync toast.
    function diffRosterChanges(prevRoster, newRoster) {
        const prevMap = new Map((prevRoster || []).map(p => [p.cleanName, p]));
        const newMap = new Map((newRoster || []).map(p => [p.cleanName, p]));
        const added = [];
        const dropped = [];
        const newlyOut = [];
        newMap.forEach((p, cleanName) => {
            const prevP = prevMap.get(cleanName);
            if (!prevP) {
                added.push(p.name);
            } else {
                const wasHardOut = prevP.inj && HARD_OUT_STATUSES.includes(prevP.inj);
                const isHardOut = p.inj && HARD_OUT_STATUSES.includes(p.inj);
                if (isHardOut && !wasHardOut) newlyOut.push(`${p.name} (${p.inj})`);
            }
        });
        prevMap.forEach((p, cleanName) => { if (!newMap.has(cleanName)) dropped.push(p.name); });
        return { added, dropped, newlyOut };
    }

    // Keeps the "Added: X, Y, Z" toast readable when a big roster shuffle (or a first-time
    // sync misclassified as a refresh) would otherwise dump a huge name list on the user.
    function formatNameList(names) {
        if (names.length <= 4) return names.join(', ');
        return `${names.slice(0, 4).join(', ')} +${names.length - 4} more`;
    }

    async function processSleeperData(username, leagueId, btn, isRefresh = false, preloaded = {}, suppressErrorToast = false, showChangeSummary = false, skipSave = false) {
        try {
            let userId = preloaded.userId;
            if (!userId) {
                userId = (await getSleeperUser(username)).user_id;
            }

            const leagueData = await getSleeperLeague(leagueId);
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
            const usersData = await getSleeperLeagueUsers(leagueId);
            let userMap = {};
            usersData.forEach(u => userMap[u.user_id] = u.display_name);

            const rosters = await getSleeperLeagueRosters(leagueId);
            
            if (btn) btn.innerText = "Loading Players...";
            const playerMap = preloaded.playerMap || await getSleeperPlayerMap();

            let myTeam = rosters.find(r => r.owner_id === userId);
            if (!myTeam && !isRefresh) throw new Error("Could not find your team in this league.");
            let sleeperStarters = myTeam && myTeam.starters ? myTeam.starters : [];
            
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
                globalPosMap: globalPosMap, sleeperStarters: sleeperStarters,
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

            // Capture the "what changed" diff before existingLeague's roster is overwritten below.
            // Only meaningful for a re-sync of a league we'd already stored a roster for --
            // a brand-new league (existingLeague null) has nothing to diff against, and every
            // player would show up as "Added", which isn't useful signal.
            let rosterDiff = null;
            if (isRefresh && showChangeSummary && existingLeague) {
                rosterDiff = diffRosterChanges(existingLeague.roster, rosterDetails);
            }

            if (existingIdx !== -1) State.leagues[existingIdx] = leagueObj;
            else State.leagues.push(leagueObj);

            State.activeLeagueId = leagueId;
            // Bulk callers (importAllSleeperLeagues, syncAllLeagues) pass skipSave=true and
            // write to localStorage once after their loop finishes, instead of every iteration
            // serializing the entire State.leagues array to disk.
            if (!skipSave) {
                localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
                localStorage.setItem('mds_season_active_league', State.activeLeagueId);
            }

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
            
            if (btn) flashButton(btn, isRefresh ? "Sync Complete" : "Synced Successfully", false, isRefresh ? 'Sync Sleeper Waivers & Trades' : "Sync Sleeper");

            if (rosterDiff && (rosterDiff.added.length || rosterDiff.dropped.length || rosterDiff.newlyOut.length) && window.showToast) {
                const parts = [];
                if (rosterDiff.added.length) parts.push(`Added: ${formatNameList(rosterDiff.added)}`);
                if (rosterDiff.dropped.length) parts.push(`Dropped: ${formatNameList(rosterDiff.dropped)}`);
                if (rosterDiff.newlyOut.length) parts.push(`Now OUT: ${formatNameList(rosterDiff.newlyOut)}`);
                window.showToast(parts.join(' · '));
            }

            if (typeof updatePulsePrompts === 'function') updatePulsePrompts();
            return rosterDiff || true;

        } catch(err) {
            console.error(err);
            if (btn) flashButton(btn, "Sync Failed", true, isRefresh ? 'Sync Sleeper Waivers & Trades' : "Sync Sleeper");
            if (!suppressErrorToast && window.showToast) window.showToast(`Sync Error:\n${err.message}`, { isError: true });
            return false;
        }
    }

    window.addAndSyncLeague = function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim() || "";
        const leagueId = document.getElementById('sleeperLeagueId')?.value.trim() || "";
        if (!username || !leagueId) { if (window.showToast) window.showToast("Please enter both Sleeper Username and League ID to sync.", { isError: true }); return; }
        // Just the label changes here -- flashButton (called inside processSleeperData once
        // the sync finishes) handles the actual color flash and restores the button to its
        // "Sync Sleeper" text afterward. Previously this line also force-set an inline
        // background color, which flashButton would then capture as the color to restore to
        // once its flash finished -- permanently overriding the button's real ".btn-blue" CSS
        // color with this purple for the rest of the session after the first sync.
        if (btn) { btn.innerText = "Syncing..."; }
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
            const userId = (await getSleeperUser(username)).user_id;

            // Sleeper's "current" season isn't necessarily the calendar year during the
            // offseason -- league_season (not the more general "season" field) is what
            // Sleeper's own docs describe as the active season for league membership, and
            // it shifts earlier than "season" during the transition into a new year.
            const stateData = await getNflState();
            const season = stateData?.league_season || stateData?.season || String(new Date().getFullYear());

            const leagues = await getSleeperUserLeagues(userId, season);

            if (!leagues || leagues.length === 0) {
                if (window.showToast) window.showToast(`No ${season} NFL leagues found for that username.`, { isError: true });
                return;
            }

            if (btn) btn.innerText = "Loading player data...";
            const playerMap = await getSleeperPlayerMap();
            const preloaded = { userId, playerMap };

            let successCount = 0;
            let failCount = 0;
            for (let i = 0; i < leagues.length; i++) {
                if (btn) btn.innerText = `Syncing ${i + 1}/${leagues.length}...`;
                const ok = await processSleeperData(username, leagues[i].league_id, null, true, preloaded, true, false, true);
                if (ok) successCount++; else failCount++;
            }

            // Single write after the loop instead of one localStorage.setItem per league.
            localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
            localStorage.setItem('mds_season_active_league', State.activeLeagueId);

            refreshLeagueDropdown();
            if (State.leagues.length > 0 && !State.activeLeagueId) {
                State.activeLeagueId = State.leagues[0].leagueId;
                localStorage.setItem('mds_season_active_league', State.activeLeagueId);
            }
            loadActiveLeagueData();
            if (typeof updatePulsePrompts === 'function') updatePulsePrompts();

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
        if (btn) btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing...</span>`;
        // showChangeSummary=true: this is a single, user-initiated re-sync, so a roster diff
        // toast is useful signal. The bulk "import all leagues" path deliberately leaves this
        // off (see importAllSleeperLeagues) since a diff per league would be noisy there.
        processSleeperData(league.username, league.leagueId, btn, true, {}, false, true);
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

            // 'ros' included alongside 'sos'/'schedule'/'matchup' -- several exports label this
            // column "ROS" (rest-of-season) even though it's the same team+position
            // schedule-strength value.
            const SOS_KEY_NAMES = ['sos', 'schedule', 'matchup', 'ros'];

            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: async function(results) {
                    // Rows with no recognizable Team column (e.g. a plain "Player, ROS" export)
                    // get queued here instead of dropped -- resolved via a name lookup against
                    // Sleeper's player map once, below, rather than per-row.
                    const rowsNeedingNameResolution = [];

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
                                let sosKey = Object.keys(row).find(k => SOS_KEY_NAMES.includes(k.toLowerCase()));
                                
                                if (posKey && sosKey) {
                                    let posStr = row[posKey].toUpperCase();
                                    let sosVal = row[sosKey].replace(/[^0-9]/g, '');
                                    let posGroup = posStr.includes('QB') ? 'QB' : posStr.includes('RB') ? 'RB' : posStr.includes('WR') ? 'WR' : posStr.includes('TE') ? 'TE' : null;

                                    if (posGroup && sosVal) State.sosMap[team][posGroup] = sosVal;
                                }
                            }
                            return;
                        }

                        // No Team column found for this row -- fall back to matching by player
                        // name against Sleeper's player map (queued, resolved in one batch below).
                        let nameKey = Object.keys(row).find(k => ['player', 'name', 'player name'].includes(k.toLowerCase().trim()));
                        let sosKey = Object.keys(row).find(k => SOS_KEY_NAMES.includes(k.toLowerCase()));
                        if (nameKey && sosKey && row[nameKey] && row[nameKey].trim()) {
                            let sosVal = row[sosKey].replace(/[^0-9]/g, '');
                            if (sosVal) rowsNeedingNameResolution.push({ name: row[nameKey].trim(), sosVal });
                        }
                    });

                    if (rowsNeedingNameResolution.length > 0) {
                        try {
                            const map = await getSleeperPlayerMap();
                            const teamPosByName = {};
                            Object.values(map).forEach(p => {
                                if (p.first_name && p.team && ['QB', 'RB', 'WR', 'TE'].includes(p.position)) {
                                    teamPosByName[normalizeName(`${p.first_name} ${p.last_name}`)] = { team: p.team, pos: p.position };
                                }
                            });

                            rowsNeedingNameResolution.forEach(({ name, sosVal }) => {
                                let match = teamPosByName[normalizeName(name)];
                                if (match) {
                                    if (!State.sosMap[match.team]) State.sosMap[match.team] = {};
                                    State.sosMap[match.team][match.pos] = sosVal;
                                }
                            });
                        } catch (err) {
                            console.error("Couldn't resolve player teams for SoS file:", err);
                            if (typeof window.showToast === 'function') {
                                window.showToast("SoS file uploaded, but player teams couldn't be resolved. Check your connection and try again.", { isError: true });
                            }
                        }
                    }

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

        // For the Trade Analyzer, roleLabel is "GET" (players you'd receive) or "GIVE" (players
        // you'd send away). Returns the card HTML plus this player's value under BOTH lenses --
        // the user's own custom ROS rankings (primary/default) and, if loaded, market consensus
        // (secondary/comparison) -- so the caller can total each side under each lens separately.
        const buildCard = (name, roleLabel = null) => {
            let clean = normalizeName(name);
            let rosObj = State.rosRankings.find(r => r.cleanName === clean);
            let weekObj = State.weeklyRankings.find(r => r.cleanName === clean);
            let userValueObj = (type === 'trade' && rosObj) ? { rank: rosObj.rank, value: rankToTradeValue(rosObj.rank) } : null;
            let marketValueObj = type === 'trade' ? getMarketValue(clean) : null;

            let suggestHTML = "";
            if (!rosObj && !weekObj && type) {
                // Bug fix: this used to always point at a nonexistent 'tradeInput' element for
                // trade cards, silently no-op'ing the "Did you mean" fix-it link on both sides.
                // Route back to whichever textarea (buyInput/sellInput) this name actually came from.
                let sourceInputId = type === 'waiver' ? 'waiverInput' : (roleLabel === 'GIVE' ? 'sellInput' : 'buyInput');
                let suggestion = findClosestRankedName(name);
                if (suggestion) {
                    suggestHTML = `<div class="scout-suggest-hint">Did you mean
                        <a href="#" class="scout-suggest-link" data-input-id="${sourceInputId}" data-original="${escapeHtml(name)}" data-suggested="${escapeHtml(suggestion)}" data-scout-type="${type}">${escapeHtml(suggestion)}</a>?</div>`;
                }
            }
            
            let displayName = rosObj?.name || weekObj?.name || name;
            let wRank = weekObj ? weekObj.rank : "UR";
            let rRank = rosObj ? rosObj.rank : "UR";
            let owner = rosterMap[clean];
            let statusHTML = "";
            
            if (roleLabel === "GIVE") {
                if (owner === "You") statusHTML = `<div class="scout-status status-owned">On Your Roster<br>(Ready to Send)</div>`;
                else if (owner) statusHTML = `<div class="scout-status status-avail">Already Dropped<br>/ Traded</div>`;
                else statusHTML = `<div class="scout-status status-avail">Not on your<br>roster</div>`;
            } else {
                if (!owner) statusHTML = `<div class="scout-status status-avail">Free Agent<br>(Available)</div>`;
                else if (owner === "You") statusHTML = `<div class="scout-status status-mine">On Your<br>Roster</div>`;
                else statusHTML = `<div class="scout-status status-owned">Rostered by:<br>${owner}</div>`;
            }

            let roleTag = roleLabel ? `<span class="badge" style="background:#112233;">${roleLabel === "GET" ? "Receiving" : "Giving"}</span>` : "";

            // Value badges only show on the Trade Analyzer. "Your Value" shows whenever the
            // player is (or isn't) in the user's own ROS rankings; "Mkt Value" only appears once
            // Market Value data has actually been loaded, so the card looks unchanged for anyone
            // not using that optional comparison.
            let valueHTML = "";
            if (type === 'trade') {
                valueHTML += userValueObj
                    ? `<span>Your Value: <strong class="mls-stat-value">${userValueObj.value.toLocaleString()}</strong></span>`
                    : `<span style="color:var(--text-muted);">Your Value: Unranked</span>`;
                if (State.marketRankings.length > 0) {
                    valueHTML += marketValueObj
                        ? `<span>Mkt Value: <strong class="mls-stat-market">${marketValueObj.value.toLocaleString()}</strong></span>`
                        : `<span style="color:var(--text-muted);">Mkt Value: N/A</span>`;
                }
            }

            return {
                html: `
                <div class="scout-result-card">
                    <div>
                        <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                            ${displayName} ${roleTag}
                        </div>
                        <div class="mls-meta-row">
                            <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong></span>
                            <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong></span>
                            ${valueHTML}
                        </div>
                        ${suggestHTML}
                    </div>
                    <div class="mls-text-right">${statusHTML}</div>
                </div>`,
                userValue: userValueObj ? userValueObj.value : 0,
                userMatched: !!userValueObj,
                marketValue: marketValueObj ? marketValueObj.value : 0,
                marketMatched: !!marketValueObj
            };
        };

        let html = "";

        if (type === 'trade') {
            let getResults = targetNames.map(n => buildCard(n, "GET"));
            let giveResults = sellNames.map(n => buildCard(n, "GIVE"));

            // A "trade" with only one side filled in isn't a trade -- it's an incomplete
            // comparison, but renderTradeVerdict below has no way to know that (an empty side
            // just totals to 0, which reads as a real, decisive "Favors You"/"Favors Them"
            // verdict). Catch it here instead of letting a misleading banner through; the
            // per-player cards below still render normally either way, since checking one
            // side's value on its own is still useful.
            let isOneSided = (targetNames.length === 0) !== (sellNames.length === 0);

            let verdictHTML;
            if (isOneSided) {
                verdictHTML = `<div class="trade-verdict-note" style="margin-bottom:1rem;">Enter players on both sides to get a fairness verdict -- right now only one side has players.</div>`;
            } else {
                // --- TRADE FAIRNESS VERDICT(S) ---
                // Renders up to two independent verdicts ahead of the player lists: one from the
                // user's own custom ROS rankings (the default/primary lens -- no third-party API
                // needed, since ROS rankings are a core input most users already have from the
                // Roster tab), and one from market consensus if Market Value data has been loaded
                // (Trade Finder section below). Showing both side-by-side is deliberate: it lets a
                // user see "the market" and "how I personally value this" can disagree.
                verdictHTML = renderTradeVerdict(
                    "Your Rankings",
                    "This value isn't something you entered -- it's estimated by converting your ROS rank into a point value on a 0-10,000 scale, weighted so top-ranked players are worth disproportionately more (rank #1 &asymp; 10,000, decaying ~1.8% per rank). This provides a way to compare players on your own board.",
                    getResults, giveResults, "userValue", "userMatched", State.rosRankings.length > 0
                );
                verdictHTML += renderTradeVerdict(
                    "Market Consensus",
                    "Same estimation method, applied to the market-consensus rank you loaded (Trade Finder section below). This only stores that source's overall rank, not its own internal value points, so this is an estimate of market value -- not the source's official number.",
                    getResults, giveResults, "marketValue", "marketMatched", State.marketRankings.length > 0
                );

                if (!verdictHTML) {
                    verdictHTML = `<div class="trade-verdict-note" style="margin-bottom:1rem;">Load your ROS Rankings (Roster tab) and/or Market Value data (Trade Finder section below) to get a value total and fairness verdict.</div>`;
                }
            }
            html += verdictHTML;

            if (targetNames.length > 0) {
                html += `<div style="font-weight:bold; color:#4ade80; margin-bottom:0.5rem;">You Receive</div>`;
                getResults.forEach(r => html += r.html);
            }
            if (sellNames.length > 0) {
                html += `<div style="font-weight:bold; color:#fca5a5; margin:1rem 0 0.5rem 0;">You Give Up</div>`;
                giveResults.forEach(r => html += r.html);
            }

            outputEl.innerHTML = html;
            return;
        }

        // Waiver path (unchanged)
        targetNames.forEach(n => html += buildCard(n, null).html);
        outputEl.innerHTML = html;
    };

    // Builds one verdict banner (label + totals + Fair/Favors-You/Favors-Them) from a set of
    // GET/GIVE card results, keyed off whichever value field ("userValue" or "marketValue") and
    // matched flag the caller wants. Returns "" when the underlying data source isn't loaded at
    // all, or when nothing on either side matched it, so callers can concatenate freely and fall
    // back to a single prompt only when BOTH sources come back empty.
    function renderTradeVerdict(label, methodologyText, getResults, giveResults, valueKey, matchedKey, sourceLoaded) {
        if (!sourceLoaded) return "";

        let getTotal = getResults.reduce((sum, r) => sum + r[valueKey], 0);
        let giveTotal = giveResults.reduce((sum, r) => sum + r[valueKey], 0);
        let unmatchedCount = getResults.concat(giveResults).filter(r => !r[matchedKey]).length;

        if (getTotal === 0 && giveTotal === 0) {
            return unmatchedCount > 0
                ? `<div class="trade-verdict-note" style="margin-bottom:1rem;">${label}: none of the players entered were found, so no value total could be calculated.</div>`
                : "";
        }

        // --- WAIVER ADJUSTMENT ---
        // Credits whichever side of the trade includes FEWER total players. A straight sum of
        // player values overvalues the many-piece side of an uneven trade: consolidating value
        // into fewer roster spots is worth something on its own, since the newly-freed bench
        // spot(s) can be refilled off waivers. This mirrors the "waiver adjustment" concept sites
        // like FantasyCalc apply to their own trade calculators, though the credit amount here is
        // a flat, user-configurable estimate (see the Trade Analyzer's settings above) rather
        // than one derived from real trade data.
        let waiverSubnoteGet = "", waiverSubnoteGive = "";
        if (State.tradeSettings.waiverAdjustment) {
            let spotDiff = giveResults.length - getResults.length; // >0 = you're sending more pieces than you receive
            let perSpot = parseFloat(State.tradeSettings.waiverAdjustmentValue) || 0;
            if (spotDiff !== 0 && perSpot > 0) {
                let bonus = Math.abs(spotDiff) * perSpot;
                if (spotDiff > 0) {
                    getTotal += bonus;
                    waiverSubnoteGet = `<span class="trade-verdict-subnote">+${bonus.toLocaleString()} waiver adj.</span>`;
                } else {
                    giveTotal += bonus;
                    waiverSubnoteGive = `<span class="trade-verdict-subnote">+${bonus.toLocaleString()} waiver adj.</span>`;
                }
            }
        }

        let diff = getTotal - giveTotal;
        let biggerSide = Math.max(getTotal, giveTotal, 1); // avoid div-by-zero
        let swingPct = (Math.abs(diff) / biggerSide) * 100;

        // Within 10% of the larger side's value counts as a fair trade -- outside that, it
        // clearly favors whoever's receiving more value.
        let verdictClass, verdictText;
        if (swingPct < 10) {
            verdictClass = "verdict-fair";
            verdictText = "Fair Trade";
        } else if (diff > 0) {
            verdictClass = "verdict-favor-you";
            verdictText = "Favors You";
        } else {
            verdictClass = "verdict-favor-them";
            verdictText = "Favors Them";
        }

        let unmatchedNote = unmatchedCount > 0
            ? `<div class="trade-verdict-note">${unmatchedCount} player${unmatchedCount > 1 ? 's' : ''} not found, excluded from this total.</div>`
            : "";

        return `
        <div class="trade-verdict-banner ${verdictClass}">
            <div class="trade-verdict-source-label">
                By ${label}
                <div class="tooltip-container">
                    <div class="tooltip-icon">i</div>
                    <span class="tooltip-text">${methodologyText}</span>
                </div>
            </div>
            <div class="trade-verdict-totals">
                <div class="trade-verdict-side">
                    <span class="trade-verdict-label">You Receive</span>
                    <span class="trade-verdict-amount">${getTotal.toLocaleString()}</span>
                    ${waiverSubnoteGet}
                </div>
                <div class="trade-verdict-vs">vs</div>
                <div class="trade-verdict-side">
                    <span class="trade-verdict-label">You Give</span>
                    <span class="trade-verdict-amount">${giveTotal.toLocaleString()}</span>
                    ${waiverSubnoteGive}
                </div>
            </div>
            <div class="trade-verdict-result">
                ${verdictText}
                <span class="trade-verdict-diff">(${diff >= 0 ? '+' : ''}${diff.toLocaleString()} pts, ${swingPct.toFixed(0)}%)</span>
            </div>
            ${unmatchedNote}
        </div>`;
    }

    window.autoFindWaiverUpgrades = async function() {
        const outputEl = document.getElementById('waiverOutput');
        const posFilter = document.getElementById('waiverPosFilter') ? document.getElementById('waiverPosFilter').value : 'FLEX';
        if (!outputEl) return;

        let league = getActiveLeague();
        if (!league || !league.globalRosterMap || !league.globalPosMap) {
            outputEl.innerHTML = `<span class="mls-error-text">Please sync a Sleeper league on the Dashboard first to analyze waivers.</span>`;
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
                    let map = await getSleeperPlayerMap();
                    window.sleeperPosByName = {};
                    Object.values(map).forEach(p => {
                        if (p.first_name) {
                            window.sleeperPosByName[normalizeName(`${p.first_name} ${p.last_name}`)] = p.position || "UNK";
                        }
                    });
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
    //
    // RANKING_TYPE_CONFIG itself lives up with the other top-of-file constants, since
    // switchActiveLeague() (defined well above this section) needs it too.

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

    window.applyRankingSetToAll = function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const val = selectEl ? selectEl.value : null;

        if (!val || val === '__new__') {
            if (window.showToast) window.showToast("Please select a saved ranking set first.", { isError: true });
            return;
        }
        if (val === '__legacy__') {
            if (window.showToast) window.showToast("Cannot apply legacy data to all leagues. Upload it as a new set first.", { isError: true });
            return;
        }

        if (!window.confirm("Apply this ranking set to ALL of your synced leagues?")) return;

        State.leagues.forEach(l => {
            l[cfg.leagueSetIdKey] = val;
        });

        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        if (window.showToast) window.showToast(`Applied to all ${State.leagues.length} leagues!`);
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


    window.toggleLockCountdown = function() {
        const card = document.getElementById('lockCountdownCard');
        if (!card) return;
        const nowExpanded = card.classList.toggle('expanded');
        const header = card.querySelector('.lock-countdown-header');
        if (header) header.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
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

    const parseFiles = async (filesWithContext, isWeekly, successMsgId, onProgress) => {
        const { parsedData, hasNewSos, sosUpdates } = await parseRankingsFiles(filesWithContext, { loadSheetJS, onProgress });

        // The parser module returns SoS data rather than writing to State directly (it has no
        // access to State at all -- see rankingsParser.js), so it's merged in here instead.
        Object.entries(sosUpdates).forEach(([team, posMap]) => {
            if (!State.sosMap[team]) State.sosMap[team] = {};
            Object.assign(State.sosMap[team], posMap);
        });

        const type = isWeekly ? 'weekly' : 'ros';
        const fileInputIds = filesWithContext.map(f =>
            f.context === 'SINGLE' ? `${type}FileInput` : `${type}FileInput-${f.context}`
        );

        if (parsedData.length === 0) {
            // Clear the file input(s) so the failed selection doesn't linger on screen
            // looking like it might still be "in progress" or successfully attached.
            fileInputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
            if (typeof window.showToast === 'function') {
                window.showToast("Couldn't find any players in that file. Double check the format and try again.", { isError: true });
            }
            return;
        }

        openRankingsPreview({ parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds });
    };

    // --- RANKINGS UPLOAD PREVIEW ---
    // Holds the most recently parsed-but-not-yet-committed upload so the confirm/cancel
    // handlers (wired to the modal's buttons) have something to act on. Only one upload
    // can be pending at a time, which matches the UI (one modal, one active upload flow).
    let pendingRankingsUpload = null;

    function openRankingsPreview({ parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds }) {
        pendingRankingsUpload = { parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds };

        const rankType = isWeekly ? "Weekly" : "ROS";
        const sorted = [...parsedData].sort((a, b) => a.rank - b.rank);
        const preview = sorted.slice(0, 5);

        const titleEl = document.getElementById('rankingsPreviewTitle');
        if (titleEl) titleEl.textContent = `Preview: ${rankType} Rankings`;

        const countEl = document.getElementById('rankingsPreviewCount');
        if (countEl) countEl.textContent = `${parsedData.length} player${parsedData.length === 1 ? '' : 's'} parsed`;

        const listEl = document.getElementById('rankingsPreviewList');
        if (listEl) {
            listEl.innerHTML = preview.map(p =>
                `<li><span class="rankings-preview-rank">#${p.rank}</span> ${escapeHtml(p.name)}</li>`
            ).join('');
        }

        const noteEl = document.getElementById('rankingsPreviewNote');
        if (noteEl) {
            noteEl.style.display = hasNewSos ? 'block' : 'none';
        }

        const overlay = document.getElementById('rankingsPreviewOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    window.cancelRankingsPreview = function() {
        // Clear the file input(s) so the user can immediately reselect the same file --
        // browsers don't fire a 'change' event if the value hasn't actually changed.
        if (pendingRankingsUpload && pendingRankingsUpload.fileInputIds) {
            pendingRankingsUpload.fileInputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
        }
        pendingRankingsUpload = null;
        const overlay = document.getElementById('rankingsPreviewOverlay');
        if (overlay) overlay.style.display = 'none';
    };

    window.confirmRankingsPreview = function() {
        if (!pendingRankingsUpload) return;
        const { parsedData, hasNewSos, isWeekly, successMsgId } = pendingRankingsUpload;

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

        pendingRankingsUpload = null;
        const overlay = document.getElementById('rankingsPreviewOverlay');
        if (overlay) overlay.style.display = 'none';
    };

    // --- UPLOAD PROCESSING INDICATOR ---
    // Same spinner icon already used for the Sleeper sync buttons elsewhere in the app,
    // reused here so a rankings upload gives the same kind of "something is happening"
    // signal instead of going silent between file-select and the preview modal appearing.
    const UPLOAD_SPINNER_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner" style="flex-shrink:0;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg>`;

    // Disables a rankings section's file input(s) for the duration of a parse (type is
    // 'ros' or 'weekly'), so a second file selection can't fire a second overlapping parse
    // while the first is still running -- shared by both the single- and multi-file paths.
    function setUploadInputsDisabled(type, disabled) {
        const singleInput = document.getElementById(`${type}FileInput`);
        if (singleInput) singleInput.disabled = disabled;
        ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'].forEach(pos => {
            const posInput = document.getElementById(`${type}FileInput-${pos}`);
            if (posInput) posInput.disabled = disabled;
        });
    }

    // Shows/hides the inline "Processing..." status line used by the single-file path
    // (which has no button of its own to carry a spinner -- selecting a file kicks off
    // the parse directly). The multi-file path shows its own progress on the submit
    // button instead (see processMultiRankings), so it doesn't use this.
    function setUploadStatus(type, isProcessing, label) {
        const statusEl = document.getElementById(`${type}ProcessingStatus`);
        if (!statusEl) return;
        statusEl.innerHTML = isProcessing ? `${UPLOAD_SPINNER_SVG}<span>${escapeHtml(label || 'Processing...')}</span>` : '';
        statusEl.style.display = isProcessing ? 'flex' : 'none';
    }

    window.processSingleRankingUpload = function(type, successMsgId) {
        const fileInput = document.getElementById(`${type}FileInput`);
        if (!fileInput || !fileInput.files[0]) return;
        
        const isWeekly = type === 'weekly';
        setUploadInputsDisabled(type, true);
        setUploadStatus(type, true);
        parseFiles([{ file: fileInput.files[0], context: 'SINGLE' }], isWeekly, successMsgId)
            .finally(() => {
                setUploadInputsDisabled(type, false);
                setUploadStatus(type, false);
            });
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
        const btn = document.getElementById(`${type}MultiProcessBtn`);
        const originalBtnContent = btn ? btn.innerHTML : null;
        if (btn) btn.disabled = true;
        setUploadInputsDisabled(type, true);

        const updateProgress = (done, total) => {
            if (btn) btn.innerHTML = `${UPLOAD_SPINNER_SVG} Processing ${done}/${total}...`;
        };
        updateProgress(0, filesWithContext.length);

        parseFiles(filesWithContext, isWeekly, successMsgId, updateProgress).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnContent; }
            setUploadInputsDisabled(type, false);
        });
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
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, {type: 'array'});
                        const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
                        Papa.parse(csvStr, { header: true, skipEmptyLines: true, complete: results => parseMarketData(results.data, successMsgId) });
                    } catch (err) {
                        console.error("Error reading Excel file:", err);
                        if (window.showToast) window.showToast(`Couldn't read "${file.name}" -- it may be corrupted or in an unsupported format. Try re-saving it as .xlsx or .csv and uploading again.`, { isError: true });
                    }
                };
                reader.onerror = () => {
                    console.error("Error reading file:", file.name);
                    if (window.showToast) window.showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                };
                reader.readAsArrayBuffer(file);
            }, () => {
                console.error("Failed to load SheetJS library");
                if (window.showToast) window.showToast(`Couldn't load the Excel file reader, so "${file.name}" wasn't processed. Check your connection and try again, or save the file as .csv instead.`, { isError: true });
            });
        } else if (filename.endsWith('.numbers')) {
            if (window.showToast) window.showToast("Numbers files aren't supported directly. In Numbers, use File > Export To > CSV, then upload that file instead.", { isError: true });
        } else {
            if (window.showToast) window.showToast("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.", { isError: true });
        }
    }
    // --- SHARED MARKET-CONSENSUS FETCH ---
    // Moved to marketDataApi.js -- fetchMarketConsensusData is now imported at the top of
    // this file. It's still used the same way below (Scout tab's Power Rankings and the
    // ROS Rankings auto-fetch both call it), just no longer defined in this file.

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

// --- TRADE ANALYZER SETTINGS (Waiver Adjustment) ---
window.updateTradeSetting = function(key, value) {
    State.tradeSettings[key] = value;
    localStorage.setItem('mls_trade_settings', JSON.stringify(State.tradeSettings));
    applyTradeSettingsToUI();
};

function applyTradeSettingsToUI() {
    const s = State.tradeSettings;
    const toggleEl = document.getElementById('tradeWaiverAdjustToggle');
    const valueWrap = document.getElementById('tradeWaiverValueWrap');
    const valueEl = document.getElementById('tradeWaiverAdjustValue');
    if (toggleEl) toggleEl.checked = !!s.waiverAdjustment;
    if (valueEl) valueEl.value = s.waiverAdjustmentValue;
    if (valueWrap) valueWrap.style.display = s.waiverAdjustment ? 'block' : 'none';
}

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
                    marketVal: numVal,
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

    // --- TRADE VALUE CURVE ---
    // Converts an overall rank -- either the user's own ROS ranking or a market-consensus rank
    // from State.marketRankings -- into an approximate point value for the Trade Analyzer's side
    // totals. Raw rank isn't summable in a meaningful way -- the value gap between rank #1 and
    // #2 is enormous compared to the gap between #150 and #151, exactly like how KTC/FantasyCalc's
    // own dollar-style trade values are NOT linear with rank. This exponential decay approximates
    // that shape from rank alone. Decay factor is tuned so rank #1 ~= 10000 and value trails off
    // to near-zero by the deep bench (~rank 300+), mirroring typical dynasty value charts. Shared
    // by both lenses so "Your Value" and "Mkt Value" are on the same 0-10000 scale and directly
    // comparable.
    function rankToTradeValue(rank) {
        if (!rank || rank < 1) return 0;
        return Math.round(10000 * Math.pow(0.982, rank - 1));
    }

    // Looks up a player's MARKET value by clean name (the optional/secondary lens -- see
    // rankToTradeValue above). Returns null if no Market Value data is loaded at all, or if this
    // specific player isn't in it (unranked/deep bench/rookie not yet valued).
    function getMarketValue(cleanName) {
        if (!cleanName) return null;
        let m = State.marketRankings.find(r => r.cleanName === cleanName);
        if (!m) return null;
        return { rank: m.marketVal, value: rankToTradeValue(m.marketVal) };
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
    // --- TEXT EXPORT (DISCORD/GROUP CHAT) ---
    window.copyLineupAsText = function(btn) {
        if (!State.activeLeagueId) return;
        
        let league = getActiveLeague();
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        
        if (starters.length === 0 || !starters.some(s => s.player)) {
            if (window.showToast) window.showToast("No players in lineup to copy.", { isError: true });
            return;
        }

        let textLines = [];
        let leagueName = league && league.name && !league.name.includes("Manual") ? league.name : "Optimal";
        
        textLines.push(`${leagueName} Lineup\n`);
        
        starters.forEach(s => {
            let cleanSlotType = s.slot.replace(/[0-9]/g, ''); 
            
            if (s.player) {
                textLines.push(`${cleanSlotType}: ${s.player.name} (${s.player.team})`);
            } else {
                textLines.push(`${cleanSlotType}: [ Empty ]`);
            }
        });

        const finalString = textLines.join('\n');
        
        navigator.clipboard.writeText(finalString).then(() => {
            if (btn && window.flashButton) window.flashButton(btn, "Copied!");
            if (window.showToast) window.showToast("Lineup copied to clipboard!");
        }).catch(err => {
            console.error("Copy failed:", err);
            if (window.showToast) window.showToast("Failed to copy. Your browser may not support this.", { isError: true });
        });
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
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 1. Sync your Sleeper League (Dashboard)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 2. Upload ROS Rankings (Above)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 3. Evaluate your team</div>
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
            let byeBadge = getByeBadgeHTML(p.team);
            let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";
            let sosBadge = getSoSBadgeHTML(p.team, p.pos);
            let badgesRow = [injBadge, byeBadge].filter(Boolean).join(' ');
            
            html += `
            <div class="roster-item">
                <div class="mls-player-row-info">
                    <span class="badge pos-badge ${p.pos} mls-pos-badge-sizing">${p.pos}</span>
                    <div class="mls-player-row-text">
                        <div class="player-name-wrap">${p.name}${byeStr}</div>
                        ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
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

    // Core lock/unlock mechanics shared by toggleLock (the manual lock icon) and the
    // keep-swaps-sticky logic in initiateSwap below. Updates both the season-long lock list
    // AND each player object's isLocked flag directly in the starters/bench arrays, since
    // renderLineupUI reads that flag off the object rather than re-checking the list. Returns
    // the player's name (for callers that want to reference it, e.g. in a toast).
    function setPlayerLockState(playerId, isLocked) {
        if (!State.activeLeagueId) return null;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let idx = locks.indexOf(playerId);
        if (isLocked && idx === -1) locks.push(playerId);
        else if (!isLocked && idx !== -1) locks.splice(idx, 1);
        State.lockedPlayersMap[State.activeLeagueId] = locks;
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));

        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let playerName = null;
        starters.forEach(s => {
            if (s.player && s.player.id === playerId) { s.player.isLocked = isLocked; playerName = s.player.name; }
        });
        bench.forEach(p => {
            if (p.id === playerId) { p.isLocked = isLocked; playerName = p.name; }
        });
        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = bench;
        return playerName;
    }

    window.toggleLock = function(playerId) {
        if (!State.activeLeagueId) return;
        pushLineupUndoSnapshot(State.activeLeagueId);
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let isLocking = !locks.includes(playerId);
        let playerName = setPlayerLockState(playerId, isLocking) || 'Player';

        if (typeof window.showToast === 'function') {
            window.showToast(`${playerName} is ${isLocking ? 'locked' : 'unlocked'}`);
        }
        renderLineupUI();
    };

    // True if the person has explicitly overridden auto-lock for this player this week (see
    // window.overrideAutoLock below). Scoped to the current week -- an override from a prior
    // week is stale (that week's kickoff data no longer applies) and is ignored here rather than
    // needing to be manually cleaned up.
    function isAutoLockOverridden(leagueId, playerId) {
        let entry = State.autoLockOverridesMap[leagueId];
        if (!entry || entry.week !== State.currentNflWeek) return false;
        return entry.ids.includes(playerId);
    }

    // The failsafe for auto-lock (see optimizeLineup): if gameTimesByTeam or Sleeper's synced
    // starters ever get a specific player wrong -- a postponed/rescheduled game, a stale sync,
    // etc -- this lets the person pull that ONE player back into normal (unlocked) territory so
    // the optimizer will freely reconsider them again, without touching anything else about the
    // lineup or affecting the season-long manual lock list.
    window.overrideAutoLock = function(playerId) {
        if (!State.activeLeagueId) return;
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let found = starters.find(s => s.player && s.player.id === playerId);
        let playerName = found ? found.player.name : (bench.find(p => p.id === playerId) || {}).name || 'This player';

        if (!window.confirm(`${playerName}'s game shows as already started. Only override this if that's wrong -- doing so lets the optimizer freely move or bench them again.`)) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        let entry = State.autoLockOverridesMap[State.activeLeagueId];
        if (!entry || entry.week !== State.currentNflWeek) entry = { week: State.currentNflWeek, ids: [] };
        if (!entry.ids.includes(playerId)) entry.ids.push(playerId);
        State.autoLockOverridesMap[State.activeLeagueId] = entry;
        localStorage.setItem('mls_autolock_overrides_map', JSON.stringify(State.autoLockOverridesMap));

        if (typeof window.showToast === 'function') {
            window.showToast("Auto-lock removed -- re-optimizing");
        }
        window.optimizeLineup(true);
    };

    // Bulk-clears the season-long MANUAL lock list for the active league only -- deliberately
    // does not touch auto-locks (see optimizeLineup/overrideAutoLock above): a player whose game
    // has genuinely already kicked off should stay pinned even after this, since un-pinning them
    // would let the optimizer bench or reshuffle someone who's already locked into that outcome
    // in real life. This is for clearing out manual picks made earlier in the season/week, not
    // for correcting auto-lock mistakes -- overrideAutoLock (the per-player control on an
    // auto-locked row) is the right tool for that instead.
    window.unlockAllPlayers = function() {
        if (!State.activeLeagueId) return;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        if (locks.length === 0) return;
        if (!window.confirm(`Unlock all ${locks.length} manually locked player(s) in this league?`)) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        State.lockedPlayersMap[State.activeLeagueId] = [];
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));

        if (typeof window.showToast === 'function') {
            window.showToast("All manual locks cleared -- re-optimizing");
        }
        window.optimizeLineup(true);
    };

    // True if `pos` is allowed to occupy a slot of type `slotType` ('QB', 'RB', 'WR', 'TE',
    // 'FLEX', 'SFLEX', 'K', or 'DEF' -- i.e. a starter slot label with its trailing number
    // stripped, same convention used everywhere else in this file). Mirrors the exact
    // eligibility rules fillSlot()/the SFLEX loop use when building the lineup in the first
    // place, so a manual swap can never produce a slot/position combination the optimizer
    // itself would never have created.
    function slotAcceptsPos(slotType, pos) {
        switch (slotType) {
            case 'QB': return pos === 'QB';
            case 'RB': return pos === 'RB';
            case 'WR': return pos === 'WR';
            case 'TE': return pos === 'TE';
            case 'FLEX': return ['RB', 'WR', 'TE'].includes(pos);
            case 'SFLEX': return ['QB', 'RB', 'WR', 'TE'].includes(pos);
            case 'K': return pos === 'K';
            case 'DEF': return pos === 'DEF';
            default: return false;
        }
    }

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

            // Reject the swap up front if either player would land in a starter slot their
            // position doesn't fit (e.g. a bench DEF swapped into a QB slot). Bench slots have
            // no position identity of their own, so a player moving TO the bench never fails
            // this check -- only a move INTO a starter slot is constrained.
            let p1TargetSlotType = p2StarterIdx !== -1 ? starters[p2StarterIdx].slot.replace(/[0-9]/g, '') : null;
            let p2TargetSlotType = p1StarterIdx !== -1 ? starters[p1StarterIdx].slot.replace(/[0-9]/g, '') : null;
            let p1Fits = !p1TargetSlotType || slotAcceptsPos(p1TargetSlotType, p1Obj.pos);
            let p2Fits = !p2TargetSlotType || slotAcceptsPos(p2TargetSlotType, p2Obj.pos);

            if (!p1Fits || !p2Fits) {
                if (typeof window.showToast === 'function') {
                    window.showToast(`Can't swap ${p1Obj.name} (${p1Obj.pos}) with ${p2Obj.name} (${p2Obj.pos}) -- that position doesn't fit that slot.`, { isError: true });
                }
                State.swapSourceId = null;
                renderLineupUI();
                return;
            }

            pushLineupUndoSnapshot(State.activeLeagueId);

            if (p1StarterIdx !== -1 && p2StarterIdx !== -1) { starters[p1StarterIdx].player = p2Obj; starters[p2StarterIdx].player = p1Obj; } 
            else if (p1StarterIdx !== -1 && p2BenchIdx !== -1) { starters[p1StarterIdx].player = p2Obj; bench[p2BenchIdx] = p1Obj; }
            else if (p1BenchIdx !== -1 && p2StarterIdx !== -1) { starters[p2StarterIdx].player = p1Obj; bench[p1BenchIdx] = p2Obj; }
            else if (p1BenchIdx !== -1 && p2BenchIdx !== -1) { bench[p1BenchIdx] = p2Obj; bench[p2BenchIdx] = p1Obj; }

            State.manualStartersMap[State.activeLeagueId] = starters;
            State.manualBenchMap[State.activeLeagueId] = bench;
            localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
            localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));

            // Keep this swap "sticky" across the next sync. optimizeLineup's full recompute
            // (forced on every Sleeper sync) only protects locked players -- without this, a
            // manual swap into (or within) the starting lineup would silently get reverted
            // back to whatever the rankings alone would have picked. Whoever ends up starting
            // gets locked; whoever ends up on the bench gets unlocked, in case they carried a
            // lock over from before this swap (otherwise their old lock would just force them
            // straight back into a starting slot on the next recompute, undoing the swap).
            let newStarterIds = new Set(starters.filter(s => s.player).map(s => s.player.id));
            [p1Obj, p2Obj].forEach(p => {
                if (p) setPlayerLockState(p.id, newStarterIds.has(p.id));
            });

            State.swapSourceId = null;
        }
        renderLineupUI();
    };

    // FLEX kickoff optimization: given the starters array that fillSlot()/the SFLEX loop above
    // already produced (i.e. WHO starts is fully decided), reorders which specific players sit
    // in strict RB/WR/TE slots vs the true FLEX slot(s), so that FLEX is always occupied by the
    // latest-kickoff player(s) among that week's flex-eligible starters. This maximizes
    // late-swap flexibility: the slot with the most schedule flexibility (FLEX, in most
    // platforms' swap UIs) ends up genuinely being the one you can wait longest to lock in.
    //
    // This never changes the SET of starting players, never touches QB/K/DEF/SFLEX, and never
    // puts a player in a slot whose position they don't match (a WR can never occupy an "RB"
    // labeled slot) -- it only decides, among players who are already flex-eligible (RB/WR/TE)
    // and already starting, which of them gets which slot label.
    //
    // How it works: for each position (RB/WR/TE), sort that position's starters by kickoff time
    // ascending. Whichever `count` of them is needed to fill that position's strict slots (e.g.
    // 2 RB slots) are exactly the `count` earliest-kickoff players at that position -- anyone
    // left over (because they were already flex-allocated by rank) is "surplus" and gets
    // reassigned into a FLEX-labeled slot instead, latest-kickoff first. If kickoff data isn't
    // available for a player, they sort last (Infinity) so we never assume a game is early
    // without evidence -- and if kickoff data isn't available at all, the sort is a no-op and
    // slot assignments are left exactly as fillSlot() originally produced them.
    function optimizeFlexKickoffOrder(starters) {
        const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
        const byPos = { RB: [], WR: [], TE: [] };
        const strictSlotCount = { RB: 0, WR: 0, TE: 0 };

        starters.forEach((s, idx) => {
            const slotType = s.slot.replace(/[0-9]/g, '');
            // Locked players (manually locked, or auto-locked because their game already
            // kicked off -- see optimizeLineup) are pinned exactly where fillSlot put them.
            // Their slot doesn't count toward strictSlotCount either, since it's not available
            // for the unpinned pool below to be reassigned into.
            if (s.player && s.player.isLocked) return;
            if (FLEX_POSITIONS.includes(slotType)) strictSlotCount[slotType]++;
            if (!s.player) return;
            if (slotType !== 'FLEX' && !FLEX_POSITIONS.includes(slotType)) return;
            if (!FLEX_POSITIONS.includes(s.player.pos)) return; // safety guard against malformed data
            byPos[s.player.pos].push(idx);
        });

        const getKickoffMs = (idx) => {
            const p = starters[idx].player;
            const iso = p && p.team ? State.gameTimesByTeam[p.team] : null;
            const ms = iso ? new Date(iso).getTime() : NaN;
            return isNaN(ms) ? Infinity : ms;
        };

        FLEX_POSITIONS.forEach(pos => {
            byPos[pos].sort((a, b) => getKickoffMs(a) - getKickoffMs(b));
        });

        const strictAssignees = {};
        let flexAssignees = [];
        FLEX_POSITIONS.forEach(pos => {
            const indices = byPos[pos];
            strictAssignees[pos] = indices.slice(0, strictSlotCount[pos]).map(i => starters[i].player);
            flexAssignees.push(...indices.slice(strictSlotCount[pos]).map(i => starters[i].player));
        });
        // Latest kickoff first, so if there are multiple FLEX slots the very latest game lands
        // in whichever one appears first in the lineup.
        flexAssignees.sort((a, b) => {
            const aMs = a.team && State.gameTimesByTeam[a.team] ? new Date(State.gameTimesByTeam[a.team]).getTime() : -Infinity;
            const bMs = b.team && State.gameTimesByTeam[b.team] ? new Date(State.gameTimesByTeam[b.team]).getTime() : -Infinity;
            return bMs - aMs;
        });

        const cursors = { RB: 0, WR: 0, TE: 0, FLEX: 0 };
        starters.forEach(s => {
            if (!s.player) return;
            if (s.player.isLocked) return; // pinned above -- leave exactly as fillSlot placed them
            const slotType = s.slot.replace(/[0-9]/g, '');
            if (FLEX_POSITIONS.includes(slotType)) {
                const newPlayer = strictAssignees[slotType][cursors[slotType]++];
                if (newPlayer) s.player = newPlayer;
            } else if (slotType === 'FLEX') {
                const newPlayer = flexAssignees[cursors.FLEX++];
                if (newPlayer) s.player = newPlayer;
            }
        });
    }

    window.optimizeLineup = function(forceReset = true, isManualAction = false) {
        let league = getActiveLeague();
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');

        if (!league || !league.roster || league.roster.length === 0) {
            if (container) {
                container.innerHTML = `
                <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                    <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to the Lineup Optimizer</div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 1. Sync your Sleeper League (Dashboard)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 2. Upload Weekly Rankings (Above)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 3. Click 'Optimize Lineup'</div>
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

        // Only the literal "Optimize Lineup" button click gets its own undo checkpoint here.
        // unlockAllPlayers/overrideAutoLock also trigger a forceReset recompute, but they push
        // their own snapshot before their own mutation, so their whole compound action undoes
        // in one step -- pushing here too would double up and only undo half of it. Sync-
        // triggered recomputes (processSleeperData's unconditional optimizeLineup(true)) are
        // deliberately excluded from undo entirely: the roster/player pool itself just changed,
        // so restoring an older lineup snapshot could silently reintroduce a player who was
        // just dropped -- that's a correctness risk undo shouldn't create.
        if (isManualAction && forceReset && State.manualStartersMap[State.activeLeagueId]) {
            pushLineupUndoSnapshot(State.activeLeagueId);
        }

        let activeDataSet = State.weeklyRankings.length > 0 ? State.weeklyRankings : State.rosRankings;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };

        // Auto-lock: once a player's game has kicked off, their roster spot is frozen in real
        // life whether or not the person ever touches this tool again this week -- re-running
        // the optimizer (say, after a late rankings update) shouldn't be able to bench them or
        // have optimizeFlexKickoffOrder shuffle their slot. This never overrides a starter's
        // status *before* kickoff -- it only pins players who (a) have already kicked off AND
        // (b) were already established as a starter, checked against two sources: Sleeper's own
        // last-synced starting lineup (the ground truth for what actually happened in real
        // life, and the only signal available the very first time this is run in a given week)
        // and this app's own previous optimizer output (a fallback for when Sleeper starter
        // data is missing entirely -- see isSleeperStarter below for exactly when each source
        // applies). A bench player whose game has already passed is NOT auto-locked --
        // they were never started, so there's nothing to preserve.
        let sleeperStarterIds = getValidSleeperStarterIds(league);
        let prevStarters = State.manualStartersMap[State.activeLeagueId] || [];
        let prevStartingIds = new Set(prevStarters.filter(s => s.player).map(s => s.player.id));

        // Sleeper's synced starting lineup is the ground truth for "did this player actually
        // start in real life." prevStartingIds (this app's own prior pick) only steps in when
        // we have no Sleeper starter data at all -- it must NOT be OR'd in alongside real
        // Sleeper data, or a player this app recommended starting (but who Sleeper shows on
        // the bench) gets wrongly auto-locked into the lineup the moment their game kicks off.
        let isSleeperStarter = p => sleeperStarterIds.length > 0
            ? sleeperStarterIds.includes(p.id)
            : prevStartingIds.has(p.id);

        let scoredRoster = league.roster.map(p => {
            let rObj = activeDataSet.find(rk => rk.cleanName === p.cleanName);
            let manualLocked = locks.includes(p.id);
            let overridden = isAutoLockOverridden(State.activeLeagueId, p.id);
            let autoLocked = !manualLocked && !overridden && hasKickedOff(p) && isSleeperStarter(p);
            return { ...p, posRank: rObj ? rObj.posRank : 999, flexRank: rObj ? rObj.flexRank : 999, isLocked: manualLocked || autoLocked, autoLocked };
        });

        let pool = [...scoredRoster];
        let starters = [];

        // Finds the best index in `pool` matching `matchFn`, using `compareFn` to rank
        // candidates against each other (same contract as Array.prototype.sort's comparator:
        // negative means `a` ranks ahead of `b`). Prefers players who are actually available
        // this week per isUnavailableThisWeek(); only falls back to an unavailable player if
        // NO eligible one exists at all, so a slot is never silently left empty just because
        // the best-ranked option happens to be on bye.
        const findBestStarterIndex = (matchFn, compareFn) => {
            let bestIdx = -1;
            pool.forEach((p, idx) => {
                if (!matchFn(p) || isUnavailableThisWeek(p)) return;
                if (bestIdx === -1 || compareFn(p, pool[bestIdx]) < 0) bestIdx = idx;
            });
            if (bestIdx !== -1) return bestIdx;

            // Fallback pass: nobody eligible is available at this position. Allow a bye/hard-out
            // player rather than leaving the slot empty -- they'll show up with a clear BYE or
            // injury badge in the UI instead of just vanishing from the lineup.
            pool.forEach((p, idx) => {
                if (!matchFn(p)) return;
                if (bestIdx === -1 || compareFn(p, pool[bestIdx]) < 0) bestIdx = idx;
            });
            return bestIdx;
        };

        const fillSlot = (slotLabel, posFilter, useFlexRank) => {
            let lockedIndex = pool.findIndex(p => p.isLocked && posFilter(p.pos));
            if (lockedIndex !== -1) { starters.push({ slot: slotLabel, player: pool.splice(lockedIndex, 1)[0], usedFlex: useFlexRank }); return; }

            const compareFn = useFlexRank
                ? (a, b) => {
                    if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
                    if (a.flexRank !== 999 && b.flexRank === 999) return -1;
                    if (a.flexRank === 999 && b.flexRank !== 999) return 1;
                    return a.posRank - b.posRank;
                }
                : (a, b) => a.posRank - b.posRank;

            let bestIndex = findBestStarterIndex(p => posFilter(p.pos), compareFn);
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
            if (lockedIndex !== -1) {
                let lockedPlayer = pool.splice(lockedIndex, 1)[0];
                // Read pos off the player we just removed, not off pool[lockedIndex] -- after
                // splice() that index now holds a different (or no) element, since everything
                // after the removed slot shifts down by one.
                starters.push({ slot: slotLabel, player: lockedPlayer, usedFlex: lockedPlayer.pos !== 'QB' });
                continue;
            }

            let bestQBIdx = findBestStarterIndex(p => p.pos === 'QB' && p.posRank !== 999, (a, b) => a.posRank - b.posRank);
            if (bestQBIdx !== -1) {
                starters.push({ slot: slotLabel, player: pool.splice(bestQBIdx, 1)[0], usedFlex: false });
            } else {
                let bestFlexIdx = findBestStarterIndex(p => ['RB', 'WR', 'TE'].includes(p.pos) && p.flexRank !== 999, (a, b) => a.flexRank - b.flexRank);
                if (bestFlexIdx !== -1) {
                    starters.push({ slot: slotLabel, player: pool.splice(bestFlexIdx, 1)[0], usedFlex: true });
                } else {
                    let bestPosIdx = findBestStarterIndex(p => ['RB', 'WR', 'TE'].includes(p.pos) && p.posRank !== 999, (a, b) => a.posRank - b.posRank);
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

        // Reassign which specific players occupy strict RB/WR/TE slots vs the FLEX slot(s),
        // purely by kickoff time -- who actually starts is already decided above by rank; this
        // only relabels slots so FLEX holds the latest games. See optimizeFlexKickoffOrder for
        // why this is safe (it never changes the set of starters, only slot labels).
        optimizeFlexKickoffOrder(starters);

        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = pool;
        
        localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
        localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
        
        if (isManualAction) {
            let hasOptimizedBefore = localStorage.getItem('mls_has_optimized');
            if (!hasOptimizedBefore) {
                if (typeof window.showToast === 'function') {
                    window.showToast("🎉 Lineup Optimized! You've successfully completed the setup flow.", { duration: 6000 });
                }
                localStorage.setItem('mls_has_optimized', 'true');
            } else {
                if (typeof window.showToast === 'function') window.showToast("Optimal lineup set");
            }
        }
        
        renderLineupUI();
    };

    window.renderSyncLogs = function() {
        const accordion = document.getElementById('syncLogAccordion');
        const content = document.getElementById('syncLogContent');
        const summary = document.getElementById('syncLogSummary');
        
        if (!accordion || !content || !summary) return;

        if (!State.syncLogs || State.syncLogs.length === 0) {
            accordion.style.display = 'none';
            return;
        }

        accordion.style.display = 'block';
        let totalChanges = 0;
        let html = "";

        State.syncLogs.forEach(log => {
            let changes = [];
            if (log.added.length) changes.push(`<span style="color: #86efac; font-weight: 500;">+ ${log.added.join(', ')}</span>`);
            if (log.dropped.length) changes.push(`<span style="color: #9ca3af; text-decoration: line-through;">- ${log.dropped.join(', ')}</span>`);
            if (log.newlyOut.length) changes.push(`<span style="color: #fca5a5;">Out: ${log.newlyOut.join(', ')}</span>`);
            
            if (changes.length > 0) {
                totalChanges += (log.added.length + log.dropped.length + log.newlyOut.length);
                html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.6rem 0.8rem; border-radius: 6px; border-left: 2px solid #60a5fa;">
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-bottom: 0.3rem;">${log.leagueName}</div>
                    <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem;">
                        ${changes.join('')}
                    </div>
                </div>`;
            }
        });

        if (totalChanges === 0) {
            html = `<div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No roster changes detected in the last sync.</div>`;
            summary.innerText = `Recent Sync Logs (No Changes)`;
        } else {
            summary.innerText = `Recent Sync Logs (${totalChanges} Change${totalChanges === 1 ? '' : 's'})`;
        }

        content.innerHTML = html;
    };

    window.optimizeAllLineups = function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        const origText = btn.innerHTML;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Optimizing All...`;
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures the UI button state updates before locking the main thread
        setTimeout(() => {
            const originalActiveId = State.activeLeagueId;
            
            // Temporarily suppress single-toast spam
            let tempToast = window.showToast;
            window.showToast = function(){}; 
            
            State.leagues.forEach(l => {
                let isBestBall = l.formatBadge && l.formatBadge.toLowerCase().includes("best ball");
                if (isBestBall) return; // Skip optimizing Best Ball leagues

                State.activeLeagueId = l.leagueId;
                
                // Manually hydrate rankings for this specific league so the optimizer uses the correct set
                ['ros', 'weekly'].forEach(type => {
                    const cfg = RANKING_TYPE_CONFIG[type];
                    const setId = l[cfg.leagueSetIdKey];
                    const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;

                    if (set) State[cfg.stateKey] = [...set.data];
                    else if (Array.isArray(l[cfg.leagueLegacyDataKey]) && l[cfg.leagueLegacyDataKey].length > 0) State[cfg.stateKey] = [...l[cfg.leagueLegacyDataKey]];
                    else State[cfg.stateKey] = [];
                });

                window.optimizeLineup(true); 
            });

            // Restore original state and reactivate toasts
            window.showToast = tempToast; 
            switchActiveLeague(originalActiveId); 
            
            let managedLeaguesCount = State.leagues.filter(l => !(l.formatBadge && l.formatBadge.toLowerCase().includes("best ball"))).length;
            
            if (window.showToast) window.showToast(`Successfully optimized ${managedLeaguesCount} lineups!`);
            
            btn.innerHTML = origText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }, 50);
    };

window.syncAllLeagues = async function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        
        // Filter out manual leagues — only sync Sleeper connections
        const sleeperLeagues = State.leagues.filter(l => l.leagueId && !l.leagueId.startsWith('manual_') && l.username && l.username !== "Manual");
        
        if (sleeperLeagues.length === 0) {
            if (window.showToast) window.showToast("No Sleeper-synced leagues to refresh.", { isError: true });
            return;
        }

        const origText = btn.innerHTML;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing All...`;
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures UI button state updates before locking the main thread
        setTimeout(async () => {
            try {
                // Preload the heavy player map ONCE to save massive API bandwidth
                const playerMap = await getSleeperPlayerMap();
                const preloaded = { playerMap }; 

                let successCount = 0;
                let newLogs = [];
                
                // Temporarily suppress single-toast spam during the loop
                let tempToast = window.showToast;
                window.showToast = function(){}; 

                for (let i = 0; i < sleeperLeagues.length; i++) {
                    let l = sleeperLeagues[i];
                    // Mirrors importAllSleeperLeagues' per-league progress text below, instead
                    // of a static "Syncing All..." for the whole loop regardless of how many
                    // leagues or how long it takes.
                    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing ${i + 1}/${sleeperLeagues.length}...`;
                    // isRefresh = true, suppressErrorToast = true, showChangeSummary = true, skipSave = true
                    let result = await processSleeperData(l.username, l.leagueId, null, true, preloaded, true, true, true);
                    
                    if (result) {
                        successCount++;
                        // If it returned our rosterDiff object with actual changes, log it
                        if (typeof result === 'object' && (result.added.length || result.dropped.length || result.newlyOut.length)) {
                            newLogs.push({
                                leagueName: l.name,
                                added: result.added,
                                dropped: result.dropped,
                                newlyOut: result.newlyOut
                            });
                        }
                    }
                }

                // Restore original toast functionality
                window.showToast = tempToast; 

                // Single write after the loop instead of one localStorage.setItem per league.
                localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
                localStorage.setItem('mds_season_active_league', State.activeLeagueId);

                // Save logs to state and local storage
                State.syncLogs = newLogs;
                localStorage.setItem('mls_sync_logs', JSON.stringify(State.syncLogs));
                
                // Toast a simple summary
                let summaryMsg = `Successfully synced ${successCount} league${successCount === 1 ? '' : 's'}!`;
                if (newLogs.length > 0) {
                    summaryMsg += `\n\nChanges found in ${newLogs.length} league${newLogs.length === 1 ? '' : 's'}. Check the Sync Logs!`;
                }
                if (window.showToast) window.showToast(summaryMsg);

                // Re-render the logs accordion
                renderSyncLogs();
                
                // UX: Automatically open the accordion if there were changes so they don't have to hunt for them
                const accordion = document.getElementById('syncLogAccordion');
                if (accordion) accordion.open = newLogs.length > 0;
                
            } catch (err) {
                console.error("Sync All Error:", err);
                if (window.showToast) window.showToast("An error occurred while syncing leagues.", { isError: true });
            } finally {
                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';
                
                // Refresh data states natively
                if (typeof renderLeagueManager === 'function') renderLeagueManager();
                if (typeof loadRosterTab === 'function') loadRosterTab();
                if (typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
            }
        }, 50);
    };

    function renderLineupUI() {
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');
        if (!container || !benchContainer) return;
        
        let league = getActiveLeague();
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let benchPool = State.manualBenchMap[State.activeLeagueId] || [];
        let validSleeperStarters = getValidSleeperStarterIds(league);
        let optimizedStarterIds = starters.filter(s => s.player).map(s => s.player.id);
        // The season-long manual lock list -- used only to distinguish "manually locked" from
        // "auto-locked because the game already started" so the right lock control renders (see
        // lockControl below). Written via setPlayerLockState, by toggleLock (the lock icon) and
        // by initiateSwap (keeping a manual swap sticky across the next full recompute).
        let locksList = State.lockedPlayersMap[State.activeLeagueId] || [];

        let html = "";

        html += getNextLockCountdownHTML(starters);

        if (validSleeperStarters.length > 0) {
            let sleeperSet = new Set(validSleeperStarters);
            let optSet = new Set(optimizedStarterIds);
            let isMatch = sleeperSet.size === optSet.size && [...sleeperSet].every(id => optSet.has(id));
            
            if (isMatch) {
                html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: var(--primary-green); display: flex; align-items: center; justify-content: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Matches your active Sleeper lineup</div>`;
            } else {
                html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b; display: flex; align-items: center; justify-content: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Action Required: Differs from Sleeper lineup</div>`;
            }
        }

        // Only shown when there's actually something to clear -- avoids a dead/no-op button
        // taking up space on the common case where nobody has manually locked anyone.
        if (locksList.length > 0) {
            html += `<div class="mb-3 text-center"><button class="mls-btn-sm btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="unlockAllPlayers()" title="Clears season-long manual locks in this league only -- does not affect players auto-locked because their game already started">Unlock All (${locksList.length})</button></div>`;
        }

        // While a swap is pending, the source player's row gets an amber highlight (see
        // lockClass below) but nothing else on screen says what to actually do next --
        // this spells it out instead of leaving it to be inferred from one highlighted row.
        if (State.swapSourceId) {
            let swapSourcePlayer = (starters.find(s => s.player && s.player.id === State.swapSourceId) || {}).player
                || benchPool.find(p => p.id === State.swapSourceId);
            let swapSourceName = swapSourcePlayer ? swapSourcePlayer.name : 'this player';
            html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b;">Tap another player's ⇄ to swap with ${escapeHtml(swapSourceName)}, or tap Cancel to stop.</div>`;
        }

        starters.forEach(s => {
            let slotType = s.slot.replace(/[0-9]/g, '');

            if (s.player) {
                let p = s.player;
                let lockIcon = p.isLocked 
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary-green);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` 
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); opacity: 0.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
                let lockClass = p.isLocked ? "locked" : "";
                if (State.swapSourceId === p.id) lockClass += " swapping";

                // Auto-locked (game already started -- see hasKickedOff/optimizeLineup) gets a
                // distinct control instead of the normal toggle button: clicking the normal
                // button would call toggleLock(), which -- since this player was never added to
                // the season-long lock list -- would actually CREATE a manual lock rather than
                // clear anything, the opposite of what tapping a "locked" icon implies. Instead
                // this calls overrideAutoLock(), the failsafe for when the underlying kickoff/
                // Sleeper data turns out to be wrong about this specific player.
                let lockControl = (p.autoLocked && !locksList.includes(p.id))
                    ? `<button class="mls-btn-sm" title="Game in progress -- tap to override if this is wrong" style="background:none; border:none; cursor:pointer; padding:0 4px; display:inline-flex;" onclick="overrideAutoLock('${p.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #60a5fa;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>`
                    : `<button class="mls-btn-sm lock-btn" style="background:none; cursor:pointer; padding:0 4px;" onclick="toggleLock('${p.id}')">${lockIcon}</button>`;

                let posStr = p.posRank !== 999 ? `#${p.posRank}` : "-";
                let flexStr = p.flexRank !== 999 ? `#${p.flexRank}` : "-";
                let rankBadge = (p.posRank !== 999 || p.flexRank !== 999)
                    ? (['QB', 'K', 'DEF'].includes(p.pos) || p.flexRank === 999 ? `Pos: ${posStr}` : `Pos: ${posStr} | Flex: ${flexStr}`)
                    : "Unranked";
                
                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";
                let kickoffBadge = getKickoffBadgeHTML(p.team);
                
                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && !validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b; font-size: 0.65rem; margin-left: 4px;">Bench in Sleeper</span>`;
                }
                let badgesRow = [injBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');

                // The slot badge below already spells out the position for strict slots (RB1
                // always holds an RB, etc), so a second colored position pill there is pure
                // duplication. It's only ambiguous for FLEX/SFLEX (could be RB/WR/TE) -- so the
                // player's real position gets shown as plain text, and only in those cases.
                // Now shown on every row regardless of slot type (previously only FLEX/SFLEX/
                // bench, where the slot badge alone doesn't reveal it) -- for consistency, per
                // Benton, and so every row's meta line starts with the same kind of element
                // instead of some starting with plain text and others starting with the team badge.
                let plainPos = `<span class="mls-plain-pos pos-text-${p.pos.toLowerCase()}">${p.pos}</span>`;

                html += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotType}">${slotType}</span>
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${p.name}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${p.team}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        <button class="mls-btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                        ${lockControl}
                    </div>
                </div>`;
            } else {
                html += `
                <div class="lineup-slot empty">
                    <span class="slot-badge slot-${slotType}">${slotType}</span>
                    <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                </div>`;
            }
        });
        renderHTMLInto(container, html);

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
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${p.inj}</span>` : "";
                let kickoffBadge = getKickoffBadgeHTML(p.team);
                
                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; font-size: 0.65rem; margin-left: 4px;">Starting in Sleeper</span>`;
                }
                let badgesRow = [injBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');
                // Bench ("BN") never reveals real position the way a strict slot badge does, so
                // always show it as plain text here -- same reasoning as the starters block above.
                let plainPos = `<span class="mls-plain-pos pos-text-${p.pos.toLowerCase()}">${p.pos}</span>`;

                benchHTML += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-BN">BN</span>
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${p.name}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${p.team}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        <button class="mls-btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
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
        renderHTMLInto(benchContainer, benchHTML);

        // Auto-update the dashboard matrix in the background so status icons stay live
        if (typeof renderLeagueManager === 'function') renderLeagueManager();
    }
    // --- AUTO-LOAD SHARED LEAGUE ID FROM MDS & MOBILE TOOLTIPS ---
document.addEventListener('DOMContentLoaded', () => {
    const sharedLeagueId = localStorage.getItem('shared_sleeper_league_id');
    const mlsLeagueInput = document.getElementById('sleeperLeagueId'); 
    
    if (sharedLeagueId && mlsLeagueInput && !mlsLeagueInput.value) {
        mlsLeagueInput.value = sharedLeagueId;
        const syncBtn = document.getElementById('syncSleeperBtn');
        if (syncBtn) syncBtn.click();
    }

    // Enable tap-to-toggle for tooltips on touch devices
    document.querySelectorAll('.tooltip-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const text = icon.nextElementSibling;
            if (text && text.classList.contains('tooltip-text')) {
                text.classList.toggle('mobile-visible');
            }
        });
    });

    // Tap anywhere else on the screen to close open tooltips
    document.addEventListener('click', () => {
        document.querySelectorAll('.tooltip-text.mobile-visible').forEach(text => {
            text.classList.remove('mobile-visible');
        });
    });
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

    // Shift + Arrow keys to quickly cycle leagues
    if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (typeof window.cycleLeague === 'function') window.cycleLeague(-1);
        return;
    }
    if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (typeof window.cycleLeague === 'function') window.cycleLeague(1);
        return;
    }

    // Ctrl+Z / Cmd+Z to undo the last lineup edit (swap, lock toggle, unlock-all, or a
    // manual "Optimize Lineup" click), Ctrl+Shift+Z or Ctrl+Y / Cmd+Shift+Z to redo --
    // see pushLineupUndoSnapshot and undoLineupChange/redoLineupChange above for scope.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (typeof window.undoLineupChange === 'function') window.undoLineupChange();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        if (typeof window.redoLineupChange === 'function') window.redoLineupChange();
        return;
    }

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
        if (window.showToast) window.showToast("Please sync a league on the Dashboard first.", { isError: true });
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
        const playerMap = await getSleeperPlayerMap({ forceRefresh: true });

        let auditResults = [];

        for (let league of State.leagues) {
            if (!league.leagueId || league.leagueId.startsWith('manual_')) continue;

            const rosters = await getSleeperLeagueRosters(league.leagueId);

            // Resolve User ID. getSleeperUser throws on a not-found/error response (the
            // original inline fetch here didn't check response.ok at all, so a bad username
            // would just produce userId===undefined, myRoster staying undefined below, and
            // this league getting silently skipped by the "if (!myRoster) continue" a few
            // lines down). The try/catch below makes that same "skip this one league, keep
            // scanning the rest" behavior explicit instead of leaving it to fall out of an
            // unrelated undefined check.
            let userId;
            try {
                userId = (await getSleeperUser(league.username)).user_id;
            } catch (err) {
                continue;
            }

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
    // Lazy-loads the SheetJS (XLSX) library on first use, so pages that never upload an .xlsx
    // ranking file don't pay for it. Kept inside the module (rather than as a bare global) like
    // every other helper here, since this file isn't shared with any other page.
    function loadSheetJS(callback, onError) {
        if (typeof XLSX !== 'undefined') {
            callback();
        } else {
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            script.onload = callback;
            // Previously had no failure path at all: if the CDN fetch failed (offline,
            // ad-blocker, cdnjs outage), the onload callback simply never fired and the
            // .xlsx upload dead-ended with zero feedback -- the user just saw nothing
            // happen. Callers now get a chance to surface that instead of hanging forever.
            script.onerror = () => {
                script.remove();
                if (typeof onError === 'function') onError();
            };
            document.head.appendChild(script);
        }
    }
})();