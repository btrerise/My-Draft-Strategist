// Screenshot baselines for every tab, at desktop and phone width (see playwright.config.mjs).
// A chunk that only moves code must leave all of these identical. To accept an intended
// visual change: `npm run test:update`, then review the changed PNGs in the diff.
import { test, expect } from '@playwright/test';
import {
    openApp, showTab, showTScoreTab, seedMds, seedMls,
    MDS_TABS, MLS_TABS, TSCORE_TABS,
} from './helpers.mjs';

// Repeatable rendering (refactor 0C). By default Chromium re-rasters only the changed rectangle of a
// tile and keeps the rest, so anti-aliased edges near earlier changes (tab switches, the full-page
// capture's own resize) came out a few pixels different depending on what the page did before. Some
// MDS, MLS and T-Score PNGs varied from run to run (7C saw up to 56,654 px), within the tolerance.
// Full raster gives the same pixels every time. Only this spec takes screenshots, so it's set here.
test.use({ launchOptions: { args: ['--disable-partial-raster'] } });

const shot = (page, name) => expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });

test('MDS empty tabs', async ({ page }) => {
    await openApp(page, '/');
    for (const tab of MDS_TABS) {
        await showTab(page, tab);
        await shot(page, `mds-empty-${tab}`);
    }
});

test('MDS mid-draft tabs', async ({ page }) => {
    await openApp(page, '/');
    await seedMds(page);
    for (const tab of ['tracker', 'team', 'board']) {
        await showTab(page, tab);
        await shot(page, `mds-draft-${tab}`);
    }
});

test('MLS empty setup', async ({ page }) => {
    await openApp(page, '/lineup/');
    await shot(page, 'mls-empty-setup');
});

test('MLS synced league tabs', async ({ page }) => {
    await openApp(page, '/lineup/');
    await seedMls(page);
    for (const tab of MLS_TABS) {
        await showTab(page, tab);
        await shot(page, `mls-league-${tab}`);
    }
});

test('T-Score tabs', async ({ page }) => {
    await openApp(page, '/t-score/');
    for (const tab of TSCORE_TABS) {
        await showTScoreTab(page, tab);
        await shot(page, `tscore-${tab}`);
    }
});
