// Position counts on the Roster tab (improvements S9): a chip per position above the list ("All 14",
// "QB 1", "WR 7"...), counting taxi and IR players and noting them, that follow every roster change
// (remove, add, sync, league switch) and filter the list to one position when tapped.
//
// Your Fixture League roster: QB 1 (Allen), RB 1 (Henry), WR 7, TE 3, K 1, DEF 1; slots QB 1, RB 2,
// WR 2, TE 1, FLEX 1, K 1, DEF 1.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const strip = (page) => page.locator('#rosterPosCounts');
const chip = (page, pos) => strip(page).locator(`[data-pos="${pos}"]`);
const rows = (page) => page.locator('#rosterList .roster-item');
// Each chip's spoken label ("RB 6 (1 IR)"), in order: what the strip says.
const chipLabels = (page) => strip(page).locator('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')));
const rowPositions = (page) => rows(page).locator('.pos-badge').allInnerTexts();

const FIXTURE_COUNTS = ['All 14', 'QB 1', 'RB 1', 'WR 7', 'TE 3', 'K 1', 'DEF 1'];

async function removeFromRoster(page, name) {
    await page.getByRole('button', { name: `Remove ${name}` }).click();
    await expect(page.locator('#mds-confirm-overlay')).toBeVisible();
    await page.locator('#mds-confirm-overlay [data-confirm-action="ok"]').click();
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toHaveCount(0);
}

