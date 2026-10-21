// --- WIN CHANCES FOR THE DASHBOARD'S "THIS WEEK" CARD (improvements S21) ---
// The Matchup Simulator's own math (getPlayerVarianceProfile, sim/stats.js, and the Monte Carlo worker,
// sim/worker.js), run for several leagues' matchups at once and returned as numbers instead of drawn into the
// Simulator card. Nothing here changes how a matchup is simulated; it only gathers the inputs the way runMatchupSim
// (sim/matchup.js) does:
// - a player whose game has kicked off counts as his actual points so far (the Simulator's rule: zero variance);
// - Doubtful, Out, IR and the like are left out (isExcludedFromSimulation), as is anyone with no game history;
// - everyone else is his Sleeper projection, with the spread of his past weekly scores.
// It has its own Worker, so a run here never answers (or cancels) the Simulator card's run on the Lineup tab.
// Callers draw their scores first and add these when they arrive: a failure just leaves the percents out.
import { getPlayerWeeklyScoreHistory } from '../../shared/api/sleeperStats.js';
import { MIN_RELIABLE_GAMES, getPlayerVarianceProfile } from './stats.js';

const ITERATIONS = 10000;
const WORKER_TIMEOUT_MS = 10000;

let worker = null;
function getWorker() {
    if (!worker) worker = new Worker('../js/mls/sim/worker.js'); // resolved against /lineup/, like sim/ui.js's
    return worker;
}

// One matchup through the worker: resolves team1's win chance (0-100), or null if the worker fails or stalls.
function simulate(team1, team2) {
    return new Promise((resolve) => {
        let w;
        try { w = getWorker(); } catch (e) { resolve(null); return; }
        const done = (val) => { clearTimeout(timer); w.onmessage = null; w.onerror = null; resolve(val); };
        const timer = setTimeout(() => { worker = null; try { w.terminate(); } catch (e) { /* already gone */ } done(null); }, WORKER_TIMEOUT_MS);
        w.onmessage = (e) => done(e.data && typeof e.data.team1WinProb === 'number' ? e.data.team1WinProb : null);
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); worker = null; done(null); };
        w.postMessage({ team1, team2, iterations: ITERATIONS });
    });
}

/**
 * matchups: [{ key, scoringKey, mine: [player], theirs: [player] }], where a player is
 *   { id, pos, team, actual: number | null (set once his game has kicked off), projected: number | null, excluded }.
 * Returns Map key -> your win chance in percent (one decimal), for each matchup the worker answered.
 * season / week: this week's, for the score history (weeks before it).
 */
export async function matchupWinChances(matchups, { season, week }) {
    const out = new Map();
    if (!matchups.length || week == null || week < 2) return out;

    // One history request per scoring format: the week files are shared (and cached in IndexedDB), and each league's
    // scoring picks a different points field out of them.
    const histories = new Map();
    for (const key of new Set(matchups.map(m => m.scoringKey))) {
        const ids = [...new Set(matchups.filter(m => m.scoringKey === key).flatMap(m => [...m.mine, ...m.theirs]).map(p => p.id))];
        try {
            const { blended } = await getPlayerWeeklyScoreHistory(ids, season, week, key, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES });
            histories.set(key, blended || {});
        } catch (e) {
            histories.set(key, null);
        }
    }

    for (const m of matchups) {
        const history = histories.get(m.scoringKey);
        if (!history) continue;
        const profiles = (players) => players.reduce((arr, p) => {
            const scores = history[p.id] || [];
            const actual = typeof p.actual === 'number' ? p.actual : null;
            if (p.excluded && actual === null) return arr;
            if (actual === null && scores.length === 0) return arr; // no history: left out, as the Simulator does
            arr.push({ pos: p.pos, team: p.team, ...getPlayerVarianceProfile(scores, { projectedMean: p.projected, actualScore: actual }) });
            return arr;
        }, []);
        const team1 = profiles(m.mine), team2 = profiles(m.theirs);
        if (!team1.length || !team2.length) continue;
        const pct = await simulate(team1, team2);
        if (pct !== null) out.set(m.key, Math.round(pct * 10) / 10);
    }
    return out;
}
