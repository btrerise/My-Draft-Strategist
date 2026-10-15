// --- TRADE ANALYZER: PICKING PLAYERS (improvements S14, rounds 5 and 6) ---
// Each side of the trade is a list of tokens, filled from the Add Player Manually search
// (attachPlayerAutocomplete, js/mls/players.js) and, in dynasty and keeper leagues, a "+ Draft pick" row
// (year and round, "2027 1st"), in place of the two textareas people typed names into (owner's idea: much
// easier on a phone, and a picked name always matches, so "Did you mean" is rarely needed).
//
// Round 6 (owner's choices, after FantasyCalc's and Dynasty Daddy's trade calculators):
//   - A team drop-down above "Players You Receive" (Sleeper leagues, where the app knows every roster).
//     Pick a team first and the search offers that team's roster, even before you type; or type any
//     player, and picking him sets the drop-down to his manager.
//   - "Players You Give Up" offers your roster when you tap it, and your players first as you type.
//   - Every suggestion says who has him ("Yours", the manager, "Free agent").
//   - The draft-pick row shows only in dynasty and keeper leagues (getPowerLeagueKind, as the Future column).
//   - Once a trade has been analyzed, changing it here re-runs the analysis where it is (no scrolling).
//
// The textareas (#buyInput, #sellInput) are still the lists runScout reads, one name per line; they're
// hidden, and this file keeps them in step. Anything else that edits them ("Did you mean", switching
// leagues) fires an 'input' event on the textarea, and the tokens redraw from it. Typing a name that isn't
// in the search and pressing Enter still adds it as typed, and pasting a list ("A, B" or one per line)
// adds each name, so nothing that worked with the textareas is lost.
import { escapeHtml } from '../../shared/html.js';
import { normalizeName } from '../../shared/names.js';
import { State } from '../state.js';
import { getActiveLeague, rankingIndex } from '../helpers.js';
import { attachPlayerAutocomplete } from '../players.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { runScout } from '../main.js';

const SIDES = {
    get: { textarea: 'buyInput', tokens: 'tradeGetTokens', search: 'tradeGetSearch', year: 'tradeGetPickYear', round: 'tradeGetPickRound', pickRow: 'tradeGetPickRow' },
    give: { textarea: 'sellInput', tokens: 'tradeGiveTokens', search: 'tradeGiveSearch', year: 'tradeGivePickYear', round: 'tradeGivePickRound', pickRow: 'tradeGivePickRow' }
};
const TEAM_SELECT = 'tradeGetTeam';
// What the search knew about a picked name (position and team), for the token's small print. Names
// added any other way show without it.
const _meta = new Map();
const PICK_RE = /\b(19|20)\d{2}\b.*\b(1st|2nd|3rd|4th)\b/i;
const _search = {}; // side -> the autocomplete's handle (refresh after the team changes)

