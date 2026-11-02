// --- THIS WEEK: EVERY LEAGUE'S MATCHUP, LIVE (improvements S21) ---
// From the owner's weekly recap skill, drawn in three places (owner's plan, round 6):
// - the Scoreboard tab (#thisWeekCard): "Week 7 Recap" ("Week 7 Matchups" before kickoff), "Record 9–6", how many
//   matchups are still in play, Provisional / Final, an info tooltip and Refresh; the record split paid / free (the
//   "$ Paid" switch in the Dashboard's Edit mode, saved on the league) and redraft / dynasty (keeper and guillotine count with redraft);
//   "Still in play": the swing matchups, most uncertain first, with both scores, the margin, your win chance from the
//   Matchup Simulator's math (sim/winChance.js) and the live players on each side; "Effectively decided" on one line;
//   then every league as a tile, closest first (a guillotine league's tile: your score against the chop line), and
//   leagues with no matchup this week, manual leagues and any league whose matchups didn't load;
// - the Dashboard (#weekSummaryLine): that header in one line, which opens the Scoreboard;
// - the Lineup tab (#lineupMatchupStrip): the active league's matchup, which opens the Scoreboard too.
// The rules (who's live, what's a swing) are in week/scoreboard.js.
//
// Owner's choices (S21): it loads when the Scoreboard, the Dashboard or the Lineup tab opens (reusing what it loaded in
// the last 2 minutes) and with Refresh, never on a timer: run it before SNF, before MNF and after MNF. Matchups stay in
// memory.
// The week (S28, the owner's choice): arrows around the Scoreboard's title ("‹ Week 7 Recap ›") step back to earlier
// weeks, each loaded with its own scoreboard and matchups (nothing else in the app changes), and kept 2 minutes like
// this week's. A past week is final. The choice is in memory and lasts until you leave the Scoreboard tab; the
// Dashboard's line and the Lineup strip stay on this week. /lineup/?week=6 still opens it on week 6 (the tests use it),
// with a line saying so.
//
// Data: one GET /v1/league/<id>/matchups/<week> per Sleeper league, five at a time, for Sleeper's current `week`.
// They go into State.lineupActualPoints, the Lineup tab's per-league, per-week cache (lineup/gameInfo.js), widened to
// hold the whole response, so each fetch serves both. Team names, the league-median flag and guillotine come from
// the league (saved at sync since S21); a league synced before then reads them from Sleeper once per visit.
import { escapeHtml } from '../../shared/html.js';
import { KEYS } from '../../shared/storage/keys.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { mdsFetch } from '../../shared/net.js';
import { getSleeperLeague, getSleeperLeagueRosters, getSleeperLeagueUsers, getSleeperMatchups, getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { getLiveWeekStats, getWeeklyProjections } from '../../shared/api/sleeperStats.js';
import { State, parseEspnScoreboard, refreshGameTimes } from '../state.js';
import { isBestBallLeague, isExcludedFromSimulation } from '../helpers.js';
import { fantasyPosition } from '../constants.js';
import { ensureLineupProjections, formatKickoffLabel, getLeagueScoringKey, storeLeagueMatchups } from '../lineup/gameInfo.js';
import { ROOT_ICONS, paidBadgeMarkup, rootCountBadgeMarkup, rootShareMarkup, rootSplitBadgeMarkup, weekResultMarkup, weekStatusMarkup } from '../badges.js';
import { playerHeadshotHTML } from '../lineup/headshots.js';
import { buildRootFor, sideOrder, starterIdsOf } from './rootFor.js';
import { matchupWinChances } from '../sim/winChance.js';
import { RECAP_SCALES, buildPlayerRecap, ownText, pointsRange, slotLabel, startedText } from './playerRecap.js';
import { getRecapLines } from './recapLines.js';
import { scoreboardImageHTML } from './shareImage.js';
import { ensureHtml2Canvas } from '../../shared/ui/scriptLoader.js';
import { useProportionalDigits } from '../../shared/ui/exportImage.js';
import { canViewTransition, withViewTransition } from '../../shared/ui/viewTransition.js';
import { showToast } from '../../shared/ui/toast.js';
import {
    MIN_PLAYED, classifyMatchup, guillotinePlace, isGuillotine, medianPlace, ordinal, playsMedian, recordText, resultOf,
    leagueDirection, sideSummary, stepWeek, summarize, swingOrder, teamNamesFrom, tooEarlyToCall, weekFromSearch,
} from './scoreboard.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';

const FRESH_MS = 2 * 60 * 1000;
// How many matchups "Still in play" lists before "Show all".
const SWINGS_SHOWN = 5;
const PARALLEL = 5;
const isSleeperLeague = (l) => l && l.leagueId && !/^(manual|handoff)_/.test(l.leagueId);
const REFRESH_ICON = (spin) => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${spin ? ' class="sync-spinner"' : ''}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg>`;
// Short labelled lines, not one paragraph (owner, after the Thursday-night pass: on a phone it filled the screen).
const TOOLTIP = [
    'Your matchup in every Sleeper league this week, from Sleeper\'s live scores.',
    '<strong>Record:</strong> how each head-to-head matchup stands, once at least 4 players a side have played. Grouped Paid / Free (mark paid leagues with "$ Paid" under Edit on the Dashboard), Redraft / Dynasty (keeper counts as Redraft) and, for dynasty and keeper, Competing / Rebuilding (the Roster tab\'s "I\'m competing this year"). A guillotine league has no opponent, so it isn\'t in it.',
    '<strong>Median:</strong> your record against the league median, in the leagues that play one.',
    '<strong>Still in play:</strong> the side that\'s behind can still turn it around; your chance to win is the Matchup Simulator\'s (none for Best Ball).',
    '<strong>Effectively decided:</strong> the side that\'s behind has nobody left, or too little.',
    // S22 round 6: a Best Ball tile can differ from the Sleeper app during the week (round 5 scores the lineup it would pick).
    // Kept short (round 8): a closed tooltip still takes up layout, and a longer tip stretched the short pre-kickoff page.
    '<strong>Best Ball:</strong> scored by the lineup Best Ball would pick from the points so far, so it can differ from the Sleeper app until Sleeper sets it.',
    // S27: Who to root for's weights, short (see the Best Ball line's note on a closed tooltip's layout).
    '<strong>Who to root for:</strong> a paid league counts 1.5 times, a close matchup more than a lopsided one, and a player more the bigger his share of his side\'s points still to come.',
    '<strong>Provisional</strong> until the week\'s last game is final. Tap a league to open its lineup; tap Refresh for the latest.',
].join('<br><br>');

// --- What this card last loaded (in memory) ---
// loads: per week, when it last loaded and which leagues' fetches failed then. chances: the swing matchups' win chances,
// for chancesWeek only. chosen: the week picked with the Scoreboard's arrows (S28), null for this week.
const view = { loads: new Map(), loading: null, chances: new Map(), chancesWeek: null, chancesKey: '', allSwingsWeek: null, chosen: null, lastBody: null,
    // S27: the win chances of the open matchups that aren't in Still in play (before kickoff, too early to call), for the
    // root-for board's weights only; and a row to focus after the next draw (Show all).
    boardChances: new Map(), boardChancesWeek: null, boardKey: '', focusNext: null };
const failedFor = (week) => (view.loads.get(week) || {}).failed || new Map();
const chanceOf = (ctx, leagueId) => view.chancesWeek === ctx.week ? view.chances.get(leagueId) : undefined;
// Each week's player stats from Sleeper (S22, round 8): each player's points on the MVPs & LVPs scale, loaded with the
// matchups (and again with them), in memory only.
const weekStats = new Map();
// Leagues synced before S21: their names, median and guillotine flags, read from Sleeper once per visit.
const metaCache = new Map();
// Weeks other than the app's current one (the recap week until Wednesday, a week chosen with the arrows, or the
// address's ?week=), each with its own scoreboard, projections and matchups once loaded. Their matchups stay out of
// State.lineupActualPoints, the Lineup tab's cache for the current week, so the two tabs don't keep replacing each
// other's; and one per week (S28), so stepping back a week doesn't drop the recap week the Dashboard shows.
const otherWeeks = new Map();
const otherWeek = (week) => {
    if (!otherWeeks.has(week)) otherWeeks.set(week, { times: {}, games: {}, projections: null, matchups: new Map() });
    return otherWeeks.get(week);
};

// The week a view shows and what it reads about it. This week: the recap week (Sleeper's display_week, which stays on
// last week through Tuesday; State.recapNflWeek), or the address's week. The Scoreboard (scoreboard: true) shows the
// week chosen with its arrows instead, when there is one. When the week isn't the app's current one, it reads its own
// (otherWeeks) instead of the Lineup tab's. past: before the recap week, so final (S28). last: the latest week the
// arrows reach.
function weekCtx({ scoreboard = true } = {}) {
    const asked = typeof location !== 'undefined' ? weekFromSearch(location.search) : null;
    const season = State.currentNflSeason;
    const live = State.currentNflWeek;
    const current = State.recapNflWeek ?? live;
    const home = asked ?? current;
    const target = scoreboard && view.chosen != null ? view.chosen : home;
    // The latest week the arrows reach: this week's recap, or the app's own week when that's ahead of it (S28 round 3:
    // on Tuesday › shows next week's matchups, which the Lineup tab is already on), or the address's week if later.
    const last = current == null ? null : Math.max(current, live ?? 0, asked ?? 0);
    const about = { season, asked: asked != null && target === asked, past: target != null && current != null && target < current, last, chosen: target !== home };
    if (target != null && live != null && target !== live) {
        const o = otherWeeks.get(target);
        return { ...about, week: target, times: o ? o.times : {}, games: o ? o.games : {}, projections: o ? o.projections : null, other: true };
    }
    const week = live;
    return {
        ...about, week, times: State.gameTimesByTeam, games: State.gamesByTeam,
        projections: State.lineupProjections.week === week ? State.lineupProjections.data : null, other: false,
    };
}
const kickedOff = (ctx, team) => {
    const ms = team && ctx.times[team] ? new Date(ctx.times[team]).getTime() : NaN;
    return !isNaN(ms) && Date.now() >= ms;
};

// Another week's ESPN scoreboard and Sleeper projections (the app's own are for the current week). A past week has no
// win chances, so no projections (S28).
async function loadOtherWeek(week, season, past) {
    const o = otherWeek(week);
    try {
        const res = await mdsFetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`);
        const parsed = parseEspnScoreboard(res.ok ? await res.json() : null);
        if (parsed) { o.times = parsed.map; o.games = parsed.games; }
    } catch (e) { /* game states stay unknown: everyone counts as live (a past week still reads Final), and the card says so */ }
    if (past) return;
    try { o.projections = (await getWeeklyProjections(season, week)) || null; } catch (e) { /* no win chances */ }
}

function leagueMeta(l) {
    if (l.teamNames && typeof l.medianMatch === 'boolean') {
        return Promise.resolve({ teamNames: l.teamNames, median: l.medianMatch, guillotine: !!l.guillotine });
    }
    if (metaCache.has(l.leagueId)) return metaCache.get(l.leagueId);
    const p = Promise.all([getSleeperLeague(l.leagueId), getSleeperLeagueUsers(l.leagueId), getSleeperLeagueRosters(l.leagueId)])
        .then(([data, users, rosters]) => ({ teamNames: teamNamesFrom(users, rosters), median: playsMedian(data && data.settings), guillotine: isGuillotine(data && data.settings) }))
        .catch(() => { metaCache.delete(l.leagueId); return { teamNames: {}, median: null, guillotine: null }; });
    metaCache.set(l.leagueId, p);
    return p;
}

