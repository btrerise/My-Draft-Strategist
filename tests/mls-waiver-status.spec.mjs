// Free agent or Waivers (improvements S34; js/mls/scout/waiverStatus.js, recentDrops.js). Sleeper has no "on waivers"
// flag per player, so the app works it out from the league's waiver settings (the fixture league: FAAB, 2-day clears,
// daily waivers at 12 AM PT), its recent drops (transactions for this week and last) and this week's kickoffs. Every
// player on Best Available's lines, Auto-Find's cards and Check a List's free agents gets "FA" or "W"; on Weekly, an
// upgrade who's on waivers and plays before the claim runs is shown muted ("too late for this week") and not counted.
// The rule itself is unit-tested in tests/unit/waiverStatus.test.mjs.
//
// The fixture: UPGRADE_CSV (Weekly) makes James Cook (BUF, a free agent) RB5 tier 3, ahead of your Derrick Henry RB8
// tier 4: Fixture League's one upgrade (tests/mls-best-available.spec.mjs). league-transactions-drop.json: Rival dropped
// Cook on Saturday 9/19 (16:00 UTC), so he's on waivers until Monday, after his Sunday game.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, WAIVER_RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const UPGRADE_CSV = WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL,3,7', '26,Derrick Henry,RB,BAL,4,7')
    .replace('26,James Cook,RB,BUF,4,7', '15,James Cook,RB,BUF,3,7');
const LEAGUE_JSON = readFileSync(new URL('./fixtures/sleeper/league.json', import.meta.url), 'utf8');
const DROP_JSON = readFileSync(new URL('./fixtures/sleeper/league-transactions-drop.json', import.meta.url), 'utf8');
// Sunday of week 2, 10 AM PT, before the 1:25 PM PT games.
const SUNDAY = new Date('2026-09-20T17:00:00Z');
const KICKOFFS = { BUF: '2026-09-20T20:25:00Z', BAL: '2026-09-20T20:25:00Z', CIN: '2026-09-20T17:00:00Z' };

const leagueCard = (page, name) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('.mls-lc-name', { hasText: name }) });
const line = (page, name) => leagueCard(page, name).locator('.mls-lc-ba');
const player = (page, name) => line(page, 'Fixture League').locator('.mls-ba-player').filter({ hasText: name });
const upgradeCount = (page) => leagueCard(page, 'Fixture League').locator('.mls-lc-count-upgrades');
const out = (page) => page.locator('#waiverOutput');
// A card with nothing to do starts folded (S12): open the card, then its best available.
async function openFold(page) {
    const cardFold = leagueCard(page, 'Fixture League').locator('[data-action="toggleLeagueCard"]');
    if ((await cardFold.getAttribute('aria-expanded')) === 'false') await cardFold.click();
    const fold = line(page, 'Fixture League').locator('details.mls-ba-fold');
    if (!(await fold.evaluate(d => d.open))) await fold.locator('summary').click();
    await expect(fold).toHaveAttribute('open', '');
}

