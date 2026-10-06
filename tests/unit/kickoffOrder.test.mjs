// FLEX Kickoff Optimization (js/mls/lineup/kickoffOrder.js, improvements F1). Before F1 the step
// lived in js/mls/render/lineup.js and skipped SFLEX (and W/T, W/R) entirely. The toggle being off
// skips the call in optimizeLineup; tests/mls-sflex-kickoff.spec.mjs covers that end to end.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { optimizeFlexKickoffOrder } from '../../js/mls/lineup/kickoffOrder.js';
import { SLOT_POSITIONS } from '../../js/mls/constants.js';

const ONE_PM = Date.parse('2026-09-20T17:00:00Z');
const FOUR_25 = Date.parse('2026-09-20T20:25:00Z');
const SNF = Date.parse('2026-09-21T00:20:00Z');
const MNF = Date.parse('2026-09-22T00:15:00Z');

// A lineup from [slot, name, pos, kickoff ms or undefined, locked?] rows. Each player gets their own
// team code, so kickoffs map one to one.
function lineup(rows) {
    const times = {};
    const starters = rows.map(([slot, name, pos, ms, isLocked], i) => {
        if (!name) return { slot, player: null };
        const team = `T${i}`;
        if (ms !== undefined) times[team] = new Date(ms).toISOString();
        return { slot, player: { id: name, name, pos, team, isLocked: !!isLocked } };
    });
    return { starters, times };
}
const kickoffFrom = (times) => (p) => (times[p.team] ? new Date(times[p.team]).getTime() : NaN);
const relabel = ({ starters, times }) => { optimizeFlexKickoffOrder(starters, kickoffFrom(times)); return starters; };
const slots = (starters) => starters.map(s => `${s.slot} ${s.player ? s.player.name : '-'}`);

// The function as it was on main before F1 (render/lineup.js), with State.gameTimesByTeam passed in.
function mainOptimizeFlexKickoffOrder(starters, gameTimesByTeam) {
    const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
    const byPos = { RB: [], WR: [], TE: [] };
    const strictSlotCount = { RB: 0, WR: 0, TE: 0 };
    starters.forEach((s, idx) => {
        const slotType = s.slot.replace(/[0-9]/g, '');
        if (s.player && s.player.isLocked) return;
        if (FLEX_POSITIONS.includes(slotType)) strictSlotCount[slotType]++;
        if (!s.player) return;
        if (slotType !== 'FLEX' && !FLEX_POSITIONS.includes(slotType)) return;
        if (!FLEX_POSITIONS.includes(s.player.pos)) return;
        byPos[s.player.pos].push(idx);
    });
    const getKickoffMs = (idx) => {
        const p = starters[idx].player;
        const iso = p && p.team ? gameTimesByTeam[p.team] : null;
        const ms = iso ? new Date(iso).getTime() : NaN;
        return isNaN(ms) ? Infinity : ms;
    };
    FLEX_POSITIONS.forEach(pos => { byPos[pos].sort((a, b) => getKickoffMs(a) - getKickoffMs(b)); });
    const strictAssignees = {};
    let flexAssignees = [];
    FLEX_POSITIONS.forEach(pos => {
        const indices = byPos[pos];
        strictAssignees[pos] = indices.slice(0, strictSlotCount[pos]).map(i => starters[i].player);
        flexAssignees.push(...indices.slice(strictSlotCount[pos]).map(i => starters[i].player));
    });
    flexAssignees.sort((a, b) => {
        const aMs = a.team && gameTimesByTeam[a.team] ? new Date(gameTimesByTeam[a.team]).getTime() : NaN;
        const bMs = b.team && gameTimesByTeam[b.team] ? new Date(gameTimesByTeam[b.team]).getTime() : NaN;
        return (isNaN(aMs) ? Infinity : aMs) - (isNaN(bMs) ? Infinity : bMs) || 0;
    });
    const cursors = { RB: 0, WR: 0, TE: 0, FLEX: 0 };
    starters.forEach(s => {
        if (!s.player) return;
        if (s.player.isLocked) return;
        const slotType = s.slot.replace(/[0-9]/g, '');
        if (FLEX_POSITIONS.includes(slotType)) {
            const newPlayer = strictAssignees[slotType][cursors[slotType]++];
            if (newPlayer) s.player = newPlayer;
        } else if (slotType === 'FLEX') {
            const newPlayer = flexAssignees[cursors.FLEX++];
            if (newPlayer) s.player = newPlayer;
        }
    });
}

// Seeded generator, so a failure names a reproducible case.
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const KICKOFFS = [ONE_PM, ONE_PM, FOUR_25, SNF, MNF, undefined];

