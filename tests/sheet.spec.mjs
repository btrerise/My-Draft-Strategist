// The shared sheet (improvements M11; js/shared/ui/sheet.js), opened through the badge legend's link: a side sheet from
// the right from 840px, a bottom sheet below at half height. Modal (focus in and trapped), closed by its button,
// Escape, Back and the scrim; on phones also by a swipe down on the handle. Reduce Motion: nothing slides. The
// legend's content is tests/badge-legend.spec.mjs.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab } from './helpers.mjs';

const host = (page) => page.locator('.sheet-host');
const sheet = (page) => page.locator('.sheet');
const isPhone = (testInfo) => testInfo.project.name === 'phone';

async function open(page, testInfo, path = '/lineup/', tab = 'scout') {
    if (isPhone(testInfo)) await page.setViewportSize({ width: 375, height: 812 });
    const state = await openApp(page, path);
    await showTab(page, tab);
    const link = page.locator(`#${tab}Tab [data-action="openBadgeLegend"]`);
    await link.click();
    await expect(host(page)).toHaveClass(/\bis-open\b/);
    await expect(page.locator('.sheet-title')).toBeFocused();
    // Wait for the slide to finish, so positions are measured where it rests.
    await sheet(page).evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    return { state, link };
}

async function expectClosed(page, link, tab = 'scout') {
    await expect(host(page)).toHaveCount(0);
    await expect(link).toBeFocused();
    await expect(page.locator(`#${tab}Tab`)).toHaveClass(/\bactive\b/);
    await expect(page.locator('html')).not.toHaveClass(/\bsheet-open\b/);
}

test.describe('Shared sheet', () => {
    test('a side sheet on wide screens, a bottom sheet at half height on phones; a dialog with a title', async ({ page }, testInfo) => {
        const { state } = await open(page, testInfo);
        const box = await sheet(page).boundingBox();
        const vp = page.viewportSize();
        await expect(sheet(page)).toHaveAttribute('role', 'dialog');
        await expect(sheet(page)).toHaveAttribute('aria-modal', 'true');
        await expect(sheet(page)).toHaveAccessibleName('What the badges mean');
        if (isPhone(testInfo)) {
            expect(Math.round(box.y + box.height)).toBe(vp.height);
            expect(Math.abs(box.height - vp.height / 2)).toBeLessThan(2);
            expect(box.width).toBe(vp.width);
            await expect(page.locator('.sheet-handle')).toBeVisible();
        } else {
            expect(Math.round(box.x + box.width)).toBe(vp.width);
            expect(box.y).toBe(0);
            expect(Math.round(box.height)).toBe(vp.height);
            expect(box.width).toBeLessThanOrEqual(400);
            await expect(page.locator('.sheet-handle')).toBeHidden();
        }
        // The body scrolls inside the sheet; the page behind stays put.
        const scrolls = await page.locator('.sheet-body').evaluate(el => el.scrollHeight > el.clientHeight);
        expect(scrolls).toBe(true);
        await expectClean(page, state);
    });

    test('Tab stays inside the sheet', async ({ page }, testInfo) => {
        const { state } = await open(page, testInfo);
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            expect(await page.evaluate(() => !!document.activeElement.closest('.sheet'))).toBe(true);
        }
        await expectClean(page, state);
    });

    test('the close button, Escape, Back and the scrim close it; focus goes back to the link and the tab stays', async ({ page }, testInfo) => {
        let { state, link } = await open(page, testInfo);
        const url = page.url();
        await page.getByRole('button', { name: 'Close' }).click();
        await expectClosed(page, link);

        await link.click();
        await expect(host(page)).toHaveClass(/\bis-open\b/);
        await page.keyboard.press('Escape');
        await expectClosed(page, link);

        await link.click();
        await expect(host(page)).toHaveClass(/\bis-open\b/);
        await page.goBack();
        await expectClosed(page, link);
        expect(page.url()).toBe(url);

        await link.click();
        await expect(host(page)).toHaveClass(/\bis-open\b/);
        await page.mouse.click(20, 20); // the scrim, above a bottom sheet and left of a side sheet
        await expectClosed(page, link);

        // Closing took the sheet's history entry off each time: Back now leaves the Scout tab, as it would have.
        await page.goBack();
        await expect(page.locator('#scoutTab')).not.toHaveClass(/\bactive\b/);
        await expectClean(page, state);
    });

    test('phones: a swipe down on the handle closes it; dragging up or tapping the handle expands it', async ({ page }, testInfo) => {
        test.skip(!isPhone(testInfo), 'The drag handle is on the bottom sheet only');
        const { state, link } = await open(page, testInfo);
        const handle = page.locator('.sheet-handle');
        const drag = async (dy) => {
            await sheet(page).evaluate(el => Promise.all(el.getAnimations().map(a => a.finished))); // at rest first
            const b = await handle.boundingBox();
            const x = b.x + b.width / 2, y = b.y + b.height / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (dy * i) / 8);
            await page.mouse.up();
        };

        // A short drag springs back.
        await drag(30);
        await expect(host(page)).toHaveCount(1);
        await expect(sheet(page)).not.toHaveClass(/\bis-expanded\b/);

        // Up expands to nearly full height; tapping the handle goes back to half.
        await drag(-120);
        await expect(sheet(page)).toHaveClass(/\bis-expanded\b/);
        await expect(handle).toHaveAttribute('aria-expanded', 'true');
        await handle.click();
        await expect(sheet(page)).not.toHaveClass(/\bis-expanded\b/);

        // Down past a quarter of its height closes it.
        await drag(250);
        await expectClosed(page, link);
        await expectClean(page, state);
    });

    test('Reduce Motion: it appears and goes at once', async ({ page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const { state, link } = await open(page, testInfo);
        await expect(sheet(page)).toHaveCSS('transition-duration', '0s');
        await expect(page.locator('.sheet-scrim')).toHaveCSS('transition-duration', '0s');
        await page.keyboard.press('Escape');
        await expectClosed(page, link);
        await expectClean(page, state);
    });

    test('Draft Strategist uses the same sheet', async ({ page }, testInfo) => {
        const { state, link } = await open(page, testInfo, '/', 'tracker');
        await page.keyboard.press('Escape');
        await expectClosed(page, link, 'tracker');
        await expectClean(page, state);
    });
});
