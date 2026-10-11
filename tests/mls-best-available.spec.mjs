// Lineup Strategist Dashboard: "Best available in your leagues" (improvements S5,
// js/mls/scout/bestAvailable.js). Since S12 a section of each Sleeper-synced league's card in the League
// Command Center (js/mls/render/leagueCards.js): its top 3 available RB/WR/TE by that league's own Weekly or
// ROS rankings (a switch above the cards that is the Waiver Wire Assistant's Rank By), an upgrade when a free
// agent is ranked ahead of your weakest player at his position, open when the league has an upgrade and folded
// otherwise, and a View button that opens that league's Top Available. Manual leagues' cards say why they have
// none. The card's status row counts its upgrades, so a folded card still shows them.
//
// An upgrade (upgradeGap, unit-tested in tests/unit/waiverScanner.test.mjs) needs a better tier when both
// players are tiered; rankings-waivers.csv has a Tier column, so these files move tiers with ranks.
// On Weekly (round 7) a free agent is an upgrade when he'd start in your best lineup (built from your
// roster by the optimizer's rules), measured against the starter he'd push out; on ROS, against your
// weakest rostered player.
//
// Leagues (served with one RB slot, oneRbSlot below: the fixture team has a single RB, so with
// Sleeper's two RB slots every free RB would "fill an empty lineup spot", which its own test covers):
// - Fixture League (synced). Your best lineup: RB Derrick Henry, WR Ja'Marr Chase and Justin Jefferson,
//   TE Brock Bowers, FLEX CeeDee Lamb. Your weakest rostered WR is Garrett Wilson, TE George Kittle.
//   Free RB/WR/TE: James Cook, Jaxon Smith-Njigba, Chase Brown, Zay Flowers, Sam LaPorta.
//   - rankings-waivers.csv (its ROS set here): no free agent beats your weakest (Cook RB8 < Henry RB5).
//   - SAME_TIER_CSV: Cook RB5 would start over Henry RB8, but both are tier 3, so it's no upgrade.
//   - UPGRADE_CSV (its Weekly set here): Cook RB5 tier 3 starts over Henry RB8 tier 4, a gap of 3.
//   - NO_WILSON_CSV: Wilson missing (like a Questionable player the analyst expects to sit). Weekly
//     doesn't compare with him (he's on your bench); ROS does, as your weakest rostered WR.
// - Second League: a copy of the fixture league written straight into storage (only one Sleeper
//   fixture league exists, and this one is never synced), last synced 4 days ago. Weekly only, as
//   legacy per-league data: rankings-waivers.csv with Zay Flowers/CeeDee Lamb and Sam LaPorta/Brock
//   Bowers swapped (tiers too). Your best lineup there has Puka Nacua at FLEX and Trey McBride at TE,
//   so it has two upgrades: Flowers WR3 over Nacua WR4 and LaPorta TE1 over McBride TE2 (gap 1
//   each). With ROS picked it falls back to its Weekly rankings and
//   says so. Flowers is listed as Questionable by Sleeper here.
// - Manual League: no best available, with a line saying so in its card.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, RANKINGS_CSV, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

// The fixture lines are "15,Derrick Henry,RB,BAL,3,7" and "26,James Cook,RB,BUF,4,7" (Rank,Player,Pos,Team,Tier,Bye).
const withCookAndHenry = (cook, henry) => WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL,3,7', henry)
    .replace('26,James Cook,RB,BUF,4,7', cook);
const UPGRADE_CSV = withCookAndHenry('15,James Cook,RB,BUF,3,7', '26,Derrick Henry,RB,BAL,4,7');
const SAME_TIER_CSV = withCookAndHenry('15,James Cook,RB,BUF,3,7', '26,Derrick Henry,RB,BAL,3,7');
// Jaxon Smith-Njigba (a free agent) up to 4th, tier 1; CeeDee Lamb (yours) tier 2 (S12 round 3's kickoff test).
const JSN_CSV = WAIVER_RANKINGS_CSV
    .replace('4,Jahmyr Gibbs,RB,DET,1,8', '4,Jaxon Smith-Njigba,WR,SEA,1,8')
    .replace('27,Jaxon Smith-Njigba,WR,SEA,4,8', '27,Jahmyr Gibbs,RB,DET,4,8')
    .replace('5,CeeDee Lamb,WR,DAL,1,10', '5,CeeDee Lamb,WR,DAL,2,10');
