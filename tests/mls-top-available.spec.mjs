// Lineup Strategist Scout tab: the Waiver Wire Assistant's Top Available mode (improvements S1,
// js/mls/scout/topAvailable.js). The fixture league rosters every player in rankings.csv;
// rankings-waivers.csv (refactor 3G) adds six players no roster holds: Jayden Daniels QB (#25), James
// Cook RB (#26), Jaxon Smith-Njigba WR (#27), Chase Brown RB (#28), Zay Flowers WR (#29) and Sam
// LaPorta TE (#30). Neither file ranks K or DEF. Top Available is the default mode and draws whenever
// the Scout tab is shown, so a rankings upload or sync on another tab shows up on coming back.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const out = (page) => page.locator('#waiverOutput');
const chip = (page, pos) => page.locator(`#waiverPosChips [data-pos="${pos}"]`);
const mode = (page, m) => page.locator(`#waiverModeToggle [data-mode="${m}"]`);
const rowNames = (page) => out(page).locator('.mls-ta-name').allInnerTexts();
const group = (page, pos) => out(page).locator('.mls-ta-group').filter({ has: page.locator('.mls-ta-title', { hasText: new RegExp(`^${pos} `) }) });

test.describe('Lineup Strategist Top Available', () => {
    test('empty states, redraws after an upload elsewhere, and the list by position', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'scout');
        await expect(mode(page, 'top')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#waiverInput')).toBeHidden();
        await expect(out(page)).toContainText('No league yet. Sync a Sleeper league on the Dashboard first');

        await showTab(page, 'setup');
        await seedMls(page);
        await showTab(page, 'scout');
        await expect(out(page)).toContainText('No rankings loaded. Upload Weekly rankings (Lineup tab) or ROS rankings (Roster tab) first.');

        // Every player rankings.csv ranks is rostered.
        await showTab(page, 'roster');
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await chip(page, 'ALL').click();
        await expect(out(page)).toContainText('Every player in your Weekly rankings (24 ranked) is already rostered in this league.');

        // A new upload on another tab: coming back to the Scout tab redraws with it.
        await showTab(page, 'lineup');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'scout');
        await expect(out(page)).toContainText('Top available players in Fixture League by Weekly rank.');
        await expect(out(page)).toContainText("Ownership is from this league's last sync (synced today). Re-run Sync All on the Dashboard");

        // All: grouped by position, best first; K and DEF aren't ranked, so they're left out.
        await expect(out(page).locator('.mls-ta-title')).toHaveText([
            'QB · 1 available', 'RB · 2 available', 'WR · 2 available', 'TE · 1 available',
        ]);
        expect(await rowNames(page)).toEqual(['Jayden Daniels', 'James Cook', 'Chase Brown', 'Jaxon Smith-Njigba', 'Zay Flowers', 'Sam LaPorta']);
        const cook = group(page, 'RB').locator('.mls-ta-row').first();
        await expect(cook).toContainText('BUF');
        await expect(cook.locator('.mls-ta-pos')).toHaveText('RB8');
        await expect(cook.locator('.mls-ta-num')).toHaveText('#21');
        await expect(cook.locator('.mls-ta-starts')).toHaveText('Starts');
        await expect(group(page, 'QB').locator('.mls-ta-num')).toHaveText('–');

        // Position chips filter in place.
        await chip(page, 'RB').click();
        await expect(chip(page, 'RB')).toHaveAttribute('aria-pressed', 'true');
        await expect(out(page)).toContainText('Top available RBs in Fixture League');
        await expect(out(page).locator('.mls-ta-title')).toHaveText('RB · showing 2 of 2 available');
        expect(await rowNames(page)).toEqual(['James Cook', 'Chase Brown']);

        await chip(page, 'FLEX').click();
        await expect(out(page)).toContainText('Top available RB/WR/TE in Fixture League');
        expect(await rowNames(page)).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown', 'Zay Flowers', 'Sam LaPorta']);

        await chip(page, 'K').click();
        await expect(out(page)).toContainText("Your Weekly rankings don't include any K.");

        // Rank By is the card's one dropdown; changing it redraws the list.
        await chip(page, 'QB').click();
        await page.selectOption('#waiverScanBasis', 'ros');
        await expect(out(page)).toContainText('Top available QBs in Fixture League by ROS rank.');
        await expect(out(page).locator('.mls-ta-col')).toHaveText('ROS Ovr');
        await expect(out(page).locator('.mls-ta-num')).toHaveText('#25');
        await page.selectOption('#waiverScanBasis', 'weekly');
        await expect(out(page)).toContainText('Top available QBs in Fixture League by Weekly rank.');

        // Other modes share the card and its results area; coming back redraws the list.
        await mode(page, 'auto').click();
        await expect(out(page)).toBeEmpty();
        await expect(page.locator('[data-action="autoFindWaiverUpgrades"]')).toBeVisible();
        await mode(page, 'list').click();
        await expect(page.locator('#waiverInput')).toBeVisible();
        await expect(page.locator('#waiverPosChips')).toBeHidden();
        await mode(page, 'top').click();
        await expect(out(page)).toContainText('Top available QBs in Fixture League');

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('a manual league lists players not on your roster, and a league switch redraws', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await page.locator('#newLeagueName').evaluate((el) => { el.value = 'Manual League'; });
        await callApp(page, 'createManualLeague');
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'scout');

        // FLEX is the default position.
        const o = out(page);
        await expect(chip(page, 'FLEX')).toHaveAttribute('aria-pressed', 'true');
        await expect(o).toContainText('Top RB/WR/TE not on your roster in Manual League by Weekly rank.');
        await expect(o).toContainText('This is a manual league, so the app only knows your own roster.');
        await expect(o).not.toContainText('Ownership is from');
        // 9 RBs, 12 WRs and 4 TEs, none on this empty roster: 15 shown, then 10 more.
        await expect(o.locator('.mls-ta-title')).toHaveText('FLEX · showing 15 of 25 not on your roster');
        expect((await rowNames(page)).slice(0, 3)).toEqual(["Ja'Marr Chase", 'Bijan Robinson', 'Justin Jefferson']);
        await o.locator('[data-action="showMoreTopAvailable"]').click();
        await expect(o.locator('.mls-ta-title')).toHaveText('FLEX · showing 25 of 25 not on your roster');
        await expect(o.locator('[data-action="showMoreTopAvailable"]')).toHaveCount(0);

        // All mode: "See all" jumps to that position.
        await chip(page, 'ALL').click();
        await expect(group(page, 'WR').locator('.mls-ta-title')).toHaveText('WR · 12 not on your roster');
        await group(page, 'WR').locator('[data-action="setWaiverPos"]').click();
        await expect(chip(page, 'WR')).toHaveAttribute('aria-pressed', 'true');
        await expect(o.locator('.mls-ta-title')).toHaveText('WR · showing 12 of 12 not on your roster');

        // Switching league redraws the list for the new league.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(o).toContainText('Top available WRs in Fixture League');
        await expect(o.locator('.mls-ta-title')).toHaveText('WR · showing 2 of 2 available');

        await page.waitForLoadState('networkidle');
        await expectClean(page, state);
    });
});
