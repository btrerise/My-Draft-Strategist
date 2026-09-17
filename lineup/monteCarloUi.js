// monteCarloUi.js
import { getPlayerVarianceProfile } from './statsEngine.js';

// 1. Initialize the Web Worker
const worker = new Worker('./worker.js');

// The worker only ever needs to report back win/loss/tie counts -- it has no reason to know
// player names or positions, so those are kept here rather than round-tripped through
// postMessage, and re-attached to the per-player breakdown once the worker responds.
let lastTeam1Profiles = [];
let lastTeam2Profiles = [];
let lastLineupDiffersFromSleeper = false;

/**
 * Triggers the Monte Carlo simulation and handles the DOM update.
 * @param {Array<{id: string, name: string, pos: string, weeklyScores: number[]}>} team1Players
 * @param {Array<{id: string, name: string, pos: string, weeklyScores: number[]}>} team2Players
 * @param {Object} [options]
 * @param {boolean} [options.lineupDiffersFromSleeper] - true when team1Players reflects an
 *   in-app lineup edit (a swap made in this tool) that hasn't been pushed to Sleeper yet, so
 *   the result is disclosed as "your proposed lineup" rather than implying it's what's live.
 */
export const runMatchupSimulation = (team1Players, team2Players, options = {}) => {
    const { lineupDiffersFromSleeper = false } = options;
    const simOutputDiv = document.getElementById('monte-carlo-results');

    if (team1Players.length === 0 || team2Players.length === 0) {
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

    // 2. Map each player's raw historical scores into the Variance Profile we built in
    // Chunk 2, keeping their name/position attached alongside it.
    const toProfile = (player) => ({ ...player, ...getPlayerVarianceProfile(player.weeklyScores) });
    const team1Profiles = team1Players.map(toProfile);
    const team2Profiles = team2Players.map(toProfile);
    lastTeam1Profiles = team1Profiles;
    lastTeam2Profiles = team2Profiles;
    lastLineupDiffersFromSleeper = lineupDiffersFromSleeper;

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

// Renders one team's starters as a name/position/projected-range list. floor-ceiling is shown
// rather than just the mean, since "realistic boom/bust range" (the feature's own pitch, per
// the card's description in index.html) is the point -- a bare mean would just be a projection
// with extra steps. A player whose range came from statsEngine's small-sample fallback gets a
// "~" so it doesn't read with the same confidence as a directly-measured one.
function renderPlayerList(profiles) {
    const rows = profiles
        .slice()
        .sort((a, b) => b.mean - a.mean)
        .map(p => `
            <li class="sim-player-row">
                <span class="sim-player-name">${p.name}${p.pos ? ` <span class="sim-player-pos">${p.pos}</span>` : ''}</span>
                <span class="sim-player-range">${p.usedFallback ? '~' : ''}${p.floor}&ndash;${p.ceiling} <span class="sim-player-mean">(${p.mean} avg)</span></span>
            </li>`)
        .join('');
    return `<ul class="sim-player-list">${rows}</ul>`;
}

// 4. Listen for the Web Worker to finish and update the UI
worker.onmessage = function(e) {
    const { team1WinProb, team2WinProb, ties, fallbackCount } = e.data;
    const simOutputDiv = document.getElementById('monte-carlo-results');
    
    if (simOutputDiv) {
        const fallbackNote = fallbackCount > 0
            ? `<small class="sim-fallback-note">~ marks ${fallbackCount} player(s) without enough completed games yet -- their range is an early-season estimate, not a measured one.</small>`
            : '';
        const lineupNote = lastLineupDiffersFromSleeper
            ? `<small class="sim-lineup-note">Simulating your proposed lineup from this tool -- it differs from what's currently synced to Sleeper.</small>`
            : '';

        // Labels live in a legend above the bar rather than inside each colored segment --
        // text inside a segment gets clipped whenever that side's share is small (a heavy
        // favorite reduces the underdog's segment to a sliver too narrow for its own label).
        // The legend is always full-width regardless of how lopsided the result is.
        simOutputDiv.innerHTML = `
            <div class="simulation-card">
                <h3>Matchup Simulation</h3>
                <div class="probability-bar-legend">
                    <span class="legend-you">Your Team: ${team1WinProb}%</span>
                    <span class="legend-opp">Opponent: ${team2WinProb}%</span>
                </div>
                <div class="probability-bar">
                    <span class="bar-you" style="width: ${team1WinProb}%"></span>
                    <span class="bar-opp" style="width: ${team2WinProb}%"></span>
                </div>
                <small>${ties} ties in 10,000 simulations</small>
                ${fallbackNote}
                ${lineupNote}
                <div class="sim-team-columns">
                    <div class="sim-team-column">
                        <h4>Your Team</h4>
                        ${renderPlayerList(lastTeam1Profiles)}
                    </div>
                    <div class="sim-team-column">
                        <h4>Opponent</h4>
                        ${renderPlayerList(lastTeam2Profiles)}
                    </div>
                </div>
            </div>
        `;
    }
};

worker.onerror = function(error) {
    console.error('Monte Carlo Worker Error:', error);
};