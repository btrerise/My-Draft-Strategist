// Lineup Strategist Scout tab with rankings loaded (added in refactor 3C). The seeded state in the
// smoke and screenshot tests has no rankings, so it only covers the Scout tab's empty form.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, RANKINGS_CSV } from './helpers.mjs';

async function loadRankings(page) {
    for (const inputId of ['rosFileInput', 'weeklyFileInput']) {
        await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
        await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
        await page.evaluate(() => window.confirmRankingsPreview());
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
    }
}

test.describe('Lineup Strategist Scout tab', () => {
    test('scan a pasted list, auto-find, and scout a trade', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadRankings(page);
        await showTab(page, 'scout');
        const waivers = page.locator('#waiverOutput');

        await page.fill('#waiverInput', "Ja'Marr Chase\nJosh Allen\nNobody McFakename");
        await page.click('#waiverScanBtn');
        await expect(waivers).toContainText('Your list, checked in Fixture League by Weekly rank');
        await expect(waivers).toContainText("Ja'Marr Chase");

        await page.evaluate(() => window.setWaiverScope('all'));
        await page.click('#waiverScanBtn');
        await expect(waivers).toContainText('Searched 1 league for 3 players.');
        await page.evaluate(() => window.setWaiverScope('league'));

        await page.evaluate(() => window.setWaiverCompare('roster'));
        await page.locator('[onclick^="autoFindWaiverUpgrades"]').click();
        await expect(waivers).toContainText('Top available in Fixture League by Weekly rank, compared against your weakest rostered player');
        await page.evaluate(() => window.setWaiverCompare('lineup'));
        await page.locator('[onclick^="autoFindWaiverUpgrades"]').click();
        await expect(waivers).toContainText('checked against your current Week 2 starting lineup');

        await page.fill('#buyInput', "Ja'Marr Chase");
        await page.fill('#sellInput', 'Josh Allen\nBijan Robinson');
        await page.locator('[onclick="runScout(\'trade\')"]').click();
        await expect(page.locator('#tradeOutput')).toContainText('Favors Them');
        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
