// Lineup Strategist's Market Consensus after refactor 7A: LeagueLogs (API retired, 410) is gone
// and FantasyCalc is the only source. A user whose saved mls_market_settings still says
// source 'leaguelogs' must get a working FantasyCalc fetch with the rest of their settings kept.
// FantasyCalc is stubbed here: since improvements K8 the app asks the site's cached copy,
// /api/fantasycalc (functions/api/fantasycalc.js, not run by serve.mjs), never api.fantasycalc.com.
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, showTab, fetchMarketValue, openMarketSource } from './helpers.mjs';

test('a saved LeagueLogs market source becomes FantasyCalc, and the fetch works', async ({ page }) => {
    const state = await preparePage(page);
    await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('mls_market_settings', JSON.stringify({ source: 'leaguelogs', type: 'dynasty', qbs: '2', ppr: '0.5', tep: true }));
    });
    const fcRequests = [];
    await page.route(/\/api\/fantasycalc\?/, (route) => {
        fcRequests.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
            { player: { name: "Ja'Marr Chase", position: 'WR' }, overallRank: 1 },
            { player: { name: 'Bijan Robinson', position: 'RB' }, overallRank: 2 },
        ]) });
    });
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);

    // Neither Market Source select offers LeagueLogs any more, and both show FantasyCalc.
    for (const id of ['#marketSourceSelect', '#rosMarketSourceSelect']) {
        await expect(page.locator(id)).toHaveValue('fantasycalc');
        await expect(page.locator(`${id} option`)).toHaveText(['FantasyCalc.com (Trade Value)']);
    }
    await showTab(page, 'scout');
    // Folded under "Market source" (improvements S38, round 4), its summary naming the saved format.
    await expect(page.locator('#fantasycalcSpecificControls')).toBeHidden();
    await expect(page.locator('#marketSourceSummary')).toHaveText('FantasyCalc · Dynasty · Superflex · Half PPR · TEP');
    await expect(page.locator('#attributionLink')).toBeVisible(); // the credit stays in view, by Find Trade Targets
    await openMarketSource(page);
    await expect(page.locator('#fantasycalcSpecificControls')).toBeVisible();
    await expect(page.locator('label[for="marketFileInput"]')).toHaveText('Upload a market file (KTC or FantasyCalc, .csv or .xlsx)');
    await expect(page.locator('#attributionLink')).toHaveAttribute('href', 'https://fantasycalc.com');
    await expect(page.locator('#attributionBrand')).toHaveText('FantasyCalc');

    await fetchMarketValue(page);
    await expect(page.locator('#marketSuccessMsg')).toContainText('Pulled Successfully');
    // The other saved settings were kept: dynasty, superflex, half PPR, TE premium.
    // TE premium goes as FantasyCalc's tep=te+ (it never read the isTEP the app used to send).
    expect(fcRequests.map(u => new URL(u).pathname + new URL(u).search)).toEqual(['/api/fantasycalc?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5&tep=te%2B']);
    const market = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_market')));
    expect(market.map(p => p.name)).toEqual(["Ja'Marr Chase", 'Bijan Robinson']);

    // Changing any market setting saves the mapped source under the same key.
    await page.selectOption('#marketPpr', '1');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_market_settings')));
    expect(saved).toEqual({ source: 'fantasycalc', type: 'dynasty', qbs: '2', ppr: '1', tep: true });
    await expectClean(page, state);
});
