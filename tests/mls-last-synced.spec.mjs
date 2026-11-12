// The Dashboard's "Last synced" line under Sync All / Optimize All (improvements S46, js/mls/render/dashboard.js
// renderLastSynced; the rules are js/mls/leagues/lastSynced.js, with tests/unit/lastSynced.test.mjs for the kickoff
// amber rule). The clock is the fixed one (tests/helpers.mjs), Tue Sep 15 2026 16:00 UTC; the zone is pinned to
// Chicago so it reads 11:00 AM.
import { test, expect } from '@playwright/test';
import { openApp, showTab, seedMls, callApp, FIXTURE_LEAGUE_ID } from './helpers.mjs';

test.use({ timezoneId: 'America/Chicago', locale: 'en-US' });

const line = (page) => page.locator('#lastSyncedLine');
const time = (page) => line(page).locator('.mls-last-synced-time');
const failed = (page) => line(page).locator('.mls-last-synced-failed');
const plain = (s) => s.replace(/[  ]/g, ' ');
const expectText = async (loc, text) => expect.poll(async () => plain(await loc.textContent())).toBe(text);

// Rewrites the stored leagues (each by id: fields to set, or null to delete them), then reloads on the Dashboard.
async function editLeagues(page, edits, extra = []) {
    await page.evaluate(({ edits, extra }) => {
        const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
        for (const l of leagues) Object.assign(l, edits[l.leagueId] || {});
        const fixture = leagues[0];
        for (const e of extra) leagues.push({ ...fixture, ...e });
        localStorage.setItem('mls_leagues', JSON.stringify(leagues));
    }, { edits, extra });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await showTab(page, 'setup');
}

test.describe('Lineup Strategist Last synced on the Dashboard', () => {
    test('no line without a synced Sleeper league; synced today shows the time, under the buttons', async ({ page }) => {
        await openApp(page, '/lineup/');
        await showTab(page, 'setup');
        await expect(line(page)).toBeHidden();

        // A manual league doesn't count: the Command Center shows, the line doesn't.
        await page.locator('#newLeagueName').evaluate((el) => { el.value = 'Manual League'; });
        await callApp(page, 'createManualLeague');
        await showTab(page, 'setup');
        await expect(page.locator('#dashboardCommandCenter')).toBeVisible();
        await expect(line(page)).toBeHidden();

        await seedMls(page);
        await showTab(page, 'setup');
        await expect(line(page)).toBeVisible();
        await expectText(time(page), 'Last synced 11:00 AM');
        await expect(time(page)).toHaveClass(/\bfreshness-ok\b/);
        await expect(time(page)).toHaveAttribute('title', /Tuesday, September 15, 2026 at 11:00\sAM/);
        await expect(time(page).locator('svg[aria-hidden="true"]')).toHaveCount(1);
        await expect(failed(page)).toHaveCount(0);

        // Right under Sync All / Optimize All.
        const buttons = await page.locator('#syncAllBtn').boundingBox();
        const box = await line(page).boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(buttons.y + buttons.height);
        expect(box.y - (buttons.y + buttons.height)).toBeLessThan(24);
    });

    test('yesterday, last week in amber, a failed league named, and Sync All brings it up to date', async ({ page }) => {
        await openApp(page, '/lineup/');
        await seedMls(page);

        // Yesterday 8:15 PM in Chicago (01:15 UTC today): under a day and no kickoff soon, so not amber.
        await editLeagues(page, { [FIXTURE_LEAGUE_ID]: { lastSyncedAt: Date.parse('2026-09-15T01:15:00Z') } });
        await expectText(time(page), 'Last synced yesterday 8:15 PM');
        await expect(time(page)).toHaveClass(/\bfreshness-ok\b/);

        // Last week, with a second league whose last sync failed (synced 4 days ago before that). The newest sync is
        // still the fixture league's, a week ago: amber, and the failed league named after it in red.
        await editLeagues(page, { [FIXTURE_LEAGUE_ID]: { lastSyncedAt: Date.parse('2026-09-08T15:00:00Z') } },
            [{ leagueId: '1000000000000000002', name: 'Second League', lastSyncedAt: Date.parse('2026-09-07T15:00:00Z'), lastSyncFailedAt: Date.parse('2026-09-15T15:00:00Z') }]);
        await expectText(time(page), 'Last synced Sep 8');
        await expect(time(page)).toHaveClass(/\bfreshness-stale\b/);
        await expect(time(page)).toHaveAttribute('title', /Over a day ago/);
        await expect(failed(page)).toHaveText("Second League's last sync failed");
        await expect(failed(page)).toHaveClass(/\bsync-failed\b/);

        // Sync All syncs both (the fixture server answers any league id): today, and the failure cleared.
        await page.click('#syncAllBtn');
        await expect(page.locator('#syncAllBtn')).toBeEnabled({ timeout: 15000 });
        await expectText(time(page), 'Last synced 11:00 AM');
        await expect(time(page)).toHaveClass(/\bfreshness-ok\b/);
        await expect(failed(page)).toHaveCount(0);
    });

    test('at 375px the failed league wraps under the time, both centered', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openApp(page, '/lineup/');
        await seedMls(page);
        await editLeagues(page, {}, [{ leagueId: '1000000000000000002', name: 'Second League', lastSyncedAt: Date.parse('2026-09-11T15:00:00Z'), lastSyncFailedAt: Date.parse('2026-09-15T15:00:00Z') }]);
        await expectText(time(page), 'Last synced 11:00 AM');
        const t = await time(page).boundingBox(), f = await failed(page).boundingBox(), l = await line(page).boundingBox();
        expect(f.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
        expect(l.x + l.width).toBeLessThanOrEqual(375);
        expect(Math.abs((t.x + t.width / 2) - (l.x + l.width / 2))).toBeLessThan(2);
    });
});
