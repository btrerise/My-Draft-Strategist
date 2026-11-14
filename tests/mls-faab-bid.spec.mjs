// A suggested FAAB bid (improvements S35; js/mls/scout/faab.js, faabHistory.js). In a FAAB league, a player on waivers
// (S34's W) on Best Available's line, Auto-Find's cards and Check a List gets "Bid 13–21", from the league's winning
// bids this season for players at his position ranked near him today, scaled by your budget left, the weeks left and
// whether he'd start for you. The model is unit-tested in tests/unit/faab.test.mjs.
//
// The fixture: UPGRADE_CSV makes James Cook RB5 and an upgrade over Derrick Henry (as in mls-waiver-status.spec.mjs);
// Rival dropped him Tuesday night, so on Thursday he's on waivers (W) and still counts. league-transactions-faab.json
// (week 1): winning bids on McCaffrey RB4 (30), Achane RB6 (12), Kyren Williams RB7 (8) and Chase Brown RB9 (20), so the
// four within 6 ranks of Cook give median 12 and 75th percentile 20. You have 63 of 100 left, Rival 88 (average 75.5:
// ×0.83); redraft, week 2 of 17 (×1.03); he'd start for you (×1.25): 12 → 13 and 20 → 21.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, WAIVER_RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const UPGRADE_CSV = WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL,3,7', '26,Derrick Henry,RB,BAL,4,7')
    .replace('26,James Cook,RB,BUF,4,7', '15,James Cook,RB,BUF,3,7');
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const LEAGUE_JSON = fixture('league.json');
const ROSTERS_JSON = fixture('league-rosters.json');
const FAAB_JSON = fixture('league-transactions-faab.json');
const THURSDAY = new Date('2026-09-17T15:00:00Z'); // 8 AM PT, a free-agency day in this weekly-waiver league
const KICKOFFS = { BUF: '2026-09-20T20:25:00Z', BAL: '2026-09-20T20:25:00Z', CIN: '2026-09-20T17:00:00Z' };
// Cook dropped Tue 9/15 at 7 PM PT: on waivers until about Thursday evening, before his Sunday game.
const COOK_DROP = [{ transaction_id: '1', type: 'free_agent', status: 'complete', leg: 2, adds: null, drops: { 8138: 2 }, status_updated: Date.parse('2026-09-16T02:00:00Z') }];

const leagueCard = (page) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('.mls-lc-name', { hasText: 'Fixture League' }) });
const line = (page) => leagueCard(page).locator('.mls-lc-ba');
const player = (page, name) => line(page).locator('.mls-ba-player').filter({ hasText: name });
const out = (page) => page.locator('#waiverOutput');

// The league (one RB slot, as in mls-best-available.spec.mjs; waiverType changes its claim type), the rosters with
// FAAB spent, and the transactions: week 1 from `history` ('faab' | 'none' | 'error'), week 2 Cook's drop.
async function routes(page, { history = 'faab', waiverType = 2 } = {}) {
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => {
        const league = JSON.parse(LEAGUE_JSON);
        league.roster_positions.splice(league.roster_positions.indexOf('RB'), 1);
        league.settings.waiver_type = waiverType;
        return route.fulfill({ json: league });
    });
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) => {
        const rosters = JSON.parse(ROSTERS_JSON).map(r => ({ ...r, settings: { ...r.settings, waiver_budget_used: r.roster_id === 1 ? 37 : 12 } }));
        return route.fulfill({ json: rosters });
    });
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/transactions\/\d+$/, (route) => {
        const week = Number(route.request().url().split('/').pop());
        if (week === 2) return route.fulfill({ json: COOK_DROP });
        if (history === 'error') return route.fulfill({ status: 500, body: '' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: history === 'faab' ? FAAB_JSON : '[]' });
    });
}
async function setup(page, opts) {
    const state = await openApp(page, '/lineup/');
    await routes(page, opts);
    await page.clock.setFixedTime(THURSDAY);
    await seedMls(page);
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await page.setInputFiles('#weeklyFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(UPGRADE_CSV) });
    await callApp(page, 'confirmRankingsPreview');
    await page.evaluate(async (k) => {
        const { State } = await import('/js/mls/state.js');
        State.gameTimesByTeam = { ...State.gameTimesByTeam, ...k };
        State.gameTimesFetchedForWeek = State.currentNflWeek;
    }, KICKOFFS);
    await showTab(page, 'lineup');
    await showTab(page, 'setup');
    return state;
}

test.describe('Lineup Strategist suggested FAAB bid', () => {
    test('a waiver upgrade in a FAAB league: a bid range on Best Available and Auto-Find, and a tap says why', async ({ page }) => {
        const state = await setup(page);
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        // The history loads after the line; the line is drawn again with the bid.
        await expect(cook.locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        // Only players on waivers get a bid: the free agents on the line don't.
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(1);
        // The sync kept each team's FAAB left and the season's last week on the league.
        const league = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues')).find(l => l.leagueId === '1000000000000000001'));
        expect(league.faabLeft).toEqual({ 1: 63, 2: 88 });
        expect(league.lastWeek).toBe(17);

        await cook.locator('.mls-faab-bid').click();
        const toast = page.locator('.toast-message').filter({ hasText: 'Suggested bid' });
        await expect(toast).toHaveText(new RegExp([
            '^Suggested bid 13–21 of your 63 left \\(budget 100\\)\\. ',
            'Winning bids this season for an RB ranked 1–11 today: 4, median 12, top 30 \\(today\'s ranks; the bids were placed earlier\\)\\. ',
            'You have 63 left, the league averages 76: ×0\\.83 · 16 weeks left: ×1\\.03 · he\'d start for you: ×1\\.25\\. ',
            '1 team can outbid 21\\.$'
        ].join('')));

        // Auto-Find's card for him says the same, under its verdict.
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cookCard = out(page).locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cookCard).toContainText('Would Start');
        await expect(cookCard.locator('.mls-scan-bid .mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        await expect(out(page).locator('.mls-faab-bid')).toHaveCount(1);

        // Check a List: the same bid on his free-agent row.
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', ['James Cook', 'Jaxon Smith-Njigba'].join('\n'));
        await page.click('#waiverScanBtn');
        const cookRow = out(page).locator('.scout-result-card').filter({ hasText: 'James Cook' }).first();
        await expect(cookRow.locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        await expectClean(page, state);
    });

    test('no winning bids yet: the W chip, and no bid', async ({ page }) => {
        const state = await setup(page, { history: 'none' });
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        // Give the history time to load (it's two weeks of empty lists), then check nothing was added.
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('history fails to load: no bid and no error toast', async ({ page }) => {
        const state = await setup(page, { history: 'error' });
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-ba-player')).not.toHaveCount(0);
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        await expect(page.locator('.toast-message').filter({ hasText: /transactions|FAAB/i })).toHaveCount(0);
        await expectClean(page, state);
    });

    test('a league that isn\'t FAAB: waivers, but no bid', async ({ page }) => {
        const state = await setup(page, { waiverType: 0 });
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        await expectClean(page, state);
    });
});