// fn over items, at most `limit` at a time.
async function eachLimited(items, limit, fn) {
    let next = 0;
    const run = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

// --- Reading a matchup ---
const pointsOf = (e) => typeof e.custom_points === 'number' ? e.custom_points : (Number(e.points) || 0);
const starterIds = (e) => (e.starters || []).filter(id => id && id !== '0');

function playerInfo(id, entry, ctx) {
    const p = ctx.playerMap[id] || {};
    const pos = fantasyPosition(p) || p.position || '';
    const team = p.team || (pos === 'DEF' ? id : null);
    const name = p.first_name ? `${p.first_name} ${p.last_name}`.trim() : (p.last_name || p.full_name || (pos === 'DEF' ? `${id} DEF` : id));
    const pts = entry.players_points ? entry.players_points[id] : undefined;
    const proj = ctx.projections && ctx.projections[id] ? ctx.projections[id][ctx.scoringKey] : undefined;
    return {
        id, name, pos, team,
        points: typeof pts === 'number' ? pts : 0,
        gameState: team && ctx.games[team] ? ctx.games[team].state : null,
        onBye: !!team && ctx.week != null && getByeWeek(team, ctx.season) === ctx.week,
        out: isExcludedFromSimulation(p),
        // For the win chance, the Simulator's rule: his points so far once his game has kicked off, plus the rest of
        // his game while it's still being played (shareLeft, sim/stats.js).
        actual: typeof pts === 'number' && kickedOff(ctx, team) ? pts : null,
        shareLeft: team && ctx.games[team] && ctx.games[team].state === 'in' && typeof ctx.games[team].left === 'number' ? ctx.games[team].left : 0,
        projected: typeof proj === 'number' ? proj : null,
    };
}

// One league's line. Kinds: 'h2h', 'guillotine', 'nomatch' (no opponent this week), 'missing' (your team isn't in it).
function leagueResult(l, matchups, meta, base) {
    const mine = matchups.find(m => m.roster_id === l.rosterId);
    if (!mine) return { kind: 'missing' };
    const ctx = { ...base, scoringKey: getLeagueScoringKey(l) };
    const bestBall = isBestBallLeague(l);
    // Best Ball (S22 round 5): Sleeper sets its lineup after the games, so during the week a team's `points` are the
    // lineup as it was left (the owner's Legacy Best Ball read −73.8 with a 17.6 TE on the bench behind a 0.0). With the
    // league's slot order (saved at sync since S22), each team's lineup and score are the ones Best Ball would pick from
    // the points so far, as Sleeper will once the games are over. Without it, Sleeper's as they stand.
    const slots = bestBall && Array.isArray(l.starterSlots) && l.starterSlots.length ? l.starterSlots : null;
    const posOf = (id) => { const p = ctx.playerMap[id]; return p ? (fantasyPosition(p) || p.position || null) : (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : null); };
    const ptsOf = (e, id) => { const v = (e.players_points || {})[id]; return typeof v === 'number' ? v : 0; };
    const lineupOf = (e) => slots && (e.starters || []).length === slots.length
        ? starterIdsOf(e, { bestBall: true, slots, posOf })
        : null;
    const scoreOf = (e) => { const lu = lineupOf(e); return lu ? Math.round(lu.reduce((t, id) => t + ptsOf(e, id), 0) * 100) / 100 : pointsOf(e); };
    const side = (e) => {
        const starters = lineupOf(e) || starterIds(e);
        return sideSummary({
            points: scoreOf(e), bestBall,
            starters: starters.map(id => playerInfo(id, e, ctx)),
            bench: bestBall ? (e.players || []).filter(id => !starters.includes(id)).map(id => playerInfo(id, e, ctx)) : [],
        });
    };
    const guillotine = meta.guillotine != null ? meta.guillotine
        : (matchups.length > 2 && new Set(matchups.map(m => m.matchup_id)).size === matchups.length);
    if (guillotine) {
        const me = side(mine);
        const alive = (e) => (e.players || []).length > 0;
        return { kind: 'guillotine', me, place: guillotinePlace(me.points, matchups.map(e => ({ points: scoreOf(e), alive: alive(e) })), alive(mine)) };
    }
    const opp = mine.matchup_id == null ? null : matchups.find(e => e.matchup_id === mine.matchup_id && e.roster_id !== mine.roster_id);
    // No opponent this week (a median-only league): your side still counts on the root-for board (S27).
    if (!opp) return { kind: 'nomatch', me: side(mine) };
    const me = side(mine), them = side(opp);
    const m = classifyMatchup(me, them);
    return {
        kind: 'h2h', me, them, ...m, result: resultOf(m), early: tooEarlyToCall(me, them, m.status), bestBall, scoringKey: ctx.scoringKey,
        oppName: (meta.teamNames && meta.teamNames[opp.roster_id]) || 'Opponent',
        median: meta.median ? medianPlace(me.points, matchups.map(scoreOf)) : null,
    };
}

// --- Loading ---
// A league's cached matchups for a week: the Lineup tab's cache for the current week, this card's own for any other.
const cachedFor = (l, week) => {
    const c = week === State.currentNflWeek ? State.lineupActualPoints[l.leagueId] : (otherWeeks.get(week)?.matchups.get(l.leagueId));
    return c && c.week === week && Array.isArray(c.matchups) ? c : null;
};
const hasWeek = (l, week) => !!cachedFor(l, week);

// Called when the Dashboard is shown (render/leagueCards.js) and by Refresh (force). Draws at once from what's
// loaded, fetches what's older than FRESH_MS (everything, with force), draws again, then adds the win chances.
export function refreshThisWeek({ force = false } = {}) {
    const leagues = (State.leagues || []).filter(isSleeperLeague);
    const { week, season, other: isOther, past } = weekCtx();
    if (!leagues.length || week == null) { renderThisWeek(); return Promise.resolve(); }
    if (view.loading) return view.loading;
    // Loaded in the last 2 minutes, and every league has the week's matchups (or failed then): just redraw. A league
    // added since is fetched. Each week keeps its own 2 minutes (S28), so stepping back and forth doesn't fetch again.
    const load = view.loads.get(week);
    const allIn = leagues.every(l => hasWeek(l, week) || failedFor(week).has(l.leagueId));
    if (!force && allIn && load && Date.now() - load.loadedAt < FRESH_MS) {
        renderThisWeek();
        if (onScoreboard()) queued(addBoardChances); // opening the Scoreboard on matchups the Dashboard loaded (S27)
        return Promise.resolve();
    }

    view.loading = (async () => {
        await null; // view.loading is set before the first draw below, which shows the spinner
        try {
            // A scoreboard that has a game under way and is a minute old is fetched again (gameStatusMayBeStale).
            if (force) State.gameTimesFetchedAt = 0;
            await Promise.all([
                isOther ? loadOtherWeek(week, season, past) : Promise.all([refreshGameTimes(), ensureLineupProjections()]),
                getSleeperPlayerMap().catch(() => null),
                getLiveWeekStats(season, week).then(data => { weekStats.set(week, data); }),
            ]);
            const failed = new Map();
            await eachLimited(leagues, PARALLEL, async (l) => {
                const cached = cachedFor(l, week);
                const fresh = cached && cached.matchups.length && Date.now() - cached.fetchedAt < FRESH_MS;
                if (force || !fresh) {
                    try {
                        const got = await getSleeperMatchups(l.leagueId, week);
                        if (isOther) otherWeek(week).matchups.set(l.leagueId, { week, matchups: Array.isArray(got) ? got : [], fetchedAt: Date.now() });
                        else storeLeagueMatchups(l, week, got);
                    } catch (e) {
                        failed.set(l.leagueId, true);
                    }
                }
            });
            await resolveForDraw();
            view.loads.set(week, { loadedAt: Date.now(), failed });
        } finally {
            view.loading = null;
        }
        renderThisWeek();
        // A league added while this was loading, or another week chosen meanwhile, gets its turn now.
        const now = weekCtx().week;
        if (now !== week || (State.leagues || []).filter(isSleeperLeague).some(l => !hasWeek(l, week) && !failedFor(week).has(l.leagueId))) refreshThisWeek();
        if (now === week) { await queued(addWinChances); await queued(addBoardChances); }
    })().catch(err => { console.warn('This week: matchups did not load.', err); view.loading = null; renderThisWeek(); });
    renderThisWeek();
    return view.loading;
}

// One side's players as the Simulator takes them. On a bye: left out like Out (no projection, so he'd count at his season
// average; Sunday live check).
const simPlayers = (side) => side.starters.map(p => ({ id: p.id, pos: p.pos, team: p.team, actual: p.actual, shareLeft: p.shareLeft, projected: p.projected, excluded: p.out || p.onBye }));
// The win-chance runs share one worker (sim/winChance.js), so they take turns.
let simQueue = Promise.resolve();
const queued = (fn) => (simQueue = simQueue.then(fn, fn));

// The swing matchups' win chances, once per set of scores (a redraw with the same scores keeps them).
async function addWinChances() {
    const ctx = weekCtx();
    if (ctx.past) return; // a past week is final: nothing left to win (S28)
    const built = buildRows(ctx);
    if (!weekStarted(built.rows, ctx)) return;
    // Not for a matchup too early to call: a chance from one or two players' games says little (and saves the work).
    // Nor for Best Ball (round 12 replay): the Simulator plays the lineup Sleeper shows now, but in Best Ball anyone on
    // the bench with a game left can still replace a starter's score, so its number could be far off (49% here beside
    // 79.5% on the Lineup tab's card, for the same matchup). Those are ordered by the gap left instead (swingOrder).
    const swings = built.rows.filter(r => r.res.kind === 'h2h' && r.res.status === 'swing' && !r.res.early && !r.res.bestBall);
    const key = `${ctx.week}|` + swings.map(r => `${r.league.leagueId}:${r.res.me.points}:${r.res.them.points}:${r.res.me.live.length}:${r.res.them.live.length}`).join('|');
    if (!swings.length || key === view.chancesKey) return;
    view.chancesKey = key;
    view.chances = new Map(); // last scores' percents don't stay up beside new scores
    view.chancesWeek = ctx.week;
    try {
        view.chances = await matchupWinChances(swings.map(r => ({ key: r.league.leagueId, scoringKey: r.res.scoringKey, mine: simPlayers(r.res.me), theirs: simPlayers(r.res.them) })),
            { season: ctx.season, week: ctx.week });
    } catch (e) {
        view.chances = new Map();
    }
    renderThisWeek();
}

// The root-for board's stakes (S27, owner's choice) need a win chance for every open matchup, not just those in Still in
// play: before kickoff and while too early to call too, on the same Simulator runs Refresh already makes. Kept apart from view.chances, so the tiles and Still in play show
// exactly what they did before. Not Best Ball (the Simulator can't play its bench; S21) and not a past week.
// Only while the Scoreboard is open (where the board is): the Dashboard and the Lineup tab load the same matchups, and
// shouldn't start Simulator runs (and their score-history requests) for a board nobody is looking at.
const onScoreboard = () => !!document.getElementById('scoreboardTab')?.classList.contains('active');
async function addBoardChances() {
    const ctx = weekCtx();
    if (ctx.past || !onScoreboard()) return;
    const open = buildRows(ctx).rows.filter(r => r.res.kind === 'h2h' && r.res.status === 'swing' && !r.res.bestBall && chanceOf(ctx, r.league.leagueId) == null);
    const key = `${ctx.week}|` + open.map(r => `${r.league.leagueId}:${r.res.me.points}:${r.res.them.points}:${r.res.me.live.length}:${r.res.them.live.length}`).join('|');
    if (!open.length || key === view.boardKey) return;
    view.boardKey = key;
    let got;
    try {
        got = await matchupWinChances(open.map(r => ({ key: r.league.leagueId, scoringKey: r.res.scoringKey, mine: simPlayers(r.res.me), theirs: simPlayers(r.res.them) })),
            { season: ctx.season, week: ctx.week });
    } catch (e) {
        got = new Map();
    }
    view.boardChances = got;
    view.boardChancesWeek = ctx.week;
    if (got.size) renderThisWeek();
}
const boardChanceOf = (ctx, leagueId) => chanceOf(ctx, leagueId) ?? (view.boardChancesWeek === ctx.week ? view.boardChances.get(leagueId) : undefined);

// Every Sleeper league's result from the cache, in your league order.
function buildRows(ctx) {
    const week = ctx.week;
    const base = { week, season: ctx.season, playerMap: cachedPlayerMap || {}, projections: ctx.projections, games: ctx.games, times: ctx.times };
    const rows = [];
    (State.leagues || []).filter(isSleeperLeague).forEach(l => {
        const cached = cachedFor(l, week);
        const matchups = cached ? cached.matchups : null;
        // A league whose last fetch failed keeps any scores it had (the note under the list names it).
        if (failedFor(week).get(l.leagueId) && !matchups) { rows.push({ league: l, res: { kind: 'failed' } }); return; }
        if (!matchups) { rows.push({ league: l, res: { kind: 'pending' } }); return; }
        // Sleeper answers [] for a week the league had no games (S28: a week before the league started, say).
        if (!matchups.length) { rows.push({ league: l, res: { kind: 'empty' } }); return; }
        if (!l.rosterId) { rows.push({ league: l, res: { kind: 'missing' } }); return; }
        const meta = resolvedMeta.get(l.leagueId) || (l.teamNames ? { teamNames: l.teamNames, median: l.medianMatch ?? null, guillotine: l.guillotine ?? null } : { teamNames: {}, median: null, guillotine: null });
        rows.push({ league: l, res: leagueResult(l, matchups, meta, base) });
    });
    return { rows };
}

// The player map and each league's names, resolved after each load for the draws (which are synchronous).
let cachedPlayerMap = null;
const resolvedMeta = new Map();
async function resolveForDraw() {
    try { cachedPlayerMap = await getSleeperPlayerMap(); } catch (e) { /* names fall back to ids */ }
    await Promise.all((State.leagues || []).filter(isSleeperLeague).map(async l => {
        if (l.teamNames && typeof l.medianMatch === 'boolean') { resolvedMeta.delete(l.leagueId); return; }
        resolvedMeta.set(l.leagueId, await leagueMeta(l));
    }));
}

// The "mark the leagues you pay for" hint, until you dismiss it (owner, round 5) or mark one.
function paidHintDismissed() {
    try { return localStorage.getItem(KEYS.mls.paidHintDismissed) === '1'; } catch (e) { return false; }
}
// "Show all N" under the in-play list: every swing, until the week changes; then "Show less" folds it back (S27 round 2,
// owner: every Show all on the Scoreboard gets a way back). The button keeps focus across the redraw.
export function showAllSwings() {
    const week = weekCtx().week;
    view.allSwingsWeek = view.allSwingsWeek === week ? null : week;
    renderThisWeek();
}
// The button under a capped list: "Show all N" while capped, "Show less" once opened.
const moreButton = (action, list, total, cap, open) => total <= cap ? '' :
    `<button type="button" class="btn-bare mls-week-show-all" data-action="${action}"${list ? ` data-list="${escapeHtml(list)}"` : ''} data-focus-key="more|${escapeHtml(list || action)}" aria-expanded="${open}">${open ? 'Show less' : `Show all ${total}`}</button>`;
export function dismissPaidHint() {
    try { localStorage.setItem(KEYS.mls.paidHintDismissed, '1'); } catch (e) { /* hidden for this visit only */ }
    renderThisWeek();
}

// --- Drawing ---
const fmt = (n) => (Number(n) || 0).toFixed(1);
const signed = (n) => n > 0 ? `+${fmt(n)}` : (n < 0 ? `−${fmt(-n)}` : '0.0');
const leagueName = (l) => escapeHtml(l.name || 'Unnamed league');
const playerList = (players) => players.length
    ? players.map(p => `${escapeHtml(p.name)} <span class="mls-week-pos">${escapeHtml(p.pos)}</span>`).join(', ')
    : 'nobody left';
const liveOf = (side) => [...side.live, ...side.liveBench];
// What the side behind can still add (both sides' when level), for ordering a matchup with no win chance (swingOrder).
const trailReachOf = (res) => res.margin < 0 ? res.me.reach : (res.margin > 0 ? res.them.reach : Math.max(res.me.reach, res.them.reach));
// "54%", or "<1%" / ">99%" for a chance that rounds to 0 or 100 while it's still in play (someone mid-game: round 12).
const pctText = (c) => c < 0.5 ? '<1%' : (c > 99.5 ? '>99%' : `${Math.round(c)}%`);
// Who's left, by name only when it's a few (owner, after the Thursday-night pass: every name on both sides, early in the
// week, made the Scoreboard a wall of text). More than this many: just how many.
const NAMES_UP_TO = 4;
const liveText = (players) => players.length > NAMES_UP_TO ? `${players.length} to play` : playerList(players);
// "Median: L (4th of 6)": the median game's result as it stands, and your place among every team's score (owner,
// round 9). Before kickoff, just that the league plays it.
const medianText = (med, started) => started ? `Median: ${med.above ? 'W' : 'L'} (${ordinal(med.rank)} of ${med.of})` : 'Plays the median';
const PREV_ICON = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
const NEXT_ICON = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
const TILE_ARROW = `<svg class="mls-week-tile-go" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

function weekStarted(rows, ctx) {
    if (Object.keys(ctx.times).some(team => kickedOff(ctx, team))) return true;
    return rows.some(r => (r.res.kind === 'h2h' && (r.res.me.points !== 0 || r.res.them.points !== 0)) || (r.res.kind === 'guillotine' && r.res.me.points !== 0));
}
function weekFinal(ctx) {
    const teams = Object.keys(ctx.games);
    return teams.length > 0 && teams.every(t => ctx.games[t].state === 'post');
}
function firstKickoffLabel(ctx) {
    const times = Object.values(ctx.times).map(iso => new Date(iso).getTime()).filter(ms => !isNaN(ms)).sort((a, b) => a - b);
    return times.length ? formatKickoffLabel(new Date(times[0]).toISOString()) : '';
}

// Everything the three views draw from: the Scoreboard tab, the Dashboard's line and the Lineup tab's strip.
function buildModel(ctx = weekCtx()) {
    const sleeperLeagues = (State.leagues || []).filter(isSleeperLeague);
    if (!sleeperLeagues.length || ctx.week == null) return { ctx, sleeperLeagues, rows: [] };
    const { rows } = buildRows(ctx);
    // A swing by the rule of thumb that the Simulator calls settled (under 0.5% or over 99.5%: it rounds to 0% or 100%)
    // counts as effectively decided (owner, round 5): "0% to win" under "Still in play" contradicted itself. Not while
    // anyone on either side is mid-game (round 12): a live game can still swing more than any model of it allows.
    const midGame = (side) => side.starters.some(p => p.gameState === 'in');
    rows.forEach(r => {
        if (r.res.kind !== 'h2h') return;
        // A past week is final (S28): every matchup done, called, whatever the game states say (they're unknown when
        // that week's scoreboard didn't load, which would leave everyone live).
        if (ctx.past) { r.res = { ...r.res, status: 'done', early: false }; return; }
        if (r.res.status !== 'swing') return;
        if (midGame(r.res.me) || midGame(r.res.them)) return;
        const c = chanceOf(ctx, r.league.leagueId);
        if (c != null && (c < 0.5 || c > 99.5)) r.res = { ...r.res, status: 'decided', early: false, settledBySim: true };
    });
    const h2h = rows.filter(r => r.res.kind === 'h2h');
    const listed = rows.filter(r => r.res.kind === 'h2h' || r.res.kind === 'guillotine');
    const started = ctx.past || weekStarted(rows, ctx);
    const final = ctx.past || (started && weekFinal(ctx));
    const sum = summarize(h2h.map(r => ({
        result: r.res.result, paid: !!r.league.paid, group: r.league.leagueType === 'dynasty' ? 'dynasty' : 'redraft', keeper: r.league.leagueType === 'keeper',
        direction: leagueDirection(getPowerLeagueKind(r.league), !!r.league.powerCompeting), status: r.res.status, early: r.res.early,
    })));
    const pending = rows.some(r => r.res.kind === 'pending');
    return { ctx, sleeperLeagues, rows, h2h, listed, started, final, sum, pending };
}

// "Week 7 Recap" once a game has kicked off, "Week 7 Matchups" before.
const titleText = (m) => `Week ${m.ctx.week} ${m.started ? 'Recap' : 'Matchups'}`;
function summaryText(m) {
    if (m.pending && !m.listed.length) return view.loading ? 'Loading matchups…' : 'Open to load your matchups';
    if (!m.started) return `starts ${firstKickoffLabel(m.ctx) || 'soon'}`;
    const counted = m.h2h.length - m.sum.tooEarly;
    return [
        counted ? `Record ${recordText(m.sum.all)}` : '',
        m.sum.stillLive ? `${m.sum.stillLive} still live` : '',
        m.sum.tooEarly ? `${m.sum.tooEarly} too early to call` : '',
    ].filter(Boolean).join(' · ');
}

// One league's tile in the Scoreboard's grid (owner's pick, round 6: tiles, closest games first). Tapping it opens that
// league's Lineup tab, whose strip has the matchup's detail. The same shape at every width (round 9):
//     League name (whole) $                         115.7
//     vs tbuckler93                                  97.6
//     [W] +18.1 · Median: W (4th of 12)                 >
// The name always starts at the tile's edge: the W/L sits with the margin at the foot (the edge's color says it too)
// and the "$" after the name (owner, round 9: badges in front of the names made the tiles look uneven).
function tileHTML(r, started, ctx) {
    const l = r.league, res = r.res;
    // The foot's two lines (round 12: one wrapping line left a "·" dangling at the end of it): the result and how it
    // stands now (chip, margin, then the win chance or who's left), and under it the league's context (the median,
    // a guillotine place).
    const status = [], context = [];
    let tone = 'pre', chip = '', youPts = '', oppLabel, oppPts = '', margin = null;
    if (res.kind === 'guillotine') {
        const g = res.place;
        tone = 'guillotine';
        // Before kickoff every team is on 0, so a place ("1st of 10") would mean nothing: just how many are alive.
        context.push(!g ? 'Guillotine' : (started ? `Guillotine: ${ordinal(g.rank)} of ${g.of} alive` : `Guillotine: ${g.of} alive`));
        if (g && started && res.me.live.length) status.push(`${res.me.live.length} still to play`);
        oppLabel = !g ? 'Your team has been chopped' : (!started ? 'Lowest score is chopped' : (g.rank === g.of ? 'Next team up' : 'Chop line'));
        if (g && started) { youPts = fmt(res.me.points); oppPts = fmt(g.against); margin = g.cushion; }
    } else {
        // Best Ball on the opponent's line, not in the foot, where it wrapped onto a line of its own (owner, round 11).
        // The opponent's name gives way (ellipsis) before it does.
        oppLabel = `<span class="mls-week-tile-opp">vs ${escapeHtml(res.oppName)}</span>${res.bestBall ? '<span class="mls-week-tile-fmt">· Best Ball</span>' : ''}`;
        if (started && res.early) {
            // Scores, but no W/L or margin yet (owner: a W or L before 4 players a side have played is a guess).
            youPts = fmt(res.me.points); oppPts = fmt(res.them.points);
            status.push('Too early to call');
            if (res.median) context.push(medianText(res.median, false));
        } else if (started) {
            if (res.median) context.push(medianText(res.median, started));
            tone = res.result === 'W' ? 'win' : (res.result === 'L' ? 'loss' : 'tie');
            chip = weekResultMarkup(res.result);
            youPts = fmt(res.me.points); oppPts = fmt(res.them.points); margin = res.margin;
            // A matchup still in play: its win chance beside the margin (owner, round 12, with the shorter list).
            const chance = res.status === 'swing' ? chanceOf(ctx, l.leagueId) : null;
            if (chance != null) status.push(`<span class="mls-week-tile-chance">${pctText(chance)} to win</span>`);
        } else if (res.median) context.push(medianText(res.median, started));
    }
    const marginHTML = margin != null ? `<span class="mls-week-tile-margin${margin < 0 ? ' is-behind' : ''}">${signed(margin)}</span>` : '';
    const lead = [chip, marginHTML].filter(Boolean).join(' ');
    const sep = '<span class="mls-week-tile-sep"> · </span>';
    const line = (items) => items.length ? `<span class="mls-week-tile-line">${items.join(sep)}</span>` : '';
    const foot = line([lead, ...status].filter(Boolean)) + line(context);
    const inner = `<span class="mls-week-tile-top"><span class="mls-week-name">${leagueName(l)}</span>${l.paid ? ' ' + paidBadgeMarkup() : ''}</span>
            <span class="mls-week-tile-pts is-you">${youPts}</span>
            <span class="mls-week-tile-who">${oppLabel}</span><span class="mls-week-tile-pts">${oppPts}</span>
            <span class="mls-week-tile-foot"><span class="mls-week-tile-notes">${foot}</span>${ctx.past ? '' : TILE_ARROW}</span>`;
    // A past week's tile shows the result only (S28 round 3, owner): the Lineup tab it would open is this week's, so the
    // tap led somewhere that didn't match the tile.
    if (ctx.past) return `<li class="mls-week-tile is-${tone}"><div class="mls-week-tile-btn is-static">${inner}</div></li>`;
    return `<li class="mls-week-tile is-${tone}">
        <button type="button" class="mls-week-tile-btn" data-action="openLeagueLineup" data-league-id="${escapeHtml(l.leagueId)}" aria-label="${leagueName(l)}: open its lineup">
            ${inner}
        </button>
    </li>`;
}

// The record's split groups, for the Scoreboard and the image: Paid | Free once a league is marked paid, Redraft |
// Dynasty, and Median where it's played. A part with no league of that kind is left out (S22 round 10: "Dynasty 0–0" for
// someone with no dynasty league), and a group with no parts. A kind you have but that's too early to call keeps its 0–0.
function splitGroups(m) {
    const { h2h, sum } = m;
    const callable = h2h.filter(r => !r.res.early);
    const isDynasty = (r) => r.league.leagueType === 'dynasty';
    const direction = (r) => leagueDirection(getPowerLeagueKind(r.league), !!r.league.powerCompeting);
    const has = {
        Paid: h2h.some(r => r.league.paid), Free: h2h.some(r => !r.league.paid), Redraft: h2h.some(r => !isDynasty(r)), Dynasty: h2h.some(isDynasty),
        // Both halves once any dynasty or keeper league is in it, 0–0 included (owner, S28 round 2: "Rebuilding 1–0" on
        // its own read as a fourth kind of league, not a split of your dynasty leagues).
        Competing: h2h.some(r => direction(r) != null), Rebuilding: h2h.some(r => direction(r) != null),
    };
    const medians = callable.filter(r => r.res.median);
    const medRec = { W: medians.filter(r => r.res.median.above).length, L: medians.filter(r => !r.res.median.above).length, T: 0 };
    const anyPaid = m.sleeperLeagues.some(l => l.paid);
    return [
        ...(anyPaid ? [{ label: 'By stakes', parts: [['Paid', sum.paid], ['Free', sum.free]] }] : []),
        { label: 'By format', parts: [['Redraft', sum.redraft], ['Dynasty', sum.dynasty]] },
        // Dynasty and keeper leagues only (S28), beside the format.
        { label: 'Dynasty and keeper, by direction', parts: [['Competing', sum.competing], ['Rebuilding', sum.rebuilding]] },
        ...(medians.length ? [{ label: 'Against the median', parts: [['Median', medRec]] }] : []),
    ].map(g => ({ ...g, parts: g.parts.filter(([name]) => !(name in has) || has[name]) })).filter(g => g.parts.length);
}

// The week's biggest win and worst loss among head-to-head matchups already settled (every one once the week is final):
// a matchup still in play could still flip. Each opens that league's lineup, like its tile. '' when there's neither.
export function weekExtremes(callable, final) {
    const settled = callable.filter(r => final || r.res.status !== 'swing');
    const pick = (result, better) => settled.filter(r => r.res.result === result).reduce((a, r) => (!a || better(r.res.margin, a.res.margin) ? r : a), null);
    return { win: pick('W', (a, b) => a > b), loss: pick('L', (a, b) => a < b) };
}
function extremesHTML(callable, final, ctx) {
    const { win, loss } = weekExtremes(callable, final);
    // A past week: results only, like its tiles (S28 round 3).
    const still = (r, label, tone) => `<div class="mls-week-extreme is-${tone} is-static">
        <span class="mls-week-extreme-label">${label}</span><span class="mls-week-name">${leagueName(r.league)}</span><span class="mls-week-tile-margin${r.res.margin < 0 ? ' is-behind' : ''}">${signed(r.res.margin)}</span>
    </div>`;
    const item = ctx.past ? still : (r, label, tone) => `<button type="button" class="btn-bare mls-week-extreme is-${tone}" data-action="openLeagueLineup" data-league-id="${escapeHtml(r.league.leagueId)}" aria-label="${label}: ${leagueName(r.league)}, ${signed(r.res.margin)}. Open its lineup">
        <span class="mls-week-extreme-label">${label}</span><span class="mls-week-name">${leagueName(r.league)}</span><span class="mls-week-tile-margin${r.res.margin < 0 ? ' is-behind' : ''}">${signed(r.res.margin)}</span>
    </button>`;
    const items = [win && item(win, 'Biggest win', 'win'), loss && item(loss, 'Worst loss', 'loss')].filter(Boolean);
    return items.length ? `<div class="mls-week-extremes">${items.join('')}</div>` : '';
}

function swingHTML(r, ctx) {
    const l = r.league, res = r.res;
    const chance = chanceOf(ctx, l.leagueId);
    return `<li class="mls-week-swing">
        <div class="mls-week-swing-head">
            <span class="mls-week-line-name">${l.paid ? paidBadgeMarkup() + ' ' : ''}<span class="mls-week-name">${leagueName(l)}</span></span>
            <span class="mls-week-margin${res.margin < 0 ? ' is-behind' : ''}">${signed(res.margin)}</span>
        </div>
        <div class="mls-week-swing-score">You ${fmt(res.me.points)} &middot; ${escapeHtml(res.oppName)} ${fmt(res.them.points)}${chance != null ? ` <span class="mls-week-chance">${pctText(chance)} to win</span>` : ''}</div>
        <div class="mls-week-swing-live"><span class="mls-week-side">You:</span> ${liveText(liveOf(res.me))}</div>
        <div class="mls-week-swing-live"><span class="mls-week-side">Them:</span> ${liveText(liveOf(res.them))}</div>
    </li>`;
}

// The order of the tiles: the matchups still in play first (most uncertain first), then the rest by how close they are.
// Before kickoff, and once every game is final, your league order, as on the Dashboard (owner, round 9).
function tileOrder(rows, started, final, ctx) {
    if (!started || final) return rows;
    const gap = (r) => r.res.kind === 'guillotine' ? (r.res.place ? Math.abs(r.res.place.cushion) : Infinity) : Math.abs(r.res.margin);
    const swing = (r) => r.res.kind === 'h2h' && r.res.status === 'swing';
    const withChance = (r) => ({ ...r, margin: r.res.margin, winChance: chanceOf(ctx, r.league.leagueId) ?? null, trailReach: trailReachOf(r.res) });
    const early = (r) => r.res.kind === 'h2h' && r.res.early;
    const swings = rows.filter(r => swing(r) && !early(r)).map(withChance).sort(swingOrder);
    const rest = rows.filter(r => !swing(r)).sort((a, b) => gap(a) - gap(b));
    // Too early to call: last, in your league order.
    return [...swings, ...rest, ...rows.filter(early)];
}

// The Scoreboard draws the week chosen with its arrows; the Dashboard's line and the Lineup strip stay on this week
// (S28, the owner's choice), so they get their own model when the two differ.
export function renderThisWeek() {
    const m = buildModel();
    renderScoreboard(m);
    const home = m.ctx.chosen ? buildModel(weekCtx({ scoreboard: false })) : m;
    renderSummaryLine(home);
    renderMatchupStrip(home);
}

// --- The Scoreboard's week (S28) ---
// ‹ and ›: a step to an earlier or later week, between week 1 and this week's recap. In memory; leaving the tab
// (nav.js) goes back to this week. The step's button keeps focus (the other one if it's now at the end), and the
// announcer below the card (lineup/index.html) reads out the week for screen readers.
export function stepScoreboardWeek(step) {
    const ctx = weekCtx();
    const next = stepWeek(ctx.week, step, ctx.last);
    if (next == null) return Promise.resolve();
    const home = weekCtx({ scoreboard: false }).week;
    view.chosen = next === home ? null : next;
    renderThisWeek(); // at once, from what's loaded (a load already under way for another week doesn't draw)
    focusStep(step);
    const done = refreshThisWeek();
    announceWeek();
    return done;
}
function focusStep(step) {
    const btn = (dir) => document.querySelector(`#thisWeekCard .mls-week-step[data-step="${dir}"]`);
    const keep = btn(step);
    const target = keep && !keep.disabled ? keep : btn(-step);
    if (target) target.focus();
}
// "Back to week 9" beside a past week's title (S28 round 2): one tap rather than one per week.
export function scoreboardThisWeek() {
    if (view.chosen == null) return Promise.resolve();
    view.chosen = null;
    renderThisWeek();
    const done = refreshThisWeek();
    announceWeek();
    document.querySelector('#thisWeekCard .mls-week-step[data-step="-1"]')?.focus();
    return done;
}
export function leaveScoreboardWeek() {
    if (view.chosen == null) return;
    view.chosen = null;
    renderThisWeek();
}
function announceWeek() {
    const el = document.getElementById('scoreboardWeekAnnouncer');
    const m = buildModel();
    if (el && m.ctx.week != null) el.textContent = `${titleText(m)}${m.ctx.past ? ', final' : ''}`;
}

