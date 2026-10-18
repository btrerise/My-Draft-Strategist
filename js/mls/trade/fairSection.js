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
import { fairCandidates, fairRemovals, fairSuggestions, gapToClose, landing } from './makeFair.js';
import { pickKey } from '../leagues/picks.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// Matching key: a pick by its year and round, Early/Mid/Late ignored (normalizeName drops digits), a player by his
// clean name.
const keyOf = (n) => pickKey(n, { tier: false }) || normalizeName(n);

// --- Undo (round 5) ---
// The last Add or Remove made from the box: what it said and the trade before it. The trade it led to is noted at the
// next run; while the trade still matches it, the Undo line shows. Any other change (a token added or removed, a
// league switch) drops it. In memory only.
let _undo = null; // { label, before: { get, give }, after: { get, give } | null }
export function rememberFairChange(label, before) { _undo = { label, before, after: null }; }
export function takeFairUndo() { const u = _undo; _undo = null; return u ? u.before : null; }
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
    return undoHTML(getNames, giveNames) + fairBoxHTML(league, getNames, giveNames, getResults, giveResults);
}

function fairBoxHTML(league, getNames, giveNames, getResults, giveResults) {
    if (!league || getNames.length === 0 || giveNames.length === 0) return '';
    // Your Rankings decide (owner's choice); Market Consensus only when no ROS rankings are loaded.
    let valueKey, label;
    if (State.rosRankings.length > 0) { valueKey = 'userValue'; label = 'Your Rankings'; }
    else if (State.marketRankings.length > 0) { valueKey = 'marketValue'; label = 'Market Consensus'; }
    else return '';

    const waiver = { on: !!State.tradeSettings.waiverAdjustment, perSpot: State.tradeSettings.waiverAdjustmentValue };
    const getValues = getResults.map(r => r[valueKey]);
    const giveValues = giveResults.map(r => r[valueKey]);
    const gap = gapToClose(getValues, giveValues, waiver);
    if (!gap) return '';
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

    if (blocked) return section(adder, gap.gap, `<div class="mls-trade-fair-note">${blocked}</div>${removals}`);

    // The candidates: that roster's ranked players (and its picks in dynasty and keeper leagues), valued
    // as the trade's rows are (rankToTradeValue of the ROS rank, or the market's; a pick borrows the market's).
    const rosIndex = rankingIndex(State.rosRankings);
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
        body = `<div class="mls-trade-fair-via">No single player on ${whose} closes a ${fmt(result.gap)} gap. By ${label}, these pairs would${waiverNote}:</div>`
            + list(result.pairs, side);
    } else {
        body = `<div class="mls-trade-fair-note">No player or pair on ${whose} closes a ${fmt(result.gap)} gap by ${label}.</div>`;
    }
    const shown = result.singles.concat(result.pairs);
    const shownPicks = shown.flatMap(f => f.players.filter(p => p.isPick));
    if (shownPicks.length) {
        body += shownPicks.some(p => p.assumed)
            ? `<div class="mls-trade-fair-note">* Market value. Assumes ${team === 'You' ? 'you still have your' : `${escapeHtml(team)} still has its`} own picks (sync the league to check).</div>`
            : `<div class="mls-trade-fair-note">* Market value. Picks as of the last sync.</div>`;
    }
    return section(adder, result.gap, body + removals);
}

function section(adder, gap, body) {
    return `
    <section class="mls-trade-fair" data-trade-fair>
        <div class="mls-trade-fair-head">To make it fair, ${adder === 'them' ? "they'd" : "you'd"} add about <strong>${fmt(gap)}</strong></div>
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
        return `<li class="mls-trade-fair-item">
            <span class="mls-trade-fair-badges">${badges}</span>
            <span class="mls-trade-fair-names">${label}<span class="mls-trade-fair-lands">${landsText(f.after)}</span></span>
            <span class="mls-trade-fair-val">${fmt(f.value)}</span>
            <button type="button" class="btn btn-secondary mls-btn-sm mls-trade-fair-add" data-action="addFairSuggestion" data-side="${side}" data-names="${escapeHtml(JSON.stringify(names))}" aria-label="Add ${escapeHtml(names.join(' and '))} to ${where}">${names.length > 1 ? 'Add both' : 'Add'}</button>
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
            <span class="mls-trade-fair-val">${fmt(r.value)}</span>
            <button type="button" class="btn btn-secondary mls-btn-sm mls-trade-fair-add" data-action="removeFairPiece" data-side="${side}" data-name="${escapeHtml(typed)}" aria-label="Take ${escapeHtml(shown)} off ${where}">Remove</button>
        </li>`;
    }).join('');
    return `<div class="mls-trade-fair-or">${side === 'give' ? 'Or take off your side:' : 'Or ask for less:'}</div><ul class="mls-trade-fair-list" data-fair-removals>${items}</ul>`;
}
