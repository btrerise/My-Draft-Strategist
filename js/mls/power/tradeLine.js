// --- ROSTER TAB: WHAT A PAST TRADE DID TO YOUR POWER RANKINGS (improvements S29) ---
// The box under the Roster tab's Power Rankings table (#rosterTradeLine): a trade in the active Sleeper league, picked from the
// season's trades you made (newest first), and each team's ranks right before → right after it. The math is in
// power/pastTrades.js; the scoring is computePositionalPower with the strip's own rankings, so the numbers are the
// Roster tab's and, for a trade before it happened, the Trade Analyzer's.
//
// Owner's choices (LOG, S29): trades only, yours only (round 3); any of them this season, from a drop-down; under the full table (round 2); a line for the
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
import { syncLeagueForTrade } from '../leagues/sync.js';
import { completedMoves, defaultTradeId, leaguesAroundMove, makeOwnerOf, moveTime, rankChanges, tradeEntries, tradeVerdictText, yourTrades } from './pastTrades.js';

const loads = new Map();   // leagueId -> { status: 'loading' | 'done' | 'error', moves, rosterMap: the rosters it was read for }
const picked = new Map();  // leagueId -> the trade picked in the drop-down, for this visit
const autoSynced = new Set(); // leagues this box has synced by itself this visit (round 6), at most once each
let lastCtx = null;        // what refreshPowerRankings last passed, to draw again when a load lands
let playerMap = null;

const box = () => document.getElementById('rosterTradeLine');
// The strip's link names the box when there's one (round 4: under the table it was easy to miss), so it can be found
// without pushing the roster down. renderRosterPowerStrip draws the link's own text before this runs.
const STRIP_LINK_TRADE = 'See the full breakdown and your last trade below \u2193';
function stripLink(hasTrade) {
    const link = document.querySelector('#rosterPowerStrip .mls-roster-power-link');
    if (!link) return;
    if (!link.dataset.text) link.dataset.text = link.textContent;
    link.textContent = hasTrade ? STRIP_LINK_TRADE : link.dataset.text;
}
function hide() {
    stripLink(false);
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
    // After this box's own sync (round 6) the moves are the ones just read, so they're kept.
    if (entry && entry.rosterMap !== league.globalRosterMap && entry.status !== 'loading') {
        if (entry.keepAfterSync) { entry.rosterMap = league.globalRosterMap; entry.keepAfterSync = false; }
        else { loads.delete(league.leagueId); entry = null; }
    }
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
    // A trade of yours since the last sync (round 6, owner): sync this league by itself, once per visit, as the Roster tab's
    // Sync button does (quietly on an error), so the trade is on the rosters and the box can show it. The sync redraws the
    // tab, which lands back here with the new rosters.
    if (synced && !autoSynced.has(league.leagueId) && league.username && !String(league.leagueId).startsWith('manual_')) {
        const fresh = yourTrades(tradeEntries(entry.moves.filter(tx => moveTime(tx) > synced), deps))[0];
        if (fresh) {
            autoSynced.add(league.leagueId);
            entry.keepAfterSync = true;
            showSyncing(fresh);
            syncLeagueForTrade(league, `Synced for your trade on ${dateOf(fresh.time)}`).then(ok => {
                if (ok) return;
                entry.keepAfterSync = false;
                if (lastCtx && rosterTabShowing()) renderPastTradeLine(lastCtx);
            });
            return;
        }
    }
    const trades = yourTrades(tradeEntries(moves, deps));
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
    const verdict = tradeVerdictText(find(before, 'You'), find(after, 'You'), before.length);
    el.innerHTML = tradeLineHTML(trade, trades, changesFor, verdict, before.length);
    el.hidden = false;
    stripLink(true);
}

const dateOf = (ms) => ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const teamName = (o) => o === 'You' ? 'You' : o;
const joinNames = (list) => list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

// "Your trade with Rival · Sep 8" (round 5: "Since your trade…" read as "from then until now", but the ranks are right
// before → right after, later moves left out).
function tradeTitle(t) {
    const on = t.time ? ` \u00b7 ${dateOf(t.time)}` : '';
    return `Your trade with ${escapeHtml(joinNames(t.teams.filter(o => o !== 'You')))}${on}`;
}
const optionLabel = (t) => `${dateOf(t.time)}: with ${joinNames(t.teams.filter(o => o !== 'You'))}`;

