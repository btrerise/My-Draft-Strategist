// Auto-Find's drop candidate when a rostered star is on bye (improvements F30). Weekly rankings leave out a player on
// his bye, so he looked like your worst player and Auto-Find (Whole Roster) named him as the one to drop. Now a rostered
// player missing from the Weekly set is judged by his ROS rank when the league has ROS rankings, and the row says why;
// a league with only Weekly rankings behaves as before, with a note that he's on bye.
//
// The fixture week is set to 6, CIN's bye, so Ja'Marr Chase (your WR1, ROS #1) is on bye. The Weekly file is the
// waiver fixture without Chase; the ROS file is the whole fixture.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const WEEKLY_CSV = WAIVER_RANKINGS_CSV.split('\n').filter(l => !l.includes("Ja'Marr Chase")).join('\n');
const upload = async (page, inputId, csv, count) => {
    await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
};

async function setup(page, { withRos }) {
    const state = await openApp(page, '/lineup/');
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/\d+$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: fixture('projections-2026-2.json') }));
    await seedMls(page);
    const n = WAIVER_RANKINGS_CSV.trim().split('\n').length - 1;
    if (withRos) await upload(page, 'rosFileInput', WAIVER_RANKINGS_CSV, n);
    await upload(page, 'weeklyFileInput', WEEKLY_CSV, n - 1);
    // Week 6 is CIN's bye (js/shared/data/byes.js).
    await page.evaluate(async () => { (await import('/js/mls/state.js')).State.currentNflWeek = 6; });
    await showTab(page, 'scout');
    await page.locator('#waiverScanBasis').selectOption('weekly');
    await callApp(page, 'setWaiverPos', 'WR');
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', 'roster');
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    await expect(page.locator('#waiverOutput .mls-scan-benchmark')).toBeVisible();
    return state;
}

test.describe('Lineup Strategist: Auto-Find drop candidate on a bye', () => {
    test('with ROS rankings, a star on bye is ranked by ROS and not offered as the drop', async ({ page }) => {
        const state = await setup(page, { withRos: true });
        const bench = page.locator('#waiverOutput .mls-scan-benchmark').first();
        await expect(bench).toContainText('Your weakest WR is');
        await expect(bench).not.toContainText("Your weakest WR is Ja'Marr Chase");
        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('without ROS rankings, the weekly-only behaviour stays, with a note that he is on bye', async ({ page }) => {
        const state = await setup(page, { withRos: false });
        const bench = page.locator('#waiverOutput .mls-scan-benchmark').first();
        await expect(bench).toContainText("Your weakest WR is Ja'Marr Chase");
        await expect(bench).toContainText('On bye');
        await expectClean(page, state);
    });
});
