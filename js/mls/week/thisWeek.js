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
import {
    MIN_PLAYED, classifyMatchup, guillotinePlace, isGuillotine, medianPlace, ordinal, playsMedian, recordText, resultOf,
    sideSummary, summarize, swingOrder, teamNamesFrom, tooEarlyToCall, weekFromSearch,
} from './scoreboard.js';

const FRESH_MS = 2 * 60 * 1000;
const PARALLEL = 5;
const isSleeperLeague = (l) => l && l.leagueId && !/^(manual|handoff)_/.test(l.leagueId);
const REFRESH_ICON = (spin) => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${spin ? ' class="sync-spinner"' : ''}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg>`;
// Short labelled lines, not one paragraph (owner, after the Thursday-night pass: on a phone it filled the screen).
const TOOLTIP = [
    'Your matchup in every Sleeper league this week, from Sleeper\'s live scores.',
    '<strong>Record:</strong> how each head-to-head matchup stands, once at least 4 players a side have played. Grouped Paid / Free (mark paid leagues with "$ Paid" under Edit on the Dashboard) and Redraft / Dynasty (keeper counts as Redraft). A guillotine league has no opponent, so it isn\'t in it.',
    '<strong>Median:</strong> your record against the league median, in the leagues that play one.',
    '<strong>Still in play:</strong> the side that\'s behind can still turn it around. Your chance to win comes from the Matchup Simulator (Lineup tab).',
    '<strong>Effectively decided:</strong> the side that\'s behind has nobody left, or too little.',
    '<strong>Provisional</strong> until the week\'s last game is final. Tap a league to open its lineup; tap Refresh for the latest.',
].join('<br><br>');

// --- What this card last loaded (in memory) ---
const view = { week: null, loadedAt: 0, loading: null, failed: new Map(), chances: new Map(), chancesKey: '' };
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
        // For the win chance, the Simulator's rule: his points so far once his game has kicked off.
        actual: typeof pts === 'number' && kickedOff(ctx, team) ? pts : null,
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
    const swings = built.rows.filter(r => r.res.kind === 'h2h' && r.res.status === 'swing' && !r.res.early);
    const key = `${ctx.week}|` + swings.map(r => `${r.league.leagueId}:${r.res.me.points}:${r.res.them.points}:${r.res.me.live.length}:${r.res.them.live.length}`).join('|');
    if (!swings.length || key === view.chancesKey) return;
    view.chancesKey = key;
    view.chances = new Map(); // last scores' percents don't stay up beside new scores
    const toPlayers = (side) => side.starters.map(p => ({ id: p.id, pos: p.pos, team: p.team, actual: p.actual, projected: p.projected, excluded: p.out }));
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
    // counts as effectively decided (owner, round 5): "0% to win" under "Still in play" contradicted itself.
    rows.forEach(r => {
        if (r.res.kind !== 'h2h' || r.res.status !== 'swing') return;
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
    const notes = [];
    let tone = 'pre', chip = '', youPts = '', oppLabel, oppPts = '', margin = null;
    if (res.kind === 'guillotine') {
        const g = res.place;
        tone = 'guillotine';
        // Before kickoff every team is on 0, so a place ("1st of 10") would mean nothing: just how many are alive.
        notes.push(!g ? 'Guillotine' : (started ? `Guillotine: ${ordinal(g.rank)} of ${g.of} alive` : `Guillotine: ${g.of} alive`));
        if (g && started && res.me.live.length) notes.push(`${res.me.live.length} still to play`);
        oppLabel = !g ? 'Your team has been chopped' : (!started ? 'Lowest score is chopped' : (g.rank === g.of ? 'Next team up' : 'Chop line'));
        if (g && started) { youPts = fmt(res.me.points); oppPts = fmt(g.against); margin = g.cushion; }
    } else {
        // Best Ball on the opponent's line, not in the foot, where it wrapped onto a line of its own (owner, round 11).
        // The opponent's name gives way (ellipsis) before it does.
        oppLabel = `<span class="mls-week-tile-opp">vs ${escapeHtml(res.oppName)}</span>${res.bestBall ? '<span class="mls-week-tile-fmt">· Best Ball</span>' : ''}`;
        if (started && res.early) {
            // Scores, but no W/L or margin yet (owner: a W or L before 4 players a side have played is a guess).
            youPts = fmt(res.me.points); oppPts = fmt(res.them.points);
            notes.push('Too early to call');
            if (res.median) notes.push(medianText(res.median, false));
        } else if (started) {
            if (res.median) notes.push(medianText(res.median, started));
            tone = res.result === 'W' ? 'win' : (res.result === 'L' ? 'loss' : 'tie');
            chip = weekResultMarkup(res.result);
            youPts = fmt(res.me.points); oppPts = fmt(res.them.points); margin = res.margin;
        } else if (res.median) notes.push(medianText(res.median, started));
    }
    const marginHTML = margin != null ? `<span class="mls-week-tile-margin${margin < 0 ? ' is-behind' : ''}">${signed(margin)}</span>` : '';
    const lead = [chip, marginHTML].filter(Boolean).join(' ');
    const foot = [lead, ...notes].filter(Boolean).join('<span class="mls-week-tile-sep"> · </span>');
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
        <div class="mls-week-swing-score">You ${fmt(res.me.points)} &middot; ${escapeHtml(res.oppName)} ${fmt(res.them.points)}${chance != null ? `<span class="mls-week-chance">${Math.round(chance)}% to win</span>` : ''}</div>
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
    const withChance = (r) => ({ ...r, margin: r.res.margin, winChance: view.chances.get(r.league.leagueId) ?? null });
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
        const swings = callable.filter(r => r.res.status === 'swing').map(r => ({ ...r, margin: r.res.margin, winChance: view.chances.get(r.league.leagueId) ?? null }))
            .sort(swingOrder);
        if (swings.length) {
            parts.push(`<h4 class="mls-week-sub">Still in play</h4><ul class="mls-week-swings">${swings.map(swingHTML).join('')}</ul>`);
            // Once for the list, not under every Best Ball league (owner, after the Thursday-night pass).
            if (swings.some(r => r.res.bestBall)) parts.push('<p class="mls-week-swing-note">Best Ball: anyone on the roster with a game left can still count.</p>');
        }
        const decided = callable.filter(r => r.res.status !== 'swing');
        // Once every game is final, "Done: N" only repeated the record (owner, round 9).
        if (decided.length && !final) {
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

    el.innerHTML = `${head}<div class="mls-week-body">${parts.join('')}</div>`;
}

const SCOREBOARD_ICON = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="12" rx="2"></rect><path d="M6.5 6.5h2.5v5H6.5z"></path><path d="M15 6.5h2.5v5H15z"></path><line x1="12" y1="8" x2="12" y2="8.01"></line><line x1="12" y1="10" x2="12" y2="10.01"></line><line x1="8" y1="15" x2="8" y2="21"></line><line x1="16" y1="15" x2="16" y2="21"></line></svg>`;
const ARROW_ICON = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

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
            ? (chance != null ? `<span class="mls-week-chance">${Math.round(chance)}% to win</span>` : '')
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
