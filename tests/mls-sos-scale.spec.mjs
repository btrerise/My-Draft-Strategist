// Lineup Strategist's SoS card (Roster tab): which end is easy, how old the SoS is, and the
// "My SoS files rank 1 = hardest" switch (improvements S7, round 5; js/mls/sos.js, js/mls/sosScale.js).
// The app reads SoS as 1 = easiest, 32 = hardest. The switch flips what's saved and every later SoS
// file, or SoS column in a ROS or Weekly rankings upload, to that scale. The card says when SoS was last
// uploaded (amber after 7 days) and warns when the numbers look like 1-5 ratings.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, FIXED_NOW, RANKINGS_CSV } from './helpers.mjs';

const status = (page) => page.locator('#sosStatus');
const flip = (page) => page.locator('#sosReversedToggle');
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_sos') || '{}'));
const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
const rosterBadge = (page, name) => page.locator('#rosterList .roster-item').filter({ hasText: name }).locator('.sos-badge');

async function uploadSoS(page, csv) {
    const before = await page.evaluate(() => localStorage.getItem('mls_sos_updated'));
    await page.evaluate(() => localStorage.removeItem('mls_sos'));
    await page.setInputFiles('#sosFileInput', { name: 'sos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mls_sos'))).not.toBeNull();
    return before;
}

// rankings.csv plus an SoS column: each row's SoS is its rank, so Ja'Marr Chase (CIN WR) carries 1 and
// Derrick Henry (BAL RB) 15.
const RANKINGS_WITH_SOS = RANKINGS_CSV.trim().split('\n').map((line, i) => i === 0 ? `${line},SoS` : `${line},${line.split(',')[0]}`).join('\n');

