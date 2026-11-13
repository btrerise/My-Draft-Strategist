// The Dashboard's "Last synced" line (js/mls/leagues/lastSynced.js, improvements S46): which leagues count, the words
// for today / yesterday / this week / older, the amber rule (kickoff within 3 hours and no sync since 6 AM, else over a
// day) and the failed leagues. tests/mls-last-synced.spec.mjs covers the page.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Calendar days and clock times are this device's, so the tests pin a zone (as freshness.test.mjs does): Chicago, UTC-5
// in September. Set before the first Date call, which reads TZ.
process.env.TZ = 'America/Chicago';

const { lastSyncedSummary, syncTimeText, staleReason, failedText, isSleeperLeague } = await import('../../js/mls/leagues/lastSynced.js');

// The Playwright clock (tests/helpers.mjs): Tue Sep 15 2026, 11:00 AM in Chicago.
const NOW = Date.parse('2026-09-15T16:00:00Z');
const at = (local) => new Date(local).getTime(); // a local (Chicago) date and time
const plain = (t) => t.replace(/[  ]/g, ' '); // ICU puts a narrow no-break space before AM/PM
const league = (id, name, extra = {}) => ({ leagueId: id, name, ...extra });

describe('the time', () => {
    test('today: just the time', () => {
        assert.equal(plain(syncTimeText(at('2026-09-15T09:42'), NOW)), '9:42 AM');
    });
    test('yesterday, by the calendar', () => {
        assert.equal(plain(syncTimeText(at('2026-09-14T20:15'), NOW)), 'yesterday 8:15 PM');
        assert.equal(plain(syncTimeText(at('2026-09-14T23:59'), NOW)), 'yesterday 11:59 PM');
    });
    test('within 6 days: the weekday', () => {
        assert.equal(plain(syncTimeText(at('2026-09-13T20:15'), NOW)), 'Sun 8:15 PM');
        assert.equal(plain(syncTimeText(at('2026-09-09T20:15'), NOW)), 'Wed 8:15 PM');
    });
    test('last week and before: the date, with the year when it isn\'t this year', () => {
        assert.equal(syncTimeText(at('2026-09-08T20:15'), NOW), 'Sep 8');
        assert.equal(syncTimeText(at('2025-11-09T20:15'), NOW), 'Nov 9, 2025');
    });
    test('a time in the future (another device\'s clock) reads as today', () => {
        assert.equal(plain(syncTimeText(at('2026-09-16T08:00'), NOW)), '8:00 AM');
    });
});

describe('which leagues count', () => {
    test('manual and hand-off leagues don\'t', () => {
        assert.equal(isSleeperLeague(league('1000', 'A')), true);
        assert.equal(isSleeperLeague(league('manual_1', 'M')), false);
        assert.equal(isSleeperLeague(league('handoff_1', 'H')), false);
    });
    test('no line without a synced Sleeper league', () => {
        assert.equal(lastSyncedSummary([], NOW), null);
        assert.equal(lastSyncedSummary([league('manual_1', 'M', { lastSyncedAt: NOW })], NOW), null);
        // A Sleeper league stored before lastSyncedAt was tracked, and never failed since.
        assert.equal(lastSyncedSummary([league('1000', 'A')], NOW), null);
    });
    test('the most recent sync across them', () => {
        const s = lastSyncedSummary([
            league('1000', 'A', { lastSyncedAt: at('2026-09-12T10:00') }),
            league('2000', 'B', { lastSyncedAt: at('2026-09-15T09:42') }),
            league('manual_1', 'M', { lastSyncedAt: at('2026-09-15T10:59') }),
        ], NOW);
        assert.equal(plain(s.text), 'Last synced 9:42 AM');
        assert.equal(s.stale, false);
        assert.equal(s.failed, null);
        assert.match(plain(s.title), /Tuesday, September 15, 2026 at 9:42 AM/);
    });
});

describe('amber', () => {
    test('over a day old', () => {
        assert.equal(staleReason(NOW - 23 * 3600e3, NOW, {}), null);
        assert.equal(staleReason(NOW - 25 * 3600e3, NOW, {}), 'day');
        const s = lastSyncedSummary([league('1000', 'A', { lastSyncedAt: at('2026-09-08T20:15') })], NOW);
        assert.equal(s.text, 'Last synced Sep 8');
        assert.equal(s.stale, true);
        assert.match(s.title, /Over a day ago/);
    });
    // Sunday Sep 20: the 1:00 PM ET games kick off at noon in Chicago (17:00 UTC).
    const SUN_11AM = at('2026-09-20T11:00');
    const GAMES = { CIN: '2026-09-20T17:00:00Z', DAL: '2026-09-20T17:00:00Z', KC: '2026-09-20T20:25:00Z' };
    test('within 3 hours of a kickoff and not synced since 6 AM', () => {
        assert.equal(staleReason(at('2026-09-20T05:30'), SUN_11AM, GAMES), 'kickoff');
        assert.equal(staleReason(at('2026-09-19T22:00'), SUN_11AM, GAMES), 'kickoff'); // last night: under a day, still amber
        const s = lastSyncedSummary([league('1000', 'A', { lastSyncedAt: at('2026-09-19T22:00') })], SUN_11AM, GAMES);
        assert.equal(plain(s.text), 'Last synced yesterday 10:00 PM');
        assert.equal(s.stale, true);
        assert.match(s.title, /less than 3 hours away/);
    });
    test('synced this morning: not amber', () => {
        assert.equal(staleReason(at('2026-09-20T06:30'), SUN_11AM, GAMES), null);
    });
    test('the next kickoff more than 3 hours away, or already started: the one-day rule', () => {
        assert.equal(staleReason(at('2026-09-19T22:00'), at('2026-09-20T08:30'), GAMES), null); // noon is 3.5 h away
        assert.equal(staleReason(at('2026-09-19T22:00'), at('2026-09-20T12:30'), { CIN: GAMES.CIN }), null); // kicked off
    });
});

describe('failed leagues', () => {
    test('named after the time', () => {
        assert.equal(failedText([]), '');
        assert.equal(failedText(['Second League']), 'Second League\'s last sync failed');
        assert.equal(failedText(['A', 'B']), 'Last sync failed: A and B');
        assert.equal(failedText(['A', 'B', 'C']), 'Last sync failed in 3 leagues');
    });
    test('with the newest sync, and all of them in the hover text', () => {
        const s = lastSyncedSummary([
            league('1000', 'Fixture League', { lastSyncedAt: at('2026-09-15T09:42') }),
            league('2000', 'Second League', { lastSyncedAt: at('2026-09-11T09:00'), lastSyncFailedAt: at('2026-09-15T09:42') }),
        ], NOW);
        assert.equal(plain(s.text), 'Last synced 9:42 AM');
        assert.equal(s.failed.text, 'Second League\'s last sync failed');
        assert.match(s.failed.title, /Second League/);
    });
    test('a failed league that never synced still gets a line', () => {
        const s = lastSyncedSummary([league('1000', 'A', { lastSyncFailedAt: NOW })], NOW);
        assert.equal(s.text, '');
        assert.equal(s.failed.text, 'A\'s last sync failed');
    });
});
