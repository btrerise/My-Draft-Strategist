// The Guide's badge legend in both apps (improvements S10): "What do these mean?" (on phones, "Badges")
// on the Scout tab's Waiver Wire Assistant and the Lineup and Roster tabs (Lineup Strategist), and on the
// Tracker (Draft Strategist), opens the legend in the shared sheet over the tab (M11; the sheet itself is
// tests/sheet.spec.mjs); its "Open the Guide" opens the Guide tab at "What the badges mean". The legend is drawn with each
// app's own badge markup (js/mls/legend.js, js/mds/legend.js), so its samples carry the real classes and
// look like the rows. It's static: it shows the same with no league or rankings loaded (the empty state
// these tests start from). tests/unit/badgeLegend.test.mjs checks it lists every badge class.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab } from './helpers.mjs';

const legend = (page) => page.locator('.badge-legend-sheet');
const sample = (page, selector) => legend(page).locator(`.badge-legend-sample ${selector}`);

// The legend is open in the sheet over the tab you were on, focus on the sheet's title.
async function expectLegendOpen(page, tab) {
    await expect(legend(page)).toBeVisible();
    await expect(legend(page).locator('.sheet-title')).toHaveText('What the badges mean');
    await expect(legend(page).locator('.sheet-title')).toBeFocused();
    await expect(page.locator(`#${tab}Tab`)).toHaveClass(/\bactive\b/);
    // The slide-in starts two frames after the title takes focus (js/shared/ui/sheet.js), so wait for it to start
    // before waiting for it to end: read between the two, the sheet is still off-screen (failed once in CI, K2).
    await expect(page.locator('.sheet-host')).toHaveClass(/\bis-open\b/);
    await legend(page).evaluate(el => Promise.all(el.getAnimations().map(a => a.finished))); // where it rests
}

