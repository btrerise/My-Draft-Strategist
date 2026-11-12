// Power Rankings: what a past trade did (improvements S29): js/mls/power/pastTrades.js, the undo rule that rebuilds a
// league as it was before and after a move from Sleeper's transactions, and the ranks it compares.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadPower } from './helpers/powerEnv.mjs';
import {
    completedMoves, defaultTradeId, leaguesAroundMove, makeOwnerOf, rankChanges, tradeEntries, undoMove, undoPicks, yourTrades
} from '../../js/mls/power/pastTrades.js';
import { leagueAfterTrade } from '../../js/mls/trade/lineupImpact.js';

const { computePositionalPower } = await loadPower();

// Player ids -> players: id "p_x" is clean name "x".
const POS = { qb1: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', te1: 'TE', qbR: 'QB', rbR: 'RB', rbR2: 'RB', wrR: 'WR', wrR2: 'WR', teR: 'TE', fa1: 'RB', fa2: 'WR' };
const playerOf = (pid) => { const c = pid.replace(/^p_/, ''); return POS[c] ? { cleanName: c, name: c.toUpperCase(), pos: POS[c] } : null; };
const ownerOf = (r) => ({ 1: 'You', 2: 'Rival', 3: 'Third' })[r] || null;
const deps = { ownerOf, playerOf };
const state = (rosterMap, picks = null) => ({ rosterMap, posMap: Object.fromEntries(Object.keys(rosterMap).map(c => [c, POS[c]])), picks });

let t = 1000;
const tx = (type, { adds = null, drops = null, picks = [], rosters = [1], status = 'complete', id } = {}) =>
    ({ transaction_id: id || String(++t), type, status, adds, drops, draft_picks: picks, roster_ids: rosters, status_updated: ++t, leg: 3 });

describe('undoMove', () => {
    test('a trade: each player goes back to the team that gave him', () => {
        const now = state({ rbR: 'You', wr1: 'Rival', wr2: 'You' });
        const trade = tx('trade', { adds: { p_rbR: 1, p_wr1: 2 }, drops: { p_rbR: 2, p_wr1: 1 }, rosters: [1, 2] });
        const was = undoMove(now, trade, deps);
        assert.deepEqual(was.rosterMap, { rbR: 'Rival', wr1: 'You', wr2: 'You' });
        assert.equal(now.rosterMap.rbR, 'You', 'the state passed in is untouched');
    });
    test('a waiver claim with a drop: the claimed player off every roster, the dropped one back', () => {
        const now = state({ fa1: 'You', wr2: 'You' });
        const was = undoMove(now, tx('waiver', { adds: { p_fa1: 1 }, drops: { p_rb2: 1 } }), deps);
        assert.deepEqual(was.rosterMap, { wr2: 'You', rb2: 'You' });
        assert.equal(was.posMap.rb2, 'RB', 'a player back on a roster gets his position');
    });
    test('a free-agent add alone, and a drop alone', () => {
        const now = state({ fa2: 'Rival', wr2: 'You' });
        assert.deepEqual(undoMove(now, tx('free_agent', { adds: { p_fa2: 2 } }), deps).rosterMap, { wr2: 'You' });
        assert.deepEqual(undoMove(now, tx('free_agent', { drops: { p_te1: 1 } }), deps).rosterMap, { fa2: 'Rival', wr2: 'You', te1: 'You' });
    });
    test('a commissioner move reads like any other', () => {
        const now = state({ teR: 'You' });
        const was = undoMove(now, tx('commissioner', { adds: { p_teR: 1 }, drops: { p_teR: 2 } }), deps);
        assert.deepEqual(was.rosterMap, { teR: 'Rival' });
    });
    test('a player the lookups don\'t know, or a team they can\'t name, is skipped or left off', () => {
        const now = state({ wr2: 'You' });
        assert.deepEqual(undoMove(now, tx('waiver', { adds: { p_nobody: 1 } }), deps).rosterMap, { wr2: 'You' });
        assert.deepEqual(undoMove(now, tx('trade', { adds: { p_wr2: 1 }, drops: { p_wr2: 9 } }), deps).rosterMap, {});
    });
});

describe('undoPicks', () => {
    const picks = () => ({
        You: [{ name: '2027 1st', season: 2027, round: 1, from: null }, { name: '2027 1st', season: 2027, round: 1, from: 'Rival' }],
        Rival: [{ name: '2027 2nd', season: 2027, round: 2, from: null }],
    });
    test('a traded pick goes back to its previous owner, matched by its original team', () => {
        const out = undoPicks(picks(), [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }], deps);
        assert.deepEqual(out.You, [{ name: '2027 1st', season: 2027, round: 1, from: null }]);
        assert.deepEqual(out.Rival.map(p => [p.name, p.from]), [['2027 1st', null], ['2027 2nd', null]]);
    });
    test('a pick passed on twice goes back one step, still marked as the original team\'s', () => {
        const p = { You: [], Rival: [], Third: [{ name: '2027 1st', season: 2027, round: 1, from: 'Rival' }] };
        const out = undoPicks(p, [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 1, owner_id: 3 }], deps);
        assert.deepEqual(out.You, [{ name: '2027 1st', season: 2027, round: 1, from: 'Rival' }]);
        assert.deepEqual(out.Third, []);
    });
    test('a pick the list doesn\'t have (a draft already held) is skipped; no picks, no change', () => {
        const p = picks();
        assert.deepEqual(undoPicks(p, [{ season: '2025', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }], deps), p);
        assert.equal(undoPicks(null, [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }], deps), null);
    });
    test('a trade undoes its picks with its players', () => {
        const was = undoMove(state({ rbR: 'You' }, picks()), tx('trade', {
            adds: { p_rbR: 1 }, drops: { p_rbR: 2 }, rosters: [1, 2],
            picks: [{ season: '2027', round: 2, roster_id: 2, previous_owner_id: 1, owner_id: 2 }],
        }), deps);
        assert.equal(was.rosterMap.rbR, 'Rival');
        assert.ok(was.picks.You.some(p => p.name === '2027 2nd'));
        assert.ok(!was.picks.Rival.some(p => p.name === '2027 2nd'));
    });
});

