// --- FANTASYCALC MARKET VALUES (CLOUDFLARE PAGES FUNCTION) ---
// Serves GET /api/fantasycalc?isDynasty=&numQbs=&numTeams=&ppr=&tep= (improvements K8). Lineup Strategist's
// Market Consensus (Trade Finder's Fetch Market Value, the Roster tab's ROS Auto-Fetch) calls this instead of
// api.fantasycalc.com, because FantasyCalc's Terms of Usage (fantasycalc.com/terms-of-usage, effective 2026-10-10)
// and API docs (fantasycalc.com/api-docs) ask sites using its values to:
//   - cache responses and reuse them across users and requests, refreshing each unique set of query parameters
//     no more than once every three hours (one browser fetching it for itself doesn't count);
//   - call only GET /values/current without written permission (this function calls nothing else);
//   - show "FantasyCalc" with a link near the data (the page's job: js/mls/trade/verdict.js and lineup/index.html);
//   - get written permission at 1,000 monthly active users or more (docs/improvements/LOG.md, K8, has the reminder).
//
// Parameters are FantasyCalc's own names and values (its API docs, read 2026-11-07); anything else answers 400, so
// the function can't be used to fetch other things or fill the cache with junk keys. That's at most
// 2 x 2 x 4 x 3 x 3 = 144 cache entries.
//
// Cache: one copy per parameter set in Cloudflare's edge cache (caches.default), kept for a day, with the time it
// was fetched. Under three hours old it's served as it is; older, FantasyCalc is asked again, and if that fails the
// older copy is served (marked stale) rather than an error. Nothing is stored about who asked.
//
// Response: FantasyCalc's rows cut down to what the app reads, [{ player: { name, position }, overallRank }], so a
// phone downloads ~10 KB instead of ~200 KB. Errors: { error } with 400 (bad parameters) or 502 (FantasyCalc
// unreachable and nothing cached).

export const FC_PARAMS = {
    isDynasty: ['true', 'false'],
    numQbs: ['1', '2'],
    numTeams: ['8', '10', '12', '14'],
    ppr: ['0', '0.5', '1'],
    tep: ['none', 'te+', 'te++'],
};
// The order the parameters go upstream and into the cache key, so one parameter set always makes one key.
const PARAM_ORDER = ['isDynasty', 'numQbs', 'numTeams', 'ppr', 'tep'];

export const FRESH_MS = 3 * 60 * 60 * 1000;
const KEEP_SECONDS = 24 * 60 * 60;
const BROWSER_CACHE_SECONDS = 60 * 60;
const FC_TIMEOUT_MS = 10000;
const FC_URL = 'https://api.fantasycalc.com/values/current';

function json(body, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders }
    });
}

// The query string, checked and put in a fixed order, or { error }. Every parameter is required (FantasyCalc
// defaults some, but a missing one would make a second cache key for the same answer).
export function readParams(searchParams) {
    for (const key of searchParams.keys()) {
        if (!PARAM_ORDER.includes(key)) return { error: `Unknown parameter "${key}".` };
    }
    const out = [];
    for (const key of PARAM_ORDER) {
        const values = searchParams.getAll(key);
        if (values.length !== 1) return { error: `"${key}" is required once.` };
        if (!FC_PARAMS[key].includes(values[0])) return { error: `"${key}" must be one of: ${FC_PARAMS[key].join(', ')}.` };
        out.push([key, values[0]]);
    }
    return { query: new URLSearchParams(out).toString() };
}

async function fetchLive(query) {
    const res = await fetch(`${FC_URL}?${query}`, { signal: AbortSignal.timeout(FC_TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('unexpected response');
    return data
        .filter(r => r && r.player && r.player.name)
        .map(r => ({ player: { name: r.player.name, position: r.player.position || '' }, overallRank: r.overallRank }));
}

export async function onRequestGet(context) {
    const { request } = context;
    const waitUntil = typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : () => {};
    const { query, error } = readParams(new URL(request.url).searchParams);
    if (error) return json({ error }, 400);

    const cache = (typeof caches !== 'undefined' && caches.default) || null;
    const cacheKey = new Request(new URL(`/api/fantasycalc?${query}`, request.url).toString());
    let cached = null;
    if (cache) {
        const hit = await cache.match(cacheKey);
        if (hit) {
            const fetchedAt = Number(hit.headers.get('x-fc-fetched-at')) || 0;
            cached = { fetchedAt, body: await hit.text() };
            if (Date.now() - fetchedAt < FRESH_MS) return reply(cached.body, fetchedAt, false);
        }
    }

    let rows;
    try {
        rows = await fetchLive(query);
    } catch (err) {
        if (cached) return reply(cached.body, cached.fetchedAt, true);
        return json({ error: `FantasyCalc couldn't be reached (${err && err.message}).` }, 502);
    }

    const fetchedAt = Date.now();
    const body = JSON.stringify(rows);
    if (cache) {
        const copy = new Response(body, { headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': `public, max-age=${KEEP_SECONDS}`,
            'x-fc-fetched-at': String(fetchedAt),
        } });
        waitUntil(cache.put(cacheKey, copy).catch(() => {}));
    }
    return reply(body, fetchedAt, false);
}

function reply(body, fetchedAt, stale) {
    return new Response(body, { headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${stale ? 300 : BROWSER_CACHE_SECONDS}`,
        'x-fc-fetched-at': String(fetchedAt),
        'x-fc-stale': stale ? '1' : '0',
    } });
}
