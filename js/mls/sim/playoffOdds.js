// --- PLAYOFF CHANCES: EVERY LEAGUE'S, AFTER THE FIRST PAINT (improvements S55) ---
// Each Sleeper league's chance to make the playoffs, get a first-round bye and win the title, from 10,000 runs of the
// rest of its regular season and its bracket (sim/playoffs.js, in sim/playoffWorker.js). Shown on the Dashboard's
// league cards (round 2: left out of a folded card once you're eliminated), the Roster tab's record line and the
// Playoff picture table under Power Rankings (owner's choices).
//
// The inputs: what sync saved (league.playoffs, leagues/playoffData.js: standings, the weeks left, every roster), and
// each team's weekly mean and spread (sim/playoffStrength.js): its best lineup by Sleeper's projections for the first
// PROJECTED_WEEKS weeks left (one download per week, shared by every league), later weeks and the bracket from those
// weeks' average, and points for so far when there are no projections (a week's download failed, or nobody's projected).
//
// Runs once per sync of a league, in memory (nothing saved), after the page has drawn: schedulePlayoffOdds() from the
// Dashboard's and the Roster tab's redraws. When numbers arrive, 'mls-playoff-odds' fires on document and those views
// redraw. "Clinched" and "Eliminated" only when the records prove it (playoffCertainty); otherwise a percent, never
// 0% or 100% (they read "<1%" and ">99%").
import { getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { getPlayerWeeklyScoreHistory, getWeeklyProjections } from '../../shared/api/sleeperStats.js';
import { escapeHtml } from '../../shared/html.js';
import { State } from '../state.js';
import { fantasyPosition } from '../constants.js';
import { FOLD_CHEVRON, getLeagueScoringKey } from '../lineup/gameInfo.js';
import { MIN_RELIABLE_GAMES } from './stats.js';
import { playoffCertainty } from './playoffs.js';
import { LASTING_SD, pointsForStrength, projectedStrength } from './playoffStrength.js';

export const RUNS = 10000;
const PROJECTED_WEEKS = 3;
const WORKER_TIMEOUT_MS = 20000;
export const ODDS_EVENT = 'mls-playoff-odds';

const results = new Map(); // leagueId -> { key, odds, byes, certain }
const projections = new Map(); // week -> Promise<data | null>
let running = null, again = false;

const keyOf = (l) => `${l.lastSyncedAt || ''}|${l.playoffs ? l.playoffs.firstWeek : ''}`;

function projectionsFor(week) {
    if (State.lineupProjections && State.lineupProjections.week === week && State.lineupProjections.data) return Promise.resolve(State.lineupProjections.data);
    if (!projections.has(week)) {
        const p = getWeeklyProjections(State.currentNflSeason || undefined, week).catch(() => null);
        projections.set(week, p);
        p.then(d => { if (!d) projections.delete(week); }); // a failed week is asked again next time
    }
    return projections.get(week);
}

let worker = null;
function runInWorker(input) {
    return new Promise((resolve) => {
        let w;
        try {
            if (!worker) worker = new Worker(new URL('./playoffWorker.js', import.meta.url), { type: 'module' });
            w = worker;
        } catch (e) { resolve(null); return; }
        const id = Math.random();
        const done = (v) => { clearTimeout(timer); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); resolve(v); };
        const onMsg = (e) => { if (e.data && e.data.id === id) done(e.data.result || null); };
        const onErr = (e) => { if (e && e.preventDefault) e.preventDefault(); worker = null; done(null); };
        const timer = setTimeout(() => { worker = null; try { w.terminate(); } catch (e) { /* gone */ } done(null); }, WORKER_TIMEOUT_MS);
        w.addEventListener('message', onMsg);
        w.addEventListener('error', onErr);
        w.postMessage({ id, input });
    });
}

