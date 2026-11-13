// The Scoreboard's Final Window (improvements S36, js/mls/week/lastWindow.js and week/thisWeek.js's finalHTML): when every
// live player in your matchups is in the week's last night window, a section above League Scoreboard shows what's at
// stake, expected wins, the best case and a clean sweep, then what each matchup needs.
//
// Fixtures: mls-root-for.spec.mjs's three leagues. On Monday night every game is final but two, MIN @ CHI (7:15 PM ET)
// and KC @ DEN (8:15 PM ET): your Justin Jefferson (MIN) against their Harrison Butker (KC), in all three leagues.
// Butker's points are set to 0 (he hasn't played), so the scores are: Fixture League 98–104 (down 6), Second 130.4–88.2
// (up 42.2) and Third 100–102 (down 2).
// On Sunday afternoon the 1:00 games are under way: not the final window, so no section.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID, FIXTURE_LEAGUE3_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const MONDAY = new Date('2026-09-21T23:30:00Z'); // 7:30 PM ET, before both Monday kickoffs
const SUNDAY = new Date('2026-09-20T18:30:00Z');
const BUTKER = '5095';
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
// Butker hasn't played yet: his points come off his team's total.
// lead: points added to the opponent's total (roster 2), to settle a matchup for the one- and none-at-stake cases.
const benchButker = (name, lead = 0) => JSON.stringify(JSON.parse(fixture(name)).map(e => {
    const pts = (e.players_points || {})[BUTKER];
    if (typeof pts !== 'number') return e;
    const extra = e.roster_id === 2 ? lead : 0;
    return { ...e, points: Math.round((e.points - pts + extra) * 100) / 100, players_points: { ...e.players_points, [BUTKER]: 0 } };
}));
const GAMES = [['BUF', 'BAL'], ['CIN', 'DAL'], ['LV', 'ATL'], ['DET', 'NYG'], ['HOU', 'PHI'], ['KC', 'DEN'], ['MIN', 'CHI']];
const scoreboard = (monday) => ({
    events: GAMES.map(([a, b]) => {
        const [date, state] = monday
            ? (a === 'MIN' ? ['2026-09-22T00:15:00Z', 'pre'] : a === 'KC' ? ['2026-09-22T01:15:00Z', 'pre'] : ['2026-09-20T17:00:00Z', 'post'])
            : (a === 'MIN' ? ['2026-09-21T00:20:00Z', 'pre'] : ['2026-09-20T17:00:00Z', 'in']);
        return { date, status: { type: { state } }, competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }] };
    }),
});

const card = (page) => page.locator('#thisWeekCard');
const section = (page) => card(page).locator('.mls-week-fold[data-fold="final"]');

async function addLeague(page, id, count) {
    await page.fill('#sleeperLeagueId', id);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(count);
}
async function setup(page, when, { failWorker = false, lead = {} } = {}) {
    const monday = when === MONDAY;
    await page.clock.setFixedTime(when);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(when);
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard(monday) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league-matchups-live.json', lead.first || 0) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league2-matchups.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE3_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league3-matchups.json', lead.third || 0) }));
    if (failWorker) await page.route(/lastWindowWorker\.js$/, route => route.abort());
    await seedMls(page);
    await addLeague(page, FIXTURE_LEAGUE2_ID, 2);
    await addLeague(page, FIXTURE_LEAGUE3_ID, 3);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'scoreboard');
    await expect(card(page).locator('.mls-week-fold[data-fold="league"]')).toBeVisible();
    return state;
}

