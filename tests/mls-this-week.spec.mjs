// The Dashboard's This week card (improvements S21, js/mls/week/thisWeek.js): every Sleeper league's matchup, live,
// the W-L split paid / free and redraft / dynasty, the matchups still in play with the live players on each side and
// a win chance, the decided ones on one line, Provisional until every game is final, then Final. Paid is Reorder
// mode's "$ Paid" on a league card, saved on the league (a sync keeps it). And the Roster tab's season record.
//
// Fixtures (tests/fixtures/sleeper/make-fixtures.mjs): Sunday of week 2 with only the MIN game left. Fixture League
// (redraft): you trail Rival 98.0 to 110.0 with Justin Jefferson (MIN) still to play, a swing. Second Fixture League
// (dynasty): you lead 130.4 to 95.2 and Rival has nobody left, decided. ESPN's scoreboard is stubbed here.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const SUNDAY = new Date('2026-09-20T22:00:00Z');
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');

// Every team the two lineups use: all final but MIN, which plays Sunday night.
const GAMES = [['BUF', 'BAL'], ['CIN', 'DAL'], ['LV', 'ATL'], ['DET', 'NYG'], ['HOU', 'PHI'], ['KC', 'DEN'], ['MIN', 'CHI']];
function scoreboard({ minFinal = false } = {}) {
    return {
        events: GAMES.map(([a, b]) => {
            const night = a === 'MIN';
            const state = night && !minFinal ? 'pre' : 'post';
            return {
                date: night ? '2026-09-21T00:20:00Z' : '2026-09-20T17:00:00Z', status: { type: { state } },
                competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }],
            };
        }),
    };
}

const card = (page) => page.locator('#thisWeekCard');

