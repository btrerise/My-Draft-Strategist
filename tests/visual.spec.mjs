// Screenshot baselines for every tab, at desktop and phone width (see playwright.config.mjs).
// A chunk that only moves code must leave all of these identical. To accept an intended
// visual change: `npm run test:update`, then review the changed PNGs in the diff.
import { test, expect } from '@playwright/test';
import {
    openApp, showTab, showTScoreTab, seedMds, seedMls,
    MDS_TABS, MLS_TABS, TSCORE_TABS,
} from './helpers.mjs';

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
