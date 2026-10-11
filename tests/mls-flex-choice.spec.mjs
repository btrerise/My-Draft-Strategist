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

const FLEX_SLOTS = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];

// opts: positions (Sleeper's roster_positions), ranks, sleeperStarters (your lineup on Sleeper, ids), extraProj (extra
// projections, by id), dashboard (stay on the Dashboard: no Lineup tab visit, no optimize), second (also a copy of the
// league, "Second League", written into storage: same roster and rankings), projUp (a function: while it returns
// false, Sleeper's projections answer 503; the Dashboard's best available loads them as soon as it's drawn).
async function setup(page, { positions = FLEX_SLOTS, ranks = RANKS, sleeperStarters, extraProj = {}, dashboard = false, second = false, projUp = () => true } = {}) {
    await page.route(/sleeper\.app\/v1\/league\/\d+$/, route => route.fulfill({ json: { ...fixture('league.json'), roster_positions: positions } }));
    if (sleeperStarters) {
        await page.route(/sleeper\.app\/v1\/league\/\d+\/rosters$/, route => {
            const rosters = fixture('league-rosters.json');
            rosters[0].starters = sleeperStarters;
            return route.fulfill({ json: rosters });
        });
    }
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/2$/, route => {
        if (!projUp()) return route.fulfill({ status: 503, body: '' });
        const proj = fixture('projections-2026-2.json');
        Object.entries({ ...PROJ, ...extraProj }).forEach(([id, pts]) => { proj[id] = { ...proj[id], pts_ppr: pts, pts_half_ppr: pts, pts_std: pts }; });
        return route.fulfill({ json: proj });
    });
    await seedMls(page);
    // Weekly rankings by position only, no FLEX rank (as per-position uploads store them), on the league itself.
    await page.evaluate(async ({ ranks, leagueId, second }) => {
        const { normalizeName } = await import('/js/shared/names.js');
        const data = ranks.map(([name, , posRank]) => ({ name, cleanName: normalizeName(name), rank: posRank, posRank, flexRank: 999 }));
        const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
        const league = leagues.find(l => l.leagueId === leagueId);
        Object.assign(league, { weeklyRankingSetId: null, weeklyRankings: data, weeklyRankingsUpdatedAt: Date.now() });
        if (second) leagues.push({ ...league, leagueId: '1000000000000000002', name: 'Second League' });
        localStorage.setItem('mls_leagues', JSON.stringify(leagues));
    }, { ranks, leagueId: FIXTURE_LEAGUE_ID, second });
    await page.reload();
    await page.waitForLoadState('networkidle');
    if (dashboard) { await showTab(page, 'setup'); return; }
    // The Lineup tab loads the projections; once they're in, a fresh optimize (the Optimize Lineup button).
    await showTab(page, 'lineup');
    await expect.poll(() => page.evaluate(async () => {
        const { lineupProjectionsLoaded } = await import('/js/mls/lineup/gameInfo.js');
        return lineupProjectionsLoaded();
    })).toBe(true);
    await optimize(page);
}

const optimize = (page) => page.locator('#lineupTab [data-action="optimizeLineup"]').click();

