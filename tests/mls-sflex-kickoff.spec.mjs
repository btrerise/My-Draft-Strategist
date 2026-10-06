// FLEX Kickoff Optimization in a superflex league (improvements F1). The optimizer picks who starts by
// rank, then relabels slots so the most flexible slot holds the latest kickoff, keeping late-swap room.
// Before F1 that relabeling skipped SFLEX entirely: SFLEX kept whoever the rank-based fill put there,
// even when the QB-slot QB or a FLEX starter played later. Each test serves the fixture league with a
// SUPER_FLEX slot added (QB 1, RB 2, WR 2, TE 1, FLEX 1, SFLEX 1, K 1, DEF 1), gives mds_test a
// second QB (Hurts) and RB (Gibbs), and fixes State.gameTimesByTeam (the tests block ESPN).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const LEAGUE = fixture('league.json');
const ROSTERS = fixture('league-rosters.json');

const MOVED = ['6904', '9221']; // Jalen Hurts (QB, PHI), Jahmyr Gibbs (RB, DET): rival → mds_test

async function superflexLeague(page) {
    const roster_positions = LEAGUE.roster_positions.flatMap(p => (p === 'FLEX' ? ['FLEX', 'SUPER_FLEX'] : [p]));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...LEAGUE, roster_positions }) }));
    const rosters = ROSTERS.map(r => ({
        ...r,
        players: r.owner_id === '900001' ? [...r.players, ...MOVED] : r.players.filter(id => !MOVED.includes(id)),
    }));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rosters) }));
}

// Week 2 kickoffs (the fixed clock is Tuesday 2026-09-15, so none has started).
const ONE_PM = '2026-09-20T17:00:00Z';
const FOUR_05 = '2026-09-20T20:05:00Z';
const FOUR_25 = '2026-09-20T20:25:00Z';
const SNF = '2026-09-21T00:20:00Z';
const MNF = '2026-09-22T00:15:00Z';

async function setKickoffs(page, times) {
    await page.evaluate(async (map) => {
        const { State } = await import('/js/mls/state.js');
        State.gameTimesByTeam = map;
    }, times);
}

/** The Lineup tab's starters, top to bottom, as "SLOT Name". */
const starterRows = (page) => page.locator('#optimalLineupContainer .lineup-slot').evaluateAll(rows => rows.map(r =>
    `${r.querySelector('.slot-badge').textContent.trim()} ${(r.querySelector('.player-name-wrap')?.textContent || '').replace(/\s*\(\d+\)$/, '').trim()}`));

// Both QBs ranked: the fill puts Allen (QB1) in the QB slot and Hurts in SFLEX.
const RANKS_TWO_QBS = `Rank,Player,Pos,Team
1,Ja'Marr Chase,WR,CIN
2,Jahmyr Gibbs,RB,DET
3,Justin Jefferson,WR,MIN
4,Josh Allen,QB,BUF
5,CeeDee Lamb,WR,DAL
6,Derrick Henry,RB,BAL
7,Brock Bowers,TE,LV
8,Jalen Hurts,QB,PHI
9,Puka Nacua,WR,LAR
`;
// Hurts unranked: SFLEX falls to the best flex player left, Nacua (WR).
const RANKS_ONE_QB = RANKS_TWO_QBS.split('\n').filter(l => !l.includes('Hurts')).join('\n');

async function setUp(page, ranks, count) {
    const state = await openApp(page, '/lineup/');
    await superflexLeague(page);
    await seedMls(page);
    await expect(page.locator('#reqSFLEX')).toHaveValue('1');
    await loadMlsRankings(page, ranks, count);
    await showTab(page, 'lineup');
    return state;
}

test.describe('FLEX Kickoff Optimization in a superflex league', () => {
    test('a QB who plays later than the QB-slot QB moves to SFLEX', async ({ page }) => {
        const state = await setUp(page, RANKS_TWO_QBS, 9);
        await setKickoffs(page, { BUF: SNF, PHI: ONE_PM, CIN: ONE_PM, DET: ONE_PM, MIN: ONE_PM, BAL: ONE_PM, LV: FOUR_05, DAL: FOUR_25, LAR: ONE_PM });
        await callApp(page, 'optimizeLineup', true);
        // Before F1: QB Josh Allen (Sunday night), SFLEX Jalen Hurts (1pm).
        expect(await starterRows(page)).toEqual([
            'QB Jalen Hurts', 'RB Jahmyr Gibbs', 'RB Derrick Henry', "WR Ja'Marr Chase", 'WR Justin Jefferson',
            'TE Brock Bowers', 'FLEX CeeDee Lamb', 'SFLEX Josh Allen', 'K Justin Tucker', 'DEF Baltimore Ravens',
        ]);
        await expectClean(page, state);
    });

    test('a Monday night WR moves to SFLEX and FLEX gets the next latest', async ({ page }) => {
        const state = await setUp(page, RANKS_ONE_QB, 8);
        await setKickoffs(page, { BUF: ONE_PM, PHI: ONE_PM, CIN: MNF, DET: ONE_PM, MIN: ONE_PM, BAL: ONE_PM, LV: FOUR_05, DAL: FOUR_25, LAR: FOUR_05 });
        await callApp(page, 'optimizeLineup', true);
        // Before F1: WR Jefferson, WR Lamb, FLEX Chase (Monday night), SFLEX Nacua (4:05).
        expect(await starterRows(page)).toEqual([
            'QB Josh Allen', 'RB Jahmyr Gibbs', 'RB Derrick Henry', 'WR Justin Jefferson', 'WR Puka Nacua',
            'TE Brock Bowers', 'FLEX CeeDee Lamb', "SFLEX Ja'Marr Chase", 'K Justin Tucker', 'DEF Baltimore Ravens',
        ]);
        await expectClean(page, state);
    });

    test('with the toggle off, slots follow the rank-based fill', async ({ page }) => {
        const state = await setUp(page, RANKS_ONE_QB, 8);
        await setKickoffs(page, { BUF: ONE_PM, PHI: ONE_PM, CIN: MNF, DET: ONE_PM, MIN: ONE_PM, BAL: ONE_PM, LV: FOUR_05, DAL: FOUR_25, LAR: FOUR_05 });
        await page.locator('#flexKickoffOptimizationToggle').uncheck();
        await callApp(page, 'optimizeLineup', true);
        expect(await starterRows(page)).toEqual([
            'QB Josh Allen', 'RB Jahmyr Gibbs', 'RB Derrick Henry', "WR Ja'Marr Chase", 'WR Justin Jefferson',
            'TE Brock Bowers', 'FLEX CeeDee Lamb', 'SFLEX Puka Nacua', 'K Justin Tucker', 'DEF Baltimore Ravens',
        ]);
        await expectClean(page, state);
    });
});
