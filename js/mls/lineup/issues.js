// What on a lineup needs you before kickoff (improvements S11). One rule for the Lineup tab's warnings
// above the lineup (getLineupInjuryWarningHTML and getLineupIrSlotWarningHTML in ./gameInfo.js) and the
// Dashboard's "lineups need you" box (js/mls/render/dashboard.js), so the two can't disagree. Pure: no
// State, no DOM, so tests/unit/lineupIssues.test.mjs runs it in Node. gameInfo.js's getLineupIssues
// supplies the State-backed parts (statuses, kickoffs, byes).
import { SLOT_POSITIONS, slotDisplayName } from '../constants.js';

const slotTypeOf = (slot) => String(slot || '').replace(/[0-9]/g, '');
const accepts = (slotType, pos) => !!(SLOT_POSITIONS[slotType] && SLOT_POSITIONS[slotType].includes(pos));

// The Scout tab's Top Available position chip that finds a player for a slot type: strict slots their own
// position, the RB/WR/TE flex slots FLEX, SFLEX (QB too) All.
const FIND_CHIP = { FLEX: 'FLEX', WRTE: 'FLEX', WRRB: 'FLEX', SFLEX: 'ALL' };
export const findChipFor = (slotType) => FIND_CHIP[slotType] || slotType;

// starters: a lineup's [{ slot, player }] (player null for an empty slot); bench: its bench players. ctx:
//   bestBall      true for a Best Ball league: nobody sets a lineup there, so nothing is listed.
//   outStatuses   short injury statuses that count as unlikely to play (SIM_EXCLUDE_STATUSES).
//   kickedOff(p)  true once his game has started: nothing left to change, so he's left out.
//   onBye(p)      true when his team is on bye this week.
//   kickoffMs(p)  his game's kickoff in ms, or NaN when unknown (for the urgency).
// Returns:
//   injured, irSlot, bye  starters, in lineup order. A starter who's injured AND in your IR slot is listed
//                         as injured only: telling you to activate a player who's out is a mixed signal
//                         (owner's decision, S11 round 3). One already injured isn't listed on bye too.
//   empty                 slot types ('TE', 'FLEX'...) of empty starting slots.
//   swaps                 [{ out, in }]: for an injured or bye starter, the best healthy bench player who can
//                         take his slot (owner's choice: suggest, don't decide). Each bench player once.
//   find                  Top Available chips ('RB', 'FLEX'...) for slots nobody on your bench can fill: an
//                         injured or bye starter with no swap, or an empty slot. A pickup, not a swap.
//   firstKickoffMs        the earliest kickoff among the listed starters (NaN when none is known).
// The Lineup tab draws injured (with its swaps) and irSlot; the Dashboard reads it all.
export function lineupIssues(starters, ctx, bench = []) {
    const issues = { injured: [], irSlot: [], bye: [], empty: [], swaps: [], find: [], firstKickoffMs: NaN };
    if (!starters || ctx.bestBall) return issues;
    const outOf = (p) => ctx.outStatuses.includes(p.inj);
    const canStepIn = (q) => q && !q.isTaxi && !q.isReserve && !outOf(q) && !ctx.onBye(q) && !ctx.kickedOff(q);
    const used = new Set();
    const addFind = (chip) => { if (chip && !issues.find.includes(chip)) issues.find.push(chip); };
    const noteKickoff = (p) => {
        const ms = ctx.kickoffMs ? ctx.kickoffMs(p) : NaN;
        if (Number.isFinite(ms) && !(issues.firstKickoffMs <= ms)) issues.firstKickoffMs = ms;
    };
    // His position first, best position rank; then anyone else the slot takes, best FLEX rank.
    const replacementFor = (p, slotType) => {
        const rank = (v) => (Number.isFinite(v) ? v : 999);
        const pool = (bench || []).filter(q => canStepIn(q) && !used.has(q.id) && accepts(slotType, q.pos));
        pool.sort((a, b) => ((a.pos === p.pos ? 0 : 1) - (b.pos === p.pos ? 0 : 1))
            || (a.pos === p.pos ? rank(a.posRank) - rank(b.posRank) : rank(a.flexRank) - rank(b.flexRank) || rank(a.posRank) - rank(b.posRank)));
        return pool[0] || null;
    };
    const swapOrFind = (p, slotType) => {
        const q = replacementFor(p, slotType);
        if (q) { used.add(q.id); issues.swaps.push({ out: p, in: q }); }
        else addFind(findChipFor(slotType));
    };
    starters.forEach(s => {
        if (!s) return;
        const p = s.player;
        const slotType = slotTypeOf(s.slot);
        if (!p) {
            if (slotType) { issues.empty.push(slotType); addFind(findChipFor(slotType)); }
            return;
        }
        if (ctx.kickedOff(p)) return;
        if (outOf(p)) {
            issues.injured.push(p);
            noteKickoff(p);
            swapOrFind(p, slotType);
        } else if (ctx.onBye(p)) {
            issues.bye.push(p);
            swapOrFind(p, slotType);
        } else if (p.isReserve) {
            issues.irSlot.push(p);
            noteKickoff(p);
        }
    });
    return issues;
}

