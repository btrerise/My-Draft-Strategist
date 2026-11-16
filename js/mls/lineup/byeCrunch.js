// Bye Crunch (improvements S52): a coming week when byes leave a starting slot you can't fill from your roster.
// Pure: no State, no DOM, so tests/unit/byeCrunch.test.mjs runs it in Node. gameInfo.js's getByeCrunch supplies the
// league's slots, roster, the bye table and the weeks to look at, and lineupIssueItems (issues.js) words it.
//
// The owner's choices (S52): the next 2 NFL weeks (from Sleeper's week: during week 10, weeks 11 and 12; on Tuesday,
// once week 10's games are over, still 11 and 12, the coming week); only a slot nobody available can fill (not one
// you'd fill with an unranked player); a note on the league's Dashboard card and in the Lineup tab's box, never
// counted in "N lineups need you" (a heads-up, not a lineup to set).
import { SLOT_POSITIONS } from '../constants.js';

// How many weeks after Sleeper's current one to check (owner's choice: the next 2).
export const CRUNCH_WEEKS_AHEAD = 2;

// The optimizer's slot order (bestLineup / fillLineup in js/mls/scout/waiverScanner.js): strict slots first, then
// W/R, W/T, FLEX and SFLEX. The matching below fills them in this order, so a shortage lands on the strict slot
// ("1 RB short") when the flex slots behind it can still be filled by someone else.
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'WRRB', 'WRTE', 'FLEX', 'SFLEX', 'K', 'DEF'];
const accepts = (slotType, pos) => !!(SLOT_POSITIONS[slotType] && SLOT_POSITIONS[slotType].includes(pos));

// Statuses that keep a player out now, assumed to last through the weeks checked (and the text says so). Doubtful
// and Questionable are game-time calls this week, so a week or two out they count as available.
export const OUT_NOW = ['OUT', 'IR', 'PUP', 'SUS', 'NFI'];

// Who could start in a coming week: not on the taxi squad; in your Sleeper IR slot only when healthy (you'd
// activate him); not out now.
export const couldStart = (p) => !!p && !p.isTaxi && !(p.isReserve && p.inj) && !OUT_NOW.includes(p.inj);

// The starting slots no available player can fill: { slotType: count }. A maximum matching of slots to players
// (augmenting paths, filled in SLOT_ORDER), so a FLEX that a spare RB can take isn't short just because a WR is on
// bye, and the answer never depends on who your rankings would start.
// reqs: { QB: 1, RB: 2, ... }; players: the available players; posOf(p): his position.
export function shortSlots(reqs, players, posOf = (p) => p.pos) {
    const slots = [];
    SLOT_ORDER.forEach(t => { for (let i = 0; i < ((reqs && reqs[t]) || 0); i++) slots.push(t); });
    const pos = players.map(posOf);
    const holder = new Array(players.length).fill(-1); // player index -> slot index
    const tryFill = (si, seen) => {
        for (let pi = 0; pi < players.length; pi++) {
            if (seen[pi] || !accepts(slots[si], pos[pi])) continue;
            seen[pi] = true;
            if (holder[pi] === -1 || tryFill(holder[pi], seen)) { holder[pi] = si; return true; }
        }
        return false;
    };
    const short = {};
    slots.forEach((t, si) => { if (!tryFill(si, new Array(players.length).fill(false))) short[t] = (short[t] || 0) + 1; });
    return short;
}

// One week's crunch: the slots the week's byes leave short, beyond what's short already without them (an empty TE
// slot with no TE on the roster is the Lineup box's "TE slot is empty", every week, not a bye problem).
// reqs: the league's slots; roster: its players ({ id, name, pos, team, inj, isTaxi, isReserve });
// week: the NFL week; ctx: { byeWeek(team) -> week or null, posOf(p) (optional) }.
// Returns [{ week, slotType, short, onBye: [players], out: [players], pos, total }], in slot order:
//   short   how many of that slot type can't be filled
//   onBye   the players who could fill that slot type and are on bye that week (roster order)
//   out     those out now (assumed still out) or injured in your IR slot, who'd otherwise fill it
//   pos     for a strict slot, its position ('RB'); null for a flex slot
//   total   for a strict slot, how many of that position you have who could start but for the week's bye
export function byeCrunchWeek(reqs, roster, week, ctx) {
    const posOf = ctx.posOf || ((p) => p.pos);
    const pool = (roster || []).filter(p => p && !p.isTaxi);
    const healthy = pool.filter(couldStart);
    const onBye = (p) => p.team != null && ctx.byeWeek(p.team) === week;
    const without = shortSlots(reqs, healthy, posOf);
    const withByes = shortSlots(reqs, healthy.filter(p => !onBye(p)), posOf);
    const out = [];
    SLOT_ORDER.forEach(slotType => {
        const short = (withByes[slotType] || 0) - (without[slotType] || 0);
        if (short <= 0) return;
        const fits = (p) => accepts(slotType, posOf(p));
        const strict = (SLOT_POSITIONS[slotType] || []).length === 1 && SLOT_POSITIONS[slotType][0] === slotType;
        out.push({
            week, slotType, short,
            onBye: healthy.filter(p => fits(p) && onBye(p)),
            out: pool.filter(p => fits(p) && !couldStart(p)),
            pos: strict ? slotType : null,
            total: strict ? healthy.filter(fits).length : null,
        });
    });
    return out;
}

