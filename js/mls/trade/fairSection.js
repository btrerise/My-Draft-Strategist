// --- TRADE ANALYZER: "TO MAKE IT FAIR" (improvements S19) ---
// Drawn by runScout (js/mls/scout/engine.js) between the verdict banners and "Power Rankings after the trade"
// when a trade is outside the fair band: the gap in words and up to three players (or picks) from the roster of
// the side that has to add, each with where it would land the trade and an Add button that puts him on the trade
// through the picker (trade/picker.js addTradeNames), which re-runs the analysis in place; then the pieces whose
// removal alone would make it fair, each with Remove (round 5). After an Add or Remove, a line offers Undo until
// the trade changes some other way. The choosing is trade/makeFair.js. On screen only: Export Trade copies the
// banners and the Power Rankings section, not this.
import { escapeHtml } from '../../shared/html.js';
import { PICK_BADGE_HTML } from '../badges.js';
import { normalizeName } from '../../shared/names.js';
import { State } from '../state.js';
import { rankingIndex } from '../helpers.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { getMarketValue, isDraftPickName, rankToTradeValue } from './valueCurve.js';
import { fairCandidates, fairRemovals, fairSuggestions, gapToClose, landing, verdictFromValues } from './makeFair.js';
import { pickKey } from '../leagues/picks.js';
import { tradeSeasonSet, unknownNames } from './verdict.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// Matching key: a pick by its year and round, Early/Mid/Late ignored (normalizeName drops digits), a player by his
// clean name.
const keyOf = (n) => pickKey(n, { tier: false }) || normalizeName(n);

// --- Undo (round 5) ---
// The last Add or Remove made from the box: what it said and the trade before it. The trade it led to is noted at the
// next run; while the trade still matches it, the Undo line shows. Any other change (a token added or removed, a
// league switch) drops it. In memory only.
let _undo = null; // { label, before: { get, give }, after: { get, give } | null }
// Where focus goes once the trade re-runs after the box's own Add, Remove or Undo (round 13): the re-run replaces the
// box, which dropped keyboard focus to the top of the page. 'undo' after a change, 'box' (its first button) after Undo.
let _focusNext = null;
export function rememberFairChange(label, before) { _undo = { label, before, after: null }; _focusNext = 'undo'; }
export function takeFairUndo() { const u = _undo; _undo = null; _focusNext = u ? 'box' : null; return u ? u.before : null; }
// Called by runScout once the trade's results are on the page. Without scrolling: the page stays where it is.
// Which value decides the gap in a league with both sets (S24): the dynasty value by default (owner's first choice), or
// In-Season (round 3, the owner's choice after a review: on a deliberate win-now trade the dynasty gap nags). In memory:
// back to Dynasty on a reload, so the default never changes quietly.
let _fairBasis = 'dynasty';
export function setFairBasis(basis) { _fairBasis = basis === 'season' ? 'season' : 'dynasty'; _focusNext = 'basis'; }

export function placeFairFocus(outputEl) {
    if (!_focusNext || !outputEl) return;
    const target = _focusNext === 'undo'
        ? outputEl.querySelector('[data-action="undoFairChange"]')
        : _focusNext === 'basis' ? outputEl.querySelector('[data-action="setFairBasis"].active')
        : outputEl.querySelector('[data-action="addFairSuggestion"], [data-action="removeFairPiece"]');
    _focusNext = null;
    if (target) target.focus({ preventScroll: true });
}
const sameList = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
function undoHTML(getNames, giveNames) {
    if (!_undo) return '';
    const now = { get: getNames, give: giveNames };
    if (!_undo.after) _undo.after = now;
    else if (!sameList(_undo.after.get, now.get) || !sameList(_undo.after.give, now.give)) { _undo = null; return ''; }
    return `<div class="mls-trade-fair-undo" data-trade-fair-undo><span>${escapeHtml(_undo.label)}.</span>
        <button type="button" class="btn-bare mls-trade-fair-undo-btn" data-action="undoFairChange">Undo</button></div>`;
}

