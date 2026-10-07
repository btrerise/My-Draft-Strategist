// --- RANKINGS COMPARISON (improvements S3) ---
// What changed between two versions of a rankings list: who moved, who was added, who was dropped.
// Lineup Strategist shows it after Replace Set (js/mls/rankings/changeSummary.js); Draft Strategist
// can reuse it for Replace Rankings (runbook card S4). Pure: no DOM, no State, no storage, so Node
// tests it directly (tests/unit/rankingsCompare.test.mjs).
//
// Input lists are the parser's shape (js/shared/rankings/parse.js): { name, cleanName, rank,
// posRank, flexRank, tier?, posTier?, flexTier? }, plus `pos` when the caller has it (Draft
// Strategist's entries do; Lineup Strategist's don't, so it passes a posOf lookup instead).
//
// Matching:
//   1. By normalizeName(name) plus position, so "Kenneth Walker III" in the old file and "Kenneth
//      Walker" in the new one are the same player, and two players who share a name at different
//      positions stay apart.
//   2. Whatever is left is paired by name alone. If both sides know a position and they differ, the
//      player changed position (reported in posChanged, not as a move: RB12 -> WR30 isn't a fall).
//      If one side has no position, it's the same player and the known position is used.
//   3. The rest are added (new only) or dropped (old only).
// Within one list the first entry for a name + position wins, as rankingIndex does in MLS.
//
// Moves are measured in position rank (owner's choice: per-position and FLEX Weekly sheets have no
// true overall rank). Only moves of at least `threshold` spots count (default 3, so RB8 -> RB6 is
// noise). A player with no position rank on either side (999 or missing) falls back to overall
// rank. Tier changes are reported on the moves; a tier change on its own doesn't count as a move.
import { normalizeName } from '../names.js';

export const DEFAULT_MOVE_THRESHOLD = 3;

// The parser writes 999 for "no rank"; anything that isn't a positive number below that is no rank.
function validRank(n) {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 999 ? n : null;
}

function cleanOf(entry) {
    if (!entry) return '';
    return normalizeName(entry.name) || entry.cleanName || '';
}

