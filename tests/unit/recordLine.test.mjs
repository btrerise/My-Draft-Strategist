// The record's words, shared by the Roster tab's line and the Dashboard card (improvements S51).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordLineText, recordParts, leagueDirection } from '../../js/mls/week/scoreboard.js';

const base = { wins: 7, losses: 3, ties: 0, standing: 2, of: 12, division: null, divisionRank: null, seed: null, playoffTeams: null };

test('record and place without divisions', () => {
    assert.equal(recordLineText(base), '7–3 · 2nd of 12');
    assert.equal(recordLineText({ ...base, ties: 1 }), '7–3–1 · 2nd of 12');
});
test('a record stored before the standing existed shows W-L alone', () => {
    assert.equal(recordLineText({ ...base, standing: undefined }), '7–3');
});
test('divisions: the seed stands in for the place, and below the line it says out of playoffs', () => {
    const d = { ...base, division: 'North', divisionRank: 1, seed: 2, playoffTeams: 6 };
    assert.equal(recordLineText(d), '7–3 · 2nd seed of 6');
    assert.equal(recordLineText({ ...d, seed: 8 }), '7–3 · Out of playoffs (8th)');
    assert.equal(recordParts({ ...d, seed: 8 }).out, true);
    assert.equal(recordParts(d).out, false);
});
test('no record: nothing', () => {
    assert.equal(recordLineText(null), null);
    assert.equal(recordLineText(undefined), null);
});
test('direction: dynasty by the switch, redraft none', () => {
    assert.equal(leagueDirection('dynasty', true), 'competing');
    assert.equal(leagueDirection('dynasty', false), 'rebuilding');
    assert.equal(leagueDirection('redraft', true), null);
});
