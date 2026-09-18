// monteCarloUi.js
import { getPlayerVarianceProfile, getBoomBustRates } from './statsEngine.js';

// 1. Initialize the Web Worker
const worker = new Worker('./worker.js');

// The worker only ever needs to report back win/loss/tie counts -- it has no reason to know
// player names or positions, so those are kept here rather than round-tripped through
// postMessage, and re-attached to the per-player breakdown once the worker responds.
let lastTeam1Profiles = [];
let lastTeam2Profiles = [];
let lastLineupDiffersFromSleeper = false;
let lastBenchInsights = [];

// --- PROGRESS ANIMATION ---
// 10,000 iterations of simple arithmetic finishes in a handful of milliseconds -- correct
// behavior, but a swap that happens too fast to perceive reads as "did this even run?" to
// someone who doesn't know that (this came up directly in user feedback). This animates a
// counter up toward the real 10,000-iteration total over a fixed short window, purely to make
// genuinely-fast, genuinely-real work perceptible -- it never claims a result before the
// worker's actual result has arrived: if the worker is somehow still running when the
// animation reaches its target, the counter holds at the target rather than lying that a
// result exists yet. A new run cancels any animation still in flight from a previous one, so
// clicking "Run" again doesn't leave two competing counters or reveal a stale result.
const PROGRESS_ANIMATION_MS = 700;
const SIMULATION_ITERATIONS = 10000;
let animationFrameId = null;
let animationDone = false;
let pendingResult = null;

function renderProgress(simOutputDiv, count) {
    if (!simOutputDiv) return;
    simOutputDiv.innerHTML = `<p style="display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Simulating matchups... ${count.toLocaleString()} / ${SIMULATION_ITERATIONS.toLocaleString()}</p>`;
}

function startProgressAnimation(simOutputDiv) {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationDone = false;
    pendingResult = null;

    const startTime = performance.now();
    function tick() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / PROGRESS_ANIMATION_MS);
        renderProgress(simOutputDiv, Math.floor(progress * SIMULATION_ITERATIONS));

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(tick);
        } else {
            animationFrameId = null;
            animationDone = true;
            // The real result may already have arrived while the animation was still playing
            // out -- reveal it now that the minimum perceptible duration has elapsed.
            if (pendingResult) renderResults(pendingResult);
        }
    }
    tick();
}

/**
 * Triggers the Monte Carlo simulation and handles the DOM update.
 * @param {Array<{id: string, name: string, pos: string, weeklyScores: number[], currentSeasonScores: number[]}>} team1Players
 * @param {Array<{id: string, name: string, pos: string, weeklyScores: number[], currentSeasonScores: number[]}>} team2Players
 * @param {Object} [options]
 * @param {boolean} [options.lineupDiffersFromSleeper] - true when team1Players reflects an
 *   in-app lineup edit (a swap made in this tool) that hasn't been pushed to Sleeper yet, so
 *   the result is disclosed as "your proposed lineup" rather than implying it's what's live.
 * @param {Array<{benchName, benchPos, starterName, starterPos, benchWinPct}>} [options.benchInsights]
 *   - precomputed bench-vs-starter comparisons (slot-eligibility already applied by the
 *   caller); this module only renders them, it doesn't compute or validate the matchups.
 * @param {number} [options.currentWeek] - the current NFL week, passed straight through to
 *   getBoomBustRates' tier 2 gate (see statsEngine.js).
 */
export const runMatchupSimulation = (team1Players, team2Players, options = {}) => {
    const { lineupDiffersFromSleeper = false, benchInsights = [], currentWeek = null } = options;
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
        startProgressAnimation(simOutputDiv);
    }

    // 2. Map each player's raw historical scores into the Variance Profile we built in
    // Chunk 2, keeping their name/position attached alongside it, and compute Boom/Bust right
    // here (rather than at render time) so getBoomBustRates' tiered logic has currentWeek and
    // currentSeasonScores available via this same closure.
    const toProfile = (player) => {
        const profile = { ...player, ...getPlayerVarianceProfile(player.weeklyScores, { projectedMean: player.projectedMean }) };
        const boomBust = getBoomBustRates(profile, player.weeklyScores, {
            currentSeasonScores: player.currentSeasonScores, currentWeek
        });
        return { ...profile, ...boomBust };
    };
    const team1Profiles = team1Players.map(toProfile);
    const team2Profiles = team2Players.map(toProfile);
    lastTeam1Profiles = team1Profiles;
    lastTeam2Profiles = team2Profiles;
    lastLineupDiffersFromSleeper = lineupDiffersFromSleeper;
    lastBenchInsights = benchInsights;

    // Early in the season (or for a player who just changed teams, returned from injury,
    // etc.) some players won't have enough games for a directly-measured standard deviation --
    // getPlayerVarianceProfile floors those to an estimated volatility instead of 0 (see its
    // own comment for why). Surfacing the count here keeps that estimate from being presented
    // with the same confidence as a full-sample number.
    const fallbackCount = [...team1Profiles, ...team2Profiles].filter(p => p.usedFallback).length;
    const projectionCount = [...team1Profiles, ...team2Profiles].filter(p => p.usingProjection).length;

    // 3. Send the formatted payload to the background Web Worker
    worker.postMessage({
        team1: team1Profiles,
        team2: team2Profiles,
        iterations: 10000,
        fallbackCount,
        projectionCount
    });
};

