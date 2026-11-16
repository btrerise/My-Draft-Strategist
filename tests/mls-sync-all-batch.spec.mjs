// Sync All draws the screen once, after its loop (improvements F25). Each league's sync used to redraw the Lineup and
// Roster tabs, Power Rankings and the Scoreboard and save every league's lineups, whichever tab was showing: with 20
// leagues on a phone that was most of Sync All's time (6 to 7 s of a 9 s sync on a 4x-slowed CPU). Now each league's
// lineup is computed without being drawn or saved, Sync All saves them all once, and draws the league you're on once.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';

test('Sync All saves every league\'s new lineup and draws the Lineup tab only at the end', async ({ page }) => {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await loadMlsRankings(page);
    await showTab(page, 'lineup');
    await expect(page.locator('#optimalLineupContainer .lineup-slot').first()).toBeVisible();

    // Forget both leagues' saved lineups, so only Sync All can bring them back; then count the Lineup tab's redraws.
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        State.manualStartersMap = {};
        State.manualBenchMap = {};
        localStorage.removeItem('mls_manual_starters');
        localStorage.removeItem('mls_manual_bench');
        window.__lineupDraws = 0;
        // A draw puts new lineup rows in (smaller updates, a chip or a badge, don't count).
        const isRow = (n) => n.nodeType === 1 && (n.matches('.lineup-slot') || n.querySelector('.lineup-slot'));
        new MutationObserver((records) => { if (records.some(r => [...r.addedNodes].some(isRow))) window.__lineupDraws++; })
            .observe(document.getElementById('optimalLineupContainer'), { childList: true, subtree: true });
    });

    // Sync All's own function (the Dashboard's button calls it), run while the Lineup tab shows; it resolves when done.
    await page.evaluate(async () => {
        const { syncAllLeagues } = await import('/js/mls/render/dashboard.js');
        await syncAllLeagues(document.getElementById('syncAllBtn'));
    });
    await page.waitForLoadState('networkidle');

    const saved = await page.evaluate(() => ({
        starters: Object.keys(JSON.parse(localStorage.getItem('mls_manual_starters') || '{}')).sort(),
        bench: Object.keys(JSON.parse(localStorage.getItem('mls_manual_bench') || '{}')).sort(),
    }));
    expect(saved).toEqual({ starters: [FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID].sort(), bench: [FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID].sort() });

    // Still on the league you were on, its lineup drawn once, at the end (with the old per-league draws: 3 for two
    // leagues).
    await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
    await expect(page.locator('#optimalLineupContainer .lineup-slot').first()).toBeVisible();
    expect(await page.evaluate(() => window.__lineupDraws)).toBe(1);
    await expectClean(page, state);
});
