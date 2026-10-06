// Lineup Strategist Dashboard: "Best available in your leagues" (improvements S5,
// js/mls/scout/bestAvailable.js). One line per Sleeper-synced league with its top 3 available
// RB/WR/TE by that league's own Weekly or ROS rankings (a switch that is the Waiver Wire Assistant's
// Rank By), an upgrade when a free agent is ranked ahead of your weakest player at his position,
// leagues with the biggest upgrade first, the rest folded, and a View button that opens that league's
// Top Available. Manual leagues are left out. The card collapses and remembers it.
//
// Leagues:
// - Fixture League (synced). Your RB is Derrick Henry, your weakest WR Garrett Wilson, your weakest TE
//   George Kittle (the fixture alternates players between the two teams). Free RB/WR/TE: James Cook,
//   Jaxon Smith-Njigba, Chase Brown, Zay Flowers, Sam LaPorta.
//   - rankings-waivers.csv (its ROS set here): no free agent beats your weakest (Cook RB8 < Henry RB5).
//   - UPGRADE_CSV (its Weekly set here; Cook and Henry swapped): Cook RB5 beats Henry RB8, a gap of 3.
// - Second League: a copy of the fixture league written straight into storage (only one Sleeper
//   fixture league exists, and this one is never synced). Weekly only, as legacy per-league data:
//   rankings-waivers.csv with Zay Flowers and Garrett Wilson swapped, so Flowers WR10 beats Wilson
//   WR12, a gap of 2. With ROS picked it falls back to its Weekly rankings and says so.
// - Manual League: left out, with a line saying so.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const UPGRADE_CSV = WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL', '26,Derrick Henry,RB,BAL')
    .replace('26,James Cook,RB,BUF', '15,James Cook,RB,BUF');
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

async function createManualLeague(page, name) {
    await page.locator('#newLeagueName').evaluate((el, v) => { el.value = v; }, name);
    await callApp(page, 'createManualLeague');
}

test.describe('Lineup Strategist Best available in your leagues', () => {
    test('empty states, manual leagues left out, and Sync All redraws', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
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
        await expect(line(page, 'Fixture League').locator('.mls-ba-upgrade')).toHaveCount(0);

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
        await seedMls(page);
        await createManualLeague(page, 'Manual League');
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        // Fixture League: ROS has no upgrade, Weekly does.
        await upload(page, 'rosFileInput', WAIVER_RANKINGS_CSV, 30);
        await upload(page, 'weeklyFileInput', UPGRADE_CSV, 30);

        // Second League: a synced copy of the fixture league with its own (legacy) Weekly rankings.
        await page.evaluate((secondId) => {
            const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
            const fixture = leagues.find(l => l.leagueId === '1000000000000000001');
            const rosSet = JSON.parse(localStorage.getItem('mls_ranking_sets_ros')).find(s => s.id === fixture.rosRankingSetId);
            const weekly = rosSet.data.map(r => ({ ...r }));
            const flowers = weekly.find(r => r.name === 'Zay Flowers');
            const wilson = weekly.find(r => r.name === 'Garrett Wilson');
            for (const k of ['rank', 'posRank', 'flexRank']) [flowers[k], wilson[k]] = [wilson[k], flowers[k]];
            leagues.push({ ...fixture, leagueId: secondId, name: 'Second League', weeklyRankingSetId: null, rosRankingSetId: null, weeklyRankings: weekly, rosRankings: [] });
            localStorage.setItem('mls_leagues', JSON.stringify(leagues));
        }, SECOND_LEAGUE_ID);
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
        await expect(fixture.locator('.mls-ba-upgrade')).toHaveText('Upgrade: James Cook RB5 over your Derrick Henry RB8');
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(fixture.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['RB5', 'WR11', 'RB9']);
        await expect(fixture.locator('.mls-ta-pos').first()).toHaveClass(/\bpos-badge\b.*\bRB\b/);
        await expect(second.locator('.mls-ba-source')).toHaveText('Weekly');
        await expect(second.locator('.mls-ba-upgrade')).toHaveText('Upgrade: Zay Flowers WR10 over your Garrett Wilson WR12');

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
        await expect(fixture.locator('.mls-ba-upgrade')).toHaveCount(0);
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

        // View: switches to that league and opens its Top Available in the same rankings, even from another mode.
        await callApp(page, 'setWaiverMode', 'auto');
        await second.locator('[data-action="viewLeagueTopAvailable"]').click();
        await expect(page.locator('#scoutTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#waiverModeToggle [data-mode="top"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Second League');
        await expect(page.locator('#waiverOutput')).toContainText('in Second League by Weekly rank');
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
});
