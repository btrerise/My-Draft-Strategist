// --- SLEEPER API CLIENT (ES MODULE) ---
// Second module pulled out of mls.js's single IIFE (see rankingsParser.js for the first).
// This one is a thin client: every export here is "fetch this endpoint, parse the JSON,
// maybe throw a specific error" -- nothing more. All the business logic that used to sit
// right next to these fetch calls (building league objects, diffing rosters, writing to
// State/localStorage, updating buttons) stays behind in mls.js and is unaffected by this
// split; it just calls these functions instead of calling fetch() directly.
//
// Every call here goes through window.mdsFetch (utils.js, a plain script loaded before this
// module) rather than fetch() directly, so none of them can hang forever on a stalled
// connection. That's the one behavior this file adds on top of a bare fetch; the ok-checks
// and error messages below are still exactly what their original call sites had.
//
// Each function's error-handling (whether it throws on a non-ok response, and with what
// message) intentionally matches whatever its original call site(s) in mls.js already did,
// even where that's inconsistent across endpoints -- this is a pure extraction, not a pass
// to make error handling more uniform. Where two call sites for the same endpoint disagreed
// (see getSleeperUser), the throwing version was kept here and the more lenient call site
// was updated in mls.js to explicitly catch and continue, so its original "skip this one
// league, keep going" behavior is preserved on purpose rather than by accident.

/**
 * Fetches Sleeper's current NFL state (week, season, etc). Returns null on a non-ok
 * response rather than throwing -- both existing callers (the periodic week-refresh on
 * load, and the season lookup before listing a user's leagues) already treat "no data" as
 * a normal, recoverable case, not an error worth surfacing to the user.
 */
export async function getNflState() {
    const res = await window.mdsFetch('https://api.sleeper.app/v1/state/nfl');
    return res.ok ? res.json() : null;
}

/** Throws "User not found." on a non-ok response -- matches the original sync-a-league path. */
export async function getSleeperUser(username) {
    const res = await window.mdsFetch(`https://api.sleeper.app/v1/user/${username}`);
    if (!res.ok) throw new Error("User not found.");
    return res.json();
}

/** Throws "League ID not found." on a non-ok response. */
export async function getSleeperLeague(leagueId) {
    const res = await window.mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}`);
    if (!res.ok) throw new Error("League ID not found.");
    return res.json();
}

/** No ok-check, matching the original -- a non-ok response's body still gets parsed as JSON. */
export async function getSleeperLeagueUsers(leagueId) {
    const res = await window.mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
    return res.json();
}

/** No ok-check, matching the original -- a non-ok response's body still gets parsed as JSON. */
export async function getSleeperLeagueRosters(leagueId) {
    const res = await window.mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
    return res.json();
}

/** Throws "Could not fetch leagues for this user." on a non-ok response. */
export async function getSleeperUserLeagues(userId, season) {
    const res = await window.mdsFetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
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
 * "hasn't played yet" apart from "played and scored 0." The Monte Carlo simulation (mls.js's
 * runMatchupSim) reads this, positive-value-checked, to use a player's actual in-progress or
 * final score instead of their pre-game projection once one genuinely exists -- Sleeper's own
 * UI keeps showing the projection after the fact purely for comparison, not as a live estimate.
 */
export async function getSleeperMatchups(leagueId, week) {
    const res = await window.mdsFetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    if (!res.ok) throw new Error("Could not fetch matchups for this league/week.");
    return res.json();
}

// --- INDEXEDDB CACHE FOR THE SLEEPER PLAYER MAP ---
// Sleeper's players/nfl payload is close to 5MB, and their own docs say not to call this
// endpoint more than once a day. Previously this was only cached in the plain JS variables
// below (_sleeperPlayerMapCache/_sleeperPlayerMapPromise) -- gone the instant the page
// reloads, so every single page load re-downloaded the whole ~5MB payload regardless.
// IndexedDB persists it across reloads without the concerns a payload this size would raise
// in localStorage: it's asynchronous (a 5MB JSON.stringify/parse on every read would be a
// real, synchronous main-thread cost), and it isn't competing against the same ~5-10MB total
// quota localStorage shares with everything else this app already stores there.
const SLEEPER_PLAYER_DB_NAME = 'mls_sleeper_cache';
const SLEEPER_PLAYER_STORE = 'players';
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
                if (cached && (Date.now() - cached.fetchedAt) < SLEEPER_PLAYER_CACHE_MAX_AGE_MS) {
                    _sleeperPlayerMapCache = cached.data;
                    return cached.data;
                }
            }

            // The long timeout, not the 12s default: this payload is ~5MB (see the cache
            // comment above) and a healthy download of it on a slow phone connection can
            // legitimately outlast the ceiling an ordinary JSON call gets.
            const res = await window.mdsFetch('https://api.sleeper.app/v1/players/nfl', {}, window.MDS_LONG_FETCH_TIMEOUT_MS);
            const data = await res.json();
            _sleeperPlayerMapCache = data;
            setCachedSleeperPlayerMap(data); // don't await -- this shouldn't delay callers
            return data;
        } finally {
            _sleeperPlayerMapPromise = null;
        }
    })();

    return _sleeperPlayerMapPromise;
}