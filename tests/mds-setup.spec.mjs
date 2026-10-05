// Draft Strategist's setup guidance (refactor chunk 8A): the "Setup Progress" checklist at the top of
// the Setup tab, the pulsing "do this next" cues, and the guide banner that stays dismissed.
// The steps and rules are the ones the owner approved (docs/refactor/LOG.md, 8A):
//   Rankings  done when the active draft has players loaded
//   Draft     done when the active draft isn't the built-in "Main Draft" (draft_default)
//   ADP       done when any player in the pool has an ADP
// The card of the first unfinished step pulses; the logo pulses while no rankings are loaded and
// another tab is open; the checklist hides once all three are done.
// Each test runs with reduced motion off and on: the cues animate, or show a static highlight.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, RANKINGS_CSV, confirmMdsPreview } from './helpers.mjs';

const CARDS = { rankings: '#setupRankingsCard', draft: '#setupDraftCard', adp: '#setupAdpCard' };
const STEPS = { rankings: '#setupStepRankings', draft: '#setupStepDraft', adp: '#setupStepAdp' };
const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });

/** Only `step`'s card pulses (none when step is null), and it animates unless motion is reduced. */
async function expectCardPulse(page, step, reducedMotion) {
    for (const [name, sel] of Object.entries(CARDS)) {
        if (name === step) await expect(page.locator(sel)).toHaveClass(/\bpulse-border\b/);
        else await expect(page.locator(sel)).not.toHaveClass(/\bpulse-border\b/);
    }
    if (!step) return;
    const style = await page.locator(CARDS[step]).evaluate(el => {
        const cs = getComputedStyle(el);
        return { animation: cs.animationName, shadow: cs.boxShadow };
    });
    if (reducedMotion) {
        expect(style.animation).toBe('none');
        expect(style.shadow).toContain('rgba(16, 185, 129, 0.5)'); // the static highlight
    } else {
        expect(style.animation).toBe('border-pulse-anim');
    }
}

/** A step's <li>: done or not, and whether it shows instructions and a "Show me" link. */
async function expectStep(page, step, { done, text, actionable }) {
    const li = page.locator(STEPS[step]);
    await expect(li).toContainText(text);
    if (done) await expect(li).toHaveClass(/\bis-done\b/);
    else await expect(li).not.toHaveClass(/\bis-done\b/);
    await expect(li.getByRole('button', { name: /^Show me/ })).toHaveCount(actionable ? 1 : 0);
}

