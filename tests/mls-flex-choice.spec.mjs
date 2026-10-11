// Who the Lineup Optimizer starts in a FLEX slot when the Weekly rankings have position ranks but no FLEX rank
// (per-position uploads, the owner's case in improvements S12: "Fantasy Leftovers" started Kendrick Bourne WR55 over
// Treylon Burks WR53 because Bourne projected higher, and an unranked Kyle Pitts over ranked WRs). The rule (owner's):
// FLEX rank first; then any rank: a ranked player beats an unranked one, and at one position the better position rank
// wins; projected points decide only between positions (a TE24 isn't necessarily better than a WR50), or between
// unranked players. js/mls/lineup/flexChoice.js holds it; tests/unit/flexChoice.test.mjs covers its cases.
//
// The fixture league with two FLEX slots and one RB slot (its team has one RB). Your RB/WR/TE: Derrick Henry (RB1);
// Ja'Marr Chase, Justin Jefferson, CeeDee Lamb, Puka Nacua, Amon-Ra St. Brown, A.J. Brown (WR1-6) and Garrett Wilson
// (unranked); Brock Bowers, Trey McBride (TE1-2) and George Kittle (unranked). The strict slots take Henry, Chase,
// Jefferson and Bowers. For FLEX: Lamb WR3 projects 2, Nacua WR4 3, St. Brown WR5 9, A.J. Brown WR6 30, McBride TE2 6,
// Kittle 20 and Wilson 15 (both unranked).
// - Right: FLEX 1 is McBride (TE2, 6) or Lamb (WR3, 2), the best-ranked at each position, by projection: McBride.
//   FLEX 2: Lamb against no ranked TE left: Lamb. St. Brown and A.J. Brown sit behind Lamb at WR whatever they
//   project, and Kittle and Wilson are unranked.
// - Before the fix: projections alone, so A.J. Brown (30) and Kittle (20).
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));

// [name, pos, posRank or null]
const RANKS = [
    ['Josh Allen', 'QB', 1], ['Derrick Henry', 'RB', 1],
    ["Ja'Marr Chase", 'WR', 1], ['Justin Jefferson', 'WR', 2], ['CeeDee Lamb', 'WR', 3], ['Puka Nacua', 'WR', 4],
    ['Amon-Ra St. Brown', 'WR', 5], ['A.J. Brown', 'WR', 6], ['Brock Bowers', 'TE', 1], ['Trey McBride', 'TE', 2],
];
// Sleeper ids: projected points this week.
const PROJ = { 6786: 2, 9493: 3, 7547: 9, 5859: 30, 7553: 6, 4217: 20, 7523: 15 };

async function setup(page) {
    await page.route(/sleeper\.app\/v1\/league\/\d+$/, route => route.fulfill({ json: {
        ...fixture('league.json'),
        roster_positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
    } }));
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/2$/, route => {
        const proj = fixture('projections-2026-2.json');
        Object.entries(PROJ).forEach(([id, pts]) => { proj[id] = { ...proj[id], pts_ppr: pts, pts_half_ppr: pts, pts_std: pts }; });
        return route.fulfill({ json: proj });
    });
    await seedMls(page);
    // Weekly rankings by position only, no FLEX rank (as per-position uploads store them), on the league itself.
    await page.evaluate(async ({ ranks, leagueId }) => {
        const { normalizeName } = await import('/js/shared/names.js');
        const data = ranks.map(([name, , posRank]) => ({ name, cleanName: normalizeName(name), rank: posRank, posRank, flexRank: 999 }));
        const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
        const league = leagues.find(l => l.leagueId === leagueId);
        Object.assign(league, { weeklyRankingSetId: null, weeklyRankings: data, weeklyRankingsUpdatedAt: Date.now() });
        localStorage.setItem('mls_leagues', JSON.stringify(leagues));
    }, { ranks: RANKS, leagueId: FIXTURE_LEAGUE_ID });
    await page.reload();
    await page.waitForLoadState('networkidle');
    // The Lineup tab loads the projections; once they're in, a fresh optimize (the Optimize Lineup button).
    await showTab(page, 'lineup');
    await expect.poll(() => page.evaluate(async () => {
        const { lineupProjectionsLoaded } = await import('/js/mls/lineup/gameInfo.js');
        return lineupProjectionsLoaded();
    })).toBe(true);
    await page.locator('#lineupTab [data-action="optimizeLineup"]').click();
}

const starters = (page) => page.evaluate(async (leagueId) => {
    const { State } = await import('/js/mls/state.js');
    return State.manualStartersMap[leagueId].map(s => `${s.slot.replace(/\d+$/, '')}:${s.player ? s.player.name : '-'}`);
}, FIXTURE_LEAGUE_ID);

test.describe('Lineup Optimizer: FLEX without FLEX ranks', () => {
    test('rank decides within a position, projections between positions, ranked before unranked', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await setup(page);
        const lineup = await starters(page);
        const flex = lineup.filter(s => s.startsWith('FLEX:')).map(s => s.slice(5)).sort();
        expect(flex).toEqual(['CeeDee Lamb', 'Trey McBride']);
        // The strict slots are unchanged.
        expect(lineup.filter(s => !s.startsWith('FLEX:'))).toEqual(expect.arrayContaining(['RB:Derrick Henry', "WR:Ja'Marr Chase", 'WR:Justin Jefferson', 'TE:Brock Bowers']));
        await expectClean(page, state);
    });
});
