// Position counts on the Roster tab (improvements S9): a chip per position above the list ("All 14",
// "QB 1", "WR 7"...), counting taxi and IR players and noting them, that follow every roster change
// (remove, add, sync, league switch) and filter the list to one position when tapped.
//
// Your Fixture League roster: QB 1 (Allen), RB 1 (Henry), WR 7, TE 3, K 1, DEF 1; slots QB 1, RB 2,
// WR 2, TE 1, FLEX 1, K 1, DEF 1.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID } from './helpers.mjs';

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
        // ...but less than the Waiver Wire's chips (0.35), so the other counts stay readable.
        expect(await chip(page, 'TE').evaluate(e => getComputedStyle(e).opacity)).toBe('0.6');
        expect(await chip(page, 'WR').evaluate(e => getComputedStyle(e).opacity)).toBe('1');
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

    test('with the keyboard, focus stays on the chosen chip', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');
        const focusedPos = () => page.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pos || null : null);

        await chip(page, 'TE').focus();
        await page.keyboard.press('Enter');
        await expect(rows(page)).toHaveCount(3);
        expect(await focusedPos()).toBe('TE');
        await page.keyboard.press('Space'); // the same chip again: everyone
        await expect(rows(page)).toHaveCount(14);
        expect(await focusedPos()).toBe('TE');
        await page.keyboard.press('Shift+Tab'); // WR, QB... and All, each pressed in turn
        expect(await focusedPos()).toBe('WR');
        await page.keyboard.press('Enter');
        await expect(rows(page)).toHaveCount(7);
        expect(await focusedPos()).toBe('WR');
        await chip(page, 'ALL').focus();
        await page.keyboard.press('Enter');
        await expect(rows(page)).toHaveCount(14);
        expect(await focusedPos()).toBe('ALL');
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
        await expect(chip(page, 'RB').locator('.mls-poscount-note')).toHaveText(['1 IR']);
        // One note per line, so a narrow phone chip never splits "1 taxi".
        await expect(chip(page, 'TE').locator('.mls-poscount-note')).toHaveText(['1 IR', '1 taxi']);
        const [irNote, taxiNote] = await chip(page, 'TE').locator('.mls-poscount-note').evaluateAll(els => els.map(e => e.getBoundingClientRect()));
        expect(taxiNote.top).toBeGreaterThanOrEqual(irNote.bottom - 1);
        for (const r of [irNote, taxiNote]) expect(r.height).toBeLessThan(20); // each on one line

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

        // A tap on the badge explains it (phones have no hover), like the SoS and rank-change chips.
        await row('Justin Jefferson').locator('.ir-slot-badge').click();
        await expect(page.locator('.toast-message').filter({ hasText: "In your IR slot on Sleeper. A player there can't start until you move him out of it." })).toBeVisible();
        await row('George Kittle').locator('.ir-slot-badge').click();
        await expect(page.locator('.toast-message').filter({ hasText: 'In your IR slot on Sleeper, and on NFL injured reserve.' })).toBeVisible();
        await expect(row('George Kittle').locator('.ir-slot-badge')).toHaveAttribute('title', /and on NFL injured reserve/);

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

    test('the Lineup tab shows the IR badge too, on bench and starter rows', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // In your IR slot: Jefferson (Out), Kittle (NFL IR) and Chase (healthy). Out and IR players
        // are never started, so the first two sit on the bench; Chase can still be picked to start
        // (keeping IR-slot players out of the starters is a later decision, see LOG S9 round 2).
        const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
        await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
            const players = fixture('players-nfl.json');
            players['6794'].injury_status = 'Out';
            players['4217'].injury_status = 'IR';
            return route.fulfill({ json: players });
        });
        await page.route(/sleeper\.app\/v1\/league\/\d+\/rosters$/, route => {
            const rosters = fixture('league-rosters.json');
            rosters[0].reserve = ['6794', '4217', '4866'];
            return route.fulfill({ json: rosters });
        });
        await seedMls(page);
        await showTab(page, 'lineup');

        const slot = (name) => page.locator('#lineupTab .lineup-slot').filter({ hasText: name });
        const bench = page.locator('#benchContainer');
        await expect(bench.locator('.lineup-slot').filter({ hasText: 'Justin Jefferson' }).locator('.ir-slot-badge')).toHaveText('IR');
        await expect(slot('Justin Jefferson').locator('.inj-badge')).toHaveText('OUT');
        await expect(bench.locator('.lineup-slot').filter({ hasText: 'George Kittle' }).locator('.ir-slot-badge')).toHaveText('IR');
        await expect(slot('George Kittle').locator('.inj-badge')).toHaveCount(0);
        // Chase is starting: his row says he's in the IR slot.
        await expect(bench.locator('.lineup-slot').filter({ hasText: "Ja'Marr Chase" })).toHaveCount(0);
        await expect(slot("Ja'Marr Chase").locator('.ir-slot-badge')).toHaveText('IR');
        await expect(page.locator('#lineupTab .ir-slot-badge')).toHaveCount(3);

        // Starting him is the app's prompt to activate him (owner's decision, round 6): a line above the
        // lineup says so, and his badge says what to do. Bench badges keep their wording.
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(1);
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveText("Ja'Marr Chase is in your IR slot on Sleeper. Move him to your active roster there before kickoff to start him.");
        await slot("Ja'Marr Chase").locator('.ir-slot-badge').click();
        await expect(page.locator('.toast-message').filter({ hasText: 'In your IR slot on Sleeper. Move him to your active roster there to start him.' })).toBeVisible();
        await expect(bench.locator('.lineup-slot').filter({ hasText: 'Justin Jefferson' }).locator('.ir-slot-badge')).toHaveAttribute('title', "In your IR slot on Sleeper. A player there can't start until you move him out of it.");
        await expectClean(page, state);
    });

    test('the Lineup tab puts IR-slot players at the bottom of the bench, above the taxi squad', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // Jefferson (Out) and Kittle (NFL IR) in your IR slot, McBride on taxi; rankings loaded so the
        // bench has a real order.
        const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
        await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
            const players = fixture('players-nfl.json');
            players['6794'].injury_status = 'Out';
            players['4217'].injury_status = 'IR';
            return route.fulfill({ json: players });
        });
        await page.route(/sleeper\.app\/v1\/league\/\d+\/rosters$/, route => {
            const rosters = fixture('league-rosters.json');
            rosters[0].reserve = ['6794', '4217'];
            rosters[0].taxi = ['7553'];
            return route.fulfill({ json: rosters });
        });
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');

        // The bench top to bottom: player last names and the two dividers.
        const benchOrder = () => page.locator('#benchContainer').evaluate(el => [...el.querySelectorAll('.lineup-slot, .bench-taxi-divider')]
            .map(e => e.classList.contains('bench-taxi-divider') ? `-- ${e.textContent.trim()} --` : e.querySelector('.player-name-wrap').firstChild.textContent.replace(/\s*\(\d+\)\s*$/, '').trim()));
        const before = await benchOrder();
        const ir = before.indexOf('-- Injured Reserve --');
        const taxi = before.indexOf('-- Taxi Squad --');
        expect(ir).toBeGreaterThan(0); // healthy bench players first
        expect(before.slice(ir + 1, taxi).sort()).toEqual(['George Kittle', 'Justin Jefferson']);
        expect(before.slice(taxi + 1)).toEqual(['Trey McBride']);
        const benchRow = (name) => page.locator('#benchContainer .lineup-slot').filter({ hasText: name });
        await expect(benchRow('Justin Jefferson').locator('.slot-badge')).toHaveText('IR');
        await expect(benchRow('Trey McBride').locator('.slot-badge')).toHaveText('TX');
        await expect(benchRow(before[0]).locator('.slot-badge')).toHaveText('BN');
        // Nobody in the IR slot is starting, so no activation line.
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(0);

        // Swap Jefferson into a WR slot: the WR he replaces joins the healthy bench, not the IR group.
        const wrStarter = page.locator('#lineupTab .lineup-slot').filter({ has: page.locator('.slot-badge.slot-WR') }).first();
        const benched = (await wrStarter.locator('.player-name-wrap').evaluate(e => e.firstChild.textContent)).replace(/\s*\(\d+\)\s*$/, '').trim();
        await benchRow('Justin Jefferson').locator('[data-action="initiateSwap"]').click();
        await wrStarter.locator('[data-action="initiateSwap"]').click();
        await expect(benchRow('Justin Jefferson')).toHaveCount(0);
        // Now he's starting (a manual swap). He's Out as well as in the IR slot, so the red injury warning names
        // him and the purple activation line doesn't: no "move him to your active roster" for a player who's out
        // (improvements S11, round 3).
        await expect(page.locator('#lineupTab .lineup-injury-warning:not(.lineup-ir-warning)')).toContainText('Justin Jefferson is OUT');
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(0);
        const after = await benchOrder();
        expect(after.indexOf(benched)).toBeGreaterThan(-1);
        expect(after.indexOf(benched)).toBeLessThan(after.indexOf('-- Injured Reserve --'));
        expect(after.slice(after.indexOf('-- Injured Reserve --') + 1, after.indexOf('-- Taxi Squad --'))).toEqual(['George Kittle']);
        await expectClean(page, state);
    });

    test("the lineup PNG export leaves out the warnings above the lineup but keeps the rows' badges", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // html2canvas from tests/node_modules (helpers.mjs aborts the CDN), wrapped to record what the app's
        // onclone leaves in the copy it draws.
        const record = `;(() => { const original = window.html2canvas; window.html2canvas = (el, o = {}) => original(el, { ...o,
            onclone: async (doc) => { if (o.onclone) await o.onclone(doc); const c = doc.getElementById('optimalLineupContainer');
                window.__irExport = { warnings: c.querySelectorAll('.lineup-injury-warning').length, irBadges: c.querySelectorAll('.ir-slot-badge').length,
                    injuryBadges: c.querySelectorAll('.inj-badge').length }; } }); })();`;
        const html2canvas = readFileSync(new URL('./node_modules/html2canvas/dist/html2canvas.min.js', import.meta.url), 'utf8') + record;
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: html2canvas }));
        const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
        await page.route(/sleeper\.app\/v1\/league\/\d+\/rosters$/, route => {
            const rosters = fixture('league-rosters.json');
            rosters[0].reserve = ['4866']; // Chase: healthy, in the IR slot, starting
            return route.fulfill({ json: rosters });
        });
        await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
            const players = fixture('players-nfl.json');
            players['4984'].injury_status = 'Doubtful'; // Allen, your only QB: starts, with the red warning
            return route.fulfill({ json: players });
        });
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        await expect(page.locator('#lineupTab .lineup-ir-warning')).toHaveCount(1);
        await expect(page.locator('#lineupTab .lineup-injury-warning:not(.lineup-ir-warning)')).toContainText('Josh Allen');

        const download = page.waitForEvent('download');
        await page.locator('#exportBtn').click();
        await download;
        expect(await page.evaluate(() => window.__irExport)).toEqual({ warnings: 0, irBadges: 1, injuryBadges: 1 });
        // Only the image changes: the page still shows both warnings.
        await expect(page.locator('#lineupTab .lineup-injury-warning')).toHaveCount(2);
        await expectClean(page, state);
    });
});
