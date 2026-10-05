// MLS simulator's "Look Up a Specific Player" (lookupSimPlayer, js/mls/sim/matchup.js) on a name two
// Sleeper entries share (refactor 9C). Sleeper's real map has two Josh Allens: 2212, an inactive guard
// with no team, and 4984, the Bills QB. The name -> Sleeper ID index (getCleanNameToIdIndex,
// js/mls/players.js) used to keep the first entry, so the lookup found the guard. It now prefers a
// fantasy position, then an NFL team, then the better search_rank (isPreferredSleeperEntry).
//
// The second test checks that every name lookup built from the player map picks the same player:
// the id index, the position lookup (sleeperPosByName), Scout's getSleeperMetaByName and the rookie
// badge's name fallback (render/rookies.js). Before 9C each had its own rule.
//
// The third covers two-way players (9C, at the owner's request): Sleeper lists Travis Hunter as a DB
// but scores him at WR too (`fantasy_positions` DB, WR). Lineup Strategist read only the listed
// position, so on a roster he was a "DB", fit no slot and never started. fantasyPosition
// (js/mls/constants.js) makes him a WR everywhere the app reads a Sleeper position.
//
// The fixture map gets namesakes added for this spec only (the guard with the fields of Sleeper's live
// entry, 2026-10-04; the others invented); every other spec keeps fixtures/sleeper/players-nfl.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, showTab, seedMls, loadMlsRankings, RANKINGS_CSV } from './helpers.mjs';

const PLAYERS = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sleeper/players-nfl.json', import.meta.url)), 'utf8'));
const sleeper = (id, first, last, position, team, extra = {}) => ({
    player_id: id, first_name: first, last_name: last, full_name: `${first} ${last}`,
    search_full_name: `${first}${last}`.toLowerCase(), position, fantasy_positions: [position], team,
    years_exp: 3, status: team ? 'Active' : 'Inactive', active: !!team, injury_status: null, search_rank: 9999999, age: 26, number: 0,
    ...extra,
});
const GUARD = {
    player_id: '2212', first_name: 'Josh', last_name: 'Allen', full_name: 'Josh Allen', search_full_name: 'joshallen',
    position: 'G', fantasy_positions: ['OL'], team: null, years_exp: 8, status: 'Inactive', active: false,
    injury_status: null, search_rank: 9999999, age: 31, number: 0,
};

// Two invented pairs. Before 9C the lookups split on both: the id index and the rookie badge took the
// first of each pair (lower id), the position lookup the last, and Scout's lookup the WR or the first.
const NAMESAKES = {
    // A cornerback on a team (and a rookie) vs a teamless free-agent WR with the same name.
    '100': sleeper('100', 'Dee', 'Turner', 'CB', 'CIN', { fantasy_positions: ['DB'], years_exp: 0, search_rank: 999 }),
    '7000': sleeper('7000', 'Dee', 'Turner', 'WR', null),
    // Two WRs on teams: the better search_rank wins, though it comes second.
    '200': sleeper('200', 'Sam', 'Twin', 'WR', 'MIA', { search_rank: 400 }),
    '7100': sleeper('7100', 'Sam', 'Twin', 'WR', 'DAL', { search_rank: 60, years_exp: 0 }),
};
const withNamesakes = (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ [GUARD.player_id]: GUARD, ...NAMESAKES, ...PLAYERS }) });

test('looking up Josh Allen in the simulator shows the Bills QB, not the inactive guard', async ({ page }) => {
    const state = await preparePage(page);
    // Registered after preparePage's catch-all, so it answers the player map first.
    await page.route(/^https:\/\/api\.sleeper\.app\/v1\/players\/nfl$/, withNamesakes);
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

test('every name lookup picks the same player for a shared name', async ({ page }) => {
    const state = await preparePage(page);
    await page.route(/^https:\/\/api\.sleeper\.app\/v1\/players\/nfl$/, withNamesakes);
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');

    const picks = await page.evaluate(async () => {
        // The page's own module instances (same URLs as its imports).
        const players = await import('/js/mls/players.js');
        const { getSleeperMetaByName } = await import('/js/mls/scout/waivers.js');
        const { getRookieIndex } = await import('/js/mls/render/rookies.js');
        const index = await players.getCleanNameToIdIndex();
        await players.ensureSleeperPosByName();
        const meta = await getSleeperMetaByName();
        const rookies = await getRookieIndex();
        return Object.fromEntries(['joshallen', 'deeturner', 'samtwin'].map(clean => [clean, {
            id: index[clean], pos: players.sleeperPosByName[clean], metaId: meta[clean] && meta[clean].id,
            rookie: rookies.byName.get(clean),
        }]));
    });
    expect(picks).toEqual({
        joshallen: { id: '4984', pos: 'QB', metaId: '4984', rookie: { rookie: false, team: 'BUF' } },
        // Fantasy position before team: the free-agent WR, not the Bengals CB (a rookie).
        deeturner: { id: '7000', pos: 'WR', metaId: '7000', rookie: { rookie: false, team: null } },
        samtwin: { id: '7100', pos: 'WR', metaId: '7100', rookie: { rookie: true, team: 'DAL' } },
    });
    await expectClean(page, state);
});

// Sleeper's live entry for Travis Hunter (2026-10-05), trimmed to the fields the app reads.
const HUNTER = {
    player_id: '12530', first_name: 'Travis', last_name: 'Hunter', full_name: 'Travis Hunter', search_full_name: 'travishunter',
    position: 'DB', fantasy_positions: ['DB', 'WR'], team: 'JAX', years_exp: 1, status: 'Active', active: true,
    injury_status: null, search_rank: 103, age: 23, number: 12,
};

test('a two-way player (listed DB, scored at WR) is a WR on the roster and starts at WR', async ({ page }) => {
    const state = await preparePage(page);
    const rosters = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sleeper/league-rosters.json', import.meta.url)), 'utf8'));
    rosters[0].players.push(HUNTER.player_id); // roster 1 is mds_test's
    await page.route(/^https:\/\/api\.sleeper\.app\/v1\/players\/nfl$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...PLAYERS, [HUNTER.player_id]: HUNTER }) }));
    await page.route(/^https:\/\/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rosters) }));
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await seedMls(page);
    // Ranked first, as a WR (the fixture list moves down one).
    const [header, ...rows] = RANKINGS_CSV.trim().split('\n');
    const csv = [header, '1,Travis Hunter,WR,JAX,1,8', ...rows.map(r => r.replace(/^(\d+)/, (n) => String(Number(n) + 1)))].join('\n') + '\n';
    await loadMlsRankings(page, csv, 25);

    const saved = await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        const league = State.leagues[0];
        return { pos: league.roster.find(p => p.id === '12530').pos, globalPos: league.globalPosMap.travishunter };
    });
    expect(saved).toEqual({ pos: 'WR', globalPos: 'WR' });

    await showTab(page, 'lineup');
    const starters = await page.locator('#optimalLineupContainer .lineup-slot').allInnerTexts();
    expect(starters.some(t => t.includes('Travis Hunter')), 'Hunter starts').toBe(true);

    // The simulator's search lists him as a WR (it used to leave him out: DB isn't a fantasy position).
    await page.locator('#simPlayerSearch').pressSequentially('Travis Hu');
    await expect(page.locator('.autocomplete-item')).toHaveCount(1);
    await expect(page.locator('.autocomplete-item')).toContainText('WR ·JAX');
    await expectClean(page, state);
});
