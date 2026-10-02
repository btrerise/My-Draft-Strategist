// Lineup Strategist league entry paths that seedMls() doesn't take (added in refactor 3B):
// Import All Leagues (username only) and the Draft Strategist roster handoff.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds } from './helpers.mjs';

const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });

test.describe('Lineup Strategist league entry', () => {
    test('Import All Leagues finds and syncs every league for a username', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.click('#importAllLeaguesBtn');
        await expect(toast(page, 'Please enter your Sleeper Username first.')).toBeVisible();

        await page.fill('#sleeperUsername', 'mds_test');
        await page.click('#importAllLeaguesBtn');
        await expect(toast(page, 'Imported 1 league!')).toBeVisible();
        await expect(page.locator('#headerLeagueSelect')).toContainText('Fixture League');
        await page.waitForLoadState('networkidle');
        await showTab(page, 'roster');
        await expect(page.locator('#rosterTab')).toContainText('Josh Allen');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('a roster sent from Draft Strategist imports as a new league', async ({ page }) => {
        const state = await openApp(page, '/');
        await seedMds(page);
        await showTab(page, 'team');
        await page.click('#sendToLineupBtn');
        await page.waitForURL('**/lineup/**');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#handoffBanner')).toBeVisible();
        await expect(page.locator('#handoffBannerText')).toContainText('Roster found from My Draft Strategist');
        await page.locator('#handoffBanner').getByRole('button', { name: 'Import as New League' }).click();
        await expect(toast(page, /Imported ".*" with \d+ players\./)).toBeVisible();
        await expect(page.locator('#handoffBanner')).toBeHidden();
        expect(await page.evaluate(() => localStorage.getItem('mds_handoff_roster'))).toBeNull();
        await showTab(page, 'roster');
        await expect(page.locator('#rosterTab')).toContainText("Ja'Marr Chase");
        await expectClean(page, state);
    });

    test('dismissing the handoff banner drops the roster', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.evaluate(() => localStorage.setItem('mds_handoff_roster', JSON.stringify({
            sourceLeagueName: 'Handoff Test', players: [{ name: 'Josh Allen', pos: 'QB', team: 'BUF' }], reqs: null,
        })));
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#handoffBannerText')).toContainText('"Handoff Test" (1 players)');
        await page.locator('#handoffBanner').getByRole('button', { name: 'Dismiss' }).click();
        await expect(page.locator('#handoffBanner')).toBeHidden();
        expect(await page.evaluate(() => localStorage.getItem('mds_handoff_roster'))).toBeNull();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#handoffBanner')).toBeHidden();
        await expectClean(page, state);
    });
});
