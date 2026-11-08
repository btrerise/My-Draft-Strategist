// Link previews (improvements K3): what chat apps, Facebook, Slack, Discord and X read from each page's <head> when
// a link is shared. Each page has its own 1200x630 PNG (drawn by tests/tools/og-images.mjs, `npm run og-images`),
// its own og:url, and a title with no stray space. The PNGs aren't precached: only link crawlers fetch them.
import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://mydraftstrategist.com';

const PAGES = [
    { path: '/', image: 'og-draft-1.png', title: 'My Draft Strategist - Lineup & Draft Tools' },
    { path: '/lineup/', image: 'og-lineup-1.png', title: 'My Lineup Strategist | My Draft Strategist' },
    { path: '/t-score/', image: 'og-tscore-1.png', title: 'The T-Score Model | My Draft Strategist' },
];

// Width and height from a PNG's IHDR chunk.
function pngSize(file) {
    const b = readFileSync(file);
    expect(b.subarray(1, 4).toString('latin1'), `${file} is a PNG`).toBe('PNG');
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const meta = (page, attr, name) => page.locator(`head meta[${attr}="${name}"]`);

for (const { path, image, title } of PAGES) {
    test(`${path}: link-preview tags point at its own 1200x630 PNG`, async ({ page, request }) => {
        // The tags are in the served HTML itself (crawlers don't run scripts), so read them before any script runs.
        await page.route('**/*', (route) => (route.request().resourceType() === 'document' ? route.continue() : route.abort()));
        await page.goto(path);

        const prop = async (name) => {
            const el = meta(page, 'property', name);
            await expect(el, name).toHaveCount(1);
            return el.getAttribute('content');
        };
        const named = async (name) => {
            const el = meta(page, 'name', name);
            await expect(el, name).toHaveCount(1);
            return el.getAttribute('content');
        };

        expect(await prop('og:title')).toBe(title);
        expect(await prop('og:url')).toBe(SITE + path);
        expect(await prop('og:type')).toBe('website');
        expect(await prop('og:site_name')).toBe('My Draft Strategist');
        expect((await prop('og:description')).trim().length).toBeGreaterThan(20);
        const imageUrl = `${SITE}/images/${image}`;
        expect(await prop('og:image')).toBe(imageUrl);
        expect(await prop('og:image:type')).toBe('image/png');
        expect(await prop('og:image:width')).toBe('1200');
        expect(await prop('og:image:height')).toBe('630');
        const alt = await prop('og:image:alt');
        expect(alt.length).toBeGreaterThan(20);

        expect(await named('twitter:card')).toBe('summary_large_image');
        expect(await named('twitter:image')).toBe(imageUrl);
        expect(await named('twitter:image:alt')).toBe(alt);
        expect((await named('description')).trim().length).toBeGreaterThan(20);

        // No title or description starts or ends with a space (/lineup/'s og:title once did).
        for (const el of await page.locator('head meta[content]').all()) {
            const content = await el.getAttribute('content');
            expect(content, await el.evaluate((m) => m.outerHTML)).toBe(content.trim());
        }

        // The image is served from the site, as a PNG of the size the tags say, and small.
        const file = `${REPO}images/${image}`;
        expect(pngSize(file)).toEqual({ width: 1200, height: 630 });
        expect(statSync(file).size).toBeLessThan(100 * 1024);
        const res = await request.get(`/images/${image}`);
        expect(res.status()).toBe(200);
        expect(res.headers()['content-type']).toContain('image/png');
    });
}

test('the preview images are not precached (only link crawlers fetch them)', () => {
    const sw = readFileSync(`${REPO}sw.js`, 'utf8');
    expect(sw).not.toMatch(/og-(draft|lineup|tscore)/);
});
