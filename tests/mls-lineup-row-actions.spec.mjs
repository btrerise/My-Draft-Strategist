// Lineup tab rows on a phone (improvements S24, round 14, the owner's idea): the projection, the swap button and the lock
// stack in a narrow column on the right, so a name like "Rhamondre Stevenson (11)" keeps the room to stay on one line.
// Side by side they took about 100px of a 375px screen. Wider screens keep them in a row.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings } from './helpers.mjs';

test('the projection, swap and lock stack on a phone and sit side by side on wider screens', async ({ page }) => {
    const phone = test.info().project.name === 'phone';
    if (phone) await page.setViewportSize({ width: 375, height: 844 });
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await showTab(page, 'lineup');
    const rows = page.locator('#lineupTab .lineup-slot').filter({ has: page.locator('.mls-pts') }).filter({ has: page.locator('.lock-btn') });
    await expect(rows.first()).toBeVisible();
    for (const row of (await rows.all()).slice(0, 4)) {
        const [pts, swap, lock, actions] = await Promise.all(['.mls-pts', '.swap-btn', '.lock-btn', '.mls-row-actions']
            .map(sel => row.locator(sel).first().boundingBox()));
        if (phone) {
            expect(swap.y).toBeGreaterThanOrEqual(pts.y + pts.height - 1);
            expect(lock.y).toBeGreaterThanOrEqual(swap.y + swap.height - 1);
            expect(actions.width).toBeLessThan(60);
            // One centre line (round 15): the projection, swap and lock share it.
            const mid = (b) => b.x + b.width / 2;
            expect(Math.abs(mid(swap) - mid(pts))).toBeLessThan(1.5);
            expect(Math.abs(mid(lock) - mid(swap))).toBeLessThan(1.5);
        } else {
            expect(Math.abs((swap.y + swap.height / 2) - (lock.y + lock.height / 2))).toBeLessThan(4);
            expect(swap.x).toBeGreaterThan(pts.x + pts.width - 1);
        }
    }
    await expectClean(page, state);
});
