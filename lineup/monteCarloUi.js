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

    // Early in the season (or for a player who just changed teams, returned from injury,
    // etc.) some players won't have enough games for a directly-measured standard deviation --
    // getPlayerVarianceProfile floors those to an estimated volatility instead of 0 (see its
    // own comment for why). Surfacing the count here keeps that estimate from being presented
    // with the same confidence as a full-sample number.
    const fallbackCount = [...team1Profiles, ...team2Profiles].filter(p => p.usedFallback).length;

    // 3. Send the formatted payload to the background Web Worker
    worker.postMessage({
        team1: team1Profiles,
        team2: team2Profiles,
        iterations: 10000,
        fallbackCount
    });
};

// 4. Listen for the Web Worker to finish and update the UI
worker.onmessage = function(e) {
    const { team1WinProb, team2WinProb, ties, fallbackCount } = e.data;
    const simOutputDiv = document.getElementById('monte-carlo-results');
    
    if (simOutputDiv) {
        const fallbackNote = fallbackCount > 0
            ? `<small class="sim-fallback-note">${fallbackCount} player(s) don't have enough completed games yet, so their week-to-week range is an early-season estimate, not a measured one.</small>`
            : '';
        // Output the results. You can style this beautifully with your CSS later.
        simOutputDiv.innerHTML = `
            <div class="simulation-card">
                <h3>Matchup Simulation</h3>
                <div class="probability-bar">
                    <span style="width: ${team1WinProb}%">Your Team: ${team1WinProb}%</span>
                    <span style="width: ${team2WinProb}%">Opponent: ${team2WinProb}%</span>
                </div>
                <small>${ties} ties in 10,000 simulations</small>
                ${fallbackNote}
            </div>
        `;
    }
};

worker.onerror = function(error) {
    console.error('Monte Carlo Worker Error:', error);
};