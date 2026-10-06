// Lineup Strategist Dashboard: "Best available in your leagues" (improvements S5,
// js/mls/scout/bestAvailable.js). One line per league with its top 3 available RB/WR/TE by that
// league's own rankings (Weekly, else ROS), an upgrade when a free agent is ranked ahead of your
// weakest player at his position, leagues with the biggest upgrade first, the rest folded, and a
// View button that opens that league's Top Available. The card collapses and remembers it.
//
// Leagues:
// - Fixture League (synced). Your RB is Derrick Henry, your weakest WR Garrett Wilson, your weakest TE
//   George Kittle (the fixture alternates players between the two teams). Free RB/WR/TE: James Cook,
//   Jaxon Smith-Njigba, Chase Brown, Zay Flowers, Sam LaPorta.
//   - rankings-waivers.csv: no free agent beats your weakest (Cook RB8 < Henry RB5, and so on).
//   - UPGRADE_CSV (Cook and Henry swapped): Cook RB5 beats Henry RB8, a gap of 3 (Brown is RB9).
// - Manual League: ROS only, from MANUAL_ROS_CSV (no Weekly, so the line falls back to ROS), with
//   Kyren Williams added by hand. A manual league knows only your roster, so the rest read "not on
//   your roster". Chase Brown RB1 beats Kyren Williams RB3, a gap of 2, so it sorts after Fixture League.
// - Empty League: manual, no rankings, so it folds under "Show 1 more league" with an Upload button.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, RANKINGS_CSV, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const MANUAL_ROS_CSV = `Rank,Player,Pos,Team
1,Josh Allen,QB,BUF
2,Sam LaPorta,TE,DET
3,Zay Flowers,WR,BAL
4,Chase Brown,RB,CIN
5,James Cook,RB,BUF
6,Kyren Williams,RB,LAR
`;
const UPGRADE_CSV = WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL', '26,Derrick Henry,RB,BAL')
    .replace('26,James Cook,RB,BUF', '15,James Cook,RB,BUF');

const card = (page) => page.locator('#dashboardBestAvailable');
const summary = (page) => page.locator('#bestAvailableSummary');
const line = (page, name) => card(page).locator('.mls-ba-line').filter({ has: page.locator('.mls-ba-league', { hasText: name }) });
const names = (page, name) => line(page, name).locator('.mls-ba-name').allInnerTexts();
const more = (page) => card(page).locator('details.mls-ba-more');

async function uploadRos(page, csv, count) {
    await page.setInputFiles('#rosFileInput', { name: 'ros.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

// createManualLeague leaves the previous league's rankings loaded (and the next save copies them
// into the new league as legacy data; logged as a bug in docs/improvements/LOG.md), so the new
// league is loaded properly before anything else happens in it.
async function createManualLeague(page, name) {
    await page.locator('#newLeagueName').evaluate((el, v) => { el.value = v; }, name);
    await callApp(page, 'createManualLeague');
    await callApp(page, 'switchActiveLeague', await page.locator('#headerLeagueSelect').inputValue());
}

test.describe('Lineup Strategist Best available in your leagues', () => {
    test('empty states: no leagues, no rankings, everyone ranked is rostered', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'setup');
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('No leagues yet. Sync a Sleeper league or import all of yours under Add/Sync League below');

        // Synced, no rankings: say where to upload; with no ranked league, nothing is folded.
        await seedMls(page);
        await expect(summary(page)).toHaveText('1 league without rankings');
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

        // No free agent beats your weakest with rankings-waivers.csv either; the line still lists the best three.
        await showTab(page, 'lineup');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('No upgrades in your 1 league');
        await more(page).locator('summary').click();
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(line(page, 'Fixture League').locator('.mls-ta-pos')).toHaveText(['RB8', 'WR11', 'RB9']);
        await expect(line(page, 'Fixture League').locator('.mls-ba-upgrade')).toHaveCount(0);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('upgrades first by size, the rest folded, manual wording, View and collapse', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await createManualLeague(page, 'Empty League');
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await loadMlsRankings(page, UPGRADE_CSV, 30);

        // League and set ids are 'manual_' / 'rset_' + Date.now(); with the clock fixed, a second
        // manual league or set would reuse the first one's id.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 60_000));
        await createManualLeague(page, 'Manual League');
        // The Roster tab, where ROS is uploaded, points its set dropdown at this league ("+ Create New Set").
        await showTab(page, 'roster');
        await expect(page.locator('#rosRankingSetSelect')).toHaveValue('__new__');
        await uploadRos(page, MANUAL_ROS_CSV, 6);
        await page.locator('#manualName').evaluate((el) => { el.value = 'Kyren Williams'; });
        await page.locator('#manualPos').evaluate((el) => { el.value = 'RB'; });
        await page.locator('[data-action="addManualPlayer"]').evaluate((el) => el.click());
        // Back to the synced league, so View has a league to switch from.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await showTab(page, 'setup');

        await expect(summary(page)).toHaveText('Upgrades in 2 of 2 leagues · 1 league without rankings');
        await expect(card(page)).toContainText('Each league by its own rankings. Ownership is from the last sync: Sync All Leagues refreshes it.');
        // Biggest upgrade first (Fixture League, 3 spots; Manual League, 2), then the folded rest.
        await expect(card(page).locator('.mls-ba-list').first().locator('.mls-ba-league')).toHaveText(['Fixture League', 'Manual League']);
        await expect(more(page).locator('summary')).toHaveText('Show 1 more league', { useInnerText: true });
        await expect(line(page, 'Empty League')).toBeHidden();
        await more(page).locator('summary').click();
        await expect(line(page, 'Empty League').locator('.mls-ba-source')).toHaveText('No rankings');
        await expect(line(page, 'Empty League').locator('[data-action="bestAvailableUpload"]')).toBeVisible();

        // Fixture League: Weekly (FLEX order), QB Jayden Daniels left out; its own label, no manual wording.
        const fixture = line(page, 'Fixture League');
        await expect(fixture.locator('.mls-ba-source')).toHaveText('Weekly · 9/15/2026');
        await expect(fixture.locator('.mls-ba-upgrade')).toHaveText('Upgrade: James Cook RB5 over your Derrick Henry RB8');
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(fixture.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['RB5', 'WR11', 'RB9']);
        await expect(fixture.locator('.mls-ta-pos').first()).toHaveClass(/\bpos-badge\b.*\bRB\b/);

        // Manual League: no Weekly, so ROS; its own order; QB Josh Allen and your Kyren Williams left out.
        const manual = line(page, 'Manual League');
        await expect(manual.locator('.mls-ba-source')).toHaveText('ROS · 9/15/2026 · manual: not on your roster');
        await expect(manual.locator('.mls-ba-upgrade')).toHaveText('Upgrade: Chase Brown RB1 over your Kyren Williams RB3');
        expect(await names(page, 'Manual League')).toEqual(['Sam LaPorta', 'Zay Flowers', 'Chase Brown']);
        await expect(manual.locator('.mls-ba-players .mls-ta-pos')).toHaveText(['TE1', 'WR1', 'RB1']);

        // Drawing every line didn't change the active league.
        expect(await page.locator('#headerLeagueSelect').inputValue()).toBe(FIXTURE_LEAGUE_ID);

        // Collapse: the summary stays, the lines hide, and it's remembered after a reload.
        const toggle = card(page).locator('[data-action="toggleBestAvailable"]');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(fixture).toBeHidden();
        await expect(summary(page)).toBeVisible();
        await page.reload();
        await showTab(page, 'setup');
        await expect(summary(page)).toHaveText('Upgrades in 2 of 2 leagues · 1 league without rankings');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(fixture).toBeHidden();
        await toggle.click();
        await expect(fixture).toBeVisible();

        // View: switches to that league and opens its Top Available, even from another mode.
        await callApp(page, 'setWaiverMode', 'auto');
        await manual.locator('[data-action="viewLeagueTopAvailable"]').click();
        await expect(page.locator('#scoutTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#waiverModeToggle [data-mode="top"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Manual League');
        await expect(page.locator('#waiverOutput')).toContainText('not on your roster in Manual League');

        // Back on the Dashboard, the card redraws, and the lines don't depend on the active league.
        await showTab(page, 'setup');
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        expect(await names(page, 'Manual League')).toEqual(['Sam LaPorta', 'Zay Flowers', 'Chase Brown']);

        // Sync All redraws it too.
        await page.click('#syncAllBtn');
        await expect(page.locator('#syncAllBtn')).toBeEnabled();
        await expect(card(page).locator('.mls-ba-list').first().locator('.mls-ba-league')).toHaveText(['Fixture League', 'Manual League']);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
