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

/**
 * Generates the full variance profile for a player to be used in the Monte Carlo simulation.
 * @param {Array} weeklyScores - Array of fantasy points scored in each week (e.g., [14.2, 8.5, 22.1])
 */
export const getPlayerVarianceProfile = (weeklyScores) => {
    const mean = calculateMean(weeklyScores);
    const stdDev = calculateStandardDeviation(weeklyScores);
    
    return {
        mean: Number(mean.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        // Floor shouldn't dip below zero in standard formats
        floor: Number(Math.max(0, mean - stdDev).toFixed(2)), 
        ceiling: Number((mean + stdDev).toFixed(2))
    };
};