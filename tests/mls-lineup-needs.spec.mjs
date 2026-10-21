// Lineups that need you (improvements S11). Each league whose lineup needs you before kickoff (a starter who's
// injured, on bye or still in your Sleeper IR slot, an empty starting slot, an IR move, an IR-slot player who has to
// come out) lists it in its Dashboard card (improvements S12, js/mls/render/leagueCards.js; a box under Sync All /
// Optimize All before): what to do and when the first of those games kicks off, with the buttons that fix it (Open
// lineup for a swap or an activation, Find <pos> for a pickup on Top Available). The card's drop-down shows how the
// lineup differs from Sleeper. A strip under the buttons counts them. It's always on, drawn from the lineups as they
// are now; the strip's ✕ hides the to-dos for the session until a league it didn't list needs you, or the next
// Optimize All or Sync All. Starters you locked in are shown muted, not counted.
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
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, transitionsDone, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';
const SECOND_LEAGUE_NAME = 'The Long-Named Dynasty League of Champions';
const CHASE = '4866', ALLEN = '4984', LAMAR = '4881', HURTS = '6904', BIJAN = '9509', KITTLE = '4217', HENRY = '3198';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const move = (from, to, id) => { from.players = from.players.filter(p => p !== id); to.players.push(id); };

// The strip under the buttons (the count, ✕, "Sync All again"), and each league's card with its to-dos.
const box = (page) => page.locator('#lineupNeedsBox');
const cards = (page) => page.locator('#leagueCards > .mls-lc-card');
const card = (page, league) => cards(page).filter({ has: page.locator('.mls-lc-name', { hasText: league }) });
const problemLines = (page) => page.locator('#leagueCards .mls-lc-todo > .mls-needs-line');
const line = (page, league) => card(page, league).locator('.mls-lc-todo > .mls-needs-line');
// "League: item · item" for each card with to-dos, in card order; the items as listed (one per line on screen).
const lineSummaries = (page) => cards(page).evaluateAll(cs => cs.filter(c => c.querySelector('.mls-lc-todo > .mls-needs-line')).map(c =>
    `${c.querySelector('.mls-lc-name').textContent.trim()}: ${[...c.querySelectorAll('.mls-lc-todo > .mls-needs-line .mls-needs-item')].map(i => i.textContent.replace(/\u00a0/g, ' ').trim()).join(' · ')}`));
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
        // The Command Center's (i) says what the cards hold.
        await expect(page.locator('#dashboardCommandCenter .card-header .tooltip-text')).toContainText('what its lineup needs from you before kickoff');

        // Always on: the syncs already re-optimized both leagues.
        await expect(box(page)).toBeVisible();
        await expect(box(page).locator('.mls-needs-title')).toHaveText('2 lineups need you before kickoff');
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);
        // Names don't break across lines on a phone. Each item in its Lineup tab color.
        await expect(line(page, 'Fixture League').locator('.mls-needs-item.is-ir')).toHaveText(CHASE_ITEM.replace("Ja'Marr Chase", "Ja'Marr Chase"));
        await expect(line(page, SECOND_LEAGUE_NAME).locator('.mls-needs-item.is-injured')).toHaveCount(1);
        // Both are Lineup tab jobs (an activation, a swap): Open lineup, no Find.
        await expect(page.locator('#leagueCards .mls-needs-find')).toHaveCount(0);
        // Each card counts its to-dos and has the amber edge.
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-todo')).toHaveText('1 to do');
        await expect(card(page, 'Fixture League')).toHaveClass(/\bneeds-you\b/);

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
        await transitionsDone(page);
        expect(await lineupItems(page)).toEqual([CHASE_ITEM]);
        await expect(lineupBox(page).locator('.lineup-needs-item.is-ir')).toHaveCount(1);

        // Fixed there too (Garrett Wilson starts instead): nothing left, so no box on either tab.
        await swap(page, "Ja'Marr Chase", 'Garrett Wilson');
        await expect(lineupBox(page)).toHaveCount(0);
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();
        await expect(problemLines(page)).toHaveCount(0);
        await expect(cards(page).filter({ hasText: 'to do' })).toHaveCount(0);
        await expect(page.locator('#leagueCards .needs-you')).toHaveCount(0);
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

    test('the kickoff time, amber within a day; the cards stay in your league order', async ({ page }) => {
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
        // League order (owner's choice, S12; the box sorted soonest first before), so ▲▼ always move a card.
        expect(await lineSummaries(page)).toEqual([CHASE_LINE, LAMAR_LINE]);
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

    test('what to set on Sleeper: an item of the card\'s to-dos, routine unless an injured player is starting there', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // On Sleeper the Fixture League starts Garrett Wilson and George Kittle where this lineup starts Ja'Marr Chase
        // and Brock Bowers. Everyone's healthy.
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false,
            sleeperStarters: [ALLEN, HENRY, BIJAN, '6794', '6786', KITTLE, '7523', '17', 'BAL'] });
        await seedTwoLeagues(page);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup to set on Sleeper');
        // In the Fixture League's card, listed with its to-dos (S12 round 4; a fold before); the other league has none.
        expect(await lineSummaries(page)).toEqual(["Fixture League: Start Ja'Marr Chase, Brock Bowers · Bench George Kittle, Garrett Wilson"]);
        const fixtureLine = line(page, 'Fixture League');
        await expect(fixtureLine.locator('.mls-needs-label')).toHaveText('Set on Sleeper');
        // Routine, so neutral: "1 to set", no amber border (S12 round 5).
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-sleeper')).toHaveText('1 to set');
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-todo')).toHaveCount(0);
        await expect(card(page, 'Fixture League')).not.toHaveClass(/\bneeds-you\b/);
        await expect(box(page).locator('.mls-needs-check')).toHaveText('Set the lineup on Sleeper, then Sync All again to clear it.');
        await expect(card(page, 'Fixture League').locator('.mls-lc-chip.is-danger .mls-lc-chip-label')).toHaveText('Lineup');
        // Optimize All's message says so (S12 round 6; it said "Successfully optimized 2 lineups!").
        await optimizeAll(page, 'Optimized 2 lineups · 1 to set on Sleeper');
        // Open lineup opens the league, whose box has the changes in a drop-down.
        await fixtureLine.getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(lineupBox(page).locator('.lineup-needs-sleeper summary')).toHaveText('Differs from your Sleeper lineup: 4 changes');
        await expectClean(page, state);
    });

    // S12 round 6 (found in a review as a user): the app benches an Out starter, but he's still in your Sleeper lineup.
    // That's the Global Injury Auditor's case, so it needs you: amber, counted, "(Out)" marked. Round 5 had made it
    // look routine.
    test('an injured player still starting on Sleeper needs you', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, injuries: { [KITTLE]: 'Out' },
            sleeperStarters: [ALLEN, HENRY, BIJAN, '6794', '6786', KITTLE, '7523', '17', 'BAL'] });
        await seedTwoLeagues(page);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup needs you before kickoff · 1 to set on Sleeper');
        expect(await lineSummaries(page)).toEqual(["Fixture League: On Sleeper: Start Ja'Marr Chase, Brock Bowers · Bench George Kittle (Out), Garrett Wilson"]);
        const fixtureLine = line(page, 'Fixture League');
        await expect(fixtureLine.locator('.mls-needs-label')).toHaveText('Needs you');
        await expect(fixtureLine.locator('.mls-needs-hurt')).toHaveText('(Out)');
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-todo')).toHaveText('1 to do');
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-sleeper')).toHaveCount(0);
        await expect(card(page, 'Fixture League')).toHaveClass(/\bneeds-you\b/);
        await optimizeAll(page, 'Optimized 2 lineups · 1 needs you · 1 to set on Sleeper');
        // The Lineup tab's drop-down marks him too.
        await fixtureLine.getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await expect(lineupBox(page).locator('.lineup-needs-sleeper-text')).toContainText('George Kittle (Out)');
        await expectClean(page, state);
    });

    // S12 round 8 (found in a review as a user: "Bench Ashton Jeanty" with no reason made you check everything). A routine
    // bench change says why when the rankings alone don't: a status that still lets him play, or his absence from the
    // rankings the optimizer used. Muted, and still routine.
    test('a routine bench change says why when it is not just a lower rank', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, injuries: { [KITTLE]: 'Questionable' },
            sleeperStarters: [ALLEN, HENRY, BIJAN, '6794', '6786', KITTLE, '7523', '17', 'BAL'] });
        await seedTwoLeagues(page);
        // Garrett Wilson isn't in the Fixture League's rankings any more (like a player your analyst leaves out).
        await page.evaluate(async (leagueId) => {
            const { State } = await import('/js/mls/state.js');
            const { getLeagueRankings, renderLeagueCards } = await import('/js/mls/main.js');
            const league = State.leagues.find(l => l.leagueId === leagueId);
            getLeagueRankings(league, 'weekly').data.splice(0, Infinity, ...getLeagueRankings(league, 'weekly').data.filter(r => r.cleanName !== 'garrettwilson'));
            renderLeagueCards();
        }, FIXTURE_LEAGUE_ID);
        expect(await lineSummaries(page)).toEqual(["Fixture League: Start Ja'Marr Chase, Brock Bowers · Bench George Kittle (Q), Garrett Wilson (not in your Weekly rankings)"]);
        const fixtureLine = line(page, 'Fixture League');
        await expect(fixtureLine.locator('.mls-needs-why')).toHaveText(['(Q)', '(not in your Weekly rankings)']);
        // Still routine: neutral "1 to set", no amber.
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-sleeper')).toHaveText('1 to set');
        await expect(card(page, 'Fixture League')).not.toHaveClass(/\bneeds-you\b/);
        // A set with a short name you gave it is named ("Wk5", as best available names it).
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const { renderLeagueCards } = await import('/js/mls/main.js');
            State.rankingSets.weekly.forEach(set => { set.name = 'Wk5'; });
            renderLeagueCards();
        });
        await expect(fixtureLine.locator('.mls-needs-why').last()).toHaveText('(not in Wk5)');
        // The Lineup tab's drop-down says the same.
        await fixtureLine.getByRole('button', { name: "Open Fixture League's lineup" }).click();
        await expect(lineupBox(page).locator('.lineup-needs-sleeper-text')).toContainText('George Kittle (Q), Garrett Wilson (not in Wk5)');
        await expectClean(page, state);
    });

    // S12 round 8 (found in a review as a user): Sync All's "3 with roster changes" pointed at the Sync Logs, which sit
    // under every card (thousands of pixels down on a phone). Each league's card now says what changed, folded too, for
    // the rest of the visit.
    test("Sync All's roster changes show on each league's card", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false });
        let pickedUp = false;
        // Later in the week: Derrick Henry is ruled out, and you picked up Zay Flowers and dropped Garrett Wilson in
        // the Fixture League.
        await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
            if (!pickedUp) return route.fallback();
            const players = fixture('players-nfl.json');
            players[HENRY].injury_status = 'Out';
            return route.fulfill({ json: players });
        });
        await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), async route => {
            if (!pickedUp) return route.fallback();
            const rosters = fixture('league-rosters.json');
            move(rosters[1], rosters[0], BIJAN); move(rosters[0], rosters[1], '5859');
            rosters[0].reserve = [];
            rosters[0].players = [...rosters[0].players.filter(id => id !== '7523'), '9997'];
            return route.fulfill({ json: rosters });
        });
        await seedTwoLeagues(page);
        await expect(cards(page).locator('.mls-lc-synced')).toHaveCount(0);
        pickedUp = true;
        await page.click('#syncAllBtn');
        await expect(page.locator('.toast-message').filter({ hasText: '2 with roster changes' })).toBeVisible();
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        const synced = card(page, 'Fixture League').locator('.mls-lc-synced');
        await expect(synced).toHaveText('Synced: +\u00a0Zay\u00a0Flowers · \u2212\u00a0Garrett\u00a0Wilson · Derrick\u00a0Henry\u00a0(Out)');
        await expect(synced.locator('.mls-lc-synced-out')).toHaveText('Derrick\u00a0Henry\u00a0(Out)');
        // Muted, not the injury red: it's news, and red is for what you have to act on (owner's choice, round 10).
        const color = (loc) => loc.evaluate(e => getComputedStyle(e).color);
        expect(await color(synced.locator('.mls-lc-synced-out'))).toBe(await color(synced));
        expect(await color(synced.locator('.mls-lc-synced-out'))).not.toBe('rgb(252, 165, 165)');
        // Henry is on the second league's roster too; nothing else changed there.
        await expect(card(page, SECOND_LEAGUE_NAME).locator('.mls-lc-synced')).toHaveText('Synced: Derrick\u00a0Henry\u00a0(Out)');
        // Folded, the card still says it.
        if (await card(page, 'Fixture League').locator('.mls-lc-body').isVisible()) await card(page, 'Fixture League').locator('.mls-lc-fold').click();
        await expect(card(page, 'Fixture League')).toHaveClass(/\bis-collapsed\b/);
        await expect(synced).toBeVisible();
        // The Sync Logs keep it too; after a reload only they do.
        await expect(page.locator('#syncLogContent')).toContainText('Zay Flowers');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'setup');
        await expect(cards(page)).toHaveCount(2);
        await expect(cards(page).locator('.mls-lc-synced')).toHaveCount(0);
        await expect(page.locator('#syncLogContent')).toContainText('Zay Flowers');
        await expectClean(page, state);
    });

    test('✕ hides it until a league it did not list needs you, or the next run', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Kittle (healthy, benched) in the Fixture League's IR slot; only the second league needs you.
        await routeLeagues(page, { reserve: [KITTLE] });
        await seedTwoLeagues(page);
        expect(await lineSummaries(page)).toEqual([LAMAR_LINE]);
        await box(page).getByRole('button', { name: 'Hide the to-dos' }).click();
        await expect(box(page)).toBeHidden();
        // The cards' to-dos go with it; the cards stay.
        await expect(problemLines(page)).toHaveCount(0);
        await expect(cards(page)).toHaveCount(2);
        await expect(page.locator('#leagueCards .needs-you')).toHaveCount(0);

        // Re-renders keep it closed...
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(box(page)).toBeHidden();
        await expect(problemLines(page)).toHaveCount(0);
        // ...until the Fixture League needs you too: Kittle started from the IR slot.
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE_ID);
        await showTab(page, 'lineup');
        await swap(page, 'Brock Bowers', 'George Kittle');
        await showTab(page, 'setup');
        expect(await lineSummaries(page)).toEqual(['Fixture League: Activate George Kittle from IR on Sleeper', LAMAR_LINE]);

        // Closed again, the next run brings it back.
        await box(page).getByRole('button', { name: 'Hide the to-dos' }).click();
        await expect(box(page)).toBeHidden();
        await optimizeAll(page, 'Optimized 2 lineups · 2 need you');
        await expect(box(page)).toBeVisible();
        await expectClean(page, state);
    });

    test('Sync All (or the box\'s "Sync All again") says how many need you and shows the box', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await box(page).getByRole('button', { name: 'Hide the to-dos' }).click();

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

    test('at 375px wide each league is one card, names whole, its buttons under its items, nothing past the edge', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await expect(problemLines(page)).toHaveCount(2);

        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        for (const league of ['Fixture League', SECOND_LEAGUE_NAME]) {
            const c = card(page, league);
            const cardRect = await c.boundingBox();
            // The league's name in full (no ellipsis); its buttons in a row under its items, inside the card.
            const name = c.locator('.mls-lc-name');
            await expect(name).toHaveText(league);
            expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
            const btn = await openLineup(page, league).boundingBox();
            const main = await line(page, league).locator('.mls-needs-main').boundingBox();
            expect(btn.x + btn.width).toBeLessThanOrEqual(cardRect.x + cardRect.width);
            expect(btn.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
            expect(btn.x).toBeGreaterThanOrEqual(cardRect.x);
        }
        // The Lineup tab's box fits too (that tab's button row above it is wider than 375px already).
        await openLineup(page, SECOND_LEAGUE_NAME).click();
        await expect(lineupBox(page)).toBeVisible();
        expect(await lineupBox(page).evaluate(e => Math.max(e.getBoundingClientRect().right, ...[...e.querySelectorAll('*')].map(c => c.getBoundingClientRect().right)))).toBeLessThanOrEqual(375);
        await expectClean(page, state);
    });
});

