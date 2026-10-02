// monteCarloUi.js
import { getPlayerVarianceProfile, getBoomBustRates } from './stats.js';

// 1. Initialize the Web Worker.
// Guarded because this runs at module-import time: a worker that can't be constructed (the
// file didn't deploy, the browser refuses workers for this origin) would throw here, before
// mls.js finished importing, and take the entire Lineup Strategist down rather than just the
// simulation. On failure `worker` stays null and runMatchupSimulation reports it in place.
let worker = null;
try {
    // Resolved against the page URL (/lineup/), not this file's: js/mls/sim/worker.js (refactor 3F).
    worker = new Worker('../js/mls/sim/worker.js');
} catch (err) {
    console.error('Monte Carlo Worker failed to load:', err);
}

// The worker only ever needs to report back win/loss/tie counts -- it has no reason to know
// player names or positions, so those are kept here rather than round-tripped through
// postMessage, and re-attached to the per-player breakdown once the worker responds.
let lastTeam1Profiles = [];
let lastTeam2Profiles = [];
let lastLineupDiffersFromSleeper = false;
let lastBenchInsights = [];
let lastWaiverInsights = [];
let lastWaiverInsightsStatus = null;

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

const WORKER_FAILURE_MESSAGE = "Couldn't run the simulation &mdash; the calculation engine failed to load. Reload the page and try again.";
const WORKER_TIMEOUT_MESSAGE = "Couldn't run the simulation &mdash; the calculation engine stopped responding. Reload the page and try again.";

// --- WORKER RESPONSE WATCHDOG ---
// onerror only covers the failures the worker itself reports. It doesn't cover a worker that
// simply never answers: once its script has failed to load, postMessage is silently discarded,
// so a second Run after a load failure would start the progress animation and leave it parked
// at "10,000 / 10,000" with no error and no result -- exactly the dead-progress-display this
// module is otherwise careful to avoid. The work here is a few milliseconds of arithmetic, so
// anything approaching this bound means the worker is not coming back.
//
// A timer rather than a "worker is dead" flag on purpose: an uncaught exception inside the
// worker's own message handler fires onerror but leaves the worker alive and usable, and a
// sticky flag would permanently disable the feature for a failure the next Run would survive.
// This self-heals -- every Run gets a real attempt, and only a run that actually hangs reports
// one.
const WORKER_RESPONSE_TIMEOUT_MS = 10000;
let responseTimeoutId = null;

function clearResponseTimeout() {
    if (responseTimeoutId !== null) {
        clearTimeout(responseTimeoutId);
        responseTimeoutId = null;
    }
}

// #monte-carlo-results is an aria-live region (index.html), and this runs every animation
// frame. Rewriting the whole container each frame would have screen readers trying to read
// out every tick of the counter. So the "Simulating matchups..." line is written once per run
// (announced once), and after that only the counter's own text changes -- and the counter is
// aria-hidden, so those per-frame changes are silent. The final result still replaces the
// whole container, which is the update that gets announced.
function renderProgress(simOutputDiv, count) {
    if (!simOutputDiv) return;
    const countText = `${count.toLocaleString()} / ${SIMULATION_ITERATIONS.toLocaleString()}`;
    const countEl = simOutputDiv.querySelector('.sim-progress-count');
    if (countEl) {
        countEl.textContent = countText;
        return;
    }
    simOutputDiv.innerHTML = `<p style="display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Simulating matchups… <span class="sim-progress-count" aria-hidden="true">${countText}</span></p>`;
}

// Abandons the run currently on screen: stops the progress animation, drops the state it left
// behind, and stops waiting on the worker. Called before writing a message that replaces the
// counter, by clearSimResults below, and at the start of each new run.
function cancelProgressAnimation() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    animationDone = false;
    pendingResult = null;
    clearResponseTimeout();
}

