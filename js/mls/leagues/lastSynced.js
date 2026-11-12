// The Dashboard's "Last synced" line under Sync All / Optimize All (improvements S46). Pure: no State, no DOM, no
// storage, so tests/unit/lastSynced.test.mjs runs it in Node. js/mls/render/dashboard.js (renderLastSynced) draws it.
//
// Owner's choices (S46, 2026-11-12):
//   - Under Sync All and Optimize All, not in the "need you" strip (which hides when nothing needs you).
//   - The most recent sync across your Sleeper leagues (manual and Draft Strategist hand-off leagues don't count),
//     naming any league whose last sync failed.
//   - Amber within 3 hours before a kickoff when you haven't synced since 6 AM that day, else once it's over a day old.
//   - "9:42 AM" today, "yesterday 8:15 PM", "Sun 8:15 PM" within the last 6 days, "Nov 9" before that (with the
//     year when it isn't this year's). Times and dates in the device's locale and time zone.
import { kickoffWindows } from '../lineup/starterAlertRules.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// "Before a kickoff": this close to a window's first kickoff, a sync from before this morning is too old.
export const KICKOFF_LEAD_MS = 3 * HOUR;
// "That morning" starts at 6 AM, local time, on the kickoff's day.
export const MORNING_HOUR = 6;
// Otherwise amber once the newest sync is this old.
export const STALE_AFTER_MS = DAY;

// Leagues synced from Sleeper (the league cards' isOffSleeper, js/mls/render/leagueCards.js).
export const isSleeperLeague = (l) => !!l && !/^(manual|handoff)_/.test(String(l.leagueId || ''));

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

// When, in the line's words: "9:42 AM", "yesterday 8:15 PM", "Sun 8:15 PM", "Nov 9", "Nov 9, 2025".
export function syncTimeText(atMs, nowMs) {
    const when = new Date(atMs);
    const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    // A time in the future (another device's clock) reads as today. Math.round: DST days are 23 or 25 hours.
    const days = Math.max(0, Math.round((startOfDay(nowMs) - startOfDay(atMs)) / DAY));
    if (days === 0) return time;
    if (days === 1) return `yesterday ${time}`;
    if (days <= 6) return `${when.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
    const sameYear = when.getFullYear() === new Date(nowMs).getFullYear();
    return when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// The window whose first kickoff is in the next KICKOFF_LEAD_MS, or null.
function nextKickoffSoon(gameTimesByTeam, nowMs) {
    return kickoffWindows(gameTimesByTeam).find(w => w.startMs > nowMs && w.startMs - nowMs <= KICKOFF_LEAD_MS) || null;
}

// Whether the newest sync is old enough to show in amber, and why (for the hover text). null when it isn't.
export function staleReason(latestMs, nowMs, gameTimesByTeam) {
    const soon = nextKickoffSoon(gameTimesByTeam, nowMs);
    if (soon) {
        const morning = new Date(soon.startMs);
        morning.setHours(MORNING_HOUR, 0, 0, 0);
        if (latestMs < morning.getTime()) return 'kickoff';
    }
    if (nowMs - latestMs > STALE_AFTER_MS) return 'day';
    return null;
}

// "Fixture League's last sync failed", "Last sync failed: A and B", "Last sync failed in 3 leagues".
export function failedText(names) {
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]}'s last sync failed`;
    if (names.length === 2) return `Last sync failed: ${names[0]} and ${names[1]}`;
    return `Last sync failed in ${names.length} leagues`;
}

// What the line says, or null for no line (no Sleeper league has synced or failed).
// Returns { text, title, stale, failed: { text, title } | null }.
export function lastSyncedSummary(leagues, nowMs, gameTimesByTeam = {}) {
    const sleeper = (leagues || []).filter(isSleeperLeague);
    const synced = sleeper.map(l => Number(l.lastSyncedAt) || 0).filter(ms => ms > 0);
    const failedNames = sleeper.filter(l => l.lastSyncFailedAt).map(l => String(l.name || 'Unnamed league'));
    if (synced.length === 0 && failedNames.length === 0) return null;

    const failed = failedNames.length
        ? { text: failedText(failedNames), title: `Last sync failed: ${failedNames.join(', ')}. Sync All Leagues to try again.` }
        : null;
    if (synced.length === 0) return { text: '', title: '', stale: true, failed };

    const latest = Math.max(...synced);
    const when = new Date(latest);
    const full = `${when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    const reason = staleReason(latest, nowMs, gameTimesByTeam);
    const why = reason === 'kickoff' ? ' A kickoff is less than 3 hours away: Sync All Leagues for the latest injury news.'
        : reason === 'day' ? ' Over a day ago: Sync All Leagues for the latest rosters and injury news.' : '';
    return {
        text: `Last synced ${syncTimeText(latest, nowMs)}`,
        title: `Your most recent Sleeper sync: ${full}.${why}`,
        stale: !!reason,
        failed,
    };
}
