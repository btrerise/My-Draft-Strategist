// Who to root for across your leagues (improvements S27, js/mls/week/rootFor.js): the groups, the weights and the
// share score, plus which ids count as starters (bench, Best Ball).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAN_AGAINST, LEAN_ROOT, PAID_WEIGHT, buildRootFor, impactsOf, sideOrder, stakesOf, starterIdsOf } from '../../js/mls/week/rootFor.js';

const p = (id, remaining = 10, over = false) => ({ id, remaining, over });
const league = (id, mine, theirs, extra = {}) => ({ id, name: `League ${id}`, paid: false, status: 'swing', chance: null, mine, theirs, ...extra });
const ids = (rows) => rows.map(r => r.id);

test('Root for, Against you and Both sides, from each league\'s starters on both sides', () => {
    const rf = buildRootFor({ leagues: [
        league('A', [p('allen'), p('jj')], [p('chase'), p('kelce')]),
        league('B', [p('allen'), p('jj')], [p('chase'), p('lamar')]),
        league('C', [p('kelce'), p('jj')], [p('allen'), p('nabers')]),
    ] });
    assert.deepEqual(ids(rf.root), ['jj']); // yours in 3, against in none
    assert.deepEqual(ids(rf.against), ['chase']); // theirs in 2, yours in none
    assert.deepEqual(ids(rf.both).sort(), ['allen', 'kelce']);
    // In one league only, on one side: no group (he's still in the window lists).
    assert.equal(rf.players.find(r => r.id === 'lamar').group, null);
    assert.equal(rf.players.find(r => r.id === 'nabers').group, null);
    const allen = rf.players.find(r => r.id === 'allen');
    assert.equal(allen.count, 3);
    assert.deepEqual(allen.yours.map(x => x.leagueId), ['A', 'B']);
    assert.deepEqual(allen.against.map(x => x.leagueId), ['C']);
    // Every league equal (open, no chance, the same share of his side): 2 of 3.
    assert.equal(allen.share, 67);
    assert.equal(rf.players.find(r => r.id === 'kelce').share, 50);
});

test('the share score weighs a paid league 1.5 times', () => {
    const rf = buildRootFor({ leagues: [
        league('A', [p('allen'), p('x')], [p('y'), p('z')], { paid: true }),
        league('B', [p('w'), p('v')], [p('allen'), p('u')]),
    ] });
    const allen = rf.both[0];
    assert.equal(PAID_WEIGHT, 1.5);
    assert.equal(allen.share, 60); // 1.5 / (1.5 + 1)
    assert.equal(allen.yours[0].weight, 0.75); // 1.5 × 1 × 0.5
});

test('stakes: 1 at 50/50, less as the matchup leans one way, 0 once it is decided or done', () => {
    assert.equal(stakesOf({ status: 'swing', chance: 50 }), 1);
    assert.equal(stakesOf({ status: 'swing', chance: 90 }), 0.36);
    assert.equal(stakesOf({ status: 'swing', chance: 10 }), 0.36);
    assert.equal(stakesOf({ status: 'swing', chance: 100 }), 0);
    assert.equal(stakesOf({ status: 'swing', chance: null }), 1); // no chance (Best Ball, week 1, still loading)
    assert.equal(stakesOf({ status: 'none' }), 1); // no opponent
    assert.equal(stakesOf({ status: 'decided', chance: 50 }), 0);
    assert.equal(stakesOf({ status: 'done' }), 0);
    // A close matchup moves the share toward the league where he matters more.
    const rf = buildRootFor({ leagues: [
        league('Close', [p('allen'), p('x')], [p('y'), p('z')], { chance: 50 }),
        league('Lopsided', [p('w'), p('v')], [p('allen'), p('u')], { chance: 90 }),
    ] });
    assert.equal(rf.both[0].share, 74); // 0.5 / (0.5 + 0.36 × 0.5)
});

test('impact: his share of his side\'s projected points still to come; 0 once his game is over', () => {
    const m = impactsOf([p('qb', 20), p('k', 5), p('done', 15, true)]);
    assert.equal(m.get('qb'), 0.8);
    assert.equal(m.get('k'), 0.2);
    assert.equal(m.get('done'), 0);
    // No projection: the average of the known ones; none known: an even share.
    const n = impactsOf([p('a', 10), p('b', null)]);
    assert.equal(n.get('a'), 0.5);
    assert.equal(n.get('b'), 0.5);
    const e = impactsOf([p('a', null), p('b', null), p('c', null, true)]);
    assert.equal(e.get('a'), 0.5);
    assert.equal(e.get('c'), 0);
    // A player with most of his side's points left counts for more in the share score.
    const rf = buildRootFor({ leagues: [
        league('Big', [p('allen', 20), p('k', 5)], [p('y', 10)]),
        league('Small', [p('w', 20), p('v', 15)], [p('allen', 5), p('u', 20)]),
    ] });
    assert.equal(rf.players.find(r => r.id === 'allen').share, 80); // 0.8 / (0.8 + 0.2): mostly yours, so Root for
    assert.equal(rf.root[0].id, 'allen');
});

