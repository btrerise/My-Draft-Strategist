// Lineup Strategist: "your weakest player" (the Whole Roster drop candidate) leaves out players who
// aren't really on your active roster: taxi-squad players and anyone Sleeper lists as IR, Out, PUP,
// NFI, suspended or did-not-report (improvements S5, round 6; owner's request). Before, an injured
// star on IR or an Out player, unranked in Weekly rankings because he isn't playing, was named your
// weakest player, so every free agent "beat" him. rosterBenchmark (js/mls/scout/waivers.js) is the one
// place this is decided, for Check a List, Auto-Find's Whole Roster and the Dashboard's Best
// Available card.
//
// Your fixture roster's WRs, best first: Ja'Marr Chase, Justin Jefferson, CeeDee Lamb, Puka Nacua,
// Amon-Ra St. Brown, A.J. Brown, Garrett Wilson. Your only RB is Derrick Henry. Here Sleeper lists
// Wilson as Out and Henry on IR, and A.J. Brown is on your taxi squad, so your weakest active WR is
// St. Brown, and you have no active RB.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const WILSON = '7523', HENRY = '3198', AJ_BROWN = '5859';

test.describe('Lineup Strategist weakest rostered player', () => {
    test('leaves out IR, Out and taxi players', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Registered after openApp's routes, so these answer first.
        await page.route(/api\.sleeper\.app\/v1\/players\/nfl$/, (route) => {
            const players = JSON.parse(fixture('players-nfl.json'));
            players[WILSON].injury_status = 'Out';
            players[HENRY].injury_status = 'IR';
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(players) });
        });
        await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) => {
            const rosters = JSON.parse(fixture('league-rosters.json'));
            rosters.find(r => r.owner_id === '900001').taxi = [AJ_BROWN];
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rosters) });
        });
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'scout');
        const out = page.locator('#waiverOutput');

        // Check a List, Whole Roster: a pasted WR is compared with St. Brown, not Wilson (Out) or A.J. Brown (taxi).
        await callApp(page, 'setWaiverMode', 'list');
        await callApp(page, 'setWaiverCompare', 'roster');
        await callApp(page, 'setWaiverPos', 'WR');
        await page.fill('#waiverInput', 'Zay Flowers\nChase Brown');
        await page.click('#waiverScanBtn');
        await expect(out).toContainText('Amon-Ra St. Brown (your weakest WR)');
        await expect(out).not.toContainText('Garrett Wilson (your weakest WR)');
        // Henry is on IR, so there's no active RB to compare with, and it says why.
        await expect(out).toContainText('You have no active RB on your roster to compare against (not counted: Derrick Henry, IR).');

        // Auto-Find, Whole Roster: the same drop candidate, with who was left out.
        await callApp(page, 'setWaiverMode', 'auto');
        await callApp(page, 'setWaiverCompare', 'roster');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out).toContainText('Your weakest WR is Amon-Ra St. Brown');
        await expect(out).toContainText('Not counted: A.J. Brown (taxi), Garrett Wilson (OUT).');

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });
});
