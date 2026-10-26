// The Scoreboard's MVPs & LVPs (improvements S22, js/mls/week/playerRecap.js and week/thisWeek.js): a folded section
// under the tiles, built from S21's matchups (no second fetch), with the Boom / Bust lines editable in Advanced Settings.
//
// S21's fixtures (tests/fixtures/sleeper/make-fixtures.mjs): Sunday of week 2, both leagues with the same two teams, so
// each of your players is owned in 2 of 2 leagues. Every team in the scoreboard below is final but MIN (Justin Jefferson,
// Sunday night); LAR, ARI, NYJ and SF aren't in it, so their players' games count as not final. Your points:
// Fixture League: Allen 22, Henry 18, Chase 20, Jefferson 0, Bowers 10, Lamb 16 (bench all 0).
// Second Fixture League: Allen 28.4, Henry 22, Chase 25, Jefferson 0, Bowers 12, Lamb 25.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const SUNDAY = new Date('2026-09-20T22:00:00Z');
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const GAMES = [['BUF', 'BAL'], ['CIN', 'DAL'], ['LV', 'ATL'], ['DET', 'NYG'], ['HOU', 'PHI'], ['KC', 'DEN'], ['MIN', 'CHI']];
const scoreboard = ({ minFinal = false } = {}) => ({
    events: GAMES.map(([a, b]) => {
        const night = a === 'MIN';
        return {
            date: night ? '2026-09-21T00:20:00Z' : '2026-09-20T17:00:00Z', status: { type: { state: night && !minFinal ? 'pre' : 'post' } },
            competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }],
        };
    }),
});

// league2Points: your points to change in Second Fixture League ({ playerId: points }).
async function routeWeek(page, { minFinal = false, matchups = 'live', league2Points = null, league2 = 'ok' } = {}) {
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard({ minFinal }) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route =>
        route.fulfill({ contentType: 'application/json', body: fixture(matchups === 'final' ? 'league-matchups-final.json' : 'league-matchups-live.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route => {
        if (league2 === 'fail') return route.fulfill({ status: 500, body: '' });
        const data = JSON.parse(fixture('league2-matchups.json'));
        if (league2Points) Object.assign(data.find(e => e.roster_id === 1).players_points, league2Points);
        return route.fulfill({ json: data });
    });
}

async function setup(page, opts = {}) {
    await page.clock.setFixedTime(SUNDAY);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(SUNDAY);
    await routeWeek(page, opts);
    await seedMls(page);
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'scoreboard');
    await expect(page.locator('#thisWeekCard .mls-week-tile')).toHaveCount(opts.league2 === 'fail' ? 1 : 2);
    return state;
}

