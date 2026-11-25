// Tap feedback on phones (improvements F23, owner's notes of 2026-11-12).
// 1. The browser's own tap highlight (Chrome on Android lays a translucent blue-grey box over whatever was tapped) is
//    off on every page: one `-webkit-tap-highlight-color: transparent` on the root (css/base.css, STATE LAYERS), which
//    every element inherits. Before F23 only the tab bar (.nav-btn) had it.
// 2. The app's own press feedback (M2's state layer: a 10% tint of the control's own colour while pressed) also covers
//    what opens something but isn't a button: folds (<summary>), the ROS/Weekly rankings card headers (and Auto-Find's
//    sections, the same toggle), the cross-app banner links and the menu's links to the other pages. Links inside a
//    sentence get nothing (owner's choice).
// :active is forced through DevTools (CSS.forcePseudoState), so the press is checked without a real touch, and on
// elements that are hidden until a menu or banner opens.
import { test, expect } from '@playwright/test';
import { openApp, seedMls, showTab, stubInSeasonSheets } from './helpers.mjs';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** The computed -webkit-tap-highlight-color of the first element matching each selector (null when none matches). */
const tapColors = (page, selectors) => page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const el = document.querySelector(s);
    return [s, el ? getComputedStyle(el).webkitTapHighlightColor : null];
})), selectors);

/** The alpha of a computed colour: rgba(), or color(srgb r g b / a) from color-mix(). 1 when there's no alpha part. */
function alphaOf(color) {
    if (!color || color === 'transparent') return 0;
    const m = color.match(/\/\s*([\d.]+)\s*\)$/) || color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/);
    return m ? Number(m[1]) : 1;
}

/** Forces :active on the first element matching `selector` and returns its ::before and ::after (content, background). */
async function pressed(page, selector) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    expect(nodeId, `${selector} is on the page`).toBeTruthy();
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] });
    const styles = await page.evaluate(async (s) => {
        const el = document.querySelector(s);
        // The layer fades in over 100ms (a transition): read it once the fade has ended.
        getComputedStyle(el, '::before').backgroundColor;
        // Transitions only: Draft Strategist's setup pulse is an endless animation.
        await Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {})));
        const pick = (pseudo) => {
            const cs = getComputedStyle(el, pseudo);
            return { content: cs.content, background: cs.backgroundColor };
        };
        return { before: pick('::before'), after: pick('::after'), self: getComputedStyle(el).backgroundColor };
    }, selector);
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    await cdp.detach();
    return styles;
}

/** The press tint's alpha on the layer that carries it: ::before for most, ::after for the rankings card toggle (its
 *  ::after covers the header), the element itself for the menu's link to the other app (its ::before is a divider). */
async function pressAlpha(page, selector, layer = 'before') {
    const s = await pressed(page, selector);
    return alphaOf(layer === 'self' ? s.self : s[layer].content !== 'none' ? s[layer].background : null);
}

test.describe('no browser tap flash', () => {
    test('Draft Strategist', async ({ page }) => {
        await openApp(page, '/');
        const colors = await tapColors(page, [
            'html', 'body', '.nav-btn', '.btn', '#guideBanner > button', '#mlsBanner > a', '.close-banner-btn',
            '.hamburger-menu a.nav-btn', '.premium-link-btn', 'a[href]', 'select', 'input', 'label',
        ]);
        for (const [sel, color] of Object.entries(colors)) {
            expect(color, `${sel} on /`).not.toBeNull();
            expect(color, `${sel} on /`).toBe(TRANSPARENT);
        }
    });

    test('Lineup Strategist', async ({ page }) => {
        await openApp(page, '/lineup/');
        await seedMls(page);
        const colors = await tapColors(page, [
            'html', 'body', '.nav-btn', '.btn', '.mls-lc-name-btn', 'summary', '.rankings-card-toggle', '#guideBanner > button',
            '.hamburger-menu a.nav-btn', 'a[href]', 'select', 'input',
        ]);
        for (const [sel, color] of Object.entries(colors)) {
            expect(color, `${sel} on /lineup/`).not.toBeNull();
            expect(color, `${sel} on /lineup/`).toBe(TRANSPARENT);
        }
        await showTab(page, 'guide');
        const guide = await tapColors(page, ['#guideTab :is(p, li) > a[href]']);
        expect(guide['#guideTab :is(p, li) > a[href]']).toBe(TRANSPARENT);
    });

    test('T-Score', async ({ page }) => {
        await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
        const colors = await tapColors(page, ['html', 'body', '.tscore-nav-btn', 'summary', 'a[href]', '.btn']);
        for (const [sel, color] of Object.entries(colors)) {
            expect(color, `${sel} on /t-score/`).not.toBeNull();
            expect(color, `${sel} on /t-score/`).toBe(TRANSPARENT);
        }
    });
});

test.describe("the app's own press tint", () => {
    test('Lineup Strategist: buttons as before, plus folds, card headers, banner and menu links', async ({ page }) => {
        await openApp(page, '/lineup/');
        await seedMls(page);
        // A button had it before F23 (M2), and keeps it.
        expect(await pressAlpha(page, '.mls-lc-name-btn')).toBeCloseTo(0.1, 2);
        for (const sel of [
            '.notify-settings > summary',                 // a fold in Settings
            '#syncLogAccordion > summary',                // Recent Sync Logs
            '#draftBanner > a',                           // "Try My Draft Strategist"
            '.hamburger-menu a.nav-btn:not(.premium-link-btn)', // the menu's T-Score link
        ]) {
            expect(await pressAlpha(page, sel), sel).toBeCloseTo(0.1, 2);
        }
        // The ROS rankings card's header: the toggle's ::after covers the header.
        expect(await pressAlpha(page, '#rosRankingsCard .rankings-card-toggle', 'after')).toBeCloseTo(0.1, 2);
        // The menu's link to Draft Strategist.
        expect(await pressAlpha(page, '.hamburger-menu .premium-link-btn', 'self')).toBeCloseTo(0.1, 2);
        // A link inside a sentence gets no layer at all (owner's choice).
        await showTab(page, 'guide');
        const inText = await pressed(page, '#guideTab :is(p, li) > a[href]');
        expect(inText.before.content).toBe('none');
        expect(alphaOf(inText.self)).toBe(0);
        expect(alphaOf(inText.after.background)).toBe(0);
    });

    test('Draft Strategist: the banner link and the menu links', async ({ page }) => {
        await openApp(page, '/');
        for (const sel of ['#mlsBanner > a', '.hamburger-menu a.nav-btn:not(.premium-link-btn)']) {
            expect(await pressAlpha(page, sel), sel).toBeCloseTo(0.1, 2);
        }
        expect(await pressAlpha(page, '.hamburger-menu .premium-link-btn', 'self')).toBeCloseTo(0.1, 2);
    });

    test('T-Score: its folds', async ({ page }) => {
        await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
        expect(await pressAlpha(page, 'summary')).toBeCloseTo(0.1, 2);
    });
});
