// T-Score page: the In-Season tab (improvements T1). Rest-of-season projections for WR, RB and TE from the owner's
// sheet "T-Score In-Season (public)", one tab per position plus Model Weights, each published to the web as CSV (no
// API key; the request goes through mdsFetch for its timeout, like the preseason sheets in main.js).
//
// On page open: draw the copy saved by the last load (KEYS.tscore.inSeasonCache) at once, then fetch the four CSVs
// and redraw. Offline, or when Google doesn't answer, the saved copy stays with a line saying so. A tab that loads
// but lacks a column the table needs shows a plain message (and keeps that position's last good data, if any).
// "Sync with most recent data" fetches again. Draft Strategist never reads this data: its T-Score badges stay on
// the preseason model (main.js's tscore_cache).
import { escapeHtml } from '../shared/html.js';
import { KEYS } from '../shared/storage/keys.js';
import { mdsFetch } from '../shared/net.js';
import { getFreshness } from '../shared/freshness.js';
import { IN_SEASON_POSITIONS, parseInSeasonPlayers, parseInSeasonWeights, inSeasonLabel, labelCutoffs, DEFAULT_LINES, DEPTH_LABEL } from './inSeasonParse.js';

const SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRr7BzWeODc_BSDvhRfj2h53ETFKgtoeQKKWSvUVrX7jPEei5ctHVKX7Coqx9apmBAhKEkzkNZpCe_M/pub';
export const IN_SEASON_URLS = {
    wr: `${SHEET}?gid=0&single=true&output=csv`,
    rb: `${SHEET}?gid=1&single=true&output=csv`,
    te: `${SHEET}?gid=2&single=true&output=csv`,
    weights: `${SHEET}?gid=3&single=true&output=csv`,
};

const POS_LABEL = { wr: 'WR', rb: 'RB', te: 'TE' };

const state = {
    data: { wr: null, rb: null, te: null, weights: null, fetchedAt: null }, // what's on screen (saved copy or fresh)
    errors: {},          // per position (and 'weights'): a message from the last fetch that read the tab but couldn't use it
    loading: false,
    offline: false,      // the last fetch reached none of the four tabs
    pos: 'wr',
    buySellOnly: false,
};

const $ = (id) => document.getElementById(id);

function readCache() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEYS.tscore.inSeasonCache) || 'null');
        if (saved && typeof saved === 'object') {
            for (const k of [...IN_SEASON_POSITIONS, 'weights']) if (saved[k]) state.data[k] = saved[k];
            state.data.fetchedAt = Number(saved.fetchedAt) || null;
        }
    } catch (e) { /* a broken copy is the same as none: the fetch replaces it */ }
}

function writeCache() {
    try { localStorage.setItem(KEYS.tscore.inSeasonCache, JSON.stringify(state.data)); } catch (e) { /* full or blocked: it just isn't saved */ }
}

async function fetchRows(url) {
    const res = await mdsFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return Papa.parse(text.trim(), { skipEmptyLines: true }).data;
}

/** Fetches all four tabs and redraws. Never throws; what went wrong is drawn on the tab. */
export async function refreshInSeason() {
    if (state.loading) return;
    state.loading = true;
    render();
    const keys = [...IN_SEASON_POSITIONS, 'weights'];
    const results = await Promise.allSettled(keys.map(k => fetchRows(IN_SEASON_URLS[k])));
    let reached = 0;
    let anyGood = false;
    results.forEach((r, i) => {
        const k = keys[i];
        if (r.status === 'rejected') return; // unreachable (offline, timeout, an HTTP error): keep what's on screen
        reached++;
        try {
            state.data[k] = k === 'weights' ? parseInSeasonWeights(r.value) : parseInSeasonPlayers(r.value, k);
            delete state.errors[k];
            anyGood = true;
        } catch (err) {
            state.errors[k] = err.message;
        }
    });
    state.offline = reached === 0;
    if (anyGood) { state.data.fetchedAt = Date.now(); writeCache(); }
    state.loading = false;
    render();
}

const ARROW_UP = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>';
const ARROW_DOWN = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';

const num = (n) => (n === null || n === undefined ? '–' : Number(n).toFixed(2));