// matchups: what Fixture League's matchups answer ('live' | 'final'); league2: 'ok' | 'fail'; minFinal: the MIN game.
async function routeWeek(page, opts) {
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route =>
        route.fulfill({ json: scoreboard({ minFinal: opts.minFinal }) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route =>
        route.fulfill({ contentType: 'application/json', body: fixture(opts.matchups === 'final' ? 'league-matchups-final.json' : 'league-matchups-live.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route =>
        opts.league2 === 'fail' ? route.fulfill({ status: 500, body: '' }) : route.fulfill({ contentType: 'application/json', body: fixture('league2-matchups.json') }));
}

async function setup(page, opts = {}) {
    const o = { matchups: 'live', league2: 'ok', minFinal: false, ...opts };
    await page.clock.setFixedTime(SUNDAY);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(SUNDAY);
    await routeWeek(page, o);
    if (o.routes) await o.routes(page);
    await seedMls(page);
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'setup');
    return { state, o };
}

async function refresh(page) {
    await card(page).locator('[data-action="refreshThisWeek"]').click();
    await expect(card(page).locator('[data-action="refreshThisWeek"]')).toBeEnabled();
}

test.describe('This week: every league\'s matchup', () => {
    test('mid-Sunday: the W-L, the splits, the swing with its live players, the decided line, Provisional', async ({ page }) => {
        const { state } = await setup(page);
        const head = card(page).locator('.mls-week-head');
        await expect(head.locator('.mls-week-title')).toHaveText('Week 2 Recap');
        await expect(head).toContainText('Record 1–1 · 1 still live');
        await expect(head.locator('.mls-week-status')).toHaveText('Provisional');

        // No league is marked paid yet: a hint in place of the split.
        await expect(card(page)).toContainText('Mark the leagues you pay for');
        await expect(card(page)).toContainText('Redraft 0–1 · Dynasty 1–0');

        // The swing: Fixture League, behind by 12, Jefferson still to play, Rival has nobody, and a win chance.
        const swing = card(page).locator('.mls-week-swing');
        await expect(swing).toHaveCount(1);
        await expect(swing).toContainText('Fixture League');
        await expect(swing.locator('.mls-week-margin')).toHaveText('−12.0');
        await expect(swing).toContainText('You 98.0 · Rival 110.0');
        await expect(swing.locator('.mls-week-swing-live').first()).toContainText('Justin Jefferson WR');
        await expect(swing.locator('.mls-week-swing-live').nth(1)).toContainText('Them: nobody left');
        await expect(swing.locator('.mls-week-chance')).toHaveText(/^\d+% to win$/, { timeout: 15000 });

        // The decided one on one line, and each league's line with both scores and the margin.
        await expect(card(page).locator('.mls-week-decided')).toHaveText('Effectively decided: 1 (1 W, 0 L)');
        const lines = card(page).locator('.mls-week-line');
        await expect(lines).toHaveCount(2);
        await expect(lines.nth(0)).toContainText('L');
        await expect(lines.nth(0).locator('.mls-week-line-mine')).toHaveText('98.0');
        await expect(lines.nth(0).locator('.mls-week-line-theirs')).toHaveText('110.0');
        await expect(lines.nth(1)).toContainText('Second Fixture League');
        await expect(lines.nth(1).locator('.mls-week-line-mine')).toHaveText('130.4');
        await expect(lines.nth(1).locator('.mls-week-line-theirs')).toHaveText('95.2');
        await expect(lines.nth(1).locator('.mls-week-line-margin')).toHaveText('+35.2');
        await expect(lines.nth(1)).toContainText('vs Rival');

        // Mark the dynasty league paid (Reorder, then $ Paid): the split and the $ badge appear.
        await page.click('#reorderLeagueCards');
        await page.locator(`[data-action="toggleLeaguePaid"][data-league-id="${FIXTURE_LEAGUE2_ID}"]`).click();
        await expect(page.locator(`[data-action="toggleLeaguePaid"][data-league-id="${FIXTURE_LEAGUE2_ID}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(card(page)).toContainText('Paid 1–0 · Free 0–1');
        await expect(lines.nth(1).locator('.mls-paid-badge')).toHaveCount(1);
        await expect(page.locator('#leagueCards .mls-lc-card').filter({ hasText: 'Second Fixture League' }).locator('.mls-paid-badge')).toHaveCount(1);

        // Saved on the league, and a sync of that league keeps it.
        const paidSaved = () => page.evaluate((id) => JSON.parse(localStorage.getItem('mls_leagues')).find(l => l.leagueId === id).paid, FIXTURE_LEAGUE2_ID);
        expect(await paidSaved()).toBe(true);
        await page.click('#syncAllBtn');
        await expect(page.locator('#syncAllBtn')).toBeEnabled({ timeout: 20000 });
        expect(await paidSaved()).toBe(true);

        // It folds to its header, and that's remembered.
        await card(page).locator('[data-action="toggleThisWeek"]').click();
        await expect(card(page).locator('.mls-week-body')).toHaveCount(0);
        await expect(card(page).locator('.mls-week-head')).toContainText('Record 1–1 · 1 still live');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(card(page).locator('.mls-week-head')).toContainText('Week 2 Recap');
        await expect(card(page).locator('.mls-week-body')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('once every game is final: Final, and the W-L with Jefferson\'s points', async ({ page }) => {
        const { state } = await setup(page);
        await expect(card(page).locator('.mls-week-status')).toHaveText('Provisional');
        // Sunday night's game ends; Refresh picks it up.
        await page.unroute(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/);
        await page.unroute(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`));
        await page.clock.setFixedTime(new Date('2026-09-21T04:00:00Z'));
        await routeWeek(page, { matchups: 'final', league2: 'ok', minFinal: true });
        await refresh(page);
        await expect(card(page).locator('.mls-week-status')).toHaveText('Final');
        await expect(card(page).locator('.mls-week-head')).toContainText('Record 2–0');
        await expect(card(page).locator('.mls-week-head')).not.toContainText('still live');
        await expect(card(page).locator('.mls-week-swing')).toHaveCount(0);
        await expect(card(page).locator('.mls-week-decided')).toHaveText('Done: 2 (2 W, 0 L)');
        await expect(card(page)).toContainText('Every game is final');
        await expectClean(page, state);
    });

    test('one league\'s matchups fail to load: the rest show, with a note', async ({ page }) => {
        const { state } = await setup(page, { league2: 'fail' });
        await expect(card(page).locator('.mls-week-line')).toHaveCount(1);
        await expect(card(page).locator('.mls-week-line')).toContainText('Fixture League');
        await expect(card(page).locator('.mls-week-failed')).toContainText("Couldn't load from Sleeper: Second Fixture League");
        await expect(card(page).locator('.mls-week-head')).toContainText('Record 0–1');
        await expectClean(page, state);
    });

    // Shaped like the owner's guillotine league (LOOG - Chop Shop) in Sleeper's API: settings.type 3, every roster its
    // own matchup_id, and a chopped team still listed with no players. And a league that also plays the median.
    test('a guillotine league gets its own line, not a W-L; a median league says where you stand', async ({ page }) => {
        const { state } = await setup(page, { routes: async (page) => {
            await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}$`), route => {
                const l = JSON.parse(fixture('league2.json'));
                return route.fulfill({ json: { ...l, name: 'Chop Shop', settings: { ...l.settings, type: 3 } } });
            });
            await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}$`), route => {
                const l = JSON.parse(fixture('league.json'));
                return route.fulfill({ json: { ...l, settings: { ...l.settings, league_average_match: 1 } } });
            });
        } });
        await page.unroute(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`));
        await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route => {
            const m = JSON.parse(fixture('league2-matchups.json')).map((e, i) => ({ ...e, matchup_id: i + 1 }));
            m.push({ roster_id: 3, matchup_id: 3, points: 0, starters: [], players: [], players_points: {} });
            return route.fulfill({ json: m });
        });
        await refresh(page);
        // Only Fixture League counts toward the W-L.
        await expect(card(page).locator('.mls-week-head')).toContainText('Record 0–1 · 1 still live');
        // Both are lines of the list; the guillotine one has no W/L and reads against the chop line.
        const lines = card(page).locator('.mls-week-line');
        await expect(lines).toHaveCount(2);
        await expect(lines.nth(0).locator('.mls-week-line-notes')).toHaveText('Median: 2nd of 2 (below)');
        const chop = lines.nth(1);
        await expect(chop).toHaveClass(/\bis-guillotine\b/);
        await expect(chop.locator('.mls-week-result')).toHaveCount(0);
        await expect(chop.locator('.mls-week-name')).toHaveText('Chop Shop');
        await expect(chop.locator('.mls-week-line-opp')).toHaveText('vs the chop line');
        await expect(chop.locator('.mls-week-line-mine')).toHaveText('130.4');
        await expect(chop.locator('.mls-week-line-theirs')).toHaveText('95.2');
        await expect(chop.locator('.mls-week-line-margin')).toHaveText('+35.2');
        await expect(chop.locator('.mls-week-line-notes')).toHaveText('Guillotine: 1st of 2 alive · 1 still to play');
        await expectClean(page, state);
    });

    test('at phone width: every league name whole, its scores and margin right-aligned, nothing past the edge', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        const { state } = await setup(page);
        const lines = card(page).locator('.mls-week-line');
        await expect(lines).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
            const box = await lines.nth(i).evaluate(li => {
                const r = li.getBoundingClientRect(), s = li.querySelector('.mls-week-line-margin').getBoundingClientRect();
                const n = li.querySelector('.mls-week-name');
                return { right: r.right, scoreRight: s.right, nameWhole: n.scrollWidth <= n.clientWidth + 1 };
            });
            expect(box.right).toBeLessThanOrEqual(375);
            expect(Math.abs(box.right - box.scoreRight)).toBeLessThan(2);
            expect(box.nameWhole).toBe(true);
        }
        await expectClean(page, state);
    });

    test('?week= in the address shows that week, with its own scoreboard, and says so', async ({ page }) => {
        const { state } = await setup(page);
        // Week 1's scoreboard: every game final. The fixture serves the same matchups for any week.
        let asked = null;
        await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => {
            asked = new URL(route.request().url()).searchParams.get('week');
            return route.fulfill({ json: scoreboard({ minFinal: true }) });
        });
        // Week 1's projections: the fixture's week 2 file will do.
        await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/1$/, route =>
            route.fulfill({ contentType: 'application/json', body: fixture('projections-2026-2.json') }));
        await page.goto('/lineup/?week=1');
        await page.waitForLoadState('networkidle');
        await expect(card(page).locator('.mls-week-title')).toHaveText('Week 1 Recap');
        await expect(card(page).locator('.mls-week-override')).toContainText('Showing week 1 because the address has ?week=1');
        await expect(card(page).locator('.mls-week-status')).toHaveText('Final');
        expect(asked).toBe('1');
        // The rest of the app stays on Sleeper's week.
        expect(await page.evaluate(async () => (await import('/js/mls/state.js')).State.currentNflWeek)).toBe(2);
        await expectClean(page, state);
    });

    test('the Roster tab shows your season record and points for / against ranks', async ({ page }) => {
        const { state } = await setup(page);
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE_ID);
        await showTab(page, 'roster');
        const rec = page.locator('#rosterRecord');
        await expect(rec).toBeVisible();
        await expect(rec.locator('.mls-roster-record-wl')).toHaveText('0–1');
        await expect(rec).toContainText('Record 0–1');
        // Above the header's line, with the league's name.
        expect(await rec.evaluate(el => !!el.closest('header.card-header'))).toBe(true);
        await expect(rec).toContainText('Points for 1st of 2');
        await expect(rec).toContainText('Points against 1st of 2');
        await expectClean(page, state);
    });
});