export const hasLineupIssues = (issues) =>
    !!issues && (issues.injured.length + issues.irSlot.length + issues.bye.length + issues.empty.length) > 0;

export const swapFor = (issues, p) => (issues.swaps.find(x => x.out === p) || {}).in || null;

// "A", "A and B", "A, B and C".
export function joinAnd(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// The short statuses in SIM_EXCLUDE_STATUSES, spelled out for a sentence ("Josh Allen is Doubtful").
// The Lineup tab keeps its own short form ("is D"); this is the Dashboard's wording.
const STATUS_PHRASES = {
    D: 'is Doubtful', OUT: 'is Out', IR: 'is on IR', PUP: 'is on PUP', SUS: 'is suspended',
    NFI: 'is on NFI', DNR: "hasn't reported",
};
export const statusPhrase = (inj) => STATUS_PHRASES[inj] || `is ${inj}`;

// What to do in one league, as [{ kind, text }] (kind: 'ir', 'injured', 'bye' or 'empty', for the item's
// color; the caller escapes text: player names are Sleeper's):
// "Activate Ja'Marr Chase from IR", "Justin Jefferson is Doubtful: start CeeDee Lamb instead?",
// "Derrick Henry is Out", "Tee Higgins is on bye", "TE slot is empty".
// Activations first (Sleeper won't start him until you do it), then injuries, byes and empty slots.
// Player names use no-break spaces, so a phone wraps the line between words but never inside a name.
export function lineupIssueItems(issues) {
    if (!hasLineupIssues(issues)) return [];
    const name = (p) => String((p && p.name) || 'Unknown player').replace(/ /g, ' ');
    const instead = (p) => { const q = swapFor(issues, p); return q ? `: start ${name(q)} instead?` : ''; };
    const items = [];
    if (issues.irSlot.length) items.push({ kind: 'ir', text: `Activate ${joinAnd(issues.irSlot.map(name))} from IR` });
    issues.injured.forEach(p => items.push({ kind: 'injured', text: `${name(p)} ${statusPhrase(p.inj)}${instead(p)}` }));
    issues.bye.forEach(p => items.push({ kind: 'bye', text: `${name(p)} is on bye${instead(p)}` }));
    if (issues.empty.length) {
        // Counted per slot type, in lineup order: "TE slot is empty", "2 FLEX and TE slots are empty".
        const counts = new Map();
        issues.empty.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
        const labels = [...counts].map(([t, n]) => (n > 1 ? `${n} ` : '') + slotDisplayName(t));
        items.push({ kind: 'empty', text: `${joinAnd(labels)} ${issues.empty.length > 1 ? 'slots are' : 'slot is'} empty` });
    }
    return items;
}

// Which buttons a league's line gets (owner's choice): Open lineup when its Lineup tab can act on it (an
// activation, or a suggested swap), and a Find button per position nobody on the bench can fill.
export const needsLineupButton = (issues) => issues.irSlot.length > 0 || issues.swaps.length > 0;

// Your lineup against the one on Sleeper (as of the last sync): who to start there and who to bench.
// optimizedIds, sleeperIds: starter id lists. Empty lists both ways means they match.
export function sleeperLineupChanges(optimizedIds, sleeperIds) {
    const opt = new Set(optimizedIds), slp = new Set(sleeperIds);
    return { start: [...opt].filter(id => !slp.has(id)), bench: [...slp].filter(id => !opt.has(id)) };
}
