// --- WAIVERS OR FREE AGENT (improvements S34) ---
// Sleeper's public API has each league's waiver settings but no "on waivers" flag per player, so this works it out
// (checked against the owner's leagues' transactions, weeks 7-10 of 2026, and their Sleeper settings screens; sources
// in docs/improvements/LOG.md, S34, rounds 1, 6 and 7). All times are Pacific (Sleeper's; it shows them in the viewer's
// zone, e.g. "1 AM MST" for 12 AM PT).
//   - The day's schedule (daily_waivers_days, daily-waiver leagues only; round 7): each day is Free Agency (players
//     are free agents), Waivers (every unrostered player needs a claim; claims run at daily_waivers_hour), Locked (no
//     adds; claims wait for the next run), or Waivers until the hour, then Free Agency. A weekly-waiver league is
//     Free Agency every day. Claims also run at 12 AM when a Free Agency day starts.
//   - His game has started: locked until "After games waivers clear" (waiver_day_of_week: 0 None, 1 Tuesday,
//     2 Wednesday... at 12 AM PT), then the day's schedule applies (a Waivers day: that day's run).
//   - Dropped: on waivers for waiver_clear_days, on his own clock (23 h / 47 h in 1- and 2-day leagues), then the day's
//     schedule. A guillotine cut (round 6) clears with the after-games run instead.
// tooLateThisWeek: on waivers, and his game kicks off before he can be had, so he can't play for you this week. Once
// the week's last game is over, nothing is too late: claims then are for next week.
//
// Pure: no DOM, no State. Loaded by bestAvailable.js, waivers.js and state.js (via recentDrops.js), and by
// tests/unit/waiverStatus.test.mjs.

export const WAIVER_TZ = 'America/Los_Angeles';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// A game is over about four hours after kickoff; used only to tell when the whole week is done.
const GAME_LENGTH = 4 * HOUR;

const CLAIM_TYPES = { 0: 'rolling', 1: 'reverse', 2: 'faab' };
export const CLAIM_TYPE_NAMES = { rolling: 'rolling', reverse: 'reverse standings', faab: 'FAAB' };

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
        // Sleeper's per-day schedule for daily waivers, two bits a day (dayCode below).
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

// A day's code in a league's daily schedule (round 7, decoded from the owner's three Sleeper settings screens against
// daily_waivers_days): two bits a day, read from the low end Sunday, Saturday, Friday ... Monday.
// 0 Free Agency, 1 Waivers, 2 Locked, 3 Waivers until the run hour, then Free Agency. Weekly-waiver leagues: 0.
export const DAY_FA = 0, DAY_WAIVERS = 1, DAY_LOCKED = 2, DAY_WAIVERS_THEN_FA = 3;
export function dayCode(waivers, wd) {
    if (!waivers || !waivers.daily || num(waivers.days) === null) return DAY_FA;
    return (waivers.days >> (2 * ((7 - wd) % 7))) & 3;
}

// The PT calendar day `i` days after the one `ms` falls in: { y, m, d, wd } and its moment at hour h.
function ptDay(ms, i) {
    const p = zonedParts(ms, WAIVER_TZ);
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    return { wd: day.getUTCDay(), at: (h) => zonedTime(y, m, d, h, WAIVER_TZ) };
}

// Free agency or waivers at a moment, by the day's schedule: 'fa' | 'waivers' | 'locked'.
export function modeAt(waivers, t) {
    const day = ptDay(t, 0);
    const code = dayCode(waivers, day.wd);
    if (code === DAY_FA) return 'fa';
    if (code === DAY_LOCKED) return 'locked';
    if (code === DAY_WAIVERS_THEN_FA) return t >= day.at(num(waivers.hour, 0)) ? 'fa' : 'waivers';
    return 'waivers';
}

// "After games waivers clear": the next such moment after t (12 AM PT on the day after waiver_day_of_week), or null
// when the league has none (waiver_day_of_week 0; Gridiron Best Ball, whose Monday and Tuesday are Locked anyway).
export function afterGamesAt(waivers, t) {
    const dow = num(waivers && waivers.dayOfWeek, 2);
    if (dow === 0) return null;
    const runDay = (dow + 1) % 7;
    for (let i = 0; i <= 8; i++) {
        const day = ptDay(t, i);
        if (day.wd !== runDay) continue;
        const at = day.at(0);
        if (at > t) return at;
    }
    return null;
}

