// "Updated 3 days ago" labels, shared in refactor chunk 8B. getFreshness is Lineup Strategist's
// getRankingsFreshness (js/mls/rankings/engine.js, RANKINGS ENGINE), moved as is under a neutral name.
// Used by Lineup Strategist (rankings, market data, league sync), Draft Strategist (rankings and ADP
// status lines, js/mds/settings.js) and the T-Score page (sheet data). The label classes are
// .freshness-ok / .freshness-stale in css/base.css. Pure: no load-time side effects.

// --- FRESHNESS LABELS ---
// Formats a stored timestamp into a short relative string, and flags it as "stale" past
// the given threshold (in days) so the UI can call attention to rankings that likely need
// a refresh. Returns null if there's no timestamp at all (e.g. rankings from before this
// tracking existed) so the caller can fall back to a neutral message rather than claim
// false freshness. `verb` swaps the leading word so league rows can read "Synced 4 days
// ago" off the same logic; market data and rankings keep the default "Updated".
//
// Days are calendar days on this device's clock and time zone (the owner's report, 2026-11-06): "today" is since
// your midnight, "yesterday" the day before, so rankings uploaded at 9 PM read "yesterday" the next morning. (Before,
// whole 24-hour periods: "today" until 9 PM the next day.) The stale threshold counts the same days. A timestamp in
// the future (another device's clock) reads as today.
//
// Returns { label, detail, title, isStale }:
//   label   the short form, for headers and chips: "Updated today", "Updated yesterday", "Updated 3 days ago".
//   detail  with the time, for an expanded card's status line: "Updated today at 9:12 AM", "Updated yesterday at
//           9:49 PM", "Updated 3 days ago (Tue, Nov 3 at 9:49 PM)" (the age stays first: it's what a stale warning
//           is about; the date has the year when it isn't this year's).
//   title   the full date and time, for a short label's hover text: "Updated Tuesday, November 3, 2026 at 9:49 PM".
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function getFreshness(timestamp, staleAfterDays, verb = 'Updated') {
    if (!timestamp) return null;
    const at = Number(timestamp);
    const now = Date.now();
    // Math.round: a day that has a daylight-saving change is 23 or 25 hours long.
    const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS));
    let label;
    if (days === 0) label = `${verb} today`;
    else if (days === 1) label = `${verb} yesterday`;
    else label = `${verb} ${days} days ago`;

    const when = new Date(at);
    const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    let detail;
    if (days <= 1) detail = `${label} at ${time}`;
    else {
        const sameYear = when.getFullYear() === new Date(now).getFullYear();
        const date = when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
        detail = `${label} (${date} at ${time})`;
    }
    const full = when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return { label, detail, title: `${verb} ${full} at ${time}`, isStale: days > staleAfterDays };
}
