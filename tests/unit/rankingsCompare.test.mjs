// compareRankings in js/shared/rankings/compare.js (improvements S3): what changed between two
// versions of a rankings list. Lineup Strategist's "What changed" card is built from this.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compareRankings, changesByName, findPlayerChange, rankLabel, DEFAULT_MOVE_THRESHOLD } from '../../js/shared/rankings/compare.js';

// A parser-shaped row. pos is optional (Lineup Strategist's rows don't carry it).
const row = (name, rank, posRank, extra = {}) => ({ name, cleanName: 'stale-key', rank, posRank, flexRank: rank, ...extra });
const names = list => list.map(c => c.name);

describe('compareRankings', () => {
    test('the default threshold is 3 position spots', () => {
        assert.equal(DEFAULT_MOVE_THRESHOLD, 3);
        const oldList = [row('A Back', 1, 10, { pos: 'RB' }), row('B Back', 2, 20, { pos: 'RB' }), row('C Back', 3, 30, { pos: 'RB' })];
        const newList = [row('A Back', 1, 8, { pos: 'RB' }), row('B Back', 2, 17, { pos: 'RB' }), row('C Back', 3, 34, { pos: 'RB' })];
        const r = compareRankings(oldList, newList);
        assert.deepEqual(names(r.moves), ['C Back', 'B Back']); // A moved 2: below the threshold
        assert.equal(r.unchanged, 1);
        assert.deepEqual(r.counts, { moved: 2, rose: 1, fell: 1, added: 0, dropped: 0, posChanged: 0 });
        assert.equal(r.moves[0].delta, -4);
        assert.equal(r.moves[1].delta, 3);
        // A threshold of 1 counts every move.
        assert.equal(compareRankings(oldList, newList, { threshold: 1 }).counts.moved, 3);
    });

    test('risers and fallers, biggest first, with tiers', () => {
        const oldList = [
            row('Riser One', 40, 18, { pos: 'RB', posTier: 4 }),
            row('Riser Two', 50, 30, { pos: 'WR', posTier: 6 }),
            row('Faller One', 12, 6, { pos: 'RB', posTier: 2 }),
            row('Steady', 5, 3, { pos: 'WR', posTier: 1 })
        ];
        const newList = [
            row('Riser One', 20, 9, { pos: 'RB', posTier: 2 }),
            row('Riser Two', 45, 22, { pos: 'WR', posTier: 6 }),
            row('Faller One', 30, 17, { pos: 'RB', posTier: 4 }),
            row('Steady', 5, 3, { pos: 'WR', posTier: 1 })
        ];
        const r = compareRankings(oldList, newList);
        assert.deepEqual(names(r.risers), ['Riser One', 'Riser Two']);
        assert.deepEqual(names(r.fallers), ['Faller One']);
        assert.deepEqual(names(r.moves), ['Faller One', 'Riser One', 'Riser Two']);
        const one = r.risers[0];
        assert.equal(one.basis, 'pos');
        assert.equal(one.delta, 9);
        assert.equal(one.overallDelta, 20);
        assert.deepEqual([one.old.tier, one.new.tier, one.tierChanged], [4, 2, true]);
        assert.equal(r.risers[1].tierChanged, false);
        assert.equal(rankLabel(one.old), 'RB18');
        assert.equal(rankLabel(one.new), 'RB9');
    });

    test('added and dropped, in rank order', () => {
        const oldList = [row('Kept', 1, 1, { pos: 'QB' }), row('Gone Late', 30, 12, { pos: 'WR' }), row('Gone Early', 8, 3, { pos: 'WR' })];
        const newList = [row('Kept', 1, 1, { pos: 'QB' }), row('New Late', 40, 15, { pos: 'TE' }), row('New Early', 9, 2, { pos: 'TE' })];
        const r = compareRankings(oldList, newList);
        assert.deepEqual(names(r.added), ['New Early', 'New Late']);
        assert.deepEqual(names(r.dropped), ['Gone Early', 'Gone Late']);
        assert.equal(r.added[0].new.posRank, 2);
        assert.equal(r.dropped[0].old.posRank, 3);
        assert.equal(r.compared, 1);
        // Mixed positions: overall rank decides, not position rank (QB4 at #22 comes after RB7 at #20).
        const mixed = compareRankings([], [row('Late QB', 22, 4, { pos: 'QB' }), row('Early RB', 20, 7, { pos: 'RB' })]);
        assert.deepEqual(names(mixed.added), ['Early RB', 'Late QB']);
    });

    test('rename-safe: names are matched by normalizeName, not by the stored cleanName', () => {
        // Suffixes, punctuation, accents, case and the alias table all normalize the same way.
        const oldList = [
            row('Kenneth Walker III', 20, 10, { pos: 'RB' }),
            row('D.J. Moore', 30, 15, { pos: 'WR' }),
            row('Kenny Gainwell', 80, 40, { pos: 'RB' }),
            row('Amon-Ra St. Brown', 3, 2, { pos: 'WR' })
        ];
        const newList = [
            row('Kenneth Walker', 10, 5, { pos: 'RB' }),
            row('DJ Moore', 40, 20, { pos: 'WR' }),
            row('Kenneth Gainwell', 60, 30, { pos: 'RB' }),
            row('AMON-RA ST BROWN', 3, 2, { pos: 'WR' })
        ];
        const r = compareRankings(oldList, newList);
        assert.equal(r.counts.added, 0);
        assert.equal(r.counts.dropped, 0);
        assert.equal(r.compared, 4);
        assert.deepEqual(names(r.risers), ['Kenneth Gainwell', 'Kenneth Walker']); // +10, +5
        assert.deepEqual(names(r.fallers), ['DJ Moore']);
    });

    test('two players sharing a name at different positions stay apart', () => {
        const oldList = [row('Mike Williams', 50, 25, { pos: 'WR' }), row('Mike Williams', 200, 60, { pos: 'RB' })];
        const newList = [row('Mike Williams', 200, 70, { pos: 'RB' }), row('Mike Williams', 40, 20, { pos: 'WR' })];
        const r = compareRankings(oldList, newList);
        assert.equal(r.compared, 2);
        assert.equal(r.counts.posChanged, 0);
        assert.deepEqual(r.moves.map(m => [m.pos, m.delta]), [['RB', -10], ['WR', 5]]);
    });

    test('a player who changed position is reported as such, not as a move or an add/drop', () => {
        const oldList = [row('Taysom Hill', 300, 40, { pos: 'QB' }), row('Other', 10, 5, { pos: 'TE' })];
        const newList = [row('Taysom Hill', 150, 14, { pos: 'TE' }), row('Other', 10, 5, { pos: 'TE' })];
        const r = compareRankings(oldList, newList);
        assert.equal(r.counts.moved, 0);
        assert.equal(r.counts.added, 0);
        assert.equal(r.counts.dropped, 0);
        assert.equal(r.counts.posChanged, 1);
        const c = r.posChanged[0];
        assert.deepEqual([c.old.pos, c.new.pos, c.pos], ['QB', 'TE', 'TE']);
        assert.equal(rankLabel(c.old), 'QB40');
        assert.equal(rankLabel(c.new), 'TE14');
    });

    test('positions from posOf, and a position known on one side only is the same player', () => {
        const positions = { alpha: 'RB', beta: 'WR' };
        const posOf = (entry, clean) => positions[clean] || null;
        const oldList = [row('Alpha', 30, 15), row('Beta', 10, 5), row('Gamma', 50, 25)];
        const newList = [row('Alpha', 10, 5), row('Beta', 20, 10), row('Gamma', 40, 20, { pos: 'te' })];
        const r = compareRankings(oldList, newList, { posOf });
        assert.equal(r.counts.posChanged, 0);
        assert.deepEqual(r.moves.map(m => [m.name, m.pos, m.delta]), [
            ['Alpha', 'RB', 10],
            ['Beta', 'WR', -5],
            ['Gamma', 'TE', 5]
        ]);
    });

    test('ties: equal moves order by the better new rank, then the file order', () => {
        const oldList = [
            row('Tie Later', 60, 30, { pos: 'WR' }),
            row('Tie Better', 50, 25, { pos: 'RB' }),
            row('Same Rank B', 70, 35, { pos: 'TE' }),
            row('Same Rank A', 70, 35, { pos: 'TE' })
        ];
        const newList = [
            row('Same Rank A', 60, 30, { pos: 'TE' }), // tied rank with B in both files
            row('Tie Better', 40, 20, { pos: 'RB' }),
            row('Same Rank B', 60, 30, { pos: 'TE' }),
            row('Tie Later', 50, 25, { pos: 'WR' })
        ];
        const r = compareRankings(oldList, newList);
        // All four rose 5 spots.
        assert.deepEqual(r.risers.map(m => m.delta), [5, 5, 5, 5]);
        assert.deepEqual(names(r.risers), ['Tie Better', 'Tie Later', 'Same Rank A', 'Same Rank B']);
        // Same answer whichever way round the old file was written.
        assert.deepEqual(names(compareRankings([...oldList].reverse(), newList).risers), names(r.risers));
    });

    test('no position rank: falls back to overall rank', () => {
        const oldList = [row('Overall Only', 40, 999), row('No Ranks', 999, 999)];
        const newList = [row('Overall Only', 30, 999), row('No Ranks', 999, 999)];
        const r = compareRankings(oldList, newList);
        assert.equal(r.moves.length, 1);
        assert.deepEqual([r.moves[0].basis, r.moves[0].delta], ['overall', 10]);
        assert.equal(rankLabel(r.moves[0].old, r.moves[0].basis), '#40');
        assert.equal(r.unchanged, 1);
    });

    test('duplicates in one file: the first row wins; empty and missing lists', () => {
        const r = compareRankings(
            [row('Dup', 10, 5, { pos: 'RB' }), row('Dup', 90, 45, { pos: 'RB' })],
            [row('Dup', 30, 15, { pos: 'RB' })]
        );
        assert.equal(r.compared, 1);
        assert.equal(r.moves[0].delta, -10);
        assert.equal(r.counts.dropped, 0);

        const fresh = compareRankings([], [row('Only New', 1, 1, { pos: 'QB' })]);
        assert.deepEqual(fresh.counts, { moved: 0, rose: 0, fell: 0, added: 1, dropped: 0, posChanged: 0 });
        const none = compareRankings(null, undefined);
        assert.equal(none.compared, 0);
        assert.equal(none.moves.length, 0);
        // A nameless row is skipped.
        assert.equal(compareRankings([{ rank: 1 }], [{ name: '', rank: 1 }]).compared, 0);
    });

    test('identical lists: nothing to report', () => {
        const list = [row('A', 1, 1, { pos: 'QB' }), row('B', 2, 1, { pos: 'RB' })];
        const r = compareRankings(list, list.map(p => ({ ...p })));
        assert.equal(r.compared, 2);
        assert.equal(r.unchanged, 2);
        assert.deepEqual(r.counts, { moved: 0, rose: 0, fell: 0, added: 0, dropped: 0, posChanged: 0 });
    });
});

