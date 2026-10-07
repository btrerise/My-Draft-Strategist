// Lineup Strategist Scout tab: Sleeper trending adds in Top Available (improvements S6,
// js/mls/scout/topAvailable.js, getSleeperTrendingAdds in js/shared/api/sleeper.js). The fixture's
// trending list (trending-add.json, from make-fixtures.mjs), most adds first: Chase Brown 8214 (free,
// ranked), Ja'Marr Chase 7012 (rostered in the Fixture League), Tre Tucker 5120 (free, in no rankings
// file), Sam LaPorta 2010 (free), an id the player map doesn't have, Zay Flowers 640 (free).
// Trending is a badge and a separate view: the ranked list's order never changes.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const out = (page) => page.locator('#waiverOutput');
const chip = (page, pos) => page.locator(`#waiverPosChips [data-pos="${pos}"]`);
const view = (page, v) => page.locator(`#waiverTopViewToggle [data-view="${v}"]`);
const rowNames = (page) => out(page).locator('.mls-ta-name').allInnerTexts();
const row = (page, name) => out(page).locator('.mls-ta-row').filter({ has: page.locator('.mls-ta-name', { hasText: name }) });

test.describe('Lineup Strategist trending adds', () => {
    test('badges on ranked rows, and the Trending view with your rank or UR', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'scout');
        // No league, then no rankings: no list, so no toggle (and no trending request).
        await expect(page.locator('#waiverTopViewWrap')).toBeHidden();
        await showTab(page, 'setup');
        await seedMls(page);
        await showTab(page, 'scout');
        await expect(out(page)).toContainText('No rankings loaded.');
        await expect(page.locator('#waiverTopViewWrap')).toBeHidden();

        await showTab(page, 'lineup');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'scout');
        await expect(page.locator('#waiverTopViewWrap')).toBeVisible();
        await expect(view(page, 'ranked')).toHaveAttribute('aria-pressed', 'true');
        await expect(view(page, 'trending').locator('svg')).toHaveAttribute('aria-hidden', 'true');

        // The ranked list keeps its order (S1's spec checks the same names); trending players get the icon.
        expect(await rowNames(page)).toEqual(['Jayden Daniels', 'James Cook', 'Chase Brown', 'Jaxon Smith-Njigba', 'Zay Flowers', 'Sam LaPorta']);
        await expect(out(page).locator('.mls-ta-trend')).toHaveCount(3);
        const brown = row(page, 'Chase Brown').locator('.mls-ta-trend');
        await expect(brown).toHaveAttribute('title', 'Added in 8,214 Sleeper leagues in the last 24 hours');
        await expect(brown).toHaveAttribute('aria-label', 'Trending: added in 8,214 sleeper leagues in the last 24 hours');
        await expect(brown.locator('svg')).toHaveAttribute('aria-hidden', 'true');
        await expect(brown.locator('svg')).toHaveAttribute('stroke', 'currentColor');
        // Green, like Sleeper's own trending arrow (--primary-green, css/base.css).
        await expect(brown).toHaveCSS('color', 'rgb(16, 185, 129)');
        await expect(row(page, 'Zay Flowers').locator('.mls-ta-trend')).toHaveAttribute('title', 'Added in 640 Sleeper leagues in the last 24 hours');
        await expect(row(page, 'Sam LaPorta').locator('.mls-ta-trend')).toHaveCount(1);
        await expect(row(page, 'James Cook').locator('.mls-ta-trend')).toHaveCount(0);
        await expect(row(page, 'Jayden Daniels').locator('.mls-ta-trend')).toHaveCount(0);

        // Trending: free trending adds, most adds first. Ja'Marr Chase is rostered and the unknown id
        // has no player, so both are left out; Tre Tucker is in no rankings file, so UR.
        await view(page, 'trending').click();
        await expect(view(page, 'trending')).toHaveAttribute('aria-pressed', 'true');
        await expect(out(page)).toContainText("Sleeper's most-added players in the last 24 hours still available in Fixture League, most adds first.");
        await expect(out(page)).toContainText("Ownership is from this league's last sync");
        await expect(out(page).locator('.mls-ta-title')).toHaveText('Trending · 4 available');
        await expect(out(page).locator('.mls-ta-col')).toHaveText('Adds 24h');
        expect(await rowNames(page)).toEqual(['Chase Brown', 'Tre Tucker', 'Sam LaPorta', 'Zay Flowers']);
        await expect(out(page).locator('.mls-ta-num')).toHaveText(['8.2k', '5.1k', '2k', '640']);
        await expect(row(page, 'Chase Brown').locator('.mls-ta-num')).toHaveAttribute('title', 'Added in 8,214 Sleeper leagues in the last 24 hours');
        await expect(row(page, 'Chase Brown').locator('.mls-ta-pos')).toHaveText(/^RB9\b/);
        await expect(row(page, 'Chase Brown')).toContainText('CIN');
        await expect(row(page, 'Tre Tucker').locator('.mls-ta-pos')).toHaveText('WR UR');
        await expect(row(page, 'Tre Tucker')).toContainText('LV');
        await expect(row(page, 'Sam LaPorta').locator('.mls-ta-pos')).toHaveText(/^TE4\b/);
        await expect(row(page, 'Zay Flowers').locator('.mls-ta-pos')).toHaveText(/^WR12\b/);

        // Position chips filter the Trending view too.
        await chip(page, 'WR').click();
        await expect(view(page, 'trending')).toHaveAttribute('aria-pressed', 'true');
        await expect(out(page)).toContainText("Sleeper's most-added WRs in the last 24 hours");
        expect(await rowNames(page)).toEqual(['Tre Tucker', 'Zay Flowers']);
        await chip(page, 'QB').click();
        await expect(out(page)).toContainText("No QB among Sleeper's 6 most-added players of the last 24 hours is available in this league.");

        // Back to your rankings: the same ranked list as before.
        await chip(page, 'ALL').click();
        await view(page, 'ranked').click();
        await expect(out(page)).toContainText('Top available players in Fixture League by Weekly rank.');
        expect(await rowNames(page)).toEqual(['Jayden Daniels', 'James Cook', 'Chase Brown', 'Jaxon Smith-Njigba', 'Zay Flowers', 'Sam LaPorta']);

        // Other modes hide the toggle.
        await page.locator('#waiverModeToggle [data-mode="auto"]').click();
        await expect(page.locator('#waiverTopViewWrap')).toBeHidden();

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('add counts are abbreviated with k and M', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        const shown = await page.evaluate(async (ns) => {
            const { compactCount } = await import('/js/mls/scout/topAvailable.js');
            return ns.map(compactCount);
        }, [640, 999, 1000, 2010, 8214, 9960, 15400, 999499, 999600, 1240000, 3000000, 12600000]);
        expect(shown).toEqual(['640', '999', '1k', '2k', '8.2k', '10k', '15k', '999k', '1M', '1.2M', '3M', '13M']);
        await expectClean(page, state);
    });

    test('a manual league keeps the "not on your roster" wording', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await page.locator('#newLeagueName').evaluate((el) => { el.value = 'Manual League'; });
        await callApp(page, 'createManualLeague');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'scout');
        await view(page, 'trending').click();

        const o = out(page);
        await expect(o).toContainText("Sleeper's most-added players in the last 24 hours not on your roster in Manual League, most adds first.");
        await expect(o).toContainText('This is a manual league, so the app only knows your own roster.');
        await expect(o.locator('.mls-ta-title')).toHaveText('Trending · 5 not on your roster');
        // The manual league's roster is empty, so Ja'Marr Chase counts here.
        expect(await rowNames(page)).toEqual(['Chase Brown', "Ja'Marr Chase", 'Tre Tucker', 'Sam LaPorta', 'Zay Flowers']);
        await expect(row(page, "Ja'Marr Chase").locator('.mls-ta-pos')).toHaveText(/^WR1\b/);

        await page.waitForLoadState('networkidle');
        await expectClean(page, state);
    });

    for (const [how, handler] of [
        ['offline', (route) => route.abort('internetdisconnected')],
        ['a server error', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' })],
    ]) {
        test(`${how}: no badge, no toggle, no error`, async ({ page }) => {
            const state = await openApp(page, '/lineup/');
            let asked = 0;
            await page.route(/api\.sleeper\.app\/v1\/players\/nfl\/trending\/add/, (route) => { asked++; return handler(route); });
            await seedMls(page);
            await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
            await showTab(page, 'scout');

            await expect(out(page)).toContainText('Top available players in Fixture League by Weekly rank.');
            await page.waitForLoadState('networkidle');
            expect(asked).toBeGreaterThan(0);
            expect(await rowNames(page)).toEqual(['Jayden Daniels', 'James Cook', 'Chase Brown', 'Jaxon Smith-Njigba', 'Zay Flowers', 'Sam LaPorta']);
            await expect(out(page).locator('.mls-ta-trend')).toHaveCount(0);
            await expect(page.locator('#waiverTopViewWrap')).toBeHidden();
            await expect(out(page)).not.toContainText('Trending');
            // No error toast (the sync's own toast may still be up).
            expect((await page.locator('#mds-toast').allInnerTexts()).join(' ')).not.toMatch(/trend|couldn't|failed/i);

            // A redraw soon after doesn't ask again (5-minute back-off) and still shows nothing.
            await chip(page, 'RB').click();
            await expect(out(page)).toContainText('Top available RBs in Fixture League');
            await page.waitForLoadState('networkidle');
            expect(asked).toBe(1);
            await expect(page.locator('#waiverTopViewWrap')).toBeHidden();

            await expectClean(page, state);
        });
    }
});
