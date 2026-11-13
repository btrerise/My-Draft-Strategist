// Sleeper's auto-subs on the Scoreboard (improvements F18). When a starter is inactive and his manager named a bench sub
// (a league setting, `settings.max_subs`), Sleeper moves the sub into the matchup's `starters` and counts him in
// `points`; nothing in the public API names the swap (docs/improvements/LOG.md, F18). Every Scoreboard view reads a
// team's starters through one rule (starterIdsOf, js/mls/week/playerRecap.js), so the sub counts as the one who played.
//
// Fixtures (tests/fixtures/sleeper/make-fixtures.mjs): Sunday of week 2, as mls-mvp-lvp.spec.mjs, every game final but MIN.
// CeeDee Lamb (your FLEX, DAL) is inactive. Fixture League has auto-subs on, and Sleeper has put Amon-Ra St. Brown (DET,
// 24.0) in Lamb's slot: you 106.0, Rival 110.0. Second Fixture League has none, so Lamb started on 0.0 there and St.
// Brown's 24.0 sat on the bench: you 105.4, Rival 95.2. Half PPR (the MVPs' verdict): St. Brown 21.0 (a boom), Lamb 0.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';
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
const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body });

// autoSub false: Fixture League's ordinary matchups (Lamb started, 16.0), the same lineup with no swap.
async function routeWeek(page, { autoSub = true } = {}) {
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard() }));
    if (autoSub) await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}$`), json(fixture('league-autosub.json')));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), json(fixture(autoSub ? 'league-matchups-autosub.json' : 'league-matchups-live.json')));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), json(fixture(autoSub ? 'league2-matchups-inactive.json' : 'league2-matchups.json')));
    if (autoSub) {
        await page.route(/sleeper\.app\/v1\/stats\/nfl\/regular\/2026\/2$/, route => {
            const data = JSON.parse(fixture('stats-2026-2.json'));
            data['6786'] = { ...data['6786'], pts_half_ppr: 0, pts_ppr: 0, pts_std: 0 };
            data['7547'] = { ...data['7547'], pts_half_ppr: 21, pts_ppr: 22, pts_std: 20 };
            return route.fulfill({ json: data });
        });
    }
}

async function setup(page, opts) {
    await page.clock.setFixedTime(SUNDAY);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(SUNDAY);
    await routeWeek(page, opts);
    // Only the Sunday night game is left, so this is the week's Final Window (S36), which folds the Player Scoreboard
    // while it's open. These tests read the Player Scoreboard, so the window starts folded (as mls-mvp-lvp.spec.mjs).
    await page.evaluate(() => localStorage.setItem('mls_scoreboard_folds', JSON.stringify({ final: false })));
    await seedMls(page);
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'scoreboard');
    await expect(tiles(page)).toHaveCount(2);
    return state;
}

const card = (page) => page.locator('#thisWeekCard');
const tiles = (page) => card(page).locator('.mls-week-tile');
const tile = (page, name) => tiles(page).filter({ has: page.locator('.mls-week-name', { hasText: new RegExp(`^${name}$`) }) });
const pts = (t) => t.locator('.mls-week-tile-pts');
const recap = (page) => card(page).locator('.mls-recap');
const recapRows = (page, kind) => recap(page).locator(`.mls-recap-table.is-${kind} .mls-recap-row:not(.mls-recap-headrow)`);
const cells = (row) => row.locator('.mls-recap-cell').evaluateAll(cs => cs.map(c => {
    const label = c.querySelector('.mls-recap-cell-label');
    return (label ? c.textContent.slice(label.textContent.length) : c.textContent).replace(/\s+/g, ' ').trim();
}));
const board = (page) => card(page).locator('.mls-week-fold[data-fold="root"]');

// Your starters in the finished games' window, as "Name in N".
async function finishedYours(page) {
    const final = board(page).locator('.mls-root-window').nth(1);
    await expect(final.locator('.mls-root-window-title')).toHaveText('6 games final');
    await final.locator('.mls-root-window-head').click();
    const yours = final.locator('.mls-root-side').first();
    const all = yours.locator('[data-action="showAllRoot"]');
    if (await all.count()) await all.click();
    return yours.locator('.mls-root-name').allTextContents().then(ts => ts.map(t => t.replace(/\s+/g, ' ').trim()));
}

test.describe('Scoreboard: Sleeper\'s auto-subs', () => {
    test('the sub Sleeper moved in counts everywhere: the tile is Sleeper\'s score, Root for, MVPs, LVPs and Started', async ({ page }) => {
        const state = await setup(page);
        // The tiles are Sleeper's `points`: St. Brown's 24.0 counts where he was subbed in, Lamb's 0.0 where he wasn't.
        await expect(pts(tile(page, 'Fixture League'))).toHaveText(['106.0', '110.0']);
        await expect(pts(tile(page, 'Second Fixture League'))).toHaveText(['105.4', '95.2']);

        // Your starters in the finished games: St. Brown in the one league that subbed him in, Lamb in the other only
        // (a player in one league has no "in N").
        const yours = await finishedYours(page);
        expect(yours).toContain('Amon-Ra St. Brown');
        expect(yours).toContain('CeeDee Lamb');
        expect(yours).toContain('Josh Allen in 2');

        // MVPs: St. Brown boomed (21.0 in half PPR) and started in 1 of the 2 leagues that own him.
        await recap(page).locator('.mls-week-fold-toggle').click();
        const mvps = recapRows(page, 'mvp');
        await expect(mvps.locator('.mls-recap-name')).toHaveText(['Josh Allen QB', "Ja'Marr Chase WR", 'Amon-Ra St. Brown WR']);
        expect(await cells(mvps.nth(2))).toEqual(['Amon-Ra St. Brown WR', '100% (2)', '21.0', '24.0', '50% (1)']);
        // Benched only in the league without auto-subs, over Lamb's 0.0 there; Fixture League isn't named.
        const benched = recap(page).locator('.mls-recap-extra > li').filter({ hasText: 'Benched booms' }).locator('li');
        await expect(benched).toHaveText(['Amon-Ra St. Brown WR 24.0 over CeeDee Lamb WR in FLEX 0.0 (−24.0) · Second Fixture League']);
        // LVPs: Lamb (0 points) started only in the league without auto-subs.
        const lvps = recapRows(page, 'lvp');
        await expect(lvps.locator('.mls-recap-name')).toHaveText(['CeeDee Lamb WR']);
        expect(await cells(lvps.first())).toEqual(['CeeDee Lamb WR', '100% (2)', '0.0', '0.0', '50% (1)']);
        await expect(recap(page).locator('.mls-recap-extra > li').filter({ hasText: 'Started zeros' })).toContainText('CeeDee Lamb WR · 1 league');
        await expectClean(page, state);
    });

    test('no swap: the same lineups read as before (Lamb started in both, St. Brown on both benches)', async ({ page }) => {
        const state = await setup(page, { autoSub: false });
        await expect(pts(tile(page, 'Fixture League'))).toHaveText(['98.0', '110.0']);
        await expect(pts(tile(page, 'Second Fixture League'))).toHaveText(['130.4', '95.2']);
        const yours = await finishedYours(page);
        expect(yours).toContain('CeeDee Lamb in 2');
        expect(yours.some(n => n.startsWith('Amon-Ra St. Brown'))).toBe(false);
        await expectClean(page, state);
    });
});
