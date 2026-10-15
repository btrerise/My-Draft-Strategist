// --- TRADE ANALYZER: PICKING PLAYERS (improvements S14, round 5) ---
// Each side of the trade is a list of tokens, filled from the Add Player Manually search
// (attachPlayerAutocomplete, js/mls/players.js) and a "+ Draft pick" row (year and round, "2027 1st"),
// in place of the two textareas people typed names into (owner's idea: much easier on a phone, and a
// picked name always matches, so "Did you mean" is rarely needed).
//
// The textareas (#buyInput, #sellInput) are still the lists runScout reads, one name per line; they're
// hidden, and this file keeps them in step. Anything else that edits them (Clear, "Did you mean",
// switching leagues) fires an 'input' event on the textarea, and the tokens redraw from it.
// Typing a name that isn't in the search and pressing Enter still adds it as typed, and pasting a list
// ("A, B" or one per line) adds each name, so nothing that worked with the textareas is lost.
import { escapeHtml } from '../../shared/html.js';
import { attachPlayerAutocomplete } from '../players.js';

const SIDES = {
    get: { textarea: 'buyInput', tokens: 'tradeGetTokens', search: 'tradeGetSearch', year: 'tradeGetPickYear', round: 'tradeGetPickRound', label: 'Players You Receive' },
    give: { textarea: 'sellInput', tokens: 'tradeGiveTokens', search: 'tradeGiveSearch', year: 'tradeGivePickYear', round: 'tradeGivePickRound', label: 'Players You Give Up' }
};
// What the search knew about a picked name (position and team), for the token's small print. Names
// added any other way show without it.
const _meta = new Map();
const PICK_RE = /\b(19|20)\d{2}\b.*\b(1st|2nd|3rd|4th)\b/i;

const el = (id) => document.getElementById(id);
const namesOf = (side) => (el(SIDES[side].textarea)?.value || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

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

// Adds names to a side, skipping ones already on it (either spelling case).
export function addTradeNames(side, names) {
    if (!SIDES[side]) return;
    const current = namesOf(side);
    const have = new Set(current.map(n => n.toLowerCase()));
    names.map(n => String(n).trim()).filter(Boolean).forEach(n => {
        if (!have.has(n.toLowerCase())) { current.push(n); have.add(n.toLowerCase()); }
    });
    writeNames(side, current);
}

// Replaces a side's list (tests and anything that sets a whole trade at once).
export function setTradePlayers(side, names) {
    if (!SIDES[side]) return;
    writeNames(side, []);
    addTradeNames(side, names || []);
}

export function removeTradeToken(side, idx) {
    if (!SIDES[side]) return;
    const names = namesOf(side);
    names.splice(idx, 1);
    writeNames(side, names);
    el(SIDES[side].search)?.focus();
}

export function addTradePick(side) {
    const s = SIDES[side];
    if (!s) return;
    const year = el(s.year)?.value, round = el(s.round)?.value;
    if (year && round) addTradeNames(side, [`${year} ${round}`]);
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
        // Clear, "Did you mean" and a league switch edit the textarea and fire 'input'.
        ta.addEventListener('input', () => renderTokens(side));
        const ac = attachPlayerAutocomplete(search, (p) => {
            _meta.set(p.name.toLowerCase(), { pos: p.pos, team: p.team });
            addTradeNames(side, [p.name]);
            search.value = '';
        });
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
}