const starters = (page, leagueId = FIXTURE_LEAGUE_ID) => page.evaluate(async (leagueId) => {
    const { State } = await import('/js/mls/state.js');
    return State.manualStartersMap[leagueId].map(s => `${s.slot.replace(/\d+$/, '')}:${s.player ? s.player.name : '-'}`);
}, leagueId);

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

    // S12 round 3. SFLEX with nobody ranked left used to stay empty ("[ Empty Slot ]"); it now takes the higher
    // projection, like FLEX. And a bench player whose game has kicked off can't be started any more (Sleeper locks
    // him on the bench): the optimizer leaves him there, as it already kept a started starter in his slot.
    test('SFLEX with nobody ranked left: the higher projection; a benched player whose game has started stays benched', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        const ranked = RANKS.filter(([name]) => ['Josh Allen', 'Derrick Henry', "Ja'Marr Chase", 'Justin Jefferson', 'Brock Bowers'].includes(name));
        // On Sleeper: Allen, Henry, Chase, Jefferson, Bowers, Lamb (SFLEX), Tucker, the Ravens.
        await setup(page, {
            positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'SUPER_FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
            ranks: ranked, sleeperStarters: ['4984', '3198', '4866', '6794', '11604', '6786', '17', 'BAL'],
        });
        expect((await starters(page)).filter(s => s.startsWith('SFLEX:'))).toEqual(['SFLEX:A.J. Brown']);

        // A.J. Brown's game (PHI) has kicked off and he isn't in your Sleeper lineup: the next projection, Kittle.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.gameTimesByTeam = { ...State.gameTimesByTeam, PHI: '2026-09-15T12:00:00Z' };
        });
        await optimize(page);
        const lineup = await starters(page);
        expect(lineup.filter(s => s.startsWith('SFLEX:'))).toEqual(['SFLEX:George Kittle']);
        expect(lineup).not.toContain('WR:A.J. Brown');
        await expectClean(page, state);
    });

    // S12 round 5. Projections used to load only with the Lineup tab, so Optimize All from the Dashboard right after
    // opening the app picked between positions by position rank alone. It now loads them first. One FLEX slot:
    // CeeDee Lamb (WR3) projects 10, Trey McBride (TE2) 6; by projection Lamb, by position rank McBride.
    // (Since round 7 the Dashboard's best available loads them too, so here Sleeper doesn't answer until the tap.)
    test('Optimize All from the Dashboard loads projections first', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        let projUp = false;
        await setup(page, { positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
            extraProj: { 6786: 10 }, dashboard: true, projUp: () => projUp });
        expect(await page.evaluate(async () => (await import('/js/mls/lineup/gameInfo.js')).lineupProjectionsLoaded())).toBe(false);
        projUp = true;
        await page.click('#optimizeAllBtn');
        await expect(page.locator('#optimizeAllBtn')).toBeEnabled();
        expect((await starters(page)).filter(s => s.startsWith('FLEX:'))).toEqual(['FLEX:CeeDee Lamb']);
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !/503|projections/i.test(e)));
        await expectClean(page, state);
    });

    // S12 round 7 (found reviewing as a user): the Dashboard's best available picked the weakest starter without
    // projections until something else loaded them (the Lineup tab, Optimize All, Sync All), so its first answer could
    // change after a tap that changed nothing else. It now loads them itself. One FLEX slot; Zay Flowers, a free agent,
    // is WR1; then Ja'Marr Chase WR2, Justin Jefferson WR3 (projects 15), CeeDee Lamb WR4 (10); Trey McBride TE2 (6).
    // With projections Lamb starts at FLEX, and with Flowers in, Jefferson would move there: Flowers is 3 spots over
    // Lamb. By position rank alone McBride starts at FLEX, and Flowers would push out Jefferson, only 2 spots: no upgrade.
    test('the Dashboard\'s best available uses projections from its first draw', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        const ranks = [...RANKS.filter(([, pos]) => pos !== 'WR'), ['Zay Flowers', 'WR', 1], ["Ja'Marr Chase", 'WR', 2],
            ['Justin Jefferson', 'WR', 3], ['CeeDee Lamb', 'WR', 4], ['Puka Nacua', 'WR', 5], ['Amon-Ra St. Brown', 'WR', 6], ['A.J. Brown', 'WR', 7]];
        await setup(page, { positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
            ranks, extraProj: { 6786: 10, 6794: 15 }, dashboard: true });
        const section = page.locator(`.mls-lc-ba[data-league-id="${FIXTURE_LEAGUE_ID}"]`);
        await expect(section).toContainText('Zay Flowers');
        await expect(section).toContainText('over CeeDee Lamb');
        await expectClean(page, state);
    });

    // And when projections arrive later (Sleeper didn't answer during Optimize All), every league optimized without
    // them is redone, not just the one you have open.
    test('projections that arrive late redo every league optimized without them', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        let block = true;
        await setup(page, { positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
            extraProj: { 6786: 10 }, dashboard: true, second: true, projUp: () => !block });
        await page.click('#optimizeAllBtn');
        await expect(page.locator('#optimizeAllBtn')).toBeEnabled();
        expect((await starters(page, '1000000000000000002')).filter(s => s.startsWith('FLEX:'))).toEqual(['FLEX:Trey McBride']);

        block = false;
        await showTab(page, 'lineup');
        await expect.poll(async () => (await starters(page, '1000000000000000002')).filter(s => s.startsWith('FLEX:'))).toEqual(['FLEX:CeeDee Lamb']);
        await expect.poll(async () => (await starters(page)).filter(s => s.startsWith('FLEX:'))).toEqual(['FLEX:CeeDee Lamb']);
        // The league you had open is still the active one.
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !/503|projections/i.test(e)));
        await expectClean(page, state);
    });

    // S12 round 6 (the owner's TNF case: CeeDee Lamb and Dak Prescott played Thursday, and the updated rankings leave
    // them out). A starter whose game has kicked off is auto-locked only once the app knows the kickoff time (ESPN's
    // scoreboard, fetched at startup, in the background). Optimize All now fetches it when it's missing and waits, so a
    // startup fetch that failed or hadn't answered yet doesn't bench him.
    test('Optimize All waits for kickoff times: a Thursday starter missing from the rankings stays locked in', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        // ESPN doesn't answer while the app starts (a slow or failed request), only by the time you tap Optimize All.
        let espnUp = false;
        await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, async route => {
            if (!espnUp) return route.fulfill({ status: 503, body: '' });
            return route.fulfill({ json: { events: [{ date: '2026-09-11T00:15:00Z', status: { type: { state: 'post' } }, competitions: [{
                competitors: [{ team: { abbreviation: 'DAL' }, homeAway: 'home' }, { team: { abbreviation: 'NYG' }, homeAway: 'away' }] }] }] } });
        });
        // Lamb (DAL) is in your Sleeper lineup at FLEX, and the Weekly rankings no longer list him.
        await setup(page, { ranks: RANKS.filter(([name]) => name !== 'CeeDee Lamb'), dashboard: true,
            sleeperStarters: ['4984', '3198', '4866', '6794', '11604', '6786', '9493', '17', 'BAL'] });
        espnUp = true;
        await page.click('#optimizeAllBtn');
        await expect(page.locator('#optimizeAllBtn')).toBeEnabled({ timeout: 10000 });
        // Locked in (a locked player takes the first slot that accepts him, here a WR slot).
        expect((await starters(page)).some(s => s.endsWith(':CeeDee Lamb'))).toBe(true);
        await expectClean(page, state);
    });
});
