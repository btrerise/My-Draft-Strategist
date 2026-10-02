// --- FANTASY FOOTBALL CALCULATOR (FFC) ADP CLIENT (ES MODULE) ---
// Added in refactor chunk 7A to replace LeagueLogs (whose public API now answers 410) for
// Draft Strategist's Quick-Start and Fetch Market Value. FFC's API can't be called from a
// browser (no CORS header), so this calls our own Cloudflare Pages Function at /api/ffc/<format>
// (functions/api/ffc/[format].js), which fetches FFC, caches it, and falls back to the last
// full list it saved when today's is short. See that file for the response shape.
//
// window.mdsFetch (js/shared/net.js, assigned by js/shared/globals.js) gives the request its
// timeout; net.js names "Fantasy Football Calculator" in a timeout message for /api/ffc/ URLs.

// Formats Draft Strategist offers, as FFC names them -> the label shown in the app.
export const FFC_FORMAT_LABELS = {
    'ppr': 'PPR',
    'half-ppr': 'Half-PPR',
    'standard': 'Standard',
    '2qb': '2QB/Superflex',
    'rookie': 'Dynasty Rookie'
};

/**
 * Fetches FFC's ADP list for one format through the /api/ffc proxy.
 *
 * @param {string} format - a key of FFC_FORMAT_LABELS
 * @param {{ errorPrefix?: string }} [opts] - errors read "<errorPrefix>: <reason>", so each
 *   caller keeps its own toast wording
 * @returns {Promise<{ source: 'live'|'saved', short: boolean, savedAt: string, liveCount: number|null,
 *   meta: object, players: Array<{ name: string, position: string, team: string, bye: number, adp: number }> }>}
 */
export async function fetchFfcAdp(format, { errorPrefix = 'Fantasy Football Calculator Error' } = {}) {
    const res = await window.mdsFetch(`/api/ffc/${encodeURIComponent(format)}`);
    let body = null;
    try {
        body = await res.json();
    } catch (err) {
        // An HTML page instead of JSON: the proxy isn't deployed here (e.g. a plain static
        // server), or something in between answered. Report the status, not a parse error.
        if (err && err.isTimeout) throw err;
        throw new Error(`${errorPrefix}: ${res.ok ? 'unexpected response' : res.status}`);
    }
    if (!res.ok) throw new Error(`${errorPrefix}: ${(body && body.error) || res.status}`);
    if (!body || !Array.isArray(body.players)) throw new Error(`${errorPrefix}: unexpected response`);
    return body;
}

/** "Sep 12, 2026" for an ISO timestamp, or '' if it doesn't parse. */
export function formatFfcDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
