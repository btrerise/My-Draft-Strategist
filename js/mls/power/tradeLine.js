// --- ROSTER TAB: WHAT A PAST TRADE DID TO YOUR POWER RANKINGS (improvements S29) ---
// The box under the Power Rankings strip (#rosterTradeLine): a trade in the active Sleeper league, picked from the
// season's trades (your newest first shown), and each team's ranks right before → right after it. The math is in
// power/pastTrades.js; the scoring is computePositionalPower with the strip's own rankings, so the numbers are the
// Roster tab's and, for a trade before it happened, the Trade Analyzer's.
//
// Owner's choices (LOG, S29): trades only; any trade this season, from a drop-down; under the strip; a line for the
// other team too; each trade on its own (later moves undone), not "before → today".
//
// Sleeper is asked only for the active Sleeper league, when the Roster tab is showing, once per visit (weeks 1 to the
// current one, in parallel). Nothing is stored. A manual league, no trades, or an error: no box, and no toast.
import { escapeHtml } from '../../shared/html.js';
import { normalizeName } from '../../shared/names.js';
import { getSleeperPlayerMap, getSleeperTransactions } from '../../shared/api/sleeper.js';
import { fantasyPosition } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { computePositionalPower } from './shared.js';
import { completedMoves, defaultTradeId, leaguesAroundMove, makeOwnerOf, moveTime, rankChanges, tradeEntries } from './pastTrades.js';

const loads = new Map();   // leagueId -> { status: 'loading' | 'done' | 'error', moves, rosterMap: the rosters it was read for }
const picked = new Map();  // leagueId -> the trade picked in the drop-down, for this visit
let lastCtx = null;        // what refreshPowerRankings last passed, to draw again when a load lands
let playerMap = null;

const box = () => document.getElementById('rosterTradeLine');
function hide() {
    const el = box();
    if (!el) return;
    el.innerHTML = '';
    el.hidden = true;
}
const rosterTabShowing = () => {
    const tab = document.getElementById('rosterTab');
    return !!(tab && tab.classList.contains('active'));
};

// Every week of this season so far, then the player map (cached by the app already, for the sync).
function load(league, weeks) {
    const entry = { status: 'loading', moves: [], rosterMap: league.globalRosterMap };
    loads.set(league.leagueId, entry);
    const lists = Array.from({ length: weeks }, (_, i) => getSleeperTransactions(league.leagueId, i + 1));
    Promise.all([Promise.all(lists), getSleeperPlayerMap()]).then(([weekly, map]) => {
        playerMap = map;
        entry.moves = completedMoves(weekly);
        entry.status = 'done';
    }).catch((e) => {
        entry.status = 'error';
        console.warn("Couldn't load this league's trades from Sleeper.", e);
    }).finally(() => {
        // Draw now if this league is still the one on screen.
        const active = getActiveLeague();
        if (lastCtx && active && active.leagueId === league.leagueId && rosterTabShowing()) renderPastTradeLine(lastCtx);
    });
}

