// Characterization tests for js/mls/scout/waiverScanner.js (lineup/waiverScanner.js until 3C; refactor chunk 0B).
// Pins today's behavior; oddities are listed in docs/refactor/LOG.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as scanner from '../../js/mls/scout/waiverScanner.js';
import {
    FLEX_POSITIONS, buildRankDisplayIndex, compareForScan, matchesPosFilter, findFreeAgents,
    fillLineup, slotAcceptsPos, checkAgainstLineup
} from '../../js/mls/scout/waiverScanner.js';

describe('exports', () => {
    test('public surface is unchanged', () => {
        assert.deepEqual(Object.keys(scanner).sort(), [
            'FLEX_POSITIONS', 'buildRankDisplayIndex', 'checkAgainstLineup', 'compareForScan',
            'fillLineup', 'findFreeAgents', 'matchesPosFilter', 'slotAcceptsPos'
        ]);
        assert.deepEqual(FLEX_POSITIONS, ['RB', 'WR', 'TE']);
    });
});

describe('buildRankDisplayIndex', () => {
    test('empty or non-array input gives {}', () => {
        assert.deepEqual(buildRankDisplayIndex([], () => 'QB'), {});
        assert.deepEqual(buildRankDisplayIndex(null, () => 'QB'), {});
    });

    test('single-file fallback (posRank = flexRank = rank) is re-derived per group', () => {
        // What rankingsParser produces for a SINGLE upload with no Pos Rank column.
        const row = (cleanName, rank, tier) => ({ name: cleanName, cleanName, rank, posRank: rank, flexRank: rank, tier, posTier: tier, flexTier: tier });
        const rankings = [
            row('joshallen', 1, 1), row('bijanrobinson', 2, 1), row('jamarrchase', 3, 1),
            row('justinjefferson', 4, 2), row('lamarjackson', 5, 2), row('justintucker', 6, 3),
            row('travkelce', 7, 3), row('mysteryman', 8, 4)
        ];
        const pos = { joshallen: 'QB', bijanrobinson: 'RB', jamarrchase: 'WR', justinjefferson: 'WR', lamarjackson: 'QB', justintucker: 'K', travkelce: 'TE' };
        const idx = buildRankDisplayIndex(rankings, c => pos[c] || 'UNK');

        assert.deepEqual(idx.joshallen, { pos: 'QB', rank: 1, tier: 1, posRank: 1, posTier: 1, posDerived: false, flexRank: null, flexTier: null, flexDerived: false });
        assert.deepEqual(idx.lamarjackson, { pos: 'QB', rank: 5, tier: 2, posRank: 2, posTier: null, posDerived: true, flexRank: null, flexTier: null, flexDerived: false });
        assert.deepEqual(idx.bijanrobinson, { pos: 'RB', rank: 2, tier: 1, posRank: 1, posTier: null, posDerived: true, flexRank: 1, flexTier: null, flexDerived: true });
        assert.deepEqual(idx.jamarrchase, { pos: 'WR', rank: 3, tier: 1, posRank: 1, posTier: null, posDerived: true, flexRank: 2, flexTier: null, flexDerived: true });
        assert.deepEqual(idx.justinjefferson, { pos: 'WR', rank: 4, tier: 2, posRank: 2, posTier: null, posDerived: true, flexRank: 3, flexTier: null, flexDerived: true });
        assert.deepEqual(idx.justintucker, { pos: 'K', rank: 6, tier: 3, posRank: 1, posTier: null, posDerived: true, flexRank: null, flexTier: null, flexDerived: false });
        assert.deepEqual(idx.travkelce, { pos: 'TE', rank: 7, tier: 3, posRank: 1, posTier: null, posDerived: true, flexRank: 4, flexTier: null, flexDerived: true });
        // Unresolved position: kept as-is, never re-derived.
        assert.deepEqual(idx.mysteryman, { pos: 'UNK', rank: 8, tier: 4, posRank: 8, posTier: 4, posDerived: false, flexRank: null, flexTier: null, flexDerived: false });
    });

    test('real positional ranks are kept, gaps included (horizontal weekly sheet)', () => {
        const rankings = [
            { cleanName: 'qbten', rank: 10, posRank: 10, flexRank: 999, posTier: 3 },
            { cleanName: 'qbfourteen', rank: 14, posRank: 14, flexRank: 999, posTier: 4 },
            { cleanName: 'wrthree', rank: 12, posRank: 3, flexRank: 12, posTier: 1, flexTier: 2 },
            { cleanName: 'kunranked', rank: 999, posRank: 999, flexRank: 999 }
        ];
        const pos = { qbten: 'QB', qbfourteen: 'QB', wrthree: 'WR', kunranked: 'K' };
        const idx = buildRankDisplayIndex(rankings, c => pos[c]);
        assert.deepEqual(idx.qbten, { pos: 'QB', rank: 10, tier: null, posRank: 10, posTier: 3, posDerived: false, flexRank: null, flexTier: null, flexDerived: false });
        assert.deepEqual(idx.qbfourteen, { pos: 'QB', rank: 14, tier: null, posRank: 14, posTier: 4, posDerived: false, flexRank: null, flexTier: null, flexDerived: false });
        assert.deepEqual(idx.wrthree, { pos: 'WR', rank: 12, tier: null, posRank: 3, posTier: 1, posDerived: false, flexRank: 12, flexTier: 2, flexDerived: false });
        assert.deepEqual(idx.kunranked, { pos: 'K', rank: null, tier: null, posRank: null, posTier: null, posDerived: false, flexRank: null, flexTier: null, flexDerived: false });
    });

    test('a non-FLEX player with a flexRank marks the FLEX group as backfilled', () => {
        // posRanks are genuine (differ from rank), so only the FLEX group is re-derived.
        const rankings = [
            { cleanName: 'qb', rank: 1, posRank: 1, flexRank: 1 },
            { cleanName: 'rb', rank: 5, posRank: 2, flexRank: 5, flexTier: 2 },
            { cleanName: 'wr', rank: 9, posRank: 4, flexRank: 9, flexTier: 3 }
        ];
        const pos = { qb: 'QB', rb: 'RB', wr: 'WR' };
        const idx = buildRankDisplayIndex(rankings, c => pos[c]);
        assert.equal(idx.rb.flexRank, 1);
        assert.equal(idx.rb.flexDerived, true);
        assert.equal(idx.rb.flexTier, null);
        assert.equal(idx.wr.flexRank, 2);
        assert.equal(idx.rb.posRank, 2);
        assert.equal(idx.rb.posDerived, false);
        assert.equal(idx.qb.flexRank, null);
    });

    test('FLEX tier is cleared even when the derived flexRank happens to equal the raw one', () => {
        const rankings = [
            { cleanName: 'k', rank: 2, posRank: 7, flexRank: 2 },
            { cleanName: 'rb', rank: 1, posRank: 1, flexRank: 1, flexTier: 1 }
        ];
        const pos = { k: 'K', rb: 'RB' };
        const idx = buildRankDisplayIndex(rankings, c => pos[c]);
        assert.deepEqual([idx.rb.flexRank, idx.rb.flexTier, idx.rb.flexDerived], [1, null, false]);
    });
});

