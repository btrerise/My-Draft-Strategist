// Lineups that need you (improvements S11). A box under the Dashboard's Sync All / Optimize All buttons lists each
// league whose lineup needs you before kickoff: a starter who's injured, on bye or still in your Sleeper IR slot, an
// empty starting slot, an IR move, an IR-slot player who has to come out. Each line says what to do and when the
// first of those games kicks off (soonest league first), with the buttons that fix it (Open lineup for a swap or an
// activation, Find <pos> for a pickup on Top Available). A drop-down lists the leagues whose lineup differs from
// Sleeper. It's always on, drawn from the lineups as they are now; ✕ hides it for the session until a league it
// didn't list needs you, or the next Optimize All or Sync All. Starters you locked in are shown muted, not counted.
// The Lineup tab shows the same items for the open league in one box ("This lineup needs you"), with a one-tap
// swap. Sync All gets the latest injury news, manual leagues included (it replaced the Global Injury Auditor).
// The rule is getLineupIssues (js/mls/lineup/issues.js).
//
// Two leagues from the one Sleeper fixture (the stub answers any league id; the app keys leagues by the id typed):
// "Fixture League", where Ja'Marr Chase (healthy, starting) is in your IR slot, and a second league, renamed here,
// where your QBs are Lamar Jackson (Doubtful, ranked ahead, so he starts) and Jalen Hurts. Both rosters get Bijan
// Robinson from the other team, because the fixture roster has one RB for two RB slots (an empty slot the box
// would list too; one test uses that).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';
const SECOND_LEAGUE_NAME = 'The Long-Named Dynasty League of Champions';
const CHASE = '4866', ALLEN = '4984', LAMAR = '4881', HURTS = '6904', BIJAN = '9509', KITTLE = '4217', HENRY = '3198';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const move = (from, to, id) => { from.players = from.players.filter(p => p !== id); to.players.push(id); };

const box = (page) => page.locator('#lineupNeedsBox');
const problemLines = (page) => box(page).locator(':scope > .mls-needs-list > .mls-needs-line');
const line = (page, league) => problemLines(page).filter({ has: page.locator('.mls-needs-league', { hasText: league }) });
// "League: item · item", the items as listed (one per line on screen).
const lineSummaries = (page) => problemLines(page).evaluateAll(ls => ls.map(l =>
    `${l.querySelector('.mls-needs-league').textContent.trim()}: ${[...l.querySelectorAll('.mls-needs-item')].map(i => i.textContent.replace(/\u00a0/g, ' ').trim()).join(' · ')}`));
const openLineup = (page, league) => line(page, league).getByRole('button', { name: `Open ${league}'s lineup` });
const lineupBox = (page) => page.locator('#optimalLineupContainer .lineup-needs-box');
const lineupItems = (page) => lineupBox(page).locator('.lineup-needs-item').evaluateAll(ls => ls.map(l => l.textContent.replace(/ /g, ' ').trim()));

const LAMAR_LINE = `${SECOND_LEAGUE_NAME}: Lamar Jackson is Doubtful: start Jalen Hurts instead?`;
const CHASE_ITEM = "Activate Ja'Marr Chase from IR on Sleeper";
const CHASE_LINE = `Fixture League: ${CHASE_ITEM}`;

