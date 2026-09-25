/**
 * Fantasy Football Season & Lineup Strategist - Core Logic
 * Refactored for modular encapsulation, performance, and clean architecture.
 */

// Pilot ES module extraction (see rankingsParser.js for rationale) -- this is the only
// piece of mls.js currently split out. import statements must live at a module's top
// level, which is why this sits above the IIFE rather than inside it; the imported
// function is still just a normal binding the IIFE's closures can reference below.
import { parseRankingsFiles } from './rankingsParser.js';
import { getNflState, getSleeperUser, getSleeperLeague, getSleeperLeagueUsers, getSleeperLeagueRosters, getSleeperUserLeagues, getSleeperPlayerMap, getSleeperMatchups } from './sleeperApi.js';
import { fetchMarketConsensusData } from './marketDataApi.js';
import { runMatchupSimulation, clearSimResults, showSimNotice } from './monteCarloUi.js';
import { getPlayerWeeklyScoreHistory, getWeeklyProjections } from './sleeperService.js';
import { MIN_RELIABLE_GAMES, getPlayerVarianceProfile, getProbabilityBeats } from './statsEngine.js';
import { FLEX_POSITIONS, buildRankDisplayIndex, findFreeAgents, checkAgainstLineup, compareForScan, matchesPosFilter } from './waiverScanner.js';

