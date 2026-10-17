// "To make it fair" in the Trade Analyzer (improvements S19): js/mls/trade/makeFair.js, which picks what the side
// that has to add could add to bring a lopsided trade within the fair band (10%), checking each with the verdict's
// own math, waiver adjustment included.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    fairCandidates, fairSuggestions, gapToClose, nextDraftYears, ownPickNames, roundGap, verdictFromValues
} from '../../js/mls/trade/makeFair.js';

const OFF = { on: false, perSpot: 0 };
const p = (name, value, extra = {}) => ({ name, cleanName: name.toLowerCase(), pos: 'WR', value, isPick: false, ...extra });
const names = (fits) => fits.map(f => f.players.map(x => x.name).join(' + '));

describe('verdictFromValues (the banner\'s math, moved from tradeVerdictNumbers)', () => {
    test('fair within 10% of the bigger side, else favors whoever gets more', () => {
        assert.equal(verdictFromValues([9500], [10000], OFF).verdict, 'fair');
        assert.equal(verdictFromValues([8000], [10000], OFF).verdict, 'them');
        assert.equal(verdictFromValues([10000], [8000], OFF).verdict, 'you');
        assert.equal(verdictFromValues([0], [0], OFF), null);
    });
    test('the waiver adjustment credits the side with fewer pieces', () => {
        const v = verdictFromValues([9000], [5000, 5000], { on: true, perSpot: 500 });
        assert.equal(v.bonusGet, 500);
        assert.equal(v.getTotal, 9500);
        assert.equal(v.diff, -500);
        const w = verdictFromValues([5000, 5000, 1000], [9000], { on: true, perSpot: 500 });
        assert.equal(w.bonusGive, 1000);
    });
});

describe('fairSuggestions', () => {
    test('a fair trade, or one with no values, gets nothing', () => {
        assert.equal(fairSuggestions({ getValues: [9500], giveValues: [10000], candidates: [p('A', 500)], waiver: OFF }), null);
        assert.equal(fairSuggestions({ getValues: [0], giveValues: [0], candidates: [p('A', 500)], waiver: OFF }), null);
    });

    test('favors them: they add to what you get, closest to even first, at most 3', () => {
        const r = fairSuggestions({
            getValues: [5000], giveValues: [9400], waiver: OFF,
            candidates: [p('Far', 3700), p('Exact', 4400), p('Near', 4300), p('Over', 5000), p('Big', 9000), p('Tiny', 100)]
        });
        assert.equal(r.adder, 'them');
        assert.equal(r.side, 'get');
        assert.equal(r.gap, 4400);
        assert.deepEqual(names(r.singles), ['Exact', 'Near', 'Over']);
        assert.ok(r.singles.every(f => f.after.verdict === 'fair'));
        assert.deepEqual(r.pairs, []);
    });

    test('favors you: you add to what you give', () => {
        const r = fairSuggestions({ getValues: [9000], giveValues: [6000], waiver: OFF, candidates: [p('Mine', 3000)] });
        assert.equal(r.adder, 'you');
        assert.equal(r.side, 'give');
        assert.deepEqual(names(r.singles), ['Mine']);
    });

    test('the waiver adjustment is recomputed with the added piece, not just the raw gap', () => {
        // 1 for 2: you get 9,000 + 1,000 waiver credit = 10,000 vs 14,000. The raw gap is 4,000, but a second piece
        // on your side removes the credit, so it takes about 5,000 to even it.
        const waiver = { on: true, perSpot: 1000 };
        const g = gapToClose([9000], [7000, 7000], waiver);
        assert.equal(g.needed, 5000);
        const r = fairSuggestions({ getValues: [9000], giveValues: [7000, 7000], waiver, candidates: [p('Raw', 4000), p('Real', 5000)] });
        assert.equal(r.gap, 5000);
        // "Raw" matches the raw gap but leaves 13,000 vs 14,000 = 7%: fair too, just further from even.
        assert.deepEqual(names(r.singles), ['Real', 'Raw']);
        assert.equal(r.singles[0].after.diff, 0);
        assert.equal(r.singles[0].after.bonusGet, 0);
        // One that looks fair if the 1,000 credit were kept (13,600 vs 14,000) isn't once it goes (12,600: 10%).
        assert.equal(verdictFromValues([9000 + 3600 + 1000], [14000], OFF).verdict, 'fair');
        const r2 = fairSuggestions({ getValues: [9000], giveValues: [7000, 7000], waiver, candidates: [p('Short', 3600)] });
        assert.equal(r2.singles.length, 0);
    });

    test('players already in the trade are skipped; a pick only on the same side', () => {
        const r = fairSuggestions({
            getValues: [5000], giveValues: [9400], waiver: OFF,
            candidates: [p('Bijan', 4400), p('Gibbs', 4300), p('2027 1st', 4400, { isPick: true, pos: 'Pick' }), p('2028 1st', 4350, { isPick: true, pos: 'Pick' })],
            inTrade: ['bijan'], onAddingSide: ['2028 1st']
        });
        // 2027 1st is on the other side (your pick) in the real trade, not this one, so it can still be suggested.
        assert.deepEqual(names(r.singles), ['2027 1st', 'Gibbs']);
        const r2 = fairSuggestions({
            getValues: [5000], giveValues: [9400], waiver: OFF,
            candidates: [p('2027 1st', 4400, { isPick: true })], onAddingSide: [], inTrade: ['2027 1st']
        });
        assert.deepEqual(names(r2.singles), ['2027 1st']);
    });

    test('unranked players (no value) are never suggested', () => {
        const r2 = fairSuggestions({ getValues: [5000], giveValues: [9000], waiver: OFF, candidates: [p('Unranked', 0), p('Nobody', undefined)] });
        assert.deepEqual(r2.singles, []);
        assert.deepEqual(r2.pairs, []);
    });

    test('pairs only when no single player fits', () => {
        const r = fairSuggestions({
            getValues: [3000], giveValues: [15000], waiver: OFF,
            candidates: [p('A', 6500), p('B', 5600), p('C', 5000), p('D', 1000)]
        });
        assert.deepEqual(r.singles, []);
        assert.equal(r.gap, 12000);
        assert.deepEqual(names(r.pairs), ['A + B', 'A + C', 'B + C']);
        assert.ok(r.pairs.every(f => f.players.length === 2 && f.after.verdict === 'fair'));
        // Once a single fits, no pairs.
        const r2 = fairSuggestions({ getValues: [3000], giveValues: [15000], waiver: OFF, candidates: [p('A', 6500), p('B', 5600), p('Star', 12000)] });
        assert.deepEqual(names(r2.singles), ['Star']);
        assert.deepEqual(r2.pairs, []);
    });

    test('nothing fits: empty lists with the gap, for the one-line note', () => {
        const r = fairSuggestions({ getValues: [1000], giveValues: [13000], waiver: OFF, candidates: [p('A', 500), p('B', 400)] });
        assert.equal(r.gap, 12000);
        assert.deepEqual(r.singles, []);
        assert.deepEqual(r.pairs, []);
    });
});

