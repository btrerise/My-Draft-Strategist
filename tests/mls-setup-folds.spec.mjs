// improvements U4: the Dashboard's Add/Sync League and Active League Requirements fold to one line once a league exists
// (open while there is none), Scout's Sleeper Sync banner shows only while no Sleeper league is synced, and the two
// "moved to ..." signpost cards are gone.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls } from './helpers.mjs';

const SYNC = '#setupSyncCard';
const REQS = '#activeReqCard';
const open = (page, id) => page.locator(`${id} .setup-fold-toggle`).getAttribute('aria-expanded');

test.describe('Dashboard setup folds', () => {
    test('with no league both cards are open and plain', async ({ page }) => {
        const state = await openApp(page, '/lineup/', { setupFolds: 'default' });
        for (const id of [SYNC, REQS]) {
            await expect(page.locator(`${id} .setup-fold-toggle`)).toHaveAttribute('aria-expanded', 'true');
            await expect(page.locator(`${id} .setup-fold-toggle .chevron`)).toBeHidden();
            await expect(page.locator(`${id} .setup-fold-summary`)).toBeHidden();
        }
        await expect(page.locator('#sleeperUsername')).toBeVisible();
        await expect(page.locator('#reqQB')).toBeVisible();
        // A tap does nothing while there is no league to fold for.
        await page.locator(`${SYNC} .setup-fold-toggle`).click();
        await expect(page.locator('#sleeperUsername')).toBeVisible();
        await expectClean(page, state);
    });

    test('with a league both are one line, open on tap, and remembered across a reload', async ({ page }) => {
        const state = await openApp(page, '/lineup/', { setupFolds: 'default' });
        await seedMls(page);
        for (const id of [SYNC, REQS]) {
            await expect(page.locator(`${id} .setup-fold-toggle`)).toHaveAttribute('aria-expanded', 'false');
        }
        await expect(page.locator('#sleeperUsername')).toBeHidden();
        await expect(page.locator('#reqQB')).toBeHidden();
        await expect(page.locator(`${SYNC} .setup-fold-summary`)).toHaveText('1 league');
        await expect(page.locator(`${REQS} .setup-fold-summary`)).toContainText('QB 1');
        await expect(page.locator(`${REQS} .setup-fold-summary`)).toContainText('DEF 1');
        // One line each: the card is a header row, no taller than a few lines of text.
        for (const id of [SYNC, REQS]) expect((await page.locator(id).boundingBox()).height).toBeLessThan(90);

        await page.locator(`${SYNC} .setup-fold-toggle`).click();
        await expect(page.locator('#sleeperUsername')).toBeVisible();
        await expect(page.locator('#mainSyncBtn')).toBeVisible();
        await expect(page.locator('#reqQB')).toBeHidden();
        await page.locator(`${REQS} .setup-fold-toggle`).click();
        await expect(page.locator('#reqQB')).toBeVisible();

        await page.reload();
        await page.waitForLoadState('networkidle');
        expect(await open(page, SYNC)).toBe('true');
        expect(await open(page, REQS)).toBe('true');
        await expect(page.locator('#sleeperUsername')).toBeVisible();

        // Closing again forgets it: closed is the default.
        await page.locator(`${SYNC} .setup-fold-toggle`).click();
        await page.locator(`${REQS} .setup-fold-toggle`).click();
        expect(await page.evaluate(() => localStorage.getItem('mls_setup_folds'))).toBeNull();
        await page.reload();
        await page.waitForLoadState('networkidle');
        expect(await open(page, SYNC)).toBe('false');
        await expectClean(page, state);
    });

    test("the Requirements line follows the active league's saved slots", async ({ page }) => {
        const state = await openApp(page, '/lineup/', { setupFolds: 'default' });
        await seedMls(page);
        await page.locator(`${REQS} .setup-fold-toggle`).click();
        await page.fill('#reqRB', '3');
        await page.fill('#reqSFLEX', '1');
        await page.getByRole('button', { name: 'Save Requirements' }).click();
        await page.locator(`${REQS} .setup-fold-toggle`).click();
        await expect(page.locator(`${REQS} .setup-fold-summary`)).toContainText('RB 3');
        await expect(page.locator(`${REQS} .setup-fold-summary`)).toContainText('SFLEX 1');
        await expectClean(page, state);
    });
});

test.describe('Scout banner and signposts', () => {
    test("the Sleeper Sync banner shows only until a Sleeper league is synced, and dismissing keeps it hidden", async ({ page }) => {
        const state = await openApp(page, '/lineup/', { setupFolds: 'default' });
        await showTab(page, 'scout');
        await expect(page.locator('#sleeperSyncBanner')).toBeVisible();
        await showTab(page, 'setup');
        await seedMls(page);
        await showTab(page, 'scout');
        await expect(page.locator('#sleeperSyncBanner')).toBeHidden();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'scout');
        await expect(page.locator('#sleeperSyncBanner')).toBeHidden();
        await expectClean(page, state);
    });

    test('dismissing the banner hides it for good, and a manual league does not count as synced', async ({ page }) => {
        const state = await openApp(page, '/lineup/', { setupFolds: 'default' });
        await page.fill('#newLeagueName', 'My Manual');
        await page.getByRole('button', { name: 'Create Manual' }).click();
        await expect(page.locator('#headerLeagueSelect')).toContainText('My Manual');
        await showTab(page, 'scout');
        await expect(page.locator('#sleeperSyncBanner')).toBeVisible();
        await page.locator('#sleeperSyncBanner [data-action="dismissBanner"]').click();
        await expect(page.locator('#sleeperSyncBanner')).toBeHidden();
        expect(await page.evaluate(() => localStorage.getItem('mls_hide_sleeper_sync_banner'))).toBe('true');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'scout');
        await expect(page.locator('#sleeperSyncBanner')).toBeHidden();
        await expectClean(page, state);
    });

    test('the two "moved to" signpost cards are gone', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await expect(page.locator('#injuryAuditPointer, #powerRankingsScoutPointer, .mls-moved-pointer')).toHaveCount(0);
        await expectClean(page, state);
    });
});
