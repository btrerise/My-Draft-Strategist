// MLS matchup simulator with a fixed seed (refactor 3F, which moved lineup/monteCarloUi.js,
// statsEngine.js and worker.js to js/mls/sim/). Characterization: it pins today's numbers.
// The smoke test's simulator run stops at "Not enough roster data" with the fixture league, so
// this is the test that actually reaches the Web Worker. Math.random is replaced by a seeded
// generator in the page and, by rewriting the worker script on its way in, in the worker. A
// failure after a pure move means the move changed the simulation.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, seedSimRandom } from './helpers.mjs';

test('matchup simulator gives the same results for a fixed seed', async ({ page }) => {
    const state = await preparePage(page);
    const workerUrls = await seedSimRandom(page);
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');

    const { text, raw } = await page.evaluate(async () => {
        // Same URL as the page's own import, so this is the app's module and its worker.
        const ui = await import('/js/mls/sim/ui.js');
        const mk = (name, pos, base, n, extra = {}) => ({
            name, pos, team: 'KC',
            weeklyScores: Array.from({ length: n }, (_, i) => base + ((i * 7) % 11) - 5),
            currentSeasonScores: Array.from({ length: Math.min(n, 2) }, (_, i) => base + i),
            ...extra,
        });
        // Refactor 9B: a kicker and a defense per team. India K and Lima K are typical; Juliet DEF
        // averages below zero (weeks -7, 0, -4, 3, -1); Kilo DEF averages 1.5 from two games, so the model answers.
        const t1 = [mk('Alpha QB', 'QB', 22, 9), mk('Bravo RB', 'RB', 14, 6, { projectedMean: 16.5 }), mk('Charlie WR', 'WR', 12, 2), mk('Delta TE', 'TE', 8, 12, { actualScore: 11.2 }),
            mk('India K', 'K', 8, 6), mk('Juliet DEF', 'DEF', -2, 5)];
        const t2 = [mk('Echo QB', 'QB', 20, 8), mk('Fox RB', 'RB', 15, 10), mk('Golf WR', 'WR', 13, 1, { projectedMean: 9 }), mk('Hotel TE', 'TE', 7, 0),
            mk('Kilo DEF', 'DEF', 3, 2), mk('Lima K', 'K', 9, 10)];
        ui.runMatchupSimulation(t1, t2, {
            lineupDiffersFromSleeper: true, currentWeek: 2,
            benchInsights: [{ benchName: 'Bench Guy', benchPos: 'WR', starterName: 'Charlie WR', starterPos: 'WR', benchWinPct: 0.55 }],
            waiverInsights: [{ faName: 'FA Guy', faPos: 'RB', starterName: 'Bravo RB', starterPos: 'RB', faWinPct: 0.61 }],
            waiverInsightsStatus: { checkedCount: 3, positions: ['RB', 'WR'], noRankings: false, failed: false },
        });
        const el = document.getElementById('monte-carlo-results');
        for (let i = 0; i < 200 && !el.querySelector('.simulation-card'); i++) await new Promise(r => setTimeout(r, 50));
        // A fresh worker, straight from the worker file, without the UI module in between.
        const raw = await new Promise((resolve) => {
            const w = new Worker('/js/mls/sim/worker.js');
            w.onmessage = (e) => { resolve(e.data); w.terminate(); };
            w.postMessage({
                team1: [{ name: 'A', pos: 'QB', mean: 20, stdDev: 6 }, { name: 'B', pos: 'RB', mean: 12, stdDev: 5, isActual: true }],
                team2: [{ name: 'C', pos: 'QB', mean: 18, stdDev: 7 }],
                iterations: 5000, fallbackCount: 1, projectionCount: 0, actualCount: 1,
            });
        });
        return { text: el.textContent.replace(/ /g, ' ').replace(/\s+/g, ' '), raw };
    });

    expect(workerUrls).toEqual(['/js/mls/sim/worker.js', '/js/mls/sim/worker.js']);
    expect(text).toContain('Your Team: 84.77% Opponent: 15.23%');
    expect(text).toContain('0 ties in 10,000 simulations');
    // Refactor 9A: a score exactly on a QB/RB/WR/TE line counts. Alpha QB's history has one 24 (was 22.2%),
    // Echo QB's one 24 (was 12.5%), Fox RB's one 20 (was 0%). The model-based numbers can't change.
    expect(text).toContain('Alpha QB Bust: 0% • Boom: 33.3% 18.25–25.31 (21.78 avg)');
    expect(text).toContain('Echo QB Bust: 0% • Boom: 25% 16.8–23.7 (20.25 avg)');
    expect(text).toContain('Fox RB Bust: 0% • Boom: 10% 11.62–18.58 (15.1 avg)');
    expect(text).toContain('Bravo RB Bust: 0.5% • Boom: 17% 12.83–20.17 (16.5 proj)');
    expect(text).toContain('Delta TE Final 11.2 pts (actual)');
    expect(text).toContain('Charlie WR Bust: 27.2% • Boom: 2.7% ~5.55–15.45 (10.5 avg)');
    expect(text).toContain('Golf WR Bust: 33.8% • Boom: 0.1% ~5.4–12.6 (9 proj)');
    expect(text).toContain('Hotel TE Bust: 100% • Boom: 0% ~0–0 (0 avg)');
    // Refactor 9B: K/DEF lines are 0.5x and 1.5x of max(average, 4). The kickers average over 4, so they
    // keep their numbers. Juliet DEF (avg -1.8) was 60% / 60% at lines -0.9 / -2.7, now 2 / 6; Kilo DEF
    // (avg 1.5, model) was 44% / 44% at lines 0.75 / 2.25. Win probabilities are unchanged.
    expect(text).toContain('India K Bust: 16.7% • Boom: 16.7% 4–11.34 (7.67 avg)');
    expect(text).toContain('Lima K Bust: 10% • Boom: 10% 5.62–12.58 (9.1 avg)');
    expect(text).toContain('Juliet DEF Bust: 80% • Boom: 0% 0–2.03 (-1.8 avg)');
    expect(text).toContain('Kilo DEF Bust: 54% • Boom: 18.2% ~0–6.45 (1.5 avg)');
    expect(raw).toEqual({ team1WinProb: 89.7, team2WinProb: 10.3, ties: 0, iterations: 5000, fallbackCount: 1, projectionCount: 0, actualCount: 1 });
    await expectClean(page, state);
});
