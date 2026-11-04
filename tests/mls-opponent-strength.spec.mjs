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
// Lineup settings (under Optimize) is folded by default; open it to reach the matchup toggle.
async function openLineupSettings(page) {
    const details = page.locator('#lineupSettings');
    if (!(await details.evaluate(d => d.open))) await details.locator('> summary').click();
    await expect(page.locator('#matchupFlipRow')).toBeVisible();
}
const savedSoS = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_sos') || '{}'));
const lineupRow = (page, name) => page.locator('#lineupTab .lineup-slot').filter({ hasText: name });
const oppBadge = (page, name) => lineupRow(page, name).locator('.opp-rank-badge');

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

    test('with season SoS loaded, the Weekly card\'s switch is the Roster tab\'s: it flips both, and both show it', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await page.setInputFiles('#sosFileInput', { name: 'sos.csv', mimeType: 'text/csv', buffer: Buffer.from(['Team,QB,RB,WR,TE', 'BAL,15,25,32,17'].join('\n')) });
        await expect.poll(() => page.evaluate(() => localStorage.getItem('mls_sos'))).not.toBeNull();
        await showTab(page, 'lineup');
        await saveWeekly(page, WEEKLY_OPP_CSV, 30);
        await expect(page.locator('#lineupSettingsSummary')).toHaveText('FLEX kickoff: on · Matchups: 1 = easiest');
        await openLineupSettings(page);
        await expect(page.locator('#matchupFlipHint')).toHaveText('Also flips your season SoS.');

        await page.locator('#matchupReversedToggle').check();
        await expect(page.locator('.toast-message').filter({ hasText: 'Flipped: a 1 in your files now shows as 32 (hardest), for matchups and season SoS.' })).toBeVisible();
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText('@ SEA 18', { useInnerText: true });
        expect((await savedSoS(page)).BAL.RB).toBe('8');
        await showTab(page, 'roster');
        await expect(page.locator('#sosReversedToggle')).toBeChecked();
        // And back from the Roster tab.
        await page.locator('#sosReversedToggle').uncheck();
        expect((await savedSoS(page)).BAL.RB).toBe('25');
        await showTab(page, 'lineup');
        await expect(page.locator('#matchupReversedToggle')).not.toBeChecked();
        await expect(page.locator('#lineupSettingsSummary')).toHaveText('FLEX kickoff: on · Matchups: 1 = easiest');
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText('@ SEA 15', { useInnerText: true });

        await expectClean(page, state);
    });

    test('the Lineup tab shows each player\'s opponent and matchup rank, explained on tap, flipped by the SoS switch', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'lineup');

        await uploadWeekly(page, WEEKLY_OPP_CSV, 30, 'week2.csv');
        await expect(page.locator('#rankingsPreviewOppNote')).toBeVisible();
        await expect(page.locator('#rankingsPreviewOppNote')).toHaveText("This file also has this week's opponents and matchup ranks (1 = easiest, 32 = hardest). They show after the kickoff time on the Lineup tab and on Auto-Find's cards. Your season SoS isn't changed.");
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();

        // "@ SEA" in the file: an away game, the same on phones. On the badge line, where the kickoff time and the
        // opponent go (there's no scoreboard here, so no kickoff time).
        const henry = oppBadge(page, 'Derrick Henry');
        await expect(henry).toHaveText('@ SEA 15', { useInnerText: true });
        await expect(lineupRow(page, 'Derrick Henry').locator('.mls-player-badges-row .mls-game-info .opp-rank-badge')).toHaveCount(1);
        await expect(lineupRow(page, 'Derrick Henry').locator('.mls-player-row-meta .opp-rank-badge')).toHaveCount(0);
        await expect(henry).toHaveAttribute('title', 'This week at SEA: a middling matchup for RBs (15 of 32, where 1 = easiest). Reads backwards? Turn on "My matchup files rank 1 = hardest" in Lineup settings.');
        // Colored on the SoS scale: 1 green. Words for the ends.
        await expect(oppBadge(page, "Ja'Marr Chase")).toHaveText('vs KC 1', { useInnerText: true });
        expect(await oppBadge(page, "Ja'Marr Chase").getAttribute('style')).toContain('hsl(120, 80%, 65%)');
        await expect(oppBadge(page, "Ja'Marr Chase")).toHaveAttribute('title', /^This week vs KC: one of the easiest matchups for WRs \(1 of 32/);
        // A bare "NYJ" doesn't say home or away, and there's no scoreboard to ask: no guess.
        await expect(oppBadge(page, 'George Kittle')).toHaveText('NYJ 23', { useInnerText: true });
        await expect(oppBadge(page, 'George Kittle')).toHaveAttribute('title', /^This week against NYJ: a middling matchup for TEs/);
        // Kyren Williams's cells are blank and there's no scoreboard: nothing.
        await expect(lineupRow(page, 'Kyren Williams').locator('.mls-game-info')).toHaveCount(0);

        // A tap explains it.
        await henry.click();
        await expect(page.locator('.toast-message').filter({ hasText: 'This week at SEA: a middling matchup for RBs' })).toBeVisible();

        // Colored text, not a box: no background or border of its own, and a dotted underline.
        const look = await henry.evaluate(e => { const c = getComputedStyle(e); return { bg: c.backgroundColor, border: c.borderTopWidth, deco: c.textDecorationStyle }; });
        expect(look).toEqual({ bg: 'rgba(0, 0, 0, 0)', border: '0px', deco: 'dotted' });

        // No season SoS here, so the Roster tab has no switch; Lineup settings does. It flips the matchup ranks
        // (15 -> 18, 1 -> 32) without re-optimizing, and says so in the tip. Folded, its summary says what's set.
        await expect(page.locator('#lineupSettingsSummary')).toHaveText('FLEX kickoff: on · Matchups: 1 = easiest');
        await expect(page.locator('#matchupFlipRow')).toBeHidden();
        await openLineupSettings(page);
        await expect(page.locator('#matchupFlipHint')).toBeHidden();
        await page.locator('#matchupReversedToggle').check();
        await expect(page.locator('#lineupSettingsSummary')).toHaveText('FLEX kickoff: on · Matchups: 1 = hardest');
        await expect(page.locator('.toast-message').filter({ hasText: 'Flipped: a 1 in your file now shows as 32 (hardest).' })).toBeVisible();
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText('@ SEA 18', { useInnerText: true });
        await expect(oppBadge(page, "Ja'Marr Chase")).toHaveAttribute('title', "This week vs KC: one of the toughest matchups for WRs (32 of 32 with your file's order flipped, so 1 = easiest). Reads backwards? Turn on \"My matchup files rank 1 = hardest\" in Lineup settings.");
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_reversed'))).toBe('1');
        expect(await page.evaluate(() => localStorage.getItem('mls_sos'))).toBeNull();
        // Remembered.
        await page.reload();
        await showTab(page, 'lineup');
        await expect(page.locator('#matchupReversedToggle')).toBeChecked();
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText('@ SEA 18', { useInnerText: true });

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
        await expect(page.locator('#lineupTab .opp-rank-badge')).toHaveCount(0);
        // No matchup ranks: Lineup settings has only FLEX Kickoff.
        await expect(page.locator('#matchupFlipRow')).toBeHidden();
        await expect(page.locator('#lineupSettingsSummary')).toHaveText('FLEX kickoff: on');

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
        await expect(page.locator('#lineupTab .opp-rank-badge')).toHaveCount(0);

        // A ROS upload with the same columns never shows them.
        await page.setInputFiles('#rosFileInput', { name: 'ros.csv', mimeType: 'text/csv', buffer: Buffer.from(WEEKLY_OPP_CSV) });
        await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
        await expect(page.locator('#rankingsPreviewOppNote')).toBeHidden();
        await page.locator('#rankingsPreviewOverlay [data-action="cancelRankingsPreview"]').click();

        await expectClean(page, state);
    });

    test('with the scoreboard loaded, the badge takes the plain opponent\'s place after the kickoff time', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // ESPN's scoreboard: BAL at JAX, SF hosts NYJ, CIN hosts KC.
        const game = (home, away, date) => ({ date, status: { type: { state: 'pre' } }, competitions: [{ competitors: [
            { team: { abbreviation: home }, homeAway: 'home' }, { team: { abbreviation: away }, homeAway: 'away' }] }] });
        await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: { events: [
            game('JAX', 'BAL', '2026-09-20T17:00:00Z'), game('SF', 'NYJ', '2026-09-20T20:25:00Z'), game('CIN', 'KC', '2026-09-20T20:25:00Z'),
        ] } }));
        await page.reload();
        await seedMls(page);
        await showTab(page, 'lineup');
        // Before any Weekly file: the plain opponent after the kickoff time, as before.
        await saveWeekly(page, RANKINGS_CSV, 24);
        await expect(lineupRow(page, 'George Kittle').locator('.mls-game-info .mls-opp:not(.opp-rank-badge)')).toHaveText('vs NYJ');

        // A Matchup column and no Opp column: who and where from the scoreboard, the rank from the file, named once.
        const matchupOnly = WEEKLY_OPP_CSV.trim().split('\n').map(line => line.split(',').filter((_, i) => i !== 6).join(',')).join('\n');
        await saveWeekly(page, matchupOnly, 30);
        const kittleInfo = lineupRow(page, 'George Kittle').locator('.mls-game-info');
        await expect(kittleInfo.locator('.kickoff-badge')).toHaveCount(1);
        await expect(kittleInfo.locator('.opp-rank-badge')).toHaveText('vs NYJ 23', { useInnerText: true });
        await expect(kittleInfo.locator('.mls-opp:not(.opp-rank-badge)')).toHaveCount(0);
        await expect(oppBadge(page, 'Derrick Henry')).toHaveText('@ JAX 15', { useInnerText: true });

        // The full file: "@ SEA" for Henry, but the scoreboard says JAX, so his rank isn't shown beside JAX.
        await saveWeekly(page, WEEKLY_OPP_CSV, 30);
        await expect(oppBadge(page, 'Derrick Henry')).toHaveCount(0);
        await expect(lineupRow(page, 'Derrick Henry').locator('.mls-game-info .mls-opp:not(.opp-rank-badge)')).toHaveText('@ JAX');
        // Chase: the file's "vs KC" agrees with the scoreboard.
        await expect(oppBadge(page, "Ja'Marr Chase")).toHaveText('vs KC 1', { useInnerText: true });

        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !/espn/i.test(e)));
        await expectClean(page, state);
    });

    test('Auto-Find\'s cards show it when Rank By is Weekly, not ROS; Top Available never', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await saveWeekly(page, WEEKLY_OPP_CSV, 30);
        await showTab(page, 'scout');

        const out = page.locator('#waiverOutput');
        // Top Available stays a compact list (owner's choice).
        await expect(out.locator('.mls-ta-row').filter({ hasText: 'James Cook' })).toHaveCount(1);
        await expect(out.locator('.opp-rank-badge')).toHaveCount(0);

        // Auto-Find: James Cook (26), a free agent, "TB" in the file.
        await callApp(page, 'setWaiverMode', 'auto');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        const cook = out.locator('.mls-scan-card').filter({ hasText: 'James Cook' });
        await expect(cook.locator('.opp-rank-badge')).toHaveText('TB 26', { useInnerText: true });

        await page.selectOption('#waiverScanBasis', 'ros');
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out).toContainText('ROS');
        await expect(out.locator('.mls-scan-card').first()).toBeVisible();
        await expect(out.locator('.opp-rank-badge')).toHaveCount(0);

        await expectClean(page, state);
    });
});
