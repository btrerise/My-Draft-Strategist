// This week's opponent strength from a Weekly rankings file (improvements S31; js/mls/opponent.js, the parser's
// weekly option in js/shared/rankings/parse.js). A Weekly file's Opp column ("vs KC", "@ KC", "KC") and Matchup
// column (1 = easiest, 32 = hardest) show as a badge on the Lineup tab's rows and on the Waiver Wire Assistant's
// rows when Rank By is Weekly, only while the Weekly rankings are this week's. The SoS card's "My SoS files rank
// 1 = hardest" switch flips the number. First, the reproduction the card asked for: a Weekly file with a Matchup
// column used to be read as season strength of schedule and overwrite the Roster tab's SoS.
//
// fixtures/rankings-weekly-opponents.csv is rankings-waivers.csv plus Opp and Matchup: each row's Matchup is its
// rank (Ja'Marr Chase 1, Derrick Henry 15, George Kittle 23), the Opp cells rotate "vs X", "X" and "@ X", and Kyren
// Williams (24) has both blank.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, expectClean, showTab, seedMls, callApp, loadMlsRankings, RANKINGS_CSV, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const WEEKLY_OPP_CSV = readFileSync(new URL('./fixtures/rankings-weekly-opponents.csv', import.meta.url), 'utf8');
const savedSoS = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_sos') || '{}'));
const lineupRow = (page, name) => page.locator('#lineupTab .lineup-slot').filter({ hasText: name });
const oppBadge = (page, name) => lineupRow(page, name).locator('.opp-badge');

// rankings.csv plus an Opp and a Matchup column.
const WEEKLY_WITH_MATCHUP = RANKINGS_CSV.trim().split('\n')
    .map((line, i) => i === 0 ? `${line},Opp,Matchup` : `${line},vs KC,${30 - Number(line.split(',')[0])}`).join('\n');

