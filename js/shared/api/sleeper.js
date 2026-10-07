// --- SLEEPER API CLIENT (ES MODULE) ---
// Second module pulled out of lineup/mls.js's single IIFE (see js/shared/rankings/parse.js for the first).
// This one is a thin client: every export here is "fetch this endpoint, parse the JSON,
// maybe throw a specific error" -- nothing more. All the business logic that used to sit
// right next to these fetch calls (building league objects, diffing rosters, writing to
// State/localStorage, updating buttons) stays in js/mls/ (and js/mds/) and is unaffected by this
// split; it just calls these functions instead of calling fetch() directly.
//
// Every call here goes through mdsFetch (js/shared/net.js) rather than fetch() directly, so none of
// them can hang forever on a stalled connection. That's the one behavior this file adds on top of a bare fetch; the ok-checks
// and error messages below are still exactly what their original call sites had.
//
// Each function's error-handling (whether it throws on a non-ok response, and with what
// message) intentionally matches whatever its original call site(s) in lineup/mls.js already did,
// even where that's inconsistent across endpoints -- this is a pure extraction, not a pass
// to make error handling more uniform. Where two call sites for the same endpoint disagreed
// (see getSleeperUser), the throwing version was kept here and the more lenient call site
// was updated in lineup/mls.js to explicitly catch and continue, so its original "skip this one
// league, keep going" behavior is preserved on purpose rather than by accident.
import { IDB_DATABASES } from '../storage/keys.js';
import { mdsFetch, MDS_LONG_FETCH_TIMEOUT_MS } from '../net.js';

/**
 * Fetches Sleeper's current NFL state (week, season, etc). Returns null on a non-ok
 * response rather than throwing -- both existing callers (the periodic week-refresh on
 * load, and the season lookup before listing a user's leagues) already treat "no data" as
 * a normal, recoverable case, not an error worth surfacing to the user.
 */
export async function getNflState() {
    const res = await mdsFetch('https://api.sleeper.app/v1/state/nfl');
    return res.ok ? res.json() : null;
}

/**
 * Throws "User not found." on a non-ok response -- matches the original sync-a-league path.
 * Draft Strategist's draft sync passes its own wording as `notFoundMessage` (refactor 2C).
 */
export async function getSleeperUser(username, { notFoundMessage = "User not found." } = {}) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/user/${username}`);
    if (!res.ok) throw new Error(notFoundMessage);
    return res.json();
}

/**
 * Throws "League ID not found." on a non-ok response. `nullIfNotOk` returns null instead:
 * Draft Strategist's draft sync treats the league as optional (a mock draft has none).
 */
export async function getSleeperLeague(leagueId, { nullIfNotOk = false } = {}) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}`);
    if (!res.ok) {
        if (nullIfNotOk) return null;
        throw new Error("League ID not found.");
    }
    return res.json();
}

/**
 * No ok-check by default, matching the original -- a non-ok response's body still gets parsed
 * as JSON. `nullIfNotOk` returns null for a non-ok response instead (Draft Strategist).
 */
export async function getSleeperLeagueUsers(leagueId, { nullIfNotOk = false } = {}) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
    if (nullIfNotOk && !res.ok) return null;
    return res.json();
}

/** No ok-check, matching the original -- a non-ok response's body still gets parsed as JSON. */
export async function getSleeperLeagueRosters(leagueId) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
    return res.json();
}

/** Throws "Could not fetch leagues for this user." on a non-ok response. */
export async function getSleeperUserLeagues(userId, season) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
    if (!res.ok) throw new Error("Could not fetch leagues for this user.");
    return res.json();
}

/**
 * Fetches one league's matchups for a given week: one entry per roster, each with
 * roster_id, matchup_id (rosters sharing a matchup_id are paired against each other that
 * week), starters, players, and points. Throws "Could not fetch matchups for this
 * league/week." on a non-ok response -- matches getSleeperLeague's pattern, since a failure
 * here (e.g. week hasn't been scheduled yet) is worth surfacing rather than silently
 * treating as empty.
 *
 * Also carries players_points -- { player_id: pointsSoFarThisWeek }, covering every player
 * on that roster (not just starters). Sleeper pre-populates this with 0 for every one of
 * them before their games even kick off, then replaces it with the real number as stats come
 * in -- so a caller needs to check for a POSITIVE value, not just a defined one, to tell
 * "hasn't played yet" apart from "played and scored 0." The Monte Carlo simulation (js/mls/sim/matchup.js's
 * runMatchupSim) reads this, positive-value-checked, to use a player's actual in-progress or
 * final score instead of their pre-game projection once one genuinely exists -- Sleeper's own
 * UI keeps showing the projection after the fact purely for comparison, not as a live estimate.
 */
