// statsEngine.js

/**
 * Calculates the mean (average) of an array of weekly scores.
 */
export const calculateMean = (scores) => {
    if (!scores || scores.length === 0) return 0;
    const sum = scores.reduce((acc, val) => acc + val, 0);
    return sum / scores.length;
};

/**
 * Calculates the sample standard deviation (variance).
 * The higher the number, the more volatile (boom/bust) the player is.
 */
export const calculateStandardDeviation = (scores) => {
    // We need at least 2 games played to calculate variance
    if (!scores || scores.length < 2) return 0;
    
    const mean = calculateMean(scores);
    
    // 1. Find the difference between each score and the mean, then square it
    const squareDiffs = scores.map(score => {
        const diff = score - mean;
        return diff * diff;
    });
    
    // 2. Find the average of those squared differences (using length - 1 for a sample)
    const sumOfSquaredDiffs = squareDiffs.reduce((acc, val) => acc + val, 0);
    const variance = sumOfSquaredDiffs / (scores.length - 1); 
    
    // 3. The standard deviation is the square root of the variance
    return Math.sqrt(variance);
};

// --- ANALYTICAL NORMAL-DISTRIBUTION HELPERS ---
// worker.js's Monte Carlo loop already treats each player's score as Normal(mean, stdDev)
// via Box-Muller. The functions below answer questions about that *same* distribution
// analytically (via the normal CDF) rather than running a second, separate simulation --
// so "boom rate" and "bench beats starter" percentages are guaranteed consistent with what
// the worker's simulation would converge to given enough iterations, not a competing estimate.

// Abramowitz & Stegun 7.1.26 approximation of the error function (max error ~1.5e-7) --
// there's no built-in erf/normal-CDF in JS, and this is the standard, well-documented
// approximation for it rather than a home-grown one.
function erf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}

