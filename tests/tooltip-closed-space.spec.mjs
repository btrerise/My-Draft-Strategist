// A closed tooltip takes no room on the page (improvements F16; found in S28's checks). Closed tooltips used to be
// visibility: hidden but still laid out (absolutely positioned under their trigger), so a long one hung below a short
// page and added empty scroll: the pre-kickoff Scoreboard ended well below its last card. Each page and tab is measured
// as it is, then again with every tooltip removed from layout; the two must match. Tooltips still open on a tap, a
// hover and keyboard focus, fade in, and give screen readers their text.
import { test, expect } from '@playwright/test';
import {
    openApp, expectClean, showTab, showTScoreTab, seedMds, seedMls,
    MDS_TABS, MLS_TABS, TSCORE_TABS,
} from './helpers.mjs';

const at375 = (page) => test.info().project.name === 'phone' ? page.setViewportSize({ width: 375, height: 844 }) : null;

// The page's scroll size, then the same with every tooltip out of layout. Returns the differences.
async function extraRoom(page, where) {
    return page.evaluate(async (where) => {
        const frame = () => new Promise(r => requestAnimationFrame(() => r()));
        await frame(); await frame();
        const size = () => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth });
        const withTips = size();
        const style = document.createElement('style');
        style.textContent = '.tooltip-text { display: none !important; }';
        document.head.append(style);
        const without = size();
        style.remove();
        const out = [];
        if (withTips.h !== without.h) out.push(`${where}: ${withTips.h - without.h}px taller (${without.h} → ${withTips.h})`);
        if (withTips.w !== without.w) out.push(`${where}: ${withTips.w - without.w}px wider (${without.w} → ${withTips.w})`);
        return out;
    }, where);
}

test.describe('Closed tooltips take no room', () => {
    test('the pre-kickoff Scoreboard ends at its content', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scoreboard');
        await expect(page.locator('#thisWeekCard .mls-week-head .tooltip-text')).toBeAttached();
        expect(await extraRoom(page, 'scoreboard')).toEqual([]);
        await expectClean(page, state);
    });

    test('Lineup Strategist, every tab', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        const bad = [];
        for (const tab of MLS_TABS) { await showTab(page, tab); bad.push(...await extraRoom(page, tab)); }
        expect(bad).toEqual([]);
        await expectClean(page, state);
    });

    test('Draft Strategist, every tab', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/');
        await seedMds(page);
        const bad = [];
        for (const tab of MDS_TABS) { await showTab(page, tab); bad.push(...await extraRoom(page, tab)); }
        expect(bad).toEqual([]);
        await expectClean(page, state);
    });

    test('T-Score, every tab', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/t-score/');
        const bad = [];
        for (const tab of TSCORE_TABS) { await showTScoreTab(page, tab); bad.push(...await extraRoom(page, tab)); }
        expect(bad).toEqual([]);
        await expectClean(page, state);
    });
});