test.describe('Roster tab position counts', () => {
    test('counts the fixture league, and follow a remove and an add', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');

        await expect(strip(page)).toBeVisible();
        expect(await chipLabels(page)).toEqual(FIXTURE_COUNTS);
        // What a sighted user reads: position, then the count.
        await expect(chip(page, 'WR')).toHaveText('WR7');
        // Colored like the list's position badges.
        await expect(chip(page, 'RB')).toHaveClass(/\bpos-badge\b.*\bRB\b/);
        await expect(chip(page, 'ALL')).toHaveAttribute('aria-pressed', 'true');

        // Remove the only RB: the league starts two, so "RB 0" stays, and can't be tapped.
        await removeFromRoster(page, 'Derrick Henry');
        expect(await chipLabels(page)).toEqual(['All 13', 'QB 1', 'RB 0', 'WR 7', 'TE 3', 'K 1', 'DEF 1']);
        await expect(chip(page, 'RB')).toBeDisabled();

        // Add one back from Setup's Add Player Manually.
        await showTab(page, 'setup');
        await page.locator('summary', { hasText: 'Add Player Manually' }).click();
        await page.fill('#manualName', 'James Cook');
        await page.selectOption('#manualPos', 'RB');
        await page.fill('#manualTeam', 'BUF');
        await page.getByRole('button', { name: 'Add Player to Active Roster' }).click();
        await showTab(page, 'roster');
        expect(await chipLabels(page)).toEqual(['All 14', 'QB 1', 'RB 1', 'WR 7', 'TE 3', 'K 1', 'DEF 1']);
        await expect(chip(page, 'RB')).toBeEnabled();
        await expectClean(page, state);
    });

    test('tapping a count shows only that position; All or a second tap shows everyone', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');

        await chip(page, 'WR').click();
        await expect(chip(page, 'WR')).toHaveAttribute('aria-pressed', 'true');
        await expect(chip(page, 'ALL')).toHaveAttribute('aria-pressed', 'false');
        await expect(chip(page, 'TE')).not.toHaveClass(/\bactive-filter\b/); // faded
        await expect(rows(page)).toHaveCount(7);
        expect(new Set(await rowPositions(page))).toEqual(new Set(['WR']));
        // The counts still cover the whole roster.
        expect(await chipLabels(page)).toEqual(FIXTURE_COUNTS);

        // A second tap on the same chip shows everyone again.
        await chip(page, 'WR').click();
        await expect(rows(page)).toHaveCount(14);
        await expect(chip(page, 'ALL')).toHaveAttribute('aria-pressed', 'true');

        // All does too, and the filter holds through a remove.
        await chip(page, 'TE').click();
        await expect(rows(page)).toHaveCount(3);
        await removeFromRoster(page, 'Brock Bowers');
        await expect(rows(page)).toHaveCount(2);
        await expect(chip(page, 'TE')).toHaveAttribute('aria-label', 'TE 2');
        await chip(page, 'ALL').click();
        await expect(rows(page)).toHaveCount(13);

        // Removing the last player at the filtered position shows everyone.
        await chip(page, 'QB').click();
        await expect(rows(page)).toHaveCount(1);
        await removeFromRoster(page, 'Josh Allen');
        await expect(rows(page)).toHaveCount(12);
        await expect(chip(page, 'ALL')).toHaveAttribute('aria-pressed', 'true');
        await expect(chip(page, 'QB')).toHaveAttribute('aria-label', 'QB 0');
        await expectClean(page, state);
    });

    test('switching leagues: an empty league shows no counts, and the filter resets', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');
        await chip(page, 'WR').click();
        await expect(rows(page)).toHaveCount(7);

        // A new manual league: empty roster, so no strip, and the welcome box as before.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));
        await showTab(page, 'setup');
        await page.fill('#newLeagueName', 'Bench League');
        await page.getByRole('button', { name: 'Create Manual' }).click();
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Bench League');
        await showTab(page, 'roster');
        await expect(strip(page)).toBeHidden();
        await expect(page.locator('#rosterList')).toContainText('Welcome to your Roster');

        // Straight back to the Fixture League: its counts, and everyone showing (a switch starts over).
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        expect(await chipLabels(page)).toEqual(FIXTURE_COUNTS);
        await expect(chip(page, 'ALL')).toHaveAttribute('aria-pressed', 'true');
        await expect(rows(page)).toHaveCount(14);
        await chip(page, 'TE').click();
        await expect(rows(page)).toHaveCount(3);
        await page.selectOption('#headerLeagueSelect', { label: 'Bench League' });
        await expect(strip(page)).toBeHidden();

        // A manual league counts the same way. No kicker slot and no kicker: no K chip.
        await showTab(page, 'setup');
        await page.fill('#reqK', '0');
        await page.getByRole('button', { name: 'Save Requirements' }).click();
        await page.locator('summary', { hasText: 'Add Player Manually' }).click();
        for (const [name, pos, team] of [['Josh Allen', 'QB', 'BUF'], ['Baltimore Ravens', 'DEF', 'BAL']]) {
            await page.fill('#manualName', name);
            await page.selectOption('#manualPos', pos);
            await page.fill('#manualTeam', team);
            await page.getByRole('button', { name: 'Add Player to Active Roster' }).click();
        }
        await showTab(page, 'roster');
        expect(await chipLabels(page)).toEqual(['All 2', 'QB 1', 'RB 0', 'WR 0', 'TE 0', 'DEF 1']);

        // Back to the Fixture League again: the TE filter is gone too.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        expect(await chipLabels(page)).toEqual(FIXTURE_COUNTS);
        await expect(chip(page, 'ALL')).toHaveAttribute('aria-pressed', 'true');
        await expect(rows(page)).toHaveCount(14);
        await expectClean(page, state);
    });

    test('taxi and IR players count, with a note, and a re-sync updates them', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Your roster on Sleeper: Henry is on NFL IR but on your bench; Jefferson is Out and in your
        // IR slot; Kittle is on NFL IR and in your IR slot; McBride is on your taxi squad. Routes
        // added after preparePage's stubs take precedence over them.
        const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
        let taxi = ['7553'];
        let reserve = ['6794', '4217'];
        await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
            const players = fixture('players-nfl.json');
            players['3198'].injury_status = 'IR';
            players['6794'].injury_status = 'Out';
            players['4217'].injury_status = 'IR';
            return route.fulfill({ json: players });
        });
        await page.route(/sleeper\.app\/v1\/league\/\d+\/rosters$/, route => {
            const rosters = fixture('league-rosters.json');
            rosters[0].taxi = taxi;
            rosters[0].reserve = reserve;
            return route.fulfill({ json: rosters });
        });
        await seedMls(page);
        await showTab(page, 'roster');

        // IR counts the IR slot or NFL IR, each player once.
        expect(await chipLabels(page)).toEqual(['All 14', 'QB 1', 'RB 1 (1 IR)', 'WR 7 (1 IR)', 'TE 3 (1 IR · 1 taxi)', 'K 1', 'DEF 1']);
        await expect(chip(page, 'RB').locator('.mls-poscount-note')).toHaveText('1 IR');
        await expect(chip(page, 'TE').locator('.mls-poscount-note')).toHaveText('1 IR · 1 taxi');

        // Row badges: the IR-slot badge (styled like TAXI) for Jefferson and Kittle; Jefferson keeps
        // his OUT; Kittle's NFL IR isn't shown twice; Henry (bench) keeps the red injury IR only.
        const row = (name) => rows(page).filter({ hasText: name });
        await expect(row('Justin Jefferson').locator('.ir-slot-badge')).toHaveText('IR');
        await expect(row('Justin Jefferson').locator('.inj-badge')).toHaveText('OUT');
        await expect(row('George Kittle').locator('.ir-slot-badge')).toHaveText('IR');
        await expect(row('George Kittle').locator('.inj-badge')).toHaveCount(0);
        await expect(row('Derrick Henry').locator('.ir-slot-badge')).toHaveCount(0);
        await expect(row('Derrick Henry').locator('.inj-badge')).toHaveText('IR');
        await expect(rows(page).locator('.ir-slot-badge')).toHaveCount(2);

        // McBride comes off the taxi squad and Jefferson out of the IR slot; the Roster tab's
        // Sync button picks it up.
        taxi = [];
        reserve = ['4217'];
        await page.locator('#rosterSyncBtn').click();
        await expect(chip(page, 'WR')).toHaveAttribute('aria-label', 'WR 7');
        await expect(chip(page, 'WR').locator('.mls-poscount-note')).toHaveCount(0);
        expect(await chipLabels(page)).toEqual(['All 14', 'QB 1', 'RB 1 (1 IR)', 'WR 7', 'TE 3 (1 IR)', 'K 1', 'DEF 1']);
        await expect(row('Justin Jefferson').locator('.ir-slot-badge')).toHaveCount(0);
        await expect(rows(page).locator('.ir-slot-badge')).toHaveCount(1);
        await expectClean(page, state);
    });
});
