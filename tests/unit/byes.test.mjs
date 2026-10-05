// getByeWeek in js/shared/data/byes.js (refactor chunk 7C): the shared bye table by season that
// scripts/update-byes.mjs writes from nflverse's schedule.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BYE_WEEKS, getByeWeek } from '../../js/shared/data/byes.js';

test('known 2026 byes, by number or Sleeper-style string season', () => {
    assert.equal(getByeWeek('CAR', 2026), 5);
    assert.equal(getByeWeek('KC', 2026), 5);
    assert.equal(getByeWeek('DET', 2026), 6);
    assert.equal(getByeWeek('ARI', 2026), 14);
    assert.equal(getByeWeek('WAS', '2026'), 7);
});

test('the Rams are LAR (nflverse writes LA)', () => {
    assert.equal(getByeWeek('LAR', 2026), 11);
    assert.equal(getByeWeek('LA', 2026), null);
});

test('2026 has every team exactly once, in weeks 5-14 as published', () => {
    const teams = Object.keys(BYE_WEEKS[2026]);
    assert.equal(teams.length, 32);
    const byWeek = {};
    for (const t of teams) (byWeek[BYE_WEEKS[2026][t]] ||= []).push(t);
    assert.deepEqual(byWeek[5], ['CAR', 'KC']);
    assert.ok(teams.every(t => BYE_WEEKS[2026][t] >= 5 && BYE_WEEKS[2026][t] <= 14));
});

test('unknown team, FA, or missing team gives null', () => {
    assert.equal(getByeWeek('XYZ', 2026), null);
    assert.equal(getByeWeek('FA', 2026), null);
    assert.equal(getByeWeek('', 2026), null);
    assert.equal(getByeWeek(undefined, 2026), null);
    assert.equal(getByeWeek('toString', 2026), null);
});

test('unknown or missing season gives null, never another season\'s week', () => {
    assert.equal(getByeWeek('CAR', 2027), null);
    assert.equal(getByeWeek('CAR', 2024), null);
    assert.equal(getByeWeek('CAR', null), null);
    assert.equal(getByeWeek('CAR', undefined), null);
    assert.equal(getByeWeek('CAR', 'constructor'), null);
});
