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

// How strongly a QB's simulated score and his own real-NFL-team pass-catchers' simulated
// scores move together within the same iteration. Game script (a shootout inflates the whole
// passing game at once; a run-heavy blowout suppresses it) moves a QB and his WRs/TEs
// together, not independently -- drawing every player fully independently (the previous
// behavior) understated exactly the scenario "stacking" is built around: a QB and his WR
// both having a big (or both having a quiet) week at the same time. This is one flat
// correlation applied to every QB+pass-catcher pair on the same real team, rather than a
// figure weighted by each player's target share -- a reasonable first pass without target-
// share data this app doesn't currently track. One tunable constant, same pattern as other
// single-number estimates elsewhere in this app (e.g. mls.js's waiver-adjustment tiering).
const QB_STACK_CORRELATION = 0.35;

/**
 * Groups one team's players into "stacks": players sharing the same real NFL team (via each
 * player's own .team field) where the group includes a QB and at least one WR/TE. Only
 * QB+pass-catcher pairs correlate -- not RB (a run-heavy day for the offense doesn't reliably
 * move with the passing game's output the way a WR/TE's usage does) and not K/DEF -- and only
 * within one fantasy roster, since there's no fantasy-relevant correlation between two
 * DIFFERENT fantasy teams' players. Returns { realTeamAbbr: [player indices] }, restricted to
 * groups of 2+ that actually contain both a QB and a pass-catcher; every other player index
 * (including a QB with no rostered pass-catcher, or vice versa) draws fully independently,
 * exactly as before this existed.
 */
function buildStackGroups(players) {
    const byTeam = {};
    players.forEach((p, idx) => {
        if (!p.team) return;
        if (p.pos !== 'QB' && p.pos !== 'WR' && p.pos !== 'TE') return;
        if (!byTeam[p.team]) byTeam[p.team] = [];
        byTeam[p.team].push(idx);
    });

    const groups = {};
    Object.keys(byTeam).forEach(team => {
        const idxs = byTeam[team];
        const hasQb = idxs.some(i => players[i].pos === 'QB');
        const hasPassCatcher = idxs.some(i => players[i].pos === 'WR' || players[i].pos === 'TE');
        if (idxs.length >= 2 && hasQb && hasPassCatcher) groups[team] = idxs;
    });
    return groups;
}

/**
 * Draws one simulated week for an entire team: every stack group (see buildStackGroups)
 * shares one draw of a standard normal "shared factor" per iteration, and each member's score
 * blends that shared factor with their own individual one -- score = mean + stdDev *
 * (sqrt(rho)*Zshared + sqrt(1-rho)*Zown). This keeps each player's own marginal mean/stdDev
 * exactly what getPlayerVarianceProfile computed for them (Var of the blend is rho+(1-rho)=1),
 * while inducing pairwise correlation rho between every pair of players who share the same
 * Zshared -- including two pass-catchers on the same stack with each other, not just each of
 * them with the QB, which matches how a real shared game-script factor would actually behave.
 * Everyone outside a stack group draws an ordinary independent normal, unchanged from before.
 *
 * A locked-in player (stdDev === 0, from getPlayerVarianceProfile's actualScore handling in
 * statsEngine.js -- their real game has already happened this week) falls out of this
 * naturally: stdDev multiplies whatever shared+individual factor they'd have drawn, so at 0
 * it always resolves to exactly their real score regardless of whether they're in a stack.
 * That also means a same-team stack can never end up half-locked, half-simulated -- every
 * player on one real NFL team shares the same kickoff, so they lock together too.
 */
function simulateTeamScore(players, stackGroups) {
    const sharedShocks = new Array(players.length).fill(null);

    Object.values(stackGroups).forEach(idxs => {
        const zShared = randomNormal();
        idxs.forEach(i => { sharedShocks[i] = zShared; });
    });

    let total = 0;
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const z = sharedShocks[i] !== null
            ? Math.sqrt(QB_STACK_CORRELATION) * sharedShocks[i] + Math.sqrt(1 - QB_STACK_CORRELATION) * randomNormal()
            : randomNormal();
        // Clamp the lowest possible score to 0 so players don't end up with -15 points
        // unless you use leagues with extreme negative penalties.
        total += Math.max(0, p.mean + p.stdDev * z);
    }
    return total;
}

// Listen for messages from the main UI thread
self.onmessage = function(e) {
    // Expecting payload: { team1: [{mean, stdDev, pos, team}], team2: [...], iterations: 10000 }
    const { team1, team2, iterations = 10000, fallbackCount = 0, projectionCount = 0, actualCount = 0 } = e.data;

    // Built once per run, not per iteration -- which real-team groups qualify as a stack
    // never changes across iterations, only the random draws inside them do.
    const team1Stacks = buildStackGroups(team1);
    const team2Stacks = buildStackGroups(team2);

    let team1Wins = 0;
    let team2Wins = 0;
    let ties = 0;

    // The Monte Carlo Loop
    for (let i = 0; i < iterations; i++) {
        const currentTeam1Score = simulateTeamScore(team1, team1Stacks);
        const currentTeam2Score = simulateTeamScore(team2, team2Stacks);

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
        projectionCount,
        actualCount
    });
};