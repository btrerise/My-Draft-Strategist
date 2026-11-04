// This week's opponent strength from a Weekly rankings file (improvements S31).
// First, the reproduction the card asked for: a Weekly file with a "Matchup" column (one week's
// opponent rank) used to be read as season strength of schedule and overwrite the Roster tab's SoS.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, RANKINGS_CSV } from './helpers.mjs';

const savedSoS = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_sos') || '{}'));

// rankings.csv plus this week's opponent and a Matchup rank (each row's Matchup is 30 minus its rank,
// so Ja'Marr Chase (CIN WR) carries 29 and Derrick Henry (BAL RB) 15).
const WEEKLY_WITH_MATCHUP = RANKINGS_CSV.trim().split('\n')
    .map((line, i) => i === 0 ? `${line},Opp,Matchup` : `${line},vs KC,${30 - Number(line.split(',')[0])}`).join('\n');

async function uploadWeekly(page, csv, name = 'week2.csv') {
    await page.setInputFiles('#weeklyFileInput', { name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
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

        await uploadWeekly(page, WEEKLY_WITH_MATCHUP);
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();

        expect(await savedSoS(page)).toEqual(before);
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_source'))).toBe(sourceBefore);
        await showTab(page, 'roster');
        await expect(page.locator('#sosStatus')).toContainText('from sos.csv');

        await expectClean(page, state);
    });
});
