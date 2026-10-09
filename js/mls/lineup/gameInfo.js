// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: the rest of the
// EARLY GAMES LOGIC section (unmarked): bye/kickoff/opponent badges, projected and final points,
// the lineup stats refresh, the next-lock countdown, the starter injury warning, and Sleeper's
// own starter list. Refactor 3D added toggleLockCountdown (the countdown card's expand toggle, which
// sat among the ranking-set code) at the end.
import { getSleeperMatchups } from '../../shared/api/sleeper.js';
import { getWeeklyProjections } from '../../shared/api/sleeperStats.js';
import { escapeHtml } from '../../shared/html.js';
import { showToast } from '../../shared/ui/toast.js';
import { LINEUP_PROJECTION_TTL_MS, LINEUP_STATS_TTL_MS } from '../constants.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { refreshGameTimes, State } from '../state.js';
import { getActiveLeague, isBestBallLeague, SIM_EXCLUDE_STATUSES } from '../helpers.js';
import { renderLineupUI, optimizeLineup } from '../main.js';
import { BYE_BADGE_HTML, INFO_ICON, WARNING_ICON, injuryBadgeMarkup, irSlotBadgeMarkup, kickoffBadgeMarkup } from '../badges.js';
import { lineupIssues } from './issues.js';

    // Returns a "BYE" badge only when the player's team is on a bye THIS week (per the
    // currently-known NFL week) -- not just whenever they have a bye scheduled at some point
    // this season. Returns "" (no badge) if the current week isn't known yet, rather than
    // guessing. Used alongside the "(##)" bye-week text so a roster/lineup card still shows the
    // raw week number for season-long planning either way. Both come from the shared bye table
    // (js/shared/data/byes.js) for Sleeper's current season, so neither shows until it's known.
    export function getByeBadgeHTML(team) {
        return isOnByeThisWeek(team) ? BYE_BADGE_HTML : "";
    }

    function isOnByeThisWeek(team) {
        return State.currentNflWeek != null && getByeWeek(team, State.currentNflSeason) === State.currentNflWeek;
    }

    // A player in your Sleeper IR slot (isReserve, set at sync; improvements S9): an "IR" badge styled
    // like TAXI, on Roster and Lineup rows. A small button: hovering shows what it means (title), and a
    // tap or click shows it as a toast (explainIrSlot), since phones have no hover.
    // On a starter row (opts.starting) the text says what to do: the optimizer may start a healthy
    // IR-slot player on purpose, as a prompt to activate him (owner's decision, S9 round 6).
    export function getIrSlotBadgeHTML(p, opts = {}) {
        if (!p || !p.isReserve) return "";
        const where = `In your IR slot on Sleeper${p.inj === 'IR' ? ', and on NFL injured reserve' : ''}.`;
        const tip = escapeHtml(opts.starting
            ? `${where} Move him to your active roster there to start him.`
            : `${where} A player there can't start until you move him out of it.`);
        return irSlotBadgeMarkup(tip);
    }

    // The red injury badge ("Q", "OUT", "IR"...). Left off when it would read "IR" beside the IR-slot
    // badge above: that one badge already says it.
    export function getInjuryBadgeHTML(p) {
        if (!p || !p.inj || (p.isReserve && p.inj === 'IR')) return "";
        return injuryBadgeMarkup(p.inj);
    }

    // A tap or click on an IR-slot badge: what it means, as a toast.
    export function explainIrSlot(badgeEl) {
        const text = badgeEl && badgeEl.dataset ? badgeEl.dataset.tip : '';
        if (text) showToast(text);
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
        if (isGameFinal(team)) return kickoffBadgeMarkup('Final', true);
        if (Date.now() >= kickoffMs) return kickoffBadgeMarkup('Started', true);
        const label = formatKickoffLabel(iso);
        if (!label) return "";
        return kickoffBadgeMarkup(label);
    }

    // True once a player's team has kicked off this week per State.gameTimesByTeam, false if
    // that game hasn't started yet OR we simply don't have kickoff data for them (never assume
    // a game has started without evidence -- see refreshGameTimes' graceful-degradation notes).
    export function hasKickedOff(player) {
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
    export function gameStatusMayBeStale() {
        if (Date.now() - State.gameTimesFetchedAt < LINEUP_STATS_TTL_MS) return false;
        return Object.keys(State.gamesByTeam).some(team => State.gamesByTeam[team].state !== 'post' && hasKickedOff({ team }));
    }

    // Sleeper's projection key for a league's scoring format. Only reception scoring is
    // distinguished (matching how league.pprVal is derived at sync time) -- bonus/premium
    // scoring such as TE premium isn't reflected in Sleeper's precomputed pts_* fields.
    export function getLeagueScoringKey(league) {
        return league.pprVal === 1 ? 'pts_ppr' : (league.pprVal === 0.5 ? 'pts_half_ppr' : 'pts_std');
    }

    // True once Sleeper's weekly projections (State.lineupProjections, loaded by
    // refreshLineupStats) are in hand for the current NFL week.
    export function lineupProjectionsLoaded() {
        const proj = State.lineupProjections;
        return State.currentNflWeek != null && proj.week === State.currentNflWeek && !!proj.data;
    }

    // Sleeper's projected points for this player this week in the league's scoring format, or
    // null if projections aren't loaded yet or Sleeper doesn't project this player.
    export function getLineupProjection(playerId, league) {
        if (!lineupProjectionsLoaded() || !league) return null;
        const row = State.lineupProjections.data[playerId];
        const val = row ? row[getLeagueScoringKey(league)] : undefined;
        return typeof val === 'number' ? val : null;
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
    export function getGameInfoHTML(team) {
        const badge = getKickoffBadgeHTML(team);
        if (!badge) return "";
        return `<span class="mls-game-info">${badge}${getOpponentHTML(team)}</span>`;
    }

    // The single points figure shown at the right of a Lineup row: Sleeper's projection until the
    // player's game is final, then the real score with the projection kept alongside for
    // comparison. Deliberately no in-progress score -- see refreshLineupStats. Returns "" when
    // there's nothing meaningful to show (bye, free agent, projections not loaded yet), and a
    // dash when projections did load but Sleeper doesn't project this player.
    export function getPlayerPointsHTML(p) {
        const week = State.currentNflWeek;
        if (week == null || !p.team || p.team === "FA" || getByeWeek(p.team, State.currentNflSeason) === week) return "";

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
            return `<div class="mls-pts" title="Sleeper's projection for this week. The optimizer uses your rankings; this only breaks a FLEX decision when neither player has a FLEX rank."><span class="mls-pts-main">${fmt(projVal)}</span><span class="mls-pts-sub">proj</span></div>`;
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
    export function refreshLineupStats() {
        if (State.lineupStatsRefreshing) return;
        const league = getActiveLeague();
        const week = State.currentNflWeek;
        if (!league || !league.leagueId || week == null) return;

        // This league's lineup was optimized before projections loaded, so its FLEX picks
        // couldn't use the projection fallback (see compareFlexCandidates). Now that they're
        // here, recompute once -- same full recompute a Sleeper sync does, so locks and
        // manual swaps (which lock) are preserved. optimizeLineup clears the flag and
        // re-renders, which calls back in here with nothing left to redo.
        if (State.projectionlessLineups.has(league.leagueId) && lineupProjectionsLoaded()) {
            State.projectionlessLineups.delete(league.leagueId); // cleared first so this can never loop
            optimizeLineup(true);
            return;
        }

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
    export function getNextLockCountdownHTML(starters) {
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
        const clockSvg = `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

        if (lockingPlayers.length <= 1) {
            const p = lockingPlayers[0];
            return `<div class="lineup-lock-countdown">
                ${clockSvg}
                <span>Next lock: <strong>${escapeHtml(p.name)}</strong> &middot; ${label} <span class="lineup-lock-countdown-time">(in ${countdownStr})</span></span>
            </div>`;
        }

        const namesHTML = lockingPlayers.map(p => escapeHtml(p.name)).join(', ');
        const chevronSvg = `<svg aria-hidden="true" class="chevron-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        return `<div id="lockCountdownCard" class="lineup-lock-countdown-collapsible">
            <button type="button" class="lock-countdown-header btn-bare" data-action="toggleLockCountdown" aria-expanded="false" aria-controls="lockCountdownDetail">
                ${clockSvg}
                <span>Next lock: <strong>${lockingPlayers.length} players</strong> &middot; ${label} <span class="lineup-lock-countdown-time">(in ${countdownStr})</span></span>
                ${chevronSvg}
            </button>
            <div class="lock-countdown-detail" id="lockCountdownDetail">${namesHTML}</div>
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
    //
    // Which starters it names comes from getLineupIssues below, the rule the Dashboard's list after
    // Optimize All shares (improvements S11).
    export function getLineupInjuryWarningHTML(starters, league) {
        const flagged = getLineupIssues(starters, league).injured;
        if (flagged.length === 0) return "";

        const warnSvg = WARNING_ICON;

        if (flagged.length === 1) {
            const p = flagged[0];
            return `<div class="lineup-injury-warning">
                ${warnSvg}
                <span><strong>${escapeHtml(p.name)}</strong> is <strong>${escapeHtml(p.inj)}</strong> and currently in your starting lineup - consider swapping in a bench player.</span>
            </div>`;
        }

        const namesHTML = flagged.map(p => `${escapeHtml(p.name)} (${escapeHtml(p.inj)})`).join(', ');
        return `<div class="lineup-injury-warning">
            ${warnSvg}
            <span><strong>${flagged.length} starters</strong> are Doubtful, Out, IR, or otherwise unlikely to play: ${namesHTML} - consider swapping them out.</span>
        </div>`;
    }

    // The optimizer can start a healthy player who's in your Sleeper IR slot (isReserve): the owner
    // kept that on purpose, as the app's prompt to activate him (improvements S9, round 6). Sleeper
    // won't start him until he's moved to the active roster, so this line says so above the lineup,
    // where it can't be missed. Same rules as the injury warning above: not in Best Ball, and not
    // once his game has kicked off (nothing left to change). Manual leagues have no IR slot.
    export function getLineupIrSlotWarningHTML(starters, league) {
        const flagged = getLineupIssues(starters, league).irSlot;
        if (flagged.length === 0) return "";
        const infoSvg = INFO_ICON;
        const names = flagged.map(p => `<strong>${escapeHtml(p.name)}</strong>`);
        const who = names.length === 1 ? names[0]
            : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const text = flagged.length === 1
            ? `${who} is in your IR slot on Sleeper. Move him to your active roster there before kickoff to start him.`
            : `${who} are in your IR slot on Sleeper. Move them to your active roster there before kickoff to start them.`;
        return `<div class="lineup-injury-warning lineup-ir-warning">
            ${infoSvg}
            <span>${text}</span>
        </div>`;
    }

    // What on a lineup needs you before kickoff: injured starters, starters in your Sleeper IR slot,
    // starters on bye and empty starting slots (js/mls/lineup/issues.js, improvements S11). The two
    // warnings above read the first two; the Dashboard's list after Optimize All and Sync All reads all
    // four, for every league, from State.manualStartersMap. Nothing in Best Ball; a player whose game has
    // kicked off is left out (nothing left to change).
    export function getLineupIssues(starters, league) {
        return lineupIssues(starters, {
            bestBall: isBestBallLeague(league),
            outStatuses: SIM_EXCLUDE_STATUSES,
            kickedOff: hasKickedOff,
            onBye: p => isOnByeThisWeek(p.team),
        });
    }

    // Sleeper's own snapshot of who's actually starting, as of the last sync -- the ground
    // truth for "did this player actually get started in real life" once their game has
    // kicked off, independent of anything this app previously recommended. Shared by
    // renderLineupUI (the "matches Sleeper" banner / per-player mismatch badges) and
    // optimizeLineup (auto-lock, below) so both read the exact same filtered list.
    // Best Ball returns [] on purpose. Nobody sets a lineup in Best Ball, so the `starters`
    // array Sleeper keeps on the roster isn't a lineup decision -- and in practice it can be
    // stale or incomplete (a Best Ball DEF that played and scored still showed "Bench in
    // Sleeper" and never auto-locked). Treating it as ground truth there caused three wrong
    // things at once: the "Bench in Sleeper"/"Starting in Sleeper" badges, the "Differs from
    // Sleeper lineup" banner, and auto-lock skipping that player. With [] every consumer
    // takes its existing "no Sleeper starter data" path: no badges or banner, and auto-lock
    // falls back to this app's own previous lineup (see isSleeperStarter in optimizeLineup).
    // The Dashboard matrix already shows Best Ball as "BB" instead of a match/differs icon.
    export function getValidSleeperStarterIds(league) {
        if (isBestBallLeague(league)) return [];
        return (league && league.sleeperStarters) ? league.sleeperStarters.filter(id => id && id !== "0") : [];
    }


    export const toggleLockCountdown = function() {
        const card = document.getElementById('lockCountdownCard');
        if (!card) return;
        const nowExpanded = card.classList.toggle('expanded');
        const header = card.querySelector('.lock-countdown-header');
        if (header) header.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
    };
