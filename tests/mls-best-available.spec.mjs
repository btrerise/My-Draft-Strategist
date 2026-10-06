// Lineup Strategist Dashboard: "Best available in your leagues" (improvements S5,
// js/mls/scout/bestAvailable.js). One line per league with its top 3 available RB/WR/TE by that
// league's own rankings (Weekly, else ROS), and a View button that opens its Top Available.
//
// Two leagues with different rankings:
// - Fixture League (synced): Weekly and ROS from rankings-waivers.csv, whose free RB/WR/TE are
//   James Cook (#26), Jaxon Smith-Njigba (#27), Chase Brown (#28), Zay Flowers (#29), Sam LaPorta (#30).
// - Manual League: ROS only, from MANUAL_ROS_CSV below (no Weekly, so the line falls back to ROS).
//   A manual league knows only your own (empty) roster, so every ranked player is "not on your roster".
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, RANKINGS_CSV, FIXTURE_LEAGUE_ID, FIXED_NOW } from './helpers.mjs';

const MANUAL_ROS_CSV = `Rank,Player,Pos,Team
1,Josh Allen,QB,BUF
2,Sam LaPorta,TE,DET
3,Zay Flowers,WR,BAL
4,Chase Brown,RB,CIN
5,James Cook,RB,BUF
`;

const card = (page) => page.locator('#dashboardBestAvailable');
const line = (page, name) => card(page).locator('.mls-ba-line').filter({ has: page.locator('.mls-ba-league', { hasText: name }) });
const names = (page, name) => line(page, name).locator('.mls-ba-name').allInnerTexts();

async function uploadRos(page, csv, count) {
    await page.setInputFiles('#rosFileInput', { name: 'ros.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

test.describe('Lineup Strategist Best available in your leagues', () => {
    test('empty states: no leagues, no rankings, everyone ranked is rostered', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'setup');
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('No leagues yet. Sync a Sleeper league or import all of yours under Add/Sync League below');

        // Synced, no rankings: say where to upload; Upload opens the Lineup tab.
        await seedMls(page);
        await expect(line(page, 'Fixture League')).toContainText('No rankings for this league yet. Upload Weekly rankings on the Lineup tab (or ROS rankings on the Roster tab)');
        await line(page, 'Fixture League').locator('[data-action="bestAvailableUpload"]').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);

        // Every player rankings.csv ranks is rostered in the fixture league.
        await loadMlsRankings(page, RANKINGS_CSV, 24);
        await showTab(page, 'setup');
        await expect(line(page, 'Fixture League')).toContainText('Every RB, WR and TE in its Weekly rankings (20 ranked) is already rostered in this league.');
        await expect(line(page, 'Fixture League').locator('[data-action="viewLeagueTopAvailable"]')).toBeVisible();

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('one line per league by its own rankings, manual wording, and View', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await page.locator('#newLeagueName').evaluate((el) => { el.value = 'Manual League'; });
        await callApp(page, 'createManualLeague');
        // createManualLeague leaves the previous league's rankings loaded (and the next save copies
        // them into the new league as legacy data), so load the new league properly first.
        await callApp(page, 'switchActiveLeague', await page.locator('#headerLeagueSelect').inputValue());
        // The Roster tab, where ROS is uploaded, points its set dropdown at this league ("+ Create New Set").
        await showTab(page, 'roster');
        await expect(page.locator('#rosRankingSetSelect')).toHaveValue('__new__');
        // Set ids are 'rset_' + Date.now(); with the clock fixed, a second set would reuse the first's id.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 60_000));
        await uploadRos(page, MANUAL_ROS_CSV, 5);
        // Back to the synced league, so View has a league to switch from.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await showTab(page, 'setup');

        await expect(card(page)).toContainText("Ownership is from each league's last sync: tap Sync All Leagues above");
        await expect(card(page)).toContainText('Manual leagues only know your own roster, so their players may be on other teams.');
        await expect(card(page).locator('.mls-ba-league')).toHaveText(['Fixture League', 'Manual League']);

        // Fixture League: Weekly (FLEX order), QB Jayden Daniels left out.
        const fixture = line(page, 'Fixture League');
        await expect(fixture.locator('.mls-ba-source')).toHaveText(/^Weekly rankings/);
        await expect(fixture.locator('.mls-ba-source')).not.toContainText('not on your roster');
        expect(await names(page, 'Fixture League')).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown']);
        await expect(fixture.locator('.mls-ta-pos')).toHaveText(['RB8', 'WR11', 'RB9']);
        await expect(fixture.locator('.mls-ta-pos').first()).toHaveClass(/\bpos-badge\b.*\bRB\b/);

        // Manual League: no Weekly, so ROS; its own order; QB Josh Allen left out.
        const manual = line(page, 'Manual League');
        await expect(manual.locator('.mls-ba-source')).toHaveText(/^ROS rankings.*· not on your roster$/);
        expect(await names(page, 'Manual League')).toEqual(['Sam LaPorta', 'Zay Flowers', 'Chase Brown']);
        await expect(manual.locator('.mls-ta-pos')).toHaveText(['TE1', 'WR1', 'RB1']);

        // Drawing every line didn't change the active league.
        expect(await page.locator('#headerLeagueSelect').inputValue()).toBe(FIXTURE_LEAGUE_ID);

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
        await expect(card(page).locator('.mls-ba-league')).toHaveText(['Fixture League', 'Manual League']);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