const NO_WILSON_CSV = WAIVER_RANKINGS_CSV.replace('21,Garrett Wilson,WR,NYJ,4,9\n', '');
const LEAGUE_JSON = readFileSync(new URL('./fixtures/sleeper/league.json', import.meta.url), 'utf8');
const PLAYERS_JSON = readFileSync(new URL('./fixtures/sleeper/players-nfl.json', import.meta.url), 'utf8');
const SECOND_LEAGUE_ID = '1000000000000000002';

const commandCenter = (page) => page.locator('#dashboardCommandCenter');
const summary = (page) => page.locator('#bestAvailableSummary');
const leagueCard = (page, name) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('.mls-lc-name', { hasText: name }) });
const line = (page, name) => leagueCard(page, name).locator('.mls-lc-ba');
const fold = (page, name) => line(page, name).locator('details.mls-ba-fold');
// A card with nothing to do starts folded (S12 round 4): open the card first, then its best available.
const openFold = async (page, name) => {
    const cardFold = leagueCard(page, name).locator('[data-action="toggleLeagueCard"]');
    if ((await cardFold.getAttribute('aria-expanded')) === 'false') await cardFold.click();
    if (!(await fold(page, name).evaluate(d => d.open))) await fold(page, name).locator('summary').click();
    await expect(fold(page, name)).toHaveAttribute('open', '');
};
const names = (page, name) => line(page, name).locator('.mls-ba-name').allInnerTexts();
// The leagues whose best available is open (has an upgrade, or opened by hand), in card order.
const openLeagues = (page) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('details.mls-ba-fold[open]') }).locator('.mls-lc-name');
const upgradeCount = (page, name) => leagueCard(page, name).locator('.mls-lc-count-upgrades');
const basisBtn = (page, b) => page.locator(`#bestAvailableBasis [data-action="setBestAvailableBasis"][data-basis="${b}"]`);
const MANUAL_NOTE = "No best available here: in a manual league the app only knows your own roster, not who's on the waiver wire.";

async function upload(page, inputId, csv, count) {
    await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

// Serves the fixture league with one RB slot instead of Sleeper's two (see the header). Call after openApp.
async function oneRbSlot(page) {
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => {
        const league = JSON.parse(LEAGUE_JSON);
        league.roster_positions.splice(league.roster_positions.indexOf('RB'), 1);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(league) });
    });
}

async function createManualLeague(page, name) {
    await page.locator('#newLeagueName').evaluate((el, v) => { el.value = v; }, name);
    await callApp(page, 'createManualLeague');
}

