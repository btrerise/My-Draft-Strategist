// Playoff chances (improvements S55; js/mls/sim/playoffOdds.js, the simulation unit-tested in tests/unit/playoffs.test.mjs):
// each team's chance to make the playoffs, get a bye and win the title, on the Dashboard's league card, the Roster tab's
// record line and Power Rankings.
//
// The fixture league, six teams, three make the playoffs (the top seed gets a bye), Sleeper's week stubbed to 14, the last before the
// playoffs (week 15): Ace is 12-1 (clinched), you're 8-5 and play Dee (7-6), Cam is 8-5 and plays Eve (6-7), Fay is 1-12
// (eliminated). You and Dee have the fixture's two rosters, the others a spare player or two (Sleeper's projections
// for every week are the fixture's week 2 file).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const NAMES = { 1: 'mds_test', 2: 'Ace', 3: 'Cam', 4: 'Dee', 5: 'Eve', 6: 'Fay' };
const RECORDS = { 1: [8, 5, 1500], 2: [12, 1, 1700], 3: [8, 5, 1450], 4: [7, 6, 1520], 5: [6, 7, 1400], 6: [1, 12, 1100] };
const WEEK14 = [[1, 4], [2, 6], [3, 5]];
// Players nobody else has, so the other teams show in Power Rankings (it leaves out an empty roster).
const SPARE = { 2: ['8138', '9224'], 3: ['9480', '9488'], 5: ['9997', '10229'], 6: ['11566'] };
// You keep the fixture's first roster; Dee, your opponent, gets its second, so your game could go either way.
const FROM = { 1: 0, 4: 1 };

function rosters(played = 13) {
    const base = fixture('league-rosters.json');
    return Object.keys(NAMES).map(Number).map(rid => {
        const from = rid in FROM ? base[FROM[rid]] : { players: SPARE[rid], starters: [], reserve: [], taxi: [] };
        const [w, , fpts] = RECORDS[rid];
        const wins = Math.round(w * played / 13), losses = played - wins;
        return { ...from, roster_id: rid, owner_id: `90000${rid}`, league_id: FIXTURE_LEAGUE_ID, players: from.players || [],
            settings: { wins, losses, ties: 0, fpts, fpts_against: 1400 } };
    });
}
const users = () => Object.entries(NAMES).map(([rid, name]) => ({ user_id: `90000${rid}`, username: name.toLowerCase(), display_name: name, league_id: FIXTURE_LEAGUE_ID, metadata: {} }));
const matchups = (pairs) => pairs.flatMap(([a, b], i) => [a, b].map(rid => ({ roster_id: rid, matchup_id: i + 1, starters: [], players: [], points: 0 })));