describe('compareForScan', () => {
    test('single position compares posRank, falling back to rank, then 999', () => {
        assert.ok(compareForScan({ posRank: 3 }, { posRank: 5 }, 'WR') < 0);
        assert.ok(compareForScan({ posRank: 999, rank: 2 }, { posRank: 5 }, 'WR') < 0);
        assert.equal(compareForScan({}, { posRank: 5 }, 'WR'), 994);
        assert.equal(compareForScan(null, undefined, 'WR'), 0);
    });
    test('FLEX prefers flexRank; ranked beats unranked; else posRank', () => {
        assert.equal(compareForScan({ flexRank: 10, posRank: 1 }, { flexRank: 4, posRank: 9 }, 'FLEX'), 6);
        assert.equal(compareForScan({ flexRank: 50 }, { flexRank: 999, posRank: 1 }, 'FLEX'), -1);
        assert.equal(compareForScan({ posRank: 1 }, { flexRank: 50 }, 'FLEX'), 1);
        assert.equal(compareForScan({ posRank: 3 }, { posRank: 7 }, 'FLEX'), -4);
    });
    test('null ranks count as unranked', () => {
        assert.equal(compareForScan({ posRank: null, rank: null }, { posRank: 1 }, 'QB'), 998);
    });
});

describe('matchesPosFilter / slotAcceptsPos', () => {
    test('matchesPosFilter', () => {
        assert.equal(matchesPosFilter('UNK', 'ALL'), false);
        assert.equal(matchesPosFilter(null, 'ALL'), false);
        assert.equal(matchesPosFilter('K', 'ALL'), true);
        assert.equal(matchesPosFilter('TE', 'FLEX'), true);
        assert.equal(matchesPosFilter('QB', 'FLEX'), false);
        assert.equal(matchesPosFilter('WR', 'WR'), true);
        assert.equal(matchesPosFilter('WR', 'RB'), false);
    });
    test('slotAcceptsPos', () => {
        assert.equal(slotAcceptsPos('FLEX', 'RB'), true);
        assert.equal(slotAcceptsPos('FLEX', 'QB'), false);
        assert.equal(slotAcceptsPos('SFLEX', 'QB'), true);
        assert.equal(slotAcceptsPos('SFLEX', 'TE'), true);
        assert.equal(slotAcceptsPos('SFLEX', 'K'), false);
        assert.equal(slotAcceptsPos('DEF', 'DEF'), true);
        assert.equal(slotAcceptsPos('WR', 'RB'), false);
    });
});

