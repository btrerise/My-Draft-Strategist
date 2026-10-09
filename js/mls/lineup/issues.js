// What on a lineup needs you before kickoff (improvements S11). One rule for the Lineup tab's "This lineup needs
// you" box (gameInfo.js) and the Dashboard's "lineups need you" box (js/mls/render/dashboard.js), so the two can't
// disagree. Pure: no State, no DOM, so tests/unit/lineupIssues.test.mjs runs it in Node. gameInfo.js's
// getLineupIssues supplies the State-backed parts (statuses, kickoffs, byes, locks, the league's IR rules).
import { SLOT_POSITIONS, slotDisplayName } from '../constants.js';

const slotTypeOf = (slot) => String(slot || '').replace(/[0-9]/g, '');
const accepts = (slotType, pos) => !!(SLOT_POSITIONS[slotType] && SLOT_POSITIONS[slotType].includes(pos));

// The Scout tab's Top Available position chip that finds a player for a slot type: strict slots their own
// position, the RB/WR/TE flex slots FLEX, SFLEX (QB too) All.
const FIND_CHIP = { FLEX: 'FLEX', WRTE: 'FLEX', WRRB: 'FLEX', SFLEX: 'ALL' };
export const findChipFor = (slotType) => FIND_CHIP[slotType] || slotType;

// "A", "A and B", "A, B and C" (or "or").
export function joinAnd(items, word = 'and') {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}

// May a player with this short status sit in this league's IR slot? NFL Injured Reserve always; Out, Doubtful,
// Suspended, DNR, COVID and NA only where the league allows them (Sleeper's reserve_allow_* settings, recorded
// at sync as irRules.allow). PUP and NFI: unknown (null), since it isn't clear which setting covers them, so the
// box neither suggests moving them to IR nor says they must come out. Healthy and Questionable: no.
export function irEligible(inj, irRules) {
    if (!irRules) return null;
    if (inj === 'IR') return true;
    if (inj === 'PUP' || inj === 'NFI') return null;
    if (!inj || inj === 'Q') return false;
    return irRules.allow ? irRules.allow[inj] === true : null;
}

