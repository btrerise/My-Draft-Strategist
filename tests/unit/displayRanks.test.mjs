// js/mls/rankings/displayRanks.js (improvements F6): the position and FLEX ranks the Lineup and Roster tabs (and
// Trade Finder's Positional Rank basis) show. Which file shapes count as the single-file fallback, and that
// everything else keeps its own numbers. displayRanks.js imports scout/waivers.js, which pulls in the whole
// page, so a module-resolution hook (as in helpers/playersEnv.mjs) answers that one import with a stub: league
// positions from globalPosMap, and a Sleeper player map that loads when the test says so.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const stub = (code) => 'data:text/javascript,' + encodeURIComponent(code);
const WAIVERS_STUB = stub(`
const env = globalThis.__displayRanksEnv;
export const sleeperMetaByNameIfLoaded = () => env.meta;
export const getSleeperMetaByName = () => { env.metaCalls++; return env.metaPromise; };
export const makeLeagueGetPos = (league, meta) => (clean) =>
    (league.globalPosMap && league.globalPosMap[clean]) || (meta && meta[clean] && meta[clean].pos) || 'UNK';
`);
register(stub(`
export async function resolve(specifier, context, next) {
    if (specifier === '../scout/waivers.js' && context.parentURL && /\\/js\\/mls\\/rankings\\/displayRanks\\.js$/.test(context.parentURL)) {
        return { url: ${JSON.stringify(WAIVERS_STUB)}, shortCircuit: true };
    }
    return next(specifier, context);
}
`));

const env = globalThis.__displayRanksEnv = { meta: null, metaCalls: 0, metaPromise: new Promise(() => {}) };
const { singleFileFallback, leagueRankDisplayIndex, displayRanksFor } = await import('../../js/mls/rankings/displayRanks.js');

// [name, pos] in overall order: QB1 at #2, RB3 (Henry) at #5.
const PLAYERS = [['Bijan', 'RB'], ['Allen', 'QB'], ['Gibbs', 'RB'], ['Chase', 'WR'], ['Henry', 'RB'], ['Bowers', 'TE'], ['Tucker', 'K']];
const POS = Object.fromEntries(PLAYERS);
const row = (name, f) => ({ name, cleanName: name.toLowerCase(), ...f });
// A single file without a Pos Rank column: the parser's fallback writes the overall rank everywhere.
const singleFile = () => PLAYERS.map(([n], i) => row(n, { rank: i + 1, tier: 1 + Math.floor(i / 3), posRank: i + 1, posTier: 1 + Math.floor(i / 3), flexRank: i + 1, flexTier: 1 + Math.floor(i / 3) }));
const league = { globalPosMap: Object.fromEntries(PLAYERS.map(([n, p]) => [n.toLowerCase(), p])), roster: [] };

describe('singleFileFallback', () => {
    it('a single file without a Pos Rank column: positions and FLEX', () => {
        assert.deepEqual(singleFileFallback(singleFile()), { positions: true, flex: true });
    });
    it('a Pos Rank column: FLEX only (its FLEX rank is still the overall one)', () => {
        const seen = {};
        const data = singleFile().map(r => { const p = POS[r.name]; seen[p] = (seen[p] || 0) + 1; return { ...r, posRank: seen[p], posTier: null }; });
        assert.deepEqual(singleFileFallback(data), { positions: false, flex: true });
    });
    it('per-position uploads without a FLEX file: neither (rank equals posRank, no FLEX rank)', () => {
        const data = [row('Allen', { rank: 1, posRank: 1, flexRank: 999 }), row('Bijan', { rank: 1, posRank: 1, flexRank: 999 }), row('Henry', { rank: 3, posRank: 3, flexRank: 999 })];
        assert.deepEqual(singleFileFallback(data), { positions: false, flex: false });
    });
    it('per-position uploads with a FLEX file, or a horizontal sheet with a FLEX column: neither', () => {
        const data = [row('Allen', { rank: 1, posRank: 1, flexRank: 999 }), row('Bijan', { rank: 1, posRank: 1, flexRank: 1 }), row('Henry', { rank: 4, posRank: 3, flexRank: 4 })];
        assert.deepEqual(singleFileFallback(data), { positions: false, flex: false });
    });
    it('no rankings', () => {
        assert.deepEqual(singleFileFallback([]), { positions: false, flex: false });
        assert.deepEqual(singleFileFallback(null), { positions: false, flex: false });
    });
});

