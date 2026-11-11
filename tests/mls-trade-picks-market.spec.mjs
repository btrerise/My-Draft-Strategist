// Improvements S38, both in the Trade Analyzer:
//   1. The same draft pick more than once. Each side is a list of entries (js/mls/trade/entries.js): "2027 1st" and
//      "2027 1st (2)", each with its own token, its own Remove and its own value in the verdict.
//   2. Market values without a trip to Trade Finder. Analyze Trade fetches them by itself, through the site's
//      /api/fantasycalc, when none are loaded for the league's format or they're over three hours old, unless
//      "Auto-fetch market values" (Value settings) is off. Each format's values are kept, so a league
//      switch brings that league's back. A failed fetch leaves the verdict by your rankings, with a line saying so.
// helpers.mjs aborts /api/fantasycalc unless a spec stubs it, as here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, RANKINGS_CSV, FIXED_NOW, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const analyzeBtn = (page) => page.locator('#analyzeTradeBtn');
const out = (page) => page.locator('#tradeOutput');
const failLine = (page) => page.locator('#tradeOutput [data-market-fail]');
const marketBanner = (page) => page.locator('#tradeOutput .trade-verdict-banner', { hasText: 'Market Consensus' });
const yourBanner = (page) => page.locator('#tradeOutput .trade-verdict-banner', { hasText: 'Your Rankings' });
const value = (rank) => Math.round(10000 * Math.pow(0.982, rank - 1));
const fmt = (n) => n.toLocaleString('en-US');

async function analyze(page) {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await analyzeBtn(page).evaluate(el => el.scrollIntoView({ block: 'center' }));
    await analyzeBtn(page).click();
}
async function setTrade(page, get, give) {
    await callApp(page, 'setTradePlayers', 'get', get);
    await callApp(page, 'setTradePlayers', 'give', give);
}

// FantasyCalc's answer: the fixture rankings in reverse order, so the market disagrees with them.
const rows = RANKINGS_CSV.trim().split('\n').slice(1).map(l => l.split(','));
const FC_BODY = JSON.stringify(rows.slice().reverse().map((r, i) => ({ player: { name: r[1], position: r[2] }, overallRank: i + 1 })));
// Stubs /api/fantasycalc and records each request's query. gate: a promise the answers wait for.
async function stubMarket(page, { gate = null } = {}) {
    const asked = [];
    await page.route(/\/api\/fantasycalc\?/, async (route) => {
        asked.push(new URL(route.request().url()).search);
        if (gate) await gate;
        return route.fulfill({ status: 200, contentType: 'application/json', body: FC_BODY });
    });
    return asked;
}

async function setup(page) {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await showTab(page, 'scout');
    return state;
}

