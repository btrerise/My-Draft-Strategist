// The Trade Analyzer's entry list (improvements S38): a side is a list of entries, not a set of names. A draft pick
// can repeat ("2027 1st", "2027 1st (2)"); a player can't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntries, numberPicks, pickBase, pickNumber, removeEntries, removeEntryAt } from '../../js/mls/trade/entries.js';
import { pickCount, pickKey } from '../../js/mls/leagues/picks.js';

test('a repeated pick is kept, and numbered', () => {
    assert.deepEqual(addEntries([], ['2027 1st', '2027 1st']), ['2027 1st', '2027 1st (2)']);
    assert.deepEqual(addEntries(['2027 1st', '2027 1st (2)'], ['2027 1st']), ['2027 1st', '2027 1st (2)', '2027 1st (3)']);
    // Another round or year is its own pick.
    assert.deepEqual(addEntries(['2027 1st'], ['2027 2nd', '2028 1st']), ['2027 1st', '2027 2nd', '2028 1st']);
    // Case and a typed number don't make a different pick.
    assert.deepEqual(addEntries(['2027 1st'], ['2027 1ST (7)']), ['2027 1st', '2027 1ST (2)']);
    // Early / Mid / Late stay part of the label.
    assert.deepEqual(addEntries(['2027 1st (Early)'], ['2027 1st (Early)', '2027 1st']), ['2027 1st (Early)', '2027 1st (Early) (2)', '2027 1st']);
});

test('a repeated player is dropped, whatever the case', () => {
    assert.deepEqual(addEntries(['Bijan Robinson'], ['bijan robinson', 'Jahmyr Gibbs', ' Jahmyr Gibbs ', '']), ['Bijan Robinson', 'Jahmyr Gibbs']);
});

test('removing one of two leaves the other, as a plain pick', () => {
    const two = ['Bijan Robinson', '2027 1st', '2027 1st (2)'];
    assert.deepEqual(removeEntryAt(two, 2), ['Bijan Robinson', '2027 1st']);
    assert.deepEqual(removeEntryAt(two, 1), ['Bijan Robinson', '2027 1st']);
    assert.deepEqual(removeEntries(two, ['2027 1st']), ['Bijan Robinson', '2027 1st']);
    assert.deepEqual(removeEntries(two, ['2027 1st (2)']), ['Bijan Robinson', '2027 1st']);
    assert.deepEqual(removeEntries(two, ['2027 1st', '2027 1st (2)']), ['Bijan Robinson']);
    assert.deepEqual(removeEntries(two, ['bijan robinson', 'Nobody']), ['2027 1st', '2027 1st (2)']);
});

test('a saved trade goes back as it was (Undo)', () => {
    const before = ['2027 1st', 'Bijan Robinson', '2027 1st (2)', '2028 2nd'];
    assert.deepEqual(addEntries([], before), before);
    assert.deepEqual(numberPicks(['2027 1st (2)', '2027 1st (2)']), ['2027 1st', '2027 1st (2)']);
});

test('the number is not part of the pick: same key, same value, counted per entry', () => {
    assert.equal(pickBase('2027 1st (2)'), '2027 1st');
    assert.equal(pickBase('2027 1st (Early)'), '2027 1st (Early)');
    assert.equal(pickNumber('2027 1st'), 1);
    assert.equal(pickNumber('2027 1st (3)'), 3);
    assert.equal(pickKey('2027 1st (2)'), pickKey('2027 1st'));
    assert.equal(pickKey('2027 1st (Early) (2)'), 'pick 2027 1st early');
    const picks = { You: [{ name: '2027 1st' }, { name: '2027 1st' }, { name: '2027 2nd' }], Rival: [] };
    assert.equal(pickCount(picks, 'You', '2027 1st (2)'), 2);
    assert.equal(pickCount(picks, 'Rival', '2027 1st'), 0);
    assert.equal(pickCount(null, 'You', '2027 1st'), 0);
});
