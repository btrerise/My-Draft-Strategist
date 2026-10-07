// A newly added league starts with no rankings (improvements F4). Each way of adding a league used
// to make it active without loading its own rankings (hydrateRankingsForLeague), so State kept the
// previous league's. The next rankings save in the new league (saveActiveLeagueState) then copied
// them into its legacy per-league slots: it showed "Unassigned Upload (legacy)" holding rankings
// it was never given, and its lineup used them.
//
// Every test: a first league with ROS and Weekly rankings, then a second league added one of the
// four ways, then only ROS uploaded there. The second league must have no Weekly rankings.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls, loadMlsRankings, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID, RANKINGS_CSV } from './helpers.mjs';

const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
const storedLeague = (page, match) => page.evaluate((m) => {
    const leagues = JSON.parse(localStorage.getItem('mls_leagues') || '[]');
    return leagues.find(l => (m.id ? l.leagueId === m.id : l.leagueId.startsWith(m.prefix))) || null;
}, match);

async function uploadRos(page) {
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

async function createManualLeague(page, name) {
    await page.fill('#newLeagueName', name);
    await page.getByRole('button', { name: 'Create Manual' }).click();
    await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText(name);
}

// The active (new) league, right after it's added: nothing loaded, on the Lineup tab (Weekly) and
// the Roster tab (ROS). Soft, so a failure here still runs the stored-data checks below.
async function expectNoRankingsLoaded(page) {
    await showTab(page, 'lineup');
    await expect.soft(page.locator('#weeklyRankingSetSelect option:checked')).toHaveText('+ Create New Set');
    await expect.soft(page.locator('#weeklyMetaDisplay')).toBeHidden();
    await showTab(page, 'roster');
    await expect.soft(page.locator('#rosRankingSetSelect option:checked')).toHaveText('+ Create New Set');
    await expect.soft(page.locator('#rosMetaDisplay')).toBeHidden();
}

// After a ROS-only upload in the new league: its own ROS set, and still no Weekly rankings.
async function expectOnlyRos(page, league) {
    await showTab(page, 'lineup');
    await expect(page.locator('#weeklyRankingSetSelect option:checked')).toHaveText('+ Create New Set');
    await expect(page.locator('#weeklyRankingSetSelect')).not.toContainText('Unassigned Upload (legacy)');
    await expect(page.locator('#weeklyMetaDisplay')).toBeHidden();
    expect(league.weeklyRankings).toEqual([]);
    expect(league.weeklyRankingSetId).toBeNull();
    expect(league.rosRankingSetId).toBeTruthy();
}

test.describe('A new league starts with no rankings', () => {
    test('a manual league created after a synced league with rankings', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));

        await showTab(page, 'setup');
        await createManualLeague(page, 'Bench League');
        await expect(page.locator('#manualAddMsg')).toHaveText("Manual League 'Bench League' Created");
        await expectNoRankingsLoaded(page);

        await uploadRos(page);
        await expectOnlyRos(page, await storedLeague(page, { prefix: 'manual_' }));

        // The Fixture League keeps its own Weekly set.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(page.locator('#weeklyRankingSetSelect option:checked')).toContainText('Weekly Rankings');
        await expectClean(page, state);
    });

    test('a Sleeper league synced for the first time after a league with rankings', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await createManualLeague(page, 'Bench League');
        await loadMlsRankings(page);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));

        await showTab(page, 'setup');
        await seedMls(page);
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Fixture League');
        await expectNoRankingsLoaded(page);

        await uploadRos(page);
        await expectOnlyRos(page, await storedLeague(page, { id: FIXTURE_LEAGUE_ID }));
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('Import All after a league with rankings', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await createManualLeague(page, 'Bench League');
        await loadMlsRankings(page);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));

        await showTab(page, 'setup');
        await page.fill('#sleeperUsername', 'mds_test');
        await page.click('#importAllLeaguesBtn');
        await expect(toast(page, 'Imported 1 league!')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Fixture League');
        await expectNoRankingsLoaded(page);

        await uploadRos(page);
        await expectOnlyRos(page, await storedLeague(page, { id: FIXTURE_LEAGUE_ID }));
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('a Draft Strategist roster imported after a league with rankings', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await createManualLeague(page, 'Bench League');
        await loadMlsRankings(page);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));

        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await seedMds(page);
        await showTab(page, 'team');
        await page.click('#sendToLineupBtn');
        await page.waitForURL('**/lineup/**');
        await page.waitForLoadState('networkidle');
        await page.locator('#handoffBanner').getByRole('button', { name: 'Import as New League' }).click();
        await expect(toast(page, /Imported ".*" with \d+ players\./)).toBeVisible();
        await expectNoRankingsLoaded(page);

        await uploadRos(page);
        await expectOnlyRos(page, await storedLeague(page, { prefix: 'handoff_' }));
        await expectClean(page, state);
    });
});

// Start-up (js/mls/init.js) used to give a league with no rankings of its own the flat "last upload,
// any league" copy, so the same leak came back after a reload. Owner's choice: that copy is used only
// when no league has rankings of that type of its own.
test.describe('After a reload', () => {
    test('a new league still starts with no rankings', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));
        await showTab(page, 'setup');
        await createManualLeague(page, 'Bench League');

        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Bench League');
        await expectNoRankingsLoaded(page);

        await uploadRos(page);
        await expectOnlyRos(page, await storedLeague(page, { prefix: 'manual_' }));
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(page.locator('#weeklyRankingSetSelect option:checked')).toContainText('Weekly Rankings');
        await expectClean(page, state);
    });

    test('the app-wide copy still loads when no league has rankings of its own', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await createManualLeague(page, 'Old League');
        await loadMlsRankings(page);
        // A setup from before per-league rankings: the uploads live only in the flat mls_ros /
        // mls_weekly keys, with no sets and nothing stored on the league.
        await page.evaluate(() => {
            const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
            for (const l of leagues) Object.assign(l, { rosRankingSetId: null, weeklyRankingSetId: null, rosRankings: [], weeklyRankings: [] });
            localStorage.setItem('mls_leagues', JSON.stringify(leagues));
            localStorage.removeItem('mls_ranking_sets_ros');
            localStorage.removeItem('mls_ranking_sets_weekly');
        });

        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'lineup');
        await expect(page.locator('#weeklyMetaDisplay')).toContainText('Loaded: 24 players');
        await showTab(page, 'roster');
        await expect(page.locator('#rosMetaDisplay')).toContainText('Loaded: 24 players');
        await expectClean(page, state);
    });
});
