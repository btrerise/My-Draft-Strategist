// Moved from lineup/mls.js in refactor chunk 3A: STATE MANAGEMENT (State, including the
// LINEUP OPTIMIZER SETTINGS block inside it), lineup undo/redo, and the NFL week / kickoff-time
// refreshers that fill State.
import { getNflState } from '../shared/api/sleeper.js';
import { readJSON } from './compat.js';
import { ESPN_TEAM_ALIASES } from './constants.js';
import { gameStatusMayBeStale } from './lineup/gameInfo.js';
import { renderLineupUI } from './legacy.js';

    // --- STATE MANAGEMENT ---
    export const State = {
        leagues: readJSON('mds_season_leagues', []),
        activeLeagueId: localStorage.getItem('mds_season_active_league') || null,
        earlyTeams: readJSON('mds_season_early_teams', []),
        rosRankings: readJSON('mds_season_ros', []),
        weeklyRankings: readJSON('mds_season_weekly', []),
        rosRankingsUpdatedAt: localStorage.getItem('mds_season_ros_updated') || null,
        rankingSets: {
            ros: readJSON('mls_ranking_sets_ros', []),
            weekly: readJSON('mls_ranking_sets_weekly', [])
        },
        weeklyRankingsUpdatedAt: localStorage.getItem('mds_season_weekly_updated') || null,
        marketRankings: readJSON('mds_season_market', []),
        // When marketRankings was last pulled or uploaded (ms epoch). Null for market data saved
        // before this was tracked -- updateMarketMetaDisplay shows no age rather than guess one.
        marketUpdatedAt: localStorage.getItem('mds_season_market_updated') || null,
        // FantasyCalc is the only source since refactor 7A (LeagueLogs retired its API), so a
        // saved 'leaguelogs' -- or anything else -- reads as 'fantasycalc'. Same key.
        marketSettings: Object.assign({ source: 'fantasycalc', type: 'redraft', qbs: '1', ppr: '1', tep: false }, readJSON('mls_market_settings', {}), { source: 'fantasycalc' }),
        tradeSettings: readJSON('mls_trade_settings', { waiverAdjustment: true, waiverAdjustmentValue: 500 }),
        simSettings: readJSON('mls_sim_settings', { waiverInsights: false }),
        // Positional Power Rankings (Roster tab). source: 'custom' (the league's own rankings) |
        // 'market' (Market Consensus). See refreshPowerRankings.
        powerSettings: Object.assign({ source: 'custom' }, readJSON('mls_power_settings', {})),
        // Waiver Wire Assistant Auto-Find controls (Scout tab). compare: 'lineup' (would he
        // start?) | 'roster' (drop-candidate upgrade); basis: 'weekly' | 'ros' (scan order); pos:
        // a position, 'FLEX', or 'ALL' (grouped by position); limit: rows per group.
        // scope ('league' | 'all') belongs to the Scan Pasted List half of the tool, not
        // Auto-Find -- it rides in this same object purely so it persists under the one
        // localStorage key the rest of the Waiver Wire Assistant's settings already use.
        // intent ('buy' | 'sell') rides along for the same reason: it only steers the All My
        // Leagues search's Positional Power Rank recommendations (see runAllLeaguesSearch).
        waiverScanSettings: Object.assign({ compare: 'lineup', basis: 'weekly', pos: 'FLEX', limit: 10, startersOnly: false, scope: 'league', intent: 'buy' }, readJSON('mls_waiver_scan_settings', {})),
        // --- LINEUP OPTIMIZER SETTINGS (FLEX Kickoff Optimization) ---
        // flexKickoffOptimization gates optimizeFlexKickoffOrder() (see below): when on, the
        // optimizer reassigns which flex-eligible starters sit in strict RB/WR/TE slots vs the
        // true FLEX slot(s) so FLEX always holds the latest kickoff(s), maximizing late-swap
        // flexibility. Defaults to true -- this is a strict improvement for anyone using their
        // platform's real-time swap window, but some people prefer their FLEX slot to just
        // reflect rank order without the extra slot-shuffling, hence the escape valve. This is
        // separate from kickoff-based auto-lock (see hasKickedOff/isSleeperStarter in
        // optimizeLineup), which always stays on -- that one is about not silently benching an
        // already-started player, not a strategy preference, and already has its own override
        // mechanism (per-player overrideAutoLock + Unlock All).
        lineupSettings: readJSON('mls_lineup_settings', { flexKickoffOptimization: true }),
        syncLogs: readJSON('mls_sync_logs', []),
        sosMap: readJSON('mds_season_sos', {}),
        lockedPlayersMap: readJSON('mds_season_locks_map', {}),
        // Per-league, per-week list of player ids the person has explicitly told the auto-lock
        // feature (see optimizeLineup) to back off of -- the failsafe for when gameTimesByTeam
        // or Sleeper's synced starters turn out to be wrong about a specific player. Deliberately
        // NOT part of lockedPlayersMap: that list is a season-long, user-curated set of "always
        // start this player" decisions, while this is a narrow, week-scoped correction for one
        // player's auto-detected state. Shape: { [leagueId]: { week: N, ids: [...] } } -- the
        // week is stored alongside the ids so a stale override from a prior week (which would no
        // longer make sense once gameTimesByTeam has moved on) is ignored rather than silently
        // carried forward; see isAutoLockOverridden below.
        autoLockOverridesMap: readJSON('mls_autolock_overrides_map', {}),
        manualStartersMap: readJSON('mds_season_manual_starters', {}),
        manualBenchMap: readJSON('mds_season_manual_bench', {}),
        // leagueId -> which rankings that league's saved lineup was built from (see
        // getLeagueRankingsStamp). Each saved player carries the posRank/flexRank it was
        // optimized with, so a lineup saved before new rankings were assigned kept showing
        // "Unranked" in every league except the one the upload happened in. optimizeLineup
        // compares against this and recomputes a stale lineup instead of just re-showing it.
        lineupRankingsStamps: readJSON('mls_lineup_rankings_stamps', {}),
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
        // Not persisted -- team -> { opp, home, state } for the current week, from the same ESPN
        // scoreboard response as gameTimesByTeam. state is ESPN's 'pre' | 'in' | 'post'; 'post'
        // is the only thing that counts as a finished game (kickoff having passed doesn't). Empty
        // whenever gameTimesByTeam is; consumers treat a missing entry as unknown.
        gamesByTeam: {},
        // Epoch ms of the last scoreboard fetch attempt (success or not), so a game-in-progress
        // refresh (see gameStatusMayBeStale) can't fire on every single re-render.
        gameTimesFetchedAt: 0,
        // Not persisted -- the season Sleeper's state endpoint reported alongside currentNflWeek.
        // Needed to build the projections URL; null until refreshCurrentNflWeek resolves.
        currentNflSeason: null,
        // Not persisted -- Sleeper's weekly projections for the Lineup tab's per-player display.
        // data is { playerId: { pts_ppr, ... } } or null if never fetched; week guards against a
        // stale week's numbers being shown after currentNflWeek moves on.
        lineupProjections: { week: null, data: null, fetchedAt: 0 },
        // Not persisted -- leagueIds whose lineup optimizeLineup computed this session before
        // lineupProjections had loaded, i.e. without the FLEX projection fallback (see
        // compareFlexCandidates). refreshLineupStats re-optimizes such a league once projections
        // arrive, so a lineup built from a sync that beat the projections fetch doesn't keep a
        // posRank-only FLEX pick. Starts empty on page load: a saved lineup from an earlier
        // visit is left as-is, same as any other saved lineup.
        projectionlessLineups: new Set(),
        // Not persisted -- leagueId ->{ week, points, fetchedAt, finalKey }: this roster's
        // players_points from Sleeper's matchups endpoint. finalKey records which teams' games
        // were final when it was fetched, so a game finishing afterwards forces a refetch.
        lineupActualPoints: {},
        lineupStatsRefreshing: false,
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
    export function pushLineupUndoSnapshot(leagueId) {
        if (!leagueId) return;
        if (!State.lineupUndoStackMap[leagueId]) State.lineupUndoStackMap[leagueId] = [];
        State.lineupUndoStackMap[leagueId].push(snapshotLineupState(leagueId));
        if (State.lineupUndoStackMap[leagueId].length > MAX_UNDO_STACK_SIZE) {
            State.lineupUndoStackMap[leagueId].shift();
        }
        State.lineupRedoStackMap[leagueId] = [];
    }

    export const undoLineupChange = function() {
        const leagueId = State.activeLeagueId;
        const undoStack = State.lineupUndoStackMap[leagueId];
        if (!leagueId || !undoStack || undoStack.length === 0) return;

        if (!State.lineupRedoStackMap[leagueId]) State.lineupRedoStackMap[leagueId] = [];
        State.lineupRedoStackMap[leagueId].push(snapshotLineupState(leagueId));

        restoreLineupState(leagueId, undoStack.pop());
        renderLineupUI();
        if (typeof window.showToast === 'function') window.showToast("Undid last lineup change");
    };

    export const redoLineupChange = function() {
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
    export function refreshCurrentNflWeek() {
        getNflState()
            .then(data => {
                if (data && typeof data.week === 'number') {
                    State.currentNflWeek = data.week;
                    State.currentNflSeason = data.league_season || data.season || null;
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
    // Returns the underlying fetch promise (rather than truly firing-and-forgetting) so a
    // caller that specifically needs kickoff data to be current -- like runMatchupSim's
    // actual-score check below -- can await it; existing fire-and-forget callers are
    // unaffected since they simply don't await the return value.
    export function refreshGameTimes() {
        const week = State.currentNflWeek;
        if (week == null) return Promise.resolve();
        if (State.gameTimesFetchedForWeek === week && Object.keys(State.gameTimesByTeam).length > 0 && !gameStatusMayBeStale()) return Promise.resolve();

        State.gameTimesFetchedAt = Date.now();
        // mdsFetch rather than a bare fetch: a stalled ESPN request would otherwise leave this
        // promise pending forever, which matters beyond the fire-and-forget callers -- runMatchupSim
        // awaits this one before deciding whether to use a player's live score, so a hang here
        // would stall the whole simulation rather than just skip a kickoff badge.
        return window.mdsFetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data || !Array.isArray(data.events)) return;
                const map = {};
                const games = {};
                data.events.forEach(evt => {
                    const iso = evt.date; // ISO 8601 UTC kickoff, shared by both competitors in the event
                    const comp = evt.competitions && evt.competitions[0];
                    if (!iso || !comp || !Array.isArray(comp.competitors)) return;
                    const abbrs = comp.competitors.map(c => {
                        const abbr = c.team && c.team.abbreviation;
                        return abbr ? (ESPN_TEAM_ALIASES[abbr] || abbr) : null;
                    });
                    const gameState = (evt.status && evt.status.type && evt.status.type.state)
                        || (comp.status && comp.status.type && comp.status.type.state) || null;
                    comp.competitors.forEach((c, i) => {
                        const abbr = abbrs[i];
                        if (!abbr) return;
                        map[abbr] = iso;
                        // The game has exactly two competitors, so the opponent is whichever
                        // entry isn't this one.
                        const opp = abbrs.find((_, j) => j !== i) || null;
                        games[abbr] = { opp, home: c.homeAway === 'home', state: gameState };
                    });
                });
                if (Object.keys(map).length === 0) return; // treat an empty/malformed response as a failed fetch
                State.gameTimesByTeam = map;
                State.gamesByTeam = games;
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