// The crunch for each week in weeks, in week order: byeCrunchWeek's entries, flattened.
export function byeCrunch(reqs, roster, weeks, ctx) {
    return (weeks || []).flatMap(w => byeCrunchWeek(reqs, roster, w, ctx));
}

// The weeks Bye Crunch looks at: the CRUNCH_WEEKS_AHEAD weeks after Sleeper's current week, within the regular
// season (lastWeek, the last week with a bye or the league's last regular-season week). Sleeper's week stays on a
// finished week until Wednesday, so on Tuesday "next week" is already the coming one (the S34 rule).
export function crunchWeeks(currentWeek, lastWeek = 18) {
    if (currentWeek == null || currentWeek === '') return [];
    const w = Number(currentWeek);
    if (!Number.isFinite(w) || w < 0) return [];
    const weeks = [];
    for (let i = 1; i <= CRUNCH_WEEKS_AHEAD; i++) if (w + i <= lastWeek) weeks.push(w + i);
    return weeks;
}

// Feather user-minus, before a Bye Crunch item (orange, the BYE badge's color): a player short. Not the calendar,
// which is the SoS badge's icon on phones.
export const CRUNCH_ICON = `<svg class="mls-crunch-icon" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;

const names = (ps) => {
    const n = ps.map(p => String((p && p.name) || 'Unknown player').replace(/ /g, ' '));
    return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};
const OUT_PHRASES = { OUT: 'is Out', IR: 'is on IR', PUP: 'is on PUP', SUS: 'is suspended', NFI: 'is on NFI' };

// One entry's headline: "Bye Crunch · Week 13: 1 RB short (3 of your 4 RBs on bye)". The players are crunchDetails'
// lines, one per bullet (owner's request, S52 round 2: names in one sentence ran together). slotName turns a slot type
// into its label ('WRTE' -> 'W/T').
export function crunchText(c, slotName = (t) => t) {
    const what = `${c.short} ${slotName(c.slotType)} short`;
    let count = '';
    if (c.onBye.length && c.pos != null) {
        const pl = (n) => `${c.pos}${n === 1 ? '' : 's'}`;
        count = c.total === c.onBye.length ? (c.total === 1 ? ` (your only ${pl(1)} on bye)` : ` (all ${c.total} of your ${pl(c.total)} on bye)`)
            : ` (${c.onBye.length} of your ${c.total} ${pl(c.total)} on bye)`;
    }
    return `Bye Crunch · Week ${c.week}: ${what}${count}`;
}

// One line per player behind it: "Derrick Henry (BAL) on bye" (a team defense without its team again), then who's out
// now: "Joe Mixon is on IR, assumed still out"; an injured player still in your IR slot "is in your IR slot".
export function crunchDetails(c) {
    const team = (p) => (p.team && p.pos !== 'DEF' && !String(p.name || '').includes(p.team) ? ` (${p.team})` : '');
    return [
        ...c.onBye.map(p => `${names([p])}${team(p)} on bye`),
        ...c.out.map(p => `${names([p])} ${OUT_PHRASES[p.inj] || (p.isReserve ? 'is in your IR slot' : `is ${p.inj}`)}, assumed still out`),
    ];
}

// An item's player lines as a bulleted list (S52 round 2), for the league card and the Lineup box; '' without any.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function crunchListHTML(item) {
    const lines = (item && item.details) || [];
    return lines.length ? `<ul class="mls-crunch-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
}