// Each moved rank on its own (round 4: calmer than a bold run joined by dots; an item never breaks across lines).
function changesHTML(changes) {
    if (changes === null) return '<span class="mls-roster-trade-none">not scored</span>';
    if (changes.length === 0) return '<span class="mls-roster-trade-none">no rank changes</span>';
    return changes.map(c => `<span class="mls-roster-trade-change ${c.to < c.from ? 'mls-trade-rank-up' : 'mls-trade-rank-down'}">${c.label} ${c.from} \u2192 ${c.to}</span>`).join('');
}

// Round 4 order: the answer first (a sentence, then each team's ranks), what moved after it in smaller text, then a
// one-line note with the details behind "How this is worked out" (i), as the Trade Analyzer's section has.
function tradeLineHTML(trade, trades, changesFor, verdict, teams) {
    const choose = trades.length > 1 ? `
        <label class="mls-roster-trade-pick"><span>Trade</span>
            <select class="form-input" data-action="selectPastTrade" aria-label="Pick one of your trades this season">
                ${trades.map(t => `<option value="${escapeHtml(t.id)}"${t.id === trade.id ? ' selected' : ''}>${escapeHtml(optionLabel(t))}</option>`).join('')}
            </select></label>` : '';
    const got = trade.teams.filter(o => (trade.gets[o] || []).length)
        .map(o => `<span class="mls-roster-trade-got"><strong>${escapeHtml(teamName(o))}</strong> got ${escapeHtml(trade.gets[o].join(', '))}</span>`).join('');
    // Yours first and in full color; the other team's muted (round 5: two equal lines made the eye bounce between them).
    const rows = trade.teams.map(o => `
            <div class="${o === 'You' ? 'mls-roster-trade-you' : 'mls-roster-trade-other'}"><dt>${escapeHtml(teamName(o))}</dt><dd>${changesHTML(changesFor(o))}</dd></div>`).join('');
    // A parenthesis never breaks inside (round 5: "(1st →" ended a line on phones).
    const keepTogether = (text) => escapeHtml(text).replace(/\([^)]*\)/g, m => `<span class="mls-roster-trade-nowrap">${m}</span>`);
    const about = `Your team as it was right before and right after this trade, rebuilt from Sleeper's list of moves, and both ranked by today's rankings (the table's), out of ${teams} teams. Moves since the trade are left out, so "after" can differ from the table above. 1 = strongest.`;
    return `
        <div class="mls-roster-trade-head">
            <span class="mls-roster-trade-title">${tradeTitle(trade)}</span>
            ${choose}
        </div>
        ${verdict ? `<p class="mls-roster-trade-verdict">${keepTogether(verdict)}</p>` : ''}
        <dl class="mls-roster-trade-lines">${rows}
        </dl>
        ${got ? `<div class="mls-roster-trade-gets">${got}</div>` : ''}
        <div class="mls-roster-trade-note">Right before \u2192 right after, by today's rankings.
            <div class="tooltip-container"><div class="tooltip-icon" aria-label="How this is worked out">i</div>
                <span class="tooltip-text">${escapeHtml(about)}</span></div>
        </div>`;
}

// While the box's own sync runs: the new trade's title and one line.
function showSyncing(trade) {
    const el = box();
    if (!el) return;
    el.innerHTML = `
        <div class="mls-roster-trade-head"><span class="mls-roster-trade-title">${tradeTitle(trade)}</span></div>
        <div class="mls-roster-trade-note" data-trade-syncing>New since your last sync: updating this league from Sleeper\u2026</div>`;
    el.hidden = false;
    stripLink(true);
}

// The drop-down (data-action="selectPastTrade", a change action in js/mls/main.js).
export function selectPastTrade(id) {
    const league = getActiveLeague();
    if (!league) return;
    picked.set(league.leagueId, String(id));
    if (lastCtx) renderPastTradeLine(lastCtx);
}
