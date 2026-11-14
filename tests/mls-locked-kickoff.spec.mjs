// Players you lock still follow FLEX Kickoff Optimization (improvements F13). A lock means "start him", not "keep
// this slot": before F13 the relabel held every locked starter where the fill put him (the first slot his position
// fits), so a locked Monday-night WR sat in WR1 while FLEX held a 1 pm game. Only players whose game has started
// stay put (tests/unit/kickoffOrder.test.mjs covers that, and the superflex case).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const ROSTERS = JSON.parse(readFileSync(new URL('./fixtures/sleeper/league-rosters.json', import.meta.url), 'utf8'));
const GIBBS = '9221'; // Jahmyr Gibbs (RB, DET): rival → mds_test, so both RB slots fill
async function withGibbs(page) {
    const rosters = ROSTERS.map(r => ({ ...r, players: r.owner_id === '900001' ? [...r.players, GIBBS] : r.players.filter(id => id !== GIBBS) }));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rosters) }));
}

const ONE_PM = '2026-09-20T17:00:00Z';
const MNF = '2026-09-22T00:15:00Z';

const RANKS = `Rank,Player,Pos,Team
1,Ja'Marr Chase,WR,CIN
2,Justin Jefferson,WR,MIN
3,Josh Allen,QB,BUF
4,CeeDee Lamb,WR,DAL
5,Derrick Henry,RB,BAL
8,Jahmyr Gibbs,RB,DET
6,Brock Bowers,TE,LV
7,Puka Nacua,WR,LAR
`;

async function setKickoffs(page, times) {
    await page.evaluate(async (map) => { const { State } = await import('/js/mls/state.js'); State.gameTimesByTeam = map; }, times);
}
const starterRows = (page) => page.locator('#optimalLineupContainer .lineup-slot').evaluateAll(rows => rows.map(r =>
    `${r.querySelector('.slot-badge').textContent.trim()} ${(r.querySelector('.player-name-wrap')?.textContent || '').replace(/\s*\(\d+\)$/, '').trim()}`));

const LOCK_LAMB = '#optimalLineupContainer [data-action="toggleLock"][aria-label="Lock CeeDee Lamb"]:visible';

async function setUp(page) {
    const state = await openApp(page, '/lineup/');
    await withGibbs(page);
    await seedMls(page);
    await loadMlsRankings(page, RANKS, 8);
    await showTab(page, 'lineup');
    // Lamb (DAL) plays Monday night; everyone else Sunday at 1 pm. The fixed clock is Tuesday 2026-09-15.
    await setKickoffs(page, { BUF: ONE_PM, CIN: ONE_PM, MIN: ONE_PM, DAL: MNF, BAL: ONE_PM, DET: ONE_PM, LV: ONE_PM, LAR: ONE_PM });
    return state;
}

test.describe('FLEX Kickoff Optimization with a player you locked (F13)', () => {
    test('a locked player still to play is placed by kickoff', async ({ page }) => {
        const state = await setUp(page);
        await callApp(page, 'optimizeLineup', true);
        await page.locator(LOCK_LAMB).click();
        await callApp(page, 'optimizeLineup', true);
        // Before F13: WR CeeDee Lamb (locked, Monday night), WR Chase, FLEX Justin Jefferson (1 pm).
        expect(await starterRows(page)).toEqual([
            'QB Josh Allen', 'RB Derrick Henry', 'RB Jahmyr Gibbs', "WR Ja'Marr Chase", 'WR Justin Jefferson',
            'TE Brock Bowers', 'FLEX CeeDee Lamb', 'K Justin Tucker', 'DEF Baltimore Ravens',
        ]);
        await expect(page.locator('#optimalLineupContainer [data-action="toggleLock"][aria-label="Lock CeeDee Lamb"]:visible')).toHaveAttribute('aria-pressed', 'true');
        await expectClean(page, state);
    });

    test('with the toggle off, the locked player keeps the rank-based fill', async ({ page }) => {
        const state = await setUp(page);
        await page.locator('#lineupSettings > summary').click();
        await page.locator('#flexKickoffOptimizationToggle').uncheck();
        await callApp(page, 'optimizeLineup', true);
        await page.locator(LOCK_LAMB).click();
        await callApp(page, 'optimizeLineup', true);
        expect(await starterRows(page)).toEqual([
            'QB Josh Allen', 'RB Derrick Henry', 'RB Jahmyr Gibbs', 'WR CeeDee Lamb', "WR Ja'Marr Chase",
            'TE Brock Bowers', 'FLEX Justin Jefferson', 'K Justin Tucker', 'DEF Baltimore Ravens',
        ]);
        await expectClean(page, state);
    });
});
