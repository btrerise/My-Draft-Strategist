// Lineup Strategist Scout tab with rankings loaded (added in refactor 3C). The seeded state in the
// smoke and screenshot tests has no rankings, so it only covers the Scout tab's empty form.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

test.describe('Lineup Strategist Scout tab', () => {
    test('scan a pasted list, auto-find, and scout a trade', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        const waivers = page.locator('#waiverOutput');

        // The pasted list and Auto-Find are modes of the Waiver Wire Assistant since improvements S1.
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', "Ja'Marr Chase\nJosh Allen\nNobody McFakename");
        await page.click('#waiverScanBtn');
        await expect(waivers).toContainText('Your list, checked in Fixture League by Weekly rank');
        await expect(waivers).toContainText("Ja'Marr Chase");

        await callApp(page, 'setWaiverScope', 'all');
        await page.click('#waiverScanBtn');
        await expect(waivers).toContainText('Searched 1 league for 3 players.');
        await callApp(page, 'setWaiverScope', 'league');

        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'roster');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(waivers).toContainText('Top available in Fixture League by Weekly rank, compared against your weakest rostered player');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(waivers).toContainText('checked against your current Week 2 starting lineup');

        // Each side is picked with a search since improvements S14; setTradePlayers sets a whole side at once.
        await callApp(page, 'setTradePlayers', 'get', ["Ja'Marr Chase"]);
        await callApp(page, 'setTradePlayers', 'give', ['Josh Allen', 'Bijan Robinson']);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#tradeOutput')).toContainText('Favors Them');
        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