// A random lineup in fill order: strict slots hold their own position, flex slots any position they
// accept. `small` keeps it to at most 9 movable starters, for the brute-force check.
function randomLineup(r, { sflex = 0, wrte = 0, wrrb = 0, lockRate = 0.1, small = false, qbs = 1 } = {}) {
    const rows = [];
    let n = 0;
    const add = (slotType, count) => {
        for (let i = 0; i < count; i++) {
            const pos = pick(r, SLOT_POSITIONS[slotType]);
            rows.push([`${slotType}${i + 1}`, `P${n++}`, pos, pick(r, KICKOFFS), r() < lockRate]);
        }
    };
    const upTo = (max) => Math.floor(r() * (small ? Math.min(max, 2) : max));
    add('QB', qbs); add('RB', 1 + upTo(3)); add('WR', 1 + upTo(3)); add('TE', 1 + upTo(2));
    add('WRRB', wrrb); add('WRTE', wrte); add('FLEX', upTo(4)); add('SFLEX', sflex);
    rows.push(['K1', `P${n++}`, 'K', ONE_PM]); rows.push(['DEF1', `P${n++}`, 'DEF', ONE_PM]);
    return lineup(rows);
}

// Every valid way to seat the unlocked players of `starters` (brute force, for small lineups).
function allSeatings(starters) {
    const open = starters.map((s, i) => i).filter(i => starters[i].player && !starters[i].player.isLocked && SLOT_POSITIONS[starters[i].slot.replace(/[0-9]/g, '')]);
    const players = open.map(i => starters[i].player);
    const out = [];
    const walk = (k, used, seat) => {
        if (k === open.length) { out.push(seat.slice()); return; }
        const slotType = starters[open[k]].slot.replace(/[0-9]/g, '');
        players.forEach((p, j) => {
            if (used[j] || !SLOT_POSITIONS[slotType].includes(p.pos)) return;
            used[j] = true; seat.push(p); walk(k + 1, used, seat); seat.pop(); used[j] = false;
        });
    };
    walk(0, [], []);
    return { open, seatings: out };
}

