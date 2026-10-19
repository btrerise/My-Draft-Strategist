// What a tab switch redraws (improvements S17). Showing the Dashboard redraws its league cards, but when they come
// out exactly as they are, the cards on the page are kept (with 21 leagues, rebuilding identical cards was most of
// a switch's time on a slow phone); anything that changes a card redraws it. A Lineup render no longer redraws the
// Dashboard while it's hidden: showing the Dashboard does that. Cards are told apart by a mark the test puts on the
// card element, which a rebuild drops.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const markCard = (page) => page.evaluate(() => { document.querySelector('#leagueCards > .mls-lc-card').dataset.probe = '1'; });
const cardKept = (page) => page.evaluate(() => document.querySelector('#leagueCards > .mls-lc-card')?.dataset.probe === '1');
const cardHTML = (page) => page.locator('#leagueCards').innerHTML();

test.describe('Tab switches redraw only what changed', () => {
    test('the Dashboard keeps unchanged cards, and redraws a changed one', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'setup');
        await expect(page.locator('#leagueCards > .mls-lc-card')).toHaveCount(1);
        await markCard(page);
        const before = await cardHTML(page);

        // Away and back with nothing changed: the same card element.
        await showTab(page, 'roster');
        await showTab(page, 'setup');
        expect(await cardKept(page)).toBe(true);

        // Rankings uploaded while the Dashboard is hidden change the card (its rankings chip): redrawn on showing.
        await showTab(page, 'lineup');
        await loadMlsRankings(page);
        await showTab(page, 'setup');
        expect(await cardKept(page)).toBe(false);
        expect(await cardHTML(page)).not.toBe(before);

        // And a change made while it shows (folding every card) still shows at once.
        await markCard(page);
        await page.locator('#foldAllLeagueCards').click();
        await expect(page.locator('#leagueCards > .mls-lc-card')).toHaveClass(/is-collapsed/);
        await expectClean(page, state);
    });

    test('a Lineup render leaves the hidden Dashboard alone; showing it brings it up to date', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'setup');
        await markCard(page);

        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        expect(await cardKept(page)).toBe(true);

        // What the card would show now is what it shows once the Dashboard is back.
        await showTab(page, 'setup');
        const shown = await cardHTML(page);
        await callApp(page, 'renderLeagueCards');
        expect(await cardHTML(page)).toBe(shown);
        await expectClean(page, state);
    });
});