// ctx: { league, src (the strip's rankings: resolvePowerRankingsSource), future } or null to hide.
export function renderPastTradeLine(ctx) {
    lastCtx = ctx;
    const league = ctx && ctx.league;
    if (!league || !ctx.src || !league.leagueId || !league.teamNames || league.rosterId == null) { hide(); return; }
    let entry = loads.get(league.leagueId);
    // A re-sync replaces the league's rosters, and may bring moves this visit's list hasn't seen: ask again.
    if (entry && entry.rosterMap !== league.globalRosterMap && entry.status !== 'loading') { loads.delete(league.leagueId); entry = null; }
    if (!entry) {
        const week = Number(State.currentNflWeek);
        // Only once the Roster tab is open and the week is known (it arrives at start-up and redraws this tab).
        if (rosterTabShowing() && week >= 1) load(league, Math.min(week, 18));
        hide();
        return;
    }
    if (entry.status !== 'done') { hide(); return; }

    const playerOf = (pid) => {
        const p = playerMap && playerMap[pid];
        if (!p) return null;
        const name = `${p.first_name} ${p.last_name}`;
        return { cleanName: normalizeName(name), name, pos: fantasyPosition(p) || 'FLEX' };
    };
    const deps = { ownerOf: makeOwnerOf(league), playerOf };
    // Today's rosters are the last sync's: a move Sleeper made after it isn't in them, so it's neither undone nor listed.
    const synced = Number(league.lastSyncedAt) || 0;
    const moves = synced ? entry.moves.filter(tx => moveTime(tx) <= synced) : entry.moves;
    const trades = tradeEntries(moves, deps).filter(t => t.teams.length >= 2);
    const id = defaultTradeId(trades, picked.get(league.leagueId));
    if (!id) { hide(); return; }
    const trade = trades.find(t => t.id === id);
    // Each team's new players best first, by the same rankings (Sleeper lists them by player id); picks after them.
    const rankOf = new Map((ctx.src.rankings || []).map(r => [r.cleanName || normalizeName(r.name || ''), Number(r.rank) || 999]));
    const order = (name) => rankOf.get(normalizeName(name)) ?? 9999;
    Object.values(trade.gets).forEach(list => list.sort((a, b) => order(a) - order(b)));
    const around = leaguesAroundMove(league, moves, id, deps);
    if (!around) { hide(); return; }

    const opts = { future: ctx.future || null, startRankings: ctx.src.start, futureRankings: ctx.src.future };
    const before = computePositionalPower(around.before, ctx.src.rankings, opts);
    const after = computePositionalPower(around.after, ctx.src.rankings, opts);
    const find = (teams, owner) => teams.find(t => t.owner === owner) || null;

    const el = box();
    if (!el) return;
    const changesFor = (owner) => {
        const b = find(before, owner), a = find(after, owner);
        return b && a ? rankChanges(b, a) : null;
    };
    el.innerHTML = tradeLineHTML(trade, trades, changesFor, before.length);
    el.hidden = false;
}

const dateOf = (ms) => ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const teamName = (o) => o === 'You' ? 'You' : o;
const joinNames = (list) => list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

function tradeTitle(t) {
    const on = t.time ? ` on ${dateOf(t.time)}` : '';
    if (t.mine) return `Since your trade with ${escapeHtml(joinNames(t.teams.filter(o => o !== 'You')))}${on}`;
    return `${escapeHtml(joinNames(t.teams))} traded${on}`;
}
const optionLabel = (t) => `${dateOf(t.time)}: ${t.teams.map(teamName).join(' ↔ ')}`;

function changesHTML(changes) {
    if (changes === null) return '<span class="mls-roster-trade-none">not scored</span>';
    if (changes.length === 0) return '<span class="mls-roster-trade-none">no rank changes</span>';
    return changes.map(c => `<span class="${c.to < c.from ? 'mls-trade-rank-up' : 'mls-trade-rank-down'}">${c.label} ${c.from} → ${c.to}</span>`)
        .join('<span class="mls-roster-trade-sep" aria-hidden="true"> · </span>');
}

function tradeLineHTML(trade, trades, changesFor, teams) {
    const choose = trades.length > 1 ? `
        <label class="mls-roster-trade-pick"><span>Trade</span>
            <select class="form-input" data-action="selectPastTrade" aria-label="Pick a trade this season">
                ${trades.map(t => `<option value="${escapeHtml(t.id)}"${t.id === trade.id ? ' selected' : ''}>${escapeHtml(optionLabel(t))}</option>`).join('')}
            </select></label>` : '';
    const got = trade.teams.filter(o => (trade.gets[o] || []).length)
        .map(o => `<span class="mls-roster-trade-got"><strong>${escapeHtml(teamName(o))}</strong> got ${escapeHtml(trade.gets[o].join(', '))}</span>`).join('');
    const rows = trade.teams.map(o => `
            <div><dt>${escapeHtml(teamName(o))}</dt><dd>${changesHTML(changesFor(o))}</dd></div>`).join('');
    return `
        <div class="mls-roster-trade-head">
            <span class="mls-roster-trade-title">${tradeTitle(trade)}</span>
            ${choose}
        </div>
        ${got ? `<div class="mls-roster-trade-gets">${got}</div>` : ''}
        <dl class="mls-roster-trade-lines">${rows}
        </dl>
        <div class="mls-roster-trade-note">Power Rankings right before → right after this trade, out of ${teams} teams, by today's rankings. Moves since then are left out. 1 = strongest.</div>`;
}

// The drop-down (data-action="selectPastTrade", a change action in js/mls/main.js).
export function selectPastTrade(id) {
    const league = getActiveLeague();
    if (!league) return;
    picked.set(league.leagueId, String(id));
    if (lastCtx) renderPastTradeLine(lastCtx);
}
