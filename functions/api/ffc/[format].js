// --- FANTASY FOOTBALL CALCULATOR ADP PROXY (CLOUDFLARE PAGES FUNCTION) ---
// Serves GET /api/ffc/<format> (refactor chunk 7A). Draft Strategist's Quick-Start and Fetch
// Market Value call this instead of fantasyfootballcalculator.com because FFC's API sends no
// Access-Control-Allow-Origin header, so a browser can't read its replies from our origin.
// Server-to-server there's no such rule. FFC's terms: free for personal and commercial use,
// with a link or mention as credit (the app credits FFC next to both buttons), and "don't call
// it too often; the data updates once per day" -- hence the caching below.
//
// FFC computes ADP from mock drafts on its site over a recent window it picks itself (no date
// parameter exists). In the summer that's thousands of drafts and ~250 players including K and
// DEF; once the season starts the window thins out to a few dozen players. So this function
// remembers the last FULL list per format (KV binding FFC_LISTS, optional) and serves it when
// today's live list is short. Without the binding it still works, it just can't fall back.
//
// Response: { source: 'live' | 'saved', short: boolean, savedAt, liveCount, meta, players }
//   source 'saved' = today's list was short (or FFC failed) and this is the last full list,
//   captured at savedAt. short = true when the list being served is itself under FULL_LIST_MIN
//   (no full list saved yet). players are FFC's rows unchanged: { name, position, team, bye,
//   adp, ... } with position 'PK' for kickers and 'DEF' for team defenses.
// Errors: { error } with 404 (unknown format) or 502 (FFC unreachable and nothing saved).

// Formats offered. FFC also has 'dynasty' and 'rookie', but even in August their lists are far
// from a draft pool (2025: 85 and 34 players), so they're left out.
export const FFC_FORMATS = ['standard', 'half-ppr', 'ppr', '2qb'];

// A list with at least this many players counts as a full draft pool. In-season 2025 lists ran
// 156-249; the thin post-kickoff 2026 ones 29-200 (2QB pools its window over a whole month).
export const FULL_LIST_MIN = 150;

const FFC_TIMEOUT_MS = 10000;
const EDGE_CACHE_SECONDS = 6 * 60 * 60;
const BROWSER_CACHE_SECONDS = 60 * 60;
// Re-save a full list at most this often, keeping KV writes far under the free plan's 1,000/day.
const RESAVE_AFTER_MS = 20 * 60 * 60 * 1000;

function json(body, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders }
    });
}

// FFC's league-size parameter doesn't change its numbers (8/10/12/14 return the same list), so
// every request asks for 12 teams and lists are keyed by format alone.
async function fetchLive(format, year) {
    const url = `https://fantasyfootballcalculator.com/api/v1/adp/${format}?teams=12&year=${year}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FFC_TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.status !== 'Success' || !Array.isArray(data.players)) throw new Error('unexpected response');
    return { meta: data.meta || {}, players: data.players };
}

export async function onRequestGet(context) {
    const { request, params, env } = context;
    const waitUntil = typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : () => {};
    const format = String(params.format || '').toLowerCase();
    if (!FFC_FORMATS.includes(format)) {
        return json({ error: `Unknown format "${format}". Use one of: ${FFC_FORMATS.join(', ')}.` }, 404);
    }

    const year = new Date().getUTCFullYear();
    const cache = (typeof caches !== 'undefined' && caches.default) || null;
    const cacheKey = new Request(new URL(`/api/ffc/${format}?year=${year}`, request.url).toString());
    if (cache) {
        const hit = await cache.match(cacheKey);
        if (hit) {
            const res = new Response(hit.body, hit);
            res.headers.set('cache-control', `public, max-age=${BROWSER_CACHE_SECONDS}`);
            return res;
        }
    }

    let live = null;
    let liveError = null;
    try {
        live = await fetchLive(format, year);
    } catch (err) {
        liveError = err;
    }

    const store = env && env.FFC_LISTS ? env.FFC_LISTS : null;
    const kvKey = `ffc:${format}`;
    const now = new Date().toISOString();
    let body;

    if (live && live.players.length >= FULL_LIST_MIN) {
        body = { source: 'live', short: false, savedAt: now, liveCount: live.players.length, meta: live.meta, players: live.players };
        if (store) {
            waitUntil((async () => {
                const prev = await store.get(kvKey, 'json');
                if (prev && prev.savedAt && Date.now() - Date.parse(prev.savedAt) < RESAVE_AFTER_MS) return;
                await store.put(kvKey, JSON.stringify({ savedAt: now, meta: live.meta, players: live.players }));
            })().catch(() => {}));
        }
    } else {
        const saved = store ? await store.get(kvKey, 'json').catch(() => null) : null;
        if (saved && Array.isArray(saved.players) && saved.players.length) {
            body = { source: 'saved', short: false, savedAt: saved.savedAt, liveCount: live ? live.players.length : null, meta: saved.meta || {}, players: saved.players };
        } else if (live) {
            body = { source: 'live', short: true, savedAt: now, liveCount: live.players.length, meta: live.meta, players: live.players };
        } else {
            return json({ error: `Fantasy Football Calculator couldn't be reached (${liveError && liveError.message}).` }, 502);
        }
    }

    const res = json(body, 200, { 'cache-control': `public, max-age=${BROWSER_CACHE_SECONDS}` });
    if (cache && live) {
        // Edge copy for 6h: FFC only updates daily. Not cached when FFC failed, so the next
        // request tries it again.
        const edgeCopy = new Response(res.clone().body, res);
        edgeCopy.headers.set('cache-control', `public, max-age=${EDGE_CACHE_SECONDS}`);
        waitUntil(cache.put(cacheKey, edgeCopy).catch(() => {}));
    }
    return res;
}
