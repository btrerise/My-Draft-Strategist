// The fields of Sleeper's player file (api.sleeper.app/v1/players/nfl) that the apps read (improvements F26). The file
// is 14.7 MB unpacked (12,229 players with 52 fields each, in Nov 2026); the apps use about a dozen of them, so the
// saved copy keeps only these: a tenth of the size to store, read and keep in memory. Shared by the download worker
// (playerMapWorker.js) and sleeper.js's fallback, which run the same slimming. Pure: no imports, no page.
//
// A field read anywhere in js/ must be listed here, or it reads as missing on every player:
// tests/unit/playerMapSlim.test.mjs fails when code reads a Sleeper field this list leaves out.
export const PLAYER_FIELDS = Object.freeze([
    'player_id', 'first_name', 'last_name', 'full_name', 'position', 'fantasy_positions', 'team',
    'status', 'injury_status', 'years_exp', 'age', 'birth_date', 'search_rank',
    // Not read today; small, and what a later injury detail would want.
    'active', 'number', 'injury_body_part', 'injury_notes', 'practice_participation',
]);

// Bump when PLAYER_FIELDS changes: a saved copy from another version is downloaded again rather than trusted.
export const PLAYER_FIELDS_VERSION = 1;

// { id: { field: value } } with only PLAYER_FIELDS (missing fields stay missing, as in Sleeper's file).
export function slimPlayerMap(raw) {
    const out = {};
    for (const id in raw) {
        const p = raw[id];
        if (!p || typeof p !== 'object') continue;
        const slim = {};
        for (const f of PLAYER_FIELDS) if (p[f] !== undefined) slim[f] = p[f];
        out[id] = slim;
    }
    return out;
}