const el = (id) => document.getElementById(id);
const namesOf = (side) => (el(SIDES[side].textarea)?.value || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

// --- Who has a player, in the active league ---
// The pools below look up every player on the search index on each keystroke, so the clean names are
// cached per index entry and the league's owners are read into one Map per search.
const _clean = new WeakMap();
const cleanOf = (p) => { let c = _clean.get(p); if (c === undefined) { c = normalizeName(p.name); _clean.set(p, c); } return c; };
function ownersNow() {
    const league = getActiveLeague();
    const map = new Map(Object.entries((league && league.globalRosterMap) || {}));
    ((league && league.roster) || []).forEach(p => map.set(p.cleanName, 'You'));
    return (p) => map.get(cleanOf(p)) || null;
}
const ownerOf = (name) => ownersNow()({ name });
function ownerTag(p) {
    const owner = ownerOf(p.name);
    if (owner === 'You') return 'Yours';
    if (owner) return owner;
    return isFullyMappedLeague(getActiveLeague()) ? 'Free agent' : '';
}
// Best ROS rank first, then by name, so a roster list reads like your depth chart.
function byRank(list) {
    const idx = rankingIndex(State.rosRankings);
    const rank = (p) => { const r = idx.get(cleanOf(p)); return r && r.rank ? r.rank : 9999; };
    return list.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// The search's pool for each side (see attachPlayerAutocomplete's opts.pool).
const POOLS = {
    give: (q, index) => {
        const owner = ownersNow();
        const mine = byRank(index.filter(p => owner(p) === 'You'));
        if (q === '') return mine;
        return mine.concat(index.filter(p => owner(p) !== 'You'));
    },
    get: (q, index) => {
        const owner = ownersNow();
        const team = el(TEAM_SELECT)?.value || '';
        if (team) return byRank(index.filter(p => owner(p) === team));
        if (q === '') return null;
        // Other teams' players first, then free agents, then yours.
        const order = (p) => { const o = owner(p); return o === 'You' ? 2 : o ? 0 : 1; };
        return index.slice().sort((a, b) => order(a) - order(b));
    }
};

// --- Tokens ---
function writeNames(side, names) {
    const ta = el(SIDES[side].textarea);
    if (!ta) return;
    ta.value = names.join('\n');
    renderTokens(side);
}

function renderTokens(side) {
    const list = el(SIDES[side].tokens);
    if (!list) return;
    list.innerHTML = namesOf(side).map((name, i) => {
        const m = _meta.get(name.toLowerCase());
        const sub = PICK_RE.test(name) ? 'Pick' : (m ? `${m.pos}${m.team ? ` &middot; ${escapeHtml(m.team)}` : ''}` : '');
        return `<li class="mls-trade-token">
            <span class="mls-trade-token-name">${escapeHtml(name)}</span>${sub ? `<span class="mls-trade-token-meta">${sub}</span>` : ''}
            <button type="button" class="mls-trade-token-remove btn-bare" data-action="removeTradeToken" data-side="${side}" data-idx="${i}" aria-label="Remove ${escapeHtml(name)}">&#x2715;</button>
        </li>`;
    }).join('');
}

// A trade already analyzed re-runs when you change it (round 6), where it is on the page. Debounced, so
// a pasted list or a quick add-and-remove runs once. Nothing's analyzed yet (the results are empty):
// nothing runs, and nothing scrolls either way.
let _rerunTimer = null;
function rerunIfAnalyzed() {
    // Only a trade analyzed before this change: a pick made just before tapping Analyze mustn't run it twice.
    if (!el('tradeOutput')?.innerHTML.trim()) return;
    clearTimeout(_rerunTimer);
    _rerunTimer = setTimeout(() => {
        const out = el('tradeOutput');
        if (!out || !out.innerHTML.trim()) return;
        if (!namesOf('get').length && !namesOf('give').length) { out.innerHTML = ''; return; }
        runScout('trade');
    }, 250);
}

function addNames(side, names) {
    const current = namesOf(side);
    const have = new Set(current.map(n => n.toLowerCase()));
    names.map(n => String(n).trim()).filter(Boolean).forEach(n => {
        if (!have.has(n.toLowerCase())) { current.push(n); have.add(n.toLowerCase()); }
    });
    writeNames(side, current);
}

// Adds names to a side from the picker (search, Enter, paste), skipping ones already on it.
export function addTradeNames(side, names) {
    if (!SIDES[side]) return;
    addNames(side, names);
    rerunIfAnalyzed();
}

// Replaces a side's list without re-running anything (tests set a whole trade, then tap Analyze).
export function setTradePlayers(side, names) {
    if (!SIDES[side]) return;
    writeNames(side, []);
    addNames(side, names || []);
}

// The side's Clear button.
export function clearTradeSide(side) {
    if (!SIDES[side]) return;
    writeNames(side, []);
    rerunIfAnalyzed();
}

export function removeTradeToken(side, idx) {
    if (!SIDES[side]) return;
    const names = namesOf(side);
    names.splice(idx, 1);
    writeNames(side, names);
    el(SIDES[side].search)?.focus();
    rerunIfAnalyzed();
}

export function addTradePick(side) {
    const s = SIDES[side];
    if (!s) return;
    const year = el(s.year)?.value, round = el(s.round)?.value;
    if (year && round) addTradeNames(side, [`${year} ${round}`]);
}

// The team drop-down changed: offer that team's roster right away if the search has focus.
export function tradeTeamChanged() {
    const search = el(SIDES.get.search);
    if (search && document.activeElement === search && _search.get) _search.get.refresh();
}

// Fits the picker to the active league: the team drop-down's managers (Sleeper leagues only; a manual
// league knows only your roster), and the draft-pick rows (dynasty and keeper leagues only). Run when the
// Scout tab shows and when the active league changes.
export function syncTradePicker() {
    const league = getActiveLeague();
    const select = el(TEAM_SELECT);
    if (select) {
        const full = isFullyMappedLeague(league);
        const owners = full ? [...new Set(Object.values(league.globalRosterMap || {}))].filter(o => o && o !== 'You').sort((a, b) => a.localeCompare(b)) : [];
        const keep = select.value;
        select.innerHTML = `<option value="">Any team</option>` + owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
        select.value = owners.includes(keep) ? keep : '';
        select.closest('.mls-trade-team')?.toggleAttribute('hidden', !full);
    }
    const dynasty = !!league && getPowerLeagueKind(league) === 'dynasty';
    Object.values(SIDES).forEach(s => el(s.pickRow)?.toggleAttribute('hidden', !dynasty));
}

export function initTradePicker() {
    // Pick years: the next three drafts. A season's rookie draft is held before it starts, so from
    // March on the next draft is next year's.
    const now = new Date();
    const first = now.getFullYear() + (now.getMonth() >= 2 ? 1 : 0);
    Object.entries(SIDES).forEach(([side, s]) => {
        const year = el(s.year);
        if (year && !year.options.length) {
            year.innerHTML = [first, first + 1, first + 2].map(y => `<option value="${y}">${y}</option>`).join('');
        }
        const search = el(s.search);
        const ta = el(s.textarea);
        if (!search || !ta) return;
        // "Did you mean" and a league switch edit the textarea and fire 'input'.
        ta.addEventListener('input', () => renderTokens(side));
        const ac = attachPlayerAutocomplete(search, (p) => {
            _meta.set(p.name.toLowerCase(), { pos: p.pos, team: p.team });
            // Picked a player another team has: that's the team you're trading with.
            const owner = side === 'get' ? ownerOf(p.name) : null;
            const select = el(TEAM_SELECT);
            if (owner && owner !== 'You' && select && [...select.options].some(o => o.value === owner)) select.value = owner;
            addTradeNames(side, [p.name]);
            search.value = '';
            // The list again right away, so several players from one roster take a tap each.
            setTimeout(() => { if (document.activeElement === search && _search[side]) _search[side].refresh(); }, 0);
        }, { pool: POOLS[side], tag: ownerTag, limit: 30 });
        _search[side] = ac;
        // Enter with no suggestion to pick: add what's typed (a player the search doesn't know, or a pick
        // typed out). The autocomplete's own Enter runs first and marks a pick as handled.
        search.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
            if (ac && (ac.isOpen() || ac.isPending())) return;
            const typed = search.value.trim();
            if (!typed) return;
            e.preventDefault();
            addTradeNames(side, typed.split(/[\n,]+/));
            search.value = '';
        });
        // A pasted list ("A, B" or one per line) becomes one token each.
        search.addEventListener('paste', (e) => {
            const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
            if (!/[\n,]/.test(text)) return;
            e.preventDefault();
            addTradeNames(side, text.split(/[\n,]+/));
            search.value = '';
        });
        renderTokens(side);
    });
    syncTradePicker();
}