describe('findFreeAgents', () => {
    const rankings = [
        { name: 'Rostered Guy', cleanName: 'rosteredguy', rank: 1, posRank: 1, flexRank: 1 },
        { name: 'Round 1 Pick', cleanName: 'roundpick', rank: 2 },
        { name: 'Jalen Mystery', cleanName: 'jalenmystery', rank: 3 },
        { name: 'Wide Out B', cleanName: 'wideoutb', rank: 5, posRank: 4, flexRank: 8 },
        { name: 'Running Back A', cleanName: 'runningbacka', rank: 4, posRank: 2, flexRank: 6 },
        { name: 'Quarter Back', cleanName: 'quarterback', rank: 6, posRank: 3, flexRank: 999 },
        null,
        { name: 'No Clean Name' }
    ];
    const pos = { rosteredguy: 'WR', roundpick: 'QB', wideoutb: 'WR', runningbacka: 'RB', quarterback: 'QB' };
    const opts = (posFilter) => ({
        posFilter,
        getPos: c => pos[c] || 'UNK',
        isRostered: c => c === 'rosteredguy',
        isExcluded: r => r.cleanName === 'roundpick'
    });

    test('FLEX: drops rostered, excluded and unresolved; sorts by flexRank; adds pos', () => {
        const res = findFreeAgents(rankings, opts('FLEX'));
        assert.deepEqual(res.freeAgents.map(r => [r.cleanName, r.pos]), [['runningbacka', 'RB'], ['wideoutb', 'WR']]);
        assert.deepEqual(res.freeAgents[0], { name: 'Running Back A', cleanName: 'runningbacka', rank: 4, posRank: 2, flexRank: 6, pos: 'RB' });
        assert.equal(res.unresolvedCount, 1);
        assert.deepEqual(res.unresolvedNames, ['Jalen Mystery']);
    });
    test('ALL sorts by posRank across positions', () => {
        const res = findFreeAgents(rankings, opts('ALL'));
        assert.deepEqual(res.freeAgents.map(r => r.cleanName), ['runningbacka', 'quarterback', 'wideoutb']);
    });
    test('unresolved names are reported even under a position filter that would exclude them', () => {
        const res = findFreeAgents(rankings, opts('QB'));
        assert.deepEqual(res.freeAgents.map(r => r.cleanName), ['quarterback']);
        assert.deepEqual(res.unresolvedNames, ['Jalen Mystery']);
    });
    test('isExcluded is optional; null rankings is an empty result', () => {
        const res = findFreeAgents(rankings, { posFilter: 'QB', getPos: c => pos[c] || 'UNK', isRostered: () => false });
        assert.deepEqual(res.freeAgents.map(r => r.cleanName), ['roundpick', 'quarterback']);
        assert.deepEqual(findFreeAgents(null, opts('ALL')), { freeAgents: [], unresolvedCount: 0, unresolvedNames: [] });
    });
});

