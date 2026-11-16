// Bye Crunch (improvements S52; js/mls/lineup/byeCrunch.js, unit-tested in tests/unit/byeCrunch.test.mjs): for each of
// the next 2 NFL weeks, a starting slot nobody on your roster can fill (on bye that week, or Out or on IR now). A note
// on the league's Dashboard card and in the Lineup tab's box, with a Find button; never counted in "N lineups need you".
// And S34's leftover: from Tuesday, once the week's games are over, the waiver tools read next week's byes.
//
// The fixture team (Fixture League) has one RB, Derrick Henry (BAL), plus Bijan Robinson (ATL) moved in here, a K and
// a DEF from BAL. With Sleeper's week stubbed to 12, the weeks checked are 13 (BAL, IND, LV, NYJ on bye) and 14 (ARI,
// DAL): week 13 leaves an RB slot short; week 14 nothing (McBride, ARI, and Lamb, DAL, have backups). The K and DEF on
// bye in week 13 aren't flagged (owner's choice, round 3: they're streamed).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const BIJAN = '9509';
const move = (from, to, id) => { from.players = from.players.filter(p => p !== id); to.players.push(id); };

const card = (page) => page.locator('#leagueCards > .mls-lc-card').filter({ has: page.locator('.mls-lc-name', { hasText: 'Fixture League' }) });
const todo = (page) => card(page).locator('.mls-lc-todo > .mls-needs-line');
const lineupBox = (page) => page.locator('#optimalLineupContainer .lineup-needs-box');

// One heading per week, a row per slot (round 4).
const WEEK13 = { head: 'Bye Crunch · Week 13: 1 starter short', list: ['RB: 1 short · Derrick Henry (BAL) on bye'] };
// An item's heading (its own text, or its fold's summary on the Lineup tab) and its rows, without their buttons.
const itemParts = (items) => items.evaluateAll(ls => ls.map(l => {
    const own = (el) => [...el.childNodes].filter(n => n.nodeName !== 'BUTTON' && n.nodeName !== 'UL').map(n => n.textContent).join('').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = l.querySelector('summary');
    return { head: summary ? own(summary) : own(l), list: [...l.querySelectorAll('.mls-crunch-list li')].map(own) };
}));


