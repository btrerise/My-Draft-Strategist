// worker.js

/**
 * Standard Normal variate using the Box-Muller transform.
 * This generates a random number that perfectly mimics a bell curve (normal distribution).
 */
function randomNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); 
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Simulates a single player's score for one week based on their mean and standard deviation.
 */
function simulatePlayerScore(mean, stdDev) {
    const projectedScore = mean + (stdDev * randomNormal());
    // Clamp the lowest possible score to 0 so players don't end up with -15 points 
    // unless you use leagues with extreme negative penalties.
    return Math.max(0, projectedScore); 
}

// Listen for messages from the main UI thread
self.onmessage = function(e) {
    // Expecting payload: { team1: [{mean, stdDev}], team2: [{mean, stdDev}], iterations: 10000 }
    const { team1, team2, iterations = 10000, fallbackCount = 0, projectionCount = 0 } = e.data;
    
    let team1Wins = 0;
    let team2Wins = 0;
    let ties = 0;

    // The Monte Carlo Loop
    for (let i = 0; i < iterations; i++) {
        let currentTeam1Score = 0;
        let currentTeam2Score = 0;

        // Simulate every active roster spot for Team 1
        for (let j = 0; j < team1.length; j++) {
            currentTeam1Score += simulatePlayerScore(team1[j].mean, team1[j].stdDev);
        }

        // Simulate every active roster spot for Team 2
        for (let j = 0; j < team2.length; j++) {
            currentTeam2Score += simulatePlayerScore(team2[j].mean, team2[j].stdDev);
        }

        // Tally the winner of this specific simulation
        if (currentTeam1Score > currentTeam2Score) {
            team1Wins++;
        } else if (currentTeam2Score > currentTeam1Score) {
            team2Wins++;
        } else {
            ties++;
        }
    }

    // Calculate final win probabilities
    const team1WinProb = ((team1Wins / iterations) * 100).toFixed(2);
    const team2WinProb = ((team2Wins / iterations) * 100).toFixed(2);
    
    // Post the final compiled stats back to the main UI thread
    self.postMessage({
        team1WinProb: Number(team1WinProb),
        team2WinProb: Number(team2WinProb),
        ties,
        iterations,
        fallbackCount,
        projectionCount
    });
};