// Optimize All names the lineups that need you (improvements S11). After Optimize All Lineups or Sync All
// Leagues, a box under the two buttons lists each league whose lineup has a starter in your Sleeper IR slot,
// an injured starter (Doubtful, Out, IR...), a starter on bye or an empty starting slot, with what to do and an
// Open lineup button. The rule is getLineupIssues (js/mls/lineup/issues.js), the one the Lineup tab's red and
// purple warnings use. A clean run shows no box; a failed run shows its error toast and no box.
//
// Two leagues from the one Sleeper fixture (the stub answers any league id; the app keys leagues by the id
// typed): "Fixture League", where Ja'Marr Chase (healthy, starting) is in your IR slot, and a second league,
// renamed here, where your only QB is Lamar Jackson, Doubtful. Both rosters get Bijan Robinson from the other
// team, because the fixture roster has one RB for two RB slots (an empty slot the box would list too).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';
const SECOND_LEAGUE_NAME = 'The Long-Named Dynasty League of Champions';
const CHASE = '4866', ALLEN = '4984', LAMAR = '4881', BIJAN = '9509';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const move = (from, to, id) => { from.players = from.players.filter(p => p !== id); to.players.push(id); };

const box = (page) => page.locator('#lineupNeedsBox');
const line = (page, league) => box(page).locator('.mls-needs-line').filter({ has: page.locator('.mls-needs-league', { hasText: league }) });
const lineSummaries = (page) => box(page).locator('.mls-needs-line').evaluateAll(ls => ls.map(l =>
    `${l.querySelector('.mls-needs-league').textContent.trim()}: ${l.querySelector('.mls-needs-items').textContent.replace(/ /g, ' ').trim()}`));

