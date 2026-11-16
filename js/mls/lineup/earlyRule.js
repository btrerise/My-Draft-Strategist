// Which teams play early this week, from the week's kickoffs (improvements S50). No imports, so node --test can load it
// (tests/unit/earlyRule.test.mjs). js/mls/lineup/earlyGames.js fills the Early Games list from it.
//
// The owner's rule (2026-11-15): a game is early when it kicks off before 1:00 PM Eastern on the week's main Sunday,
// so Thursday, Friday and Saturday games and the international morning games; Monday night isn't. It's worked out in
// Eastern time whatever the device's time zone, so a phone in Phoenix or London fills the same teams. The main Sunday
// is the Sunday (Eastern) with the most kickoffs, which also places a Wednesday (Christmas) game or a week-18 Saturday
// before it. A week with no Sunday games (none so far) falls back to Wednesday through Saturday.

const EASTERN = 'America/New_York';
const ONE_PM = 13 * 60;

let fmt = null;
// { date: 'YYYY-MM-DD', weekday: 'Sun', minutes } for an ISO kickoff in Eastern time, or null for an unreadable one.
export function easternParts(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return null;
    fmt = fmt || new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// gameTimesByTeam ({ team: ISO kickoff }, as State keeps it) -> the early teams, sorted by kickoff then name.
export function earlyTeamsFromKickoffs(gameTimesByTeam) {
    const rows = Object.entries(gameTimesByTeam || {})
        .map(([team, iso]) => ({ team, iso, et: easternParts(iso) }))
        .filter(r => r.et);
    const sundays = {};
    rows.forEach(r => { if (r.et.weekday === 'Sun') sundays[r.et.date] = (sundays[r.et.date] || 0) + 1; });
    const mainSunday = Object.keys(sundays).sort((a, b) => sundays[b] - sundays[a] || a.localeCompare(b))[0];
    const isEarly = ({ et }) => mainSunday
        ? et.date < mainSunday || (et.date === mainSunday && et.minutes < ONE_PM)
        : ['Wed', 'Thu', 'Fri', 'Sat'].includes(et.weekday);
    return rows.filter(isEarly)
        .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso) || a.team.localeCompare(b.team))
        .map(r => r.team);
}

// The swaps the Early Game Reminder asks for (round 3, owner's choice: "Check Sleeper's slots"). An early starter whose
// game hasn't started, sitting in a slot that takes several positions (FLEX, SFLEX, W/R, W/T), is worth swapping with a
// starter in his own position's slot whose game is later and who can play that flex slot: the flex slot then holds the
// later game, the one with room to change. starters: [{ slot, player }] with slot a type ('FLEX', Sleeper's lineup) or
// a label ('FLEX1', this app's lineup). slotPositions: SLOT_POSITIONS (js/mls/constants.js). Returns
// [{ early, earlySlot, later, laterSlot }], the latest-kicking partner first when there are several.
export const slotTypeOf = (slot) => String(slot || '').replace(/\d+$/, '');
export function earlySwaps(starters, { slotPositions, isEarly, kickoffMs, started }) {
    const list = (starters || []).filter(s => s && s.player);
    const used = new Set();
    const swaps = [];
    list.forEach(s => {
        const p = s.player, type = slotTypeOf(s.slot), takes = slotPositions[type];
        if (!takes || takes.length < 2 || !isEarly(p) || started(p)) return;
        const pk = kickoffMs(p);
        if (!Number.isFinite(pk)) return;
        let best = null;
        list.forEach(t => {
            const q = t.player, own = slotPositions[slotTypeOf(t.slot)];
            if (t === s || used.has(t) || !own || own.length !== 1 || own[0] !== p.pos || !takes.includes(q.pos) || started(q)) return;
            const qk = kickoffMs(q);
            if (!Number.isFinite(qk) || qk <= pk) return;
            if (!best || qk > best.qk) best = { t, qk };
        });
        if (!best) return;
        used.add(best.t);
        swaps.push({ early: p, earlySlot: type, later: best.t.player, laterSlot: slotTypeOf(best.t.slot) });
    });
    return swaps;
}
