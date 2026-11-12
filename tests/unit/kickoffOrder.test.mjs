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

// A lineup from [slot, name, pos, kickoff ms or undefined, lock] rows. lock: true (or 'auto') for a player
// whose game has started (optimizeLineup's autoLocked, which also sets isLocked); 'manual' for a lock you set
// on a player still to play (isLocked only; improvements F13). Each player gets their own team code, so
// kickoffs map one to one.
function lineup(rows) {
    const times = {};
    const starters = rows.map(([slot, name, pos, ms, isLocked], i) => {
        if (!name) return { slot, player: null };
        const team = `T${i}`;
        if (ms !== undefined) times[team] = new Date(ms).toISOString();
        return { slot, player: { id: name, name, pos, team, isLocked: !!isLocked, autoLocked: !!isLocked && isLocked !== 'manual' } };
    });
    return { starters, times };
}
const kickoffFrom = (times) => (p) => (times[p.team] ? new Date(times[p.team]).getTime() : NaN);
const relabel = ({ starters, times }, gameStarted) => { optimizeFlexKickoffOrder(starters, kickoffFrom(times), gameStarted); return starters; };
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
    const open = starters.map((s, i) => i).filter(i => starters[i].player && !starters[i].player.autoLocked && SLOT_POSITIONS[starters[i].slot.replace(/[0-9]/g, '')]);
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

    test('a player whose game started stays in SFLEX; everyone else still relabels', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', MNF],
            ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', ONE_PM, true],
        ]));
        // Hurts is locked, so Allen keeps the QB slot even though he plays later; FLEX still gets
        // the later WR.
        assert.deepEqual(slots(out), ['QB1 Allen', 'RB1 Gibbs', 'WR1 Lamb', 'FLEX1 Chase', 'SFLEX1 Hurts']);
    });

    test('a QB whose game started keeps the QB slot, so SFLEX is out of reach for the other QB', () => {
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
                if (before[i].player.autoLocked) assert.equal(s.player, before[i].player, where);
            });
            const sflexIdx = out.findIndex(s => s.slot === 'SFLEX1');
            if (out[sflexIdx].player.autoLocked) continue;
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

    test('random 1-QB lineups (ties, unknown kickoffs, locks, 0-3 FLEX) match main slot for slot', () => {
        const r = rng(17);
        for (let c = 0; c < 500; c++) {
            const ours = randomLineup(r, { lockRate: 0.15, qbs: 1 });
            const theirs = { starters: ours.starters.map(s => ({ ...s })), times: ours.times };
            const input = ours.starters.map(s => `${s.slot} ${s.player.pos}${s.player.isLocked ? ' locked' : ''} ${ours.times[s.player.team] || '?'}`).join(', ');
            mainOptimizeFlexKickoffOrder(theirs.starters, theirs.times);
            assert.deepEqual(slots(relabel(ours)), slots(theirs.starters), `case ${c}: ${input}`);
        }
    });
});

