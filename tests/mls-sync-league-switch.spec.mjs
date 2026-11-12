// A league's sync that finishes after you've switched to another league leaves you where you are (improvements S29,
// round 7). Before, the sync made its own league the active one again while the header still named the one you'd
// picked, so the Lineup and Roster tabs showed one league's data under the other's name. Two ways in: the Roster tab's
// "Sync Sleeper Waivers & Trades" button, and the automatic sync S29's past-trade box starts after a new trade.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID } from './helpers.mjs';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const fixture = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/sleeper/${name}`, import.meta.url)), 'utf8'));

// Both fixture leagues synced, Fixture League active with rankings. Fixture League's rosters request waits for release().
async function twoLeagues(page) {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE2_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await loadMlsRankings(page);
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route(new RegExp(`api\\.sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), async r => {
        await gate;
        r.fulfill({ json: fixture('league-rosters-traded.json') });
    });
    return { state, release };
}

const active = (page) => page.evaluate(async () => (await import('/js/mls/state.js')).State.activeLeagueId);

async function expectStillOnSecondLeague(page) {
    await page.waitForLoadState('networkidle');
    await expect.poll(() => active(page)).toBe(FIXTURE_LEAGUE2_ID);
    await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE2_ID);
    await expect(page.locator('#rosterLeagueHeader')).toHaveText('Second Fixture League');
    // The other league was still refreshed and saved: the trade's players are on its stored roster.
    await expect.poll(() => page.evaluate(async (id) => {
        const { State } = await import('/js/mls/state.js');
        return State.leagues.find(l => l.leagueId === id).roster.map(p => p.name);
    }, FIXTURE_LEAGUE_ID)).toContain('Bijan Robinson');
    // Still on the league you switched to once it has.
    expect(await active(page)).toBe(FIXTURE_LEAGUE2_ID);
    await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE2_ID);
}

test.describe('A sync that finishes after you switch league', () => {
    test('the Roster tab\'s Sync button: you stay on the league you switched to', async ({ page }) => {
        const { state, release } = await twoLeagues(page);
        await showTab(page, 'roster');
        // The switch happens while Sleeper's answer for the rosters is held back, so the sync is surely still running.
        const asked = page.waitForRequest(new RegExp(`/league/${FIXTURE_LEAGUE_ID}/rosters$`));
        await page.locator('#rosterSyncBtn').click();
        await asked;
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE2_ID);
        release();
        await expectStillOnSecondLeague(page);
        // Its summary names the league it's about.
        await expect(page.locator('.toast-message').filter({ hasText: 'Fixture League: Added:' })).toBeVisible();
        await expectClean(page, state);
    });

    test('the past-trade box\'s automatic sync: you stay on the league you switched to', async ({ page }) => {
        const { state, release } = await twoLeagues(page);
        await page.evaluate(async (id) => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === id).lastSyncedAt = Date.parse('2026-09-01T12:00:00Z');
        }, FIXTURE_LEAGUE_ID);
        await page.route(new RegExp(`api\\.sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/transactions/\\d+$`), r =>
            r.fulfill({ json: r.request().url().endsWith('/1') ? fixture('league-transactions-trade.json') : [] }));
        await showTab(page, 'roster');
        await expect(page.locator('[data-trade-syncing]')).toBeVisible();
        // The Roster tab's Sync button shows the sync running, as when you tap it (round 7).
        await expect(page.locator('#rosterSyncBtn')).toHaveText(/Syncing|Mapping League|Loading Players/);
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE2_ID);
        release();
        await expectStillOnSecondLeague(page);
        await expect(page.locator('.toast-message').filter({ hasText: 'Fixture League: Synced for your trade on Sep 8: Added:' })).toBeVisible();
        await expect(page.locator('#rosterSyncBtn')).toHaveText('Sync Sleeper Waivers & Trades');
        // Back on Fixture League, the box shows the trade without another sync.
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await expect(page.locator('#rosterTradeLine .mls-roster-trade-title')).toHaveText('Your trade with Rival · Sep 8');
        await expectClean(page, state);
    });
});
