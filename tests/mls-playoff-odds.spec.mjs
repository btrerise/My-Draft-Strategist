// Playoff chances (improvements S55; js/mls/sim/playoffOdds.js, the simulation unit-tested in tests/unit/playoffs.test.mjs):
// each team's chance to make the playoffs, get a bye and win the title, on the Dashboard's league card (left out of a
// folded card once you're eliminated), the Roster tab's record line and its Playoff picture table.
//
// The fixture league, six teams, three make the playoffs (the top seed gets a bye), Sleeper's week stubbed to 14, the last before the
// playoffs (week 15): Ace is 12-1 (clinched), you're 8-5 and play Dee (7-6), Cam is 8-5 and plays Eve (6-7), Fay is 1-12
// (eliminated). You and Dee have the fixture's two rosters, the others a spare player or two (Sleeper's projections
// for every week are the fixture's week 2 file).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const NAMES = { 1: 'mds_test', 2: 'Ace', 3: 'Cam', 4: 'Dee', 5: 'Eve', 6: 'Fay' };
const RECORDS = { 1: [8, 5, 1500], 2: [12, 1, 1700], 3: [8, 5, 1450], 4: [7, 6, 1520], 5: [6, 7, 1400], 6: [1, 12, 1100] };
const WEEK14 = [[1, 4], [2, 6], [3, 5]];
// Players nobody else has, so each team has a lineup to project.
const SPARE = { 2: ['8138', '9224'], 3: ['9480', '9488'], 5: ['9997', '10229'], 6: ['11566'] };
// You keep the fixture's first roster; Dee, your opponent, gets its second, so your game could go either way.
const FROM = { 1: 0, 4: 1 };

function rosters(played = 13, records = RECORDS, divisions = null) {
    const base = fixture('league-rosters.json');
    return Object.keys(NAMES).map(Number).map(rid => {
        const from = rid in FROM ? base[FROM[rid]] : { players: SPARE[rid], starters: [], reserve: [], taxi: [] };
        const [w, , fpts] = records[rid];
        const wins = Math.round(w * played / 13), losses = played - wins;
        return { ...from, roster_id: rid, owner_id: `90000${rid}`, league_id: FIXTURE_LEAGUE_ID, players: from.players || [],
            settings: { wins, losses, ties: 0, fpts, fpts_against: 1400, ...(divisions ? { division: divisions[rid] } : {}) } };
    });
}
const users = () => Object.entries(NAMES).map(([rid, name]) => ({ user_id: `90000${rid}`, username: name.toLowerCase(), display_name: name, league_id: FIXTURE_LEAGUE_ID, metadata: {} }));
// This week's matchups (round 4: live scores): one starter each, his points the team's (none before the games).
const STARTER = { 1: '4866', 2: '8138', 3: '9480', 4: '9509', 5: '9997', 6: '11566' }; // CIN, BUF, DET, ATL, BAL, WAS
const matchups = (pairs, scores = null) => pairs.flatMap(([a, b], i) => [a, b].map(rid => ({
    roster_id: rid, matchup_id: i + 1, starters: scores ? [STARTER[rid]] : [], players: scores ? [STARTER[rid]] : [],
    points: scores ? scores[rid] : 0, players_points: scores ? { [STARTER[rid]]: scores[rid] } : {},
})));
// ESPN's scoreboard for those starters' games: all final before the tests' clock (helpers.mjs's FIXED_NOW), or not
// started yet.
const espn = (state) => ({ events: [['CIN', 'ATL'], ['BUF', 'DET'], ['BAL', 'WAS']].map(([a, b]) => ({
    date: state === 'post' ? '2026-09-15T13:00:00Z' : '2026-09-15T20:00:00Z', status: { type: { state } },
    competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }],
})) });