// getNames / giveNames: the trade's two lists as typed; getResults / giveResults: runScout's rows for them.
// Returns '' when there's nothing to show: a one-sided entry, no rankings, or a trade already fair (with no Undo).
export function buildMakeFairHTML(league, getNames, giveNames, getResults, giveResults) {
    const market = marketLine(getResults, giveResults);
    const box = fairBoxHTML(league, getNames, giveNames, getResults, giveResults, market);
    // Fair by your rankings but not by the market's: no box, just the line (round 9).
    const alone = !box && market ? `<div class="mls-trade-fair-market is-alone" data-trade-market-note>${market}</div>` : '';
    return undoHTML(getNames, giveNames) + box + alone;
}

// When Market Consensus disagrees with Your Rankings, which decide (round 9, after a review as a user: the other manager
// is often reading FantasyCalc): one line saying how the market sees it and what that means for the talk. Only when
// your rankings decide, the market is loaded, and it values every piece (else its total says little). '' otherwise.
function marketLine(getResults, giveResults) {
    if (!(State.rosRankings.length > 0 && State.marketRankings.length > 0)) return '';
    if (!getResults.concat(giveResults).every(r => r.marketMatched)) return '';
    const waiver = { on: !!State.tradeSettings.waiverAdjustment, perSpot: State.tradeSettings.waiverAdjustmentValue };
    const yours = verdictFromValues(getResults.map(r => r.userValue), giveResults.map(r => r.userValue), waiver);
    const mkt = verdictFromValues(getResults.map(r => r.marketValue), giveResults.map(r => r.marketValue), waiver);
    if (!yours || !mkt || yours.verdict === mkt.verdict) return '';
    const pct = Math.round(mkt.swingPct);
    if (mkt.verdict === 'fair') return 'By Market Consensus it\'s already fair as it stands.';
    const g = gapToClose(getResults.map(r => r.marketValue), giveResults.map(r => r.marketValue), waiver);
    return mkt.verdict === 'you'
        ? `By Market Consensus this favors you (${pct}%): they may ask you to add about ${fmt(g.gap)}.`
        : `By Market Consensus this favors them (${pct}%): they may be open to adding about ${fmt(g.gap)}.`;
}

