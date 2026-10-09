// Manual locks last one NFL week (improvements S11, round 5; clearLocksForNewWeek in js/mls/render/lineup.js).
// When Sleeper's NFL state reports a week other than the one recorded in mls_locks_week, every league's manual
// locks clear (game-time auto-locks are separate) and a toast says how many. The first time, with no week
// recorded, it only records the week. The Sleeper fixture is 2026 week 2.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls } from './helpers.mjs';

const lockBadges = (page) => page.locator('#optimalLineupContainer .mls-lock-badge');

async function lockAllen(page) {
    await showTab(page, 'lineup');
    await page.locator('#optimalLineupContainer [data-action="toggleLock"][aria-label="Lock Josh Allen"]').click();
    await expect(lockBadges(page)).toHaveCount(1);
}

const stored = (page) => page.evaluate(() => ({ week: localStorage.getItem('mls_locks_week'), locks: JSON.parse(localStorage.getItem('mls_locks_map') || '{}') }));
const lockCount = (locks) => Object.values(locks).reduce((n, ids) => n + ids.length, 0);

test.describe('Locks last one NFL week', () => {
    test('a new week clears last week\'s locks, with a toast', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await lockAllen(page);
        expect((await stored(page)).week).toBe('2026-2');

        // As if the lock had been set in week 1.
        await page.evaluate(() => localStorage.setItem('mls_locks_week', '2026-1'));
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.toast-message').filter({ hasText: 'New NFL week: cleared 1 lock from last week.' })).toBeVisible();
        const after = await stored(page);
        expect(after.week).toBe('2026-2');
        expect(lockCount(after.locks)).toBe(0);
        await showTab(page, 'lineup');
        await expect(lockBadges(page)).toHaveCount(0);
        await expect(page.locator('#optimalLineupContainer [data-action="toggleLock"][aria-label="Lock Josh Allen"]')).toHaveAttribute('aria-pressed', 'false');
        await expectClean(page, state);
    });

    test('the same week, or the first time (no week recorded yet), keeps them', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await lockAllen(page);

        await page.reload();
        await page.waitForLoadState('networkidle');
        expect(lockCount((await stored(page)).locks)).toBe(1);
        // The padlock and LOCKED badge survive the reload (the lock saves the lineup too since round 6; before,
        // the row read unlocked until the next recompute).
        await showTab(page, 'lineup');
        await expect(lockBadges(page)).toHaveCount(1);

        await page.evaluate(() => localStorage.removeItem('mls_locks_week'));
        await page.reload();
        await page.waitForLoadState('networkidle');
        const after = await stored(page);
        expect(after.week).toBe('2026-2');
        expect(lockCount(after.locks)).toBe(1);
        await expect(page.locator('.toast-message').filter({ hasText: 'New NFL week' })).toHaveCount(0);
        await expectClean(page, state);
    });
});