describe('fillLineup', () => {
    const c = (id, pos, posRank, flexRank = 999, extra = {}) => ({ id, pos, posRank, flexRank, isLocked: false, unavailable: false, ...extra });
    const ids = res => res.starters.map(s => [s.slotType, s.player && s.player.id]);

    test('fills slots in SLOT_ORDER regardless of input order', () => {
        const res = fillLineup(['K', 'FLEX', 'QB', 'WR', 'RB'], [
            c('k1', 'K', 1), c('rb1', 'RB', 1, 2), c('rb2', 'RB', 5, 9), c('wr1', 'WR', 3, 7), c('wr2', 'WR', 1, 1), c('qb1', 'QB', 2)
        ]);
        assert.deepEqual(ids(res), [['QB', 'qb1'], ['RB', 'rb1'], ['WR', 'wr2'], ['FLEX', 'wr1'], ['K', 'k1']]);
        assert.deepEqual(res.leftover.map(p => p.id), ['rb2']);
    });
    test('FLEX is filled before SFLEX, so FLEX gets the better FLEX player', () => {
        const res = fillLineup(['SFLEX', 'FLEX'], [c('wr', 'WR', 2, 2), c('rb', 'RB', 1, 1)]);
        assert.deepEqual(ids(res), [['FLEX', 'rb'], ['SFLEX', 'wr']]);
    });
    test('locked players are placed first even when worse', () => {
        const res = fillLineup(['WR'], [c('good', 'WR', 1), c('locked', 'WR', 40, 999, { isLocked: true })]);
        assert.deepEqual(ids(res), [['WR', 'locked']]);
    });
    test('unavailable players only start when nobody else fits', () => {
        assert.deepEqual(ids(fillLineup(['RB'], [c('bye', 'RB', 1, 999, { unavailable: true }), c('ok', 'RB', 30)])), [['RB', 'ok']]);
        assert.deepEqual(ids(fillLineup(['RB'], [c('bye', 'RB', 1, 999, { unavailable: true })])), [['RB', 'bye']]);
    });
    test('FLEX: flexRank first, ranked beats unranked, posRank as the last tiebreak', () => {
        assert.deepEqual(ids(fillLineup(['FLEX'], [c('a', 'RB', 1, 999), c('b', 'WR', 50, 30)])), [['FLEX', 'b']]);
        assert.deepEqual(ids(fillLineup(['FLEX'], [c('a', 'RB', 9), c('b', 'TE', 4)])), [['FLEX', 'b']]);
    });
    test('SFLEX: ranked QB, then FLEX by flexRank, then FLEX by posRank', () => {
        assert.deepEqual(ids(fillLineup(['SFLEX'], [c('rb', 'RB', 1, 1), c('qb', 'QB', 30)])), [['SFLEX', 'qb']]);
        assert.deepEqual(ids(fillLineup(['SFLEX'], [c('rb', 'RB', 1, 999), c('wr', 'WR', 9, 40), c('qb', 'QB', 999)])), [['SFLEX', 'wr']]);
        assert.deepEqual(ids(fillLineup(['SFLEX'], [c('rb', 'RB', 7), c('te', 'TE', 3), c('qb', 'QB', 999)])), [['SFLEX', 'te']]);
        // A QB with no rank at all never fills SFLEX.
        assert.deepEqual(ids(fillLineup(['SFLEX'], [c('qb', 'QB', 999)])), [['SFLEX', null]]);
        // A locked QB or FLEX player wins outright.
        assert.deepEqual(ids(fillLineup(['SFLEX'], [c('qb', 'QB', 1), c('te', 'TE', 30, 999, { isLocked: true })])), [['SFLEX', 'te']]);
    });
    test('an unfillable slot gets player null', () => {
        assert.deepEqual(ids(fillLineup(['QB', 'DEF'], [c('qb', 'QB', 1)])), [['QB', 'qb'], ['DEF', null]]);
    });
    test('CURRENT BEHAVIOR: slot types outside SLOT_ORDER are silently never filled', () => {
        const res = fillLineup(['QB', 'DL', 'BN'], [c('qb', 'QB', 1), c('dl', 'DL', 1)]);
        assert.deepEqual(ids(res), [['QB', 'qb']]);
        assert.deepEqual(res.leftover.map(p => p.id), ['dl']);
    });
    test('does not mutate the candidates array', () => {
        const cands = [c('qb', 'QB', 1)];
        fillLineup(['QB'], cands);
        assert.equal(cands.length, 1);
    });
});