const section = (page) => page.locator('#thisWeekCard .mls-recap');
const rowsOf = (page, kind) => section(page).locator(`.mls-recap-table.is-${kind} .mls-recap-row:not(.mls-recap-headrow)`);
const cells = (row) => row.locator('.mls-recap-cell').evaluateAll(cs => cs.map(c => {
    const label = c.querySelector('.mls-recap-cell-label');
    return (label ? c.textContent.slice(label.textContent.length) : c.textContent).replace(/\s+/g, ' ').trim();
}));
async function openRecap(page) {
    const toggle = section(page).locator('.mls-recap-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(section(page).locator('.mls-recap-toggle')).toHaveAttribute('aria-expanded', 'true');
}

test.describe('Scoreboard: MVPs & LVPs', () => {
    test('folded until opened: the counts and Provisional on its line; both tables and the extra lines inside', async ({ page }) => {
        const state = await setup(page);
        const toggle = section(page).locator('.mls-recap-toggle');
        await expect(toggle).toContainText('MVPs & LVPs');
        await expect(toggle).toContainText('4 MVPs · 2 LVPs');
        await expect(toggle.locator('.mls-week-status')).toHaveText('Provisional');
        await expect(section(page).locator('#mlsRecapBody')).toBeHidden();

        await openRecap(page);
        await expect(section(page)).toContainText('Your 2 leagues on Sleeper, each in its own scoring');
        // MVPs: Chase boomed in both; Allen, Lamb and Henry in one each, ordered by their best score.
        const mvps = rowsOf(page, 'mvp');
        await expect(mvps.locator('.mls-recap-name')).toHaveText(["Ja'Marr Chase WR", 'Josh Allen QB', 'CeeDee Lamb WR', 'Derrick Henry RB']);
        expect(await cells(mvps.first())).toEqual(["Ja'Marr Chase WR", '100% (2)', '2 of 2', '20.0–25.0', '2 of 2']);
        expect(await cells(mvps.nth(2))).toEqual(['CeeDee Lamb WR', '100% (2)', '1 of 2', '16.0–25.0', '2 of 2']);
        // LVPs: games final, under the line; both on your benches at 0.0.
        const lvps = rowsOf(page, 'lvp');
        await expect(lvps.locator('.mls-recap-name')).toHaveText(['A.J. Brown WR', 'Amon-Ra St. Brown WR']);
        expect(await cells(lvps.first())).toEqual(['A.J. Brown WR', '100% (2)', '0 of 2', '0.0']);

        const extra = section(page).locator('.mls-recap-extra li');
        await expect(extra.filter({ hasText: 'Dead weight' })).toContainText('A.J. Brown WR (on 2 benches, 0.0), Amon-Ra St. Brown WR (on 2 benches, 0.0)');
        // Jefferson plays tonight; the four whose games aren't in the scoreboard aren't final either.
        await expect(extra.filter({ hasText: 'Still open' })).toContainText('Justin Jefferson WR (2), Garrett Wilson WR (2), George Kittle TE (2), Puka Nacua WR (2), Trey McBride TE (2)');
        await expect(extra.filter({ hasText: 'Started zeros' })).toHaveCount(0);
        await expect(extra.filter({ hasText: 'Worst benchings' })).toHaveCount(0);
        await expect(section(page)).toContainText('Provisional until the week\'s last game is final.');

        // Open survives a reload.
        await page.reload();
        await routeWeek(page);
        await showTab(page, 'scoreboard');
        await expect(section(page).locator('.mls-recap-toggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(rowsOf(page, 'mvp')).toHaveCount(4);
        await expectClean(page, state);
    });

    test('a started zero, an LVP who started, and a worst benching', async ({ page }) => {
        // Second Fixture League: Bowers (LV, final) on 0.0 in your lineup; Lamb 8 in FLEX while St. Brown (DET, final)
        // scored 24 on your bench.
        const state = await setup(page, { league2Points: { 11604: 0, 6786: 8, 7547: 24 } });
        await openRecap(page);
        await expect(rowsOf(page, 'mvp').locator('.mls-recap-name')).toHaveText(["Ja'Marr Chase WR", 'Josh Allen QB', 'Amon-Ra St. Brown WR', 'Derrick Henry RB']);
        // Bowers started and busted once (0.0), so he ranks above A.J. Brown's bench zeros.
        const lvps = rowsOf(page, 'lvp');
        await expect(lvps.locator('.mls-recap-name')).toHaveText(['Brock Bowers TE', 'A.J. Brown WR']);
        expect(await cells(lvps.first())).toEqual(['Brock Bowers TE', '100% (2)', '2 of 2', '0.0–10.0']);
        const extra = section(page).locator('.mls-recap-extra li');
        await expect(extra.filter({ hasText: 'Started zeros' })).toContainText('Brock Bowers TE (1 league)');
        await expect(extra.filter({ hasText: 'Started zeros' })).toContainText("the app can't check that");
        await expect(extra.filter({ hasText: 'Worst benchings' })).toContainText('Amon-Ra St. Brown WR 24.0 on your bench in Second Fixture League, over CeeDee Lamb 8.0 (−16.0)');
        await expectClean(page, state);
    });

    test('Final once every game is: the section says so and Jefferson leaves Still open', async ({ page }) => {
        const state = await setup(page);
        await page.unroute(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/);
        await page.unroute(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`));
        await page.unroute(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`));
        await page.clock.setFixedTime(new Date('2026-09-21T04:00:00Z'));
        await routeWeek(page, { matchups: 'final', minFinal: true });
        await page.locator('#thisWeekCard [data-action="refreshThisWeek"]').click();
        await expect(page.locator('#thisWeekCard .mls-week-head .mls-week-status')).toHaveText('Final');
        await expect(section(page).locator('.mls-recap-toggle .mls-week-status')).toHaveText('Final');
        await openRecap(page);
        // Jefferson: 20.0 in Fixture League (a Boom), 0.0 in the other, which still has him on 0.
        await expect(rowsOf(page, 'mvp').locator('.mls-recap-name')).toContainText(['Justin Jefferson WR']);
        await expect(section(page).locator('.mls-recap-extra li').filter({ hasText: 'Still open' })).not.toContainText('Jefferson');
        await expect(section(page)).not.toContainText('Provisional until');
        await expectClean(page, state);
    });

    test('a league that fails to load is left out of the ownership count', async ({ page }) => {
        const state = await setup(page, { league2: 'fail' });
        await openRecap(page);
        await expect(section(page)).toContainText('Your 1 league on Sleeper');
        expect(await cells(rowsOf(page, 'mvp').first())).toEqual(["Ja'Marr Chase WR", '100% (1)', '1 of 1', '20.0', '1 of 1']);
        await expectClean(page, state);
    });

    test('the lines in Advanced Settings: validation, Save, Show all, Reset', async ({ page }) => {
        // St. Brown scores 3 on your bench in Second Fixture League, so six players score.
        const state = await setup(page, { league2Points: { 7547: 3 } });
        await openRecap(page);
        await showTab(page, 'setup');
        await page.locator('summary', { hasText: 'MVP / LVP Lines' }).click();
        await expect(page.locator('#recapLineWRBoom')).toHaveValue('20');
        await expect(page.locator('#recapLineWRBust')).toHaveValue('7.5');

        // Boom must be above Bust: nothing is saved.
        await page.fill('#recapLineQBBoom', '10');
        await page.click('[data-action="saveRecapLines"]');
        await expect(page.locator('#recapLinesMsg')).toHaveText('QB Boom must be above its Bust line.');
        await expect(page.locator('#recapLineQBBoom')).toHaveAttribute('aria-invalid', 'true');
        expect(await page.evaluate(() => localStorage.getItem('mls_recap_lines'))).toBeNull();

        // Every line at 1 / 0.5: all six who scored are MVPs, so the table shows 5 and "Show all 6".
        for (const pos of ['QB', 'RB', 'WR', 'TE']) {
            await page.fill(`#recapLine${pos}Boom`, '1');
            await page.fill(`#recapLine${pos}Bust`, '0.5');
        }
        await page.click('[data-action="saveRecapLines"]');
        await expect(page.locator('#recapLinesMsg')).toContainText('Saved');
        expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mls_recap_lines'))).WR).toEqual({ boom: 1, bust: 0.5 });
        await showTab(page, 'scoreboard');
        await expect(section(page)).toContainText('WR 1 / 0.5');
        await expect(rowsOf(page, 'mvp')).toHaveCount(5);
        await section(page).locator('[data-action="showAllRecap"][data-list="mvp"]').click();
        await expect(rowsOf(page, 'mvp')).toHaveCount(6);
        await expect(section(page).locator('[data-action="showAllRecap"]')).toHaveCount(0);

        await showTab(page, 'setup');
        await page.click('[data-action="resetRecapLines"]');
        await expect(page.locator('#recapLineWRBoom')).toHaveValue('20');
        expect(await page.evaluate(() => localStorage.getItem('mls_recap_lines'))).toBeNull();
        await showTab(page, 'scoreboard');
        await expect(rowsOf(page, 'mvp')).toHaveCount(4);
        await expectClean(page, state);
    });

    test('before the first kickoff there is no MVPs & LVPs section', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scoreboard');
        await expect(page.locator('#thisWeekCard .mls-week-title')).toHaveText('Week 2 Matchups');
        await expect(section(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    for (const width of [375, 1280]) {
        test(`at ${width}px: names whole, nothing past the edge${width < 600 ? ', Started on a second line' : ''}`, async ({ page }) => {
            await page.setViewportSize({ width, height: 800 });
            const state = await setup(page);
            await openRecap(page);
            const rows = await section(page).locator('.mls-recap-row:not(.mls-recap-headrow)').evaluateAll(rs => rs.map(r => {
                const name = r.querySelector('.mls-recap-name'), started = r.querySelector('.mls-recap-started');
                const nb = name.getBoundingClientRect(), sb = started.getBoundingClientRect();
                // Every cell inside the section (S22: at first the Pts column ran past the card's edge on phones).
                const edge = r.closest('.mls-recap').getBoundingClientRect().right;
                const right = Math.max(...[...r.querySelectorAll('.mls-recap-cell')].map(c => c.getBoundingClientRect().right));
                const cut = [...r.querySelectorAll('.mls-recap-cell')].some(c => c.scrollWidth > c.clientWidth + 1);
                return { right, edge, cut, nameWhole: name.scrollWidth <= name.clientWidth + 1, nameTop: nb.top, startedTop: sb.top, mvp: !!r.closest('.is-mvp') };
            }));
            expect(rows.length).toBe(6);
            for (const r of rows) {
                expect(r.right).toBeLessThanOrEqual(r.edge + 0.5);
                expect(r.cut).toBe(false);
                expect(r.nameWhole).toBe(true);
                if (r.mvp && width < 600) expect(r.startedTop).toBeGreaterThan(r.nameTop + 5);
                else expect(Math.abs(r.startedTop - r.nameTop)).toBeLessThan(6);
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            await expectClean(page, state);
        });
    }
});
