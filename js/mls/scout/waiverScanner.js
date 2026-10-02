// --- WAIVER WIRE ASSISTANT LOGIC (ES MODULE) ---
// Pure logic behind the Scout tab's Waiver Wire Assistant (Auto-Find and Scan Pasted List):
// which free agents to show, what their weekly positional / FLEX ranks are, and whether each
// one would crack your current starting lineup. Same extraction pattern as rankingsParser.js -- nothing here touches the
// DOM, localStorage, or mls.js's State. The caller injects everything league-specific
// (position lookup, lock/availability checks) as plain callbacks, so this whole file runs
// under Node for validation without a browser.

export const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SFLEX', 'K', 'DEF'];
const UNRANKED = 999;

const isRanked = (v) => v !== undefined && v !== null && v !== UNRANKED;
const rankOr999 = (v) => (isRanked(v) ? v : UNRANKED);

// --- DISPLAY RANKS (Wk Pos Rank / Wk Flex Rank) ---
// rankingsParser.js stores posRank/flexRank for every player, but for a SINGLE-file upload
// without a Pos Rank column it backfills both with the player's overall rank (see its
// "Fallback" branch). Shown as-is, that makes WR3 read as "Pos #9" and gives QBs a "Flex
// Rank". So per position group -- and for the FLEX group as a whole -- this detects that
// fallback and, only then, re-derives the rank by ordering players within the group. When
// the file carried real positional/FLEX ranks (horizontal weekly sheet, per-position
// uploads, explicit Pos Rank column) the raw numbers are kept untouched.
//
// Detection:
//   Positions  -- every ranked player in the whole file has posRank equal to their overall
//                 rank. Checked file-wide, not per position: the parser's fallback only ever
//                 happens for a whole single-file upload, while a genuine positional list can
//                 match its overall rank for one group (QBs on a horizontal sheet) -- and
//                 re-deriving that group would compress any gaps (QB10/QB14 -> QB1/QB2).
//                 Per-position uploads with no FLEX file also trip this, but each group there
//                 is already 1..N, so re-ordering hands back the same numbers.
//   FLEX group -- any non-FLEX player (QB/K/DEF) carries a flexRank. Only the single-file
//                 fallback does that; a real FLEX column/file never includes them.
//
// A derived rank drops its tier (the tier on a backfilled field describes the overall list,
// not the position), and is flagged so the UI can disclose it.
export function buildRankDisplayIndex(rankings, getPos) {
    const index = {};
    if (!Array.isArray(rankings) || rankings.length === 0) return index;

    const withPos = rankings.map(r => ({ r, pos: getPos(r.cleanName) }));

    const byPos = {};
    withPos.forEach(({ r, pos }) => {
        if (!pos || pos === 'UNK') return;
        (byPos[pos] = byPos[pos] || []).push(r);
    });

    const flexContaminated = withPos.some(({ r, pos }) =>
        pos && pos !== 'UNK' && !FLEX_POSITIONS.includes(pos) && isRanked(r.flexRank));

    withPos.forEach(({ r, pos }) => {
        index[r.cleanName] = {
            pos,
            // Overall rank, straight from the file. ROS exports carry Overall + Positional and no
            // FLEX list, so for ROS this -- not a derived flexRank -- is the cross-position number
            // the UI shows ("ROS Overall #106"); see crossKind in mls.js's waiverCompareLine.
            rank: isRanked(r.rank) ? r.rank : null,
            tier: r.tier ?? null,
            posRank: isRanked(r.posRank) ? r.posRank : null,
            posTier: r.posTier ?? null,
            posDerived: false,
            flexRank: (FLEX_POSITIONS.includes(pos) && isRanked(r.flexRank)) ? r.flexRank : null,
            flexTier: FLEX_POSITIONS.includes(pos) ? (r.flexTier ?? null) : null,
            flexDerived: false
        };
    });

    const positioned = withPos.filter(({ pos }) => pos && pos !== 'UNK').map(({ r }) => r);
    const posFallback = positioned.length > 0 &&
        positioned.every(r => !isRanked(r.posRank) || r.posRank === r.rank);

    if (posFallback) Object.values(byPos).forEach(group => {
        const ranked = group.filter(r => isRanked(r.posRank) || isRanked(r.rank));
        const sortVal = r => (isRanked(r.posRank) ? r.posRank : rankOr999(r.rank));
        ranked.slice().sort((a, b) => sortVal(a) - sortVal(b)).forEach((r, i) => {
            const entry = index[r.cleanName];
            if (entry.posRank !== i + 1) {
                entry.posRank = i + 1;
                entry.posTier = null;
                entry.posDerived = true;
            }
        });
    });

    if (flexContaminated) {
        const flexPlayers = withPos
            .filter(({ r, pos }) => FLEX_POSITIONS.includes(pos) && isRanked(r.flexRank))
            .map(({ r }) => r)
            .sort((a, b) => a.flexRank - b.flexRank);
        flexPlayers.forEach((r, i) => {
            const entry = index[r.cleanName];
            entry.flexTier = null; // the backfilled tier describes the overall list either way
            if (entry.flexRank !== i + 1) {
                entry.flexRank = i + 1;
                entry.flexDerived = true;
            }
        });
    }

    return index;
}

