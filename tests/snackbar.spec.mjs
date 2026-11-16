// Toasts as Material 3's snackbar (improvements M18; css/base.css, TOAST NOTIFICATIONS; js/shared/ui/toast.js):
// centred at the bottom, over the page and clear of the rail, above the tab bar on phones; never over a dialog (one
// that arrives while a dialog is open waits for it to close); an error stays until ✕; a success toast's time grows
// with its length (4s, plus 1s per 40 characters, at most 8s).
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

const toastApi = (page, fn, ...args) => page.evaluate(async ([fn, args]) => {
    const t = await import('/js/shared/ui/toast.js');
    return t[fn](...args);
}, [fn, args]);
const box = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, bottom: r.bottom }; });

test.describe('Toasts as snackbars', () => {
    test('centred over the page, clear of the rail on computers and above the tab bar on phones', async ({ page }, info) => {
        await openApp(page, '/lineup/');
        await toastApi(page, 'showToast', 'Saved');
        const toast = page.locator('#mds-toast.show');
        await expect(toast).toBeVisible();
        await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))));
        const t = await box(toast);
        const vw = page.viewportSize().width;
        const rail = info.project.name === 'desktop' ? 96 : 0;
        expect(Math.abs(t.x + t.w / 2 - (rail + (vw - rail) / 2))).toBeLessThanOrEqual(1);
        if (info.project.name === 'phone') {
            const bar = await box(page.locator('.nav-bar'));
            expect(t.bottom).toBeLessThanOrEqual(bar.y);
        }
    });

    test('a toast that arrives while a dialog is open waits until it closes, and never sits above one', async ({ page }) => {
        await openApp(page, '/lineup/');
        await page.evaluate(async () => {
            const { showConfirm } = await import('/js/shared/ui/confirm.js');
            window.__answer = showConfirm('Delete it?', { confirmText: 'Delete' });
        });
        await expect(page.locator('#mds-confirm-overlay')).toBeVisible();
        await toastApi(page, 'showToast', 'Synced');
        await page.waitForTimeout(600);
        await expect(page.locator('#mds-toast.show')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.locator('#mds-confirm-overlay')).toBeHidden();
        await expect(page.locator('#mds-toast.show .toast-message')).toHaveText('Synced');
        // Stacked under dialogs and sheets (2000), so one that opens later covers the toast.
        expect(Number(await page.locator('#mds-toast').evaluate((el) => getComputedStyle(el).zIndex))).toBeLessThan(2000);
    });

    test('an error stays until ✕; a success toast is timed by its length', async ({ page }) => {
        await openApp(page, '/lineup/');
        await toastApi(page, 'showToast', 'Could not sync', { isError: true });
        const toast = page.locator('#mds-toast');
        await expect(toast).toHaveClass(/show/);
        expect(await toast.evaluate((el) => ({ timer: el.hideTimeout ?? null, left: el.toastRemaining }))).toEqual({ timer: null, left: Infinity });
        await toast.locator('.toast-dismiss-btn').click();
        await expect(toast).not.toHaveClass(/show/);

        for (const [len, ms] of [[10, 4000], [85, 6000], [400, 8000]]) {
            await toastApi(page, 'showToast', 'x'.repeat(len));
            expect(await toast.evaluate((el) => el.toastRemaining)).toBe(ms);
        }
    });

    test('it grows in from its bottom edge, and only fades with Reduce Motion', async ({ page }) => {
        await openApp(page, '/lineup/');
        await toastApi(page, 'showToast', 'Saved');
        const toast = page.locator('#mds-toast');
        const style = () => toast.evaluate((el) => { const cs = getComputedStyle(el); return { origin: cs.transformOrigin.split(' ')[1], prop: cs.transitionProperty, z: cs.zIndex }; });
        const s = await style();
        expect(s.prop).toContain('scale');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        expect((await style()).prop).not.toContain('scale');
    });
});