test.describe('Trade Analyzer: the same draft pick more than once', () => {
    // The fixture league as a dynasty league with two draft rounds: you hold two 2027 1sts (yours and Rival's), Rival
    // two 2027 2nds (tests/fixtures/sleeper/make-fixtures.mjs). Market values from a "file" (no format), so nothing is fetched.
    async function setupDynasty(page) {
        const state = await openApp(page, '/lineup/');
        const league = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sleeper/league.json', import.meta.url)), 'utf8'));
        league.settings = { ...league.settings, type: 2, draft_rounds: 2 };
        await page.route(/^https:\/\/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => route.fulfill({ json: league }));
        await seedMls(page);
        await loadMlsRankings(page);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const { normalizeName } = await import('/js/shared/names.js');
            State.marketRankings = [['Bijan Robinson', 1], ["Ja'Marr Chase", 2], ['2027 1st', 10], ['2027 2nd', 30]]
                .map(([name, marketVal]) => ({ name, cleanName: normalizeName(name), marketVal, pos: '' }));
            State.marketFormat = null;
            State.tradeSettings.waiverAdjustment = false;
        });
        await showTab(page, 'scout');
        return state;
    }

    test('two 2027 1sts on one side: two tokens, two rows, counted twice; removing one leaves the other', async ({ page }) => {
        const state = await setupDynasty(page);
        const giveTokens = page.locator('#tradeGiveTokens .mls-trade-token');
        const giveRows = page.locator('#tradeOutput .mls-trade-side:has(.mls-trade-side-give) .mls-trade-row');
        const addPick = page.locator('[data-action="addTradePick"][data-side="give"]');

        await setTrade(page, ['Bijan Robinson'], []);
        await page.locator('#tradeGivePickYear').selectOption('2027');
        await page.locator('#tradeGivePickRound').selectOption('1st');
        await addPick.click();
        await addPick.click();
        await expect(giveTokens.locator('.mls-trade-token-name')).toHaveText(['2027 1st', '2027 1st (2)']);
        // Each token has its own Remove, named for it.
        await expect(giveTokens.nth(1).locator('.mls-trade-token-remove')).toHaveAttribute('aria-label', 'Remove 2027 1st (2)');

        await analyze(page);
        await expect(giveRows.locator('.mls-trade-row-name')).toHaveText(['2027 1st', '2027 1st (2)']);
        // Each is yours (you hold two) and each has the pick's market value.
        await expect(giveRows.nth(0)).toContainText('Yours');
        await expect(giveRows.nth(1)).toContainText('Yours');
        await expect(giveRows.locator('.mls-trade-row-mkt')).toHaveText([`Mkt ${fmt(value(10))}`, `Mkt ${fmt(value(10))}`]);
        // The verdict counts the pick once per entry: the side's total is twice its value.
        await expect(marketBanner(page).locator('.trade-verdict-totals')).toContainText(fmt(2 * value(10)));

        // A third: you hold only two, and its row says so.
        await addPick.click();
        await expect(giveTokens.locator('.mls-trade-token-name')).toHaveText(['2027 1st', '2027 1st (2)', '2027 1st (3)']);
        await expect(giveRows).toHaveCount(3);
        await expect(giveRows.nth(2)).toContainText('Not yours (you hold 2)');
        await expect(marketBanner(page).locator('.trade-verdict-totals')).toContainText(fmt(3 * value(10)));

        // Removing the first of them leaves two, numbered again from the plain name; the trade re-runs.
        await giveTokens.nth(0).locator('.mls-trade-token-remove').click();
        await expect(giveTokens.locator('.mls-trade-token-name')).toHaveText(['2027 1st', '2027 1st (2)']);
        await expect(giveRows).toHaveCount(2);
        await giveTokens.nth(1).locator('.mls-trade-token-remove').click();
        await expect(giveTokens.locator('.mls-trade-token-name')).toHaveText(['2027 1st']);
        await expect(giveRows).toHaveCount(1);
        await expect(marketBanner(page).locator('.trade-verdict-totals')).toContainText(fmt(value(10)));

        // A player still can't repeat: he's one person.
        await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson', 'bijan robinson', '2027 2nd', '2027 2nd']);
        await expect(page.locator('#tradeGetTokens .mls-trade-token-name')).toHaveText(['Bijan Robinson', '2027 2nd', '2027 2nd (2)']);
        await expectClean(page, state);
    });

    test('"To make it fair" with repeated picks: Remove takes one entry off, Undo puts it back, and a second pick the team holds is offered', async ({ page }) => {
        const state = await setupDynasty(page);
        const giveTokens = page.locator('#tradeGiveTokens .mls-trade-token-name');
        // Chase and both your 2027 1sts for Bijan: too much on your side, and fair with one pick fewer (a 1st priced
        // like the 150th player here). Taking one pick off is offered.
        const setMarket = (list) => page.evaluate(async (pairs) => {
            const { State } = await import('/js/mls/state.js');
            const { normalizeName } = await import('/js/shared/names.js');
            State.marketRankings = pairs.map(([name, marketVal]) => ({ name, cleanName: normalizeName(name), marketVal, pos: '' }));
        }, list);
        await setMarket([['2027 1st', 150]]);
        await page.locator('#tradeGetTeam').selectOption('Rival');
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", '2027 1st', '2027 1st']);
        await analyze(page);
        await expect(yourBanner(page)).toContainText('Favors Them');
        const removal = page.locator('#tradeOutput [data-fair-removals] [data-action="removeFairPiece"]').first();
        await expect(removal).toHaveAttribute('data-name', /^2027 1st/);
        await removal.click();
        await expect(giveTokens).toHaveText(["Ja'Marr Chase", '2027 1st']);
        await page.locator('#tradeOutput [data-action="undoFairChange"]').click();
        await expect(giveTokens).toHaveText(["Ja'Marr Chase", '2027 1st', '2027 1st (2)']);

        // Bijan, Kyren and one of Rival's two 2027 2nds for Chase, Jefferson and your 2028 2nd: short by about one
        // more 2nd. Rival's other 2027 2nd can still be suggested, and Add makes it the second entry.
        await setMarket([['2027 2nd', 64], ['2028 2nd', 64]]);
        await setTrade(page, ['Bijan Robinson', 'Kyren Williams', '2027 2nd'], ["Ja'Marr Chase", 'Justin Jefferson', '2028 2nd']);
        await analyze(page);
        await expect(yourBanner(page)).toContainText('Favors Them');
        const add = page.locator('#tradeOutput [data-fair-adds] .mls-trade-fair-item', { hasText: '2027 2nd' }).locator('[data-action="addFairSuggestion"]');
        await expect(add).toHaveCount(1);
        await add.click();
        await expect(page.locator('#tradeGetTokens .mls-trade-token-name')).toHaveText(['Bijan Robinson', 'Kyren Williams', '2027 2nd', '2027 2nd (2)']);
        await expect(yourBanner(page)).toContainText('Fair Trade');
        // Both of Rival's are in the trade now: with one more needed, there's no third to offer.
        await setTrade(page, ['Bijan Robinson', '2027 2nd', '2027 2nd'], ["Ja'Marr Chase", '2028 2nd', '2028 2nd']);
        await analyze(page);
        await expect(page.locator('#tradeOutput .mls-trade-row')).toHaveCount(6);
        await expect(page.locator('#tradeOutput [data-fair-adds] .mls-trade-fair-item', { hasText: '2027 2nd' })).toHaveCount(0);
        await expectClean(page, state);
    });
});