(function () {
    'use strict';

    // Belt and braces for the service worker's stale-while-revalidate window. Assets are
    // served from cache first (see sw.js), so there is a narrow window after a deploy where a
    // browser could pair this file with an older cached js/utils.js from before readJSON
    // existed. State construction below would then throw on an undefined function and blank
    // the page -- precisely the failure readJSON was added to prevent. This local binding
    // falls back to the old inline behavior so that can't happen; once every client is on the
    // current utils.js it is simply never used.
    const readJSON = window.readJSON || function (key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
    };

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

    // Small muted "(T2)" suffix for a rank shown on a player card, when the rankings file that
    // rank came from also had a Tier column (see rankingsParser.js). Returns "" for a missing tier
    // -- the common case, since Tier is an optional column -- so callers can append it
    // unconditionally and cards for tier-less rankings look exactly as they always have.
    const tierTag = (tier) => (Number.isFinite(tier) && tier > 0)
        ? ` <span class="mls-tier" title="Tier ${tier}">(T${tier})</span>`
        : '';

    // Second rank for the Scout tab's cards: the player's position rank (and its tier), shown
    // after their overall "Rank" so it's clear which number is which. On flex-style weekly sheets
    // the overall rank is really a FLEX rank for RB/WR/TE, so the position rank is the only place
    // their position tier can show. Returns "" when there's no position rank, or when it would just
    // repeat the overall one (a QB, or a file with no separate Pos Rank column, where posRank falls
    // back to the overall rank) -- unless the tiers differ, in which case it still has something to say.
    const posRankTag = (obj, colorClass) => {
        if (!obj || obj.posRank === undefined || obj.posRank === null || obj.posRank === 999) return '';
        if (obj.posRank === obj.rank && (obj.posTier ?? null) === (obj.tier ?? null)) return '';
        return ` <span class="mls-rank-sep">&middot;</span> Pos: <strong class="${colorClass}">#${obj.posRank}</strong>${tierTag(obj.posTier)}`;
    };

    // How long the Lineup tab's per-player projected/final points data (see refreshLineupStats)
    // is reused before a re-render is allowed to refetch it. Deliberately short-ish rather than
    // live: this is a companion view refreshed when the person opens or interacts with the tab,
    // not a scoreboard that updates itself through Sunday.
    const LINEUP_STATS_TTL_MS = 2 * 60 * 1000;
    const LINEUP_PROJECTION_TTL_MS = 5 * 60 * 1000;

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
            cardId: 'rosRankingsCard', headerSetNameId: 'rosHeaderSetName',
            leaguesRowId: 'rosSetLeaguesRow', leaguesSummaryId: 'rosSetLeaguesSummary',
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
            cardId: 'weeklyRankingsCard', headerSetNameId: 'weeklyHeaderSetName',
            leaguesRowId: 'weeklySetLeaguesRow', leaguesSummaryId: 'weeklySetLeaguesSummary',
            label: 'Weekly', staleAfterDays: 6
        }
    };

    // --- STATE MANAGEMENT ---
    const State = {
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
        marketSettings: readJSON('mls_market_settings', { source: 'fantasycalc', type: 'redraft', qbs: '1', ppr: '1', tep: false }),
        tradeSettings: readJSON('mls_trade_settings', { waiverAdjustment: true, waiverAdjustmentValue: 500 }),
        simSettings: readJSON('mls_sim_settings', { waiverInsights: false }),
        // Waiver Wire Assistant Auto-Find controls (Scout tab). compare: 'lineup' (would he
        // start?) | 'roster' (drop-candidate upgrade); basis: 'weekly' | 'ros' (scan order); pos:
        // a position, 'FLEX', or 'ALL' (grouped by position); limit: rows per group.
        // scope ('league' | 'all') belongs to the Scan Pasted List half of the tool, not
        // Auto-Find -- it rides in this same object purely so it persists under the one
        // localStorage key the rest of the Waiver Wire Assistant's settings already use.
        waiverScanSettings: Object.assign({ compare: 'lineup', basis: 'weekly', pos: 'FLEX', limit: 10, startersOnly: false, scope: 'league' }, readJSON('mls_waiver_scan_settings', {})),
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
        // Not persisted -- leagueId -> { week, points, fetchedAt, finalKey }: this roster's
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
    function refreshGameTimes() {
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

    // Canonical short injury-status code for a raw Sleeper player object -- 'Q', 'D', 'OUT',
    // 'IR', 'SUS', 'PUP', 'NFI', or null if healthy/no concern. Mirrors the same
    // classification already used for the roster-details injury badge (see rosterDetails in
    // processSleeperData) so "what counts as Doubtful/Out/IR" can't silently drift between
    // the two -- kept as its own function rather than merged into that inline block since that
    // block's job is building a display badge, not answering a yes/no eligibility question.
    function getShortInjuryStatus(p) {
        if (!p) return null;
        let inj = null;
        if (p.injury_status && p.injury_status !== "None" && p.injury_status !== "Active") inj = p.injury_status;
        else if (p.status && ['Suspended', 'PUP', 'IR', 'NFI', 'Did Not Report'].includes(p.status)) inj = p.status;
        if (!inj) return null;

        const iUpper = inj.toUpperCase();
        if (iUpper.includes('QUESTIONABLE')) return 'Q';
        if (iUpper.includes('DOUBTFUL')) return 'D';
        if (iUpper.includes('OUT')) return 'OUT';
        if (iUpper.includes('SUSPENDED')) return 'SUS';
        if (iUpper.includes('IR') || iUpper.includes('INJURED RESERVE')) return 'IR';
        if (iUpper.includes('PUP')) return 'PUP';
        if (iUpper.includes('NFI')) return 'NFI';
        if (iUpper.includes('DID NOT REPORT') || iUpper === 'DNR') return 'DNR';
        return inj;
    }

    // Statuses that mean a player has a real, non-trivial chance of not actually taking the
    // field this week -- specifically the ones the Monte Carlo simulator and its Lineup
    // Insights bench comparisons should never simulate as if they're playing normally.
    // Deliberately a SEPARATE, stricter list from HARD_OUT_STATUSES above: that one exists for
    // the lineup optimizer's "should I auto-start this person" decision and intentionally
    // leaves Doubtful in play there (still a game-time call, worth trusting rankings over) --
    // but simulating a distribution around a normal week's variance isn't a start/sit call,
    // it's an implicit claim that this player is taking the field at all, which Doubtful
    // specifically hasn't been decided yet, and Out/IR/PUP/NFI/Suspended/DNR already answer as
    // no. NFI is included alongside the PUP/Suspended/DNR grouping Benton asked for -- it's the
    // same "not injury-related but definitely not playing" category HARD_OUT_STATUSES already
    // treats identically to PUP, so leaving it out here looked more like an oversight than a
    // deliberate choice; flag if that's not what's wanted.
    const SIM_EXCLUDE_STATUSES = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR'];

    function isExcludedFromSimulation(p) {
        const shortInj = getShortInjuryStatus(p);
        return shortInj !== null && SIM_EXCLUDE_STATUSES.includes(shortInj);
    }

    // Best Ball leagues have no weekly lineup to set and (almost always) no IR slot, so every
    // tool whose whole premise is "you need to go move somebody" has to sit them out. The
    // formatBadge string is the only place this is recorded -- processSleeperData stamps
    // "Best Ball" into it from leagueData.settings.best_ball, and the raw setting isn't kept
    // on the league object afterwards. Factored out of the three near-identical inline copies
    // that had accumulated (dashboard matrix, optimizeAllLineups' skip + its count) so a
    // fourth caller can't drift from them.
    function isBestBallLeague(l) {
        return !!(l && l.formatBadge && l.formatBadge.toLowerCase().includes("best ball"));
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

    // --- RANKINGS LOOKUP INDEX ---
    // cleanName -> ranking row, for the three big rankings arrays (ROS, Weekly, Market). Nearly
    // every consumer of these arrays looks players up by cleanName, and nearly all of them were
    // doing it with `arr.find(r => r.cleanName === x)` from inside a loop -- O(n x m) work. The
    // worst case was runMarketDisconnectAnalysis, which scanned all of rosRankings once per
    // market entry: ~250,000 comparisons for two ~500-row lists.
    //
    // Cached in a WeakMap keyed on the ARRAY ITSELF rather than on a State field name, which is
    // what makes this safe to hold onto: every assignment to State.rosRankings /
    // weeklyRankings / marketRankings in this file creates a brand-new array (either a
    // [...spread] or a []), and nothing anywhere mutates one of these arrays in place. So a
    // rankings swap -- switching leagues, loading a named set, uploading a file -- produces a
    // different array identity that simply misses the cache and rebuilds. There is no
    // invalidation to remember to call, and no way for a stale index to be handed back.
    //
    // First entry wins, matching the .find() calls this replaces.
    const _rankingIndexCache = new WeakMap();
    const EMPTY_RANKING_INDEX = new Map(); // shared; callers only ever read from an index
    function rankingIndex(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return EMPTY_RANKING_INDEX;
        let idx = _rankingIndexCache.get(arr);
        if (!idx) {
            idx = new Map();
            arr.forEach(r => {
                if (r && r.cleanName && !idx.has(r.cleanName)) idx.set(r.cleanName, r);
            });
            _rankingIndexCache.set(arr, idx);
        }
        return idx;
    }

    // --- DRAWER & SWIPE LOGIC ---
    // Focus trap instance for the drawer -- created lazily on first open rather than at
    // load time, since window.createFocusTrap (from utils.js, a plain script) needs to have
    // already run, and this module's top-level code can execute before that plain script's
    // DOMContentLoaded-independent top-level assignment has (module scripts are deferred by
    // spec, but this keeps the two files from having an implicit load-order dependency).
    let drawerFocusTrap = null;

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

        if (isOpen) {
            // No onEscape here: the existing document-level Escape handler below already
            // calls toggleDrawer() when the drawer is open, which (via the isOpen === false
            // branch) deactivates this trap on its way out. Wiring a second Escape handler
            // through the trap itself would just be two paths to the same toggle.
            if (typeof window.createFocusTrap === 'function') {
                drawerFocusTrap = window.createFocusTrap(drawer);
                drawerFocusTrap.activate();
            }
        } else if (drawerFocusTrap) {
            drawerFocusTrap.deactivate();
            drawerFocusTrap = null;
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
        
        // 'guide' is deliberately left out of the swipe order -- it's still reachable from
        // the drawer, but swiping from Scout into a wall of documentation reads as a
        // misfire rather than a tab change. Scout is the last swipeable tab.
        const tabs = ['setup', 'roster', 'lineup', 'scout'];
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
    // mds_season_* and mls_*. mds_handoff_roster is excluded -- transient signal from MDS,
    // not a persistent MLS setting.
    function getMlsOwnedKeys() {
        return Object.keys(localStorage).filter(k =>
            (k.startsWith('mds_season_') || k.startsWith('mls_'))
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
        reader.onload = async function(e) {
            let payload;
            try {
                payload = JSON.parse(e.target.result);
            } catch (err) {
                if (window.showToast) window.showToast("That file isn't valid JSON - couldn't read it as a backup.", { isError: true });
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
            const confirmMsg = `This replaces your current My Lineup Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately.`;

            if (!await window.showConfirm(confirmMsg, { title: 'Restore from backup?', confirmText: 'Replace My Data', danger: true })) {
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

    window.factoryReset = async function() {
        if (await window.showConfirm("This clears every league, cached ranking set, custom SoS grid, and setting in My Lineup Strategist.\n\nMy Draft Strategist data is not affected. This cannot be undone.", { title: 'Factory reset this app?', confirmText: 'Factory Reset', danger: true })) {
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

// HTML escaping for outside text (player/league/set names, teams...) placed into markup.
// Forwards to the shared copy in js/utils.js (window.escapeHtml, used by MDS too). The
// inline fallback covers a browser briefly pairing this file with an older cached
// utils.js right after a deploy (see sw.js), when window.escapeHtml wouldn't exist yet.
function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str ?? '')
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

// Reverse index (normalized clean name -> Sleeper player id), built lazily off the same full
// player map getPlayerSearchIndex draws from -- but keyed the other direction, since anywhere
// this app only has a player by NAME (a rankings file, market data, the autocomplete result
// above) needs their Sleeper id to pull real weekly score history from. Waiver Insights'
// free-agent candidates and the standalone player-lookup search both go through this.
let _cleanNameToIdPromise = null;
function getCleanNameToIdIndex() {
    if (_cleanNameToIdPromise) return _cleanNameToIdPromise;
    _cleanNameToIdPromise = getSleeperPlayerMap().then(map => {
        const index = {};
        Object.entries(map).forEach(([id, p]) => {
            if (!p.first_name) return;
            const clean = normalizeName(`${p.first_name} ${p.last_name}`);
            // First match wins on a rare exact-name collision -- not worth a disambiguation
            // UI for how infrequently two active, fantasy-relevant players share one name.
            if (!index[clean]) index[clean] = id;
        });
        return index;
    }).catch(err => {
        _cleanNameToIdPromise = null;
        throw err;
    });
    return _cleanNameToIdPromise;
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
    // True between a keystroke and its search results landing. Callers that add their own
    // Enter behavior (the manual-add form) check this so an Enter pressed before the dropdown
    // has caught up isn't mistaken for "nothing matched".
    let pending = false;

    function render() {
        if (matches.length === 0) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; return; }
        dropdown.innerHTML = matches.map((p, i) => `
            <div class="autocomplete-item${i === highlightedIdx ? ' highlighted' : ''}" role="option" data-idx="${i}">
                <span>${escapeHtml(p.name)}</span>
                <span class="autocomplete-meta">${escapeHtml(p.pos)} ·${escapeHtml(p.team)}</span>
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
        if (q.length < 2) { pending = false; close(); return; }
        pending = true;
        getPlayerSearchIndex().then(index => {
            if (inputEl.value.trim().toLowerCase() !== q) return;
            pending = false;
            const starts = [], contains = [];
            for (const p of index) {
                if (p.searchKey.startsWith(q)) { starts.push(p); if (starts.length >= 8) break; }
                else if (contains.length < 8 && p.searchKey.includes(q)) contains.push(p);
            }
            matches = starts.concat(contains).slice(0, 8);
            render();
        }).catch(() => { pending = false; });
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
        else if (e.key === 'Enter') {
            // Enter takes the arrowed-to row, or the only row when the search has narrowed to
            // one -- so "type a name, Enter" works without reaching for the arrow keys. With
            // several rows and none highlighted it stays a no-op rather than guessing.
            const pick = highlightedIdx !== -1 ? matches[highlightedIdx] : (matches.length === 1 ? matches[0] : null);
            // preventDefault doubles as the "handled" signal: any Enter listener added after
            // this one (the manual-add form's save-on-Enter) checks e.defaultPrevented, so the
            // same keypress can't both pick a player and save them.
            if (pick) { e.preventDefault(); select(pick); }
        }
        else if (e.key === 'Escape') { close(); }
    });

    inputEl.addEventListener('blur', () => setTimeout(close, 150));

    return {
        isOpen: () => matches.length > 0,
        isPending: () => pending
    };
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
        initManualAddForm();
        attachPlayerAutocomplete(document.getElementById('simPlayerSearch'), (p) => {
            window.lookupSimPlayer(p);
        });
        attachScoutSuggestionHandler('waiverOutput');
        attachScoutSuggestionHandler('tradeOutput');
        populateEarlyGameDropdown();
        refreshLeagueDropdown();
        // State starts from the flat global rankings keys -- the last upload for ANY league --
        // and only switchActiveLeague() used to replace them with the active league's own set.
        // So after a reload, a league on set A showed set B's players until you switched away
        // and back, while its dropdown (and now the card header) said A. Hydrate up front, per
        // type, and only where the league has something of its own (a saved set that still
        // exists, or legacy data): otherwise that type keeps the global fallback, as before.
        {
            const bootLeague = getActiveLeague() || State.leagues[0] || null;
            if (bootLeague) {
                ['ros', 'weekly'].forEach(t => {
                    const cfg = RANKING_TYPE_CONFIG[t];
                    const setId = bootLeague[cfg.leagueSetIdKey];
                    const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
                    const legacy = bootLeague[cfg.leagueLegacyDataKey];
                    if (set) {
                        State[cfg.stateKey] = [...set.data];
                        State[cfg.updatedAtKey] = set.updatedAt;
                    } else if (Array.isArray(legacy) && legacy.length > 0) {
                        State[cfg.stateKey] = [...legacy];
                        State[cfg.updatedAtKey] = bootLeague[cfg.leagueLegacyUpdatedKey] || null;
                    }
                });
            }
        }
        updateRankingsMetaDisplay();
        // Market data persists across reloads, but this was only ever called right after a
        // fetch/upload -- so on a fresh page load the Trade Finder showed no count or age at all.
        updateMarketMetaDisplay();
        generateSoSGrid();
        checkForDraftStrategistHandoff();
        applyMarketSettingsToUI();
        applyTradeSettingsToUI();
        applyLineupSettingsToUI();
        applySimSettingsToUI();
        applyWaiverScanSettingsToUI();
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

        // Last line of init on purpose: tells the safety net in utils.js that this module --
        // and every module it imports -- evaluated all the way through and the page is
        // genuinely usable, so a later uncaught error gets logged instead of covering a
        // working screen with the fatal-boot banner. If any of the seven files in this
        // module graph 404s, or anything above throws, this never runs and the banner stays
        // armed, which is exactly the behavior we want.
        if (typeof window.markAppReady === 'function') window.markAppReady();
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
    // optimizeLineup's autoLocked handling). Once ESPN reports the game over it says "Final"
    // instead, matching the final score shown on the row (see getPlayerPointsHTML).
    function getKickoffBadgeHTML(team) {
        if (!team || team === "FA") return "";
        const iso = State.gameTimesByTeam[team];
        if (!iso) return "";
        const kickoffMs = new Date(iso).getTime();
        if (isNaN(kickoffMs)) return "";
        if (isGameFinal(team)) return `<span class="badge kickoff-badge kickoff-started">Final</span>`;
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

    // True only when ESPN says the team's game is over -- unlike hasKickedOff, which is just
    // "kickoff time has passed" and stays true through the whole game. Unknown is false.
    function isGameFinal(team) {
        const g = team && State.gamesByTeam[team];
        return !!g && g.state === 'post';
    }

    // True when the cached scoreboard can't be trusted to reflect current game state: some game
    // has kicked off but was last seen as not-yet-final, and the cache is older than
    // LINEUP_STATS_TTL_MS. Used by refreshGameTimes to decide whether its once-per-week cache is
    // still good -- before this, a page left open from Sunday morning would never learn that
    // any game had finished.
    function gameStatusMayBeStale() {
        if (Date.now() - State.gameTimesFetchedAt < LINEUP_STATS_TTL_MS) return false;
        return Object.keys(State.gamesByTeam).some(team => State.gamesByTeam[team].state !== 'post' && hasKickedOff({ team }));
    }

    // Sleeper's projection key for a league's scoring format. Only reception scoring is
    // distinguished (matching how league.pprVal is derived at sync time) -- bonus/premium
    // scoring such as TE premium isn't reflected in Sleeper's precomputed pts_* fields.
    function getLeagueScoringKey(league) {
        return league.pprVal === 1 ? 'pts_ppr' : (league.pprVal === 0.5 ? 'pts_half_ppr' : 'pts_std');
    }

    // "@ PHI" / "vs KC" for a player's team this week, or "" when there's no game data for them
    // (fetch hasn't resolved, bye week, free agent).
    function getOpponentHTML(team) {
        const g = team && State.gamesByTeam[team];
        if (!g || !g.opp) return "";
        return `<span class="mls-opp">${g.home ? 'vs' : '@'} ${escapeHtml(g.opp)}</span>`;
    }

    // The kickoff badge plus the opponent, kept together as one unit on the row's badge line so
    // a wrapping line can't split "Sun 1:25 PM" from "vs MIA". "" whenever the kickoff badge is
    // (both come from the same scoreboard response, so one is never present without the other).
    function getGameInfoHTML(team) {
        const badge = getKickoffBadgeHTML(team);
        if (!badge) return "";
        return `<span class="mls-game-info">${badge}${getOpponentHTML(team)}</span>`;
    }

    // The single points figure shown at the right of a Lineup row: Sleeper's projection until the
    // player's game is final, then the real score with the projection kept alongside for
    // comparison. Deliberately no in-progress score -- see refreshLineupStats. Returns "" when
    // there's nothing meaningful to show (bye, free agent, projections not loaded yet), and a
    // dash when projections did load but Sleeper doesn't project this player.
    function getPlayerPointsHTML(p) {
        const week = State.currentNflWeek;
        if (week == null || !p.team || p.team === "FA" || TEAM_BYES[p.team] === week) return "";

        const fmt = (n) => n.toFixed(1);
        const proj = State.lineupProjections;
        const projLoaded = proj.week === week && !!proj.data;
        const league = getActiveLeague();
        const projRaw = projLoaded && league && proj.data[p.id] ? proj.data[p.id][getLeagueScoringKey(league)] : undefined;
        const projVal = typeof projRaw === 'number' ? projRaw : null;

        // Only trust the cached points for a team whose game was already final when they were
        // fetched (finalKey) -- otherwise a game that finished afterwards would show a partial
        // score as if it were the final one, until the next refetch.
        const actualEntry = State.lineupActualPoints[State.activeLeagueId];
        const actualRaw = isGameFinal(p.team) && actualEntry && actualEntry.week === week && actualEntry.finalKey.split(',').includes(p.team)
            ? actualEntry.points[p.id] : undefined;

        if (typeof actualRaw === 'number') {
            const sub = projVal !== null ? `proj ${fmt(projVal)}` : 'final';
            return `<div class="mls-pts mls-pts-final" title="Final score. Sleeper's pre-game projection shown below."><span class="mls-pts-main">${fmt(actualRaw)}</span><span class="mls-pts-sub">${sub}</span></div>`;
        }
        if (projVal !== null) {
            return `<div class="mls-pts" title="Sleeper's projection for this week. Informational only; the optimizer uses your rankings."><span class="mls-pts-main">${fmt(projVal)}</span><span class="mls-pts-sub">proj</span></div>`;
        }
        if (projLoaded) {
            return `<div class="mls-pts mls-pts-none" title="Sleeper doesn't have a projection for this player."><span class="mls-pts-main">&mdash;</span><span class="mls-pts-sub">proj</span></div>`;
        }
        return "";
    }

    // Loads what the Lineup tab's projected/final points and opponent display needs, then
    // re-renders once if anything new arrived. Called at the end of every renderLineupUI; the
    // in-flight flag plus each source's own freshness check keep that from looping or hammering
    // the APIs (a re-render caused by fresh data finds everything fresh and does nothing).
    //
    // Refresh-on-render, not live: projections are refetched at most every 5 minutes and final
    // scores every 2, and only when the person is already opening or interacting with the tab.
    // This is a companion to the Sleeper app, not a scoreboard -- nothing polls on a timer, and
    // in-progress scores are intentionally never shown (only a game ESPN reports as final).
    // Every failure path just leaves the display as it was.
    function refreshLineupStats() {
        if (State.lineupStatsRefreshing) return;
        const league = getActiveLeague();
        const week = State.currentNflWeek;
        if (!league || !league.leagueId || week == null) return;

        State.lineupStatsRefreshing = true;
        (async () => {
            let changed = false;
            try {
                // Scoreboard first: it decides which games are final, and is what the actual-
                // points fetch below is keyed on. It re-renders the tab itself if it fetched.
                await refreshGameTimes();

                const proj = State.lineupProjections;
                if (State.currentNflSeason && (proj.week !== week || Date.now() - proj.fetchedAt > LINEUP_PROJECTION_TTL_MS)) {
                    const data = await getWeeklyProjections(State.currentNflSeason, week);
                    if (data) {
                        State.lineupProjections = { week, data, fetchedAt: Date.now() };
                        changed = true;
                    } else {
                        // Keep whatever we had, but stamp the attempt so a failing endpoint
                        // isn't retried on every render.
                        State.lineupProjections = { ...proj, fetchedAt: Date.now() };
                    }
                }

                const lineupPlayers = [
                    ...(State.manualStartersMap[league.leagueId] || []).map(s => s.player).filter(Boolean),
                    ...(State.manualBenchMap[league.leagueId] || [])
                ];
                const finalKey = [...new Set(lineupPlayers.map(p => p.team).filter(isGameFinal))].sort().join(',');
                const cached = State.lineupActualPoints[league.leagueId];
                const actualsStale = !cached || cached.week !== week || cached.finalKey !== finalKey
                    || Date.now() - cached.fetchedAt > LINEUP_STATS_TTL_MS;
                if (finalKey && actualsStale) {
                    try {
                        const matchups = await getSleeperMatchups(league.leagueId, week);
                        const mine = matchups.find(m => m.roster_id === league.rosterId);
                        if (mine && mine.players_points) {
                            State.lineupActualPoints[league.leagueId] = { week, points: mine.players_points, fetchedAt: Date.now(), finalKey };
                            changed = true;
                        }
                    } catch (err) {
                        /* keep any earlier points; the next render retries */
                    }
                }
            } catch (err) {
                /* leave the display as it was; see comment above */
            } finally {
                State.lineupStatsRefreshing = false;
            }

            const activeTab = document.querySelector('.tab-content.active');
            if (changed && activeTab && activeTab.id === 'lineupTab') {
                renderLineupUI(); // renders whichever league is active now, and re-checks its data
            } else if (State.activeLeagueId !== league.leagueId) {
                // Switched leagues mid-fetch: that league's own render was skipped by the
                // in-flight guard above, so give it its turn now.
                refreshLineupStats();
            }
        })();
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

    // Flags any CURRENT STARTER carrying one of the statuses SIM_EXCLUDE_STATUSES treats as a
    // real chance of not taking the field (Doubtful, Out, IR, PUP, Suspended, NFI, Did Not
    // Report). The Monte Carlo simulator already quietly excludes these players from its own
    // math, but "quietly" is the problem for someone who hasn't run a simulation recently --
    // a starter slot burned on someone who isn't playing is a mistake worth surfacing directly
    // on the Lineup tab itself, not just implied by a simulator result elsewhere. Recommends a
    // swap rather than picking one FOR the user -- that's exactly what the swap UI immediately
    // below this banner is for.
    //
    // Suppressed entirely in Best Ball, for the same reason the Global Injury Auditor skips
    // those leagues: there's no lineup to set there, so "consider swapping in a bench player"
    // is advice the format doesn't let anyone act on. The lineup shown for a Best Ball league
    // is this tool's own projection of what will auto-start, not a decision the person makes.
    //
    // A starter whose game has already kicked off is dropped from the warning too, for the
    // reason the Global Injury Auditor excludes them: the roster spot is locked on essentially
    // every platform, so there's no swap left to make. Unlike the auditor, nothing is said
    // about the omission -- that tool summarizes leagues the person isn't looking at, whereas
    // here the player's own row is a few pixels below this banner already carrying both their
    // injury badge and a "Started"/"Final" kickoff badge. Repeating it would be noise.
    function getLineupInjuryWarningHTML(starters, league) {
        if (isBestBallLeague(league)) return "";

        const flagged = starters.filter(s => s.player
            && SIM_EXCLUDE_STATUSES.includes(s.player.inj)
            && !hasKickedOff(s.player));
        if (flagged.length === 0) return "";

        const warnSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

        if (flagged.length === 1) {
            const p = flagged[0].player;
            return `<div class="lineup-injury-warning">
                ${warnSvg}
                <span><strong>${escapeHtml(p.name)}</strong> is <strong>${escapeHtml(p.inj)}</strong> and currently in your starting lineup - consider swapping in a bench player.</span>
            </div>`;
        }

        const namesHTML = flagged.map(s => `${escapeHtml(s.player.name)} (${escapeHtml(s.player.inj)})`).join(', ');
        return `<div class="lineup-injury-warning">
            ${warnSvg}
            <span><strong>${flagged.length} starters</strong> are Doubtful, Out, IR, or otherwise unlikely to play: ${namesHTML} - consider swapping them out.</span>
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
            // League names are set by whoever runs the league on Sleeper, so they're escaped
            // like any other outside text. The id is escaped too; it's Sleeper's, not ours.
            html += `<option value="${escapeHtml(l.leagueId)}" ${sel}>${escapeHtml(l.name)}</option>`;
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
            let isBestBall = isBestBallLeague(l);
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
            // Roster age. Manual and Draft Strategist handoff leagues are never synced from
            // Sleeper, so they get no label. A Sleeper league with no lastSyncedAt was last
            // synced before this was tracked -- flagged the same way the Rankings column treats
            // a missing date (stale), since we can't vouch for it. Past 2 days a waiver run or
            // trade has likely landed, so it goes amber.
            let syncText = "";
            if (!/^(manual|handoff)_/.test(l.leagueId)) {
                const syncFresh = getRankingsFreshness(l.lastSyncedAt, 2, 'Synced');
                const syncStale = !syncFresh || syncFresh.isStale;
                const syncLabel = syncFresh ? syncFresh.label : 'Last sync unknown';
                if (l.lastSyncFailedAt) {
                    // A failed sync outranks the age label: this roster is not just old, we
                    // know it's behind. Age still gets shown alongside it, since how stale the
                    // data is decides whether you can trust a lineup off it before retrying.
                    // Set in processSleeperData's catch, cleared on the next successful sync.
                    const staleFor = syncFresh ? syncFresh.label.replace(/^Synced /, 'from ') : 'never synced';
                    syncText = `<div class="sync-failed" style="font-size: 0.75rem; margin-top: 2px;">Last sync failed · roster ${staleFor}</div>`;
                } else {
                    syncText = `<div class="${syncStale ? 'rankings-stale' : 'rankings-fresh'}" style="font-size: 0.75rem; margin-top: 2px;">${syncLabel}</div>`;
                }
            }
            let activeStyle = l.leagueId === State.activeLeagueId ? 'background: rgba(16, 185, 129, 0.08);' : '';
            let activeIndicator = l.leagueId === State.activeLeagueId ? `<div style="width: 3px; height: 100%; background: var(--primary-green); position: absolute; left: 0; top: 0;"></div>` : '';

            html += `
            <tr style="position: relative; ${activeStyle}">
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); position: relative; cursor: pointer;" onclick="switchActiveLeague('${l.leagueId}')">
                    ${activeIndicator}
                    <div style="padding-left: 6px;">
                        <strong style="color: var(--text-main); font-size: 0.9rem;">${escapeHtml(l.name)}</strong>
                        ${formatText}
                        ${syncText}
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

    window.deleteLeagueManager = async function(leagueId) {
        // Name the league being removed. The dashboard is a stack of identical ✕ buttons, so
        // "Remove this league?" asked you to trust you'd clicked the right row -- and getting
        // it wrong costs that league's rankings assignment and sync history. The name goes in
        // the body rather than the title: dialogMessageHTML escapes it (Sleeper league names
        // are set by whoever created the league, so they're outside text) and a long one wraps
        // better in a paragraph than in the h3.
        const league = State.leagues.find(l => l.leagueId === leagueId);
        const leagueLabel = league && league.name ? `"${league.name}"` : 'this league';
        // Manual and Draft Strategist handoff leagues have no Sleeper league behind them, so
        // don't offer a re-sync that can't happen -- rebuilding one means entering it by hand.
        const recovery = /^(manual|handoff)_/.test(leagueId)
            ? "It wasn't synced from Sleeper, so you'd have to set it up again by hand."
            : 'You can sync it again from Sleeper later.';
        if (!await window.showConfirm(`This removes ${leagueLabel} and its saved settings from the app. ${recovery}`, { title: 'Remove this league?', confirmText: 'Remove League', danger: true })) return;
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

    // Loads a league's own ROS/Weekly rankings into State (its saved named set, else the
    // rankings stored on the league itself, else none). State.rosRankings/weeklyRankings are
    // what the optimizer and every card read, so anything that works league-by-league
    // (switchActiveLeague, Optimize All, Sync All) has to call this per league first, or
    // league B gets optimized with league A's rankings.
    function hydrateRankingsForLeague(league) {
        if (!league) return;
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
    }

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
            hydrateRankingsForLeague(league);
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
        
        // Trade Analyzer and Positional Power Rankings were already cleared by
        // loadActiveLeagueData above (see clearLeagueScopedResults). The trade used to be
        // re-run here against the new league, but a trade is built from one league's rosters,
        // so carrying it over to another league didn't make sense.

        // Same reasoning as the two output panes above, and the sim card is the worst of the
        // three to leave behind: it's headed "Your Team 61.4%" with no league name on it, so
        // switching from League A to League B silently presents League A's win probability
        // under League B's header. There's no equivalent of the re-run branches above -- the
        // sim is an explicit, network-bound action the user has to press Run for.
        clearSimResults();
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
    // --- LEAGUE-SCOPED SCOUT RESULTS ---
    // The Trade Analyzer (the players typed into both sides, plus its verdict and the dynamic
    // waiver-adjustment hint naming the old league's free agents) and the Positional Power
    // Rankings table both describe ONE league. Left on screen after a switch, they read as
    // results for the league now shown in the header. Cleared from loadActiveLeagueData, the
    // one call every active-league change shares (header switcher, arrows, deleting the active
    // league, adding or importing a new one), and only when the id actually changed -- so
    // re-syncing the same league, or Optimize All handing control back to the league you
    // started on, leaves them alone.
    let _scoutResultsLeagueId = State.activeLeagueId;
    function clearLeagueScopedResults() {
        if (State.activeLeagueId === _scoutResultsLeagueId) return;
        _scoutResultsLeagueId = State.activeLeagueId;

        ['buyInput', 'sellInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const tradeOutput = document.getElementById('tradeOutput');
        if (tradeOutput) tradeOutput.innerHTML = '';
        const adjustHint = document.getElementById('tradeWaiverAdjustHint');
        if (adjustHint) { adjustHint.innerText = ''; adjustHint.style.display = 'none'; }

        const powerOut = document.getElementById('powerRankingsOutput');
        if (powerOut) { powerOut.innerHTML = ''; powerOut.style.display = 'none'; }
    }

    function loadActiveLeagueData() {
        clearLeagueScopedResults();
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
        renderManualAddLog(); // show only this league's session adds
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

        setManualAddMsg(`Manual League '${name}' Created`, { clearAfterMs: 3000 });
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

    // --- ADD PLAYER MANUALLY: keyboard fast path + "Added this session" list ---
    // Built for keying in a whole league from the keyboard: type a name, Enter picks the
    // single (or arrowed-to) suggestion, Enter again saves and clears the field for the next
    // player. Every add still saves immediately -- there's deliberately no "Submit roster"
    // step, so closing the tab halfway through a league loses nothing. The list under the form
    // is the safety net instead: it shows who went in, newest first, with a one-click undo.
    //
    // _manualAddLog is in-memory only (resets on reload). It's a record of this sitting's
    // entries, not a second copy of the roster -- entries are resolved against league.roster at
    // render time, so a player removed anywhere else (Roster tab, re-sync) just drops out.
    const _manualAddLog = []; // { leagueId, playerId }, newest first
    let _manualSelected = null; // last autocomplete pick in the name field
    let _manualMsgTimer = null;

    function setManualAddMsg(text, { isError = false, clearAfterMs = 0 } = {}) {
        const msgEl = document.getElementById('manualAddMsg');
        if (!msgEl) return;
        clearTimeout(_manualMsgTimer);
        msgEl.innerText = text || "";
        msgEl.classList.toggle('is-error', !!(text && isError));
        if (text && clearAfterMs) _manualMsgTimer = setTimeout(() => setManualAddMsg(""), clearAfterMs);
    }

    function initManualAddForm() {
        const nameEl = document.getElementById('manualName');
        const teamEl = document.getElementById('manualTeam');
        const posEl = document.getElementById('manualPos');
        if (!nameEl) return;

        const ac = attachPlayerAutocomplete(nameEl, (p) => {
            _manualSelected = p;
            if (posEl) posEl.value = p.pos;
            if (teamEl) teamEl.value = p.team;
        });

        nameEl.addEventListener('input', () => {
            // Any edit after a pick means the field no longer holds that pick.
            if (_manualSelected && nameEl.value.trim() !== _manualSelected.name) _manualSelected = null;
            setManualAddMsg("");
        });

        // Registered after the autocomplete's own keydown listener, so on the Enter that picks
        // a suggestion, e.defaultPrevented is already true and this skips it -- one keypress
        // never both selects and saves. e.repeat guards against a held-down Enter saving twice.
        nameEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.isComposing) return;
            if (_manualSelected && nameEl.value.trim() === _manualSelected.name) {
                e.preventDefault();
                window.addManualPlayer({ fromKeyboard: true });
                return;
            }
            // Name was typed but never picked. Saving it on Enter would make every typo a
            // roster entry, so point at the deliberate routes instead. Stay quiet while the
            // dropdown is open or its results are still loading -- Enter there just means
            // "not narrowed down yet".
            if (nameEl.value.trim() && !(ac && (ac.isOpen() || ac.isPending()))) {
                setManualAddMsg("No match picked. Choose a player from the list, or fill in Position and Team and press Enter in the Team box to add this name as typed.");
            }
        });

        // Enter in Team = submit the form as filled. This is the keyboard route for a name
        // that isn't in Sleeper's player list (or when that list couldn't load).
        if (teamEl) {
            teamEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
                e.preventDefault();
                window.addManualPlayer({ fromKeyboard: true });
            });
        }

        const logEl = document.getElementById('manualAddLog');
        if (logEl) {
            logEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.mls-manual-log-remove');
                if (btn) undoManualAdd(btn.dataset.playerId);
            });
        }
    }

    function removePlayerFromLeague(league, playerId) {
        const pToRemove = (league.roster || []).find(p => p.id === playerId);
        if (!pToRemove) return null;
        if (league.globalRosterMap) delete league.globalRosterMap[pToRemove.cleanName];
        league.roster = league.roster.filter(p => p.id !== playerId);
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        return pToRemove;
    }

    // No confirm dialog here, unlike deletePlayer: this only appears next to a player that was
    // just keyed in, and a confirm on every typo fix would undo the point of the fast path.
    function undoManualAdd(playerId) {
        const league = getActiveLeague();
        if (!league) return;
        const removed = removePlayerFromLeague(league, playerId);
        if (!removed) { renderManualAddLog(); return; }
        window.optimizeLineup(true);
        loadRosterTab(); // also re-renders the log
        setManualAddMsg(`Removed ${removed.name}`, { clearAfterMs: 4000 });
        const nameEl = document.getElementById('manualName');
        if (nameEl) nameEl.focus();
    }

    function renderManualAddLog() {
        const el = document.getElementById('manualAddLog');
        if (!el) return;
        const league = getActiveLeague();
        const rosterById = new Map(((league && league.roster) || []).map(p => [p.id, p]));
        const entries = league
            ? _manualAddLog.filter(e => e.leagueId === league.leagueId && rosterById.has(e.playerId)).map(e => rosterById.get(e.playerId))
            : [];
        if (entries.length === 0) { el.innerHTML = ""; return; }

        const total = league.roster.length;
        el.innerHTML = `
            <div class="mls-manual-log-head">
                <span>Added this session (${entries.length})</span>
                <span class="mls-manual-log-total">${escapeHtml(league.name)}: ${total} player${total === 1 ? '' : 's'}</span>
            </div>
            <ul class="mls-manual-log-list">
                ${entries.map((p, i) => `
                <li class="mls-manual-log-item${i === 0 ? ' is-latest' : ''}">
                    <span class="mls-manual-log-name">${escapeHtml(p.name)}</span>
                    <span class="mls-manual-log-meta">${escapeHtml(p.pos)} · ${escapeHtml(p.team)}</span>
                    ${i === 0 ? '<span class="mls-manual-log-tag">Last added</span>' : ''}
                    <button type="button" class="mls-manual-log-remove" data-player-id="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.name)}" title="Remove from roster">&times;</button>
                </li>`).join('')}
            </ul>`;
    }

    window.addManualPlayer = function(opts = {}) {
        let league = getActiveLeague();
        if (!league) { if (window.showToast) window.showToast("Please add or select a league first.", { isError: true }); return; }
        const nameInput = document.getElementById('manualName');
        const posInput = document.getElementById('manualPos');
        const teamInput = document.getElementById('manualTeam');

        const name = nameInput ? nameInput.value.trim() : "";
        const pos = posInput ? posInput.value : "FLEX";
        const team = teamInput ? teamInput.value.trim().toUpperCase() || "FA" : "FA";

        if (!name) { if (window.showToast) window.showToast("Please enter a player name.", { isError: true }); return; }

        const cleanName = normalizeName(name);
        league.roster = league.roster || [];
        // Fast keyboard entry makes a double add easy (same name keyed twice in a long list),
        // and a duplicate would show up twice in the optimizer. Keep the text so it can be fixed.
        const existing = league.roster.find(p => p.cleanName === cleanName);
        if (existing) {
            setManualAddMsg(`${existing.name} is already on this roster.`, { isError: true });
            if (nameInput) { nameInput.focus(); nameInput.select(); }
            return;
        }

        let newP = { id: 'p_' + Date.now(), name: name, cleanName: cleanName, pos: pos, team: team };
        league.roster.push(newP);

        league.globalRosterMap = league.globalRosterMap || {};
        league.globalRosterMap[newP.cleanName] = "You";

        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        _manualAddLog.unshift({ leagueId: league.leagueId, playerId: newP.id });
        _manualSelected = null;
        if (nameInput) nameInput.value = "";
        if (teamInput) teamInput.value = "";
        setManualAddMsg("");
        window.optimizeLineup(true);
        loadRosterTab(); // also re-renders the "Added this session" list

        // Keyboard adds keep the cursor in the name field for the next player. Button taps
        // don't, since refocusing there would pop the on-screen keyboard back open on phones.
        if (opts.fromKeyboard && nameInput) nameInput.focus();
    };

    window.deletePlayer = async function(playerId) {
        let league = getActiveLeague();
        if (!league) return;
        // Name the player, for the same reason deleteLeagueManager names the league: the roster
        // is a column of identical ✕ buttons, and on a phone the dialog covers the row you just
        // tapped, so "Remove player?" gave you nothing to check the tap against. The name comes
        // from Sleeper; dialogMessageHTML escapes the body, so it goes in raw here.
        const player = (league.roster || []).find(p => p.id === playerId);
        const playerLabel = player && player.name ? `"${player.name}"` : 'this player';
        if (await window.showConfirm(`This takes ${playerLabel} off your active roster in this league. You can add them back from the Roster tab.`, { title: 'Remove player?', confirmText: 'Remove', danger: true })) {
            removePlayerFromLeague(league, playerId);
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
            // Sleeper lists taxi-squad players in their own array but ALSO leaves them in
            // `players`, so without this they'd be indistinguishable from real bench depth --
            // eligible to be slotted as starters by the optimizer and counted as active bench
            // by the Global Injury Auditor, neither of which is true of a taxi player. Empty
            // on leagues with no taxi squad configured, hence the fallback.
            const taxiIds = new Set((myTeam && myTeam.taxi) || []);
            if (myTeam && myTeam.players) {
                myTeam.players.forEach(id => {
                    let p = playerMap[id];
                    if (p) {
                        rosterDetails.push({
                            id: id,
                            name: `${p.first_name} ${p.last_name}`,
                            cleanName: normalizeName(`${p.first_name} ${p.last_name}`),
                            pos: p.position || "FLEX",
                            team: p.team || "FA",
                            inj: getShortInjuryStatus(p),
                            isTaxi: taxiIds.has(id)
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
                // Needed by the Matchup Simulator: rosterId identifies "us" within this
                // league's matchups endpoint response, and pprVal (already computed above for
                // the format badge) says which of Sleeper's pts_ppr/pts_half_ppr/pts_std
                // fields is the right one to read out of historical weekly stats.
                rosterId: myTeam ? myTeam.roster_id : null,
                pprVal: leagueData.scoring_settings?.rec || 0,
                // Preserve this league's existing rankings assignment across a re-sync rather
                // than rebuilding it from whatever happens to be currently active in State --
                // a re-sync should only refresh roster/matchup data, not silently reassign
                // rankings. A genuinely new league starts with nothing assigned.
                rosRankings: existingLeague ? existingLeague.rosRankings : [],
                weeklyRankings: existingLeague ? existingLeague.weeklyRankings : [],
                rosRankingsUpdatedAt: existingLeague ? existingLeague.rosRankingsUpdatedAt : null,
                weeklyRankingsUpdatedAt: existingLeague ? existingLeague.weeklyRankingsUpdatedAt : null,
                rosRankingSetId: existingLeague ? existingLeague.rosRankingSetId : null,
                weeklyRankingSetId: existingLeague ? existingLeague.weeklyRankingSetId : null,
                // Set only here, i.e. only once every Sleeper fetch above has succeeded. A league
                // that fails during Sync All keeps its previous object, and with it its previous
                // lastSyncedAt -- which is exactly what the dashboard row's age label surfaces.
                lastSyncedAt: Date.now()
                // lastSyncFailedAt is deliberately NOT carried over from existingLeague the way
                // the fields above are: rebuilding leagueObj without it is what clears the
                // dashboard's "Last sync failed" flag once a league syncs cleanly again. If this
                // object ever starts spreading existingLeague, clear the field explicitly.
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
            // Stamp the failure on the stored league so the dashboard row can flag it. The only
            // trace of a failed sync used to be a toast -- Sync All's summary names the leagues
            // it couldn't reach, but that's gone in seconds, and the row's age label reads off
            // lastSyncedAt, so a league that synced fine yesterday and failed today still looked
            // healthy until the 2-day staleness threshold caught up. Cleared on the next
            // success, where leagueObj is rebuilt without this field.
            //
            // A brand-new league whose first sync failed was never stored, so there's nothing to
            // find here -- correct, since there's no stale roster to warn about.
            try {
                const failedLeague = State.leagues.find(x => x.leagueId === leagueId);
                if (failedLeague) {
                    failedLeague.lastSyncFailedAt = Date.now();
                    // Bulk callers (importAllSleeperLeagues, syncAllLeagues) pass skipSave=true
                    // and write State.leagues once after their loop, which picks this up along
                    // with that run's successes.
                    if (!skipSave) {
                        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
                        // Single-league syncs don't otherwise re-render the dashboard, so the row
                        // would keep showing the old age label until something else redrew it.
                        // Sync All does its own render in the finally, after the whole loop.
                        if (typeof renderLeagueManager === 'function') renderLeagueManager();
                    }
                }
            } catch (e) {
                // Never let flagging the failure swallow the failure itself -- the toast below
                // is the part the user actually needs.
                console.error(e);
            }
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
            // Name the misses rather than just counting them, the same way syncAllLeagues does:
            // "3 failed - check console for details" left you to guess which of your leagues
            // didn't make it, and the console isn't somewhere a phone user can look. A league
            // that failed here usually isn't stored at all (it's a first-time import), so it
            // won't show up on the dashboard with a "Last sync failed" row either -- this toast
            // is the only signal there is.
            let failedLeagueNames = [];
            for (let i = 0; i < leagues.length; i++) {
                if (btn) btn.innerText = `Syncing ${i + 1}/${leagues.length}...`;
                const ok = await processSleeperData(username, leagues[i].league_id, null, true, preloaded, true, false, true);
                if (ok) successCount++;
                else failedLeagueNames.push(leagues[i].name || leagues[i].league_id);
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

            const failCount = failedLeagueNames.length;
            const summary = failCount > 0
                ? `Imported ${successCount} of ${leagues.length}. Couldn't reach: ${formatNameList(failedLeagueNames)} — try Import All again.`
                : `Imported ${successCount} league${successCount === 1 ? '' : 's'}!`;
            // A partial import gets the longer window (and with it the dismiss button), matching
            // syncAllLeagues: there are league names in there to read and act on, and the
            // default duration isn't enough to do that.
            if (window.showToast) {
                window.showToast(summary, {
                    isError: failCount > 0,
                    duration: failCount > 0 ? 9000 : undefined
                });
            }

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
                        const TEAM_ALIASES = { "JAC": "JAX", "WSH": "WAS" };
                        team = TEAM_ALIASES[team] || team;

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
                },
                // Papa calls this instead of `complete` when it can't read the File. Without it
                // the upload failed with no message. The input is cleared so choosing the same
                // file again fires 'change'.
                error: function(err) {
                    console.error("Error reading file:", file.name, err);
                    sosFileInput.value = '';
                    if (typeof window.showToast === 'function') {
                        window.showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
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
    window.runScout = async function(type) {
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

        // All-leagues search is a different question ("where is this guy?") than the rest of
        // this function answers ("what would he do for THIS lineup?"), so it forks here rather
        // than threading a scope flag through buildCard's lineup/verdict logic below.
        if (type === 'waiver' && State.waiverScanSettings.scope === 'all') {
            return runAllLeaguesSearch(targetNames, outputEl);
        }

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};
        // Manual / handoff leagues only know YOUR players, so "not in rosterMap" can't mean
        // "free agent" there -- see isFullyMappedLeague. Those leagues get the same neutral
        // "Not Yours" wording the All My Leagues search already uses, with a tooltip saying why.
        const knowsWholeLeague = isFullyMappedLeague(league);
        const notYoursTitle = "Manual league: this app only knows your roster, so it can't tell whether he's a free agent or on another team. Check your league's site before putting in a claim.";

        // Scan Pasted List follows the same Compare Against and Rank By settings as Auto-Find
        // (see buildWaiverContext) whenever a synced league and some rankings exist. Anything
        // missing just leaves the cards as they were -- rank and ownership still work without it.
        // Rank By also sets the sort order below, even with no synced league.
        const waiverMode = State.waiverScanSettings.compare === 'roster' ? 'roster' : 'lineup';
        const waiverScan = type === 'waiver' ? resolveWaiverBasis() : null;
        let waiverCtx = null;
        if (type === 'waiver' && league && league.globalRosterMap && league.roster && league.roster.length > 0
            && (State.weeklyRankings.length > 0 || State.rosRankings.length > 0)) {
            try {
                waiverCtx = await buildWaiverContext(league);
            } catch (e) {
                console.warn('Scan Pasted List: lineup check unavailable.', e);
            }
        }

        // --- DYNAMIC WAIVER ADJUSTMENT ---
        // Recomputed fresh on every trade check, rather than saved once and left stale, so it
        // always reflects this league's own current free-agent pool. See
        // getDynamicWaiverAdjustmentValue's own comment for the ROS -> Market -> flat-default
        // tiering. Updates the visible field (and the hint beneath it) so the number driving
        // the verdict is never hidden -- same "explain the methodology" principle as the
        // verdict banners themselves.
        if (type === 'trade' && State.tradeSettings.waiverAdjustment) {
            let dynamic = getDynamicWaiverAdjustmentValue();
            const valueEl = document.getElementById('tradeWaiverAdjustValue');
            const hintEl = document.getElementById('tradeWaiverAdjustHint');
            if (dynamic) {
                State.tradeSettings.waiverAdjustmentValue = dynamic.value;
                localStorage.setItem('mls_trade_settings', JSON.stringify(State.tradeSettings));
                if (valueEl) valueEl.value = dynamic.value;
                if (hintEl) {
                    hintEl.style.display = 'block';
                    let playerList = dynamic.players.map(p => p.name).join(', ');
                    hintEl.innerText = `${dynamic.source} top available: ${playerList} - avg ${dynamic.value.toLocaleString()}.`;
                }
            } else if (hintEl) {
                hintEl.style.display = 'block';
                hintEl.innerText = `No free agent data to auto-calculate this yet (sync a league and load rankings) - using the value above.`;
            }
        }

        // --- POSITION RESOLVER FOR CARD BADGES ---
        // Same lookup chain as buildWaiverContext's getPos (used by Auto-Find)
        // (reused rather than duplicated): a synced league's own globalPosMap first, then the
        // cache, then loaded Market Value data as a last resort. Populated lazily here too --
        // Scan Pasted List is usable without ever having run Auto-Find Upgrades first, and
        // without a synced Sleeper league at all (per the tool's own "Sleeper Sync Required"
        // banner, which already says position/rank still work either way) -- so this can't
        // assume the cache exists yet.
        if (!window.sleeperPosByName) {
            outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Looking up player positions...</div>`;
            try {
                let map = await getSleeperPlayerMap();
                window.sleeperPosByName = {};
                Object.values(map).forEach(p => {
                    if (p.first_name) {
                        window.sleeperPosByName[normalizeName(`${p.first_name} ${p.last_name}`)] = p.position || "UNK";
                    }
                });
            } catch (e) {
                console.warn("Could not fetch Sleeper player map for position badges.");
            }
        }

        // Indexed once for this whole Scout run -- getPos and buildCard below are both called
        // per player, and each was scanning a full rankings array on every call.
        const marketIndex = rankingIndex(State.marketRankings);
        const rosIndex = rankingIndex(State.rosRankings);
        const weeklyIndex = rankingIndex(State.weeklyRankings);

        const getPos = (cleanName) => {
            if (league && league.globalPosMap && league.globalPosMap[cleanName]) return league.globalPosMap[cleanName];
            if (window.sleeperPosByName && window.sleeperPosByName[cleanName]) return window.sleeperPosByName[cleanName];
            let mPlayer = marketIndex.get(cleanName);
            if (mPlayer && mPlayer.pos) return mPlayer.pos;
            return "UNK";
        };

        // For the Trade Analyzer, roleLabel is "GET" (players you'd receive) or "GIVE" (players
        // you'd send away). Returns the card HTML plus this player's value under BOTH lenses --
        // the user's own custom ROS rankings (primary/default) and, if loaded, market consensus
        // (secondary/comparison) -- so the caller can total each side under each lens separately.
        const buildCard = (name, roleLabel = null) => {
            let clean = normalizeName(name);
            let rosObj = rosIndex.get(clean);
            let weekObj = weeklyIndex.get(clean);
            let marketValueObj = type === 'trade' ? getMarketValue(clean) : null;

            // Rookie draft picks (2027 1st, 2026 2nd, etc.) are dynasty trade assets that a
            // Rest-of-Season rankings file has no reason to include -- ROS rankings project
            // real games this season, and a pick isn't a player who plays any of them. Without
            // this, "Your Rankings" would show every pick as a flat 0/Unranked, which distorts
            // whichever side of a trade holds picks under that lens even though Market
            // Consensus (when loaded) already prices them correctly. When ROS has no match, this
            // looks like a pick, and Market Value does have it, borrow the market value as this
            // line item's "Your Value" too -- flagged (fromMarket) so the card can disclose that
            // this particular number isn't actually from the user's own rankings.
            let userValueObj = null;
            if (type === 'trade') {
                if (rosObj) {
                    userValueObj = { rank: rosObj.rank, value: rankToTradeValue(rosObj.rank) };
                } else if (isDraftPickName(name) && marketValueObj) {
                    userValueObj = { rank: marketValueObj.rank, value: marketValueObj.value, fromMarket: true };
                }
            }

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
            let pos = getPos(clean);
            let badgeClass = pos === "UNK" ? "FLEX" : pos;
            let displayPos = pos === "UNK" ? "FA" : pos;
            let statusHTML = "";
            
            if (roleLabel === "GIVE") {
                if (owner === "You") statusHTML = `<div class="scout-status status-owned">On Your Roster<br>(Ready to Send)</div>`;
                else if (owner) statusHTML = `<div class="scout-status status-avail">Already Dropped<br>/ Traded</div>`;
                else statusHTML = `<div class="scout-status status-avail">Not on your<br>roster</div>`;
            } else {
                if (!owner) statusHTML = knowsWholeLeague
                    ? `<div class="scout-status status-avail">Free Agent<br>(Available)</div>`
                    : `<div class="scout-status mls-status-unknown" title="${notYoursTitle}">Not Yours</div>`;
                else if (owner === "You") statusHTML = `<div class="scout-status status-mine">On Your<br>Roster</div>`;
                else statusHTML = `<div class="scout-status status-owned">Rostered by:<br>${escapeHtml(owner)}</div>`;
            }

            // Availability/rank fields for the Waiver path's sort below -- unused by the Trade
            // Analyzer, but harmless to compute unconditionally rather than threading roleLabel
            // through to gate it. Availability order puts actionable adds first (Free Agent),
            // then players already on your own roster (no action needed), then players someone
            // else owns (blocked without a trade) last.
            //
            // ROS and Weekly are kept as two separate sort keys rather than one merged number:
            // substituting Weekly rank in whenever ROS is missing put both scales on the same
            // number line, so an unranked-by-ROS player with a good Weekly rank (e.g. 75) sorted
            // ahead of a player ROS actually ranks at 129 -- exactly backwards. ROS rank is now
            // always the primary key (unranked-by-ROS -> Infinity, so it always sorts behind
            // every ROS-ranked player, never in front of one), with Weekly rank only breaking
            // ties within players who share the same ROS status.
            let availabilityOrder = !owner ? 0 : (owner === "You" ? 1 : 2);

            // Waiver path only: swap the rank line for the same Rank By-led line Auto-Find uses,
            // and give available players the same verdict Auto-Find would under the current
            // Compare Against setting. The lineup pill shows either way (as on Auto-Find cards);
            // under Whole Roster the explanation line becomes the drop-candidate comparison.
            // The most actionable adds sort ahead of other free agents (availabilityOrder -0.5):
            // would-starts under Starting Lineup, upgrades under Whole Roster.
            let ranksRowHTML = null, verdictLineHTML = "";
            if (waiverCtx && pos !== "UNK") {
                ranksRowHTML = waiverRanksRowHTML(waiverCtx, clean, pos);
                if (!owner) {
                    let row = waiverCtx.evaluate({ name: displayName, cleanName: clean, pos });
                    let { pill, line } = waiverVerdictParts(waiverCtx, row);
                    if (waiverMode === 'roster' && waiverCtx.scan) {
                        const rosterVerdict = pastedRosterVerdict(waiverCtx, row.player);
                        line = rosterVerdict.line;
                        if (rosterVerdict.upgrade) availabilityOrder = -0.5;
                    } else if (row.verdict && row.verdict.status === 'starts') {
                        availabilityOrder = -0.5;
                    }
                    if (pill) statusHTML = knowsWholeLeague
                        ? `<div class="scout-status status-avail mls-nowrap">Free Agent</div><div class="mls-scan-pill-stack">${pill}</div>`
                        : `<div class="scout-status mls-status-unknown mls-nowrap" title="${notYoursTitle}">Not Yours</div><div class="mls-scan-pill-stack">${pill}</div>`;
                    if (line) verdictLineHTML = `<div class="mls-scan-verdict">${line}</div>`;
                }
            }
            let rosSortRank = (rRank !== "UR") ? rRank : Infinity;
            let weekSortRank = (wRank !== "UR") ? wRank : Infinity;

            let roleTag = roleLabel ? `<span class="badge" style="background:#112233;">${roleLabel === "GET" ? "Receiving" : "Giving"}</span>` : "";

            // Value badges only show on the Trade Analyzer. "Your Value" shows whenever the
            // player is (or isn't) in the user's own ROS rankings; "Mkt Value" only appears once
            // Market Value data has actually been loaded, so the card looks unchanged for anyone
            // not using that optional comparison.
            let valueHTML = "";
            if (type === 'trade') {
                valueHTML += userValueObj
                    ? `<span>Your Value: <strong class="mls-stat-value">${userValueObj.value.toLocaleString()}</strong>${userValueObj.fromMarket ? ' <span style="color:var(--text-muted); font-size:0.75em;">(mkt - no ROS value for picks)</span>' : ''}</span>`
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
                            <span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing">${displayPos}</span>
                            ${displayName} ${roleTag}
                        </div>
                        ${ranksRowHTML || `<div class="mls-meta-row">
                            <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong>${tierTag(weekObj?.tier)}${posRankTag(weekObj, 'mls-stat-blue')}</span>
                            <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong>${tierTag(rosObj?.tier)}${posRankTag(rosObj, 'mls-stat-green')}</span>
                            ${valueHTML}
                        </div>`}
                        ${verdictLineHTML}
                        ${suggestHTML}
                    </div>
                    <div class="mls-text-right">${statusHTML}</div>
                </div>`,
                userValue: userValueObj ? userValueObj.value : 0,
                userMatched: !!userValueObj,
                marketValue: marketValueObj ? marketValueObj.value : 0,
                marketMatched: !!marketValueObj,
                availabilityOrder,
                rosSortRank,
                weekSortRank
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
                verdictHTML = `<div class="trade-verdict-note" style="margin-bottom:1rem;">Enter players on both sides to get a fairness verdict; right now only one side has players.</div>`;
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
                    "This value isn't something you entered; it's estimated by converting your ROS rank into a point value on a 0-10,000 scale, weighted so top-ranked players are worth disproportionately more (rank #1 &asymp; 10,000, decaying ~1.8% per rank). This provides a way to compare players on your own board.",
                    getResults, giveResults, "userValue", "userMatched", State.rosRankings.length > 0
                );
                verdictHTML += renderTradeVerdict(
                    "Market Consensus",
                    "Same estimation method, applied to the market-consensus rank you loaded (Trade Finder section below). This only stores that source's overall rank, not its own internal value points, so this is an estimate of market value - not the source's official number.",
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

        // Waiver path: sorted by availability (Free Agent first, then On Your Roster, then
        // Rostered by someone else), then by rank ascending within each group -- previously
        // this just listed results in whatever order they were pasted, which buried actionable
        // pickups (actual free agents) among names that aren't addable at all. Within a group
        // the Rank By set is the primary key and the other set only breaks ties (the two are
        // never merged onto one number line -- see the comment above availabilityOrder).
        const weeklyFirst = !!(waiverScan && waiverScan.basis === 'weekly');
        let waiverResults = targetNames.map(n => buildCard(n, null));
        waiverResults.sort((a, b) => {
            if (a.availabilityOrder !== b.availabilityOrder) return a.availabilityOrder - b.availabilityOrder;
            const [aP, bP, aS, bS] = weeklyFirst
                ? [a.weekSortRank, b.weekSortRank, a.rosSortRank, b.rosSortRank]
                : [a.rosSortRank, b.rosSortRank, a.weekSortRank, b.weekSortRank];
            if (aP !== bP) return aP - bP;
            return aS - bS;
        });

        // Same one-line summary Auto-Find opens with, so it's visible which lens and which
        // rankings produced these cards -- without it, a Whole Roster or ROS scan looked
        // identical to the default until you read the numbers.
        if (waiverCtx && waiverScan) {
            const notes = [];
            if (waiverScan.note) notes.push(waiverScan.note);
            if (waiverMode === 'lineup' && !waiverCtx.lineupReady) notes.push(`Couldn't build a starting lineup for this league yet, so there's no Would Start check - open the Lineup tab and tap Optimize Lineup.`);
            notes.push(...waiverDerivedNotes(waiverCtx));
            html += `
            <div class="mls-scan-summary">
                Your list, checked in <strong>${escapeHtml(league.name || 'this league')}</strong> by <strong>${waiverScan.name} rank</strong>, ${waiverCompareText(waiverCtx, waiverMode)}.
                ${notes.length ? `<ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
            </div>`;
        }
        waiverResults.forEach(r => html += r.html);
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
                    <span class="trade-verdict-amount"><span class="trade-verdict-est">est.</span>${getTotal.toLocaleString()}</span>
                    ${waiverSubnoteGet}
                </div>
                <div class="trade-verdict-vs">vs</div>
                <div class="trade-verdict-side">
                    <span class="trade-verdict-label">You Give</span>
                    <span class="trade-verdict-amount"><span class="trade-verdict-est">est.</span>${giveTotal.toLocaleString()}</span>
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

    // --- WAIVER WIRE ASSISTANT: AUTO-FIND ---
    // One scanner, two lenses, picked with the "Compare Against" toggle:
    //   Starting Lineup -- which available players would crack your lineup THIS week, and who
    //                      they'd replace. Adds each free agent to your current starters and
    //                      re-runs the optimizer's own slotting (see checkAgainstLineup in
    //                      waiverScanner.js), so a WR pickup that bumps your FLEX RB says so.
    //   Whole Roster    -- which available players rank ahead of your weakest rostered player
    //                      at the position (the drop candidate). This is the original Auto-Find
    //                      Upgrades behavior, now run against one chosen rankings set.
    // Scan order is the person's choice (Weekly or ROS rank). The lineup check itself always
    // uses the same rankings the optimizer does (Weekly when loaded, else ROS) so the two can
    // never disagree. Every card carries the "Would Start" pill regardless of lens, and the
    // same context also powers the Scan Pasted List path (see runScout's waiver branch).

    // Clean name -> { id, pos, team, inj } off the full Sleeper player map, cached for the
    // session. On a name collision prefers the entry with an NFL team (an active player) over a
    // retired/practice-squad namesake -- getCleanNameToIdIndex's first-match-wins is fine for an
    // id lookup, but here the winner decides whether a free agent is reported as playing at all.
    let _sleeperMetaByNamePromise = null;
    function getSleeperMetaByName() {
        if (_sleeperMetaByNamePromise) return _sleeperMetaByNamePromise;
        const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
        _sleeperMetaByNamePromise = getSleeperPlayerMap().then(map => {
            const index = {};
            Object.entries(map).forEach(([id, p]) => {
                if (!p.first_name || !FANTASY_POS.includes(p.position)) return;
                const clean = normalizeName(`${p.first_name} ${p.last_name}`);
                const entry = { id, pos: p.position, team: p.team || null, inj: getShortInjuryStatus(p) };
                if (!index[clean] || (!index[clean].team && entry.team)) index[clean] = entry;
            });
            return index;
        }).catch(err => {
            _sleeperMetaByNamePromise = null;
            throw err;
        });
        return _sleeperMetaByNamePromise;
    }

    const WAIVER_SCAN_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

    window.updateWaiverScanSetting = function(key, value) {
        State.waiverScanSettings[key] = value;
        localStorage.setItem('mls_waiver_scan_settings', JSON.stringify(State.waiverScanSettings));
        applyWaiverScanSettingsToUI();
    };

    function applyWaiverScanSettingsToUI() {
        const s = State.waiverScanSettings;
        const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
        set('waiverScanBasis', 'value', s.basis);
        set('waiverScanPos', 'value', s.pos);
        set('waiverScanLimit', 'value', String(s.limit));
        set('waiverScanStartersOnly', 'checked', !!s.startersOnly);
        document.querySelectorAll('#waiverCompareToggle [data-compare]').forEach(b => {
            const on = b.dataset.compare === s.compare;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        // "Only Would-Starts" filters the Starting Lineup lens; Whole Roster already filters to
        // upgrades by definition, so the toggle would do nothing there -- hide it instead.
        const wrap = document.getElementById('waiverScanStartersOnlyWrap');
        if (wrap) wrap.style.visibility = s.compare === 'roster' ? 'hidden' : 'visible';
        const hint = document.getElementById('waiverCompareHint');
        if (hint) hint.innerText = s.compare === 'roster'
            ? 'Free agents ranked ahead of your weakest rostered player at each position (your drop candidate).'
            : 'Free agents who would crack your current starting lineup this week, and who they would replace.';

        // --- SCAN PASTED LIST: SEARCH IN (This League | All My Leagues) ---
        // Only the pasted-list half of the card reads this; Auto-Find is always single-league
        // (it's driven by one league's lineup/roster, which has no cross-league equivalent).
        const allLeagues = s.scope === 'all';
        document.querySelectorAll('#waiverScopeToggle [data-scope]').forEach(b => {
            const on = (b.dataset.scope === 'all') === allLeagues;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const scopeHint = document.getElementById('waiverScopeHint');
        if (scopeHint) scopeHint.innerText = allLeagues
            ? "Checks every league you've synced at once: where each player is a free agent, where you already own him, and who has him elsewhere."
            : 'Checks these players against the league you have active, using the Compare Against and Rank By settings above.';
        // The button label doubles as the reminder of which mode is armed -- the results
        // below it look different enough between the two that "Scan Pasted List" alone would
        // leave someone guessing which one they just ran.
        set('waiverScanBtn', 'innerText', allLeagues ? 'Search All My Leagues' : 'Scan Pasted List');
        const waiverInput = document.getElementById('waiverInput');
        if (waiverInput) waiverInput.placeholder = allLeagues
            ? 'Paste the players to look up... (e.g. Isiah Pacheco, Puka Nacua)'
            : 'Paste waiver targets here... (e.g. Isiah Pacheco, Puka Nacua)';
    }

    // The Waiver Wire Assistant's "Rank By" choice, resolved against what's actually loaded:
    // the person's pick, or the other set (with a note saying so) when the picked one hasn't
    // been uploaded. Returns null only when neither set exists. Shared by Auto-Find and Scan
    // Pasted List so the two can't drift apart on which rankings a card is built from -- the
    // pasted list used to ignore Rank By entirely and always show Weekly-led cards.
    function resolveWaiverBasis() {
        const wanted = State.waiverScanSettings.basis === 'ros' ? 'ros' : 'weekly';
        const setFor = (b) => (b === 'ros' ? State.rosRankings : State.weeklyRankings);
        let basis = wanted, rankings = setFor(wanted), note = '';
        if (rankings.length === 0) {
            const other = wanted === 'ros' ? 'weekly' : 'ros';
            if (setFor(other).length === 0) return null;
            note = `No ${wanted === 'ros' ? 'ROS' : 'Weekly'} rankings loaded for this league - using ${other === 'ros' ? 'ROS' : 'Weekly'} rank instead.`;
            basis = other;
            rankings = setFor(other);
        }
        const byName = {};
        rankings.forEach(r => { byName[r.cleanName] = r; });
        return {
            basis, rankings, byName, note,
            label: basis === 'ros' ? 'ROS' : 'Wk',
            name: basis === 'ros' ? 'ROS' : 'Weekly'
        };
    }

    // Whole Roster lens benchmark: your rostered players in one position group, weakest last,
    // by the same comparator that orders free agents (compareForScan), so "ranked ahead of your
    // weakest" means the same thing everywhere. Raw basis ranks drive the comparison; the
    // derived display ranks keep the same order within a group, so the numbers shown agree.
    function rosterBenchmark(league, getPos, basisByName, filter) {
        const mine = (league.roster || [])
            .map(p => ({ ...p, pos: getPos(p.cleanName) }))
            .filter(p => matchesPosFilter(p.pos, filter))
            .map(p => {
                const r = basisByName[p.cleanName] || {};
                return { ...p, rank: r.rank ?? 999, posRank: r.posRank ?? 999, flexRank: r.flexRank ?? 999 };
            })
            .sort((a, b) => compareForScan(a, b, filter));
        return { mine, bench: mine.length ? mine[mine.length - 1] : null };
    }

    // Everything a waiver card needs, built once per scan: positions/teams/injuries from Sleeper,
    // display ranks for both rankings sets, your current starters, and an evaluate(fa) that runs
    // the lineup check. lineupReady is false when no starting lineup could be built -- callers
    // still render ranks, just without a verdict. `scan` is the resolved Rank By basis (see
    // resolveWaiverBasis), which decides which rankings lead each card's rank line.
    async function buildWaiverContext(league) {
        let meta = {};
        try {
            meta = await getSleeperMetaByName();
        } catch (e) {
            console.warn('Waiver scan: Sleeper player map unavailable, falling back to league/market positions.', e);
        }

        // getPos is called once per free agent in the scan, so the market fallback is indexed
        // rather than re-scanned each time.
        const marketIndex = rankingIndex(State.marketRankings);
        const getPos = (clean) => {
            if (league.globalPosMap && league.globalPosMap[clean]) return league.globalPosMap[clean];
            if (meta[clean]) return meta[clean].pos;
            const m = marketIndex.get(clean);
            return (m && m.pos) ? m.pos : 'UNK';
        };

        const checkIsWeekly = State.weeklyRankings.length > 0;
        const checkRankings = checkIsWeekly ? State.weeklyRankings : State.rosRankings;
        const checkByName = {};
        checkRankings.forEach(r => { checkByName[r.cleanName] = r; });
        const rosByName = {};
        State.rosRankings.forEach(r => { rosByName[r.cleanName] = r; });
        const wkDisplay = buildRankDisplayIndex(State.weeklyRankings, getPos);
        const rosDisplay = buildRankDisplayIndex(State.rosRankings, getPos);

        if (!State.manualStartersMap[State.activeLeagueId]) window.optimizeLineup(false);
        const currentStarters = (State.manualStartersMap[State.activeLeagueId] || [])
            .map(st => ({ slotType: st.slot.replace(/[0-9]/g, ''), player: st.player }));
        const lineupReady = currentStarters.length > 0 && checkRankings.length > 0;

        const locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        const deps = {
            // Raw posRank/flexRank, the same fields optimizeLineup reads. The derived display
            // ranks keep the same order within each group, so verdicts and shown numbers agree.
            rankOf: (p) => checkByName[p.cleanName] || null,
            isLocked: (p) => locks.includes(p.id) || (hasKickedOff(p) && !isAutoLockOverridden(State.activeLeagueId, p.id)),
            isUnavailable: (p) => isUnavailableThisWeek(p)
        };

        // Cheap "his game already kicked off" test -- no lineup simulation needed, so the scan
        // can filter these out before applying the Show Top limit rather than after.
        const hasPlayed = (fa) => {
            const m = meta[fa.cleanName];
            return !!(m && m.team && hasKickedOff({ team: m.team }));
        };

        const evaluate = (fa) => {
            const m = meta[fa.cleanName] || {};
            const player = { id: m.id || `fa:${fa.cleanName}`, name: fa.name, cleanName: fa.cleanName, pos: fa.pos, team: m.team || null, inj: m.inj || null };
            let verdict = null;
            if (!player.team && meta[fa.cleanName]) verdict = { status: 'noTeam' };
            else if (hasKickedOff(player)) verdict = { status: 'kickedOff' };
            else if (lineupReady) verdict = checkAgainstLineup(player, currentStarters, deps);
            return { fa, player, verdict };
        };

        const scan = resolveWaiverBasis();

        // *Cross: which number a cross-position head-to-head (FLEX slot, WR vs RB) is shown in.
        // Weekly files carry a FLEX list, so 'flex'; ROS files carry Overall instead, so
        // 'overall' -- "ROS Flex" isn't a number any ROS source actually publishes.
        return {
            league, meta, getPos, evaluate, hasPlayed, lineupReady, checkIsWeekly,
            checkLabel: checkIsWeekly ? 'Wk' : 'ROS',
            checkDisplay: checkIsWeekly ? wkDisplay : rosDisplay,
            checkCross: checkIsWeekly ? 'flex' : 'overall',
            wkDisplay, rosDisplay, rosByName,
            scan,
            scanDisplay: scan && scan.basis === 'ros' ? rosDisplay : wkDisplay,
            scanCross: scan && scan.basis === 'ros' ? 'overall' : 'flex'
        };
    }

    // "Marquise Brown, Gabe Davis and 4 more." -- capped so a badly-matched file doesn't push
    // the actual results off the screen. Names come straight from the rankings file, so they're
    // exactly what the person would search for to fix them.
    function formatUnmatchedNames(names, max = 6) {
        const shown = (names || []).slice(0, max).map(n => escapeHtml(n));
        const rest = (names || []).length - shown.length;
        if (shown.length === 0) return '';
        const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
        return rest > 0 ? `${shown.join(', ')} and ${rest} more.` : `${list}.`;
    }

    // What a file actually leaves the app to infer -- and whether that's worth saying at all,
    // which depends on the rankings type:
    //   ROS exports normally carry an Overall rank and a Positional rank, and no FLEX list. A
    //     derived FLEX rank there is the expected shape, not a problem, so it isn't flagged --
    //     and telling someone to "upload a FLEX file" for ROS would be bad advice.
    //   Weekly exports normally DO carry a FLEX list (that's the sheet FLEX starts come from),
    //     so a missing one there is worth mentioning.
    // A missing positional rank column is worth mentioning either way. Returns null when there's
    // nothing notable, so callers show no notice at all.
    function derivedRanksWording(derivedPos, derivedFlex, isWeekly) {
        const flexNotable = !!isWeekly && derivedFlex;
        if (!derivedPos && !flexNotable) return null;

        const typeName = isWeekly ? 'Weekly' : 'ROS';
        if (derivedPos && flexNotable) return {
            title: 'Position and FLEX ranks will be derived',
            short: 'position ranks (WR1, RB2, ...) or FLEX ranks',
            detail: `This file is one overall list with no positional rank column and no FLEX list, so both are derived from its order - positions by ordering each position group, FLEX by ordering RB/WR/TE. ${typeName} exports usually include both; re-exporting with a "Pos Rank" column and a FLEX list (or uploading per-position files) would use your source's own numbers.`
        };
        if (derivedPos) return {
            title: 'Position ranks will be derived',
            short: 'position ranks (WR1, RB2, ...)',
            detail: `This file has no positional rank column, so position ranks are derived by ordering each position group by overall rank. ${typeName} exports usually include one; re-exporting with a "Pos Rank" column, or uploading per-position files, would use your source's own numbers.`
        };
        return {
            title: 'FLEX ranks will be derived',
            short: 'FLEX ranks',
            detail: 'Position ranks come straight from this file\'s own positional rank column. It has no FLEX list, though, so FLEX ranks are derived by ordering your RB/WR/TE by overall rank. Weekly exports usually include a FLEX list; if yours does, re-export with it (or upload it as the FLEX file in per-position mode) to use your source\'s numbers.'
        };
    }

    // "Weekly rankings" -- or 'Weekly rankings ("Borischen Wk 2")' when this league has a saved
    // named set assigned, since someone juggling several sets needs to know WHICH file a notice
    // is about, not just whether it was the weekly or ROS one.
    function rankingSetLabel(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const league = getActiveLeague();
        const setId = league ? league[cfg.leagueSetIdKey] : null;
        const set = setId ? State.rankingSets[cfg.setsKey].find(x => x.id === setId) : null;
        const base = `${cfg.label} rankings`;
        return set && set.name ? `${base} ("${escapeHtml(set.name)}")` : base;
    }

    // Which names in a just-parsed rankings file don't correspond to any Sleeper player. Every
    // cross-reference in this app (roster, lineup, waivers) matches on normalized name, so an
    // unmatched name means that player silently stays unranked everywhere -- worth surfacing at
    // upload time, while the file is still easy to fix. Draft picks are excluded (dynasty files
    // legitimately list them and they're not Sleeper players). Returns an empty list if the
    // player map can't be fetched, so this never blocks or fails an upload.
    // Also reports whether this file's Pos/Flex ranks will have to be derived (see
    // buildRankDisplayIndex) -- both answers come off the same player-map fetch, and both are
    // things worth knowing while the file is still easy to re-export.
    async function analyzeRankingsFile(parsedData) {
        let meta;
        try {
            meta = await getSleeperMetaByName();
        } catch (e) {
            return { names: [], total: 0, checked: false, derivedPos: false, derivedFlex: false };
        }
        const league = getActiveLeague();
        const posMap = (league && league.globalPosMap) || {};
        const names = [];
        (parsedData || []).forEach(p => {
            if (!p || !p.cleanName || isDraftPickName(p.name)) return;
            if (meta[p.cleanName] || posMap[p.cleanName]) return;
            names.push(p.name);
        });

        const getPos = (clean) => posMap[clean] || (meta[clean] ? meta[clean].pos : 'UNK');
        const display = Object.values(buildRankDisplayIndex(parsedData, getPos));
        return {
            names, total: names.length, checked: true,
            derivedPos: display.some(d => d.posDerived),
            derivedFlex: display.some(d => d.flexDerived)
        };
    }

    function waiverRankHTML(val, tier, prefix = '#') {
        return (val === null || val === undefined)
            ? `<strong class="mls-muted-rank">UR</strong>`
            : `<strong>${prefix}${val}</strong>${tierTag(tier)}`;
    }

    // The rank line every waiver card shows, led by whichever set Rank By resolved to:
    //   Weekly -- Wk Pos / Wk Flex / ROS overall (ROS kept as rest-of-season context).
    //   ROS    -- ROS Pos / ROS Overall, the two numbers ROS sources actually publish (no
    //             FLEX list -- the parser stores Overall in flexRank for those files, which is
    //             why "ROS Flex" isn't shown). Overall is shown for every position, QBs
    //             included, since the overall list covers them. Weekly numbers are left off:
    //             with ROS picked they read as the basis. The Starting Lineup verdict line
    //             below still cites its Wk numbers, since that check is a this-week question
    //             (see buildWaiverContext's checkRankings).
    // Wk Flex only for RB/WR/TE.
    function waiverRanksRowHTML(ctx, cleanName, pos) {
        const wk = ctx.wkDisplay[cleanName] || {};
        const ros = ctx.rosDisplay[cleanName] || {};
        const rosRaw = ctx.rosByName[cleanName];
        const isFlexPos = FLEX_POSITIONS.includes(pos);

        if (ctx.scan && ctx.scan.basis === 'ros') {
            const rosPos = ros.posRank ? `<strong class="mls-stat-green">${escapeHtml(pos)}${ros.posRank}</strong>${tierTag(ros.posTier)}` : `<strong class="mls-muted-rank">UR</strong>`;
            return `<div class="mls-meta-row mls-scan-ranks"><span>ROS Pos: ${rosPos}</span><span>ROS Overall: ${waiverRankHTML(rosRaw ? rosRaw.rank : null, rosRaw ? rosRaw.tier : null)}</span></div>`;
        }

        const rosCell = rosRaw
            ? `<span>ROS: <strong class="mls-stat-green">#${rosRaw.rank}</strong>${tierTag(rosRaw.tier)}${ros.posRank ? ` <span class="mls-rank-sep">&middot;</span> ${escapeHtml(pos)}${ros.posRank}` : ''}</span>`
            : `<span>ROS: <strong class="mls-muted-rank">UR</strong></span>`;
        const flexCell = isFlexPos ? `<span>Wk Flex: ${waiverRankHTML(wk.flexRank, wk.flexTier)}</span>` : '';
        const wkPos = wk.posRank ? `<strong class="mls-stat-blue">${escapeHtml(pos)}${wk.posRank}</strong>${tierTag(wk.posTier)}` : `<strong class="mls-muted-rank">UR</strong>`;
        return `<div class="mls-meta-row mls-scan-ranks"><span>Wk Pos: ${wkPos}</span>${flexCell}${rosCell}</div>`;
    }

    // Whole Roster verdict for ONE player off a pasted list -- the per-card version of what
    // Auto-Find's renderRosterGroup does for a whole group. Group follows Auto-Find's Position
    // setting: FLEX compares RB/WR/TE against your weakest FLEX-eligible player; anything else
    // (a single position, All, or a QB/K/DEF under FLEX) compares within the player's own
    // position, the same way All groups them. Returns { line, upgrade }.
    function pastedRosterVerdict(ctx, player) {
        const filter = (State.waiverScanSettings.pos === 'FLEX' && FLEX_POSITIONS.includes(player.pos)) ? 'FLEX' : player.pos;
        const groupLabel = filter;
        const { bench } = rosterBenchmark(ctx.league, ctx.getPos, ctx.scan.byName, filter);
        if (!bench) return { line: `You have no ${groupLabel} on your roster to compare against.`, upgrade: false };
        const faRanks = ctx.scan.byName[player.cleanName] || {};
        const upgrade = compareForScan({ pos: player.pos, rank: faRanks.rank, posRank: faRanks.posRank, flexRank: faRanks.flexRank }, bench, filter) < 0;
        const line = waiverCompareLine(player, bench, `weakest ${groupLabel}`, upgrade ? 'Upgrade over' : "Doesn't pass",
            ctx.scanDisplay, ctx.scan.label, filter === 'FLEX' ? 'flex' : 'pos', ctx.scanCross);
        return { line, upgrade };
    }

    // Last name only, for labelling the two numbers in a comparison line ("Dobbins #58, Evans
    // #20"). Drops generational suffixes so "Chris Godwin Jr." reads as "Godwin", and falls back
    // to the whole string for single-word names (team defenses come through as "Broncos").
    function shortPlayerName(full) {
        const parts = String(full || '').trim().split(/\s+/).filter(t => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(t));
        return escapeHtml(parts.length > 1 ? parts[parts.length - 1] : (parts[0] || String(full || '')));
    }

    // "Replaces Mike Evans (your FLEX) -- Wk Flex: Dobbins #58, Evans #20". Both numbers carry
    // the name they belong to: an earlier "#58 vs #20" left it to the reader to work out which
    // rank was whose, and the starter's number reads as the free agent's at a glance.
    // basis: 'flex' | 'pos' | 'auto'. Auto picks the number that actually decides that
    // head-to-head: FLEX/SFLEX battles between flex-eligible players are decided by Flex rank;
    // same-position slots (and QB vs QB) by position rank.
    // crossKind: which number stands in for a cross-position head-to-head -- 'flex' (Weekly
    // files, which carry a FLEX list) or 'overall' (ROS files, which carry Overall instead).
    // Only the label and the number shown change; the verdict itself was already decided by
    // the caller, and ordering RB/WR/TE by Overall is the same order the FLEX comparison uses.
    function waiverCompareLine(faPlayer, other, slotType, verb, display, label, basis = 'auto', crossKind = 'flex') {
        const bothFlex = FLEX_POSITIONS.includes(faPlayer.pos) && FLEX_POSITIONS.includes(other.pos);
        const useFlex = basis === 'flex' ? bothFlex
            : basis === 'pos' ? false
            : bothFlex && (slotType === 'FLEX' || slotType === 'SFLEX' || faPlayer.pos !== other.pos);
        const crossField = crossKind === 'overall' ? 'rank' : 'flexRank';
        const crossName = crossKind === 'overall' ? 'Overall' : 'Flex';
        const faD = display[faPlayer.cleanName] || {};
        const oD = display[other.cleanName] || {};
        const fmt = (v, pos) => (v === null || v === undefined) ? 'unranked' : (useFlex ? `#${v}` : `${escapeHtml(pos)}${v}`);
        const faVal = useFlex ? faD[crossField] : faD.posRank;
        const oVal = useFlex ? oD[crossField] : oD.posRank;
        const slotText = slotType ? ` <span class="mls-nowrap">(your ${slotType === 'SFLEX' ? 'SUPERFLEX' : slotType})</span>` : '';
        // The two ranks go on their own line under the verdict (see .mls-verdict-nums), and each
        // label/name+rank pair is kept unbreakable -- at phone width this line otherwise wrapped
        // mid-phrase ("Wk" on one line, "Flex: Dobbins #58" on the next), which read as garbled.
        const nums = `<span class="mls-nowrap">${label} ${useFlex ? crossName : 'Pos'}:</span> `
            + `<span class="mls-nowrap">${shortPlayerName(faPlayer.name)} ${fmt(faVal, faPlayer.pos)}</span>, `
            + `<span class="mls-nowrap">${shortPlayerName(other.name)} ${fmt(oVal, other.pos)}</span>`;
        return `${verb} <strong>${escapeHtml(other.name)}</strong>${slotText}<span class="mls-verdict-nums">${nums}</span>`;
    }

    // Pill + one-line explanation for a lineup verdict. Returns a neutral pill when there's no
    // verdict (no lineup yet) so the caller never has to special-case it.
    function waiverVerdictParts(ctx, { player, verdict }) {
        if (!verdict) return { pill: '', line: '' };
        const pill = (cls, text) => `<span class="scout-status ${cls}">${text}</span>`;
        const onBye = !!getByeBadgeHTML(player.team);
        switch (verdict.status) {
            case 'starts':
                return {
                    pill: pill('mls-verdict-start', 'Would Start'),
                    line: verdict.displaced
                        ? waiverCompareLine(player, verdict.displaced, verdict.displacedSlotType, 'Replaces', ctx.checkDisplay, ctx.checkLabel, 'auto', ctx.checkCross)
                        : 'Fills an empty lineup slot'
                };
            case 'bench':
                return { pill: pill('mls-verdict-bench', 'Bench'), line: waiverCompareLine(player, verdict.bubble, verdict.bubbleSlotType, 'Would need to pass', ctx.checkDisplay, ctx.checkLabel, 'auto', ctx.checkCross) };
            case 'unavailable':
                return { pill: pill('mls-verdict-out', onBye ? 'Bye' : 'Out'), line: onBye ? 'On bye this week - a stash, not a start.' : `Listed ${escapeHtml(player.inj || 'out')} - can't start this week.` };
            case 'kickedOff':
                return { pill: pill('mls-verdict-out', 'Played'), line: 'His game already kicked off - no help this week.' };
            case 'locked':
                return { pill: pill('mls-verdict-bench', 'Locked'), line: `Every ${escapeHtml(player.pos)}-eligible lineup spot is locked (manual lock or game started).` };
            case 'noTeam':
                return { pill: pill('mls-verdict-out', 'No Team'), line: 'Not on an NFL roster per Sleeper.' };
            default:
                return { pill: pill('mls-verdict-bench', 'No Slot'), line: `Your lineup has no ${escapeHtml(player.pos)}-eligible slot.` };
        }
    }

    // One auto-find result card. rosterLine (Whole Roster lens) replaces the lineup explanation
    // line; the lineup pill stays either way so "would he start?" is always answered.
    function renderWaiverScanCard(ctx, row, rosterLine = null) {
        const { fa, player, verdict } = row;
        const { pill, line } = waiverVerdictParts(ctx, row);
        const injBadge = player.inj ? `<span class="badge inj-badge">${escapeHtml(player.inj)}</span>` : '';
        const teamText = player.team ? `<span class="mls-opp">${escapeHtml(player.team)}</span>` : '';
        const shownLine = rosterLine || line;
        return `
        <div class="scout-result-card mls-scan-card ${verdict && verdict.status === 'starts' ? 'mls-scan-card-start' : ''}">
            <div class="mls-scan-main">
                <div class="mls-item-name" style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                    <span class="badge pos-badge ${escapeHtml(player.pos)} mls-pos-badge-sizing">${escapeHtml(player.pos)}</span>
                    <span>${escapeHtml(fa.name)}</span>
                    ${teamText}
                </div>
                <div class="mls-player-badges-row">${injBadge}${getByeBadgeHTML(player.team)}${getGameInfoHTML(player.team)}</div>
                ${waiverRanksRowHTML(ctx, fa.cleanName, player.pos)}
                ${shownLine ? `<div class="mls-scan-verdict">${shownLine}</div>` : ''}
            </div>
            <div class="mls-text-right">${pill}</div>
        </div>`;
    }

    // "compared against your weakest rostered player at each position" -- the second half of
    // the summary sentence above both Auto-Find and Scan Pasted List results.
    function waiverCompareText(ctx, mode) {
        const weekText = State.currentNflWeek ? `Week ${State.currentNflWeek} ` : '';
        return mode === 'roster'
            ? `compared against your weakest rostered player at each position`
            : `checked against your current ${weekText}starting lineup using ${ctx.checkIsWeekly ? 'Weekly' : 'ROS'} ranks`;
    }

    // Summary notes for rankings files whose Pos/Flex ranks had to be derived. Named per set
    // (Weekly / ROS, plus the saved set's name when there is one): with several sets loaded,
    // "a rankings file you loaded" left it unclear which one to fix.
    function waiverDerivedNotes(ctx) {
        const derivedNote = (display, type) => {
            const vals = Object.values(display);
            const wording = derivedRanksWording(vals.some(d => d.posDerived), vals.some(d => d.flexDerived), type === 'weekly');
            if (!wording) return null;
            return `Your ${rankingSetLabel(type)} don't include ${wording.short}, so those were derived from the file's order.`;
        };
        return [derivedNote(ctx.wkDisplay, 'weekly'), derivedNote(ctx.rosDisplay, 'ros')].filter(Boolean);
    }

    window.setWaiverCompare = function(mode) {
        window.updateWaiverScanSetting('compare', mode === 'roster' ? 'roster' : 'lineup');
    };

    // Flipping scope clears any results already on screen: a single-league scan and an
    // all-leagues search answer different questions, and leaving the old cards up under a
    // toggle that now says something else is the kind of mismatch that gets misread.
    window.setWaiverScope = function(scope) {
        window.updateWaiverScanSetting('scope', scope === 'all' ? 'all' : 'league');
        const out = document.getElementById('waiverOutput');
        if (out) out.innerHTML = '';
    };

    // --- ALL-LEAGUES PLAYER SEARCH (Scout tab: Scan Pasted List -> "All My Leagues") ---
    // Answers "where does this player stand across everything I'm in?" -- one card per player,
    // one row per league. Ownership is a pure read over the globalRosterMaps already stored on
    // State.leagues -- no per-league fetch, so ten leagues cost the same as one. The only
    // network call is the shared Sleeper player map (cached in IndexedDB for a day, and
    // optional -- see the try/catch below). What that stored data can't do is notice a
    // transaction made since the last sync, which is why the summary points at Sync All rather
    // than quietly refetching every league behind a paste.
    //
    // Deliberately NOT given the Would Start verdict that the single-league scan carries: that
    // check needs one league's optimized lineup, locks and manual starters (see
    // buildWaiverContext), all of which are per-league state that only exists for whichever
    // league is currently active. Pointing it at ten leagues at once would mean rebuilding all
    // of that ten times over for a question this view isn't asking.

    // A league can only report "Free Agent" if its roster map covers the WHOLE league. A
    // Sleeper sync writes every team's players into globalRosterMap, so a missing name there
    // genuinely means unrostered. Manual and Draft-Strategist-handoff leagues only ever store
    // your own players, so a missing name means "not on your roster" -- a strictly weaker claim
    // that gets its own neutral status instead of being reported as an available add.
    function isFullyMappedLeague(l) {
        return !!(l && l.leagueId && !l.leagueId.startsWith('manual_') && !l.leagueId.startsWith('handoff_')
            && l.username && l.username !== 'Manual' && l.globalRosterMap);
    }

    const LEAGUE_SEARCH_STATUS = {
        free:    { cls: 'status-avail',       label: 'Free Agent' },
        mine:    { cls: 'status-mine',        label: 'On Your Roster' },
        taken:   { cls: 'status-owned',       label: 'Rostered' },
        unknown: { cls: 'mls-status-unknown', label: 'Not Yours' }
    };

    // "Switch" on a league row. No re-render needed here: switchActiveLeague already re-runs
    // runScout('waiver') whenever the textarea still has names in it, which lands right back on
    // this view with the newly-active league's rankings behind the Wk/ROS numbers. All this
    // adds is scrolling the results back into view -- switchActiveLeague jumps the page to the
    // top, which would otherwise leave the person staring at the Dashboard banner. The delay
    // lets that smooth scroll-to-top start before overriding it, matching how the Positional
    // Power Rankings table scrolls itself into view after rendering.
    window.scoutGoToLeague = function(leagueId) {
        if (!leagueId || leagueId === State.activeLeagueId) return;
        window.switchActiveLeague(leagueId);
        setTimeout(() => {
            const out = document.getElementById('waiverOutput');
            if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    };

    async function runAllLeaguesSearch(names, outputEl) {
        const leagues = State.leagues || [];
        if (leagues.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">No leagues yet - sync a Sleeper league on the Dashboard first.</span>`;
            return;
        }

        outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Searching ${leagues.length} league${leagues.length === 1 ? '' : 's'}...</div>`;

        // Needed specifically for the players this view is best at finding: someone unrostered
        // in every league has no globalPosMap entry anywhere to read a position off, and an
        // unlabelled card is the one case a "he's available in 3 leagues" answer can't afford.
        let meta = {};
        try {
            meta = await getSleeperMetaByName();
        } catch (e) {
            console.warn('All-leagues search: Sleeper player map unavailable, falling back to league/market positions.', e);
        }

        const mappedCount = leagues.filter(isFullyMappedLeague).length;

        // All three rankings arrays are indexed once for the whole search -- getPos runs per
        // searched name, and the two lookups in the names loop below do as well.
        const marketIndex = rankingIndex(State.marketRankings);
        const rosIndex = rankingIndex(State.rosRankings);
        const weeklyIndex = rankingIndex(State.weeklyRankings);

        const getPos = (clean) => {
            for (const l of leagues) {
                if (l.globalPosMap && l.globalPosMap[clean]) return l.globalPosMap[clean];
            }
            if (meta[clean]) return meta[clean].pos;
            const m = marketIndex.get(clean);
            return (m && m.pos) ? m.pos : 'UNK';
        };

        // Deduped on the normalized name, so the same player pasted twice -- or under two
        // spellings that normalize together -- produces one card rather than two identical ones.
        const seen = new Set();
        const results = [];

        names.forEach(name => {
            const clean = normalizeName(name);
            if (!clean || seen.has(clean)) return;
            seen.add(clean);

            const rosObj = rosIndex.get(clean);
            const weekObj = weeklyIndex.get(clean);
            const m = meta[clean] || null;

            const rows = leagues.map(l => {
                const owner = (l.globalRosterMap || {})[clean];
                let status;
                if (owner === 'You') status = 'mine';
                else if (owner) status = 'taken';
                else if (isFullyMappedLeague(l)) status = 'free';
                else status = 'unknown';
                return { league: l, owner, status };
            });

            const counts = { free: 0, mine: 0, taken: 0, unknown: 0 };
            rows.forEach(r => counts[r.status]++);

            // Free agents first -- the only rows that are actionable today -- then leagues you
            // already own him in, then blocked, then the ones that can't say. Sorted by name
            // inside each group so a card's row order is stable between searches.
            const ORDER = { free: 0, mine: 1, taken: 2, unknown: 3 };
            rows.sort((a, b) => (ORDER[a.status] - ORDER[b.status])
                || String(a.league.name || '').localeCompare(String(b.league.name || '')));

            results.push({
                clean, name, rosObj, weekObj, meta: m, rows, counts,
                displayName: (rosObj && rosObj.name) || (weekObj && weekObj.name) || name,
                pos: getPos(clean)
            });
        });

        if (results.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please enter at least one player name.</span>`;
            return;
        }

        // Most actionable first: whoever is sitting on the most waiver wires. Ties fall back to
        // ROS then Weekly rank, matching how the single-league scan breaks its own ties.
        results.sort((a, b) => {
            if (a.counts.free !== b.counts.free) return b.counts.free - a.counts.free;
            const ar = a.rosObj ? a.rosObj.rank : Infinity, br = b.rosObj ? b.rosObj.rank : Infinity;
            if (ar !== br) return ar - br;
            return (a.weekObj ? a.weekObj.rank : Infinity) - (b.weekObj ? b.weekObj.rank : Infinity);
        });

        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        const activeLeague = getActiveLeague();
        const unmapped = leagues.length - mappedCount;

        const notes = [];
        if (unmapped > 0) {
            notes.push(`${plural(unmapped, 'league')} here ${unmapped === 1 ? "isn't" : "aren't"} Sleeper-synced, so ${unmapped === 1 ? 'it' : 'they'} can only say whether a player is on your own roster - not whether he's available.`);
        }
        if (activeLeague && (State.rosRankings.length > 0 || State.weeklyRankings.length > 0)) {
            notes.push(`Wk/ROS ranks come from the rankings loaded for <strong>${escapeHtml(activeLeague.name)}</strong> (your active league); only the ownership rows below are per-league.`);
        }
        notes.push(`Ownership is from your last sync of each league. Re-run <strong>Sync All</strong> on the Dashboard if a recent add or drop is missing.`);

        let html = `<div class="mls-scan-summary">Searched <strong>${plural(leagues.length, 'league')}</strong> for <strong>${plural(results.length, 'player')}</strong>.`;
        html += `<ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul></div>`;

        results.forEach(res => {
            const badgeClass = res.pos === 'UNK' ? 'FLEX' : res.pos;
            const displayPos = res.pos === 'UNK' ? 'FA' : res.pos;
            const wRank = res.weekObj ? res.weekObj.rank : 'UR';
            const rRank = res.rosObj ? res.rosObj.rank : 'UR';

            const teamTag = res.meta && res.meta.team
                ? ` <span class="mls-league-search-team">${escapeHtml(res.meta.team)}</span>` : '';
            const injTag = res.meta && res.meta.inj
                ? ` <span class="badge inj-badge">${escapeHtml(res.meta.inj)}</span>` : '';

            // Headline pill. "Free in X of Y" counts only the leagues that can actually answer
            // the availability question (see isFullyMappedLeague), so the denominator never
            // implies a manual league said "taken" when it simply couldn't say.
            let pillCls, pillText;
            if (mappedCount === 0) {
                pillCls = res.counts.mine > 0 ? 'status-mine' : 'mls-status-unknown';
                pillText = res.counts.mine > 0 ? `Yours in ${res.counts.mine}` : 'No synced leagues';
            } else {
                pillCls = res.counts.free > 0 ? 'status-avail' : (res.counts.mine > 0 ? 'status-mine' : 'status-owned');
                pillText = `Free in ${res.counts.free} of ${mappedCount}`;
            }

            const breakdown = [];
            if (res.counts.free) breakdown.push(`<span class="mls-nowrap"><strong class="mls-stat-green">${res.counts.free}</strong> available</span>`);
            if (res.counts.mine) breakdown.push(`<span class="mls-nowrap"><strong class="mls-stat-blue">${res.counts.mine}</strong> on your roster</span>`);
            if (res.counts.taken) breakdown.push(`<span class="mls-nowrap"><strong class="mls-stat-red">${res.counts.taken}</strong> rostered by someone else</span>`);
            if (res.counts.unknown) breakdown.push(`<span class="mls-nowrap">${res.counts.unknown} not synced</span>`);

            // Same "Did you mean" fix-it link as the single-league scan, routed back through the
            // same textarea -- attachScoutSuggestionHandler('waiverOutput') is already wired, and
            // re-running runScout('waiver') lands back here while the toggle is still on All My
            // Leagues.
            let suggestHTML = '';
            if (!res.rosObj && !res.weekObj) {
                const suggestion = findClosestRankedName(res.name);
                if (suggestion) {
                    suggestHTML = `<div class="scout-suggest-hint">Did you mean
                        <a href="#" class="scout-suggest-link" data-input-id="waiverInput" data-original="${escapeHtml(res.name)}" data-suggested="${escapeHtml(suggestion)}" data-scout-type="waiver">${escapeHtml(suggestion)}</a>?</div>`;
                } else if (!res.meta) {
                    suggestHTML = `<div class="scout-suggest-hint">No Sleeper player matched this name - check the spelling.</div>`;
                }
            }

            const rowsHTML = res.rows.map(r => {
                const conf = LEAGUE_SEARCH_STATUS[r.status];
                const label = r.status === 'taken' ? `Rostered by: ${escapeHtml(r.owner)}` : conf.label;
                const isActive = r.league.leagueId === State.activeLeagueId;
                const activeTag = isActive ? ` <span class="mls-league-search-active">Active</span>` : '';
                const goTo = isActive ? '' :
                    `<button class="btn btn-secondary mls-btn-sm" onclick="scoutGoToLeague('${r.league.leagueId}')" title="Make this your active league">Switch</button>`;
                const format = r.league.formatBadge
                    ? `<div class="mls-league-search-format">${escapeHtml(r.league.formatBadge)}</div>` : '';
                return `
                <div class="mls-league-search-row mls-league-search-${r.status}">
                    <div class="mls-league-search-meta">
                        <div class="mls-league-search-league">${escapeHtml(r.league.name || 'Unnamed League')}${activeTag}</div>
                        ${format}
                    </div>
                    <div class="mls-league-search-actions">
                        <span class="scout-status ${conf.cls}">${label}</span>
                        ${goTo}
                    </div>
                </div>`;
            }).join('');

            html += `
            <div class="mls-league-search-card">
                <div class="mls-league-search-head">
                    <div class="mls-scan-main">
                        <div class="mls-league-search-name">
                            <span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing">${displayPos}</span>
                            ${escapeHtml(res.displayName)}${teamTag}${injTag}
                        </div>
                        <div class="mls-meta-row mls-scan-ranks">
                            <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong>${tierTag(res.weekObj?.tier)}${posRankTag(res.weekObj, 'mls-stat-blue')}</span>
                            <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong>${tierTag(res.rosObj?.tier)}${posRankTag(res.rosObj, 'mls-stat-green')}</span>
                        </div>
                        ${breakdown.length ? `<div class="mls-scan-verdict">${breakdown.join(' <span class="mls-rank-sep">&middot;</span> ')}</div>` : ''}
                        ${suggestHTML}
                    </div>
                    <div class="mls-text-right"><div class="scout-status ${pillCls} mls-nowrap">${pillText}</div></div>
                </div>
                <div class="mls-league-search-rows">${rowsHTML}</div>
            </div>`;
        });

        outputEl.innerHTML = html;
    }

    // True when a thrown error means "couldn't reach the server" rather than "our own code or
    // data broke" -- the split the Auto-Find and Global Audit catch blocks use to tell someone
    // whether to check their connection or re-sync. Covers mdsFetch's own timeout (utils.js
    // marks it isTimeout / names it TimeoutError), the browser reporting itself offline, and
    // fetch()'s bare network failure, which is a TypeError whose wording differs per browser
    // (Chrome "Failed to fetch", Firefox "NetworkError when attempting...", Safari "Load
    // failed") -- so it's matched on all three rather than just Chrome's, which is what the
    // adBlockerTip checks elsewhere in this file key on.
    function isConnectionError(err) {
        if (!err) return false;
        if (err.isTimeout || err.name === 'TimeoutError') return true;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        return err.name === 'TypeError' && /failed to fetch|networkerror|load failed|network connection was lost/i.test(err.message || '');
    }

    window.autoFindWaiverUpgrades = async function(btn) {
        const outputEl = document.getElementById('waiverOutput');
        if (!outputEl) return;
        const s = State.waiverScanSettings;
        const mode = s.compare === 'roster' ? 'roster' : 'lineup';

        let league = getActiveLeague();
        if (!league || !league.globalRosterMap || !league.roster || league.roster.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Sync a Sleeper league on the Dashboard first; Auto-Find needs your league's rosters to know who's available.</span>`;
            return;
        }

        // Scan basis: the person's pick, falling back to the other set (and saying so) if the
        // picked one hasn't been uploaded, rather than refusing to run.
        const scan = resolveWaiverBasis();
        if (!scan) {
            outputEl.innerHTML = `<span class="mls-error-text">Upload Weekly (Lineup tab) or ROS (Roster tab) rankings first.</span>`;
            return;
        }
        const basis = scan.basis;
        const scanRankings = scan.rankings;
        const basisNote = scan.note;
        const basisLabel = scan.label;
        const basisName = scan.name;

        const origText = btn ? btn.innerText : '';
        if (btn) { btn.disabled = true; btn.innerText = 'Scanning...'; }
        outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Scanning the waiver wire...</div>`;

        try {
            const ctx = await buildWaiverContext(league);
            const basisDisplay = basis === 'ros' ? ctx.rosDisplay : ctx.wkDisplay;
            // In a manual / handoff league the scan still works -- it just can't exclude other
            // teams' players, because it never saw them (see isFullyMappedLeague). So the wording
            // says "not on your roster" instead of "available", and a note says to double-check.
            const knowsWholeLeague = isFullyMappedLeague(league);
            const availGroup = (name) => knowsWholeLeague ? `available ${name}` : `${name} outside your roster`;
            const basisByName = scan.byName;

            const posFilter = s.pos || 'FLEX';
            const limit = parseInt(s.limit, 10) || 10;
            const startersOnly = mode === 'lineup' && !!s.startersOnly;

            const { freeAgents, unresolvedCount, unresolvedNames } = findFreeAgents(scanRankings, {
                posFilter, getPos: ctx.getPos,
                isRostered: (clean) => !!league.globalRosterMap[clean],
                isExcluded: (r) => isDraftPickName(r.name)
            });

            // 'ALL' is shown grouped by position rather than as one list: ranks from different
            // positions aren't on the same scale (QB12 isn't "better" than WR20).
            let playedExcluded = 0, allPlayed = false;
            const groups = posFilter === 'ALL'
                ? WAIVER_SCAN_POSITIONS.map(pos => ({ key: pos, filter: pos, items: freeAgents.filter(f => f.pos === pos) }))
                : [{ key: posFilter, filter: posFilter, items: freeAgents }];
            const groupName = (g) => g.filter === 'FLEX' ? 'RB/WR/TE' : g.filter;

            // How many players the scan rankings rank at each position (resolved the same way the
            // free agents are). Lets an empty group say WHY it's empty -- "everyone it ranks is
            // already rostered" vs "this file doesn't rank that position at all" -- instead of
            // disappearing. Before this, All mode silently dropped any position with no
            // available players (a shallow QB list in a deep league, or an RB list whose every
            // name was taken), which read as the position being skipped.
            const rankedAtPos = {};
            scanRankings.forEach(r => {
                if (!r || !r.cleanName || isDraftPickName(r.name)) return;
                const pos = ctx.getPos(r.cleanName);
                if (pos && pos !== 'UNK') rankedAtPos[pos] = (rankedAtPos[pos] || 0) + 1;
            });
            const rankedIn = (g) => WAIVER_SCAN_POSITIONS
                .filter(pos => matchesPosFilter(pos, g.filter))
                .reduce((n, pos) => n + (rankedAtPos[pos] || 0), 0);
            // Shown when a group has no available players at all (not merely none that start
            // or upgrade -- those keep their own wording).
            const noneAvailableText = (g) => {
                const n = rankedIn(g);
                return n > 0
                    ? `Every ${groupName(g)} in your ${basisName} rankings (${n} ranked) is already ${knowsWholeLeague ? 'rostered in this league' : 'on your roster'}.`
                    : `Your ${basisName} rankings don't include any ${groupName(g)}.`;
            };

            const renderLineupGroup = (g) => {
                // This lens answers a this-week question, so a player whose game already kicked
                // off is no help -- he's filtered out BEFORE the Show Top limit, so "top 10"
                // stays ten usable names instead of ten minus whoever already played. The
                // fallback matters late Sunday/Monday: once every game has started, filtering
                // would empty the list, so in that case they're shown anyway and the banner says
                // why. Whole Roster keeps them -- that lens is about rest-of-season roster value,
                // where a player who already played is still a perfectly good add.
                let items = g.items;
                const eligible = items.filter(f => !ctx.hasPlayed(f));
                if (eligible.length > 0) {
                    playedExcluded += items.length - eligible.length;
                    items = eligible;
                } else if (items.length > 0) {
                    allPlayed = true;
                }
                // Evaluate a wider window than we show when filtering to would-starts, so "top 10
                // that would start" doesn't come back empty just because the top 10 all sit.
                const pool = startersOnly ? items.slice(0, Math.max(limit * 5, 50)) : items.slice(0, limit);
                let rows = pool.map(ctx.evaluate);
                if (startersOnly) rows = rows.filter(r => r.verdict && r.verdict.status === 'starts').slice(0, limit);
                const starts = rows.filter(r => r.verdict && r.verdict.status === 'starts').length;
                if (g.items.length === 0) {
                    return { body: `<div class="mls-scan-empty">${noneAvailableText(g)}</div>`, count: 0, countText: 'none available' };
                }
                const body = rows.length
                    ? rows.map(r => renderWaiverScanCard(ctx, r)).join('')
                    : `<div class="mls-scan-empty">${startersOnly ? `No ${availGroup(groupName(g))} would crack your starting lineup this week.` : `No ${availGroup(groupName(g))} found in your ${basisName} rankings.`}</div>`;
                return { body, count: starts, countText: starts > 0 ? `${starts} would start` : 'none would start' };
            };

            // Whole Roster lens: the drop-candidate comparison. Your weakest rostered player in
            // the group (by the same comparator used to order the free agents) is the benchmark;
            // every free agent ranked ahead of him is listed.
            const renderRosterGroup = (g) => {
                const { mine, bench } = rosterBenchmark(league, ctx.getPos, basisByName, g.filter);
                if (!bench) {
                    return { body: `<div class="mls-scan-empty">You have no ${groupName(g)} on your roster to compare against.</div>`, count: 0, countText: 'no roster players' };
                }
                const basisKind = g.filter === 'FLEX' ? 'flex' : 'pos';
                const upgrades = g.items.filter(fa => compareForScan(fa, bench, g.filter) < 0).slice(0, limit);
                const rankText = (p) => {
                    const d = basisDisplay[p.cleanName] || {};
                    // Cross-position number: Weekly's FLEX rank, or ROS's Overall (see scanCross).
                    const crossOverall = ctx.scanCross === 'overall';
                    const v = basisKind === 'flex' ? (crossOverall ? d.rank : d.flexRank) : d.posRank;
                    return v ? `${basisLabel} ${basisKind === 'flex' ? `${crossOverall ? 'Overall' : 'Flex'} #${v}` : `${escapeHtml(p.pos)}${v}`}` : `unranked by ${basisName}`;
                };
                const nextUp = mine.slice(Math.max(0, mine.length - 3), mine.length - 1).reverse()
                    .map(p => `${escapeHtml(p.name)} (${rankText(p)})`);
                const header = `
                <div class="mls-scan-benchmark">
                    <div class="mls-scan-benchmark-title">Drop candidate (by ${basisName}):</div>
                    Your weakest ${groupName(g)} is <strong>${escapeHtml(bench.name)}</strong> (${rankText(bench)}).
                    ${upgrades.length ? `Available players ranked ahead of him:`
                        : g.items.length === 0 ? `<div class="mls-scan-benchmark-ok">${noneAvailableText(g)}</div>`
                        : `<div class="mls-scan-benchmark-ok">No ${availGroup(groupName(g))} ranks ahead of him; you're set here by ${basisName}.</div>`}
                    ${nextUp.length ? `<div class="mls-scan-benchmark-next">Next weakest: ${nextUp.join(', ')}</div>` : ''}
                </div>`;
                const cards = upgrades.map(fa => {
                    const row = ctx.evaluate(fa);
                    const line = waiverCompareLine(row.player, bench, null, 'Upgrade over', basisDisplay, basisLabel, basisKind, ctx.scanCross);
                    return renderWaiverScanCard(ctx, row, line);
                }).join('');
                return { body: header + cards, count: upgrades.length, countText: upgrades.length ? `${upgrades.length} upgrade${upgrades.length === 1 ? '' : 's'}` : (g.items.length === 0 ? 'none available' : 'no upgrades') };
            };

            // All mode keeps every position the rankings file actually ranks, even when none of
            // them are available (that group explains itself -- see noneAvailableText). Only
            // positions the file doesn't rank at all are left out, and the summary names them:
            // ROS exports commonly skip K/DEF, and a K section that just says "not in your
            // rankings" under every scan would be noise.
            const shownGroups = posFilter === 'ALL' ? groups.filter(g => rankedIn(g) > 0) : groups;
            const unrankedPositions = posFilter === 'ALL' ? groups.filter(g => rankedIn(g) === 0).map(g => g.key) : [];
            const rendered = shownGroups
                .map(g => ({ g, ...(mode === 'roster' ? renderRosterGroup(g) : renderLineupGroup(g)) }));

            // Summary: what was scanned, what it was compared against, and any caveats.
            const notes = [];
            if (!knowsWholeLeague) notes.push(`This is a manual league, so the app only knows your own roster. Everyone below is off your roster, but some may be on other teams - check your league before putting in a claim.`);
            if (basisNote) notes.push(basisNote);
            if (mode === 'lineup' && playedExcluded > 0) notes.push(`${playedExcluded} player${playedExcluded === 1 ? "'s game has" : "s' games have"} already kicked off this week, so ${playedExcluded === 1 ? 'he was' : 'they were'} left out; everyone below can still help you this week. Switch to Whole Roster to include ${playedExcluded === 1 ? 'him' : 'them'}.`);
            if (mode === 'lineup' && allPlayed) notes.push(`Every available player's game has already kicked off this week, so they're shown anyway - treat these as adds for next week.`);
            if (mode === 'lineup' && !ctx.lineupReady) notes.push(`Couldn't build a starting lineup for this league yet, so there's no Would Start check - open the Lineup tab and tap Optimize Lineup.`);
            else if (!ctx.checkIsWeekly) notes.push(`No Weekly rankings loaded, so the Would Start check uses ROS ranks (same as the optimizer).`);
            notes.push(...waiverDerivedNotes(ctx));
            if (unrankedPositions.length > 0) {
                const list = unrankedPositions.length === 1 ? unrankedPositions[0] : `${unrankedPositions.slice(0, -1).join(', ')} or ${unrankedPositions[unrankedPositions.length - 1]}`;
                notes.push(`Your ${rankingSetLabel(basis)} don't rank any ${list}, so ${unrankedPositions.length === 1 ? "that position isn't" : "those positions aren't"} shown.`);
            }
            if (unresolvedCount > 0) notes.push(`${unresolvedCount} ranked name${unresolvedCount === 1 ? '' : 's'} couldn't be matched to a Sleeper player and ${unresolvedCount === 1 ? 'was' : 'were'} left out: ${formatUnmatchedNames(unresolvedNames)} Usually a spelling difference; renaming them in your rankings file to match Sleeper brings them back.`);

            const compareText = waiverCompareText(ctx, mode);
            let html = `
            <div class="mls-scan-summary">
                ${knowsWholeLeague ? 'Top available' : 'Top players not on your roster'} in <strong>${escapeHtml(league.name || 'this league')}</strong> by <strong>${basisName} rank</strong>, ${compareText}.
                ${notes.length ? `<ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
            </div>`;

            // All mode always gets section headers, even if only one position survives -- the
            // header is what says which position a headerless list would be.
            if (rendered.length > 1 || (posFilter === 'ALL' && rendered.length === 1)) {
                html += rendered.map(({ g, body, count, countText }) => {
                    const sectionId = `waiverScanSection${g.key}`;
                    return `
                    <div class="rankings-card mls-waiver-section expanded" id="${sectionId}">
                        <div class="rankings-card-header mls-waiver-section-header" onclick="toggleRankingsCard('${sectionId}')" role="button" tabindex="0" aria-expanded="true" aria-label="Toggle ${g.key} results" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleRankingsCard('${sectionId}');}">
                            <span class="mls-waiver-section-title">${g.key} &middot; <span style="color: ${count > 0 ? 'var(--primary-green)' : 'var(--text-muted)'};">${countText}</span></span>
                            <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                        <div class="rankings-card-body mls-waiver-section-body">${body}</div>
                    </div>`;
                }).join('');
            } else if (rendered.length === 1) {
                html += rendered[0].body;
            } else {
                html += `<div class="mls-scan-empty">No ${availGroup('players')} found in your ${basisName} rankings.</div>`;
            }

            outputEl.innerHTML = html;
        } catch (err) {
            console.error('Waiver Auto-Find failed:', err);
            // Missing rankings and an unsynced league are already caught with their own
            // messages before this try, and buildWaiverContext swallows a failed Sleeper
            // player-map fetch (it falls back to league/market positions). So what actually
            // lands here is almost always saved league data in a shape the scan doesn't expect
            // -- typically a league last synced by an older version of the app -- and a fresh
            // sync is the one thing the person can do about it. The connection branch is
            // defensive: nothing inside the try hits the network today, but a future fetch
            // added to buildWaiverContext shouldn't be misreported as stale data.
            const leagueName = escapeHtml(league.name || 'this league');
            outputEl.innerHTML = isConnectionError(err)
                ? `<span class="mls-error-text">Couldn't reach Sleeper to finish the waiver scan for ${leagueName}. Check your connection and tap Auto-Find again.</span>`
                : `<span class="mls-error-text">Couldn't finish the waiver scan for ${leagueName} - its saved roster data may be out of date. Tap Sync All Leagues on the Dashboard, then run Auto-Find again.</span>`;
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = origText; }
        }
    };

    // --- RANKINGS ENGINE ---
    // Formats a stored timestamp into a short relative string, and flags it as "stale" past
    // the given threshold (in days) so the UI can call attention to rankings that likely need
    // a refresh. Returns null if there's no timestamp at all (e.g. rankings from before this
    // tracking existed) so the caller can fall back to a neutral message rather than claim
    // false freshness. `verb` swaps the leading word so league rows can read "Synced 4 days
    // ago" off the same logic; market data and rankings keep the default "Updated".
    function getRankingsFreshness(timestamp, staleAfterDays, verb = 'Updated') {
        if (!timestamp) return null;
        const ms = Date.now() - Number(timestamp);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        let label;
        if (days <= 0) label = `${verb} today`;
        else if (days === 1) label = `${verb} yesterday`;
        else label = `${verb} ${days} days ago`;
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

    // Works out where saveRankingsAsSet would put an upload right now, without writing anything.
    // Mirrors the branch below exactly (including '__legacy__' falling through to a new set),
    // so the preview modal can name the destination before the user commits.
    //
    // This matters because an in-place update is destructive and has no undo: with a named set
    // selected, an upload replaces that set's data, and every league pointed at the set follows
    // it (see the league picker below). The preview used to describe only the incoming file, never
    // what it was about to overwrite.
    function resolveRankingsTarget(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const nameInput = document.getElementById(cfg.nameInputId);
        const currentSelection = selectEl ? selectEl.value : '__new__';

        if (currentSelection && currentSelection !== '__new__' && currentSelection !== '__legacy__') {
            const existing = State.rankingSets[cfg.setsKey].find(s => s.id === currentSelection);
            if (existing) {
                return {
                    mode: 'replace',
                    id: existing.id,
                    name: existing.name,
                    playerCount: Array.isArray(existing.data) ? existing.data.length : 0,
                    leagueCount: State.leagues.filter(l => l[cfg.leagueSetIdKey] === existing.id).length
                };
            }
        }

        const defaultName = `${cfg.label} Rankings – ${new Date().toLocaleDateString()}`;
        return { mode: 'new', name: (nameInput && nameInput.value.trim()) || defaultName };
    }

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
        return setId;
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
            // Set names are typed by the user (or defaulted from a file name), so escaped.
            optionsHTML += `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${s.data.length} players)</option>`;
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

        updateRankingSetHeader(type);
        updateSetLeaguesRow(type);
        
        if (typeof updatePulsePrompts === 'function') updatePulsePrompts();
    }

    // Header line naming the set the active league actually uses. Kept in the card header (not
    // the body) so it's still readable with the card collapsed. Reads the league's assignment
    // rather than the dropdown, which can sit on "+ Create New Set" before anything is saved.
    function updateRankingSetHeader(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const el = document.getElementById(cfg.headerSetNameId);
        if (!el) return;
        const league = getActiveLeague();
        const text = league ? describeLeagueRankings(type, league) : null;
        if (!text || text === 'No set') {
            el.textContent = '';
            el.removeAttribute('title');
            return;
        }
        el.innerHTML = `Set: <strong>${escapeHtml(text)}</strong>`;
        el.title = text; // full name on hover when it's truncated
    }

    // "Used in 2 of 5 leagues · Choose leagues..." under the dropdown. Hidden when there's only
    // one league (nothing to choose) or no saved set is selected (nothing to apply yet).
    function updateSetLeaguesRow(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const row = document.getElementById(cfg.leaguesRowId);
        if (!row) return;
        const selectEl = document.getElementById(cfg.selectId);
        const val = selectEl ? selectEl.value : '__new__';
        const isRealSet = val && val !== '__new__' && val !== '__legacy__';
        if (!isRealSet || State.leagues.length < 2) { row.style.display = 'none'; return; }
        const used = State.leagues.filter(l => l[cfg.leagueSetIdKey] === val).length;
        const summary = document.getElementById(cfg.leaguesSummaryId);
        if (summary) summary.textContent = `Used in ${used} of ${State.leagues.length} leagues`;
        row.style.display = '';
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
            updateSetLeaguesRow(type);
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
        // Picking a set is the whole job for most visits to this card, so get it out of the way
        // of the roster/lineup below. The header keeps showing which set is in use.
        setRankingsCardExpanded(cfg.cardId, false);

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'rosterTab' && typeof loadRosterTab === 'function') loadRosterTab();
        if (activeTab && activeTab.id === 'lineupTab' && typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
    };

    // --- CHOOSING WHICH LEAGUES USE A RANKING SET ---
    // Replaces the old all-or-nothing "Apply this set to all leagues" with a checklist, so a set
    // can go to three of five leagues without touching the other two ("Select all" covers the
    // old behavior). Used in three places, all through renderLeaguePicker below:
    //   * the upload preview modal ("Also use this set in"), so leagues are picked as the set
    //     is added -- additive only there, leagues already on the set stay locked on;
    //   * a standalone dialog after Auto-Fetch creates a new set (no preview modal on that path);
    //   * "Choose leagues..." under the set dropdown, any time -- the one place a league can be
    //     unchecked off a set, since that's the view built around editing the whole list.
    // The active league is always checked and locked: choosing a set in its dropdown, or saving
    // an upload, already assigns the set there.

    // What a league uses for this ranking type right now, for the picker's "Currently:" notes
    // and the card header. Same priority as hydrateRankingsForLeague.
    function describeLeagueRankings(type, league) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const setId = league[cfg.leagueSetIdKey];
        const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
        if (set) return set.name;
        const legacy = league[cfg.leagueLegacyDataKey];
        if (Array.isArray(legacy) && legacy.length > 0) return 'Unassigned upload (legacy)';
        return 'No set';
    }

    // setId: the set being assigned, or null for one that doesn't exist yet (a new upload).
    // allowRemove: leagues already on the set can be unchecked (standalone dialog) rather than
    // shown locked on (upload preview).
    function renderLeaguePicker(container, type, { setId = null, allowRemove = false, heading = '' } = {}) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const activeId = State.activeLeagueId;
        const leagues = [...State.leagues].sort((a, b) => (b.leagueId === activeId) - (a.leagueId === activeId));

        let selectableCount = 0;
        const rows = leagues.map(l => {
            const isActive = l.leagueId === activeId;
            const onSet = !!setId && l[cfg.leagueSetIdKey] === setId;
            const locked = isActive || (onSet && !allowRemove);
            if (!locked) selectableCount++;
            const note = isActive ? 'This league'
                : onSet ? 'Already using this set'
                : `Currently: ${describeLeagueRankings(type, l)}`;
            return `
                <label class="mls-league-picker-row${locked ? ' is-locked' : ''}">
                    <input type="checkbox" value="${escapeHtml(l.leagueId)}" data-was-on="${onSet ? '1' : '0'}"${(isActive || onSet) ? ' checked' : ''}${locked ? ' disabled' : ''}>
                    <span class="mls-league-picker-text">
                        <span class="mls-league-picker-name">${escapeHtml(l.name || 'Unnamed league')}</span>
                        <span class="mls-league-picker-note">${escapeHtml(note)}</span>
                    </span>
                </label>`;
        }).join('');

        container.innerHTML = `
            <div class="mls-league-picker-head">
                <span>${escapeHtml(heading)}</span>
                ${selectableCount > 1 ? '<button type="button" class="mls-btn-sm btn-link-inline" data-picker-all>Select all</button>' : ''}
            </div>
            <div class="mls-league-picker-list">${rows}</div>`;

        // Property handlers rather than addEventListener: the same container is re-rendered on
        // every open, and this keeps it to exactly one handler each.
        const boxes = () => [...container.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
        const syncAllLabel = () => {
            const btn = container.querySelector('[data-picker-all]');
            if (btn) btn.textContent = boxes().every(b => b.checked) ? 'Clear all' : 'Select all';
        };
        container.onclick = (e) => {
            if (!e.target.closest('[data-picker-all]')) return;
            const turnOn = !boxes().every(b => b.checked);
            boxes().forEach(b => { b.checked = turnOn; });
            syncAllLabel();
        };
        container.onchange = syncAllLabel;
        syncAllLabel();
    }

    function readLeaguePicker(container) {
        const boxes = [...container.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
        return {
            add: boxes.filter(b => b.checked && b.dataset.wasOn !== '1').map(b => b.value),
            remove: boxes.filter(b => !b.checked && b.dataset.wasOn === '1').map(b => b.value)
        };
    }

    // Removing a league leaves it with no set of this type (its legacy upload, if it still has
    // one, takes over -- same fallback hydrateRankingsForLeague already uses). Never touches the
    // active league: the picker locks that row, and this double-checks rather than trusting it.
    function assignSetToLeagues(type, setId, { add = [], remove = [] } = {}) {
        const cfg = RANKING_TYPE_CONFIG[type];
        if (!setId || (add.length === 0 && remove.length === 0)) return;
        State.leagues.forEach(l => {
            if (l.leagueId === State.activeLeagueId) return;
            if (add.includes(l.leagueId)) l[cfg.leagueSetIdKey] = setId;
            else if (remove.includes(l.leagueId) && l[cfg.leagueSetIdKey] === setId) l[cfg.leagueSetIdKey] = null;
        });
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        updateSetLeaguesRow(type);
    }

    // Standalone picker dialog. Resolves { add, remove } on Save, or null on Cancel / Escape /
    // backdrop click. Same close behavior as showConfirm in utils.js.
    let leaguePickerOpen = false;
    function openLeaguePickerDialog(type, set, { title, intro, allowRemove = false, confirmText = 'Save', cancelText = 'Cancel' } = {}) {
        const overlay = document.getElementById('rankingLeaguesOverlay');
        if (!overlay || leaguePickerOpen) return Promise.resolve(null);
        const titleEl = document.getElementById('rankingLeaguesTitle');
        const introEl = document.getElementById('rankingLeaguesIntro');
        const listEl = document.getElementById('rankingLeaguesList');
        const okBtn = overlay.querySelector('[data-league-picker="ok"]');
        const cancelBtn = overlay.querySelector('[data-league-picker="cancel"]');

        if (titleEl) titleEl.textContent = title || `Leagues using "${set.name}"`;
        if (introEl) introEl.textContent = intro || '';
        if (okBtn) okBtn.textContent = confirmText;
        if (cancelBtn) cancelBtn.textContent = cancelText;
        renderLeaguePicker(listEl, type, { setId: set.id, allowRemove });

        leaguePickerOpen = true;
        overlay.style.display = 'flex';

        return new Promise(resolve => {
            let trap = null;
            function settle(result) {
                if (!leaguePickerOpen) return;
                leaguePickerOpen = false;
                overlay.style.display = 'none';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('mousedown', onBackdrop);
                if (trap) trap.deactivate();
                resolve(result);
            }
            function onOk() { settle(readLeaguePicker(listEl)); }
            function onCancel() { settle(null); }
            function onBackdrop(e) { if (e.target === overlay) settle(null); }
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            overlay.addEventListener('mousedown', onBackdrop);
            if (typeof window.createFocusTrap === 'function') {
                trap = window.createFocusTrap(overlay, { onEscape: () => settle(null) });
                trap.activate();
            }
        });
    }

    function leagueCountText(n) { return `${n} league${n === 1 ? '' : 's'}`; }

    // "Choose leagues..." link under the set dropdown.
    window.openRankingSetLeagues = async function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const val = selectEl ? selectEl.value : null;

        if (!val || val === '__new__') {
            if (window.showToast) window.showToast("Please select a saved ranking set first.", { isError: true });
            return;
        }
        if (val === '__legacy__') {
            if (window.showToast) window.showToast("Legacy data can't be shared with other leagues. Upload it as a new set first.", { isError: true });
            return;
        }
        const set = State.rankingSets[cfg.setsKey].find(s => s.id === val);
        if (!set) return;

        const result = await openLeaguePickerDialog(type, set, {
            allowRemove: true,
            intro: `Check each league that should use this ${cfg.label} set. Unchecking a league leaves it with no ${cfg.label} set until you pick one there.`
        });
        if (!result) return;
        if (result.add.length === 0 && result.remove.length === 0) {
            if (window.showToast) window.showToast('No changes made.');
            return;
        }
        assignSetToLeagues(type, set.id, result);
        const usedCount = State.leagues.filter(l => l[cfg.leagueSetIdKey] === set.id).length;
        if (window.showToast) window.showToast(`"${set.name}" is now used in ${leagueCountText(usedCount)}.`);
    };

    // Deletes the currently-selected named set entirely. Any league referencing it (not just
    // the active one) falls back to unassigned, since the data it pointed to no longer exists.
    window.deleteRankingSet = async function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const setId = selectEl ? selectEl.value : null;
        if (!setId || setId === '__new__' || setId === '__legacy__') return;

        const set = State.rankingSets[cfg.setsKey].find(s => s.id === setId);
        if (!set) return;

        if (!await window.showConfirm("Any league using this set will need a new one selected. This can't be undone.", { title: `Delete "${set.name}"?`, confirmText: 'Delete Set', danger: true })) return;

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
        const { parsedData, hasNewSos, sosUpdates, diagnostics } = await parseRankingsFiles(filesWithContext, { loadSheetJS: window.loadSheetJS, onProgress });

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
            // Unreadable files were already toasted by the parser, where the error was caught,
            // so only the other diagnostics are reported here. Each one names its file and says
            // what was wrong (see window.formatRankingsDiagnostic in js/utils.js).
            const toReport = diagnostics.filter(d => d.reason !== 'unreadable');
            if (toReport.length > 0 && typeof window.showToast === 'function') {
                const MAX_SHOWN = 3;
                let message = toReport.slice(0, MAX_SHOWN).map(window.formatRankingsDiagnostic).join('\n\n');
                if (toReport.length > MAX_SHOWN) {
                    const rest = toReport.length - MAX_SHOWN;
                    message += `\n\n...and ${rest} more file${rest === 1 ? '' : 's'} with the same problem.`;
                }
                // Longer than the 6s error default: these messages carry a list to read and act on.
                window.showToast(message, { isError: true, duration: 12000 });
            }
            return;
        }

        // Some files in a multi-file upload worked and others didn't, or a workbook had a tab
        // skipped as notes. The preview still opens (what did parse is real data), but it lists
        // what was left out, so a set missing a whole position or tab isn't saved without anyone
        // noticing.
        openRankingsPreview({ parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds, target: resolveRankingsTarget(type), skipped: diagnostics });
    };

    // --- RANKINGS UPLOAD PREVIEW ---
    // Holds the most recently parsed-but-not-yet-committed upload so the confirm/cancel
    // handlers (wired to the modal's buttons) have something to act on. Only one upload
    // can be pending at a time, which matches the UI (one modal, one active upload flow).
    let pendingRankingsUpload = null;
    // Focus trap for the modal -- unlike the drawer, this overlay had no Escape handling at
    // all before, so onEscape is wired to cancelRankingsPreview (same behavior as clicking
    // Cancel: discards the pending upload and clears the file input for reselection).
    let previewFocusTrap = null;

    function openRankingsPreview({ parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds, target, skipped = [] }) {
        pendingRankingsUpload = { parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds, target };

        const rankType = isWeekly ? "Weekly" : "ROS";
        const sorted = [...parsedData].sort((a, b) => a.rank - b.rank);
        const preview = sorted.slice(0, 5);

        const titleEl = document.getElementById('rankingsPreviewTitle');
        if (titleEl) titleEl.textContent = `Preview: ${rankType} Rankings`;

        const countEl = document.getElementById('rankingsPreviewCount');
        if (countEl) countEl.textContent = `${parsedData.length} player${parsedData.length === 1 ? '' : 's'} parsed`;

        // Files from this upload that contributed no players, tabs skipped as notes, and rows
        // lost to an unclosed quote.
        const skippedEl = document.getElementById('rankingsPreviewSkipped');
        if (skippedEl) {
            if (skipped.length > 0) {
                // Whole files that failed, single workbook tabs skipped as notes, and rows lost to
                // an unclosed quote (see rankingsParser.js), counted separately so the title says
                // which it was: e.g. "1 tab left out, 3 rows lost".
                const tabs = skipped.filter(d => d.reason === 'tab-without-header').length;
                const quoteDiags = skipped.filter(d => d.reason === 'unclosed-quote');
                const files = skipped.length - tabs - quoteDiags.length;
                const rowsLost = quoteDiags.reduce((sum, d) => sum + (d.rowsLost || 0), 0);
                const leftOut = [];
                if (files) leftOut.push(`${files} file${files === 1 ? '' : 's'}`);
                if (tabs) leftOut.push(`${tabs} tab${tabs === 1 ? '' : 's'}`);
                const titleBits = [];
                if (leftOut.length) titleBits.push(`${leftOut.join(' and ')} left out`);
                if (rowsLost) titleBits.push(`${rowsLost} row${rowsLost === 1 ? '' : 's'} lost`);
                else if (quoteDiags.length) titleBits.push(`${quoteDiags.length} row${quoteDiags.length === 1 ? '' : 's'} may be garbled`);
                const title = titleBits.join(', ');
                skippedEl.querySelector('.mls-preview-unmatched-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
                // Built as text nodes: the messages carry file names and headers from the
                // user's file, and formatRankingsDiagnostic returns plain text.
                const listEl = skippedEl.querySelector('.mls-preview-unmatched-list');
                listEl.textContent = '';
                skipped.forEach(d => {
                    const row = document.createElement('div');
                    row.style.marginBottom = '0.35rem';
                    row.textContent = window.formatRankingsDiagnostic(d);
                    listEl.appendChild(row);
                });
                skippedEl.style.display = 'block';
            } else {
                skippedEl.style.display = 'none';
            }
        }

        const listEl = document.getElementById('rankingsPreviewList');
        if (listEl) {
            listEl.innerHTML = preview.map(p =>
                `<li><span class="rankings-preview-rank">#${p.rank}</span> ${escapeHtml(p.name)}${tierTag(p.tier)}</li>`
            ).join('');
        }

        const noteEl = document.getElementById('rankingsPreviewNote');
        if (noteEl) {
            noteEl.style.display = hasNewSos ? 'block' : 'none';
        }

        // Unmatched-name check runs in the background (it needs Sleeper's player map) and fills
        // in when ready rather than holding the modal closed. The pendingRankingsUpload guard
        // stops a slow lookup from painting into a later upload's modal.
        const unmatchedEl = document.getElementById('rankingsPreviewUnmatched');
        if (unmatchedEl) {
            unmatchedEl.style.display = 'none';
            const derivedEl = document.getElementById('rankingsPreviewDerived');
            if (derivedEl) derivedEl.style.display = 'none';
            analyzeRankingsFile(parsedData).then(({ names, total, derivedPos, derivedFlex }) => {
                if (!pendingRankingsUpload || pendingRankingsUpload.parsedData !== parsedData) return;
                if (total > 0) {
                    const titleEl = unmatchedEl.querySelector('.mls-preview-unmatched-title');
                    const listEl = unmatchedEl.querySelector('.mls-preview-unmatched-list');
                    if (titleEl) titleEl.textContent = `${total} of ${parsedData.length} name${total === 1 ? "" : "s"} didn't match a Sleeper player`;
                    if (listEl) listEl.innerHTML = formatUnmatchedNames(names, 12);
                    unmatchedEl.style.display = 'block';
                }
                // Says up front what the Waiver Wire Assistant would otherwise only mention later:
                // this file carries one overall list, so its positional / FLEX ranks are inferred
                // from that order rather than read from the file.
                const wording = derivedRanksWording(derivedPos, derivedFlex, isWeekly);
                if (derivedEl && wording) {
                    derivedEl.querySelector('.mls-preview-derived-title').textContent = wording.title;
                    derivedEl.querySelector('.mls-preview-derived-body').textContent =
                        `${wording.detail} Either way the ordering is sound; it just means those numbers are this app's reading of your list, and tiers stay on the ranks your file published.`;
                    derivedEl.style.display = 'block';
                }
            }).catch(err => console.warn('Rankings file check skipped:', err));
        }

        // Name the destination, and say plainly when saving means overwriting something that
        // already exists. The replace wording leads with the set name rather than the file's,
        // since the set is the thing at risk.
        const targetEl = document.getElementById('rankingsPreviewTarget');
        const confirmBtn = document.getElementById('rankingsPreviewConfirmBtn');
        if (targetEl) {
            if (target && target.mode === 'replace') {
                const leagueNote = target.leagueCount === 1
                    ? 'Used by 1 league.'
                    : `Used by ${target.leagueCount} leagues.`;
                targetEl.innerHTML = `Replaces the saved set <strong>${escapeHtml(target.name)}</strong>` +
                    `${target.playerCount ? ` (${target.playerCount} player${target.playerCount === 1 ? '' : 's'})` : ''}. ` +
                    `${leagueNote} This can't be undone.`;
                targetEl.className = 'mls-preview-target is-replace';
            } else {
                targetEl.innerHTML = target
                    ? `Saves as a new set: <strong>${escapeHtml(target.name)}</strong>. Nothing existing is changed.`
                    : 'Saves as a new set. Nothing existing is changed.';
                targetEl.className = 'mls-preview-target';
            }
            targetEl.style.display = 'block';
        }
        // Other leagues to point at this set, chosen as it's added. Hidden with a single league.
        const leaguesEl = document.getElementById('rankingsPreviewLeagues');
        if (leaguesEl) {
            if (State.leagues.length > 1) {
                renderLeaguePicker(leaguesEl, isWeekly ? 'weekly' : 'ros', {
                    setId: target && target.mode === 'replace' ? target.id : null,
                    heading: 'Also use this set in'
                });
                leaguesEl.style.display = 'block';
            } else {
                leaguesEl.innerHTML = '';
                leaguesEl.style.display = 'none';
            }
        }

        if (confirmBtn) {
            const isReplace = !!(target && target.mode === 'replace');
            confirmBtn.className = isReplace ? 'btn btn-danger' : 'btn btn-primary';
            confirmBtn.textContent = isReplace ? 'Replace Set' : 'Looks Good, Save It';
        }

        const overlay = document.getElementById('rankingsPreviewOverlay');
        if (overlay) overlay.style.display = 'flex';

        if (typeof window.createFocusTrap === 'function' && overlay) {
            previewFocusTrap = window.createFocusTrap(overlay, { onEscape: () => window.cancelRankingsPreview() });
            previewFocusTrap.activate();
        }
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
        if (previewFocusTrap) { previewFocusTrap.deactivate(); previewFocusTrap = null; }
    };

    window.confirmRankingsPreview = function() {
        if (!pendingRankingsUpload) return;
        const { parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds } = pendingRankingsUpload;
        const type = isWeekly ? 'weekly' : 'ros';

        // Clear the file input(s) on save too, not just on cancel. Browsers only fire 'change'
        // when the selection differs, so re-picking the same filename next week (a re-downloaded
        // "rankings.csv", say) silently did nothing while the old selection was still sitting there.
        (fileInputIds || []).forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        // Read the league checklist before saving: saveRankingsAsSet re-renders the card, but
        // the modal's picker is separate, and this is the moment the choice is final.
        const leaguesEl = document.getElementById('rankingsPreviewLeagues');
        const leagueChoice = (leaguesEl && leaguesEl.style.display !== 'none') ? readLeaguePicker(leaguesEl) : { add: [], remove: [] };

        const savedSetId = saveRankingsAsSet(type, parsedData);
        assignSetToLeagues(type, savedSetId, { add: leagueChoice.add });
        setRankingsCardExpanded(RANKING_TYPE_CONFIG[type].cardId, false);

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

            const alsoText = leagueChoice.add.length ? ` Also applied to ${leagueCountText(leagueChoice.add.length)}.` : '';

            if (isFirstTime) {
                window.showToast(`${rankType} Rankings loaded!${alsoText} \n\nTip: We saved this as a reusable set. Use "Choose leagues..." under the set dropdown to share it with more of your leagues any time.`, { duration: 6000 });
                localStorage.setItem('mls_has_seen_rankings_toast', 'true');
            } else {
                window.showToast(`${rankType} Rankings loaded successfully!${alsoText}`);
            }
        }

        pendingRankingsUpload = null;
        const overlay = document.getElementById('rankingsPreviewOverlay');
        if (overlay) overlay.style.display = 'none';
        if (previewFocusTrap) { previewFocusTrap.deactivate(); previewFocusTrap = null; }
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

    // Drag-and-drop onto either rankings card (window.enableFileDrop, js/utils.js). The drop
    // is handed to the same file input the picker uses, so it goes through the exact same
    // path. Single-file mode: the whole card is the target. Multiple-files mode: a file has
    // to land on a visible position box, because the card alone can't say which position it
    // is; that box's input gets it, and "Combine & Process Files" runs the batch as usual.
    // typeof check: an older cached utils.js right after a deploy won't have the helper yet.
    if (typeof window.enableFileDrop === 'function') {
        ['ros', 'weekly'].forEach(type => {
            window.enableFileDrop(document.getElementById(`${type}RankingsCard`), {
                pickInput: e => {
                    if (document.getElementById(`${type}UploadMode`)?.value !== 'multi') {
                        return document.getElementById(`${type}FileInput`);
                    }
                    const wrap = e.target instanceof Element ? e.target.closest(`[id^="${type}-input-wrap-"]`) : null;
                    return (wrap && wrap.style.display !== 'none') ? wrap.querySelector('input[type="file"]') : null;
                },
                refuseMessage: () => "You're in Multiple Files mode: drop each file onto its position's box. Tick a position above to show its box."
            });
        });
    }
// --- MARKET DISCONNECT ENGINE ---
    const marketFileEl = document.getElementById('marketFileInput');
    if (marketFileEl) {
        marketFileEl.addEventListener('change', () => processMarketUpload('marketFileInput', 'marketSuccessMsg'));
    }

    // Shared by both the Filter Mode and Rank Basis dropdowns below, since the right threshold
    // label/default depends on BOTH of them together (e.g. "Minimum Rank Gap" needs a much
    // smaller default under Positional Rank than under Overall Rank, but "Min Percentage
    // Shift" doesn't change with rank basis at all -- a percentage shift means the same thing
    // regardless of how big the underlying pool is). Previously this label swap silently
    // no-op'd on every call: it looked up a #thresholdLabel element that didn't exist in the
    // markup, and the early-return guard for a missing label meant the threshold VALUE reset
    // never ran either. Fixed by adding that id to the label in the markup.
    function updateDisconnectThresholdUI() {
        const mode = document.getElementById('disconnectMode')?.value;
        const isPositional = document.getElementById('disconnectRankBasis')?.value === 'positional';
        const label = document.getElementById('thresholdLabel');
        const input = document.getElementById('disconnectThreshold');
        const hint = document.getElementById('disconnectGapHint');
        if (!label || !input) return;

        if (hint) hint.style.display = isPositional ? 'block' : 'none';

        if (mode === 'percent') {
            label.innerText = "Min Percentage Shift (%)";
            input.value = "20";
        } else {
            label.innerText = isPositional ? "Minimum Rank Gap (within position)" : "Minimum Rank Gap";
            input.value = isPositional ? "3" : "10";
        }
    }

    window.toggleDisconnectMode = function() {
        updateDisconnectThresholdUI();
    };

    window.toggleDisconnectRankBasis = function() {
        updateDisconnectThresholdUI();
    };

    function processMarketUpload(fileInputId, successMsgId) {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || !fileInput.files[0]) return;
        const file = fileInput.files[0];

        const filename = file.name.toLowerCase();
        if (filename.endsWith('.csv')) {
            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: results => parseMarketData(results.data, successMsgId),
                // Papa calls this instead of `complete` when it can't read the File (moved or
                // deleted after being picked). Without it the upload failed with no message.
                // The input is cleared so choosing the same file again fires 'change'.
                error: err => {
                    console.error("Error reading file:", file.name, err);
                    fileInput.value = '';
                    if (window.showToast) window.showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                }
            });
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            window.loadSheetJS(() => {            
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, {type: 'array'});
                        const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
                        Papa.parse(csvStr, { header: true, skipEmptyLines: true, complete: results => parseMarketData(results.data, successMsgId) });
                    } catch (err) {
                        console.error("Error reading Excel file:", err);
                        if (window.showToast) window.showToast(`Couldn't read "${file.name}"; it may be corrupted or in an unsupported format. Try re-saving it as .xlsx or .csv and uploading again.`, { isError: true });
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

            // Same destructive write an .xlsx/.csv upload makes, just reached without a file
            // picker: with a named set selected in the dropdown, this replaces that set's data
            // in place and every league pointed at it follows. Uploads get the preview modal's
            // destination line for this; there's no file to preview here, so the confirm below
            // carries the same information. A new set overwrites nothing, so it saves silently.
            const target = resolveRankingsTarget('ros');
            if (target.mode === 'replace') {
                const leagueNote = target.leagueCount === 1
                    ? 'It is used by 1 league.'
                    : `It is used by ${target.leagueCount} leagues.`;
                const confirmed = await window.showConfirm(
                    `The ${rosRankings.length} players just fetched (${formatText}) will replace the saved set "${target.name}".\n\n${leagueNote} This can't be undone.`,
                    { title: 'Replace saved set?', confirmText: 'Replace Set', danger: true }
                );
                if (!confirmed) {
                    if (window.showToast) window.showToast(`Nothing was changed — "${target.name}" is untouched.`);
                    return;
                }
            }

            const savedSetId = saveRankingsAsSet('ros', rosRankings);
            setRankingsCardExpanded('rosRankingsCard', false);

            if (window.showToast) window.showToast(`ROS Rankings pulled: ${rosRankings.length} players (${formatText})`);

            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id === 'rosterTab') loadRosterTab();

            // Uploads choose leagues in their preview modal; this path has none, so a brand-new
            // set offers the same choice right after saving. A replaced set already carries its
            // leagues with it, so there's nothing to ask.
            const newSet = target.mode === 'new' && State.rankingSets.ros.find(s => s.id === savedSetId);
            if (newSet && State.leagues.length > 1) {
                // The fetch itself is done -- restore the button now rather than leaving it on
                // "Fetching..." behind the dialog (finally below repeats this harmlessly).
                btn.innerText = origText;
                btn.style.opacity = "1";
                btn.disabled = false;
                const choice = await openLeaguePickerDialog('ros', newSet, {
                    title: 'Use this set in other leagues?',
                    intro: `"${newSet.name}" is saved for this league. Check any others that should use it too.`,
                    confirmText: 'Apply',
                    cancelText: 'Just This League'
                });
                if (choice && choice.add.length) {
                    assignSetToLeagues('ros', newSet.id, { add: choice.add });
                    if (window.showToast) window.showToast(`"${newSet.name}" also applied to ${leagueCountText(choice.add.length)}.`);
                }
            }

        } catch (error) {
            console.error("Error auto-fetching ROS rankings:", error);
            let adBlockerTip = error.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block requests containing the word 'logs' - try pausing yours.)" : "";
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
        State.marketUpdatedAt = Date.now();
        localStorage.setItem('mds_season_market_updated', State.marketUpdatedAt);

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

// --- LINEUP OPTIMIZER SETTINGS (FLEX Kickoff Optimization) ---
// Re-runs the optimizer (non-manual, so it won't push an undo snapshot or show a toast) so
// toggling this reflects immediately in whatever lineup is currently on screen, rather than
// waiting for the next sync or manual "Optimize" click.
window.updateLineupSetting = function(key, value) {
    State.lineupSettings[key] = value;
    localStorage.setItem('mls_lineup_settings', JSON.stringify(State.lineupSettings));
    applyLineupSettingsToUI();
    if (typeof window.optimizeLineup === 'function' && State.manualStartersMap[State.activeLeagueId]) {
        window.optimizeLineup(false);
    }
};

// Just a persisted toggle -- unlike lineup/trade settings, nothing here needs to trigger a
// re-render on its own; it's only read the next time runMatchupSim actually runs.
window.updateSimSetting = function(key, value) {
    State.simSettings[key] = value;
    localStorage.setItem('mls_sim_settings', JSON.stringify(State.simSettings));
};

function applySimSettingsToUI() {
    const toggleEl = document.getElementById('waiverInsightsToggle');
    if (toggleEl) toggleEl.checked = !!State.simSettings.waiverInsights;
}

// Standalone "look up any player" search -- separate from the team-vs-team matchup
// simulation above it, by design (Benton's own call: simpler to reason about, and this is
// meant for evaluating someone you DON'T own yet -- "a podcaster mentioned this guy as a
// sleeper" -- not for slotting them into your current lineup). Reuses the app's one existing
// player autocomplete (attachPlayerAutocomplete) so this didn't need its own search UI, and
// the same getPlayerVarianceProfile everything else in the simulator is built on, just fed a
// single player's own history instead of a whole roster's.
//
// Scope note: unlike runMatchupSim, this does NOT check for an already-played actual score --
// that would need a live per-week stat lookup independent of any specific roster's matchup
// entry (Sleeper's matchup data is scoped per fantasy roster, and this player isn't
// necessarily on one), which isn't wired up anywhere in this app yet. For "should I add this
// person" -- the actual use case here -- a projection/history-based range is the right level
// of fidelity anyway; a live in-game update matters far less than it does for "will I win
// this specific matchup right now."
window.lookupSimPlayer = async function(p) {
    const resultEl = document.getElementById('simPlayerLookupResult');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<p class="text-helper">Looking up ${escapeHtml(p.name)}...</p>`;

    try {
        const nflState = await getNflState();
        if (!nflState) {
            resultEl.innerHTML = `<p class="text-helper">Couldn't reach Sleeper right now - try again in a moment.</p>`;
            return;
        }
        const currentWeek = nflState.week;
        const season = nflState.league_season || nflState.season;

        const nameToId = await getCleanNameToIdIndex();
        const id = nameToId[normalizeName(p.name)];
        if (!id) {
            resultEl.innerHTML = `<p class="text-helper">Couldn't find a Sleeper record for ${escapeHtml(p.name)}.</p>`;
            return;
        }

        const playerMap = await getSleeperPlayerMap();
        const rawPlayer = playerMap[id] || {};

        // This lookup isn't tied to any one league (that's the point -- checking out someone
        // you don't own yet), so there's no single "the" league scoring format to read.
        // Full PPR is the most common default across mainstream platforms and matches this
        // app's own fallback elsewhere.
        const scoringKey = 'pts_ppr';

        const { blended } = await getPlayerWeeklyScoreHistory([id], season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES });
        const weeklyScores = blended[id] || [];

        if (weeklyScores.length === 0) {
            resultEl.innerHTML = `<p class="text-helper">${escapeHtml(p.name)} doesn't have enough game history yet to estimate a range (rookie, recent signing, or long-term injury).</p>`;
            return;
        }

        const projections = await getWeeklyProjections(season, currentWeek);
        const proj = projections && projections[id];
        const projectedMean = (proj && typeof proj[scoringKey] === 'number') ? proj[scoringKey] : null;

        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean });
        const shortInj = getShortInjuryStatus(rawPlayer);
        const isExcluded = shortInj !== null && SIM_EXCLUDE_STATUSES.includes(shortInj);

        const injuryHTML = shortInj
            ? `<div class="sim-lookup-injury-flag${isExcluded ? ' is-excluded' : ''}">Status: ${escapeHtml(shortInj)}${isExcluded ? ' - unlikely to play this week' : ''}</div>`
            : '';

        resultEl.innerHTML = `
            <div class="sim-lookup-card">
                <div class="sim-lookup-header">
                    ${rawPlayer.position ? `<span class="pos-badge ${escapeHtml(rawPlayer.position)}">${escapeHtml(rawPlayer.position)}</span>` : ''}
                    <strong>${escapeHtml(p.name)}</strong>
                    <span class="text-helper">${escapeHtml(rawPlayer.team || 'FA')}</span>
                </div>
                ${injuryHTML}
                <div class="sim-lookup-range">${profile.usedFallback ? '~' : ''}${profile.floor}&ndash;${profile.ceiling} pts <span class="text-helper">(${profile.mean} ${projectedMean !== null ? 'proj' : 'avg'})</span></div>
                <p class="text-helper mt-1">Standalone estimate - not run against any specific matchup or lineup.</p>
            </div>`;
    } catch (err) {
        console.error(err);
        resultEl.innerHTML = `<p class="text-helper">Something went wrong looking that player up.</p>`;
    }
};

function applyLineupSettingsToUI() {
    const toggleEl = document.getElementById('flexKickoffOptimizationToggle');
    if (toggleEl) toggleEl.checked = !!State.lineupSettings.flexKickoffOptimization;
}

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
        // Upload time, not the file's own date -- a CSV exported last week and uploaded today
        // reads as "today". Same trade-off ROS/Weekly uploads already make.
        State.marketUpdatedAt = Date.now();
        localStorage.setItem('mds_season_market_updated', State.marketUpdatedAt);
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

    // Detects a rookie draft pick asset ("2027 1st (Early)", "2026 2nd", "2025 3rd Round",
    // etc.) by shape -- a draft year plus a round ordinal -- rather than by trusting any one
    // market source's internal "position" field, which isn't consistently documented across
    // FantasyCalc/LeagueLogs and isn't worth taking on faith. No real NFL player's name will
    // ever contain both a 4-digit year and a round ordinal, so this is a safe, source-agnostic
    // classifier. Used to keep picks out of contexts where they're not actually a fit: they're
    // never "rostered" in globalRosterMap (nobody's Sleeper roster contains a pick), so without
    // this they'd look identical to a genuinely available free-agent player -- and picks aren't
    // available via waivers at all, so that's a real mismatch, not just an edge case.
    function isDraftPickName(name) {
        if (!name) return false;
        return /\b(19|20)\d{2}\b/.test(name) && /\b(1st|2nd|3rd|4th)\b/i.test(name);
    }

    // Looks up a player's MARKET value by clean name (the optional/secondary lens -- see
    // rankToTradeValue above). Returns null if no Market Value data is loaded at all, or if this
    // specific player isn't in it (unranked/deep bench/rookie not yet valued).
    function getMarketValue(cleanName) {
        if (!cleanName) return null;
        // Unlike the other converted sites, this one can't hoist its index to a caller -- it's
        // a single-player helper called from several different loops. rankingIndex's WeakMap
        // covers that case: the index is built on the first call for a given rankings array and
        // every later call reuses it, so a loop over N players costs one build instead of N
        // scans, without the callers needing to know this function has an index at all.
        let m = rankingIndex(State.marketRankings).get(cleanName);
        if (!m) return null;
        return { rank: m.marketVal, value: rankToTradeValue(m.marketVal) };
    }

    // --- DYNAMIC WAIVER ADJUSTMENT VALUE ---
    // The Trade Analyzer's waiver-adjustment credit (see renderTradeVerdict above) used to be
    // a single flat number, manually typed in and easy to forget about. League depth varies
    // enormously -- a shallow 10-team league's best streamable free agent is worth far more
    // than a deep 14-team dynasty league's -- so one flat number can't fit every league synced
    // in this tool. A separate maintained rating (updated through the season) would fix that
    // more precisely, but would also mean a second stat this app has to keep current -- not
    // something to take on right now. Instead, this reuses data the app already keeps current
    // for other reasons: the active league's own free-agent pool, priced on the exact same
    // rankToTradeValue curve the trade totals themselves already use, so the adjustment stays
    // apples-to-apples with the rest of the verdict rather than being a differently-scaled
    // number bolted on.
    //
    // Tiered the same way the trade verdict's two lenses already are: custom ROS rankings
    // first (the primary lens everywhere else in this tool), market consensus if that comes up
    // completely empty (e.g. every ROS-ranked player at this position happens to be rostered
    // somewhere in the league), and null if neither lens has ANY free agent to price -- the
    // caller falls back to the existing flat/manual value in that case, exactly as before this
    // existed.

    // An earlier version of this applied a flat discount to the raw top-3 average, because
    // that average was coming out far too high -- turned out the real cause was draft picks
    // (see isDraftPickName above) getting counted as "available free agents," since a pick is
    // never present in globalRosterMap and looked identical to a genuinely unrostered player.
    // With picks properly excluded from the pool below, the raw average of the actual top
    // free agents is the intended number on its own -- no separate discount needed on top of it.
    function getDynamicWaiverAdjustmentValue() {
        let league = getActiveLeague();
        if (!league || !league.globalRosterMap) return null;
        let rosterMap = league.globalRosterMap;

        // Sentinel rank of 999 means "not actually ranked" (rankingsParser's own placeholder
        // for an unpopulated field) rather than a real deep-bench rank, so those are excluded
        // rather than priced as if genuinely 999th -- same reasoning as rankFieldOf elsewhere
        // in this file. Draft picks are excluded too: they're never present in globalRosterMap
        // (nobody's Sleeper roster contains a pick), so without this check every pick in a
        // dynasty market file would look exactly like an available free-agent player -- and
        // unlike a real free agent, you can't actually go pick one up off waivers. Returns the
        // actual free-agent records used (name + rank + value), not just the final number, so
        // the caller can show its work rather than a bare figure.
        const topFreeAgents = (rankings, rankField) => rankings
            .filter(r => !rosterMap[r.cleanName] && r[rankField] && r[rankField] < 999 && !isDraftPickName(r.name))
            .sort((a, b) => a[rankField] - b[rankField])
            .slice(0, 3)
            .map(r => ({ name: r.name, rank: r[rankField], value: rankToTradeValue(r[rankField]) }));

        const buildResult = (freeAgents, source) => {
            if (freeAgents.length === 0) return null;
            let value = Math.round(freeAgents.reduce((total, fa) => total + fa.value, 0) / freeAgents.length);
            return { value, source, players: freeAgents };
        };

        if (State.rosRankings.length > 0) {
            let result = buildResult(topFreeAgents(State.rosRankings, 'rank'), 'ROS Rankings');
            if (result) return result;
        }
        if (State.marketRankings.length > 0) {
            let result = buildResult(topFreeAgents(State.marketRankings, 'marketVal'), 'Market Consensus');
            if (result) return result;
        }
        return null;
    }

    // Same free-agent identification as getDynamicWaiverAdjustmentValue above (custom
    // rankings first, market consensus fallback, draft picks and rostered players excluded)
    // but grouped BY POSITION instead of taken as one flat top-N -- Waiver Insights (see
    // runMatchupSim) needs a real candidate at whichever position a starter might actually be
    // replaced at, not just whichever position happens to dominate the very top of the
    // rankings overall. perPositionLimit candidates per position, ROS-ranked positions never
    // touch market data at all; a position ROS has literally nothing left to offer at falls
    // back to market consensus for that position only (mirroring the same per-tier fallback,
    // just applied position-by-position instead of to the whole list at once).
    function getTopWaiverCandidatesByPosition(rosterMap, perPositionLimit) {
        // Rankings files carry a name and a rank, not a position -- window.sleeperPosByName
        // (populated during Sleeper sync) is the same position lookup the Waiver Wire
        // Assistant already relies on for this exact reason; market data ships its own pos
        // field as a fallback for a player Sleeper's sync hasn't covered.
        const marketIndex = rankingIndex(State.marketRankings);
        const getPos = (cleanName) => {
            if (window.sleeperPosByName && window.sleeperPosByName[cleanName]) return window.sleeperPosByName[cleanName];
            const mPlayer = marketIndex.get(cleanName);
            return (mPlayer && mPlayer.pos) ? mPlayer.pos : null;
        };

        const groupByPosition = (rankings, rankField) => {
            const byPosition = {};
            rankings
                .filter(r => !rosterMap[r.cleanName] && r[rankField] && r[rankField] < 999 && !isDraftPickName(r.name))
                .forEach(r => {
                    const pos = getPos(r.cleanName);
                    if (!pos) return; // can't even assign a position -- skip rather than guess
                    if (!byPosition[pos]) byPosition[pos] = [];
                    byPosition[pos].push({ name: r.name, cleanName: r.cleanName, pos, rank: r[rankField] });
                });
            Object.values(byPosition).forEach(list => list.sort((a, b) => a.rank - b.rank));
            return byPosition;
        };

        const rosByPos = State.rosRankings.length > 0 ? groupByPosition(State.rosRankings, 'rank') : {};
        const marketByPos = State.marketRankings.length > 0 ? groupByPosition(State.marketRankings, 'marketVal') : {};

        const results = [];
        new Set([...Object.keys(rosByPos), ...Object.keys(marketByPos)]).forEach(pos => {
            const list = (rosByPos[pos] && rosByPos[pos].length > 0) ? rosByPos[pos] : (marketByPos[pos] || []);
            results.push(...list.slice(0, perPositionLimit));
        });
        return results;
    }

    // Ranks each market player within their own position group (QB1, QB2, RB1, RB2, ...)
    // instead of across the whole player pool. Market data only ships an overall marketVal --
    // there's no positional rank field to read directly -- so this derives one the same way
    // the auto-fetch-ROS-from-market flow above already does (see its own posCounters loop):
    // sort by marketVal ascending, then count up within each position group as they're
    // encountered. Used by the Trade Finder's "Positional Rank" basis (see
    // runMarketDisconnectAnalysis) to compare a player against others at their own position
    // rather than the full pool -- the fix for Superflex/TEP leagues, where market consensus
    // prices whole positions differently than a standard (non-SF) ROS board does, which
    // otherwise shows up as a false buy-low/sell-high on Overall rank alone.
    function getMarketPositionalRanks(marketRankings) {
        let sorted = [...marketRankings].sort((a, b) => a.marketVal - b.marketVal);
        let posCounters = {};
        let posRankMap = {};
        sorted.forEach(p => {
            const posKey = (p.pos || '').toUpperCase();
            posCounters[posKey] = (posCounters[posKey] || 0) + 1;
            posRankMap[p.cleanName] = posCounters[posKey];
        });
        return posRankMap;
    }

    function updateMarketMetaDisplay() {
        const metaEl = document.getElementById('marketMetaDisplay');
        if (metaEl) {
            if (State.marketRankings.length > 0) {
                metaEl.style.display = 'block';
                const countText = `Market Consensus Loaded: ${State.marketRankings.length} players`;
                // In-season market values shift within days (injuries, depth-chart news), so the
                // stale line sits much tighter than ROS (14) or Weekly (6).
                const fresh = getRankingsFreshness(State.marketUpdatedAt, 3);
                if (fresh) {
                    metaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'rankings-stale' : 'rankings-fresh'}">• ${fresh.label}${fresh.isStale ? ' — pull fresh values before trading' : ''}</span>`;
                } else {
                    metaEl.innerText = countText;
                }
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
        const rankBasis = document.getElementById('disconnectRankBasis')?.value || 'overall';
        const isPositional = rankBasis === 'positional';

        // Positional mode needs each market player's rank WITHIN their own position, which
        // market data doesn't ship directly -- computed once per run (see
        // getMarketPositionalRanks) rather than re-deriving it per player below.
        const marketPosRanks = isPositional ? getMarketPositionalRanks(State.marketRankings) : null;

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};
        // Manual / handoff leagues only know YOUR players, so "not in rosterMap" can't mean
        // "free agent" there -- see isFullyMappedLeague. Those leagues get the same neutral
        // "Not Yours" wording the All My Leagues search already uses, with a tooltip saying why.
        const knowsWholeLeague = isFullyMappedLeague(league);
        const notYoursTitle = "Manual league: this app only knows your roster, so it can't tell whether he's a free agent or on another team. Check your league's site before putting in a claim.";

        let analysisList = [];

        // Built once, outside the loop. This lookup used to be a full scan of rosRankings for
        // every single market entry -- with two ~500-row lists that's ~250,000 comparisons to
        // produce one report, and it was the most expensive single operation left in this file.
        const rosIndex = rankingIndex(State.rosRankings);

        State.marketRankings.forEach(m => {
            if (posFilter !== 'ALL') {
                if (!m.pos || !m.pos.includes(posFilter)) return;
            }
            let userObj = rosIndex.get(m.cleanName);
            if (!userObj) return; // Skip if user didn't rank this player

            // Positional Rank compares a player's rank WITHIN their own position (QB vs QB, RB
            // vs RB, ...) instead of across the whole player pool. This is the fix for the
            // classic Superflex false-positive: market consensus fetched for an SF league
            // prices QBs as a scarce, premium position overall, while a ROS board built without
            // SF weighting in mind ranks everyone on raw points -- so a fairly-valued QB1 (e.g.
            // Josh Allen) reads as a market "sell high" purely from that format mismatch, not a
            // real value gap. A player's rank relative to their OWN position holds up far
            // better across formats than their overall rank does, since SF/TEP mostly re-price
            // whole positions rather than reshuffling players within them.
            let userRank, marketVal;
            if (isPositional) {
                userRank = userObj.posRank;
                marketVal = marketPosRanks[m.cleanName];
                // Skip anyone missing a real positional rank on either side -- a user rankings
                // file with no Pos Rank column (and never uploaded as a position-specific file
                // either) leaves posRank at its 999 sentinel, and a market player with no
                // recognized position never got one either; comparing against that placeholder
                // would fabricate a "disconnect" that isn't real.
                if (!userRank || userRank >= 999 || !marketVal) return;
            } else {
                userRank = userObj.rank;
                marketVal = m.marketVal;
            }

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
                    userTier: isPositional ? userObj.posTier : userObj.tier, // matches whichever rank userRank is
                    // The "other" rank for the same player, so the card shows both: the overall rank
                    // when the headline number is positional, the position rank (see posRankTag) when
                    // it's overall.
                    userAltHTML: isPositional
                        ? (userObj.rank < 999 ? ` <span class="mls-rank-sep">&middot;</span> Ovr: <strong>#${userObj.rank}</strong>${tierTag(userObj.tier)}` : '')
                        : posRankTag(userObj, ''),
                    marketVal: marketVal,
                    delta: delta,
                    type: tradeType,
                    owner: owner,
                    pos: m.pos, // carried through so rendering can label positional ranks (e.g. "QB #12") rather than an ambiguous bare number
                    isPositional
                });
            }
        });

        // Sort by magnitude of disconnect
        analysisList.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        if (analysisList.length === 0) {
            outputEl.innerHTML = `<div class="scout-result-card" style="justify-content:center; color:var(--text-muted);">No significant market disconnects found matching your threshold. Try adjusting the filter limit.</div>`;
            return;
        }

        // A bare "#12" is ambiguous once it can mean either an overall rank or a within-position
        // rank -- prefixing the position (e.g. "QB #12") only for Positional Rank results keeps
        // Overall Rank results looking exactly as they always have.
        function formatDisconnectRank(rank, pos, isPositionalResult) {
            return (isPositionalResult && pos) ? `${escapeHtml(pos)} #${rank}` : `#${rank}`;
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
                let ownerStr = item.owner === "You" ? `<span style="color:#60a5fa;">On your roster</span>`
                    : item.owner ? `Rostered by: ${escapeHtml(item.owner)}`
                    : knowsWholeLeague ? `<span style="color:var(--primary-green);">Free Agent</span>`
                    : `<span style="color:var(--text-muted);" title="${notYoursTitle}">Not on your roster</span>`;
                html += `
                <div class="scout-result-card">
                    <div>
                        <div class="mls-item-name">${escapeHtml(item.name)}</div>
                        <div class="mls-meta-row">
                            <span>Your Board: <strong class="mls-stat-green">${formatDisconnectRank(item.userRank, item.pos, item.isPositional)}</strong>${tierTag(item.userTier)}${item.userAltHTML}</span>
                            <span>Market: <strong class="mls-stat-blue">${formatDisconnectRank(item.marketVal, item.pos, item.isPositional)}</strong></span>
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
                        <div class="mls-item-name">${escapeHtml(item.name)}</div>
                        <div class="mls-meta-row">
                            <span>Your Board: <strong class="mls-stat-red">${formatDisconnectRank(item.userRank, item.pos, item.isPositional)}</strong>${tierTag(item.userTier)}${item.userAltHTML}</span>
                            <span>Market: <strong class="mls-stat-blue">${formatDisconnectRank(item.marketVal, item.pos, item.isPositional)}</strong></span>
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
    // Fetched on first use rather than on every page load -- see loadScriptOnce in utils.js.
    // The old message here ("loading, try again in a moment") was a symptom of the eager
    // <script defer> tag: the only thing the user could do was wait and re-press. Now the
    // press itself starts the download and the export continues once it lands.
    if (!(await window.ensureHtml2Canvas())) {
        if (window.showToast) window.showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
        return;
    }

    const container = document.getElementById('optimalLineupContainer');
    const exportBtn = document.getElementById('exportBtn');
    if (!container || !exportBtn) return;

    const origText = exportBtn.innerText;
    exportBtn.innerText = "Capturing...";
    
    const buttons = container.querySelectorAll('.swap-btn, .lock-btn');
    buttons.forEach(b => b.style.display = 'none');
    // The on-screen projected/final points and opponent aren't part of the exported image.
    const screenOnly = container.querySelectorAll('.mls-pts, .mls-opp');
    screenOnly.forEach(e => e.style.display = 'none');

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
        screenOnly.forEach(e => e.style.display = '');
        exportBtn.innerText = origText;
    }
};

    // --- RENDERERS ---
    // --- ROOKIE LOOKUP (Roster tab "R" badge) ---
    // Rookie status isn't stored on league.roster -- it comes from Sleeper's years_exp (0 in a
    // player's rookie season), the same field the Matchup Simulator's rookie badge reads.
    // Looked up at render time rather than saved at sync so it can't go stale when the season
    // rolls over, and so leagues synced before this existed get badges without a re-sync.
    // Matched by Sleeper id first (synced leagues); manual and Draft Strategist handoff rosters
    // carry made-up ids ('p_...'), so those fall back to the normalized name -- on a name
    // collision preferring the player with an NFL team, like getSleeperMetaByName.
    let _rookieIndex = null;
    let _rookieIndexPromise = null;
    function getRookieIndex() {
        if (_rookieIndexPromise) return _rookieIndexPromise;
        _rookieIndexPromise = getSleeperPlayerMap().then(map => {
            const rookieIds = new Set();
            const knownIds = new Set();
            const byName = new Map();
            Object.entries(map).forEach(([id, p]) => {
                knownIds.add(id);
                const rookie = p.years_exp === 0;
                if (rookie) rookieIds.add(id);
                if (!p.first_name) return;
                const clean = normalizeName(`${p.first_name} ${p.last_name}`);
                const prev = byName.get(clean);
                if (!prev || (!prev.team && p.team)) byName.set(clean, { rookie, team: p.team || null });
            });
            _rookieIndex = { rookieIds, knownIds, byName };
            return _rookieIndex;
        }).catch(err => {
            _rookieIndexPromise = null;
            throw err;
        });
        return _rookieIndexPromise;
    }

    function isRookiePlayer(p, idx) {
        if (!idx || !p) return false;
        if (p.id && idx.knownIds.has(String(p.id))) return idx.rookieIds.has(String(p.id));
        const entry = idx.byName.get(p.cleanName);
        return !!(entry && entry.rookie);
    }

    function loadRosterTab() {
        // Every roster change funnels through here (manual add/remove, Roster tab delete,
        // re-sync), so this keeps the Settings "Added this session" list in step with it.
        renderManualAddLog();
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
        
        // Rookie badges need the Sleeper player map. It's usually already cached for the
        // session; the first time it isn't, the roster renders now without badges and
        // re-renders once the lookup lands. That happens at most once per session: after it
        // resolves, _rookieIndex is set and this branch is skipped. A failed lookup just
        // leaves the badges off.
        const rookieIdx = _rookieIndex;
        if (!rookieIdx) {
            getRookieIndex().then(() => loadRosterTab()).catch(e => console.warn('Rookie badges unavailable: Sleeper player map could not be loaded.', e));
        }

        const rosIndex = rankingIndex(State.rosRankings);
        let displayRoster = league.roster.map(p => {
            let rObj = rosIndex.get(p.cleanName);
            return {
                ...p, 
                rosRank: rObj ? rObj.rank : 999,
                posRank: rObj ? rObj.posRank : 999,
                rosTier: rObj ? rObj.tier : null,
                posTier: rObj ? rObj.posTier : null
            };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        displayRoster.sort((a, b) => {
            if (a.rosRank !== 999 || b.rosRank !== 999) return a.rosRank - b.rosRank;
            return (posOrder[a.pos] || 99) - (posOrder[b.pos] || 99);
        });

        let html = "";
        displayRoster.forEach(p => {
            let ovrStr = p.rosRank !== 999 ? `#${p.rosRank}${tierTag(p.rosTier)}` : "-";
            let posStr = p.posRank !== 999 ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
            let rankBadge = (p.rosRank !== 999 || p.posRank !== 999) ? `Ovr: ${ovrStr} | Pos: ${posStr}` : "Unranked";
            let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
            let byeBadge = getByeBadgeHTML(p.team);
            let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
            let sosBadge = getSoSBadgeHTML(p.team, p.pos);
            // Same "R" badge as MDS roster cards and the Matchup Simulator.
            let rookieBadge = isRookiePlayer(p, rookieIdx) ? `<span class="badge badge-rookie" title="Rookie" aria-label="Rookie">R</span>` : "";
            // Status badges ride on the name line (see .mls-name-badges) rather than a row of
            // their own: a separate row made badged cards a line taller than the rest, which
            // broke up the list's rhythm at phone width. Grouped so they wrap as one unit.
            // Ordered most-permanent first: rookie holds all season, so it keeps a fixed spot
            // beside the name; injury and bye come and go after it without shifting it.
            // Same TAXI badge the Lineup tab's bench uses. isTaxi is set at Sleeper sync time, so
            // manual leagues never show it. Sits right after rookie: both are season-long
            // roster-status markers, so they stay fixed ahead of injury/bye.
            let taxiBadge = p.isTaxi ? `<span class="badge taxi-badge" title="Taxi squad">TAXI</span>` : "";
            let statusBadges = [rookieBadge, taxiBadge, injBadge, byeBadge].filter(Boolean).join('');
            
            html += `
            <div class="roster-item">
                <div class="mls-player-row-info">
                    <span class="badge pos-badge ${escapeHtml(p.pos)} mls-pos-badge-sizing">${escapeHtml(p.pos)}</span>
                    <div class="mls-player-row-text">
                        <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}${statusBadges ? ` <span class="mls-name-badges">${statusBadges}</span>` : ''}</div>
                        <div class="mls-player-row-meta">
                            <span class="badge">${escapeHtml(p.team)}</span>
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
    window.overrideAutoLock = async function(playerId) {
        if (!State.activeLeagueId) return;
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let found = starters.find(s => s.player && s.player.id === playerId);
        let playerName = found ? found.player.name : (bench.find(p => p.id === playerId) || {}).name || 'This player';

        if (!await window.showConfirm(`${playerName}'s game shows as already started. Only override this if that's wrong; doing so lets the optimizer freely move or bench them again.`, { title: 'Override the auto-lock?', confirmText: 'Override Lock' })) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        let entry = State.autoLockOverridesMap[State.activeLeagueId];
        if (!entry || entry.week !== State.currentNflWeek) entry = { week: State.currentNflWeek, ids: [] };
        if (!entry.ids.includes(playerId)) entry.ids.push(playerId);
        State.autoLockOverridesMap[State.activeLeagueId] = entry;
        localStorage.setItem('mls_autolock_overrides_map', JSON.stringify(State.autoLockOverridesMap));

        if (typeof window.showToast === 'function') {
            window.showToast("Auto-lock removed - re-optimizing");
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
    window.unlockAllPlayers = async function() {
        if (!State.activeLeagueId) return;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        if (locks.length === 0) return;
        if (!await window.showConfirm(`This clears all ${locks.length} manual lock${locks.length === 1 ? '' : 's'} in this league. Players auto-locked because their game already started stay locked.`, { title: 'Unlock all locked players?', confirmText: 'Unlock All' })) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        State.lockedPlayersMap[State.activeLeagueId] = [];
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));

        if (typeof window.showToast === 'function') {
            window.showToast("All manual locks cleared - re-optimizing");
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
                    window.showToast(`Can't swap ${p1Obj.name} (${p1Obj.pos}) with ${p2Obj.name} (${p2Obj.pos}); that position doesn't fit that slot.`, { isError: true });
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

    // opts.batch marks a call made as one iteration of a multi-league run (optimizeAllLineups).
    // In batch mode this function computes and stores the lineup in State exactly as normal,
    // but performs neither of its two localStorage writes nor its render -- the batch caller
    // writes once and renders once after the whole loop. Each of those writes serializes the
    // ENTIRE per-league map (every league's starters, every league's bench), so doing them
    // per-iteration meant N leagues cost N full serializations of all N leagues' lineups, and
    // N full renders to display only the last one.
    window.optimizeLineup = function(forceReset = true, isManualAction = false, opts = {}) {
        const batch = !!opts.batch;
        let league = getActiveLeague();
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');

        if (!league || !league.roster || league.roster.length === 0) {
            // A batch iteration must not paint this empty state: State.activeLeagueId is
            // pointing at some other league mid-loop, so an empty-rostered league partway
            // through the batch would stamp "Welcome to the Lineup Optimizer" over whatever
            // the Lineup tab was legitimately showing for the league the person is actually
            // on. Nothing to compute for this league either way, so just leave.
            if (batch) return;
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

        // Indexed once per run rather than scanned per roster player. Matters most under
        // Optimize All, which runs this whole function once per league.
        const rankIdx = rankingIndex(activeDataSet);
        // locks is a small array (manually locked players in this league), but it's checked
        // once per roster player, so a Set costs nothing and keeps the loop body uniform.
        const lockSet = new Set(locks);

        let scoredRoster = league.roster.map(p => {
            let rObj = rankIdx.get(p.cleanName);
            let manualLocked = lockSet.has(p.id);
            let overridden = isAutoLockOverridden(State.activeLeagueId, p.id);
            let autoLocked = !manualLocked && !overridden && hasKickedOff(p) && isSleeperStarter(p);
            return { ...p, posRank: rObj ? rObj.posRank : 999, flexRank: rObj ? rObj.flexRank : 999, posTier: rObj ? rObj.posTier : null, flexTier: rObj ? rObj.flexTier : null, isLocked: manualLocked || autoLocked, autoLocked };
        });

        // Taxi-squad players are held out of the starter pool entirely rather than merely
        // deprioritized the way isUnavailableThisWeek handles byes and hard-out statuses.
        // That mechanism has a deliberate last-resort fallback that will start an unavailable
        // player rather than leave a slot empty -- correct for an Out RB (you get his zero
        // either way), wrong for a taxi player, whom the platform will not let you start at
        // all. A healthy, well-ranked rookie sitting on taxi is exactly the case that fallback
        // would otherwise promote into the lineup. They rejoin the bench pool after slotting.
        let taxiPlayers = scoredRoster.filter(p => p.isTaxi);
        let pool = scoredRoster.filter(p => !p.isTaxi);
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

        const benchOrder = (a, b) => {
            if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
            if (a.flexRank !== 999 && b.flexRank === 999) return -1;
            if (a.flexRank === 999 && b.flexRank !== 999) return 1;
            return a.posRank - b.posRank;
        };
        pool.sort(benchOrder);

        // Taxi players land beneath the entire real bench regardless of how well they're
        // ranked -- "Bench Priorities" is a list of who you'd turn to this week, and a taxi
        // player isn't an option at any rank. Sorted among themselves by the same comparator
        // so the group still reads best-to-worst internally. Appended after the sort rather
        // than folded into the comparator so this ordering can't be undone by a future change
        // to how the bench itself is ranked.
        taxiPlayers.sort(benchOrder);
        pool.push(...taxiPlayers);

        // Reassign which specific players occupy strict RB/WR/TE slots vs the FLEX slot(s),
        // purely by kickoff time -- who actually starts is already decided above by rank; this
        // only relabels slots so FLEX holds the latest games. See optimizeFlexKickoffOrder for
        // why this is safe (it never changes the set of starters, only slot labels). Gated by
        // the user-facing toggle (State.lineupSettings.flexKickoffOptimization, default on) --
        // when off, slots are left exactly as fillSlot()/the SFLEX loop above assigned them.
        if (State.lineupSettings.flexKickoffOptimization) {
            optimizeFlexKickoffOrder(starters);
        }

        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = pool;

        // Batch runs defer both writes to the caller -- see the note on this function's
        // signature. State above is updated either way, so a batch that somehow failed to
        // flush would lose the run, not corrupt it.
        if (!batch) {
            localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
            localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
        }

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

        // A batch iteration renders nothing: State.activeLeagueId is pointing at a league the
        // person isn't looking at, and the next iteration is about to move it again. The batch
        // caller restores the real active league and renders once at the end.
        if (!batch) renderLineupUI();
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
            if (log.added.length) changes.push(`<span style="color: #86efac; font-weight: 500;">+ ${log.added.map(escapeHtml).join(', ')}</span>`);
            if (log.dropped.length) changes.push(`<span style="color: #9ca3af; text-decoration: line-through;">- ${log.dropped.map(escapeHtml).join(', ')}</span>`);
            if (log.newlyOut.length) changes.push(`<span style="color: #fca5a5;">Out: ${log.newlyOut.map(escapeHtml).join(', ')}</span>`);
            
            if (changes.length > 0) {
                totalChanges += (log.added.length + log.dropped.length + log.newlyOut.length);
                html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.6rem 0.8rem; border-radius: 6px; border-left: 2px solid #60a5fa;">
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-bottom: 0.3rem;">${escapeHtml(log.leagueName)}</div>
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
            let failed = false;

            // Suppress the per-league toast optimizeLineup fires; one summary goes out below.
            if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(true);

            try {
                State.leagues.forEach(l => {
                    let isBestBall = isBestBallLeague(l);
                    if (isBestBall) return; // Skip optimizing Best Ball leagues

                    State.activeLeagueId = l.leagueId;

                    // Hydrate this league's own rankings so the optimizer uses the correct set
                    hydrateRankingsForLeague(l);

                    window.optimizeLineup(true, false, { batch: true });
                });

                // Single flush for the whole run. Each optimizeLineup call above deliberately
                // skipped these two writes (see its `batch` option): they serialize the entire
                // per-league map every time, so leaving them in the loop meant N leagues paid for
                // N serializations of all N leagues' lineups rather than one.
                localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
                localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
            } catch (err) {
                // A bad ranking set, or a quota-exceeded write on the flush above, used to throw
                // straight out of this timeout: toasts stayed stubbed for the rest of the session
                // and the button sat disabled reading "Optimizing All..." with no way back.
                console.error("Optimize All Error:", err);
                failed = true;
            } finally {
                // However the run ended, the app has to come back usable: toasts on, the user's
                // real league re-selected, the button clickable.
                if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(false);

                // switchActiveLeague re-hydrates the real active league's rankings (the loop
                // above left State.rosRankings/weeklyRankings pointing at whichever league it
                // stopped on) and calls optimizeLineup(false), which is the single render for
                // the entire batch. It must run even after a failure, or the app is left
                // displaying another league's data under the active league's header.
                try {
                    switchActiveLeague(originalActiveId);
                } catch (err) {
                    console.error("Optimize All: failed to restore the active league", err);
                    failed = true;
                }

                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }

            if (failed) {
                if (window.showToast) window.showToast("Couldn't optimize every lineup. Some leagues may be unchanged — check the console for details.", { isError: true });
            } else {
                let managedLeaguesCount = State.leagues.filter(l => !isBestBallLeague(l)).length;
                if (window.showToast) window.showToast(`Successfully optimized ${managedLeaguesCount} lineups!`);
            }
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
            // processSleeperData makes each league active in turn (it's shared with the
            // single-league sync, where that's the point), so without this the loop ended on
            // whichever league synced last: the header still named yours, but the Lineup and
            // Roster tabs showed the last league's roster scored with your league's rankings,
            // and the app reopened on that league next visit. Put back in the finally below,
            // the same way optimizeAllLineups restores it.
            const originalActiveId = State.activeLeagueId;
            try {
                // Preload the heavy player map ONCE to save massive API bandwidth
                const playerMap = await getSleeperPlayerMap();
                const preloaded = { playerMap }; 

                let successCount = 0;
                // processSleeperData returns false when a league couldn't be reached, and the
                // suppressErrorToast=true we pass below means that failure makes no noise of
                // its own. Counting only the successes and reporting "Successfully synced 5
                // leagues!" said nothing about the three now sitting on stale rosters -- you'd
                // go set lineups off them. Track the misses and name them, the way
                // importAllSleeperLeagues already does.
                let failedLeagueNames = [];
                let newLogs = [];

                // Suppress the per-league toasts processSleeperData fires during the loop; one
                // summary goes out below. Turned back off in the finally, not here: the writes
                // after the loop can throw (QuotaExceededError is realistic once someone has
                // eight or more leagues), and restoring only on the happy path used to mean the
                // catch's error toast went to a no-op stub and every toast in the app stayed
                // dead for the rest of the session.
                if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(true);

                for (let i = 0; i < sleeperLeagues.length; i++) {
                    let l = sleeperLeagues[i];
                    // Mirrors importAllSleeperLeagues' per-league progress text below, instead
                    // of a static "Syncing All..." for the whole loop regardless of how many
                    // leagues or how long it takes.
                    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing ${i + 1}/${sleeperLeagues.length}...`;
                    // processSleeperData re-optimizes the league it just synced, and the optimizer
                    // reads whatever rankings are in State -- so load THIS league's first, or every
                    // league gets a lineup built from the originally active league's rankings.
                    hydrateRankingsForLeague(l);
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
                    } else {
                        failedLeagueNames.push(l.name || l.leagueId);
                    }
                }

                // Single write after the loop instead of one localStorage.setItem per league. The
                // active league is put back first so the one saved is yours, not the last synced.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) State.activeLeagueId = originalActiveId;
                localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
                localStorage.setItem('mds_season_active_league', State.activeLeagueId);

                // Save logs to state and local storage
                State.syncLogs = newLogs;
                localStorage.setItem('mls_sync_logs', JSON.stringify(State.syncLogs));
                
                // Toast a summary that accounts for every league we tried, not just the ones
                // that worked: a miss here is a roster you'd go on to set a lineup off, so it
                // gets named rather than quietly dropped from the count.
                const failedCount = failedLeagueNames.length;
                let summaryMsg = failedCount > 0
                    ? `Synced ${successCount} of ${sleeperLeagues.length}. Couldn't reach: ${formatNameList(failedLeagueNames)} — try Sync All again.`
                    : `Successfully synced ${successCount} league${successCount === 1 ? '' : 's'}!`;
                if (newLogs.length > 0) {
                    summaryMsg += `\n\nChanges found in ${newLogs.length} league${newLogs.length === 1 ? '' : 's'}. Check the Sync Logs!`;
                }
                // force: toasts are still suppressed here (the finally below is what clears the
                // flag) and this summary is the whole point of having suppressed them.
                // A partial sync is shown as an error so it doesn't read like an all-clear --
                // that also gets it the dismiss button and a longer window, which it needs:
                // there are league names in there the person has to read and act on.
                if (window.showToast) {
                    window.showToast(summaryMsg, {
                        isError: failedCount > 0,
                        force: true,
                        duration: failedCount > 0 ? 9000 : undefined
                    });
                }

                // Re-render the logs accordion
                renderSyncLogs();
                
                // UX: Automatically open the accordion if there were changes so they don't have to hunt for them
                const accordion = document.getElementById('syncLogAccordion');
                if (accordion) accordion.open = newLogs.length > 0;
                
            } catch (err) {
                console.error("Sync All Error:", err);
                // A storage-quota failure on the writes above is the common case and has a
                // specific fix, so name it rather than hiding it behind the generic message.
                const isQuota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
                const msg = isQuota
                    ? "Synced your leagues, but there wasn't enough browser storage to save them. Remove a league you no longer use, then try again."
                    : "An error occurred while syncing leagues.";
                if (window.showToast) window.showToast(msg, { isError: true, force: true });
            } finally {
                if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(false);

                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';

                // Restore your league even if the loop threw partway: switchActiveLeague puts
                // back its id AND its rankings (the loop left State holding the last synced
                // league's), and re-renders the header, league manager and active tab.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) {
                    try { switchActiveLeague(originalActiveId); } catch (e) { console.error('Sync All: could not restore the active league.', e); }
                }

                // Refresh data states natively
                if (typeof renderLeagueManager === 'function') renderLeagueManager();
                if (typeof loadRosterTab === 'function') loadRosterTab();
                if (typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
            }
        }, 50);
    };

    // Note on the renderLeagueManager() call at the tail of this function: it rebuilds a row
    // for EVERY league in the app, which is correct after a single interactive lineup edit (a
    // swap or a lock toggle genuinely changes that league's "matches Sleeper" status), but is
    // pure waste when many lineups are computed in a row. Batch callers (optimizeAllLineups)
    // therefore don't call this function at all per league -- see optimizeLineup's `batch`
    // option -- rather than calling it and suppressing half its work.
    // "Pos: #40 | Flex: #66" badge on each Lineup tab player. The second number depends on
    // which rankings the optimizer ran on (see optimizeLineup's activeDataSet: Weekly when
    // loaded, otherwise ROS):
    //   Weekly -- FLEX rank, RB/WR/TE only. Weekly exports carry a FLEX list.
    //   ROS    -- Overall rank, any position. ROS exports carry Overall + Positional and no
    //             FLEX list; the parser stores Overall in flexRank for those files, so the
    //             number is right but "Flex" was the wrong name for it. Same wording as the
    //             waiver cards ("ROS Overall").
    function lineupRankBadge(p, rankedByRos) {
        const hasPos = p.posRank !== 999;
        const hasCross = p.flexRank !== 999;
        if (!hasPos && !hasCross) return "Unranked";
        const posStr = hasPos ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
        const crossStr = hasCross ? `#${p.flexRank}${tierTag(p.flexTier)}` : "-";
        if (rankedByRos) return hasCross ? `Pos: ${posStr} | Overall: ${crossStr}` : `Pos: ${posStr}`;
        return (['QB', 'K', 'DEF'].includes(p.pos) || !hasCross) ? `Pos: ${posStr}` : `Pos: ${posStr} | Flex: ${crossStr}`;
    }

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
        // Mirrors optimizeLineup's activeDataSet choice, so the badges name the numbers the
        // lineup was actually built from.
        const rankedByRos = State.weeklyRankings.length === 0 && State.rosRankings.length > 0;

        let html = "";

        html += getNextLockCountdownHTML(starters);
        html += getLineupInjuryWarningHTML(starters, league);

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
            html += `<div class="mb-3 text-center"><button class="mls-btn-sm btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="unlockAllPlayers()" title="Clears season-long manual locks in this league only - does not affect players auto-locked because their game already started">Unlock All (${locksList.length})</button></div>`;
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
                // Computed once so the control and the text badge below can never disagree --
                // a player can carry a stale autoLocked flag after the keep-swaps-sticky path
                // adds them to locksList, and in that case both should treat it as a manual lock.
                let isAutoLock = p.autoLocked && !locksList.includes(p.id);
                let lockControl = isAutoLock
                    ? `<button class="mls-btn-sm" title="Game in progress - tap to override if this is wrong" style="background:none; border:none; cursor:pointer; padding:0 4px; display:inline-flex;" onclick="overrideAutoLock('${p.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #60a5fa;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>`
                    : `<button class="mls-btn-sm lock-btn" style="background:none; cursor:pointer; padding:0 4px;" onclick="toggleLock('${p.id}')">${lockIcon}</button>`;

                let rankBadge = lineupRankBadge(p, rankedByRos);

                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
                let kickoffBadge = getGameInfoHTML(p.team);

                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && !validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b; font-size: 0.65rem; margin-left: 4px;">Bench in Sleeper</span>`;
                }
                // Text version of the padlock's state. Without it, manual vs auto lock differ
                // only by icon tint (green vs blue) plus a title= tooltip that never shows on a
                // phone. Worded AUTO-LOCKED rather than naming the reason, because the kickoff
                // badge on this same row already says "Started"/"Final" -- this adds the part
                // that badge can't say (a started bench player shows "Started" too).
                let lockBadge = !p.isLocked ? ""
                    : isAutoLock ? `<span class="badge mls-autolock-badge">AUTO-LOCKED</span>`
                    : `<span class="badge mls-lock-badge">LOCKED</span>`;
                let badgesRow = [lockBadge, injBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');

                // The slot badge below already spells out the position for strict slots (RB1
                // always holds an RB, etc), so a second colored position pill there is pure
                // duplication. It's only ambiguous for FLEX/SFLEX (could be RB/WR/TE) -- so the
                // player's real position gets shown as plain text, and only in those cases.
                // Now shown on every row regardless of slot type (previously only FLEX/SFLEX/
                // bench, where the slot badge alone doesn't reveal it) -- for consistency, per
                // Benton, and so every row's meta line starts with the same kind of element
                // instead of some starting with plain text and others starting with the team badge.
                let plainPos = `<span class="mls-plain-pos pos-text-${escapeHtml(String(p.pos).toLowerCase())}">${escapeHtml(p.pos)}</span>`;

                html += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotType}">${slotType}</span>
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${escapeHtml(p.team)}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        ${getPlayerPointsHTML(p)}
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
            // optimizeLineup guarantees every taxi player sits at the tail of benchPool, so the
            // divider only ever needs to be emitted once, at the first one encountered. Driven
            // off the data rather than a precomputed count so a bench with no taxi players
            // renders byte-for-byte as it did before this existed.
            let taxiDividerShown = false;
            benchPool.forEach(p => {
                if (p.isTaxi && !taxiDividerShown) {
                    taxiDividerShown = true;
                    benchHTML += `<div class="bench-taxi-divider"><span>Taxi Squad</span></div>`;
                }
                let lockClass = State.swapSourceId === p.id ? "swapping" : "";
                let rankBadge = lineupRankBadge(p, rankedByRos);

                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
                let kickoffBadge = getGameInfoHTML(p.team);
                // Kept even though the divider above already labels the group: the divider
                // scrolls off, and these rows get screenshotted and pasted into league chats.
                let taxiBadge = p.isTaxi ? `<span class="badge taxi-badge">TAXI</span>` : "";

                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; font-size: 0.65rem; margin-left: 4px;">Starting in Sleeper</span>`;
                }
                let badgesRow = [injBadge, taxiBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');
                // Bench ("BN") never reveals real position the way a strict slot badge does, so
                // always show it as plain text here -- same reasoning as the starters block above.
                let plainPos = `<span class="mls-plain-pos pos-text-${escapeHtml(String(p.pos).toLowerCase())}">${escapeHtml(p.pos)}</span>`;

                // "TX" rather than "BN" in the slot column, so the distinction survives even
                // where the badges row is dense -- same fixed 46px slot badge, no layout shift.
                const slotCode = p.isTaxi ? 'TX' : 'BN';

                // No swap control on a taxi row. The whole point of the flag is that this
                // player can't be started, so offering the button would be an invitation to
                // build a lineup Sleeper will reject -- and since swapping is the only way a
                // bench player reaches the starters here, withholding it is also what actually
                // enforces the exclusion in the UI, not just in the optimizer's own slotting.
                const rowActions = p.isTaxi
                    ? getPlayerPointsHTML(p)
                    : `${getPlayerPointsHTML(p)}
                        <button class="mls-btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>`;

                benchHTML += `
                <div class="lineup-slot ${lockClass} ${p.isTaxi ? 'taxi-row' : ''}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotCode}">${slotCode}</span>
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${escapeHtml(p.team)}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        ${rowActions}
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

        // Fills in projections/final scores/opponents if they're missing or stale; a no-op
        // (and no re-render) when everything's already fresh. See refreshLineupStats.
        refreshLineupStats();
    }
    // --- MOBILE TOOLTIPS ---
document.addEventListener('DOMContentLoaded', () => {
    // One-time cleanup of 'shared_sleeper_league_id', a league-ID handoff from MDS that was
    // never finished: nothing in either app ever wrote the key, but MLS used to read it here
    // and auto-click Sync on page load. MDS hands off via mds_handoff_roster instead (see
    // checkForDraftStrategistHandoff). The key is off getMlsOwnedKeys() now, so Factory Reset
    // can no longer clear a stale copy -- hence removing it directly. Idempotent, so it needs
    // no "already migrated" flag; safe to delete once existing installs have loaded once.
    try { localStorage.removeItem('shared_sleeper_league_id'); } catch (e) {}

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
            teamScoresMap[owner].players[pos].push({ name: actualName, rank: rank, tier: data?.tier });
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
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;">${escapeHtml(p.name)}</span>
                    <span style="color: var(--text-muted); font-weight: 600; flex-shrink: 0;">#${p.rank}${tierTag(p.tier)}</span>
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
                <td style="padding: 12px 10px; text-align: left; color: var(--text-main, #f8fafc);">${escapeHtml(t.owner)}</td>
                
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

// A player this audit considers a genuine problem to leave in an active slot. Deliberately
// narrower than HARD_OUT_STATUSES / getShortInjuryStatus's full vocabulary: Questionable and
// Doubtful players are game-time calls you may well still want rostered and even started, so
// flagging them here would bury the real "this guy is definitively not playing, go move him"
// signal this tool exists to surface. Shared by the Sleeper and manual-league paths below so
// the two can't drift on what counts as injured.
function isAuditOut(p) {
    if (!p) return false;
    return p.injury_status === "Out" || ["IR", "PUP", "NFI", "Suspended"].includes(p.status);
}

// Clean name -> raw Sleeper player entries, built over a player map the caller already has in
// hand (the audit's own force-refreshed one) rather than the session-cached indexes near the
// top of this file -- an injury audit specifically wants today's statuses, not whatever was
// cached when some earlier feature first needed a name lookup.
//
// Values are ARRAYS of candidates, unlike getCleanNameToIdIndex's first-match-wins: manual
// players carry a position and team the caller can disambiguate with (see resolveManualPlayer),
// and picking a retired namesake here wouldn't just mislabel a row, it would report the wrong
// injury status for somebody's actual starter.
function buildCleanNameCandidateIndex(playerMap) {
    const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const index = {};
    Object.entries(playerMap).forEach(([id, p]) => {
        if (!p || !p.first_name || !FANTASY_POS.includes(p.position)) return;
        const clean = normalizeName(`${p.first_name} ${p.last_name}`);
        (index[clean] = index[clean] || []).push({ ...p, id });
    });
    return index;
}

// Best guess at which real NFL player a manually-entered roster entry refers to. Returns null
// when nothing matches at all -- manual entries are free text (typos, nicknames, team defenses
// written any number of ways), so "no match" is an expected outcome, not an error, and the
// caller reports the count rather than silently pretending those players were audited.
function resolveManualPlayer(p, candidateIndex) {
    const candidates = candidateIndex[p.cleanName];
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Ordered tiebreakers, most trustworthy first. The manual "team" field defaults to FA and
    // the position dropdown defaults to FLEX, so neither is worth matching on when it is still
    // sitting at that default -- hence the guards.
    const team = p.team && p.team !== "FA" ? p.team : null;
    const pos = p.pos && p.pos !== "FLEX" ? p.pos : null;
    return (team && candidates.find(c => c.team === team))
        || (pos && candidates.find(c => c.position === pos && c.team))
        || (pos && candidates.find(c => c.position === pos))
        || candidates.find(c => c.team)
        || candidates[0];
}

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
        // Only built if a manual league actually turns up -- it is a full pass over every
        // player Sleeper knows about, not worth doing for an all-Sleeper set of leagues.
        let candidateIndex = null;

        // The locked-player filter below is only as good as the kickoff data behind it, and
        // State.currentNflWeek/gameTimesByTeam can be null on a fresh load or stale if the
        // background refresh hasn't caught up -- so this Run gets current data rather than
        // whatever happened to be cached. Failure is deliberately swallowed: hasKickedOff
        // returns false for a team it has no data for, so a dead ESPN/Sleeper endpoint just
        // means nothing gets filtered and the audit reports everything, exactly as it did
        // before this filter existed. Losing the whole audit over it would be far worse.
        try {
            const nflState = await getNflState();
            if (nflState && typeof nflState.week === 'number') {
                State.currentNflWeek = nflState.week;
                await refreshGameTimes();
            }
        } catch (err) { /* see above -- degrade to "nothing is locked" */ }

        let auditResults = [];
        let scannedSleeper = 0;
        let scannedManual = 0;
        let skippedBestBall = 0;
        // Injured players whose game has already kicked off: real problems, but ones no
        // platform will let you fix this week. Collected rather than dropped so the notice at
        // the top can account for them -- silently omitting them would look like the audit
        // missed an obvious IR starter sitting right there on the Lineup tab.
        let lockedOut = [];

        // --- PREFETCH EVERY LEAGUE'S NETWORK DATA IN PARALLEL ---
        // The loop below used to `await getSleeperLeagueRosters(...)` and
        // `await getSleeperUser(...)` inside itself, one league at a time. Ten Sleeper leagues
        // meant twenty strictly serialized round-trips before a single result appeared, with
        // no progress indication -- the audit read as a hang rather than as work. Nothing in
        // the loop depends on a previous league's response, so there was never a reason to
        // serialize them; fetched together, the whole set costs roughly one round-trip of
        // wall time.
        //
        // The username lookup is also deduplicated. Most people use the same Sleeper account
        // for every league they're in, so the old code re-fetched an identical user record
        // once per league.
        const isSleeperAuditLeague = (l) => !!l.leagueId
            && !isBestBallLeague(l)
            && !l.leagueId.startsWith('manual_')
            && !l.leagueId.startsWith('handoff_');

        const rostersByLeagueId = new Map();
        const userIdByUsername = new Map();
        const sleeperAuditLeagues = State.leagues.filter(isSleeperAuditLeague);

        if (sleeperAuditLeagues.length > 0) {
            const uniqueUsernames = [...new Set(sleeperAuditLeagues.map(l => l.username).filter(Boolean))];
            const [rosterResults, userIdResults] = await Promise.all([
                // Promise.all, not allSettled: a failed roster fetch rejects out to this
                // function's own catch and surfaces as an audit error, which is exactly what
                // happened before when the bare await inside the loop threw. Keeping that
                // deliberately -- quietly dropping a league would make an unscanned league
                // indistinguishable from a clean one.
                Promise.all(sleeperAuditLeagues.map(l => getSleeperLeagueRosters(l.leagueId))),
                // Per-username catch, mirroring the try/catch this replaces: a bad username
                // skips the leagues that use it and the rest of the audit carries on.
                Promise.all(uniqueUsernames.map(u => getSleeperUser(u).then(d => d.user_id).catch(() => null)))
            ]);
            sleeperAuditLeagues.forEach((l, i) => rostersByLeagueId.set(l.leagueId, rosterResults[i]));
            uniqueUsernames.forEach((u, i) => userIdByUsername.set(u, userIdResults[i]));
        }

        for (let league of State.leagues) {
            if (!league.leagueId) continue;

            // Nothing to act on in a Best Ball league: lineups are scored automatically, and
            // they do not hand you an IR slot to stash an Out player in either -- so every row
            // this audit could produce for one would be a chore the format does not allow.
            if (isBestBallLeague(league)) { skippedBestBall++; continue; }

            // Draft-Strategist-handoff leagues count as manual here for the same reason
            // isFullyMappedLeague groups them: they're a locally-stored roster of your own
            // players with no Sleeper league behind them. Previously only 'manual_' was
            // checked and a handoff league fell through to the Sleeper branch below, where
            // getSleeperLeagueRosters('handoff_...') threw and took the whole audit down with
            // it rather than just skipping that one league.
            const isManual = league.leagueId.startsWith('manual_') || league.leagueId.startsWith('handoff_');

            // Manually added leagues: Sleeper has no roster for them, but it still knows the
            // injury status of the actual NFL players on them, matched by name. There is no
            // Sleeper lineup to compare against, so "starting" means the lineup as it stands in
            // this tool (the optimizer's output on the Lineup tab), and an injured bench player
            // is reported as-is rather than as "Move to IR" -- whether the real league even has
            // an IR slot isn't something we can know from here.
            if (isManual) {
                const roster = league.roster || [];
                if (roster.length === 0) continue;

                if (!candidateIndex) candidateIndex = buildCleanNameCandidateIndex(playerMap);
                scannedManual++;

                const localStarters = State.manualStartersMap[league.leagueId] || [];
                const starterIds = new Set(localStarters.filter(s => s.player).map(s => s.player.id));
                // A league whose lineup has never been optimized has no starter/bench split at
                // all, so every injured player there is reported neutrally as "On Roster"
                // instead of being miscast as a benching that has already been handled.
                const lineupIsSet = starterIds.size > 0;

                let leagueIssues = [];
                let unmatched = 0;

                roster.forEach(rp => {
                    // Team defenses are keyed by team abbreviation in Sleeper's player map, and
                    // the manual entry's name for one is free text ("Eagles", "Philadelphia
                    // D/ST"), so they're resolved off the team code instead of by name. One
                    // that can't be resolved is dropped rather than counted as unmatched: a
                    // D/ST has no injury designation to report, so telling the person it went
                    // unchecked would be noise about nothing.
                    let match;
                    if (rp.pos === 'DEF') {
                        const def = rp.team ? playerMap[rp.team] : null;
                        if (!def || def.position !== 'DEF') return;
                        match = def;
                    } else {
                        match = resolveManualPlayer(rp, candidateIndex);
                        if (!match) { unmatched++; return; }
                    }
                    if (!isAuditOut(match)) return;

                    // Sleeper's team code, not the manually-typed one -- the manual entry's
                    // team defaults to FA and can go stale after a trade, and a wrong team here
                    // means either a locked player reported as fixable or a fixable one hidden.
                    if (hasKickedOff({ team: match.team })) {
                        lockedOut.push({ leagueName: league.name, name: rp.name });
                        return;
                    }

                    const location = !lineupIsSet ? "On Roster"
                        : (starterIds.has(rp.id) ? "Starting Lineup" : "Bench");
                    leagueIssues.push({
                        name: rp.name,
                        status: match.injury_status || match.status,
                        location
                    });
                });

                // Unmatched names are surfaced even when nothing else is wrong -- otherwise a
                // league full of typo'd names would render as a clean bill of health.
                if (leagueIssues.length > 0 || unmatched > 0) {
                    auditResults.push({
                        leagueName: league.name,
                        format: league.leagueId.startsWith('handoff_') ? "Imported Roster" : "Manual League",
                        issues: leagueIssues, unmatched: unmatched
                    });
                }
                continue;
            }

            // Both of these were network calls made here, one league at a time; they're now
            // read from the parallel prefetch above. The safety check covers the case where
            // this loop's own skip conditions and isSleeperAuditLeague's ever drift apart --
            // without it, a league the prefetch didn't cover would throw on rosters.find below.
            const rosters = rostersByLeagueId.get(league.leagueId);
            if (!rosters) continue;

            // Resolve User ID. getSleeperUser throws on a not-found/error response (the
            // original inline fetch here didn't check response.ok at all, so a bad username
            // would just produce userId===undefined, myRoster staying undefined below, and
            // this league getting silently skipped by the "if (!myRoster) continue" a few
            // lines down). The prefetch's per-username catch stores null for that case,
            // preserving the same "skip this one league, keep scanning the rest" behavior.
            // A league with no username at all was never fetched, so it reads back undefined
            // and skips here too -- previously it reached getSleeperUser(undefined), threw,
            // and hit the same continue.
            const userId = userIdByUsername.get(league.username);
            if (userId === null || userId === undefined) continue;

            const myRoster = rosters.find(r => r.owner_id === userId);
            if (!myRoster) continue;
            scannedSleeper++;

            const starters = myRoster.starters || [];
            const reserve = myRoster.reserve || [];
            // Sleeper's roster object lists taxi-squad players in their own array, but ALSO
            // leaves them in `players` alongside everyone else -- same as `reserve` -- so both
            // have to be subtracted explicitly to arrive at the actual active bench. Absent on
            // leagues with no taxi squad configured, hence the fallback.
            const taxi = myRoster.taxi || [];
            const allPlayers = myRoster.players || [];
            let leagueIssues = [];

            allPlayers.forEach(pId => {
                let p = playerMap[pId];
                if (!p) return;

                if (isAuditOut(p)) {
                    let isStarting = starters.includes(pId);
                    // A taxi player is excluded for the same reason a reserve player is: they
                    // aren't occupying an active roster spot, so there's no move to prompt.
                    // Dynasty taxi squads are also where an injured rookie is *supposed* to
                    // sit, which made this the one slot most likely to generate a standing
                    // false positive week after week.
                    let isBench = !isStarting && !reserve.includes(pId) && !taxi.includes(pId);

                    // Once a player's team has kicked off, their roster spot is frozen on
                    // essentially every platform -- they can't be benched, and they can't be
                    // stashed on IR either. Reporting them would be handing the person a to-do
                    // they're unable to complete. Checked here rather than up front so someone
                    // already correctly parked on reserve or taxi (neither starting nor active
                    // bench) never counts toward the locked-out notice.
                    if ((isStarting || isBench) && hasKickedOff({ team: p.team })) {
                        lockedOut.push({ leagueName: league.name, name: `${p.first_name} ${p.last_name}` });
                        return;
                    }

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

        // States what was and wasn't covered, so a Best Ball league going unreported reads as a
        // deliberate exclusion rather than the audit having quietly missed it.
        const scanParts = [];
        if (scannedSleeper > 0) scanParts.push(`${scannedSleeper} Sleeper league${scannedSleeper === 1 ? '' : 's'}`);
        if (scannedManual > 0) scanParts.push(`${scannedManual} manual league${scannedManual === 1 ? '' : 's'}`);
        let summaryLine = scanParts.length > 0 ? `Scanned ${scanParts.join(' and ')}` : `No auditable leagues found`;
        if (skippedBestBall > 0) summaryLine += ` · Skipped ${skippedBestBall} Best Ball league${skippedBestBall === 1 ? '' : 's'}`;
        const summaryHTML = `<div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:0.75rem;">${escapeHtml(summaryLine)}</div>`;

        // Rendered AFTER the results in both branches below, never before: everything in this
        // notice is a dead end the person can't act on this week, so it sits underneath the
        // roster moves they can actually go make rather than pushing them down the page.
        //
        // It names names on purpose. A bare count would leave the person wondering which player
        // it meant and re-checking the roster by hand -- the whole point of listing them is so
        // they can confirm at a glance that the IR starter they already know about is the one
        // being excluded, not some other problem going unreported.
        let lockedHTML = "";
        if (lockedOut.length > 0) {
            const one = lockedOut.length === 1;
            const namesHTML = lockedOut
                .map(l => `${escapeHtml(l.name)} <span style="opacity:0.7;">(${escapeHtml(l.leagueName)})</span>`)
                .join(', ');
            lockedHTML = `
            <div class="info-banner" style="display:flex; margin-top: 1.25rem; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color:#fcd34d;">
                <div class="cluster cluster-sm">
                    <div class="info-banner-icon" style="background:#f59e0b; color:white;">i</div>
                    <div><strong>${lockedOut.length} injured player${one ? '' : 's'} excluded (game already started):</strong> ${namesHTML}. Most platforms lock a roster spot once that player's game kicks off, so ${one ? 'this one' : 'these'} can't be moved until next week.</div>
                </div>
            </div>`;
        }

        if (auditResults.length === 0) {
            // Wording has to shift in both of these cases -- a flat "All clear!" is a claim
            // about rosters that were actually examined, and it reads as either a
            // contradiction (directly under a notice listing injured starters) or an outright
            // false negative (when nothing was examined at all).
            const clearText = scannedSleeper + scannedManual === 0
                ? `Nothing to audit. Best Ball leagues are skipped, and no other leagues were found.`
                : (lockedOut.length > 0
                    ? `Nothing actionable. Every injured player found is already locked in for this week.`
                    : `All clear! No injured players found in active slots across your leagues.`);
            outputEl.innerHTML = summaryHTML +
                `<div class="scout-result-card" style="justify-content:center; color:var(--primary-green);">${clearText}</div>` +
                lockedHTML;
        } else {
            let html = summaryHTML;
            auditResults.forEach(res => {
                html += `<div style="font-weight:bold; color:#fca5a5; margin: 1rem 0 0.5rem 0;">${escapeHtml(res.leagueName)} <span style="color:var(--text-muted); font-size: 0.75rem; font-weight: normal;">${escapeHtml(res.format)}</span></div>`;
                if (res.unmatched > 0) {
                    const one = res.unmatched === 1;
                    html += `<div style="color:var(--text-muted); font-size:0.75rem; font-style:italic; margin-bottom:0.5rem;">${res.unmatched} player${one ? '' : 's'} could not be matched to Sleeper's player database and ${one ? 'was' : 'were'} not checked. Re-add ${one ? 'that player' : 'those players'} using their full name to include them here.</div>`;
                }
                res.issues.forEach(issue => {
                    html += `
                    <div class="scout-result-card" style="border-color: #ef4444;">
                        <div>
                            <div class="mls-item-name">${escapeHtml(issue.name)}</div>
                            <div class="mls-meta-row">
                                <span style="color: #fca5a5; font-weight: bold;">${escapeHtml(issue.status)}</span>
                            </div>
                        </div>
                        <div class="mls-text-right">
                            <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${escapeHtml(issue.location)}</span>
                        </div>
                    </div>`;
                });
            });
            outputEl.innerHTML = html + lockedHTML;
        }

    } catch (err) {
        console.error('Global injury audit failed:', err);
        // Every message says the audit didn't finish, on purpose: an empty results panel after
        // an audit reads as "all clear," which is the one conclusion a failed run must not
        // leave behind. Three realistic causes, each with its own fix:
        //   * Connection -- the forced-fresh player map (~5MB) or a league's roster fetch
        //     failed or timed out. Common on phone data; retrying is the fix.
        //   * SyntaxError -- neither getSleeperPlayerMap nor getSleeperLeagueRosters checks
        //     res.ok, so when Sleeper is down or rate-limiting, its HTML/plain-text error page
        //     gets fed to res.json() and fails here. Not the person's connection, so telling
        //     them to check it would send them the wrong way.
        //   * Anything else -- a saved league whose data isn't shaped the way the audit
        //     expects. Re-syncing rewrites it.
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper for current injury statuses, so the audit didn't finish - no leagues were checked. Check your connection and tap Run Global Audit again.`;
        } else if (err && err.name === 'SyntaxError') {
            msg = `Sleeper sent back an unexpected response, so the audit didn't finish - no leagues were checked. Sleeper may be having problems; try Run Global Audit again in a few minutes.`;
        } else {
            msg = `The audit stopped partway through, so treat this as no result, not an all-clear. Some saved league data may be out of date - tap Sync All Leagues on the Dashboard, then run the audit again.`;
        }
        outputEl.innerHTML = `<span class="mls-error-text">${msg}</span>`;
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
};