function tierOf(entry) {
    if (!entry) return null;
    const t = entry.posTier ?? entry.tier ?? null;
    return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

// One side of a comparison, trimmed to what a summary shows.
function snapshot(entry, pos) {
    return {
        name: entry.name || '',
        pos: pos || null,
        rank: validRank(entry.rank),
        posRank: validRank(entry.posRank),
        tier: tierOf(entry)
    };
}

function indexList(list, posOf) {
    const rows = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((entry, order) => {
        const clean = cleanOf(entry);
        if (!clean) return;
        const rawPos = entry.pos || (posOf ? posOf(entry, clean) : null) || null;
        const pos = rawPos ? String(rawPos).toUpperCase() : null;
        const key = `${clean}|${pos || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ entry, clean, pos, key, order });
    });
    return rows;
}

// Sort key for "how good is this player": position rank, then overall rank, then file order.
function rankKey(side, order) {
    return [side.posRank ?? 1e6, side.rank ?? 1e6, order];
}
function compareKeys(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

// oldList / newList: the two versions. options.posOf(entry, cleanName): a position for an entry
// without `pos` (or null). options.threshold: the smallest move that counts.
export function compareRankings(oldList, newList, { posOf = null, threshold = DEFAULT_MOVE_THRESHOLD } = {}) {
    const oldRows = indexList(oldList, posOf);
    const newRows = indexList(newList, posOf);

    const pairs = [];
    const oldLeft = new Map(); // clean -> rows not yet paired
    const newByKey = new Map(newRows.map(r => [r.key, r]));
    const newPaired = new Set();

    // 1. Same name and position.
    oldRows.forEach(o => {
        const n = newByKey.get(o.key);
        if (n && !newPaired.has(n)) {
            pairs.push([o, n]);
            newPaired.add(n);
        } else {
            if (!oldLeft.has(o.clean)) oldLeft.set(o.clean, []);
            oldLeft.get(o.clean).push(o);
        }
    });

    // 2. Same name, different (or unknown) position: pair in file order.
    const added = [];
    newRows.forEach(n => {
        if (newPaired.has(n)) return;
        const waiting = oldLeft.get(n.clean);
        if (waiting && waiting.length) {
            pairs.push([waiting.shift(), n]);
            newPaired.add(n);
        } else {
            added.push(n);
        }
    });
    const dropped = [...oldLeft.values()].flat();

    const moves = [];
    const posChanged = [];
    let unchanged = 0;

    pairs.forEach(([o, n]) => {
        const bothKnown = o.pos && n.pos;
        if (bothKnown && o.pos !== n.pos) {
            posChanged.push({
                type: 'posChanged',
                name: n.entry.name || o.entry.name || '',
                cleanName: n.clean,
                pos: n.pos,
                old: snapshot(o.entry, o.pos),
                new: snapshot(n.entry, n.pos),
                order: n.order
            });
            return;
        }
        const pos = n.pos || o.pos || null;
        const before = snapshot(o.entry, pos);
        const after = snapshot(n.entry, pos);
        let basis = null;
        let delta = null;
        if (before.posRank !== null && after.posRank !== null) {
            basis = 'pos';
            delta = before.posRank - after.posRank;
        } else if (before.rank !== null && after.rank !== null) {
            basis = 'overall';
            delta = before.rank - after.rank;
        }
        if (delta === null || Math.abs(delta) < threshold) {
            unchanged++;
            return;
        }
        moves.push({
            type: 'moved',
            name: n.entry.name || o.entry.name || '',
            cleanName: n.clean,
            pos,
            old: before,
            new: after,
            basis,
            delta, // positive = rose (a smaller rank number)
            overallDelta: before.rank !== null && after.rank !== null ? before.rank - after.rank : null,
            tierChanged: before.tier !== null && after.tier !== null && before.tier !== after.tier,
            order: n.order
        });
    });

    // Biggest move first; ties go to the better-ranked player now, then the file's order, so the
    // result is the same every time for the same two lists.
    const byNewRank = (a, b) => compareKeys(rankKey(a.new, a.order), rankKey(b.new, b.order));
    const bySize = (a, b) => (Math.abs(b.delta) - Math.abs(a.delta)) || byNewRank(a, b);
    moves.sort(bySize);

    // Added and dropped players mix positions, so they're listed by overall rank (QB4 isn't ahead of RB7).
    const overallKey = (side, order) => [side.rank ?? 1e6, side.posRank ?? 1e6, order];
    const addedOut = added.map(n => ({
        type: 'added', name: n.entry.name || '', cleanName: n.clean, pos: n.pos,
        old: null, new: snapshot(n.entry, n.pos), order: n.order
    })).sort((a, b) => compareKeys(overallKey(a.new, a.order), overallKey(b.new, b.order)));
    const droppedOut = dropped.map(o => ({
        type: 'dropped', name: o.entry.name || '', cleanName: o.clean, pos: o.pos,
        old: snapshot(o.entry, o.pos), new: null, order: o.order
    })).sort((a, b) => compareKeys(overallKey(a.old, a.order), overallKey(b.old, b.order)));
    posChanged.sort(byNewRank);

    const risers = moves.filter(m => m.delta > 0);
    const fallers = moves.filter(m => m.delta < 0);

    return {
        threshold,
        compared: pairs.length,
        unchanged,
        counts: {
            moved: moves.length,
            rose: risers.length,
            fell: fallers.length,
            added: addedOut.length,
            dropped: droppedOut.length,
            posChanged: posChanged.length
        },
        moves,
        risers,
        fallers,
        added: addedOut,
        dropped: droppedOut,
        posChanged
    };
}

// Every reported change (moved, added, dropped, changed position) by normalized name, for looking
// up a roster's players. A name can map to more than one change (two players sharing a name).
export function changesByName(result) {
    const map = new Map();
    if (!result) return map;
    [...result.moves, ...result.added, ...result.dropped, ...result.posChanged].forEach(c => {
        if (!map.has(c.cleanName)) map.set(c.cleanName, []);
        map.get(c.cleanName).push(c);
    });
    return map;
}

// The change for one rostered player, or null. A position on both sides must agree, so a roster's
// WR doesn't pick up a same-named RB's move.
export function findPlayerChange(byName, name, pos) {
    const list = byName.get(normalizeName(name));
    if (!list) return null;
    const p = pos ? String(pos).toUpperCase() : null;
    return list.find(c => !p || !c.pos || c.pos === p || (c.old && c.old.pos === p)) || null;
}

// "RB18" (position rank), or "#40" (overall rank: asked for, or the only rank there is).
export function rankLabel(side, basis = 'pos') {
    if (!side) return '';
    if (basis !== 'overall' && side.posRank !== null && side.posRank !== undefined) {
        return side.pos ? `${side.pos}${side.posRank}` : `#${side.posRank}`;
    }
    if (side.rank !== null && side.rank !== undefined) return `#${side.rank}`;
    return side.pos ? `${side.pos}, unranked` : 'unranked';
}
