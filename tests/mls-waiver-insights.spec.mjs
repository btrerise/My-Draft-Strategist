// MLS matchup simulator with Waiver Insights on (added in refactor 3G). The fixture league rosters
// every player in rankings.csv, so this uploads rankings-waivers.csv, which adds six free agents
// the fixture player map knows and no roster holds. Math.random is seeded in the page and in the
// worker (seedSimRandom), so the win probabilities are exact.
//
// Before 3G, Waiver Insights found no free agents unless a Scout action (Scan Pasted List etc.) had
// built the position lookup earlier in the page, or Market data was loaded. The second and third
// tests cover 3G's fix: a fresh page compares free agents, and when none can be given a position the
// card says that instead of blaming game history and kickoffs.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, showTab, seedMls, loadMlsRankings, seedSimRandom, callApp, RANKINGS_CSV, WAIVER_RANKINGS_CSV } from './helpers.mjs';

async function openSeeded(page, csv = WAIVER_RANKINGS_CSV, count = 30) {
    const state = await preparePage(page);
    await seedSimRandom(page);
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await seedMls(page);
    await loadMlsRankings(page, csv, count);
    return state;
}

async function runSimWithWaiverInsights(page) {
    await showTab(page, 'lineup');
    await page.locator('#waiverInsightsToggle').check();
    await page.click('#run-sim-btn');
    const insights = page.locator('#monte-carlo-results .sim-bench-insights').filter({ hasText: 'Waiver Insights' });
    await expect(insights).toBeVisible();
    await expect(page.locator('#run-sim-btn')).toBeEnabled();
    return insights;
}

const COMPARED = [
    'Chase Brown RB (available) outscored Derrick Henry RB (starting) in 100% of simulated weeks.',
    'Jayden Daniels QB (available) outscored Josh Allen QB (starting) in 98.3% of simulated weeks.',
    'Jaxon Smith-Njigba WR (available) outscored Justin Jefferson WR (starting) in 82.9% of simulated weeks.',
    'Zay Flowers WR (available) outscored Justin Jefferson WR (starting) in 55.7% of simulated weeks.',
];

test.describe('Lineup Strategist Waiver Insights', () => {
    test('compares free agents after a Scan Pasted List run', async ({ page }) => {
        const state = await openSeeded(page);
        // Scan Pasted List builds the position lookup (sleeperPosByName, js/mls/players.js) as a side effect.
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', 'Jayden Daniels');
        await page.click('#waiverScanBtn');
        await expect(page.locator('#waiverOutput')).toContainText('Jayden Daniels');

        const insights = await runSimWithWaiverInsights(page);
        const text = (await insights.textContent()).replace(/\s+/g, ' ').trim();
        expect(text).toBe('Waiver Insights ' + COMPARED.join(' '));
        await expect(page.locator('#monte-carlo-results')).toContainText('Your Team: 2.99% Opponent: 97.01%');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('compares free agents in a fresh page with no Scout action first', async ({ page }) => {
        const state = await openSeeded(page);
        expect(await page.evaluate(async () => (await import('/js/mls/players.js')).sleeperPosByName === undefined), 'no position lookup yet').toBe(true);

        const insights = await runSimWithWaiverInsights(page);
        const text = (await insights.textContent()).replace(/\s+/g, ' ').trim();
        expect(text).toBe('Waiver Insights ' + COMPARED.join(' '));
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('says so when no free agent can be given a position', async ({ page }) => {
        // Two unrostered names Sleeper's player list doesn't know, and no Market data: neither
        // gets a position, so there are no candidates before the history and kickoff checks.
        const csv = RANKINGS_CSV + '25,Nobody McFakename,RB,FA,5,7\n26,Imaginary Receiver,WR,FA,5,7\n';
        const state = await openSeeded(page, csv, 26);

        const insights = await runSimWithWaiverInsights(page);
        await expect(insights).toContainText('No free agents to compare: none of the unrostered players in your rankings could be matched to a position.');
        await expect(insights).not.toContainText("don't have enough game history");
        expect(await page.evaluate(async () => Object.keys((await import('/js/mls/players.js')).sleeperPosByName || {}).length), 'position lookup built').toBeGreaterThan(0);
        await expectClean(page, state);
    });
});
