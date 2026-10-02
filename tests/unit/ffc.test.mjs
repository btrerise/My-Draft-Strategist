// Fantasy Football Calculator (refactor 7A): the Cloudflare Pages Function that proxies FFC
// (functions/api/ffc/[format].js) and the browser client that calls it (js/shared/api/ffc.js).
// The function runs here with stand-ins for what Cloudflare provides: global fetch (FFC),
// caches.default (edge cache) and env.FFC_LISTS (KV), all in memory.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet, FFC_FORMATS, FULL_LIST_MIN } from '../../functions/api/ffc/[format].js';
import { fetchFfcAdp, FFC_FORMAT_LABELS } from '../../js/shared/api/ffc.js';

const YEAR = new Date().getUTCFullYear();
const ffcUrl = (format) => `https://fantasyfootballcalculator.com/api/v1/adp/${format}?teams=12&year=${YEAR}`;

function ffcPlayers(n) {
    return Array.from({ length: n }, (_, i) => ({ player_id: i + 1, name: `Player ${i + 1}`, position: 'WR', team: 'DET', adp: i + 1.5, bye: 6 }));
}
const ffcBody = (n, meta = {}) => ({ status: 'Success', meta: { type: 'PPR', teams: 12, ...meta }, players: ffcPlayers(n) });

// --- Cloudflare stand-ins ---
let ffcRoutes, ffcRequests, edge, kv, pending;
const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;

function makeKv() {
    const data = new Map();
    return {
        data, writes: 0,
        async get(key, type) { const v = data.get(key); return v == null ? null : (type === 'json' ? JSON.parse(v) : v); },
        async put(key, value) { this.writes++; data.set(key, value); },
    };
}

beforeEach(() => {
    ffcRoutes = {}; ffcRequests = []; pending = [];
    edge = new Map();
    kv = makeKv();
    globalThis.fetch = async (url) => {
        ffcRequests.push(String(url));
        const r = ffcRoutes[String(url)];
        if (!r) throw new TypeError('fetch failed');
        return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status || 200 });
    };
    globalThis.caches = { default: {
        async match(req) { const hit = edge.get(req.url); return hit ? hit.clone() : undefined; },
        async put(req, res) { edge.set(req.url, res.clone()); },
    } };
});
afterEach(() => { globalThis.fetch = realFetch; globalThis.caches = realCaches; });

async function call(format, { env = { FFC_LISTS: kv } } = {}) {
    const res = await onRequestGet({
        request: new Request(`https://mydraftstrategist.com/api/ffc/${format}`),
        params: { format }, env,
        waitUntil: (p) => pending.push(p),
    });
    await Promise.all(pending.splice(0));
    return { status: res.status, headers: res.headers, body: await res.json() };
}

