// FLEX Kickoff Optimization (improvements F1; before that, a function inside js/mls/render/lineup.js).
// Pure: no State, no DOM, so tests/unit/kickoffOrder.test.mjs can run it in Node.
import { SLOT_POSITIONS } from '../constants.js';

// Slot types this step may move players between, in the order they're settled: the slot that
// accepts the most positions first (SFLEX: QB/RB/WR/TE), then FLEX (RB/WR/TE), then the two-
// position W/T and W/R (W/T first: it's later in fill order, so with no kickoff data each slot
// keeps its own player), then the strict slots, where every player left has exactly one place to
// go. K and DEF never move.
const RELABEL_ORDER = ['SFLEX', 'FLEX', 'WRTE', 'WRRB', 'TE', 'WR', 'RB', 'QB'];
// Tie order for the display sort: same as fill order, which is what FLEX used before F1.
const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3 };

const slotTypeOf = (s) => s.slot.replace(/[0-9]/g, '');
const accepts = (slotType, pos) => !!(SLOT_POSITIONS[slotType] && SLOT_POSITIONS[slotType].includes(pos));
// Kickoff ms, with Infinity for unknown. Infinity - Infinity is NaN, so compare explicitly.
const cmpMs = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

// Can every slot in `slotTypes` get its own player from `players` (each { pos })? A small
// bipartite matching (Kuhn's algorithm); a lineup has at most a dozen or so movable starters.
function canFill(slotTypes, players) {
    const owner = new Array(players.length).fill(-1);
    const tryAssign = (si, seen) => {
        for (let pi = 0; pi < players.length; pi++) {
            if (seen[pi] || !accepts(slotTypes[si], players[pi].pos)) continue;
            seen[pi] = true;
            if (owner[pi] === -1 || tryAssign(owner[pi], seen)) { owner[pi] = si; return true; }
        }
        return false;
    };
    return slotTypes.every((_, si) => tryAssign(si, new Array(players.length).fill(false)));
}

// Given the starters optimizeLineup already picked (WHO starts is decided), decides which of
// them sits in which slot so that the most flexible slots hold the latest kickoffs: SFLEX gets
// the latest game it legally can, then FLEX, then W/T and W/R, and the strict QB/RB/WR/TE slots
// keep the earliest. That's late-swap room: the slot that accepts the most positions is the one
// you can still change last. Mutates `starters` (each { slot, player }) in place.
//
// It never changes the set of starters and never puts a player in a slot their position doesn't
// fit (SLOT_POSITIONS). Each slot is settled by taking the latest-kickoff player who can go
// there while the remaining players can still fill the remaining slots, so e.g. in a 2-QB
// superflex lineup SFLEX must keep a QB, and gets the later-kicking one.
//
// - Locked players (manual locks, or auto-locked because their game started; see optimizeLineup)
//   stay where they are, and their slots stay out of the pool. Empty slots stay empty.
// - kickoffMs(player) returns a time in ms, or NaN/null when unknown. Unknown sorts as latest,
//   so we never assume a game is early without evidence.
// - Ties keep the rank-based fill: of two players kicking off together, the one the fill
//   placed lower in the lineup is treated as later.
// - Where a type has several slots (FLEX1, FLEX2), they read earliest to latest top to bottom.
//   Which of them a player lands in doesn't change late-swap room; it's display order.
export function optimizeFlexKickoffOrder(starters, kickoffMs) {
    const movable = [];
    starters.forEach((s, idx) => {
        const slotType = slotTypeOf(s);
        if (!RELABEL_ORDER.includes(slotType) || !s.player || s.player.isLocked) return;
        if (!accepts(slotType, s.player.pos)) return; // malformed data: leave it alone
        const ms = kickoffMs(s.player);
        movable.push({ idx, slotType, player: s.player, pos: s.player.pos, ms: Number.isFinite(ms) ? ms : Infinity });
    });
    // QBs can only trade places through SFLEX. Without an open SFLEX slot, a 2-QB league's QB1/QB2
    // keep the fill's order, as before F1.
    if (!movable.some(m => m.slotType === 'SFLEX')) {
        for (let i = movable.length - 1; i >= 0; i--) if (movable[i].slotType === 'QB') movable.splice(i, 1);
    }

    const latestFirst = (a, b) => cmpMs(b.ms, a.ms) || b.idx - a.idx;
    const earliestFirst = (a, b) => cmpMs(a.ms, b.ms) || POS_ORDER[a.pos] - POS_ORDER[b.pos] || a.idx - b.idx;

    let openSlots = movable.map(m => m.slotType);
    let players = movable.slice();
    const placed = []; // [{ slotIdxs, chosen }] per slot type

    for (const slotType of RELABEL_ORDER) {
        const slotIdxs = movable.filter(m => m.slotType === slotType).map(m => m.idx);
        const chosen = [];
        for (let n = 0; n < slotIdxs.length; n++) {
            const restSlots = openSlots.slice();
            restSlots.splice(restSlots.indexOf(slotType), 1);
            const pick = players.filter(p => accepts(slotType, p.pos)).sort(latestFirst)
                .find(p => canFill(restSlots, players.filter(q => q !== p)));
            if (!pick) return; // can't happen (the current lineup fits); leave everything as it was
            chosen.push(pick);
            players = players.filter(q => q !== pick);
            openSlots = restSlots;
        }
        placed.push({ slotIdxs, chosen: chosen.sort(earliestFirst) });
    }

    placed.forEach(({ slotIdxs, chosen }) => slotIdxs.forEach((idx, i) => { starters[idx].player = chosen[i].player; }));
}
