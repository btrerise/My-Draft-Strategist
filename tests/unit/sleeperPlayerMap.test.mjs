// getSleeperPlayerMap (js/shared/api/sleeper.js): what it caches. Added with the 2C follow-up
// that stopped it caching Sleeper error replies as if they were the player list.
//
// fetch answers from `next` (the real mdsFetch from js/shared/net.js wraps it); indexedDB is a minimal in-memory fake (open, one store,
// get/put) so the IndexedDB cache path really runs. The module keeps an in-memory copy once a
// fetch succeeds, so tests run in order: the first one is the only non-forced call that reaches
// IndexedDB, the rest pass forceRefresh (Sync All's "check Sleeper now"). Node has no Worker, so the download runs on
// this thread (sleeper.js's fallback). Since improvements F26 a forced refresh keeps a copy under 10 minutes old, so
// the clock is moved on (later) before each one, and an unchanged file (the same etag) isn't unpacked again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const idbStore = new Map();
const later = (fn) => setTimeout(fn, 0);
const fakeIndexedDB = {
    open() {
        const req = {};
        const db = {
            objectStoreNames: { contains: () => true },
            transaction() {
                const tx = {};
                tx.objectStore = () => ({
                    get(key) { const r = {}; later(() => { r.result = idbStore.get(key); r.onsuccess(); }); return r; },
                    put(value, key) { idbStore.set(key, value); later(() => tx.oncomplete && tx.oncomplete()); },
                });
                return tx;
            },
        };
        later(() => { req.result = db; req.onsuccess(); });
        return req;
    },
};

let next = null; // { status, body, etag? } or { status, text } for a non-JSON body
let fetches = 0;
let unpacked = 0; // json() calls: the file read and unpacked
// The page's clock, moved on by `later` (a forced refresh within 10 minutes of the last download keeps it).
const realNow = Date.now;
let offset = 0;
Date.now = () => realNow() + offset;
const elevenMinutesLater = () => { offset += 11 * 60 * 1000; };
globalThis.indexedDB = fakeIndexedDB;
globalThis.window = { indexedDB: fakeIndexedDB };
globalThis.fetch = async () => {
    fetches++;
    const r = next;
    return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        headers: { get: (name) => (name.toLowerCase() === 'etag' ? r.etag ?? null : null) },
        json: async () => {
            unpacked++;
            if ('text' in r) throw new SyntaxError(`Unexpected token '<', "${r.text.slice(0, 10)}"... is not valid JSON`);
            return r.body;
        },
        text: async () => ('text' in r ? r.text : JSON.stringify(r.body)),
    };
};

const { getSleeperPlayerMap } = await import('../../js/shared/api/sleeper.js');

const KEY = 'nfl_player_map';
const GOOD = { 4866: { player_id: '4866', first_name: "Ja'Marr", last_name: 'Chase' } };
const settle = () => new Promise(r => setTimeout(r, 5)); // let the fire-and-forget IndexedDB write land

test('a bad entry already in IndexedDB is ignored and replaced', async () => {
    idbStore.set(KEY, { data: { error: 'rate-limited' }, fetchedAt: Date.now() });
    next = { status: 200, body: GOOD };
    assert.deepEqual(await getSleeperPlayerMap(), GOOD);
    assert.equal(fetches, 1);
    await settle();
    assert.deepEqual(idbStore.get(KEY).data, GOOD);
});

test('a good map is kept in memory: the next call makes no request', async () => {
    fetches = 0;
    assert.deepEqual(await getSleeperPlayerMap(), GOOD);
    assert.equal(fetches, 0);
});

const rejectsUncached = async (reply, message) => {
    elevenMinutesLater();
    next = reply;
    await assert.rejects(getSleeperPlayerMap({ forceRefresh: true }), (err) => {
        assert.equal(err.isSleeperResponseError, true);
        assert.equal(err.name, 'SleeperResponseError');
        assert.equal(err.message, message);
        return true;
    });
    await settle();
    assert.deepEqual(idbStore.get(KEY).data, GOOD, 'IndexedDB still holds the last good map');
};

test('an HTML error page (503) is rejected, not cached', async () => {
    await rejectsUncached({ status: 503, text: '<html>Service Unavailable</html>' }, "Sleeper's player list request failed (HTTP 503).");
});

test('a JSON error body (429) is rejected, not cached', async () => {
    await rejectsUncached({ status: 429, body: { message: 'Too many requests' } }, "Sleeper's player list request failed (HTTP 429).");
});

test('a 200 whose body is not a player map is rejected, not cached', async () => {
    const message = "Sleeper's player list came back in an unexpected format.";
    await rejectsUncached({ status: 200, body: { error: 'bad-request' } }, message);
    await rejectsUncached({ status: 200, body: null }, message);
    await rejectsUncached({ status: 200, body: [] }, message);
});

test('after a failed refresh the in-memory map is still served', async () => {
    fetches = 0;
    assert.deepEqual(await getSleeperPlayerMap(), GOOD);
    assert.equal(fetches, 0);
});

test('a forced refresh within 10 minutes of the last download keeps it (Sleeper has nothing newer)', async () => {
    elevenMinutesLater();
    next = { status: 200, body: GOOD, etag: 'W/"v1"' };
    fetches = 0;
    assert.deepEqual(await getSleeperPlayerMap({ forceRefresh: true }), GOOD);
    assert.equal(fetches, 1);
    offset += 5 * 60 * 1000;
    assert.deepEqual(await getSleeperPlayerMap({ forceRefresh: true }), GOOD);
    assert.equal(fetches, 1, 'no request 5 minutes later');
    // A Sync All you tap (keepFor: 0) asks at once.
    assert.deepEqual(await getSleeperPlayerMap({ forceRefresh: true, keepFor: 0 }), GOOD);
    assert.equal(fetches, 2, 'a tapped Sync All asks Sleeper');
});

test('an unchanged file (the same etag) is kept without unpacking it; a new one replaces it, slimmed', async () => {
    elevenMinutesLater();
    const CHANGED = { 4866: { player_id: '4866', first_name: "Ja'Marr", last_name: 'Chase', injury_status: 'Out', college: 'LSU', height: '72' } };
    next = { status: 200, body: CHANGED, etag: 'W/"v1"' };
    unpacked = 0;
    assert.deepEqual(await getSleeperPlayerMap({ forceRefresh: true }), GOOD, 'same version tag: the saved copy');
    assert.equal(unpacked, 0, 'nothing unpacked');
    elevenMinutesLater();
    next = { status: 200, body: CHANGED, etag: 'W/"v2"' };
    const slim = { 4866: { player_id: '4866', first_name: "Ja'Marr", last_name: 'Chase', injury_status: 'Out' } };
    assert.deepEqual(await getSleeperPlayerMap({ forceRefresh: true }), slim, 'a new version: the new statuses, only the kept fields');
    await settle();
    assert.deepEqual(idbStore.get(KEY), { ...idbStore.get(KEY), data: slim, etag: 'W/"v2"', fields: 1 });
});
