// MLS simulator's "Look Up a Specific Player" (lookupSimPlayer, js/mls/sim/matchup.js) on a name two
// Sleeper entries share (refactor 9C). Sleeper's real map has two Josh Allens: 2212, an inactive guard
// with no team, and 4984, the Bills QB. The name -> Sleeper ID index (getCleanNameToIdIndex,
// js/mls/players.js) used to keep the first entry, so the lookup found the guard. It now prefers the
// entry with an NFL team, then a fantasy position, then the better search_rank.
//
// The fixture map gets the guard added for this spec only (same fields as Sleeper's live entry,
// 2026-10-04); every other spec keeps fixtures/sleeper/players-nfl.json as generated.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, showTab } from './helpers.mjs';

const PLAYERS = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sleeper/players-nfl.json', import.meta.url)), 'utf8'));
const GUARD = {
    player_id: '2212', first_name: 'Josh', last_name: 'Allen', full_name: 'Josh Allen', search_full_name: 'joshallen',
    position: 'G', fantasy_positions: ['OL'], team: null, years_exp: 8, status: 'Inactive', active: false,
    injury_status: null, search_rank: 9999999, age: 31, number: 0,
};

test('looking up Josh Allen in the simulator shows the Bills QB, not the inactive guard', async ({ page }) => {
    const state = await preparePage(page);
    // Registered after preparePage's catch-all, so it answers the player map first.
    await page.route(/^https:\/\/api\.sleeper\.app\/v1\/players\/nfl$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ [GUARD.player_id]: GUARD, ...PLAYERS }) }));
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await showTab(page, 'lineup');

    // Through the real autocomplete: it lists fantasy positions only, so the one row is the QB.
    await page.locator('#simPlayerSearch').pressSequentially('Josh All');
    const row = page.locator('.autocomplete-item');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('QB ·BUF');
    await row.dispatchEvent('mousedown');

    const result = page.locator('#simPlayerLookupResult');
    await expect(result).not.toContainText('Looking up');
    await expect(result.locator('.sim-lookup-header')).toHaveText(/QB\s+Josh Allen\s+BUF/);
    await expect(result.locator('.sim-lookup-range')).toContainText('pts');
    await expect(result).not.toContainText("doesn't have enough game history");
    await expectClean(page, state);
});