test.describe('Scoreboard: the Final Window', () => {
    test('Monday night with two games left: the stakes, expected wins, best case, sweep and what each matchup needs', async ({ page }) => {
        const state = await setup(page, MONDAY);
        const sec = section(page);
        await expect(sec).toBeVisible();
        // Above League Scoreboard.
        const order = await card(page).locator('.mls-week-fold.mls-week-section').evaluateAll(els => els.map(e => e.dataset.fold));
        expect(order).toEqual(['final', 'league', 'player']);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('Final Window');
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('MIN @ CHI, KC @ DEN');
        // Once the runs are in, the title counts what's at stake, and the settled one apart.
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('2 matchups ride on them · 1 settled');
        await expect(sec.locator('svg.mls-fw-icon')).toHaveAttribute('aria-hidden', 'true');

        // The tiles, once the simulation is in.
        const tiles = sec.locator('.mls-fw-tile');
        await expect(tiles).toHaveCount(4);
        await expect(sec.locator('.mls-fw-tiles')).not.toHaveAttribute('aria-busy', 'true');
        await expect(tiles.nth(0)).toContainText('At stake');
        await expect(tiles.nth(0)).toContainText('of 3 live matchups');
        await expect(tiles.nth(1)).toContainText(/Expected\s*\d\.\d W\s*usually \d(–\d)? W/);
        // The best case here is a sweep (both at stake won), so that tile shows the most likely number of wins instead.
        await expect(tiles.nth(2)).toContainText(/Most likely\s*0 W\s*\d+% of runs/);
        await expect(tiles.nth(3)).toContainText('Clean sweep');

        // What each matchup needs: a card per open matchup, each with its line (position badges in it), a bar, and the
        // one-on-one table; the settled one on a line under them.
        const items = sec.locator('.mls-fw-match');
        await expect(items).toHaveCount(2);
        const third = items.filter({ hasText: 'Third Fixture League' });
        await expect(third.locator('.mls-fw-need')).toHaveText('Down 2.0. WR Justin Jefferson needs 2.0+ more than K Harrison Butker.');
        await expect(third.locator('.mls-fw-need .pos-badge')).toHaveText(['WR', 'K']);
        await expect(third.locator('.mls-fw-bar .mls-week-chance')).toContainText('to win');
        await expect(third.locator('.mls-fw-table tbody tr')).toHaveCount(3);
        await expect(third.locator('.mls-fw-table tbody tr').first()).toContainText('Quiet: 0.0');
        await expect(third.locator('.mls-fw-table thead')).toHaveText('If Jefferson scoresButker must score');
        await expect(third.locator('.mls-fw-table tbody tr').first()).toContainText('you lose either way');
        const first = items.filter({ hasText: 'Fixture League' }).filter({ hasNotText: 'Second' }).filter({ hasNotText: 'Third' });
        await expect(first.locator('.mls-fw-need')).toHaveText('Down 6.0. WR Justin Jefferson needs 6.0+ more than K Harrison Butker.');
        // Up 42.2 against a kicker: settled, not at stake, on one line under the cards.
        await expect(items.filter({ hasText: 'Second Fixture League' })).toHaveCount(0);
        await expect(sec.locator('.mls-fw-note').first()).toHaveText('Settled: Second Fixture League (W, +42.2).');
        await expect(tiles.nth(0)).toContainText('2 W');
        // How it's worked out is in the (i) beside the heading, not in plain view.
        await expect(sec.locator('.mls-fw-sub-row .tooltip-text')).toContainText('draws every live player once');
        await expect(sec.locator('.mls-fw-note')).toHaveCount(1);
        // Still in play points here instead of repeating the same two matchups.
        const league = card(page).locator('.mls-week-fold[data-fold="league"]');
        await expect(league.locator('.mls-fw-pointer')).toHaveText('Still in play: 2, in the Final Window above');
        await expect(league.locator('.mls-week-swings')).toHaveCount(0);

        // How fresh the scores are, with a Refresh beside it.
        await expect(sec.locator('.mls-fw-asof')).toContainText(/as of \d{1,2}:\d{2} (AM|PM)/);
        await expect(sec.locator('.mls-fw-refresh')).toHaveText('Refresh');
        // It folds, remembered.
        await sec.locator('.mls-week-fold-toggle').click();
        await expect(sec.locator('.mls-week-fold-body')).toBeHidden();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mls_scoreboard_folds')))).toEqual({ final: false });
        // Folded, Still in play lists its matchups again.
        await expect(league.locator('.mls-fw-pointer')).toHaveCount(0);
        await expect(league.locator('.mls-week-swing')).toHaveCount(2);
        await sec.locator('.mls-week-fold-toggle').click();
        await expect(sec.locator('.mls-week-fold-body')).toBeVisible();
        await expect(league.locator('.mls-fw-pointer')).toHaveCount(1);

        // The credit, under the card and in the Guide (owner's choice).
        const credit = page.locator('.mls-scoreboard-credit').filter({ hasText: 'FF Historian' });
        await expect(credit).toHaveText('The Final Window was inspired by FF Historian, ffhistorian.com');
        await expect(credit.locator('a')).toHaveAttribute('href', 'https://ffhistorian.com/');
        // Nothing past the card's edges.
        const over = await card(page).evaluate(el => { const r = el.getBoundingClientRect(); return [...el.querySelectorAll('.mls-fw *:not(.tooltip-text)')].filter(c => { const b = c.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); }).map(c => c.className); });
        expect(over).toEqual([]);
        // The (i) opens on a tap and its box stays on the screen (tooltips-onscreen.spec.mjs's rule).
        const icon = sec.locator('.mls-fw-sub-row .tooltip-icon');
        await expect(icon).toHaveText('i');
        await icon.click();
        const box = await sec.locator('.mls-fw-sub-row .tooltip-text').boundingBox();
        const vw = await page.evaluate(() => document.documentElement.clientWidth);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vw);
        await expectClean(page, state);
    });

    test('a card opens its league\'s Lineup tab, as the league tiles do', async ({ page }) => {
        const state = await setup(page, MONDAY);
        const third = section(page).locator('.mls-fw-match').filter({ hasText: 'Third Fixture League' });
        await expect(third.locator('.mls-fw-match-open')).toHaveAttribute('aria-label', 'Third Fixture League: open its lineup');
        await third.locator('.mls-fw-match-open').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE3_ID);
        await expectClean(page, state);
    });

    test('one matchup at stake: one line names it, no tiles', async ({ page }) => {
        // Fixture League down 36: settled too, so only Third Fixture League is at stake.
        const state = await setup(page, MONDAY, { lead: { first: 30 } });
        const sec = section(page);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('1 matchup rides on them · 2 settled');
        await expect(sec.locator('.mls-fw-oneline')).toContainText(/^One matchup at stake: Third Fixture League, \d+% to win$/);
        await expect(sec.locator('.mls-fw-tiles')).toHaveCount(0);
        await expect(sec.locator('.mls-fw-match')).toHaveCount(1);
        await expectClean(page, state);
    });

    test('nothing at stake: one line says so, and the settled ones', async ({ page }) => {
        const state = await setup(page, MONDAY, { lead: { first: 30, third: 30 } });
        const sec = section(page);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('nothing rides on them · 3 settled');
        await expect(sec.locator('.mls-fw-oneline')).toHaveText('Nothing rides on tonight: all 3 live matchups are settled (1 W, 2 L).');
        await expect(sec.locator('.mls-fw-tiles')).toHaveCount(0);
        await expect(sec.locator('.mls-fw-match')).toHaveCount(0);
        await expect(sec.locator('h4')).toHaveCount(0);
        await expect(sec.locator('.mls-fw-note')).toContainText('Settled: ');
        await expect(sec.locator('.mls-fw-asof')).toBeVisible();
        await expectClean(page, state);
    });

    test('the simulation runs on the page when the worker can\'t start', async ({ page }) => {
        const state = await setup(page, MONDAY, { failWorker: true });
        await expect(section(page).locator('.mls-fw-tiles')).not.toHaveAttribute('aria-busy', 'true');
        await expect(section(page).locator('.mls-fw-tile').nth(0)).toContainText('2 W');
        await expectClean(page, state);
    });

    test('Sunday afternoon, with the early games under way: no Final Window', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        await expect(card(page).locator('.mls-week-fold[data-fold="player"]')).toBeVisible();
        await expect(section(page)).toHaveCount(0);
        await expectClean(page, state);
    });
});