// starters: a lineup's [{ slot, player }] (player null for an empty slot); bench: its bench players. ctx:
//   bestBall      true for a Best Ball league: nobody sets a lineup there, so nothing is listed.
//   outStatuses   short injury statuses that count as unlikely to play (SIM_EXCLUDE_STATUSES).
//   kickedOff(p)  true once his game has started: nothing left to change, so he's left out.
//   onBye(p)      true when his team is on bye this week.
//   kickoffMs(p)  his game's kickoff in ms, or NaN when unknown (for the urgency).
//   kept(p)       true when you locked him in (a lock, or a swap, which locks): your call, so he's shown muted.
//   irRules       the league's IR slot ({ slots, allow }, from Sleeper) or null (manual leagues, old syncs).
//   rosterSize    starting + bench spots (Sleeper's roster_positions), or null.
// Returns:
//   injured, bye   starters (not kept), in lineup order; one injured isn't also listed on bye.
//   kept           [{ player, what }]: injured or bye starters you locked in ("is Doubtful", "is on bye").
//   irSlot         healthy-enough starters still in your Sleeper IR slot: activate them. One who's injured is
//                  listed as injured only (owner's decision, S11 round 3).
//   irStuck        bench players in your IR slot who aren't eligible there any more (healthy, Questionable, or a
//                  status this league's IR doesn't take): Sleeper blocks adds and drops until they come out.
//   moveToIr       bench players whose status this league's IR takes, while an IR slot is open: room to free.
//   irSlotsOpen    open IR slots (0 when unknown).
//   rosterFull     no open active spot, so an activation needs a drop first (false when unknown).
//   empty          slot types ('TE', 'FLEX'...) of empty starting slots.
//   swaps          [{ out, in }]: for an injured or bye starter, the best healthy bench player who can take his
//                  slot (owner's choice: suggest, don't decide). Each bench player once.
//   noSwap         [{ player, slotType }]: injured or bye starters nobody on the bench can replace.
//   firstKickoffMs the earliest kickoff among the injured and IR-slot starters (NaN when none is known).
export function lineupIssues(starters, ctx, bench = []) {
    const issues = { injured: [], bye: [], kept: [], irSlot: [], irStuck: [], moveToIr: [], irSlotsOpen: 0, rosterFull: false,
        empty: [], swaps: [], noSwap: [], firstKickoffMs: NaN };
    if (!starters || ctx.bestBall) return issues;
    const outOf = (p) => ctx.outStatuses.includes(p.inj);
    const kept = (p) => !!(ctx.kept && ctx.kept(p));
    const canStepIn = (q) => q && !q.isTaxi && !q.isReserve && !outOf(q) && !ctx.onBye(q) && !ctx.kickedOff(q);
    const used = new Set();
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
    const swapOrPickup = (p, slotType) => {
        const q = replacementFor(p, slotType);
        if (q) { used.add(q.id); issues.swaps.push({ out: p, in: q }); }
        else issues.noSwap.push({ player: p, slotType });
    };

    starters.forEach(s => {
        if (!s) return;
        const p = s.player;
        const slotType = slotTypeOf(s.slot);
        if (!p) {
            if (slotType) issues.empty.push(slotType);
            return;
        }
        if (ctx.kickedOff(p)) return;
        if (outOf(p) || ctx.onBye(p)) {
            if (kept(p)) { issues.kept.push({ player: p, what: outOf(p) ? statusPhrase(p.inj) : 'is on bye' }); return; }
            if (outOf(p)) { issues.injured.push(p); noteKickoff(p); } else issues.bye.push(p);
            swapOrPickup(p, slotType);
        } else if (p.isReserve) {
            issues.irSlot.push(p);
            noteKickoff(p);
        }
    });

    // The IR slot itself, where the league's rules are known (Sleeper leagues synced since round 4).
    const roster = ctx.roster || [];
    if (ctx.irRules) {
        const starting = new Set(starters.filter(s => s && s.player).map(s => s.player.id));
        const inReserve = roster.filter(p => p.isReserve);
        issues.irSlotsOpen = Math.max(0, (ctx.irRules.slots || 0) - inReserve.length);
        inReserve.forEach(p => {
            if (!starting.has(p.id) && !ctx.kickedOff(p) && irEligible(p.inj, ctx.irRules) === false) issues.irStuck.push(p);
        });
        if (issues.irSlotsOpen > 0) {
            roster.forEach(p => {
                if (p.isReserve || p.isTaxi || starting.has(p.id) || ctx.kickedOff(p)) return;
                if (irEligible(p.inj, ctx.irRules) === true) issues.moveToIr.push(p);
            });
        }
    }
    if (Number.isFinite(ctx.rosterSize) && ctx.rosterSize > 0) {
        issues.rosterFull = roster.filter(p => !p.isReserve && !p.isTaxi).length >= ctx.rosterSize;
    }
    return issues;
}

export const swapFor = (issues, p) => (issues.swaps.find(x => x.out === p) || {}).in || null;

// The short statuses, spelled out for a sentence ("Josh Allen is Doubtful"), on both the Lineup tab and the
// Dashboard (owner's choice, S11 round 4; the Lineup tab used to say "is D").
const STATUS_PHRASES = {
    D: 'is Doubtful', OUT: 'is Out', IR: 'is on IR', PUP: 'is on PUP', SUS: 'is suspended',
    NFI: 'is on NFI', DNR: "hasn't reported",
};
export const statusPhrase = (inj) => STATUS_PHRASES[inj] || `is ${inj}`;

// "RB", "RB, WR or TE": who can take a slot, for "no healthy RB on your bench".
const slotWho = (slotType) => joinAnd(SLOT_POSITIONS[slotType] || [slotType], 'or');