describe('completedMoves and leaguesAroundMove', () => {
    test('failed claims are dropped, duplicates kept once, newest first', () => {
        const a = { transaction_id: 'a', status: 'complete', status_updated: 5 };
        const b = { transaction_id: 'b', status: 'failed', status_updated: 9 };
        const c = { transaction_id: 'c', status: 'complete', created: 7 };
        assert.deepEqual(completedMoves([[a, b], [c, a]]).map(x => x.transaction_id), ['c', 'a']);
        assert.deepEqual(completedMoves([null, 'x']), []);
    });

    test('several moves undone newest first, including a player since dropped again', () => {
        // Today: you traded wr1 for rbR (oldest), then dropped rbR for fa1 (newest). rbR is on nobody's roster now.
        const league = { globalRosterMap: { fa1: 'You', wr2: 'You', wr1: 'Rival' }, globalPosMap: { fa1: 'RB', wr2: 'WR', wr1: 'WR' } };
        const trade = tx('trade', { id: 'T', adds: { p_rbR: 1, p_wr1: 2 }, drops: { p_rbR: 2, p_wr1: 1 }, rosters: [1, 2] });
        const pickup = tx('free_agent', { id: 'F', adds: { p_fa1: 1 }, drops: { p_rbR: 1 } });
        const moves = completedMoves([[trade], [pickup]]);
        assert.deepEqual(moves.map(m => m.transaction_id), ['F', 'T']);
        const { before, after } = leaguesAroundMove(league, moves, 'T', deps);
        assert.deepEqual(after.globalRosterMap, { wr2: 'You', wr1: 'Rival', rbR: 'You' }, 'right after the trade: rbR is yours, fa1 not yet');
        assert.deepEqual(before.globalRosterMap, { wr2: 'You', wr1: 'You', rbR: 'Rival' });
        assert.equal(after.globalPosMap.rbR, 'RB');
        assert.equal(leaguesAroundMove(league, moves, 'nope', deps), null);
        // The newest move needs nothing undone for "after": that's today's league.
        assert.deepEqual(leaguesAroundMove(league, moves, 'F', deps).after.globalRosterMap, league.globalRosterMap);
    });

    test('scored before and after, the ranks equal the Trade Analyzer\'s for the same trade before it happened', () => {
        const players = [
            ['qb1', 'QB', 'You', 10], ['rb1', 'RB', 'You', 25], ['rb2', 'RB', 'You', 30], ['wr1', 'WR', 'You', 3], ['wr2', 'WR', 'You', 12], ['te1', 'TE', 'You', 15],
            ['qbR', 'QB', 'Rival', 5], ['rbR', 'RB', 'Rival', 4], ['rbR2', 'RB', 'Rival', 18], ['wrR', 'WR', 'Rival', 20], ['wrR2', 'WR', 'Rival', 22], ['teR', 'TE', 'Rival', 9],
        ];
        const rankings = players.map(([c, , , rank]) => ({ cleanName: c, name: c, rank }));
        const was = { globalRosterMap: {}, globalPosMap: {}, reqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 } };
        players.forEach(([c, pos, o]) => { was.globalRosterMap[c] = o; was.globalPosMap[c] = pos; });
        // The Trade Analyzer, before: you get rbR for wr1.
        const analyzer = leagueAfterTrade(was, ['wr1'], [{ cleanName: 'rbR', pos: 'RB' }], 'Rival');
        // Sleeper, after: today's league is the analyzer's "after"; the transaction undoes it.
        const today = { ...was, globalRosterMap: analyzer.globalRosterMap };
        const trade = tx('trade', { id: 'T2', adds: { p_rbR: 1, p_wr1: 2 }, drops: { p_rbR: 2, p_wr1: 1 }, rosters: [1, 2] });
        const { before, after } = leaguesAroundMove(today, completedMoves([[trade]]), 'T2', deps);
        const score = (l) => computePositionalPower(l, rankings).find(x => x.owner === 'You');
        const cols = ['starterRank', 'overallRank', 'qbRank', 'rbRank', 'wrRank', 'teRank'];
        const pick = (team) => Object.fromEntries(cols.map(k => [k, team[k]]));
        assert.deepEqual(pick(score(before)), pick(score(was)));
        assert.deepEqual(pick(score(after)), pick(score(analyzer)));
        const changes = rankChanges(score(before), score(after));
        assert.ok(changes.some(c => c.label === 'RB' && c.to < c.from), 'the RB room improves');
        assert.ok(changes.some(c => c.label === 'WR' && c.to > c.from), 'the WR room drops');
    });
});