// Writes a message into the results container in place of whatever is there. This is what the
// worker's failure paths use: the progress animation reveals the container and counts up to
// 10,000 on its own schedule, so a worker that dies would otherwise leave "Simulating
// matchups... 10,000 / 10,000" and a spinning icon on screen permanently -- a progress display
// for work that already failed, with no way for the user to tell.
function renderSimMessage(message, { isError = false } = {}) {
    cancelProgressAnimation();
    const simOutputDiv = document.getElementById('monte-carlo-results');
    if (!simOutputDiv) return;
    simOutputDiv.style.display = 'block';
    simOutputDiv.innerHTML = `<p class="sim-message${isError ? ' sim-message-error' : ''}">${message}</p>`;
}

// Hides the results container and drops any in-flight animation. Exported because a stale
// result card is worse than none: the card carries a win probability for one specific team in
// one specific week, so leaving the previous run's card up while the user switches leagues or
// triggers a run that can't proceed presents the old numbers as if they were the new ones.
export const clearSimResults = () => {
    cancelProgressAnimation();
    const simOutputDiv = document.getElementById('monte-carlo-results');
    if (!simOutputDiv) return;
    simOutputDiv.style.display = 'none';
    simOutputDiv.innerHTML = '';
};

// Shows an explanation in place of a result, for the cases where a run can't proceed at all
// (too early in the season, a bye week, no opponent). Exported so mls.js's runMatchupSim can
// use the same surface its results appear in instead of only firing a toast that disappears.
export const showSimNotice = (message, { isError = false } = {}) => {
    renderSimMessage(message, { isError });
};

