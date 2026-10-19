// The scroll-shadow cue on wide tables (js/shared/ui/scrollShadows.js): .has-scroll-shadow while there's more to the right,
// none once you've scrolled to the end. Since improvements S17 it's checked after the browser's own layout (a
// ResizeObserver) rather than at DOMContentLoaded and after every change, which forced a layout of the page before its
// first paint. That also catches a table that only gets a size when it's shown: Lineup Strategist's SoS grid sits in a
// folded <details> on the Roster tab, and opening it on a narrow screen now shows the cue.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab } from './helpers.mjs';

test('a wide table shows the scroll shadow until you reach its end, including one shown after load', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const state = await openApp(page, '/lineup/');
    await showTab(page, 'roster');
    const wrapper = page.locator('.sos-table-wrapper');
    await expect(wrapper).not.toHaveClass(/has-scroll-shadow/);  // folded: no size, nothing to scroll

    await page.locator('details:has(.sos-table-wrapper) > summary').click();
    await expect(wrapper).toBeVisible();
    expect(await wrapper.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(wrapper).toHaveClass(/has-scroll-shadow/);

    await wrapper.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(wrapper).not.toHaveClass(/has-scroll-shadow/);
    await wrapper.evaluate(el => { el.scrollLeft = 0; });
    await expect(wrapper).toHaveClass(/has-scroll-shadow/);

    // Wide enough for the whole grid: no cue.
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect.poll(() => wrapper.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await expect(wrapper).not.toHaveClass(/has-scroll-shadow/);
    await expectClean(page, state);
});