// Improvements F7 (found by the owner on Sunday of week 6): once a player's game has started, Sleeper won't let you
// move him, so no card, chip, count or the Lineup tab's fold asks you to. The lineup here was optimized before any
// kickoff (no kickoff times yet), so it starts Ja'Marr Chase (CIN) and Brock Bowers (LV) where your Sleeper lineup
// starts Garrett Wilson (NYJ) and George Kittle (SF). Then the clock passes kickoffs.
test.describe('Sleeper changes after kickoff (F7)', () => {
    const SLEEPER = [ALLEN, HENRY, BIJAN, '6794', '6786', KITTLE, '7523', '17', 'BAL'];
    const PAST = '2026-09-15T12:00:00Z', LATER = '2026-09-16T00:20:00Z';
    // Kickoff times by team (PAST: already started at the fixed clock), then the Dashboard drawn again.
    const kickoffs = (page, times) => page.evaluate(async (times) => {
        const { State } = await import('/js/mls/state.js');
        const { renderLeagueCards } = await import('/js/mls/main.js');
        State.gameTimesByTeam = { ...State.gameTimesByTeam, ...times };
        renderLeagueCards();
    }, times);

    test('every difference locked by kickoff: the card matches Sleeper and leaves the count', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, sleeperStarters: SLEEPER });
        await seedTwoLeagues(page);
        expect(await lineSummaries(page)).toEqual(["Fixture League: Start Ja'Marr Chase, Brock Bowers · Bench George Kittle, Garrett Wilson"]);
        await expect(box(page).locator('.mls-needs-title')).toHaveText('1 lineup to set on Sleeper');
        // All four games have started: nobody in the change can move.
        await kickoffs(page, { CIN: PAST, LV: PAST, NYJ: PAST, SF: PAST });
        expect(await lineSummaries(page)).toEqual([]);
        await expect(card(page, 'Fixture League').locator('.mls-lc-chip.is-good .mls-lc-chip-label')).toHaveText(['Rankings', 'Lineup']);
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-sleeper')).toHaveCount(0);
        await expect(box(page)).toBeHidden();
        // Nor the Lineup tab's fold.
        await page.locator('#headerLeagueSelect').selectOption(FIXTURE_LEAGUE_ID);
        await showTab(page, 'lineup');
        await expect(lineupBox(page).locator('.lineup-needs-sleeper')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('changes between players still to play show as before', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, sleeperStarters: SLEEPER });
        await seedTwoLeagues(page);
        // Other teams' games (Buffalo's, Baltimore's) have started; these four are tonight.
        await kickoffs(page, { BUF: PAST, BAL: PAST, CIN: LATER, LV: LATER, NYJ: LATER, SF: LATER });
        expect(await lineSummaries(page)).toEqual(["Fixture League: Start Ja'Marr Chase, Brock Bowers · Bench George Kittle, Garrett Wilson"]);
        await expect(card(page, 'Fixture League').locator('.mls-lc-chip.is-danger .mls-lc-chip-label')).toHaveText('Lineup');
        await expectClean(page, state);
    });
    // Owner's choice (F7): a change that pairs a player still to play with a locked one is re-optimized, so the card
    // names the best swap still allowed, as the Lineup tab does. Only Cincinnati has kicked off: Chase, on your Sleeper
    // bench, can't come in, and Puka Nacua (LAR, tonight) takes his place.
    test('a change with one side locked names the best swap still allowed; the active league stays', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, sleeperStarters: SLEEPER });
        await seedTwoLeagues(page);
        const active = await page.locator('#headerLeagueSelect').inputValue();
        await kickoffs(page, { CIN: PAST, LV: LATER, NYJ: LATER, SF: LATER, LAR: LATER });
        expect(await lineSummaries(page)).toEqual(["Fixture League: Start Puka Nacua, Brock Bowers · Bench George Kittle, Garrett Wilson"]);
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-sleeper')).toHaveText('1 to set');
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(active);
        // The saved lineup was redone (and saved), so the Lineup tab agrees.
        const saved = await page.evaluate(async (key) => JSON.parse(localStorage.getItem(key)), (await page.evaluate(async () => (await import('/js/shared/storage/keys.js')).KEYS.mls.manualStarters)));
        expect(saved[FIXTURE_LEAGUE_ID].map(s => s.player && s.player.name)).not.toContain("Ja'Marr Chase");
        await page.locator('#headerLeagueSelect').selectOption(FIXTURE_LEAGUE_ID);
        await showTab(page, 'lineup');
        await lineupBox(page).locator('.lineup-needs-sleeper summary').click();
        await expect(lineupBox(page).locator('.lineup-needs-sleeper-text')).toHaveText('Start Puka Nacua, Brock Bowers · Bench George Kittle, Garrett Wilson');
        await expectClean(page, state);
    });

    // A lineup opened on the Lineup tab after the kickoff is rebuilt too, and your locks stay as they were.
    test('the Lineup tab rebuilds a lineup saved before the kickoff; your locks stay', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, sleeperStarters: SLEEPER });
        await seedTwoLeagues(page);
        await page.locator('#headerLeagueSelect').selectOption(FIXTURE_LEAGUE_ID);
        // You locked Bowers in; then Cincinnati kicks off.
        await page.evaluate(async ({ leagueId, past, later }) => {
            const { State } = await import('/js/mls/state.js');
            State.lockedPlayersMap[leagueId] = ['11604'];
            State.gameTimesByTeam = { ...State.gameTimesByTeam, CIN: past, LV: later, NYJ: later, SF: later, LAR: later };
        }, { leagueId: FIXTURE_LEAGUE_ID, past: PAST, later: LATER });
        await showTab(page, 'lineup');
        const lineup = (await page.locator('#optimalLineupContainer .lineup-slot').allTextContents()).join(' ');
        expect(lineup).toContain('Brock Bowers');
        expect(lineup).not.toContain("Ja'Marr Chase");
        expect(await page.evaluate(async (id) => (await import('/js/mls/state.js')).State.lockedPlayersMap[id], FIXTURE_LEAGUE_ID)).toEqual(['11604']);
        await lineupBox(page).locator('.lineup-needs-sleeper summary').click();
        await expect(lineupBox(page).locator('.lineup-needs-sleeper-text')).toHaveText('Start Puka Nacua, Brock Bowers · Bench George Kittle, Garrett Wilson');
        await expectClean(page, state);
    });
    // The other kickoff-blind parts of a card: an Out player still in your Sleeper lineup stops being urgent once his
    // game has started (Sleeper has locked him in), and EARLY goes once the early game has started.
    test('after his game starts, an Out player on Sleeper no longer needs you, and EARLY goes', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page, { chaseInIrSlot: false, lamarDoubtful: false, injuries: { [KITTLE]: 'Out' }, sleeperStarters: SLEEPER });
        await seedTwoLeagues(page);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.earlyTeams = ['BUF'];
        });
        await kickoffs(page, { BUF: LATER, SF: LATER });
        const fixture = card(page, 'Fixture League');
        await expect(fixture).toHaveClass(/\bneeds-you\b/);
        await expect(fixture.locator('.early-badge')).toHaveCount(1);
        // Buffalo's (Josh Allen's) and San Francisco's (Kittle's) games have started.
        await kickoffs(page, { BUF: PAST, SF: PAST });
        await expect(fixture).not.toHaveClass(/\bneeds-you\b/);
        await expect(fixture.locator('.mls-needs-hurt')).toHaveCount(0);
        await expect(fixture.locator('.early-badge')).toHaveCount(0);
        // Kittle is locked into the TE slot now, so Bowers no longer has one: only the WR change is left.
        expect(await lineSummaries(page)).toEqual(["Fixture League: Start Ja'Marr Chase · Bench Garrett Wilson"]);
        await expectClean(page, state);
    });
});