// Renders one team's starters as a name/position/projected-range list. floor-ceiling is shown
// rather than just the mean, since "realistic boom/bust range" (the feature's own pitch, per
// the card's description in index.html) is the point -- a bare mean would just be a projection
// with extra steps. A player whose range came from statsEngine's small-sample fallback gets a
// "~" so it doesn't read with the same confidence as a directly-measured one.
function renderPosBadge(pos) {
    return pos ? `<span class="pos-badge ${pos}">${pos}</span>` : '';
}

function renderRookieBadge(isRookie) {
    return isRookie ? `<span class="badge-rookie">R</span>` : '';
}

function renderPlayerList(profiles) {
    const rows = profiles
        .slice()
        .sort((a, b) => b.mean - a.mean)
        .map(p => `
            <li class="sim-player-row">
                <div class="sim-player-info">
                    <span class="sim-player-name">${renderPosBadge(p.pos)} ${p.name}${renderRookieBadge(p.isRookie)}</span>
                    <span class="sim-player-boombust"><span class="sim-bust">Bust: ${p.bustRate}%</span> &nbsp;&bull;&nbsp; <span class="sim-boom">Boom: ${p.boomRate}%</span></span>
                </div>
                <span class="sim-player-range">${p.usedFallback ? '~' : ''}${p.floor}&ndash;${p.ceiling} <span class="sim-player-mean">(${p.mean} ${p.usingProjection ? 'proj' : 'avg'})</span></span>
            </li>`)
        .join('');
    return `<ul class="sim-player-list">${rows}</ul>`;
}

// Bench comparisons the caller found no sensible starter to weigh against (see mls.js's
// runMatchupSim) never make it into benchInsights at all -- so anything that does arrive
// here is worth showing, and this only decides how to lay out however many there are.
function renderBenchInsights(benchInsights) {
    if (!benchInsights || benchInsights.length === 0) return '';

    const rows = benchInsights.map(b => `
        <li class="sim-bench-row">
            <strong>${b.benchName}</strong> ${renderPosBadge(b.benchPos)}${renderRookieBadge(b.benchIsRookie)} (bench) outscored
            <strong>${b.starterName}</strong> ${renderPosBadge(b.starterPos)}${renderRookieBadge(b.starterIsRookie)} (starting) in
            <strong>${b.benchWinPct}%</strong> of simulated weeks.
        </li>`).join('');

    return `
        <div class="sim-bench-insights">
            <h4>Lineup Insights</h4>
            <ul class="sim-bench-list">${rows}</ul>
        </div>`;
}

// Renders the final simulation output -- called either immediately (if the progress
// animation has already finished by the time the worker responds) or once the animation
// catches up (see startProgressAnimation above).
function renderResults(data) {
    const { team1WinProb, team2WinProb, ties, fallbackCount, projectionCount } = data;
    const simOutputDiv = document.getElementById('monte-carlo-results');

    if (simOutputDiv) {
        const fallbackNote = fallbackCount > 0
            ? `<small class="sim-fallback-note">~ marks ${fallbackCount} player(s) without enough completed games yet -- their range is an early-season estimate, not a measured one.</small>`
            : '';
        const projectionNote = projectionCount > 0
            ? `<small class="sim-projection-note">${projectionCount} player(s)' ranges reflect Sleeper's official projection for this week -- accounting for this week's specific matchup, injury status, and other factors.</small>`
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
                ${projectionNote}
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
                ${renderBenchInsights(lastBenchInsights)}
            </div>
        `;
    }
}

// 4. Listen for the Web Worker to finish
worker.onmessage = function(e) {
    if (animationDone) {
        renderResults(e.data);
    } else {
        // Animation is still playing -- hold the real result until it catches up rather than
        // revealing it early (see startProgressAnimation's own comment for why).
        pendingResult = e.data;
    }
};

worker.onerror = function(error) {
    console.error('Monte Carlo Worker Error:', error);
};