// The next time claims run at or after t: a Waivers day's run hour, or 12 AM when a Free Agency day follows a day
// that wasn't one. A weekly-waiver league runs only at the after-games time.
export function nextRunAt(waivers, t) {
    if (!waivers.daily) return afterGamesAt(waivers, t - 1);
    const hour = num(waivers.hour, 0);
    for (let i = 0; i <= 8; i++) {
        const day = ptDay(t, i);
        const code = dayCode(waivers, day.wd);
        let at = null;
        if (code === DAY_WAIVERS || code === DAY_WAIVERS_THEN_FA) at = day.at(hour);
        else if (code === DAY_FA && dayCode(waivers, (day.wd + 6) % 7) !== DAY_FA) at = day.at(0);
        if (at != null && at >= t) return at;
    }
    return null;
}

// When a player whose own hold (his game, his drop) ends at t can be had: at t itself on a Free Agency day (as a free
// agent; fromRun false), else at the next run (fromRun true).
function openAt(waivers, t) {
    if (modeAt(waivers, t) === 'fa') return { at: t, fromRun: false };
    const run = nextRunAt(waivers, t);
    return run == null ? { at: t, fromRun: false } : { at: run, fromRun: true };
}

// When everyone who played this week can be had again (the Tuesday line, bestAvailable.js): the after-games time,
// or the next run after it on a Waivers day; with no after-games setting, the next run.
export function nextWeeklyRun(waivers, after) {
    // From the latest after-games time (it can have passed while its run hasn't: Wednesday 8 AM in a 9 AM league).
    let ag = afterGamesAt(waivers, after - 7 * DAY - 1);
    if (ag == null) return nextRunAt(waivers, after);
    for (let i = 0; i < 3; i++) {
        const open = openAt(waivers, ag).at;
        if (open > after) return open;
        ag = afterGamesAt(waivers, ag);
    }
    return openAt(waivers, ag).at;
}

// The week's games are over: every kickoff is more than a game's length ago (kickoffs: { team: ISO or ms }). From then
// until Sleeper's week moves on (Wednesday about 12 AM PT, with the weekly run; LOG S34 round 3) the claims you make
// are for next week, so the Weekly checks stop holding kickoffs against anyone (round 4). False without kickoffs.
export function isWeekOver(kickoffs, now) {
    const all = Object.values(kickoffs || {}).map(toMs).filter(v => v != null);
    return all.length > 0 && Math.max(...all) + GAME_LENGTH < now;
}

const toMs = (v) => (v == null ? null : (typeof v === 'number' ? v : (Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)));

