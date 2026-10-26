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
// memory. For testing, /lineup/?week=6 shows another week (its own scoreboard and projections; nothing else in the app
// changes), with a line saying so.
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
import { getWeeklyProjections } from '../../shared/api/sleeperStats.js';
import { State, parseEspnScoreboard, refreshGameTimes } from '../state.js';
import { isBestBallLeague, isExcludedFromSimulation } from '../helpers.js';
import { fantasyPosition } from '../constants.js';
import { ensureLineupProjections, formatKickoffLabel, getLeagueScoringKey, storeLeagueMatchups } from '../lineup/gameInfo.js';
import { paidBadgeMarkup, weekResultMarkup, weekStatusMarkup } from '../badges.js';
import { matchupWinChances } from '../sim/winChance.js';
import { buildPlayerRecap, ownText, pointsRange, slotLabel, startedText } from './playerRecap.js';
import { getRecapLines } from './recapLines.js';
import { scoreboardImageHTML } from './shareImage.js';
import { ensureHtml2Canvas } from '../../shared/ui/scriptLoader.js';
import { useProportionalDigits } from '../../shared/ui/exportImage.js';
import { canViewTransition, withViewTransition } from '../../shared/ui/viewTransition.js';
import { showToast } from '../../shared/ui/toast.js';
import {
    MIN_PLAYED, classifyMatchup, guillotinePlace, isGuillotine, medianPlace, ordinal, playsMedian, recordText, resultOf,
    sideSummary, summarize, swingOrder, teamNamesFrom, tooEarlyToCall, weekFromSearch,
} from './scoreboard.js';

