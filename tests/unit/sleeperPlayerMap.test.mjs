// getSleeperPlayerMap (js/shared/api/sleeper.js): what it caches. Added with the 2C follow-up
// that stopped it caching Sleeper error replies as if they were the player list.
//
// window.mdsFetch answers from `next`; indexedDB is a minimal in-memory fake (open, one store,
// get/put) so the IndexedDB cache path really runs. The module keeps an in-memory copy once a
// fetch succeeds, so tests run in order: the first one is the only non-forced call that reaches
// IndexedDB, the rest pass forceRefresh (which skips both caches, as the injury audit does).
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

let next = null; // { status, body } or { status, text } for a non-JSON body
let fetches = 0;
globalThis.indexedDB = fakeIndexedDB;
globalThis.window = {
    indexedDB: fakeIndexedDB,
    MDS_LONG_FETCH_TIMEOUT_MS: 60000,
    async mdsFetch() {
        fetches++;
        const r = next;
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => {
                if ('text' in r) throw new SyntaxError(`Unexpected token '<', "${r.text.slice(0, 10)}"... is not valid JSON`);
                return r.body;
            },
        };
    },
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