export async function getSleeperMatchups(leagueId, week) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    if (!res.ok) throw new Error("Could not fetch matchups for this league/week.");
    return res.json();
}

// --- DRAFTS ---
// Added in refactor chunk 2C for Draft Strategist's Sleeper draft sync, which used to call
// these endpoints directly. The error messages are the ones that sync has always shown.

/** One draft's settings, draft_order and league_id. Throws "Could not fetch Draft ID details." on a non-ok response. */
export async function getSleeperDraft(draftId) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/draft/${draftId}`);
    if (!res.ok) throw new Error("Could not fetch Draft ID details.");
    return res.json();
}

/** Every pick made so far in a draft. Throws "Could not fetch Draft ID picks." on a non-ok response. */
export async function getSleeperDraftPicks(draftId) {
    const res = await mdsFetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
    if (!res.ok) throw new Error("Could not fetch Draft ID picks.");
    return res.json();
}

// --- SEASON ADP ---
/**
 * Season-long projections for QB/RB/WR/TE, one row per player ({ player_id, stats, ... }),
 * sorted by `orderBy`. Each row's `stats` carries Sleeper's ADP figures (adp_ppr, adp_half_ppr,
 * adp_std, adp_2qb, ...). Draft Strategist's "Sleeper Native ADP" options read these.
 *
 * Note the host: api.sleeper.com, not the api.sleeper.app v1 API the rest of this file calls.
 * Moved here from js/mds/market.js in refactor chunk 2C's follow-up; the URL and the
 * "Sleeper API Error: <status>" message are unchanged.
 */
export async function getSleeperSeasonAdp(season, orderBy) {
    const res = await mdsFetch(`https://api.sleeper.com/projections/nfl/${season}?season_type=regular&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=${orderBy}`);
    if (!res.ok) throw new Error(`Sleeper API Error: ${res.status}`);
    return res.json();
}

// --- TRENDING ADDS ---
/**
 * Sleeper's most-added players across all its leagues: `[{ player_id, count }]`, most adds first
 * (improvements S6, Lineup Strategist's Top Available). Public, no auth. Cached in memory for an
 * hour per lookback/limit pair, so moving around the Scout tab doesn't re-ask; a reload asks again,
 * which is fine for a response of a few KB. Throws on a non-ok status or a body that isn't that
 * array, and nothing is cached then: the caller hides its trending UI quietly.
 */
const SLEEPER_TRENDING_MAX_AGE_MS = 60 * 60 * 1000;
const _sleeperTrendingCache = new Map(); // "hours|limit" -> { data, fetchedAt }
export async function getSleeperTrendingAdds({ lookbackHours = 24, limit = 50 } = {}) {
    const key = `${lookbackHours}|${limit}`;
    const cached = _sleeperTrendingCache.get(key);
    if (cached && (Date.now() - cached.fetchedAt) < SLEEPER_TRENDING_MAX_AGE_MS) return cached.data;
    const res = await mdsFetch(`https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=${lookbackHours}&limit=${limit}`);
    if (!res.ok) throw sleeperResponseError(`Sleeper's trending adds request failed (HTTP ${res.status}).`);
    const data = await res.json();
    if (!Array.isArray(data)) throw sleeperResponseError("Sleeper's trending adds came back in an unexpected format.");
    const rows = data.filter(r => r && r.player_id != null && Number.isFinite(Number(r.count)))
        .map(r => ({ player_id: String(r.player_id), count: Number(r.count) }));
    _sleeperTrendingCache.set(key, { data: rows, fetchedAt: Date.now() });
    return rows;
}

// --- INDEXEDDB CACHE FOR THE SLEEPER PLAYER MAP ---
// Sleeper's players/nfl payload is about 15MB (14.6MB, 12,229 players, in Oct 2026; it was
// close to 5MB when this cache was written), and their own docs say not to call this
// endpoint more than once a day. Previously this was only cached in the plain JS variables
// below (_sleeperPlayerMapCache/_sleeperPlayerMapPromise) -- gone the instant the page
// reloads, so every single page load re-downloaded the whole payload regardless.
// IndexedDB persists it across reloads without the concerns a payload this size would raise
// in localStorage: it's asynchronous (a 15MB JSON.stringify/parse on every read would be a
// real, synchronous main-thread cost), and it isn't competing against the same ~5-10MB total
// quota localStorage shares with everything else this app already stores there.
const SLEEPER_PLAYER_DB_NAME = IDB_DATABASES.sleeperPlayerMap.name;
const SLEEPER_PLAYER_STORE = IDB_DATABASES.sleeperPlayerMap.stores[0];
const SLEEPER_PLAYER_CACHE_KEY = 'nfl_player_map';
const SLEEPER_PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // matches Sleeper's own "once a day" guidance

function openSleeperCacheDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB not available')); return; }
        const req = indexedDB.open(SLEEPER_PLAYER_DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SLEEPER_PLAYER_STORE)) {
                db.createObjectStore(SLEEPER_PLAYER_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Returns { data, fetchedAt } or null -- null covers both "nothing cached yet" and "IndexedDB
// isn't available/failed to open" (private-browsing restrictions in some browsers, etc). Either
// way the caller's fallback is identical: fetch fresh from the network.
async function getCachedSleeperPlayerMap() {
    try {
        const db = await openSleeperCacheDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(SLEEPER_PLAYER_STORE, 'readonly');
            const store = tx.objectStore(SLEEPER_PLAYER_STORE);
            const req = store.get(SLEEPER_PLAYER_CACHE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        return null;
    }
}

// Fire-and-forget from the caller's perspective -- persisting the cache is a nice-to-have,
// not required for correctness. If it fails (quota, no IndexedDB support, etc.), the in-memory
// cache from this session still works fine; it just won't survive a page reload.
async function setCachedSleeperPlayerMap(data) {
    try {
        const db = await openSleeperCacheDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(SLEEPER_PLAYER_STORE, 'readwrite');
            tx.objectStore(SLEEPER_PLAYER_STORE).put({ data, fetchedAt: Date.now() }, SLEEPER_PLAYER_CACHE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.error('Failed to persist Sleeper player cache to IndexedDB:', err);
    }
}

// A player map is an object keyed by player ID whose values are player records. Anything else
// -- an error body such as {"error":"..."}, null, an array -- must never be cached: it would sit
// in IndexedDB for a day and make every player look unknown in both apps. some() stops at the
// first record, so this costs nothing on a real map.
function isSleeperPlayerMap(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
        && Object.values(data).some(p => p && typeof p === 'object' && 'player_id' in p);
}

// Thrown when Sleeper answers but not with a player map: a non-ok status (an outage or rate
// limit, whatever the body) or a body that isn't one. Flagged rather than named 'SyntaxError',
// so callers can tell it apart; MLS's injury audit and matchup simulator treat it the same as
// the SyntaxError an HTML error page causes ("Sleeper sent back an unexpected response").
function sleeperResponseError(message) {
    const err = new Error(message);
    err.name = 'SleeperResponseError';
    err.isSleeperResponseError = true;
    return err;
}

// Consolidated Sleeper DB Cache
let _sleeperPlayerMapCache = null;
let _sleeperPlayerMapPromise = null;
export function getSleeperPlayerMap(options = {}) {
    if (_sleeperPlayerMapCache && !options.forceRefresh) return Promise.resolve(_sleeperPlayerMapCache);
    if (_sleeperPlayerMapPromise && !options.forceRefresh) return _sleeperPlayerMapPromise;

    _sleeperPlayerMapPromise = (async () => {
        try {
            // forceRefresh (used by the injury-status league scanner, which wants the absolute
            // latest data) skips straight past both the in-memory AND IndexedDB caches.
            if (!options.forceRefresh) {
                const cached = await getCachedSleeperPlayerMap();
                // isSleeperPlayerMap: skip (and so replace) a bad entry an older version of this
                // file may have saved, back when it cached whatever Sleeper sent.
                if (cached && (Date.now() - cached.fetchedAt) < SLEEPER_PLAYER_CACHE_MAX_AGE_MS && isSleeperPlayerMap(cached.data)) {
                    _sleeperPlayerMapCache = cached.data;
                    return cached.data;
                }
            }

            // The long timeout, not the 12s default: this payload is ~15MB (see the cache
            // comment above) and a healthy download of it on a slow phone connection can
            // legitimately outlast the ceiling an ordinary JSON call gets.
            const res = await mdsFetch('https://api.sleeper.app/v1/players/nfl', {}, MDS_LONG_FETCH_TIMEOUT_MS);
            if (!res.ok) throw sleeperResponseError(`Sleeper's player list request failed (HTTP ${res.status}).`);
            const data = await res.json();
            if (!isSleeperPlayerMap(data)) throw sleeperResponseError("Sleeper's player list came back in an unexpected format.");
            _sleeperPlayerMapCache = data;
            setCachedSleeperPlayerMap(data); // don't await -- this shouldn't delay callers
            return data;
        } finally {
            _sleeperPlayerMapPromise = null;
        }
    })();

    return _sleeperPlayerMapPromise;
}