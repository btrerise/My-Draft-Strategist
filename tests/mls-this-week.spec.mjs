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
const tiles = (page) => card(page).locator('.mls-week-tile');
const pts = (tile) => tile.locator('.mls-week-tile-pts');

// matchups: what Fixture League's matchups answer ('live' | 'final'); league2: 'ok' | 'fail'; minFinal: the MIN game.
async function routeWeek(page, opts) {
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route =>
        route.fulfill({ json: scoreboard({ minFinal: opts.minFinal }) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route =>
        route.fulfill({ contentType: 'application/json', body: fixture(opts.matchups === 'final' ? 'league-matchups-final.json' : 'league-matchups-live.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route =>
        opts.league2 === 'fail' ? route.fulfill({ status: 500, body: '' }) : route.fulfill({ contentType: 'application/json', body: fixture('league2-matchups.json') }));
    // Jefferson's projection. The fixture's invented history gives him a narrow spread (about 9.4 a game, give or take
    // 1.3), so at its own projection (8.3) catching up 12 is a 0% chance. 12.5 makes it a real contest.
    if (opts.jefferson != null) {
        await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/2$/, route => {
            const proj = JSON.parse(fixture('projections-2026-2.json'));
            proj['6794'] = { ...proj['6794'], pts_ppr: opts.jefferson };
            return route.fulfill({ json: proj });
        });
    }
}

async function setup(page, opts = {}) {
    const o = { matchups: 'live', league2: 'ok', minFinal: false, jefferson: 12.5, ...opts };
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
    await showTab(page, 'scoreboard');
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
        await expect(card(page).locator('.mls-week-split')).toHaveText(['Redraft 0–1', 'Dynasty 1–0']);

        // The swing: Fixture League, behind by 12, Jefferson still to play, Rival has nobody, and a win chance.
        const swing = card(page).locator('.mls-week-swing');
        await expect(swing).toHaveCount(1);
        await expect(swing).toContainText('Fixture League');
        await expect(swing.locator('.mls-week-margin')).toHaveText('−12.0');
        await expect(swing).toContainText('You 98.0 · Rival 110.0');
        await expect(swing.locator('.mls-week-swing-live').first()).toContainText('Justin Jefferson WR');
        await expect(swing.locator('.mls-week-swing-live').nth(1)).toContainText('Them: nobody left');
        await expect(swing.locator('.mls-week-chance')).toHaveText(/^\d+% to win$/, { timeout: 15000 });
        const pct = Number((await swing.locator('.mls-week-chance').textContent()).match(/\d+/)[0]);
        expect(pct).toBeGreaterThan(15);
        expect(pct).toBeLessThan(95);

        // The decided one on one line, and every league as a tile, the one still in play first: your score, theirs,
        // the margin.
        await expect(card(page).locator('.mls-week-decided')).toHaveText('Effectively decided: 1 (1 W, 0 L)');
        await expect(tiles(page)).toHaveCount(2);
        const swingTile = tiles(page).nth(0), wonTile = tiles(page).nth(1);
        await expect(swingTile).toHaveClass(/\bis-loss\b/);
        await expect(swingTile.locator('.mls-week-name')).toHaveText('Fixture League');
        await expect(pts(swingTile)).toHaveText(['98.0', '110.0']);
        await expect(swingTile.locator('.mls-week-tile-margin')).toHaveText('−12.0');
        await expect(swingTile.locator('.mls-week-tile-foot .mls-week-result')).toHaveText('L');
        await expect(swingTile.locator('.mls-week-tile-go')).toHaveCount(1);
        // A matchup still in play carries its win chance on its tile too.
        await expect(swingTile.locator('.mls-week-tile-chance')).toHaveText(/^\d+% to win$/);
        await expect(wonTile.locator('.mls-week-tile-chance')).toHaveCount(0);
        await expect(wonTile).toHaveClass(/\bis-win\b/);
        await expect(wonTile.locator('.mls-week-name')).toHaveText('Second Fixture League');
        await expect(pts(wonTile)).toHaveText(['130.4', '95.2']);
        await expect(wonTile.locator('.mls-week-tile-margin')).toHaveText('+35.2');
        await expect(wonTile).toContainText('vs Rival');

        // The Dashboard's line says the same and opens the Scoreboard.
        await showTab(page, 'setup');
        const line = page.locator('#weekSummaryLine');
        await expect(line).toContainText('Week 2 Recap');
        await expect(line).toContainText('Record 1–1 · 1 still live');
        await line.click();
        await expect(page.locator('#scoreboardTab')).toHaveClass(/\bactive\b/);

        // Mark the dynasty league paid (Dashboard, Edit, then $ Paid): the split and the $ badge appear.
        await showTab(page, 'setup');
        await page.click('#reorderLeagueCards');
        await page.locator(`[data-action="toggleLeaguePaid"][data-league-id="${FIXTURE_LEAGUE2_ID}"]`).click();
        await expect(page.locator(`[data-action="toggleLeaguePaid"][data-league-id="${FIXTURE_LEAGUE2_ID}"]`)).toHaveAttribute('aria-pressed', 'true');
        await showTab(page, 'scoreboard');
        await expect(card(page).locator('.mls-week-split')).toHaveText(['Paid 1–0', 'Free 0–1', 'Redraft 0–1', 'Dynasty 1–0']);
        // Two groups, each adding up to every league: stakes and format.
        await expect(card(page).locator('.mls-week-split-group').first()).toHaveAttribute('aria-label', 'By stakes');
        await expect(card(page).locator('.mls-week-split-group')).toHaveCount(2);
        await expect(tiles(page).nth(1).locator('.mls-paid-badge')).toHaveCount(1);
        await expect(page.locator('#leagueCards .mls-lc-card').filter({ hasText: 'Second Fixture League' }).locator('.mls-paid-badge')).toHaveCount(1);

        // Saved on the league, and a sync of that league keeps it.
        const paidSaved = () => page.evaluate((id) => JSON.parse(localStorage.getItem('mls_leagues')).find(l => l.leagueId === id).paid, FIXTURE_LEAGUE2_ID);
        expect(await paidSaved()).toBe(true);
        await showTab(page, 'setup');
        await page.click('#syncAllBtn');
        await expect(page.locator('#syncAllBtn')).toBeEnabled({ timeout: 20000 });
        expect(await paidSaved()).toBe(true);

        // A tile opens that league's Lineup tab, whose strip has the matchup.
        await showTab(page, 'scoreboard');
        await tiles(page).nth(0).locator('button').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        const strip = page.locator('#lineupMatchupStrip');
        await expect(strip).toBeVisible();
        await expect(strip).toContainText('vs Rival');
        await expect(strip.locator('.mls-strip-score')).toHaveText('98.0–110.0');
        await expect(strip).toContainText('% to win');
        await expect(strip).toContainText('Justin Jefferson WR');
        await expect(strip.locator('.mls-week-result')).toHaveText('L');
        // Another league: its own matchup.
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE2_ID);
        await expect(strip.locator('.mls-strip-score')).toHaveText('130.4–95.2');
        await expect(strip).toContainText('Effectively decided');
        await expectClean(page, state);
    });

    test('a swing the Simulator settles at 0% counts as effectively decided', async ({ page }) => {
        // The fixture's own projection (8.3, with its narrow spread): Jefferson won't make up 12.
        const { state } = await setup(page, { jefferson: null });
        await expect(card(page).locator('.mls-week-swing')).toHaveCount(0, { timeout: 15000 });
        await expect(card(page).locator('.mls-week-head')).toContainText('Record 1–1');
        await expect(card(page).locator('.mls-week-head')).not.toContainText('still live');
        // Nothing left in play, so no "Effectively decided" line: it would only repeat the record (round 12).
        await expect(card(page).locator('.mls-week-decided')).toHaveCount(0);
        await expectClean(page, state);
    });

    // Round 12: Jefferson's game under way (4th quarter, 5:00 left, 0 points so far). The Simulator counts the rest of
    // his game, not 0 as final, and while anyone is mid-game a matchup isn't settled by the Simulator, however low.
    test('mid-game: no settling by the Simulator, and the chance reads "<1%" rather than 0%', async ({ page }) => {
        const { state } = await setup(page, { jefferson: null, routes: async (page) => {
            await page.unroute(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/);
            await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => {
                const sb = scoreboard();
                sb.events.forEach(e => { if (e.competitions[0].competitors[0].team.abbreviation === 'MIN') e.status = { type: { state: 'in' }, period: 4, clock: 300 }; });
                return route.fulfill({ json: sb });
            });
        } });
        await page.clock.setFixedTime(new Date('2026-09-21T03:00:00Z'));
        await refresh(page);
        const swing = card(page).locator('.mls-week-swing');
        await expect(swing).toHaveCount(1);
        await expect(swing.locator('.mls-week-chance')).toHaveText('<1% to win', { timeout: 15000 });
        await expect(card(page).locator('.mls-week-head')).toContainText('1 still live');
        await expectClean(page, state);
    });

    test('the paid hint goes away with its ✕, and stays away', async ({ page }) => {
        const { state } = await setup(page);
        const hint = card(page).locator('.mls-week-hint');
        await expect(hint).toContainText('Mark the leagues you pay for');
        await hint.locator('[data-action="dismissPaidHint"]').click();
        await expect(hint).toHaveCount(0);
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(card(page).locator('.mls-week-splits-row')).toContainText('Redraft');
        await expect(card(page).locator('.mls-week-hint')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('before the first kickoff: Week 2 Matchups, the opponents, no scores', async ({ page }) => {
        // The default fixture: Tuesday of week 2, nobody has scored.
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'setup');
        await expect(page.locator('#weekSummaryLine')).toContainText('Week 2 Matchups');
        await showTab(page, 'scoreboard');
        await expect(card(page).locator('.mls-week-title')).toHaveText('Week 2 Matchups');
        await expect(card(page).locator('.mls-week-status')).toHaveCount(0);
        await expect(tiles(page)).toHaveCount(1);
        await expect(tiles(page).first()).toContainText('vs Rival');
        await expect(tiles(page).first()).toHaveClass(/\bis-pre\b/);
        await expect(pts(tiles(page).first())).toHaveText(['', '']);
        await showTab(page, 'lineup');
        await expect(page.locator('#lineupMatchupStrip')).toContainText('vs Rival');
        await expect(page.locator('#lineupMatchupStrip')).toContainText('starts');
        await expectClean(page, state);
    });

    // Thursday night: one game on, so neither lineup has 4 players who've played (owner: a W or L before then is a guess).
    test('too early to call: no W-L until 4 players a side have played, scores still shown', async ({ page }) => {
        const { state } = await setup(page, { routes: async (page) => {
            await page.unroute(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/);
            await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => {
                const sb = scoreboard();
                sb.events.forEach(e => { e.status.type.state = e.competitions[0].competitors[0].team.abbreviation === 'BUF' ? 'in' : 'pre'; });
                return route.fulfill({ json: sb });
            });
        } });
        await refresh(page);
        const head = card(page).locator('.mls-week-head');
        // Fixture League (98 to 110, Jefferson to play) is too early; Second Fixture League is decided (Rival has
        // nobody left), and a known result counts however early.
        await expect(head).toContainText('Record 1–0 · 1 too early to call');
        await expect(card(page).locator('.mls-week-split')).toHaveText(['Redraft 0–0', 'Dynasty 1–0']);
        await expect(card(page).locator('.mls-week-swing')).toHaveCount(0);
        await expect(card(page).locator('.mls-week-decided').last()).toContainText('Too early to call: 1');
        // Too early: last, scores but no W/L or margin.
        const early = tiles(page).nth(1);
        await expect(early.locator('.mls-week-name')).toHaveText('Fixture League');
        await expect(early.locator('.mls-week-result')).toHaveCount(0);
        await expect(early.locator('.mls-week-tile-margin')).toHaveCount(0);
        await expect(early.locator('.mls-week-tile-foot')).toHaveText('Too early to call');
        await expect(pts(early)).toHaveText(['98.0', '110.0']);
        await expect(tiles(page).nth(0).locator('.mls-week-result')).toHaveText('W');
        await early.locator('button').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#lineupMatchupStrip .mls-strip-meta')).toHaveText('Too early to call');
        await expect(page.locator('#lineupMatchupStrip .mls-week-result')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('once every game is final: Final, and the W-L with Jefferson\'s points', async ({ page }) => {
        const { state } = await setup(page);
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Provisional');
        // Sunday night's game ends; Refresh picks it up.
        await page.unroute(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/);
        await page.unroute(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`));
        await page.clock.setFixedTime(new Date('2026-09-21T04:00:00Z'));
        await routeWeek(page, { matchups: 'final', league2: 'ok', minFinal: true });
        await refresh(page);
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        await expect(card(page).locator('.mls-week-head')).toContainText('Record 2–0');
        await expect(card(page).locator('.mls-week-head')).not.toContainText('still live');
        await expect(card(page).locator('.mls-week-swing')).toHaveCount(0);
        // No "Done: 2" line (it only repeated the record), and the tiles go back to league order, as on the Dashboard.
        await expect(card(page).locator('.mls-week-decided')).toHaveCount(0);
        await expect(card(page).locator('.mls-week-sub').last()).toHaveText('Every league');
        await expect(tiles(page).locator('.mls-week-name')).toHaveText(['Fixture League', 'Second Fixture League']);
        await expect(card(page)).toContainText('Every game is final');
        await expectClean(page, state);
    });

    test('one league\'s matchups fail to load: the rest show, with a note', async ({ page }) => {
        const { state } = await setup(page, { league2: 'fail' });
        await expect(tiles(page)).toHaveCount(1);
        await expect(tiles(page)).toContainText('Fixture League');
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
        // The median stands apart, with how many leagues play it.
        await expect(card(page).locator('.mls-week-split-group').last()).toHaveText('Median 0–1 1 of 1 league');
        // Both are tiles; the guillotine one has no W/L and reads against the chop line.
        await expect(tiles(page)).toHaveCount(2);
        await expect(tiles(page).nth(0).locator('.mls-week-tile-line')).toHaveText([/^L −12\.0 · \d+% to win$/, 'Median: L (2nd of 2)']);
        const chop = tiles(page).nth(1);
        await expect(chop).toHaveClass(/\bis-guillotine\b/);
        await expect(chop.locator('.mls-week-result')).toHaveCount(0);
        await expect(chop.locator('.mls-week-name')).toHaveText('Chop Shop');
        await expect(chop.locator('.mls-week-tile-who')).toHaveText('Chop line');
        await expect(pts(chop)).toHaveText(['130.4', '95.2']);
        await expect(chop.locator('.mls-week-tile-line')).toHaveText(['+35.2 · 1 still to play', 'Guillotine: 1st of 2 alive']);
        await expectClean(page, state);
    });

    for (const width of [375, 1280]) {
        test(`at ${width}px: ${width < 600 ? 'one league per row' : 'tiles side by side'}, every league name whole, nothing past the edge`, async ({ page }) => {
            await page.setViewportSize({ width, height: 800 });
            const { state } = await setup(page);
            await expect(tiles(page)).toHaveCount(2);
            const boxes = await tiles(page).evaluateAll(ts => ts.map(t => {
                const r = t.getBoundingClientRect(), n = t.querySelector('.mls-week-name');
                return { top: r.top, right: r.right, nameWhole: n.scrollWidth <= n.clientWidth + 1 };
            }));
            // Side by side on wide screens; one per row on phones (owner, round 7: two across was crowded).
            if (width < 600) expect(boxes[1].top).toBeGreaterThan(boxes[0].top + 20);
            else expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThan(1);
            for (const b of boxes) {
                expect(b.right).toBeLessThanOrEqual(width);
                expect(b.nameWhole).toBe(true);
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            await expectClean(page, state);
        });
    }

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
        await showTab(page, 'scoreboard');
        await expect(card(page).locator('.mls-week-title')).toHaveText('Week 1 Recap');
        await expect(card(page).locator('.mls-week-override')).toContainText('Showing week 1 because the address has ?week=1');
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
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
