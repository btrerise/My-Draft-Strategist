// The Trade Analyzer's "after the trade" comparison (improvements S14): js/mls/trade/lineupImpact.js,
// scored with the real Power Rankings math (js/mls/power/shared.js, loaded through powerEnv.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadPower } from './helpers/powerEnv.mjs';
import {
    leagueAfterTrade, lineupSummaryText, lineupTradeChanges, openPowerSlots, powerSummaryText,
    powerTradeImpact, startPct, tradeHeadline, tradePartner
} from '../../js/mls/trade/lineupImpact.js';

const { computePositionalPower, POWER_DEFAULT_REQS } = await loadPower();

// [clean name, pos, owner, overall rank or null (unranked)]
function makeLeague(players, reqs) {
    const league = { leagueId: 'L1', reqs, globalRosterMap: {}, globalPosMap: {}, roster: [] };
    const rankings = [];
    players.forEach(([clean, pos, owner, rank]) => {
        if (owner) league.globalRosterMap[clean] = owner;
        league.globalPosMap[clean] = pos;
        if (owner === 'You') league.roster.push({ id: clean, cleanName: clean, name: clean, isTaxi: false });
        if (rank != null) rankings.push({ cleanName: clean, name: clean, rank });
    });
    // Position ranks in overall order, FLEX ranks for RB/WR/TE, as a single-file upload's display ranks read.
    const byPos = {};
    let flex = 0;
    rankings.sort((a, b) => a.rank - b.rank).forEach(r => {
        const pos = league.globalPosMap[r.cleanName];
        r.posRank = byPos[pos] = (byPos[pos] || 0) + 1;
        if (['RB', 'WR', 'TE'].includes(pos)) r.flexRank = ++flex;
    });
    return { league, rankings };
}
const rankOfFrom = (rankings) => { const m = new Map(rankings.map(r => [r.cleanName, r])); return (p) => (p && m.get(p.cleanName)) || null; };
const getPosFrom = (league) => (clean) => league.globalPosMap[clean] || 'UNK';

const ONE_QB = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, K: 0, DEF: 0 };
const BASE = [
    ['qb1', 'QB', 'You', 10], ['rb1', 'RB', 'You', 2], ['rb2', 'RB', 'You', 8], ['wr1', 'WR', 'You', 3],
    ['wr2', 'WR', 'You', 12], ['wr3', 'WR', 'You', 20], ['te1', 'TE', 'You', 15],
    ['qbR', 'QB', 'Rival', 5], ['rbR', 'RB', 'Rival', 4], ['rbR2', 'RB', 'Rival', 18], ['rbR3', 'RB', 'Rival', 25],
    ['wrR', 'WR', 'Rival', 1], ['wrR2', 'WR', 'Rival', 14], ['wrR3', 'WR', 'Rival', 7], ['teR', 'TE', 'Rival', 9],
    ['fa', 'RB', null, 30],
];

describe('tradePartner', () => {
    const map = { a: 'You', b: 'Rival', c: 'Rival', d: 'Third' };
    test('one other team', () => assert.equal(tradePartner(map, ['b', 'c']), 'Rival'));
    test('free agents only', () => assert.equal(tradePartner(map, ['zz']), null));
    test('two teams', () => assert.equal(tradePartner(map, ['b', 'd']), null));
});

describe('leagueAfterTrade', () => {
    test('moves players without touching the original', () => {
        const { league } = makeLeague(BASE, ONE_QB);
        const after = leagueAfterTrade(league, ['rb1'], [{ cleanName: 'wrR', pos: 'WR' }, { cleanName: 'new', pos: 'TE' }], 'Rival');
        assert.equal(after.globalRosterMap.rb1, 'Rival');
        assert.equal(after.globalRosterMap.wrR, 'You');
        assert.equal(after.globalPosMap.new, 'TE');
        assert.equal(league.globalRosterMap.rb1, 'You');
        assert.equal(league.globalPosMap.new, undefined);
    });
    test('no partner: your players leave every roster', () => {
        const { league } = makeLeague(BASE, ONE_QB);
        assert.equal(leagueAfterTrade(league, ['rb1'], [{ cleanName: 'fa', pos: 'RB' }], null).globalRosterMap.rb1, undefined);
    });
});

