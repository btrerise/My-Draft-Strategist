// MLS matchup simulator with a fixed seed (refactor 3F, which moved lineup/monteCarloUi.js,
// statsEngine.js and worker.js to js/mls/sim/). Characterization: it pins today's numbers.
// The smoke test's simulator run stops at "Not enough roster data" with the fixture league, so
// this is the test that actually reaches the Web Worker. Math.random is replaced by a seeded
// generator in the page and, by rewriting the worker script on its way in, in the worker. A
// failure after a pure move means the move changed the simulation.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean } from './helpers.mjs';

const SEED = `(() => { let a = 0x9E3779B9; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();\n`;

test('matchup simulator gives the same results for a fixed seed', async ({ page }) => {
    const state = await preparePage(page);
    const workerUrls = [];
    await page.addInitScript(SEED);
    await page.route(/\/worker\.js$/, async (route) => {
        workerUrls.push(new URL(route.request().url()).pathname);
        const res = await route.fetch();
        await route.fulfill({ response: res, body: SEED + await res.text() });
    });
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
        const t1 = [mk('Alpha QB', 'QB', 22, 9), mk('Bravo RB', 'RB', 14, 6, { projectedMean: 16.5 }), mk('Charlie WR', 'WR', 12, 2), mk('Delta TE', 'TE', 8, 12, { actualScore: 11.2 })];
        const t2 = [mk('Echo QB', 'QB', 20, 8), mk('Fox RB', 'RB', 15, 10), mk('Golf WR', 'WR', 13, 1, { projectedMean: 9 }), mk('Hotel TE', 'TE', 7, 0)];
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
    expect(text).toContain('Your Team: 93.71% Opponent: 6.29%');
    expect(text).toContain('0 ties in 10,000 simulations');
    expect(text).toContain('Alpha QB Bust: 0% • Boom: 22.2% 18.25–25.31 (21.78 avg)');
    expect(text).toContain('Bravo RB Bust: 0.5% • Boom: 17% 12.83–20.17 (16.5 proj)');
    expect(text).toContain('Delta TE Final 11.2 pts (actual)');
    expect(text).toContain('Charlie WR Bust: 27.2% • Boom: 2.7% ~5.55–15.45 (10.5 avg)');
    expect(text).toContain('Golf WR Bust: 33.8% • Boom: 0.1% ~5.4–12.6 (9 proj)');
    expect(text).toContain('Hotel TE Bust: 100% • Boom: 0% ~0–0 (0 avg)');
    expect(raw).toEqual({ team1WinProb: 89.7, team2WinProb: 10.3, ties: 0, iterations: 5000, fallbackCount: 1, projectionCount: 0, actualCount: 1 });
    await expectClean(page, state);
});
