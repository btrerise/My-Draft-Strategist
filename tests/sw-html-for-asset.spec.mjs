// Owner's bug report after A1 deployed (2026-11-03): on a phone, js/shared/analytics.js was answered with the
// home page's HTML, and kept being, through reloads, until the app's cache was cleared. Cloudflare Pages has no
// 404.html here, so it answers any path it doesn't have yet (a new file requested mid-deploy) with index.html and
// status 200; Cloudflare's default Browser Cache TTL (4 hours on the Free plan) then keeps that in the browser's
// HTTP cache, and the service worker's stale-while-revalidate stored it as the script and served it on every load.
//
// The service worker must never store, or serve, an HTML page as a script or stylesheet.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { preparePage, expectClean } from './helpers.mjs';

test.use({ serviceWorkers: 'allow' });

const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

async function cachedType(page, path) {
    return page.evaluate(async (p) => {
        for (const name of await caches.keys()) {
            const res = await (await caches.open(name)).match(p);
            if (res) return { type: res.headers.get('content-type'), start: (await res.text()).slice(0, 40) };
        }
        return null;
    }, path);
}

test('a script answered with an HTML page (Pages\' fallback) is never cached or served as the script', async ({ page }) => {
    const state = await preparePage(page);
    await page.goto('/t-score/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // now controlled by the service worker
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    expect((await cachedType(page, '/js/shared/analytics.js')).start).toContain('// --- VISITOR COUNTS');

    // From now on the network answers the script with the home page, as Pages does for a path it doesn't have.
    await page.context().route(/\/js\/shared\/analytics\.js$/, (route) =>
        route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX }));

    for (let i = 0; i < 3; i++) {
        await page.reload();
        await page.waitForLoadState('networkidle');
    }
    // The cached copy is still the script, and the page still ran it (its link text is set by the script).
    expect((await cachedType(page, '/js/shared/analytics.js')).start).toContain('// --- VISITOR COUNTS');
    await expect(page.locator('a[data-nocount-link]')).toHaveAttribute('href', '?nocount=1');
    await expectClean(page, state);
});

test('a stylesheet answered with HTML is not cached either', async ({ page }) => {
    const state = await preparePage(page);
    await page.goto('/t-score/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.context().route(/\/css\/tscore\.css$/, (route) =>
        route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX }));
    for (let i = 0; i < 2; i++) { await page.reload(); await page.waitForLoadState('networkidle'); }
    const cached = await cachedType(page, '/css/tscore.css');
    expect(cached.type).not.toContain('text/html');
    await expectClean(page, state);
});

test('a page served for a new file while the service worker installs (mid-deploy) is not kept', async ({ page }) => {
    await preparePage(page); // console errors expected: the first load itself gets the page as the script (MIME error)
    // From the start, as an edge still on the previous deploy would: the new file comes back as the home page.
    await page.context().route(/\/js\/shared\/analytics\.js$/, (route) =>
        route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX }));
    await page.goto('/t-score/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForLoadState('networkidle');
    expect(await cachedType(page, '/js/shared/analytics.js')).toBeNull();
    // Everything else was precached as usual.
    expect((await cachedType(page, '/js/shared/storage/keys.js')).type).toContain('javascript');

    // Once the real file is there, the next loads pick it up and cache it.
    await page.context().unroute(/\/js\/shared\/analytics\.js$/);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect((await cachedType(page, '/js/shared/analytics.js')).start).toContain('// --- VISITOR COUNTS');
    // That optional script failing never shows the fatal banner (boot.js, data-optional).
    await expect(page.locator('#mds-boot-error')).toHaveCount(0);
});