async function routeLeague(page, { week = 14, projections = true, schedule = true, played = 13, records = RECORDS, scores = null, divisions = null, settings = {} } = {}) {
    const league = fixture('league.json');
    league.settings = { ...league.settings, playoff_week_start: 15, playoff_teams: 3, ...(divisions ? { divisions: 2 } : {}), ...settings };
    await page.route(/sleeper\.app\/v1\/state\/nfl$/, r => r.fulfill({ json: { ...fixture('state-nfl.json'), week, leg: week, display_week: week } }));
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/\d+$/, r => (projections ? r.fulfill({ json: fixture('projections-2026-2.json') }) : r.fulfill({ status: 500, body: '' })));
    // The starters' past weeks (their spread): weeks the fixtures don't have are week 1 again.
    await page.route(/sleeper\.app\/v1\/stats\/nfl\/regular\/2026\/([3-9]|1\d)$/, r => r.fulfill({ json: fixture('stats-2026-1.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}$`), r => r.fulfill({ json: league }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), r => r.fulfill({ json: rosters(played, records, divisions) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/users$`), r => r.fulfill({ json: users() }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), r => (schedule ? r.fulfill({ json: matchups(WEEK14, scores) }) : r.fulfill({ status: 500, body: '' })));
    if (scores) await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, r => r.fulfill({ json: espn('post') }));
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
    test('the league card, the Roster tab\'s record and the Playoff picture, adding up to the playoff spots', async ({ page }) => {
        const state = await open(page);
        // You're in between: a percent in the chance colors, then the bye and the title.
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toHaveText(/^Playoffs \d{1,2}%( · Bye \d{1,2}%)?( · Title \d{1,2}%)?$/);
        const mine = pct(await odds.locator('.mls-week-chance').textContent());
        await expect(odds.locator('.mls-week-chance')).toHaveClass(mine >= 50 ? /\bis-fav\b/ : /\bis-dog\b/);
        await expect(odds).toHaveAttribute('title', /10,000 runs/);
        // Bye and Title only when they're 1% or more (round 4).
        await expect(odds).not.toContainText('<1%');

        // The Roster tab: beside the record, the same number; and the Playoff picture under Power Rankings, which doesn't
        // need rankings (owner's choice, round 2: its own table, not three more columns in Power Rankings).
        await showTab(page, 'roster');
        const rec = page.locator('#rosterRecord .mls-roster-record-odds');
        await expect(rec).toHaveText(`Playoffs ${Math.round(mine)}%`);
        const pic = page.locator('#playoffPicture');
        await expect(pic).toBeVisible();
        await expect(pic.locator('summary')).toHaveText('Playoff picture1 week left · top 3 make it');
        await expect(pic.locator('details.mls-pp')).toHaveAttribute('open', '');
        await expect(pic.locator('thead th')).toHaveText(['Team', 'Record', 'Playoffs', 'Bye', 'Title']);
        // Today's seeding, the playoff line after the third, your row marked.
        const rows = pic.locator('tbody tr');
        await expect(rows.locator('.mls-pp-team')).toHaveText(['Ace', 'You', 'Cam', 'Dee', 'Eve', 'Fay']);
        await expect(rows.nth(3)).toHaveClass('mls-pp-first-out');
        await expect(pic.locator('tbody tr.mls-pp-first-out')).toHaveCount(1);
        await expect(rows.nth(1)).toHaveAttribute('data-you', '');
        const cells = (i, k) => rows.nth(i).locator('td').nth(k);
        await expect(cells(0, 1)).toHaveText('12\u20131');
        await expect(cells(0, 2)).toHaveText('Clinched');
        await expect(cells(0, 2).locator('.mls-week-chance')).toHaveClass(/\bis-fav\b/);
        await expect(cells(5, 2)).toHaveText('Eliminated');
        await expect(cells(5, 2).locator('.mls-week-chance')).toHaveClass(/\bis-dog\b/);
        await expect(cells(5, 3)).toHaveText('\u2013');
        await expect(cells(5, 4)).toHaveText('\u2013');
        await expect(cells(1, 2)).toHaveText(`${Math.round(mine)}%`);
        // The numbers add up: three spots, one bye, one title, within each percent's rounding.
        const column = async (k) => (await rows.evaluateAll((trs, k) => trs.map(tr => tr.children[k].textContent), k)).map(pct);
        const total = (list) => list.reduce((a, b) => a + b, 0);
        expect(Math.abs(total(await column(2)) - 300)).toBeLessThanOrEqual(3);
        expect(Math.abs(total(await column(3)) - 100)).toBeLessThanOrEqual(3);
        expect(Math.abs(total(await column(4)) - 100)).toBeLessThanOrEqual(3);
        await expect(pic.locator('.mls-pp-note')).toContainText('10,000 runs');
        // A plain league: no stars, no bracket line.
        await expect(pic.locator('.mls-pp-star')).toHaveCount(0);
        await expect(pic.locator('.mls-pp-note')).not.toContainText('Bracket:');
        // Long shots' Bye and Title and the eliminated teams' dashes are muted (round 4).
        await expect(cells(5, 3).locator('.mls-pp-dim')).toHaveCount(1);
        expect(await pic.locator('tbody .mls-pp-dim').evaluateAll(els => els.every(el => /^(<1%|\u2013)$/.test(el.textContent)))).toBe(true);

        // A fold: it closes, and Power Rankings, once there are rankings, has no columns of its own.
        await pic.locator('summary').click();
        await expect(pic.locator('details.mls-pp')).not.toHaveAttribute('open', '');
        await expect(pic.locator('table')).toBeHidden();
        await loadMlsRankings(page);
        await showTab(page, 'roster');
        await expect(page.locator('#powerRankingsOutput .mls-power-table thead th')).toHaveCount(7);
        await expect(page.locator('#powerRankingsOutput .mls-power-table')).not.toContainText('Playoffs');

        // The record's "Playoffs NN%" links to the picture (round 7): it opens the closed fold and brings it into view.
        await page.evaluate(() => window.scrollTo(0, 0));
        const link = page.locator('#rosterRecord .mls-roster-odds-link');
        await expect(link).toHaveAccessibleName(`Playoffs ${Math.round(mine)}%: see every team's chances`);
        await link.click();
        await expect(pic.locator('details.mls-pp')).toHaveAttribute('open', '');
        await expect(pic.locator('table')).toBeInViewport();
        await expect(pic.locator('summary')).toBeFocused();
        await expectClean(page, state);
    });

    test('eliminated: the open card says so, a folded card leaves the line out (round 2)', async ({ page }) => {
        // You and Fay swap records: you're 1-12.
        const state = await open(page, { records: { ...RECORDS, 1: RECORDS[6], 6: RECORDS[1] } });
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toHaveText('Playoffs Eliminated');
        await expect(odds).toHaveClass(/\bis-out\b/);
        await card(page).locator('.mls-lc-fold').click();
        await expect(card(page)).toHaveClass(/\bis-collapsed\b/);
        await expect(odds).toBeHidden();
        await card(page).locator('.mls-lc-fold').click();
        await expect(odds).toBeVisible();
        await expectClean(page, state);
    });

    test('a folded card still shows the line while you\'re alive', async ({ page }) => {
        const state = await open(page);
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toBeVisible();
        await card(page).locator('.mls-lc-fold').click();
        await expect(card(page)).toHaveClass(/\bis-collapsed\b/);
        await expect(odds).toBeVisible();
        await expectClean(page, state);
    });

    test('live scores: this week\'s final results decide it before the records do (round 4)', async ({ page }) => {
        // You beat Dee 150-80 and Cam loses to Eve: you're 9-5, sure of a spot on these scores, though the records
        // (last sync) don't prove it yet.
        const state = await open(page, { scores: { 1: 150, 4: 80, 3: 90, 5: 120, 2: 130, 6: 70 } });
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toHaveText(/^Playoffs >99%/);
        await showTab(page, 'roster');
        await expect(page.locator('#playoffPicture summary')).toContainText('this week live');
        await expectClean(page, state);
    });

    test('live scores: a loss that hands Dee the last spot on points for (round 4)', async ({ page }) => {
        // You lose to Dee 80-150 and Cam beats Eve: Ace, Cam (9-5), then you and Dee at 8-6, Dee ahead on points for.
        const state = await open(page, { scores: { 1: 80, 4: 150, 3: 120, 5: 90, 2: 130, 6: 70 } });
        await expect(card(page).locator('.mls-lc-odds')).toHaveText('Playoffs <1%');
        await expect(card(page).locator('.mls-lc-odds .mls-week-chance')).toHaveClass(/\bis-dog\b/);
        await expectClean(page, state);
    });

    test('divisions and the bracket\'s rules, explained under the Playoff picture (round 6)', async ({ page }) => {
        // You, Ace and Cam in division 1, Dee, Eve and Fay in 2; re-seeded after each round, a two-week final.
        const state = await open(page, { divisions: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2 }, settings: { playoff_seed_type: 1, playoff_round_type: 1 } });
        await expect(card(page).locator('.mls-lc-odds')).toBeVisible();
        await showTab(page, 'roster');
        const pic = page.locator('#playoffPicture');
        // The division leaders first (Ace, and Dee at 7-6 ahead of your 8-5), each marked.
        await expect(pic.locator('tbody .mls-pp-team')).toHaveText(['\u2605Division leader: Ace', '\u2605Division leader: Dee', 'You', 'Cam', 'Eve', 'Fay']);
        await expect(pic.locator('tbody .mls-pp-star')).toHaveCount(2);
        await expect(pic.locator('tbody tr').nth(0).locator('.mls-pp-star')).toHaveText('\u2605');
        // One line of facts; the note says what the star and the bracket mean.
        await expect(pic.locator('summary')).toHaveText('Playoff picture1 week left · top 3 make it');
        const note = pic.locator('.mls-pp-note');
        await expect(note).toContainText('\u2605 leads a division: division leaders take the top seeds.');
        await expect(note).toContainText('Bracket: re-seeded after each round; a two-week final.');
        await expectClean(page, state);
    });

    test('new numbers replace only the cards\' odds lines, not the cards (round 7)', async ({ page }) => {
        const state = await open(page);
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toBeVisible();
        await card(page).evaluate(el => { window.__card = el; el.querySelector('.mls-lc-odds').remove(); });
        await expect(odds).toHaveCount(0);
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('mls-playoff-odds')));
        await expect(odds).toBeVisible();
        expect(await card(page).evaluate(el => el === window.__card)).toBe(true);
        // Right under the status row, as a full redraw draws it.
        expect(await odds.evaluate(el => el.previousElementSibling.classList.contains('mls-lc-status'))).toBe(true);
        await expectClean(page, state);
    });

    test('a sync that changes nothing keeps the numbers up (round 7)', async ({ page }) => {
        const state = await open(page);
        const odds = card(page).locator('.mls-lc-odds');
        await expect(odds).toBeVisible();
        const before = await odds.textContent();
        // Watch every redraw of the cards through the sync: the Fixture League's card never lacks its line.
        await page.evaluate(() => {
            window.__gaps = 0;
            const list = document.getElementById('leagueCards');
            new MutationObserver(() => {
                const c = [...list.children].find(li => li.querySelector('.mls-lc-name')?.textContent.includes('Fixture League'));
                if (c && !c.querySelector('.mls-lc-odds')) window.__gaps++;
            }).observe(list, { childList: true, subtree: true });
        });
        // A minute later (the tests' clock is fixed, and a sync stamps the time).
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 60 * 1000));
        await seedMls(page);
        await page.waitForTimeout(500);
        await expect(odds).toBeVisible();
        expect(await page.evaluate(() => window.__gaps)).toBe(0);
        expect(await odds.textContent()).toBe(before);
        await expectClean(page, state);
    });

    test('without projections, points so far stand in', async ({ page }) => {
        const state = await open(page, { projections: false });
        await expect(card(page).locator('.mls-lc-odds')).toHaveText(/^Playoffs \d{1,2}%( · Bye \d{1,2}%)?( · Title \d{1,2}%)?$/);
        // getWeeklyProjections logs each failed download (as it does for the Lineup tab's).
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Failed to fetch weekly projections')));
        await expectClean(page, state);
    });

    test('nothing shown when the schedule didn\'t load, or too many weeks are left', async ({ page }) => {
        const state = await open(page, { schedule: false });
        await expect(card(page)).toBeVisible();
        await expect(card(page).locator('.mls-lc-odds')).toHaveCount(0);
        await showTab(page, 'roster');
        await expect(page.locator('#rosterRecord')).toBeVisible();
        await expect(page.locator('#playoffPicture')).toBeHidden();
        await expect(page.locator('#rosterRecord .mls-roster-record-odds')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('week 8: seven weeks left, nothing yet', async ({ page }) => {
        const state = await open(page, { week: 8, played: 7 });
        await expect(card(page)).toBeVisible();
        await expect(card(page).locator('.mls-lc-odds')).toHaveCount(0);
        await expectClean(page, state);
    });
});