test('a finished game falls back to paid weights for the share, and finished players sort after the rest', () => {
    const rf = buildRootFor({ leagues: [
        league('A', [p('allen', 0, true), p('jj', 12)], [p('lamar', 0, true)], { paid: true, status: 'done' }),
        league('B', [p('lamar', 0, true), p('jj', 12)], [p('allen', 0, true)]),
        league('C', [p('lamar', 0, true)], [p('allen', 0, true)]),
    ] });
    const allen = rf.players.find(r => r.id === 'allen');
    assert.equal(allen.weight, 0);
    assert.equal(allen.over, true);
    assert.equal(allen.share, 43); // paid only: 1.5 / (1.5 + 1 + 1)
    assert.equal(rf.players.find(r => r.id === 'lamar').share, 57); // 2 / 3.5
    assert.equal(rf.players[0].id, 'jj'); // still to play first
});

test('guillotine and median-only leagues: yours only, never Against you, and named', () => {
    const rf = buildRootFor({ leagues: [
        league('Chop', [p('allen'), p('jj')], [], { noOpponent: true, status: 'none' }),
        league('A', [p('allen')], [p('jj')]),
        league('B', [p('x')], [p('jj')]),
    ] });
    assert.deepEqual(rf.noOpponent, ['League Chop']);
    assert.deepEqual(ids(rf.root), ['allen']); // yours in Chop and A
    const jj = rf.players.find(r => r.id === 'jj');
    // Yours in Chop (half of his side), against in A and B (all of theirs): 0.5 / 2.5 = 20% yours, so Against you.
    assert.equal(jj.share, 20);
    assert.equal(jj.group, 'against');
    assert.equal(jj.lean, true);
    assert.equal(jj.yours[0].stakes, 1);
    assert.equal(jj.yours[0].status, 'none');
    // A guillotine league's own list of theirs is never read.
    const g = buildRootFor({ leagues: [league('Chop', [p('a')], [p('b'), p('c')], { noOpponent: true })] });
    assert.equal(g.players.length, 1);
});

test('the window lists order each side by its own weight', () => {
    const rf = buildRootFor({ leagues: [
        league('A', [p('a', 20), p('b', 5)], [p('c', 10)]),
        league('B', [p('b', 5), p('d', 20)], [p('a', 10)]),
    ] });
    assert.deepEqual(ids(sideOrder(rf.players, 'yours')), ['a', 'd', 'b']);
    assert.deepEqual(ids(sideOrder(rf.players, 'against')), ['a', 'c']);
});

test('starters: the bench never counts, empty slots are dropped, Best Ball counts the lineup it would pick', () => {
    const entry = { starters: ['qb1', 'rb1', '0'], players: ['qb1', 'rb1', 'rb2', 'qb2'], players_points: { qb1: 4, qb2: 30, rb1: 2, rb2: 18 } };
    assert.deepEqual(starterIdsOf(entry), ['qb1', 'rb1']);
    const pos = { qb1: 'QB', qb2: 'QB', rb1: 'RB', rb2: 'RB' };
    const bb = starterIdsOf(entry, { bestBall: true, slots: ['QB', 'RB', 'FLEX'], posOf: id => pos[id] });
    assert.deepEqual(bb.sort(), ['qb2', 'rb1', 'rb2']); // QB qb2 (30), RB rb2 (18), FLEX rb1 (2)
    // Without the slot order (a league not synced since), Sleeper's starters as they stand.
    assert.deepEqual(starterIdsOf(entry, { bestBall: true, slots: null, posOf: id => pos[id] }), ['qb1', 'rb1']);
    assert.deepEqual(starterIdsOf(null), []);
    // In the rule: a benched player is in no list.
    const rf = buildRootFor({ leagues: [league('A', starterIdsOf(entry).map(id => p(id)), [])] });
    assert.ok(!rf.players.some(r => r.id === 'rb2'));
});

test('a player on both sides whose stake leans 75% or more one way goes in that group, marked lean', () => {
    assert.equal(LEAN_ROOT, 75);
    assert.equal(LEAN_AGAINST, 25);
    const mine = (n) => Array.from({ length: n }, (_, i) => league(`m${i}`, [p('dk'), p(`x${i}`)], [p(`y${i}`)]));
    const theirs = (n) => Array.from({ length: n }, (_, i) => league(`t${i}`, [p(`w${i}`)], [p('dk'), p(`z${i}`)]));
    // 3 of 4 yours, equal weights: exactly 75%, Root for.
    let rf = buildRootFor({ leagues: [...mine(3), ...theirs(1)] });
    assert.equal(rf.players.find(r => r.id === 'dk').share, 75);
    assert.deepEqual(rf.root.map(r => r.id), ['dk']);
    assert.equal(rf.root[0].lean, true);
    assert.equal(rf.both.length, 0);
    // 1 of 4: 25%, Against you.
    rf = buildRootFor({ leagues: [...mine(1), ...theirs(3)] });
    assert.deepEqual(rf.against.map(r => r.id), ['dk']);
    // 2 of 3: 67%, still Both sides, not lean.
    rf = buildRootFor({ leagues: [...mine(2), ...theirs(1)] });
    assert.deepEqual(rf.both.map(r => r.id), ['dk']);
    assert.equal(rf.both[0].lean, false);
    // A player only on your side is never lean.
    assert.equal(rf.players.find(r => r.id === 'x0').lean, false);
});