// The Scoreboard tab.
function renderScoreboard(m) {
    const el = document.getElementById('thisWeekCard');
    if (!el) return;
    const { ctx, sleeperLeagues, rows, h2h, listed, started, final, sum } = m;
    if (!sleeperLeagues.length) {
        el.innerHTML = `<div class="mls-week-head"><h3 class="mls-week-title">Scoreboard</h3></div><p class="text-helper">Sync a Sleeper league on the Dashboard to see your matchups here. Manual leagues have no Sleeper matchup to show.</p>`;
        return;
    }
    const loading = !!view.loading;
    const refreshBtn = `<button type="button" class="btn-bare mls-week-refresh" data-action="refreshThisWeek"${loading ? ' disabled aria-busy="true"' : ''} aria-label="Refresh this week's scores">${REFRESH_ICON(loading)}<span class="mls-week-refresh-label">Refresh</span></button>`;
    const info = `<span class="tooltip-container mls-week-info"><span class="tooltip-icon">i</span><span class="tooltip-text">${TOOLTIP}</span></span>`;
    if (ctx.week == null) {
        el.innerHTML = `<div class="mls-week-head"><h3 class="mls-week-title">Scoreboard</h3><span class="mls-week-summary">Waiting for Sleeper's NFL week…</span></div>`;
        return;
    }

    // ‹ Week 7 Recap › (S28): real buttons, disabled at week 1 and at this week.
    const step = (dir, label, icon) => {
        const off = stepWeek(ctx.week, dir, ctx.last) == null;
        return `<button type="button" class="btn-bare mls-week-step" data-action="stepScoreboardWeek" data-step="${dir}" aria-label="${label}"${off ? ' disabled' : ''}>${icon}</button>`;
    };
    const home = ctx.chosen ? weekCtx({ scoreboard: false }).week : null;
    const backHTML = home != null ? `<button type="button" class="btn-bare mls-week-back" data-action="scoreboardThisWeek">Back to week ${home}</button>` : '';
    const head = `<header class="mls-week-head">
        <div class="mls-week-heading"><span class="mls-week-nav">${step(-1, 'Previous week', PREV_ICON)}<h3 class="mls-week-title">${titleText(m)}</h3>${step(1, 'Next week', NEXT_ICON)}</span>${backHTML}<span class="mls-week-summary">${summaryText(m)}</span></div>
        ${info}
        <span class="mls-week-actions">${started && listed.length ? weekStatusMarkup(final) : ''}${refreshBtn}</span>
    </header>`;

    // S27 (owner's choice): the card's body is two folding halves under the header, League Scoreboard (everything about
    // the matchups, as before) and Player Scoreboard (Who to root for, then MVPs & LVPs); Export Recap stays below both.
    const top = [], parts = [];
    if (ctx.asked) top.push(`<p class="mls-week-override">Showing week ${ctx.week} because the address has <code>?week=${ctx.week}</code>. Remove it to go back to this week (${State.recapNflWeek ?? State.currentNflWeek}).</p>`);
    const callable = h2h.filter(r => !r.res.early);
    if (started && callable.length) {
        // The splits as one row of small stat chips (owner, round 9: the stacked lines looked plain), plus the median
        // games' own record in the leagues that play it (Sleeper's record counts them; the headline is head-to-head).
        const anyPaid = sleeperLeagues.some(l => l.paid);
        const medians = callable.filter(r => r.res.median);
        // Grouped (owner, round 10: five loose chips read as five kinds of league): each group is one segmented pill whose
        // parts add up to every league (Paid + Free, Redraft + Dynasty); Median stands apart, with how many leagues play it.
        const split = (label, rec) => `<span class="mls-week-split"><span class="mls-week-split-label">${label}</span> ${recordText(rec)}</span>`;
        const group = (name, chips, extra = '') => `<span class="mls-week-split-group" role="group" aria-label="${name}">${chips.join('')}${extra ? ' ' + extra : ''}</span>`;
        const groups = splitGroups(m).map(g => group(g.label, g.parts.map(([name, rec]) => split(name, rec)),
            g.label === 'Against the median' ? `<span class="mls-week-split-of">${medians.length} of ${h2h.length} league${h2h.length === 1 ? '' : 's'}</span>` : ''));
        parts.push(`<div class="mls-week-splits-row">${groups.join('')}</div>`);
        // What the groups mean (keeper with redraft, Median only where it's played) is in the header's info tip
        // (owner, round 11: four lines of helper text on a phone before the first tile).
        if (!anyPaid && !paidHintDismissed()) parts.push(`<p class="mls-week-splits mls-week-hint"><span class="text-helper">Mark the leagues you pay for (Dashboard, Edit, then <span class="mls-nowrap">$ Paid</span>) to split paid and free.</span><button type="button" class="btn-bare mls-week-hint-close" data-action="dismissPaidHint" aria-label="Dismiss this hint">✕</button></p>`);
        // Biggest win and worst loss (owner, S22 round 4): under the record, where the week's headline is, rather than
        // below the tiles (19 of them run about 1,700px on a phone). Among matchups already settled (all, once final).
        // Only with two or more to compare (S22 round 10): with one league, it repeated the only tile.
        if (callable.length >= 2) parts.push(extremesHTML(callable, final, ctx));
        const swings = callable.filter(r => r.res.status === 'swing').map(r => ({ ...r, margin: r.res.margin, winChance: chanceOf(ctx, r.league.leagueId) ?? null, trailReach: trailReachOf(r.res) }))
            .sort(swingOrder);
        if (swings.length) {
            // The most uncertain few, with "Show all" for the rest (owner, round 12: on a busy Sunday 14 of 20 were in
            // play, and the list repeated most of the tiles below it; the tiles carry each one's win chance too).
            const shown = view.allSwingsWeek === ctx.week ? swings : swings.slice(0, SWINGS_SHOWN);
            // Folds to its heading (owner, S22 round 3), remembered, with the chevron turning as on the Dashboard.
            const body = [`<ul class="mls-week-swings">${shown.map(r => swingHTML(r, ctx)).join('')}</ul>`];
            body.push(moreButton('showAllSwings', null, swings.length, SWINGS_SHOWN, view.allSwingsWeek === ctx.week));
            // Once for the list, not under every Best Ball league (owner, after the Thursday-night pass).
            if (shown.some(r => r.res.bestBall)) body.push('<p class="mls-week-swing-note">Best Ball: anyone on the roster with a game left can still count.</p>');
            parts.push(foldSection('swings', `<span class="mls-week-sub">Still in play</span><span class="mls-week-summary">${swings.length}</span>`, body.join(''), 'Still in play'));
        }
        const decided = callable.filter(r => r.res.status !== 'swing');
        // Only beside matchups still in play or too early: alone, it repeats the record (owner: round 9 for "Done",
        // round 12 for this).
        if (decided.length && !final && (swings.length || sum.tooEarly)) {
            const w = decided.filter(r => r.res.result === 'W').length, ls = decided.filter(r => r.res.result === 'L').length;
            parts.push(`<p class="mls-week-decided"><strong>Effectively decided:</strong> ${decided.length} (${w} W, ${ls} L${decided.length - w - ls ? `, ${decided.length - w - ls} T` : ''})</p>`);
        }
    } else if (!started && listed.length) {
        parts.push(`<p class="text-helper mls-week-splits">No games have kicked off yet. The scores fill in once they do.</p>`);
    }
    if (started && sum.tooEarly) {
        parts.push(`<p class="mls-week-decided"><strong>Too early to call:</strong> ${sum.tooEarly} (fewer than ${MIN_PLAYED} players a side have played, so they're not in the Record yet)</p>`);
    }
    // A week with no matchups in any of your leagues (S28: Sleeper answers [] for a week before a league's season).
    const empty = rows.filter(r => r.res.kind === 'empty');
    if (!listed.length && empty.length && !rows.some(r => r.res.kind === 'pending')) {
        parts.push(`<p class="text-helper mls-week-empty">No matchups in week ${ctx.week} in your Sleeper leagues.</p>`);
    }
    if (listed.length) {
        parts.push(`<h4 class="mls-week-sub">${!started ? 'Your matchups' : (final ? 'Every league' : 'Every league, closest first')}</h4><ul class="mls-week-tiles">${tileOrder(listed, started, final, ctx).map(r => tileHTML(r, started, ctx)).join('')}</ul>`);
    }

    // Leagues without a matchup to show, and any that didn't load.
    const notes = [];
    const nomatch = rows.filter(r => r.res.kind === 'nomatch' || (listed.length && r.res.kind === 'empty'));
    if (nomatch.length) notes.push(`<li>No matchup this week: ${nomatch.map(r => leagueName(r.league)).join(', ')}</li>`);
    const missing = rows.filter(r => r.res.kind === 'missing');
    if (missing.length) notes.push(`<li>Your team wasn't found (sync the league again): ${missing.map(r => leagueName(r.league)).join(', ')}</li>`);
    const offSleeper = (State.leagues || []).filter(l => !isSleeperLeague(l)).length;
    if (offSleeper) notes.push(`<li>${offSleeper} manual league${offSleeper === 1 ? '' : 's'}: no Sleeper matchup to show</li>`);
    const failed = sleeperLeagues.filter(l => failedFor(ctx.week).get(l.leagueId));
    if (failed.length) notes.push(`<li class="mls-week-failed">Couldn't load from Sleeper: ${failed.map(leagueName).join(', ')}. Tap Refresh to try again.</li>`);
    if (notes.length) parts.push(`<ul class="mls-week-notes">${notes.join('')}</ul>`);
    // A past week: nothing at the foot (round 2: "Week 1 is over" repeated the Final pill, and stat corrections are long done).
    if (!ctx.past && started && listed.length && !Object.keys(ctx.games).length) parts.push(`<p class="text-helper mls-week-foot">Game status didn't load, so everyone still counts as live.</p>`);
    else if (!ctx.past && final) parts.push(`<p class="text-helper mls-week-foot">Every game is final. Sleeper can still correct stats in the next few days.</p>`);
    // Export Recap (S22, rounds 2-3): a summary image for a group chat, once there are scores to sum up. The same
    // purple camera button at the bottom of its card as Export Trade.
    const exportHTML = !(started && listed.length) ? '' : (`<div class="mls-week-export"><button type="button" id="exportScoreboardBtn" class="btn btn-purple" data-action="exportScoreboard" title="Save a summary of your week (record, MVPs and LVPs) as an image">${CAMERA_ICON}<span class="mls-week-export-label">Export Recap</span></button></div>`);

    // A redraw keeps focus on the week's arrow it was on (S28): the card's HTML is replaced, buttons and all.
    const active = document.activeElement;
    const focused = active && el.contains(active) && active.classList.contains('mls-week-step') ? Number(active.dataset.step) : null;
    // And on a root-for row or window it was on (S27).
    const focusKey = active && el.contains(active) ? active.dataset.focusKey || null : null;
    // While another week loads, the last week drawn stays up, dimmed and inert, under the new week's title (round 2: the
    // card shrank to "Loading matchups…" and grew back on each step). Only for a week change; a first load draws as before.
    const waiting = m.pending && !listed.length;
    let body = top.join('') + parts.join('');
    if (!waiting) {
        const root = rootHTML(m);
        const rf = root.rf;
        const anyGroup = rf.root.length || rf.against.length || rf.both.length;
        const groupsText = anyGroup ? `Root for ${rf.root.length} · Against ${rf.against.length} · Both ${rf.both.length}` : `${rf.players.length} starter${rf.players.length === 1 ? '' : 's'}`;
        const rootFold = foldSection('root', `<span class="mls-week-sub">Who to root for</span><span class="mls-week-summary">${rf.players.length} starter${rf.players.length === 1 ? '' : 's'} in your matchups</span>`, root.html, 'Who to root for', 'mls-root');
        // MVPs & LVPs once a game has kicked off (S22).
        const playerBody = rootFold + (started && listed.length ? recapHTML(m) : '');
        const swingCount = callable.filter(r => r.res.status === 'swing').length;
        const leagueText = listed.length
            ? [`${listed.length} ${started ? 'league' : 'matchup'}${listed.length === 1 ? '' : 's'}`, started && swingCount ? `${swingCount} still in play` : ''].filter(Boolean).join(' · ')
            : '';
        const sectionHead = (title, summary) => `<span class="mls-week-section-title">${title}</span>${summary ? `<span class="mls-week-summary">${summary}</span>` : ''}`;
        body = top.join('')
            + foldSection('league', sectionHead('League Scoreboard', leagueText), parts.join(''), 'League Scoreboard', 'mls-week-section')
            + foldSection('player', sectionHead('Player Scoreboard', rf.players.length ? groupsText : ''), playerBody, 'Player Scoreboard', 'mls-week-section')
            + exportHTML;
    }
    if (waiting && view.lastBody && view.lastBody.week !== ctx.week) {
        body = view.lastBody.html;
        el.innerHTML = `${head}<div class="mls-week-body is-stale" inert aria-hidden="true">${body}</div>`;
    } else {
        if (!waiting) view.lastBody = { week: ctx.week, html: body };
        el.innerHTML = `${head}<div class="mls-week-body">${body}</div>`;
    }
    if (focused) focusStep(focused);
    restoreFocus(el, focusKey);
}
// After a redraw: the first row Show all added (S27), or the root-for control focus was on.
function restoreFocus(el, focusKey) {
    const next = view.focusNext;
    view.focusNext = null;
    const byKey = (k) => [...el.querySelectorAll('[data-focus-key]')].find(b => b.dataset.focusKey === k);
    if (next) {
        const rows = [...el.querySelectorAll('.mls-root-player')].filter(b => b.dataset.key.startsWith(`${next.list}|`));
        const target = rows[next.index] || rows[rows.length - 1];
        if (target) { target.focus(); return; }
    }
    if (focusKey) byKey(focusKey)?.focus();
}

