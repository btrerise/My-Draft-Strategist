// Moved out of runMatchupSim (js/mls/sim/matchup.js) in refactor chunk 3G: the WAIVER INSIGHTS block,
// now a function of the runMatchupSim locals it reads; runMatchupSim calls it where the block was and
// passes the result to runMatchupSimulation. 3G's second step added the position-lookup call and
// noCandidates (see docs/refactor/LOG.md); the block's other lines are as they were.
import { getPlayerWeeklyScoreHistory } from '../../shared/api/sleeperStats.js';
import { MIN_RELIABLE_GAMES, getPlayerVarianceProfile } from '../sim/stats.js';
import { State } from '../state.js';
import { isExcludedFromSimulation } from '../helpers.js';
import { ensureSleeperPosByName, getCleanNameToIdIndex } from '../players.js';
import { hasKickedOff } from '../lineup/gameInfo.js';
import { getTopWaiverCandidatesByPosition } from '../trade/waiverValue.js';

    // --- WAIVER INSIGHTS ---
    // Returns { waiverInsights, waiverInsightsStatus } for runMatchupSimulation. The arguments are
    // runMatchupSim's own locals (the rosters, the Sleeper player map, the week, the projection lookup
    // and its weakest-starter comparison), passed by name.
    export async function getWaiverInsights({ team1Players, lockedStarterIds, rosterMap, playerMap, season, currentWeek, scoringKey, getProjectedMean, compareAgainstWeakestStarter }) {
        // Same comparison as Lineup Insights above, pointed at available free agents instead
        // of your bench. Off by default (see the toggle in the Matchup Simulator card) since
        // it costs an extra round trip this function wouldn't otherwise make: free-agent
        // candidates come from a rankings file (a name and a rank -- no Sleeper id, no weekly
        // score history), so getting them into the same win-probability math as everyone else
        // here means resolving each one's Sleeper id and fetching their history separately,
        // rather than reusing the one batched history fetch already done above for your
        // roster and your opponent's.
        const waiverInsights = [];
        // What the waiver check actually did, so the results card can tell "nobody out there
        // beats your starters" apart from "the check never ran" -- an empty waiverInsights
        // list alone reads identically either way, which left people unsure whether the
        // toggle had done anything at all. Stays null while the toggle is off (nothing to
        // report). checkedCount counts only free agents that made it all the way through the
        // comparison (resolved to a Sleeper id, had score history, had an eligible starter
        // to measure against), so "checked N" never overstates the work.
        let waiverInsightsStatus = null;
        if (State.simSettings.waiverInsights) {
            // startersAllStarted / kickedOffCount let the empty-result message name the real
            // reason nothing was compared, now that already-started starters and free agents
            // are left out (see lockedStarterIds above and the candidates filter below).
            waiverInsightsStatus = {
                checkedCount: 0, positions: [], noRankings: false, noCandidates: false, failed: false,
                startersAllStarted: team1Players.length > 0 && team1Players.every(p => lockedStarterIds.has(p.id)),
                kickedOffCount: 0
            };
            const checkedPositions = new Set();
            try {
                if (State.rosRankings.length === 0 && State.marketRankings.length === 0) {
                    waiverInsightsStatus.noRankings = true;
                }
                const nameToIdIndex = await getCleanNameToIdIndex();
                // Rankings carry no positions; candidates get theirs from this lookup (or Market
                // data). Built here too since 3G, so it no longer depends on a Scout action having
                // run earlier in the page.
                await ensureSleeperPosByName();
                const topCandidates = getTopWaiverCandidatesByPosition(rosterMap, 3);
                // None at all means no unrostered ranked player could be given a position, before
                // any history or kickoff check -- the card says so instead of blaming those.
                waiverInsightsStatus.noCandidates = topCandidates.length === 0;
                const candidates = topCandidates
                    .map(c => ({ ...c, id: nameToIdIndex[c.cleanName] }))
                    .filter(c => c.id && !isExcludedFromSimulation(playerMap[c.id]))
                    // A free agent whose game has kicked off is locked on Sleeper until next
                    // week -- same "can't act on it" reasoning as the bench filter above.
                    .filter(c => {
                        if (!hasKickedOff({ team: (playerMap[c.id] || {}).team })) return true;
                        waiverInsightsStatus.kickedOffCount++;
                        return false;
                    });

                if (candidates.length > 0) {
                    const candidateIds = candidates.map(c => c.id);
                    const { blended: waiverHistory } = await getPlayerWeeklyScoreHistory(
                        candidateIds, season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
                    );

                    candidates.forEach(c => {
                        const weeklyScores = waiverHistory[c.id] || [];
                        if (weeklyScores.length === 0) return; // same "not enough history" bar as everyone else

                        const rawPlayer = playerMap[c.id] || {};
                        const faPos = rawPlayer.position || c.pos;
                        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean: getProjectedMean(c.id) });
                        const result = compareAgainstWeakestStarter(profile, faPos);
                        if (!result) return;

                        waiverInsightsStatus.checkedCount++;
                        checkedPositions.add(faPos);
                        if (result.winPct <= 50) return;

                        waiverInsights.push({
                            faName: c.name, faPos,
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
                // down the matchup simulation itself. The results card still says the check
                // didn't finish, rather than letting silence read as "no upgrades found".
                console.error('Waiver Insights failed:', err);
                waiverInsightsStatus.failed = true;
            }
            const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
            waiverInsightsStatus.positions = [...checkedPositions].sort((a, b) =>
                (POS_ORDER.indexOf(a) + 1 || 99) - (POS_ORDER.indexOf(b) + 1 || 99));
        }
        return { waiverInsights, waiverInsightsStatus };
    }
