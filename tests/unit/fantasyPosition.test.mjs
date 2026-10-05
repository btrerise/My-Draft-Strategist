// fantasyPosition (js/mls/constants.js, refactor 9C): the position Lineup Strategist gives a Sleeper
// player. Sleeper's `position` is the listed NFL position; `fantasy_positions` is every position
// Sleeper scores him at. Before 9C the app read `position` alone, so Travis Hunter (DB, scored at DB
// and WR) was a "DB" and never started, and fullbacks scored at RB were "FB".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_POSITIONS, fantasyPosition } from '../../js/mls/constants.js';

test('a listed fantasy position is kept', () => {
    assert.equal(fantasyPosition({ position: 'QB', fantasy_positions: ['QB'] }), 'QB');
    // Listed first even when Sleeper scores him elsewhere too (a TE who also plays QB).
    assert.equal(fantasyPosition({ position: 'TE', fantasy_positions: ['QB', 'TE'] }), 'TE');
    assert.equal(fantasyPosition({ position: 'DEF', fantasy_positions: ['DEF'] }), 'DEF');
    assert.equal(fantasyPosition({ position: 'K' }), 'K');
});

test('a two-way player or fullback gets the fantasy position he is scored at', () => {
    // Sleeper's live entries, 2026-10-05.
    assert.equal(fantasyPosition({ position: 'DB', fantasy_positions: ['DB', 'WR'] }), 'WR'); // Travis Hunter
    assert.equal(fantasyPosition({ position: 'FB', fantasy_positions: ['RB'] }), 'RB'); // Kyle Juszczyk
});

test('no fantasy position anywhere: the listed position, unchanged', () => {
    assert.equal(fantasyPosition({ position: 'G', fantasy_positions: ['OL'] }), 'G');
    assert.equal(fantasyPosition({ position: 'LB' }), 'LB');
    assert.equal(fantasyPosition({ position: null, fantasy_positions: null }), null);
    assert.equal(fantasyPosition({}), null);
    assert.equal(fantasyPosition(null), null);
    assert.equal(fantasyPosition(undefined), null);
});

test('the fantasy positions', () => {
    assert.deepEqual(FANTASY_POSITIONS, ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
});
