// Playoff chances (improvements S55): the season and bracket simulation (js/mls/sim/playoffs.js), each team's weekly
// strength (sim/playoffStrength.js) and what sync saves (leagues/playoffData.js). tests/mls-playoff-odds.spec.mjs covers
// the Dashboard card, the Roster tab's record and Power Rankings.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { bracketOrder, byeCount, playoffCertainty, simulatePlayoffs } from '../../js/mls/sim/playoffs.js';
import { LASTING_SD, PF_SPREAD_CV, QB_STACK_CORRELATION, WEEKLY_SPREAD_SCALE, liveStrength, pointsForStrength, projectedStrength } from '../../js/mls/sim/playoffStrength.js';
import { MAX_WEEKS_LEFT, pairsFrom, playoffDataFrom } from '../../js/mls/leagues/playoffData.js';

// A seeded generator, so the numbers are the same on every run.
function seeded(seed = 1) {
    let a = seed;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Eight teams, one week left, four make it: 1 is 11-2 (clinched), 8 is 2-11 (eliminated), the rest in between.
const TEAMS = [
    { rid: 1, w: 11, l: 2, t: 0, pf: 1700 }, { rid: 2, w: 9, l: 4, t: 0, pf: 1600 }, { rid: 3, w: 8, l: 5, t: 0, pf: 1550 },
    { rid: 4, w: 7, l: 6, t: 0, pf: 1500 }, { rid: 5, w: 7, l: 6, t: 0, pf: 1450 }, { rid: 6, w: 6, l: 7, t: 0, pf: 1400 },
    { rid: 7, w: 2, l: 11, t: 0, pf: 1300 }, { rid: 8, w: 2, l: 11, t: 0, pf: 1250 },
];
const EVEN = Object.fromEntries(TEAMS.map(t => [t.rid, [120, 20]]));
const WEEK14 = { games: [[1, 8], [2, 7], [3, 6], [4, 5]], strength: EVEN };

describe('playoffCertainty', () => {
    test('one week left, four spots: clinched and eliminated only when the records prove it', () => {
        const c = playoffCertainty({ teams: TEAMS, weeksLeft: 1, playoffTeams: 4 });
        assert.deepEqual(c[1], { clinched: true, eliminated: false });
        assert.deepEqual(c[2], { clinched: true, eliminated: false }); // 9 wins: only 1 can reach it
        assert.deepEqual(c[3], { clinched: false, eliminated: false }); // 4, 5 can tie at 8
        assert.deepEqual(c[6], { clinched: false, eliminated: false }); // 7 wins could tie 4th
        assert.deepEqual(c[7], { clinched: false, eliminated: true });
        assert.deepEqual(c[8], { clinched: false, eliminated: true });
    });
    test('a tie on record is never safe, either way', () => {
        const teams = [{ rid: 1, w: 5, l: 0, t: 0 }, { rid: 2, w: 4, l: 1, t: 0 }, { rid: 3, w: 4, l: 1, t: 0 }];
        const c = playoffCertainty({ teams, weeksLeft: 0, playoffTeams: 2 });
        assert.equal(c[1].clinched, true);
        assert.equal(c[2].clinched, false); assert.equal(c[2].eliminated, false);
    });
    test('the median doubles the games left', () => {
        const teams = [{ rid: 1, w: 10, l: 0, t: 0 }, { rid: 2, w: 9, l: 1, t: 0 }, { rid: 3, w: 8, l: 2, t: 0 }];
        assert.equal(playoffCertainty({ teams, weeksLeft: 1, playoffTeams: 1 })[3].eliminated, true);
        assert.equal(playoffCertainty({ teams, weeksLeft: 1, median: true, playoffTeams: 1 })[3].eliminated, false);
    });
    test('divisions: a team sure to win its division is in, and one that still can is not out', () => {
        const teams = [
            { rid: 1, w: 9, l: 1, t: 0, div: 1 }, { rid: 2, w: 8, l: 2, t: 0, div: 1 }, { rid: 3, w: 8, l: 2, t: 0, div: 1 },
            { rid: 4, w: 3, l: 7, t: 0, div: 2 }, { rid: 5, w: 1, l: 9, t: 0, div: 2 },
        ];
        const c = playoffCertainty({ teams, weeksLeft: 1, playoffTeams: 3, divisions: true });
        assert.equal(c[4].clinched, true); // nobody in division 2 can catch it
        assert.equal(c[5].eliminated, true);
        // Without divisions, team 4 would be out: three teams are already sure to finish ahead of it.
        assert.equal(playoffCertainty({ teams, weeksLeft: 1, playoffTeams: 3 })[4].eliminated, true);
    });
});

describe('simulatePlayoffs', () => {
    test('the playoff shares add up to the number of spots, byes to the byes, titles to one', () => {
        const out = simulatePlayoffs({ teams: TEAMS, weeks: [WEEK14], playoffTeams: 6, playoffStrength: EVEN, runs: 4000, random: seeded(7) });
        const sum = (k) => Object.values(out.odds).reduce((a, o) => a + o[k], 0);
        assert.ok(Math.abs(sum('playoff') - 6) < 1e-9);
        assert.equal(out.byes, 2);
        assert.ok(Math.abs(sum('bye') - 2) < 1e-9);
        assert.ok(Math.abs(sum('title') - 1) < 1e-9);
    });
    const TEAMS2 = TEAMS.map(t => (t.rid === 4 ? { ...t, pf: 1560 } : t));
    test('agrees with the certainty check: a clinched team always makes it, an eliminated one never', () => {
        const out = simulatePlayoffs({ teams: TEAMS2, weeks: [WEEK14], playoffTeams: 3, playoffStrength: EVEN, runs: 3000, random: seeded(3) });
        assert.equal(out.odds[1].playoff, 1);
        assert.equal(out.odds[2].playoff, 1);
        assert.equal(out.odds[7].playoff, 0);
        assert.equal(out.odds[8].playoff, 0);
        // Three spots. 3 (8-5) plays 6; 4 (7-6, more points for than 3) plays 5: if 3 loses and 4 wins, points for
        // decide the third spot.
        const c = playoffCertainty({ teams: TEAMS2, weeksLeft: 1, playoffTeams: 3 });
        assert.deepEqual([c[1].clinched, c[2].clinched, c[3].clinched, c[7].eliminated, c[8].eliminated], [true, true, false, true, true]);
        assert.ok(out.odds[3].playoff > 0.5 && out.odds[3].playoff < 1);
        assert.ok(out.odds[4].playoff > 0 && out.odds[4].playoff < 0.5);
        assert.equal(out.odds[6].playoff, 0);
        assert.equal(c[6].eliminated, true); // at best 7 wins, behind 1, 2 and 3
        assert.equal(out.byes, 1); // three teams: the top seed sits out the first round
        assert.equal(out.odds[1].bye, 1);
    });
    test('a stronger team wins more often, and points for breaks a tie on record', () => {
        const teams = [{ rid: 1, w: 5, l: 5, t: 0, pf: 1000 }, { rid: 2, w: 5, l: 5, t: 0, pf: 1100 }];
        const out = simulatePlayoffs({ teams, weeks: [], playoffTeams: 1, runs: 200, random: seeded(1) });
        assert.equal(out.odds[2].playoff, 1);
        const strong = { 1: [140, 10], 2: [100, 10] };
        const g = simulatePlayoffs({ teams, weeks: [{ games: [[1, 2]], strength: strong }], playoffTeams: 1, runs: 2000, random: seeded(2) });
        assert.ok(g.odds[1].playoff > 0.95);
    });
    test('the median adds a win for the top half each week', () => {
        const teams = [1, 2, 3, 4].map(rid => ({ rid, w: 0, l: 0, t: 0, pf: 0 }));
        const strength = { 1: [150, 1], 2: [140, 1], 3: [100, 1], 4: [90, 1] };
        const out = simulatePlayoffs({ teams, weeks: [{ games: [[1, 2], [3, 4]], strength }], median: true, playoffTeams: 2, runs: 50, random: seeded(4) });
        assert.equal(out.odds[1].playoff, 1); // 2-0
        assert.equal(out.odds[2].playoff, 1); // 1-1 with the most points of the rest
    });
    test('divisions: each division\'s winner gets a top seed', () => {
        const teams = [
            { rid: 1, w: 9, l: 1, t: 0, pf: 1, div: 1 }, { rid: 2, w: 8, l: 2, t: 0, pf: 1, div: 1 }, { rid: 3, w: 2, l: 8, t: 0, pf: 1, div: 2 },
        ];
        const out = simulatePlayoffs({ teams, weeks: [], playoffTeams: 2, divisions: true, runs: 20, random: seeded(5) });
        assert.equal(out.odds[3].playoff, 1);
        assert.equal(out.odds[2].playoff, 0);
    });
    test('a lasting miss per team gives a long shot more of a chance over several weeks (round 2)', () => {
        // Two games behind with four to play, against a team projected 20 points a week better.
        const teams = [{ rid: 1, w: 8, l: 2, t: 0, pf: 1300 }, { rid: 2, w: 6, l: 4, t: 0, pf: 1200 }];
        const strength = { 1: [140, 25], 2: [120, 25] };
        const weeks = [1, 2, 3, 4].map(() => ({ games: [], strength }));
        const run = (lastingSd) => simulatePlayoffs({ teams, weeks, median: true, playoffTeams: 1, playoffStrength: strength, lastingSd, runs: 20000, random: seeded(9) }).odds[2].playoff;
        const without = run(0), withIt = run(LASTING_SD);
        assert.ok(withIt > without * 1.3, `${without} -> ${withIt}`);
        assert.ok(withIt < 0.2);
    });
    test('the bracket: neighbours play, top seeds get the byes', () => {
        assert.deepEqual(bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
        assert.deepEqual([4, 5, 6, 7, 8, 12].map(byeCount), [0, 3, 2, 1, 0, 4]);
    });
});

describe('team strength', () => {
    const pos = { q: 'QB', w1: 'WR', w2: 'WR', r: 'RB', b: 'WR' };
    const team = { q: 'KC', w1: 'KC', w2: 'BUF', r: 'KC', b: 'NYJ' };
    const proj = { q: 20, w1: 15, w2: 12, r: 10, b: 3 };
    test('the best lineup by projection, its spread widened by a QB-WR stack', () => {
        const got = projectedStrength(['QB', 'WR', 'FLEX'], Object.keys(pos), { projOf: id => proj[id], posOf: id => pos[id], teamOf: id => team[id] });
        // No history: the Simulator's fallback spread, 40% of each projection.
        assert.equal(got[0], 47);
        const sd = (x) => x * 0.4;
        const variance = sd(20) ** 2 + sd(15) ** 2 + sd(12) ** 2 + 2 * QB_STACK_CORRELATION * sd(20) * sd(15);
        // Widened to what the owner's leagues showed (round 2).
        assert.ok(Math.abs(got[1] - Math.sqrt(variance) * WEEKLY_SPREAD_SCALE) < 0.05);
    });
    test('nobody projected: null (points for stands in)', () => {
        assert.equal(projectedStrength(['QB'], ['q'], { projOf: () => undefined, posOf: id => pos[id] }), null);
        assert.deepEqual(pointsForStrength(1200, 10), [120, 120 * PF_SPREAD_CV]);
        assert.equal(pointsForStrength(0, 0), null);
    });
});

describe('the bracket\'s rules (round 5)', () => {
    // Six teams, seeded 1-6 by record. 3, 4 and 5 can't win a game; 1, 2 and 6 are even. 6 beats 3 and 4 beats 5.
    const teams = [1, 2, 3, 4, 5, 6].map(rid => ({ rid, w: 12 - rid, l: rid, t: 0, pf: 1000 }));
    const even = [100, 20], none = [-1000, 1];
    const strength = { 1: even, 2: even, 3: none, 4: none, 5: none, 6: even };
    const run = (opts) => simulatePlayoffs({ teams, playoffTeams: 6, playoffStrength: strength, runs: 20000, random: seeded(21), ...opts }).odds;
    test('fixed: 1 plays the winner of 4 v 5, 2 plays 6', () => {
        const o = run({});
        assert.ok(Math.abs(o[1].title - 0.5) < 0.02 && Math.abs(o[2].title - 0.25) < 0.02 && Math.abs(o[6].title - 0.25) < 0.02, JSON.stringify(o));
    });
    test('re-seeded: the best seed left plays the worst, so 1 gets 6 and 2 gets 4', () => {
        const o = run({ reseed: true });
        assert.ok(Math.abs(o[1].title - 0.25) < 0.02 && Math.abs(o[2].title - 0.5) < 0.02 && Math.abs(o[6].title - 0.25) < 0.02, JSON.stringify(o));
        assert.ok(Math.abs(Object.values(o).reduce((a, x) => a + x.title, 0) - 1) < 1e-9);
    });
    test('re-seeding with odd numbers: 5 and 7 teams', () => {
        for (const P of [3, 5, 7]) {
            const t = Array.from({ length: 8 }, (_, i) => ({ rid: i + 1, w: 20 - i, l: i, t: 0, pf: 1000 }));
            const o = simulatePlayoffs({ teams: t, playoffTeams: P, reseed: true, runs: 2000, random: seeded(P) }).odds;
            assert.ok(Math.abs(Object.values(o).reduce((a, x) => a + x.title, 0) - 1) < 1e-9, `P=${P}`);
            assert.equal(Object.values(o).filter(x => x.title > 0).length, P);
        }
    });
    test('a two-week final favours the stronger team', () => {
        const two = [{ rid: 1, w: 9, l: 1, t: 0, pf: 1 }, { rid: 2, w: 8, l: 2, t: 0, pf: 1 }];
        const ps = { 1: [110, 20], 2: [100, 20] };
        const odds = (roundType) => simulatePlayoffs({ teams: two, playoffTeams: 2, playoffStrength: ps, roundType, runs: 40000, random: seeded(8) }).odds[1].title;
        const one = odds(0), double = odds(1);
        assert.ok(Math.abs(one - 0.638) < 0.015, `${one}`);
        assert.ok(Math.abs(double - 0.691) < 0.015, `${double}`);
    });
});

describe('live scores (round 4)', () => {
    test('final, in progress, not started, and out', () => {
        const [mean, sd, share] = liveStrength([
            { id: 'a', actual: 20, shareLeft: 0, projected: 15 },          // final: 20, no spread
            { id: 'b', actual: 6, shareLeft: 0.5, projected: 12 },         // half his game left: 6 + 6
            { id: 'c', actual: null, shareLeft: 0, projected: 10 },        // not started: his projection
            { id: 'd', actual: null, shareLeft: 0, projected: 9, excluded: true }, // Out: left out
        ]);
        assert.equal(mean, 42);
        assert.ok(sd > 0);
        // Of 37 projected points, 6 (half of b) + 10 (c) are still to play.
        assert.ok(Math.abs(share - 16 / 37) < 1e-9);
        assert.deepEqual(liveStrength([{ id: 'a', actual: 20, shareLeft: 0, projected: 15 }]), [20, 0, 0]);
    });
    test('a finished week decides its games, the lasting miss doesn\'t reach it', () => {
        const teams = [{ rid: 1, w: 5, l: 5, t: 0, pf: 1000 }, { rid: 2, w: 5, l: 5, t: 0, pf: 1200 }];
        const weeks = [{ games: [[1, 2]], strength: { 1: [130, 0], 2: [100, 0] }, share: { 1: 0, 2: 0 } }];
        const out = simulatePlayoffs({ teams, weeks, playoffTeams: 1, lastingSd: LASTING_SD, runs: 2000, random: seeded(11) });
        assert.equal(out.odds[1].playoff, 1);
    });
});

describe('playoffDataFrom (sync)', () => {
    const roster = (rid, w, l, extra = {}) => ({ roster_id: rid, owner_id: `u${rid}`, players: [`p${rid}`], settings: { wins: w, losses: l, ties: 0, fpts: 1000 + rid, fpts_decimal: 50, ...extra } });
    const league = (settings) => ({ settings: { playoff_week_start: 15, playoff_teams: 4, ...settings } });
    const rosters = [roster(1, 11, 2), roster(2, 9, 4), roster(3, 6, 7), roster(4, 2, 11)];
    const weekOf = (w) => [{ roster_id: 1, matchup_id: 1 }, { roster_id: 2, matchup_id: 2 }, { roster_id: 3, matchup_id: 2 }, { roster_id: 4, matchup_id: 1 }, { roster_id: 5, matchup_id: null, week: w }];

    test('standings, the weeks left and each week\'s pairs', async () => {
        const asked = [];
        const got = await playoffDataFrom('L', league({}), rosters, { ownerOf: r => r.owner_id, fetchMatchups: async (id, w) => { asked.push(w); return weekOf(w); } });
        assert.deepEqual(asked, [14]);
        assert.equal(got.firstWeek, 14);
        assert.deepEqual(got.schedule, { 14: [[1, 4], [2, 3]] });
        assert.deepEqual(got.standings[0], { rid: 1, w: 11, l: 2, t: 0, pf: 1001.5, div: 0 });
        assert.deepEqual(got.owners, { 1: 'u1', 2: 'u2', 3: 'u3', 4: 'u4' });
        assert.equal(got.reseed, false);
        assert.equal(got.roundType, 0);
        const rs = await playoffDataFrom('L', league({ playoff_seed_type: 1, playoff_round_type: 1 }), rosters, { ownerOf: r => r.owner_id, fetchMatchups: async (id, w) => weekOf(w) });
        assert.deepEqual([rs.reseed, rs.roundType], [true, 1]);
    });
    test('kept weeks are not asked again; a week that fails, too far out, or a guillotine: null', async () => {
        const asked = [];
        const fetchMatchups = async (id, w) => { asked.push(w); return weekOf(w); };
        await playoffDataFrom('L', league({}), rosters, { ownerOf: () => '', existing: { schedule: { 14: [[1, 2]] } }, fetchMatchups });
        assert.deepEqual(asked, []);
        assert.equal(await playoffDataFrom('L', league({}), rosters, { ownerOf: () => '', fetchMatchups: async () => { throw new Error('x'); } }), null);
        const early = rosters.map(r => ({ ...r, settings: { ...r.settings, wins: 1, losses: 1 } }));
        assert.equal(await playoffDataFrom('L', league({}), early, { ownerOf: () => '', fetchMatchups }), null);
        assert.ok(15 - 3 > MAX_WEEKS_LEFT);
        assert.equal(await playoffDataFrom('L', league({ type: 3 }), rosters, { ownerOf: () => '', fetchMatchups }), null);
        assert.equal(pairsFrom(null).length, 0);
    });
});