function fairBoxHTML(league, getNames, giveNames, getResults, giveResults, market) {
    if (!league || getNames.length === 0 || giveNames.length === 0) return '';
    // Your Rankings decide (owner's choice); Market Consensus only when no ROS rankings are loaded.
    let valueKey, label;
    // With an In-Season set too (improvements S24) the dynasty value decides by default, the In-Season one when the box's
    // switch says so (round 3), and the line says which.
    const seasonSet = State.rosRankings.length > 0 ? tradeSeasonSet() : null;
    const bySeason = !!seasonSet && _fairBasis === 'season';
    if (bySeason) { valueKey = 'seasonValue'; label = 'your In-Season rankings'; }
    else if (State.rosRankings.length > 0) { valueKey = 'userValue'; label = seasonSet ? 'your dynasty rankings' : 'Your Rankings'; }
    else if (State.marketRankings.length > 0) { valueKey = 'marketValue'; label = 'Market Consensus'; }
    else return '';
    // Nothing to suggest while the verdict waits (round 11): a name that matches no player, or, when the market is
    // what decides, a piece it doesn't value.
    if (unknownNames(getResults, giveResults).length) return '';
    if (valueKey === 'marketValue' && !getResults.concat(giveResults).every(r => r.marketMatched || (r.exportRow && r.exportRow.pos === 'Pick'))) return '';

    const waiver = { on: !!State.tradeSettings.waiverAdjustment, perSpot: State.tradeSettings.waiverAdjustmentValue };
    const getValues = getResults.map(r => r[valueKey]);
    const giveValues = giveResults.map(r => r[valueKey]);
    const gap = gapToClose(getValues, giveValues, waiver);
    // The switch (S24, round 3). It stays when the picked value says the trade is already fair, so you can switch back.
    const basisSwitch = seasonSet ? fairBasisSwitch(bySeason) : '';
    if (!gap) {
        if (!seasonSet) return '';
        const other = bySeason ? 'userValue' : 'seasonValue';
        if (!gapToClose(getResults.map(r => r[other]), giveResults.map(r => r[other]), waiver)) return '';
        return `
    <section class="mls-trade-fair" data-trade-fair>
        ${basisSwitch}
        <div class="mls-trade-fair-note">Fair by ${label} as it stands.</div>
    </section>`;
    }
    const adder = gap.adder;
    // Pieces on the side with too much whose removal alone makes it fair: needs no other roster, so it shows in
    // every case below, a manual league included.
    const removals = removalsHTML(fairRemovals({ getValues, giveValues, waiver }), { get: getNames, give: giveNames }, { get: getResults, give: giveResults });

    // Who adds: you, or the one team the players you'd get come from (else the From drop-down's team).
    const rosterMap = league.globalRosterMap || {};
    const getClean = getNames.filter(n => !isDraftPickName(n)).map(normalizeName);
    let team = 'You', blocked = '';
    if (adder === 'them') {
        const owners = new Set(getClean.map(c => rosterMap[c]).filter(o => o && o !== 'You'));
        const chosen = document.getElementById('tradeGetTeam')?.value || '';
        team = owners.size === 1 ? [...owners][0] : (owners.size === 0 ? chosen : '');
        if (!isFullyMappedLeague(league)) blocked = "This is a manual league: the app knows only your roster, so it can't suggest what they'd add.";
        else if (owners.size > 1) blocked = "The players you'd get come from more than one team, so there's no one roster to suggest from.";
        else if (!team) blocked = 'Choose their team under From to see what they could add.';
    }

    if (blocked) return section(adder, gap, `<div class="mls-trade-fair-note">${blocked}</div>${removals}`, market, basisSwitch);

    // The candidates: that roster's ranked players (and its picks in dynasty and keeper leagues), valued
    // as the trade's rows are (rankToTradeValue of the ROS rank, or the market's; a pick borrows the market's).
    const rosIndex = rankingIndex(bySeason ? seasonSet.data : State.rosRankings);
    const marketIndex = rankingIndex(State.marketRankings);
    const roster = new Map();
    Object.entries(rosterMap).forEach(([clean, owner]) => { if (owner === team) roster.set(clean, null); });
    if (team === 'You') (league.roster || []).forEach(p => roster.set(p.cleanName, p));
    const candidates = fairCandidates({
        roster: [...roster].map(([clean, p]) => {
            const ros = rosIndex.get(clean), mkt = marketIndex.get(clean);
            return {
                cleanName: clean,
                name: (ros && ros.name) || (mkt && mkt.name) || (p && p.name) || '',
                pos: (league.globalPosMap && league.globalPosMap[clean]) || (p && p.pos) || (ros && ros.pos) || (mkt && mkt.pos) || ''
            };
        }),
        valueOf: (clean) => {
            if (valueKey === 'marketValue') return getMarketValue(clean)?.value || 0;
            const ros = rosIndex.get(clean);
            return ros ? rankToTradeValue(ros.rank) : 0;
        },
        dynasty: getPowerLeagueKind(league) === 'dynasty',
        pickValue: State.marketRankings.length > 0 ? (name) => getMarketValue(null, name)?.value || 0 : null,
        // The picks this team holds, as Sleeper had them at the last sync (round 2); null assumes its own.
        picks: league.picks ? (league.picks[team] || []) : null,
        normalize: keyOf
    });

    const addingNames = adder === 'them' ? getNames : giveNames;
    const result = fairSuggestions({
        getValues, giveValues, candidates, waiver,
        inTrade: getNames.concat(giveNames).filter(n => !isDraftPickName(n)).map(normalizeName),
        onAddingSide: addingNames.map(keyOf)
    });
    if (!result) return '';

    const whose = team === 'You' ? 'your roster' : `${escapeHtml(team)}'s roster`;
    const side = result.side;
    let body;
    // "about 9,800" when the banner says 9,323: one more player on that side moves the waiver adjustment.
    const waiverNote = Math.abs(Math.abs(gap.diff) - gap.needed) >= 1 ? ' (waiver adjustment included)' : '';
    if (result.singles.length) {
        body = `<div class="mls-trade-fair-via">By ${label}, from ${whose}${waiverNote}:</div>` + list(result.singles, side);
    } else if (result.pairs.length) {
        body = `<div class="mls-trade-fair-via">No single player on ${whose} is worth ${fmt(rangeLow(gap))} or more. By ${label}, these pairs would${waiverNote}:</div>`
            + list(result.pairs, side);
    } else {
        body = `<div class="mls-trade-fair-note">No player or pair on ${whose} adds up to ${rangeText(gap)} by ${label}.</div>`;
    }
    const shown = result.singles.concat(result.pairs);
    const shownPicks = shown.flatMap(f => f.players.filter(p => p.isPick));
    if (shownPicks.length) {
        body += shownPicks.some(p => p.assumed)
            ? `<div class="mls-trade-fair-note">* Market value. Assumes ${team === 'You' ? 'you still have your' : `${escapeHtml(team)} still has its`} own picks (sync the league to check).</div>`
            : `<div class="mls-trade-fair-note">* Market value. Picks as of the last sync.</div>`;
    }
    return section(adder, gap, body + removals, market, basisSwitch);
}

