// --- THIS WEEK: EVERY LEAGUE'S MATCHUP, LIVE (improvements S21) ---
// A card at the top of the Dashboard's League Command Center (#thisWeekCard), from the owner's weekly recap skill:
// - its header: "Week 7", the W-L as it stands, how many matchups are still in play, Provisional / Final, and Refresh;
//   it folds to that line, and the fold is remembered (KEYS.mls.thisWeekFolded);
// - the W-L split paid / free (the "Paid" switch in Reorder, saved on the league) and redraft / dynasty (keeper and
//   guillotine count with redraft);
// - "Still in play": the swing matchups, most uncertain first, each with both scores, the margin, your win chance from
//   the Matchup Simulator's math (sim/winChance.js) and the live players on each side; "Effectively decided" on one line;
// - every league's line (result, name, your points and theirs, the margin, the opponent), then the leagues without a
//   normal head-to-head (guillotine, no matchup this week, manual leagues) and any league whose matchups didn't load.
// The rules (who's live, what's a swing) are in week/scoreboard.js.
//
// Owner's choices (S21): it loads when the Dashboard opens (reusing what it loaded in the last 2 minutes) and with
// Refresh, never on a timer: run it before SNF, before MNF and after MNF. Matchups stay in memory (no storage key).
//
// Data: one GET /v1/league/<id>/matchups/<week> per Sleeper league, five at a time, for Sleeper's current `week`.
// They go into State.lineupActualPoints, the Lineup tab's per-league, per-week cache (lineup/gameInfo.js), widened to
// hold the whole response, so each fetch serves both. Team names, the league-median flag and guillotine come from
// the league (saved at sync since S21); a league synced before then reads them from Sleeper once per visit.
import { escapeHtml } from '../../shared/html.js';
import { KEYS } from '../../shared/storage/keys.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { getSleeperLeague, getSleeperLeagueRosters, getSleeperLeagueUsers, getSleeperMatchups, getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { State, refreshGameTimes } from '../state.js';
import { isBestBallLeague, isExcludedFromSimulation } from '../helpers.js';
import { fantasyPosition } from '../constants.js';
import { ensureLineupProjections, formatKickoffLabel, getLeagueScoringKey, hasKickedOff, storeLeagueMatchups } from '../lineup/gameInfo.js';
import { paidBadgeMarkup, weekResultMarkup, weekStatusMarkup } from '../badges.js';
import { matchupWinChances } from '../sim/winChance.js';
import {
    classifyMatchup, guillotinePlace, isGuillotine, medianPlace, ordinal, playsMedian, recordText, resultOf,
    sideSummary, summarize, swingOrder, teamNamesFrom,
} from './scoreboard.js';

const FRESH_MS = 2 * 60 * 1000;
const PARALLEL = 5;
const isSleeperLeague = (l) => l && l.leagueId && !/^(manual|handoff)_/.test(l.leagueId);
const CHEVRON = `<svg class="mls-lc-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const REFRESH_ICON = (spin) => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${spin ? ' class="sync-spinner"' : ''}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg>`;

// --- What this card last loaded (in memory) ---
const view = { week: null, loadedAt: 0, loading: null, failed: new Map(), chances: new Map(), chancesKey: '' };
// Leagues synced before S21: their names, median and guillotine flags, read from Sleeper once per visit.
const metaCache = new Map();

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
        gameState: team && State.gamesByTeam[team] ? State.gamesByTeam[team].state : null,
        onBye: !!team && ctx.week != null && getByeWeek(team, ctx.season) === ctx.week,
        out: isExcludedFromSimulation(p),
        // For the win chance, the Simulator's rule: his points so far once his game has kicked off.
        actual: typeof pts === 'number' && team && hasKickedOff({ team }) ? pts : null,
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
        kind: 'h2h', me, them, ...m, result: resultOf(m), bestBall, scoringKey: ctx.scoringKey,
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
    const week = State.currentNflWeek;
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
            await Promise.all([refreshGameTimes(), ensureLineupProjections(), getSleeperPlayerMap().catch(() => null)]);
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
    const built = buildRows();
    if (!weekStarted(built.rows)) return;
    const swings = built.rows.filter(r => r.res.kind === 'h2h' && r.res.status === 'swing');
    const key = swings.map(r => `${r.league.leagueId}:${r.res.me.points}:${r.res.them.points}:${r.res.me.live.length}:${r.res.them.live.length}`).join('|');
    if (!swings.length || key === view.chancesKey) return;
    view.chancesKey = key;
    view.chances = new Map(); // last scores' percents don't stay up beside new scores
    const toPlayers = (side) => side.starters.map(p => ({ id: p.id, pos: p.pos, team: p.team, actual: p.actual, projected: p.projected, excluded: p.out }));
    try {
        view.chances = await matchupWinChances(swings.map(r => ({ key: r.league.leagueId, scoringKey: r.res.scoringKey, mine: toPlayers(r.res.me), theirs: toPlayers(r.res.them) })),
            { season: State.currentNflSeason, week: State.currentNflWeek });
    } catch (e) {
        view.chances = new Map();
    }
    renderThisWeek();
}

