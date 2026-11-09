// Every fold's chevron turns with its fold (improvements F11). One shared rule in css/base.css (CHEVRONS): a chevron
// is <svg class="chevron"> directly inside its toggle (a <summary>, or a button with aria-expanded), points right when
// closed and down when open (.chevron-flip: down, then up), and turns at the Dashboard's league cards' speed
// (--vt-ms, --vt-ease: 275 ms on phones, 375 ms from 768px). With Reduce Motion it doesn't turn. A <details> that
// used to show the browser's own triangle shows the shared chevron instead. Folds that redraw their box on each
// click turn the new chevron from the old one's angle (js/shared/ui/chevron.js).
//
// One fold per page: Lineup Strategist's Backup & Restore (a <details>), a Dashboard league card and the Roster tab's
// rankings card (buttons); Draft Strategist's My Queue (a redrawn button); T-Score's appendix (a <details>).
import { test, expect } from '@playwright/test';
import { openApp, showTab, seedMls, seedMds, transitionsDone } from './helpers.mjs';

// The chevron's resting angle in degrees (0 = as drawn, pointing down), read from its computed transform.
const angle = (loc) => loc.evaluate(el => {
    const t = getComputedStyle(el).transform;
    if (t === 'none') return 0;
    const m = new DOMMatrix(t);
    return Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
});
const timing = (loc) => loc.evaluate(el => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration, easing: s.transitionTimingFunction };
});
async function expectDashboardTiming(page, loc) {
    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    expect(await timing(loc)).toEqual({ property: 'transform', duration: wide ? '0.375s' : '0.275s', easing: 'cubic-bezier(0.2, 0, 0, 1)' });
}
// Turns over time rather than jumping: some frame between the click and the end sits between the two angles.
async function sawTurning(loc) {
    return loc.evaluate(el => el.getAnimations().length > 0 || getComputedStyle(el).transitionDuration !== '0s');
}

test.describe('Chevrons turn with their folds (improvements F11)', () => {
    test('Lineup Strategist: a <details>, a league card and a rankings card', async ({ page }) => {
        await openApp(page, '/lineup/');
        await seedMls(page);

        // Backup & Restore: the shared chevron instead of the browser's triangle, right when closed, down when open.
        const backup = page.locator('#setupTab details.sos-details-accordion').filter({ hasText: 'Backup & Restore' });
        const summary = backup.locator('> summary');
        const chev = summary.locator('> svg.chevron');
        await expect(chev).toHaveAttribute('aria-hidden', 'true');
        await expect(chev).toHaveAttribute('stroke', 'currentColor');
        expect(await summary.evaluate(el => [getComputedStyle(el).display, getComputedStyle(el).listStyleType])).toEqual(['flex', 'none']);
        await expectDashboardTiming(page, chev);
        expect(await angle(chev)).toBe(-90);
        await summary.click();
        await expect(backup).toHaveJSProperty('open', true);
        await expect.poll(() => angle(chev)).toBe(0);
        await summary.click();
        await expect.poll(() => angle(chev)).toBe(-90);

        // The Dashboard's league card: the same rule (it set the speed).
        await showTab(page, 'setup');
        const fold = page.locator('#leagueCards .mls-lc-fold').first();
        const lc = fold.locator('> svg.chevron');
        await expectDashboardTiming(page, lc);
        const startOpen = (await fold.getAttribute('aria-expanded')) === 'true';
        expect(await angle(lc)).toBe(startOpen ? 0 : -90);
        await fold.click();
        await transitionsDone(page);
        await expect(fold).toHaveAttribute('aria-expanded', String(!startOpen));
        await expect.poll(() => angle(lc)).toBe(startOpen ? -90 : 0);

        // The Roster tab's rankings card turns down → up, as it always pointed.
        await showTab(page, 'roster');
        const toggle = page.locator('#rosRankingsCard .rankings-card-toggle');
        const rc = toggle.locator('> svg.chevron');
        await expectDashboardTiming(page, rc);
        const rcOpen = (await toggle.getAttribute('aria-expanded')) === 'true';
        expect(await angle(rc)).toBe(rcOpen ? 180 : 0);
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', String(!rcOpen));
        await expect.poll(() => angle(rc)).toBe(rcOpen ? 0 : 180);
    });

    test('Draft Strategist: My Queue turns its new chevron across the redraw', async ({ page }) => {
        await openApp(page, '/');
        await seedMds(page);
        await page.locator('#trackerTab [data-action="toggleQueue"]').first().click();
        const header = page.locator('#queueContainer .queue-header');
        await expect(header).toHaveAttribute('aria-expanded', 'true');
        const chev = header.locator('> svg.chevron');
        await expectDashboardTiming(page, chev);
        expect(await angle(chev)).toBe(180);
        await header.click();
        await expect(header).toHaveAttribute('aria-expanded', 'false');
        // A new element, which still turns (from up to down) rather than appearing turned.
        expect(await sawTurning(chev)).toBe(true);
        expect(await chev.evaluate(el => el.getAnimations().length)).toBe(1);
        await expect.poll(() => angle(chev)).toBe(0);
    });

    test('T-Score: the appendix shows the shared chevron and turns it', async ({ page }) => {
        await openApp(page, '/t-score/');
        const details = page.locator('#researchTab details.sos-details-accordion').filter({ hasText: 'Appendix' });
        const summary = details.locator('> summary');
        const chev = summary.locator('> svg.chevron');
        await expectDashboardTiming(page, chev);
        expect(await summary.evaluate(el => getComputedStyle(el).listStyleType)).toBe('none');
        expect(await angle(chev)).toBe(-90);
        await summary.click();
        await expect.poll(() => angle(chev)).toBe(0);
    });

    test('Reduce Motion: chevrons switch angle without turning', async ({ browser }) => {
        const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        await openApp(page, '/');
        await seedMds(page);
        await page.locator('#trackerTab [data-action="toggleQueue"]').first().click();
        const chev = page.locator('#queueContainer .queue-header > svg.chevron');
        expect((await timing(chev)).duration).toBe('0s');
        await page.locator('#queueContainer .queue-header').click();
        await expect(page.locator('#queueContainer .queue-header')).toHaveAttribute('aria-expanded', 'false');
        expect(await chev.evaluate(el => el.getAnimations().length)).toBe(0);
        expect(await angle(chev)).toBe(0);

        await page.goto('/t-score/');
        const summary = page.locator('#researchTab details.sos-details-accordion').filter({ hasText: 'Appendix' }).locator('> summary');
        const tchev = summary.locator('> svg.chevron');
        expect((await timing(tchev)).duration).toBe('0s');
        await summary.click();
        expect(await angle(tchev)).toBe(0);
        await context.close();
    });
});
