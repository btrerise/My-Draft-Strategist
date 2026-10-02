// js/shared/api/market.js (refactor chunk 2C): fetchLeagueLogsMarket, which Draft Strategist's
// Quick-Start and ADP sync call directly, and the LeagueLogs branch of fetchMarketConsensusData
// (Lineup Strategist), which now goes through it. window.mdsFetch is a stub that answers from
// a URL -> response table; with no window.indexedDB the Sleeper player map is always fetched.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { fetchLeagueLogsMarket, fetchMarketConsensusData } from '../../js/shared/api/market.js';

let routes = {};
const requested = [];
globalThis.window = {
    MDS_LONG_FETCH_TIMEOUT_MS: 60000,
    async mdsFetch(url) {
        requested.push(url);
        const r = routes[url];
        if (!r) throw new Error(`unexpected fetch: ${url}`);
        return { ok: r.status === 200, status: r.status, json: async () => r.body };
    },
};

const MARKET = 'https://developer.leaguelogs.com/v1/market/';
const PLAYERS = 'https://api.sleeper.app/v1/players/nfl';
const rows = [
    { sleeperPlayerId: '4866', overallRank: '2.2' },
    { sleeperPlayerId: '9509', overallRank: '1.4' },
    { sleeperPlayerId: '99999', overallRank: '3' },
];

beforeEach(() => { routes = {}; requested.length = 0; });

describe('fetchLeagueLogsMarket', () => {
    test('returns the raw rows, unfiltered and in LeagueLogs order', async () => {
        routes[MARKET + 'redraft-1qb-12t-ppr0_5'] = { status: 200, body: { data: rows } };
        assert.deepEqual(await fetchLeagueLogsMarket('redraft-1qb-12t-ppr0_5'), rows);
        assert.deepEqual(requested, [MARKET + 'redraft-1qb-12t-ppr0_5']);
    });

    test('throws "Market Error: <status>" by default, or with the caller\'s prefix', async () => {
        routes[MARKET + 'x'] = { status: 503, body: null };
        await assert.rejects(fetchLeagueLogsMarket('x'), { message: 'Market Error: 503' });
        await assert.rejects(fetchLeagueLogsMarket('x', { errorPrefix: 'LeagueLogs Market Error' }), { message: 'LeagueLogs Market Error: 503' });
    });
});

describe('fetchMarketConsensusData, LeagueLogs', () => {
    test('joins the market to the Sleeper map, as before 2C', async (t) => {
        t.mock.method(console, 'error', () => {}); // "Failed to persist ... to IndexedDB"
        routes[PLAYERS] = { status: 200, body: {
            4866: { player_id: '4866', first_name: "Ja'Marr", last_name: 'Chase', position: 'WR' },
            9509: { player_id: '9509', first_name: 'Bijan', last_name: 'Robinson', position: 'RB' },
        } };
        routes[MARKET + 'dynasty-2qb-12t-ppr1'] = { status: 200, body: { data: rows } };
        const res = await fetchMarketConsensusData('leaguelogs', 'dynasty', '2', '1', 'false', 12);
        assert.deepEqual(res, {
            formatText: 'DYNASTY - 2QB (PPR)',
            parsed: [
                { name: "Ja'Marr Chase", cleanName: 'jamarrchase', marketVal: 2.2, pos: 'WR' },
                { name: 'Bijan Robinson', cleanName: 'bijanrobinson', marketVal: 1.4, pos: 'RB' },
            ],
        });
        assert.deepEqual(requested, [PLAYERS, MARKET + 'dynasty-2qb-12t-ppr1']);
    });

    test('a market error keeps its "Market Error" wording', async () => {
        routes[PLAYERS] = { status: 200, body: { 1: { player_id: '1' } } }; // in case this test runs on its own
        routes[MARKET + 'redraft-1qb-12t-ppr1'] = { status: 500, body: null };
        await assert.rejects(fetchMarketConsensusData('leaguelogs', 'redraft', '1', '1', 'false', 12), { message: 'Market Error: 500' });
    });
});
