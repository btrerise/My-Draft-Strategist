// Headshots hide the initials behind them (improvements F3). Each Lineup Strategist avatar is a circle of
// initials with the Sleeper photo layered on top (playerHeadshotHTML in js/mls/lineup/headshots.js). The photo
// had no background of its own, so the letters showed through wherever it was transparent, and while it was
// still loading. Now the photo paints the circle's background, and a failed photo still removes itself so the
// initials come back.
//
// The real CDN is blocked in tests (helpers.mjs aborts it); this spec serves its own images for it.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls } from './helpers.mjs';

// playwright-core's PNG codec, as tools/pxdiff.mjs loads it (its package.json doesn't export the path).
const { PNG } = createRequire(import.meta.url)(fileURLToPath(new URL('./node_modules/playwright-core/lib/utilsBundle.js', import.meta.url)));

// A cutout-style photo: transparent in its top two thirds, where the initials sit, opaque below.
function partlyTransparentPng() {
    const size = 64;
    const png = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const opaque = y >= (size * 2) / 3;
            png.data[i] = 200; png.data[i + 1] = 60; png.data[i + 2] = 40; png.data[i + 3] = opaque ? 255 : 0;
        }
    }
    return PNG.sync.write(png);
}

// mds_test's players in the fixture league (tests/fixtures/sleeper/make-fixtures.mjs).
const ALLEN = '4984';     // photo served: partly transparent
const JEFFERSON = '6794'; // photo 404s
const CHASE = '4866';     // photo held, so it stays loading

const avatarFor = (page, id) => page.locator('#rosterTab .mls-headshot').filter({
    has: page.locator(`img[src$="/thumb/${id}.jpg"]`),
});

// Two screenshots of the middle of the avatar (where the initials sit; the anti-aliased rim can vary between
// shots), with its initials as rendered and with them hidden. Different means the letters can be seen.
async function initialsVisible(avatar) {
    const initials = avatar.locator('.mls-headshot-initials');
    const box = await avatar.boundingBox();
    const inset = box.width * 0.2;
    const clip = { x: box.x + inset, y: box.y + inset, width: box.width - 2 * inset, height: box.height - 2 * inset };
    const asRendered = await avatar.page().screenshot({ clip, animations: 'disabled' });
    await initials.evaluate((el) => { el.style.visibility = 'hidden'; });
    const withoutLetters = await avatar.page().screenshot({ clip, animations: 'disabled' });
    await initials.evaluate((el) => { el.style.visibility = ''; });
    return !asRendered.equals(withoutLetters);
}

test.describe('MLS headshots', () => {
    test('a loaded photo hides the initials; a missing one shows them', async ({ page }, testInfo) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);

        const photo = partlyTransparentPng();
        let releaseHeld;
        const held = new Promise((resolve) => { releaseHeld = resolve; });
        // Registered after helpers.mjs's catch-all, so it runs first for the CDN.
        await page.route(/^https:\/\/sleepercdn\.com\/content\/nfl\/players\/thumb\//, async (route) => {
            const id = new URL(route.request().url()).pathname.match(/\/thumb\/([^/]+)\.jpg$/)?.[1];
            if (id === ALLEN) return route.fulfill({ status: 200, contentType: 'image/png', body: photo });
            if (id === JEFFERSON) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
            if (id === CHASE) { await held; return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }); }
            return route.abort();
        });

        await showTab(page, 'roster');

        // Loaded, partly transparent photo: no letters behind it.
        const allen = avatarFor(page, ALLEN);
        await expect(allen).toHaveCount(1);
        await allen.scrollIntoViewIfNeeded();
        await expect.poll(() => allen.locator('img').evaluate((img) => img.complete && img.naturalWidth)).toBe(64);
        await expect(allen.locator('.mls-headshot-initials')).toHaveText('JA');
        expect(await initialsVisible(allen), 'initials show through the transparent part of the photo').toBe(false);

        // The 28px phone size and the 32px desktop size both apply.
        const size = testInfo.project.name === 'phone' ? 28 : 32;
        expect(await allen.evaluate((el) => el.getBoundingClientRect().width)).toBe(size);

        // Still loading: the circle stays empty rather than flashing the letters first.
        const chase = avatarFor(page, CHASE);
        await expect(chase).toHaveCount(1);
        await chase.scrollIntoViewIfNeeded();
        expect(await chase.locator('img').evaluate((img) => img.complete)).toBe(false);
        expect(await initialsVisible(chase), 'initials show while the photo is loading').toBe(false);

        // A photo that fails to load removes itself, and the initials come back.
        releaseHeld();
        const chaseRow = page.locator('#rosterTab .mls-headshot').filter({ hasText: 'JC' });
        await expect(chaseRow.locator('img')).toHaveCount(0);
        await expect(chaseRow.locator('.mls-headshot-initials')).toBeVisible();

        // 404: no photo, initials showing.
        const jefferson = page.locator('#rosterTab .mls-headshot').filter({ hasText: 'JJ' });
        await expect(jefferson).toHaveCount(1);
        await expect(jefferson.locator('img')).toHaveCount(0);
        await jefferson.scrollIntoViewIfNeeded();
        await expect(jefferson.locator('.mls-headshot-initials')).toBeVisible();
        expect(await initialsVisible(jefferson), 'the 404 avatar shows its initials').toBe(true);

        // DEF rows: the team code, never a photo.
        const def = page.locator('#rosterTab .mls-headshot-def');
        await expect(def).toHaveCount(1);
        await expect(def).toHaveText('BAL');
        await expect(def.locator('img')).toHaveCount(0);

        await expectClean(page, state);
    });
});