// Every Sleeper league's result from the cache, in your league order.
function buildRows() {
    const week = State.currentNflWeek;
    const base = { week, season: State.currentNflSeason, playerMap: cachedPlayerMap || {}, projections: State.lineupProjections.week === week ? State.lineupProjections.data : null };
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

// --- Folding (remembered) ---
function isFolded() {
    try { return localStorage.getItem(KEYS.mls.thisWeekFolded) === '1'; } catch (e) { return false; }
}
export function toggleThisWeek() {
    const folded = !isFolded();
    try {
        if (folded) localStorage.setItem(KEYS.mls.thisWeekFolded, '1');
        else localStorage.removeItem(KEYS.mls.thisWeekFolded);
    } catch (e) { /* storage blocked: the fold just isn't remembered */ }
    renderThisWeek();
}

// --- Drawing ---
const fmt = (n) => (Number(n) || 0).toFixed(1);
const signed = (n) => n > 0 ? `+${fmt(n)}` : (n < 0 ? `−${fmt(-n)}` : '0.0');
const playerList = (players) => players.length
    ? players.map(p => `${escapeHtml(p.name)} <span class="mls-week-pos">${escapeHtml(p.pos)}</span>`).join(', ')
    : 'nobody left';

function weekStarted(rows) {
    if (Object.keys(State.gameTimesByTeam).some(team => hasKickedOff({ team }))) return true;
    return rows.some(r => r.res.kind === 'h2h' && (r.res.me.points !== 0 || r.res.them.points !== 0));
}
function weekFinal() {
    const teams = Object.keys(State.gamesByTeam);
    return teams.length > 0 && teams.every(t => State.gamesByTeam[t].state === 'post');
}
function firstKickoffLabel() {
    const times = Object.values(State.gameTimesByTeam).map(iso => new Date(iso).getTime()).filter(ms => !isNaN(ms)).sort((a, b) => a - b);
    return times.length ? formatKickoffLabel(new Date(times[0]).toISOString()) : '';
}

// Before kickoff a line names the opponent only: no result or score yet.
function lineHTML(r, started) {
    const l = r.league, res = r.res;
    const name = `<span class="mls-week-title-row">${l.paid ? paidBadgeMarkup() + ' ' : ''}<span class="mls-week-name">${escapeHtml(l.name || 'Unnamed league')}</span></span>`;
    const notes = [`vs ${escapeHtml(res.oppName)}`];
    if (res.median) notes.push(`median: ${ordinal(res.median.rank)} of ${res.median.of} (${res.median.above ? 'above' : 'below'})`);
    if (res.bestBall) notes.push('Best Ball');
    if (!started) return `<li class="mls-week-line"><span class="mls-week-line-main">${name}<span class="mls-week-line-notes">${notes.join(' · ')}</span></span></li>`;
    return `<li class="mls-week-line">
        ${weekResultMarkup(res.result)}
        <span class="mls-week-line-main">${name}<span class="mls-week-line-notes">${notes.join(' · ')}</span></span>
        <span class="mls-week-line-score"><span class="mls-week-pts">${fmt(res.me.points)}&ndash;${fmt(res.them.points)}</span><span class="mls-week-margin${res.margin < 0 ? ' is-behind' : ''}">${signed(res.margin)}</span></span>
    </li>`;
}

function swingHTML(r) {
    const l = r.league, res = r.res;
    const chance = view.chances.get(l.leagueId);
    const live = (side) => [...side.live, ...side.liveBench];
    return `<li class="mls-week-swing">
        <div class="mls-week-swing-head">
            <span class="mls-week-line-main">${l.paid ? paidBadgeMarkup() + ' ' : ''}<span class="mls-week-name">${escapeHtml(l.name || 'Unnamed league')}</span></span>
            <span class="mls-week-margin${res.margin < 0 ? ' is-behind' : ''}">${signed(res.margin)}</span>
        </div>
        <div class="mls-week-swing-score">You ${fmt(res.me.points)} &middot; ${escapeHtml(res.oppName)} ${fmt(res.them.points)}${chance != null ? `<span class="mls-week-chance">${Math.round(chance)}% to win</span>` : ''}</div>
        <div class="mls-week-swing-live"><span class="mls-week-side">You:</span> ${playerList(live(res.me))}</div>
        <div class="mls-week-swing-live"><span class="mls-week-side">Them:</span> ${playerList(live(res.them))}</div>
        ${res.bestBall ? '<div class="mls-week-swing-note">Best Ball: anyone on the roster with a game left can still count.</div>' : ''}
    </li>`;
}

export function renderThisWeek() {
    const el = document.getElementById('thisWeekCard');
    if (!el) return;
    const sleeperLeagues = (State.leagues || []).filter(isSleeperLeague);
    if (!sleeperLeagues.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const week = State.currentNflWeek;
    const loading = !!view.loading;
    const folded = isFolded();
    const refreshBtn = `<button type="button" class="btn-bare mls-week-refresh" data-action="refreshThisWeek"${loading ? ' disabled aria-busy="true"' : ''} aria-label="Refresh this week's scores">${REFRESH_ICON(loading)}<span>Refresh</span></button>`;

    if (week == null) {
        el.innerHTML = `<div class="mls-week-head"><span class="mls-week-title">This week</span><span class="mls-week-summary">Waiting for Sleeper's NFL week…</span></div>`;
        return;
    }

    const { rows } = buildRows();
    const h2h = rows.filter(r => r.res.kind === 'h2h');
    const started = weekStarted(rows);
    const final = started && weekFinal();
    const sum = summarize(h2h.map(r => ({ result: r.res.result, paid: !!r.league.paid, group: r.league.leagueType === 'dynasty' ? 'dynasty' : 'redraft', keeper: r.league.leagueType === 'keeper', status: r.res.status })));
    const pending = rows.some(r => r.res.kind === 'pending');

    let summary;
    if (pending && !h2h.length) summary = loading ? 'Loading matchups…' : 'Tap Refresh to load your matchups';
    else if (!started) summary = `starts ${firstKickoffLabel() || 'soon'}`;
    else summary = `${recordText(sum.all)}${sum.stillLive ? ` · ${sum.stillLive} still live` : ''}`;

    const head = `<div class="mls-week-head">
        <button type="button" class="btn-bare mls-week-fold" data-action="toggleThisWeek" aria-expanded="${folded ? 'false' : 'true'}" aria-controls="thisWeekBody">
            ${CHEVRON}<span class="mls-week-title">Week ${week}</span><span class="mls-week-summary">${summary}</span>
        </button>
        ${started && h2h.length ? weekStatusMarkup(final) : ''}
        ${refreshBtn}
    </div>`;
    if (folded) { el.innerHTML = head; el.classList.add('is-collapsed'); return; }
    el.classList.remove('is-collapsed');

    const parts = [];
    if (started && h2h.length) {
        const anyPaid = sleeperLeagues.some(l => l.paid);
        parts.push(`<p class="mls-week-splits">${anyPaid ? `Paid ${recordText(sum.paid)} · Free ${recordText(sum.free)}` : '<span class="text-helper">Mark the leagues you pay for (Reorder, then Paid) to split paid and free.</span>'}</p>`);
        parts.push(`<p class="mls-week-splits">Redraft ${recordText(sum.redraft)} · Dynasty ${recordText(sum.dynasty)}${sum.keeper ? ' <span class="text-helper">(keeper counts with redraft)</span>' : ''}</p>`);
        const swings = h2h.filter(r => r.res.status === 'swing').map(r => ({ ...r, margin: r.res.margin, winChance: view.chances.get(r.league.leagueId) ?? null }))
            .sort(swingOrder);
        if (swings.length) parts.push(`<h4 class="mls-week-sub">Still in play</h4><ul class="mls-week-swings">${swings.map(swingHTML).join('')}</ul>`);
        const decided = h2h.filter(r => r.res.status !== 'swing');
        if (decided.length) {
            const w = decided.filter(r => r.res.result === 'W').length, ls = decided.filter(r => r.res.result === 'L').length;
            const label = final ? 'Done' : 'Effectively decided';
            parts.push(`<p class="mls-week-decided"><strong>${label}:</strong> ${decided.length} (${w} W, ${ls} L${decided.length - w - ls ? `, ${decided.length - w - ls} T` : ''})</p>`);
        }
    } else if (!started && h2h.length) {
        parts.push(`<p class="text-helper mls-week-splits">No games have kicked off yet. The scores fill in once they do.</p>`);
    }
    if (h2h.length) {
        parts.push(`<h4 class="mls-week-sub">All leagues</h4><ul class="mls-week-lines">${h2h.map(r => lineHTML(r, started)).join('')}</ul>`);
    }

    // Leagues without a normal head-to-head, and any that didn't load.
    const notes = [];
    rows.filter(r => r.res.kind === 'guillotine').forEach(r => {
        const g = r.res.place, name = escapeHtml(r.league.name || 'Unnamed league');
        const live = r.res.me.live.length;
        const text = !g ? 'your team has been chopped'
            : g.rank === g.of ? `${fmt(r.res.me.points)}, lowest of ${g.of} alive, ${fmt(-g.cushion)} behind the next team`
            : `${fmt(r.res.me.points)}, ${ordinal(g.rank)} of ${g.of} alive, ${fmt(g.cushion)} above the lowest`;
        notes.push(`<li>${r.league.paid ? paidBadgeMarkup() + ' ' : ''}<strong>${name}</strong> &middot; Guillotine (no opponent): ${text}${g && live ? ` &middot; ${live} live` : ''}</li>`);
    });
    const nomatch = rows.filter(r => r.res.kind === 'nomatch');
    if (nomatch.length) notes.push(`<li>No matchup this week: ${nomatch.map(r => escapeHtml(r.league.name || 'Unnamed league')).join(', ')}</li>`);
    const missing = rows.filter(r => r.res.kind === 'missing');
    if (missing.length) notes.push(`<li>Your team wasn't found (sync the league again): ${missing.map(r => escapeHtml(r.league.name || 'Unnamed league')).join(', ')}</li>`);
    const offSleeper = (State.leagues || []).filter(l => !isSleeperLeague(l)).length;
    if (offSleeper) notes.push(`<li>${offSleeper} manual league${offSleeper === 1 ? '' : 's'}: no Sleeper matchup to show</li>`);
    const failed = sleeperLeagues.filter(l => view.failed.get(l.leagueId));
    if (failed.length) notes.push(`<li class="mls-week-failed">Couldn't load from Sleeper: ${failed.map(l => escapeHtml(l.name || 'Unnamed league')).join(', ')}. Tap Refresh to try again.</li>`);
    if (notes.length) parts.push(`<ul class="mls-week-notes">${notes.join('')}</ul>`);
    if (started && h2h.length && !Object.keys(State.gamesByTeam).length) parts.push(`<p class="text-helper mls-week-foot">Game status didn't load, so everyone still counts as live.</p>`);
    else if (final) parts.push(`<p class="text-helper mls-week-foot">Every game is final. Sleeper can still correct stats in the next few days.</p>`);

    el.innerHTML = `${head}<div class="mls-week-body" id="thisWeekBody">${parts.join('')}</div>`;
}
