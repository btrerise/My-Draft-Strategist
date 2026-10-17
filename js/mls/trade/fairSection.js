// --- TRADE ANALYZER: "TO MAKE IT FAIR" (improvements S19) ---
// Drawn by runScout (js/mls/scout/engine.js) between the verdict banners and "Power Rankings after the trade"
// when a trade is outside the fair band: the gap in words and up to three players (or picks) from the roster of
// the side that has to add, each with an Add button that puts him on the trade through the picker
// (trade/picker.js addTradeNames), which re-runs the analysis in place. The choosing is trade/makeFair.js.
// On screen only: Export Trade copies the banners and the Power Rankings section, not this.
import { escapeHtml } from '../../shared/html.js';
import { PICK_BADGE_HTML } from '../badges.js';
import { normalizeName } from '../../shared/names.js';
import { State } from '../state.js';
import { rankingIndex } from '../helpers.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { getMarketValue, isDraftPickName, rankToTradeValue } from './valueCurve.js';
import { fairCandidates, fairSuggestions, gapToClose } from './makeFair.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

// getNames / giveNames: the trade's two lists as typed; getResults / giveResults: runScout's rows for them.
// Returns '' when there's nothing to suggest: a one-sided entry, no rankings, or a trade already fair.
export function buildMakeFairHTML(league, getNames, giveNames, getResults, giveResults) {
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

    if (blocked) return section(adder, gap.gap, `<div class="mls-trade-fair-note">${blocked}</div>`);

    // The candidates: that roster's ranked players (and its own picks in dynasty and keeper leagues), valued
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
        pickValue: State.marketRankings.length > 0 ? (clean) => getMarketValue(clean)?.value || 0 : null,
        normalize: normalizeName
    });

    const addingNames = adder === 'them' ? getNames : giveNames;
    const result = fairSuggestions({
        getValues, giveValues, candidates, waiver,
        inTrade: getNames.concat(giveNames).filter(n => !isDraftPickName(n)).map(normalizeName),
        onAddingSide: addingNames.map(normalizeName)
    });
    if (!result) return '';

    const whose = team === 'You' ? 'your roster' : `${escapeHtml(team)}'s roster`;
    const side = result.side;
    let body;
    // "about 9,800" when the banner says 9,323: one more player on that side moves the waiver adjustment.
    const waiverMoves = Math.abs(Math.abs(gap.diff) - gap.needed) >= 1
        ? ' Counts the waiver adjustment, which changes with one more player.' : '';
    if (result.singles.length) {
        body = `<div class="mls-trade-fair-via">By ${label}, from ${whose}. Any one of these brings it within 10%.${waiverMoves}</div>`
            + list(result.singles, side);
    } else if (result.pairs.length) {
        body = `<div class="mls-trade-fair-via">No single player on ${whose} closes a ${fmt(result.gap)} gap.${waiverMoves} By ${label}, these pairs would:</div>`
            + list(result.pairs, side);
    } else {
        body = `<div class="mls-trade-fair-note">No player or pair on ${whose} closes a ${fmt(result.gap)} gap by ${label}.</div>`;
    }
    const shown = result.singles.concat(result.pairs);
    if (shown.some(f => f.players.some(p => p.isPick))) {
        body += `<div class="mls-trade-fair-note">* Draft pick: market value. Assumes ${team === 'You' ? 'you still have your' : `${escapeHtml(team)} still has its`} own picks (traded picks aren't synced).</div>`;
    }
    return section(adder, result.gap, body);
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
    return `<ul class="mls-trade-fair-list">${fits.map(f => {
        const names = f.players.map(p => p.name);
        const badges = f.players.map(p => p.isPick
            ? PICK_BADGE_HTML
            : `<span class="badge pos-badge ${escapeHtml(p.pos || 'FLEX')} mls-pos-badge-sizing">${escapeHtml(p.pos || 'FA')}</span>`).join('');
        // The second name carries the "+", so a pair wraps as "Gibbs" / "+ Barkley", never a "+" on its own line.
        const label = f.players.map((p, i) => `<span class="mls-trade-fair-player">${i ? '<span class="mls-trade-fair-plus">+</span> ' : ''}${escapeHtml(p.name)}${p.isPick ? '<sup>*</sup>' : ''}</span>`).join('');
        return `<li class="mls-trade-fair-item">
            <span class="mls-trade-fair-badges">${badges}</span>
            <span class="mls-trade-fair-names">${label}</span>
            <span class="mls-trade-fair-val">${fmt(f.value)}</span>
            <button type="button" class="btn btn-secondary mls-btn-sm mls-trade-fair-add" data-action="addFairSuggestion" data-side="${side}" data-names="${escapeHtml(JSON.stringify(names))}" aria-label="Add ${escapeHtml(names.join(' and '))} to ${where}">${names.length > 1 ? 'Add both' : 'Add'}</button>
        </li>`;
    }).join('')}</ul>`;
}
