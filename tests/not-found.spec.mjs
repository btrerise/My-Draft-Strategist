// The site's 404.html (improvements A1 follow-up). Cloudflare Pages serves it, with status 404, for any path the site
// doesn't have; before it existed, Pages answered every unknown path with the home page and status 200, and a phone
// that got that for a new script mid-deploy kept it as the script. tests/serve.mjs serves it the same way.
import { test, expect } from '@playwright/test';
import { preparePage } from './helpers.mjs';

test('an unknown address shows "Page not found" with links to the three pages', async ({ page }) => {
    await preparePage(page);
    const res = await page.goto('/no-such-page');
    expect(res.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    const links = page.locator('.nf-links a');
    await expect(links).toHaveCount(3);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['/', '/lineup/', '/t-score/']);
    // Its stylesheet and logo load from any depth (absolute URLs).
    const deep = await page.goto('/lineup/no/such/page');
    expect(deep.status()).toBe(404);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(10, 14, 23)');
    expect(await page.locator('.nf-logo').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator('.nf-links a', { hasText: 'My Lineup Strategist' }).click();
    await expect(page).toHaveURL(/\/lineup\/$/);
});

test('a missing script gets a real 404, not a page', async ({ request }) => {
    const res = await request.get('/js/shared/no-such-file.js');
    expect(res.status()).toBe(404);
});