// opts: chaseInIrSlot / lamarDoubtful (the two issues), reserve (the Fixture League's IR slot, overriding
// chaseInIrSlot), bijan (false: the Fixture League keeps its one RB, so an RB slot is empty), sleeperStarters
// (the Fixture League's lineup on Sleeper), injuries ({ id: Sleeper status }), irSettings (the Fixture League's
// reserve_* settings), benchSpots (its number of bench spots; the fixture has 5).
async function routeLeagues(page, { chaseInIrSlot = true, lamarDoubtful = true, reserve, bijan = true, sleeperStarters, injuries = {}, irSettings, benchSpots } = {}) {
    await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
        const players = fixture('players-nfl.json');
        if (lamarDoubtful) players[LAMAR].injury_status = 'Doubtful';
        Object.entries(injuries).forEach(([id, status]) => { players[id].injury_status = status; });
        return route.fulfill({ json: players });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        // Bijan for A.J. Brown, so the roster still fits its 14 spots.
        if (bijan) { move(rosters[1], rosters[0], BIJAN); move(rosters[0], rosters[1], '5859'); }
        rosters[0].reserve = reserve || (chaseInIrSlot ? [CHASE] : []);
        if (sleeperStarters) rosters[0].starters = sleeperStarters;
        return route.fulfill({ json: rosters });
    });
    if (irSettings) {
        await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}$`), route => {
            const league = fixture('league.json');
            const positions = benchSpots == null ? league.roster_positions
                : [...league.roster_positions.filter(p => p !== 'BN'), ...Array(benchSpots).fill('BN')];
            return route.fulfill({ json: { ...league, roster_positions: positions, settings: { ...league.settings, ...irSettings } } });
        });
    }
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
    test('listed without a run; Optimize All says how many; each line opens its Lineup tab and its box', async ({ page }) => {
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
        await expect(line(page, 'Fixture League').locator('.mls-needs-item.is-ir')).toHaveText(CHASE_ITEM.replace("Ja'Marr Chase", "Ja'Marr Chase"));
        await expect(line(page, SECOND_LEAGUE_NAME).locator('.mls-needs-item.is-injured')).toHaveCount(1);
        // Both are Lineup tab jobs (an activation, a swap): Open lineup, no Find.
        await expect(box(page).locator('.mls-needs-find')).toHaveCount(0);

        await optimizeAll(page, 'Optimized 2 lineups · 2 need you');
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);

        // The second league: its Lineup tab, one box with the same item, spelled out, and a one-tap swap.
        await openLineup(page, SECOND_LEAGUE_NAME).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(SECOND_LEAGUE_ID);
        await expect(lineupBox(page).locator('.lineup-needs-title')).toHaveText('This lineup needs you');
        expect(await lineupItems(page)).toEqual(['Lamar Jackson is Doubtful: start Jalen Hurts instead? Swap in Jalen Hurts']);
        await lineupBox(page).getByRole('button', { name: 'Swap in Jalen Hurts' }).click();
        await expect(page.locator('#optimalLineupContainer .lineup-slot').filter({ hasText: 'Jalen Hurts' })).toHaveCount(1);
        await expect(lineupBox(page)).toHaveCount(0);

        // Back on the Dashboard the fixed league is gone; the Fixture League's line opens its box.
        await showTab(page, 'setup');
        expect(await lineSummaries(page)).toEqual([CHASE_LINE]);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup needs you before kickoff');
        await openLineup(page, 'Fixture League').click();
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        expect(await lineupItems(page)).toEqual([CHASE_ITEM]);
        await expect(lineupBox(page).locator('.lineup-needs-item.is-ir')).toHaveCount(1);

        // Fixed there too (Garrett Wilson starts instead): nothing left, so no box on either tab.
        await swap(page, "Ja'Marr Chase", 'Garrett Wilson');
        await expect(lineupBox(page)).toHaveCount(0);
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();
        await expectClean(page, state);
    });

    test('a starter you locked in is shown muted and not counted', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false });
        await seedTwoLeagues(page);
        expect(await lineSummaries(page)).toEqual([LAMAR_LINE]);

        // Keep Lamar on purpose: lock him.
        await page.selectOption('#headerLeagueSelect', SECOND_LEAGUE_ID);
        await showTab(page, 'lineup');
        await page.locator('#optimalLineupContainer [data-action="toggleLock"][aria-label="Lock Lamar Jackson"]').click();
        await expect(lineupBox(page).locator('.lineup-needs-title')).toHaveText('Nothing needs you before kickoff');
        await expect(lineupBox(page).locator('.lineup-needs-item.is-kept')).toHaveText('Lamar Jackson is Doubtful (you locked him in)');
        await expect(lineupBox(page).getByRole('button', { name: /Swap in/ })).toHaveCount(0);

        await showTab(page, 'setup');
        await expect(box(page).locator('.mls-needs-title')).toHaveText('Nothing needs you before kickoff · 1 league with notes');
        await expect(line(page, SECOND_LEAGUE_NAME).locator('.mls-needs-item.is-kept')).toHaveCount(1);
        await expect(line(page, SECOND_LEAGUE_NAME).getByRole('button')).toHaveCount(0);
        await optimizeAll(page, 'Successfully optimized 2 lineups!');
        await expectClean(page, state);
    });

    test("the league's IR rules: a move to IR, an IR-slot player who must come out, a full roster", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // In the Fixture League's IR slot: Chase (healthy, starting) and Kittle (healthy, benched). Trey McBride
        // (TE, benched behind Bowers) is Out. Three IR slots, so one is open, and Out is allowed there. Two bench
        // spots fewer than the fixture (12 spots): the 14 players less the 2 in IR fill it.
        await routeLeagues(page, { reserve: [CHASE, KITTLE], lamarDoubtful: false, injuries: { 7553: 'Out' },
            irSettings: { reserve_slots: 3, reserve_allow_out: 1, reserve_allow_doubtful: 0 }, benchSpots: 3 });
        await seedTwoLeagues(page);
        expect(await lineSummaries(page)).toEqual([
            "Fixture League: Activate Ja'Marr Chase from IR on Sleeper (roster full: drop someone first) · "
            + 'Activate George Kittle from IR: no longer eligible, and it blocks your adds and drops (roster full: drop someone first) · '
            + 'Move Trey McBride to IR to free a spot',
        ]);
        // The IR move is a note: it doesn't count, so the Fixture League counts for its activations alone.
        await expect(line(page, 'Fixture League').locator('.mls-needs-item.is-ir')).toHaveCount(3);
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

    test('an empty slot is a pickup: Find RB opens Top Available on RB, from either tab', async ({ page }) => {
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

        // The Lineup tab's box has the same item and button.
        await showTab(page, 'lineup');
        expect(await lineupItems(page)).toEqual(['RB slot is empty Find RB']);
        await page.locator('[data-action="setWaiverPos"][data-pos="ALL"]').evaluate(b => b.click());
        await lineupBox(page).getByRole('button', { name: 'Find RB' }).click();
        await expect(page.locator('#scoutTab [data-action="setWaiverPos"][data-pos="RB"]')).toHaveAttribute('aria-pressed', 'true');
        await expectClean(page, state);
    });

    test('the leagues that differ from Sleeper, in a drop-down on both tabs, with injured starters marked', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // On Sleeper the Fixture League starts Garrett Wilson and George Kittle (Out) where this lineup starts
        // Ja'Marr Chase and Brock Bowers.
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, injuries: { [KITTLE]: 'Out' },
            sleeperStarters: [ALLEN, HENRY, BIJAN, '6794', '6786', KITTLE, '7523', '17', 'BAL'] });
        await seedTwoLeagues(page);
        await expect(box(page)).toBeVisible();
        await expect(problemLines(page)).toHaveCount(0);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup to set on Sleeper');
        const fold = box(page).locator('.mls-needs-sleeper');
        await expect(fold.locator('summary')).toHaveText('1 league differs from your Sleeper lineup');
        await fold.locator('summary').click();
        const sleeperLine = fold.locator('.mls-needs-line');
        await expect(sleeperLine).toHaveCount(1);
        await expect(sleeperLine.locator('.mls-needs-items')).toHaveText("Start Ja'Marr Chase, Brock Bowers · Bench George Kittle (Out), Garrett Wilson");
        // Stays open across a re-render, and opens the league, whose box has the same fold.
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(fold).toHaveAttribute('open', '');
        await sleeperLine.getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(lineupBox(page).locator('.lineup-needs-sleeper summary')).toHaveText('Differs from your Sleeper lineup: 4 changes');
        await expect(lineupBox(page).locator('.lineup-needs-sleeper-text')).toContainText('George Kittle (Out)');
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
        expect(await lineSummaries(page)).toEqual(['Fixture League: Activate George Kittle from IR on Sleeper', LAMAR_LINE]);

        // Closed again, the next run brings it back.
        await box(page).getByRole('button', { name: 'Close this list' }).click();
        await expect(box(page)).toBeHidden();
        await optimizeAll(page, 'Optimized 2 lineups · 2 need you');
        await expect(box(page)).toBeVisible();
        await expectClean(page, state);
    });

    test('Sync All (or the box\'s "Sync All again") says how many need you and shows the box', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await box(page).getByRole('button', { name: 'Close this list' }).click();

        await page.click('#syncAllBtn');
        // One short line (phones): what was synced, then how many need you.
        await expect(page.locator('.toast-message').filter({ hasText: 'Synced 2 leagues · 2 lineups need you' })).toBeVisible();
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);

        await box(page).getByRole('button', { name: 'Sync All again' }).click();
        await expect(page.locator('.toast-message').filter({ hasText: 'Synced 2 leagues · 2 lineups need you' })).toBeVisible();
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test("Sync All looks up a manual league's injuries by name, and the old Auditor's place points here", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        let henryOut = false;
        await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
            const players = fixture('players-nfl.json');
            if (henryOut) players[HENRY].injury_status = 'Out';
            return route.fulfill({ json: players });
        });
        await seedMls(page);
        // A manual league with Henry, typed by hand.
        await page.fill('#newLeagueName', 'Bench League');
        await page.getByRole('button', { name: 'Create Manual' }).click();
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Bench League');
        await page.locator('summary', { hasText: 'Add Player Manually' }).click();
        for (const [name, pos, team] of [['Derrick Henry', 'RB', 'BAL'], ['Zack Nobody', 'WR', 'FA']]) {
            await page.fill('#manualName', name);
            await page.selectOption('#manualPos', pos);
            await page.fill('#manualTeam', team);
            await page.getByRole('button', { name: 'Add Player to Active Roster' }).click();
        }
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(line(page, 'Bench League')).not.toContainText('Derrick');

        // Henry's ruled Out; Sync All finds it by name.
        henryOut = true;
        await page.click('#syncAllBtn');
        await expect(page.locator('.toast-message').filter({ hasText: 'Synced 1 league + 1 manual · 1 with roster changes · 2 lineups need you' })).toBeVisible();
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        await expect(line(page, 'Bench League').locator('.mls-needs-item.is-injured')).toHaveText('Derrick Henry is Out: no healthy RB on your bench');
        // A name Sleeper doesn't know: a note that its injuries aren't checked (the Auditor's "unmatched").
        await expect(line(page, 'Bench League').locator('.mls-needs-item.is-unmatched')).toHaveText('No injury news for Zack\u00a0Nobody: name not found on Sleeper');

        // The Lineup tab's pointer where the Global Injury Auditor was.
        await showTab(page, 'lineup');
        await expect(page.locator('#injuryAuditPointer')).toContainText('Global Injury Auditor is now part of the Dashboard');
        await page.locator('#injuryAuditPointer').getByRole('button', { name: /Go to the Dashboard/ }).click();
        await expect(page.locator('#setupTab')).toHaveClass(/\bactive\b/);
        await expectClean(page, state);
    });

    test("the Lineup tab's box folds to its title line, with the count, and stays folded", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await openLineup(page, 'Fixture League').click();
        const title = lineupBox(page).locator('.lineup-needs-title');
        await expect(title).toHaveAttribute('aria-expanded', 'true');
        await title.click();
        await expect(title).toHaveAttribute('aria-expanded', 'false');
        await expect(title).toHaveText('This lineup needs you · 1');
        await expect(lineupBox(page).locator('.lineup-needs-item')).toHaveCount(0);

        // Remembered across a reload, and in every league.
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'lineup');
        await expect(lineupBox(page).locator('.lineup-needs-title')).toHaveAttribute('aria-expanded', 'false');
        await lineupBox(page).locator('.lineup-needs-title').click();
        await expect(lineupBox(page).locator('.lineup-needs-item')).toHaveCount(1);
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

    test('at 375px wide each league is one block, names whole, its buttons under its items, nothing past the edge', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await expect(problemLines(page)).toHaveCount(2);

        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        const boxRect = await box(page).boundingBox();
        for (const league of ['Fixture League', SECOND_LEAGUE_NAME]) {
            const l = line(page, league);
            // The league's name in full (no ellipsis); its buttons in a row under its items, inside the box.
            const name = l.locator('.mls-needs-league');
            await expect(name).toHaveText(league);
            expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
            const btn = await openLineup(page, league).boundingBox();
            const main = await l.locator('.mls-needs-main').boundingBox();
            expect(btn.x + btn.width).toBeLessThanOrEqual(boxRect.x + boxRect.width);
            expect(btn.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
            expect(btn.x).toBeGreaterThanOrEqual(boxRect.x);
        }
        // The Lineup tab's box fits too (that tab's button row above it is wider than 375px already).
        await openLineup(page, SECOND_LEAGUE_NAME).click();
        await expect(lineupBox(page)).toBeVisible();
        expect(await lineupBox(page).evaluate(e => Math.max(e.getBoundingClientRect().right, ...[...e.querySelectorAll('*')].map(c => c.getBoundingClientRect().right)))).toBeLessThanOrEqual(375);
        await expectClean(page, state);
    });
});