// The head gives the fair range (round 9): every value one more piece could have and leave the trade within 10%,
// so each suggestion visibly falls inside it ("about 3,000" next to a fair 1,950 pick read as a contradiction).
// gap: gapToClose's result. market: marketLine's sentence, or ''.
// The range in words, the same everywhere in the box (round 10: a note said "closes a 19,100 gap" under "16,220–22,340").
const rangeLow = (gap) => (gap.range ? gap.range.low : gap.gap);
const rangeText = (gap) => !gap.range ? `about ${fmt(gap.gap)}`
    : gap.range.low <= 0 ? `up to ${fmt(gap.range.high)}` : `${fmt(gap.range.low)}&ndash;${fmt(gap.range.high)}`;

// "By: Dynasty | In-Season" (S24, round 3), at the top of the box in a league with both sets.
function fairBasisSwitch(bySeason) {
    const btn = (basis, text, on) => `<button type="button" class="mls-segmented-btn${on ? ' active' : ''}" data-action="setFairBasis" data-basis="${basis}" aria-pressed="${on}">${text}</button>`;
    return `<div class="mls-trade-fair-basis"><span>Value by</span><div class="mls-segmented" role="group" aria-label="Make it fair by">${btn('dynasty', 'Dynasty', !bySeason)}${btn('season', '<span class="mls-nowrap">In-Season</span>', bySeason)}</div></div>`;
}

function section(adder, gap, body, market = '', basisSwitch = '') {
    const who = adder === 'them' ? "they'd" : "you'd";
    const r = gap.range;
    const amount = !r ? `about <strong>${fmt(gap.gap)}</strong>`
        : r.low <= 0 ? `up to <strong>${fmt(r.high)}</strong>`
        : `<strong>${fmt(r.low)}&ndash;${fmt(r.high)}</strong>`;
    return `
    <section class="mls-trade-fair" data-trade-fair>
        ${basisSwitch}
        <div class="mls-trade-fair-head">To make it fair, ${who} add ${amount}</div>
        ${market ? `<div class="mls-trade-fair-market" data-trade-market-note>${market}</div>` : ''}
        ${body}
    </section>`;
}

