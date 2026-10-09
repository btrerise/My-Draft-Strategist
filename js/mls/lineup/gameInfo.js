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
import { KEYS } from '../../shared/storage/keys.js';
import { refreshGameTimes, State } from '../state.js';
import { getActiveLeague, isBestBallLeague, SIM_EXCLUDE_STATUSES } from '../helpers.js';
import { renderLineupUI, optimizeLineup } from '../main.js';
import { BYE_BADGE_HTML, INFO_ICON, WARNING_ICON, injuryBadgeMarkup, irSlotBadgeMarkup, kickoffBadgeMarkup } from '../badges.js';
import { lineupIssueItems, lineupIssues, sleeperLineupChanges, statusPhrase } from './issues.js';

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
    export function formatKickoffLabel(iso) {
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

    // --- WHAT THIS LINEUP NEEDS FROM YOU (improvements S11) ---
    // One box above the Lineup tab's lineup, in place of three lines it replaces (owner's choice, S11 round 4):
    // the red injured-starter warning (a starter who's Doubtful, Out, IR... is worth saying so), the purple IR-slot
    // reminder (S9 round 6: the optimizer may start a healthy IR-slot player on purpose, as the prompt to activate
    // him) and the amber "Differs from Sleeper lineup" line. Its items are the Dashboard box's, from the same rule
    // (getLineupIssues / lineupIssueItems), with the same colors and buttons: "Justin Jefferson is Doubtful: start
    // Puka Nacua instead? [Swap in Puka Nacua]", "Derrick Henry is Out: no healthy RB on your bench [Find RB]",
    // "Activate Ja'Marr Chase from IR on Sleeper before kickoff". A starter you locked in shows muted. The Sleeper
    // differences fold up at the bottom.
    //
    // Unchanged from the warnings it replaces: nothing in Best Ball (no lineup to set), and nothing about a player
    // whose game has kicked off (his spot is locked; his row says Started or Final). The lineup PNG leaves the
    // whole box out (js/mls/trade/export.js): it's for you, not the league chat (S9 round 7).
    export function getLineupNeedsHTML(starters, league, bench = []) {
        const items = lineupIssueItems(getLineupIssues(starters, league, bench));
        const sleeper = getSleeperLineupChanges(league, starters);
        if (items.length === 0 && !sleeper) return "";

        const leagueId = escapeHtml(league ? league.leagueId : '');
        const itemHTML = items.map(i => {
            let button = '';
            if (i.swap) {
                button = ` <button type="button" class="btn btn-secondary mls-btn-sm lineup-needs-btn" data-action="swapInSuggested" data-out="${escapeHtml(i.swap.out.id)}" data-in="${escapeHtml(i.swap.in.id)}">Swap in ${escapeHtml(i.swap.in.name)}</button>`;
            } else if (i.find) {
                const label = i.find === 'ALL' ? 'Find players' : `Find ${i.find}`;
                button = ` <button type="button" class="btn btn-secondary mls-btn-sm lineup-needs-btn" data-action="findLeaguePlayers" data-league-id="${leagueId}" data-pos="${escapeHtml(i.find)}">${label}</button>`;
            }
            return `<li class="lineup-needs-item is-${i.kind}">${escapeHtml(i.text)}${button}</li>`;
        }).join('');

        const counted = items.filter(i => !i.muted && !i.note).length;
        const title = counted > 0 ? 'This lineup needs you'
            : items.length > 0 ? 'Nothing needs you before kickoff' : 'Set this lineup on Sleeper';
        // Re-renders are frequent (every swap and lock); keep the fold as the person left it.
        const wasOpen = !!document.querySelector('#optimalLineupContainer .lineup-needs-sleeper[open]');
        const n = sleeper ? sleeper.start.length + sleeper.bench.length : 0;
        const fold = !sleeper ? '' : `
            <details class="mls-change-fold lineup-needs-sleeper"${wasOpen ? ' open' : ''}>
                <summary>${FOLD_CHEVRON}<span>Differs from your Sleeper lineup: ${n} change${n === 1 ? '' : 's'}</span></summary>
                <p class="lineup-needs-sleeper-text">${sleeperChangesHTML(sleeper)}</p>
                <p class="lineup-needs-note">As of your last sync: set it on Sleeper, then sync to clear this.</p>
            </details>`;
        // Collapsible, and remembered (owner's choice, S11 round 6): someone who won't follow a tip can fold the box
        // to its title line, which still counts what's open ("This lineup needs you · 3"), so a new problem shows.
        const collapsed = !!State.lineupNeedsCollapsed;
        const countText = counted > 0 ? ` · ${counted}` : '';
        return `<div class="lineup-needs-box${counted > 0 ? ' has-problems' : ''}${collapsed ? ' is-collapsed' : ''}">
            <button type="button" class="btn-bare lineup-needs-title" data-action="toggleLineupNeeds" aria-expanded="${collapsed ? 'false' : 'true'}">${counted > 0 ? WARNING_ICON : INFO_ICON}<span>${title}${collapsed ? countText : ''}</span>${FOLD_CHEVRON}</button>
            ${collapsed ? '' : `${items.length ? `<ul class="lineup-needs-list">${itemHTML}</ul>` : ''}${fold}`}
        </div>`;
    }

    // The box's title line: fold it to that line, or open it again. Remembered across visits (KEYS.mls.lineupNeedsCollapsed).
    export function toggleLineupNeeds() {
        State.lineupNeedsCollapsed = !State.lineupNeedsCollapsed;
        try {
            if (State.lineupNeedsCollapsed) localStorage.setItem(KEYS.mls.lineupNeedsCollapsed, '1');
            else localStorage.removeItem(KEYS.mls.lineupNeedsCollapsed);
        } catch (e) { /* storage blocked: it still folds for this visit */ }
        renderLineupUI();
    }

    // The "What changed?" card's fold chevron (js/mls/rankings/changeSummary.js), for the Sleeper fold here and on
    // the Dashboard.
    export const FOLD_CHEVRON = `<svg class="mls-change-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    // Your lineup here against the one on Sleeper as of the last sync: { start: [names], bench: [names] }, or null
    // when they match or there's nothing to compare (Best Ball, manual leagues, no lineup yet). A benched name
    // carries his status when he's unlikely to play ("Derrick Henry (Out)"): the Global Injury Auditor's "injured
    // starter in your Sleeper lineup", which this replaces (S11 round 4). Shared with the Dashboard box; the
    // Command Center's Lineup column uses the same comparison (sleeperLineupChanges), so they agree.
    export function getSleeperLineupChanges(league, starters) {
        const sleeperIds = getValidSleeperStarterIds(league);
        const optimized = (starters || []).filter(s => s && s.player);
        if (sleeperIds.length === 0 || optimized.length === 0) return null;
        const changes = sleeperLineupChanges(optimized.map(s => s.player.id), sleeperIds);
        if (changes.start.length === 0 && changes.bench.length === 0) return null;
        const playerOf = (id) => (optimized.find(s => s.player.id === id) || {}).player || ((league && league.roster) || []).find(p => p.id === id) || null;
        const label = (id) => {
            const p = playerOf(id);
            if (!p) return 'Unknown player';
            const hurt = SIM_EXCLUDE_STATUSES.includes(p.inj) ? ` (${statusPhrase(p.inj).replace(/^is /, '')})` : '';
            return `${p.name}${hurt}`;
        };
        return { start: changes.start.map(label), bench: changes.bench.map(label) };
    }

    // "Start Ja'Marr Chase · Bench Garrett Wilson, Derrick Henry (Out)", names kept whole.
    export function sleeperChangesHTML(changes) {
        const names = (list) => list.map(n => escapeHtml(n).replace(/ /g, '&nbsp;')).join(', ');
        const parts = [];
        if (changes.start.length) parts.push(`Start ${names(changes.start)}`);
        if (changes.bench.length) parts.push(`Bench ${names(changes.bench)}`);
        return parts.join('<span class="mls-needs-sep"> · </span>');
    }

    // Whether you locked him in this league: a lock, or a swap (which locks). Your call, so the boxes show him muted.
    const isKeptStarter = (league, p) => !!(league && p && (State.lockedPlayersMap[league.leagueId] || []).includes(p.id));

    // What on a lineup needs you before kickoff (js/mls/lineup/issues.js, improvements S11), with the State-backed
    // parts filled in: statuses, kickoffs, this week's byes, your locks, and the league's IR rules and roster size
    // (recorded at a Sleeper sync since round 4). The Lineup tab's box above and the Dashboard's box both read it.
    export function getLineupIssues(starters, league, bench = []) {
        return lineupIssues(starters, {
            bestBall: isBestBallLeague(league),
            outStatuses: SIM_EXCLUDE_STATUSES,
            kickedOff: hasKickedOff,
            onBye: p => isOnByeThisWeek(p.team),
            kickoffMs: p => {
                const iso = p && p.team ? State.gameTimesByTeam[p.team] : null;
                return iso ? new Date(iso).getTime() : NaN;
            },
            kept: p => isKeptStarter(league, p),
            irRules: league ? league.irRules || null : null,
            rosterSize: league ? league.rosterSize : null,
            roster: league ? league.roster || [] : [],
            // Manual leagues' names Sync All couldn't match, still on the roster (lineup/issues.js).
            unmatched: league && league.injuryUnmatched
                ? league.injuryUnmatched.filter(n => (league.roster || []).some(p => p.name === n)) : [],
        }, bench);
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
