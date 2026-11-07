// Ko-fi and Share (improvements K2, docs/improvements/support.md sections 1 and 5). Our own "Support on Ko-fi" button
// replaced Ko-fi's PNG badge (from storage.ko-fi.com) at the foot of the three drawers and both Dashboards; a cup in the
// header on computers only (840px and up); an "About this project" note at the top of both Guides and a line at the end
// of T-Score's The Research; and "Share this site" (drawer) / "Share with your league" (Guide note, Dashboard foot),
// which open the Web Share sheet, or copy the link where there's none. The helper itself: tests/unit/share.test.mjs.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab } from './helpers.mjs';

const PAGES = [
    { name: 'Draft Strategist', path: '/', app: 'mds', url: 'https://mydraftstrategist.com/?ref=share', menu: '.nav-bar .nav-rail-menu', phoneMenu: '.header .hamburger-btn' },
    { name: 'Lineup Strategist', path: '/lineup/', app: 'mls', url: 'https://mydraftstrategist.com/lineup/?ref=share', menu: '.nav-bar .nav-rail-menu', phoneMenu: '.header .hamburger-btn' },
    { name: 'T-Score', path: '/t-score/', app: 'tscore', url: 'https://mydraftstrategist.com/t-score/?ref=share', menu: '.header .hamburger-btn', phoneMenu: '.header .hamburger-btn' },
];

// Records navigator.share and clipboard calls in the page. mode: 'share' (resolves), 'abort' (the person cancels),
// 'none' (no Web Share: Firefox on computers).
async function stubShare(page, mode) {
    await page.addInitScript((mode) => {
        window.__shared = []; window.__copied = [];
        if (mode === 'none') {
            try { delete Navigator.prototype.share; } catch { /* not there */ }
            Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        } else {
            Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => {
                window.__shared.push(data);
                if (mode === 'abort') throw new DOMException('Share canceled', 'AbortError');
            } });
        }
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } } });
    }, mode);
}

const openMenu = (page, p, testInfo) => page.locator(testInfo.project.name === 'phone' ? p.phoneMenu : p.menu).click();

