// Visitor counts (improvements A1): js/shared/analytics.js adds Umami Cloud's script on the live site only, and a
// browser can opt out with ?nocount=1 (?nocount=0 undoes it).
//
// The live hostname is simulated: every request to https://mydraftstrategist.com/ is answered from the local test
// server (tests/serve.mjs), so the pages run exactly as served, under the production hostname. Umami's own script
// (cloud.umami.is) is aborted like every other outside request (helpers.mjs), so these tests also cover a blocked or
// offline script: nothing may log a console.error.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, openApp } from './helpers.mjs';

const UMAMI = 'https://cloud.umami.is/script.js';
const WEBSITE_ID = '9cf14075-37fe-4528-bd9c-a596c26c0671';
const PAGES = ['/', '/lineup/', '/t-score/'];

// Serves the repo under another origin. Registered after preparePage, so it wins over its catch-all abort.
async function serveAs(page, origin, baseURL) {
    const bad = [];
    await page.route((url) => url.origin === origin, async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: baseURL + url.pathname + url.search });
        if (response.status() >= 400) bad.push(`HTTP ${response.status()}: ${url.pathname}`);
        await route.fulfill({ response });
    });
    return bad;
}

async function openAs(page, origin, path, baseURL) {
    const state = await preparePage(page);
    const bad = await serveAs(page, origin, baseURL);
    const umamiRequests = [];
    page.on('request', (req) => { if (req.url().startsWith('https://cloud.umami.is/')) umamiRequests.push(req.url()); });
    await page.goto(origin + path);
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);
    expect(bad, 'local files missing').toEqual([]);
    return { state, umamiRequests };
}

const umamiTag = (page) => page.locator(`script[src="${UMAMI}"]`);
const toast = (page) => page.locator('#mds-toast .toast-message');
const optOut = (page) => page.evaluate(() => localStorage.getItem('shared_analytics_optout'));

for (const path of PAGES) {
    test(`${path} on mydraftstrategist.com adds Umami's script once, deferred, for this site only`, async ({ page, baseURL }) => {
        const { umamiRequests } = await openAs(page, 'https://mydraftstrategist.com', path, baseURL);
        await expect(umamiTag(page)).toHaveCount(1);
        const attrs = await umamiTag(page).evaluate((s) => ({
            defer: s.defer, id: s.dataset.websiteId, domains: s.dataset.domains,
            hash: s.dataset.excludeHash, search: s.dataset.excludeSearch,
        }));
        expect(attrs).toEqual({
            defer: true, id: WEBSITE_ID, domains: 'mydraftstrategist.com,www.mydraftstrategist.com',
            hash: 'true', search: 'true',
        });
        // The browser asked for it (and the test aborted it, which logged nothing: expectClean above).
        expect(umamiRequests).toEqual([UMAMI]);
    });

    test(`${path} never loads Umami on localhost or a branch preview`, async ({ page, baseURL }) => {
        const requests = [];
        page.on('request', (req) => { if (req.url().includes('umami')) requests.push(req.url()); });
        await openApp(page, path);
        await expect(umamiTag(page)).toHaveCount(0);

        const { umamiRequests } = await openAs(page, 'https://a1-test.my-draft-strategist.pages.dev', path, baseURL);
        await expect(umamiTag(page)).toHaveCount(0);
        expect([...requests, ...umamiRequests]).toEqual([]);
    });
}

test('?nocount=1 stops the count in this browser, on every page, until ?nocount=0', async ({ page, baseURL }) => {
    const site = 'https://mydraftstrategist.com';

    // Opt out: no script, a toast that says so, the key saved, and the parameter gone from the address bar
    // (other parameters and the hash kept).
    await openAs(page, site, '/t-score/?foo=bar&nocount=1#top50Tab', baseURL);
    await expect(umamiTag(page)).toHaveCount(0);
    await expect(toast(page)).toContainText("won't be counted");
    expect(await optOut(page)).toBe('1');
    expect(new URL(page.url()).search).toBe('?foo=bar');
    expect(new URL(page.url()).hash).toBe('#top50Tab');

    // It holds on the other pages, with no toast.
    for (const path of ['/', '/lineup/']) {
        const { umamiRequests } = await openAs(page, site, path, baseURL);
        await expect(umamiTag(page)).toHaveCount(0);
        expect(umamiRequests).toEqual([]);
    }

    // Opt back in: counted again, the key removed, a toast that says so.
    const { umamiRequests } = await openAs(page, site, '/?nocount=0', baseURL);
    await expect(umamiTag(page)).toHaveCount(1);
    expect(umamiRequests).toEqual([UMAMI]);
    await expect(toast(page)).toContainText('counted in the site');
    expect(await optOut(page)).toBeNull();
    expect(new URL(page.url()).search).toBe('');
});

test('the opt-out is in neither app\'s backup', async ({ page, baseURL }) => {
    await openAs(page, 'https://mydraftstrategist.com', '/?nocount=1', baseURL);
    const owned = await page.evaluate(async () => {
        const { isMdsOwnedKey, isMlsOwnedKey, KEYS } = await import('/js/shared/storage/keys.js');
        const k = KEYS.shared.analyticsOptOut;
        return { mds: isMdsOwnedKey(k), mls: isMlsOwnedKey(k), stored: localStorage.getItem(k) };
    });
    expect(owned).toEqual({ mds: false, mls: false, stored: '1' });
});