const FRESH_MS = 2 * 60 * 1000;
// How many matchups "Still in play" lists before "Show all".
const SWINGS_SHOWN = 5;
const PARALLEL = 5;
const isSleeperLeague = (l) => l && l.leagueId && !/^(manual|handoff)_/.test(l.leagueId);
const REFRESH_ICON = (spin) => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${spin ? ' class="sync-spinner"' : ''}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg>`;
// Short labelled lines, not one paragraph (owner, after the Thursday-night pass: on a phone it filled the screen).
const TOOLTIP = [
    'Your matchup in every Sleeper league this week, from Sleeper\'s live scores.',
    '<strong>Record:</strong> how each head-to-head matchup stands, once at least 4 players a side have played. Grouped Paid / Free (mark paid leagues with "$ Paid" under Edit on the Dashboard) and Redraft / Dynasty (keeper counts as Redraft). A guillotine league has no opponent, so it isn\'t in it.',
    '<strong>Median:</strong> your record against the league median, in the leagues that play one.',
    '<strong>Still in play:</strong> the side that\'s behind can still turn it around. Your chance to win comes from the Matchup Simulator (Lineup tab); none for Best Ball, where the bench can still count.',
    '<strong>Effectively decided:</strong> the side that\'s behind has nobody left, or too little.',
    '<strong>Provisional</strong> until the week\'s last game is final. Tap a league to open its lineup; tap Refresh for the latest.',
].join('<br><br>');

// --- What this card last loaded (in memory) ---
const view = { week: null, loadedAt: 0, loading: null, failed: new Map(), chances: new Map(), chancesKey: '', allSwingsWeek: null };
// Leagues synced before S21: their names, median and guillotine flags, read from Sleeper once per visit.
const metaCache = new Map();
// The week asked for in the address (?week=), with its own scoreboard and projections once loaded.
const other = { week: null, times: {}, games: {}, projections: null };

// The week this card shows and what it reads about it: Sleeper's current week from State, or the address's week.
function weekCtx() {
    const asked = typeof location !== 'undefined' ? weekFromSearch(location.search) : null;
    const season = State.currentNflSeason;
    if (asked != null && State.currentNflWeek != null && asked !== State.currentNflWeek) {
        const mine = other.week === asked;
        return { week: asked, season, times: mine ? other.times : {}, games: mine ? other.games : {}, projections: mine ? other.projections : null, asked: true };
    }
    const week = State.currentNflWeek;
    return {
        week, season, times: State.gameTimesByTeam, games: State.gamesByTeam,
        projections: State.lineupProjections.week === week ? State.lineupProjections.data : null, asked: false,
    };
}
const kickedOff = (ctx, team) => {
    const ms = team && ctx.times[team] ? new Date(ctx.times[team]).getTime() : NaN;
    return !isNaN(ms) && Date.now() >= ms;
};

// The address's week: its ESPN scoreboard and Sleeper projections (the app's own are for the current week).
async function loadOtherWeek(week, season) {
    if (other.week !== week) Object.assign(other, { week, times: {}, games: {}, projections: null });
    try {
        const res = await mdsFetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`);
        const parsed = parseEspnScoreboard(res.ok ? await res.json() : null);
        if (parsed) { other.times = parsed.map; other.games = parsed.games; }
    } catch (e) { /* game states stay unknown: everyone counts as live, and the card says so */ }
    try { other.projections = (await getWeeklyProjections(season, week)) || null; } catch (e) { /* no win chances */ }
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
    const side = (e) => {
        const starters = starterIds(e);
        return sideSummary({
            points: pointsOf(e), bestBall,
            starters: starters.map(id => playerInfo(id, e, ctx)),
            bench: bestBall ? (e.players || []).filter(id => !starters.includes(id)).map(id => playerInfo(id, e, ctx)) : [],
        });
    };
    const guillotine = meta.guillotine != null ? meta.guillotine
        : (matchups.length > 2 && new Set(matchups.map(m => m.matchup_id)).size === matchups.length);
    if (guillotine) {
        const me = side(mine);
        const alive = (e) => (e.players || []).length > 0;
        return { kind: 'guillotine', me, place: guillotinePlace(me.points, matchups.map(e => ({ points: pointsOf(e), alive: alive(e) })), alive(mine)) };
    }
    const opp = mine.matchup_id == null ? null : matchups.find(e => e.matchup_id === mine.matchup_id && e.roster_id !== mine.roster_id);
    if (!opp) return { kind: 'nomatch' };
    const me = side(mine), them = side(opp);
    const m = classifyMatchup(me, them);
    return {
        kind: 'h2h', me, them, ...m, result: resultOf(m), early: tooEarlyToCall(me, them, m.status), bestBall, scoringKey: ctx.scoringKey,
        oppName: (meta.teamNames && meta.teamNames[opp.roster_id]) || 'Opponent',
        median: meta.median ? medianPlace(me.points, matchups.map(pointsOf)) : null,
    };
}

// --- Loading ---
const hasWeek = (l, week) => { const c = State.lineupActualPoints[l.leagueId]; return !!(c && c.week === week && Array.isArray(c.matchups)); };

// Called when the Dashboard is shown (render/leagueCards.js) and by Refresh (force). Draws at once from what's
// loaded, fetches what's older than FRESH_MS (everything, with force), draws again, then adds the win chances.
export function refreshThisWeek({ force = false } = {}) {
    const leagues = (State.leagues || []).filter(isSleeperLeague);
    const { week, season, asked } = weekCtx();
    if (!leagues.length || week == null) { renderThisWeek(); return Promise.resolve(); }
    if (view.loading) return view.loading;
    // Loaded in the last 2 minutes, and every league has this week's matchups (or failed then): just redraw. A league
    // added since is fetched.
    const allIn = leagues.every(l => hasWeek(l, week) || view.failed.has(l.leagueId));
    if (!force && allIn && view.week === week && Date.now() - view.loadedAt < FRESH_MS) { renderThisWeek(); return Promise.resolve(); }

    view.loading = (async () => {
        await null; // view.loading is set before the first draw below, which shows the spinner
        try {
            // A scoreboard that has a game under way and is a minute old is fetched again (gameStatusMayBeStale).
            if (force) State.gameTimesFetchedAt = 0;
            await Promise.all([
                asked ? loadOtherWeek(week, season) : Promise.all([refreshGameTimes(), ensureLineupProjections()]),
                getSleeperPlayerMap().catch(() => null),
            ]);
            const failed = new Map();
            await eachLimited(leagues, PARALLEL, async (l) => {
                const cached = State.lineupActualPoints[l.leagueId];
                const fresh = cached && cached.week === week && Array.isArray(cached.matchups) && cached.matchups.length
                    && Date.now() - cached.fetchedAt < FRESH_MS;
                if (force || !fresh) {
                    try {
                        storeLeagueMatchups(l, week, await getSleeperMatchups(l.leagueId, week));
                    } catch (e) {
                        failed.set(l.leagueId, true);
                    }
                }
            });
            view.failed = failed;
            await resolveForDraw();
            view.week = week;
            view.loadedAt = Date.now();
        } finally {
            view.loading = null;
        }
        renderThisWeek();
        // A league added while this was loading gets its turn now.
        if ((State.leagues || []).filter(isSleeperLeague).some(l => !hasWeek(l, week) && !view.failed.has(l.leagueId))) refreshThisWeek();
        await addWinChances();
    })().catch(err => { console.warn('This week: matchups did not load.', err); view.loading = null; renderThisWeek(); });
    renderThisWeek();
    return view.loading;
}

