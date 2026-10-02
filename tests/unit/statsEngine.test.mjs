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
        const tier3 = { bustRate: 20, boomRate: 20, bustThreshold: 7.5, boomThreshold: 20, isEstimated: false, tier: 'blended' };
        assert.deepEqual(getBoomBustRates(wr, blended), tier3);
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: 4, currentSeasonScores: [25, 3, 10] }), tier3);
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: 6, currentSeasonScores: [25, 3] }), tier3);
        assert.deepEqual(getBoomBustRates(wr, blended, { currentWeek: '6', currentSeasonScores: [25, 3, 10] }), tier3);
    });
    test('tier 3 thresholds are strict: exactly 7.5 is not a bust, exactly 20 is not a boom', () => {
        // blended = [5, 7.5, 20, 21, 8]: only 5 busts (< 7.5), only 21 booms (> 20).
        const r = getBoomBustRates(wr, blended);
        assert.equal(r.bustRate, 20);
        assert.equal(r.boomRate, 20);
        // Same for QB at 24/12: a 24-point week is not a boom, a 12-point week is not a bust.
        assert.deepEqual(getBoomBustRates({ mean: 24, stdDev: 5, pos: 'QB' }, [24, 24, 12, 12]), {
            bustRate: 0, boomRate: 0, bustThreshold: 12, boomThreshold: 24, isEstimated: false, tier: 'blended'
        });
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
    test('K / DEF (and any unknown pos): thresholds relative to own mean, 0.5x and 1.5x by default', () => {
        assert.deepEqual(getBoomBustRates({ mean: 8, stdDev: 3, pos: 'K' }, [4, 8, 12.5, 3.9]), {
            bustRate: 25, boomRate: 25, bustThreshold: 4, boomThreshold: 12, isEstimated: false, tier: 'blended'
        });
        assert.deepEqual(getBoomBustRates({ mean: 8, stdDev: 3, pos: 'DEF' }, [4, 8, 12.5, 3.9], { bustMultiplier: 0.25, boomMultiplier: 2 }), {
            bustRate: 0, boomRate: 0, bustThreshold: 2, boomThreshold: 16, isEstimated: false, tier: 'blended'
        });
        const unknown = getBoomBustRates({ mean: 10, stdDev: 3, pos: 'LB' }, [10, 10, 10]);
        assert.deepEqual([unknown.bustThreshold, unknown.boomThreshold], [5, 15]);
    });
    test('multipliers do not affect positions with fixed thresholds', () => {
        const r = getBoomBustRates(wr, blended, { bustMultiplier: 0.1, boomMultiplier: 9 });
        assert.deepEqual([r.bustThreshold, r.boomThreshold], [7.5, 20]);
    });
    test('stdDev 0 in the model: all-or-nothing, strict comparisons', () => {
        assert.deepEqual(getBoomBustRates({ mean: 8, stdDev: 0, pos: 'K' }, []), {
            bustRate: 0, boomRate: 0, bustThreshold: 4, boomThreshold: 12, isEstimated: true, tier: 'model-fallback'
        });
        assert.deepEqual(getBoomBustRates({ mean: 30, stdDev: 0, pos: 'QB' }, []), {
            bustRate: 0, boomRate: 100, bustThreshold: 12, boomThreshold: 24, isEstimated: true, tier: 'model-fallback'
        });
        assert.equal(getBoomBustRates({ mean: 5, stdDev: 0, pos: 'RB' }, []).bustRate, 100);
        assert.equal(getBoomBustRates({ mean: 20, stdDev: 0, pos: 'RB' }, []).boomRate, 0);
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