// --- MATCHUP SIMULATOR (MONTE CARLO) ---
// Bound via onclick="runMatchupSim()" on #run-sim-btn, matching this file's existing
// convention of exposing handlers on window rather than addEventListener wiring (see
// switchActiveLeague, addEarlyTeam, etc.) -- runMatchupSimulation itself (from
// monteCarloUi.js) stays a pure hand-off to the Worker with no knowledge of State, matching
// how sleeperApi.js/marketDataApi.js/rankingsParser.js are kept free of State access too.
window.runMatchupSim = async function() {
    const btn = document.getElementById('run-sim-btn');
    const league = getActiveLeague();

    // Nothing else ever clears #monte-carlo-results, so without this every path that returns
    // below leaves the PREVIOUS run's card on screen -- a win probability for a different
    // week, lineup or league, sitting there looking like the answer to what was just asked.
    // Each of those paths now writes its reason into that same container: a toast that
    // vanishes after six seconds isn't enough on its own when the thing it's explaining is a
    // stale card that stays.
    clearSimResults();

    if (!league || league.leagueId.startsWith('manual_')) {
        const msg = "Sync a Sleeper league on the Dashboard first.";
        showSimNotice(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
        return;
    }
    if (!league.rosterId) {
        const msg = "Re-sync this league from the Dashboard to enable simulations.";
        showSimNotice(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
        return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Simulating...</span>`;
    }

    try {
        const nflState = await getNflState();
        // getNflState returns null only when Sleeper answered with an error status (a network
        // failure throws instead, and lands in the connection branch of the catch below). This
        // used to throw a generic Error here, which the catch had no way to tell apart from a
        // bug -- so it's reported in place, like the other early exits in this function.
        if (!nflState || typeof nflState.week !== 'number') {
            const msg = "Sleeper didn't return the current NFL week, so the simulation didn't run. Sleeper may be having problems - try Run Matchup Simulations again in a few minutes.";
            showSimNotice(msg, { isError: true });
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }
        const currentWeek = nflState.week;
        const season = nflState.league_season || nflState.season;
        const rosterMap = league.globalRosterMap || {}; // needed by Waiver Insights below, to exclude anyone already rostered in this league

        if (currentWeek < 2) {
            const msg = "Not enough completed weeks yet to estimate variance.";
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }

        // Needed for the actual-score check below (hasKickedOff) to be trustworthy for THIS
        // specific week -- State.currentNflWeek could still be null (first load) or stale
        // (background refresh hasn't caught up) at the moment this runs, and hasKickedOff
        // silently returns false for a team it has no data for, which would just make every
        // player fall back to their projection rather than error -- safe, but defeats the
        // point of checking at all. Syncing here and awaiting the fetch (see refreshGameTimes'
        // own comment on why it's awaitable) means this Run always uses kickoff data for the
        // actual week it's simulating, not whatever the last background refresh happened to be.
        State.currentNflWeek = currentWeek;
        await refreshGameTimes();

        const matchups = await getSleeperMatchups(league.leagueId, currentWeek);
        const myEntry = matchups.find(m => m.roster_id === league.rosterId);
        if (!myEntry || !myEntry.matchup_id) {
            const msg = `No matchup found for Week ${currentWeek} (bye week?).`;
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }
        const oppEntry = matchups.find(m => m.matchup_id === myEntry.matchup_id && m.roster_id !== league.rosterId);
        if (!oppEntry) {
            const msg = "Couldn't find an opponent for this week's matchup.";
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }

        // Sleeper pads empty slots with the literal string "0" rather than omitting them.
        const sleeperMyStarters = (myEntry.starters || []).filter(id => id && id !== '0');
        const oppStarters = (oppEntry.starters || []).filter(id => id && id !== '0');

        // Simulate the lineup the person is actually looking at in this tool, not necessarily
        // what's live on Sleeper -- State.manualStartersMap is the same in-app editable lineup
        // the optimizer/swap UI already reads and writes (see renderLineupUI), so a swap made
        // here but not yet pushed to Sleeper is reflected immediately. Only the opponent's side
        // has to come from Sleeper, since there's no in-app editing of their roster.
        const localStarters = State.manualStartersMap[league.leagueId] || [];
        const localStarterIds = localStarters.filter(s => s.player).map(s => s.player.id).filter(id => id && id !== '0');
        const usingLocalLineup = localStarterIds.length > 0;
        const myStarters = usingLocalLineup ? localStarterIds : sleeperMyStarters;

        const lineupDiffersFromSleeper = usingLocalLineup &&
            (myStarters.length !== sleeperMyStarters.length || !myStarters.every(id => sleeperMyStarters.includes(id)));

        // Bench comparisons only make sense against the in-app lineup -- there's no bench
        // context at all for Sleeper's raw current-week starters (myEntry.starters is just a
        // flat list of IDs with no slot assignment), and manualBenchMap is itself an in-app-only
        // concept. localStarters carries each player's slot (e.g. "RB1", "FLEX2"), needed below
        // to figure out which bench players are even eligible to replace which starter.
        // Taxi players live in manualBenchMap alongside real bench depth (see optimizeLineup),
        // but Lineup Insights' entire output is "swap this bench player in for that starter" --
        // a move the platform won't allow for someone on taxi. Filtered here rather than in
        // isExcludedFromSimulation, which answers a different question ("is this player likely
        // to take the field"): a healthy taxi rookie would pass that check and still be an
        // illegal suggestion.
        const benchPool = usingLocalLineup
            ? (State.manualBenchMap[league.leagueId] || []).filter(p => !p.isTaxi)
            : [];
        const benchIds = benchPool.map(p => p.id).filter(id => id && id !== '0');

        const scoringKey = getLeagueScoringKey(league);
        const { blended: history, currentSeasonOnly } = await getPlayerWeeklyScoreHistory(
            [...myStarters, ...oppStarters, ...benchIds], season, currentWeek, scoringKey,
            { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
        );

        // Needed to show names/positions next to each player's projected range in the
        // results panel -- the pipeline up to this point only deals in Sleeper player IDs.
        const playerMap = await getSleeperPlayerMap();

        // Sleeper's own weekly projection factors in this week's specific matchup, injury
        // designation, byes, etc. -- a better center-of-distribution estimate for THIS week
        // than a flat trailing average across every week played so far. A missing/failed
        // fetch (or a player Sleeper simply doesn't bother projecting -- common for deep
        // bench/waiver-tier guys) just means projectedMean stays null and that player falls
        // back to their historical average, exactly as before.
        const projections = await getWeeklyProjections(season, currentWeek);
        const getProjectedMean = (id) => {
            const proj = projections && projections[id];
            const val = proj ? proj[scoringKey] : undefined;
            return typeof val === 'number' ? val : null;
        };

        const toPlayerObj = (id, matchupEntry) => {
            const p = playerMap[id] || {};
            const name = p.first_name ? `${p.first_name} ${p.last_name}` : (p.last_name || id);
            // years_exp is Sleeper's own experience counter (0 for a player's rookie season) --
            // more reliable than inferring "rookie" from a lack of game history, which would
            // also catch a 2nd-year player coming back from an injury-lost season.
            //
            // actualScore: this week's real, already-recorded score, once this player's game
            // has actually started -- most relevant for Thursday Night, but just as real for
            // the Sunday early slate once it's wrapped up, or checking win odds ahead of
            // Sunday/Monday night with the early games already final.
            //
            // Whether a game has started is checked directly via hasKickedOff (the same
            // kickoff-time data already powering the lineup tab's kickoff badges and FLEX
            // auto-lock), NOT by looking at whether players_points is a positive number.
            // Points alone can't tell "hasn't played" apart from "played and scored": Sleeper
            // pre-populates players_points with 0 for every starter before kickoff, but a
            // real, already-played result can ALSO legitimately be 0 or negative (e.g. DJ
            // Moore's -0.1 in a real game he exited early from injury) -- so a value-based
            // check would either treat every pre-game player as final, or wrongly discard a
            // genuine low/negative result depending on which way it's biased. Kickoff time is
            // the actual fact being asked about ("has this game happened yet"); points were
            // never the right signal for that question, just a proxy that broke on both ends.
            const actualPts = matchupEntry && matchupEntry.players_points ? matchupEntry.players_points[id] : undefined;
            const playerTeam = p.team || '';
            const actualScore = (typeof actualPts === 'number' && hasKickedOff({ team: playerTeam })) ? actualPts : null;
            return {
                id, name, pos: p.position || '', team: playerTeam, weeklyScores: history[id] || [], currentSeasonScores: currentSeasonOnly[id] || [],
                isRookie: p.years_exp === 0, projectedMean: getProjectedMean(id),
                actualScore
            };
        };

        // Players with zero completed games (rookies, recent signings, bye-adjacent
        // call-ups with no prior season either) get excluded rather than contributing a
        // phantom mean-0 score to their team's total -- see getPlayerWeeklyScoreHistory's
        // contract for why a missing week isn't the same as a 0. Doubtful/Out/IR players are
        // excluded the same way and for a related reason: every profile this pipeline builds
        // implicitly assumes its subject is taking the field, and that's exactly what those
        // three statuses mean isn't a safe assumption right now (see isExcludedFromSimulation's
        // own comment on why this list is stricter than the lineup optimizer's). Applied here,
        // in the one place all three roster arrays (team1, team2, and the bench pool used for
        // Lineup Insights) are built, rather than only on team1/team2, so a Doubtful/Out/IR
        // bench player can't be suggested as a "swap in" pick either.
        let excludedCount = 0;
        let injuryExcludedCount = 0;
        const toPlayerObjs = (ids, matchupEntry) => ids.reduce((arr, id) => {
            const rawPlayer = playerMap[id] || {};
            if (isExcludedFromSimulation(rawPlayer)) { injuryExcludedCount++; return arr; }
            const playerObj = toPlayerObj(id, matchupEntry);
            if (playerObj.weeklyScores.length > 0) arr.push(playerObj); else excludedCount++;
            return arr;
        }, []);

        const team1Players = toPlayerObjs(myStarters, myEntry);
        const team2Players = toPlayerObjs(oppStarters, oppEntry);

        if (typeof window.showToast === 'function') {
            const exclusionNotes = [];
            if (excludedCount > 0) exclusionNotes.push(`${excludedCount} without enough game history yet`);
            if (injuryExcludedCount > 0) exclusionNotes.push(`${injuryExcludedCount} listed as Doubtful, Out, or IR`);
            if (exclusionNotes.length > 0) {
                window.showToast(`${exclusionNotes.join(' and ')} excluded from the simulation.`);
            }
        }

        // "Bench Player Y outscored Starting Player Z X% of the time" -- for each bench
        // player with enough history, find the starters slotAcceptsPos actually allows them
        // to replace (same eligibility the swap UI itself enforces, see slotAcceptsPos's own
        // comment), then compare against the weakest of those -- the one an actual lineup
        // swap would target -- rather than every eligible starter, which would just restate
        // the obvious for anyone but the weakest link. starterSlotTypes/team1ProfilesById are
        // computed once here (rather than nested inside the bench-only block below) since
        // Waiver Insights, right after, needs the exact same "which starter would this
        // replace" eligibility and profile lookup, just sourced from a different candidate
        // pool.
        const starterSlotTypes = localStarters
            .filter(s => s.player)
            .map(s => ({ id: s.player.id, slotType: s.slot.replace(/[0-9]/g, '') }));

        const team1ProfilesById = {};
        team1Players.forEach(p => { team1ProfilesById[p.id] = getPlayerVarianceProfile(p.weeklyScores, { projectedMean: p.projectedMean, actualScore: p.actualScore }); });

        // Given a candidate's own variance profile and position, finds the weakest eligible
        // starter they could replace and returns the win probability against that starter --
        // shared by both Lineup Insights (bench) and Waiver Insights (free agents) below,
        // since the eligibility rule and "compare against the weakest link" logic is identical
        // either way; only where the candidate came from differs.
        const compareAgainstWeakestStarter = (candidateProfile, candidatePos) => {
            const eligibleStarterIds = starterSlotTypes
                .filter(s => slotAcceptsPos(s.slotType, candidatePos))
                .map(s => s.id)
                .filter(id => team1ProfilesById[id]); // must have a valid profile too
            if (eligibleStarterIds.length === 0) return null;

            const weakestStarterId = eligibleStarterIds.reduce((weakestId, id) =>
                team1ProfilesById[id].mean < team1ProfilesById[weakestId].mean ? id : weakestId
            );
            const weakestStarter = team1Players.find(p => p.id === weakestStarterId);
            const winPct = getProbabilityBeats(candidateProfile, team1ProfilesById[weakestStarterId]);
            return { weakestStarter, winPct };
        };

        const benchInsights = [];
        if (benchPool.length > 0) {
            const benchObjs = toPlayerObjs(benchIds, myEntry);

            benchObjs.forEach(benchPlayer => {
                const benchProfile = getPlayerVarianceProfile(benchPlayer.weeklyScores, { projectedMean: benchPlayer.projectedMean, actualScore: benchPlayer.actualScore });
                const result = compareAgainstWeakestStarter(benchProfile, benchPlayer.pos);
                if (!result) return;

                // Only worth flagging if the bench player is actually favored -- anything at
                // or below 50% just confirms the current starter is the right call, which
                // isn't an actionable "you should consider this swap" insight.
                if (result.winPct <= 50) return;

                benchInsights.push({
                    benchName: benchPlayer.name, benchPos: benchPlayer.pos, benchIsRookie: benchPlayer.isRookie,
                    starterName: result.weakestStarter.name, starterPos: result.weakestStarter.pos, starterIsRookie: result.weakestStarter.isRookie,
                    benchWinPct: result.winPct
                });
            });

            benchInsights.sort((a, b) => b.benchWinPct - a.benchWinPct);
            benchInsights.splice(5); // top 5 by margin -- the rest would just be noise
        }

        // --- WAIVER INSIGHTS ---
        // Same comparison as Lineup Insights above, pointed at available free agents instead
        // of your bench. Off by default (see the toggle in the Matchup Simulator card) since
        // it costs an extra round trip this function wouldn't otherwise make: free-agent
        // candidates come from a rankings file (a name and a rank -- no Sleeper id, no weekly
        // score history), so getting them into the same win-probability math as everyone else
        // here means resolving each one's Sleeper id and fetching their history separately,
        // rather than reusing the one batched history fetch already done above for your
        // roster and your opponent's.
        const waiverInsights = [];
        if (State.simSettings.waiverInsights) {
            try {
                const nameToIdIndex = await getCleanNameToIdIndex();
                const candidates = getTopWaiverCandidatesByPosition(rosterMap, 3)
                    .map(c => ({ ...c, id: nameToIdIndex[c.cleanName] }))
                    .filter(c => c.id && !isExcludedFromSimulation(playerMap[c.id]));

                if (candidates.length > 0) {
                    const candidateIds = candidates.map(c => c.id);
                    const { blended: waiverHistory } = await getPlayerWeeklyScoreHistory(
                        candidateIds, season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
                    );

                    candidates.forEach(c => {
                        const weeklyScores = waiverHistory[c.id] || [];
                        if (weeklyScores.length === 0) return; // same "not enough history" bar as everyone else

                        const rawPlayer = playerMap[c.id] || {};
                        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean: getProjectedMean(c.id) });
                        const result = compareAgainstWeakestStarter(profile, rawPlayer.position || c.pos);
                        if (!result || result.winPct <= 50) return;

                        waiverInsights.push({
                            faName: c.name, faPos: rawPlayer.position || c.pos,
                            starterName: result.weakestStarter.name, starterPos: result.weakestStarter.pos, starterIsRookie: result.weakestStarter.isRookie,
                            faWinPct: result.winPct
                        });
                    });

                    waiverInsights.sort((a, b) => b.faWinPct - a.faWinPct);
                    waiverInsights.splice(5);
                }
            } catch (err) {
                // Waiver Insights is a bonus layer on top of the main simulation -- a failure
                // here (a rankings/market fetch hiccup, an unresolvable name) shouldn't take
                // down the matchup simulation itself, just quietly skip this part.
                console.error('Waiver Insights failed:', err);
            }
        }

        runMatchupSimulation(team1Players, team2Players, { lineupDiffersFromSleeper, benchInsights, waiverInsights, currentWeek });
    } catch (err) {
        console.error('Matchup simulation failed:', err);
        // Same three-way split as runGlobalInjuryAudit's catch, for the same reasons:
        //   * Connection -- any of the Sleeper calls above (matchups, weekly stats, the ~5MB
        //     player map) failed or timed out. Retrying is the fix.
        //   * SyntaxError -- getSleeperPlayerMap doesn't check res.ok, so a Sleeper outage or
        //     rate-limit page fails in res.json(). Sleeper's side, not the person's connection.
        //   * Anything else -- most likely the saved lineup/roster for this league isn't in
        //     the shape this function expects (a non-ok matchups response lands here too,
        //     which in practice means the stored league ID is stale). Re-syncing rewrites both.
        // Worker failures never reach this catch -- runMatchupSimulation reports those itself.
        // Escaped because both showSimNotice and showToast write their message as HTML.
        const leagueName = escapeHtml(league.name || 'this league');
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper, so the simulation for ${leagueName} didn't run. Check your connection and tap Run Matchup Simulations again.`;
        } else if (err && err.name === 'SyntaxError') {
            msg = `Sleeper sent back an unexpected response, so the simulation for ${leagueName} didn't run. Sleeper may be having problems - try again in a few minutes.`;
        } else {
            msg = `Couldn't run the simulation for ${leagueName} - its saved lineup or roster data may be out of date. Tap Sync All Leagues on the Dashboard, then run it again.`;
        }
        showSimNotice(msg, { isError: true });
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
};

    // loadSheetJS used to be defined here. mds.js needed the same lazy-load with the same
    // failure path (it had its own copy with no error handling at all), so it now lives in
    // js/utils.js as window.loadSheetJS alongside loadScriptOnce. The call sites above use it
    // directly; the (callback, onError) signature rankingsParser.js documents is unchanged.
})();