describe('tradeEntries, defaultTradeId, rankChanges, makeOwnerOf', () => {
    const mine = tx('trade', { id: 'M', adds: { p_rbR: 1, p_wr1: 2 }, drops: { p_rbR: 2, p_wr1: 1 }, rosters: [2, 1],
        picks: [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }] });
    const theirs = tx('trade', { id: 'O', adds: { p_teR: 3 }, drops: { p_teR: 2 }, rosters: [2, 3] });
    const waiver = tx('waiver', { adds: { p_fa1: 1 } });
    const entries = tradeEntries(completedMoves([[mine, waiver, theirs]]), deps);

    test('trades only, newest first, you first, what each team got', () => {
        assert.deepEqual(entries.map(e => e.id), ['O', 'M']);
        const m = entries[1];
        assert.deepEqual(m.teams, ['You', 'Rival']);
        assert.deepEqual(m.gets, { You: ['RBR', '2027 1st'], Rival: ['WR1'] });
        assert.equal(m.mine, true);
        assert.equal(entries[0].mine, false);
    });
    test('yourTrades keeps only trades you were in (owner, round 3)', () => {
        assert.deepEqual(yourTrades(entries).map(e => e.id), ['M']);
        assert.deepEqual(yourTrades([]), []);
    });
    test('the line opens on your newest trade, else the league\'s newest, else what you picked', () => {
        assert.equal(defaultTradeId(entries), 'M');
        assert.equal(defaultTradeId(entries, 'O'), 'O');
        assert.equal(defaultTradeId(entries, 'gone'), 'M');
        assert.equal(defaultTradeId([entries[0]]), 'O');
        assert.equal(defaultTradeId([]), null);
    });
    test('rankChanges lists only what moved, Future when both sides have it', () => {
        const b = { starterRank: 6, overallRank: 4, qbRank: 2, rbRank: 9, wrRank: 3, teRank: 1, futureRank: 4 };
        const a = { ...b, starterRank: 3, rbRank: 4, futureRank: 6 };
        assert.deepEqual(rankChanges(b, a), [{ label: 'Start', from: 6, to: 3 }, { label: 'RB', from: 9, to: 4 }, { label: 'Future', from: 4, to: 6 }]);
        assert.deepEqual(rankChanges({ ...b, futureRank: undefined }, a).map(c => c.label), ['Start', 'RB']);
        assert.deepEqual(rankChanges(b, b), []);
    });
    test('makeOwnerOf names teams as the sync does', () => {
        const o = makeOwnerOf({ rosterId: 1, teamNames: { 1: 'mds_test', 2: 'Rival', 3: 'Team 3' }, globalRosterMap: { a: 'You', b: 'Rival', c: 'Unknown Team' } });
        assert.equal(o(1), 'You');
        assert.equal(o('2'), 'Rival');
        assert.equal(o(3), 'Unknown Team');
        assert.equal(o(null), null);
        assert.equal(makeOwnerOf({ rosterId: 1, teamNames: { 2: 'Gone' }, globalRosterMap: { a: 'You' } })(2), null);
    });
});
