// The tab bar's three layouts (improvements S26, Material 3's window sizes): the bottom bar on phones (under 600px),
// the bottom bar with each icon beside its label on tablets (600-839px), and a navigation rail at the left edge on
// computers (840px and up), whose menu button opens the drawer as the expanded rail. One set of buttons, laid out by
// CSS. Checked in both apps at 375, 600, 700, 840, 1024 and 1280px: which layout the bar has, every tab switching from it, the marker
// by the active tab, and nothing running past the window's edge (or under the rail); then the 839/840 boundary, the
// expanded rail, the keyboard, and Reduce Motion.
import { test, expect } from '@playwright/test';
import { openApp, seedMds, seedMls, loadMlsRankings, transitionsDone, showTab } from './helpers.mjs';

const RAIL_W = 96;

const APPS = [
    { name: 'Draft Strategist', path: '/', tabs: ['setup', 'tracker', 'team', 'board'], seed: seedMds },
    { name: 'Lineup Strategist', path: '/lineup/', tabs: ['setup', 'roster', 'lineup', 'scoreboard', 'scout'],
        seed: async (page) => { await seedMls(page); await loadMlsRankings(page); } },
];

// Each width runs in the desktop project only (it sets its own viewport); the phone project's touch adds nothing here.
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop', 'sets its own widths'));

// Where the bar is and how it's laid out.
const barLayout = (page) => page.evaluate(() => {
    const bar = document.querySelector('.nav-bar');
    const r = bar.getBoundingClientRect();
    const btn = bar.querySelector('.nav-btn');
    const menu = bar.querySelector('.nav-rail-menu');
    const headerMenu = document.querySelector('.header .hamburger-btn');
    return {
        left: r.left, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
        winW: innerWidth, winH: innerHeight,
        barDir: getComputedStyle(bar).flexDirection,
        btnDir: getComputedStyle(btn).flexDirection,
        railMenu: !!menu && menu.offsetParent !== null,
        headerMenu: !!headerMenu && headerMenu.offsetParent !== null,
        // A label cut or squeezed (Material 3: never truncate or shrink them).
        cutLabels: [...bar.querySelectorAll('.nav-btn span')].filter(s => s.scrollWidth > s.clientWidth + 0.5).map(s => s.textContent),
        fontSizes: [...new Set([...bar.querySelectorAll('.nav-btn')].map(b => getComputedStyle(b).fontSize))],
    };
});

function expectLayout(l, kind) {
    if (kind === 'rail') {
        expect(l.barDir).toBe('column');
        expect(l.left).toBe(0);
        expect(l.top).toBe(0);
        expect(l.width).toBe(RAIL_W);
        expect(l.height).toBe(l.winH);
        expect(l.railMenu, 'the rail has the menu button').toBe(true);
        expect(l.headerMenu, 'the header\'s menu button hides beside the rail').toBe(false);
    } else {
        expect(l.barDir).toBe('row');
        expect(l.left).toBe(0);
        expect(l.width).toBe(l.winW);
        expect(l.bottom).toBe(l.winH);
        expect(l.btnDir).toBe(kind === 'tablet' ? 'row' : 'column');
        expect(l.railMenu).toBe(false);
        expect(l.headerMenu).toBe(true);
    }
    expect(l.cutLabels).toEqual([]);
    expect(l.fontSizes).toEqual(['12px']);
}

// The marker's middle sits by the active tab's middle: along the bar (its x), or down the rail (its y, at the
// rail's left edge). It slides there, so this waits.
async function expectMarkerBy(page, tab, kind) {
    await expect.poll(() => page.evaluate(([t, vertical]) => {
        const marker = document.querySelector('.nav-bar .nav-marker');
        if (!marker || marker.hidden) return 'no marker';
        const m = marker.getBoundingClientRect();
        const b = document.querySelector(`.nav-bar .nav-btn[data-target="${t}"]`).getBoundingClientRect();
        if (vertical) {
            return m.height > 0 && m.width === 3 && m.left === 0 && Math.abs((m.top + m.height / 2) - (b.top + b.height / 2)) < 2
                ? 'ok' : JSON.stringify({ m, b });
        }
        return m.width > 0 && m.height === 3 && Math.abs((m.left + m.width / 2) - (b.left + b.width / 2)) < 2
            ? 'ok' : JSON.stringify({ m, b });
    }, [tab, kind === 'rail'])).toBe('ok');
}