const SCOREBOARD_ICON = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="12" rx="2"></rect><path d="M6.5 6.5h2.5v5H6.5z"></path><path d="M15 6.5h2.5v5H15z"></path><line x1="12" y1="8" x2="12" y2="8.01"></line><line x1="12" y1="10" x2="12" y2="10.01"></line><line x1="8" y1="15" x2="8" y2="21"></line><line x1="16" y1="15" x2="16" y2="21"></line></svg>`;
const ARROW_ICON = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

// --- THE SHARE IMAGE (improvements S22, round 2) ---
// Export saves a summary of the week as a PNG (owner: a "TL;DR", not every league's tile). The HTML is
// week/shareImage.js's; it's drawn from html2canvas's clone of #thisWeekCard, whose content is swapped for the image's,
// so the page doesn't change (as Export Trade does with #tradeOutput). Nothing that names your leagues (owner, round 3:
// in a Discord server nobody has context for them): the record, the splits and the MVPs and LVPs.
const CAMERA_ICON = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

// What the image shows, from the same model and recap the tab draws. null before kickoff.
export function scoreboardSummary() {
    const m = buildModel();
    if (!m.started || !m.listed.length) return null;
    const callable = m.h2h.filter(r => !r.res.early);
    const splits = splitGroups(m).map(g => ({ label: g.label, groups: g.parts }));
    const rc = buildPlayerRecap(recapInput(m.ctx));
    return {
        week: m.ctx.week, final: m.final, statusHTML: weekStatusMarkup(m.final),
        record: callable.length ? m.sum.all : null, stillLive: m.sum.stillLive, tooEarly: m.sum.tooEarly,
        splits: callable.length ? splits : [],
        mvps: rc.mvps.map(r => ({ name: r.name, pos: r.pos, started: r.started, own: r.own, value: rc.scale ? fmt(r.ref) : pointsRange(r) })),
        lvps: rc.lvps.map(r => ({ name: r.name, pos: r.pos, started: r.started, own: r.own, value: rc.scale ? fmt(r.ref) : pointsRange(r) })),
        scaleLabel: rc.scale ? RECAP_SCALES[rc.scale].label : null,
        single: rc.leagueCount === 1,
        leagueCount: m.listed.length,
    };
}

export async function exportScoreboard() {
    const card = document.getElementById('thisWeekCard');
    const btn = document.getElementById('exportScoreboardBtn');
    const data = scoreboardSummary();
    if (!card || !data) return;
    if (!(await ensureHtml2Canvas())) {
        showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
        return;
    }
    const imageHTML = scoreboardImageHTML(data);
    const label = btn && btn.querySelector('.mls-week-export-label');
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Capturing…';
    try {
        const canvas = await html2canvas(card, {
            backgroundColor: '#1c2541',
            scale: 2,
            onclone: (clonedDoc) => {
                const clone = clonedDoc.getElementById('thisWeekCard');
                if (!clone) return;
                clone.innerHTML = imageHTML;
                clone.className = 'mls-share-image';
                useProportionalDigits(clone); // no gaps after numbers in the image (S19, round 12)
            }
        });
        const link = document.createElement('a');
        // The week and the app's full name (owner, round 4). The other exports' names differ; a follow-up in docs/TESTING.md.
        link.download = `Week_${data.week}_Recap_My_Lineup_Strategist.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Export failed:', err);
        showToast('Export failed. Please try again.', { isError: true });
    } finally {
        const b = document.getElementById('exportScoreboardBtn');
        if (b) b.disabled = false;
        const l = b && b.querySelector('.mls-week-export-label');
        if (l) l.textContent = 'Export Recap';
    }
}

