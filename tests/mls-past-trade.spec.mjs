// The Roster tab's past trade (improvements S29): under the Power Rankings strip, a trade this season and each team's
// ranks right before → right after it, rebuilt from Sleeper's transactions. The fixture trade (tests/fixtures/sleeper/
// make-fixtures.mjs): in week 1 you sent Rival Chase, Jefferson and Lamb for Bijan, Gibbs and Saquon.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const fixture = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/sleeper/${name}`, import.meta.url)), 'utf8'));
const TRADE = fixture('league-transactions-trade.json');
const TRADED_ROSTERS = fixture('league-rosters-traded.json');

const GET = ['Bijan Robinson', 'Jahmyr Gibbs', 'Saquon Barkley'];
const GIVE = ["Ja'Marr Chase", 'Justin Jefferson', 'CeeDee Lamb'];

// Serves the rosters after the trade and the trade in week 1 (week 2: `week2`, default none), then syncs again.
async function tradeGoesThrough(page, { week2 = [], rosters = TRADED_ROSTERS } = {}) {
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, r => r.fulfill({ json: rosters }));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/transactions\/\d+$/, r =>
        r.fulfill({ json: r.request().url().endsWith('/1') ? TRADE : week2 }));
    await showTab(page, 'setup');
    await seedMls(page);
}

