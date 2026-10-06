// Draft Strategist headshots fall back to initials (improvements F3, round 2, the owner's request). The Draft
// Board's thumbnails and the Team tab's roster avatars used to hide themselves when the photo failed, leaving
// nothing (the board) or an empty circle's gap (the Team tab). They now work like Lineup Strategist's
// (mls-headshots.spec.mjs): a circle of initials with the photo on top, which removes itself if it fails.
//
// The real CDN is blocked in tests (helpers.mjs aborts it); this spec serves its own images for it.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds } from './helpers.mjs';

// playwright-core's PNG codec, as tools/pxdiff.mjs loads it (its package.json doesn't export the path).
const { PNG } = createRequire(import.meta.url)(fileURLToPath(new URL('./node_modules/playwright-core/lib/utilsBundle.js', import.meta.url)));

// A cutout-style photo: transparent in its top two thirds, where the initials sit, opaque below.
function partlyTransparentPng() {
    const size = 64;
    const png = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            png.data[i] = 200; png.data[i + 1] = 60; png.data[i + 2] = 40; png.data[i + 3] = y >= (size * 2) / 3 ? 255 : 0;
        }
    }
    return PNG.sync.write(png);
}

// seedMds drafts Chase and Gibbs to my team, Robinson, Jefferson and Lamb to others.
const CHASE = '4866'; // photo served: partly transparent
// Every other photo 404s.

// Two screenshots of the middle of the avatar (where the initials sit; the anti-aliased rim can vary between
// shots), with its initials as rendered and with them hidden. Different means the letters can be seen.
async function initialsVisible(avatar) {
    const initials = avatar.locator('.mds-headshot-initials');
    const box = await avatar.boundingBox();
    const inset = box.width * 0.2;
    const clip = { x: box.x + inset, y: box.y + inset, width: box.width - 2 * inset, height: box.height - 2 * inset };
    const asRendered = await avatar.page().screenshot({ clip, animations: 'disabled' });
    await initials.evaluate((el) => { el.style.visibility = 'hidden'; });
    const withoutLetters = await avatar.page().screenshot({ clip, animations: 'disabled' });
    await initials.evaluate((el) => { el.style.visibility = ''; });
    return !asRendered.equals(withoutLetters);
}

async function expectInitialsOnly(avatar, letters) {
    await expect(avatar).toHaveCount(1);
    await expect(avatar.locator('img')).toHaveCount(0);
    await expect(avatar.locator('.mds-headshot-initials')).toHaveText(letters);
    await avatar.scrollIntoViewIfNeeded();
    await expect(avatar.locator('.mds-headshot-initials')).toBeVisible();
    expect(await initialsVisible(avatar), `${letters} shows when there's no photo`).toBe(true);
}

async function expectPhotoCoversInitials(avatar, letters) {
    await expect(avatar).toHaveCount(1);
    await avatar.scrollIntoViewIfNeeded();
    await expect.poll(() => avatar.locator('img').evaluate((img) => img.complete && img.naturalWidth)).toBe(64);
    await expect(avatar.locator('.mds-headshot-initials')).toHaveText(letters);
    expect(await initialsVisible(avatar), `${letters} shows through the photo`).toBe(false);
}

test.describe('MDS headshots', () => {
    test('a failed photo shows initials on the board and the Team tab; a loaded one hides them', async ({ page }) => {
        const state = await openApp(page, '/');
        // Registered after helpers.mjs's catch-all, so it runs first for the CDN.
        const photo = partlyTransparentPng();
        await page.route(/^https:\/\/sleepercdn\.com\/content\/nfl\/players\/thumb\//, (route) => {
            const id = new URL(route.request().url()).pathname.match(/\/thumb\/([^/]+)\.jpg$/)?.[1];
            if (id === CHASE) return route.fulfill({ status: 200, contentType: 'image/png', body: photo });
            return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
        });
        await seedMds(page);

        await showTab(page, 'board');
        const cell = (name) => page.locator('#boardTab .draft-cell.picked').filter({ hasText: name }).locator('.mds-headshot');
        await expectInitialsOnly(cell('Jahmyr Gibbs'), 'JG');
        await expectInitialsOnly(cell('Bijan Robinson'), 'BR');
        await expectPhotoCoversInitials(cell("Ja'Marr Chase"), 'JC');

        // Show Player Headshots off: the whole circle goes, initials included, as the photos did before.
        await page.locator('#toggleHeadshots').evaluate((el) => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await expect(cell('Jahmyr Gibbs')).toBeHidden();
        await expect(cell("Ja'Marr Chase")).toBeHidden();
        await page.locator('#toggleHeadshots').evaluate((el) => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
        await expect(cell('Jahmyr Gibbs')).toBeVisible();

        await showTab(page, 'team');
        const slot = (name) => page.locator('#teamTab .roster-slot').filter({ hasText: name }).locator('.mds-headshot');
        await expectInitialsOnly(slot('Jahmyr Gibbs'), 'JG');
        await expectPhotoCoversInitials(slot("Ja'Marr Chase"), 'JC');
        // Empty slots keep their blank spacer.
        await expect(page.locator('#teamTab .roster-slot.empty .mds-headshot')).toHaveCount(0);
        await expect(page.locator('#teamTab .roster-slot.empty .roster-avatar.placeholder').first()).toBeAttached();

        await expectClean(page, state);
    });
});