// The Guide is shown, its legend is on screen, and focus is on its heading (for keyboard and screen readers).
async function expectGuideLegendOpen(page) {
    await expect(page.locator('#guideTab')).toHaveClass(/\bactive\b/);
    await expect(page.locator('#badgeLegendTitle')).toBeInViewport();
    await expect(page.locator('#badgeLegendTitle')).toBeFocused();
    await expect(page).toHaveURL(/#guide$/);
}

test.describe('Badge legend', () => {
    test('Lineup Strategist: the Waiver Wire Assistant\'s link opens the legend, drawn with the real badges', async ({ page }, testInfo) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'scout');
        const link = page.locator('#waiverCard [data-action="openBadgeLegend"]');
        await expect(link).toBeVisible();
        await expect(link).toHaveAccessibleName(/what do these badges mean/i);
        // The visible label: the long one on wide screens, "Badges" on phones.
        expect(await link.evaluate(el => el.innerText.trim())).toBe(testInfo.project.name === 'phone' ? 'Badges' : 'What do these mean?');
        await link.click();
        await expectLegendOpen(page, 'scout');

        // Every group, and samples with the classes the rows use.
        await expect(legend(page).locator('.badge-legend-group-title')).toHaveText(['Positions and slots', 'Ranks and tiers', 'Changes and trends', 'Availability and status', 'Schedule']);
        const sos1 = sample(page, '.badge.sos-badge').first();
        await expect(sos1).toHaveAttribute('style', /--sos-color:hsl\(120, 80%, 65%\)/);   // 1 = easiest: green
        await expect(sos1).toContainText('1');
        const sosColor = await sos1.evaluate(el => getComputedStyle(el).color.match(/\d+/g).map(Number));
        expect(sosColor[1]).toBeGreaterThan(sosColor[0] + 100);                           // green, not red
        await expect(sample(page, '.badge.sos-badge')).toHaveCount(3);
        await expect(sample(page, '.badge.mls-move-chip.is-up')).toHaveCount(1);
        await expect(sample(page, '.badge.mls-move-chip.is-down')).toHaveCount(1);
        await expect(sample(page, '.badge.mls-move-chip.is-new')).toHaveText(/^New/);
        await expect(sample(page, '.badge.inj-badge')).toHaveText(['Q', 'D', 'OUT', 'IR']);
        await expect(sample(page, '.badge.inj-badge').first()).toHaveCSS('background-color', 'rgb(234, 67, 53)');
        await expect(sample(page, '.badge.ir-slot-badge')).toHaveText('IR');
        await expect(sample(page, '.slot-badge.slot-SFLEX')).toHaveText('SFLEX');

        // Samples aren't controls: nothing in the legend can be tabbed to or tapped.
        await expect(legend(page).locator('.sheet-body').locator('button, [data-action], [tabindex="0"]')).toHaveCount(0);

        // On a phone the SoS sample shows the calendar icon instead of "SoS: ", as on the rows.
        const isPhone = testInfo.project.name === 'phone';
        await expect(sos1.locator('.sos-badge-icon')).toBeVisible({ visible: isPhone });
        await expect(sos1.locator('.sos-badge-label')).toBeVisible({ visible: !isPhone });

        // Nothing in the legend runs past the screen's edge (phones are 390px wide here).
        const overflow = await page.evaluate(() => [...document.querySelectorAll('.badge-legend-sheet .sheet-body *')]
            .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).length);
        expect(overflow).toBe(0);
        await expectClean(page, state);
    });

    test('Lineup Strategist: the Lineup and Roster tabs\' links open it too, from the keyboard, each at its own group', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        for (const [tab, group] of [['lineup', 'Positions and slots'], ['roster', 'Ranks and tiers'], ['scout', 'Changes and trends']]) {
            await showTab(page, tab);
            const link = page.locator(`#${tab}Tab [data-action="openBadgeLegend"]`);
            await link.focus();
            await page.keyboard.press('Enter');
            await expectLegendOpen(page, tab);
            // Scrolled so the card's group is at the top of the sheet's body.
            const gap = await legend(page).evaluate((sheet, name) => {
                const g = [...sheet.querySelectorAll('.badge-legend-group')].find(el => el.querySelector('.badge-legend-group-title').textContent === name);
                return Math.abs(g.getBoundingClientRect().top - sheet.querySelector('.sheet-body').getBoundingClientRect().top);
            }, group);
            expect(gap).toBeLessThan(2);
            await page.keyboard.press('Escape');
            await expect(page.locator('.sheet-host')).toHaveCount(0);
            await expect(link).toBeFocused();
        }
        await expectClean(page, state);
    });

    test('Lineup Strategist: "Open the Guide" at the sheet\'s foot opens the Guide at the legend', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'roster');
        await page.locator('#rosterTab [data-action="openBadgeLegend"]').click();
        await legend(page).getByRole('button', { name: 'Open the Guide' }).click();
        await expect(page.locator('.sheet-host')).toHaveCount(0);
        await expectGuideLegendOpen(page);
        // The drawer marks the Guide as the current page.
        await expect(page.locator('.hamburger-menu .nav-btn[data-drawer-target="guide"]')).toHaveClass(/active-link/);
        // The Guide's own copy is the same legend.
        await expect(page.locator('#badgeLegend .badge-legend-group-title')).toHaveText(['Positions and slots', 'Ranks and tiers', 'Changes and trends', 'Availability and status', 'Schedule']);
        // Back from the Guide returns to the Roster tab: the sheet's history entry was taken off, not left behind.
        await page.goBack();
        await expect(page.locator('#rosterTab')).toHaveClass(/\bactive\b/);
        await expectClean(page, state);
    });

    test('Draft Strategist: the Tracker\'s link opens its legend', async ({ page }) => {
        const state = await openApp(page, '/');
        await showTab(page, 'tracker');
        await page.locator('#trackerTab [data-action="openBadgeLegend"]').click();
        await expectLegendOpen(page, 'tracker');
        await expect(legend(page).locator('.badge-legend-group-title')).toHaveText(['Positions and slots', 'Ranks and tiers', 'Availability and status']);
        await expect(sample(page, '.badge.badge-value')).toHaveText('+12 Value');
        await expect(sample(page, '.badge.badge-reach')).toHaveText('-5 Reach');
        await expect(sample(page, '.roster-label.sflex-blend-text')).toHaveText('SFLX');
        await expect(sample(page, '.btn-header.is-live.is-stalled')).toContainText('stalled');
        await expect(legend(page).locator('.sheet-body').locator('button, [data-action], [tabindex="0"]')).toHaveCount(0);
        await legend(page).getByRole('button', { name: 'Open the Guide' }).click();
        await expectGuideLegendOpen(page);
        await expectClean(page, state);
    });
});