// The swing matchups' win chances, once per set of scores (a redraw with the same scores keeps them).
async function addWinChances() {
    const ctx = weekCtx();
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
    // On a bye: left out like Out (no projection, so he'd count at his season average; Sunday live check).
    const toPlayers = (side) => side.starters.map(p => ({ id: p.id, pos: p.pos, team: p.team, actual: p.actual, shareLeft: p.shareLeft, projected: p.projected, excluded: p.out || p.onBye }));
    try {
        view.chances = await matchupWinChances(swings.map(r => ({ key: r.league.leagueId, scoringKey: r.res.scoringKey, mine: toPlayers(r.res.me), theirs: toPlayers(r.res.them) })),
            { season: ctx.season, week: ctx.week });
    } catch (e) {
        view.chances = new Map();
    }
    renderThisWeek();
}

// Every Sleeper league's result from the cache, in your league order.
function buildRows(ctx) {
    const week = ctx.week;
    const base = { week, season: ctx.season, playerMap: cachedPlayerMap || {}, projections: ctx.projections, games: ctx.games, times: ctx.times };
    const rows = [];
    (State.leagues || []).filter(isSleeperLeague).forEach(l => {
        const cached = State.lineupActualPoints[l.leagueId];
        const matchups = cached && cached.week === week && Array.isArray(cached.matchups) ? cached.matchups : null;
        // A league whose last fetch failed keeps any scores it had (the note under the list names it).
        if (view.failed.get(l.leagueId) && !matchups) { rows.push({ league: l, res: { kind: 'failed' } }); return; }
        if (!matchups) { rows.push({ league: l, res: { kind: 'pending' } }); return; }
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
// "Show all N" under the in-play list: every swing, until the week changes.
export function showAllSwings() {
    view.allSwingsWeek = weekCtx().week;
    renderThisWeek();
}
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
function buildModel() {
    const ctx = weekCtx();
    const sleeperLeagues = (State.leagues || []).filter(isSleeperLeague);
    if (!sleeperLeagues.length || ctx.week == null) return { ctx, sleeperLeagues, rows: [] };
    const { rows } = buildRows(ctx);
    // A swing by the rule of thumb that the Simulator calls settled (under 0.5% or over 99.5%: it rounds to 0% or 100%)
    // counts as effectively decided (owner, round 5): "0% to win" under "Still in play" contradicted itself. Not while
    // anyone on either side is mid-game (round 12): a live game can still swing more than any model of it allows.
    const midGame = (side) => side.starters.some(p => p.gameState === 'in');
    rows.forEach(r => {
        if (r.res.kind !== 'h2h' || r.res.status !== 'swing') return;
        if (midGame(r.res.me) || midGame(r.res.them)) return;
        const c = view.chances.get(r.league.leagueId);
        if (c != null && (c < 0.5 || c > 99.5)) r.res = { ...r.res, status: 'decided', early: false, settledBySim: true };
    });
    const h2h = rows.filter(r => r.res.kind === 'h2h');
    const listed = rows.filter(r => r.res.kind === 'h2h' || r.res.kind === 'guillotine');
    const started = weekStarted(rows, ctx);
    const final = started && weekFinal(ctx);
    const sum = summarize(h2h.map(r => ({ result: r.res.result, paid: !!r.league.paid, group: r.league.leagueType === 'dynasty' ? 'dynasty' : 'redraft', keeper: r.league.leagueType === 'keeper', status: r.res.status, early: r.res.early })));
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
function tileHTML(r, started) {
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
            const chance = res.status === 'swing' ? view.chances.get(l.leagueId) : null;
            if (chance != null) status.push(`<span class="mls-week-tile-chance">${pctText(chance)} to win</span>`);
        } else if (res.median) context.push(medianText(res.median, started));
    }
    const marginHTML = margin != null ? `<span class="mls-week-tile-margin${margin < 0 ? ' is-behind' : ''}">${signed(margin)}</span>` : '';
    const lead = [chip, marginHTML].filter(Boolean).join(' ');
    const sep = '<span class="mls-week-tile-sep"> · </span>';
    const line = (items) => items.length ? `<span class="mls-week-tile-line">${items.join(sep)}</span>` : '';
    const foot = line([lead, ...status].filter(Boolean)) + line(context);
    return `<li class="mls-week-tile is-${tone}">
        <button type="button" class="mls-week-tile-btn" data-action="openLeagueLineup" data-league-id="${escapeHtml(l.leagueId)}" aria-label="${leagueName(l)}: open its lineup">
            <span class="mls-week-tile-top"><span class="mls-week-name">${leagueName(l)}</span>${l.paid ? ' ' + paidBadgeMarkup() : ''}</span>
            <span class="mls-week-tile-pts is-you">${youPts}</span>
            <span class="mls-week-tile-who">${oppLabel}</span><span class="mls-week-tile-pts">${oppPts}</span>
            <span class="mls-week-tile-foot"><span class="mls-week-tile-notes">${foot}</span>${TILE_ARROW}</span>
        </button>
    </li>`;
}

function swingHTML(r) {
    const l = r.league, res = r.res;
    const chance = view.chances.get(l.leagueId);
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
function tileOrder(rows, started, final) {
    if (!started || final) return rows;
    const gap = (r) => r.res.kind === 'guillotine' ? (r.res.place ? Math.abs(r.res.place.cushion) : Infinity) : Math.abs(r.res.margin);
    const swing = (r) => r.res.kind === 'h2h' && r.res.status === 'swing';
    const withChance = (r) => ({ ...r, margin: r.res.margin, winChance: view.chances.get(r.league.leagueId) ?? null, trailReach: trailReachOf(r.res) });
    const early = (r) => r.res.kind === 'h2h' && r.res.early;
    const swings = rows.filter(r => swing(r) && !early(r)).map(withChance).sort(swingOrder);
    const rest = rows.filter(r => !swing(r)).sort((a, b) => gap(a) - gap(b));
    // Too early to call: last, in your league order.
    return [...swings, ...rest, ...rows.filter(early)];
}

export function renderThisWeek() {
    const m = buildModel();
    renderScoreboard(m);
    renderSummaryLine(m);
    renderMatchupStrip(m);
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

    const head = `<header class="mls-week-head">
        <div class="mls-week-heading"><h3 class="mls-week-title">${titleText(m)}</h3><span class="mls-week-summary">${summaryText(m)}</span></div>
        ${info}
        <span class="mls-week-actions">${started && listed.length ? weekStatusMarkup(final) : ''}${refreshBtn}</span>
    </header>`;

    const parts = [];
    if (ctx.asked) parts.push(`<p class="mls-week-override">Showing week ${ctx.week} because the address has <code>?week=${ctx.week}</code>. Remove it to go back to this week (${State.currentNflWeek}).</p>`);
    const callable = h2h.filter(r => !r.res.early);
    if (started && callable.length) {
        // The splits as one row of small stat chips (owner, round 9: the stacked lines looked plain), plus the median
        // games' own record in the leagues that play it (Sleeper's record counts them; the headline is head-to-head).
        const anyPaid = sleeperLeagues.some(l => l.paid);
        const medians = callable.filter(r => r.res.median);
        const medRec = { W: medians.filter(r => r.res.median.above).length, L: medians.filter(r => !r.res.median.above).length, T: 0 };
        // Grouped (owner, round 10: five loose chips read as five kinds of league): each group is one segmented pill whose
        // parts add up to every league (Paid + Free, Redraft + Dynasty); Median stands apart, with how many leagues play it.
        const split = (label, rec) => `<span class="mls-week-split"><span class="mls-week-split-label">${label}</span> ${recordText(rec)}</span>`;
        const group = (name, chips, extra = '') => `<span class="mls-week-split-group" role="group" aria-label="${name}">${chips.join('')}${extra ? ' ' + extra : ''}</span>`;
        const groups = [
            ...(anyPaid ? [group('By stakes', [split('Paid', sum.paid), split('Free', sum.free)])] : []),
            group('By format', [split('Redraft', sum.redraft), split('Dynasty', sum.dynasty)]),
            ...(medians.length ? [group('Against the median', [split('Median', medRec)], `<span class="mls-week-split-of">${medians.length} of ${h2h.length} league${h2h.length === 1 ? '' : 's'}</span>`)] : []),
        ];
        parts.push(`<div class="mls-week-splits-row">${groups.join('')}</div>`);
        // What the groups mean (keeper with redraft, Median only where it's played) is in the header's info tip
        // (owner, round 11: four lines of helper text on a phone before the first tile).
        if (!anyPaid && !paidHintDismissed()) parts.push(`<p class="mls-week-splits mls-week-hint"><span class="text-helper">Mark the leagues you pay for (Dashboard, Edit, then $ Paid) to split paid and free.</span><button type="button" class="btn-bare mls-week-hint-close" data-action="dismissPaidHint" aria-label="Dismiss this hint">✕</button></p>`);
        const swings = callable.filter(r => r.res.status === 'swing').map(r => ({ ...r, margin: r.res.margin, winChance: view.chances.get(r.league.leagueId) ?? null, trailReach: trailReachOf(r.res) }))
            .sort(swingOrder);
        if (swings.length) {
            // The most uncertain few, with "Show all" for the rest (owner, round 12: on a busy Sunday 14 of 20 were in
            // play, and the list repeated most of the tiles below it; the tiles carry each one's win chance too).
            const shown = view.allSwingsWeek === ctx.week ? swings : swings.slice(0, SWINGS_SHOWN);
            // Folds to its heading (owner, S22 round 3), remembered, with the chevron turning as on the Dashboard.
            const body = [`<ul class="mls-week-swings">${shown.map(swingHTML).join('')}</ul>`];
            if (shown.length < swings.length) body.push(`<button type="button" class="btn-bare mls-week-show-all" data-action="showAllSwings">Show all ${swings.length}</button>`);
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
    if (listed.length) {
        parts.push(`<h4 class="mls-week-sub">${!started ? 'Your matchups' : (final ? 'Every league' : 'Every league, closest first')}</h4><ul class="mls-week-tiles">${tileOrder(listed, started, final).map(r => tileHTML(r, started)).join('')}</ul>`);
    }

    // MVPs & LVPs once a game has kicked off (S22).
    if (started && listed.length) parts.push(recapHTML(m));

    // Leagues without a matchup to show, and any that didn't load.
    const notes = [];
    const nomatch = rows.filter(r => r.res.kind === 'nomatch');
    if (nomatch.length) notes.push(`<li>No matchup this week: ${nomatch.map(r => leagueName(r.league)).join(', ')}</li>`);
    const missing = rows.filter(r => r.res.kind === 'missing');
    if (missing.length) notes.push(`<li>Your team wasn't found (sync the league again): ${missing.map(r => leagueName(r.league)).join(', ')}</li>`);
    const offSleeper = (State.leagues || []).filter(l => !isSleeperLeague(l)).length;
    if (offSleeper) notes.push(`<li>${offSleeper} manual league${offSleeper === 1 ? '' : 's'}: no Sleeper matchup to show</li>`);
    const failed = sleeperLeagues.filter(l => view.failed.get(l.leagueId));
    if (failed.length) notes.push(`<li class="mls-week-failed">Couldn't load from Sleeper: ${failed.map(leagueName).join(', ')}. Tap Refresh to try again.</li>`);
    if (notes.length) parts.push(`<ul class="mls-week-notes">${notes.join('')}</ul>`);
    if (started && listed.length && !Object.keys(ctx.games).length) parts.push(`<p class="text-helper mls-week-foot">Game status didn't load, so everyone still counts as live.</p>`);
    else if (final) parts.push(`<p class="text-helper mls-week-foot">Every game is final. Sleeper can still correct stats in the next few days.</p>`);
    // Export Recap (S22, rounds 2-3): a summary image for a group chat, once there are scores to sum up. The same
    // purple camera button at the bottom of its card as Export Trade.
    if (started && listed.length) parts.push(`<div class="mls-week-export"><button type="button" id="exportScoreboardBtn" class="btn btn-purple" data-action="exportScoreboard" title="Save a summary of your week (record, MVPs and LVPs) as an image">${CAMERA_ICON}<span class="mls-week-export-label">Export Recap</span></button></div>`);

    el.innerHTML = `${head}<div class="mls-week-body">${parts.join('')}</div>`;
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
    const anyPaid = m.sleeperLeagues.some(l => l.paid);
    const medians = callable.filter(r => r.res.median);
    const medRec = { W: medians.filter(r => r.res.median.above).length, L: medians.filter(r => !r.res.median.above).length, T: 0 };
    const splits = [
        ...(anyPaid ? [{ label: 'By stakes', groups: [['Paid', m.sum.paid], ['Free', m.sum.free]] }] : []),
        { label: 'By format', groups: [['Redraft', m.sum.redraft], ['Dynasty', m.sum.dynasty]] },
        ...(medians.length ? [{ label: 'Median', groups: [['Median', medRec]] }] : []),
    ];
    const rc = buildPlayerRecap(recapInput(m.ctx));
    return {
        week: m.ctx.week, final: m.final, statusHTML: weekStatusMarkup(m.final),
        record: callable.length ? m.sum.all : null, stillLive: m.sum.stillLive, tooEarly: m.sum.tooEarly,
        splits: callable.length ? splits : [],
        mvps: rc.mvps.map(r => ({ name: r.name, pos: r.pos, boomed: r.boomed, own: r.own, range: pointsRange(r) })),
        lvps: rc.lvps.map(r => ({ name: r.name, pos: r.pos, started: r.started, own: r.own, range: pointsRange(r) })),
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
        link.download = 'My_Recap_Lineup_Strategist.png'; // like My_Trade_Lineup_Strategist.png
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
const FOLDS = {
    recap: { key: KEYS.mls.playerRecapOpen, byDefault: false },
    swings: { key: KEYS.mls.stillInPlayFolded, byDefault: true },
};
// Each key holds '1' for the state that isn't the default: open for MVPs & LVPs, folded for Still in play.
function foldOpen(which) {
    const f = FOLDS[which];
    try { return localStorage.getItem(f.key) === '1' ? !f.byDefault : f.byDefault; } catch (e) { return f.byDefault; }
}
function setFoldOpen(which, open) {
    const f = FOLDS[which];
    try {
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
    const els = [document.getElementById('thisWeekCard'), section];
    for (let el = section.nextElementSibling; el; el = el.nextElementSibling) els.push(el);
    const named = els.filter(el => el && nearScreen(el));
    nameForFold(named, true);
    return withViewTransition(update, { kind: 'cards', onEnd: () => nameForFold(named, false) });
}

export function showAllRecap(list) {
    if (list === 'mvp' || list === 'lvp') recapView.allWeek[list] = weekCtx().week;
    renderThisWeek();
}

// Your entry in every Sleeper league whose matchups are loaded, for buildPlayerRecap.
function recapInput(ctx) {
    const map = cachedPlayerMap || {};
    const players = {};
    const leagues = [];
    (State.leagues || []).filter(isSleeperLeague).forEach(l => {
        const cached = State.lineupActualPoints[l.leagueId];
        if (!l.rosterId || !cached || cached.week !== ctx.week || !Array.isArray(cached.matchups)) return;
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
    return { leagues, players, games: ctx.games, byeTeams, lines: getRecapLines() };
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

function recapTable(kind, rows, week) {
    const cols = kind === 'mvp' ? ['Player', 'Own', 'Boomed', 'Pts', 'Started'] : ['Player', 'Own', 'Started', 'Pts'];
    const all = recapView.allWeek[kind] === week;
    const shown = all ? rows : rows.slice(0, RECAP_ROWS);
    const cell = (cls, label, html) => `<span class="mls-recap-cell mls-recap-${cls}" role="cell"><span class="mls-recap-cell-label">${label} </span>${html}</span>`;
    const row = (r) => {
        const cells = kind === 'mvp'
            ? [cell('player', '', recapName(r)), cell('own', 'Own', ownText(r)), cell('boomed', 'Boomed', `${r.boomed} of ${r.own}`), cell('pts', 'Pts', pointsRange(r)), cell('started', 'Started', startedText(r))]
            : [cell('player', '', recapName(r)), cell('own', 'Own', ownText(r)), cell('started', 'Started', startedText(r)), cell('pts', 'Pts', pointsRange(r))];
        return `<li class="mls-recap-row${r.partial ? ' is-partial' : ''}" role="row">${cells.join('')}</li>`;
    };
    const head = `<li class="mls-recap-row mls-recap-headrow" role="row">${cols.map((c, i) => `<span class="mls-recap-cell mls-recap-${['player', 'own', kind === 'mvp' ? 'boomed' : 'started', 'pts', 'started'][i]}" role="columnheader">${c}</span>`).join('')}</li>`;
    const more = shown.length < rows.length ? `<button type="button" class="btn-bare mls-week-show-all" data-action="showAllRecap" data-list="${kind}">Show all ${rows.length}</button>` : '';
    return `<ol class="mls-recap-table is-${kind}" role="table" aria-label="${kind === 'mvp' ? 'MVPs' : 'LVPs'}">${head}${shown.map(row).join('')}</ol>${more}`;
}

function recapHTML(m) {
    const ctx = m.ctx;
    const rc = buildPlayerRecap(recapInput(ctx));
    if (!rc.leagueCount) return '';
    const summary = `${rc.mvps.length} MVP${rc.mvps.length === 1 ? '' : 's'} · ${rc.lvps.length} LVP${rc.lvps.length === 1 ? '' : 's'}`;
    const head = `<span class="mls-recap-title">MVPs &amp; LVPs</span><span class="mls-week-summary">${summary}</span>${weekStatusMarkup(m.final)}`;

    const lines = getRecapLines();
    const offSleeper = (State.leagues || []).filter(l => !isSleeperLeague(l)).length;
    const parts = [];
    parts.push(`<p class="text-helper mls-recap-intro">Your ${leaguesText(rc.leagueCount)} on Sleeper, each in its own scoring. Own: leagues with him on your roster, bench included${offSleeper ? ' (manual leagues have no points, so they aren\'t counted)' : ''}. Started: of those, the ones where you started him. Boom / Bust: ${['QB', 'RB', 'WR', 'TE'].map(p => `${p} ${lines[p].boom} / ${lines[p].bust}`).join(', ')} (Advanced Settings on the Dashboard). No K or DEF.</p>`);
    parts.push(`<h4 class="mls-week-sub">MVPs</h4>`);
    parts.push(rc.mvps.length ? recapTable('mvp', rc.mvps, ctx.week) : `<p class="text-helper">No MVPs${m.final ? '' : ' yet'}: nobody you started has reached his Boom line.</p>`);
    if (rc.partial.length) {
        parts.push(`<p class="mls-recap-note"><strong>Partial boom:</strong> ${rc.partial.slice(0, RECAP_NAMES).map(r => `${escapeHtml(r.name)} <span class="mls-week-pos">${escapeHtml(r.pos)}</span> boomed in ${r.boomed} of ${r.own} (${pointsRange(r)}), likely that league's scoring`).join('; ')}.</p>`);
    }
    parts.push(`<h4 class="mls-week-sub">LVPs</h4>`);
    parts.push(rc.lvps.length ? recapTable('lvp', rc.lvps, ctx.week) : `<p class="text-helper">No LVPs${m.final ? '' : ' yet'}: nobody whose game is final is under his Bust line.</p>`);

    const extra = [];
    if (rc.benchBooms.length) extra.push(extraItem('Boomed on your bench', 'Not MVPs: you didn\'t start them where they boomed.', rc.benchBooms.map(r => playerItem(r, `${pointsRange(r)} in ${leaguesText(r.boomed)}`))));
    if (rc.startedZeros.length) extra.push(extraItem('Started zeros', '0.0 usually means he didn\'t play; the app can\'t check that.', rc.startedZeros.map(r => playerItem(r, leaguesText(r.zeroIn)))));
    if (rc.deadWeight.length) extra.push(extraItem('Dead weight', '', rc.deadWeight.map(r => playerItem(r, `on ${r.own} benches, 0.0`))));
    if (rc.stillOpen.length) extra.push(extraItem('Still open', 'Their games aren\'t final, so they could land on either list.', rc.stillOpen.map(r => playerItem(r, leaguesText(r.own)))));
    if (rc.worstBenchings.length) {
        extra.push(extraItem('Worst benchings', '', rc.worstBenchings.map(b => `${escapeHtml(b.bench.name)} <span class="mls-week-pos">${escapeHtml(b.bench.pos)}</span> ${fmt(b.bench.points)} on your bench in ${escapeHtml(b.league.name)}, over ${escapeHtml(b.starter.name)}${b.starter.slot ? ` (${escapeHtml(slotLabel(b.starter.slot))})` : ''} ${fmt(b.starter.points)} (${signed(-b.gap)})`)));
    }
    if (rc.unresolved.length) {
        const big = rc.unresolved.filter(u => u.boomLevel);
        extra.push(`<li><strong>Not in Sleeper's player map:</strong> ${rc.unresolved.length} player${rc.unresolved.length === 1 ? '' : 's'}, left out${big.length ? `; ${big.map(u => `id ${escapeHtml(u.id)} scored ${fmt(u.max)} (a Boom-level number) in ${u.leagues.filter(x => x.points === u.max).map(x => escapeHtml(x.name)).slice(0, 1).join('')}`).join('; ')}` : ''}.</li>`);
    }
    // Best Ball (round 3): Started there is the lineup it would pick from the points so far, from the league's slot
    // order; a league synced before the slot order was saved reads Sleeper's lineup until its next sync.
    if (rc.bestBallNote) extra.push(`<li><strong>Best Ball</strong> <span class="mls-recap-extra-note">Sleeper sets its lineup after the games, so Started there is the lineup it would pick from the points so far.</span></li>`);
    if (rc.bestBallUnslotted.length) extra.push(`<li><strong>Sync again</strong> <span class="mls-recap-extra-note">to work out Best Ball's lineup in ${rc.bestBallUnslotted.map(escapeHtml).join(', ')}; until then, Sleeper's lineup as it stands.</span></li>`);
    if (extra.length) parts.push(`<ul class="mls-recap-extra">${extra.join('')}</ul>`);
    if (!m.final) parts.push(`<p class="text-helper mls-recap-foot">Provisional until the week's last game is final.</p>`);
    return foldSection('recap', head, parts.join(''), 'MVPs and LVPs', 'mls-recap');
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
        const chance = view.chances.get(r.league.leagueId);
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