// --- SCAN ORDERING ---
// Same comparison convention as the optimizer's FLEX fillSlot: a single position compares
// posRank; the FLEX group prefers flexRank (the only genuinely cross-position number) and
// falls back to posRank only when neither side has one. Used both to order free agents and
// (Whole Roster lens) to find your weakest rostered player, so the two always agree.
export function compareForScan(a, b, posFilter) {
    if (posFilter === 'FLEX') {
        const af = rankOr999(a && a.flexRank), bf = rankOr999(b && b.flexRank);
        if (af !== UNRANKED && bf !== UNRANKED) return af - bf;
        if (af !== UNRANKED) return -1;
        if (bf !== UNRANKED) return 1;
    }
    const ap = isRanked(a && a.posRank) ? a.posRank : rankOr999(a && a.rank);
    const bp = isRanked(b && b.posRank) ? b.posRank : rankOr999(b && b.rank);
    return ap - bp;
}

export function matchesPosFilter(pos, posFilter) {
    if (!pos || pos === 'UNK') return false;
    if (posFilter === 'FLEX') return FLEX_POSITIONS.includes(pos);
    if (posFilter === 'ALL') return true;
    return pos === posFilter;
}

// Returns free agents from `rankings` (the chosen scan basis -- ROS or Weekly), filtered to
// the position filter, best first. `isRostered(cleanName)` reports league-wide ownership;
// `isExcluded(r)` drops non-players (draft picks). Players whose position can't be resolved
// are named, not returned: an unresolvable name is also the case most likely to be a spelling
// mismatch for someone who IS rostered, so calling them "available" would be the riskiest guess
// this tool could make. The names come back so the UI can show WHICH ones to go fix, rather
// than just how many.
export function findFreeAgents(rankings, { posFilter, getPos, isRostered, isExcluded = () => false }) {
    const unresolvedNames = [];
    const list = [];
    (rankings || []).forEach(r => {
        if (!r || !r.cleanName || isRostered(r.cleanName) || isExcluded(r)) return;
        const pos = getPos(r.cleanName);
        if (!pos || pos === 'UNK') { unresolvedNames.push(r.name); return; }
        if (!matchesPosFilter(pos, posFilter)) return;
        list.push({ ...r, pos });
    });
    list.sort((a, b) => compareForScan(a, b, posFilter));
    return { freeAgents: list, unresolvedCount: unresolvedNames.length, unresolvedNames };
}

// --- LINEUP SIMULATION ---
// Fills a set of starter slots from a candidate pool using the exact same rules as
// optimizeLineup in mls.js (strict slots by posRank, FLEX by flexRank-then-posRank, SFLEX by
// QB posRank -> FLEX flexRank -> FLEX posRank, locked players placed first, unavailable
// players only as a last resort so no slot is left empty). If the two ever drift apart, this
// tool would claim a free agent "starts" when the optimizer wouldn't actually start him --
// so any change to optimizeLineup's fillSlot/SFLEX logic belongs here too.
//
// pool entries: { id, pos, posRank, flexRank, isLocked, unavailable }
// Returns { starters: [{ slotType, player }], leftover: [...] }.
export function fillLineup(slotTypes, candidates) {
    const pool = candidates.slice();
    const starters = [];

    const findBest = (matchFn, compareFn) => {
        let best = -1;
        pool.forEach((p, i) => {
            if (!matchFn(p) || p.unavailable) return;
            if (best === -1 || compareFn(p, pool[best]) < 0) best = i;
        });
        if (best !== -1) return best;
        pool.forEach((p, i) => {
            if (!matchFn(p)) return;
            if (best === -1 || compareFn(p, pool[best]) < 0) best = i;
        });
        return best;
    };

    const byPosRank = (a, b) => a.posRank - b.posRank;
    const byFlex = (a, b) => {
        if (a.flexRank !== UNRANKED && b.flexRank !== UNRANKED) return a.flexRank - b.flexRank;
        if (a.flexRank !== UNRANKED) return -1;
        if (b.flexRank !== UNRANKED) return 1;
        return a.posRank - b.posRank;
    };

    const take = (slotType, idx) => starters.push({ slotType, player: idx === -1 ? null : pool.splice(idx, 1)[0] });

    const counts = {};
    slotTypes.forEach(t => { counts[t] = (counts[t] || 0) + 1; });

    SLOT_ORDER.forEach(slotType => {
        for (let i = 0; i < (counts[slotType] || 0); i++) {
            if (slotType === 'SFLEX') {
                const lockedIdx = pool.findIndex(p => p.isLocked && ['QB', ...FLEX_POSITIONS].includes(p.pos));
                if (lockedIdx !== -1) { take(slotType, lockedIdx); continue; }
                let idx = findBest(p => p.pos === 'QB' && p.posRank !== UNRANKED, byPosRank);
                if (idx === -1) idx = findBest(p => FLEX_POSITIONS.includes(p.pos) && p.flexRank !== UNRANKED, (a, b) => a.flexRank - b.flexRank);
                if (idx === -1) idx = findBest(p => FLEX_POSITIONS.includes(p.pos) && p.posRank !== UNRANKED, byPosRank);
                take(slotType, idx);
                continue;
            }
            const accepts = slotType === 'FLEX' ? (p => FLEX_POSITIONS.includes(p.pos)) : (p => p.pos === slotType);
            const lockedIdx = pool.findIndex(p => p.isLocked && accepts(p));
            if (lockedIdx !== -1) { take(slotType, lockedIdx); continue; }
            take(slotType, findBest(accepts, slotType === 'FLEX' ? byFlex : byPosRank));
        }
    });

    return { starters, leftover: pool };
}

