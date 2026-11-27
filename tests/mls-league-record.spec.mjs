// A league card's record and place beside its name, and a dynasty or keeper league's Competing / Rebuilding badge
// (improvements S51). The record is league.record as stored at the last sync; the badge is the Roster tab's
// "I'm competing this year" switch, and tapping it goes there.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, seedMls } from './helpers.mjs';

const REC = { wins: 7, losses: 3, ties: 0, pf: 1000, pa: 900, standing: 2, pfRank: 3, paRank: 8, of: 12, division: null, divisionRank: null, seed: null, playoffTeams: null };

async function patch(page, changes) {
    await page.evaluate(async (changes) => {
        const { State } = await import('/js/mls/state.js');
        const main = await import('/js/mls/main.js');
        Object.assign(State.leagues[0], changes);
        localStorage.setItem('mls_leagues', JSON.stringify(State.leagues));
        main.renderLeagueCards();
    }, changes);
}
const card = (page) => page.locator('#leagueCards > .mls-lc-card').first();

test.describe('League card: record and direction', () => {
    test('record and place beside the name; none before anyone has played or for a manual league', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await patch(page, { record: null });
        await expect(card(page).locator('.mls-lc-record')).toHaveCount(0);
        await patch(page, { record: REC });
        await expect(card(page).locator('.mls-lc-record')).toHaveText('7–3 · 2nd of 12');
        await expect(card(page).locator('.mls-lc-name')).toBeVisible();
        // Roster tab says the same thing.
        await page.evaluate(async () => (await import('/js/mls/main.js')).showTab('roster'));
        await expect(page.locator('#rosterRecord .mls-roster-record-wl')).toHaveText('7–3');
        await expect(page.locator('#rosterRecord .mls-roster-record-standing')).toHaveText('(2nd of 12)');
        await page.evaluate(async () => (await import('/js/mls/main.js')).showTab('setup'));
        // Divisions: the seed, and out of the playoffs.
        const div = { ...REC, division: 'North', divisionRank: 1, seed: 2, playoffTeams: 6 };
        await patch(page, { record: div });
        await expect(card(page).locator('.mls-lc-record')).toHaveText('7–3 · 2nd seed of 6');
        await patch(page, { record: { ...div, seed: 8 } });
        await expect(card(page).locator('.mls-lc-record')).toHaveText('7–3 · Out of playoffs (8th)');
        // A manual league has none, even with a stored record.
        await patch(page, { leagueId: 'manual_x', record: REC });
        await expect(card(page).locator('.mls-lc-record')).toHaveCount(0);
        const edge = await page.locator('#dashboardCommandCenter').evaluate(cc => Math.max(...[...cc.querySelectorAll('*')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().right)));
        expect(edge).toBeLessThanOrEqual(375);
        await expectClean(page, state);
    });

    test('the badge: none in a redraft league; a dynasty league follows the switch, and a tap opens it', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await patch(page, { leagueType: 'redraft' });
        await expect(card(page).locator('.mls-direction-badge')).toHaveCount(0);
        await patch(page, { leagueType: 'dynasty', powerCompeting: false });
        await expect(card(page).locator('.mls-direction-badge')).toHaveText('Rebuilding');
        await patch(page, { powerCompeting: true });
        const badge = card(page).locator('.mls-direction-badge');
        await expect(badge).toHaveText('Competing');
        await badge.click();
        await expect(page.locator('#rosterTab')).toHaveClass(/active/);
        await expect(page.locator('#powerCompeting')).toBeFocused();
        await expect(page.locator('#powerCompeting')).toBeChecked();
        await page.locator('#powerCompeting').uncheck();
        await page.evaluate(async () => (await import('/js/mls/main.js')).showTab('setup'));
        await expect(card(page).locator('.mls-direction-badge')).toHaveText('Rebuilding');
        await expectClean(page, state);
    });

    test('the second line: record first, then the format without the TEP number (the Roster tab keeps it)', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await patch(page, { record: REC, leagueType: 'dynasty', powerCompeting: true, formatBadge: 'Dynasty SF Half-PPR TEP (+0.5)' });
        const meta = card(page).locator('.mls-lc-meta');
        await expect(meta).toHaveText(/^7\u20133 \u00b7 2nd of 12 \u00b7 Dyn SF \u00bd PPR TEP\s*Competing/);
        await expect(meta).not.toContainText('+0.5');
        await expect(card(page).locator('.mls-lc-format')).toHaveAttribute('title', 'Dynasty SF Half-PPR TEP (+0.5)');
        await expect(card(page).locator('.mls-lc-name-btn')).not.toContainText('7\u20133');
        await page.evaluate(async () => (await import('/js/mls/main.js')).showTab('roster'));
        await expect(page.locator('#rosterTab')).toContainText('TEP (+0.5)');
        await expectClean(page, state);
    });

    test('tapping the second line makes the league active; the badge opens the switch instead', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await patch(page, { record: REC, leagueType: 'dynasty', powerCompeting: true });
        await page.evaluate(async () => { const { State } = await import('/js/mls/state.js'); State.activeLeagueId = null; });
        await card(page).locator('.mls-lc-record').click();
        await expect(card(page)).toHaveClass(/is-active/);
        await card(page).locator('.mls-direction-badge').click();
        await expect(page.locator('#rosterTab')).toHaveClass(/active/);
        await expectClean(page, state);
    });
});
