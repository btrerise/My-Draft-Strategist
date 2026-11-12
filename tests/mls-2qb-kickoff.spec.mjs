// FLEX Kickoff Optimization in a 2-QB league (improvements F17): two QB slots and no SFLEX. The optimizer picks
// who starts by rank, then relabels slots by kickoff (js/mls/lineup/kickoffOrder.js). From F1 until F17 QBs only took
// part through an open SFLEX slot, so a 2-QB league's QB1 and QB2 kept the rank order while RB1/RB2 and WR1/WR2
// read earliest kickoff on top. Now the QB slots read the same way. Who starts never changes, so the Sleeper
// comparison (sleeperLineupChanges, a set of ids) never shows the QB swap as a change to set.
// Each test serves the fixture league with a second QB slot (QB 2, RB 2, WR 2, TE 1, FLEX 1, K 1, DEF 1), gives
// mds_test a second QB (Hurts) and RB (Gibbs), and fixes State.gameTimesByTeam (the tests block ESPN).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const LEAGUE = fixture('league.json');
const ROSTERS = fixture('league-rosters.json');

const ALLEN = '4984', HURTS = '6904', GIBBS = '9221';
const MOVED = [HURTS, GIBBS]; // Jalen Hurts (QB, PHI), Jahmyr Gibbs (RB, DET): rival → mds_test

// sleeperStarters: mds_test's lineup on Sleeper (ids in roster_positions order), for the Sleeper comparison.
async function twoQbLeague(page, { sleeperStarters } = {}) {
    const roster_positions = LEAGUE.roster_positions.flatMap(p => (p === 'QB' ? ['QB', 'QB'] : [p]));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...LEAGUE, roster_positions }) }));
    const rosters = ROSTERS.map(r => ({
        ...r,
        players: r.owner_id === '900001' ? [...r.players, ...MOVED] : r.players.filter(id => !MOVED.includes(id)),
        starters: r.owner_id === '900001' && sleeperStarters ? sleeperStarters : r.starters,
    }));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+\/rosters$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rosters) }));
}

// Week 2 kickoffs (the fixed clock is Tuesday 2026-09-15, so none has started).
const ONE_PM = '2026-09-20T17:00:00Z';
const FOUR_25 = '2026-09-20T20:25:00Z';
const SNF = '2026-09-21T00:20:00Z';
const MNF = '2026-09-22T00:15:00Z';
// Allen (BUF, ranked ahead, so the fill puts him in QB1) plays Sunday night, Hurts (PHI) at 1 pm.
const KICKOFFS = { BUF: SNF, PHI: ONE_PM, CIN: FOUR_25, DET: MNF, MIN: ONE_PM, BAL: ONE_PM, LV: ONE_PM, DAL: ONE_PM, LAR: ONE_PM, SF: ONE_PM };

async function setKickoffs(page, times) {
    await page.evaluate(async (map) => {
        const { State } = await import('/js/mls/state.js');
        State.gameTimesByTeam = map;
    }, times);
}

/** The Lineup tab's starters, top to bottom, as "SLOT Name". */
const starterRows = (page) => page.locator('#optimalLineupContainer .lineup-slot').evaluateAll(rows => rows.map(r =>
    `${r.querySelector('.slot-badge').textContent.trim()} ${(r.querySelector('.player-name-wrap')?.textContent || '').replace(/\s*\(\d+\)$/, '').trim()}`));

const RANKS = `Rank,Player,Pos,Team
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

async function setUp(page, opts) {
    const state = await openApp(page, '/lineup/');
    await twoQbLeague(page, opts);
    await seedMls(page);
    await expect(page.locator('#reqQB')).toHaveValue('2');
    await expect(page.locator('#reqSFLEX')).toHaveValue('0');
    await loadMlsRankings(page, RANKS, 9);
    await showTab(page, 'lineup');
    await setKickoffs(page, KICKOFFS);
    return state;
}

test.describe('FLEX Kickoff Optimization in a 2-QB league (F17)', () => {
    test('the QB slots read earliest kickoff first, as the RB and WR slots do', async ({ page }) => {
        const state = await setUp(page);
        await callApp(page, 'optimizeLineup', true);
        // Before F17: QB Josh Allen (Sunday night), QB Jalen Hurts (1 pm). RB, WR and FLEX as before.
        expect(await starterRows(page)).toEqual([
            'QB Jalen Hurts', 'QB Josh Allen', 'RB Derrick Henry', 'RB Jahmyr Gibbs', 'WR Justin Jefferson', 'WR CeeDee Lamb',
            'TE Brock Bowers', "FLEX Ja'Marr Chase", 'K Justin Tucker', 'DEF Baltimore Ravens',
        ]);
        await expectClean(page, state);
    });

    test('a Sleeper lineup with the QBs the other way round is not a change to set', async ({ page }) => {
        // On Sleeper: the same starters, Allen in QB1 (the rank order).
        const sleeperStarters = [ALLEN, HURTS, '3198', GIBBS, '6794', '6786', '11604', '4866', '17', 'BAL'];
        const state = await setUp(page, { sleeperStarters });
        await callApp(page, 'optimizeLineup', true);
        expect((await starterRows(page)).slice(0, 2)).toEqual(['QB Jalen Hurts', 'QB Josh Allen']);
        await expect(page.locator('#optimalLineupContainer .lineup-needs-sleeper')).toHaveCount(0);
        await showTab(page, 'setup');
        await expect(page.locator('#leagueCards')).not.toContainText('Set on Sleeper');
        await expectClean(page, state);
    });

    test('with the toggle off, the QB slots follow the rank-based fill', async ({ page }) => {
        const state = await setUp(page);
        // In Lineup settings, folded by default (improvements S31).
        await page.locator('#lineupSettings > summary').click();
        await page.locator('#flexKickoffOptimizationToggle').uncheck();
        await callApp(page, 'optimizeLineup', true);
        expect((await starterRows(page)).slice(0, 2)).toEqual(['QB Josh Allen', 'QB Jalen Hurts']);
        await expectClean(page, state);
    });
});