describe('leagueRankDisplayIndex and displayRanksFor', () => {
    it('a single file: position and FLEX ranks per group, with the overall tier', () => {
        const data = singleFile();
        const idx = leagueRankDisplayIndex(league, data);
        const henry = data.find(r => r.name === 'Henry');
        assert.deepEqual(displayRanksFor(idx, 'henry', henry), { posRank: 3, posTier: 2, flexRank: 4, flexTier: 2 });
        // A QB has no FLEX rank to show.
        assert.equal(displayRanksFor(idx, 'allen', data[1]).posRank, 1);
        assert.equal(displayRanksFor(idx, 'allen', data[1]).flexRank, 999);
        // The player objects aren't touched: they're the optimizer's inputs.
        assert.equal(henry.posRank, 5);
    });
    it('a Pos Rank column keeps its position ranks and derives FLEX', () => {
        const data = singleFile().map(r => ({ ...r, posRank: r.name === 'Henry' ? 9 : r.posRank, posTier: null }));
        const idx = leagueRankDisplayIndex(league, data);
        const henry = data.find(r => r.name === 'Henry');
        assert.deepEqual(displayRanksFor(idx, 'henry', { ...henry, posTier: 2 }), { posRank: 9, posTier: 2, flexRank: 4, flexTier: 2 });
    });
    it('files with their own ranks: no index, raw numbers', () => {
        const data = [row('Allen', { rank: 2, posRank: 2, flexRank: 999 }), row('Henry', { rank: 10, posRank: 10, flexRank: 999 })];
        assert.equal(leagueRankDisplayIndex(league, data), null);
        assert.deepEqual(displayRanksFor(null, 'henry', { posRank: 10, posTier: 3, flexRank: 999, flexTier: null }), { posRank: 10, posTier: 3, flexRank: 999, flexTier: null });
    });
    it('the roster\'s own position stands in where the league and Sleeper don\'t know one', () => {
        const data = singleFile();
        const noHenry = { globalPosMap: { ...league.globalPosMap, henry: undefined }, roster: [] };
        const raw = data.find(r => r.name === 'Henry');
        // Unknown position: his raw numbers, as before.
        assert.equal(displayRanksFor(leagueRankDisplayIndex(noHenry, data), 'henry', raw).posRank, 5);
        const withRoster = { ...noHenry, roster: [{ cleanName: 'henry', pos: 'RB' }] };
        assert.equal(displayRanksFor(leagueRankDisplayIndex(withRoster, data), 'henry', raw).posRank, 3);
    });
    it('positions from Sleeper\'s player map once it has loaded; one re-render while waiting for it', async () => {
        const data = singleFile();
        // Gibbs (RB2, ahead of Henry) is a free agent the league doesn't know.
        const partial = { globalPosMap: { ...league.globalPosMap, gibbs: undefined }, roster: [] };
        let resolve;
        env.metaPromise = new Promise(r => { resolve = r; });
        env.metaCalls = 0;
        let renders = 0;
        const rerender = () => { renders++; };
        const henry = data.find(r => r.name === 'Henry');
        assert.equal(displayRanksFor(leagueRankDisplayIndex(partial, data, rerender), 'henry', henry).posRank, 2);
        leagueRankDisplayIndex(partial, data, rerender);
        assert.equal(env.metaCalls, 1, 'one wait per render function');
        env.meta = { gibbs: { pos: 'RB' } };
        resolve(env.meta);
        await env.metaPromise;
        await new Promise(r => setTimeout(r, 0));
        assert.equal(renders, 1);
        assert.equal(displayRanksFor(leagueRankDisplayIndex(partial, data, rerender), 'henry', henry).posRank, 3);
        assert.equal(env.metaCalls, 1, 'no wait once loaded');
        env.meta = null;
    });
});
