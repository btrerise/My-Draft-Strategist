// js/shared/api/market.js: fetchMarketConsensusData (Lineup Strategist's Market Consensus).
// Refactor 7A removed LeagueLogs (its API answers 410), so FantasyCalc is the only source;
// the LeagueLogs cases that 2C wrote here went with it. window.mdsFetch is a stub that answers
// from a URL -> response table.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as market from '../../js/shared/api/market.js';
import { fetchMarketConsensusData } from '../../js/shared/api/market.js';

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

const FC = 'https://api.fantasycalc.com/values/current';

beforeEach(() => { routes = {}; requested.length = 0; });

describe('fetchMarketConsensusData, FantasyCalc', () => {
    test('normalizes FantasyCalc rows and passes the settings through', async () => {
        routes[`${FC}?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5&isTEP=true`] = { status: 200, body: [
            { player: { name: "Ja'Marr Chase", position: 'WR' }, overallRank: 2 },
            { player: { name: 'Bijan Robinson', position: 'RB' }, overallRank: '1' },
            { player: { name: 'No Rank' }, overallRank: null },
            { player: {}, overallRank: 3 },
        ] };
        const res = await fetchMarketConsensusData('fantasycalc', 'dynasty', '2', '0.5', 'true', 10);
        assert.deepEqual(res, {
            formatText: 'DYNASTY (Superflex, PPR: 0.5)',
            parsed: [
                { name: "Ja'Marr Chase", cleanName: 'jamarrchase', marketVal: 2, pos: 'WR' },
                { name: 'Bijan Robinson', cleanName: 'bijanrobinson', marketVal: 1, pos: 'RB' },
            ],
        });
        assert.equal(requested.length, 1);
    });

    test('a FantasyCalc error keeps its wording', async () => {
        routes[`${FC}?isDynasty=false&numQbs=1&numTeams=12&ppr=1&isTEP=false`] = { status: 500, body: null };
        await assert.rejects(fetchMarketConsensusData('fantasycalc', 'redraft', '1', '1', 'false', 12), { message: 'FantasyCalc API Error: 500' });
    });
});

describe('LeagueLogs is gone (refactor 7A)', () => {
    test("'leaguelogs' is rejected without a request", async () => {
        await assert.rejects(fetchMarketConsensusData('leaguelogs', 'redraft', '1', '1', 'false', 12), { message: 'Unknown market source "leaguelogs".' });
        assert.deepEqual(requested, []);
    });

    test('fetchLeagueLogsMarket is no longer exported', () => {
        assert.deepEqual(Object.keys(market), ['fetchMarketConsensusData']);
    });
});