describe('checkAgainstLineup', () => {
    const P = (id, pos) => ({ id, name: id.toUpperCase(), pos });
    const ranks = {
        qb1: { posRank: 3 },
        rb1: { posRank: 2, flexRank: 3 }, rb2: { posRank: 15, flexRank: 30 },
        wr1: { posRank: 8, flexRank: 15 }, wr2: { posRank: 20, flexRank: 35 },
        te1: { posRank: 6, flexRank: 50 }, rb3: { posRank: 25, flexRank: 40 },
        faStrong: { posRank: 5, flexRank: 10 }, faWeak: { posRank: 30, flexRank: 60 }
    };
    const lineup = [
        { slotType: 'QB', player: P('qb1', 'QB') },
        { slotType: 'RB', player: P('rb1', 'RB') }, { slotType: 'RB', player: P('rb2', 'RB') },
        { slotType: 'WR', player: P('wr1', 'WR') }, { slotType: 'WR', player: P('wr2', 'WR') },
        { slotType: 'TE', player: P('te1', 'TE') },
        { slotType: 'FLEX', player: P('rb3', 'RB') }
    ];
    const deps = (over = {}) => ({
        rankOf: p => ranks[p.id] || null,
        isLocked: () => false,
        isUnavailable: () => false,
        ...over
    });

    test('noSlot when no starting slot takes the position', () => {
        assert.deepEqual(checkAgainstLineup(P('faK', 'K'), lineup, deps()), { status: 'noSlot' });
    });
    test('starts: the lineup reshuffles and the FLEX RB is the one pushed out', () => {
        const res = checkAgainstLineup(P('faStrong', 'WR'), lineup, deps());
        assert.equal(res.status, 'starts');
        assert.equal(res.displaced.id, 'rb3');
        assert.equal(res.displacedSlotType, 'FLEX');
        assert.equal(res.fillsEmptySlot, false);
    });
    test('bench: names the bubble starter he would need to pass', () => {
        const res = checkAgainstLineup(P('faWeak', 'WR'), lineup, deps());
        assert.equal(res.status, 'bench');
        assert.equal(res.bubble.id, 'rb3');
        assert.equal(res.bubbleSlotType, 'FLEX');
    });
    test('unavailable: a strong FA on bye never starts and says so', () => {
        const res = checkAgainstLineup(P('faStrong', 'WR'), lineup, deps({ isUnavailable: p => p.id === 'faStrong' }));
        assert.deepEqual(res, { status: 'unavailable' });
    });
    test('locked: every eligible slot holds a locked player', () => {
        const small = [{ slotType: 'WR', player: P('wr1', 'WR') }, { slotType: 'FLEX', player: P('rb3', 'RB') }];
        const res = checkAgainstLineup(P('faStrong', 'WR'), small, deps({ isLocked: p => p.id === 'wr1' || p.id === 'rb3' }));
        assert.deepEqual(res, { status: 'locked' });
    });
    test('starts into an empty slot: displaced null, fillsEmptySlot true', () => {
        const withHole = [{ slotType: 'WR', player: P('wr1', 'WR') }, { slotType: 'WR', player: null }];
        assert.deepEqual(checkAgainstLineup(P('faWeak', 'WR'), withHole, deps()), { status: 'starts', displaced: null, fillsEmptySlot: true });
    });
    test('rankOf returning null treats the player as unranked (999)', () => {
        const res = checkAgainstLineup(P('nobody', 'WR'), lineup, deps());
        assert.equal(res.status, 'bench');
        assert.equal(res.bubble.id, 'rb3');
    });
});
