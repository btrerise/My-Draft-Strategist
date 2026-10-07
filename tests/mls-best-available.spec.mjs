// Lineup Strategist Dashboard: "Best available in your leagues" (improvements S5,
// js/mls/scout/bestAvailable.js). One line per Sleeper-synced league with its top 3 available
// RB/WR/TE by that league's own Weekly or ROS rankings (a switch that is the Waiver Wire Assistant's
// Rank By), an upgrade when a free agent is ranked ahead of your weakest player at his position,
// leagues with the biggest upgrade first, the rest folded, and a View button that opens that league's
// Top Available. Manual leagues are left out. The card collapses and remembers it.
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
//   each). It sorts after Fixture League. With ROS picked it falls back to its Weekly rankings and
//   says so. Flowers is listed as Questionable by Sleeper here.
// - Manual League: left out, with a line saying so.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, RANKINGS_CSV, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

// The fixture lines are "15,Derrick Henry,RB,BAL,3,7" and "26,James Cook,RB,BUF,4,7" (Rank,Player,Pos,Team,Tier,Bye).
const withCookAndHenry = (cook, henry) => WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL,3,7', henry)
    .replace('26,James Cook,RB,BUF,4,7', cook);
const UPGRADE_CSV = withCookAndHenry('15,James Cook,RB,BUF,3,7', '26,Derrick Henry,RB,BAL,4,7');
const SAME_TIER_CSV = withCookAndHenry('15,James Cook,RB,BUF,3,7', '26,Derrick Henry,RB,BAL,3,7');
const NO_WILSON_CSV = WAIVER_RANKINGS_CSV.replace('21,Garrett Wilson,WR,NYJ,4,9\n', '');
const LEAGUE_JSON = readFileSync(new URL('./fixtures/sleeper/league.json', import.meta.url), 'utf8');
const PLAYERS_JSON = readFileSync(new URL('./fixtures/sleeper/players-nfl.json', import.meta.url), 'utf8');
const SECOND_LEAGUE_ID = '1000000000000000002';

const card = (page) => page.locator('#dashboardBestAvailable');
const summary = (page) => page.locator('#bestAvailableSummary');
const line = (page, name) => card(page).locator('.mls-ba-line').filter({ has: page.locator('.mls-ba-league', { hasText: name }) });
const names = (page, name) => line(page, name).locator('.mls-ba-name').allInnerTexts();
const more = (page) => card(page).locator('details.mls-ba-more');
const leaguesAboveFold = (page) => card(page).locator('.mls-ba-list').first().locator('.mls-ba-league');
const basisBtn = (page, b) => card(page).locator(`[data-action="setBestAvailableBasis"][data-basis="${b}"]`);

