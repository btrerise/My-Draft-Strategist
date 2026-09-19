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

// Once the season has genuinely progressed, a player's own current-season games are a more
// honest read on their role right now than anything blended in from last year -- last year's
// box scores describe a different opportunity than a player might have today (a bigger role,
// a coaching change, etc.), and Boom/Bust's whole premise is "how does this player perform
// under their CURRENT circumstances." This is a week-based gate rather than a per-player
// exception someone has to remember to revisit: once currentWeek reaches this value, weeks 1
// through (MIN_WEEK_FOR_CURRENT_SEASON_ONLY - 1) are complete, i.e. "4 weeks of current-season
// data" per week 5. Below this, or for any player who individually still hasn't cleared
// MIN_RELIABLE_GAMES on current-season games alone (a bye-heavy or injury-shortened stretch),
// Boom/Bust falls back to blended data -- prior season isn't thrown out, just demoted to a
// fallback rather than trusted as a primary signal once something better exists.
const MIN_WEEK_FOR_CURRENT_SEASON_ONLY = 5;

function computeEmpiricalBoomBust(scores, bustThreshold, boomThreshold, meta) {
    const n = scores.length;
    const bustCount = scores.filter(s => s < bustThreshold).length;
    const boomCount = scores.filter(s => s > boomThreshold).length;
    return {
        bustRate: Number((bustCount / n * 100).toFixed(1)),
        boomRate: Number((boomCount / n * 100).toFixed(1)),
        bustThreshold: Number(bustThreshold.toFixed(2)),
        boomThreshold: Number(boomThreshold.toFixed(2)),
        ...meta
    };
}

function computeModelBoomBust(mean, stdDev, bustThreshold, boomThreshold, meta) {
    // A 0 stdDev means the "distribution" is a single fixed point at mean -- it's either
    // always or never past a threshold, never sometimes, so the CDF math below (which
    // divides by stdDev) doesn't apply.
    if (stdDev === 0) {
        return {
            bustRate: mean < bustThreshold ? 100 : 0,
            boomRate: mean > boomThreshold ? 100 : 0,
            bustThreshold: Number(bustThreshold.toFixed(2)),
            boomThreshold: Number(boomThreshold.toFixed(2)),
            ...meta
        };
    }
    const bustRate = standardNormalCDF((bustThreshold - mean) / stdDev) * 100;
    const boomRate = (1 - standardNormalCDF((boomThreshold - mean) / stdDev)) * 100;
    return {
        bustRate: Number(bustRate.toFixed(1)),
        boomRate: Number(boomRate.toFixed(1)),
        bustThreshold: Number(bustThreshold.toFixed(2)),
        boomThreshold: Number(boomThreshold.toFixed(2)),
        ...meta
    };
}

/**
 * Given a player's variance profile and their actual weekly scores, returns how often (as a
 * %) they scored below a "bust" threshold or above a "boom" threshold. Thresholds come from
 * POSITION_BOOM_BUST_THRESHOLDS when the player's position is in that table; otherwise (K,
 * DEF) they're derived from the player's own mean instead (see that table's comment).
 *
 * Which DATA answers the question is a tiered fallback, evaluated fresh on every call so
 * there's nothing to remember to come back and change later:
 *   1. A Sleeper projection (profile.usingProjection) already encodes "this player's
 *      situation is different now" -- role change, coaching change, opportunity shift --
 *      better than any of our own counting could, so Boom/Bust is computed from the model
 *      (mean/stdDev via the normal CDF) to stay consistent with that same corrected mean,
 *      rather than re-litigating it against old box scores.
 *   2. Without a projection, once the season has matured (see MIN_WEEK_FOR_CURRENT_SEASON_ONLY)
 *      AND this specific player has enough of their own current-season games, Boom/Bust is
 *      counted directly from THIS season's games only.
 *   3. Otherwise, blended current+prior-season data (today's/early-season default) -- counted
 *      empirically whenever there's enough combined sample, since real fantasy scoring isn't
 *      symmetric (floored at 0, can spike well past 2x), which a player's own game log
 *      captures in a way a symmetric normal model never could.
 *   4. If even blended data doesn't clear the bar, the normal-model estimate, flagged
 *      isEstimated to match getPlayerVarianceProfile's own usedFallback marker.
 *
 * @param {{mean: number, stdDev: number, pos: string, usingProjection?: boolean}} profile
 * @param {Array<number>} weeklyScores - blended current+prior-season scores (tier 3/4 input)
 * @param {Object} [options]
 * @param {Array<number>} [options.currentSeasonScores] - this season's games only (tier 2 input)
 * @param {number} [options.currentWeek] - the current NFL week, used for the tier 2 gate
 * @param {number} [options.bustMultiplier=0.5] - K/DEF-only bust threshold, as a fraction of mean
 * @param {number} [options.boomMultiplier=1.5] - K/DEF-only boom threshold, as a multiple of mean
 */
