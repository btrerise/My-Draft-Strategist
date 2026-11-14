// A suggested FAAB bid (improvements S35; js/mls/scout/faab.js, faabHistory.js). In a FAAB league, a player on waivers
// (S34's W) on Best Available's line, Auto-Find's cards and Check a List gets "Bid 13–21", from the league's winning
// bids this season for players at his position ranked near him today, scaled by your budget left, the weeks left and
// whether he'd start for you. The model is unit-tested in tests/unit/faab.test.mjs.
//
// The fixture: UPGRADE_CSV makes James Cook RB5 and an upgrade over Derrick Henry (as in mls-waiver-status.spec.mjs);
// Rival dropped him Tuesday night, so on Thursday he's on waivers (W) and still counts. league-transactions-faab.json
// (week 1): winning bids on McCaffrey RB4 (30), Achane RB6 (12), Kyren Williams RB7 (8) and Chase Brown RB9 (20), so the
// four, all within 6 spots of Cook and last week's (so each counts fully), give median 12 and 75th percentile 20. You have 63 of 100 left, Rival 88 (average 75.5:
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

// Round 6, Aggressive: three more RB claims near Cook (Bijan 40, Gibbs 45, Saquon 50), each with a losing bid in the same
// run, so the RBs' contested claims are Achane 12 and those three: median (nearest rank) 40.
const CONTESTED_JSON = JSON.stringify([...JSON.parse(FAAB_JSON), ...[['9509', 40], ['9221', 45], ['4892', 50]].flatMap(([pid, bid], i) => {
    const at = Date.parse('2026-09-16T07:05:00Z');
    const claim = (status, roster, b) => ({ transaction_id: `40000000000000000${i}${status[0]}`, type: 'waiver', status, leg: 1, roster_ids: [roster],
        adds: { [pid]: roster }, drops: null, draft_picks: [], settings: { waiver_bid: b }, created: at - 3600000, status_updated: at });
    return [claim('complete', 2, bid), claim('failed', 1, bid - 5)];
})]);

const leagueCard = (page) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('.mls-lc-name', { hasText: 'Fixture League' }) });
const line = (page) => leagueCard(page).locator('.mls-lc-ba');
const player = (page, name) => line(page).locator('.mls-ba-player').filter({ hasText: name });
const out = (page) => page.locator('#waiverOutput');

