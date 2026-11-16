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
// Slots Bye Crunch leaves alone (owner's choice, S52 round 3): kickers and defenses are streamed.
export const NOT_CHECKED = ['K', 'DEF'];
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
        // Not K or DEF (owner's choice, S52 round 3): people stream them, so a kicker or defense on bye is routine.
        if (NOT_CHECKED.includes(slotType)) return;
        const short = (withByes[slotType] || 0) - (without[slotType] || 0);
        if (short <= 0) return;
        const fits = (p) => accepts(slotType, posOf(p));
        const strict = (SLOT_POSITIONS[slotType] || []).length === 1 && SLOT_POSITIONS[slotType][0] === slotType;
        out.push({
            week, slotType, short,
            onBye: healthy.filter(p => fits(p) && onBye(p)).map(p => ({ ...p, pos: posOf(p) })),
            out: pool.filter(p => fits(p) && !couldStart(p)).map(p => ({ ...p, pos: posOf(p) })),
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

const OUT_TAGS = { OUT: 'Out', IR: 'on IR', PUP: 'on PUP', SUS: 'suspended', NFI: 'on NFI' };
const outTag = (p) => OUT_TAGS[p.inj] || (p.isReserve ? 'injured in your IR slot' : p.inj);
const nb = (t) => String(t).replace(/ /g, '\u00a0');

// One week's Bye Crunch as a heading, a row per slot type, and a bullet per player (owner's choices: A in round 4, one
// heading per week instead of "Bye Crunch · Week 13:" on every note; bullets again in round 5, since the item now folds
// and a sentence of names was hard to scan).
// entries: one week's byeCrunchWeek entries, in slot order. slotName turns a slot type into its label ('WRTE' -> 'W/T').
// Returns { week, short, text, rows: [{ slotType, head, note, players: [text], text }] }:
//   text     "Bye Crunch · Week 13: 3 starters short"
//   head     "RB: 1 short"; note: a strict slot with several on bye "5 of 6 on bye" ("all 2 on bye"); a flex slot whose
//            players are all in the rows above "the players above"
//   players  "Derrick Henry (BAL)" (the heading says they're on bye); a flex slot's only those the rows above didn't
//            list, with the position, "Brock Bowers (TE, LV)"; who's out now, "George Kittle (TE) · Out, assumed still out"
//   text     the row in one line, for tests: head · note · players
export function crunchGroup(entries, slotName = (t) => t) {
    const week = entries[0].week;
    const short = entries.reduce((n, c) => n + c.short, 0);
    const named = new Set();
    const rows = entries.map(c => {
        const head = `${slotName(c.slotType)}: ${c.short} short`;
        const strict = c.pos != null;
        const bye = strict ? c.onBye : c.onBye.filter(p => !named.has(p.id));
        const out = strict ? c.out : c.out.filter(p => !named.has(p.id));
        const tag = (p) => {
            const bits = [strict ? null : p.pos, p.team && !String(p.name || '').includes(p.team) ? p.team : null].filter(Boolean);
            return bits.length ? ` (${bits.join(', ')})` : '';
        };
        const players = [
            ...bye.map(p => `${nb(p.name || 'Unknown player')}${tag(p)}`),
            ...out.map(p => `${nb(p.name || 'Unknown player')}${strict ? '' : ` (${p.pos})`} · ${outTag(p)}, assumed still out`),
        ];
        let note = '';
        if (strict && c.onBye.length > 1) note = `${c.total === c.onBye.length ? `all ${c.onBye.length}` : `${c.onBye.length} of ${c.total}`} on bye`;
        if (!strict && !players.length && c.onBye.length + c.out.length) note = 'the players above';
        [...c.onBye, ...c.out].forEach(p => named.add(p.id));
        return { slotType: c.slotType, head, note, players, text: [head, note, ...players].filter(Boolean).join(' · ') };
    });
    return { week, short, rows, text: `Bye Crunch · Week ${week}: ${short} starter${short === 1 ? '' : 's'} short` };
}

// byeCrunch's entries (any weeks) as crunchGroup's, one per week in week order.
export function crunchGroups(entries, slotName) {
    const weeks = [...new Set((entries || []).map(c => c.week))];
    return weeks.map(w => crunchGroup(entries.filter(c => c.week === w), slotName));
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A week's rows: the slot ("RB: 1 short", a shade brighter) and its note, the row's Find button (button(row)), then a
// bullet per player.
export function crunchRowsHTML(item, button = () => '') {
    const rows = (item && item.rows) || [];
    const row = (r) => `<span class="mls-crunch-head">${esc(r.head)}</span>${r.note ? ` · ${esc(r.note)}` : ''}${button(r)}`
        + (r.players && r.players.length ? `<ul class="mls-crunch-players">${r.players.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
    return rows.length ? `<ul class="mls-crunch-list">${rows.map(r => `<li>${row(r)}</li>`).join('')}</ul>` : '';
}

// A week's Bye Crunch as a fold, closed to its heading (owner's choices: B on the Lineup tab in round 4, C on the
// Dashboard card in round 5). key: what the renderer remembers it open by; open: whether it was open before a redraw.
// dismiss: the Got it button's HTML (round 7), after the rows.
export function crunchFoldHTML(item, { key, open = false, chevron = '', button, dismiss = '' } = {}) {
    return `<details class="mls-change-fold mls-crunch-fold" data-crunch-key="${esc(key)}"${open ? ' open' : ''}>`
        + `<summary>${chevron}${CRUNCH_ICON}<span>${esc(item.text)}</span></summary>${crunchRowsHTML(item, button)}`
        + (dismiss ? `<p class="mls-crunch-dismiss">${dismiss}</p>` : '') + `</details>`;
}

// The Got it button for a league's week (round 7): hides that week's Bye Crunch for the league until the week has
// passed. leagueName for its label.
export function crunchDismissHTML(leagueId, week, leagueName = 'this league') {
    return `<button type="button" class="btn btn-secondary mls-btn-sm mls-crunch-got-it" data-action="dismissByeCrunch" data-league-id="${esc(leagueId)}" data-week="${esc(week)}" aria-label="Got it: hide week ${esc(week)}'s Bye Crunch in ${esc(leagueName)}">Got it</button> <span class="mls-crunch-dismiss-note">Hides it for week ${esc(week)}</span>`;
}
