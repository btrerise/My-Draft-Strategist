// getFreshness in js/shared/freshness.js (refactor chunk 8B; Lineup Strategist's getRankingsFreshness
// before that). Covers what its callers rely on: MLS's rankings / market / league-sync lines
// (js/mls/rankings/engine.js, js/mls/scout/marketDisconnect.js, js/mls/leagues/sync.js), the
// T-Score page's sheet label (js/tscore/main.js) and Draft Strategist's status lines (js/mds/settings.js).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import { getFreshness } from '../../js/shared/freshness.js';

// Calendar days and clock times are this device's, so the tests pin a zone: Chicago, which is UTC-5 in this date range
// (CDT), so a UTC day and the local day differ. Set before the first Date call, which reads TZ.
process.env.TZ = 'America/Chicago';

// The Playwright clock (tests/helpers.mjs), so the two suites read the same dates: Tue Sep 15 2026, 11:00 AM in
// Chicago (16:00 UTC).
const NOW = Date.parse('2026-09-15T16:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const at = (local) => new Date(local).getTime(); // a local (Chicago) date and time

mock.timers.enable({ apis: ['Date'], now: NOW });

test('no timestamp gives null, so callers fall back to their neutral text', () => {
    for (const ts of [undefined, null, 0, '']) assert.equal(getFreshness(ts, 14), null);
    assert.equal(getFreshness(undefined, 2, 'Synced'), null);
});

test('calendar days in your own time zone, not 24-hour periods (the owner\'s report)', () => {
    assert.equal(getFreshness(NOW, 14).label, 'Updated today');
    // Since your midnight is today; 11 hours ago (just before midnight) is yesterday, though not a whole day old.
    assert.equal(getFreshness(at('2026-09-15T00:00:00'), 14).label, 'Updated today');
    assert.equal(getFreshness(at('2026-09-14T23:59:00'), 14).label, 'Updated yesterday');
    // 9 PM yesterday: "yesterday" this morning (it was "today" until 9 PM under 24-hour counting).
    assert.equal(getFreshness(at('2026-09-14T21:00:00'), 14).label, 'Updated yesterday');
    assert.equal(getFreshness(at('2026-09-14T00:00:00'), 14).label, 'Updated yesterday');
    assert.equal(getFreshness(at('2026-09-13T23:59:00'), 14).label, 'Updated 2 days ago');
    // 13 hours ago was 10 PM the day before yesterday in UTC terms, but yesterday here.
    assert.equal(getFreshness(NOW - 13 * HOUR, 14).label, 'Updated yesterday');
    assert.equal(getFreshness(NOW - 30 * DAY, 14).label, 'Updated 30 days ago');
});

test('detail adds the time, and past yesterday the date after the age; title is the full date', () => {
    const f = getFreshness(at('2026-09-15T09:12:00'), 14);
    assert.deepEqual(f, { label: 'Updated today', detail: 'Updated today at 9:12 AM',
        title: 'Updated Tuesday, September 15, 2026 at 9:12 AM', isStale: false });
    assert.equal(getFreshness(at('2026-09-14T21:49:00'), 14).detail, 'Updated yesterday at 9:49 PM');
    assert.equal(getFreshness(at('2026-09-11T21:49:00'), 14).detail, 'Updated 4 days ago (Fri, Sep 11 at 9:49 PM)');
    // Another year: with the year.
    assert.equal(getFreshness(at('2025-12-30T08:05:00'), 14).detail, 'Updated 259 days ago (Tue, Dec 30, 2025 at 8:05 AM)');
    assert.equal(getFreshness(at('2026-09-14T21:49:00'), 2, 'Synced').detail, 'Synced yesterday at 9:49 PM');
});

test('across a daylight-saving change, days still count by the calendar', () => {
    // Chicago falls back on Sun Nov 1 2026 (a 25-hour day).
    mock.timers.setTime(at('2026-11-02T08:00:00'));
    assert.equal(getFreshness(at('2026-11-01T00:30:00'), 14).label, 'Updated yesterday');
    assert.equal(getFreshness(at('2026-10-31T23:30:00'), 14).label, 'Updated 2 days ago');
    mock.timers.setTime(NOW);
});

test('a timestamp in the future (another device\'s clock) reads as today, not stale', () => {
    const f = getFreshness(NOW + 3 * DAY, 0);
    assert.equal(f.label, 'Updated today');
    assert.equal(f.isStale, false);
});

test('stale only past the threshold: days > staleAfterDays', () => {
    // MLS market data and MDS ADP (3), MLS league sync (2), weekly (6), ROS and MDS rankings (14); the Trade tab's
    // market line (0) is stale from the next calendar day.
    for (const limit of [0, 2, 3, 6, 14]) {
        assert.equal(getFreshness(NOW - limit * DAY, limit).isStale, false, `day ${limit} of ${limit}`);
        assert.equal(getFreshness(NOW - (limit + 1) * DAY, limit).isStale, true, `day ${limit + 1} of ${limit}`);
    }
    assert.equal(getFreshness(at('2026-09-14T23:59:00'), 0).isStale, true);
});

test('an Infinity threshold is never stale (the T-Score page has no stale state)', () => {
    assert.equal(getFreshness(NOW - 400 * DAY, Infinity).isStale, false);
});

test('timestamps read back from localStorage as strings work the same as numbers', () => {
    assert.deepEqual(getFreshness(String(NOW - 4 * DAY), 3), getFreshness(NOW - 4 * DAY, 3));
    assert.equal(getFreshness(String(NOW - 4 * DAY), 3).label, 'Updated 4 days ago');
    assert.equal(getFreshness(String(NOW - 4 * DAY), 3).isStale, true);
});

test('the verb replaces "Updated" in every form', () => {
    assert.equal(getFreshness(NOW, 2, 'Synced').label, 'Synced today');
    assert.equal(getFreshness(NOW - DAY, 2, 'Synced').label, 'Synced yesterday');
    assert.equal(getFreshness(NOW - 5 * DAY, 3, 'Fetched').label, 'Fetched 5 days ago');
    assert.match(getFreshness(NOW - 5 * DAY, 3, 'Fetched').title, /^Fetched /);
    // js/mls/render/leagueCards.js turns the label into "Last sync failed · roster from 3 days ago".
    assert.equal(getFreshness(NOW - 3 * DAY, 2, 'Synced').label.replace(/^Synced /, 'from '), 'from 3 days ago');
});
