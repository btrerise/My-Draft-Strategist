// Counting spinners keep spinning (improvements F2). Sync All ("Syncing 2/5…") and the multi-file rankings
// upload ("Processing 2/3…") used to rewrite the button's whole innerHTML for every count, spinner SVG included.
// Each rewrite made a new spinner element, so the animation restarted from the top. Now the spinner is built
// once and only the text beside it changes.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';

// Holds one Sleeper request until release() is called, then hands it to the stub in helpers.mjs.
async function gateRosters(page, leagueId) {
    let release;
    const released = new Promise((resolve) => { release = resolve; });
    await page.route(new RegExp(`api\\.sleeper\\.app/v1/league/${leagueId}/rosters$`), async (route) => {
        await released;
        await route.fallback();
    });
    return release;
}

test.describe('Counting spinners', () => {
    test('Sync All keeps one spinner element while the count goes from 1/2 to 2/2', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);

        // A second league: the fixture server answers any league id with the Fixture League, and the app keys
        // leagues by the id that was typed.
        await page.fill('#sleeperLeagueId', SECOND_LEAGUE_ID);
        await page.click('#mainSyncBtn');
        await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
        await page.waitForLoadState('networkidle');

        const releaseFirst = await gateRosters(page, FIXTURE_LEAGUE_ID);
        const releaseSecond = await gateRosters(page, SECOND_LEAGUE_ID);

        const btn = page.locator('#syncAllBtn');
        const buttonHandle = await btn.elementHandle();
        await btn.click();

        // League 1 is held at its rosters request, so the button reads 1/2.
        await expect(btn).toContainText('Syncing 1/2…');
        const spinner = btn.locator('.sync-spinner');
        await expect(spinner).toHaveCount(1);
        const spinnerHandle = await spinner.elementHandle();

        releaseFirst();
        await expect(btn).toContainText('Syncing 2/2…');

        // Same spinner element, still on screen, still inside the same button.
        const sameSpinner = await spinnerHandle.evaluate((el) => el.isConnected && el === document.querySelector('#syncAllBtn .sync-spinner'));
        expect(sameSpinner, 'the spinner element on screen at 2/2 is the one that was there at 1/2').toBe(true);
        const sameButton = await buttonHandle.evaluate((el) => el === document.querySelector('#syncAllBtn'));
        expect(sameButton, 'a re-render during the loop did not replace the Sync All button').toBe(true);

        releaseSecond();
        await expect(page.locator('.toast-message').filter({ hasText: 'Successfully synced 2 leagues!' })).toBeVisible();

        // Restored as before: label back, spinner gone, clickable.
        await expect(btn).toContainText('Sync All Leagues');
        await expect(btn.locator('.sync-spinner')).toHaveCount(0);
        await expect(btn).toBeEnabled();
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('multi-file rankings upload keeps one spinner element across Processing 1/2 and 2/2', async ({ page }) => {
        const state = await openApp(page, '/lineup/');

        await showTab(page, 'lineup');
        const toggle = page.locator('#weeklyRankingsCard .rankings-card-toggle');
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
        await expect(page.locator('#weeklyRankingsCard')).toHaveClass(/\bexpanded\b/);
        await page.selectOption('#weeklyUploadMode', 'multi');
        await expect(page.locator('#weeklyMultiMode')).toBeVisible();
        for (const pos of ['QB', 'RB']) {
            await page.evaluate((p) => { document.getElementById(`weekly-input-wrap-${p}`).style.display = 'flex'; }, pos);
            await page.setInputFiles(`#weeklyFileInput-${pos}`, { name: `${pos}.csv`, mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
        }

        // Counts every distinct spinner element the button gets while the run is going.
        await page.evaluate(() => {
            const btn = document.getElementById('weeklyMultiProcessBtn');
            window.__spinnersSeen = new Set();
            const note = () => btn.querySelectorAll('.sync-spinner').forEach((el) => window.__spinnersSeen.add(el));
            new MutationObserver(note).observe(btn, { childList: true, subtree: true });
        });

        await page.click('#weeklyMultiProcessBtn');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
        await expect(page.locator('#weeklyMultiProcessBtn')).toContainText('Combine & Process Files');

        const seen = await page.evaluate(() => window.__spinnersSeen.size);
        expect(seen, 'spinner elements created during the run').toBe(1);
        await expect(page.locator('#weeklyMultiProcessBtn .sync-spinner')).toHaveCount(0);
        await expectClean(page, state);
    });
});
