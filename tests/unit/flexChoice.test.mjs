// pickFlexStarter (js/mls/lineup/flexChoice.js, improvements S12): who starts in a FLEX-type slot. The owner's rule:
// FLEX rank, then any rank (ranked over unranked; within a position, the better position rank), then projected points,
// which only decide between positions or between unranked players. Also fillLineup (js/mls/scout/waiverScanner.js),
// the Waiver Wire's copy of the optimizer, which uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestBy, pickFlexStarter, pickForSlot } from '../../js/mls/lineup/flexChoice.js';
import { fillLineup } from '../../js/mls/scout/waiverScanner.js';

const P = (name, pos, posRank = 999, flexRank = 999, proj = null) => ({ name, pos, posRank, flexRank, proj });
const projOf = (p) => p.proj;
const pick = (list) => (pickFlexStarter(list, projOf) || {}).name;

test('a FLEX rank beats everything without one, whatever the projections', () => {
    assert.equal(pick([P('Bourne', 'WR', 55, 999, 30), P('Burden', 'WR', 22, 47, 2), P('Pitts', 'TE', 999, 999, 40)]), 'Burden');
    assert.equal(pick([P('A', 'WR', 10, 60, 30), P('B', 'RB', 30, 50, 1)]), 'B');
});

test('the owner\'s case: Burks WR53 over Bourne WR55 though Bourne projects higher', () => {
    assert.equal(pick([P('Bourne', 'WR', 55, 999, 8.6), P('Burks', 'WR', 53, 999, 3.5)]), 'Burks');
});

test('a ranked player beats an unranked one, even with a far bigger projection', () => {
    assert.equal(pick([P('Pitts', 'TE', 999, 999, 7.7), P('Thomas', 'WR', 56, 999, 6.8)]), 'Thomas');
    assert.equal(pick([P('Pitts', 'TE', 999, 999, 40), P('Fields', 'WR', 60, 999, null)]), 'Fields');
});

test('between positions, the best-ranked at each position by projection', () => {
    // TE24 projects 7.0, the best WR left (WR53) 3.5: the TE. WR55's 8.6 doesn't count: he's behind WR53.
    const field = [P('Gadsden', 'TE', 24, 999, 7.0), P('Burks', 'WR', 53, 999, 3.5), P('Bourne', 'WR', 55, 999, 8.6)];
    assert.equal(pick(field), 'Gadsden');
    // Then, with the TE gone: Burks.
    assert.equal(pick(field.slice(1)), 'Burks');
});

test('projections: a projected player beats an unprojected one; with neither, the better position rank', () => {
    assert.equal(pick([P('A', 'TE', 10, 999, null), P('B', 'WR', 40, 999, 1)]), 'B');
    assert.equal(pick([P('A', 'TE', 10, 999, null), P('B', 'WR', 40, 999, null)]), 'A');
    // Equal projections: the better position rank.
    assert.equal(pick([P('A', 'WR', 40, 999, 5), P('B', 'TE', 10, 999, 5)]), 'B');
});

test('nobody ranked: the higher projection; then the first in the list', () => {
    assert.equal(pick([P('A', 'WR', 999, 999, 3), P('B', 'TE', 999, 999, 9)]), 'B');
    assert.equal(pick([P('A', 'WR'), P('B', 'TE')]), 'A');
});

test('the result does not depend on the list order', () => {
    const field = [P('Gadsden', 'TE', 24, 999, 7.0), P('Burks', 'WR', 53, 999, 3.5), P('Bourne', 'WR', 55, 999, 8.6), P('Pitts', 'TE', 999, 999, 7.7), P('Miller', 'RB', 41, 999, 6.9)];
    const orders = [field, [...field].reverse(), [field[2], field[0], field[4], field[1], field[3]]];
    orders.forEach(o => assert.equal(pick(o), 'Gadsden'));
});

test('empty lists and bestBy', () => {
    assert.equal(pickFlexStarter([], projOf), null);
    assert.equal(bestBy([], (a, b) => a - b), null);
    assert.equal(bestBy([3, 1, 2, 1], (a, b) => a - b), 1);
});

test('fillLineup (the Waiver Wire copy) fills FLEX by the same rule, using each candidate\'s projection', () => {
    const c = (id, pos, posRank, proj) => ({ id, pos, posRank, flexRank: 999, isLocked: false, unavailable: false, proj });
    const pool = [c('wr1', 'WR', 1, 20), c('burks', 'WR', 53, 3.5), c('bourne', 'WR', 55, 8.6), c('pitts', 'TE', 999, 7.7), c('te1', 'TE', 5, 9)];
    const { starters } = fillLineup(['WR', 'TE', 'FLEX'], pool);
    assert.deepEqual(starters.map(s => `${s.slotType}:${s.player && s.player.id}`), ['WR:wr1', 'TE:te1', 'FLEX:burks']);
    // SFLEX after a QB-less pool: a ranked RB/WR/TE by the same rule, never the unranked TE.
    const sflex = fillLineup(['SFLEX'], [c('pitts', 'TE', 999, 30), c('bourne', 'WR', 55, 8.6), c('burks', 'WR', 53, 3.5)]);
    assert.equal(sflex.starters[0].player.id, 'burks');
});

// S12 round 3: SFLEX with nobody ranked used to stay empty; an injured ranked QB used to beat a healthy ranked WR
// (the fallback pass ran inside the QB step). Both through fillLineup, as the waiver tools run it.
test('fillLineup SFLEX: nobody ranked, the higher projection, never an empty slot', () => {
    const c = (id, pos, proj) => ({ id, pos, posRank: 999, flexRank: 999, isLocked: false, unavailable: false, proj });
    const { starters } = fillLineup(['SFLEX'], [c('rb', 'RB', 6), c('te', 'TE', 9), c('qb', 'QB', 15)]);
    assert.equal(starters[0].player && starters[0].player.id, 'qb');
});

test('fillLineup SFLEX: a healthy ranked RB/WR/TE before an unavailable ranked QB', () => {
    const c = (id, pos, posRank, flexRank, unavailable) => ({ id, pos, posRank, flexRank, isLocked: false, unavailable, proj: null });
    const { starters } = fillLineup(['SFLEX'], [c('qbOut', 'QB', 5, 999, true), c('wr', 'WR', 30, 70, false)]);
    assert.equal(starters[0].player.id, 'wr');
    // With nobody healthy, the unavailable QB rather than an empty slot.
    assert.equal(fillLineup(['SFLEX'], [c('qbOut', 'QB', 5, 999, true)]).starters[0].player.id, 'qbOut');
});

test('pickForSlot: strict slots by position rank, flex slots by the FLEX rule, SFLEX QB first', () => {
    const P2 = (name, pos, posRank, flexRank = 999, proj = null) => ({ name, pos, posRank, flexRank, proj });
    const list = [P2('wr9', 'WR', 9, 999, 30), P2('wr4', 'WR', 4, 999, 1), P2('te2', 'TE', 2, 999, 8), P2('qb12', 'QB', 12, 999, 2)];
    const name = (slot) => (pickForSlot(slot, list, projOf) || {}).name;
    assert.equal(name('WR'), 'wr4');
    assert.equal(name('TE'), 'te2');
    assert.equal(name('RB'), undefined);
    assert.equal(name('FLEX'), 'te2');   // leaders wr4 (1) and te2 (8): projection
    assert.equal(name('WRRB'), 'wr4');
    assert.equal(name('SFLEX'), 'qb12'); // a ranked QB first
});