// One RB slot, as in mls-best-available.spec.mjs (the fixture team has one RB).
async function oneRbSlot(page) {
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => {
        const league = JSON.parse(LEAGUE_JSON);
        league.roster_positions.splice(league.roster_positions.indexOf('RB'), 1);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(league) });
    });
}
// This week's transactions: Cook's drop. 'error': every transactions request fails.
async function serveTransactions(page, kind) {
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/transactions\/\d+$/, (route) => {
        if (kind === 'error') return route.fulfill({ status: 500, body: '' });
        const week = Number(route.request().url().split('/').pop());
        return route.fulfill({ status: 200, contentType: 'application/json', body: week === 2 ? DROP_JSON : '[]' });
    });
}
// This week's kickoffs, as if ESPN had answered (the tests block ESPN).
async function setKickoffs(page, kickoffs = KICKOFFS) {
    await page.evaluate(async (k) => {
        const { State } = await import('/js/mls/state.js');
        State.gameTimesByTeam = { ...State.gameTimesByTeam, ...k };
        State.gameTimesFetchedForWeek = State.currentNflWeek;
    }, kickoffs);
}
async function setup(page, { transactions = null } = {}) {
    const state = await openApp(page, '/lineup/');
    await oneRbSlot(page);
    if (transactions) await serveTransactions(page, transactions);
    await seedMls(page);
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await page.setInputFiles('#weeklyFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(UPGRADE_CSV) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
    return state;
}

test.describe('Lineup Strategist Free agent or Waivers', () => {
    test('nobody dropped: every player is a free agent, the upgrade counts, and the chip explains itself', async ({ page }) => {
        const state = await setup(page);
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        // No kickoff times yet (the tests block ESPN): the app can't tell who has played, so no chips (round 3).
        await expect(line(page, 'Fixture League').locator('.mls-ba-player')).toHaveCount(3);
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip')).toHaveCount(0);
        // Thursday 9/17, 8 AM PT: a free-agency day in this weekly-waiver league (Monday and Tuesday are waiver days for
        // everyone, round 8; the tests' clock is otherwise a Tuesday).
        await page.clock.setFixedTime(new Date('2026-09-17T15:00:00Z'));
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('FA');
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip.is-w')).toHaveCount(0);
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip.is-fa')).toHaveCount(3);
        await cook.locator('.mls-wv-chip').click();
        await expect(page.locator('.toast-message').filter({ hasText: /^Free agent: add now, until his Sun [\d:]+ [AP]M kickoff\.$/ })).toBeVisible();
        // The waiver settings came with the sync, and are kept on the league (so Backup / Restore has them).
        const waivers = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues')).find(l => l.leagueId === '1000000000000000001').waivers);
        expect(waivers).toEqual({ type: 'faab', budget: 100, clearDays: 2, dayOfWeek: 2, daily: false, hour: 0, days: 5461 });
        await expectClean(page, state);
    });

    test('dropped Tuesday night, checked Thursday: on waivers until before his game, so still counted, and it says until when', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await oneRbSlot(page);
        // Cook dropped Tue 9/15 at 7 PM PT: in a 2-day league he clears about Thu 7 PM PT (Fri 2 AM in the tests' UTC), well before Sunday.
        await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/transactions\/\d+$/, (route) => route.fulfill({ json: route.request().url().endsWith('/2')
            ? [{ transaction_id: '1', type: 'free_agent', status: 'complete', leg: 2, adds: null, drops: { 8138: 2 }, status_updated: Date.parse('2026-09-16T02:00:00Z') }] : [] }));
        await page.clock.setFixedTime(new Date('2026-09-17T15:00:00Z'));
        await seedMls(page);
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await page.setInputFiles('#weeklyFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(UPGRADE_CSV) });
        await callApp(page, 'confirmRankingsPreview');
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        const cook = player(page, 'James Cook');
        await expect(cook).not.toHaveClass(/\bis-late\b/);
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        // Round 3: the upgrade's own line says until when, so the card's to-do is complete without a tap.
        await expect(cook.locator('.mls-ba-over')).toHaveText(/^over Derrick Henry RB8 · waivers until about (Thu|Fri) [\d:]+ [AP]M$/);
        await expectClean(page, state);
    });

    test('game day: a waiver upgrade who plays before the claim runs is muted and not counted', async ({ page }) => {
        const state = await setup(page, { transactions: 'drop' });
        await page.clock.setFixedTime(SUNDAY);
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        // Cook was dropped Saturday: on waivers until Monday, after his 1:25 PM game. No upgrade this week.
        await expect(upgradeCount(page)).toHaveText('');
        await openFold(page);
        // The flag says this week, and why (round 2: "No upgrade" beside a greyed upgrade read as a contradiction).
        await expect(line(page, 'Fixture League').locator('.mls-ba-flag')).toHaveText('No upgrade this week · 1 too late');
        const cook = player(page, 'James Cook');
        await expect(cook).toHaveClass(/\bis-late\b/);
        await expect(cook.locator('.mls-ba-late')).toHaveText('too late for this week');
        // The note comes before his × (round 2: on one desktop row it read as the next player's).
        expect(await cook.locator('.mls-ba-late').evaluate(el => el.nextElementSibling && el.nextElementSibling.classList.contains('mls-ba-dismiss'))).toBe(true);
        await expect(cook.locator('.mls-ba-over')).toHaveCount(0);
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        await cook.locator('.mls-wv-chip').click();
        await expect(page.locator('.toast-message').filter({ hasText: /^On waivers until Wed \d+ [AP]M \(FAAB\)\. Dropped Sat [\d:]+ [AP]M; locked at his Sun [\d:]+ [AP]M kickoff\. Too late for this week\.$/ })).toBeVisible();
        // Chase Brown (CIN) kicked off at 10 AM, so he can't help this week: left off the line (round 2), and the next
        // free agents fill it. Only Cook, the would-be upgrade, is greyed.
        await expect(player(page, 'Chase Brown')).toHaveCount(0);
        await expect(line(page, 'Fixture League').locator('.mls-ba-player')).toHaveCount(3);
        await expect(line(page, 'Fixture League').locator('.mls-ba-player.is-late')).toHaveCount(1);
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip.is-fa')).toHaveCount(2);
        await expect(player(page, 'Jaxon Smith-Njigba').locator('.mls-wv-chip')).toHaveText('FA');

        // Auto-Find and Check a List show the same chip, and agree with the card (round 2): Cook is "Too Late", not
        // "Would Start".
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cookCard = out(page).locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cookCard).toContainText('Too Late');
        await expect(cookCard).not.toContainText('Would Start');
        await expect(cookCard.locator('.mls-scan-verdict')).toHaveText(/^On waivers until Wed \d+ [AP]M, after his game - no help this week\.$/);
        await out(page).evaluate(el => { el.innerHTML = ''; });
        await callApp(page, 'setWaiverCompare', 'roster');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out(page).locator('.mls-scan-card').first()).toBeVisible();
        await expect(cookCard.locator('.mls-wv-chip')).toHaveText('W');
        await expect(cookCard).toContainText('Too Late');
        await callApp(page, 'setWaiverMode', 'list');
        await page.fill('#waiverInput', ['James Cook', 'Jaxon Smith-Njigba', 'Derrick Henry'].join('\n'));
        await page.click('#waiverScanBtn');
        const card = (n) => out(page).locator('.scout-result-card').filter({ hasText: n });
        await expect(card('James Cook').locator('.mls-wv-chip')).toHaveText('W');
        await expect(card('James Cook')).toContainText('Too Late');
        await expect(card('Jaxon Smith-Njigba').locator('.mls-wv-chip')).toHaveText('FA');
        // Yours: no chip (the other cards mention him in their verdicts, so leave them out).
        await expect(card('Derrick Henry').filter({ hasNotText: 'James Cook' }).filter({ hasNotText: 'Smith-Njigba' }).locator('.mls-wv-chip')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('Tuesday, every game over: the upgrade counts again (claims are for next week), one line for the waivers', async ({ page }) => {
        const state = await setup(page, { transactions: 'drop' });
        // Tue 9/22, 8 AM PT: week 2's last game (Sunday 1:25 PM PT here) is long over; Sleeper's week moves on Wednesday.
        await page.clock.setFixedTime(new Date('2026-09-22T15:00:00Z'));
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        // Round 4: before, every player had kicked off, so nobody "would start" and the card said "No upgrade this week".
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        const cook = player(page, 'James Cook');
        await expect(cook).not.toHaveClass(/\bis-late\b/);
        await expect(cook.locator('.mls-ba-over')).toHaveText(/^over Derrick Henry RB8 · waivers until Wed [\d:]+ [AP]M$/);
        // Round 5: one line instead of a W on everyone who played (Cook, BUF; Chase Brown, CIN). Jaxon Smith-Njigba has
        // no game in this fixture's kickoffs; Tuesday is a waiver day for everyone in a weekly-waiver league (round 8),
        // so he keeps his own W.
        await openFold(page);
        await expect(line(page, 'Fixture League').locator('.mls-ba-wv-note')).toHaveText(/^Everyone who played this week is on waivers until Wed [\d:]+ [AP]M\.$/);
        await expect(cook.locator('.mls-wv-chip')).toHaveCount(0);
        await expect(player(page, 'Jaxon Smith-Njigba').locator('.mls-wv-chip')).toHaveText('W');
        // Auto-Find agrees: Would Start, not Played.
        await showTab(page, 'scout');
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'lineup');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cookCard = out(page).locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cookCard).toContainText('Would Start');
        await expect(cookCard).not.toContainText('Played');
        await expectClean(page, state);
    });

    test('Monday night: everyone else has played, and the line says so (not "everyone is rostered")', async ({ page }) => {
        const state = await setup(page);
        // Mon 9/21, 4 PM PT: every free agent's game was Sunday; the week's last game (NYG, 5:15 PM PT) is still to come.
        await page.clock.setFixedTime(new Date('2026-09-21T23:00:00Z'));
        const sunday = '2026-09-20T17:00:00Z';
        await setKickoffs(page, { BUF: sunday, BAL: sunday, CIN: sunday, SEA: sunday, DET: sunday, NYG: '2026-09-22T00:15:00Z' });
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await openFold(page);
        await expect(line(page, 'Fixture League').locator('.mls-ba-player')).toHaveCount(0);
        await expect(line(page, 'Fixture League').locator('.mls-ba-empty')).toHaveText("Everyone else available has played this week (or can't be added before his game).");
        await expectClean(page, state);
    });

    test('a daily-waiver league (Friday Night Beverages\' schedule): on a waiver day every pickup is a claim', async ({ page }) => {
        const state = await setup(page);
        // Mon and Tue Locked, every other day Waivers at 12 AM PT (the owner's settings screens, round 7).
        await page.evaluate(() => {
            const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
            leagues.forEach(l => { if (l.waivers) l.waivers = { ...l.waivers, daily: true, days: 10581, hour: 0 }; });
            localStorage.setItem('mls_leagues', JSON.stringify(leagues));
        });
        await page.reload();
        await page.waitForLoadState('networkidle'); // the app re-reads Sleeper's week (and resets kickoffs) first
        // Saturday 9/19 noon PT: a waiver day; the next run is Sunday 12 AM, before every Sunday game.
        await page.clock.setFixedTime(new Date('2026-09-19T19:00:00Z'));
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip.is-fa')).toHaveCount(0);
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip.is-w')).toHaveCount(3);
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-ba-over')).toHaveText(/^over Derrick Henry RB8 · waivers until Sun [\d:]+ [AP]M$/);
        await cook.locator('.mls-wv-chip').click();
        await expect(page.locator('.toast-message').filter({ hasText: /^On waivers until Sun [\d:]+ [AP]M \(FAAB\)\. A waiver day in this league: every pickup is a claim\.$/ })).toBeVisible();
        // Sunday 10 AM PT: Sunday's run has passed and Monday and Tuesday are Locked, so the next run is Wednesday,
        // after Cook's game: too late, not counted.
        await page.clock.setFixedTime(SUNDAY);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('');
        await expectClean(page, state);
    });

    test('the same drop on ROS: shown as on waivers, still counted (ROS is about the rest of the season)', async ({ page }) => {
        const state = await setup(page, { transactions: 'drop' });
        await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(UPGRADE_CSV) });
        await callApp(page, 'confirmRankingsPreview');
        await page.clock.setFixedTime(SUNDAY);
        await setKickoffs(page);
        await showTab(page, 'setup');
        await page.locator('#bestAvailableBasis [data-basis="ros"]').click();
        const cook = player(page, 'James Cook');
        await expect(cook.locator('.mls-wv-chip')).toHaveText('W');
        await expect(cook).not.toHaveClass(/\bis-late\b/);
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        await expectClean(page, state);
    });

    test("transactions that fail to load: no chips, the upgrade counts, and no toast", async ({ page }) => {
        const state = await setup(page, { transactions: 'error' });
        await page.clock.setFixedTime(SUNDAY);
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        await expect(player(page, 'James Cook')).toBeVisible();
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip')).toHaveCount(0);
        // Whatever else was toasted (the upload's own message), nothing about transactions or waivers.
        for (const t of await page.locator('.toast-message').allInnerTexts()) expect(t).not.toMatch(/transaction|waiver/i);
        await expectClean(page, state);
    });

    test('a league synced before S34 (no waiver settings) shows no chips until its next sync', async ({ page }) => {
        const state = await setup(page);
        await page.evaluate(() => {
            const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
            leagues.forEach(l => { delete l.waivers; });
            localStorage.setItem('mls_leagues', JSON.stringify(leagues));
        });
        await page.reload();
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        await expect(line(page, 'Fixture League').locator('.mls-wv-chip')).toHaveCount(0);
        await expectClean(page, state);
    });
});
