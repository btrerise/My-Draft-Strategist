// The Trade Analyzer's verdicts when a name or a value is missing (improvements S19, round 11; found in my review as a
// user): a typo'd name counted as 0 still got "Fair Trade", and the market banner read "est. 0 ... Favors Them (100%)"
// when the market had none of one side's players.
//   - A name that matches no player at all: no verdict yet, one banner naming it; nothing built on the totals (the
//     value headline, "To make it fair") until it's fixed.
//   - A real player one source doesn't price: that banner says "Incomplete" and who's missing, not Fair / Favors.
//     Your Rankings counting an unranked player as 0 stays (the card's rule), and says so in words.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

async function runTrade(page, get, give) {
    await callApp(page, 'setTradePlayers', 'get', get);
    await callApp(page, 'setTradePlayers', 'give', give);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const btn = page.locator('[data-action="runScout"][data-scout-type="trade"]');
    await btn.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await btn.click();
    await expect(page.locator('#tradeOutput')).toContainText('You Receive');
}
const setMarket = (page, rows) => page.evaluate(async (rows) => {
    const { State } = await import('/js/mls/state.js');
    const { normalizeName } = await import('/js/shared/names.js');
    State.marketRankings = rows.map(([name, marketVal]) => ({ name, cleanName: normalizeName(name), marketVal, pos: '' }));
}, rows);
const banners = (page) => page.locator('#tradeOutput .trade-verdict-banner');
const at375 = (page) => test.info().project.name === 'phone' ? page.setViewportSize({ width: 375, height: 844 }) : null;

async function setup(page) {
    await at375(page);
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await showTab(page, 'scout');
    return state;
}

test.describe('Trade verdicts with a name or a value missing', () => {
    test('a typo\'d name: no verdict until it\'s fixed, then the verdict', async ({ page }) => {
        const state = await setup(page);
        await setMarket(page, [['Bijan Robinson', 2], ['Jahmyr Gibbs', 4], ["Ja'Marr Chase", 1], ['Justin Jefferson', 3]]);
        // Gibbs misspelled: by both lenses the trade would be lopsided or "fair" on a wrong total.
        await runTrade(page, ['Bijan Robinson', 'Jahmry Gibbs'], ["Ja'Marr Chase", 'Justin Jefferson']);
        const held = page.locator('#tradeOutput [data-verdict-held]');
        await expect(held).toHaveCount(1);
        await expect(held).toContainText('No verdict yet');
        await expect(held).toContainText("Couldn't match Jahmry Gibbs to a player.");
        await expect(banners(page).filter({ hasText: /Fair Trade|Favors/ })).toHaveCount(0);
        // Nothing built on the totals: no "To make it fair", no value headline.
        await expect(page.locator('#tradeOutput [data-trade-fair]')).toHaveCount(0);
        await expect(page.locator('#tradeOutput .mls-trade-impact-headline')).toHaveCount(0);
        // "Did you mean" fixes it, and the verdicts come back.
        await page.locator('#tradeOutput .scout-suggest-link').first().click();
        await runTrade(page, ['Bijan Robinson', 'Jahmyr Gibbs'], ["Ja'Marr Chase", 'Justin Jefferson']);
        await expect(held).toHaveCount(0);
        await expect(banners(page).filter({ hasText: /Fair Trade|Favors/ })).toHaveCount(2);
        await expectClean(page, state);
    });

    test('a player the market doesn\'t price: that banner says Incomplete and who; yours still decides', async ({ page }) => {
        const state = await setup(page);
        // The market lacks Saquon (a real, ranked player).
        await setMarket(page, [["Ja'Marr Chase", 1], ['Bijan Robinson', 2]]);
        await runTrade(page, ['Saquon Barkley'], ["Ja'Marr Chase"]);
        const market = banners(page).filter({ hasText: /by market consensus/i });
        await expect(market).toHaveClass(/verdict-incomplete/);
        await expect(market.locator('.trade-verdict-result')).toHaveText('Incomplete');
        await expect(market).toContainText("Saquon Barkley isn't in the Market Consensus data");
        await expect(market).not.toContainText('Favors');
        const yours = banners(page).filter({ hasText: /by your rankings/i });
        await expect(yours.locator('.trade-verdict-result')).toContainText(/Fair Trade|Favors/);
        await expectClean(page, state);
    });

    test('a real player your rankings don\'t have counts as 0, and says so', async ({ page }) => {
        const state = await setup(page);
        // Tre Tucker: in Sleeper's player map (a free agent) but not in the rankings.
        await runTrade(page, ['Bijan Robinson', 'Tre Tucker'], ["Ja'Marr Chase"]);
        await expect(page.locator('#tradeOutput [data-verdict-held]')).toHaveCount(0);
        const yours = banners(page).filter({ hasText: /by your rankings/i });
        await expect(yours.locator('.trade-verdict-result')).toContainText(/Fair Trade|Favors/);
        await expect(yours).toContainText("Tre Tucker isn't in your ROS rankings, so he counts as 0.");
        await expectClean(page, state);
    });
});
