// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: MATCHUP SIMULATOR
// (MONTE CARLO), plus lookupSimPlayer, the simulator card's player lookup. Its WAIVER INSIGHTS block
// became getWaiverInsights in scout/waiverInsights.js in 3G.
import { getNflState, getSleeperPlayerMap, getSleeperMatchups } from '../../shared/api/sleeper.js';
import { runMatchupSimulation, clearSimResults, showSimNotice } from './ui.js';
import { getPlayerWeeklyScoreHistory, getWeeklyProjections } from '../../shared/api/sleeperStats.js';
import { MIN_RELIABLE_GAMES, getPlayerVarianceProfile, getProbabilityBeats } from './stats.js';
import { escapeHtml } from '../compat.js';
import { State, refreshGameTimes } from '../state.js';
import { getShortInjuryStatus, isExcludedFromSimulation, SIM_EXCLUDE_STATUSES, getActiveLeague, isConnectionError } from '../helpers.js';
import { getCleanNameToIdIndex } from '../players.js';
import { getLeagueScoringKey, hasKickedOff } from '../lineup/gameInfo.js';
import { getWaiverInsights } from '../scout/waiverInsights.js';
import { slotAcceptsPos } from '../render/lineup.js';

// --- MATCHUP SIMULATOR (MONTE CARLO) ---
// Bound to #run-sim-btn through its data-action="runMatchupSim" (the click table in
// js/mls/main.js; an inline onclick handler until refactor chunk 5C) -- runMatchupSimulation
// itself (from sim/ui.js) stays a pure hand-off to the Worker with no knowledge of State, matching
// how js/shared/api/sleeper.js, api/market.js and rankings/parse.js are kept free of State access too.
export const runMatchupSim = async function() {
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
        btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Simulating…</span>`;
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
        //
        // Bench players whose game has already kicked off are dropped for the same reason:
        // Sleeper won't let you move them into the lineup anymore, so "Player Y outscored
        // Player Z" after TNF (or the early Sunday slate) is a suggestion you can't act on.
        // refreshGameTimes was awaited above, so hasKickedOff is current for this week.
        const benchPool = usingLocalLineup
            ? (State.manualBenchMap[league.leagueId] || []).filter(p => !p.isTaxi && !hasKickedOff(p))
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
        //
        // Starters whose game has already kicked off are never the target, for the mirror-
        // image reason bench players who already played are left out of benchPool above:
        // their slot is locked in Sleeper, so they can't be swapped out. Without this, a TNF
        // starter's final (a fixed, zero-variance number) could be flagged as the weakest link
        // and "lose" to a bench player you have no way to put in his place.
        const lockedStarterIds = new Set(team1Players.filter(p => hasKickedOff({ team: p.team })).map(p => p.id));
        const compareAgainstWeakestStarter = (candidateProfile, candidatePos) => {
            const eligibleStarterIds = starterSlotTypes
                .filter(s => slotAcceptsPos(s.slotType, candidatePos))
                .map(s => s.id)
                .filter(id => !lockedStarterIds.has(id))
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

        // Waiver Insights: the same comparison against available free agents (scout/waiverInsights.js).
        const { waiverInsights, waiverInsightsStatus } = await getWaiverInsights({ team1Players, lockedStarterIds, rosterMap, playerMap, season, currentWeek, scoringKey, getProjectedMean, compareAgainstWeakestStarter });

        runMatchupSimulation(team1Players, team2Players, { lineupDiffersFromSleeper, benchInsights, waiverInsights, waiverInsightsStatus, currentWeek });
    } catch (err) {
        console.error('Matchup simulation failed:', err);
        // Same three-way split as runGlobalInjuryAudit's catch, for the same reasons:
        //   * Connection -- any of the Sleeper calls above (matchups, weekly stats, the ~5MB
        //     player map) failed or timed out. Retrying is the fix.
        //   * SyntaxError / isSleeperResponseError -- a Sleeper outage or rate-limit page:
        //     getSleeperPlayerMap throws the latter for a non-ok or malformed response (refactor
        //     2C follow-up); other calls fail in res.json(). Sleeper's side, not the connection.
        //   * Anything else -- most likely the saved lineup/roster for this league isn't in
        //     the shape this function expects (a non-ok matchups response lands here too,
        //     which in practice means the stored league ID is stale). Re-syncing rewrites both.
        // Worker failures never reach this catch -- runMatchupSimulation reports those itself.
        // Escaped because both showSimNotice and showToast write their message as HTML.
        const leagueName = escapeHtml(league.name || 'this league');
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper, so the simulation for ${leagueName} didn't run. Check your connection and tap Run Matchup Simulations again.`;
        } else if (err && (err.name === 'SyntaxError' || err.isSleeperResponseError)) {
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
export const lookupSimPlayer = async function(p) {
    const resultEl = document.getElementById('simPlayerLookupResult');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<p class="text-helper">Looking up ${escapeHtml(p.name)}…</p>`;

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