describe('2-for-1 that leaves an empty slot', () => {
    // You give both your RBs for the Rival's best WR: two RB slots, no RB left.
    const { league, rankings } = makeLeague(BASE, ONE_QB);
    const reqs = { ...POWER_DEFAULT_REQS, ...league.reqs };
    const trade = { give: ['rb1', 'rb2'], get: [{ cleanName: 'wrR', pos: 'WR' }], partner: 'Rival', reqs };
    const impact = powerTradeImpact(league, trade, (l) => computePositionalPower(l, rankings));

    test('power ranks: your RB room drops, your WR room rises, the partner the other way', () => {
        assert.equal(impact.teams, 2);
        assert.equal(impact.you.before.rbRank, 1);
        assert.equal(impact.you.after.rbRank, 2);
        assert.equal(impact.you.before.wrRank, 2);
        assert.equal(impact.you.after.wrRank, 1);
        assert.equal(impact.partner.owner, 'Rival');
        assert.equal(impact.partner.after.rbRank, 1);
    });
    test('both RB slots are new holes; the partner has none', () => {
        assert.deepEqual(impact.you.newHoles, ['RB', 'RB']);
        assert.deepEqual(openPowerSlots(impact.you.before, reqs), []);
        assert.deepEqual(impact.partner.newHoles, []);
    });
    test('summary in words', () => {
        assert.equal(powerSummaryText(impact.you, impact.teams),
            'Starting lineup stays 2nd of 2, but weaker: 93% → 87% of league average. Stronger at WR (2nd → 1st); weaker at RB (1st → 2nd).');
    });
    test('a hole already there before the trade isn\'t reported', () => {
        const thin = makeLeague(BASE.filter(p => p[0] !== 'rb2'), ONE_QB);
        const r = { ...POWER_DEFAULT_REQS, ...thin.league.reqs };
        const imp = powerTradeImpact(thin.league, { give: ['rb1'], get: [{ cleanName: 'wrR', pos: 'WR' }], partner: 'Rival', reqs: r },
            (l) => computePositionalPower(l, thin.rankings));
        assert.deepEqual(openPowerSlots(imp.you.before, r), ['RB']);
        assert.deepEqual(imp.you.newHoles, ['RB']);
    });
    test('manual view: the RB slots go empty, slot by slot', () => {
        const rankOf = rankOfFrom(rankings);
        const { rows } = lineupTradeChanges(league.reqs, league.roster, new Set(['rb1', 'rb2']),
            [{ cleanName: 'wrR', name: 'wrR', pos: 'WR' }], { getPos: getPosFrom(league), rankOf });
        assert.deepEqual(rows.map(r => [r.slotType, r.out && r.out.cleanName, r.in && r.in.cleanName]), [
            ['RB', 'rb1', null], ['RB', 'rb2', null], ['WR', 'wr1', 'wrR'], ['WR', 'wr2', 'wr1'], ['FLEX', 'wr3', 'wr2'],
        ]);
        assert.equal(lineupSummaryText(rows, rankOf, p => p.cleanName), 'RB left empty; better at WR; better at FLEX.');
    });
});