describe('functions/api/ffc/[format].js', () => {
    test('offers the four redraft formats and rookie drafts; startup dynasty lists never fill a pool', () => {
        assert.deepEqual(FFC_FORMATS, ['standard', 'half-ppr', 'ppr', '2qb', 'rookie']);
        assert.deepEqual(Object.keys(FFC_FORMAT_LABELS).sort(), [...FFC_FORMATS].sort());
        assert.deepEqual(Object.keys(FULL_LIST_MIN).sort(), [...FFC_FORMATS].sort());
        assert.equal(FULL_LIST_MIN.ppr, 150);
        assert.equal(FULL_LIST_MIN.rookie, 30);
    });

    test('rookie drafts are 3-4 rounds, so a 34-player rookie list is full and saved', async () => {
        ffcRoutes[ffcUrl('rookie')] = { body: ffcBody(34, { type: 'Dynasty Rookie' }) };
        const res = await call('rookie');
        assert.equal(res.body.source, 'live');
        assert.equal(res.body.short, false);
        assert.equal(JSON.parse(kv.data.get('ffc:rookie')).players.length, 34);
    });

    test('a rookie list under 30 is short and falls back to the saved one', async () => {
        ffcRoutes[ffcUrl('rookie')] = { body: ffcBody(0, { type: 'Dynasty Rookie' }) };
        const none = await call('rookie');
        assert.equal(none.body.short, true);
        assert.equal(none.body.players.length, 0);
        edge.clear();
        kv.data.set('ffc:rookie', JSON.stringify({ savedAt: '2026-08-20T10:00:00.000Z', meta: {}, players: ffcPlayers(40) }));
        const saved = await call('rookie');
        assert.equal(saved.body.source, 'saved');
        assert.equal(saved.body.liveCount, 0);
        assert.equal(saved.body.players.length, 40);
    });

    test('an unknown format (startup dynasty included) is a 404 and FFC is not called', async () => {
        const res = await call('dynasty');
        assert.equal(res.status, 404);
        assert.match(res.body.error, /Unknown format "dynasty"/);
        assert.deepEqual(ffcRequests, []);
    });

    test('a full live list is served and saved to KV', async () => {
        ffcRoutes[ffcUrl('ppr')] = { body: ffcBody(240) };
        const res = await call('ppr');
        assert.equal(res.status, 200);
        assert.equal(res.body.source, 'live');
        assert.equal(res.body.short, false);
        assert.equal(res.body.players.length, 240);
        assert.equal(res.body.players[0].name, 'Player 1');
        assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
        const saved = JSON.parse(kv.data.get('ffc:ppr'));
        assert.equal(saved.players.length, 240);
        assert.equal(saved.savedAt, res.body.savedAt);
    });

    test('a second request is answered from the edge cache, not FFC', async () => {
        ffcRoutes[ffcUrl('ppr')] = { body: ffcBody(200) };
        await call('ppr');
        const again = await call('ppr');
        assert.equal(again.body.players.length, 200);
        assert.equal(ffcRequests.length, 1);
        assert.equal(again.headers.get('cache-control'), 'public, max-age=3600');
    });

    test('a full list saved within 20h is not written again', async () => {
        ffcRoutes[ffcUrl('ppr')] = { body: ffcBody(200) };
        await call('ppr');
        edge.clear();
        await call('ppr');
        assert.equal(ffcRequests.length, 2);
        assert.equal(kv.writes, 1);
    });

    test('a short live list falls back to the last full list in KV', async () => {
        kv.data.set('ffc:ppr', JSON.stringify({ savedAt: '2026-09-12T10:00:00.000Z', meta: { type: 'PPR' }, players: ffcPlayers(230) }));
        ffcRoutes[ffcUrl('ppr')] = { body: ffcBody(29) };
        const res = await call('ppr');
        assert.equal(res.body.source, 'saved');
        assert.equal(res.body.short, false);
        assert.equal(res.body.savedAt, '2026-09-12T10:00:00.000Z');
        assert.equal(res.body.liveCount, 29);
        assert.equal(res.body.players.length, 230);
        assert.equal(kv.writes, 0); // a short list is never saved over a full one
    });

    test('a short live list with nothing saved is served, marked short', async () => {
        ffcRoutes[ffcUrl('half-ppr')] = { body: ffcBody(54) };
        const res = await call('half-ppr');
        assert.equal(res.body.source, 'live');
        assert.equal(res.body.short, true);
        assert.equal(res.body.players.length, 54);
        assert.equal(kv.data.size, 0);
    });

    test('without the KV binding a short list is still served', async () => {
        ffcRoutes[ffcUrl('ppr')] = { body: ffcBody(29) };
        const res = await call('ppr', { env: {} });
        assert.equal(res.body.short, true);
        assert.equal(res.body.players.length, 29);
    });

    test('FFC down: the saved list is served; with none saved, a 502 that is not cached', async () => {
        ffcRoutes[ffcUrl('ppr')] = { status: 503, body: 'down' };
        const none = await call('ppr');
        assert.equal(none.status, 502);
        assert.match(none.body.error, /Fantasy Football Calculator couldn't be reached \(HTTP 503\)/);
        assert.equal(edge.size, 0);

        kv.data.set('ffc:ppr', JSON.stringify({ savedAt: '2026-09-12T10:00:00.000Z', meta: {}, players: ffcPlayers(200) }));
        const saved = await call('ppr');
        assert.equal(saved.body.source, 'saved');
        assert.equal(saved.body.liveCount, null);
        assert.equal(edge.size, 0); // FFC failed, so the next request tries it again
    });

    test('a reply that is not FFC\'s JSON counts as FFC failing', async () => {
        ffcRoutes[ffcUrl('2qb')] = { body: { status: 'Error', players: null } };
        const res = await call('2qb');
        assert.equal(res.status, 502);
        assert.match(res.body.error, /unexpected response/);
    });
});

describe('js/shared/api/ffc.js fetchFfcAdp', () => {
    let reply;
    beforeEach(() => {
        reply = null;
        globalThis.window = {
            async mdsFetch(url) {
                window.lastUrl = url;
                return { ok: reply.status === 200, status: reply.status, json: async () => { if (reply.html) throw new SyntaxError('Unexpected token <'); return reply.body; } };
            },
        };
    });

    test('returns the proxy body', async () => {
        reply = { status: 200, body: { source: 'live', short: false, players: [{ name: 'A' }] } };
        assert.deepEqual(await fetchFfcAdp('ppr'), reply.body);
        assert.equal(window.lastUrl, '/api/ffc/ppr');
    });

    test('a proxy error reads "<prefix>: <its message>"', async () => {
        reply = { status: 502, body: { error: "Fantasy Football Calculator couldn't be reached (HTTP 503)." } };
        await assert.rejects(fetchFfcAdp('ppr', { errorPrefix: 'Oops' }), { message: "Oops: Fantasy Football Calculator couldn't be reached (HTTP 503)." });
    });

    test('an HTML page (no proxy deployed) reports the status, not a parse error', async () => {
        reply = { status: 404, html: true };
        await assert.rejects(fetchFfcAdp('ppr'), { message: 'Fantasy Football Calculator Error: 404' });
        reply = { status: 200, html: true };
        await assert.rejects(fetchFfcAdp('ppr'), { message: 'Fantasy Football Calculator Error: unexpected response' });
    });
});