// --- MVPs & LVPs (improvements S22) ---
// A folded section under the tiles (owner's choice): which of your players won and lost the week across your Sleeper
// leagues, from the same matchups (no second fetch). The rules are in week/playerRecap.js; the lines in Advanced Settings
// (week/recapLines.js). Five rows a table, then "Show all" (owner), in memory until the week changes.
const RECAP_ROWS = 5;
// Names under each extra line before "and N more" (owner, round 3: a bullet per player, three of them).
const RECAP_NAMES = 3;
const recapView = { allWeek: { mvp: null, lvp: null } };

// --- The Scoreboard's folds (S22, round 3): MVPs & LVPs (folded until you open it) and Still in play (open until you
// fold it), both remembered. They fold in place, as a Dashboard league card does (render/leagueCards.js): the same
// element stays, its chevron turns with CSS, and a "cards" view transition grows or shrinks the card and moves what's
// below, so the chevron and the box animate together.
// S27 (owner's choice): the tab's two halves, League Scoreboard and Player Scoreboard, and Who to root for fold too, all
// open by default, remembered together in one key (mls_scoreboard_folds), which holds only what differs from the default.
const FOLDS = {
    recap: { key: KEYS.mls.playerRecapOpen, byDefault: false },
    swings: { key: KEYS.mls.stillInPlayFolded, byDefault: true },
    league: { group: true, byDefault: true },
    player: { group: true, byDefault: true },
    root: { group: true, byDefault: true },
};
function foldGroup() {
    try {
        const o = JSON.parse(localStorage.getItem(KEYS.mls.scoreboardFolds) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
}
// Each of the first two keys holds '1' for the state that isn't the default: open for MVPs & LVPs, folded for Still in play.
function foldOpen(which) {
    const f = FOLDS[which];
    if (f.group) { const v = foldGroup()[which]; return typeof v === 'boolean' ? v : f.byDefault; }
    try { return localStorage.getItem(f.key) === '1' ? !f.byDefault : f.byDefault; } catch (e) { return f.byDefault; }
}
function setFoldOpen(which, open) {
    const f = FOLDS[which];
    try {
        if (f.group) {
            const o = foldGroup();
            if (open === f.byDefault) delete o[which]; else o[which] = open;
            if (Object.keys(o).length) localStorage.setItem(KEYS.mls.scoreboardFolds, JSON.stringify(o)); else localStorage.removeItem(KEYS.mls.scoreboardFolds);
            return;
        }
        if (open !== f.byDefault) localStorage.setItem(f.key, '1'); else localStorage.removeItem(f.key);
    } catch (e) { /* this visit only */ }
}
const CHEVRON = `<svg class="mls-week-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
function foldSection(which, headHTML, bodyHTML, label, extraClass = '') {
    const open = foldOpen(which);
    const id = `mlsWeekFold-${which}`;
    return `<section class="mls-week-fold${extraClass ? ' ' + extraClass : ''}${open ? ' is-open' : ''}" data-fold="${which}" aria-label="${label}">
        <button type="button" class="btn-bare mls-week-fold-toggle" data-action="toggleWeekFold" data-fold="${which}" aria-expanded="${open}" aria-controls="${id}">${CHEVRON}${headHTML}</button>
        <div id="${id}" class="mls-week-fold-body"${open ? '' : ' hidden'}>${bodyHTML}</div>
    </section>`;
}
function nearScreen(el) {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > -window.innerHeight * 0.5 && r.top < window.innerHeight * 1.5;
}
function nameForFold(els, on) {
    els.forEach((el, i) => {
        el.style.setProperty('view-transition-name', on ? `vt-week-fold-${i}` : '');
        el.style.setProperty('view-transition-class', on ? 'vt-card' : '');
        if (!on && !el.getAttribute('style')) el.removeAttribute('style');
    });
}
export function toggleWeekFold(which) {
    const find = () => document.querySelector(`#thisWeekCard .mls-week-fold[data-fold="${which}"]`);
    const section = find();
    if (!section || !FOLDS[which]) return Promise.resolve();
    const update = () => {
        const sec = find();
        if (!sec) return;
        const open = !sec.classList.contains('is-open');
        setFoldOpen(which, open);
        sec.classList.toggle('is-open', open);
        sec.querySelector('.mls-week-fold-toggle').setAttribute('aria-expanded', String(open));
        sec.querySelector('.mls-week-fold-body').hidden = !open;
    };
    if (!canViewTransition()) { update(); return Promise.resolve(); }
    // The card, the section and what follows it in the card, near the screen only (as leagueCards.js's nameCards does).
    const card = document.getElementById('thisWeekCard');
    const els = [card, section];
    // What follows it, in its own section and in the ones around it (S27: the folds sit inside League / Player Scoreboard).
    for (let node = section; node && node !== card; node = node.parentElement) {
        for (let el = node.nextElementSibling; el; el = el.nextElementSibling) els.push(el);
    }
    const named = els.filter(el => el && nearScreen(el));
    nameForFold(named, true);
    return withViewTransition(update, { kind: 'cards', onEnd: () => nameForFold(named, false) });
}

export function showAllRecap(list) {
    const week = weekCtx().week;
    if (list === 'mvp' || list === 'lvp') recapView.allWeek[list] = recapView.allWeek[list] === week ? null : week;
    renderThisWeek();
}

// Your entry in every Sleeper league whose matchups are loaded, for buildPlayerRecap.
function recapInput(ctx) {
    const map = cachedPlayerMap || {};
    const players = {};
    const leagues = [];
    (State.leagues || []).filter(isSleeperLeague).forEach(l => {
        const cached = cachedFor(l, ctx.week);
        if (!l.rosterId || !cached) return;
        const entry = cached.matchups.find(e => e.roster_id === l.rosterId);
        if (!entry) return;
        (entry.players || []).forEach(id => {
            const p = map[id];
            if (!p || players[id]) return;
            players[id] = { name: p.first_name ? `${p.first_name} ${p.last_name}`.trim() : (p.full_name || p.last_name || id), pos: fantasyPosition(p) || p.position || '', team: p.team || null,
                // Any injury designation (IR, Out, Questionable...): not dead weight (owner, round 3).
                injured: !!p.injury_status || /reserve/i.test(p.status || '') };
        });
        leagues.push({ id: l.leagueId, name: l.name || 'Unnamed league', bestBall: isBestBallLeague(l), slots: l.starterSlots || null, entry });
    });
    const byeTeams = Object.values(players).map(p => p.team).filter(t => t && ctx.week != null && getByeWeek(t, ctx.season) === ctx.week);
    // One verdict per player on the chosen scale (round 8), from this week's stats; without them, each league's points.
    const lines = getRecapLines();
    let verdict = null;
    const stats = weekStats.get(ctx.week);
    if (stats) {
        const key = RECAP_SCALES[lines.scale].key, points = {};
        Object.keys(players).forEach(id => { const s = stats[id]; if (s && typeof s[key] === 'number') points[id] = s[key]; });
        verdict = { points };
    }
    // A past week is over (S28 round 2): every game counts as final, even if that week's ESPN scoreboard didn't load, so
    // the LVPs (who need "game over") match the Final pill.
    const games = ctx.past ? { ...Object.fromEntries(Object.values(players).filter(p => p.team).map(p => [p.team, { state: 'post' }])), ...ctx.games } : ctx.games;
    return { leagues, players, games, byeTeams, lines, verdict };
}

const recapName = (r) => `<span class="mls-recap-name">${escapeHtml(r.name)} <span class="mls-week-pos">${escapeHtml(r.pos)}</span></span>`;
// One extra line (owner, round 3): its heading and note, then a bullet per item, RECAP_NAMES of them and "and N more".
function extraItem(title, note, items) {
    const shown = items.slice(0, RECAP_NAMES).map(i => `<li>${i}</li>`).join('');
    const more = items.length > RECAP_NAMES ? `<li class="mls-recap-more">and ${items.length - RECAP_NAMES} more</li>` : '';
    return `<li><strong>${title}</strong>${note ? ` <span class="mls-recap-extra-note">${note}</span>` : ''}<ul class="mls-recap-sublist">${shown}${more}</ul></li>`;
}
const playerItem = (r, detail) => `${escapeHtml(r.name)} <span class="mls-week-pos">${escapeHtml(r.pos)}</span>${detail ? ` · ${detail}` : ''}`;
const leaguesText = (k) => `${k} league${k === 1 ? '' : 's'}`;

function recapTable(kind, rows, week, scale, single = false) {
    // The third column (round 8): each player's points on the verdict's scale ("Half PPR"), the one number that made him
    // an MVP or LVP; without a verdict, how many of his leagues he boomed or busted in where you started him.
    const third = scale ? RECAP_SCALES[scale].label : (kind === 'mvp' ? 'Boomed' : 'Busted');
    const thirdValue = (r) => scale ? fmt(r.ref) : `${kind === 'mvp' ? r.startedBoomed : r.startedBusted} of ${r.own}`;
    // With one league counted, Own and Started would read "100% (1)" on every row (round 10): left out.
    const keep = (cls) => !single || (cls !== 'own' && cls !== 'started');
    const cols = [['player', 'Player'], ['own', 'Own'], ['verdict', third], ['pts', 'Pts'], ['started', 'Started']].filter(([cls]) => keep(cls));
    const all = recapView.allWeek[kind] === week;
    const shown = all ? rows : rows.slice(0, RECAP_ROWS);
    const cell = (cls, label, html) => `<span class="mls-recap-cell mls-recap-${cls}" role="cell"><span class="mls-recap-cell-label">${label} </span>${html}</span>`;
    const row = (r) => `<li class="mls-recap-row${r.partial ? ' is-partial' : ''}" role="row">${[
        ['player', () => cell('player', '', recapName(r))], ['own', () => cell('own', 'Own', ownText(r))],
        ['verdict', () => cell('verdict', third, thirdValue(r))], ['pts', () => cell('pts', 'Pts', pointsRange(r))],
        ['started', () => cell('started', 'Started', startedText(r))],
    ].filter(([cls]) => keep(cls)).map(([, draw]) => draw()).join('')}</li>`;
    const head = `<li class="mls-recap-row mls-recap-headrow" role="row">${cols.map(([cls, label]) => `<span class="mls-recap-cell mls-recap-${cls}" role="columnheader">${label}</span>`).join('')}</li>`;
    const more = moreButton('showAllRecap', kind, rows.length, RECAP_ROWS, all);
    return `<ol class="mls-recap-table is-${kind}${single ? ' is-single' : ''}" role="table" aria-label="${kind === 'mvp' ? 'MVPs' : 'LVPs'}">${head}${shown.map(row).join('')}</ol>${more}`;
}

function recapHTML(m) {
    const ctx = m.ctx;
    const rc = buildPlayerRecap(recapInput(ctx));
    if (!rc.leagueCount) return '';
    const summary = `${rc.mvps.length} MVP${rc.mvps.length === 1 ? '' : 's'} · ${rc.lvps.length} LVP${rc.lvps.length === 1 ? '' : 's'}`;
    // No Provisional / Final pill of its own (S28 round 2): the card's header has it, a line above.
    const head = `<span class="mls-recap-title">MVPs &amp; LVPs</span><span class="mls-week-summary">${summary}</span>`;

    const lines = getRecapLines();
    const offSleeper = (State.leagues || []).filter(l => !isSleeperLeague(l)).length;
    const parts = [];
    // What the columns mean, in an (i) beside MVPs (owner, round 5: as a paragraph it took five lines on a phone before
    // the table; the Scoreboard's own helper text moved into its header's tip in S21 round 11).
    const scaleLabel = rc.scale ? RECAP_SCALES[rc.scale].label : null;
    // Three short lines (round 10: five paragraphs filled a phone screen).
    const single = rc.leagueCount === 1;
    const tip = [
        scaleLabel
            ? `<strong>${scaleLabel}:</strong> his points this week from Sleeper's stats, the one number Boom and Bust are judged on, the same in every league. <strong>Pts:</strong> what he scored in ${single ? 'your league' : 'your leagues, each in its own scoring'}.`
            : `<strong>Boomed / Busted:</strong> Sleeper's week stats didn't load, so ${single ? 'your league\'s' : 'each league\'s'} own points are judged. <strong>Pts:</strong> what he scored.`,
        ...(single ? [] : [`<strong>Own:</strong> of your ${leaguesText(rc.leagueCount)} on Sleeper${offSleeper ? ' (manual ones aren\'t counted)' : ''}, those with him on your roster. <strong>Started:</strong> of those, where you started him (Best Ball: the lineup it would pick so far).`]),
        `<strong>MVPs</strong> reached their Boom line, <strong>LVPs</strong> finished under Bust (games over), started either way. Lines${scaleLabel ? ` (${scaleLabel})` : ''}: ${['QB', 'RB', 'WR', 'TE'].map(p => `${p} ${lines[p].boom} / ${lines[p].bust}`).join(', ')}; change them in Advanced Settings. No K or DEF.`,
    ].join('<br><br>');
    parts.push(`<div class="mls-recap-subhead"><h4 class="mls-week-sub mls-recap-sub">MVPs</h4><span class="tooltip-container mls-week-info mls-recap-info"><span class="tooltip-icon">i</span><span class="tooltip-text">${tip}</span></span></div>`);
    parts.push(rc.mvps.length ? recapTable('mvp', rc.mvps, ctx.week, rc.scale, rc.leagueCount === 1) : `<p class="text-helper">No MVPs${m.final ? '' : ' yet'}: nobody you started has reached his Boom line.</p>`);
    if (rc.partial.length) {
        parts.push(`<p class="mls-recap-note"><strong>Partial boom:</strong> ${rc.partial.slice(0, RECAP_NAMES).map(r => `${escapeHtml(r.name)} <span class="mls-week-pos">${escapeHtml(r.pos)}</span> boomed in ${r.boomed} of ${r.own} (${pointsRange(r)}), likely that league's scoring`).join('; ')}.</p>`);
    }
    parts.push(`<h4 class="mls-week-sub mls-recap-sub">LVPs</h4>`);
    parts.push(rc.lvps.length ? recapTable('lvp', rc.lvps, ctx.week, rc.scale, rc.leagueCount === 1) : `<p class="text-helper">No LVPs${m.final ? '' : ' yet'}: nobody you started, whose game is final, is under his Bust line.</p>`);

    const extra = [];
    // Benched booms (round 10): one list. A benching that cost you, with the starter he could have replaced (round 7's
    // short form: the league last, muted); then a boom on your bench with no such cost.
    // One line per player (round 12): each league's benching after his name, "; " between them.
    const costPart = (c) => `${fmt(c.points)} over ${escapeHtml(c.starter.name)} <span class="mls-week-pos">${escapeHtml(c.starter.pos)}</span>${c.starter.slot && c.starter.slot !== c.starter.pos ? ` in ${escapeHtml(slotLabel(c.starter.slot))}` : ''} ${fmt(c.starter.points)} (${signed(-c.gap)}) <span class="mls-recap-league">· ${escapeHtml(c.league.name)}</span>`;
    const costItem = (b) => `${escapeHtml(b.bench.name)} <span class="mls-week-pos">${escapeHtml(b.bench.pos)}</span> ${b.costs.map(costPart).join('; ')}`;
    const boomItem = (r) => playerItem(r, rc.scale ? `${fmt(r.ref)} ${RECAP_SCALES[rc.scale].label} · benched in ${leaguesText(r.own)}` : `${pointsRange(r)} in ${leaguesText(r.boomed)}`);
    if (rc.benchedBooms.length) extra.push(extraItem('Benched booms', 'Booms you left on the bench; where a starter he could have replaced scored far less, by how much.', rc.benchedBooms.map(b => b.kind === 'cost' ? costItem(b) : boomItem(b.row))));
    if (rc.startedZeros.length) extra.push(extraItem('Started zeros', '0.0 usually means he didn\'t play; the app can\'t check that.', rc.startedZeros.map(r => playerItem(r, leaguesText(r.zeroIn)))));
    if (rc.deadWeight.length) extra.push(extraItem('Dead weight', '', rc.deadWeight.map(r => playerItem(r, `on ${r.own} benches, 0.0`))));
    if (rc.stillOpen.length) extra.push(extraItem('Still open', 'Their games aren\'t final, so they could land on either list.', rc.stillOpen.map(r => playerItem(r, leaguesText(r.own)))));
    if (rc.unresolved.length) {
        const big = rc.unresolved.filter(u => u.boomLevel);
        extra.push(`<li><strong>Not in Sleeper's player map:</strong> ${rc.unresolved.length} player${rc.unresolved.length === 1 ? '' : 's'}, left out${big.length ? `; ${big.map(u => `id ${escapeHtml(u.id)} scored ${fmt(u.max)} (a Boom-level number) in ${u.leagues.filter(x => x.points === u.max).map(x => escapeHtml(x.name)).slice(0, 1).join('')}`).join('; ')}` : ''}.</li>`);
    }
    // Best Ball (round 3): Started there is the lineup it would pick from the points so far (said in the tip since round
    // 5), from the league's slot order; a league synced before the slot order was saved reads Sleeper's lineup until its
    // next sync.
    if (!rc.scale) extra.push(`<li><strong>Week stats didn't load</strong> <span class="mls-recap-extra-note">so Boom and Bust use each league's own points until the next Refresh.</span></li>`);
    if (rc.bestBallUnslotted.length) extra.push(`<li><strong>Sync again</strong> <span class="mls-recap-extra-note">to work out Best Ball's lineup in ${rc.bestBallUnslotted.map(escapeHtml).join(', ')}; until then, Sleeper's lineup as it stands.</span></li>`);
    if (extra.length) parts.push(`<ul class="mls-recap-extra">${extra.join('')}</ul>`);
    if (!m.final) parts.push(`<p class="text-helper mls-recap-foot">Provisional until the week's last game is final.</p>`);
    return foldSection('recap', head, parts.join(''), 'MVPs and LVPs', 'mls-recap');
}

// --- WHO TO ROOT FOR (improvements S27) ---
// The Player Scoreboard's first section: every starter in this week's matchups, yours and your opponents', from the same
// matchups the tiles use (no fetch of its own). The rule and weights are week/rootFor.js's. On top, the players in 2 or
// more of your matchups in three groups (Root for, Against you, Both sides, with the share score); under them, every
// starter by kickoff window, your side and theirs; games already over fold into one line. A row opens (tap or Enter) to
// the leagues on each side. Show all, the windows' folds and the open rows are in memory, for the week shown.
const ROOT_SPOT_ROWS = 5;
const ROOT_WINDOW_ROWS = 5;
const rootView = { week: null, all: new Set(), open: new Set(), toggled: new Set() };
function rootState(week) {
    if (rootView.week !== week) Object.assign(rootView, { week, all: new Set(), open: new Set(), toggled: new Set() });
    return rootView;
}

// What one starter is still expected to add: his projection before kickoff, the part of it still to play mid-game, 0 once
// his game is over; null without a projection (rootFor.js gives him an average share).
function remainingOf(p, ctx) {
    if (ctx.past || p.gameState === 'post') return 0;
    if (typeof p.projected !== 'number') return null;
    return p.gameState === 'in' ? p.projected * (p.shareLeft || 0) : p.projected;
}

// The board's model from the Scoreboard's rows: { rf (buildRootFor), info: Map id -> the player's name, team, game and
// each league's points, pending (leagues still loading) }.
function rootModel(m) {
    const ctx = m.ctx;
    const info = new Map();
    const leagues = [];
    const remember = (p, l) => {
        if (!info.has(p.id)) info.set(p.id, { id: p.id, name: p.name, pos: p.pos, team: p.team, gameState: ctx.past ? 'post' : p.gameState, points: {} });
        info.get(p.id).points[l.leagueId] = p.points;
    };
    // Players who can't score this week (Out, IR, on a bye) aren't anyone's to root for: the Lineup tab's warnings and the
    // Dashboard's "lineups need you" box already flag them (S11).
    const side = (s, l) => s.starters.filter(p => !p.out && !p.onBye).map(p => {
        remember(p, l);
        return { id: p.id, remaining: remainingOf(p, ctx), over: ctx.past || p.state !== 'live' };
    });
    m.rows.forEach(r => {
        const res = r.res, l = r.league;
        if (!res.me || !['h2h', 'guillotine', 'nomatch'].includes(res.kind)) return;
        // A chopped guillotine team has no players: nothing to count.
        if (res.kind === 'guillotine' && !res.me.starters.length) return;
        const noOpponent = res.kind !== 'h2h';
        leagues.push({
            id: l.leagueId, name: l.name || 'Unnamed league', paid: !!l.paid, noOpponent,
            status: noOpponent ? 'none' : res.status, chance: noOpponent ? null : (boardChanceOf(ctx, l.leagueId) ?? null),
            mine: side(res.me, l), theirs: noOpponent ? [] : side(res.them, l),
        });
    });
    return { rf: buildRootFor({ leagues }), info, pending: m.rows.filter(r => r.res.kind === 'pending').length };
}

// His points this week: Sleeper's own stats on the MVPs & LVPs scale (one number, as there), else the most he scored in
// any of your leagues. Before his game, a dash.
function rootPoints(pl, ctx, started) {
    // Before his game; or, without game states (ESPN didn't load), before the week's first kickoff.
    if (pl.gameState === 'pre' || (!pl.gameState && !started)) return '–';
    const stats = weekStats.get(ctx.week);
    const key = RECAP_SCALES[getRecapLines().scale].key;
    const s = stats && stats[pl.id];
    if (s && typeof s[key] === 'number') return fmt(s[key]);
    const vals = Object.values(pl.points).filter(v => typeof v === 'number');
    return fmt(vals.length ? Math.max(...vals) : 0);
}
function rootMeta(pl, ctx) {
    const g = pl.team ? ctx.games[pl.team] : null;
    const opp = g && g.opp ? `${g.home ? 'vs' : '@'} ${escapeHtml(g.opp)}` : '';
    let state = '';
    if (pl.gameState === 'in') state = '<span class="mls-root-live">Live</span>';
    else if (pl.gameState === 'post') state = 'Final';
    else if (pl.team && ctx.times[pl.team]) state = escapeHtml(formatKickoffLabel(ctx.times[pl.team]));
    return [[escapeHtml(pl.team || ''), opp].filter(Boolean).join(' '), state].filter(Boolean).join(' · ');
}
// One league in a row's detail: its name ($ if paid), his points there, then how open it is and how much of what his
// side has left rides on him.
function rootPart(x, pl) {
    const bits = [`${fmt(pl.points[x.leagueId])} pts`];
    if (x.status === 'none') bits.push('no opponent');
    else if (x.status === 'decided') bits.push('effectively decided');
    else if (x.status === 'done' || pl.gameState === 'post') bits.push('final');
    else if (typeof x.chance === 'number') bits.push(`${pctText(x.chance)} to win`);
    if (x.impact > 0 && x.status !== 'decided' && x.status !== 'done') bits.push(`${Math.round(x.impact * 100)}% of what's left`);
    return `<li><span class="mls-week-name">${escapeHtml(x.name)}</span>${x.paid ? ' ' + paidBadgeMarkup() : ''} <span class="mls-root-part">· ${bits.join(' · ')}</span></li>`;
}
let rootRowSeq = 0;
// A player's row: a button (tap or Enter) that opens the leagues on each side. compact (the window lists): no count chip
// or share bar, and "in N" for that side under the points.
function rootRow(r, pl, list, ctx, { compact = false, side = null } = {}) {
    const st = rootState(ctx.week);
    const key = `${list}|${r.id}`;
    const open = st.open.has(key);
    const id = `mlsRootDetail-${++rootRowSeq}`;
    const kind = r.group || (side === 'against' ? 'against' : 'root');
    const n = side ? r[side].length : r.count;
    // Both sides (round 2): the counts in the chip ("3 | 1"), the weighted stake only in the detail, with what it weighs.
    const both = !compact && r.group === 'both';
    const chip = compact ? '' : ' ' + (both ? rootSplitBadgeMarkup(r.yours.length, r.against.length) : rootCountBadgeMarkup(kind, n));
    const detail = [
        both ? `<div class="mls-root-stake">${rootShareMarkup(r.share)} <span class="mls-root-stake-note">How much of his weight is in your leagues. The (i) beside Both sides says how each league is weighed.</span></div>` : '',
        r.yours.length ? `<div class="mls-root-detail-side"><span class="mls-root-detail-label is-root">Yours in</span><ul>${r.yours.map(x => rootPart(x, pl)).join('')}</ul></div>` : '',
        r.against.length ? `<div class="mls-root-detail-side"><span class="mls-root-detail-label is-against">Against you in</span><ul>${r.against.map(x => rootPart(x, pl)).join('')}</ul></div>` : '',
    ].join('');
    const pos = pl.pos || '';
    return `<li class="mls-root-row${compact ? ' is-compact' : ''}">
        <button type="button" class="btn-bare mls-root-player" data-action="toggleRootPlayer" data-key="${escapeHtml(key)}" data-focus-key="${escapeHtml(key)}" aria-expanded="${open}" aria-controls="${id}">
            ${playerHeadshotHTML({ id: pl.id, name: pl.name, pos, team: pl.team })}<span class="badge pos-badge ${escapeHtml(pos)} mls-root-pos">${escapeHtml(pos === 'DEF' ? 'D/ST' : pos)}</span>
            <span class="mls-root-who"><span class="mls-root-name">${escapeHtml(pl.name)}${chip}</span><span class="mls-root-meta">${rootMeta(pl, ctx)}</span></span>
            <span class="mls-root-pts">${rootPoints(pl, ctx, rootStarted)}<small>${compact && n > 1 ? `in ${n}` : 'pts'}</small></span>
        </button>
        <div id="${id}" class="mls-root-detail"${open ? '' : ' hidden'}>${detail}</div>
    </li>`;
}
// A list with its first few rows and "Show all N".
function rootList(rows, list, ctx, cap, opts) {
    const st = rootState(ctx.week);
    const shown = st.all.has(list) ? rows : rows.slice(0, cap);
    const more = moreButton('showAllRoot', list, rows.length, cap, st.all.has(list));
    return `<ul class="mls-root-list">${shown.map(r => rootRow(r, rootModelInfo.get(r.id) || { id: r.id, name: r.id, points: {} }, list, ctx, opts)).join('')}</ul>${more}`;
}
let rootModelInfo = new Map();
let rootStarted = false;
const ROOT_GROUPS = [
    ['root', 'Root for', 'Nobody starts for you in 2 or more matchups without also starting against you.'],
    ['against', 'Against you', 'Nobody starts against you in 2 or more matchups without also starting for you.'],
    ['both', 'Both sides', 'Nobody starts on both sides of your matchups.'],
];
// The games in a window: "KC vs DEN" (away @ home as ESPN lists them) for one or two, else how many.
function windowGames(rows, ctx) {
    const seen = new Map();
    rows.forEach(r => {
        const pl = rootModelInfo.get(r.id), g = pl && pl.team ? ctx.games[pl.team] : null;
        if (!g || !g.opp) return;
        const [away, home] = g.home ? [g.opp, pl.team] : [pl.team, g.opp];
        seen.set(`${away}@${home}`, `${escapeHtml(away)} @ ${escapeHtml(home)}`);
    });
    const games = [...seen.values()];
    if (!games.length) return '';
    return games.length <= 2 ? games.join(', ') : `${games.length} games`;
}
function rootWindow(key, title, sub, rows, ctx, byDefault, { counts: countsText = null } = {}) {
    const st = rootState(ctx.week);
    const open = st.toggled.has(key) ? !byDefault : byDefault;
    const yours = sideOrder(rows, 'yours'), against = sideOrder(rows, 'against');
    const id = `mlsRootWin-${++rootRowSeq}`;
    const counts = countsText ?? `${yours.length} yours · ${against.length} against`;
    const side = (label, list, which) => `<div class="mls-root-side"><h6 class="mls-root-side-title">${label} <span class="mls-root-side-n">${list.length}</span></h6>${list.length
        ? rootList(list, `${key}:${which}`, ctx, ROOT_WINDOW_ROWS, { compact: true, side: which })
        : '<p class="mls-root-none">Nobody</p>'}</div>`;
    return `<section class="mls-root-window${open ? ' is-open' : ''}">
        <button type="button" class="btn-bare mls-root-window-head" data-action="toggleRootWindow" data-window="${escapeHtml(key)}" data-default="${byDefault ? 'open' : 'folded'}" data-focus-key="win|${escapeHtml(key)}" aria-expanded="${open}" aria-controls="${id}">${CHEVRON.replace('mls-week-chevron', 'mls-week-chevron mls-root-chevron')}<span class="mls-root-window-title">${title}</span><span class="mls-root-window-sub">${[sub, counts].filter(Boolean).join(' · ')}</span></button>
        <div id="${id}" class="mls-root-window-body"${open ? '' : ' hidden'}><div class="mls-root-sides">${side('Your starters', yours, 'yours')}${side('Against you', against, 'against')}</div></div>
    </section>`;
}

function rootHTML(m) {
    const ctx = m.ctx;
    rootRowSeq = 0;
    const { rf, info, pending } = rootModel(m);
    rootModelInfo = info;
    rootStarted = !!m.started;
    const parts = [];
    if (!rf.players.length) {
        let msg;
        if (pending) msg = 'Loading your matchups…';
        else if (m.rows.length && m.rows.every(r => ['nomatch', 'empty'].includes(r.res.kind) && !(r.res.me && r.res.me.starters.length))) msg = `No matchups in week ${ctx.week} in your Sleeper leagues, so there's nobody to root for.`;
        else msg = 'No starters to show this week.';
        return { html: `<p class="text-helper mls-root-empty">${msg}</p>`, rf };
    }
    // One line (the weights are in the header's (i) and the Guide: S21 round 11, long helper text filled a phone screen).
    if (rf.root.length || rf.against.length || rf.both.length) parts.push(`<p class="mls-root-intro">Players in 2 or more of your matchups, those that matter most first. Tap one for the leagues.</p>`);
    if (pending) parts.push(`<p class="text-helper mls-root-pending">Still loading ${pending} league${pending === 1 ? '' : 's'}; ${pending === 1 ? 'it joins' : 'they join'} the board when ${pending === 1 ? 'it arrives' : 'they arrive'}.</p>`);
    const group = ([kind, title, none]) => {
        const rows = rf[kind];
        // Both sides explains its chip and the stake (round 2, owner: "at bare minimum, a tooltip").
        const tip = kind === 'both' ? `<span class="tooltip-container mls-week-info mls-root-info"><span class="tooltip-icon">i</span><span class="tooltip-text"><strong>3 | 1:</strong> he starts for you in 3 of your matchups (green) and against you in 1 (red).<br><br><strong>Your stake</strong> (tap him): how much of his weight is in your leagues. A paid league counts 1.5 times, a close matchup more than a lopsided one (a decided one not at all), and he counts more the bigger his share of his side's points still to come, so the stake can differ from the counts.</span></span>` : '';
        return `<div class="mls-root-group is-${kind}"><h5 class="mls-root-group-title">${ROOT_ICONS[kind]}${title} <span class="mls-root-group-n">${rows.length}</span>${tip}</h5>${rows.length
            ? rootList(rows, `spot:${kind}`, ctx, ROOT_SPOT_ROWS, {})
            : `<p class="mls-root-none">${none}</p>`}</div>`;
    };
    // Nobody in 2 or more (one league, say): one line rather than three empty boxes.
    if (rf.root.length || rf.against.length || rf.both.length) parts.push(`<div class="mls-root-spot">${ROOT_GROUPS.map(group).join('')}</div>`);
    else parts.push(`<p class="mls-root-none mls-root-none-all">Nobody starts in 2 or more of your matchups this week.</p>`);
    // By kickoff window, games under way and still to come; finished games in one folded line at the end.
    const windows = new Map(), over = [];
    rf.players.forEach(r => {
        const pl = info.get(r.id);
        if (r.over) { over.push(r); return; }
        const iso = pl && pl.team ? ctx.times[pl.team] : null;
        const k = iso || 'unknown';
        if (!windows.has(k)) windows.set(k, []);
        windows.get(k).push(r);
    });
    const keys = [...windows.keys()].sort((a, b) => (a === 'unknown') - (b === 'unknown') || new Date(a) - new Date(b));
    keys.forEach(k => {
        const rows = windows.get(k);
        const live = rows.some(r => (info.get(r.id) || {}).gameState === 'in');
        const title = k === 'unknown' ? 'Kickoff time unknown' : escapeHtml(formatKickoffLabel(k));
        parts.push(rootWindow(k, title, [windowGames(rows, ctx), live ? 'under way' : ''].filter(Boolean).join(' · '), rows, ctx, true));
    });
    if (over.length) {
        const n = (side) => over.filter(r => r[side].length).length;
        const games = new Set(over.map(r => (info.get(r.id) || {}).team).filter(Boolean).map(t => [t, (ctx.games[t] || {}).opp].sort().join('@')));
        const title = !keys.length ? 'Every game is final' : (games.size ? `${games.size} game${games.size === 1 ? '' : 's'} final` : 'Games final');
        // Folded while games are still to come; open when every game is over (a past week), so the list is the board.
        parts.push(rootWindow('final', title, '', over, ctx, !keys.length, { counts: `${n('yours')} of your starters, ${n('against')} against you` }));
    }
    if (rf.noOpponent.length) parts.push(`<p class="text-helper mls-root-note">${rf.noOpponent.map(escapeHtml).join(', ')} ${rf.noOpponent.length === 1 ? 'has' : 'have'} no opponent this week (guillotine or median only), so ${rf.noOpponent.length === 1 ? 'its' : 'their'} starters count for you only.</p>`);
    return { html: parts.join(''), rf };
}

// A row's leagues, opened and closed in place (no redraw, so focus stays on it).
export function toggleRootPlayer(key) {
    const btn = [...document.querySelectorAll('#thisWeekCard .mls-root-player')].find(b => b.dataset.key === key);
    if (!btn) return;
    const st = rootState(weekCtx().week);
    const open = btn.getAttribute('aria-expanded') !== 'true';
    if (open) st.open.add(key); else st.open.delete(key);
    btn.setAttribute('aria-expanded', String(open));
    const detail = document.getElementById(btn.getAttribute('aria-controls'));
    if (detail) detail.hidden = !open;
}
// A kickoff window (or the finished games' line), folded and opened in place.
export function toggleRootWindow(key) {
    const btn = [...document.querySelectorAll('#thisWeekCard .mls-root-window-head')].find(b => b.dataset.window === key);
    if (!btn) return;
    const st = rootState(weekCtx().week);
    const open = btn.getAttribute('aria-expanded') !== 'true';
    const byDefault = btn.dataset.default === 'open';
    if (open === byDefault) st.toggled.delete(key); else st.toggled.add(key);
    btn.setAttribute('aria-expanded', String(open));
    btn.closest('.mls-root-window').classList.toggle('is-open', open);
    const body = document.getElementById(btn.getAttribute('aria-controls'));
    if (body) body.hidden = !open;
}
// Every row of a list, focus on the first row it adds; or back to the first few ("Show less"), focus on the button.
export function showAllRoot(list) {
    const st = rootState(weekCtx().week);
    if (st.all.has(list)) {
        st.all.delete(list);
    } else {
        st.all.add(list);
        view.focusNext = { list, index: list.startsWith('spot:') ? ROOT_SPOT_ROWS : ROOT_WINDOW_ROWS };
    }
    renderThisWeek();
}

// The Dashboard's one line: "Week 7 Recap · Record 9–6 · 4 still live", opening the Scoreboard.
function renderSummaryLine(m) {
    const el = document.getElementById('weekSummaryLine');
    if (!el) return;
    if (!m.sleeperLeagues.length || m.ctx.week == null) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `${SCOREBOARD_ICON}<span class="mls-week-summary-title">${titleText(m)}</span><span class="mls-week-summary">${summaryText(m)}</span>`
        + `${m.started && m.listed.length ? weekStatusMarkup(m.final) : ''}<span class="mls-week-summary-go">Scoreboard ${ARROW_ICON}</span>`;
    el.setAttribute('aria-label', `${titleText(m)}: ${summaryText(m)}. Open the Scoreboard`);
}

// The Lineup tab's strip: this league's matchup.
function renderMatchupStrip(m) {
    const el = document.getElementById('lineupMatchupStrip');
    if (!el) return;
    const r = (m.rows || []).find(x => x.league.leagueId === State.activeLeagueId);
    if (!r || (r.res.kind !== 'h2h' && r.res.kind !== 'guillotine')) { el.hidden = true; el.innerHTML = ''; return; }
    const res = r.res;
    const week = `<span class="mls-strip-week">Week ${m.ctx.week}</span>`;
    let main, meta = '', sub = '';
    if (res.kind === 'guillotine') {
        const g = res.place;
        main = `${week}<span class="mls-strip-opp">Guillotine</span>${g && m.started ? `<span class="mls-strip-score"><strong>${fmt(res.me.points)}</strong> · ${ordinal(g.rank)} of ${g.of} alive</span><span class="mls-week-margin${g.cushion < 0 ? ' is-behind' : ''}">${signed(g.cushion)}</span>` : ''}`;
        if (!g) sub = 'Your team has been chopped.';
        else if (m.started && res.me.live.length) sub = `<span class="mls-week-side">Still to play:</span> ${liveText(res.me.live)}`;
    } else if (!m.started) {
        main = `${week}<span class="mls-strip-opp">vs ${escapeHtml(res.oppName)}</span><span class="mls-strip-score text-helper">starts ${firstKickoffLabel(m.ctx) || 'soon'}</span>`;
    } else if (res.early) {
        main = `${week}<span class="mls-strip-opp">vs ${escapeHtml(res.oppName)}</span>`
            + `<span class="mls-strip-score"><strong>${fmt(res.me.points)}</strong>&ndash;${fmt(res.them.points)}</span>`;
        meta = `<span class="mls-strip-status">Too early to call</span>`;
    } else {
        const chance = chanceOf(m.ctx, r.league.leagueId);
        // The status, win chance and median: beside the score on wider screens, a line of their own on phones (the
        // owner, round 10: inline, they wrapped unevenly). A swing's live players get the line after.
        const status = res.status === 'swing'
            ? (chance != null ? `<span class="mls-week-chance">${pctText(chance)} to win</span>` : '')
            : `<span class="mls-strip-status">${m.final ? 'Final' : 'Effectively decided'}</span>`;
        main = `${weekResultMarkup(res.result)}${week}<span class="mls-strip-opp">vs ${escapeHtml(res.oppName)}</span>`
            + `<span class="mls-strip-score"><strong>${fmt(res.me.points)}</strong>&ndash;${fmt(res.them.points)}</span>`
            + `<span class="mls-week-margin${res.margin < 0 ? ' is-behind' : ''}">${signed(res.margin)}</span>`;
        meta = status + (res.median ? `<span class="mls-strip-status">${medianText(res.median, true)}</span>` : '');
        if (res.status === 'swing') sub = `<span class="mls-week-side">You:</span> ${liveText(liveOf(res.me))} <span class="mls-week-side">Them:</span> ${liveText(liveOf(res.them))}`;
    }
    el.hidden = false;
    el.innerHTML = `<span class="mls-strip-main">${main}</span>${meta ? ` <span class="mls-strip-meta">${meta}</span>` : ''}${ARROW_ICON}`
        + (sub ? `<span class="mls-strip-sub">${sub}</span>` : '');
    el.setAttribute('aria-label', `${el.textContent.replace(/\s+/g, ' ').trim()}. Open the Scoreboard`);
}