describe('looking up a roster player', () => {
    const r = compareRankings(
        [row('Derrick Henry', 12, 6, { pos: 'RB' }), row('Mike Williams', 50, 25, { pos: 'WR' }), row('Cut Guy', 90, 40, { pos: 'RB' })],
        [row('Derrick Henry', 30, 11, { pos: 'RB' }), row('Mike Williams', 30, 15, { pos: 'WR' }), row('New Guy', 20, 9, { pos: 'WR' })]
    );
    const byName = changesByName(r);

    test('finds a move, an add and a drop by display name', () => {
        assert.equal(findPlayerChange(byName, 'Derrick Henry', 'RB').delta, -5);
        assert.equal(findPlayerChange(byName, 'Cut Guy', 'RB').type, 'dropped');
        assert.equal(findPlayerChange(byName, 'New Guy', 'WR').type, 'added');
        assert.equal(findPlayerChange(byName, 'Unlisted', 'QB'), null);
    });

    test('a roster position that disagrees with the change does not match', () => {
        assert.equal(findPlayerChange(byName, 'Mike Williams', 'WR').delta, 10);
        assert.equal(findPlayerChange(byName, 'Mike Williams', 'RB'), null);
        // No roster position: any change for the name.
        assert.equal(findPlayerChange(byName, 'Mike Williams', null).delta, 10);
    });
});