export function getBoomBustRates(profile, weeklyScores, options = {}) {
    const {
        bustMultiplier = DEFAULT_BUST_MULTIPLIER, boomMultiplier = DEFAULT_BOOM_MULTIPLIER,
        currentSeasonScores = null, currentWeek = null
    } = options;
    const { mean, stdDev, pos, usingProjection, isActual } = profile;

    // Once a player has actually played, "how often would they bust/boom" isn't a forward
    // projection anymore -- it already happened, once, for real. None of the four tiers below
    // are meaningful questions to ask about a fixed, already-known result, so this skips them
    // entirely rather than computing a number that would look like a probability but isn't one.
    if (isActual) {
        return { bustRate: null, boomRate: null, bustThreshold: null, boomThreshold: null, isEstimated: false, tier: 'actual' };
    }

    const positionThresholds = POSITION_BOOM_BUST_THRESHOLDS[pos];
    const bustThreshold = positionThresholds ? positionThresholds.bust : mean * bustMultiplier;
    const boomThreshold = positionThresholds ? positionThresholds.boom : mean * boomMultiplier;

    // Tier 1: projection-driven mean -- stay consistent with it rather than counting old games.
    if (usingProjection) {
        return computeModelBoomBust(mean, stdDev, bustThreshold, boomThreshold, { isEstimated: false, tier: 'projection' });
    }

    // Tier 2: season has matured AND this player individually has enough current-season games.
    const seasonHasMatured = typeof currentWeek === 'number' && currentWeek >= MIN_WEEK_FOR_CURRENT_SEASON_ONLY;
    const hasEnoughCurrentSeasonGames = Array.isArray(currentSeasonScores) && currentSeasonScores.length >= MIN_RELIABLE_GAMES;
    if (seasonHasMatured && hasEnoughCurrentSeasonGames) {
        return computeEmpiricalBoomBust(currentSeasonScores, bustThreshold, boomThreshold, { isEstimated: false, tier: 'current-season' });
    }

    // Tier 3: blended current+prior-season data, same as before this tiering existed.
    if (weeklyScores && weeklyScores.length >= MIN_RELIABLE_GAMES) {
        return computeEmpiricalBoomBust(weeklyScores, bustThreshold, boomThreshold, { isEstimated: false, tier: 'blended' });
    }

    // Tier 4: not even blended data clears the bar.
    return computeModelBoomBust(mean, stdDev, bustThreshold, boomThreshold, { isEstimated: true, tier: 'model-fallback' });
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
 * @param {number|null} [options.actualScore] - this week's real, already-recorded fantasy
 *   score, once this player's real game has started producing live stats (most obviously
 *   Thursday Night, but just as relevant for the Sunday early slate once it's wrapped up, or
 *   checking win odds ahead of Sunday/Monday night with the early games already final).
 *   Sleeper itself keeps the pre-game projection visible even after real stats exist, purely
 *   for comparison -- it's not still a live estimate at that point, and simulating a
 *   distribution around it would just be wrong once a real result exists. actualScore takes
 *   priority over BOTH projectedMean and the historical trailing average whenever it's
 *   present, short-circuiting the rest of this function entirely.
 */
export const getPlayerVarianceProfile = (weeklyScores, options = {}) => {
    const { projectedMean = null, actualScore = null } = options;

    // stdDev collapses to 0 here on purpose: there's no more uncertainty about a game that's
    // already been played. That single change is enough to make every downstream consumer --
    // the Monte Carlo worker's draws, floor/ceiling display, getProbabilityBeats' bench
    // comparisons -- treat this player as a fixed number rather than a distribution, with no
    // separate "locked" code path needed anywhere else in the pipeline.
    if (typeof actualScore === 'number') {
        return {
            mean: Number(actualScore.toFixed(2)),
            stdDev: 0,
            floor: Number(actualScore.toFixed(2)),
            ceiling: Number(actualScore.toFixed(2)),
            gamesPlayed: weeklyScores ? weeklyScores.length : 0,
            usedFallback: false,
            usingProjection: false,
            isActual: true
        };
    }

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
        usingProjection,
        isActual: false
    };
};