for (const reducedMotion of [false, true]) {
    test.describe(`Draft Strategist setup guidance (reduced motion ${reducedMotion ? 'on' : 'off'})`, () => {
        // Through contextOptions: this Playwright version has no top-level reducedMotion option.
        test.use({ contextOptions: { reducedMotion: reducedMotion ? 'reduce' : 'no-preference' } });

        test('the checklist ticks off and the pulse moves to the next step as setup fills in', async ({ page }) => {
            const state = await openApp(page, '/');
            expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion);
            const checklist = page.locator('#setupChecklist');
            const title = page.locator('#setupChecklistTitle');
            const logo = page.locator('.logo-container');

            // Fresh page: nothing done. ADP needs rankings first, so it has no instructions yet.
            await expect(checklist).toBeVisible();
            await expect(title).toHaveText('Setup Progress · 0 of 3 done');
            await expectStep(page, 'rankings', { done: false, text: 'Load rankings', actionable: true });
            await expectStep(page, 'draft', { done: false, text: 'Add or sync your draft', actionable: true });
            await expectStep(page, 'adp', { done: false, text: 'Load ADP (market value)', actionable: false });
            await expect(page.locator(STEPS.rankings).getByRole('button')).toHaveAccessibleName('Show me for Load rankings');
            await expectCardPulse(page, 'rankings', reducedMotion);

            // The logo pulses only while you're on another tab (and no rankings are loaded).
            await expect(logo).not.toHaveClass(/\bnav-pulse\b/);
            await showTab(page, 'tracker');
            await expect(logo).toHaveClass(/\bnav-pulse\b/);
            expect(await logo.evaluate(el => getComputedStyle(el).animationName)).toBe(reducedMotion ? 'none' : 'nav-pulse-anim');
            await showTab(page, 'guide');
            await expect(logo).toHaveClass(/\bnav-pulse\b/);
            await showTab(page, 'setup');
            await expect(logo).not.toHaveClass(/\bnav-pulse\b/);

            // Step 1: rankings.
            await page.fill('#csvPasteArea', RANKINGS_CSV);
            await page.getByRole('button', { name: 'Process Pasted Data' }).click();
            await confirmMdsPreview(page);
            await expect(toast(page, 'Loaded 24 players').last()).toBeVisible();
            await expect(title).toHaveText('Setup Progress · 1 of 3 done');
            await expectStep(page, 'rankings', { done: true, text: 'Rankings loaded (24 players)', actionable: false });
            await expectStep(page, 'adp', { done: false, text: 'Load ADP (market value)', actionable: true });
            await expectCardPulse(page, 'draft', reducedMotion);
            await showTab(page, 'tracker');
            await expect(logo).not.toHaveClass(/\bnav-pulse\b/); // rankings loaded: no logo pulse
            await showTab(page, 'setup');

            // Step 2: a manual draft (it starts from the loaded rankings).
            await page.fill('#newDraftName', 'Mock <b>One</b>');
            await page.getByRole('button', { name: 'Create Manual Draft' }).click();
            await expect(toast(page, 'created!').last()).toBeVisible();
            await expect(title).toHaveText('Setup Progress · 2 of 3 done');
            // The draft's name is shown as text, not markup.
            await expectStep(page, 'draft', { done: true, text: 'Draft added: Mock <b>One</b>', actionable: false });
            await expectStep(page, 'rankings', { done: true, text: 'Rankings loaded (24 players)', actionable: false });
            await expectCardPulse(page, 'adp', reducedMotion);

            // Step 3: ADP, through the manual paste. Everything's done: the checklist and the pulses go.
            await page.fill('#adpPasteArea', "Ja'Marr Chase, 1.2");
            await page.getByRole('button', { name: 'Apply Manual Market Paste' }).click();
            await expect(checklist).toBeHidden();
            await expectCardPulse(page, null, reducedMotion);

            // It stays that way after a reload, and comes back when the active draft has nothing set
            // up: the built-in "Main Draft" is still there, with the rankings but no ADP.
            await page.reload();
            await expect(page.locator('#setupStepRankings')).toBeAttached();
            await expect(checklist).toBeHidden();
            await expectCardPulse(page, null, reducedMotion);
            await page.selectOption('#draftProfileSelect', { label: 'Main Draft' });
            await expect(checklist).toBeVisible();
            await expect(title).toHaveText('Setup Progress · 1 of 3 done');
            await expectCardPulse(page, 'draft', reducedMotion);

            await expectClean(page, state);
        });

        test('a "Show me" link scrolls to its card and focuses its first control', async ({ page }) => {
            const state = await openApp(page, '/');
            expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion);
            const visible = (sel) => page.locator(sel).evaluate(el => {
                const r = el.getBoundingClientRect();
                return r.top >= 0 && r.top < window.innerHeight; // the card's top is on screen
            });

            // Rankings: Quick-Start is the card's first control.
            await page.locator(STEPS.rankings).getByRole('button', { name: /^Show me/ }).click();
            await expect(page.locator('#quickStartBtn')).toBeFocused();
            await expect.poll(() => visible(CARDS.rankings)).toBe(true);

            // Draft: the card is further down; scroll back up first so the link has to move the page.
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.locator(STEPS.draft).getByRole('button', { name: /^Show me/ }).click();
            await expect(page.locator('#sleeperUsername')).toBeFocused();
            await expect.poll(() => visible(CARDS.draft)).toBe(true);
            // With reduced motion the scroll jumps, so the card is in place right away.
            if (reducedMotion) expect(await visible(CARDS.draft)).toBe(true);

            // ADP, once rankings are loaded: the format dropdown.
            await page.fill('#csvPasteArea', RANKINGS_CSV);
            await page.getByRole('button', { name: 'Process Pasted Data' }).click();
            await confirmMdsPreview(page);
            await expect(toast(page, 'Loaded 24 players').last()).toBeVisible();
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.locator(STEPS.adp).getByRole('button', { name: /^Show me/ }).click();
            await expect(page.locator('#adpFormatSelect')).toBeFocused();
            await expect.poll(() => visible(CARDS.adp)).toBe(true);

            await expectClean(page, state);
        });
    });
}

test('each app\'s guide banner stays dismissed by its own key', async ({ page }) => {
    const state = await openApp(page, '/');
    const banner = page.locator('#guideBanner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Dismiss Banner' }).click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('mds_hide_guide_banner'))).toBe('true');
    await page.reload();
    await expect(page.locator('#setupChecklist')).toBeVisible(); // the page has initialized
    await expect(banner).toBeHidden();

    // Lineup Strategist's guide banner has its own key, so it still shows...
    await page.goto('/lineup/');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Dismiss Banner' }).click();
    await page.reload();
    await expect(page.locator('#setupTab')).toBeVisible();
    await expect(banner).toBeHidden();

    // ...and dismissing it doesn't hide Draft Strategist's.
    await page.evaluate(() => localStorage.removeItem('mds_hide_guide_banner'));
    await page.goto('/');
    await expect(page.locator('#setupChecklist')).toBeVisible();
    await expect(banner).toBeVisible();

    await expectClean(page, state);
});