// Improvements F17: a 2-QB league (two QB slots, no SFLEX). Before, QBs only took part in the relabel through an open
// SFLEX slot, so QB1 and QB2 kept the rank-based fill's order while RB1/RB2, WR1/WR2 read earliest to latest. Now
// every strict type with several slots reads earliest kickoff on top. Who starts never changes.
describe('2-QB leagues: the QB slots read earliest kickoff first (F17)', () => {
    // QB 2, RB 2, WR 2, TE 1, FLEX 1, K, DEF. The fill put the better-ranked QB (Allen, Sunday night) in QB1.
    const TWO_QB = [
        ['QB1', 'Allen', 'QB', SNF], ['QB2', 'Hurts', 'QB', ONE_PM], ['RB1', 'Henry', 'RB', MNF], ['RB2', 'Gibbs', 'RB', ONE_PM],
        ['WR1', 'Chase', 'WR', FOUR_25], ['WR2', 'Jefferson', 'WR', ONE_PM], ['TE1', 'Bowers', 'TE', ONE_PM],
        ['FLEX1', 'Lamb', 'WR', ONE_PM], ['K1', 'Tucker', 'K', ONE_PM], ['DEF1', 'BAL', 'DEF', ONE_PM],
    ];
    const withLock = (name, lock) => TWO_QB.map(r => (r[1] === name ? [...r.slice(0, 4), lock] : r));

    test('without SFLEX, the earlier QB moves to QB1, as RB1/RB2 and WR1/WR2 already do', () => {
        // Main: QB1 Allen (Sunday night), QB2 Hurts (1 pm). RB, WR and FLEX as main had them.
        assert.deepEqual(slots(relabel(lineup(TWO_QB))), [
            'QB1 Hurts', 'QB2 Allen', 'RB1 Gibbs', 'RB2 Henry', 'WR1 Jefferson', 'WR2 Lamb', 'TE1 Bowers', 'FLEX1 Chase',
            'K1 Tucker', 'DEF1 BAL',
        ]);
    });

    test('the RB, WR and TE slots are the same as main', () => {
        const ours = lineup(TWO_QB), theirs = lineup(TWO_QB);
        mainOptimizeFlexKickoffOrder(theirs.starters, theirs.times);
        const notQb = (list) => list.filter(s => !s.startsWith('QB'));
        assert.deepEqual(notQb(slots(relabel(ours))), notQb(slots(theirs.starters)));
    });

    test('QBs kicking off together, or with no kickoff data, keep the fill order', () => {
        const tie = TWO_QB.map(r => (r[2] === 'QB' ? [...r.slice(0, 3), FOUR_25] : r));
        assert.deepEqual(slots(relabel(lineup(tie))).slice(0, 2), ['QB1 Allen', 'QB2 Hurts']);
        const unknown = TWO_QB.map(r => r.slice(0, 3));
        assert.deepEqual(slots(relabel(lineup(unknown))), slots(lineup(unknown).starters));
    });

    test('a QB whose game has started stays put, and so does the other', () => {
        // Hurts (QB2) is locked by kickoff: QB1 is the only QB slot left, so Allen keeps it.
        assert.deepEqual(slots(relabel(lineup(withLock('Hurts', 'auto')))).slice(0, 2), ['QB1 Allen', 'QB2 Hurts']);
        // A manual lock whose game has since started (gameStarted) stays put too.
        assert.deepEqual(slots(relabel(lineup(withLock('Allen', 'manual')), p => p.name === 'Allen')).slice(0, 2), ['QB1 Allen', 'QB2 Hurts']);
    });

    test('a manual lock on a QB still to play moves like anyone else (F13)', () => {
        assert.deepEqual(slots(relabel(lineup(withLock('Allen', 'manual')))).slice(0, 2), ['QB1 Hurts', 'QB2 Allen']);
    });

    test('2 QB slots plus SFLEX: unchanged (SFLEX already brought QBs in)', () => {
        const rows = [
            ['QB1', 'Allen', 'QB', SNF], ['QB2', 'Hurts', 'QB', ONE_PM], ['RB1', 'Gibbs', 'RB', ONE_PM],
            ['WR1', 'Chase', 'WR', ONE_PM], ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Burrow', 'QB', FOUR_25],
        ];
        // The same result main gave: SFLEX takes the latest QB, the QB slots the other two, earliest on top.
        assert.deepEqual(slots(relabel(lineup(rows))), ['QB1 Hurts', 'QB2 Burrow', 'RB1 Gibbs', 'WR1 Chase', 'FLEX1 Lamb', 'SFLEX1 Allen']);
    });

    test('a superflex lineup whose SFLEX player has kicked off: one QB slot, nothing to reorder', () => {
        const rows = [
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', MNF],
            ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', ONE_PM, 'auto'],
        ];
        assert.deepEqual(slots(relabel(lineup(rows))), ['QB1 Allen', 'RB1 Gibbs', 'WR1 Lamb', 'FLEX1 Chase', 'SFLEX1 Hurts']);
    });

    test('random 2-QB lineups: main slot for slot, except the QB slots read earliest kickoff first', () => {
        const r = rng(1117);
        const ms = (times, p) => (times[p.team] ? Date.parse(times[p.team]) : Infinity);
        for (let c = 0; c < 500; c++) {
            const ours = randomLineup(r, { lockRate: 0.15, qbs: 2 });
            const theirs = { starters: ours.starters.map(s => ({ ...s })), times: ours.times };
            const input = ours.starters.map(s => `${s.slot} ${s.player.pos}${s.player.isLocked ? ' locked' : ''} ${ours.times[s.player.team] || '?'}`).join(', ');
            mainOptimizeFlexKickoffOrder(theirs.starters, theirs.times);
            // Main never moved QBs. Expected: the unlocked QB slots, earliest first; ties keep the fill order.
            const qbIdx = theirs.starters.map((s, i) => i).filter(i => theirs.starters[i].slot.startsWith('QB') && !theirs.starters[i].player.autoLocked);
            const qbs = qbIdx.map(i => theirs.starters[i].player);
            const sorted = qbs.map((p, k) => ({ p, k })).sort((a, b) => (ms(ours.times, a.p) === ms(ours.times, b.p) ? a.k - b.k : ms(ours.times, a.p) < ms(ours.times, b.p) ? -1 : 1));
            qbIdx.forEach((i, k) => { theirs.starters[i] = { ...theirs.starters[i], player: sorted[k].p }; });
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
                if (before[i].autoLocked) assert.equal(s.player, before[i], `case ${c}`);
            });
        }
    });
});

