// The starter alert's pure rules (js/mls/lineup/starterAlertRules.js, improvements N2): kickoff windows, when to check,
// the Sleeper lineup it reads, who it names and once a week, and the words. tests/mls-starter-alert.spec.mjs covers the
// page: the toggle, the timer, the refresh, the notification and its fallbacks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { lineupIssues } from '../../js/mls/lineup/issues.js';
import { DEFAULT_SETTINGS, LEAD_CHOICES, alertMessage, appSlotType, dueWindow, kickoffWindows, leagueFindings, nextCheck,
    noGameStarters, normalizeSettings, sleeperLineup, staleLeagues } from '../../js/mls/lineup/starterAlertRules.js';

const OUT = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR']; // SIM_EXCLUDE_STATUSES
const MIN = 60 * 1000;
const SUN_1PM = Date.parse('2026-09-20T17:00:00Z');
const GAMES = {
    BUF: '2026-09-18T00:15:00Z', BAL: '2026-09-18T00:15:00Z', // Thursday night
    CIN: '2026-09-20T17:00:00Z', DAL: '2026-09-20T17:00:00Z', // Sunday 1:00
    LV: '2026-09-20T20:05:00Z', ATL: '2026-09-20T20:05:00Z', KC: '2026-09-20T20:25:00Z', DEN: '2026-09-20T20:25:00Z', // 4:05, 4:25
    MIN: '2026-09-21T00:20:00Z', CHI: '2026-09-21T00:20:00Z', // Sunday night
};
const plain = (t) => t.replace(/ /g, ' ');

describe('settings', () => {
    test('off by default, 60 minutes, stale rankings on', () => {
        assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
        assert.deepEqual(DEFAULT_SETTINGS, { on: false, leadMinutes: 60, staleRankings: true });
    });
    test('15 to 120 minutes in steps of 15; anything else is 60', () => {
        assert.deepEqual(LEAD_CHOICES, [15, 30, 45, 60, 75, 90, 105, 120]);
        assert.equal(normalizeSettings({ leadMinutes: '45' }).leadMinutes, 45);
        assert.equal(normalizeSettings({ leadMinutes: 50 }).leadMinutes, 60);
        assert.equal(normalizeSettings({ on: 'yes' }).on, false);
        assert.equal(normalizeSettings({ staleRankings: false }).staleRankings, false);
    });
});

describe('kickoff windows', () => {
    const windows = kickoffWindows(GAMES);
    test('one per kickoff, 4:05 and 4:25 sharing one', () => {
        assert.equal(windows.length, 4);
        assert.deepEqual([...windows[2].teams].sort(), ['ATL', 'DEN', 'KC', 'LV']);
        assert.equal(windows[1].startMs, SUN_1PM);
    });
    test('due from lead minutes before kickoff until kickoff, not outside it', () => {
        assert.equal(dueWindow(windows, SUN_1PM - 61 * MIN, 60 * MIN), null);
        assert.equal(dueWindow(windows, SUN_1PM - 60 * MIN, 60 * MIN).startMs, SUN_1PM);
        assert.equal(dueWindow(windows, SUN_1PM - MIN, 60 * MIN).startMs, SUN_1PM);
        assert.equal(dueWindow(windows, SUN_1PM, 60 * MIN), null);
        assert.equal(dueWindow(windows, SUN_1PM - 20 * MIN, 15 * MIN), null);
    });
    test('the next check is the next window whose check time is still to come', () => {
        const n = nextCheck(windows, SUN_1PM - 3 * 60 * MIN, 60 * MIN);
        assert.equal(n.atMs, SUN_1PM - 60 * MIN);
        assert.equal(nextCheck(windows, SUN_1PM - 30 * MIN, 60 * MIN).window.startMs, Date.parse('2026-09-20T20:05:00Z'));
        assert.equal(nextCheck(windows, Date.parse('2026-09-21T01:00:00Z'), 60 * MIN), null);
        assert.deepEqual(kickoffWindows({}), []);
    });
});

