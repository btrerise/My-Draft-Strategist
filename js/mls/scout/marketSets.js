// --- MARKET VALUES, ONE SET PER FORMAT (improvements S38) ---
// Market Consensus used to be one set, from the last fetch, whatever league you were looking at. Now each fetch is
// also kept under its format (redraft or dynasty, 1QB or Superflex, PPR, TE premium, league size), so every league's
// Trade Analyzer and Trade Finder read values priced for it, and switching leagues brings that league's set back
// without a new download (owner's choice, 2026-11-11; it settles the S23 follow-up "Keep market values for each
// format"). State.marketRankings stays the set in use; the sets live under KEYS.mls.marketSets.
// Pure: no DOM, no State (tests/unit/marketSets.test.mjs). scout/marketDisconnect.js does the fetching and storing.
import { fcTeamSize } from '../../shared/api/market.js';

// As old as the site's own copy may get (functions/api/fantasycalc.js refreshes each format every three hours), so
// asking again sooner would only return the same values.
export const MARKET_MAX_AGE_MS = 3 * 60 * 60 * 1000;
// Sets kept: about 20 KB each. The oldest goes when a seventh arrives.
export const MARKET_SETS_MAX = 6;

// The format a fetch asks for: the Market Consensus settings (which follow the active league, leagues/sync.js) and
// the league's size as FantasyCalc has it.
export function marketFormatOf(settings, teamCount) {
    const s = settings || {};
    return {
        type: s.type === 'dynasty' ? 'dynasty' : 'redraft',
        qbs: String(s.qbs) === '2' ? '2' : '1',
        ppr: ['0', '0.5', '1'].includes(String(s.ppr)) ? String(s.ppr) : '1',
        tep: !!s.tep,
        teams: fcTeamSize(teamCount),
    };
}

// A format's name in the store. null for anything that isn't a whole format: values saved before sets were kept
// carry no league size, so they match no league and the next Analyze fetches.
export function marketFormatKey(format) {
    if (!format || !format.type || format.qbs === undefined || format.ppr === undefined || !format.teams) return null;
    return [format.type, String(format.qbs), String(format.ppr), format.tep ? 'tep' : 'none', String(format.teams)].join('|');
}

export function isMarketStale(updatedAt, now = Date.now()) {
    const at = Number(updatedAt);
    return !at || now - at >= MARKET_MAX_AGE_MS;
}

// sets with this one added or replaced: { [key]: { format, rows, updatedAt } }, the newest `max` of them.
export function putMarketSet(sets, format, rows, updatedAt, max = MARKET_SETS_MAX) {
    const key = marketFormatKey(format);
    if (!key) return sets || {};
    const all = { ...(sets || {}), [key]: { format, rows, updatedAt: Number(updatedAt) } };
    const keep = Object.keys(all).sort((a, b) => (all[b].updatedAt || 0) - (all[a].updatedAt || 0)).slice(0, max);
    return Object.fromEntries(keep.map(k => [k, all[k]]));
}

// What Analyze Trade should do about market values before it runs.
//   want: the active league's format. active: { rows, format, updatedAt }, the set in use (format null after a file
//   upload). sets: the store. auto: "Fetch market values automatically" (Value settings).
// Returns 'none' (use what's loaded), 'cached' (switch to the stored set for this format) or 'fetch'.
//   - An uploaded file is the user's own data: never replaced here.
//   - The loaded set is this league's and under three hours old: nothing to do.
//   - A stored set for this format that's fresh: use it, switch or no switch (it costs nothing).
//   - Otherwise fetch when the switch is on; with it off, an older stored set for this format still beats another
//     format's values.
export function marketPlan({ want, active, sets, auto, now = Date.now() }) {
    const rows = (active && active.rows) || [];
    if (rows.length > 0 && !(active && active.format)) return 'none';
    const key = marketFormatKey(want);
    if (!key) return 'none';
    const loaded = rows.length > 0 && marketFormatKey(active.format) === key;
    if (loaded && !isMarketStale(active.updatedAt, now)) return 'none';
    const stored = sets && sets[key] && sets[key].rows && sets[key].rows.length > 0 ? sets[key] : null;
    if (stored && !isMarketStale(stored.updatedAt, now)) return loaded ? 'none' : 'cached';
    if (auto) return 'fetch';
    return stored && !loaded ? 'cached' : 'none';
}
