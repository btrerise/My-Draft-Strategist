// getFreshness in js/shared/freshness.js (refactor chunk 8B; Lineup Strategist's getRankingsFreshness
// before that). Covers what its callers rely on: MLS's rankings / market / league-sync lines
// (js/mls/rankings/engine.js, js/mls/scout/marketDisconnect.js, js/mls/leagues/sync.js), the
// T-Score page's sheet label (js/tscore/main.js) and Draft Strategist's status lines (js/mds/settings.js).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import { getFreshness } from '../../js/shared/freshness.js';

// The Playwright clock (tests/helpers.mjs), so the two suites read the same dates.
const NOW = Date.parse('2026-09-15T16:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

mock.timers.enable({ apis: ['Date'], now: NOW });

test('no timestamp gives null, so callers fall back to their neutral text', () => {
    for (const ts of [undefined, null, 0, '']) assert.equal(getFreshness(ts, 14), null);
    assert.equal(getFreshness(undefined, 2, 'Synced'), null);
});

test('today, yesterday, N days ago, with whole days rounded down', () => {
    assert.deepEqual(getFreshness(NOW, 14), { label: 'Updated today', isStale: false });
    assert.equal(getFreshness(NOW - (DAY - 1), 14).label, 'Updated today');
    assert.equal(getFreshness(NOW - DAY, 14).label, 'Updated yesterday');
    assert.equal(getFreshness(NOW - (2 * DAY - 1), 14).label, 'Updated yesterday');
    assert.equal(getFreshness(NOW - 2 * DAY, 14).label, 'Updated 2 days ago');
    assert.equal(getFreshness(NOW - 30 * DAY, 14).label, 'Updated 30 days ago');
});

test('a timestamp in the future (another device\'s clock) reads as today, not stale', () => {
    assert.deepEqual(getFreshness(NOW + 3 * DAY, 0), { label: 'Updated today', isStale: false });
});

test('stale only past the threshold: days > staleAfterDays', () => {
    // MLS market data and MDS ADP (3), MLS league sync (2), weekly (6), ROS and MDS rankings (14).
    for (const limit of [2, 3, 6, 14]) {
        assert.equal(getFreshness(NOW - limit * DAY, limit).isStale, false, `day ${limit} of ${limit}`);
        assert.equal(getFreshness(NOW - (limit + 1) * DAY, limit).isStale, true, `day ${limit + 1} of ${limit}`);
    }
});

test('an Infinity threshold is never stale (the T-Score page has no stale state)', () => {
    assert.equal(getFreshness(NOW - 400 * DAY, Infinity).isStale, false);
});

test('timestamps read back from localStorage as strings work the same as numbers', () => {
    assert.deepEqual(getFreshness(String(NOW - 4 * DAY), 3), getFreshness(NOW - 4 * DAY, 3));
    assert.deepEqual(getFreshness(String(NOW - 4 * DAY), 3), { label: 'Updated 4 days ago', isStale: true });
});

test('the verb replaces "Updated" in every form', () => {
    assert.equal(getFreshness(NOW, 2, 'Synced').label, 'Synced today');
    assert.equal(getFreshness(NOW - DAY, 2, 'Synced').label, 'Synced yesterday');
    assert.equal(getFreshness(NOW - 5 * DAY, 3, 'Fetched').label, 'Fetched 5 days ago');
    // js/mls/leagues/sync.js turns the label into "Last sync failed · roster from 3 days ago".
    assert.equal(getFreshness(NOW - 3 * DAY, 2, 'Synced').label.replace(/^Synced /, 'from '), 'from 3 days ago');
});