// player: { cleanName, team }. waivers: league.waivers (waiverSettingsFrom). drops: { cleanName: dropped at (ms) },
// this league's recent drops (null when the transactions couldn't be read: the answer is then null too, so no chip
// says "Free agent" about a player who may be on waivers). kickoffs: { team: ISO or ms }, this NFL week's.
// Returns null when the app can't tell, else { status: 'free' | 'waivers', clearsAt, tooLateThisWeek, reason,
// kickoff, claimType }. reason: 'dropped' | 'played' (waivers) or null (free agent).
export function waiverStatus(player, waivers, drops, kickoffs, now) {
    if (!player || !waivers || !drops) return null;
    // No kickoff times (ESPN's scoreboard didn't load): the app can't tell who has played, and a wrong "add now" is worse
    // than no chip (round 3), so no answer, as when the transactions fail.
    if (!kickoffs || Object.keys(kickoffs).length === 0) return null;
    const claimType = waivers.type;
    const ko = toMs(kickoffs && player.team ? kickoffs[player.team] : null);
    const weekOver = isWeekOver(kickoffs, now);

    const entry = drops[player.cleanName];
    const chopped = !!(entry && typeof entry === 'object' && entry.chopped);
    const dropped = toMs(entry && typeof entry === 'object' ? entry.at : entry);

    // His own hold, if any: his game (locked until the after-games time) or his drop clock (a cut: the after-games time).
    let hold = null, reason = null;
    if (ko != null && ko <= now) {
        const ag = afterGamesAt(waivers, ko);
        if (ag != null && ag > now) { hold = ag; reason = 'played'; }
    }
    const dropClears = dropped == null ? null
        : chopped ? (afterGamesAt(waivers, dropped) ?? nextRunAt(waivers, dropped))
        : waivers.clearDays > 0 ? dropped + waivers.clearDays * DAY : null;
    if (dropClears != null && dropClears > now && (hold == null || dropClears > hold)) {
        hold = dropClears; reason = 'dropped';
        // Still on waivers at his kickoff: he locks then, until the after-games time.
        if (ko != null && ko > now && dropClears > ko) {
            const ag = afterGamesAt(waivers, ko);
            if (ag != null && ag > hold) hold = ag;
        }
    }

    let clearsAt, atRun;
    if (hold != null) {
        const open = openAt(waivers, hold);
        clearsAt = open.at;
        // "until Wed 12 AM" for a run or the after-games time; "until about Sat 5 PM" for a drop clock.
        atRun = open.fromRun || hold !== dropClears || chopped;
    } else {
        // No hold of his own: the day's schedule.
        const mode = modeAt(waivers, now);
        if (mode === 'fa') return { status: 'free', clearsAt: null, tooLateThisWeek: false, reason: null, atRun: false, weekOver, kickoff: ko, claimType };
        reason = mode === 'locked' ? 'locked' : 'waiverDay';
        clearsAt = nextRunAt(waivers, now);
        atRun = true;
        if (clearsAt == null) return null;
    }
    const tooLateThisWeek = !weekOver && ko != null && ko < clearsAt;
    return { status: 'waivers', clearsAt, tooLateThisWeek, reason, atRun, weekOver, kickoff: ko, droppedAt: reason === 'dropped' ? dropped : null, chopped: reason === 'dropped' && chopped, claimType };
}

// "Wed 12 AM", "Sat 5 PM", "Sun 1:25 PM", in the viewer's time zone (tz for tests).
export function shortWhen(ms, tz) {
    const opts = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
    if (tz) opts.timeZone = tz;
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)).replace(':00', '').replace(/ /g, ' ');
}

// The chip's tap text. Plain text (escape before putting it in an attribute).
// Short, in three parts (S34 round 2, after a review as a user: the first version ran to four lines and said "too late"
// twice): until when and the claim type; why (dropped when, or his game has started); "Too late for this week."
//   "On waivers until Wed 12 AM (FAAB). Dropped Sat 9 AM; locked at his Sun 1:25 PM kickoff. Too late for this week."
//   "On waivers until Wed 12 AM (FAAB). His game has started. Too late for this week."
//   "On waivers until about Sat 5 PM (FAAB). Dropped Thu 5 PM."
//   "Free agent: add now, until his Sun 1:25 PM kickoff."
export function waiverStatusText(st, tz) {
    if (!st) return '';
    if (st.status === 'free') {
        return st.kickoff != null && st.kickoff > 0 ? `Free agent: add now, until his ${shortWhen(st.kickoff, tz)} kickoff.` : 'Free agent: add now, no claim needed.';
    }
    const type = CLAIM_TYPE_NAMES[st.claimType] || 'waivers';
    const head = `On waivers until ${st.atRun ? '' : 'about '}${shortWhen(st.clearsAt, tz)} (${type}).`;
    // Claims run then on a waiver day; "until" reads as when he's free (round 7).
    const dropped = st.droppedAt != null ? `${st.chopped ? 'Chopped' : 'Dropped'} ${shortWhen(st.droppedAt, tz)}` : null;
    let why;
    // Once the week's games are over everyone who played is on waivers until the run (round 3: "His game has started"
    // read oddly on a Tuesday).
    if (st.reason === 'played' && st.weekOver) return `On waivers until ${shortWhen(st.clearsAt, tz)} (${type}), like everyone who played this week.`;
    if (st.reason === 'played') why = 'His game has started.';
    else if (st.reason === 'waiverDay') why = 'A waiver day in this league: every pickup is a claim.';
    else if (st.reason === 'locked') why = 'Adds are locked today in this league.';
    else if (st.atRun && st.kickoff != null) why = `${dropped || 'Dropped lately'}; locked at his ${shortWhen(st.kickoff, tz)} kickoff.`;
    else why = `${dropped || 'Dropped lately'}.`;
    return `${head} ${why}${st.tooLateThisWeek ? ' Too late for this week.' : ''}`;
}