const weeksLeftOf = (po) => Math.max(0, po.start - po.firstWeek);
const isPending = (l) => l && l.playoffs && weeksLeftOf(l.playoffs) > 0 && (!results.has(l.leagueId) || results.get(l.leagueId).key !== keyOf(l));

// One league's simulation input. data: { playerMap, proj: Map week -> projections, history: Map scoringKey -> {id: []} }.
export function buildInput(l, { playerMap = {}, proj = new Map(), history = new Map() } = {}, runs = RUNS) {
    const po = l.playoffs;
    const key = getLeagueScoringKey(l);
    const hist = history.get(key) || {};
    const posOf = (id) => (playerMap[id] ? fantasyPosition(playerMap[id]) : null);
    const teamOf = (id) => (playerMap[id] ? playerMap[id].team || null : null);
    const weeksPlayed = po.firstWeek - 1;
    const fallback = {};
    po.standings.forEach(s => { fallback[s.rid] = pointsForStrength(s.pf, weeksPlayed) || [0, 0]; });
    const projected = new Map(po.standings.map(s => [s.rid, []]));
    const weeks = [];
    for (let w = po.firstWeek; w < po.start; w++) {
        const data = proj.get(w);
        const strength = {};
        po.standings.forEach(s => {
            const got = data ? projectedStrength(l.starterSlots, po.players[s.rid] || [], {
                projOf: (id) => (data[id] ? data[id][key] : undefined), posOf, teamOf, historyOf: (id) => hist[id] || [],
            }) : null;
            if (got) projected.get(s.rid).push(got);
            strength[s.rid] = got || null;
        });
        weeks.push({ week: w, games: po.schedule[w] || [], strength });
    }
    // A team's usual week: the average of its projected weeks, else its points for.
    const usual = {};
    projected.forEach((list, rid) => {
        usual[rid] = list.length ? [list.reduce((a, x) => a + x[0], 0) / list.length, list.reduce((a, x) => a + x[1], 0) / list.length] : fallback[rid];
    });
    weeks.forEach(w => po.standings.forEach(s => { if (!w.strength[s.rid]) w.strength[s.rid] = usual[s.rid]; }));
    return {
        teams: po.standings, weeks, median: po.median, playoffTeams: po.teams, divisions: po.divisions,
        playoffStrength: usual, lastingSd: LASTING_SD, runs,
    };
}

async function compute() {
    const leagues = (State.leagues || []).filter(isPending);
    if (!leagues.length) return;
    let playerMap = {};
    try { playerMap = (await getSleeperPlayerMap()) || {}; } catch (e) { /* positions unknown: points for only */ }
    const weeks = new Set();
    leagues.forEach(l => { for (let w = l.playoffs.firstWeek; w < Math.min(l.playoffs.start, l.playoffs.firstWeek + PROJECTED_WEEKS); w++) weeks.add(w); });
    const proj = new Map();
    await Promise.all([...weeks].map(async w => { const d = await projectionsFor(w); if (d) proj.set(w, d); }));
    // Each starter's past weeks, for his spread (one request per scoring format, as the This week card's chances).
    const history = new Map();
    const season = State.currentNflSeason;
    if (season && proj.size) {
        for (const key of new Set(leagues.map(getLeagueScoringKey))) {
            const ofKey = leagues.filter(l => getLeagueScoringKey(l) === key);
            const ids = [...new Set(ofKey.flatMap(l => Object.values(l.playoffs.players).flat()))];
            const through = Math.min(...ofKey.map(l => l.playoffs.firstWeek));
            try {
                const { blended } = await getPlayerWeeklyScoreHistory(ids, season, through, key, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES });
                history.set(key, blended || {});
            } catch (e) { /* the Simulator's fallback spread */ }
        }
    }
    // About 0.1 s a league in the worker on a phone (4x-slowed CPU), so 20 leagues take 2-3 s: the views redraw as
    // leagues come in, at most once a second (a Dashboard redraw with 20 leagues isn't free), and once at the end.
    let lastShown = Date.now(), unshown = false;
    const show = () => { lastShown = Date.now(); unshown = false; document.dispatchEvent(new CustomEvent(ODDS_EVENT)); };
    for (const l of leagues) {
        const k = keyOf(l);
        const input = buildInput(l, { playerMap, proj, history });
        const out = await runInWorker(input);
        if (!out) continue;
        const certain = playoffCertainty({ teams: l.playoffs.standings, weeksLeft: weeksLeftOf(l.playoffs), median: l.playoffs.median, playoffTeams: l.playoffs.teams, divisions: l.playoffs.divisions });
        results.set(l.leagueId, { key: k, odds: out.odds, byes: out.byes, certain });
        unshown = true;
        if (Date.now() - lastShown > 1000) show();
    }
    if (unshown) show();
}

