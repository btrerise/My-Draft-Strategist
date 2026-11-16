// js/mls/lineup/earlyRule.js: which teams play early, from the week's kickoffs (improvements S50). The page side (the
// card, the switch, the week clearing) is in tests/mls-early-games.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earlySwaps, earlyTeamsFromKickoffs, easternParts } from '../../js/mls/lineup/earlyRule.js';
import { SLOT_POSITIONS } from '../../js/mls/constants.js';
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

// The Early Game Reminder's swaps (round 3). Kickoffs as hours; early = before 13 (the Sunday 1:00 PM games).
const P = (name, pos, kick) => ({ name, pos, kick });
const swapsOf = (starters, startedNames = []) => earlySwaps(starters, {
    slotPositions: SLOT_POSITIONS,
    isEarly: (p) => p.kick < 13,
    kickoffMs: (p) => p.kick,
    started: (p) => startedNames.includes(p.name),
}).map(w => `${w.early.name} ${w.earlySlot} <-> ${w.later.name} ${w.laterSlot}`);

test('an early player in FLEX is swapped with the latest player at his position who can take FLEX', () => {
    const lineup = [
        { slot: 'WR1', player: P('Chase', 'WR', 13) }, { slot: 'WR2', player: P('Nacua', 'WR', 16) },
        { slot: 'TE1', player: P('Bowers', 'TE', 20) }, { slot: 'FLEX1', player: P('Jefferson', 'WR', 9) },
    ];
    assert.deepEqual(swapsOf(lineup), ['Jefferson FLEX <-> Nacua WR']);
    // Sleeper's lineup names slots by type, without a number.
    assert.deepEqual(swapsOf(lineup.map(s => ({ ...s, slot: s.slot.replace(/\d$/, '') }))), ['Jefferson FLEX <-> Nacua WR']);
});

test('no swap when nobody later can trade places, when he is in his own slot, or once either game has started', () => {
    assert.deepEqual(swapsOf([{ slot: 'WR', player: P('Chase', 'WR', 9) }, { slot: 'FLEX', player: P('Jefferson', 'WR', 9) }]), []);
    assert.deepEqual(swapsOf([{ slot: 'WR', player: P('Jefferson', 'WR', 9) }, { slot: 'FLEX', player: P('Chase', 'WR', 13) }]), []);
    assert.deepEqual(swapsOf([{ slot: 'RB', player: P('Henry', 'RB', 16) }, { slot: 'FLEX', player: P('Jefferson', 'WR', 9) }]), []);
    const lineup = [{ slot: 'WR', player: P('Chase', 'WR', 13) }, { slot: 'FLEX', player: P('Jefferson', 'WR', 9) }];
    assert.deepEqual(swapsOf(lineup, ['Jefferson']), []);
    assert.deepEqual(swapsOf(lineup, ['Chase']), []);
    // A W/T slot can't take a RB, so an early RB there has nobody (and a RB slot's player can't go to W/T).
    assert.deepEqual(swapsOf([{ slot: 'RB', player: P('Henry', 'RB', 16) }, { slot: 'WRTE', player: P('Kelce', 'TE', 9) }]), []);
});

test('two flex slots each get their own partner; SFLEX works for a QB', () => {
    const lineup = [
        { slot: 'QB', player: P('Mahomes', 'QB', 16) }, { slot: 'WR', player: P('Chase', 'WR', 13) },
        { slot: 'WR', player: P('Lamb', 'WR', 16) }, { slot: 'FLEX', player: P('Jefferson', 'WR', 9) },
        { slot: 'WRRB', player: P('Nacua', 'WR', 9) }, { slot: 'SFLEX', player: P('Allen', 'QB', 0) },
    ];
    assert.deepEqual(swapsOf(lineup), ['Jefferson FLEX <-> Lamb WR', 'Nacua WRRB <-> Chase WR', 'Allen SFLEX <-> Mahomes QB']);
});