// Sleeper's week (and its projections, the fixture's week 2 file for any week); Bijan for A.J. Brown.
async function routeWeek(page, week, { bijan = true } = {}) {
    await page.route(/sleeper\.app\/v1\/state\/nfl$/, r => r.fulfill({ json: { ...fixture('state-nfl.json'), week, leg: week, display_week: week } }));
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/\d+$/, r => r.fulfill({ json: fixture('projections-2026-2.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), r => {
        const rosters = fixture('league-rosters.json');
        if (bijan) { move(rosters[1], rosters[0], BIJAN); move(rosters[0], rosters[1], '5859'); }
        return r.fulfill({ json: rosters });
    });
}

async function open(page, week, opts) {
    const state = await openApp(page, '/lineup/', { beforeGoto: (p) => routeWeek(p, week, opts) });
    await seedMls(page);
    await loadMlsRankings(page);
    await showTab(page, 'setup');
    return state;
}

test.describe('Bye Crunch', () => {
    test('week 12: week 13\'s short RB slot on the league card and in the Lineup box, as notes, with Find buttons', async ({ page }) => {
        const state = await open(page, 12);
        // A note, not a job: the card says Notes, no amber edge, and the strip doesn't count it.
        await expect(todo(page).locator('.mls-needs-label')).toHaveText('Notes');
        await expect(card(page)).not.toHaveClass(/\bhas-needs\b|\bneeds-you\b/);
        await expect(page.locator('#lineupNeedsBox')).not.toContainText('need you');
        expect(await itemParts(todo(page).locator('.mls-needs-item'))).toEqual([WEEK13]);
        await expect(todo(page).locator('.mls-needs-item.is-crunch .mls-crunch-icon')).toHaveCount(1);
        // Nothing for week 14.
        await expect(todo(page)).not.toContainText('Week 14');
        // The Find button is on its row, not in the card's right-hand column.
        await expect(todo(page).locator('.mls-crunch-list li').getByRole('button', { name: 'Find RB in Fixture League' })).toBeVisible();
        await expect(todo(page).locator('.mls-needs-actions')).toHaveCount(0);
        // No K or DEF note, though Tucker and the Ravens (BAL) are on bye in week 13 (round 3).
        await expect(todo(page).getByRole('button', { name: /^Find (K|DEF) / })).toHaveCount(0);

        // Find RB opens Top Available on RB.
        await todo(page).getByRole('button', { name: 'Find RB in Fixture League' }).click();
        await expect(page.locator('#scoutTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#scoutTab [data-action="setWaiverPos"][data-pos="RB"]')).toHaveAttribute('aria-pressed', 'true');

        // The Lineup tab's box: "Nothing needs you before kickoff", and the same item folded to its heading (round 4).
        await showTab(page, 'lineup');
        await expect(lineupBox(page).locator('.lineup-needs-title')).toContainText('Nothing needs you before kickoff');
        await expect(lineupBox(page)).not.toHaveClass(/\bhas-problems\b/);
        const fold = lineupBox(page).locator('details.lineup-needs-crunch');
        await expect(fold).not.toHaveAttribute('open', '');
        await expect(lineupBox(page).getByRole('button', { name: 'Find RB' })).toBeHidden();
        expect(await itemParts(lineupBox(page).locator('.lineup-needs-item'))).toEqual([WEEK13]);
        await fold.locator('summary').click();
        await expect(fold).toHaveAttribute('open', '');
        // Still open after the box is drawn again (a swap, a lock or Optimize redraws it).
        await lineupBox(page).evaluate(b => { b.dataset.before = '1'; });
        await page.locator('#lineupTab [data-action="optimizeLineup"]').click();
        await expect(lineupBox(page)).not.toHaveAttribute('data-before', '1');
        await expect(lineupBox(page).locator('details.lineup-needs-crunch')).toHaveAttribute('open', '');

        await page.locator('[data-action="setWaiverPos"][data-pos="ALL"]').evaluate(b => b.click());
        await lineupBox(page).getByRole('button', { name: 'Find RB' }).click();
        await expect(page.locator('#scoutTab [data-action="setWaiverPos"][data-pos="RB"]')).toHaveAttribute('aria-pressed', 'true');
        await expectClean(page, state);
    });

    test('beside a real to-do: the empty RB slot counts, the crunch doesn\'t', async ({ page }) => {
        const state = await open(page, 12, { bijan: false });
        await expect(todo(page).locator('.mls-needs-label')).toHaveText('Needs you');
        // Henry alone is short every week (the empty slot); his bye leaves the second RB slot short too in week 13.
        expect(await itemParts(todo(page).locator('.mls-needs-item'))).toEqual([{ head: 'RB slot is empty', list: [] },
            { head: 'Bye Crunch · Week 13: 1 starter short', list: ['RB: 1 short · Derrick Henry (BAL) on bye'] }]);
        await expect(card(page).locator('.mls-lc-count-todo')).toHaveText('1 to fix');
        await expect(page.locator('#lineupNeedsBox')).toContainText('1 lineup needs you · 1 to fix');
        await expectClean(page, state);
    });

    test('no byes in the next 2 weeks (week 2): no Bye Crunch anywhere', async ({ page }) => {
        const state = await open(page, 2);
        await expect(page.locator('.is-crunch')).toHaveCount(0);
        await showTab(page, 'lineup');
        await expect(page.locator('.is-crunch')).toHaveCount(0);
        await expectClean(page, state);
    });
});

// S34's leftover. James Cook (BUF, bye week 7) is a free agent and, by this file, RB5 ahead of your Derrick Henry RB8
// (tests/mls-waiver-status.spec.mjs). Sleeper's week is 6. On Sunday of week 6 he'd start for you; on Tuesday, once
// week 6's games are over, the check is about week 7, when he's on bye: not an upgrade.
const UPGRADE_CSV = WAIVER_RANKINGS_CSV
    .replace('15,Derrick Henry,RB,BAL,3,7', '26,Derrick Henry,RB,BAL,4,7')
    .replace('26,James Cook,RB,BUF,4,7', '15,James Cook,RB,BUF,3,7');
const SUNDAY = new Date('2026-10-18T17:00:00Z');
const TUESDAY = new Date('2026-10-20T15:00:00Z');
const KICKOFFS = { BUF: '2026-10-18T20:25:00Z', BAL: '2026-10-18T20:25:00Z', CIN: '2026-10-18T17:00:00Z' };

async function waiverSetup(page) {
    const state = await openApp(page, '/lineup/', { beforeGoto: (p) => routeWeek(p, 6, { bijan: false }) });
    // One RB slot, so Henry is the starter Cook is measured against.
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => {
        const league = fixture('league.json');
        league.roster_positions.splice(league.roster_positions.indexOf('RB'), 1);
        return route.fulfill({ json: league });
    });
    await seedMls(page);
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await page.setInputFiles('#weeklyFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(UPGRADE_CSV) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
    return state;
}
async function setKickoffs(page) {
    await page.evaluate(async (k) => {
        const { State } = await import('/js/mls/state.js');
        State.gameTimesByTeam = { ...State.gameTimesByTeam, ...k };
        State.gameTimesFetchedForWeek = State.currentNflWeek;
    }, KICKOFFS);
}
async function autoFindCook(page) {
    await showTab(page, 'scout');
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', 'lineup');
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    return page.locator('#waiverOutput .mls-scan-card').filter({ hasText: 'James Cook' });
}
const upgradeCount = (page) => card(page).locator('.mls-lc-count-upgrades');

test.describe('Waiver tools on Tuesday read next week\'s byes (S52, S34\'s leftover)', () => {
    test('Sunday of week 6: Cook would start for you', async ({ page }) => {
        const state = await waiverSetup(page);
        await page.clock.setFixedTime(SUNDAY);
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(upgradeCount(page)).toHaveText('1 upgrade');
        await expect(await autoFindCook(page)).toContainText('Would Start');
        await expectClean(page, state);
    });

    test('Tuesday after week 6: Cook is on bye in week 7, so he isn\'t an upgrade', async ({ page }) => {
        const state = await waiverSetup(page);
        await page.clock.setFixedTime(TUESDAY);
        await setKickoffs(page);
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        // Once the week is over the flag reads "No upgrade" (S34 round 4), and nothing is counted.
        await expect(card(page).locator('.mls-lc-ba .mls-ba-flag')).toHaveText('No upgrade');
        await expect(upgradeCount(page)).toHaveText('');
        const cook = await autoFindCook(page);
        await expect(cook).toContainText('Bye');
        await expect(cook).toContainText('On bye next week - a stash, not a start.');
        await expect(cook).not.toContainText('Would Start');
        await expectClean(page, state);
    });
});