describe('the Sleeper lineup', () => {
    const roster = [
        { id: '1', name: 'Joe Burrow', pos: 'QB', team: 'CIN' },
        { id: '2', name: 'Derrick Henry', pos: 'RB', team: 'BAL', inj: 'OUT' },
        { id: '3', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL' },
        { id: '4', name: 'Bench Back', pos: 'RB', team: 'CIN' },
    ];
    const league = { leagueId: 'L1', name: 'Fixture League', roster, starterSlots: ['QB', 'RB', 'SUPER_FLEX', 'TE'], sleeperStarters: ['1', '2', '3', '0'] };
    test('slots from starterSlots, players from the roster, an empty slot as null, the rest as the bench', () => {
        const { starters, bench } = sleeperLineup(league);
        assert.deepEqual(starters.map(s => [s.slot, s.player && s.player.name]),
            [['QB', 'Joe Burrow'], ['RB', 'Derrick Henry'], ['SFLEX', 'CeeDee Lamb'], ['TE', null]]);
        assert.deepEqual(bench.map(p => p.id), ['4']);
        assert.equal(appSlotType('REC_FLEX'), 'WRTE');
    });
    test('none for a league without Sleeper slots (manual, or synced before they were saved)', () => {
        assert.equal(sleeperLineup({ ...league, starterSlots: null }), null);
        assert.equal(sleeperLineup({ leagueId: 'manual_1', roster }), null);
    });
});

describe('who it names', () => {
    const henry = { id: '2', name: 'Derrick Henry', pos: 'RB', team: 'BAL', inj: 'OUT' };
    const chase = { id: '5', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', inj: 'D' };
    const higgins = { id: '6', name: 'Tee Higgins', pos: 'WR', team: 'CIN', inj: 'Q' };
    const lamb = { id: '3', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', bye: true };
    const cut = { id: '7', name: 'Cut Guy', pos: 'WR', team: null };
    const sub = { id: '8', name: 'Bench Wideout', pos: 'WR', team: 'DAL', posRank: 40, flexRank: 90 };
    const league = { leagueId: 'L1', name: 'Fixture League' };
    const starters = [{ slot: 'RB', player: henry }, { slot: 'WR', player: chase }, { slot: 'WR', player: higgins },
        { slot: 'FLEX', player: lamb }, { slot: 'FLEX', player: cut }, { slot: 'TE', player: null }];
    const ctx = { bestBall: false, outStatuses: OUT, kickedOff: () => false, onBye: p => !!p.bye, kickoffMs: () => NaN,
        kept: p => p.id === 'locked', irRules: null, rosterSize: null, roster: [] };
    const issues = lineupIssues(starters, ctx, [sub]);
    const windows = kickoffWindows(GAMES);
    const noGame = noGameStarters(starters, { gameTimesByTeam: GAMES, onBye: p => !!p.bye, kickedOff: () => false });

    test('at 1:00: the Doubtful 1:00 starter, the bye, no game and the empty slot; not Questionable, not Thursday\'s Out', () => {
        const f = leagueFindings(league, issues, { window: windows[1], noGame });
        assert.deepEqual(f.map(x => plain(x.text)), [
            "Ja'Marr Chase is Doubtful: start Bench Wideout instead?",
            'CeeDee Lamb is on bye: no healthy RB, WR or TE on your bench',
            'TE slot is empty',
            'Cut Guy has no game this week',
        ]);
        assert.deepEqual(f.map(x => x.key), ['L1:5', 'L1:3', 'L1:empty:TE:1', 'L1:7']);
    });
    test('Thursday: Henry in his own window', () => {
        const f = leagueFindings(league, issues, { window: windows[0], noGame });
        assert.equal(plain(f[0].text), 'Derrick Henry is Out: no healthy RB on your bench');
    });
    test('once a week: what was named is left out', () => {
        const sent = new Set(['L1:5', 'L1:3', 'L1:empty:TE:1', 'L1:7']);
        assert.deepEqual(leagueFindings(league, issues, { window: windows[1], noGame, sent }), []);
    });
    test('no schedule yet: nobody is "no game"', () => {
        assert.deepEqual(noGameStarters(starters, { gameTimesByTeam: {}, onBye: () => false, kickedOff: () => false }), []);
    });
});

describe('the words', () => {
    test('a count in the title, one line per problem, the stale line last', () => {
        const m = alertMessage([{ name: 'A', findings: [{ text: 'X is Out' }, { text: 'TE slot is empty' }] }, { name: 'B', findings: [] }],
            [{ name: 'B' }, { name: 'C' }], 'Sun 1:00 PM');
        assert.equal(m.title, '2 lineup problems before Sun 1:00 PM');
        assert.equal(m.body, 'A: X is Out\nA: TE slot is empty\nWeekly rankings over 6 days old: B and C');
    });
    test('only stale rankings', () => {
        assert.equal(alertMessage([], [{ name: 'B' }], 'Sun 1:00 PM').title, 'Old Weekly rankings before Sun 1:00 PM');
    });
    test('nothing to say: no alert', () => {
        assert.equal(alertMessage([{ name: 'A', findings: [] }], [], 'Sun 1:00 PM'), null);
    });
    test('stale leagues: Weekly set older than the rule, once a week, none without a set', () => {
        const entries = [{ league: { leagueId: 'A', name: 'A' }, updatedAt: 1 }, { league: { leagueId: 'B', name: 'B' }, updatedAt: 2 },
            { league: { leagueId: 'C', name: 'C' }, updatedAt: null }];
        const isStale = (at) => at === 1;
        assert.deepEqual(staleLeagues(entries, isStale).map(s => s.name), ['A']);
        assert.deepEqual(staleLeagues(entries, isStale, new Set(['A:stale'])), []);
    });
});