describe('superflex', () => {
    test('a QB who plays later than the QB-slot QB moves to SFLEX', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', ONE_PM],
            ['TE1', 'Bowers', 'TE', FOUR_25], ['FLEX1', 'Lamb', 'WR', FOUR_25], ['SFLEX1', 'Hurts', 'QB', ONE_PM],
            ['K1', 'Tucker', 'K', ONE_PM], ['DEF1', 'BAL', 'DEF', ONE_PM],
        ]));
        assert.deepEqual(slots(out), ['QB1 Hurts', 'RB1 Gibbs', 'WR1 Chase', 'TE1 Bowers', 'FLEX1 Lamb', 'SFLEX1 Allen', 'K1 Tucker', 'DEF1 BAL']);
    });

    test('SFLEX must keep a QB when two QBs start, even if a FLEX player plays later', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Gibbs', 'RB', ONE_PM], ['FLEX1', 'Chase', 'WR', MNF], ['SFLEX1', 'Hurts', 'QB', ONE_PM],
        ]));
        assert.deepEqual(slots(out), ['QB1 Hurts', 'RB1 Gibbs', 'FLEX1 Chase', 'SFLEX1 Allen']);
    });

    test('an RB/WR/TE in SFLEX trades with a later strict or FLEX starter; FLEX gets the next latest', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', ONE_PM], ['RB1', 'Gibbs', 'RB', ONE_PM], ['RB2', 'Henry', 'RB', MNF],
            ['WR1', 'Chase', 'WR', SNF], ['WR2', 'Jefferson', 'WR', ONE_PM], ['TE1', 'Bowers', 'TE', ONE_PM],
            ['FLEX1', 'Lamb', 'WR', FOUR_25], ['SFLEX1', 'Nacua', 'WR', ONE_PM],
        ]));
        // Chase (Sunday night) takes SFLEX. Henry (Monday) can't: the two RB slots need both RBs.
        // FLEX gets the next latest, Lamb (4:25); Nacua drops to WR2.
        assert.deepEqual(slots(out), [
            'QB1 Allen', 'RB1 Gibbs', 'RB2 Henry', 'WR1 Jefferson', 'WR2 Nacua', 'TE1 Bowers', 'FLEX1 Lamb', 'SFLEX1 Chase',
        ]);
    });

    test('two SFLEX slots hold the two latest eligible starters, earliest on top', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', ONE_PM], ['RB1', 'Gibbs', 'RB', ONE_PM], ['RB2', 'Henry', 'RB', ONE_PM],
            ['WR1', 'Chase', 'WR', MNF], ['TE1', 'Bowers', 'TE', ONE_PM], ['FLEX1', 'Lamb', 'WR', FOUR_25],
            ['SFLEX1', 'Hurts', 'QB', SNF], ['SFLEX2', 'Nacua', 'WR', ONE_PM],
        ]));
        // SFLEX takes Chase (Monday) and Hurts (Sunday night); FLEX the next latest, Lamb (4:25);
        // Nacua drops to WR1.
        assert.deepEqual(slots(out), [
            'QB1 Allen', 'RB1 Gibbs', 'RB2 Henry', 'WR1 Nacua', 'TE1 Bowers', 'FLEX1 Lamb', 'SFLEX1 Hurts', 'SFLEX2 Chase',
        ]);
    });

    test('two SFLEX slots with three QBs: the QB slot gets the earliest QB', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', MNF], ['RB1', 'Gibbs', 'RB', SNF], ['FLEX1', 'Lamb', 'WR', ONE_PM],
            ['SFLEX1', 'Hurts', 'QB', ONE_PM], ['SFLEX2', 'Burrow', 'QB', FOUR_25],
        ]));
        assert.deepEqual(slots(out), ['QB1 Hurts', 'RB1 Gibbs', 'FLEX1 Lamb', 'SFLEX1 Burrow', 'SFLEX2 Allen']);
    });

    test('a locked player in SFLEX stays there; everyone else still relabels', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', MNF],
            ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', ONE_PM, true],
        ]));
        // Hurts is locked, so Allen keeps the QB slot even though he plays later; FLEX still gets
        // the later WR.
        assert.deepEqual(slots(out), ['QB1 Allen', 'RB1 Gibbs', 'WR1 Lamb', 'FLEX1 Chase', 'SFLEX1 Hurts']);
    });

    test('a locked QB in the QB slot keeps SFLEX out of reach for the other QB', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', ONE_PM, true], ['RB1', 'Gibbs', 'RB', MNF], ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', SNF],
        ]));
        assert.deepEqual(slots(out), ['QB1 Allen', 'RB1 Gibbs', 'FLEX1 Lamb', 'SFLEX1 Hurts']);
    });

    test('a starter with no kickoff time counts as latest', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', undefined], ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', MNF],
            ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', SNF],
        ]));
        assert.deepEqual(slots(out), ['QB1 Hurts', 'RB1 Gibbs', 'WR1 Lamb', 'FLEX1 Chase', 'SFLEX1 Allen']);
    });

    test('no kickoff data at all leaves the fill alone', () => {
        const data = lineup([
            ['QB1', 'Allen', 'QB'], ['RB1', 'Gibbs', 'RB'], ['WR1', 'Chase', 'WR'], ['WR2', 'Lamb', 'WR'],
            ['WRRB1', 'Henry', 'RB'], ['WRTE1', 'Nacua', 'WR'], ['FLEX1', 'Bowers', 'TE'], ['SFLEX1', 'Hurts', 'QB'], ['K1', 'Tucker', 'K'],
        ]);
        const before = slots(data.starters);
        assert.deepEqual(slots(relabel(data)), before);
    });

    test('empty slots stay empty and K/DEF never move', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', SNF], ['TE1'], ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', ONE_PM], ['K1', 'Tucker', 'K', MNF], ['DEF1'],
        ]));
        assert.deepEqual(slots(out), ['QB1 Hurts', 'TE1 -', 'FLEX1 Lamb', 'SFLEX1 Allen', 'K1 Tucker', 'DEF1 -']);
    });

    test('random superflex lineups: same starters, legal slots, locks fixed, SFLEX holds the latest it legally can', () => {
        const r = rng(20261006);
        for (let c = 0; c < 60; c++) {
            const data = randomLineup(r, { sflex: 1, small: true });
            const before = data.starters.map(s => ({ slot: s.slot, player: s.player }));
            const { open, seatings } = allSeatings(data.starters);
            const out = relabel(data);
            const where = `case ${c}: ${slots(before.map(s => ({ slot: s.slot, player: s.player })))}`;

            assert.deepEqual(out.map(s => s.player.id).sort(), before.map(s => s.player.id).sort(), where);
            out.forEach((s, i) => {
                assert.ok(SLOT_POSITIONS[s.slot.replace(/[0-9]/g, '')].includes(s.player.pos), where);
                if (before[i].player.isLocked) assert.equal(s.player, before[i].player, where);
            });
            const sflexIdx = out.findIndex(s => s.slot === 'SFLEX1');
            if (out[sflexIdx].player.isLocked) continue;
            const k = open.indexOf(sflexIdx);
            const ms = (p) => { const t = data.times[p.team]; return t ? Date.parse(t) : Infinity; };
            const best = Math.max(...seatings.map(seat => ms(seat[k])));
            assert.equal(ms(out[sflexIdx].player), best, where);
        }
    });
});