test.describe('Trade Analyzer: market values on Analyze', () => {
    test('no market values loaded: Analyze fetches them once, the button is busy meanwhile, and the market verdict shows', async ({ page }) => {
        let release;
        const gate = new Promise(r => { release = r; });
        const direct = [];
        page.on('request', (r) => { if (r.url().includes('api.fantasycalc.com')) direct.push(r.url()); });
        const asked = await stubMarket(page, { gate });
        const state = await setup(page);
        // The switch is under Value settings, on by default.
        await page.locator('.mls-trade-value-settings > summary').click();
        await expect(page.locator('#tradeAutoMarketToggle')).toBeChecked();
        await expect(page.locator('label[for="tradeAutoMarketToggle"]')).toHaveText('Auto-fetch market values');
        await expect(page.locator('#tradeAutoMarketToggle').locator('xpath=..').locator('.toggle-desc')).toContainText('A market file you uploaded is never replaced.');

        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(analyzeBtn(page)).toBeDisabled();
        await expect(analyzeBtn(page)).toHaveText('Fetching market values…');
        await expect(analyzeBtn(page)).toHaveAttribute('aria-busy', 'true');
        await expect(analyzeBtn(page).locator('svg.sync-spinner')).toHaveCount(1); // it looks busy: the spinner, dimmed
        await expect(analyzeBtn(page)).toHaveCSS('opacity', '0.7');
        release();
        await expect(marketBanner(page)).toHaveCount(1);
        await expect(yourBanner(page)).toHaveCount(1);
        await expect(analyzeBtn(page)).toBeEnabled();
        await expect(analyzeBtn(page)).toHaveText('Analyze Trade');
        await expect(analyzeBtn(page)).not.toHaveAttribute('aria-busy', 'true');
        // For the league's own format, through the site's function; credited under the verdicts.
        expect(asked).toEqual(['?isDynasty=false&numQbs=1&numTeams=12&ppr=1&tep=none']);
        await expect(out(page).locator('.mls-trade-market-age').first()).toHaveText(/^Market values from FantasyCalc, updated today at \d/);
        await expect(failLine(page)).toHaveCount(0);
        // Trade Finder shows them as loaded too.
        await expect(page.locator('#marketMetaDisplay')).toContainText(`Market Consensus Loaded: ${rows.length} players`);

        // Analyzing again, or changing the trade (it re-runs), fetches nothing while they're under three hours old.
        await analyze(page);
        await callApp(page, 'setTradePlayers', 'give', ["Ja'Marr Chase", 'Justin Jefferson']);
        await analyze(page);
        await expect(out(page).locator('.mls-trade-row')).toHaveCount(3);
        expect(asked.length).toBe(1);
        // They survive a reload (saved as the set in use, and under their format).
        const saved = await page.evaluate(async () => {
            const { KEYS } = await import('/js/shared/storage/keys.js');
            return { format: JSON.parse(localStorage.getItem(KEYS.mls.marketFormat)), sets: Object.keys(JSON.parse(localStorage.getItem(KEYS.mls.marketSets))) };
        });
        expect(saved.format).toEqual({ type: 'redraft', qbs: '1', ppr: '1', tep: false, teams: 12 });
        expect(saved.sets).toEqual(['redraft|1|1|none|12']);

        // Three hours on, the next Analyze refreshes them.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 3 * 60 * 60 * 1000 + 60 * 1000));
        await analyze(page);
        await expect.poll(() => asked.length).toBe(2);
        await expect(marketBanner(page)).toHaveCount(1);
        expect(direct).toEqual([]);
        await expectClean(page, state);
    });

    test('a failed fetch: the verdict by your rankings, a line saying so, no error toast; the next Analyze tries again', async ({ page }) => {
        const state = await setup(page); // helpers.mjs aborts /api/fantasycalc: an offline phone
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(yourBanner(page)).toHaveCount(1);
        await expect(marketBanner(page)).toHaveCount(0);
        await expect(failLine(page)).toHaveText("Market values couldn't load, so this is by your rankings only. Analyze again to retry.");
        await expect(analyzeBtn(page)).toBeEnabled();
        // The line sits right under the verdict it explains.
        expect(await page.evaluate(() => document.querySelector('#tradeOutput [data-market-fail]').previousElementSibling.className)).toContain('trade-verdict-banner');
        await expect(analyzeBtn(page)).toHaveText('Analyze Trade');
        await expect(page.locator('.mds-toast.show')).toHaveCount(0);

        // Changing the trade re-runs it without asking again right away; the line stays.
        const requests = [];
        page.on('request', (r) => { if (r.url().includes('/api/fantasycalc')) requests.push(r.url()); });
        await callApp(page, 'setTradePlayers', 'give', ["Ja'Marr Chase", 'Justin Jefferson']);
        await page.locator('#tradeGiveTokens .mls-trade-token').nth(1).locator('.mls-trade-token-remove').click();
        await expect(out(page).locator('.mls-trade-side:has(.mls-trade-side-give) .mls-trade-row')).toHaveCount(1);
        await expect(failLine(page)).toHaveCount(1);
        expect(requests).toEqual([]);

        // Back online: Analyze again loads them, and the line goes.
        const asked = await stubMarket(page);
        await analyze(page);
        await expect(marketBanner(page)).toHaveCount(1);
        await expect(failLine(page)).toHaveCount(0);
        expect(asked.length).toBe(1);
        await expectClean(page, state); // no console.error, no uncaught error
    });

    test('older values and a failed refresh: they stay in use, and the line says they are the earlier ones', async ({ page }) => {
        const asked = await stubMarket(page);
        const state = await setup(page);
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(marketBanner(page)).toHaveCount(1);
        expect(asked.length).toBe(1);
        await page.unroute(/\/api\/fantasycalc\?/);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 4 * 60 * 60 * 1000));
        await analyze(page);
        await expect(failLine(page)).toHaveText("Market values couldn't be refreshed: these are the ones loaded earlier. Analyze again to retry.");
        await expect(marketBanner(page)).toHaveCount(1);
        await expectClean(page, state);
    });

    test('the switch off, or a market file uploaded: nothing is fetched', async ({ page }) => {
        const asked = await stubMarket(page);
        const state = await setup(page);
        await page.locator('.mls-trade-value-settings > summary').click();
        await page.locator('#tradeAutoMarketToggle').uncheck();
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(yourBanner(page)).toHaveCount(1);
        await expect(marketBanner(page)).toHaveCount(0);
        await expect(failLine(page)).toHaveCount(0);
        expect(asked).toEqual([]);
        // With a pick in the trade, the note points back at the switch as well as Trade Finder.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).leagueType = 'dynasty';
        });
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", '2027 1st']);
        await analyze(page);
        await expect(page.locator('#tradeOutput [data-picks-unvalued]').first()).toHaveText('2027 1st needs market values, so this total is missing it. Turn on Auto-fetch market values (Value settings, above), or fetch them in Trade Finder (below).');
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        expect(asked).toEqual([]);
        // The choice is saved.
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'scout');
        await expect(page.locator('#tradeAutoMarketToggle')).not.toBeChecked();

        // On again, but with a market file uploaded: your file is used as it is, never replaced.
        await page.locator('.mls-trade-value-settings > summary').click();
        await page.locator('#tradeAutoMarketToggle').check();
        await page.setInputFiles('#marketFileInput', { name: 'market.csv', mimeType: 'text/csv', buffer: Buffer.from("Player,Overall Rank\nBijan Robinson,3\nJa'Marr Chase,1\n") });
        await expect(page.locator('#marketMetaDisplay')).toContainText('Market Consensus Loaded: 2 players');
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(marketBanner(page)).toHaveCount(1);
        await expect(out(page).locator('.mls-trade-market-age').first()).toHaveText(/^Market values: Updated today/);
        expect(asked).toEqual([]);
        await expectClean(page, state);
    });

    test('each league has its own market values: fetched for its format, and back after a league switch without a new fetch', async ({ page }) => {
        const asked = await stubMarket(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID); // the dynasty league
        await page.click('#mainSyncBtn');
        await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
        await page.waitForLoadState('networkidle');
        for (const id of [FIXTURE_LEAGUE2_ID, FIXTURE_LEAGUE_ID]) {
            await callApp(page, 'switchActiveLeague', id);
            await showTab(page, 'roster');
            await loadMlsRankings(page);
        }
        await showTab(page, 'scout');
        const meta = page.locator('#marketMetaDisplay');
        const format = () => page.evaluate(async () => (await import('/js/mls/state.js')).State.marketFormat.type);

        // The redraft league first.
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(marketBanner(page)).toHaveCount(1);
        expect(asked).toEqual(['?isDynasty=false&numQbs=1&numTeams=12&ppr=1&tep=none']);

        // The dynasty league: the redraft values are still what's loaded (Trade Finder says so) until Analyze brings its own.
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE2_ID);
        await expect(meta.locator('.mls-market-format-warning')).toContainText('Fetched for redraft; this league is dynasty.');
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(out(page)).toContainText('You Receive');
        await expect.poll(() => asked.length).toBe(2);
        expect(asked[1]).toMatch(/^\?isDynasty=true&/);
        await expect(meta.locator('.mls-market-format-warning')).toHaveCount(0);
        await expect(out(page).locator('.mls-trade-market-age.is-stale')).toHaveCount(0);
        await expect.poll(format).toBe('dynasty');

        // Back and forth: each league's values return with it, with no warning and no new request.
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE_ID);
        await expect.poll(format).toBe('redraft');
        await expect(meta.locator('.mls-market-format-warning')).toHaveCount(0);
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(marketBanner(page)).toHaveCount(1);
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE2_ID);
        await expect.poll(format).toBe('dynasty');
        expect(asked.length).toBe(2);
        await expectClean(page, state);
    });

    // Trade Finder's Find Trade Targets works the same way (owner, after S38).
    test('Find Trade Targets: fetches the league\'s market values once, busy meanwhile; a failed fetch says so', async ({ page }) => {
        const state = await setup(page); // /api/fantasycalc aborted: offline
        const btn = page.locator('#findTradeTargetsBtn');
        const report = page.locator('#marketDisconnectOutput');
        await btn.click();
        await expect(report.locator('[data-market-fail]')).toHaveText("Market values couldn't load. Tap Find Trade Targets to try again, or upload a market file above.");
        await expect(btn).toBeEnabled();
        await expect(page.locator('.mds-toast.show')).toHaveCount(0);

        // Online: one request for the league's format, the button busy until it answers, then the report.
        let release;
        const gate = new Promise(r => { release = r; });
        const asked = await stubMarket(page, { gate });
        await btn.click();
        await expect(btn).toBeDisabled();
        await expect(btn).toHaveText('Fetching market values…');
        release();
        await expect(report.locator('.scout-result-card').first()).toBeVisible();
        await expect(btn).toBeEnabled();
        await expect(btn).toHaveText('Find Trade Targets');
        await expect(report.locator('[data-market-fail]')).toHaveCount(0);
        expect(asked).toEqual(['?isDynasty=false&numQbs=1&numTeams=12&ppr=1&tep=none']);
        // Again, and Analyze Trade after it: the same values, no new request.
        await btn.click();
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await analyze(page);
        await expect(marketBanner(page)).toHaveCount(1);
        expect(asked.length).toBe(1);

        // Three hours on and offline again: the report stays on the earlier values and says so.
        await page.unroute(/\/api\/fantasycalc\?/);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 4 * 60 * 60 * 1000));
        await btn.click();
        await expect(report.locator('[data-market-fail]')).toHaveText("Market values couldn't be refreshed: these are the ones loaded earlier. Tap Find Trade Targets to retry.");
        await expect(report.locator('.scout-result-card').first()).toBeVisible();

        // The switch off: nothing is fetched.
        const again = await stubMarket(page);
        await page.locator('.mls-trade-value-settings > summary').click();
        await page.locator('#tradeAutoMarketToggle').uncheck();
        await btn.click();
        await expect(report.locator('.scout-result-card').first()).toBeVisible();
        expect(again).toEqual([]);
        await expectClean(page, state);
    });

    // Round 3 (owner's choice): "Fair Trade" showed over two unvalued 1sts when the fetch failed.
    test('a pick with no value: Incomplete, not a verdict that leaves it out; valued, the verdict returns', async ({ page }) => {
        const state = await setup(page); // offline
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).leagueType = 'dynasty';
        });
        await setTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", '2027 1st', '2027 1st']);
        await analyze(page);
        await expect(yourBanner(page).locator('.trade-verdict-result')).toHaveText('Incomplete');
        await expect(yourBanner(page).locator('[data-picks-unvalued]')).toHaveText('Both 2027 1sts need market values, so this total is missing them.');
        await expect(failLine(page)).toHaveCount(1);
        // No "To make it fair" and no value headline on a total that's missing pieces.
        await expect(page.locator('#tradeOutput [data-trade-fair]')).toHaveCount(0);
        await expect(page.locator('#tradeOutput .mls-trade-impact-headline')).toHaveCount(0);

        // Online: the picks get the market's value and both verdicts are back.
        await page.route(/\/api\/fantasycalc\?/, (route) => route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify(JSON.parse(FC_BODY).concat([{ player: { name: '2027 1st', position: 'PICK' }, overallRank: 12 }])) }));
        await analyze(page);
        await expect(yourBanner(page).locator('.trade-verdict-result')).toContainText('Favors Them');
        await expect(marketBanner(page).locator('.trade-verdict-result')).toContainText('Favors Them');
        await expect(page.locator('#tradeOutput [data-picks-unvalued]')).toHaveCount(0);
        await expectClean(page, state);
    });
});
