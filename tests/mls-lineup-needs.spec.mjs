// Lineups that need you (improvements S11). A box under the Dashboard's Sync All / Optimize All buttons lists
// each league whose lineup has a starter who's injured, in your Sleeper IR slot or on bye, or an empty starting
// slot: what to do, when the first of those games kicks off (soonest league first), and the buttons that fix it
// (Open lineup for a swap or an activation, Find <pos> for a pickup on Top Available). A drop-down below lists
// the leagues whose lineup differs from Sleeper. It's always on, drawn from the lineups as they are now; ✕ hides
// it for the session until a league it didn't list needs you, or the next Optimize All or Sync All. The rule is
// getLineupIssues (js/mls/lineup/issues.js), the one the Lineup tab's red and purple warnings use; the red one
// now offers a one-tap swap for a healthy bench player.
//
// Two leagues from the one Sleeper fixture (the stub answers any league id; the app keys leagues by the id
// typed): "Fixture League", where Ja'Marr Chase (healthy, starting) is in your IR slot, and a second league,
// renamed here, where your QBs are Lamar Jackson (Doubtful, ranked ahead, so he starts) and Jalen Hurts. Both
// rosters get Bijan Robinson from the other team, because the fixture roster has one RB for two RB slots (an
// empty slot the box would list too; the last tests use that).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';
const SECOND_LEAGUE_NAME = 'The Long-Named Dynasty League of Champions';
const CHASE = '4866', ALLEN = '4984', LAMAR = '4881', HURTS = '6904', BIJAN = '9509', KITTLE = '4217';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const move = (from, to, id) => { from.players = from.players.filter(p => p !== id); to.players.push(id); };

const box = (page) => page.locator('#lineupNeedsBox');
const problemLines = (page) => box(page).locator(':scope > .mls-needs-list > .mls-needs-line');
const line = (page, league) => problemLines(page).filter({ has: page.locator('.mls-needs-league', { hasText: league }) });
const lineSummaries = (page) => problemLines(page).evaluateAll(ls => ls.map(l =>
    `${l.querySelector('.mls-needs-league').textContent.trim()}: ${l.querySelector('.mls-needs-items').textContent.replace(/ /g, ' ').trim()}`));
const openLineup = (page, league) => line(page, league).getByRole('button', { name: `Open ${league}'s lineup` });

const LAMAR_LINE = `${SECOND_LEAGUE_NAME}: Lamar Jackson is Doubtful: start Jalen Hurts instead?`;
const CHASE_LINE = "Fixture League: Activate Ja'Marr Chase from IR";

