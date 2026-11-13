// --- WAIVERS OR FREE AGENT (improvements S34) ---
// Sleeper's public API has each league's waiver settings but no "on waivers" flag per player, so this works it out
// from the rules below (checked against the owner's leagues' transactions, weeks 7-10 of 2026; sources in
// docs/improvements/LOG.md, S34):
//   - An unrostered player is a free agent (first come, first served) unless one of these holds.
//   - Dropped within the league's waiver_clear_days: on waivers until about drop + that many days. Sleeper clears
//     each dropped player on his own clock (claims landed 23 h after a drop in 1-day leagues, 47 h in 2-day ones).
//   - His game has started this week: locked on waivers until the weekly run, the end of waiver_day_of_week
//     (Sleeper's "Tue After Day": 2 = Tuesday, Sunday = 0, so the run is Wednesday) at daily_waivers_hour, Pacific
//     time (Wed 12:0x AM PT in the hour-0 leagues, 9:02 AM PT where the hour is 9). No free-agent add in weeks 7-10
//     came after that player's kickoff.
//   - A dropped player whose clear time is after his kickoff locks at kickoff, so he clears at the weekly run.
// tooLateThisWeek: he's on waivers and his game kicks off before he clears, so he can't play for you this week.
// Once the week's last game is over, nothing is too late: the Wednesday run comes before next week's games.
//
// Pure: no DOM, no State. Loaded by bestAvailable.js and waivers.js, and by tests/unit/waiverStatus.test.mjs.

export const WAIVER_TZ = 'America/Los_Angeles';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// A game is over about four hours after kickoff; used only to tell when the whole week is done.
const GAME_LENGTH = 4 * HOUR;

const CLAIM_TYPES = { 0: 'rolling', 1: 'reverse', 2: 'faab' };
export const CLAIM_TYPE_NAMES = { rolling: 'rolling waivers', reverse: 'reverse standings', faab: 'FAAB' };

const num = (v, fallback = null) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// The waiver settings kept on a synced league (league.waivers), from Sleeper's league `settings`. null when the
// response has none of them (the app then shows no chip for that league).
export function waiverSettingsFrom(settings) {
    if (!settings || typeof settings !== 'object' || num(settings.waiver_type) === null) return null;
    return {
        type: CLAIM_TYPES[settings.waiver_type] || 'rolling',
        budget: num(settings.waiver_budget),
        clearDays: num(settings.waiver_clear_days, 0),
        dayOfWeek: num(settings.waiver_day_of_week, 2),
        daily: settings.daily_waivers === 1,
        hour: num(settings.daily_waivers_hour, 0),
        // Sleeper's per-day schedule for daily waivers, two bits a day. Kept as it comes (not decoded: see LOG).
        days: num(settings.daily_waivers_days)
    };
}

// The wall-clock parts of a moment in a time zone.
function zonedParts(ms, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    const p = {};
    f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second, wd };
}

// The moment a wall-clock time in a time zone happens (y, m 1-12, d, h).
function zonedTime(y, m, d, h, tz) {
    let guess = Date.UTC(y, m - 1, d, h);
    for (let i = 0; i < 2; i++) {
        const p = zonedParts(guess, tz);
        const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
        guess += Date.UTC(y, m - 1, d, h) - asUtc;
    }
    return guess;
}

// The next weekly waiver run after `after` (ms): the day after waiver_day_of_week, at the run hour, Pacific time.
export function nextWeeklyRun(waivers, after) {
    const runDay = ((num(waivers && waivers.dayOfWeek, 2) + 1) % 7 + 7) % 7;
    const hour = num(waivers && waivers.hour, 0);
    const today = zonedParts(after, WAIVER_TZ);
    for (let i = 0; i <= 7; i++) {
        const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
        if (day.getUTCDay() !== runDay) continue;
        const at = zonedTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, WAIVER_TZ);
        if (at > after) return at;
    }
    return zonedTime(today.y, today.m, today.d + 7, hour, WAIVER_TZ);
}

