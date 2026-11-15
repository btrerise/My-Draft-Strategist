// js/mls/lineup/earlyRule.js: which teams play early, from the week's kickoffs (improvements S50). The page side (the
// card, the switch, the week clearing) is in tests/mls-early-games.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earlyTeamsFromKickoffs, easternParts } from '../../js/mls/lineup/earlyRule.js';
import { KEYS, isMlsOwnedKey } from '../../js/shared/storage/keys.js';

// A November week (Eastern standard time, UTC-5): Thursday night, a Saturday game, a 9:30 AM game in Europe, then the
// Sunday slate, Sunday night and Monday night.
const NOV_WEEK = {
    NYJ: '2026-11-20T01:15:00Z', NE: '2026-11-20T01:15:00Z',   // Thu 8:15 PM ET
    PIT: '2026-11-21T21:30:00Z', BAL: '2026-11-21T21:30:00Z',  // Sat 4:30 PM ET
    MIA: '2026-11-22T14:30:00Z', WAS: '2026-11-22T14:30:00Z',  // Sun 9:30 AM ET (Madrid)
    BUF: '2026-11-22T18:00:00Z', KC: '2026-11-22T18:00:00Z',   // Sun 1:00 PM ET: not early
    DAL: '2026-11-22T18:00:00Z', PHI: '2026-11-22T18:00:00Z',
    SF: '2026-11-22T21:25:00Z', SEA: '2026-11-22T21:25:00Z',   // Sun 4:25 PM ET
    GB: '2026-11-23T01:20:00Z', CHI: '2026-11-23T01:20:00Z',   // Sun 8:20 PM ET
    DET: '2026-11-24T01:15:00Z', MIN: '2026-11-24T01:15:00Z',  // Mon 8:15 PM ET
};

test('a week with a Thursday, a Saturday and an international morning game fills exactly those teams, in kickoff order', () => {
    assert.deepEqual(earlyTeamsFromKickoffs(NOV_WEEK), ['NE', 'NYJ', 'BAL', 'PIT', 'MIA', 'WAS']);
});

test('the rule is in Eastern time: daylight saving weeks too, and 12:59 vs 1:00 PM', () => {
    // September, Eastern daylight time (UTC-4): Thursday 8:20 PM, a 9:30 AM Dublin game, 12:59 PM and 1:00 PM.
    const sept = {
        KC: '2026-09-11T00:20:00Z', BAL: '2026-09-11T00:20:00Z',
        PIT: '2026-09-13T13:30:00Z', MIN: '2026-09-13T13:30:00Z',
        LV: '2026-09-13T16:59:00Z', DEN: '2026-09-13T16:59:00Z',
        NYG: '2026-09-13T17:00:00Z', TEN: '2026-09-13T17:00:00Z', ARI: '2026-09-13T17:00:00Z', NO: '2026-09-13T17:00:00Z',
    };
    assert.deepEqual(earlyTeamsFromKickoffs(sept), ['BAL', 'KC', 'MIN', 'PIT', 'DEN', 'LV']);
    assert.deepEqual(easternParts('2026-09-13T17:00:00Z'), { date: '2026-09-13', weekday: 'Sun', minutes: 13 * 60 });
});

test('a Christmas Wednesday game counts; a game after the main Sunday never does', () => {
    const xmas = {
        DAL: '2026-12-25T18:00:00Z', WAS: '2026-12-25T18:00:00Z',  // Fri 1:00 PM ET
        BUF: '2026-12-24T01:15:00Z', NE: '2026-12-24T01:15:00Z',   // Wed 8:15 PM ET
        KC: '2026-12-27T18:00:00Z', DEN: '2026-12-27T18:00:00Z', LAC: '2026-12-27T18:00:00Z', LV: '2026-12-27T18:00:00Z',
        SF: '2026-12-29T01:15:00Z', LAR: '2026-12-29T01:15:00Z',  // Mon
    };
    assert.deepEqual(earlyTeamsFromKickoffs(xmas), ['BUF', 'NE', 'DAL', 'WAS']);
});

test('nothing or nonsense in, nothing out; a week with no Sunday games falls back to Wednesday to Saturday', () => {
    assert.deepEqual(earlyTeamsFromKickoffs({}), []);
    assert.deepEqual(earlyTeamsFromKickoffs(null), []);
    assert.deepEqual(earlyTeamsFromKickoffs({ BUF: 'not a date', KC: '' }), []);
    assert.deepEqual(earlyTeamsFromKickoffs({ BUF: '2026-11-20T01:15:00Z', KC: '2026-11-24T01:15:00Z' }), ['BUF']);
});

test('the new keys belong to Lineup Strategist, so Backup, Restore and Factory Reset pick them up', () => {
    for (const key of [KEYS.mls.earlyWeek, KEYS.mls.earlyFromSchedule, KEYS.mls.earlyTeams]) assert.equal(isMlsOwnedKey(key), true, key);
});
