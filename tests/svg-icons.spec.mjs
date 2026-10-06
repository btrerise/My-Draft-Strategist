// The two emoji users could see, replaced in improvements S1 under the owner's rule that icons are
// SVG, never emoji (tests/unit/noEmoji.test.mjs scans the source for any that come back):
//   Lineup Strategist: the first Optimize Lineup toast ("🎉 Lineup Optimized!"). Toasts are plain
//     text, so the emoji is dropped rather than drawn.
//   Draft Strategist: the bye-week warning banner on the Team tab ("⚠️ WARNING"), now an SVG
//     warning triangle.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, confirmMdsPreview, RANKINGS_CSV } from './helpers.mjs';

const EMOJI = /\p{Emoji_Presentation}|️/u;

test('Lineup Strategist: the first Optimize Lineup toast has no emoji', async ({ page }) => {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await showTab(page, 'lineup');
    await page.locator('#lineupTab [data-action="optimizeLineup"]').first().click();
    const toast = page.locator('.toast-message').filter({ hasText: 'Lineup Optimized!' });
    await expect(toast).toHaveText("Lineup Optimized! You've successfully completed the setup flow.");
    expect(await toast.textContent()).not.toMatch(EMOJI);
    await expectClean(page, state);
});

test('Draft Strategist: the bye-week warning uses an SVG icon', async ({ page }) => {
    const state = await openApp(page, '/');
    // The Settings toggle's stored value (KEYS.mds.byeWarnings); the Team tab reads it on each render.
    await page.evaluate(() => localStorage.setItem('mds_bye_warnings', 'true'));
    await page.fill('#csvPasteArea', RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    await confirmMdsPreview(page);
    await showTab(page, 'tracker');
    // Three starters with a week-8 bye in fixtures/rankings.csv.
    for (const name of ['Jahmyr Gibbs', 'Puka Nacua', 'Amon-Ra St. Brown']) {
        await page.locator(`#trackerTab [aria-label="Pick ${name} for my team"]`).first().click();
    }
    await showTab(page, 'team');
    const banner = page.locator('.bye-warning-banner');
    await expect(banner).toContainText('WARNING: You have 3 starting players on Bye in Week 8!');
    await expect(banner.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    expect(await banner.textContent()).not.toMatch(EMOJI);
    await expectClean(page, state);
});
