// monteCarloUi.js
import { getPlayerVarianceProfile } from './statsEngine.js';

// 1. Initialize the Web Worker
const worker = new Worker('./worker.js');

/**
 * Triggers the Monte Carlo simulation and handles the DOM update.
 * @param {Array} team1WeeklyScores - Array of arrays containing historical scores for Team 1's active players.
 * @param {Array} team2WeeklyScores - Array of arrays containing historical scores for Team 2's active players.
 */
export const runMatchupSimulation = (team1WeeklyScores, team2WeeklyScores) => {
    const simOutputDiv = document.getElementById('monte-carlo-results');

    if (team1WeeklyScores.length === 0 || team2WeeklyScores.length === 0) {
        if (simOutputDiv) {
            simOutputDiv.style.display = 'block';
            simOutputDiv.innerHTML = '<p>Not enough roster data to simulate this matchup yet.</p>';
        }
        return;
    }

    // Show a loading state so the user knows it is crunching numbers. The container starts
    // as display:none in the HTML, so this also has to be the thing that reveals it.
    if (simOutputDiv) {
        simOutputDiv.style.display = 'block';
        simOutputDiv.innerHTML = '<p>Simulating 10,000 matchups...</p>';
    }

    // 2. Map the raw historical scores into the Variance Profiles we built in Chunk 2
    const team1Profiles = team1WeeklyScores.map(getPlayerVarianceProfile);
    const team2Profiles = team2WeeklyScores.map(getPlayerVarianceProfile);

    // 3. Send the formatted payload to the background Web Worker
    worker.postMessage({
        team1: team1Profiles,
        team2: team2Profiles,
        iterations: 10000
    });
};

// 4. Listen for the Web Worker to finish and update the UI
worker.onmessage = function(e) {
    const { team1WinProb, team2WinProb, ties } = e.data;
    const simOutputDiv = document.getElementById('monte-carlo-results');
    
    if (simOutputDiv) {
        // Output the results. You can style this beautifully with your CSS later.
        simOutputDiv.innerHTML = `
            <div class="simulation-card">
                <h3>Matchup Simulation</h3>
                <div class="probability-bar">
                    <span style="width: ${team1WinProb}%">Your Team: ${team1WinProb}%</span>
                    <span style="width: ${team2WinProb}%">Opponent: ${team2WinProb}%</span>
                </div>
                <small>${ties} ties in 10,000 simulations</small>
            </div>
        `;
    }
};

worker.onerror = function(error) {
    console.error('Monte Carlo Worker Error:', error);
};