test.describe('Ko-fi and Share', () => {
    for (const p of PAGES) {
        test(`${p.name}: no request to storage.ko-fi.com; every Ko-fi link is ours, opens a new tab with rel, and is counted`, async ({ page }) => {
            const kofiRequests = [];
            page.on('request', (r) => { if (/ko-fi\.com/.test(new URL(r.url()).hostname)) kofiRequests.push(r.url()); });
            await openApp(page, p.path);
            const html = await page.content();
            expect(html).not.toContain('storage.ko-fi.com');
            expect(html).not.toContain('kofi-img');
            expect(html).not.toMatch(/Buy Me a Coffee/i);
            const links = await page.locator('a[href*="ko-fi.com"]').evaluateAll(as => as.map(a => ({
                href: a.getAttribute('href'), target: a.target, rel: a.rel.split(/\s+/).sort().join(' '),
                event: a.dataset.umamiEvent, where: a.dataset.umamiEventWhere, img: !!a.querySelector('img'),
            })));
            // drawer + header, plus the Dashboard foot and the Guide note in the apps; the Research line on T-Score
            expect(links.length).toBe(p.app === 'tscore' ? 3 : 4);
            for (const l of links) {
                expect(l).toMatchObject({ href: 'https://ko-fi.com/btrerise', target: '_blank', rel: 'noopener noreferrer', event: 'Ko-fi', img: false });
                expect(['header', 'drawer', 'guide', 'foot']).toContain(l.where);
            }
            expect(kofiRequests).toEqual([]);
            // Every Share button is counted too, with where it is.
            const shares = await page.locator('[data-action="shareSite"]').evaluateAll(bs => bs.map(b => [b.dataset.share, b.dataset.umamiEvent, b.dataset.umamiEventWhere]));
            expect(shares.length).toBe(p.app === 'tscore' ? 2 : 3);
            for (const [app, event, where] of shares) {
                expect(app).toBe(p.app);
                expect(event).toBe('Share');
                expect(['drawer', 'guide', 'foot']).toContain(where);
            }
        });

        test(`${p.name}: the header's Ko-fi cup shows on computers only`, async ({ page }, testInfo) => {
            await openApp(page, p.path);
            const cup = page.locator('.header .header-kofi');
            await expect(cup).toHaveAttribute('aria-label', 'Support this site on Ko-fi');
            if (testInfo.project.name === 'phone') {
                await expect(cup).toBeHidden();
                await page.setViewportSize({ width: 839, height: 844 });
                await expect(cup).toBeHidden();
                return;
            }
            await expect(cup).toBeVisible();
            await expect(cup).toHaveAccessibleName('Support this site on Ko-fi');
            // At the header's right end, 48px, muted until hovered, with its tooltip on hover.
            const box = await cup.boundingBox();
            expect(Math.round(box.width)).toBe(48);
            expect(Math.round(1280 - (box.x + box.width))).toBeLessThanOrEqual(32);
            const color = () => cup.evaluate(el => getComputedStyle(el).color);
            const tipOpacity = () => cup.evaluate(el => getComputedStyle(el, '::before').opacity);
            expect(await color()).toBe('rgb(156, 163, 175)');
            await expect.poll(tipOpacity).toBe('0');
            await cup.hover();
            await expect.poll(color).toBe('rgb(16, 185, 129)');
            await expect.poll(tipOpacity).toBe('1');
            expect(await cup.evaluate(el => getComputedStyle(el, '::before').content)).toBe('"Support this site on Ko-fi"');
            await page.setViewportSize({ width: 839, height: 900 });
            await expect(cup).toBeHidden();
        });

        test(`${p.name}: "Share this site" in the menu opens the share sheet with this page's link`, async ({ page }, testInfo) => {
            await stubShare(page, 'share');
            const state = await openApp(page, p.path);
            await openMenu(page, p, testInfo);
            const btn = page.locator('.hamburger-menu .share-site-btn');
            await expect(btn).toHaveText('Share this site');
            await btn.click();
            await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([expect.objectContaining({ url: p.url })]);
            const [data] = await page.evaluate(() => window.__shared);
            expect(data.title.length).toBeGreaterThan(0);
            expect(data.text.length).toBeGreaterThan(0);
            expect(await page.evaluate(() => window.__copied)).toEqual([]);
            await expect(page.locator('#mds-toast.show')).toHaveCount(0);
            await expectClean(page, state);
        });

        test(`${p.name}: with no share sheet, Share copies the link and says "Link copied"`, async ({ page }, testInfo) => {
            await stubShare(page, 'none');
            const state = await openApp(page, p.path);
            await openMenu(page, p, testInfo);
            await page.locator('.hamburger-menu .share-site-btn').click();
            await expect(page.locator('#mds-toast.show .toast-message')).toHaveText('Link copied');
            expect(await page.evaluate(() => window.__copied)).toEqual([p.url]);
            await expectClean(page, state);
        });

        test(`${p.name}: closing the share sheet (cancel) shows nothing and copies nothing`, async ({ page }, testInfo) => {
            await stubShare(page, 'abort');
            const state = await openApp(page, p.path);
            await openMenu(page, p, testInfo);
            await page.locator('.hamburger-menu .share-site-btn').click();
            await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
            await page.waitForTimeout(200);
            await expect(page.locator('#mds-toast.show')).toHaveCount(0);
            expect(await page.evaluate(() => window.__copied)).toEqual([]);
            await expectClean(page, state);
        });
    }

    for (const p of PAGES.filter(p => p.app !== 'tscore')) {
        test(`${p.name}: "About this project" leads the Guide, with Support on Ko-fi and Share with your league`, async ({ page }) => {
            await stubShare(page, 'share');
            await openApp(page, p.path);
            await showTab(page, 'guide');
            const note = page.locator('#guideTab .about-project');
            await expect(note).toBeVisible();
            await expect(note.getByRole('heading', { name: 'About this project' })).toBeVisible();
            await expect(note).toContainText('I build My Draft Strategist and Lineup Strategist on my own, for fun, in my spare time.');
            await expect(note).toContainText('Thanks for using it. I hope it helps you as much as it helps me!');
            expect(await note.locator('p br').count()).toBe(3); // one sentence (or pair) per line
            // The first thing in the Guide's steps (after Lineup Strategist's welcome line).
            expect(await page.evaluate(() => document.querySelector('#guideTab .guide-step').compareDocumentPosition(document.querySelector('#guideTab .about-project')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
            const kofi = note.getByRole('link', { name: 'Support on Ko-fi' });
            await expect(kofi).toHaveAttribute('data-umami-event-where', 'guide');
            expect(Math.round((await kofi.boundingBox()).height)).toBe(48);
            await note.getByRole('button', { name: 'Share with your league' }).click();
            await expect.poll(() => page.evaluate(() => window.__shared.map(d => d.url))).toEqual([p.url]);
            // The Visitor Counts line says the taps are counted.
            await expect(page.locator('#guideTab')).toContainText('Taps on the Support on Ko-fi and Share buttons are counted too');
        });

        test(`${p.name}: the Dashboard foot has our button and Share in place of Ko-fi's badge`, async ({ page }) => {
            await stubShare(page, 'none');
            await openApp(page, p.path);
            const foot = page.locator('.hero-kofi');
            await expect(foot.locator('.kofi-note')).toHaveText(/is free, with no ads\. One person builds it\./);
            await expect(foot.getByRole('link', { name: 'Support on Ko-fi' })).toHaveAttribute('data-umami-event-where', 'foot');
            await foot.getByRole('button', { name: 'Share with your league' }).click();
            await expect(page.locator('#mds-toast.show .toast-message')).toHaveText('Link copied');
            expect(await page.evaluate(() => window.__copied)).toEqual([p.url]);
        });
    }

    test('T-Score: The Research ends with the support line, before Visitor counts', async ({ page }) => {
        await stubShare(page, 'share');
        await openApp(page, '/t-score/');
        const line = page.locator('#researchTab .tscore-support');
        await expect(line).toContainText('I build the T-Score model and both apps on my own, for fun, with no ads.');
        await expect(line.getByRole('link', { name: 'Support on Ko-fi' })).toHaveAttribute('data-umami-event-where', 'guide');
        await expect(line.locator('+ .tscore-privacy')).toContainText('Taps on the Support on Ko-fi and Share buttons are counted too');
        await line.getByRole('button', { name: 'Share with your league' }).click();
        await expect.poll(() => page.evaluate(() => window.__shared.map(d => d.url))).toEqual(['https://mydraftstrategist.com/t-score/?ref=share']);
    });

    test('the drawer foot: the Ko-fi button, 48px, with "Made by one person, for fun. No ads." under it', async ({ page }, testInfo) => {
        await openApp(page, '/lineup/');
        await openMenu(page, PAGES[1], testInfo);
        const footer = page.locator('.hamburger-menu .menu-footer');
        const btn = footer.getByRole('link', { name: 'Support on Ko-fi' });
        await expect(btn).toBeVisible();
        expect(Math.round((await btn.boundingBox()).height)).toBe(48);
        expect(await btn.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(16, 185, 129)');
        await expect(footer.locator('.kofi-note')).toHaveText('Made by one person, for fun. No ads.');
    });
});