async function routeLeague(page, { week = 14, projections = true, schedule = true, played = 13 } = {}) {
    const league = fixture('league.json');
    league.settings = { ...league.settings, playoff_week_start: 15, playoff_teams: 3 };
    await page.route(/sleeper\.app\/v1\/state\/nfl$/, r => r.fulfill({ json: { ...fixture('state-nfl.json'), week, leg: week, display_week: week } }));
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/\d+$/, r => (projections ? r.fulfill({ json: fixture('projections-2026-2.json') }) : r.fulfill({ status: 500, body: '' })));
    // The starters' past weeks (their spread): weeks the fixtures don't have are week 1 again.
    await page.route(/sleeper\.app\/v1\/stats\/nfl\/regular\/2026\/([3-9]|1\d)$/, r => r.fulfill({ json: fixture('stats-2026-1.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}$`), r => r.fulfill({ json: league }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), r => r.fulfill({ json: rosters(played) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/users$`), r => r.fulfill({ json: users() }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), r => (schedule ? r.fulfill({ json: matchups(WEEK14) }) : r.fulfill({ status: 500, body: '' })));
}

async function open(page, opts) {
    const state = await openApp(page, '/lineup/', { beforeGoto: (p) => routeLeague(p, opts) });
    await seedMls(page);
    await showTab(page, 'setup');
    return state;
}

const card = (page) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('.mls-lc-name', { hasText: 'Fixture League' }) });
const pct = (text) => {
    const t = text.trim();
    if (t === 'Clinched') return 100;
    if (t === 'Eliminated' || t === '–') return 0;
    if (t === '<1%') return 0.5;
    if (t === '>99%') return 99.5;
    return Number(t.replace('%', ''));
};

test.describe('Playoff chances', () => {
    test('the league card, the Roster tab\'s record and Power Rankings, adding up to the playoff spots', async ({ page }) => {
        const state = await open(page);
        // You're in between: a percent in the chance colors, then the bye and the title.
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toHaveText(/^Playoffs \d{1,2}% · Bye (<1|\d{1,2})% · Title \d{1,2}%$/);
        const mine = pct(await odds.locator('.mls-week-chance').textContent());
        await expect(odds.locator('.mls-week-chance')).toHaveClass(mine >= 50 ? /\bis-fav\b/ : /\bis-dog\b/);
        await expect(odds).toHaveAttribute('title', /10,000 runs/);

        // The Roster tab: beside the record, the same number.
        await loadMlsRankings(page);
        await showTab(page, 'roster');
        const rec = page.locator('#rosterRecord .mls-roster-record-odds');
        await expect(rec).toHaveText(`Playoffs ${Math.round(mine)}%`);

        // Power Rankings: every team, Ace clinched, Fay eliminated (no title chance), the rest a percent.
        const table = page.locator('#powerRankingsOutput .mls-power-table');
        await expect(table.locator('thead th.mls-power-odds')).toHaveText(['Playoffs', 'Bye', 'Title']);
        const row = (owner) => table.locator('tbody tr').filter({ has: page.locator('.mls-power-owner', { hasText: new RegExp(`^${owner}$`) }) });
        await expect(row('Ace').locator('.mls-power-odds-playoff')).toHaveText('Clinched');
        await expect(row('Ace').locator('.mls-power-odds-playoff .mls-week-chance')).toHaveClass(/\bis-fav\b/);
        await expect(row('Fay').locator('.mls-power-odds-playoff')).toHaveText('Eliminated');
        await expect(row('Fay').locator('.mls-power-odds-playoff .mls-week-chance')).toHaveClass(/\bis-dog\b/);
        await expect(row('Fay').locator('td.mls-power-odds').nth(1)).toHaveText('–');
        await expect(row('You').locator('.mls-power-odds-playoff')).toHaveText(`${Math.round(mine)}%`);
        const playoff = await table.locator('tbody .mls-power-odds-playoff').allTextContents();
        expect(playoff).toHaveLength(6);
        // The numbers add up: three spots, within each percent's rounding.
        const sum = playoff.map(pct).reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 300)).toBeLessThanOrEqual(3);
        const titles = (await table.locator('tbody tr td.mls-power-odds:last-child').allTextContents()).map(pct);
        expect(Math.abs(titles.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(3);
        const byes = (await table.locator('tbody tr td.mls-power-odds:nth-last-child(2)').allTextContents()).map(pct);
        expect(Math.abs(byes.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(3);
        await expect(page.locator('#powerRankingsOutput .mls-power-notes')).toContainText('Playoffs');
        await expectClean(page, state);
    });

    test('without projections, points so far stand in', async ({ page }) => {
        const state = await open(page, { projections: false });
        await expect(card(page).locator('.mls-lc-odds')).toHaveText(/^Playoffs \d{1,2}% · Bye (<1|\d{1,2})% · Title \d{1,2}%$/);
        // getWeeklyProjections logs each failed download (as it does for the Lineup tab's).
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Failed to fetch weekly projections')));
        await expectClean(page, state);
    });

    test('nothing shown when the schedule didn\'t load, or too many weeks are left', async ({ page }) => {
        const state = await open(page, { schedule: false });
        await expect(card(page)).toBeVisible();
        await expect(card(page).locator('.mls-lc-odds')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('week 8: seven weeks left, nothing yet', async ({ page }) => {
        const state = await open(page, { week: 8, played: 7 });
        await expect(card(page)).toBeVisible();
        await expect(card(page).locator('.mls-lc-odds')).toHaveCount(0);
        await expectClean(page, state);
    });
});