// Improvements F13: a lock you set means "start him", not "keep this slot". Before, every isLocked starter was
// held where the fill put him (a locked WR in WR1 even when he played latest); now only players whose game has
// started stay put: autoLocked, or gameStarted(player) for a manual lock whose game has since kicked off.
describe('manual locks join the relabel (F13)', () => {
    const FIXTURE = [
        ['QB1', 'Allen', 'QB', ONE_PM], ['RB1', 'Henry', 'RB', ONE_PM], ['RB2', 'Gibbs', 'RB', ONE_PM],
        ['WR1', 'Lamb', 'WR', MNF], ['WR2', 'Chase', 'WR', ONE_PM], ['TE1', 'Bowers', 'TE', ONE_PM],
        ['FLEX1', 'Jefferson', 'WR', ONE_PM], ['K1', 'Tucker', 'K', ONE_PM], ['DEF1', 'BAL', 'DEF', ONE_PM],
    ];
    const withLock = (name, lock) => FIXTURE.map(r => (r[1] === name ? [...r.slice(0, 4), lock] : r));

    test('a manual lock in a strict slot who plays later than FLEX moves to FLEX', () => {
        // The fill puts a locked player in the first slot he fits (WR1); main left him there, FLEX holding a 1 pm game.
        assert.deepEqual(slots(relabel(lineup(withLock('Lamb', 'manual')))), [
            'QB1 Allen', 'RB1 Henry', 'RB2 Gibbs', 'WR1 Chase', 'WR2 Jefferson', 'TE1 Bowers', 'FLEX1 Lamb', 'K1 Tucker', 'DEF1 BAL',
        ]);
    });

    test('a manual lock in FLEX gives FLEX to a later strict-slot starter', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', ONE_PM], ['RB1', 'Henry', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', SNF],
            ['TE1', 'Bowers', 'TE', ONE_PM], ['FLEX1', 'Lamb', 'WR', ONE_PM, 'manual'],
        ]));
        assert.deepEqual(slots(out), ['QB1 Allen', 'RB1 Henry', 'WR1 Lamb', 'TE1 Bowers', 'FLEX1 Chase']);
    });

    test('an auto-locked player (his game started) stays where he is', () => {
        assert.deepEqual(slots(relabel(lineup(withLock('Lamb', 'auto')))), [
            'QB1 Allen', 'RB1 Henry', 'RB2 Gibbs', 'WR1 Lamb', 'WR2 Chase', 'TE1 Bowers', 'FLEX1 Jefferson', 'K1 Tucker', 'DEF1 BAL',
        ]);
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', ONE_PM], ['WR1', 'Chase', 'WR', ONE_PM, 'auto'], ['WR2', 'Lamb', 'WR', MNF],
            ['FLEX1', 'Jefferson', 'WR', ONE_PM, 'auto'],
        ]));
        // Chase and Jefferson are locked by kickoff: Lamb has nowhere to go.
        assert.deepEqual(slots(out), ['QB1 Allen', 'WR1 Chase', 'WR2 Lamb', 'FLEX1 Jefferson']);
    });

    test('a manual lock whose game has since started stays put (gameStarted)', () => {
        const data = lineup(withLock('Lamb', 'manual'));
        const before = slots(data.starters);
        assert.deepEqual(slots(relabel(data, p => p.name === 'Lamb')), before);
    });

    test('a manual lock in SFLEX in a superflex league moves when a later starter can take SFLEX', () => {
        const out = relabel(lineup([
            ['QB1', 'Allen', 'QB', SNF], ['RB1', 'Gibbs', 'RB', ONE_PM], ['WR1', 'Chase', 'WR', MNF],
            ['FLEX1', 'Lamb', 'WR', ONE_PM], ['SFLEX1', 'Hurts', 'QB', ONE_PM, 'manual'],
        ]));
        // Main kept Hurts (1 pm) in SFLEX and Allen (Sunday night) in QB. Two QBs and one QB slot, so SFLEX keeps a QB:
        // the later one, Allen. Hurts still starts, in the QB slot; FLEX gets Chase (Monday).
        assert.deepEqual(slots(out), ['QB1 Hurts', 'RB1 Gibbs', 'WR1 Lamb', 'FLEX1 Chase', 'SFLEX1 Allen']);
    });

    test('no locks: the same as before F13', () => {
        const ours = lineup(FIXTURE), theirs = lineup(FIXTURE);
        mainOptimizeFlexKickoffOrder(theirs.starters, theirs.times);
        assert.deepEqual(slots(relabel(ours)), slots(theirs.starters));
    });
});
