// Lineup Strategist ranking sets across leagues (added in refactor 3D): one rankings upload applied
// to a second league from the upload preview, then to a third through "Choose leagues...".
import { test, expect } from '@playwright/test';
import { openApp, expectClean, seedMls, RANKINGS_CSV, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
const rosSetIds = (page) => page.evaluate(() =>
    Object.fromEntries(JSON.parse(localStorage.getItem('mds_season_leagues')).map(l => [l.name, l.rosRankingSetId])));

test.describe('Lineup Strategist ranking sets', () => {
    test('a rankings upload applies to several leagues', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        // Manual league ids are 'manual_' + Date.now(), and the test clock is fixed, so step it
        // forward between the two or both leagues get the same id.
        for (const [i, name] of ['Second League', 'Third League'].entries()) {
            await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + (i + 1) * 1000));
            await page.locator('#newLeagueName').evaluate((el, v) => { el.value = v; }, name);
            await page.evaluate(() => window.createManualLeague());
        }
        await page.evaluate((id) => window.switchActiveLeague(id), FIXTURE_LEAGUE_ID);

        // Upload ROS rankings in the Fixture League and tick Second League in the preview.
        await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
        const preview = page.locator('#rankingsPreviewOverlay');
        await expect(preview).toContainText('24 players parsed');
        const picker = page.locator('#rankingsPreviewLeagues');
        await expect(picker).toContainText('Also use this set in');
        await picker.locator('label', { hasText: 'Second League' }).locator('input').check();
        await page.evaluate(() => window.confirmRankingsPreview());
        await expect(preview).toBeHidden();

        let ids = await rosSetIds(page);
        const setId = ids['Fixture League'];
        expect(setId).toBeTruthy();
        expect(ids['Second League']).toBe(setId);
        expect(ids['Third League']).toBeNull();

        // "Choose leagues..." adds the third league to the same set.
        // Not awaited: it resolves when the dialog closes.
        await page.evaluate(() => { window.openRankingSetLeagues('ros'); });
        const dialog = page.locator('#rankingLeaguesOverlay');
        await expect(dialog).toBeVisible();
        await dialog.locator('label', { hasText: 'Third League' }).locator('input').check();
        await dialog.locator('[data-league-picker="ok"]').click();
        await expect(toast(page, 'is now used in 3 leagues.')).toBeVisible();
        ids = await rosSetIds(page);
        expect(ids['Third League']).toBe(setId);

        // Switching to another league shows that set and its players.
        const third = await page.evaluate(() => JSON.parse(localStorage.getItem('mds_season_leagues')).find(l => l.name === 'Third League').leagueId);
        await page.evaluate((id) => window.switchActiveLeague(id), third);
        await expect(page.locator('#rosRankingSetSelect')).toHaveValue(setId);
        await expect(page.locator('#rosHeaderSetName')).not.toBeEmpty();
        expect(await page.evaluate(() => (localStorage.getItem('mds_season_ros') || '').includes('Josh Allen'))).toBe(true);
        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
