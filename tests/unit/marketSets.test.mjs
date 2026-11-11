// Market values kept per format, and what Analyze Trade does about them (improvements S38, js/mls/scout/marketSets.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_MAX_AGE_MS, isMarketStale, marketFormatKey, marketFormatOf, marketPlan, putMarketSet } from '../../js/mls/scout/marketSets.js';

const NOW = Date.parse('2026-11-11T18:00:00Z');
const redraft = marketFormatOf({ type: 'redraft', qbs: '1', ppr: '1', tep: false }, 12);
const dynasty = marketFormatOf({ type: 'dynasty', qbs: '2', ppr: '0.5', tep: true }, 16);
const rows = [{ name: 'A', cleanName: 'a', marketVal: 1, pos: 'RB' }];
const plan = (o) => marketPlan({ want: redraft, sets: {}, auto: true, now: NOW, ...o });

test('a format: the settings and FantasyCalc\'s league size; its key', () => {
    assert.deepEqual(redraft, { type: 'redraft', qbs: '1', ppr: '1', tep: false, teams: 12 });
    assert.deepEqual(dynasty, { type: 'dynasty', qbs: '2', ppr: '0.5', tep: true, teams: 14 });
    assert.equal(marketFormatKey(redraft), 'redraft|1|1|none|12');
    assert.equal(marketFormatKey(dynasty), 'dynasty|2|0.5|tep|14');
    // Values saved before sets were kept have no league size: no key, so they match no league.
    assert.equal(marketFormatKey({ type: 'redraft', qbs: '1', ppr: '1', tep: false }), null);
    assert.equal(marketFormatKey(null), null);
});

test('three hours old is stale; no date is stale', () => {
    assert.equal(isMarketStale(NOW - MARKET_MAX_AGE_MS + 1000, NOW), false);
    assert.equal(isMarketStale(NOW - MARKET_MAX_AGE_MS, NOW), true);
    assert.equal(isMarketStale(String(NOW - 1000), NOW), false);
    assert.equal(isMarketStale(null, NOW), true);
});

test('the store keeps one set per format, the newest six', () => {
    let sets = putMarketSet({}, redraft, rows, NOW);
    sets = putMarketSet(sets, dynasty, rows, NOW + 1);
    assert.deepEqual(Object.keys(sets).sort(), ['dynasty|2|0.5|tep|14', 'redraft|1|1|none|12']);
    sets = putMarketSet(sets, redraft, [], NOW + 2);
    assert.equal(Object.keys(sets).length, 2);
    assert.equal(sets['redraft|1|1|none|12'].updatedAt, NOW + 2);
    for (let teams = 8, i = 0; i < 8; i++, teams = [8, 10, 12, 14][i % 4]) {
        sets = putMarketSet(sets, { ...redraft, ppr: String(i % 2), qbs: i < 4 ? '1' : '2', teams }, rows, NOW + 10 + i);
    }
    assert.equal(Object.keys(sets).length, 6);
    assert.ok(!sets['dynasty|2|0.5|tep|14'], 'the oldest went');
    assert.equal(putMarketSet(sets, { type: 'redraft' }, rows, NOW), sets);
});

test('Analyze Trade: nothing loaded, or old, or another format: fetch', () => {
    assert.equal(plan({ active: { rows: [], format: null, updatedAt: null } }), 'fetch');
    assert.equal(plan({ active: { rows, format: redraft, updatedAt: NOW - MARKET_MAX_AGE_MS - 1 } }), 'fetch');
    assert.equal(plan({ active: { rows, format: dynasty, updatedAt: NOW } }), 'fetch');
    // Fetched before sets were kept (no league size): fetched again.
    assert.equal(plan({ active: { rows, format: { type: 'redraft', qbs: '1', ppr: '1', tep: false }, updatedAt: NOW } }), 'fetch');
});

test('Analyze Trade: this league\'s values, fresh: nothing to do', () => {
    assert.equal(plan({ active: { rows, format: redraft, updatedAt: NOW - 60000 } }), 'none');
});

test('Analyze Trade: an uploaded file is never replaced', () => {
    assert.equal(plan({ active: { rows, format: null, updatedAt: NOW - 30 * 24 * 3600 * 1000 } }), 'none');
});

test('Analyze Trade: a stored set for this format is used before fetching', () => {
    const sets = putMarketSet({}, redraft, rows, NOW - 60000);
    assert.equal(plan({ sets, active: { rows, format: dynasty, updatedAt: NOW } }), 'cached');
    assert.equal(plan({ sets, active: { rows: [], format: null, updatedAt: null } }), 'cached');
    // The stored one is old too: fetch.
    const old = putMarketSet({}, redraft, rows, NOW - MARKET_MAX_AGE_MS - 1);
    assert.equal(plan({ sets: old, active: { rows, format: dynasty, updatedAt: NOW } }), 'fetch');
});

test('Analyze Trade with the switch off: no fetch; a stored set for this format still beats another format\'s', () => {
    assert.equal(plan({ auto: false, active: { rows: [], format: null, updatedAt: null } }), 'none');
    assert.equal(plan({ auto: false, active: { rows, format: redraft, updatedAt: NOW - MARKET_MAX_AGE_MS - 1 } }), 'none');
    const old = putMarketSet({}, redraft, rows, NOW - MARKET_MAX_AGE_MS - 1);
    assert.equal(plan({ auto: false, sets: old, active: { rows, format: dynasty, updatedAt: NOW } }), 'cached');
    assert.equal(plan({ auto: false, sets: old, active: { rows, format: redraft, updatedAt: NOW - MARKET_MAX_AGE_MS - 1 } }), 'none');
});