// Starts a run after the page has drawn, unless every league's numbers are current. Safe to call on every redraw.
export function schedulePlayoffOdds() {
    if (!(State.leagues || []).some(isPending)) return;
    if (running) { again = true; return; }
    running = new Promise(resolve => {
        const go = () => compute().catch(err => console.warn('Playoff chances did not run.', err)).finally(() => {
            running = null;
            resolve();
            if (again) { again = false; schedulePlayoffOdds(); }
        });
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0));
        else setTimeout(go, 0);
    });
}

/**
 * The numbers for one team (yours unless rid is given), or null when there are none (yet).
 * { playoff, bye, title (shares 0-1), clinched, eliminated, byes (how many the bracket has) }.
 */
export function playoffOddsFor(l, rid = l && l.rosterId) {
    const r = l && results.get(l.leagueId);
    if (!r || r.key !== keyOf(l) || rid == null || !r.odds[rid]) return null;
    return { ...r.odds[rid], ...(r.certain[rid] || {}), byes: r.byes };
}

// "72%", "<1%", ">99%" (10,000 runs that never missed, or never hit, aren't proof).
export function pctText(share) {
    const p = share * 100;
    if (p < 0.5) return '<1%'; // none in 10,000 runs isn't proof either
    if (p >= 99.5) return '>99%';
    return `${Math.round(p)}%`;
}

// The playoff number in the shared chance colors: green when favored (50% or more), red when not.
export function playoffChanceHTML(o) {
    if (o.clinched) return '<span class="mls-week-chance is-fav">Clinched</span>';
    if (o.eliminated) return '<span class="mls-week-chance is-dog">Eliminated</span>';
    return `<span class="mls-week-chance ${o.playoff >= 0.5 ? 'is-fav' : 'is-dog'}">${pctText(o.playoff)}</span>`;
}

export const ODDS_TITLE = `From ${RUNS.toLocaleString('en-US')} runs of the rest of the regular season and the bracket, with each team's best lineup by Sleeper's projections (points so far when there are none). As of your last sync. Clinched and Eliminated only when the records make it certain.`;

// The Dashboard card's line: "Playoffs 72% · Bye 18% · Title 9%", or "Playoffs Eliminated".
export function cardOddsHTML(l) {
    const o = playoffOddsFor(l);
    if (!o) return '';
    const parts = [`<span class="mls-lc-odds-part">Playoffs ${playoffChanceHTML(o)}</span>`];
    if (!o.eliminated) {
        if (o.byes > 0) parts.push(`<span class="mls-lc-odds-part">Bye <strong>${pctText(o.bye)}</strong></span>`);
        parts.push(`<span class="mls-lc-odds-part">Title <strong>${pctText(o.title)}</strong></span>`);
    }
    // Once you're out, a folded card leaves the line out (owner's choice, round 2: nothing left to watch); open, it shows.
    return `<p class="mls-lc-odds${o.eliminated ? ' is-out' : ''}" title="${escapeHtml(ODDS_TITLE)}">${parts.join('<span class="mls-lc-sep" aria-hidden="true"> · </span>')}</p>`;
}

