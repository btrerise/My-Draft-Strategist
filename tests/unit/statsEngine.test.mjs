// Characterization tests for js/mls/sim/stats.js (lineup/statsEngine.js until 3F; refactor chunk 0B).
// These pin what the module does TODAY, including the odd bits listed in
// docs/refactor/LOG.md, so a later move can't change it unnoticed. If a test here fails after
// a pure move, the move changed behavior; if a deliberate fix changes it, update the test and
// say so in LOG.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as stats from '../../js/mls/sim/stats.js';
import {
    MIN_RELIABLE_GAMES, calculateMean, calculateStandardDeviation, standardNormalCDF,
    getBoomBustRates, getProbabilityBeats, getPlayerVarianceProfile
} from '../../js/mls/sim/stats.js';

const close = (actual, expected, eps = 1e-9) =>
    assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be within ${eps} of ${expected}`);

describe('exports', () => {
    test('public surface is unchanged', () => {
        assert.deepEqual(Object.keys(stats).sort(), [
            'MIN_RELIABLE_GAMES', 'calculateMean', 'calculateStandardDeviation', 'getBoomBustRates',
            'getPlayerVarianceProfile', 'getProbabilityBeats', 'standardNormalCDF'
        ]);
        assert.equal(MIN_RELIABLE_GAMES, 3);
    });
});

describe('calculateMean', () => {
    test('averages the scores', () => {
        assert.equal(calculateMean([10, 20, 30]), 20);
        close(calculateMean([14.2, 8.5, 22.1]), 14.933333333333332);
    });
    test('empty or missing input is 0', () => {
        assert.equal(calculateMean([]), 0);
        assert.equal(calculateMean(null), 0);
        assert.equal(calculateMean(undefined), 0);
    });
});

describe('calculateStandardDeviation', () => {
    test('is the SAMPLE standard deviation (n - 1)', () => {
        assert.equal(calculateStandardDeviation([10, 20, 30]), 10);
        close(calculateStandardDeviation([14.2, 8.5, 22.1, 3]), 8.16680271995514);
    });
    test('fewer than 2 scores is 0', () => {
        assert.equal(calculateStandardDeviation([12]), 0);
        assert.equal(calculateStandardDeviation([]), 0);
        assert.equal(calculateStandardDeviation(null), 0);
    });
});

describe('standardNormalCDF (A&S 7.1.26 erf approximation)', () => {
    test('known points', () => {
        // Not exactly 0.5: the approximation's coefficients sum to 0.999999999.
        assert.equal(standardNormalCDF(0), 0.5000000005);
        close(standardNormalCDF(1.96), 0.9750021738917761, 1e-12);
        close(standardNormalCDF(-1), 0.15865526383236372, 1e-12);
        close(standardNormalCDF(3), 0.9986500327186852, 1e-12);
    });
    test('symmetric around 0', () => {
        close(standardNormalCDF(-1.5) + standardNormalCDF(1.5), 1, 1e-8);
    });
});

describe('getPlayerVarianceProfile', () => {
    test('full sample: historical mean and sample stdDev, rounded to 2 dp', () => {
        assert.deepEqual(getPlayerVarianceProfile([14.2, 8.5, 22.1]), {
            mean: 14.93, stdDev: 6.83, floor: 8.1, ceiling: 21.76,
            gamesPlayed: 3, usedFallback: false, usingProjection: false, isActual: false
        });
    });
    test('fewer than MIN_RELIABLE_GAMES: stdDev floors at 40% of the mean', () => {
        assert.deepEqual(getPlayerVarianceProfile([12]), {
            mean: 12, stdDev: 4.8, floor: 7.2, ceiling: 16.8,
            gamesPlayed: 1, usedFallback: true, usingProjection: false, isActual: false
        });
    });
    test('projectedMean replaces the historical mean; fallback CV uses the projected mean', () => {
        assert.deepEqual(getPlayerVarianceProfile([12], { projectedMean: 15 }), {
            mean: 15, stdDev: 6, floor: 9, ceiling: 21,
            gamesPlayed: 1, usedFallback: true, usingProjection: true, isActual: false
        });
        assert.deepEqual(getPlayerVarianceProfile([], { projectedMean: 15 }), {
            mean: 15, stdDev: 6, floor: 9, ceiling: 21,
            gamesPlayed: 0, usedFallback: true, usingProjection: true, isActual: false
        });
    });
    test('projectedMean null is treated as "no projection"', () => {
        assert.equal(getPlayerVarianceProfile([10, 20, 30], { projectedMean: null }).usingProjection, false);
    });
    test('no games at all', () => {
        assert.deepEqual(getPlayerVarianceProfile(null), {
            mean: 0, stdDev: 0, floor: 0, ceiling: 0,
            gamesPlayed: 0, usedFallback: true, usingProjection: false, isActual: false
        });
    });
    test('actualScore short-circuits everything, stdDev 0', () => {
        assert.deepEqual(getPlayerVarianceProfile([10, 30], { actualScore: 17.456, projectedMean: 12 }), {
            mean: 17.46, stdDev: 0, floor: 17.46, ceiling: 17.46,
            gamesPlayed: 2, usedFallback: false, usingProjection: false, isActual: true
        });
        assert.equal(getPlayerVarianceProfile(null, { actualScore: 0 }).isActual, true);
    });
    test('floor is clamped at 0 but ceiling is not', () => {
        assert.deepEqual(getPlayerVarianceProfile([4, -2, 20, 1]), {
            mean: 5.75, stdDev: 9.81, floor: 0, ceiling: 15.56,
            gamesPlayed: 4, usedFallback: false, usingProjection: false, isActual: false
        });
    });
});

describe('getBoomBustRates', () => {
    const wr = { mean: 15, stdDev: 6, pos: 'WR' };
    const blended = [5, 7.5, 20, 21, 8];

    test('isActual: every field null, tier "actual"', () => {
        assert.deepEqual(getBoomBustRates({ mean: 30, stdDev: 0, pos: 'QB', isActual: true }, []), {
            bustRate: null, boomRate: null, bustThreshold: null, boomThreshold: null, isEstimated: false, tier: 'actual'
        });
    });
    test('tier 1: projection uses the normal model even with plenty of games', () => {
        assert.deepEqual(getBoomBustRates({ ...wr, usingProjection: true }, [1, 2, 3, 4, 5]), {
            bustRate: 10.6, boomRate: 20.2, bustThreshold: 7.5, boomThreshold: 20, isEstimated: false, tier: 'projection'
        });
    });
    test('tier 2: week >= 5 and >= 3 current-season games counts this season only', () => {
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: 5, currentSeasonScores: [25, 3, 10] }), {
            bustRate: 33.3, boomRate: 33.3, bustThreshold: 7.5, boomThreshold: 20, isEstimated: false, tier: 'current-season'
        });
    });
    test('tier 2 gate: week 4, too few current games, or a non-number week all fall to tier 3', () => {
        const tier3 = { bustRate: 40, boomRate: 40, bustThreshold: 7.5, boomThreshold: 20, isEstimated: false, tier: 'blended' };
        assert.deepEqual(getBoomBustRates(wr, blended), tier3);
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: 4, currentSeasonScores: [25, 3, 10] }), tier3);
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: 6, currentSeasonScores: [25, 3] }), tier3);
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: '6', currentSeasonScores: [25, 3, 10] }), tier3);
    });
    // Refactor 9A: these were strict (exactly 20 was not a boom), pinned by 0B as CURRENT BEHAVIOR.
    test('tier 3 thresholds are inclusive for QB/RB/WR/TE: exactly 7.5 is a bust, exactly 20 is a boom', () => {
        // blended = [5, 7.5, 20, 21, 8]: 5 and 7.5 bust (<= 7.5), 20 and 21 boom (>= 20).
        const r = getBoomBustRates(wr, blended);
        assert.equal(r.bustRate, 40);
        assert.equal(r.boomRate, 40);
        // Same for QB at 24/12: a 24-point week is a boom, a 12-point week is a bust.
        assert.deepEqual(getBoomBustRates({ mean: 24, stdDev: 5, pos: 'QB' }, [24, 24, 12, 12]), {
            bustRate: 50, boomRate: 50, bustThreshold: 12, boomThreshold: 24, isEstimated: false, tier: 'blended'
        });
    });
    test('each position line: on it counts, a hundredth inside it does not', () => {
        const rates = (pos, scores) => {
            const r = getBoomBustRates({ mean: 12, stdDev: 5, pos }, scores);
            return [r.bustRate, r.boomRate];
        };
        assert.deepEqual(rates('QB', [12, 24, 12.01, 23.99]), [25, 25]);
        assert.deepEqual(rates('RB', [7, 20, 7.01, 19.99]), [25, 25]);
        assert.deepEqual(rates('WR', [7.5, 20, 7.51, 19.99]), [25, 25]);
        assert.deepEqual(rates('TE', [5.5, 15, 5.51, 14.99]), [25, 25]);
        // tier 2 (current season) uses the same test.
        const cur = getBoomBustRates({ mean: 12, stdDev: 5, pos: 'TE' }, [], { currentWeek: 6, currentSeasonScores: [5.5, 15, 10] });
        assert.deepEqual([cur.tier, cur.bustRate, cur.boomRate], ['current-season', 33.3, 33.3]);
    });
    // Refactor 9B follow-up: K/DEF lines were strict (9A), pinned by "K / DEF lines stay strict".
    test('K / DEF lines are inclusive since 9B; a player with no points is a bust, not a boom', () => {
        // mean 8: lines at 4 and 12, and exactly 4 / 12 count (was 0% / 0%).
        const k = getBoomBustRates({ mean: 8, stdDev: 3, pos: 'K' }, [4, 12, 8]);
        assert.deepEqual([k.bustRate, k.boomRate], [33.3, 33.3]);
        // A hundredth inside a line doesn't.
        const inside = getBoomBustRates({ mean: 8, stdDev: 3, pos: 'K' }, [4.01, 11.99, 8]);
        assert.deepEqual([inside.bustRate, inside.boomRate], [0, 0]);
        // mean 0: the lines come from the floor, 2 and 6. Before 9B both were 0, and strict made 0 neither.
        const def = getBoomBustRates({ mean: 0, stdDev: 2, pos: 'DEF' }, [0, 0, 0]);
        assert.deepEqual([def.bustThreshold, def.boomThreshold, def.bustRate, def.boomRate], [2, 6, 100, 0]);
        // The floor's lines count too: exactly 2 is a bust and exactly 6 a boom (was 0% / 0%).
        const onFloor = getBoomBustRates({ mean: 1, stdDev: 3, pos: 'DEF' }, [2, 6, 2, 6]);
        assert.deepEqual([onFloor.bustRate, onFloor.boomRate], [50, 50]);
    });
    // Refactor 9B: K/DEF lines are 0.5x and 1.5x of max(mean, 4). Before, a mean of zero or less put the
    // bust line on or above the boom line, so one week could count as both.
    test('K / DEF with a negative average: lines from the floor (2 / 6), never a bust and a boom at once', () => {
        // The simulator spec's Juliet DEF: weeks -7, 0, -4, 3, -1 (mean -1.8). Was 60% / 60% at lines -0.9 / -2.7.
        assert.deepEqual(getBoomBustRates({ mean: -1.8, stdDev: 3.96, pos: 'DEF' }, [-7, 0, -4, 3, -1]), {
            bustRate: 80, boomRate: 0, bustThreshold: 2, boomThreshold: 6, isEstimated: false, tier: 'blended'
        });
        // 9A's example, a mean of -2: was Bust 60% / Boom 80% at lines -1 / -3.
        const ex = getBoomBustRates({ mean: -2, stdDev: 1.5, pos: 'DEF' }, [-2, -2, -1, -4, 0]);
        assert.deepEqual([ex.bustRate, ex.boomRate], [100, 0]);
        // Too few games, so the model answers. Was 63.1% / 63.1%.
        assert.deepEqual(getBoomBustRates({ mean: -2, stdDev: 3, pos: 'DEF' }, []), {
            bustRate: 90.9, boomRate: 0.4, bustThreshold: 2, boomThreshold: 6, isEstimated: true, tier: 'model-fallback'
        });
    });
    test('K / DEF with an average of 0', () => {
        // Was 25% / 50% (lines both 0: -3 a bust; 1 and 7 booms).
        assert.deepEqual(getBoomBustRates({ mean: 0, stdDev: 4, pos: 'DEF' }, [0, 1, 7, -3]), {
            bustRate: 75, boomRate: 25, bustThreshold: 2, boomThreshold: 6, isEstimated: false, tier: 'blended'
        });
        // Model: was 50% / 50%.
        const m = getBoomBustRates({ mean: 0, stdDev: 4, pos: 'K' }, []);
        assert.deepEqual([m.bustRate, m.boomRate, m.bustThreshold, m.boomThreshold], [69.1, 6.7, 2, 6]);
    });
    test('K / DEF with a small positive average: lines no longer squeeze together', () => {
        // Mean 1: lines were 0.5 / 1.5 (45% / 45% in the model).
        const m = getBoomBustRates({ mean: 1, stdDev: 4, pos: 'DEF' }, []);
        assert.deepEqual([m.bustRate, m.boomRate, m.bustThreshold, m.boomThreshold], [59.9, 10.6, 2, 6]);
        // Counted: was 0% / 50% (2 and 6.5 above 1.5); 2 is on the bust line.
        const k = getBoomBustRates({ mean: 1, stdDev: 4, pos: 'K' }, [1, 2, 0.5, 6.5]);
        assert.deepEqual([k.bustRate, k.boomRate, k.bustThreshold, k.boomThreshold], [75, 25, 2, 6]);
        // Just under the floor: 3.99 gives the floor's lines (were 2 / 5.99).
        const under = getBoomBustRates({ mean: 3.99, stdDev: 2, pos: 'K' }, [1.9, 2, 6, 6.1]);
        assert.deepEqual([under.bustThreshold, under.boomThreshold, under.bustRate, under.boomRate], [2, 6, 50, 50]);
    });
    test('K / DEF averaging at least the floor keep their own lines (0.5x / 1.5x of the mean)', () => {
        // Exactly 4: the floor and the mean agree. 2 and 6 are on the lines, so they count.
        assert.deepEqual(getBoomBustRates({ mean: 4, stdDev: 2, pos: 'K' }, [1.9, 2, 6, 6.1]), {
            bustRate: 50, boomRate: 50, bustThreshold: 2, boomThreshold: 6, isEstimated: false, tier: 'blended'
        });
        assert.deepEqual(getBoomBustRates({ mean: 5, stdDev: 2, pos: 'DEF' }, [2.4, 2.5, 7.5, 7.6]), {
            bustRate: 50, boomRate: 50, bustThreshold: 2.5, boomThreshold: 7.5, isEstimated: false, tier: 'blended'
        });
        // Counted and modelled against 0.5x / 1.5x of the mean itself, for a range of means at or above 4.
        // The floor doesn't move these lines; only weeks exactly on a line changed (inclusive since 9B).
        const scores = [-3, 0, 1.5, 2, 3.1, 4.4, 6, 6.6, 9, 12, 15.2, 21];
        const pct = n => Number((n / scores.length * 100).toFixed(1));
        for (const mean of [4, 4.5, 5, 6.93, 8, 12.67]) {
            for (const pos of ['K', 'DEF']) {
                const counted = getBoomBustRates({ mean, stdDev: 3, pos }, scores);
                assert.deepEqual([counted.bustRate, counted.boomRate], [
                    pct(scores.filter(x => x <= mean * 0.5).length), pct(scores.filter(x => x >= mean * 1.5).length)
                ], `mean ${mean} ${pos}`);
                const model = getBoomBustRates({ mean, stdDev: 3, pos }, []);
                assert.deepEqual([model.bustRate, model.boomRate, model.bustThreshold, model.boomThreshold], [
                    Number((standardNormalCDF((mean * 0.5 - mean) / 3) * 100).toFixed(1)),
                    Number(((1 - standardNormalCDF((mean * 1.5 - mean) / 3)) * 100).toFixed(1)),
                    Number((mean * 0.5).toFixed(2)), Number((mean * 1.5).toFixed(2))
                ], `model mean ${mean} ${pos}`);
            }
        }
    });
    test('K / DEF: no average gives a week that is both a bust and a boom', () => {
        for (let mean = -10; mean <= 12; mean += 0.25) {
            const r = getBoomBustRates({ mean, stdDev: 0, pos: 'DEF' }, []);
            assert.ok(r.bustThreshold < r.boomThreshold, `mean ${mean}`);
            for (let s = -15; s <= 25; s += 0.5) {
                const one = getBoomBustRates({ mean, stdDev: 4, pos: 'DEF' }, [s, s, s]);
                assert.ok(!(one.bustRate === 100 && one.boomRate === 100), `mean ${mean}, week ${s}`);
            }
        }
    });
    test('tier 4: too little blended data falls back to the model, flagged isEstimated', () => {
        assert.deepEqual(getBoomBustRates(wr, [5, 20]), {
            bustRate: 10.6, boomRate: 20.2, bustThreshold: 7.5, boomThreshold: 20, isEstimated: true, tier: 'model-fallback'
        });
    });
    test('position thresholds: QB 24/12, RB 20/7, WR 20/7.5, TE 15/5.5', () => {
        const t = pos => {
            const r = getBoomBustRates({ mean: 10, stdDev: 3, pos }, [10, 10, 10]);
            return [r.boomThreshold, r.bustThreshold];
        };
        assert.deepEqual(t('QB'), [24, 12]);
        assert.deepEqual(t('RB'), [20, 7]);
        assert.deepEqual(t('WR'), [20, 7.5]);
        assert.deepEqual(t('TE'), [15, 5.5]);
    });
    test('K / DEF (and any unknown pos): thresholds relative to max(own mean, 4), 0.5x and 1.5x by default', () => {
        // 4 is on the bust line (counts since 9B; was 25%).
        assert.deepEqual(getBoomBustRates({ mean: 8, stdDev: 3, pos: 'K' }, [4, 8, 12.5, 3.9]), {
            bustRate: 50, boomRate: 25, bustThreshold: 4, boomThreshold: 12, isEstimated: false, tier: 'blended'
        });
        assert.deepEqual(getBoomBustRates({ mean: 8, stdDev: 3, pos: 'DEF' }, [4, 8, 12.5, 3.9], { bustMultiplier: 0.25, boomMultiplier: 2 }), {
            bustRate: 0, boomRate: 0, bustThreshold: 2, boomThreshold: 16, isEstimated: false, tier: 'blended'
        });
        const unknown = getBoomBustRates({ mean: 10, stdDev: 3, pos: 'LB' }, [10, 10, 10]);
        assert.deepEqual([unknown.bustThreshold, unknown.boomThreshold], [5, 15]);
        // 9B: the floor applies to unknown positions too, and the multipliers apply to the floor.
        const lowUnknown = getBoomBustRates({ mean: 1, stdDev: 3, pos: 'LB' }, [1, 1, 1]);
        assert.deepEqual([lowUnknown.bustThreshold, lowUnknown.boomThreshold], [2, 6]);
        const custom = getBoomBustRates({ mean: 0, stdDev: 2, pos: 'DEF' }, [0, 0, 0], { bustMultiplier: 0.25, boomMultiplier: 2 });
        assert.deepEqual([custom.bustThreshold, custom.boomThreshold, custom.bustRate, custom.boomRate], [1, 8, 100, 0]);
    });
    test('multipliers do not affect positions with fixed thresholds', () => {
        const r = getBoomBustRates(wr, blended, { bustMultiplier: 0.1, boomMultiplier: 9 });
        assert.deepEqual([r.bustThreshold, r.boomThreshold], [7.5, 20]);
    });
    test('stdDev 0 in the model: all-or-nothing; on the line counts for every position', () => {
        assert.deepEqual(getBoomBustRates({ mean: 8, stdDev: 0, pos: 'K' }, []), {
            bustRate: 0, boomRate: 0, bustThreshold: 4, boomThreshold: 12, isEstimated: true, tier: 'model-fallback'
        });
        assert.deepEqual(getBoomBustRates({ mean: 30, stdDev: 0, pos: 'QB' }, []), {
            bustRate: 0, boomRate: 100, bustThreshold: 12, boomThreshold: 24, isEstimated: true, tier: 'model-fallback'
        });
        assert.equal(getBoomBustRates({ mean: 5, stdDev: 0, pos: 'RB' }, []).bustRate, 100);
        // Refactor 9A: exactly on the line counts (both were 0 before).
        assert.equal(getBoomBustRates({ mean: 20, stdDev: 0, pos: 'RB' }, []).boomRate, 100);
        assert.equal(getBoomBustRates({ mean: 7, stdDev: 0, pos: 'RB' }, []).bustRate, 100);
        // No data at all for a kicker: mean 0, stdDev 0. 9B: the floor's lines (2 / 6) make 0 a bust
        // (was neither, at lines 0 / 0).
        const k0 = getBoomBustRates({ mean: 0, stdDev: 0, pos: 'K' }, []);
        assert.deepEqual([k0.bustRate, k0.boomRate, k0.bustThreshold, k0.boomThreshold], [100, 0, 2, 6]);
        // A negative mean with no spread: a bust, never a boom (was 0 / 100 at lines -1 / -3).
        const dNeg = getBoomBustRates({ mean: -2, stdDev: 0, pos: 'DEF' }, []);
        assert.deepEqual([dNeg.bustRate, dNeg.boomRate], [100, 0]);
        // A K exactly on its own line counts since 9B (was 0): mean 8 -> lines 4 / 12 never equal 8,
        // so move one line to the mean with a multiplier of 1.
        const kBust = getBoomBustRates({ mean: 8, stdDev: 0, pos: 'K' }, [], { bustMultiplier: 1 });
        assert.deepEqual([kBust.bustRate, kBust.boomRate], [100, 0]);
        const kBoom = getBoomBustRates({ mean: 8, stdDev: 0, pos: 'K' }, [], { boomMultiplier: 1 });
        assert.deepEqual([kBoom.bustRate, kBoom.boomRate], [0, 100]);
        // The no-data kicker sits below the floor's bust line (2), not on it; one at exactly 2 counts too.
        const k2 = getBoomBustRates({ mean: 2, stdDev: 0, pos: 'K' }, []);
        assert.deepEqual([k2.bustRate, k2.boomRate, k2.bustThreshold], [100, 0, 2]);
    });
});

describe('getProbabilityBeats', () => {
    test('normal difference, rounded to 1 dp', () => {
        assert.equal(getProbabilityBeats({ mean: 15, stdDev: 5 }, { mean: 12, stdDev: 4 }), 68);
        assert.equal(getProbabilityBeats({ mean: 10, stdDev: 3 }, { mean: 10, stdDev: 4 }), 50);
        assert.equal(getProbabilityBeats({ mean: 12, stdDev: 4 }, { mean: 15, stdDev: 5 }), 32);
    });
    test('no variance on either side: 100 / 0 / 50', () => {
        assert.equal(getProbabilityBeats({ mean: 11, stdDev: 0 }, { mean: 10, stdDev: 0 }), 100);
        assert.equal(getProbabilityBeats({ mean: 9, stdDev: 0 }, { mean: 10, stdDev: 0 }), 0);
        assert.equal(getProbabilityBeats({ mean: 10, stdDev: 0 }, { mean: 10, stdDev: 0 }), 50);
    });
});
