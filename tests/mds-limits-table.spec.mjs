// Draft Strategist Team tab: the roster-limits table under "My Team". Before any rankings are loaded
// it's drawn by renderBoard's empty-state branch (js/mds/tracker.js), which used to write seven cells
// under the table's nine headers (no K or DEF cell), so the total sat under K. Fixed in improvements S1.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab } from './helpers.mjs';

test('the empty roster-limits row has a cell under every header', async ({ page }) => {
    const state = await openApp(page, '/');
    await showTab(page, 'team');
    const headers = await page.locator('#limitsBody').locator('xpath=ancestor::table[1]').locator('thead th').allInnerTexts();
    expect(headers).toEqual(['QB', 'RB', 'WR', 'TE', 'FLX', 'SFLX', 'K', 'DEF', 'TOT']);
    // A fresh page's default limits (js/mds/state.js): QB 1, RB 2, WR 3, TE 1, FLEX 1, SFLEX 0, K 1, DEF 1, 15 total.
    await expect(page.locator('#limitsBody td')).toHaveText(['0 / 1', '0 / 2', '0 / 3', '0 / 1', '0 / 1', '0 / 0', '0 / 1', '0 / 1', '0 / 15']);
    await expectClean(page, state);
});