test.describe('Lineup Strategist Best available in your leagues', () => {
    test('empty states, manual leagues left out, and Sync All redraws', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await oneRbSlot(page);
        await showTab(page, 'setup');
        // No leagues: no Command Center at all (the Setup progress card says where to start).
        await expect(commandCenter(page)).toBeHidden();

        // Only a manual league: its card says why it has no best available, and there's no switch.
        await createManualLeague(page, 'Manual League');
        await expect(commandCenter(page)).toBeVisible();
        await expect(line(page, 'Manual League')).toHaveText(MANUAL_NOTE);
        await expect(basisBtn(page, 'weekly')).toBeHidden();

        // A synced league with no rankings: say where to upload; with no ranked league, it shows unfolded.
        await seedMls(page);
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(summary(page)).toHaveText('1 league without rankings');
        await expect(basisBtn(page, 'weekly')).toBeVisible();
        await expect(page.locator('#leagueCards .mls-ba-fold')).toHaveCount(1);
        await expect(line(page, 'Manual League')).toHaveText(MANUAL_NOTE);
        await expect(fold(page, 'Fixture League')).toHaveAttribute('open', '');
        await expect(fold(page, 'Fixture League').locator('summary .mls-ba-source')).toHaveText('No rankings');
        await expect(line(page, 'Fixture League')).toContainText('Upload Weekly rankings on the Lineup tab (or ROS on the Roster tab) with this league active.');
        await line(page, 'Fixture League').locator('[data-action="bestAvailableUpload"]').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);

        // Every player rankings.csv ranks is rostered in the fixture league: no upgrade, so its line folds.
        await loadMlsRankings(page, RANKINGS_CSV, 24);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await expect(fold(page, 'Fixture League')).not.toHaveAttribute('open', '');
        await expect(fold(page, 'Fixture League').locator('.mls-ba-flag')).toHaveText('No upgrade');
        await expect(upgradeCount(page, 'Fixture League')).toBeHidden();
        await openFold(page, 'Fixture League');
        await expect(line(page, 'Fixture League')).toContainText('Every RB, WR and TE in its Weekly rankings (20 ranked) is already rostered in this league.');
        await expect(line(page, 'Fixture League').locator('[data-action="viewLeagueTopAvailable"]')).toBeVisible();

        // rankings-waivers.csv has free agents, but none ahead of your weakest; the line still lists the best three.
        await showTab(page, 'lineup');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        // Opened by hand, it stays open across redraws.
        await expect(fold(page, 'Fixture League')).toHaveAttribute('open', '');
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(line(page, 'Fixture League').locator('.mls-ta-pos')).toHaveText(['RB8', 'WR11', 'RB9']);
        await expect(line(page, 'Fixture League').locator('.is-upgrade')).toHaveCount(0);
        // Synced today: nothing to say (S12 round 4 shows the sync only when it's old or failed). Every line links to
        // the league in Sleeper.
        await expect(leagueCard(page, 'Fixture League').locator('.mls-lc-meta')).toHaveText('Redraft 1QB PPR');
        await expect(line(page, 'Fixture League').locator('a.mls-ba-sleeper')).toHaveAttribute('href', `https://sleeper.com/leagues/${FIXTURE_LEAGUE_ID}`);
        await expect(line(page, 'Fixture League').locator('a.mls-ba-sleeper')).toHaveAttribute('target', '_blank');
        // Desktop only: on phones the link would open the Sleeper app's home, not the league.
        if (test.info().project.name === 'phone') await expect(line(page, 'Fixture League').locator('a.mls-ba-sleeper')).toBeHidden();
        else await expect(line(page, 'Fixture League').locator('a.mls-ba-sleeper')).toBeVisible();

        // A bench WR the Weekly sheet leaves out (Wilson, like a Questionable player expected to sit) isn't
        // what Weekly compares with: nobody beats your starters. ROS still compares with your weakest
        // rostered WR, and he is unranked there.
        await showTab(page, 'lineup');
        await loadMlsRankings(page, NO_WILSON_CSV, 29);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await basisBtn(page, 'ros').click();
        await expect(summary(page)).toHaveText('Upgrades in 1 of 1 league');
        await expect(upgradeCount(page, 'Fixture League')).toHaveText('1 upgrade');
        await expect(line(page, 'Fixture League').locator('.mls-ba-over')).toHaveText(['over Garrett Wilson (unranked)']);
        await basisBtn(page, 'weekly').click();
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');

        // Would start, but the same tier: no upgrade (and the 3-spot gap doesn't override the tiers).
        await showTab(page, 'lineup');
        await loadMlsRankings(page, SAME_TIER_CSV, 30);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await openFold(page, 'Fixture League');
        await expect(line(page, 'Fixture League').locator('.mls-ta-pos')).toHaveText(['RB5', 'WR11', 'RB9']);
        await expect(line(page, 'Fixture League').locator('.is-upgrade')).toHaveCount(0);

        // Sync All redraws the cards.
        await page.click('#syncAllBtn');
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await expect(line(page, 'Manual League')).toHaveText(MANUAL_NOTE);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('upgrades open and counted, the Weekly/ROS switch, View and a folded card', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Sleeper lists Zay Flowers as Questionable (registered after openApp's routes, so it runs first).
        await page.route(/api\.sleeper\.app\/v1\/players\/nfl$/, (route) => {
            const players = JSON.parse(PLAYERS_JSON);
            players['9997'].injury_status = 'Questionable';
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(players) });
        });
        await oneRbSlot(page);
        await seedMls(page);
        await createManualLeague(page, 'Manual League');
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        // Fixture League: ROS has no upgrade, Weekly does.
        await upload(page, 'rosFileInput', WAIVER_RANKINGS_CSV, 30);
        await upload(page, 'weeklyFileInput', UPGRADE_CSV, 30);

        // Second League: a synced copy of the fixture league with its own (legacy) Weekly rankings.
        await page.evaluate(({ secondId, syncedAt }) => {
            const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
            const fixture = leagues.find(l => l.leagueId === '1000000000000000001');
            const rosSet = JSON.parse(localStorage.getItem('mls_ranking_sets_ros')).find(s => s.id === fixture.rosRankingSetId);
            const weekly = rosSet.data.map(r => ({ ...r }));
            const swap = (a, b) => {
                const x = weekly.find(r => r.name === a), y = weekly.find(r => r.name === b);
                for (const k of ['rank', 'posRank', 'flexRank', 'tier', 'posTier', 'flexTier']) [x[k], y[k]] = [y[k], x[k]];
            };
            swap('Zay Flowers', 'CeeDee Lamb');
            swap('Sam LaPorta', 'Brock Bowers');
            leagues.push({ ...fixture, leagueId: secondId, name: 'Second League', lastSyncedAt: syncedAt, weeklyRankingSetId: null, rosRankingSetId: null, weeklyRankings: weekly, rosRankings: [] });
            localStorage.setItem('mls_leagues', JSON.stringify(leagues));
        }, { secondId: SECOND_LEAGUE_ID, syncedAt: FIXED_NOW.getTime() - 4 * 86400000 });
        await page.reload();
        await showTab(page, 'setup');

        // Weekly (the default Rank By): both leagues have an upgrade, so both lines are open; the manual league has none.
        await expect(basisBtn(page, 'weekly')).toHaveAttribute('aria-pressed', 'true');
        await expect(summary(page)).toHaveText('Upgrades in 2 of 2 leagues');
        await expect(openLeagues(page)).toHaveText(['Fixture League', 'Second League']);
        await expect(upgradeCount(page, 'Fixture League')).toHaveText('1 upgrade');
        await expect(upgradeCount(page, 'Second League')).toHaveText('2 upgrades');
        await expect(line(page, 'Manual League')).toHaveText(MANUAL_NOTE);

        const fixture = line(page, 'Fixture League');
        const second = line(page, 'Second League');
        await expect(fixture.locator('.mls-ba-source')).toHaveText('9/15/2026');
        await expect(leagueCard(page, 'Fixture League').locator('.mls-lc-meta .freshness-stale')).toHaveCount(0);
        // The upgrade is marked inside the list (no name twice): Cook, then the best of the rest.
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(fixture.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['RB5', 'WR11', 'RB9']);
        await expect(fixture.locator('.mls-ta-pos').first()).toHaveClass(/\bpos-badge\b.*\bRB\b/);
        await expect(fixture.locator('.is-upgrade .mls-ba-name')).toHaveText(['James Cook']);
        await expect(fixture.locator('.mls-ba-over')).toHaveText(['over Derrick Henry RB8']);
        // Two upgrades, biggest first, then the best of the rest; an injury badge; an old sync is flagged in the header.
        // A legacy upload has no set name, and the switch already says Weekly (S12 round 4).
        await expect(second.locator('.mls-ba-source')).toHaveText('');
        await expect(leagueCard(page, 'Second League').locator('.mls-lc-meta .freshness-stale')).toHaveText('Synced 4 days ago');
        expect(await names(page, 'Second League')).toEqual(['Zay Flowers', 'Sam LaPorta', 'James Cook']);
        await expect(second.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['WR3', 'TE1', 'RB8']);
        await expect(second.locator('.mls-ba-over')).toHaveText(['over Puka Nacua WR4', 'over Trey McBride TE2']);
        await expect(second.locator('.mls-ba-player').first().locator('.inj-badge')).toHaveText('Q');
        await expect(second.locator('a.mls-ba-sleeper')).toHaveAttribute('href', `https://sleeper.com/leagues/${SECOND_LEAGUE_ID}`);

        // Dismiss: Cook leaves Fixture League's line; Chase Brown (RB9 tier 5) doesn't beat Henry (RB8 tier 4),
        // so the league has no upgrade left and folds. Restore brings him back; so does a new NFL week.
        await fixture.getByRole('button', { name: /^Not interested in James Cook/ }).click();
        await expect(summary(page)).toHaveText('Upgrades in 1 of 2 leagues');
        await expect(openLeagues(page)).toHaveText(['Second League']);
        await expect(upgradeCount(page, 'Fixture League')).toBeHidden();
        await openFold(page, 'Fixture League');
        expect(await names(page, 'Fixture League')).toEqual(['Jaxon Smith-Njigba', 'Chase Brown', 'Zay Flowers']);
        await expect(fixture.locator('.mls-ba-dismissed')).toHaveText('1 dismissed this week · Restore');
        // Only this league: Cook still shows in Second League.
        expect(await names(page, 'Second League')).toContain('James Cook');
        // Kept across a reload.
        await page.reload();
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 1 of 2 leagues');
        await openFold(page, 'Fixture League');
        await fixture.locator('[data-action="restoreBestAvailable"]').click();
        await expect(summary(page)).toHaveText('Upgrades in 2 of 2 leagues');
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(fixture.locator('.mls-ba-dismissed')).toHaveCount(0);
        expect(await page.evaluate(() => localStorage.getItem('mls_best_available_dismissed'))).toBeNull();
        // A dismissal from an earlier week is cleared on the next load (this week is 2026 week 2).
        await page.evaluate(() => localStorage.setItem('mls_best_available_dismissed', JSON.stringify({ '1000000000000000001': { week: '2026:1', players: ['jamescook'] } })));
        await page.reload();
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 2 of 2 leagues');
        await expect(fixture.locator('.mls-ba-dismissed')).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('mls_best_available_dismissed'))).toBeNull();

        // ROS: Fixture League's ROS set has no upgrade, so it folds; Second League has no ROS and falls back.
        await basisBtn(page, 'ros').click();
        await expect(basisBtn(page, 'ros')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#waiverScanBasis')).toHaveValue('ros');
        await expect(summary(page)).toHaveText('Upgrades in 1 of 2 leagues');
        await expect(openLeagues(page)).toHaveText(['Second League']);
        await expect(second.locator('.mls-ba-source')).toHaveText('Weekly (no ROS set)');
        await expect(fold(page, 'Fixture League').locator('.mls-ba-flag')).toHaveText('No upgrade');
        await openFold(page, 'Fixture League');
        await expect(fixture.locator('.mls-ba-source')).toHaveText('9/15/2026');
        await expect(fixture.locator('.is-upgrade')).toHaveCount(0);
        await expect(fixture.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['RB8', 'WR11', 'RB9']);

        // Drawing every line didn't change the active league.
        expect(await page.locator('#headerLeagueSelect').inputValue()).toBe(FIXTURE_LEAGUE_ID);

        // Folding a league's card (S12; the Best Available card's collapse before): its line hides, its upgrade
        // count stays in the header, and it's remembered after a reload (so is ROS).
        const secondCard = leagueCard(page, 'Second League');
        const toggle = secondCard.locator('[data-action="toggleLeagueCard"]');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(second).toBeHidden();
        await expect(upgradeCount(page, 'Second League')).toHaveText('2 upgrades');
        await page.reload();
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 1 of 2 leagues');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(second).toBeHidden();
        await toggle.click();
        await expect(second).toBeVisible();

        // View: switches to that league and opens its Top Available filtered like the line (same rankings,
        // FLEX chip), even from another mode and another chip.
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverPos', 'QB');
        await second.locator('[data-action="viewLeagueTopAvailable"]').click();
        await expect(page.locator('#scoutTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#waiverModeToggle [data-mode="top"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Second League');
        await expect(page.locator('#waiverPosChips [data-pos="FLEX"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#waiverOutput')).toContainText('Top available RB/WR/TE in Second League by Weekly rank');
        await expect(page.locator('#waiverOutput')).toContainText('No ROS rankings loaded for this league - using Weekly rank instead.');

        // Back on the Dashboard, Weekly again: the lines redraw and don't depend on the active league.
        await showTab(page, 'setup');
        await basisBtn(page, 'weekly').click();
        await expect(openLeagues(page)).toHaveText(['Fixture League', 'Second League']);
        await expect(page.locator('#waiverScanBasis')).toHaveValue('weekly');

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('Weekly: a free agent who fills an empty starting spot', async ({ page }) => {
        // Sleeper's own two RB slots, and the fixture team has one RB: any ranked free RB starts.
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 1 of 1 league');
        await expect(fold(page, 'Fixture League')).toHaveAttribute('open', '');
        const fixture = line(page, 'Fixture League');
        await expect(fixture.locator('.is-upgrade .mls-ba-name')).toHaveText(['James Cook']);
        await expect(fixture.locator('.mls-ba-over')).toHaveText(['fills an empty lineup spot']);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    // S12 round 3 (the owner's "How I Met Your Punter": the Dashboard said "Mike Washington over Zay Flowers" where
    // Auto-Find said "replaces George Kittle"). The card builds your best lineup from the whole roster, and it counted
    // every player whose game had kicked off as locked in, bench players too (Chris Godwin, Thursday). A player whose
    // game has started stays where he is on Sleeper: in the lineup if he started, out of it if he didn't.
    test('Weekly: a benched player whose game has started is not put in your lineup', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await oneRbSlot(page);
        await seedMls(page);
        // Jaxon Smith-Njigba (a free agent) WR3, tier 1, ahead of CeeDee Lamb (your FLEX) WR4, tier 2.
        await loadMlsRankings(page, JSN_CSV, 30);
        await showTab(page, 'setup');
        await expect(line(page, 'Fixture League').locator('.mls-ba-over')).toHaveText(['over CeeDee Lamb WR4']);
        // Puka Nacua (LAR, on your bench) has played. He can't move into your lineup now, so the answer stands.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.gameTimesByTeam = { ...State.gameTimesByTeam, LAR: '2026-09-15T12:00:00Z' };
        });
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(line(page, 'Fixture League').locator('.mls-ba-over')).toHaveText(['over CeeDee Lamb WR4']);
        await expectClean(page, state);
    });

    // S12 round 4: free agents who'd each push out the same player are options for one spot, not separate upgrades.
    // No tiers, overall = FLEX rank. Your FLEX is Puka Nacua (20th); James Cook (3rd, RB) and Sam LaPorta (4th, TE)
    // would each start and leave Nacua out. (Jaxon Smith-Njigba, 8th, would too, but WR3 over WR4 is one spot, under
    // the 3 S5's rule asks for without tiers, so he's listed without the up arrow.)
    test('upgrades that would all replace the same player count once, said once', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await oneRbSlot(page);
        await seedMls(page);
        const rows = ["Ja'Marr Chase,WR", 'Justin Jefferson,WR', 'James Cook,RB', 'Sam LaPorta,TE', 'Derrick Henry,RB', 'Brock Bowers,TE',
            'Josh Allen,QB', 'Jaxon Smith-Njigba,WR', 'Puka Nacua,WR', 'CeeDee Lamb,WR', 'Amon-Ra St. Brown,WR', 'A.J. Brown,WR',
            'Trey McBride,TE', 'Garrett Wilson,WR', 'George Kittle,TE'];
        // Nacua 20th, the rest in order.
        const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 20, 21, 22, 23, 24, 25, 26];
        const csv = 'Rank,Player,Pos\n' + rows.map((r, i) => `${ranks[i]},${r}`).join('\n') + '\n';
        await loadMlsRankings(page, csv, rows.length);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 1 of 1 league');
        await expect(upgradeCount(page, 'Fixture League')).toHaveText('1 upgrade');
        const fixture = line(page, 'Fixture League');
        await expect(fixture.locator('.mls-ba-shared')).toHaveText('2 options for one spot: each over Puka Nacua WR4');
        await expect(fixture.locator('.is-upgrade .mls-ba-name')).toHaveText(['James Cook', 'Sam LaPorta']);
        await expect(fixture.locator('.mls-ba-over')).toHaveCount(0);
        await expectClean(page, state);
    });
});