// One suggestion per line: position badge(s), the name(s), the value, and Add.
function list(fits, side) {
    const where = side === 'get' ? 'what you get' : 'what you give';
    return `<ul class="mls-trade-fair-list" data-fair-adds>${fits.map(f => {
        const names = f.players.map(p => p.name);
        const badges = f.players.map(p => p.isPick
            ? PICK_BADGE_HTML
            : `<span class="badge pos-badge ${escapeHtml(p.pos || 'FLEX')} mls-pos-badge-sizing">${escapeHtml(p.pos || 'FA')}</span>`).join('');
        // The second name carries the "+", so a pair wraps as "Gibbs" / "+ Barkley", never a "+" on its own line.
        const label = f.players.map((p, i) => `<span class="mls-trade-fair-player">${i ? '<span class="mls-trade-fair-plus">+</span> ' : ''}${escapeHtml(p.name)}${p.isPick ? '<sup>*</sup>' : ''}${p.from ? ` <span class="mls-trade-fair-from">via ${escapeHtml(p.from === 'You' ? 'you' : p.from)}</span>` : ''}</span>`).join('');
        return `<li class="mls-trade-fair-item${f.players.length > 1 ? ' is-pair' : ''}">
            <span class="mls-trade-fair-badges">${badges}</span>
            <span class="mls-trade-fair-names">${label}<span class="mls-trade-fair-lands">${landsText(f.after)}</span></span>
            <span class="mls-trade-fair-act">
                ${valueHTML(f.value, marketOf(f.players))}
                <button type="button" class="btn btn-secondary mls-btn-sm mls-trade-fair-add" data-action="addFairSuggestion" data-side="${side}" data-names="${escapeHtml(JSON.stringify(names))}" aria-label="Add ${escapeHtml(names.join(' and '))} to ${where}">${names.length > 1 ? 'Add both' : 'Add'}</button>
            </span>
        </li>`;
    }).join('')}</ul>`;
}

// Where a change lands the trade, under the name: "Fair · even", "Fair · 2% your way".
const landsText = (after) => `Fair &middot; ${landing(after)}`;

// "Or take off your side:" (favors them) / "Or ask for less:" (favors you), each piece with its value, where it lands
// and Remove. names / results: both sides as typed and runScout's rows, in the same order.
function removalsHTML(removals, names, results) {
    if (!removals.length) return '';
    const side = removals[0].side;
    const where = side === 'give' ? 'what you give' : 'what you get';
    const items = removals.map(r => {
        const typed = names[side][r.index];
        const row = results[side][r.index] && results[side][r.index].exportRow;
        const shown = (row && row.name) || typed;
        const badge = row && row.pos === 'Pick' ? PICK_BADGE_HTML
            : `<span class="badge pos-badge ${escapeHtml((row && row.badge) || 'FLEX')} mls-pos-badge-sizing">${escapeHtml((row && row.pos) || 'FA')}</span>`;
        return `<li class="mls-trade-fair-item">
            <span class="mls-trade-fair-badges">${badge}</span>
            <span class="mls-trade-fair-names"><span class="mls-trade-fair-player">${escapeHtml(shown)}</span><span class="mls-trade-fair-lands">${landsText(r.after)}</span></span>
            <span class="mls-trade-fair-act">
                ${valueHTML(r.value, row ? row.market : null)}
                <button type="button" class="btn btn-secondary mls-btn-sm mls-trade-fair-add" data-action="removeFairPiece" data-side="${side}" data-name="${escapeHtml(typed)}" aria-label="Take ${escapeHtml(shown)} off ${where}">Remove</button>
            </span>
        </li>`;
    }).join('');
    return `<div class="mls-trade-fair-or">${side === 'give' ? 'Or take off your side:' : 'Or ask for less:'}</div><ul class="mls-trade-fair-list" data-fair-removals>${items}</ul>`;
}

// The value by the rankings that decide, and under it the market's when Market Consensus is loaded and isn't already
// what decides (round 6, owner's request: the other manager is often reading FantasyCalc), as the trade's rows show it.
// market: a number, or null when the market has no value for it ("Mkt –").
function valueHTML(value, market) {
    const showMkt = State.marketRankings.length > 0 && State.rosRankings.length > 0;
    return `<span class="mls-trade-fair-val"><span class="mls-trade-fair-num">${fmt(value)}</span>${showMkt
        ? `<span class="mls-trade-row-mkt">Mkt ${market == null ? '&ndash;' : fmt(market)}</span>` : ''}</span>`;
}

// The market's value of a suggestion (a pair's sum); null when any part of it has none.
function marketOf(players) {
    let sum = 0;
    for (const p of players) {
        const m = p.isPick ? getMarketValue(null, p.name) : getMarketValue(p.cleanName);
        if (!m) return null;
        sum += m.value;
    }
    return sum;
}
