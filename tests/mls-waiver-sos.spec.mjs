// Lineup Strategist Scout tab: the SoS badge in the Waiver Wire Assistant (improvements S7). The Roster
// tab's "SoS: 7" badge (getSoSBadgeHTML, js/mls/sos.js) also shows on Auto-Find cards and Check a List
// cards, and beside the player a free agent is compared against (Auto-Find's "Would need to pass ...",
// the Whole Roster drop candidate, Check a List's verdict). Owner's choices: last in the card's badges,
// not on the Dashboard; a tap explains it, and phones show a calendar icon and the number instead of
// "SoS: " (round 2); not on Top Available, a list to browse rather than to decide (round 3); and the
// Roster tab's badge works the same way (round 4). Display only: it's one grid, so the badge is the same
// for Weekly and ROS Rank By.
//
// The free agents in rankings-waivers.csv (refactor 3G): Jayden Daniels QB WAS, James Cook RB BUF, Chase
// Brown RB CIN, Jaxon Smith-Njigba WR SEA, Zay Flowers WR BAL, Sam LaPorta TE DET.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const CHASE_BROWN = '9224';

// A team-by-position grid (one of the upload's three shapes, tests/mls-sos.spec.mjs). CIN has a
// different RB and WR value, so Chase Brown (RB) and Ja'Marr Chase (WR) show which column is read.
const SOS_CSV = [
    'Team,QB,RB,WR,TE',
    'BUF,2,3,4,5', 'CIN,6,28,10,11', 'SEA,12,13,1,14', 'BAL,15,25,32,17', 'DET,18,19,20,16',
    'WAS,7,21,22,23', 'NYJ,24,26,27,29', 'DAL,8,9,30,31',
].join('\n');

const out = (page) => page.locator('#waiverOutput');
const sos = (loc) => loc.locator('.sos-badge');
const taRow = (page, name) => out(page).locator('.mls-ta-row').filter({ has: page.locator('.mls-ta-name', { hasText: name }) });
const scanCard = (page, name) => out(page).locator('.mls-scan-card').filter({ hasText: name });
const cardBadge = (page, name) => sos(scanCard(page, name).locator('.mls-player-badges-row'));
const listCard = (page, name) => out(page).locator('.scout-result-card').filter({ hasText: name });

async function uploadSoS(page) {
    await page.setInputFiles('#sosFileInput', { name: 'sos.csv', mimeType: 'text/csv', buffer: Buffer.from(SOS_CSV) });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mls_sos'))).not.toBeNull();
}

async function runAutoFind(page, compare) {
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', compare);
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    await expect(out(page).locator('.mls-scan-card').first()).toBeVisible();
}

async function runCheckList(page, names) {
    await callApp(page, 'setWaiverMode', 'list');
    await callApp(page, 'setWaiverCompare', 'roster');
    await page.fill('#waiverInput', names.join('\n'));
    await page.click('#waiverScanBtn');
    await expect(out(page).locator('.scout-result-card').first()).toBeVisible();
}

