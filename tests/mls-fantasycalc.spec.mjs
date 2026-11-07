// FantasyCalc through the site (improvements K8): the browser asks the site's cached copy (/api/fantasycalc, a Pages
// Function, functions/api/fantasycalc.js, not run by serve.mjs, so stubbed here) and never api.fantasycalc.com, and
// FantasyCalc is credited near its numbers: on the Trade Analyzer's line under the verdicts (only when the market came
// from FantasyCalc, not from a file) and beside Auto-Fetch ROS Rankings.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const ROWS = [['Bijan Robinson', 'RB'], ["Ja'Marr Chase", 'WR'], ['Justin Jefferson', 'WR'], ['Jahmyr Gibbs', 'RB'], ['CeeDee Lamb', 'WR']]
    .map(([name, position], i) => ({ player: { name, position }, overallRank: i + 1 }));

test('market values come from /api/fantasycalc, and the Trade Analyzer credits FantasyCalc', async ({ page }) => {
    const proxied = [], direct = [];
    page.on('request', (r) => { if (r.url().includes('api.fantasycalc.com')) direct.push(r.url()); });
    await page.route(/\/api\/fantasycalc\?/, (route) => {
        proxied.push(new URL(route.request().url()).search);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) });
    });
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);

    // Auto-Fetch ROS Rankings has FantasyCalc's mark beside it.
    await showTab(page, 'roster');
    const rosCredit = page.locator('#autoFetchRosBtn + .market-attribution a');
    await expect(rosCredit).toHaveAttribute('href', 'https://fantasycalc.com');
    await expect(rosCredit).toHaveText(/Powered by\s+FantasyCalc/);

    await showTab(page, 'scout');
    await page.click('#scoutTab #fetchMarketValueBtn');
    await expect(page.locator('#marketSuccessMsg')).toContainText('Pulled Successfully');
    expect(proxied).toEqual(['?isDynasty=false&numQbs=1&numTeams=12&ppr=1&tep=none']);

    await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson']);
    await callApp(page, 'setTradePlayers', 'give', ["Ja'Marr Chase"]);
    await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
    const age = page.locator('#tradeOutput .mls-trade-market-age').first();
    await expect(age).toHaveText(/^Market values from FantasyCalc, updated today at \d/);
    await expect(age.locator('a')).toHaveAttribute('href', 'https://fantasycalc.com');

    // Values from a file (State.marketFormat cleared, as processMarketUpload does) keep the plain wording.
    await page.evaluate(async () => { const { State } = await import('/js/mls/state.js'); State.marketFormat = null; });
    await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
    await expect(age).toHaveText(/^Market values: Updated today/);
    await expect(age.locator('a')).toHaveCount(0);

    expect(direct).toEqual([]);
    await expectClean(page, state);
});

test('TE Premium on asks FantasyCalc for tep=te+, and a 16-team league for 14 teams', async ({ page }) => {
    const proxied = [];
    await page.route(/\/api\/fantasycalc\?/, (route) => {
        proxied.push(new URL(route.request().url()).search);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) });
    });
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
        league.settings = { ...(league.settings || {}), teams: 16 };
    });
    await showTab(page, 'scout');
    await page.locator('#marketTep').check();
    await page.click('#scoutTab #fetchMarketValueBtn');
    await expect(page.locator('#marketSuccessMsg')).toContainText('Pulled Successfully');
    expect(proxied).toEqual(['?isDynasty=false&numQbs=1&numTeams=14&ppr=1&tep=te%2B']);
    await expectClean(page, state);
});
