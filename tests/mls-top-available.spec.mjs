// Lineup Strategist Scout tab: the Top Available card (improvements S1, js/mls/scout/topAvailable.js).
// The fixture league rosters every player in rankings.csv; rankings-waivers.csv (refactor 3G) adds six
// players no roster holds: Jayden Daniels QB (#25), James Cook RB (#26), Jaxon Smith-Njigba WR (#27),
// Chase Brown RB (#28), Zay Flowers WR (#29) and Sam LaPorta TE (#30). Neither file ranks K or DEF.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, RANKINGS_CSV, WAIVER_RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const out = (page) => page.locator('#topAvailableOutput');
const showBtn = (page) => page.locator('[data-action="showTopAvailable"]');
const chip = (page, pos) => page.locator(`#topAvailablePosChips [data-pos="${pos}"]`);
const rowNames = (page) => out(page).locator('.mls-topavail-row .mls-topavail-name > span:nth-child(2)').allInnerTexts();
const group = (page, pos) => out(page).locator('.mls-topavail-group').filter({ has: page.locator('.mls-topavail-group-title', { hasText: new RegExp(`^${pos} `) }) });

test.describe('Lineup Strategist Top Available', () => {
    test('empty states, then the top available players by position', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'scout');

        await showBtn(page).click();
        await expect(out(page)).toContainText('No league yet. Sync a Sleeper league on the Dashboard first');

        await showTab(page, 'setup');
        await seedMls(page);
        await showTab(page, 'scout');
        await showBtn(page).click();
        await expect(out(page)).toContainText('No rankings loaded. Upload Weekly rankings (Lineup tab) or ROS rankings (Roster tab) first.');

        // Every player rankings.csv ranks is rostered.
        await loadMlsRankings(page);
        await showBtn(page).click();
        await expect(out(page)).toContainText('Every player in your Weekly rankings (24 ranked) is already rostered in this league.');

        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showBtn(page).click();
        await expect(out(page)).toContainText('Top available players in Fixture League by Weekly rank.');
        await expect(out(page)).toContainText("Ownership is from this league's last sync (synced today). Re-run Sync All on the Dashboard");

        // All: grouped by position, best first; K and DEF aren't ranked, so they're left out.
        await expect(out(page).locator('.mls-topavail-group-title')).toHaveText([
            /^QB · 1 available/, /^RB · 2 available/, /^WR · 2 available/, /^TE · 1 available/,
        ]);
        expect(await rowNames(page)).toEqual(['Jayden Daniels', 'James Cook', 'Chase Brown', 'Jaxon Smith-Njigba', 'Zay Flowers', 'Sam LaPorta']);
        await expect(group(page, 'RB').locator('.mls-topavail-row').first()).toContainText('BUF');
        await expect(group(page, 'RB').locator('.mls-topavail-row').first()).toContainText('Wk Pos: RB8');
        await expect(out(page)).not.toContainText('Not on your roster');

        // Position chips filter in place.
        await chip(page, 'RB').click();
        await expect(chip(page, 'RB')).toHaveAttribute('aria-pressed', 'true');
        await expect(out(page)).toContainText('Top available RBs in Fixture League');
        await expect(out(page)).toContainText('Showing 2 of 2 available.');
        expect(await rowNames(page)).toEqual(['James Cook', 'Chase Brown']);

        await chip(page, 'FLEX').click();
        await expect(out(page)).toContainText('Top available RB/WR/TE in Fixture League');
        expect(await rowNames(page)).toEqual(['James Cook', 'Jaxon Smith-Njigba', 'Chase Brown', 'Zay Flowers', 'Sam LaPorta']);

        await chip(page, 'K').click();
        await expect(out(page)).toContainText("Your Weekly rankings don't include any K.");

        // Rank By is the waiver scan's setting: the card's toggle and the dropdown stay in step.
        await chip(page, 'QB').click();
        await page.locator('#topAvailableBasisToggle [data-basis="ros"]').click();
        await expect(out(page)).toContainText('Top available QBs in Fixture League by ROS rank.');
        await expect(out(page)).toContainText('ROS Overall: #25');
        await expect(page.locator('#waiverScanBasis')).toHaveValue('ros');
        await page.selectOption('#waiverScanBasis', 'weekly');
        await expect(page.locator('#topAvailableBasisToggle [data-basis="weekly"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(out(page)).toContainText('Top available QBs in Fixture League by Weekly rank.');

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

        await chip(page, 'FLEX').click();
        await showBtn(page).click();
        const o = out(page);
        await expect(o).toContainText('Top RB/WR/TE not on your roster in Manual League by Weekly rank.');
        await expect(o).toContainText('This is a manual league, so the app only knows your own roster.');
        await expect(o).not.toContainText('Ownership is from');
        // 9 RBs, 12 WRs and 4 TEs, none on this empty roster: 15 shown, then 10 more.
        await expect(o).toContainText('Showing 15 of 25 not on your roster.');
        await expect(o.locator('.mls-topavail-row').first()).toContainText('Not on your roster');
        expect((await rowNames(page)).slice(0, 3)).toEqual(["Ja'Marr Chase", 'Bijan Robinson', 'Justin Jefferson']);
        await o.locator('[data-action="showMoreTopAvailable"]').click();
        await expect(o).toContainText('Showing 25 of 25 not on your roster.');
        await expect(o.locator('[data-action="showMoreTopAvailable"]')).toHaveCount(0);

        // All mode: "See all" jumps to that position.
        await chip(page, 'ALL').click();
        await expect(group(page, 'WR').locator('.mls-topavail-group-title')).toContainText('12 not on your roster');
        await group(page, 'WR').locator('[data-action="setTopAvailablePos"]').click();
        await expect(chip(page, 'WR')).toHaveAttribute('aria-pressed', 'true');
        await expect(o).toContainText('Showing 12 of 12 not on your roster.');

        // Switching league redraws the list for the new league.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(o).toContainText('Top available WRs in Fixture League');
        await expect(o).toContainText('Showing 2 of 2 available.');

        await page.waitForLoadState('networkidle');
        await expectClean(page, state);
    });
});