describe('without SFLEX, W/T or W/R: identical to main', () => {
    test('the fixture-style lineup', () => {
        const rows = [
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Henry', 'RB', MNF], ['RB2', 'Gibbs', 'RB', ONE_PM],
            ['WR1', 'Chase', 'WR', FOUR_25], ['WR2', 'Jefferson', 'WR', ONE_PM], ['TE1', 'Bowers', 'TE', ONE_PM],
            ['FLEX1', 'Lamb', 'WR', ONE_PM], ['K1', 'Tucker', 'K', ONE_PM], ['DEF1', 'BAL', 'DEF', ONE_PM],
        ];
        const ours = lineup(rows); const theirs = lineup(rows);
        mainOptimizeFlexKickoffOrder(theirs.starters, theirs.times);
        assert.deepEqual(slots(relabel(ours)), slots(theirs.starters));
        assert.deepEqual(slots(ours.starters), [
            'QB1 Allen', 'RB1 Gibbs', 'RB2 Henry', 'WR1 Jefferson', 'WR2 Lamb', 'TE1 Bowers', 'FLEX1 Chase', 'K1 Tucker', 'DEF1 BAL',
        ]);
    });

    test('random lineups (1-2 QBs, ties, unknown kickoffs, locks, 0-3 FLEX) match main slot for slot', () => {
        const r = rng(17);
        for (let c = 0; c < 500; c++) {
            const ours = randomLineup(r, { lockRate: 0.15, qbs: 1 + Math.floor(r() * 2) });
            const theirs = { starters: ours.starters.map(s => ({ ...s })), times: ours.times };
            const input = ours.starters.map(s => `${s.slot} ${s.player.pos}${s.player.isLocked ? ' locked' : ''} ${ours.times[s.player.team] || '?'}`).join(', ');
            mainOptimizeFlexKickoffOrder(theirs.starters, theirs.times);
            assert.deepEqual(slots(relabel(ours)), slots(theirs.starters), `case ${c}: ${input}`);
        }
    });
});

describe('W/T and W/R', () => {
    test('a W/T trades with a later WR, never with an RB', () => {
        const out = relabel(lineup([
            ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', SNF], ['TE1', 'Bowers', 'TE', ONE_PM],
            ['WRTE1', 'Nacua', 'WR', ONE_PM], ['FLEX1', 'Henry', 'RB', MNF],
        ]));
        // Henry (RB, Monday) keeps FLEX: W/T can't take an RB. Chase (Sunday night) takes W/T.
        assert.deepEqual(slots(out), ['RB1 Gibbs', 'WR1 Nacua', 'TE1 Bowers', 'WRTE1 Chase', 'FLEX1 Henry']);
    });

    test('FLEX gets the latest, then W/R, from the players each accepts', () => {
        const out = relabel(lineup([
            ['RB1', 'Gibbs', 'RB', MNF], ['WR1', 'Chase', 'WR', ONE_PM], ['TE1', 'Bowers', 'TE', SNF],
            ['WRRB1', 'Henry', 'RB', ONE_PM], ['FLEX1', 'Lamb', 'WR', FOUR_25],
        ]));
        // Bowers (TE, Sunday night) is the only TE, so he stays in TE1. FLEX takes Gibbs (Monday);
        // W/R the latest WR/RB left, Lamb (4:25); RB1 and WR1 get Henry and Chase.
        assert.deepEqual(slots(out), ['RB1 Henry', 'WR1 Chase', 'TE1 Bowers', 'WRRB1 Lamb', 'FLEX1 Gibbs']);
    });

    test('random lineups with W/T and W/R: same starters and legal slots', () => {
        const r = rng(5);
        for (let c = 0; c < 200; c++) {
            const data = randomLineup(r, { sflex: Math.floor(r() * 3), wrte: Math.floor(r() * 2), wrrb: Math.floor(r() * 2) });
            const before = data.starters.map(s => s.player);
            const out = relabel(data);
            assert.deepEqual(out.map(s => s.player.id).sort(), before.map(p => p.id).sort(), `case ${c}`);
            out.forEach((s, i) => {
                assert.ok(SLOT_POSITIONS[s.slot.replace(/[0-9]/g, '')].includes(s.player.pos), `case ${c}: ${s.slot} ${s.player.pos}`);
                if (before[i].isLocked) assert.equal(s.player, before[i], `case ${c}`);
            });
        }
    });
});