const toMs = (v) => (v == null ? null : (typeof v === 'number' ? v : (Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)));

// player: { cleanName, team }. waivers: league.waivers (waiverSettingsFrom). drops: { cleanName: dropped at (ms) },
// this league's recent drops (null when the transactions couldn't be read: the answer is then null too, so no chip
// says "Free agent" about a player who may be on waivers). kickoffs: { team: ISO or ms }, this NFL week's.
// Returns null when the app can't tell, else { status: 'free' | 'waivers', clearsAt, tooLateThisWeek, reason,
// kickoff, claimType }. reason: 'dropped' | 'played' (waivers) or null (free agent).
export function waiverStatus(player, waivers, drops, kickoffs, now) {
    if (!player || !waivers || !drops) return null;
    const claimType = waivers.type;
    const ko = toMs(kickoffs && player.team ? kickoffs[player.team] : null);
    const allKickoffs = Object.values(kickoffs || {}).map(toMs).filter(v => v != null);
    const weekOver = allKickoffs.length > 0 && Math.max(...allKickoffs) + GAME_LENGTH < now;

    let clearsAt = null;
    let reason = null;
    let atRun = false; // clears at the weekly run (else on his own drop clock)
    const dropped = toMs(drops[player.cleanName]);
    const dropClears = dropped != null && waivers.clearDays > 0 ? dropped + waivers.clearDays * DAY : null;
    if (ko != null && ko <= now) {
        // His game has started (or is over): locked until the weekly run.
        clearsAt = nextWeeklyRun(waivers, now);
        reason = 'played';
        atRun = true;
        // A later drop clock (dropped after the run's eve) keeps him on waivers longer.
        if (dropClears != null && dropClears > clearsAt) { clearsAt = dropClears; reason = 'dropped'; atRun = false; }
    } else if (dropClears != null && dropClears > now) {
        reason = 'dropped';
        // Still on waivers at kickoff: he locks then, until the run after it.
        clearsAt = dropClears;
        if (ko != null && dropClears > ko) {
            const run = nextWeeklyRun(waivers, ko);
            if (run >= dropClears) { clearsAt = run; atRun = true; }
        }
    }
    if (clearsAt == null) return { status: 'free', clearsAt: null, tooLateThisWeek: false, reason: null, atRun, kickoff: ko, claimType };
    const tooLateThisWeek = !weekOver && ko != null && ko < clearsAt;
    return { status: 'waivers', clearsAt, tooLateThisWeek, reason, atRun, kickoff: ko, claimType };
}

// "Wed 12 AM", "Sat 5 PM", "Sun 1:25 PM", in the viewer's time zone (tz for tests).
export function shortWhen(ms, tz) {
    const opts = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
    if (tz) opts.timeZone = tz;
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)).replace(':00', '').replace(/ /g, ' ');
}

// The chip's tap text. Plain text (escape before putting it in an attribute).
export function waiverStatusText(st, tz) {
    if (!st) return '';
    if (st.status === 'free') {
        const lock = st.kickoff != null ? ` until his game starts (${shortWhen(st.kickoff, tz)})` : '';
        return `Free agent: add him now on Sleeper${lock}, no claim needed.`;
    }
    const type = CLAIM_TYPE_NAMES[st.claimType] || 'waivers';
    const why = st.reason === 'played' ? 'his game has started, so Sleeper locks him until the weekly run'
        : st.atRun ? 'dropped lately, and his game starts before he clears, so Sleeper locks him until the weekly run'
        : "dropped lately, so he's on waivers for the league's set number of days";
    const when = st.atRun ? `runs ${shortWhen(st.clearsAt, tz)}` : `clears about ${shortWhen(st.clearsAt, tz)}`;
    return `Waivers (${type}) · ${when}: ${why}.${!st.tooLateThisWeek ? '' : st.reason === 'played' ? ' Too late for this week.' : ' Too late for this week: his game is before then.'}`;
}
