// What on a lineup needs you before kickoff (improvements S11). One rule for the Lineup tab's warnings
// above the lineup (getLineupInjuryWarningHTML and getLineupIrSlotWarningHTML in ./gameInfo.js) and the
// Dashboard's "lineups need you" box after Optimize All and Sync All (js/mls/render/dashboard.js), so
// the two can't disagree. Pure: no State, no DOM, so tests/unit/lineupIssues.test.mjs runs it in Node.
// gameInfo.js's getLineupIssues supplies the State-backed parts (statuses, kickoffs, byes).
import { slotDisplayName } from '../constants.js';

// starters: a lineup's [{ slot, player }] (player null for an empty slot). ctx:
//   bestBall     true for a Best Ball league: nobody sets a lineup there, so nothing is listed.
//   outStatuses  short injury statuses that count as unlikely to play (SIM_EXCLUDE_STATUSES).
//   kickedOff(p) true once his game has started: nothing left to change, so he's left out.
//   onBye(p)     true when his team is on bye this week.
// Returns { injured, irSlot, bye, empty }: players for the first three, in lineup order, and slot
// types ('TE', 'FLEX'...) for empty starting slots. A player can be both injured and in the IR slot
// (the Lineup tab shows both lines then); one already listed as injured isn't listed as on bye too.
// The Lineup tab draws only injured and irSlot; bye and empty are the Dashboard's (owner's choice).
export function lineupIssues(starters, ctx) {
    const issues = { injured: [], irSlot: [], bye: [], empty: [] };
    if (!starters || ctx.bestBall) return issues;
    starters.forEach(s => {
        if (!s) return;
        const p = s.player;
        if (!p) {
            if (s.slot) issues.empty.push(String(s.slot).replace(/[0-9]/g, ''));
            return;
        }
        if (ctx.kickedOff(p)) return;
        const injured = ctx.outStatuses.includes(p.inj);
        if (injured) issues.injured.push(p);
        if (p.isReserve) issues.irSlot.push(p);
        if (!injured && ctx.onBye(p)) issues.bye.push(p);
    });
    return issues;
}

export const hasLineupIssues = (issues) =>
    !!issues && (issues.injured.length + issues.irSlot.length + issues.bye.length + issues.empty.length) > 0;

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

// What to do in one league, as plain-text items (the caller escapes them: player names are Sleeper's):
// "Activate Ja'Marr Chase from IR", "Josh Allen is Doubtful", "Tee Higgins is on bye", "TE slot is empty".
// Activations first (Sleeper won't start him until you do it), then injuries, byes and empty slots.
// Player names use no-break spaces, so a phone wraps the line between words but never inside a name.
export function lineupIssueItems(issues) {
    if (!hasLineupIssues(issues)) return [];
    const name = (p) => String(p.name || 'Unknown player').replace(/ /g, '\u00a0');
    const items = [];
    if (issues.irSlot.length) items.push(`Activate ${joinAnd(issues.irSlot.map(name))} from IR`);
    issues.injured.forEach(p => items.push(`${name(p)} ${statusPhrase(p.inj)}`));
    issues.bye.forEach(p => items.push(`${name(p)} is on bye`));
    if (issues.empty.length) {
        // Counted per slot type, in lineup order: "TE slot is empty", "2 FLEX and TE slots are empty".
        const counts = new Map();
        issues.empty.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
        const labels = [...counts].map(([t, n]) => (n > 1 ? `${n} ` : '') + slotDisplayName(t));
        items.push(`${joinAnd(labels)} ${issues.empty.length > 1 ? 'slots are' : 'slot is'} empty`);
    }
    return items;
}