// opts: chaseInIrSlot / lamarDoubtful (the two issues), reserve (the Fixture League's IR slot, overriding
// chaseInIrSlot), bijan (false: the Fixture League keeps its one RB, so an RB slot is empty), sleeperStarters
// (the Fixture League's lineup on Sleeper).
async function routeLeagues(page, { chaseInIrSlot = true, lamarDoubtful = true, reserve, bijan = true, sleeperStarters } = {}) {
    await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
        const players = fixture('players-nfl.json');
        if (lamarDoubtful) players[LAMAR].injury_status = 'Doubtful';
        return route.fulfill({ json: players });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        if (bijan) move(rosters[1], rosters[0], BIJAN);
        rosters[0].reserve = reserve || (chaseInIrSlot ? [CHASE] : []);
        if (sleeperStarters) rosters[0].starters = sleeperStarters;
        return route.fulfill({ json: rosters });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        move(rosters[1], rosters[0], BIJAN);
        move(rosters[0], rosters[1], ALLEN);
        move(rosters[1], rosters[0], LAMAR);
        move(rosters[1], rosters[0], HURTS);
        return route.fulfill({ json: rosters });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}$`), route =>
        route.fulfill({ json: { ...fixture('league.json'), league_id: SECOND_LEAGUE_ID, name: SECOND_LEAGUE_NAME } }));
}

// Both leagues with rankings (Lamar, ranked 14th, starts over Hurts, 18th), then the Dashboard.
async function seedTwoLeagues(page) {
    await seedMls(page);
    await loadMlsRankings(page);
    await page.fill('#sleeperLeagueId', SECOND_LEAGUE_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await loadMlsRankings(page);
    await showTab(page, 'setup');
}

async function optimizeAll(page, toast) {
    await page.click('#optimizeAllBtn');
    await expect(page.locator('.toast-message').filter({ hasText: toast })).toBeVisible();
    await expect(page.locator('#optimizeAllBtn')).toBeEnabled();
}

// On the Lineup tab: swaps a starter with a bench player.
async function swap(page, starterName, benchName) {
    const starter = (name) => page.locator('#optimalLineupContainer .lineup-slot').filter({ hasText: name });
    const bench = (name) => page.locator('#benchContainer .lineup-slot').filter({ hasText: name });
    await bench(benchName).locator('[data-action="initiateSwap"]').click();
    await starter(starterName).locator('[data-action="initiateSwap"]').click();
    await expect(starter(benchName)).toHaveCount(1);
    await expect(bench(starterName)).toHaveCount(1);
}

test.describe('Lineups that need you', () => {
    test('listed without a run; Optimize All says how many; each line opens its Lineup tab', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        // The Command Center's (i) says what the box is.
        await expect(page.locator('#dashboardCommandCenter .card-header .tooltip-text')).toContainText('listed under these buttons');

        // Always on: the syncs already re-optimized both leagues.
        await expect(box(page)).toBeVisible();
        await expect(box(page).locator('.mls-needs-title')).toHaveText('2 lineups need you before kickoff');
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);
        // Names don't break across lines on a phone. Each item in its Lineup tab color.
        await expect(line(page, 'Fixture League').locator('.mls-needs-item.is-ir')).toHaveText("Activate Ja'Marr Chase from IR");
        await expect(line(page, SECOND_LEAGUE_NAME).locator('.mls-needs-item.is-injured')).toHaveCount(1);
        // Both are Lineup tab jobs (an activation, a swap): Open lineup, no Find.
        await expect(box(page).locator('.mls-needs-find')).toHaveCount(0);

        await optimizeAll(page, 'Optimized 2 lineups · 2 need you (listed under the buttons)');
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);

        // The second league: its Lineup tab, whose red warning offers the same swap, in one tap.
        await openLineup(page, SECOND_LEAGUE_NAME).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(SECOND_LEAGUE_ID);
        const warning = page.locator('#lineupTab .lineup-injury-warning:not(.lineup-ir-warning)');
        await expect(warning).toContainText('Lamar Jackson is D and currently in your starting lineup. Start Jalen Hurts instead?');
        await warning.getByRole('button', { name: 'Swap in Jalen Hurts' }).click();
        await expect(page.locator('#optimalLineupContainer .lineup-slot').filter({ hasText: 'Jalen Hurts' })).toHaveCount(1);
        await expect(warning).toHaveCount(0);

        // Back on the Dashboard the fixed league is gone; the Fixture League's line opens its purple warning.
        await showTab(page, 'setup');
        expect(await lineSummaries(page)).toEqual([CHASE_LINE]);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup needs you before kickoff');
        await openLineup(page, 'Fixture League').click();
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveText("Ja'Marr Chase is in your IR slot on Sleeper. Move him to your active roster there before kickoff to start him.");

        // Fixed there too (Garrett Wilson starts instead): nothing left, so no box.
        await swap(page, "Ja'Marr Chase", 'Garrett Wilson');
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();
        await expectClean(page, state);
    });

    test('soonest kickoff first, and amber within a day', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        // Lamar (BAL) kicks off in 3 hours, Chase (CIN) in 3 days.
        await page.evaluate(async (now) => {
            const { State } = await import('/js/mls/state.js');
            State.gameTimesByTeam = { ...State.gameTimesByTeam, BAL: new Date(now + 3 * 3600e3).toISOString(), CIN: new Date(now + 3 * 86400e3).toISOString() };
        }, Date.parse(FIXED_NOW));
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        expect(await lineSummaries(page)).toEqual([LAMAR_LINE, CHASE_LINE]);
        await expect(line(page, SECOND_LEAGUE_NAME).locator('.mls-needs-when')).toHaveClass(/\bis-soon\b/);
        await expect(line(page, 'Fixture League').locator('.mls-needs-when')).not.toHaveClass(/\bis-soon\b/);
        await expect(line(page, 'Fixture League').locator('.mls-needs-when')).not.toBeEmpty();
        await expectClean(page, state);
    });

    test('an empty slot is a pickup: Find RB opens Top Available on RB for that league', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, bijan: false });
        await seedTwoLeagues(page);
        expect(await lineSummaries(page)).toEqual(['Fixture League: RB slot is empty', LAMAR_LINE]);
        const fixtureLine = line(page, 'Fixture League');
        await expect(fixtureLine.getByRole('button', { name: /^Open / })).toHaveCount(0);
        await fixtureLine.getByRole('button', { name: 'Find RB in Fixture League' }).click();
        await expect(page.locator('#scoutTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        await expect(page.locator('#scoutTab [data-action="setWaiverPos"][data-pos="RB"]')).toHaveAttribute('aria-pressed', 'true');
        await expectClean(page, state);
    });

    test('the leagues that differ from Sleeper, in a drop-down', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // On Sleeper the Fixture League starts Garrett Wilson where this lineup starts Chase.
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false,
            sleeperStarters: [ALLEN, '3198', BIJAN, '6794', '6786', '11604', '7523', '17', 'BAL'] });
        await seedTwoLeagues(page);
        await expect(box(page)).toBeVisible();
        await expect(problemLines(page)).toHaveCount(0);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup to set on Sleeper');
        const fold = box(page).locator('.mls-needs-sleeper');
        await expect(fold.locator('summary')).toHaveText('1 league differs from your Sleeper lineup');
        await fold.locator('summary').click();
        const sleeperLine = fold.locator('.mls-needs-line');
        await expect(sleeperLine).toHaveCount(1);
        await expect(sleeperLine.locator('.mls-needs-items')).toHaveText("Start Ja'Marr Chase · Bench Garrett Wilson");
        // Stays open across a re-render, and opens the league.
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(fold).toHaveAttribute('open', '');
        await sleeperLine.getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expectClean(page, state);
    });

    test('✕ hides it until a league it did not list needs you, or the next run', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Kittle (healthy, benched) in the Fixture League's IR slot; only the second league needs you.
        await routeLeagues(page, { reserve: [KITTLE] });
        await seedTwoLeagues(page);
        expect(await lineSummaries(page)).toEqual([LAMAR_LINE]);
        await box(page).getByRole('button', { name: 'Close this list' }).click();
        await expect(box(page)).toBeHidden();

        // Re-renders keep it closed...
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();
        // ...until the Fixture League needs you too: Kittle started from the IR slot.
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE_ID);
        await showTab(page, 'lineup');
        await swap(page, 'Brock Bowers', 'George Kittle');
        await showTab(page, 'setup');
        expect(await lineSummaries(page)).toEqual(['Fixture League: Activate George Kittle from IR', LAMAR_LINE]);

        // Closed again, the next run brings it back.
        await box(page).getByRole('button', { name: 'Close this list' }).click();
        await expect(box(page)).toBeHidden();
        await optimizeAll(page, 'Optimized 2 lineups · 2 need you (listed under the buttons)');
        await expect(box(page)).toBeVisible();
        await expectClean(page, state);
    });

    test('Sync All says how many need you and shows the box', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await box(page).getByRole('button', { name: 'Close this list' }).click();

        await page.click('#syncAllBtn');
        await expect(page.locator('.toast-message').filter({ hasText: 'Successfully synced 2 leagues!' })).toContainText('2 lineups need you (listed under the buttons).');
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('a clean run: no box and the usual message', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false });
        await seedTwoLeagues(page);
        await expect(box(page)).toBeHidden();
        await optimizeAll(page, 'Successfully optimized 2 lineups!');
        await expect(box(page)).toBeHidden();
        await expect(box(page)).toBeEmpty();
        await expectClean(page, state);
    });

    test('a failed run keeps its error toast', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);

        // The lineups' save fails (a full browser storage): the run's error toast, not the "need you" one.
        await page.evaluate(() => {
            const setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (k === 'mls_manual_starters') throw new DOMException('full', 'QuotaExceededError');
                return setItem.call(this, k, v);
            };
        });
        await page.click('#optimizeAllBtn');
        await expect(page.locator('.toast-message').filter({ hasText: "Lineups were optimized, but saving them or restoring your league didn't finish." })).toBeVisible();
        await expect(page.locator('.toast-message').filter({ hasText: 'need you' })).toHaveCount(0);
        await expect(page.locator('#optimizeAllBtn')).toBeEnabled();
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Optimize All') && !e.includes('QuotaExceededError') && !e.includes('full')));
        await expectClean(page, state);
    });

    test('at 375px wide each league is one line, names whole, nothing past the edge', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await expect(problemLines(page)).toHaveCount(2);

        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        const boxRect = await box(page).boundingBox();
        for (const league of ['Fixture League', SECOND_LEAGUE_NAME]) {
            const l = line(page, league);
            // The league's name in full (no ellipsis), and its button inside the box, on the same line.
            const name = l.locator('.mls-needs-league');
            await expect(name).toHaveText(league);
            expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
            const btn = await openLineup(page, league).boundingBox();
            const main = await l.locator('.mls-needs-main').boundingBox();
            expect(btn.x + btn.width).toBeLessThanOrEqual(boxRect.x + boxRect.width);
            expect(btn.y).toBeLessThan(main.y + main.height);
        }
        await expectClean(page, state);
    });
});
