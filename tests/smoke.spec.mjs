// Smoke tests: every page loads with no errors, every tab opens, and the main flows run.
// "No errors" = no uncaught exception, no console.error, no local 404, no fatal boot banner.
import { test, expect } from '@playwright/test';
import {
    openApp, expectClean, showTab, showTScoreTab, seedMds, seedMls,
    MDS_TABS, MLS_TABS, TSCORE_TABS,
} from './helpers.mjs';

test.describe('Draft Strategist (/)', () => {
    test('loads and opens every tab', async ({ page }) => {
        const state = await openApp(page, '/');
        for (const tab of MDS_TABS) await showTab(page, tab);
        await expectClean(page, state);
    });

    test('bottom nav switches tabs', async ({ page }) => {
        const state = await openApp(page, '/');
        await page.locator('.nav-btn[data-target="board"]:visible').first().click();
        await expect(page.locator('#boardTab')).toHaveClass(/\bactive\b/);
        await expectClean(page, state);
    });

    test('paste rankings, draft, and view team and board', async ({ page }) => {
        const state = await openApp(page, '/');
        await seedMds(page);
        // Drafted players leave the pool; undrafted ones stay.
        await expect(page.locator('#trackerTab .btn-mine[aria-label="Pick Bijan Robinson for my team"]')).toHaveCount(0);
        await expect(page.locator('#trackerTab .btn-mine[aria-label="Pick Kyren Williams for my team"]').first()).toBeAttached();
        await showTab(page, 'team');
        await expect(page.locator('#teamTab')).toContainText("Ja'Marr Chase");
        await showTab(page, 'board');
        await expect(page.locator('#boardTab')).toContainText('Robinson');
        await expectClean(page, state);
    });
});

test.describe('Lineup Strategist (/lineup/)', () => {
    test('loads and opens every tab', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        for (const tab of MLS_TABS) await showTab(page, tab);
        await expectClean(page, state);
    });

    test('syncs a Sleeper league and shows roster and lineup', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');
        await expect(page.locator('#rosterTab')).toContainText('Josh Allen');
        await showTab(page, 'lineup');
        await expect(page.locator('#lineupTab')).toContainText('Derrick Henry');
        await showTab(page, 'scout');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('matchup simulator runs in its Web Worker', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'lineup');
        await page.click('#run-sim-btn');
        const results = page.locator('#monte-carlo-results');
        await expect(results).toBeVisible({ timeout: 15_000 });
        await expect(results).not.toBeEmpty();
        await expectClean(page, state);
    });
});

test.describe('T-Score (/t-score/)', () => {
    test('loads and opens every tab', async ({ page }) => {
        const state = await openApp(page, '/t-score/');
        for (const tab of TSCORE_TABS) await showTScoreTab(page, tab);
        await expectClean(page, state);
    });
});