function moveHTML(move) {
    if (move === null || move === undefined) return '<span class="tscore-move is-flat">–</span>';
    if (move > 0) return `<span class="tscore-move is-up">${ARROW_UP}<span class="sr-only">Up </span>${move}</span>`;
    if (move < 0) return `<span class="tscore-move is-down">${ARROW_DOWN}<span class="sr-only">Down </span>${-move}</span>`;
    return '<span class="tscore-move is-flat"><span class="sr-only">No change</span><span aria-hidden="true">–</span></span>';
}

function buySellHTML(bs) {
    if (bs === 'Buy') return '<span class="tscore-chip tscore-chip-buy">Buy</span>';
    if (bs === 'Sell') return '<span class="tscore-chip tscore-chip-sell">Sell</span>';
    return '';
}

// The model's Buy/Sell line for a position (Model Weights), which also sets the label cutoffs.
const lineFor = (pos) => state.data.weights?.byPos?.[pos]?.line || DEFAULT_LINES[pos];

function rowHTML(p, line) {
    const { label, cls } = p.label || inSeasonLabel(p.rank, line);
    return `<tr><td>${p.rank}</td><td><strong>${escapeHtml(p.name)}</strong></td><td><span class="${cls}">${escapeHtml(label)}</span></td><td>${escapeHtml(p.team)}</td><td>${num(p.rosPpg)}</td><td>${num(p.fpg)}</td><td>${escapeHtml(p.targetShare)}</td><td>${moveHTML(p.move)}</td><td>${buySellHTML(p.buySell)}</td></tr>`;
}

function weightsHTML() {
    const w = state.data.weights;
    if (!w) {
        return `<p class="tscore-inseason-note">${escapeHtml(state.errors.weights || (state.loading ? 'Loading the model’s weights…' : 'The model’s weights couldn’t load.'))}</p>`;
    }
    const rows = IN_SEASON_POSITIONS.filter(p => w.byPos[p]).map(p => {
        const x = w.byPos[p];
        return `<tr><td>${POS_LABEL[p]}</td><td>${num4(x.intercept)}</td><td>${num4(x.xfp)}</td><td>${num4(x.fpoe)}</td><td>${num4(x.lastSeason)}</td><td>${num4(x.noPrior)}</td><td>${x.r2 === null ? '–' : x.r2.toFixed(2)}</td><td>${x.line ?? '–'}</td></tr>`;
    }).join('');
    const span = (from, to) => (to < from ? '–' : from === to ? `${from}` : `${from}–${to}`);
    const cuts = Object.fromEntries(IN_SEASON_POSITIONS.map(p => [p, labelCutoffs(lineFor(p))]));
    const labelRows = [...cuts.wr.map((b, i) => [b.label, b.cls, i]), [DEPTH_LABEL.label, DEPTH_LABEL.cls, -1]].map(([label, cls, i]) => {
        const cell = (p) => {
            if (i === -1) return `${lineFor(p) + 1}+`;
            const from = i === 0 ? 1 : cuts[p][i - 1].maxRank + 1;
            return span(from, cuts[p][i].maxRank);
        };
        return `<tr><td><span class="${cls}">${label}</span></td>${IN_SEASON_POSITIONS.map(p => `<td>${cell(p)}</td>`).join('')}</tr>`;
    }).join('');
    const lines = IN_SEASON_POSITIONS.filter(p => w.byPos[p]?.line).map(p => `${POS_LABEL[p]} ${w.byPos[p].line}`).join(', ');
    return `
        <p class="tscore-inseason-note">ROS PPG = Intercept + XFP/G × weight + FPOE/G × weight + Last-season PPG × weight. A player with no qualifying last season (a rookie, or under 4 games) gets the no-prior adjustment in place of the last-season term.${w.fitWeek ? ` The weights were fit after week ${w.fitWeek}.` : ''}</p>
        ${state.errors.weights ? `<p class="tscore-inseason-note">${escapeHtml(state.errors.weights)} These are the last weights that loaded.</p>` : ''}
        <div class="data-table-wrapper" style="margin-bottom: 1rem;">
            <table class="data-table tscore-weights-table">
                <thead><tr><th>Pos</th><th>Intercept</th><th>XFP/G</th><th>FPOE/G</th><th>Last-season PPG</th><th>No-prior adj.</th><th>R²</th><th>Buy/Sell line</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <ul class="tscore-inseason-terms">
            <li><strong>XFP/G:</strong> expected fantasy points per game, from the player's usage this season (targets, carries and where they happen).</li>
            <li><strong>FPOE/G:</strong> fantasy points over expected per game, how much more (or less) he scores than that usage predicts.</li>
            <li><strong>Last-season PPG:</strong> his full-PPR points per game last season.</li>
            <li><strong>Move:</strong> his ROS rank against his rank so far this season (YTD). Up means projected to finish higher than he has scored.</li>
            <li><strong>Labels:</strong> the preseason tabs' tiers, by ROS rank: the top 5%, 10%, 20%, 35% and 50% of each position's fantasy-relevant pool (twice its Buy/Sell line), so Flex Play ends at the line and Depth Player starts past it.</li>
            <li><strong>Buy / Sell:</strong> Buy is outside the line by YTD rank but projected inside it by ROS rank; Sell is inside now but projected outside it.${lines ? ` Lines: ${lines}.` : ''}</li>
        </ul>
        <div class="data-table-wrapper" style="margin-bottom: 0;">
            <table class="data-table tscore-labels-table">
                <thead><tr><th>Label</th><th>WR</th><th>RB</th><th>TE</th></tr></thead>
                <tbody>${labelRows}</tbody>
            </table>
        </div>`;
}

