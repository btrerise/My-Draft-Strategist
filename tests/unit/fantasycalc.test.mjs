// FantasyCalc's market values through the site (improvements K8): the Cloudflare Pages Function
// functions/api/fantasycalc.js. FantasyCalc's terms ask for one cached copy shared by every user, refreshed at most
// every three hours, and only GET /values/current. Runs here with stand-ins for global fetch (FantasyCalc) and
// caches.default (Cloudflare's edge cache), in memory, as tests/unit/ffc.test.mjs does for FFC.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet, readParams, FC_PARAMS, FRESH_MS } from '../../functions/api/fantasycalc.js';

const UP = 'https://api.fantasycalc.com/values/current';
const Q = 'isDynasty=false&numQbs=1&numTeams=12&ppr=1&tep=none';
const fcRows = () => [
    { player: { id: 1, name: 'Jahmyr Gibbs', position: 'RB', sleeperId: '9221', maybeTeam: 'DET' }, value: 9000, overallRank: 1 },
    { player: { id: 2, name: "Ja'Marr Chase", position: 'WR' }, value: 8900, overallRank: 2 },
    { player: {}, overallRank: 3 },
];

let upstream, requests, edge, pending, now;
const realFetch = globalThis.fetch, realCaches = globalThis.caches, realNow = Date.now;

beforeEach(() => {
    upstream = { status: 200, body: fcRows() }; requests = []; pending = []; edge = new Map(); now = 1_800_000_000_000;
    Date.now = () => now;
    globalThis.fetch = async (url) => {
        requests.push(String(url));
        if (upstream === 'down') throw new TypeError('fetch failed');
        return new Response(JSON.stringify(upstream.body), { status: upstream.status });
    };
    globalThis.caches = { default: {
        async match(req) { const hit = edge.get(req.url); return hit ? hit.clone() : undefined; },
        async put(req, res) { edge.set(req.url, res.clone()); },
    } };
});
afterEach(() => { globalThis.fetch = realFetch; globalThis.caches = realCaches; Date.now = realNow; });

async function call(query) {
    const res = await onRequestGet({ request: new Request(`https://mydraftstrategist.com/api/fantasycalc?${query}`), waitUntil: (p) => pending.push(p) });
    await Promise.all(pending.splice(0));
    return { status: res.status, headers: res.headers, body: await res.json() };
}

describe('readParams', () => {
    test('accepts every value FantasyCalc documents and puts them in one order', () => {
        assert.deepEqual(readParams(new URLSearchParams('tep=te%2B&ppr=0.5&numTeams=10&numQbs=2&isDynasty=true')), { query: 'isDynasty=true&numQbs=2&numTeams=10&ppr=0.5&tep=te%2B' });
        assert.equal(FC_PARAMS.tep.length * FC_PARAMS.ppr.length * FC_PARAMS.numTeams.length * FC_PARAMS.numQbs.length * FC_PARAMS.isDynasty.length, 144);
    });
    for (const [why, q] of [
        ['a missing parameter', 'isDynasty=false&numQbs=1&numTeams=12&ppr=1'],
        ['an unknown parameter', `${Q}&url=https://evil.example`],
        ['the old isTEP', `${Q}&isTEP=true`],
        ['a league size FantasyCalc lacks', 'isDynasty=false&numQbs=1&numTeams=16&ppr=1&tep=none'],
        ['a repeated parameter', `${Q}&ppr=0`],
        ['a bad value', 'isDynasty=maybe&numQbs=1&numTeams=12&ppr=1&tep=none'],
    ]) {
        test(`rejects ${why}`, () => { assert.ok(readParams(new URLSearchParams(q)).error); });
    }
});

describe('functions/api/fantasycalc.js', () => {
    test('a bad request answers 400 without calling FantasyCalc', async () => {
        const r = await call('isDynasty=false&numQbs=1&numTeams=16&ppr=1&tep=none');
        assert.equal(r.status, 400);
        assert.match(r.body.error, /numTeams/);
        assert.deepEqual(requests, []);
    });

    test('fetches /values/current once, trims the rows, and caches them', async () => {
        const r = await call(Q);
        assert.equal(r.status, 200);
        assert.deepEqual(requests, [`${UP}?${Q}`]);
        assert.deepEqual(r.body, [
            { player: { name: 'Jahmyr Gibbs', position: 'RB' }, overallRank: 1 },
            { player: { name: "Ja'Marr Chase", position: 'WR' }, overallRank: 2 },
        ]);
        assert.equal(r.headers.get('x-fc-stale'), '0');
        assert.equal(edge.size, 1);
    });

    test('another user within three hours gets the cached copy, with no new request', async () => {
        await call(Q);
        now += FRESH_MS - 60_000;
        const again = await call('tep=none&ppr=1&numTeams=12&numQbs=1&isDynasty=false'); // same set, another order
        assert.equal(again.status, 200);
        assert.equal(requests.length, 1);
        assert.equal(again.body.length, 2);
    });

    test('after three hours it asks FantasyCalc again', async () => {
        await call(Q);
        now += FRESH_MS + 1;
        upstream = { status: 200, body: fcRows().slice(0, 1) };
        const r = await call(Q);
        assert.equal(requests.length, 2);
        assert.equal(r.body.length, 1);
    });

    test('each parameter set is its own copy', async () => {
        await call(Q);
        await call('isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te%2B%2B');
        assert.deepEqual(requests, [`${UP}?${Q}`, `${UP}?isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te%2B%2B`]);
        assert.equal(edge.size, 2);
    });

    test('FantasyCalc down: an older copy is served, marked stale', async () => {
        await call(Q);
        now += FRESH_MS + 1;
        upstream = 'down';
        const r = await call(Q);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('x-fc-stale'), '1');
        assert.equal(r.body.length, 2);
    });

    test('FantasyCalc down and nothing cached: 502', async () => {
        upstream = 'down';
        const r = await call(Q);
        assert.equal(r.status, 502);
        assert.match(r.body.error, /FantasyCalc couldn't be reached/);
    });

    test('an error from FantasyCalc is not cached', async () => {
        upstream = { status: 503, body: null };
        assert.equal((await call(Q)).status, 502);
        assert.equal(edge.size, 0);
    });
});
