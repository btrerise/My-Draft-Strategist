// The Scoreboard's Who to root for (improvements S27, js/mls/week/rootFor.js and week/thisWeek.js): the tab's two halves
// (League Scoreboard, Player Scoreboard) that fold and are remembered; the groups Root for, Against you and Both sides;
// the share score (and a paid league's weight); a row's leagues on tap and with Enter; a kickoff window that folds; the
// finished games' line; Show all; a past week; and the empty states (no Sleeper league, a league still loading, no
// matchups in any league).
//
// Fixtures (tests/fixtures/sleeper/make-fixtures.mjs): Sunday of week 2 with only the MIN game left (Justin Jefferson,
// yours, still to play), as in mls-this-week.spec.mjs, in three leagues: Fixture League, Second Fixture League and Third
// Fixture League, where Josh Allen and Lamar Jackson have swapped teams. So Allen is yours in two and against you in one,
// Lamar the reverse (Both sides); your other seven starters are Root for and Rival's other seven Against you.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID, FIXTURE_LEAGUE3_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const SUNDAY = new Date('2026-09-20T22:00:00Z');
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const GAMES = [['BUF', 'BAL'], ['CIN', 'DAL'], ['LV', 'ATL'], ['DET', 'NYG'], ['HOU', 'PHI'], ['KC', 'DEN'], ['MIN', 'CHI']];
const scoreboard = () => ({
    events: GAMES.map(([a, b]) => {
        const night = a === 'MIN';
        return {
            date: night ? '2026-09-21T00:20:00Z' : '2026-09-20T17:00:00Z', status: { type: { state: night ? 'pre' : 'post' } },
            competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }],
        };
    }),
});

const card = (page) => page.locator('#thisWeekCard');
const section = (page, which) => card(page).locator(`.mls-week-fold[data-fold="${which}"]`);
const board = (page) => section(page, 'root');
const group = (page, kind) => board(page).locator(`.mls-root-group.is-${kind}`);
const names = (loc) => loc.locator('.mls-root-name');

async function routeWeek(page, { empty = false } = {}) {
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard() }));
    const body = (file) => (empty ? '[]' : fixture(file));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: body('league-matchups-live.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: body('league2-matchups.json') }));
    // Jefferson's projection, so two matchups stay open (round 5: only open ones count). At the fixture's own he can't
    // close Fixture League's 12 points; at 12.5 he's all but sure to close Third Fixture League's 8, and the Simulator
    // settles each. At 10 both stay in play (about 8% and 92%), and Second Fixture League is decided.
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/2$/, route => {
        const proj = JSON.parse(fixture('projections-2026-2.json'));
        proj['6794'] = { ...proj['6794'], pts_ppr: 10 };
        return route.fulfill({ json: proj });
    });
    if (empty) await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE3_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: '[]' }));
}

async function addLeague(page, id, count) {
    await page.fill('#sleeperLeagueId', id);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(count);
}

async function setup(page, { leagues = 3, empty = false } = {}) {
    await page.clock.setFixedTime(SUNDAY);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(SUNDAY);
    await routeWeek(page, { empty });
    await seedMls(page);
    if (leagues >= 2) await addLeague(page, FIXTURE_LEAGUE2_ID, 2);
    if (leagues >= 3) await addLeague(page, FIXTURE_LEAGUE3_ID, 3);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'scoreboard');
    return state;
}