test.describe('Lineup Strategist SoS badge in the Waiver Wire Assistant', () => {
    test('shows each player\'s SoS in Auto-Find and Check a List, not in Top Available, and nothing without SoS', async ({ page }, testInfo) => {
        const isPhone = testInfo.project.name === 'phone';
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);

        // No SoS loaded: no badge anywhere in the tool.
        await showTab(page, 'scout');
        await runAutoFind(page, 'lineup');
        await expect(sos(out(page))).toHaveCount(0);
        await runCheckList(page, ['James Cook', "Ja'Marr Chase"]);
        await expect(sos(out(page))).toHaveCount(0);

        await uploadSoS(page);

        // Top Available never shows it (owner's choice, round 3), with SoS loaded too.
        await callApp(page, 'setWaiverMode', 'top');
        await expect(taRow(page, 'James Cook')).toBeVisible();
        await expect(sos(out(page))).toHaveCount(0);

        // Auto-Find, Starting Lineup: each free agent's value for his own team and position, last in the
        // card's badge row.
        await runAutoFind(page, 'lineup');
        const expected = { 'Jayden Daniels': 7, 'James Cook': 3, 'Chase Brown': 28, 'Jaxon Smith-Njigba': 1, 'Zay Flowers': 32, 'Sam LaPorta': 16 };
        for (const [name, value] of Object.entries(expected)) {
            await expect(cardBadge(page, name)).toHaveText(`SoS: ${value}`);
        }
        const cook = cardBadge(page, 'James Cook');
        expect(await scanCard(page, 'James Cook').locator('.mls-player-badges-row > :last-child').getAttribute('class')).toMatch(/\bsos-badge\b/);
        const cookTip = 'Strength of schedule: 3 of 32 for RBs on BUF (1 = easiest, 32 = hardest)';
        await expect(cook).toHaveAttribute('title', cookTip);
        await expect(cook).toHaveAttribute('aria-label', cookTip);
        await expect(cook).toHaveClass(/\bsos-badge-compact\b/);
        // Phones and touch screens: a calendar icon and the number. Desktop: "SoS: 3", no icon.
        await expect(cook).toHaveText(isPhone ? '3' : 'SoS: 3', { useInnerText: true });
        const icon = cook.locator('svg.sos-badge-icon');
        await expect(icon).toHaveAttribute('aria-hidden', 'true');
        await expect(icon).toHaveAttribute('stroke', 'currentColor');
        if (isPhone) await expect(icon).toBeVisible(); else await expect(icon).toBeHidden();
        // A tap (or click) says what it is, since phones have no hover.
        await cook.click();
        await expect(page.locator('.toast-message').filter({ hasText: cookTip })).toBeVisible();
        // 1 is green, 32 is red, as on the Roster tab.
        await expect(cardBadge(page, 'Jaxon Smith-Njigba')).toHaveCSS('color', 'rgb(94, 237, 94)');
        const red = await cardBadge(page, 'Zay Flowers').evaluate(e => getComputedStyle(e).color.match(/\d+/g).map(Number));
        expect(red[0]).toBeGreaterThan(200);
        expect(red[1]).toBeLessThan(110);

        // Beside the starter he'd have to pass.
        const daniels = scanCard(page, 'Jayden Daniels');
        await expect(daniels.locator('.mls-scan-verdict')).toContainText('Would need to pass Josh Allen');
        await expect(sos(daniels.locator('.mls-scan-verdict'))).toHaveText('SoS: 2');
        await expect(sos(daniels.locator('.mls-scan-verdict'))).toHaveText(isPhone ? '2' : 'SoS: 2', { useInnerText: true });
        await expect(sos(scanCard(page, 'Jaxon Smith-Njigba').locator('.mls-scan-verdict'))).toHaveText('SoS: 30');

        // One grid, not split by Weekly and ROS: Rank By ROS shows the same badges.
        await page.selectOption('#waiverScanBasis', 'ros');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out(page)).toContainText('by ROS rank');
        await expect(cardBadge(page, 'James Cook')).toHaveText('SoS: 3');
        await expect(cardBadge(page, 'Zay Flowers')).toHaveText('SoS: 32');
        await page.selectOption('#waiverScanBasis', 'weekly');

        // Auto-Find, Whole Roster: beside the drop candidate.
        await callApp(page, 'setWaiverCompare', 'roster');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const henry = out(page).locator('.mls-scan-benchmark').filter({ hasText: 'Your weakest RB is Derrick Henry' });
        await expect(sos(henry)).toHaveText('SoS: 25');
        await expect(sos(out(page).locator('.mls-scan-benchmark').filter({ hasText: 'Your weakest WR is Garrett Wilson' }))).toHaveText('SoS: 27');

        // Check a List: on the name line of every listed player Sleeper knows a team for, whoever has
        // him, and beside the player he's compared with. A kicker gets none (the grid has no K).
        await runCheckList(page, ['James Cook', "Ja'Marr Chase", 'Justin Tucker']);
        await expect(sos(listCard(page, 'James Cook'))).toHaveText(['SoS: 3', 'SoS: 25']);
        await expect(listCard(page, 'James Cook').locator('.mls-scan-verdict')).toContainText("Doesn't pass Derrick Henry");
        await expect(sos(listCard(page, "Ja'Marr Chase"))).toHaveText('SoS: 10');
        await expect(listCard(page, 'Justin Tucker')).toBeVisible();
        await expect(sos(listCard(page, 'Justin Tucker'))).toHaveCount(0);

        // The Roster tab's badge is the same badge (owner's choice, round 4: one look across the site):
        // its usual size (not compact), the calendar icon and number on phones, and a tap explains it.
        await showTab(page, 'roster');
        const rosterHenry = page.locator('#rosterList .roster-item').filter({ hasText: 'Derrick Henry' }).locator('.sos-badge');
        const henryTip = 'Strength of schedule: 25 of 32 for RBs on BAL (1 = easiest, 32 = hardest)';
        await expect(rosterHenry).toHaveText(isPhone ? '25' : 'SoS: 25', { useInnerText: true });
        await expect(rosterHenry).not.toHaveClass(/\bsos-badge-compact\b/);
        await expect(rosterHenry).toHaveAttribute('title', henryTip);
        if (isPhone) await expect(rosterHenry.locator('svg.sos-badge-icon')).toBeVisible();
        else await expect(rosterHenry.locator('svg.sos-badge-icon')).toBeHidden();
        await rosterHenry.click();
        await expect(page.locator('.toast-message').filter({ hasText: henryTip })).toBeVisible();

        await expectClean(page, state);
    });

    test('no badge for a free agent without an NFL team', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Registered after openApp's routes, so this answers first.
        await page.route(/api\.sleeper\.app\/v1\/players\/nfl$/, (route) => {
            const players = JSON.parse(fixture('players-nfl.json'));
            players[CHASE_BROWN].team = null;
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(players) });
        });
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await uploadSoS(page);

        await showTab(page, 'scout');
        await runAutoFind(page, 'lineup');
        await expect(cardBadge(page, 'James Cook')).toHaveText('SoS: 3');
        await expect(scanCard(page, 'Chase Brown')).toContainText('No Team');
        await expect(sos(scanCard(page, 'Chase Brown'))).toHaveCount(0);

        await expectClean(page, state);
    });
});
