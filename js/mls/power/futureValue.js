// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: FUTURE VALUE (the age
// curves), plus the Sleeper age index and resolvePowerFuture, which sat under TEAM DIRECTION LABELS
// but feed the Future column.
import { State } from '../state.js';
import { getSleeperMetaByName } from '../scout/waivers.js';
import { refreshPowerRankings } from './rosterCard.js';
import { tablePickRank } from '../leagues/picks.js';
import { getMarketValue } from '../trade/valueCurve.js';
import { nextDraftYears } from '../trade/makeFair.js';

// --- FUTURE VALUE (dynasty / keeper) ---
// Rough positional age curves: a multiplier on each player's rankings value, >1 before a
// position's typical peak and falling off after it (RBs earliest, QBs latest). Custom dynasty
// rankings usually price age in already, so these are deliberately gentle -- they tilt a
// roster's future score toward youth rather than overriding the board. A heuristic, and the
// guide says so; not a projection model. Each row is [max age, multiplier]; unknown age = 1.
const POWER_AGE_CURVES = {
    QB: [[26, 1.10], [30, 1.05], [32, 1.00], [33, 0.90], [34, 0.80], [35, 0.70], [Infinity, 0.55]],
    RB: [[24, 1.15], [25, 1.05], [26, 0.95], [27, 0.80], [28, 0.65], [29, 0.50], [Infinity, 0.35]],
    WR: [[24, 1.15], [26, 1.05], [27, 1.00], [28, 0.90], [29, 0.75], [30, 0.60], [31, 0.45], [Infinity, 0.35]],
    TE: [[25, 1.10], [27, 1.05], [28, 1.00], [29, 0.90], [30, 0.75], [31, 0.60], [Infinity, 0.45]]
};
export function powerAgeFactor(pos, age) {
    const curve = POWER_AGE_CURVES[pos];
    if (!curve || !Number.isFinite(age) || age <= 0) return 1;
    for (const [maxAge, factor] of curve) if (age <= maxAge) return factor;
    return 1;
}

// Clean name -> age, from the same day-cached Sleeper player map everything else uses. The card
// renders without the Future column until this resolves, then re-renders once; a failed load
// is remembered for the session so it doesn't retry on every Roster tab render.
let _powerAgeIndex = null;
let _powerAgeState = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed'
let _powerAgePromise = null;
function ageFromMeta(m) {
    if (m.birthDate) {
        const b = new Date(m.birthDate + 'T00:00:00');
        if (!isNaN(b)) {
            const now = new Date();
            let age = now.getFullYear() - b.getFullYear();
            if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
            if (age > 15 && age < 50) return age;
        }
    }
    const a = Number(m.age);
    return Number.isFinite(a) && a > 0 ? a : null;
}
export function ensurePowerAgeIndex() {
    if (_powerAgeState !== 'idle') return;
    _powerAgeState = 'loading';
    _powerAgePromise = getSleeperMetaByName().then(meta => {
        const idx = {};
        Object.entries(meta).forEach(([clean, m]) => {
            const age = ageFromMeta(m);
            if (age != null) idx[clean] = age;
        });
        _powerAgeIndex = idx;
        _powerAgeState = 'ready';
        refreshPowerRankings();
    }).catch(err => {
        console.warn('Power Rankings: Sleeper player ages unavailable; future value falls back to Market Consensus if loaded.', err);
        _powerAgeState = 'failed';
        refreshPowerRankings();
    });
}

// For a caller that can wait (the Trade Analyzer's Power Rankings after the trade, improvements S14):
// starts the load if needed and resolves once ages are ready or have failed, so resolvePowerFuture
// then gives the final answer.
export function whenPowerAgesLoaded() {
    ensurePowerAgeIndex();
    return _powerAgePromise || Promise.resolve();
}

// Future value source for the active league: rankings x Sleeper age (preferred), else dynasty
// Market Consensus values, else none. Market data only counts when it was pulled as Dynasty --
// redraft market values say nothing about next year.
export function resolvePowerFuture() {
    const dynastyMarket = isDynastyMarket();
    if (_powerAgeState === 'ready') return { future: { mode: 'age', ages: _powerAgeIndex, pickRank: powerPickRank }, label: 'age', picks: picksLabel() };
    if (_powerAgeState === 'failed' && dynastyMarket) return { future: { mode: 'market', rankings: State.marketRankings, pickRank: powerPickRank }, label: 'market', picks: picksLabel() };
    return { future: null, label: _powerAgeState === 'loading' ? 'loading' : 'none' };
}

const isDynastyMarket = () => State.marketRankings.length > 0 && State.marketSettings && State.marketSettings.type === 'dynasty';
// 'market' when dynasty Market Consensus prices the picks, else 'table'; for the notes under the tables.
const picksLabel = () => isDynastyMarket() ? 'market' : 'table';

// A draft pick's worth in the Future column (improvements S19, round 3, owner's choice): the overall rank dynasty
// Market Consensus gives that pick (its year and round), else the set table (leagues/picks.js tablePickRank).
// pick: a league.picks entry ({ name, season, round }).
export function powerPickRank(pick) {
    if (isDynastyMarket()) {
        const m = getMarketValue(null, pick.name);
        if (m && m.rank > 0) return { rank: m.rank, source: 'market' };
    }
    const first = nextDraftYears(new Date())[0];
    return { rank: tablePickRank(pick.round, (Number(pick.season) || first) - first), source: 'table' };
}

// The sentence under a Future column about picks, or '' when the league has none synced. label: resolvePowerFuture's
// picks ('market' | 'table').
export function powerPicksNote(league, label) {
    if (!league || !league.picks) return '';
    return label === 'market'
        ? "Draft picks each team holds (from Sleeper) count too, at their dynasty Market Consensus value (a set table by round for any pick the market doesn't price)."
        : "Draft picks each team holds (from Sleeper) count too, by a set table: a 1st like the 48th-ranked player, a 2nd the 100th, a 3rd the 160th, a 4th the 230th, later drafts a little less. Pull Dynasty Market Consensus (Trade Finder, Scout tab) to use market values.";
}

// The right-hand text of a Future tooltip row: "24 yrs · #2" for a player (age when known), "Pick · like #48" for a
// draft pick (the rank of a player it counts like). Shared by the Roster tab's table and the Trade Analyzer's.
export function futureRankText(p) {
    if (p.isPick) return `Pick &middot; like #${p.rank}`;
    return `${p.age != null ? `${p.age} yrs &middot; ` : ''}#${p.futureRank != null ? p.futureRank : p.rank}`;
}

// The lines under a Future tooltip's top rows: how many players aren't shown, and the picks that aren't, by name, so a
// team's picks never hide behind "+ 10 more". list: team.futurePlayers; shown: how many rows the tooltip drew.
// esc: the caller's HTML escaper.
export function futureMoreHTML(list, shown, esc) {
    const rest = (list || []).slice(shown);
    const picks = rest.filter(p => p.isPick);
    const players = rest.length - picks.length;
    let html = '';
    if (players > 0) html += `<div class="mls-power-tooltip-more">+ ${players} more player${players > 1 ? 's' : ''}</div>`;
    if (picks.length) html += `<div class="mls-power-tooltip-more">Picks: ${picks.map(p => `${p.moved ? '+ ' : ''}${esc(p.name)}`).join(', ')}</div>`;
    return html;
}