// What to do, one item per thing: [{ kind, text, muted?, note?, swap?: { out, in }, find?: chip }]. kind is for
// the item's color: 'ir' (the IR badge's purple: activations and moves), 'injured' (red), 'bye', 'empty', 'kept'
// (muted). Neither a muted item (a starter you kept) nor a note (an IR move: a tip, not a job before kickoff;
// owner's choice, S11 round 6) counts toward "needs you". text is plain (the caller escapes it: player names are Sleeper's); names use no-break
// spaces, so a phone wraps between words but never inside a name. Order: activations (Sleeper won't start him
// until you do it), injuries, byes, empty slots, IR moves, then what you kept.
export function lineupIssueItems(issues) {
    const name = (p) => String((p && p.name) || 'Unknown player').replace(/ /g, ' ');
    const full = issues.rosterFull ? ' (roster full: drop someone first)' : '';
    const items = [];
    issues.irSlot.forEach(p => items.push({ kind: 'ir', text: `Activate ${name(p)} from IR on Sleeper${full}` }));
    issues.irStuck.forEach(p => items.push({ kind: 'ir',
        text: `Activate ${name(p)} from IR: no longer eligible, and it blocks your adds and drops${full}` }));
    const startOrPickup = (p, what) => {
        const q = swapFor(issues, p);
        if (q) return { text: `${name(p)} ${what}: start ${name(q)} instead?`, swap: { out: p, in: q } };
        const miss = issues.noSwap.find(x => x.player === p);
        const slotType = miss ? miss.slotType : p.pos;
        return { text: `${name(p)} ${what}: no healthy ${slotWho(slotType)} on your bench`, find: findChipFor(slotType) };
    };
    issues.injured.forEach(p => items.push({ kind: 'injured', ...startOrPickup(p, statusPhrase(p.inj)) }));
    issues.bye.forEach(p => items.push({ kind: 'bye', ...startOrPickup(p, 'is on bye') }));
    // Counted per slot type, in lineup order: "TE slot is empty", "2 FLEX slots are empty".
    const counts = new Map();
    issues.empty.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
    counts.forEach((n, t) => items.push({ kind: 'empty', find: findChipFor(t),
        text: `${n > 1 ? `${n} ` : ''}${slotDisplayName(t)} ${n > 1 ? 'slots are' : 'slot is'} empty` }));
    const more = issues.moveToIr.length > issues.irSlotsOpen
        ? ` (${issues.irSlotsOpen} IR slot${issues.irSlotsOpen === 1 ? '' : 's'} open)` : '';
    issues.moveToIr.forEach(p => items.push({ kind: 'ir', note: true, text: `Move ${name(p)} to IR to free a spot${more}` }));
    issues.kept.forEach(k => items.push({ kind: 'kept', muted: true, text: `${name(k.player)} ${k.what} (you locked him in)` }));
    return items;
}

// Something to do before kickoff (not only starters you kept, or IR moves).
export const needsYou = (items) => items.some(i => !i.muted && !i.note);

// Which buttons a league's Dashboard line gets (owner's choice): Open lineup when its Lineup tab can act on it
// (a suggested swap, or a starter to activate), and a Find button per position nobody on the bench can fill.
export const needsLineupButton = (issues) => issues.irSlot.length > 0 || issues.swaps.length > 0;
export const findChips = (items) => [...new Set(items.filter(i => i.find && !i.muted).map(i => i.find))];

// Your lineup against the one on Sleeper (as of the last sync): who to start there and who to bench.
// optimizedIds, sleeperIds: starter id lists. Empty lists both ways means they match.
export function sleeperLineupChanges(optimizedIds, sleeperIds) {
    const opt = new Set(optimizedIds), slp = new Set(sleeperIds);
    return { start: [...opt].filter(id => !slp.has(id)), bench: [...slp].filter(id => !opt.has(id)) };
}