function startProgressAnimation(simOutputDiv) {
    // Also clears any watchdog still armed from a previous run, so the new run's timer is the
    // only one that can fire.
    cancelProgressAnimation();

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
 * @param {Array<{id: string, name: string, pos: string, team: string, weeklyScores: number[], currentSeasonScores: number[], actualScore: (number|null)}>} team1Players
 * @param {Array<{id: string, name: string, pos: string, team: string, weeklyScores: number[], currentSeasonScores: number[], actualScore: (number|null)}>} team2Players
 * @param {Object} [options]
 * @param {boolean} [options.lineupDiffersFromSleeper] - true when team1Players reflects an
 *   in-app lineup edit (a swap made in this tool) that hasn't been pushed to Sleeper yet, so
 *   the result is disclosed as "your proposed lineup" rather than implying it's what's live.
 * @param {Array<{benchName, benchPos, starterName, starterPos, benchWinPct}>} [options.benchInsights]
 *   - precomputed bench-vs-starter comparisons (slot-eligibility already applied by the
 *   caller); this module only renders them, it doesn't compute or validate the matchups.
 * @param {Array<{faName, faPos, starterName, starterPos, faWinPct}>} [options.waiverInsights]
 *   - same idea as benchInsights, sourced from available free agents instead of the bench;
 *   only populated when the Waiver Insights toggle is on (see mls.js's runMatchupSim).
 * @param {{checkedCount: number, positions: string[], noRankings: boolean, failed: boolean}|null} [options.waiverInsightsStatus]
 *   - what the waiver check actually did; null when the toggle is off. Lets the results card
 *   confirm "checked N free agents, none beat your starters" instead of showing nothing,
 *   which read the same as the check never having run.
 * @param {number} [options.currentWeek] - the current NFL week, passed straight through to
 *   getBoomBustRates' tier 2 gate (see statsEngine.js).
 */
export const runMatchupSimulation = (team1Players, team2Players, options = {}) => {
    const { lineupDiffersFromSleeper = false, benchInsights = [], waiverInsights = [], waiverInsightsStatus = null, currentWeek = null } = options;
    const simOutputDiv = document.getElementById('monte-carlo-results');

    if (team1Players.length === 0 || team2Players.length === 0) {
        renderSimMessage('Not enough roster data to simulate this matchup yet.');
        return;
    }

    if (!worker) {
        renderSimMessage(WORKER_FAILURE_MESSAGE, { isError: true });
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
    // currentSeasonScores available via this same closure. actualScore (this week's real,
    // already-recorded result, once a player's game has started) takes priority inside
    // getPlayerVarianceProfile itself -- see its own comment -- so it's just passed through
    // here alongside projectedMean rather than branched on in this module.
    const toProfile = (player) => {
        const profile = { ...player, ...getPlayerVarianceProfile(player.weeklyScores, { projectedMean: player.projectedMean, actualScore: player.actualScore }) };
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
    lastWaiverInsights = waiverInsights;
    lastWaiverInsightsStatus = waiverInsightsStatus;

    // Early in the season (or for a player who just changed teams, returned from injury,
    // etc.) some players won't have enough games for a directly-measured standard deviation --
    // getPlayerVarianceProfile floors those to an estimated volatility instead of 0 (see its
    // own comment for why). Surfacing the count here keeps that estimate from being presented
    // with the same confidence as a full-sample number.
    const fallbackCount = [...team1Profiles, ...team2Profiles].filter(p => p.usedFallback).length;
    const projectionCount = [...team1Profiles, ...team2Profiles].filter(p => p.usingProjection).length;
    const actualCount = [...team1Profiles, ...team2Profiles].filter(p => p.isActual).length;

    // 3. Send the formatted payload to the background Web Worker
    worker.postMessage({
        team1: team1Profiles,
        team2: team2Profiles,
        iterations: 10000,
        fallbackCount,
        projectionCount,
        actualCount
    });

    // Arm the watchdog on the send, not on the animation, so it measures the thing it's
    // actually waiting for (see WORKER_RESPONSE_TIMEOUT_MS above). Disarmed in onmessage.
    clearResponseTimeout();
    responseTimeoutId = setTimeout(() => {
        responseTimeoutId = null;
        console.error('Monte Carlo Worker did not respond within %dms.', WORKER_RESPONSE_TIMEOUT_MS);
        renderSimMessage(WORKER_TIMEOUT_MESSAGE, { isError: true });
    }, WORKER_RESPONSE_TIMEOUT_MS);
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
        .map(p => {
            // A player whose real game has already produced stats this week has nothing left
            // to project -- their bust/boom rate isn't a probability anymore (see
            // getBoomBustRates' isActual handling), and a floor-ceiling range around a known
            // result would just be a confusing way to display a single fixed number. Show the
            // actual result plainly instead.
            const statsHTML = p.isActual
                ? `<span class="sim-player-boombust"><span class="sim-final-tag">Final</span></span>`
                : `<span class="sim-player-boombust"><span class="sim-bust">Bust: ${p.bustRate}%</span> &nbsp;&bull;&nbsp; <span class="sim-boom">Boom: ${p.boomRate}%</span></span>`;
            const rangeHTML = p.isActual
                ? `<span class="sim-player-range">${p.mean} <span class="sim-player-mean">pts (actual)</span></span>`
                : `<span class="sim-player-range">${p.usedFallback ? '~' : ''}${p.floor}&ndash;${p.ceiling} <span class="sim-player-mean">(${p.mean} ${p.usingProjection ? 'proj' : 'avg'})</span></span>`;
            return `
            <li class="sim-player-row">
                <div class="sim-player-info">
                    <span class="sim-player-name">${renderPosBadge(p.pos)} ${p.name}${renderRookieBadge(p.isRookie)}</span>
                    ${statsHTML}
                </div>
                ${rangeHTML}
            </li>`;
        })
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

// Free-agent comparisons that beat your weakest eligible starter at their position -- same
// shape and same ">50% win probability" bar as renderBenchInsights above, just sourced from
// available waivers instead of your own bench. Only ever receives anything when the Waiver
// Insights toggle is on (see mls.js's runMatchupSim).
//
// Unlike Lineup Insights, an empty result here still gets a section whenever the toggle is on:
// the person explicitly asked for this check, so silence would leave them guessing whether it
// ran. status (see runMatchupSim) says which of the empty cases this is -- the check failed,
// there was nothing to check it against, or it genuinely found no upgrade.
function renderWaiverInsights(waiverInsights, status) {
    const hasRows = waiverInsights && waiverInsights.length > 0;
    if (!hasRows && !status) return '';

    let body;
    if (hasRows) {
        const rows = waiverInsights.map(w => `
        <li class="sim-bench-row">
            <strong>${w.faName}</strong> ${renderPosBadge(w.faPos)} (available) outscored
            <strong>${w.starterName}</strong> ${renderPosBadge(w.starterPos)}${renderRookieBadge(w.starterIsRookie)} (starting) in
            <strong>${w.faWinPct}%</strong> of simulated weeks.
        </li>`).join('');
        body = `<ul class="sim-bench-list">${rows}</ul>`;
    } else if (status.failed) {
        body = `<p class="sim-waiver-empty sim-waiver-empty-warn">Couldn't finish checking waivers this time (a rankings or Sleeper lookup failed). The matchup result above isn't affected - run it again to retry.</p>`;
    } else if (status.noRankings) {
        body = `<p class="sim-waiver-empty sim-waiver-empty-warn">No free agents to check yet. Waiver Insights picks its candidates from your ROS rankings (or Market Consensus data), and neither is loaded for this league.</p>`;
    } else if (status.checkedCount === 0 && status.startersAllStarted) {
        body = `<p class="sim-waiver-empty">All of your starters' games have already kicked off, so there's no lineup spot left for a free agent to take this week.</p>`;
    } else if (status.checkedCount === 0) {
        // Three things can leave a free agent uncompared: too little game history, his own
        // game already kicked off (locked on Sleeper), or every starter he could replace has
        // already played. The kickoff part is only mentioned when it actually happened.
        const n = status.kickedOffCount || 0;
        const reasons = n > 0
            ? ` ${n} top free agent${n === 1 ? ' was' : 's were'} skipped because their game already kicked off (locked until next week). The others either don't have enough game history yet or could only replace a starter who has already played.`
            : ` They either don't have enough game history yet or could only replace a starter who has already played.`;
        body = `<p class="sim-waiver-empty sim-waiver-empty-warn">No free agents could be compared against a starter you can still change this week.${reasons}</p>`;
    } else {
        const n = status.checkedCount;
        const posText = status.positions && status.positions.length > 0
            ? ` across ${status.positions.map(renderPosBadge).join(' ')}` : '';
        body = `<p class="sim-waiver-empty sim-waiver-empty-ok"><span class="sim-waiver-check" aria-hidden="true">&#10003;</span> Checked the top ${n} available free agent${n === 1 ? '' : 's'}${posText}. None outscored the starter they'd replace in more than half of simulated weeks, so your starting lineup holds up.</p>`;
    }

    return `
        <div class="sim-bench-insights">
            <h4>Waiver Insights</h4>
            ${body}
        </div>`;
}

// Renders the final simulation output -- called either immediately (if the progress
// animation has already finished by the time the worker responds) or once the animation
// catches up (see startProgressAnimation above).
function renderResults(data) {
    const { team1WinProb, team2WinProb, ties, fallbackCount, projectionCount, actualCount } = data;
    const simOutputDiv = document.getElementById('monte-carlo-results');

    if (simOutputDiv) {
        const fallbackNote = fallbackCount > 0
            ? `<small class="sim-fallback-note">~ marks ${fallbackCount} player(s) without enough completed games yet; their range is an early-season estimate, not a measured one.</small>`
            : '';
        const projectionNote = projectionCount > 0
            ? `<small class="sim-projection-note">${projectionCount} player(s)' ranges reflect Sleeper's official projection for this week - accounting for this week's specific matchup, injury status, and other factors.</small>`
            : '';
        const actualNote = actualCount > 0
            ? `<small class="sim-actual-note">${actualCount} player(s) marked "Final" have already played this week; their real score is used instead of a projection.</small>`
            : '';
        const lineupNote = lastLineupDiffersFromSleeper
            ? `<small class="sim-lineup-note">Simulating your proposed lineup from this tool; it differs from what's currently synced to Sleeper.</small>`
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
                ${actualNote}
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
                ${renderWaiverInsights(lastWaiverInsights, lastWaiverInsightsStatus)}
            </div>
        `;
    }
}

// 4. Listen for the Web Worker to finish
if (worker) {
    worker.onmessage = function(e) {
        // The worker answered, so disarm the watchdog before anything else -- the result may
        // still sit in pendingResult for a few hundred ms waiting on the animation, and that
        // wait must not be mistaken for a hang.
        clearResponseTimeout();

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
        // The progress animation is almost certainly still running (or parked at its target)
        // when this fires, so the message has to replace it rather than just be logged.
        renderSimMessage(WORKER_FAILURE_MESSAGE, { isError: true });
    };
}