// The league (one RB slot, as in mls-best-available.spec.mjs; waiverType changes its claim type), the rosters with
// FAAB spent, and the transactions: week 1 from `history` ('faab' | 'none' | 'error'), week 2 Cook's drop.
// many: Rival also dropped Jaxon Smith-Njigba and Chase Brown, so more of the line is on waivers (a waiver day's look).
// spent: each roster's FAAB used (a spec can change it after the sync, as a waiver run would).
async function routes(page, { history = 'faab', waiverType = 2, many = false, spent = { 1: 37, 2: 12 } } = {}) {
    const historyJson = history === 'contested' ? CONTESTED_JSON : history === 'faab' ? FAAB_JSON : '[]';
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => {
        const league = JSON.parse(LEAGUE_JSON);
        league.roster_positions.splice(league.roster_positions.indexOf('RB'), 1);
        league.settings.waiver_type = waiverType;
        return route.fulfill({ json: league });
    });
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) => {
        const rosters = JSON.parse(ROSTERS_JSON).map(r => ({ ...r, settings: { ...r.settings, waiver_budget_used: spent[r.roster_id] } }));
        return route.fulfill({ json: rosters });
    });
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/transactions\/\d+$/, (route) => {
        const week = Number(route.request().url().split('/').pop());
        if (week === 2) return route.fulfill({ json: many ? [{ ...COOK_DROP[0], drops: { 8138: 2, 9488: 2, 9224: 2 } }] : COOK_DROP });
        if (history === 'error') return route.fulfill({ status: 500, body: '' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: historyJson });
    });
}
// on: suggested bids turned on first (round 6: they're off by default), with style ('conservative' unless given).
async function setup(page, opts = {}) {
    const state = await openApp(page, '/lineup/');
    await routes(page, opts);
    const { on = true, style = 'conservative' } = opts;
    if (on) await page.evaluate((s) => localStorage.setItem('mls_faab_settings', JSON.stringify(s)), { on: true, style });
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

        // On desktop a dot keeps the bid apart from "waivers until …"; on phones the bid has its own row instead.
        await expect(cook.locator('.mls-ba-bid-sep')).toBeVisible({ visible: test.info().project.name === 'desktop' });

        // A tap opens the sheet (round 2): what it's based on, what raised it (up arrow) and lowered it (down arrow),
        // the notes. The weeks-left adjustment (×1.03) is under 5%, so it has no line.
        await cook.locator('.mls-faab-bid').click();
        const sheet = page.locator('.sheet');
        // Round 3: it names the player and the league, says what the two ends mean, and whom he'd replace.
        await expect(sheet.locator('.sheet-title')).toHaveText('James Cook · Bid 13–21');
        await expect(sheet.locator('.mls-faab-sheet li')).toHaveText([
            'Fixture League · you have 63 of 100',
            'Winning bids for RBs this season, those ranked near RB5 and recent ones counting most: 4 won, 8 to 30, median 12',
            'Before the adjustments: 12 would have matched about half of these winning bids, 20 about 3 in 4',
            // Round 4: from the fixture's failed claim on Achane, in the same run as his winning one.
            'Others bid on 1 of 4 RB claims here; when they did, the winner paid a median 12',
            'He\'d start for you, over Derrick Henry',
            'You have less left than the league average (76)',
            // Round 4: the one other team can outbid 21, so the most left instead of a count.
            'Most left: 88 (you: 63)',
            'Ranks are today\'s; the bids were placed earlier.'
        ]);
        await expect(sheet.locator('.mls-faab-sheet li.is-up svg')).toHaveCount(1);
        await expect(sheet.locator('.mls-faab-sheet li.is-down svg')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);

        // Auto-Find's card for him says the same, under its verdict.
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cookCard = out(page).locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cookCard).toContainText('Would Start');
        await expect(cookCard.locator('.mls-scan-bid .mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        // Its sheet names him and whom he'd replace, from the lineup check (round 3).
        await cookCard.locator('.mls-faab-bid').click();
        await expect(page.locator('.sheet .sheet-title')).toHaveText('James Cook · Bid 13–21');
        await expect(page.locator('.sheet .mls-faab-sheet li.is-up')).toHaveText('He\'d start for you, over Derrick Henry');
        await page.keyboard.press('Escape');
        await expect(page.locator('.sheet')).toHaveCount(0);
        await expect(out(page).locator('.mls-faab-bid')).toHaveCount(1);

        // Check a List: the same bid on his free-agent row.
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', ['James Cook', 'Jaxon Smith-Njigba'].join('\n'));
        await page.click('#waiverScanBtn');
        const cookRow = out(page).locator('.scout-result-card').filter({ hasText: 'James Cook' }).first();
        await expect(cookRow.locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        await expectClean(page, state);
    });

    test('several players on waivers: only the upgrade gets a bid on Best available; a thin position is a rough guess', async ({ page }) => {
        const state = await setup(page, { many: true });
        await expect(player(page, 'James Cook').locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        await expect(player(page, 'Jaxon Smith-Njigba').locator('.mls-wv-chip')).toHaveText('W');
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(1);
        // Check a List: Jaxon (WR11) has a bid there, but the league's only WR bid is one claim, so it's every bid
        // (never the RBs near his rank): "≈", muted.
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', ['Jaxon Smith-Njigba'].join('\n'));
        await page.click('#waiverScanBtn');
        const bid = out(page).locator('.scout-result-card').filter({ hasText: 'Jaxon Smith-Njigba' }).first().locator('.mls-faab-bid');
        await expect(bid).toHaveText(/^≈ Bid \d+–\d+ \(of your 63 left\)$/);
        await expect(bid).toHaveClass(/\bis-rough\b/);
        await bid.click();
        await expect(page.locator('.sheet .sheet-title')).toHaveText(/^Jaxon Smith-Njigba · ≈ Bid \d+–\d+$/);
        await expect(page.locator('.sheet .mls-faab-sheet li').nth(1)).toHaveText('Too few winning bids for a WR (1); every position this season: 5 won, 3 to 30, median 12');
        await expectClean(page, state);
    });

    test('round 5: the bid\'s row is there while the history loads, and FAAB left is re-read with it', async ({ page }) => {
        const spent = { 1: 37, 2: 12 };
        const state = await setup(page, { spent });
        await expect(player(page, 'James Cook').locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        // A waiver run since the sync: you've spent 13 more. A new visit, with the history slow to answer.
        spent[1] = 50;
        // The rosters, which the history now reads with it, wait until the test lets them through (in the fixture the
        // history's two weeks are also the drops' two, so the rosters are what it waits on).
        let release;
        const gate = new Promise(r => { release = r; });
        await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, async (route) => {
            await gate;
            const rosters = JSON.parse(ROSTERS_JSON).map(r => ({ ...r, settings: { ...r.settings, waiver_budget_used: spent[r.roster_id] } }));
            return route.fulfill({ json: rosters });
        });
        await page.reload();
        await expect(player(page, 'James Cook')).toBeVisible();
        // The page's own try at ESPN's kickoffs fails (the tests block ESPN) and clears them; set them after it.
        await expect.poll(() => page.evaluate(async () => (await import('/js/mls/state.js')).State.gameTimesFetchedForWeek)).toBeNull();
        await page.waitForTimeout(300);
        await page.evaluate(async (k) => {
            const { State } = await import('/js/mls/state.js');
            State.gameTimesByTeam = { ...State.gameTimesByTeam, ...k };
            State.gameTimesFetchedForWeek = State.currentNflWeek;
        }, KICKOFFS);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        const cook = player(page, 'James Cook');
        const pending = cook.locator('.mls-faab-bid.is-pending');
        await expect(pending).toHaveText('Bid …');
        const before = await cook.boundingBox();
        release();
        // Then the bid, from the rosters read with the history: 50 left now, not the sync's 63.
        await expect(cook.locator('button.mls-faab-bid')).toHaveText(/^Bid \d+–\d+ \(of your 50 left\)$/);
        await expect(pending).toHaveCount(0);
        const after = await cook.boundingBox();
        // The row didn't change height, so nothing below it moved.
        expect(Math.round(after.height)).toBe(Math.round(before.height));
        await expectClean(page, state);
    });

    test('round 6: off by default (no bids, no history read), the setting shown with a FAAB league', async ({ page }) => {
        let rosterReads = 0;
        page.on('request', r => { if (/\/league\/\d+\/rosters$/.test(r.url())) rosterReads++; });
        const state = await setup(page, { on: false });
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        // The sync reads the rosters once; the history (which would read them again) isn't loaded.
        expect(rosterReads).toBe(1);
        const group = page.locator('#faabSettingsGroup');
        await expect(group).toBeVisible();
        await expect(page.locator('#faabSettingsState')).toHaveText('Off');
        // Turn it on: Conservative, and the bid appears.
        await group.locator('summary').click();
        await expect(page.locator('#faabStyleOptions')).toBeHidden();
        await page.locator('#faabBidsToggle').check();
        await expect(page.locator('#faabSettingsState')).toHaveText('On · Conservative');
        await expect(page.locator('#faabStyleOptions [data-style="conservative"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(cook.locator('button.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mls_faab_settings')))).toMatchObject({ on: true, style: 'conservative' });
        // Round 7: the line under the switch says how many bids the Dashboard shows, and the style choice has a label.
        await expect(page.locator('#faabBidsStatus')).toHaveText('Showing 1 bid on the Dashboard right now (on upgrades who are on waivers). Auto-Find and Check a List show one for every player on waivers.');
        await expect(page.locator('#faabStyleLabel')).toHaveText('Bidding style');
        await expect(page.locator('#faabStyleOptions [role="group"]')).toHaveAttribute('aria-labelledby', 'faabStyleLabel');
        await expectClean(page, state);
    });

    test('round 6: Aggressive raises the top end for a player you\'d start', async ({ page }) => {
        // You have 40 left, Rival 100 (×0.6): Conservative's top for Cook stays under the contested median.
        const state = await setup(page, { history: 'contested', spent: { 1: 60, 2: 0 } });
        const cook = player(page, 'James Cook');
        const bid = cook.locator('button.mls-faab-bid');
        await expect(bid).toHaveText(/^Bid \d+–\d+ \(of your 40 left\)$/);
        const conservative = Number((await bid.textContent()).match(/–(\d+)/)[1]);
        await page.locator('#faabSettingsGroup summary').click();
        await page.locator('#faabStyleOptions [data-style="aggressive"]').click();
        await expect(page.locator('#faabSettingsState')).toHaveText('On · Aggressive');
        // The contested RB claims' median, 40, is above Conservative's top.
        expect(conservative).toBeLessThan(40);
        await expect(bid).toHaveText(/^Bid \d+–40 \(of your 40 left\)$/);
        await bid.click();
        await expect(page.locator('.sheet .mls-faab-sheet li.is-up').first()).toHaveText('Aggressive: the top is raised to 40, what winners paid when others bid');
        await expectClean(page, state);
    });

    test('round 6: one toast offers to turn them on, after Auto-Find; "Turn on" shows the bids', async ({ page }) => {
        const state = await setup(page, { on: false });
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cookCard = out(page).locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cookCard.locator('.mls-wv-chip')).toHaveText('W');
        await expect(cookCard.locator('.mls-faab-bid')).toHaveCount(0);
        const toast = page.locator('#mds-toast');
        await expect(toast.locator('.toast-message')).toHaveText('Need help with FAAB bids? Turn on bid suggestions in Advanced Settings on the Dashboard.');
        await toast.locator('.toast-action-btn').click();
        await expect(toast).not.toHaveClass(/\bshow\b/);
        // Auto-Find runs again, with the bids.
        await expect(cookCard.locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mls_faab_settings')))).toMatchObject({ on: true, hintShown: true });
        await expectClean(page, state);
    });

    test('round 6: the toast after Check a List too, and only once', async ({ page }) => {
        const state = await setup(page, { on: false });
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', 'James Cook');
        await page.click('#waiverScanBtn');
        const toastMsg = page.locator('#mds-toast .toast-message').filter({ hasText: 'Need help with FAAB bids?' });
        await expect(toastMsg).toBeVisible();
        await page.locator('#mds-toast .toast-dismiss-btn').click();
        await expect(page.locator('#mds-toast')).not.toHaveClass(/\bshow\b/);
        // Ignored once: never again, not even after Auto-Find.
        await page.click('#waiverScanBtn');
        await callApp(page, 'setWaiverMode', 'auto');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out(page).locator('.mls-scan-card').first()).toBeVisible();
        await page.waitForTimeout(500);
        await expect(toastMsg).toBeHidden();
        expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mls_faab_settings')))).toMatchObject({ on: false, hintShown: true });
        await expectClean(page, state);
    });

    test('no winning bids yet: the W chip, and no bid', async ({ page }) => {
        const state = await setup(page, { history: 'none' });
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        // Give the history time to load (it's two weeks of empty lists), then check nothing was added.
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        // The setting's line says why nothing shows (round 7).
        await expect(page.locator('#faabBidsStatus')).toHaveText(/^No bids on the Dashboard right now: they show on upgrades who are on waivers, once a league has a winning bid this season\./);
        await expectClean(page, state);
    });

    test('history fails to load: no bid and no error toast', async ({ page }) => {
        const state = await setup(page, { history: 'error' });
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-ba-player')).not.toHaveCount(0);
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        await expect(page.locator('.toast-message').filter({ hasText: /transactions|FAAB/i })).toHaveCount(0);
        // The setting's line says why (round 8: it used to blame "no winning bid yet").
        await expect(page.locator('#faabBidsStatus')).toHaveText('Couldn\'t read your leagues\' bids from Sleeper; they\'ll load on your next visit.');
        await expectClean(page, state);
    });

    test('round 8: changing the setting redraws Auto-Find\'s results already on screen', async ({ page }) => {
        const state = await setup(page);
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cookCard = () => out(page).locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cookCard().locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        // Off, from the Dashboard: Auto-Find's results lose their bids without another tap of Auto-Find.
        await showTab(page, 'setup');
        await page.locator('#faabSettingsGroup summary').click();
        await page.locator('#faabBidsToggle').uncheck();
        await showTab(page, 'scout');
        await expect(cookCard()).toBeVisible();
        await expect(cookCard().locator('.mls-faab-bid')).toHaveCount(0);
        // On again: back.
        await showTab(page, 'setup');
        await page.locator('#faabBidsToggle').check();
        await showTab(page, 'scout');
        await expect(cookCard().locator('.mls-faab-bid')).toHaveText('Bid 13–21 (of your 63 left)');
        await expectClean(page, state);
    });

    test('a league that isn\'t FAAB: waivers, but no bid, no setting and no toast', async ({ page }) => {
        const state = await setup(page, { waiverType: 0, on: false });
        await expect(page.locator('#faabSettingsGroup')).toBeHidden();
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        await page.waitForLoadState('networkidle');
        await expect(line(page).locator('.mls-faab-bid')).toHaveCount(0);
        // No toast after Auto-Find either: there's no FAAB league to help with.
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out(page).locator('.mls-scan-card').first()).toBeVisible();
        await page.waitForTimeout(500);
        await expect(page.locator('#mds-toast .toast-message').filter({ hasText: 'Need help with FAAB bids?' })).toBeHidden();
        await expectClean(page, state);
    });
});