async function uploadWeekly(page, csv, count, name = 'week2.csv') {
    await page.setInputFiles('#weeklyFileInput', { name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
}
async function saveWeekly(page, csv, count, name) {
    await uploadWeekly(page, csv, count, name);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

test.describe('Lineup Strategist: this week\'s opponent strength', () => {
    test('a Weekly file\'s Matchup column leaves the season SoS alone', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        // A season SoS from an SoS file: BAL RB 25, CIN WR 10.
        await page.setInputFiles('#sosFileInput', { name: 'sos.csv', mimeType: 'text/csv', buffer: Buffer.from(['Team,QB,RB,WR,TE', 'BAL,15,25,32,17', 'CIN,6,28,10,11'].join('\n')) });
        await expect.poll(() => page.evaluate(() => localStorage.getItem('mls_sos'))).not.toBeNull();
        const before = await savedSoS(page);
        const sourceBefore = await page.evaluate(() => localStorage.getItem('mls_sos_source'));

        await uploadWeekly(page, WEEKLY_WITH_MATCHUP, 24);
        // The preview no longer promises an SoS update; it says the file has this week's opponents.
        await expect(page.locator('#rankingsPreviewNote')).toBeHidden();
        await expect(page.locator('#rankingsPreviewOppNote')).toContainText("Your season SoS isn't changed.");
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();

        expect(await savedSoS(page)).toEqual(before);
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_source'))).toBe(sourceBefore);
        await showTab(page, 'roster');
        await expect(page.locator('#sosStatus')).toContainText('from sos.csv');
        await expect(page.locator('#rosterList .roster-item').filter({ hasText: 'Derrick Henry' }).locator('.sos-badge')).toContainText('25');

        await expectClean(page, state);
    });

    test('the Lineup tab shows each player\'s opponent and matchup rank, explained on tap, flipped by the SoS switch', async ({ page }, testInfo) => {
        const phone = testInfo.project.name === 'phone';
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'lineup');

        await uploadWeekly(page, WEEKLY_OPP_CSV, 30, 'week2.csv');
        await expect(page.locator('#rankingsPreviewOppNote')).toBeVisible();
        await expect(page.locator('#rankingsPreviewOppNote')).toHaveText("This file also has this week's opponents and matchup ranks (29 players), read as 1 = easiest, 32 = hardest. They show on the Lineup tab, and in the Waiver Wire Assistant when Rank By is Weekly, until next week's rankings. Your season SoS isn't changed.");
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();

        // "@ SEA" in the file: an away game. On phones and touch screens "vs" / "@" is dropped.
        const henry = oppBadge(page, 'Derrick Henry');
        await expect(henry).toHaveText(phone ? 'SEA 15' : '@ SEA 15', { useInnerText: true });
        await expect(henry).toHaveAttribute('title', 'This week: at SEA, matchup 15 of 32 for RBs (1 = easiest, 32 = hardest), from your Weekly rankings.');
        // Colored on the SoS scale: 1 green, 23 toward red.
        await expect(oppBadge(page, "Ja'Marr Chase")).toHaveText(phone ? 'KC 1' : 'vs KC 1', { useInnerText: true });
        expect(await oppBadge(page, "Ja'Marr Chase").getAttribute('style')).toContain('hsl(120, 80%, 65%)');
        // A bare "NYJ" doesn't say home or away, and there's no scoreboard here: "vs".
        await expect(oppBadge(page, 'George Kittle')).toHaveText(phone ? 'NYJ 23' : 'vs NYJ 23', { useInnerText: true });
        // In the meta line, after the rank.
        await expect(lineupRow(page, 'Derrick Henry').locator('.mls-player-row-meta .opp-badge')).toHaveCount(1);
        // Kyren Williams's cells are blank and there's no scoreboard: no badge.
        await expect(oppBadge(page, 'Kyren Williams')).toHaveCount(0);

        // A tap explains it.
        await henry.click();
        await expect(page.locator('.toast-message').filter({ hasText: 'This week: at SEA, matchup 15 of 32 for RBs' })).toBeVisible();

        // The SoS card's "My SoS files rank 1 = hardest" switch flips it: 15 -> 18.
        await showTab(page, 'roster');
        await page.evaluate(() => localStorage.setItem('mls_sos_reversed', '1'));
        await page.reload();
        await showTab(page, 'lineup');
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText(phone ? 'SEA 18' : '@ SEA 18', { useInnerText: true });
        await expect(oppBadge(page, 'Derrick Henry')).toHaveAttribute('title', /matchup 18 of 32 for RBs \(1 = easiest, 32 = hardest\) \(flipped: your SoS setting says your files rank 1 = hardest\)/);

        await expectClean(page, state);
    });

    test('nothing shows without the columns, or once the Weekly rankings are from an earlier week', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'lineup');

        // A Weekly file without the columns: no note, no badges.
        await uploadWeekly(page, RANKINGS_CSV, 24);
        await expect(page.locator('#rankingsPreviewOppNote')).toBeHidden();
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
        await expect(lineupRow(page, 'Derrick Henry')).toHaveCount(1);
        await expect(page.locator('#lineupTab .opp-badge')).toHaveCount(0);

        // With them, then a week later (the set's upload moved back past last Tuesday's start): gone.
        await saveWeekly(page, WEEKLY_OPP_CSV, 30);
        await expect(oppBadge(page, 'Derrick Henry')).toHaveCount(1);
        await page.evaluate(() => {
            const sets = JSON.parse(localStorage.getItem('mls_ranking_sets_weekly'));
            sets.forEach(s => { s.updatedAt -= 7 * 24 * 60 * 60 * 1000; });
            localStorage.setItem('mls_ranking_sets_weekly', JSON.stringify(sets));
        });
        await page.reload();
        await showTab(page, 'lineup');
        await expect(lineupRow(page, 'Derrick Henry')).toHaveCount(1);
        await expect(page.locator('#lineupTab .opp-badge')).toHaveCount(0);

        // A ROS upload with the same columns never shows them.
        await page.setInputFiles('#rosFileInput', { name: 'ros.csv', mimeType: 'text/csv', buffer: Buffer.from(WEEKLY_OPP_CSV) });
        await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
        await expect(page.locator('#rankingsPreviewOppNote')).toBeHidden();
        await page.locator('#rankingsPreviewOverlay [data-action="cancelRankingsPreview"]').click();

        await expectClean(page, state);
    });

    test('with a Matchup column and no Opp column, the opponent comes from this week\'s scoreboard', async ({ page }, testInfo) => {
        const phone = testInfo.project.name === 'phone';
        const state = await openApp(page, '/lineup/');
        // ESPN's scoreboard: BAL at JAX, SF hosts NYJ.
        await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: { events: [
            { date: '2026-09-20T17:00:00Z', status: { type: { state: 'pre' } }, competitions: [{ competitors: [
                { team: { abbreviation: 'JAX' }, homeAway: 'home' }, { team: { abbreviation: 'BAL' }, homeAway: 'away' }] }] },
            { date: '2026-09-20T20:25:00Z', status: { type: { state: 'pre' } }, competitions: [{ competitors: [
                { team: { abbreviation: 'SF' }, homeAway: 'home' }, { team: { abbreviation: 'NYJ' }, homeAway: 'away' }] }] },
        ] } }));
        await page.reload();
        await seedMls(page);
        await showTab(page, 'lineup');

        const matchupOnly = WEEKLY_OPP_CSV.trim().split('\n').map(line => line.split(',').filter((_, i) => i !== 6).join(',')).join('\n');
        await saveWeekly(page, matchupOnly, 30);
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText(phone ? 'JAX 15' : '@ JAX 15', { useInnerText: true });
        await expect(oppBadge(page, 'George Kittle')).toHaveText(phone ? 'NYJ 23' : 'vs NYJ 23', { useInnerText: true });
        // A team with no game on the scoreboard: no opponent to show.
        await expect(oppBadge(page, "Ja'Marr Chase")).toHaveCount(0);

        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !/espn/i.test(e)));
        await expectClean(page, state);
    });

    test('the Waiver Wire Assistant shows it when Rank By is Weekly, not ROS', async ({ page }, testInfo) => {
        const phone = testInfo.project.name === 'phone';
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await saveWeekly(page, WEEKLY_OPP_CSV, 30);
        await showTab(page, 'scout');

        const out = page.locator('#waiverOutput');
        const cookRow = out.locator('.mls-ta-row').filter({ hasText: 'James Cook' });
        // James Cook (26), a free agent: his Opp cell as the file has it.
        const cookCell = WEEKLY_OPP_CSV.split('\n').find(l => l.includes('James Cook')).split(',')[6];
        const cookOpp = cookCell.replace(/^(vs|@) /, '');
        const away = cookCell.startsWith('@');
        await expect(cookRow.locator('.opp-badge')).toHaveText(phone ? `${cookOpp} 26` : `${away ? '@' : 'vs'} ${cookOpp} 26`, { useInnerText: true });

        await page.selectOption('#waiverScanBasis', 'ros');
        await expect(out).toContainText('by ROS rank');
        await expect(out.locator('.opp-badge')).toHaveCount(0);
        await page.selectOption('#waiverScanBasis', 'weekly');
        await expect(out.locator('.mls-ta-row').filter({ hasText: 'James Cook' }).locator('.opp-badge')).toHaveCount(1);

        await expectClean(page, state);
    });
});
