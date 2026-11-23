// Who should I drop? (improvements S54). The Roster tab badges your three most droppable players "Drop 1" to "Drop 3"
// (tap for the reasons), and Auto-Find's Whole Roster lens takes its drop candidate from the same order.
//
// The fixture league's roster (fixtures/sleeper/) is stacked at WR: seven of the rankings' top 21 WRs, starting two
// (plus FLEX). Garrett Wilson (ROS #21, WR7 on your team, tier 4 while your starters are tier 1) is the clear first
// drop. The bye case sets the week to 6, CIN's bye, so Ja'Marr Chase (your WR1) is missing from a Weekly file.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, loadMlsRankings, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const N = WAIVER_RANKINGS_CSV.trim().split('\n').length - 1;
const WEEKLY_NO_CHASE = WAIVER_RANKINGS_CSV.split('\n').filter(l => !l.includes("Ja'Marr Chase")).join('\n');
const row = (page, name) => page.locator('#rosterList .roster-item').filter({ hasText: name });

async function uploadWeekly(page, csv, count) {
    await page.setInputFiles('#weeklyFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

async function autoFindWR(page) {
    await showTab(page, 'scout');
    await callApp(page, 'setWaiverPos', 'WR');
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', 'roster');
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    const bench = page.locator('#waiverOutput .mls-scan-benchmark').first();
    await expect(bench).toBeVisible();
    return bench;
}

test.describe('Lineup Strategist: who should I drop?', () => {
    test('no rankings: no drop badges', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');
        await expect(row(page, 'Garrett Wilson')).toBeVisible();
        await expect(page.locator('.mls-drop-badge')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('the clear drop gets Drop 1, its sheet says why, and Auto-Find names the same player', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, N);
        await showTab(page, 'roster');
        await expect(page.locator('#rosterList .mls-drop-badge')).toHaveCount(3);
        const badge = row(page, 'Garrett Wilson').locator('.mls-drop-badge');
        await expect(badge).toHaveText('Drop 1');
        // Starters never carry one.
        for (const name of ["Ja'Marr Chase", 'Josh Allen', 'Brock Bowers']) await expect(row(page, name).locator('.mls-drop-badge')).toHaveCount(0);

        await badge.click();
        const sheet = page.locator('.sheet');
        await expect(sheet).toBeVisible();
        // Round 3: the verdict in plain words first, the facts once under it, no scores.
        await expect(sheet.locator('.mls-drop-lead')).toHaveText("Garrett Wilson is your number 1 drop. Your 7th WR, so he won't start for you; ranked outside the league's starting WRs; your WR room is the league's best.");
        await expect(sheet.locator('.mls-drop-facts')).toHaveText("WR7 on your team · ROS WR10 · you're 1st of 2 at WR");
        await expect(sheet.locator('.mls-drop-list li.is-current')).toContainText('Garrett Wilson');
        await expect(sheet.locator('.mls-drop-list')).not.toContainText("room is the league's best");
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();

        const bench = await autoFindWR(page);
        await expect(bench).toContainText('Drop first at WR: Garrett Wilson (Wk WR10 · T4).');
        await expect(bench.locator('.mls-scan-benchmark-why')).toHaveText("Your 7th WR, so he won't start for you; ranked outside the league's starting WRs; your WR room is the league's best.");
        await expect(bench).toContainText('Next drops:');
        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test("the sheet's Find his replacement opens Auto-Find, Whole Roster, at his position", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, N);
        await showTab(page, 'roster');
        await row(page, 'Garrett Wilson').locator('.mls-drop-badge').click();
        await page.locator('.sheet').getByRole('button', { name: 'Find his replacement' }).click();
        await expect(page.locator('.sheet')).toBeHidden();
        await expect(page.locator('#scoutTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#waiverOutput .mls-scan-benchmark')).toContainText('Drop first at WR: Garrett Wilson');
        // Scrolled to the answer (round 4).
        await expect(page.locator('#waiverOutput')).toBeInViewport();
        await expect.poll(() => page.evaluate(() => window.scrollY), 'scrolled down to the results').toBeGreaterThan(200);
        await expect(page.locator('#waiverModeToggle [data-mode="auto"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-compare="roster"]')).toHaveAttribute('aria-pressed', 'true');
        await expectClean(page, state);
    });

    test('a locked player is never suggested; the sheet names him', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, N);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
            const wilson = league.roster.find(p => p.name === 'Garrett Wilson');
            State.lockedPlayersMap[league.leagueId] = [wilson.id];
        });
        await showTab(page, 'roster');
        await expect(page.locator('#rosterList .mls-drop-badge')).toHaveCount(3);
        await expect(row(page, 'Garrett Wilson').locator('.mls-drop-badge')).toHaveCount(0);
        await page.locator('#rosterList .mls-drop-badge').filter({ hasText: 'Drop 1' }).click();
        await expect(page.locator('.sheet')).toContainText('Not suggested: Garrett Wilson (you locked him).');
        await expectClean(page, state);
    });

    test('a starter on bye is not suggested (Weekly leaves him out)', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        // Weekly only, without Chase: before S54 he was "unranked", the weakest WR, and Auto-Find's drop.
        await uploadWeekly(page, WEEKLY_NO_CHASE, N - 1);
        await page.evaluate(async () => { (await import('/js/mls/state.js')).State.currentNflWeek = 6; });
        await showTab(page, 'roster');
        await expect(page.locator('#rosterList .mls-drop-badge')).toHaveCount(3);
        await expect(row(page, "Ja'Marr Chase").locator('.mls-drop-badge')).toHaveCount(0);

        const bench = await autoFindWR(page);
        await expect(bench).not.toContainText("is Ja'Marr Chase");
        await expect(bench).toContainText("Not suggested: Ja'Marr Chase (on bye, not in your rankings this week).");
        await expectClean(page, state);
    });

    test('Out players count (round 2): an Out bench WR is the drop on both screens, an Out star is not', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.route(/api\.sleeper\.app\/v1\/players\/nfl$/, (route) => {
            const players = JSON.parse(readFileSync(new URL('./fixtures/sleeper/players-nfl.json', import.meta.url), 'utf8'));
            players['7523'].injury_status = 'Out';   // Garrett Wilson
            players['4866'].injury_status = 'Out';   // Ja'Marr Chase
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(players) });
        });
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, N);
        await showTab(page, 'roster');
        await expect(row(page, 'Garrett Wilson').locator('.mls-drop-badge')).toHaveText('Drop 1');
        await expect(row(page, "Ja'Marr Chase").locator('.mls-drop-badge')).toHaveCount(0);

        const bench = await autoFindWR(page);
        await expect(bench).toContainText('Drop first at WR: Garrett Wilson');
        await expect(bench).toContainText('Out this week');
        await expect(bench).not.toContainText('Not counted');
        await expectClean(page, state);
    });

    test('a manual league is judged as 12 teams, not as the one roster it knows (round 4)', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, N);
        const verdicts = await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const { dropPicksFor } = await import('/js/mls/scout/dropPicks.js');
            const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
            const of = (l) => dropPicksFor(l).picks.find(x => x.player.name === 'Garrett Wilson').verdict;
            return { synced: of(league), manual: of({ ...league, leagueId: 'manual_test', username: 'Manual' }) };
        });
        // The fixture league has 2 teams, so WR10 is past its starters; in a 12-team league he isn't.
        expect(verdicts.synced).toContain("ranked outside the league's starting WRs");
        expect(verdicts.manual).not.toContain('ranked outside');
        await expectClean(page, state);
    });

    test('Sleeper trending adds failing still leaves the drop badges', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.route(/sleeper\.app\/v1\/players\/nfl\/trending\/add/, (route) => route.fulfill({ status: 500, body: '' }));
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, N);
        await showTab(page, 'roster');
        await expect(row(page, 'Garrett Wilson').locator('.mls-drop-badge')).toHaveText('Drop 1');
        await expectClean(page, state);
    });
});