test.describe('Scoreboard: who to root for', () => {
    test('mid-Sunday: two halves, the groups hold only players still to play, the leagues on tap, the windows', async ({ page }) => {
        const state = await setup(page);
        await expect(section(page, 'league')).toContainText('League Scoreboard');
        await expect(section(page, 'player')).toContainText('Player Scoreboard');
        // League Scoreboard holds the matchups; Player Scoreboard holds the board, then MVPs & LVPs.
        await expect(section(page, 'league').locator('.mls-week-tile')).toHaveCount(3);
        await expect(section(page, 'player').locator('.mls-week-fold[data-fold="root"] + .mls-week-fold[data-fold="recap"]')).toHaveCount(1);
        // Round 4: with the MIN game still to come, the groups show only who's still to play: Jefferson.
        await expect(section(page, 'player').locator('.mls-week-fold-toggle').first()).toContainText('Root for 1 · Against 0 · Both 0');
        await expect(board(page).locator('.mls-root-intro')).toContainText('still to play');
        await expect(group(page, 'root').locator('.mls-root-group-title')).toContainText('Root for 1');
        // Round 5: only open matchups count, and Second Fixture League is decided: "in 2", not 3.
        await expect(names(group(page, 'root'))).toHaveText(['Justin Jefferson in 2']);
        await expect(group(page, 'root').locator('.mls-root-count')).toHaveText('in 2');
        await expect(group(page, 'against')).toContainText('All 7 have finished: see the games final line below.');
        await expect(group(page, 'both')).toContainText('All 2 have finished: see the games final line below.');

        // Tap: which leagues on which side; Enter closes it again, with focus kept on the row.
        const jj = group(page, 'root').locator('.mls-root-row').first();
        const btn = jj.locator('.mls-root-player');
        await expect(btn).toHaveAttribute('aria-expanded', 'false');
        await btn.click();
        await expect(btn).toHaveAttribute('aria-expanded', 'true');
        const detail = jj.locator('.mls-root-detail');
        await expect(detail).toBeVisible();
        await expect(detail.locator('.mls-root-detail-side')).toHaveCount(1);
        await expect(detail).toContainText('Yours in');
        // Every league in the detail; the decided one dimmed and said so.
        await expect(detail.locator('li')).toHaveCount(3);
        await expect(detail.locator('li.mls-root-part-off')).toHaveCount(1);
        await expect(detail.locator('li.mls-root-part-off')).toContainText('Second Fixture League');
        await expect(detail.locator('li.mls-root-part-off')).toContainText('effectively decided');
        await page.keyboard.press('Enter');
        await expect(btn).toHaveAttribute('aria-expanded', 'false');
        await expect(detail).toBeHidden();
        await expect(btn).toBeFocused();

        // By kickoff window: only the MIN game is still to come; the rest are in the finished games' line, folded.
        const windows = board(page).locator('.mls-root-window');
        await expect(windows).toHaveCount(2);
        const night = windows.first();
        await expect(night.locator('.mls-root-window-sub')).toHaveText('MIN @ CHI · 1 yours · 0 against');
        await expect(night.locator('.mls-root-side').first()).toContainText('Justin Jefferson');
        // Round 4: "in 3" after the name, and "pts" under the points on every row.
        await expect(night.locator('.mls-root-side').first().locator('.mls-root-in')).toHaveText('in 2');
        await expect(night.locator('.mls-root-side').first().locator('.mls-root-pts small')).toHaveText('pts');
        await expect(night.locator('.mls-root-side').nth(1)).toContainText('Nobody');
        const final = windows.nth(1);
        await expect(final.locator('.mls-root-window-title')).toHaveText('6 games final');
        await expect(final.locator('.mls-root-window-sub')).toHaveText('8 of your starters, 9 against you');
        await expect(final.locator('.mls-root-window-body')).toBeHidden();
        await final.locator('.mls-root-window-head').click();
        await expect(final.locator('.mls-root-window-body')).toBeVisible();
        await expect(final.locator('.mls-root-side').first().locator('.mls-root-row')).toHaveCount(5);
        await expect(final.locator('.mls-root-pts small')).toHaveText(Array(10).fill('pts'));
        // A window folds too.
        await night.locator('.mls-root-window-head').click();
        await expect(night.locator('.mls-root-window-body')).toBeHidden();
        await expect(night.locator('.mls-root-window-head')).toHaveAttribute('aria-expanded', 'false');
        // Every finished starter against you, D/ST and K included.
        const theirs = final.locator('.mls-root-side').nth(1);
        await theirs.locator('[data-action="showAllRoot"]').click();
        await expect(theirs.locator('.mls-root-row')).toHaveCount(9);
        await expect(theirs.locator('.mls-root-pos', { hasText: 'D/ST' })).toHaveCount(1);
        await expect(theirs.locator('.mls-root-pos', { hasText: /^K$/ })).toHaveCount(1);
        await expectClean(page, state);
    });

    test('every game final: all three groups, the counts, the stake, Show all and Show less', async ({ page }) => {
        const state = await setup(page);
        await card(page).locator('.mls-week-step[data-step="-1"]').click();
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        await expect(section(page, 'player').locator('.mls-week-fold-toggle').first()).toContainText('Root for 7 · Against 7 · Both 2');
        await expect(board(page).locator('.mls-root-intro')).not.toContainText('still to play');
        await expect(group(page, 'root').locator('.mls-root-count').first()).toHaveText('in 3');
        await expect(group(page, 'root').locator('.mls-root-row')).toHaveCount(5);
        await expect(group(page, 'against').locator('.mls-root-count.is-against').first()).toHaveText('in 3');
        // Both sides: Allen yours in 2 of 3, Lamar in 1 of 3; every league counts the same once the games are over
        // (67% and 33%, between the 25% and 75% lines, so they stay here).
        const both = group(page, 'both').locator('.mls-root-row');
        await expect(both).toHaveCount(2);
        const allen = both.filter({ hasText: 'Josh Allen' });
        await expect(allen.locator('.mls-root-count.is-both')).toHaveText('2 of 3 yours');
        await expect(both.filter({ hasText: 'Lamar Jackson' }).locator('.mls-root-count.is-both')).toHaveText('1 of 3 yours');
        await expect(allen.locator('.mls-root-share')).toHaveText('Your stake: 67%');
        await expect(both.filter({ hasText: 'Lamar Jackson' }).locator('.mls-root-share')).toHaveText('Your stake: 33%');
        // Every row in the three groups is the same height.
        const heights = await board(page).locator('.mls-root-spot .mls-root-player').evaluateAll(els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().height)))]);
        expect(heights).toHaveLength(1);
        // The (i) beside Both sides explains the chip, the stake and the 75% / 25% lines.
        const tip = group(page, 'both').locator('.mls-root-group-title .tooltip-text');
        await expect(tip).toContainText('for you in 3 and against you in the other');
        await expect(tip).toContainText('75% or more');
        await expect(allen.locator('.mls-root-meta')).toHaveText('BUF @ BAL · Final');
        await allen.locator('.mls-root-player').click();
        const detail = allen.locator('.mls-root-detail');
        await expect(detail.locator('.mls-root-detail-side').first()).toContainText('Fixture League');
        await expect(detail.locator('.mls-root-detail-side').first()).toContainText('Second Fixture League');
        await expect(detail.locator('.mls-root-detail-side').nth(1)).toContainText('Against you in');
        await expect(detail.locator('.mls-root-detail-side').nth(1)).toContainText('Third Fixture League');

        // Show all: the other two rows, focus on the first of them; Show less folds it back, focus on the button.
        const more = group(page, 'root').locator('[data-action="showAllRoot"]');
        await more.click();
        await expect(group(page, 'root').locator('.mls-root-row')).toHaveCount(7);
        await expect(group(page, 'root').locator('.mls-root-player').nth(5)).toBeFocused();
        await expect(more).toHaveText('Show less');
        await more.click();
        await expect(group(page, 'root').locator('.mls-root-row')).toHaveCount(5);
        await expect(more).toHaveText('Show all 7');
        await expect(more).toBeFocused();
        await expectClean(page, state);
    });

    test('a paid league counts 1.5 times in the share score', async ({ page }) => {
        const state = await setup(page);
        await showTab(page, 'setup');
        await page.click('#reorderLeagueCards');
        await page.locator(`[data-action="toggleLeaguePaid"][data-league-id="${FIXTURE_LEAGUE3_ID}"]`).click();
        await showTab(page, 'scoreboard');
        // Week 1: every game final, so Both sides shows Allen and Lamar.
        await card(page).locator('.mls-week-step[data-step="-1"]').click();
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        const both = group(page, 'both').locator('.mls-root-row');
        // Allen: yours in two free leagues (1 + 1), against you in the paid one (1.5): 2 / 3.5.
        await expect(both.filter({ hasText: 'Josh Allen' }).locator('.mls-root-share')).toHaveText('Your stake: 57%');
        await expect(both.filter({ hasText: 'Lamar Jackson' }).locator('.mls-root-share')).toHaveText('Your stake: 43%');
        await expectClean(page, state);
    });

    test('League and Player Scoreboard fold, and stay folded after a reload', async ({ page }) => {
        const state = await setup(page, { leagues: 2 });
        const toggle = (which) => section(page, which).locator(':scope > .mls-week-fold-toggle');
        await toggle('league').click();
        await expect(toggle('league')).toHaveAttribute('aria-expanded', 'false');
        await expect(section(page, 'league').locator(':scope > .mls-week-fold-body')).toBeHidden();
        await toggle('player').click();
        await expect(section(page, 'player').locator(':scope > .mls-week-fold-body')).toBeHidden();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mls_scoreboard_folds')))).toEqual({ league: false, player: false });
        await page.reload();
        await showTab(page, 'scoreboard');
        await expect(toggle('league')).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle('player')).toHaveAttribute('aria-expanded', 'false');
        // Folded, each still says what's in it.
        await expect(toggle('league')).toContainText('2 leagues');
        // Second Fixture League is decided, so only one matchup is open and nobody is in 2 or more (round 5).
        await expect(toggle('player')).toContainText('16 starters');
        await toggle('league').click();
        await toggle('player').click();
        await expect(toggle('player')).toHaveAttribute('aria-expanded', 'true');
        // Back to the defaults: the key is removed.
        expect(await page.evaluate(() => localStorage.getItem('mls_scoreboard_folds'))).toBeNull();
        // Nobody in 2 or more open matchups: one line, not three empty groups.
        await expect(board(page).locator('.mls-root-none-all')).toHaveText('Nobody starts in 2 or more of your matchups this week.');
        await expectClean(page, state);
    });

    test('a past week: every game final, the board open with final points', async ({ page }) => {
        const state = await setup(page);
        await card(page).locator('.mls-week-step[data-step="-1"]').click();
        await expect(card(page).locator('.mls-week-title')).toHaveText('Week 1 Recap');
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        const windows = board(page).locator('.mls-root-window');
        await expect(windows).toHaveCount(1);
        await expect(windows.first().locator('.mls-root-window-title')).toHaveText('Every game is final');
        await expect(windows.first().locator('.mls-root-window-body')).toBeVisible();
        // Jefferson too is final now, with week 1's half-PPR points from Sleeper's stats.
        await group(page, 'root').locator('[data-action="showAllRoot"]').click();
        const jj = group(page, 'root').locator('.mls-root-row').filter({ hasText: 'Justin Jefferson' });
        await expect(jj.locator('.mls-root-meta')).toContainText('Final');
        await expect(jj.locator('.mls-root-pts')).not.toContainText('–');
        await expect(group(page, 'both').locator('.mls-root-row')).toHaveCount(2);
        await expectClean(page, state);
    });

    test('empty states: no Sleeper league, a league still loading, no matchups in any league', async ({ page }) => {
        // No Sleeper league: the Scoreboard's own message, and no board.
        await page.clock.setFixedTime(SUNDAY);
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'scoreboard');
        await expect(card(page)).toContainText('Sync a Sleeper league on the Dashboard');
        await expect(board(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    test('a league still loading joins the board when it arrives', async ({ page }) => {
        const state = await setup(page, { leagues: 2 });
        let release;
        const held = new Promise(r => { release = r; });
        await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE3_ID}/matchups/\\d+$`), async route => {
            await held;
            return route.fulfill({ contentType: 'application/json', body: fixture('league3-matchups.json') });
        });
        await showTab(page, 'setup');
        await addLeague(page, FIXTURE_LEAGUE3_ID, 3);
        await showTab(page, 'scoreboard');
        await expect(board(page).locator('.mls-root-pending')).toHaveText('Still loading 1 league; it joins the board when it arrives.');
        // Of the two loaded, only Fixture League is open (round 5), so nobody is in 2 or more yet.
        await expect(board(page).locator('.mls-root-none-all')).toBeVisible();
        release();
        await expect(board(page).locator('.mls-root-pending')).toHaveCount(0);
        // Allen and Lamar are on both sides now; their game is over, so the group points to the final line.
        await expect(group(page, 'both')).toContainText('All 2 have finished');
        await expectClean(page, state);
    });

    test('one league: no empty groups, one line, and every starter by window', async ({ page }) => {
        const state = await setup(page, { leagues: 1 });
        await expect(board(page).locator('.mls-root-spot')).toHaveCount(0);
        await expect(board(page).locator('.mls-root-none-all')).toHaveText('Nobody starts in 2 or more of your matchups this week.');
        await expect(section(page, 'player').locator(':scope > .mls-week-fold-toggle')).toContainText('16 starters');
        await expect(board(page).locator('.mls-root-window').first().locator('.mls-root-side').first()).toContainText('Justin Jefferson');
        await expectClean(page, state);
    });

    test('no matchups in any league: the board says so', async ({ page }) => {
        const state = await setup(page, { empty: true });
        await expect(card(page).locator('.mls-week-empty')).toContainText('No matchups in week 2');
        await expect(board(page).locator('.mls-root-empty')).toHaveText('No matchups in week 2 in your Sleeper leagues, so there\'s nobody to root for.');
        await expectClean(page, state);
    });

    test('at 375px and 1280px every row stays inside the card', async ({ page }) => {
        const state = await setup(page);
        // Week 1 (every game final), so Both sides has its two players; one opened.
        await card(page).locator('.mls-week-step[data-step="-1"]').click();
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        await group(page, 'both').locator('.mls-root-player').first().click();
        const over = await page.evaluate(() => {
            const box = document.getElementById('thisWeekCard').getBoundingClientRect();
            return [...document.querySelectorAll('#thisWeekCard .mls-root-player, #thisWeekCard .mls-root-detail:not([hidden])')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.left < box.left - 1 || r.right > box.right + 1); }).length;
        });
        expect(over).toBe(0);
        await expect(page.locator('.mls-scoreboard-credit')).toContainText('The root-for board was inspired by Sleepy');
        await expect(page.locator('.mls-scoreboard-credit a')).toHaveAttribute('href', 'https://sleepy-football.vercel.app');
        await expectClean(page, state);
    });
});
