// The site's font, Outfit, is self-hosted (improvements S17): fonts/outfit-latin.woff2 and fonts/outfit-latin-ext.woff2,
// declared in css/base.css and preloaded in each page's <head>, in place of Google Fonts' stylesheet, which held up the
// first paint. The other specs block the font so their screenshots keep the fallback fonts; this one lets it load.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean } from './helpers.mjs';

for (const path of ['/', '/lineup/', '/t-score/']) {
    test(`${path} draws its text in the self-hosted Outfit, with nothing from Google Fonts`, async ({ page }) => {
        const state = await preparePage(page);
        await page.unroute(/^http:\/\/localhost(:\d+)?\/fonts\/[^/]+\.woff2$/);
        const google = [];
        page.on('request', (req) => { if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) google.push(req.url()); });
        const fontResponses = [];
        page.on('response', (res) => { if (res.url().includes('/fonts/')) fontResponses.push(res); });

        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectClean(page, state);

        // The preload names a file that exists, and the font that loaded is that file.
        const preload = page.locator('link[rel="preload"][as="font"]');
        await expect(preload).toHaveCount(1);
        expect(await preload.getAttribute('href')).toMatch(/fonts\/outfit-latin\.woff2$/);
        expect(fontResponses.length).toBeGreaterThan(0);
        for (const res of fontResponses) {
            expect(res.status()).toBe(200);
            expect(res.headers()['content-type']).toBe('font/woff2');
        }

        // Every weight the site uses comes from it, not the fallback.
        const loaded = await page.evaluate(async () => {
            await document.fonts.ready;
            return Promise.all(['400', '500', '600', '700'].map(async (w) => (await document.fonts.load(`${w} 16px Outfit`, 'Ab1')).length > 0));
        });
        expect(loaded).toEqual([true, true, true, true]);
        expect(google).toEqual([]);
    });
}

// A font that doesn't arrive (a flaky connection, a blocker) costs only the font: text stays in the fallback, and boot.js's
// "Something went wrong loading the app" banner, which a failed script or stylesheet raises, stays away. The font fails
// here only after the page has loaded, when boot.js is listening, so the check doesn't depend on timing.
test('a font that fails to load is not a fatal error', async ({ page }) => {
    const state = await preparePage(page);
    let release;
    const loaded = new Promise((r) => { release = r; });
    await page.route(/^http:\/\/localhost(:\d+)?\/fonts\/[^/]+\.woff2$/, async (route) => { await loaded; await route.abort(); });
    // The held font keeps the load event waiting, so only the parse is waited for (boot.js runs before it ends).
    await page.goto('/lineup/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.markAppReady === 'function');
    release();
    await page.waitForTimeout(500);
    await expectClean(page, state);
});
