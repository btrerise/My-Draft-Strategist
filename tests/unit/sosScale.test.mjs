// js/mls/sosScale.js (improvements S7, round 5): flipping SoS from 1 = hardest to the app's
// 1 = easiest, and spotting 1-5 ratings uploaded as if they were 1-32 ranks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOS_SCALE_TEXT, RATINGS_MIN_VALUES, looksLikeRatings, reverseSosValue, sosValues } from '../../js/mls/sosScale.js';

test('the scale text', () => {
    assert.equal(SOS_SCALE_TEXT, '1 = easiest, 32 = hardest');
});

test('reverseSosValue flips ranks from 1 to 32 and leaves anything else alone', () => {
    assert.equal(reverseSosValue('1'), '32');
    assert.equal(reverseSosValue('32'), '1');
    assert.equal(reverseSosValue('16'), '17');
    assert.equal(reverseSosValue('4.5'), '28.5');
    assert.equal(reverseSosValue(7), '26');
    for (const v of ['', '-2', '0', '40', 'easy', null, undefined]) assert.equal(reverseSosValue(v), v);
    // Twice is the identity.
    for (let n = 1; n <= 32; n++) assert.equal(reverseSosValue(reverseSosValue(String(n))), String(n));
});

test('looksLikeRatings: at least 8 numbers, none above 5', () => {
    const eight = ['1', '2', '3', '4', '5', '3', '2', '1'];
    assert.equal(RATINGS_MIN_VALUES, 8);
    assert.equal(looksLikeRatings(eight), true);
    assert.equal(looksLikeRatings(eight.slice(0, 7)), false);          // too few to tell
    assert.equal(looksLikeRatings([...eight, '6']), false);             // a 6 means it isn't 1-5
    assert.equal(looksLikeRatings([...eight, '', 'x', '-1']), true);    // blanks and junk don't count
    assert.equal(looksLikeRatings([]), false);
    assert.equal(looksLikeRatings(undefined), false);
});

test('sosValues lists every non-empty value in a team/position map', () => {
    assert.deepEqual(sosValues({ BUF: { QB: '2', RB: '' }, KC: { TE: '4.5' }, MIA: {} }), ['2', '4.5']);
    assert.deepEqual(sosValues(null), []);
});
