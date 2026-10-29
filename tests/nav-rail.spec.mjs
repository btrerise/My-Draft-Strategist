// The tab bar's three layouts (improvements S26, Material 3's window sizes): the bottom bar on phones (under 600px),
// the bottom bar with each icon beside its label on tablets (600-839px), and a navigation rail at the left edge on
// computers (840px and up), whose menu button opens the drawer as the expanded rail. One set of buttons, laid out by
// CSS. Checked in both apps at 375, 600, 700, 840, 1024 and 1280px: which layout the bar has, every tab switching from it, the marker
// by the active tab, and nothing running past the window's edge (or under the rail); then the 839/840 boundary, the
// expanded rail, the keyboard, and Reduce Motion. Then what a Material 3 review of the rail added: arrow keys, Back
// closing the menu, labels kept whole at 2x text, Material 3's sizes, the expanded rail's icons where the rail's are,
// and the menu using the tabs' short names.
import { test, expect } from '@playwright/test';
import { openApp, seedMds, seedMls, loadMlsRankings, transitionsDone, showTab } from './helpers.mjs';

const RAIL_W = 96;

const APPS = [
    { name: 'Draft Strategist', path: '/', tabs: ['setup', 'tracker', 'team', 'board'], seed: seedMds,
        menuNames: ['Dashboard', 'Tracker', 'Team', 'Board', 'Guide', 'T-Score', 'My Lineup Strategist'] },
    { name: 'Lineup Strategist', path: '/lineup/', tabs: ['setup', 'roster', 'lineup', 'scoreboard', 'scout'],
        seed: async (page) => { await seedMls(page); await loadMlsRankings(page); },
        menuNames: ['Dashboard', 'Roster', 'Lineup', 'Scoreboard', 'Scout', 'Guide', 'T-Score', 'My Draft Strategist'] },
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

async function btnClick(page, tab) {
    await page.locator(`.nav-bar .nav-btn[data-target="${tab}"]`).click();
    await transitionsDone(page);
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

        test('arrow keys move between items in the rail, the bar and the menu; Home and End jump to the ends', async ({ page }) => {
            const btn = (t) => page.locator(`.nav-bar .nav-btn[data-target="${t}"]`);
            const last = app.tabs[app.tabs.length - 1];
            for (const [width, next, prev] of [[1280, 'ArrowDown', 'ArrowUp'], [375, 'ArrowRight', 'ArrowLeft']]) {
                await page.setViewportSize({ width, height: 800 });
                await openApp(page, app.path);
                await btn(app.tabs[0]).focus();
                await page.keyboard.press(next);
                await expect(btn(app.tabs[1])).toBeFocused();
                await page.keyboard.press(prev);
                await page.keyboard.press(prev); // wraps round to the last
                await expect(btn(last)).toBeFocused();
                await page.keyboard.press('Home');
                await expect(btn(app.tabs[0])).toBeFocused();
                await page.keyboard.press('End');
                await expect(btn(last)).toBeFocused();
                // Moving focus doesn't select: still on the first tab until Enter.
                await expect(page.locator(`#${app.tabs[0]}Tab`)).toHaveClass(/\bactive\b/);
                await page.keyboard.press('Enter');
                await transitionsDone(page);
                await expect(page.locator(`#${last}Tab`)).toHaveClass(/\bactive\b/);
            }
            // In the open menu, Down goes from one row to the next.
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.locator('.nav-bar .nav-rail-menu').click();
            const rows = page.locator('.hamburger-menu .menu-nav-links .nav-btn');
            await rows.nth(0).focus();
            await page.keyboard.press('ArrowDown');
            await expect(rows.nth(1)).toBeFocused();
        });

        for (const width of [1280, 375]) {
            test(`${width}px: Back closes the menu and stays on the tab; a tab chosen from the menu is one step back from the last`, async ({ page }) => {
                await page.setViewportSize({ width, height: 800 });
                await openApp(page, app.path);
                const drawer = page.locator('.hamburger-menu');
                const open = () => page.locator(width >= 840 ? '.nav-bar .nav-rail-menu' : '.header .hamburger-btn').click();
                await btnClick(page, app.tabs[1]);
                const before = await page.evaluate(() => history.length);

                // Back with the menu open closes it, and the tab and address stay.
                await open();
                await expect(drawer).toHaveClass(/\bopen\b/);
                await page.goBack({ waitUntil: 'commit' }).catch(() => {});
                await expect(drawer).not.toHaveClass(/\bopen\b/);
                await transitionsDone(page);
                await expect(page.locator(`#${app.tabs[1]}Tab`)).toHaveClass(/\bactive\b/);
                expect(new URL(page.url()).hash).toBe(`#${app.tabs[1]}`);

                // Closing it another way (Escape) leaves history as it was.
                await open();
                await page.keyboard.press('Escape');
                await expect(drawer).not.toHaveClass(/\bopen\b/);
                await expect.poll(() => page.evaluate(() => history.state && history.state.menu)).toBeFalsy();

                // Choosing a tab from the menu: Back then returns to the tab before it, not to the open menu.
                await open();
                await drawer.locator(`.nav-btn[data-tab="${app.tabs[2]}"]`).click();
                await expect(drawer).not.toHaveClass(/\bopen\b/);
                await transitionsDone(page);
                await expect(page.locator(`#${app.tabs[2]}Tab`)).toHaveClass(/\bactive\b/);
                expect(await page.evaluate(() => history.length)).toBe(before + 1);
                await page.goBack({ waitUntil: 'commit' }).catch(() => {});
                await transitionsDone(page);
                await expect(page.locator(`#${app.tabs[1]}Tab`)).toHaveClass(/\bactive\b/);
                await expect(drawer).not.toHaveClass(/\bopen\b/);
            });
        }

        test('at 2x text the rail\'s labels stay whole (on two lines if need be) and the marker still finds the tab', async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 900 });
            await openApp(page, app.path);
            await page.addStyleTag({ content: 'html { font-size: 200%; }' });
            const out = await page.evaluate(() => {
                const bar = document.querySelector('.nav-bar');
                const r = bar.getBoundingClientRect();
                return { sideways: bar.scrollWidth > bar.clientWidth,
                    outside: [...bar.querySelectorAll('.nav-btn span')].filter(s => { const b = s.getBoundingClientRect(); return b.left < r.left || b.right > r.right; }).map(s => s.textContent) };
            });
            expect(out).toEqual({ sideways: false, outside: [] });
            await btnClick(page, app.tabs[app.tabs.length - 1]);
            await expectMarkerBy(page, app.tabs[app.tabs.length - 1], 'rail');
        });

        test('Material 3 sizes: 24px icons; 64px bars; 64px rail items 4px apart; 56px menu rows', async ({ page }) => {
            for (const width of [375, 700, 1280]) {
                await page.setViewportSize({ width, height: 800 });
                await openApp(page, app.path);
                const m = await page.evaluate(() => {
                    const bar = document.querySelector('.nav-bar');
                    const btns = [...bar.querySelectorAll('.nav-btn')];
                    const r = (e) => e.getBoundingClientRect();
                    const b0 = btns[0], icon = r(b0.querySelector('svg')), label = r(b0.querySelector('span'));
                    return { bar: r(bar).height, icons: [...new Set(btns.map(b => r(b.querySelector('svg')).width))],
                        heights: [...new Set(btns.map(b => Math.round(r(b).height)))],
                        pitch: Math.round(r(btns[1]).top - r(b0).top),
                        aboveIcon: Math.round(icon.top - r(bar).top), iconToLabel: Math.round(label.top - icon.bottom),
                        belowLabel: Math.round(r(b0).bottom - label.bottom), sideGap: Math.round(label.left - icon.right),
                        menuIcons: [...new Set([...document.querySelectorAll('.hamburger-menu .menu-nav-links .nav-btn svg:first-child')].map(s => s.getAttribute('width')))] };
                });
                expect(m.icons).toEqual([24]);
                // The header's navy, on the rail and the bottom bar alike (owner's choice).
                expect(await page.evaluate(() => [document.querySelector('.nav-bar'), document.querySelector('.header')].map(e => getComputedStyle(e).backgroundColor)))
                    .toEqual(['rgba(10, 14, 23, 0.85)', 'rgba(10, 14, 23, 0.85)']);
                expect(m.menuIcons.filter(w => w !== '24' && w !== '16')).toEqual([]); // 16: the other app's arrow
                if (width < 600) {
                    // M3's bar: 6dp, a 32dp indicator round the icon, 4dp, the 16dp label, 6dp.
                    expect(m).toMatchObject({ bar: 64, aboveIcon: 10, iconToLabel: 8, belowLabel: 6 });
                } else if (width < 840) {
                    expect(m).toMatchObject({ bar: 64, sideGap: 4 });
                } else {
                    expect(m).toMatchObject({ heights: [64], pitch: 68, iconToLabel: 8, belowLabel: 6 });
                }
            }
            await page.locator('.nav-bar .nav-rail-menu').click();
            const rows = page.locator('.hamburger-menu .menu-nav-links .nav-btn');
            await expect.poll(() => rows.evaluateAll(bs => [...new Set(bs.map(b => b.getBoundingClientRect().height))])).toEqual([56]);
            await expect.poll(() => rows.evaluateAll(bs => Math.round(bs[1].getBoundingClientRect().top - bs[0].getBoundingClientRect().top))).toBe(56);
        });

        test('the expanded rail grows out of the rail: its edge moves, its icons start where the rail\'s are, the backdrop fades', async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 800 });
            await openApp(page, app.path);
            const icons = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map(b => {
                const r = b.querySelector('svg').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)];
            }), sel);
            const rail = await icons('.nav-bar .nav-btn');
            const menuIcons = app.tabs.map(t => `.hamburger-menu .nav-btn[data-tab="${t}"]`).join(', ');
            const drawer = page.locator('.hamburger-menu');
            // Closed, its right edge is the rail's (and it's hidden), so it opens outwards from there.
            expect(await drawer.evaluate(d => Math.round(d.getBoundingClientRect().right))).toBe(96);
            const pauseAt = (ms) => page.evaluate((t) => {
                const d = document.querySelector('.hamburger-menu');
                [d, ...d.querySelectorAll('*'), document.querySelector('.menu-overlay')].forEach(e => getComputedStyle(e).transform);
                for (const a of document.getAnimations().filter(x => x.transitionProperty)) { a.pause(); a.currentTime = t; }
            }, ms);

            // At the start of opening, the menu's icons are exactly where the rail's are (its rows close up from there).
            await page.evaluate(() => document.querySelector('.nav-bar .nav-rail-menu').click());
            await pauseAt(0);
            expect(await icons(menuIcons)).toEqual(rail);

            // Halfway: the edge is between the rail and the open width, the backdrop part-faded, and nothing animates
            // but transforms and the backdrop's opacity, which the browser runs on the GPU (clip-path, round 2, redrew the
            // panel every frame). The page's looping pulses aren't touched.
            await pauseAt(200);
            const mid = await page.evaluate(() => ({
                right: document.querySelector('.hamburger-menu').getBoundingClientRect().right,
                props: [...new Set(document.getAnimations().filter(t => t.transitionProperty).map(a => a.transitionProperty))].sort(),
                backdrop: Number(getComputedStyle(document.querySelector('.menu-overlay')).opacity),
            }));
            expect(mid.right).toBeGreaterThan(96);
            expect(mid.right).toBeLessThan(280);
            expect(mid.props.filter(p => p !== 'transform' && p !== 'opacity')).toEqual([]);
            expect(mid.backdrop).toBeGreaterThan(0);
            expect(mid.backdrop).toBeLessThan(1);

            // Open: 280px wide, the icons in the rail's column, the first where the rail's first is, the rest 56px apart.
            await page.evaluate(() => document.getAnimations().filter(t => t.transitionProperty).forEach(a => a.finish()));
            await expect(drawer).toHaveClass(/\bopen\b/);
            await expect.poll(() => drawer.evaluate(d => Math.round(d.getBoundingClientRect().right))).toBe(280);
            const open = await icons(menuIcons);
            expect(open.map(([x]) => x)).toEqual(rail.map(([x]) => x));
            expect(open.map(([, y]) => y)).toEqual(rail.map((_, i) => rail[0][1] + 56 * i));

            // Closing: the rows don't slide back (owner: only on the way in). Halfway through, the panel is part-way
            // closed and the icons haven't moved; the backdrop fades out, then leaves the layout.
            await page.keyboard.press('Escape');
            await pauseAt(100);
            expect(await drawer.evaluate(d => d.getBoundingClientRect().right)).toBeLessThan(280);
            expect((await icons(menuIcons)).map(([, y]) => y)).toEqual(open.map(([, y]) => y));
            await page.evaluate(() => document.getAnimations().filter(t => t.transitionProperty).forEach(a => a.play()));
            await expect(page.locator('.menu-overlay')).toBeHidden();
            await expect.poll(() => drawer.evaluate(d => Math.round(d.getBoundingClientRect().right))).toBe(96);
        });

        test('Reduce Motion: the expanded rail and its backdrop appear without moving or fading', async ({ page }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.setViewportSize({ width: 1280, height: 800 });
            await openApp(page, app.path);
            await page.locator('.nav-bar .nav-rail-menu').click();
            // Nothing moves or fades (the buttons' color changes aren't motion).
            expect(await page.evaluate(() => document.getAnimations().map(a => a.transitionProperty).filter(p => p === 'transform' || p === 'opacity'))).toEqual([]);
            expect(await page.locator('.hamburger-menu').evaluate(d => Math.round(d.getBoundingClientRect().right))).toBe(280);
        });

        test('the menu uses the tabs\' short names, at every width', async ({ page }) => {
            for (const width of [375, 1280]) {
                await page.setViewportSize({ width, height: 800 });
                await openApp(page, app.path);
                const names = await page.locator('.hamburger-menu .menu-nav-links .nav-btn').evaluateAll(bs => bs.map(b => b.textContent.trim()));
                expect(names).toEqual(app.menuNames);
            }
        });
    });
}