const line = (page) => page.locator('#rosterTradeLine');
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Roster tab: what a past trade did to your Power Rankings', () => {
    test('the line equals the Trade Analyzer\'s ranks for the same trade before it happened', async ({ page }) => {
        if (test.info().project.name === 'phone') await page.setViewportSize({ width: 375, height: 844 });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);

        // Before the trade: the Trade Analyzer's "Power Rankings after the trade", your row.
        await showTab(page, 'scout');
        await callApp(page, 'setTradePlayers', 'get', GET);
        await callApp(page, 'setTradePlayers', 'give', GIVE);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        const you = page.locator('#tradeOutput [data-trade-impact] table').first().locator('tr.mls-power-you');
        await expect(you).toHaveCount(1);
        const heads = await page.locator('#tradeOutput [data-trade-impact] table').first().locator('thead th').allTextContents();
        const cells = await you.locator('td').evaluateAll(tds => tds.map(td => (td.querySelector('.mls-dotted-underline') || td).textContent.trim()));
        const analyzer = [];
        heads.forEach((h, i) => {
            const m = /^(\d+)→(\d+)$/.exec(cells[i] || '');
            if (m) analyzer.push(`${h.trim()} ${m[1]} → ${m[2]}`);
        });
        expect(analyzer.length).toBeGreaterThan(0);

        // The trade goes through on Sleeper, and the league is synced again.
        await tradeGoesThrough(page);
        await showTab(page, 'roster');
        await expect(line(page)).toBeVisible();
        await expect(line(page).locator('.mls-roster-trade-title')).toHaveText('Since your trade with Rival on Sep 8');
        // One trade: no drop-down. The failed waiver claim in the same week is skipped.
        await expect(line(page).locator('select')).toHaveCount(0);
        await expect(line(page).locator('.mls-roster-trade-gets')).toContainText('You got Bijan Robinson, Jahmyr Gibbs, Saquon Barkley');
        await expect(line(page).locator('.mls-roster-trade-gets')).toContainText("Rival got Ja'Marr Chase, Justin Jefferson, CeeDee Lamb");
        await expect(line(page).locator('dt')).toHaveText(['You', 'Rival']);
        const yours = (await line(page).locator('dd').first().locator('.mls-trade-rank-up, .mls-trade-rank-down').allTextContents());
        expect(yours).toEqual(analyzer);
        await expect(line(page).locator('dd').first().locator('.mls-trade-rank-up')).toContainText(['RB 2 → 1']);
        await expect(line(page).locator('dd').first().locator('.mls-trade-rank-down')).toContainText(['WR 1 → 2']);
        // Rival, the other way round.
        await expect(line(page).locator('dd').nth(1)).toContainText('RB 1 → 2');
        await expect(line(page).locator('dd').nth(1)).toContainText('WR 2 → 1');
        // Today's strip agrees with "after" (no move since).
        await expect(page.locator('#rosterPowerStrip .mls-roster-power-stat').filter({ hasText: 'RB' }).locator('.mls-roster-power-stat-rank')).toHaveText('1');
        await expect(line(page)).toContainText('right before → right after this trade, out of 2 teams');
        expect(await noSideScroll(page)).toBe(true);
        await expectClean(page, state);
    });

    test('several trades: a drop-down, your newest first; each trade on its own', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        // A second trade in week 2: your Derrick Henry for Rival's De'Von Achane, on today's rosters too.
        const rosters = TRADED_ROSTERS.map(r => ({
            ...r, players: r.roster_id === 1 ? r.players.map(id => id === '3198' ? '9226' : id) : r.players.map(id => id === '9226' ? '3198' : id),
        }));
        const second = { ...TRADE[0], transaction_id: '3000000000000000003', leg: 2, adds: { 9226: 1, 3198: 2 }, drops: { 9226: 2, 3198: 1 },
            created: Date.parse('2026-09-12T18:00:00Z'), status_updated: Date.parse('2026-09-12T18:00:00Z') };
        await tradeGoesThrough(page, { week2: [second], rosters });
        await showTab(page, 'roster');
        const select = line(page).locator('select');
        await expect(select).toBeVisible();
        await expect(select.locator('option')).toHaveText(['Sep 12: You ↔ Rival', 'Sep 8: You ↔ Rival']);
        await expect(line(page).locator('.mls-roster-trade-title')).toHaveText('Since your trade with Rival on Sep 12');
        await expect(line(page).locator('.mls-roster-trade-gets')).toContainText("You got De'Von Achane");
        // The first trade, picked: the same numbers as when it was the only one (the later trade is undone first).
        await select.selectOption({ label: 'Sep 8: You ↔ Rival' });
        await expect(line(page).locator('.mls-roster-trade-title')).toHaveText('Since your trade with Rival on Sep 8');
        await expect(line(page).locator('dd').first()).toContainText('RB 2 → 1');
        await expect(line(page).locator('dd').first()).toContainText('WR 1 → 2');
        // The pick lasts while you stay on the tab.
        await showTab(page, 'lineup');
        await showTab(page, 'roster');
        await expect(line(page).locator('.mls-roster-trade-title')).toHaveText('Since your trade with Rival on Sep 8');
        await expectClean(page, state);
    });

    test('no trades this season: no line; Sleeper asked once per visit, only on the Roster tab', async ({ page }) => {
        const requests = [];
        page.on('request', r => { if (/\/transactions\/\d+$/.test(r.url())) requests.push(r.url()); });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        expect(requests).toEqual([]);
        await showTab(page, 'roster');
        await expect(page.locator('#rosterPowerStrip')).toBeVisible();
        await expect.poll(() => requests.length).toBe(2); // weeks 1 and 2
        await page.waitForLoadState('networkidle');
        await expect(line(page)).toBeHidden();
        await showTab(page, 'lineup');
        await showTab(page, 'roster');
        await page.waitForLoadState('networkidle');
        expect(requests.length).toBe(2);
        await expectClean(page, state);
    });

    test('Sleeper fails: no line and no toast', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/transactions\/\d+$/, r => r.fulfill({ status: 500, body: 'oops' }));
        await showTab(page, 'roster');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#rosterPowerStrip')).toBeVisible();
        await expect(line(page)).toBeHidden();
        await expect(page.locator('.toast, #toast-container > *')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('a manual league: no line, and Sleeper isn\'t asked', async ({ page }) => {
        const requests = [];
        page.on('request', r => { if (/\/transactions\/\d+$/.test(r.url())) requests.push(r.url()); });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
            league.username = 'Manual';
            league.globalRosterMap = Object.fromEntries(Object.entries(league.globalRosterMap).filter(([, o]) => o === 'You'));
        });
        await showTab(page, 'roster');
        await page.waitForLoadState('networkidle');
        await expect(line(page)).toBeHidden();
        expect(requests).toEqual([]);
        await expectClean(page, state);
    });
});