/** Standard normal CDF: P(Z <= z) for Z ~ Normal(0, 1). */
export function standardNormalCDF(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Absolute, position-specific point thresholds for Boom/Bust, matching a commonly-used FF
// boom/bust framework rather than a threshold derived from each player's own average. This
// means "boom" is the same real accomplishment (e.g. 20+ points from a WR) whether it's your
// league's elite WR1 or your flex-streaming WR3 -- a relative-to-self threshold would instead
// call a bench player's mediocre-but-above-their-own-average week a "boom," which isn't how
// anyone actually uses the term. K and DEF aren't part of that published framework, so those
// two positions fall back to the relative-to-mean approach below rather than a fabricated
// absolute number with no source behind it. These are applied as published, without any
// per-scoring-format rescaling -- introducing our own scaling guess for half-PPR/standard
// leagues would turn "the recognized standard" into "our modified version of it."
const POSITION_BOOM_BUST_THRESHOLDS = {
    QB: { boom: 24, bust: 12 },
    RB: { boom: 20, bust: 7 },
    WR: { boom: 20, bust: 7.5 },
    TE: { boom: 15, bust: 5.5 }
};

// Boom/bust thresholds for positions outside that framework (K, DEF) are defined relative to
// the player's OWN mean (half of it for bust, 1.5x for boom) rather than a fixed point total,
// so they mean the same thing for a low-scoring kicker as for a high-scoring one.
const DEFAULT_BUST_MULTIPLIER = 0.5;
const DEFAULT_BOOM_MULTIPLIER = 1.5;

/**
 * Given a player's variance profile and their actual weekly scores, returns how often (as a
 * %) they scored below a "bust" threshold or above a "boom" threshold. Thresholds come from
 * POSITION_BOOM_BUST_THRESHOLDS when the player's position is in that table; otherwise (K,
 * DEF) they're derived from the player's own mean instead (see that table's comment).
 *
 * The rate itself is computed empirically -- counted directly from weeklyScores -- whenever
 * there's enough sample, rather than derived from the normal-distribution assumption used
 * elsewhere in this file. Real fantasy scoring isn't symmetric -- it's floored at 0 but can
 * spike well past 2x on a big week -- so a player's own game log captures real skew in a way
 * a symmetric normal model never could. The normal-model estimate is kept only as a fallback
 * for players without enough games to count from directly (mirrors getPlayerVarianceProfile's
 * own reliability bar, so a player isn't "reliable" over there but "estimated" over here).
 *
 * @param {{mean: number, stdDev: number, pos: string}} profile
 * @param {Array<number>} weeklyScores - the same array getPlayerVarianceProfile was built from
 * @param {Object} [options]
 * @param {number} [options.bustMultiplier=0.5] - K/DEF-only bust threshold, as a fraction of mean
 * @param {number} [options.boomMultiplier=1.5] - K/DEF-only boom threshold, as a multiple of mean
 */
export function getBoomBustRates(profile, weeklyScores, options = {}) {
    const { bustMultiplier = DEFAULT_BUST_MULTIPLIER, boomMultiplier = DEFAULT_BOOM_MULTIPLIER } = options;
    const { mean, stdDev, pos } = profile;
    const positionThresholds = POSITION_BOOM_BUST_THRESHOLDS[pos];
    const bustThreshold = positionThresholds ? positionThresholds.bust : mean * bustMultiplier;
    const boomThreshold = positionThresholds ? positionThresholds.boom : mean * boomMultiplier;

    if (weeklyScores && weeklyScores.length >= MIN_RELIABLE_GAMES) {
        const n = weeklyScores.length;
        const bustCount = weeklyScores.filter(s => s < bustThreshold).length;
        const boomCount = weeklyScores.filter(s => s > boomThreshold).length;
        return {
            bustRate: Number((bustCount / n * 100).toFixed(1)),
            boomRate: Number((boomCount / n * 100).toFixed(1)),
            bustThreshold: Number(bustThreshold.toFixed(2)),
            boomThreshold: Number(boomThreshold.toFixed(2)),
            isEstimated: false
        };
    }

    // --- Fallback for small samples: symmetric normal-model estimate ---
    // A 0 stdDev means the "distribution" is a single fixed point at mean -- it's either
    // always or never past a threshold, never sometimes, so the CDF math below (which
    // divides by stdDev) doesn't apply.
    if (stdDev === 0) {
        return {
            bustRate: mean < bustThreshold ? 100 : 0,
            boomRate: mean > boomThreshold ? 100 : 0,
            bustThreshold: Number(bustThreshold.toFixed(2)),
            boomThreshold: Number(boomThreshold.toFixed(2)),
            isEstimated: true
        };
    }

    const bustRate = standardNormalCDF((bustThreshold - mean) / stdDev) * 100;
    const boomRate = (1 - standardNormalCDF((boomThreshold - mean) / stdDev)) * 100;

    return {
        bustRate: Number(bustRate.toFixed(1)),
        boomRate: Number(boomRate.toFixed(1)),
        bustThreshold: Number(bustThreshold.toFixed(2)),
        boomThreshold: Number(boomThreshold.toFixed(2)),
        isEstimated: true
    };
}

/**
 * P(player A outscores player B in a given week), treating both as independent normal
 * variables -- exactly the same independence assumption the worker's team-vs-team simulation
 * already makes (it sums independently-drawn player scores per team). For independent
 * A ~ N(meanA, stdA) and B ~ N(meanB, stdB), (A - B) ~ N(meanA - meanB, sqrt(stdA^2 + stdB^2)),
 * so P(A > B) = P(A - B > 0) = normalCDF((meanA - meanB) / combinedStdDev).
 * @param {{mean: number, stdDev: number}} profileA
 * @param {{mean: number, stdDev: number}} profileB
 * @returns {number} probability (0-100) that A outscores B
 */
export function getProbabilityBeats(profileA, profileB) {
    const meanDiff = profileA.mean - profileB.mean;
    const combinedStdDev = Math.sqrt(profileA.stdDev ** 2 + profileB.stdDev ** 2);

    if (combinedStdDev === 0) {
        if (meanDiff > 0) return 100;
        if (meanDiff < 0) return 0;
        return 50; // exact tie, no variance on either side
    }

    return Number((standardNormalCDF(meanDiff / combinedStdDev) * 100).toFixed(1));
}

// A single game (or even two) can't produce a statistically meaningful standard deviation --
// calculateStandardDeviation correctly returns 0 for those cases, but feeding a 0 stdDev into
// the Monte Carlo worker makes that player's simulated score *deterministic* (no randomNormal()
// contribution at all). Early in the season, when most/all players are in this position, that
// silently turns the whole "simulation" into a single fixed comparison of everyone's known
// score-to-date -- guaranteeing a 100/0 (or 0/100) result with zero ties, which is exactly what
// a small sample size produces but looks indistinguishable from a broken data pipeline.
//
// MIN_RELIABLE_GAMES/FALLBACK_CV give small samples a non-zero, honestly-labeled estimate
// instead: below the threshold, stdDev floors at (mean * FALLBACK_CV) -- 40% is a commonly-cited
// ballpark coefficient of variation for single-game fantasy scoring across skill positions, used
// here only as a floor, not a measurement. getPlayerVarianceProfile reports usedFallback so
// callers can label these players' ranges as estimated rather than implying it's the same rigor
// as a full-sample standard deviation.
// Exported so other modules (e.g. sleeperService.js's prior-season supplementation) use the
// exact same "is this sample big enough" threshold rather than a second hardcoded copy that
// could silently drift out of sync with this one.
export const MIN_RELIABLE_GAMES = 3;
const FALLBACK_CV = 0.40;

/**
 * Generates the full variance profile for a player to be used in the Monte Carlo simulation.
 * @param {Array} weeklyScores - Array of fantasy points scored in each week (e.g., [14.2, 8.5, 22.1])
 * @param {Object} [options]
 * @param {number|null} [options.projectedMean] - a matchup-specific projection (e.g. Sleeper's
 *   own weekly projection, which factors in this week's opponent, injury designation, bye
 *   weeks, etc.) to use as the distribution's center instead of the flat trailing average of
 *   weeklyScores. Volatility (stdDev) is still measured from real history regardless -- a
 *   single projected number is a point estimate, not a distribution, so it has nothing to say
 *   about spread. Omitted/null when no projection is available, which is the common case for
 *   deep bench/waiver-tier players Sleeper doesn't bother projecting.
 */
export const getPlayerVarianceProfile = (weeklyScores, options = {}) => {
    const { projectedMean = null } = options;
    const historicalMean = calculateMean(weeklyScores);
    const sampleStdDev = calculateStandardDeviation(weeklyScores);
    const gamesPlayed = weeklyScores ? weeklyScores.length : 0;

    const usingProjection = typeof projectedMean === 'number';
    const mean = usingProjection ? projectedMean : historicalMean;

    const usedFallback = gamesPlayed < MIN_RELIABLE_GAMES;
    const stdDev = usedFallback ? Math.max(sampleStdDev, mean * FALLBACK_CV) : sampleStdDev;

    return {
        mean: Number(mean.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        // Floor shouldn't dip below zero in standard formats
        floor: Number(Math.max(0, mean - stdDev).toFixed(2)),
        ceiling: Number((mean + stdDev).toFixed(2)),
        gamesPlayed,
        usedFallback,
        usingProjection
    };
};