async function upload(page, inputId, csv, count) {
    await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
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
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('No leagues yet. Sync a Sleeper league or import all of yours under Add/Sync League below');

        // Only a manual league: nothing to show, and the card says why.
        await createManualLeague(page, 'Manual League');
        await expect(summary(page)).toHaveText('No Sleeper-synced leagues');
        await expect(card(page)).toContainText("Best available needs a league synced from Sleeper. Manual leagues only know your own roster, not who's on the waiver wire.");
        await expect(basisBtn(page, 'weekly')).toHaveCount(0);

        // A synced league with no rankings: say where to upload; with no ranked league, nothing is folded.
        await seedMls(page);
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(summary(page)).toHaveText('1 league without rankings');
        await expect(card(page).locator('.mls-ba-league')).toHaveText(['Fixture League']);
        await expect(card(page).locator('.mls-ba-excluded')).toHaveText("1 manual league not included: the app only knows your own roster there, not who's on the waiver wire.");
        await expect(more(page)).toHaveCount(0);
        await expect(line(page, 'Fixture League')).toContainText('Upload Weekly rankings on the Lineup tab (or ROS on the Roster tab) with this league active.');
        await line(page, 'Fixture League').locator('[data-action="bestAvailableUpload"]').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);

        // Every player rankings.csv ranks is rostered in the fixture league: no upgrade, so the line folds.
        await loadMlsRankings(page, RANKINGS_CSV, 24);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await expect(card(page).locator('.mls-ba-none')).toHaveText('No free agent is ranked ahead of your weakest RB, WR or TE in any league.');
        await expect(line(page, 'Fixture League')).toBeHidden();
        await expect(more(page).locator('summary')).toHaveText('Show 1 league', { useInnerText: true });
        await more(page).locator('summary').click();
        await expect(more(page).locator('summary')).toHaveText('Hide 1 league', { useInnerText: true });
        await expect(line(page, 'Fixture League')).toContainText('Every RB, WR and TE in its Weekly rankings (20 ranked) is already rostered in this league.');
        await expect(line(page, 'Fixture League').locator('[data-action="viewLeagueTopAvailable"]')).toBeVisible();

        // rankings-waivers.csv has free agents, but none ahead of your weakest; the line still lists the best three.
        await showTab(page, 'lineup');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await more(page).locator('summary').click();
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(line(page, 'Fixture League').locator('.mls-ta-pos')).toHaveText(['RB8', 'WR11', 'RB9']);
        await expect(line(page, 'Fixture League').locator('.is-upgrade')).toHaveCount(0);
        // Synced today: no sync note. Every line links to the league in Sleeper.
        await expect(line(page, 'Fixture League').locator('.mls-ba-sync')).toHaveCount(0);
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
        await expect(line(page, 'Fixture League').locator('.mls-ba-over')).toHaveText(['over Garrett Wilson (unranked)']);
        await basisBtn(page, 'weekly').click();
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');

        // Would start, but the same tier: no upgrade (and the 3-spot gap doesn't override the tiers).
        await showTab(page, 'lineup');
        await loadMlsRankings(page, SAME_TIER_CSV, 30);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await more(page).locator('summary').click();
        await expect(line(page, 'Fixture League').locator('.mls-ta-pos')).toHaveText(['RB5', 'WR11', 'RB9']);
        await expect(line(page, 'Fixture League').locator('.is-upgrade')).toHaveCount(0);

        // Sync All redraws the card.
        await page.click('#syncAllBtn');
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await expect(card(page).locator('.mls-ba-excluded')).toBeVisible();

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('upgrades first by size, the Weekly/ROS switch, View and collapse', async ({ page }) => {
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

        // Weekly (the default Rank By): both leagues have an upgrade, biggest first; the manual league is left out.
        await expect(basisBtn(page, 'weekly')).toHaveAttribute('aria-pressed', 'true');
        await expect(summary(page)).toHaveText('Upgrades in 2 of 2 leagues');
        await expect(card(page)).toContainText('Each league by its own Weekly rankings. Ownership is from the last sync: Sync All Leagues refreshes it.');
        await expect(leaguesAboveFold(page)).toHaveText(['Fixture League', 'Second League']);
        await expect(more(page)).toHaveCount(0);
        await expect(line(page, 'Manual League')).toHaveCount(0);
        await expect(card(page).locator('.mls-ba-excluded')).toHaveText("1 manual league not included: the app only knows your own roster there, not who's on the waiver wire.");

        const fixture = line(page, 'Fixture League');
        const second = line(page, 'Second League');
        await expect(fixture.locator('.mls-ba-source')).toHaveText('Weekly · 9/15/2026');
        await expect(fixture.locator('.mls-ba-sync')).toHaveCount(0);
        // The upgrade is marked inside the list (no name twice): Cook, then the best of the rest.
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(fixture.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['RB5', 'WR11', 'RB9']);
        await expect(fixture.locator('.mls-ta-pos').first()).toHaveClass(/\bpos-badge\b.*\bRB\b/);
        await expect(fixture.locator('.is-upgrade .mls-ba-name')).toHaveText(['James Cook']);
        await expect(fixture.locator('.mls-ba-over')).toHaveText(['over Derrick Henry RB8']);
        // Two upgrades, biggest first, then the best of the rest; an injury badge; an old sync is flagged.
        await expect(second.locator('.mls-ba-source')).toHaveText('Weekly');
        await expect(second.locator('.mls-ba-sync')).toHaveText('Synced 4 days ago');
        expect(await names(page, 'Second League')).toEqual(['Zay Flowers', 'Sam LaPorta', 'James Cook']);
        await expect(second.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['WR3', 'TE1', 'RB8']);
        await expect(second.locator('.mls-ba-over')).toHaveText(['over Puka Nacua WR4', 'over Trey McBride TE2']);
        await expect(second.locator('.mls-ba-player').first().locator('.inj-badge')).toHaveText('Q');
        await expect(second.locator('a.mls-ba-sleeper')).toHaveAttribute('href', `https://sleeper.com/leagues/${SECOND_LEAGUE_ID}`);

        // Dismiss: Cook leaves Fixture League's line; Chase Brown (RB9 tier 5) doesn't beat Henry (RB8 tier 4),
        // so the league has no upgrade left and folds. Restore brings him back; so does a new NFL week.
        await fixture.getByRole('button', { name: /^Not interested in James Cook/ }).click();
        await expect(summary(page)).toHaveText('Upgrades in 1 of 2 leagues');
        await expect(leaguesAboveFold(page)).toHaveText(['Second League']);
        await more(page).locator('summary').click();
        expect(await names(page, 'Fixture League')).toEqual(['Jaxon Smith-Njigba', 'Chase Brown', 'Zay Flowers']);
        await expect(fixture.locator('.mls-ba-dismissed')).toHaveText('1 dismissed this week · Restore');
        // Only this league: Cook still shows in Second League.
        expect(await names(page, 'Second League')).toContain('James Cook');
        // Kept across a reload.
        await page.reload();
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 1 of 2 leagues');
        await more(page).locator('summary').click();
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
        await expect(card(page)).toContainText('Each league by its own ROS rankings.');
        await expect(leaguesAboveFold(page)).toHaveText(['Second League']);
        await expect(second.locator('.mls-ba-source')).toHaveText('Weekly (no ROS set)');
        await expect(more(page).locator('summary')).toHaveText('Show 1 more league', { useInnerText: true });
        await more(page).locator('summary').click();
        await expect(fixture.locator('.mls-ba-source')).toHaveText('ROS · 9/15/2026');
        await expect(fixture.locator('.is-upgrade')).toHaveCount(0);
        await expect(fixture.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['RB8', 'WR11', 'RB9']);

        // Drawing every line didn't change the active league.
        expect(await page.locator('#headerLeagueSelect').inputValue()).toBe(FIXTURE_LEAGUE_ID);

        // Collapse: the summary stays, the lines hide, and it's remembered after a reload (so is ROS).
        const toggle = card(page).locator('[data-action="toggleBestAvailable"]');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(second).toBeHidden();
        await expect(summary(page)).toBeVisible();
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

        // Back on the Dashboard, Weekly again: the card redraws and doesn't depend on the active league.
        await showTab(page, 'setup');
        await basisBtn(page, 'weekly').click();
        await expect(leaguesAboveFold(page)).toHaveText(['Fixture League', 'Second League']);
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
        const fixture = line(page, 'Fixture League');
        await expect(fixture.locator('.is-upgrade .mls-ba-name')).toHaveText(['James Cook']);
        await expect(fixture.locator('.mls-ba-over')).toHaveText(['fills an empty lineup spot']);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
