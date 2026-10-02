// Lineup Strategist keyboard behavior (added in refactor 3E, when the shortcuts and the Lineup tab
// renderer moved out of legacy.js). Characterization: it records what the app does today. Note
// that renderLineupUI rebuilds the rows, so the button you pressed is gone and focus falls back
// to <body>; Tab then resumes from where that button was. 3E checked this is unchanged; a later
// change that keeps focus on the rebuilt button should update this spec on purpose.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, RANKINGS_CSV } from './helpers.mjs';

const activeTab = page => page.evaluate(() => document.querySelector('.tab-content.active')?.id);
const blur = page => page.evaluate(() => document.activeElement && document.activeElement.blur());
const focusedIsBody = page => page.evaluate(() => document.activeElement === document.body);

test.describe('Lineup Strategist keyboard', () => {
    test('shortcuts switch tabs, Escape closes the drawer, typing in a field does not', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        for (const [key, tab] of [['2', 'rosterTab'], ['3', 'lineupTab'], ['4', 'scoutTab'], ['5', 'guideTab'], ['1', 'setupTab']]) {
            await blur(page);
            await page.keyboard.press(key);
            expect(await activeTab(page)).toBe(tab);
        }
        await page.focus('#sleeperUsername');
        await page.keyboard.press('3');
        expect(await activeTab(page)).toBe('setupTab');

        await page.evaluate(() => window.toggleDrawer());
        await expect(page.locator('#drawer')).toHaveClass(/\bopen\b/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#drawer')).not.toHaveClass(/\bopen\b/);
        await expectClean(page, state);
    });

    test('lock, undo/redo and swap from the keyboard; focus after the lineup rebuilds', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        for (const inputId of ['rosFileInput', 'weeklyFileInput']) {
            await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
            await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
            await page.evaluate(() => window.confirmRankingsPreview());
            await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
        }
        await showTab(page, 'lineup');
        const lineup = page.locator('#optimalLineupContainer');

        await lineup.locator('.lock-btn').first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.toast-message').filter({ hasText: 'Josh Allen is locked' })).toBeVisible();
        await expect(lineup.locator('.mls-lock-badge')).toHaveCount(1);
        expect(await focusedIsBody(page)).toBe(true);
        await page.keyboard.press('Tab');
        await expect(page.locator(':focus')).toHaveText('Unlock All (1)');

        await blur(page);
        await page.keyboard.press('Control+z');
        await expect(lineup.locator('.mls-lock-badge')).toHaveCount(0);
        await page.keyboard.press('Control+y');
        await expect(lineup.locator('.mls-lock-badge')).toHaveCount(1);

        await lineup.locator('.swap-btn').first().focus();
        await page.keyboard.press('Enter');
        await expect(lineup).toContainText("Tap another player's ⇄ to swap with Josh Allen, or tap Cancel to stop.");
        expect(await focusedIsBody(page)).toBe(true);
        await lineup.locator('.swap-btn').first().focus();
        await page.keyboard.press('Enter');
        await expect(lineup).not.toContainText('Tap another player');
        await expectClean(page, state);
    });
});
