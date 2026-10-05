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
export function getFreshness(timestamp, staleAfterDays, verb = 'Updated') {
    if (!timestamp) return null;
    const ms = Date.now() - Number(timestamp);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    let label;
    if (days <= 0) label = `${verb} today`;
    else if (days === 1) label = `${verb} yesterday`;
    else label = `${verb} ${days} days ago`;
    return { label, isStale: days > staleAfterDays };
}
