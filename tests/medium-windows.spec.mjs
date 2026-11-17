// A review as a user (improvements F27) found three things in M18's changes that felt off; these keep them fixed.
// 1. Windows 600 to 839px wide (a small tablet, a narrow desktop window) got the phone header stretched across them: the
//    app's name hidden, a 700px league picker, 8px page margins. From 600px the header has the name and a picker of
//    normal width that narrows to fit, and the page Material 3's 24px margins.
// 2. A phone tab switch's view transition lasted 500 ms, and the browser sends taps to the page behind a running one:
//    a quick second tap did nothing. It lasts 300 ms.
// 3. The Guide's paragraphs stopped at a reading width inside a full-width card, leaving it lopsided: the card itself is
//    a centred reading column.
import { test, expect } from '@playwright/test';
import { openApp, seedMls, showTab } from './helpers.mjs';

test.describe('Windows 600 to 839px wide', () => {
    test.beforeEach(() => { test.skip(test.info().project.name !== 'desktop', 'sets its own widths'); });
    for (const width of [600, 700, 839]) {
        test(`${width}px: the app's name in the header, whole buttons, 24px margins, nothing sideways`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await openApp(page, '/lineup/');
            await seedMls(page);
            await expect(page.locator('.header .logo-text')).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
            const pad = await page.evaluate(() => getComputedStyle(document.querySelector('.container')).paddingLeft);
            expect(pad).toBe('24px');

            await openApp(page, '/');
            await expect(page.locator('.header .logo-text')).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
            // Draft Strategist's Sync shows its word, inside the button.
            const sync = await page.locator('#headerSyncBtn').evaluate(b => ({ fits: b.scrollWidth <= b.clientWidth, text: b.innerText.trim() }));
            expect(sync).toEqual({ fits: true, text: 'Sync' });
        });
    }
    test('599px is still a phone: the compact header', async ({ page }) => {
        await page.setViewportSize({ width: 599, height: 900 });
        await openApp(page, '/lineup/');
        await seedMls(page);
        await expect(page.locator('.header .logo-text')).toBeHidden();
    });
});

// What the browser animates during a view transition: each animation's duration, once its pictures are taken.
async function transitionDurations(page, start) {
    return page.evaluate(async (src) => {
        const p = new Function(`return (${src})()`)();
        let anims = [];
        for (let i = 0; i < 30 && !anims.length; i++) {
            await new Promise(r => requestAnimationFrame(r));
            anims = document.getAnimations().filter(a => String(a.effect?.pseudoElement || '').startsWith('::view-transition'));
        }
        const out = [...new Set(anims.map(a => a.effect.getTiming().duration))];
        await p;
        return out;
    }, start.toString());
}

test('view transitions last 300 ms at most, so taps come back quickly (a tab switch, a league card folding)', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phones slide');
    await openApp(page, '/lineup/');
    await seedMls(page);
    const tab = await transitionDurations(page, async () => {
        const mod = await import(document.querySelector('script[src*="mls/main.js"]').src);
        return mod.showTab('lineup');
    });
    await showTab(page, 'setup');
    // A Dashboard card folding moves the cards below it: the "cards" transition (500 ms before F27).
    const fold = await transitionDurations(page, async () => {
        document.querySelector('.mls-lc-fold').click();
        while (document.documentElement.hasAttribute('data-vt-busy')) await new Promise(r => requestAnimationFrame(r));
    });
    for (const d of [tab, fold]) {
        expect(d.length).toBeGreaterThan(0);
        for (const ms of d) expect(ms).toBeLessThanOrEqual(300);
    }
});

test('the Guide is a centred reading column on a computer', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'a computer\'s width');
    for (const path of ['/lineup/', '/']) {
        await openApp(page, path);
        await showTab(page, 'guide');
        const box = await page.locator('#guideTab > .settings-card').evaluate(c => {
            const r = c.getBoundingClientRect(), p = c.parentElement.getBoundingClientRect();
            return { width: r.width, left: Math.round(r.left - p.left), right: Math.round(p.right - r.right) };
        });
        expect(box.width).toBeLessThan(800);
        expect(Math.abs(box.left - box.right)).toBeLessThanOrEqual(1);
    }
});
