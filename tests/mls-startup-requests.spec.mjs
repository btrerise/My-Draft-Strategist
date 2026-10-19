// Lineup Strategist asks Sleeper for the NFL week (and then ESPN for that week's kickoff times) only once the page has
// painted (improvements S17, owner's choice): on a first visit those requests competed with the stylesheets and the logo
// on a slow phone. Start-up runs at the load event, and the request now waits for frames to be drawn after it (before,
// it went out from the load handler itself). It still happens on every load, so the week still arrives.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean } from './helpers.mjs';

test('the NFL week is fetched after the page has painted, and still arrives', async ({ page }) => {
    // Counts the frames drawn since the load event, and notes the count when the request for the NFL week goes out.
    await page.addInitScript(() => {
        window.__framesAfterLoad = 0;
        window.addEventListener('load', () => {
            const tick = () => { window.__framesAfterLoad++; requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
        });
        const realFetch = window.fetch;
        window.fetch = function (input, ...rest) {
            const url = typeof input === 'string' ? input : input.url;
            if (url.includes('/v1/state/nfl') && window.__nflStateAtFrame === undefined) window.__nflStateAtFrame = window.__framesAfterLoad;
            return realFetch.call(this, input, ...rest);
        };
    });
    const state = await preparePage(page);
    await page.goto('/lineup/');
    await page.waitForFunction(() => window.__nflStateAtFrame !== undefined);
    expect(await page.evaluate(() => window.__nflStateAtFrame)).toBeGreaterThanOrEqual(1);
    await expect.poll(() => page.evaluate(async () => (await import('/js/mls/state.js')).State.currentNflWeek)).toBe(2);
    await expectClean(page, state);
});