// opts.chaseInIrSlot / opts.lamarDoubtful: the two issues. With both off, every lineup is clean.
async function routeLeagues(page, { chaseInIrSlot = true, lamarDoubtful = true } = {}) {
    await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
        const players = fixture('players-nfl.json');
        if (lamarDoubtful) players[LAMAR].injury_status = 'Doubtful';
        return route.fulfill({ json: players });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        move(rosters[1], rosters[0], BIJAN);
        if (chaseInIrSlot) rosters[0].reserve = [CHASE];
        return route.fulfill({ json: rosters });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        move(rosters[1], rosters[0], BIJAN);
        move(rosters[0], rosters[1], ALLEN);
        move(rosters[1], rosters[0], LAMAR);
        return route.fulfill({ json: rosters });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}$`), route =>
        route.fulfill({ json: { ...fixture('league.json'), league_id: SECOND_LEAGUE_ID, name: SECOND_LEAGUE_NAME } }));
}

// Fixture League with rankings, then the second league (no rankings: the optimizer still fills every slot).
async function seedTwoLeagues(page) {
    await seedMls(page);
    await loadMlsRankings(page);
    await page.fill('#sleeperLeagueId', SECOND_LEAGUE_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'setup');
}

// On the Lineup tab: swaps Chase (starting) with a bench player, or back with opts.back.
async function swapChase(page, other, { back = false } = {}) {
    const starter = (name) => page.locator('#optimalLineupContainer .lineup-slot').filter({ hasText: name });
    const bench = (name) => page.locator('#benchContainer .lineup-slot').filter({ hasText: name });
    const [out, inn] = back ? [other, "Ja'Marr Chase"] : ["Ja'Marr Chase", other];
    await bench(inn).locator('[data-action="initiateSwap"]').click();
    await starter(out).locator('[data-action="initiateSwap"]').click();
    await expect(starter(inn)).toHaveCount(1);
    await expect(bench(out)).toHaveCount(1);
}

async function optimizeAll(page, count = 2) {
    await page.click('#optimizeAllBtn');
    await expect(page.locator('.toast-message').filter({ hasText: `Successfully optimized ${count} lineups!` })).toBeVisible();
    await expect(page.locator('#optimizeAllBtn')).toBeEnabled();
}

test.describe('Lineups that need you, after Optimize All and Sync All', () => {
    test('Optimize All lists both leagues with what to do, and each opens its Lineup tab', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await expect(box(page)).toBeHidden();
        // The Command Center's (i) says what the box is.
        await expect(page.locator('#dashboardCommandCenter .card-header .tooltip-text')).toContainText('is listed under these buttons with a button to open it. A league drops off once you\'ve fixed it.');

        await optimizeAll(page);
        await expect(box(page)).toBeVisible();
        await expect(box(page).locator('.mls-needs-title')).toHaveText('2 lineups need you before kickoff');
        expect(await lineSummaries(page)).toEqual([
            "Fixture League: Activate Ja'Marr Chase from IR",
            `${SECOND_LEAGUE_NAME}: Lamar Jackson is Doubtful`,
        ]);
        // Names don't break across lines on a phone.
        await expect(line(page, 'Fixture League').locator('.mls-needs-item')).toHaveText("Activate Ja'Marr Chase from IR");

        // The second league: its Lineup tab, with the red warning naming the same player.
        await line(page, SECOND_LEAGUE_NAME).getByRole('button', { name: `Open ${SECOND_LEAGUE_NAME}'s lineup` }).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(SECOND_LEAGUE_ID);
        await expect(page.locator('#lineupTab .lineup-injury-warning:not(.lineup-ir-warning)')).toContainText('Lamar Jackson is D and currently in your starting lineup');
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(0);

        // The box stays until the next run: back on the Dashboard, the Fixture League's purple line.
        await showTab(page, 'setup');
        await expect(box(page).locator('.mls-needs-line')).toHaveCount(2);
        await line(page, 'Fixture League').getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveText("Ja'Marr Chase is in your IR slot on Sleeper. Move him to your active roster there before kickoff to start him.");
        await expect(page.locator('#lineupTab .lineup-injury-warning:not(.lineup-ir-warning)')).toHaveCount(0);

        // The close button hides it.
        await showTab(page, 'setup');
        await box(page).getByRole('button', { name: 'Close this list' }).click();
        await expect(box(page)).toBeHidden();
        await expectClean(page, state);
    });

    test('Sync All shows the same list after it syncs', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);

        await page.click('#syncAllBtn');
        await expect(page.locator('.toast-message').filter({ hasText: 'Successfully synced 2 leagues!' })).toBeVisible();
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        expect(await lineSummaries(page)).toEqual([
            "Fixture League: Activate Ja'Marr Chase from IR",
            `${SECOND_LEAGUE_NAME}: Lamar Jackson is Doubtful`,
        ]);
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('a league fixed since the run drops off, and the count follows', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await optimizeAll(page);
        await expect(box(page).locator('.mls-needs-line')).toHaveCount(2);

        // Fix the Fixture League: Garrett Wilson (bench) starts in Chase's place.
        await line(page, 'Fixture League').getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await swapChase(page, 'Garrett Wilson');
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(0);
        await showTab(page, 'setup');
        expect(await lineSummaries(page)).toEqual([`${SECOND_LEAGUE_NAME}: Lamar Jackson is Doubtful`]);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup needs you before kickoff');
        await expectClean(page, state);
    });

    test('the box closes once nothing is left, and stays closed until the next run', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { lamarDoubtful: false });
        await seedTwoLeagues(page);
        await optimizeAll(page);
        expect(await lineSummaries(page)).toEqual(["Fixture League: Activate Ja'Marr Chase from IR"]);

        await line(page, 'Fixture League').getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await swapChase(page, 'Garrett Wilson');
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();

        // Chase back in by hand: the box doesn't reopen on its own...
        await showTab(page, 'lineup');
        await swapChase(page, 'Garrett Wilson', { back: true });
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(1);
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();
        // ...the next run does (the swap locked Chase in, so the optimizer keeps him).
        await optimizeAll(page);
        expect(await lineSummaries(page)).toEqual(["Fixture League: Activate Ja'Marr Chase from IR"]);
        await expectClean(page, state);
    });

    test('a clean run shows no list and the usual message', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false });
        await seedTwoLeagues(page);

        await optimizeAll(page);
        await expect(box(page)).toBeHidden();
        await expect(box(page)).toBeEmpty();
        await expectClean(page, state);
    });

    test('a failed run keeps its error toast and shows no list', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await optimizeAll(page);
        await expect(box(page)).toBeVisible();

        // The lineups' save fails (a full browser storage): the run's error toast, and the last run's list is gone.
        await page.evaluate(() => {
            const setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (k === 'mls_manual_starters') throw new DOMException('full', 'QuotaExceededError');
                return setItem.call(this, k, v);
            };
        });
        await page.click('#optimizeAllBtn');
        await expect(page.locator('.toast-message').filter({ hasText: "Lineups were optimized, but saving them or restoring your league didn't finish." })).toBeVisible();
        await expect(page.locator('#optimizeAllBtn')).toBeEnabled();
        await expect(box(page)).toBeHidden();
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Optimize All') && !e.includes('QuotaExceededError') && !e.includes('full')));
        await expectClean(page, state);
    });

    test('at 375px wide each league is one line, names whole, nothing past the edge', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await optimizeAll(page);
        await expect(box(page).locator('.mls-needs-line')).toHaveCount(2);

        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        const boxRect = await box(page).boundingBox();
        for (const league of ['Fixture League', SECOND_LEAGUE_NAME]) {
            const l = line(page, league);
            // The league's name in full (no ellipsis), and its button inside the box, on the same line.
            const name = l.locator('.mls-needs-league');
            await expect(name).toHaveText(league);
            expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
            const btn = await l.getByRole('button', { name: `Open ${league}'s lineup` }).boundingBox();
            const main = await l.locator('.mls-needs-main').boundingBox();
            expect(btn.x + btn.width).toBeLessThanOrEqual(boxRect.x + boxRect.width);
            expect(btn.y).toBeLessThan(main.y + main.height);
        }
        await expectClean(page, state);
    });
});