test.describe('Tooltips still open as before', () => {
    test('a tap opens it with its fade, placed on screen; a second tap closes it', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scoreboard');
        const icon = page.locator('#thisWeekCard .mls-week-head .tooltip-icon');
        const tip = page.locator('#thisWeekCard .mls-week-head .tooltip-text');
        await expect(tip).toBeHidden();
        // Screen readers get the text while it's closed (aria-describedby on the icon).
        await expect(icon).toHaveAccessibleDescription(/^Your matchup in every Sleeper league/);
        await icon.click();
        await expect(tip).toHaveClass(/\bmobile-visible\b/);
        // Placed after it opens (a long one opens wider), and it fades in rather than popping.
        await expect(tip).toHaveClass(/\btt-wide\b/);
        const fading = await tip.evaluate(t => t.getAnimations().some(a => a.transitionProperty === 'opacity'));
        expect(fading).toBe(true);
        await expect(tip).toBeVisible();
        await expect.poll(() => tip.evaluate(t => getComputedStyle(t).opacity)).toBe('1');
        const box = await tip.evaluate(t => { const r = t.getBoundingClientRect(); return { left: r.left, right: r.right, vw: document.documentElement.clientWidth }; });
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(box.vw);
        await icon.click();
        await expect(tip).not.toHaveClass(/\bmobile-visible\b/);
        await expect(tip).toBeHidden();
        await expectClean(page, state);
    });

    test('hover and keyboard focus open it, Escape closes it', async ({ page }) => {
        test.skip(test.info().project.name === 'phone', 'a mouse and a keyboard');
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scoreboard');
        const icon = page.locator('#thisWeekCard .mls-week-head .tooltip-icon');
        const tip = page.locator('#thisWeekCard .mls-week-head .tooltip-text');
        await icon.hover();
        await expect(tip).toBeVisible();
        // Placed as the hover starts: the long Scoreboard tip opens wider.
        await expect(tip).toHaveClass(/\btt-wide\b/);
        // Material 3 (round 2): it stays 1.5s after the mouse leaves, then fades.
        await page.mouse.move(0, 0);
        await page.waitForTimeout(900);
        await expect(tip).toBeVisible();
        await expect(tip).toHaveClass(/\btt-linger\b/);
        await expect(tip).toBeHidden({ timeout: 3000 });
        // Escape ends a linger at once.
        await icon.hover();
        await page.mouse.move(0, 0);
        await expect(tip).toHaveClass(/\btt-linger\b/);
        await page.keyboard.press('Escape');
        await expect(tip).not.toHaveClass(/\btt-linger\b/);
        await icon.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(icon).toBeFocused();
        await expect(tip).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(tip).toBeHidden();
        await expectClean(page, state);
    });

    test('one at a time: hovering another ends the first one\'s linger; a click ends it too', async ({ page }) => {
        test.skip(test.info().project.name === 'phone', 'a mouse');
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'lineup');
        const icons = page.locator('#lineupTab .tooltip-icon:visible');
        expect(await icons.count()).toBeGreaterThanOrEqual(2);
        const [a, b] = [icons.nth(0), icons.nth(1)];
        const tipA = a.locator('xpath=following-sibling::*[1]');
        const tipB = b.locator('xpath=following-sibling::*[1]');
        await a.hover();
        await expect(tipA).toBeVisible();
        await b.hover();
        await expect(tipB).toBeVisible();
        await expect(tipA).not.toHaveClass(/\btt-linger\b/);
        await expect(tipA).toBeHidden();
        await page.mouse.move(0, 0);
        await expect(tipB).toHaveClass(/\btt-linger\b/);
        await page.mouse.click(2, 300);
        await expect(tipB).not.toHaveClass(/\btt-linger\b/);
        await expect(tipB).toBeHidden();
        await expectClean(page, state);
    });

    // Material 3's rich tooltip (round 2): 12px corners; 12px top, 16px sides, 8px bottom; an opaque surface; a light shadow.
    test('looks like Material 3\'s rich tooltip', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scoreboard');
        const style = await page.locator('#thisWeekCard .mls-week-head .tooltip-text').evaluate(t => {
            const cs = getComputedStyle(t);
            return { radius: cs.borderRadius, pad: cs.padding, bg: cs.backgroundColor, blur: cs.backdropFilter };
        });
        expect(style).toEqual({ radius: '12px', pad: '12px 16px 8px', bg: 'rgb(15, 23, 42)', blur: 'none' });
        await expectClean(page, state);
    });

    // T-Score's column headers name a column in a few words: Material 3's plain tooltip (round 3), a light box with
    // dark text, 4px corners, no shadow. Hover opens it; it lingers 1.5s after the mouse leaves.
    test('T-Score\'s column headers: Material 3\'s plain tooltip', async ({ page }) => {
        test.skip(test.info().project.name === 'phone', 'a mouse');
        const state = await openApp(page, '/t-score/');
        await showTScoreTab(page, 'top50Tab');
        const head = page.locator('#top50Tab .table-header-tooltip').first();
        const tip = head.locator('.tooltip-text');
        await expect(tip).toBeHidden();
        await head.hover();
        await expect(tip).toBeVisible();
        const style = await tip.evaluate(t => {
            const cs = getComputedStyle(t);
            return { radius: cs.borderRadius, bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow, minH: cs.minHeight };
        });
        expect(style).toEqual({ radius: '4px', bg: 'rgb(229, 231, 235)', color: 'rgb(17, 24, 39)', shadow: 'none', minH: '24px' });
        await page.mouse.move(0, 0);
        await expect(tip).toHaveClass(/\btt-linger\b/);
        await expect(tip).toBeHidden({ timeout: 3000 });
        await expectClean(page, state);
    });

    // Round 4: T-Score's column headers open on a tap and from the keyboard, not just a mouse's hover. Every header on
    // every tab, tapped in turn: its tooltip shows, sits inside the window and inside its table's scroll box (which
    // would cut it off), and screen readers get its text.
    test('T-Score\'s column headers open on a tap, inside the window and their table', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/t-score/');
        const bad = [];
        let tapped = 0;
        for (const tab of TSCORE_TABS) {
            await showTScoreTab(page, tab);
            const heads = page.locator(`#${tab} .table-header-tooltip`);
            for (let i = 0; i < await heads.count(); i++) {
                const head = heads.nth(i);
                if (!(await head.isVisible())) continue;
                await head.scrollIntoViewIfNeeded();
                await head.click();
                const tip = head.locator('.tooltip-text');
                await expect(tip).toBeVisible();
                tapped++;
                const r = await tip.evaluate(t => {
                    const b = t.getBoundingClientRect(), w = t.closest('.data-table-wrapper')?.getBoundingClientRect();
                    return { l: b.left, r: b.right, vw: document.documentElement.clientWidth, wl: w?.left, wr: w?.right, wb: w?.bottom, b: b.bottom, text: t.textContent.trim().slice(0, 30) };
                });
                if (r.l < -0.5 || r.r > r.vw + 0.5) bad.push(`${tab}: off screen ${Math.round(r.l)}..${Math.round(r.r)}: ${r.text}`);
                if (r.wl !== undefined && (r.l < r.wl - 0.5 || r.r > r.wr + 0.5 || r.b > r.wb + 0.5)) bad.push(`${tab}: cut off by its table: ${r.text}`);
                await expect(head).toHaveAccessibleDescription(r.text.length ? new RegExp('^' + r.text.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : /./);
                await head.click();
                await expect(tip).toBeHidden();
            }
        }
        expect(tapped).toBeGreaterThan(20);
        expect(bad).toEqual([]);
        await expectClean(page, state);
    });

    test('T-Score\'s column headers: Tab shows one, Escape hides it', async ({ page }) => {
        test.skip(test.info().project.name === 'phone', 'a keyboard');
        const state = await openApp(page, '/t-score/');
        await showTScoreTab(page, 'top50Tab');
        const head = page.locator('#top50Tab .table-header-tooltip').first();
        await head.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(head).toBeFocused();
        await expect(head).toHaveAttribute('role', 'button');
        await expect(head.locator('.tooltip-text')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(head.locator('.tooltip-text')).toBeHidden();
        await page.keyboard.press('Enter');
        await expect(head.locator('.tooltip-text')).toBeVisible();
        await expectClean(page, state);
    });
});