// Anything in the header or the open tab that runs past the window's right edge, or (beside the rail) under it.
// Elements inside a container that scrolls or clips sideways are that container's business, so they're skipped.
const overflowing = (page, railW) => page.evaluate((minLeft) => {
    const clipsX = (el) => ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX);
    const out = [];
    const roots = [document.querySelector('.header'), document.querySelector('.tab-content.active')];
    for (const root of roots) {
        for (const el of [root, ...root.querySelectorAll('*')]) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
            let p = el.parentElement, clipped = false;
            while (p && p !== root.parentElement) { if (clipsX(p)) { clipped = true; break; } p = p.parentElement; }
            if (clipped) continue;
            if (r.right > innerWidth + 1 || r.left < minLeft - 1) {
                out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${Math.round(r.left)}-${Math.round(r.right)}`);
            }
        }
    }
    return { out: out.slice(0, 10), docW: document.documentElement.scrollWidth, winW: innerWidth };
}, railW);

for (const app of APPS) {
    test.describe(app.name, () => {
        for (const [width, kind] of [[375, 'phone'], [600, 'tablet'], [700, 'tablet'], [840, 'rail'], [1024, 'rail'], [1280, 'rail']]) {
            test(`${width}px: ${kind === 'rail' ? 'a navigation rail' : kind === 'tablet' ? 'icons beside labels' : 'the bottom bar'}; every tab switches from it, the marker follows, nothing runs past the edge`, async ({ page }) => {
                test.setTimeout(60_000);
                await page.setViewportSize({ width, height: 800 });
                const state = await openApp(page, app.path);
                await app.seed(page);
                await transitionsDone(page);
                expectLayout(await barLayout(page), kind);

                for (const tab of app.tabs) {
                    await page.locator(`.nav-bar .nav-btn[data-target="${tab}"]`).click();
                    await transitionsDone(page);
                    await expect(page.locator(`#${tab}Tab`)).toHaveClass(/\bactive\b/);
                    await expect(page.locator('.nav-bar .nav-btn[aria-current="page"]')).toHaveAttribute('data-target', tab);
                    await expectMarkerBy(page, tab, kind);
                    const o = await overflowing(page, kind === 'rail' ? RAIL_W : 0);
                    expect(o.out, `${tab}: past the edge${kind === 'rail' ? ' or under the rail' : ''}`).toEqual([]);
                    expect(o.docW, `${tab}: the page scrolls sideways`).toBeLessThanOrEqual(o.winW);
                }
                // The Guide isn't in the bar (it's in the menu) but is a tab like the others.
                await showTab(page, 'guide');
                const o = await overflowing(page, kind === 'rail' ? RAIL_W : 0);
                expect(o.out, 'guide: past the edge').toEqual([]);
                expect(o.docW).toBeLessThanOrEqual(o.winW);
                expect(state.errors).toEqual([]);
            });
        }

        test('the rail starts at 840px (Material 3\'s expanded windows); 839px keeps the bar', async ({ page }) => {
            await page.setViewportSize({ width: 839, height: 800 });
            await openApp(page, app.path);
            expectLayout(await barLayout(page), 'tablet');
            await page.setViewportSize({ width: 840, height: 800 });
            await expect.poll(async () => (await barLayout(page)).barDir).toBe('column');
            expectLayout(await barLayout(page), 'rail');
            // The marker turns with the bar (the ResizeObserver re-measures it).
            await expectMarkerBy(page, 'setup', 'rail');
            // The header and the page start beside the rail.
            const left = await page.evaluate(() => [document.querySelector('.header'), document.querySelector('main')].map(e => e.getBoundingClientRect().left));
            expect(left).toEqual([RAIL_W, RAIL_W]);
        });

        test('the rail\'s menu button opens the expanded rail; choosing a tab or Escape closes it', async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 800 });
            await openApp(page, app.path);
            const menuBtn = page.locator('.nav-bar .nav-rail-menu');
            const drawer = page.locator('.hamburger-menu');
            await menuBtn.click();
            await expect(drawer).toHaveClass(/\bopen\b/);
            await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
            // The current tab is marked, the secondary destinations sit under "More", and the collapse button is where
            // the menu button was.
            await expect(drawer.locator('.nav-btn[aria-current="page"]')).toHaveAttribute('data-tab', 'setup');
            await expect(drawer.locator('.menu-section-label')).toBeVisible();
            await expect(drawer.locator('.nav-btn[data-tab="guide"]')).toBeVisible();
            await expect(drawer.locator('a[href*="t-score"]')).toBeVisible();
            await expect(drawer.locator('.close-menu-btn .icon-collapse')).toBeVisible();
            await expect(drawer.locator('.close-menu-btn .icon-close')).toBeHidden();
            await expect.poll(() => drawer.evaluate(d => Math.round(d.getBoundingClientRect().left))).toBe(0);
            const [a, b] = await page.evaluate(() => [document.querySelector('.nav-rail-menu'), document.querySelector('.hamburger-menu .close-menu-btn')]
                .map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }));
            expect(b).toEqual(a);

            // Choosing a tab closes it and switches.
            const second = app.tabs[1];
            await drawer.locator(`.nav-btn[data-tab="${second}"]`).click();
            await expect(drawer).not.toHaveClass(/\bopen\b/);
            await transitionsDone(page);
            await expect(page.locator(`#${second}Tab`)).toHaveClass(/\bactive\b/);

            // Escape closes it and gives focus back to the rail's menu button.
            await menuBtn.focus();
            await page.keyboard.press('Enter');
            await expect(drawer).toHaveClass(/\bopen\b/);
            await page.keyboard.press('Escape');
            await expect(drawer).not.toHaveClass(/\bopen\b/);
            await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
            await expect(menuBtn).toBeFocused();
        });

        test('keyboard: the rail comes before the page in reading order; Tab moves between items, Enter and Space select', async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 800 });
            await openApp(page, app.path);
            // Reading order: the header, then the rail, then the page.
            const order = await page.evaluate(() => {
                const pos = (sel) => document.querySelector(sel);
                const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
                return [follows(pos('.header'), pos('.nav-bar')), follows(pos('.nav-bar'), pos('main'))];
            });
            expect(order).toEqual([true, true]);

            await page.locator('.nav-bar .nav-rail-menu').focus();
            await page.keyboard.press('Tab');
            await expect(page.locator(`.nav-bar .nav-btn[data-target="${app.tabs[0]}"]`)).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(page.locator(`.nav-bar .nav-btn[data-target="${app.tabs[1]}"]`)).toBeFocused();
            await page.keyboard.press('Enter');
            await transitionsDone(page);
            await expect(page.locator(`#${app.tabs[1]}Tab`)).toHaveClass(/\bactive\b/);
            await page.locator(`.nav-bar .nav-btn[data-target="${app.tabs[2]}"]`).focus();
            await page.keyboard.press('Space');
            await transitionsDone(page);
            await expect(page.locator(`#${app.tabs[2]}Tab`)).toHaveClass(/\bactive\b/);
            await expectMarkerBy(page, app.tabs[2], 'rail');
        });

        test('Reduce Motion: the marker on the rail moves without sliding', async ({ page }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.setViewportSize({ width: 1280, height: 800 });
            await openApp(page, app.path);
            await page.locator(`.nav-bar .nav-btn[data-target="${app.tabs[1]}"]`).click();
            await expectMarkerBy(page, app.tabs[1], 'rail');
            expect(await page.locator('.nav-bar .nav-marker').evaluate(m => getComputedStyle(m).transitionDuration)).toBe('0s');
        });
    });
}
