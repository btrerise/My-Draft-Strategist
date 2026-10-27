// The Scout tab follows a league switch made on the Scout tab itself. Rank By's choices used to be drawn only when the
// tab was shown, so switching from a redraft league to a dynasty one there kept "ROS Rank" (and no Dynasty or
// In-Season choice) until you left the tab and came back, and the reverse kept "Dynasty Rank". Market Disconnect's
// report stayed up with the old league's owners.
//
// Setup: Fixture League (redraft) and Second Fixture League (dynasty), both synced, the same rankings in each, and
// FantasyCalc stubbed with the 24 fixture players in reverse order.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, loadMlsRankings, RANKINGS_CSV, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';

const rows = RANKINGS_CSV.trim().split('\n').slice(1).map(l => l.split(','));

async function setUp(page) {
    const state = await openApp(page, '/lineup/');
    await page.route(/^https:\/\/api\.fantasycalc\.com\//, (route) => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(rows.slice().reverse().map((r, i) => ({ player: { name: r[1], position: r[2] }, overallRank: i + 1 }))) }));
    await seedMls(page);
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    for (const id of [FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID]) {
        await callApp(page, 'switchActiveLeague', id);
        await showTab(page, 'roster');
        await loadMlsRankings(page);
    }
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await showTab(page, 'scout');
    return state;
}

// The choices a user can pick (hidden and disabled ones left out), as "value:label".
const rankByChoices = (page) => page.locator('#waiverScanBasis option').evaluateAll(opts =>
    opts.filter(o => !o.hidden && !o.disabled).map(o => `${o.value}:${o.textContent.trim()}`));
const switchTo = (page, id) => page.selectOption('#headerLeagueSelect', id); // the header's league switcher, as a user does

test.describe('Scout tab: a league switch made on the tab', () => {
    test('Rank By changes with the league, in every Waiver Wire mode', async ({ page }) => {
        const state = await setUp(page);
        for (const mode of ['top', 'auto', 'list']) {
            await page.locator(`[data-action="setWaiverMode"][data-mode="${mode}"]`).click();
            await expect.poll(() => rankByChoices(page)).toEqual(['weekly:Weekly Rank', 'ros:ROS Rank']);
            await switchTo(page, FIXTURE_LEAGUE2_ID);
            await expect.poll(() => rankByChoices(page)).toEqual(['weekly:Weekly Rank', 'ros:Dynasty Rank']);
            await expect(page.locator('#waiverScanBasisGroup')).toHaveClass(/mls-rank-by-wide/);
            await switchTo(page, FIXTURE_LEAGUE_ID);
            await expect.poll(() => rankByChoices(page)).toEqual(['weekly:Weekly Rank', 'ros:ROS Rank']);
            await expect(page.locator('#waiverScanBasisGroup')).not.toHaveClass(/mls-rank-by-wide/);
        }

        // In-Season Rank: the dynasty league's own In-Season set (a copy of its rankings under another name).
        await page.evaluate(async (leagueId) => {
            const { State } = await import('/js/mls/state.js');
            const dyn = State.leagues.find(l => l.leagueId === leagueId);
            const set = State.rankingSets.ros.find(s => s.id === dyn.rosRankingSetId);
            State.rankingSets.ros.push({ ...set, id: 'rset_season_copy', name: 'Redraft ROS' });
            dyn.seasonRankingSetId = 'rset_season_copy';
        }, FIXTURE_LEAGUE2_ID);
        await page.locator('[data-action="setWaiverMode"][data-mode="top"]').click();
        await switchTo(page, FIXTURE_LEAGUE2_ID);
        await expect.poll(() => rankByChoices(page)).toEqual(['weekly:Weekly Rank', 'ros:Dynasty Rank', 'season:In-Season Rank']);
        await page.selectOption('#waiverScanBasis', 'season');
        await expect(page.locator('#waiverOutput')).toContainText('In-Season');
        // The redraft league has no In-Season slot: ROS shows, and the list is ranked by it.
        await switchTo(page, FIXTURE_LEAGUE_ID);
        await expect(page.locator('#waiverScanBasis')).toHaveValue('ros');
        await expect.poll(() => rankByChoices(page)).toEqual(['weekly:Weekly Rank', 'ros:ROS Rank']);
        // Back in the dynasty league, the saved In-Season choice is picked again.
        await switchTo(page, FIXTURE_LEAGUE2_ID);
        await expect(page.locator('#waiverScanBasis')).toHaveValue('season');
        await expectClean(page, state);
    });

    test("Market Disconnect's report is re-run for the new league", async ({ page }) => {
        const state = await setUp(page);
        // In the dynasty league nobody rosters Bijan Robinson.
        await page.evaluate(async (leagueId) => {
            const { State } = await import('/js/mls/state.js');
            delete State.leagues.find(l => l.leagueId === leagueId).globalRosterMap['bijanrobinson'];
        }, FIXTURE_LEAGUE2_ID);
        await page.click('#scoutTab #fetchMarketValueBtn');
        await expect(page.locator('#marketSuccessMsg')).toContainText('Pulled Successfully');
        await page.locator('[data-action="runMarketDisconnectAnalysis"]').click();
        const bijan = page.locator('#marketDisconnectOutput').locator('.scout-result-card', { hasText: 'Bijan Robinson' });
        await expect(bijan).toContainText('Rostered by: Rival');
        await switchTo(page, FIXTURE_LEAGUE2_ID);
        await expect(bijan).toContainText('Free Agent');
        await expectClean(page, state);
    });

    test('no report on screen: a switch leaves Market Disconnect empty', async ({ page }) => {
        const state = await setUp(page);
        await switchTo(page, FIXTURE_LEAGUE2_ID);
        await expect(page.locator('#marketDisconnectOutput')).toBeEmpty();
        await expectClean(page, state);
    });
});