describe('QB swap in a superflex league', () => {
    const SF = { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 0, SFLEX: 1, K: 0, DEF: 0 };
    const players = [
        ['qbA', 'QB', 'You', 10], ['qbB', 'QB', 'You', 22], ['rb1', 'RB', 'You', 2], ['wr1', 'WR', 'You', 3], ['wr2', 'WR', 'You', 40],
        ['qbStar', 'QB', 'Rival', 1], ['qbR2', 'QB', 'Rival', 30], ['rbR', 'RB', 'Rival', 4], ['wrR', 'WR', 'Rival', 6],
    ];
    const { league, rankings } = makeLeague(players, SF);
    const rankOf = rankOfFrom(rankings);

    test('your second QB for their star: QB and SFLEX both change hands', () => {
        const { rows } = lineupTradeChanges(league.reqs, league.roster, new Set(['qbB']),
            [{ cleanName: 'qbStar', name: 'qbStar', pos: 'QB' }], { getPos: getPosFrom(league), rankOf });
        assert.deepEqual(rows.map(r => [r.slotType, r.out.cleanName, r.in.cleanName]), [['QB', 'qbA', 'qbStar'], ['SFLEX', 'qbB', 'qbA']]);
        assert.equal(lineupSummaryText(rows, rankOf, p => p.cleanName), 'Better at QB; better at SFLEX.');
    });
    test('power ranks: the QB room moves to first', () => {
        const reqs = { ...POWER_DEFAULT_REQS, ...SF };
        const imp = powerTradeImpact(league, { give: ['qbB'], get: [{ cleanName: 'qbStar', pos: 'QB' }], partner: 'Rival', reqs },
            (l) => computePositionalPower(l, rankings));
        assert.equal(imp.you.before.qbRank, 2);
        assert.equal(imp.you.after.qbRank, 1);
        assert.ok(imp.you.after.starters.some(p => p.slot === 'SFLEX' && p.pos === 'QB'));
        assert.match(powerSummaryText(imp.you, imp.teams), /Stronger at QB \(2nd → 1st\)/);
    });
    test('a QB against a WR in SFLEX is judged by the overall rank', () => {
        const rows = [{ slotType: 'SFLEX', out: { cleanName: 'qbB', pos: 'QB' }, in: { cleanName: 'wr1', pos: 'WR' } }];
        assert.equal(lineupSummaryText(rows, rankOf, p => p.cleanName), 'Better at SFLEX.');
    });
});

describe('an unranked incoming player', () => {
    const players = [...BASE, ['nobody', 'RB', 'Rival', null]];
    const { league, rankings } = makeLeague(players, ONE_QB);
    const rankOf = rankOfFrom(rankings);

    test("manual view: the slot can't be compared", () => {
        const { rows } = lineupTradeChanges(league.reqs, league.roster, new Set(['rb2']),
            [{ cleanName: 'nobody', name: 'Nobody Ranked', pos: 'RB' }], { getPos: getPosFrom(league), rankOf });
        assert.deepEqual(rows.map(r => [r.slotType, r.out && r.out.cleanName, r.in && r.in.cleanName]), [['RB', 'rb2', 'nobody']]);
        assert.equal(lineupSummaryText(rows, rankOf, p => p.name), "Can't compare at RB (Nobody Ranked is unranked).");
    });
    test('power ranks: he counts as unranked, so your RB room drops', () => {
        const reqs = { ...POWER_DEFAULT_REQS, ...league.reqs };
        const imp = powerTradeImpact(league, { give: ['rb2'], get: [{ cleanName: 'nobody', pos: 'RB' }], partner: 'Rival', reqs },
            (l) => computePositionalPower(l, rankings));
        const before = imp.you.before.scores.RB, after = imp.you.after.scores.RB;
        assert.ok(after < before);
        assert.ok(imp.you.after.players.RB.some(p => p.cleanName === 'nobody' && p.rank === 300));
    });
});

describe('no change', () => {
    test("a bench swap leaves the starters alone", () => {
        const { league, rankings } = makeLeague([...BASE, ['wr9', 'WR', 'You', 60], ['wrR9', 'WR', 'Rival', 61]], ONE_QB);
        const { rows } = lineupTradeChanges(league.reqs, league.roster, new Set(['wr9']),
            [{ cleanName: 'wrR9', name: 'wrR9', pos: 'WR' }], { getPos: getPosFrom(league), rankOf: rankOfFrom(rankings) });
        assert.deepEqual(rows, []);
        assert.equal(lineupSummaryText(rows, rankOfFrom(rankings)), "Your starters don't change.");
    });
});