test.describe('Lineup Strategist SoS scale and age', () => {
    test('the card says which end is easy and how old the SoS is, and the switch flips it', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');

        // No SoS: the card is as it was. display: none, not just empty: an empty block with its margin
        // made the Roster tab's screenshot 12px taller.
        await expect(status(page)).toBeHidden();
        expect(await status(page).evaluate(e => getComputedStyle(e).display)).toBe('none');

        await uploadSoS(page, ['Team,QB,RB,WR,TE', 'BUF,2,3,4,5', 'BAL,15,25,32,17', 'CIN,6,28,10,11'].join('\n'));
        await expect(status(page)).toBeVisible();
        await expect(status(page)).toContainText('SoS updated today');
        await expect(status(page)).toContainText('1 = easiest, 32 = hardest');
        await expect(status(page).locator('.freshness-ok')).toBeVisible();
        await expect(flip(page)).not.toBeChecked();
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_updated'))).toBe(String(FIXED_NOW.getTime()));
        // The badge's tap text says when.
        await expect(rosterBadge(page, 'Derrick Henry')).toHaveAttribute('title', /^Strength of schedule: 25 of 32 for RBs on BAL \(1 = easiest, 32 = hardest\), as of \S+ 9\/15$/);

        // The switch flips what's saved (always 1 = easiest), remembers it, and leaves the date alone.
        await page.evaluate(() => localStorage.setItem('mls_sos_updated', '1'));
        await flip(page).check();
        await expect(toast(page, 'SoS flipped')).toBeVisible();
        let sos = await saved(page);
        expect(sos.BUF).toEqual({ QB: '31', RB: '30', WR: '29', TE: '28' });
        expect(sos.BAL.RB).toBe('8');
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_reversed'))).toBe('1');
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_updated'))).toBe('1');
        await expect(rosterBadge(page, 'Derrick Henry')).toHaveText('SoS: 8');
        await expect(page.locator('#sos_BUF_RB')).toHaveValue('30');

        // A file uploaded with the switch on is flipped on the way in.
        await uploadSoS(page, ['Team,QB,RB,WR,TE', 'BUF,1,32,16,4.5'].join('\n'));
        sos = await saved(page);
        expect(sos.BUF).toEqual({ QB: '32', RB: '1', WR: '17', TE: '28.5' });
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_updated'))).toBe(String(FIXED_NOW.getTime()));

        // Still on after a reload; turning it off flips back.
        await page.reload();
        await showTab(page, 'roster');
        await expect(flip(page)).toBeChecked();
        await flip(page).uncheck();
        sos = await saved(page);
        expect(sos.BUF).toEqual({ QB: '1', RB: '32', WR: '16', TE: '4.5' });
        expect(await page.evaluate(() => localStorage.getItem('mls_sos_reversed'))).toBe('0');

        await expectClean(page, state);
    });

    test('old SoS is flagged, and so are numbers that look like 1-5 ratings', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');

        // Eight days old: amber, with a nudge.
        await page.evaluate((now) => {
            localStorage.setItem('mls_sos', JSON.stringify({ BUF: { RB: '3' } }));
            localStorage.setItem('mls_sos_updated', String(now - 8 * 24 * 60 * 60 * 1000));
        }, FIXED_NOW.getTime());
        await page.reload();
        await showTab(page, 'roster');
        await expect(status(page).locator('.freshness-stale')).toHaveText('SoS updated 8 days ago - consider refreshing');

        // SoS saved before dates were kept.
        await page.evaluate(() => localStorage.removeItem('mls_sos_updated'));
        await page.reload();
        await showTab(page, 'roster');
        await expect(status(page)).toContainText('Upload date unknown');

        // A file of 1-5 ratings: a toast when it's uploaded, and a note that stays on the card.
        await uploadSoS(page, ['Team,QB,RB,WR,TE', 'BUF,1,2,3,4', 'MIA,5,4,3,2'].join('\n'));
        await expect(toast(page, 'look like 1-5 ratings')).toBeVisible();
        await expect(status(page).locator('.sos-status-warn')).toContainText('look like 1-5 ratings');
        await expect(status(page)).toContainText('SoS updated today');

        // The manual grid saves with today's date too, and real ranks clear the warning.
        await page.evaluate((now) => localStorage.setItem('mls_sos_updated', String(now - 3 * 24 * 60 * 60 * 1000)), FIXED_NOW.getTime());
        await page.reload();
        await showTab(page, 'roster');
        await expect(status(page)).toContainText('SoS updated 3 days ago');
        await page.locator('.sos-details-accordion summary', { hasText: 'Edit Manual SoS Grid' }).click();
        await expect(page.locator('.sos-grid-note')).toHaveText('Each team\'s matchup rank at each position: 1 = easiest, 32 = hardest.');
        await page.fill('#sos_BUF_QB', '20');
        await page.locator('[data-action="saveManualSoS"]').click();
        await expect(status(page)).toContainText('SoS updated today');
        await expect(status(page).locator('.sos-status-warn')).toHaveCount(0);

        await expectClean(page, state);
    });

    test('an SoS column in a ROS rankings upload follows the switch, and only once you save', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'roster');
        await page.evaluate(() => localStorage.setItem('mls_sos_reversed', '1'));
        await page.reload();
        await showTab(page, 'roster');

        const upload = async () => {
            await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_WITH_SOS) });
            await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
        };

        // The preview says it will be flipped. Cancelling leaves the SoS alone.
        await upload();
        await expect(page.locator('#rankingsPreviewNote')).toContainText('flipped to 1 = easiest, 32 = hardest');
        await page.locator('#rankingsPreviewOverlay [data-action="cancelRankingsPreview"]').click();
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
        expect(await saved(page)).toEqual({});
        await expect(status(page)).toBeHidden();

        // Saving merges it, flipped: Chase's 1 becomes 32, Henry's 15 becomes 18.
        await upload();
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
        const sos = await saved(page);
        expect(sos.CIN.WR).toBe('32');
        expect(sos.BAL.RB).toBe('18');
        await expect(status(page)).toContainText('SoS updated today');
        await expect(flip(page)).toBeChecked();
        await expect(rosterBadge(page, 'Derrick Henry')).toHaveText('SoS: 18');

        // With the switch off, the preview says how it will be read instead.
        await flip(page).uncheck();
        await upload();
        await expect(page.locator('#rankingsPreviewNote')).toContainText('read as 1 = easiest, 32 = hardest');
        await page.locator('#rankingsPreviewOverlay [data-action="cancelRankingsPreview"]').click();

        await expectClean(page, state);
    });
});
