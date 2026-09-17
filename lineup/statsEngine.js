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
 */
export const getPlayerVarianceProfile = (weeklyScores) => {
    const mean = calculateMean(weeklyScores);
    const sampleStdDev = calculateStandardDeviation(weeklyScores);
    const gamesPlayed = weeklyScores ? weeklyScores.length : 0;

    const usedFallback = gamesPlayed < MIN_RELIABLE_GAMES;
    const stdDev = usedFallback ? Math.max(sampleStdDev, mean * FALLBACK_CV) : sampleStdDev;

    return {
        mean: Number(mean.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        // Floor shouldn't dip below zero in standard formats
        floor: Number(Math.max(0, mean - stdDev).toFixed(2)),
        ceiling: Number((mean + stdDev).toFixed(2)),
        gamesPlayed,
        usedFallback
    };
};