describe('dynasty: future value', () => {
    // Your old RB room for their young one: the starting lineup barely moves, the future flips.
    const players = [
        ['qb1', 'QB', 'You', 10], ['rbOld', 'RB', 'You', 3], ['rbOld2', 'RB', 'You', 9], ['wr1', 'WR', 'You', 4], ['wr2', 'WR', 'You', 12],
        ['te1', 'TE', 'You', 15],
        ['qbR', 'QB', 'Rival', 11], ['rbYoung', 'RB', 'Rival', 5], ['rbYoung2', 'RB', 'Rival', 8], ['wrR', 'WR', 'Rival', 2],
        ['wrR2', 'WR', 'Rival', 14], ['teR', 'TE', 'Rival', 16],
    ];
    const ages = { qb1: 27, rbOld: 30, rbOld2: 29, wr1: 26, wr2: 26, te1: 27, qbR: 27, rbYoung: 22, rbYoung2: 22, wrR: 26, wrR2: 26, teR: 27 };
    const { league, rankings } = makeLeague(players, ONE_QB);
    const reqs = { ...POWER_DEFAULT_REQS, ...league.reqs };
    // powerEnv.mjs stubs the age curve to 1, so this scores future value the other way the Roster tab can:
    // from dynasty Market Consensus ranks, where the older players rank 40 spots lower.
    const market = rankings.map(r => ({ ...r, rank: r.rank + (ages[r.cleanName] >= 29 ? 40 : 0) }));
    const imp = powerTradeImpact(league, { give: ['rbOld', 'rbOld2'], get: [{ cleanName: 'rbYoung', pos: 'RB' }, { cleanName: 'rbYoung2', pos: 'RB' }], partner: 'Rival', reqs },
        (l) => computePositionalPower(l, rankings, { future: { mode: 'market', rankings: market } }));

    test('future ranks before and after', () => {
        assert.equal(imp.you.before.futureRank, 2);
        assert.equal(imp.you.after.futureRank, 1);
        assert.equal(imp.partner.after.futureRank, 2);
    });
    test('the summary ends with the future sentence', () => {
        assert.match(powerSummaryText(imp.you, imp.teams), / Future value 2nd → 1st\.$/);
    });
    test('without future value, no future sentence', () => {
        const plain = powerTradeImpact(league, { give: ['rbOld'], get: [{ cleanName: 'rbYoung', pos: 'RB' }], partner: 'Rival', reqs },
            (l) => computePositionalPower(l, rankings));
        assert.doesNotMatch(powerSummaryText(plain.you, plain.teams), /Future/);
    });
});

describe('the headline: value and lineup in one sentence', () => {
    const side = (b, a) => ({ before: { starterScore: b }, after: { starterScore: a } });
    test('pay value to get stronger', () => {
        assert.equal(tradeHeadline({ verdict: 'them', diff: -4389 }, side(0.96, 1.08)),
            'You pay in value (\u22124,389 pts) to make your starting lineup stronger (96% → 108% of league average).');
    });
    test('gain value, lose lineup', () => {
        assert.equal(tradeHeadline({ verdict: 'you', diff: 2100 }, side(1.1, 1.0)),
            'You gain value (+2,100 pts), but your starting lineup gets weaker (110% → 100% of league average): a move for later, not now.');
    });
    test('fair, no lineup change (under a point of league average)', () => {
        assert.equal(tradeHeadline({ verdict: 'fair', diff: 50 }, side(1.001, 1.004)), "A fair trade by value that doesn't change your starting lineup.");
    });
    test('no value verdict, no headline', () => assert.equal(tradeHeadline(null, side(1, 1.2)), null));
    test('summary: rank moves, with the percent; rank stays, same percent', () => {
        const t = (rank, score) => ({ starterRank: rank, starterScore: score, qbRank: 1, rbRank: 1, wrRank: 1, teRank: 1 });
        assert.equal(powerSummaryText({ before: t(5, 0.96), after: t(3, 1.08) }, 12),
            'Starting lineup 5th → 3rd of 12 (96% → 108% of league average). No position room changes rank.');
        assert.equal(powerSummaryText({ before: t(5, 0.96), after: t(5, 0.961) }, 12),
            'Starting lineup stays 5th of 12 (96% of league average). No position room changes rank.');
        assert.equal(startPct({ starterScore: 1.084 }), 108);
        // Under a headline, which already has the percents: words only.
        assert.equal(powerSummaryText({ before: t(5, 0.96), after: t(5, 1.08) }, 12, { pct: false }),
            'Starting lineup stays 5th of 12, but stronger. No position room changes rank.');
    });
});