// The current seeding: record (a tie counts half), then points for; with divisions, each division's leader first, as
// Sleeper seeds them (and as scoreboard.js's seasonRecord does).
export function currentSeeds(po) {
    const ws = (t) => t.w + t.t / 2;
    const table = po.standings.slice().sort((a, b) => (ws(b) - ws(a)) || (b.pf - a.pf) || (a.rid - b.rid));
    if (!po.divisions) return table;
    const leaders = [];
    table.forEach(t => { if (!leaders.some(x => x.div === t.div)) leaders.push(t); });
    return leaders.concat(table.filter(t => !leaders.includes(t)));
}

// The Roster tab's Playoff picture (owner's choice, round 2: its own table under Power Rankings, not three more columns
// in it, which crowded phones; in standings order, with the playoff line; a fold, open on each visit). '' without
// numbers.
export function playoffPictureHTML(l) {
    const r = l && l.playoffs && results.get(l.leagueId);
    if (!r || r.key !== keyOf(l)) return '';
    const po = l.playoffs;
    const left = weeksLeftOf(po);
    const dash = '<span class="text-helper">\u2013</span>';
    const rows = currentSeeds(po).map((t, k) => {
        const o = playoffOddsFor(l, t.rid);
        if (!o) return '';
        const more = (share) => (o.eliminated ? dash : pctText(share));
        const line = k === po.teams && k > 0 ? ' class="mls-pp-first-out"' : '';
        const you = t.rid === l.rosterId;
        const rec = `${t.w}\u2013${t.l}${t.t ? `\u2013${t.t}` : ''}`;
        return `<tr${line}${you ? ' data-you' : ''}><td class="mls-pp-team">${escapeHtml(po.owners[t.rid] || `Team ${t.rid}`)}</td><td class="mls-pp-num">${rec}</td>`
            + `<td class="mls-pp-num">${playoffChanceHTML(o)}</td>${r.byes ? `<td class="mls-pp-num">${more(o.bye)}</td>` : ''}<td class="mls-pp-num">${more(o.title)}</td></tr>`;
    }).join('');
    const facts = [`${left} week${left === 1 ? '' : 's'} left`, `top ${po.teams} make it`];
    if (po.divisions) facts.push('division leaders seeded first');
    return `<details class="mls-change-fold mls-pp" open>
        <summary>${FOLD_CHEVRON}<span>Playoff picture</span><span class="mls-pp-facts">${facts.join(' \u00b7 ')}</span></summary>
        <div class="mls-pp-wrap"><table class="mls-pp-table">
            <thead><tr><th class="mls-pp-team">Team</th><th class="mls-pp-num">Record</th><th class="mls-pp-num" title="${escapeHtml(ODDS_TITLE)}">Playoffs</th>${r.byes ? '<th class="mls-pp-num" title="A first-round bye">Bye</th>' : ''}<th class="mls-pp-num" title="Winning the title">Title</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        <p class="mls-pp-note">Seeded as things stand; the dashed line is the playoff cut. From ${RUNS.toLocaleString('en-US')} runs of the weeks left and the bracket with Sleeper's projections, as of your last sync.</p>
    </details>`;
}

// Draws (or hides) the Playoff picture under Power Rankings for the active league.
export function renderPlayoffPicture(l) {
    const el = typeof document !== 'undefined' ? document.getElementById('playoffPicture') : null;
    if (!el) return;
    const html = playoffPictureHTML(l);
    // A redraw keeps the fold as you left it this visit.
    const fold = el.querySelector('details.mls-pp');
    const wasClosed = fold && !fold.open && el.dataset.leagueId === (l && l.leagueId);
    el.innerHTML = html;
    el.dataset.leagueId = (l && l.leagueId) || '';
    if (wasClosed) el.querySelector('details.mls-pp')?.removeAttribute('open');
    el.hidden = !html;
}
