// --- WHO STARTS IN A SLOT ---
// One rule for the Lineup Optimizer (render/lineup.js, optimizeLineup), its copy for the Waiver Wire Assistant and
// the Dashboard's Best Available (scout/waiverScanner.js, fillLineup), and the "start X instead?" suggestions
// (lineup/issues.js, S11), so none of them can disagree: pickForSlot, below. Pure: no State, no DOM;
// tests/unit/flexChoice.test.mjs runs it in Node.
//
// The owner's rule (improvements S12, after "Fantasy Leftovers" started Kendrick Bourne WR55 over Treylon Burks
// WR53 because Bourne projected higher, and an unranked Kyle Pitts over ranked WRs): FLEX rank, then any rank, then
// projected points.
//   1. Anyone with a FLEX rank: the best FLEX rank. Your rankings come first.
//   2. Else anyone with a position rank: a ranked player beats an unranked one, and at one position the better
//      position rank wins, whatever the projections say. So only the best-ranked player left at each position is in
//      the running, and among those the higher projection wins: position ranks aren't comparable across positions
//      (a TE24 isn't necessarily better than a WR50, the TE list is just shallower).
//   3. Else (nobody ranked): the higher projection.
// Between projections, a projected player beats one Sleeper doesn't project (or projections aren't loaded); with no
// projection to tell them apart, the better position rank. Ties keep list order: the first one wins.
// Before S12 every pair without FLEX ranks went to projections, same position or not, ranked or not.

import { SLOT_POSITIONS } from '../constants.js';

const UNRANKED = 999;
const isRanked = (r) => typeof r === 'number' && r !== UNRANKED && Number.isFinite(r);

// The first item of `list` that no later item beats under `compare` (a sort comparator: negative = a first), or null.
export function bestBy(list, compare) {
    let best = null;
    (list || []).forEach(p => { if (best === null || compare(p, best) < 0) best = p; });
    return best;
}

// The best-ranked player at each position, in list order of first appearance.
function positionLeaders(list) {
    const byPos = new Map();
    list.forEach(p => {
        const cur = byPos.get(p.pos);
        if (!cur || p.posRank < cur.posRank) byPos.set(p.pos, p);
    });
    return list.filter(p => byPos.get(p.pos) === p);
}

// candidates: [{ pos, posRank, flexRank, ... }] (999 = unranked). projOf(candidate) -> points, or null when unknown.
// Returns the candidate who starts, or null for an empty list.
export function pickFlexStarter(candidates, projOf = () => null) {
    const list = candidates || [];
    if (list.length === 0) return null;
    const flexRanked = list.filter(p => isRanked(p.flexRank));
    if (flexRanked.length > 0) return bestBy(flexRanked, (a, b) => a.flexRank - b.flexRank);
    const posRanked = list.filter(p => isRanked(p.posRank));
    const field = posRanked.length > 0 ? positionLeaders(posRanked) : list;
    const proj = (p) => { const v = projOf(p); return typeof v === 'number' && Number.isFinite(v) ? v : null; };
    return bestBy(field, (a, b) => {
        const pa = proj(a), pb = proj(b);
        if (pa !== null && pb !== null && pa !== pb) return pb - pa;
        if (pa !== null && pb === null) return -1;
        if (pa === null && pb !== null) return 1;
        return (a.posRank ?? UNRANKED) - (b.posRank ?? UNRANKED);
    });
}

// The player who starts in one slot, among `candidates` (any positions; the slot's own are picked out here), or null.
//   Strict slots (QB, RB, WR, TE, K, DEF): the best position rank.
//   FLEX, W/T, W/R: pickFlexStarter.
//   SFLEX: a ranked QB first (the best position rank), else a ranked RB/WR/TE by pickFlexStarter, else anyone it
//     takes by projection (everyone left is unranked then). Before S12 round 3 SFLEX stayed empty rather than start
//     an unranked player.
// Availability (byes, injuries) is the caller's: it passes the available candidates first.
export function pickForSlot(slotType, candidates, projOf = () => null) {
    const takes = SLOT_POSITIONS[slotType] || [slotType];
    const list = (candidates || []).filter(p => takes.includes(p.pos));
    const byPosRank = (a, b) => a.posRank - b.posRank;
    if (slotType === 'SFLEX') {
        const qb = bestBy(list.filter(p => p.pos === 'QB' && isRanked(p.posRank)), byPosRank);
        if (qb) return qb;
        const flex = pickFlexStarter(list.filter(p => p.pos !== 'QB' && (isRanked(p.flexRank) || isRanked(p.posRank))), projOf);
        return flex || pickFlexStarter(list, projOf);
    }
    if (takes.length > 1) return pickFlexStarter(list, projOf);
    return bestBy(list, byPosRank);
}