export function slotAcceptsPos(slotType, pos) {
    if (slotType === 'FLEX') return FLEX_POSITIONS.includes(pos);
    if (slotType === 'SFLEX') return pos === 'QB' || FLEX_POSITIONS.includes(pos);
    return slotType === pos;
}

// Would this free agent start for you this week?
//
// Rather than eyeballing one rank against one starter, it adds the free agent to your
// current starters and re-runs the optimizer's own slotting. With N slots and N+1 players
// someone has to sit: if it's the free agent, he doesn't crack the lineup; otherwise the
// player left out is exactly who he'd replace (after the lineup reshuffles itself -- a WR
// pickup can push your FLEX RB out even though he takes a WR slot). Bench players are left
// out on purpose: this answers "better than who I'm starting?", which is the question the
// scanner exists for.
//
// When the free agent doesn't start, it re-runs once more with him forced in (as a lock) to
// find the "bubble" starter -- the weakest one he's competing with -- so the card can say
// who he'd need to pass.
//
// currentStarters: [{ slotType, player: { id, name, pos, ... } | null }]
// rankOf(player) -> { posRank, flexRank } from the check rankings (999 when unranked)
// isLocked(player), isUnavailable(player) -> booleans
export function checkAgainstLineup(fa, currentStarters, { rankOf, isLocked, isUnavailable }) {
    const slotTypes = currentStarters.map(s => s.slotType);
    if (!slotTypes.some(t => slotAcceptsPos(t, fa.pos))) return { status: 'noSlot' };

    const toCandidate = (p, extra = {}) => {
        const rk = rankOf(p) || {};
        return {
            id: p.id, pos: p.pos, ref: p,
            posRank: rankOr999(rk.posRank), flexRank: rankOr999(rk.flexRank),
            isLocked: !!isLocked(p), unavailable: !!isUnavailable(p),
            ...extra
        };
    };

    const starterCands = currentStarters.filter(s => s.player).map(s => toCandidate(s.player));
    const faCand = toCandidate(fa, { isLocked: false, isFa: true });

    const withFa = fillLineup(slotTypes, [...starterCands, faCand]);
    const faStarts = withFa.starters.some(s => s.player && s.player.isFa);
    const emptySlotFilled = currentStarters.some(s => !s.player && slotAcceptsPos(s.slotType, fa.pos));

    if (faStarts) {
        const displaced = withFa.leftover.find(p => !p.isFa);
        if (!displaced) return { status: 'starts', displaced: null, fillsEmptySlot: emptySlotFilled };
        const prevSlot = currentStarters.find(s => s.player && s.player.id === displaced.id);
        return { status: 'starts', displaced: displaced.ref, displacedSlotType: prevSlot ? prevSlot.slotType : null, fillsEmptySlot: false };
    }

    // Unavailable this week (bye / hard-out): say so plainly instead of naming a bubble starter
    // he could never pass -- the optimizer only starts an unavailable player when no one else fits.
    if (faCand.unavailable) return { status: 'unavailable' };

    // Every eligible slot is held by a locked player (manual lock or game already kicked off).
    const forced = fillLineup(slotTypes, [...starterCands, { ...faCand, isLocked: true }]);
    const forcedIn = forced.starters.some(s => s.player && s.player.isFa);
    const bubble = forcedIn ? forced.leftover.find(p => !p.isFa) : null;
    if (!bubble) return { status: 'locked' };
    if (bubble.isLocked) return { status: 'locked' };
    const bubbleSlot = currentStarters.find(s => s.player && s.player.id === bubble.id);
    return { status: 'bench', bubble: bubble.ref, bubbleSlotType: bubbleSlot ? bubbleSlot.slotType : null };
}