const num4 = (n) => (n === null || n === undefined ? '–' : Number(n).toFixed(4));

function statusText() {
    if (state.loading) return state.data.fetchedAt ? 'Checking for newer rankings…' : 'Loading the latest rankings…';
    const fresh = getFreshness(state.data.fetchedAt, Infinity);
    if (state.offline) {
        return fresh ? `Couldn’t reach the sheet, so these are the last rankings that loaded (${fresh.detail}).` : '';
    }
    return fresh ? fresh.detail : '';
}

function render() {
    const body = $('inSeasonBody');
    if (!body) return;
    const pos = state.pos;
    const players = state.data[pos];
    const err = state.errors[pos];

    $('inSeasonStatus').textContent = statusText();
    const week = state.data.weights?.fitWeek;
    $('inSeasonWeek').textContent = week ? `Projected after week ${week}.` : '';

    let message = '';
    if (err) message = players ? `${err} Showing the last ${POS_LABEL[pos]} rankings that loaded.` : err;
    else if (!players && !state.loading && state.offline) message = 'The in-season rankings couldn’t load. Check your connection, then tap Sync with most recent data.';
    else if (!players && !state.loading) message = `No ${POS_LABEL[pos]} rankings yet.`;
    const msgEl = $('inSeasonMessage');
    msgEl.textContent = message;
    msgEl.hidden = !message;

    $('inSeasonTableWrap').hidden = !players;
    if (players) {
        const shown = state.buySellOnly ? players.filter(p => p.buySell) : players;
        body.innerHTML = shown.length
            ? shown.map(p => rowHTML(p, lineFor(pos))).join('')
            : `<tr><td colspan="9" class="tscore-inseason-empty">No Buy or Sell calls at ${POS_LABEL[pos]} right now.</td></tr>`;
    } else {
        body.innerHTML = '';
    }

    const weightsEl = $('inSeasonWeights');
    if (weightsEl) weightsEl.innerHTML = weightsHTML();
}

export function switchInSeasonPos(pos) {
    if (!IN_SEASON_POSITIONS.includes(pos)) return;
    state.pos = pos;
    document.querySelectorAll('#inSeasonTab .pos-toggle-btn').forEach(btn => {
        const on = btn.dataset.pos === pos;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    render();
}

export function toggleBuySellOnly(btn) {
    state.buySellOnly = !state.buySellOnly;
    if (btn) {
        btn.setAttribute('aria-pressed', state.buySellOnly ? 'true' : 'false');
        btn.classList.toggle('active', state.buySellOnly);
    }
    render();
}

/** Draws the saved copy, then fetches the latest. Called once, on DOMContentLoaded. */
export function initInSeason() {
    if (!$('inSeasonBody')) return;
    readCache();
    render();
    refreshInSeason();
}
