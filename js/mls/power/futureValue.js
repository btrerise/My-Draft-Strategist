// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: FUTURE VALUE (the age
// curves), plus the Sleeper age index and resolvePowerFuture, which sat under TEAM DIRECTION LABELS
// but feed the Future column.
import { State } from '../state.js';
import { getSleeperMetaByName } from '../scout/waivers.js';
import { refreshPowerRankings } from './rosterCard.js';

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
    getSleeperMetaByName().then(meta => {
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

// Future value source for the active league: rankings x Sleeper age (preferred), else dynasty
// Market Consensus values, else none. Market data only counts when it was pulled as Dynasty --
// redraft market values say nothing about next year.
export function resolvePowerFuture() {
    if (_powerAgeState === 'ready') return { future: { mode: 'age', ages: _powerAgeIndex }, label: 'age' };
    const dynastyMarket = State.marketRankings.length > 0 && State.marketSettings && State.marketSettings.type === 'dynasty';
    if (_powerAgeState === 'failed' && dynastyMarket) return { future: { mode: 'market', rankings: State.marketRankings }, label: 'market' };
    return { future: null, label: _powerAgeState === 'loading' ? 'loading' : 'none' };
}