describe('fairCandidates', () => {
    const roster = [{ cleanName: 'nico', name: 'Nico Collins', pos: 'WR' }, { cleanName: 'nobody', name: 'Nobody', pos: 'RB' }];
    const valueOf = (c) => ({ nico: 4350 }[c] || 0);
    const pickValue = (c) => ({ '2027 1st': 5000, '2027 2nd': 2000 }[c] || 0);
    const now = new Date('2026-09-15T16:00:00Z');

    test('ranked players only; picks only in dynasty and keeper leagues', () => {
        const redraft = fairCandidates({ roster, valueOf, dynasty: false, pickValue, now });
        assert.deepEqual(redraft.map(c => c.name), ['Nico Collins']);
        const dynasty = fairCandidates({ roster, valueOf, dynasty: true, pickValue, now });
        assert.deepEqual(dynasty.map(c => c.name), ['Nico Collins', '2027 1st', '2027 2nd']);
        assert.ok(dynasty.filter(c => c.isPick).every(c => c.pos === 'Pick'));
        // No market data: picks have no value, so none.
        assert.deepEqual(fairCandidates({ roster, valueOf, dynasty: true, pickValue: null, now }).map(c => c.name), ['Nico Collins']);
    });

    test('the pick years are the picker\'s: from March on, next year\'s draft first', () => {
        assert.deepEqual(nextDraftYears(new Date('2026-09-15T16:00:00Z')), [2027, 2028, 2029]);
        assert.deepEqual(nextDraftYears(new Date('2027-01-10T12:00:00Z')), [2027, 2028, 2029]);
        assert.equal(ownPickNames(now).length, 12);
        assert.equal(ownPickNames(now)[0], '2027 1st');
    });
});

test('roundGap: nearest 100, nearest 10 under 1,000', () => {
    assert.equal(roundGap(4389), 4400);
    assert.equal(roundGap(-4389), 4400);
    assert.equal(roundGap(437), 440);
    assert.equal(roundGap(2), 10);
});
