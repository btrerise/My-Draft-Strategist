// Moved from js/mds.js in refactor chunk 2A:
// DRAFT PLAYER-POOL STORAGE (v2).
// migrateDraftStorage() runs when this module loads, and has to run before state.js builds State
// from KEYS.mds.drafts. That holds because init.js imports state.js before this file, and state.js
// imports this file, so this one is evaluated first. Keep it that way (see docs/refactor/LOG.md, 2A).
import { State } from './state.js';
import { KEYS, mdsDraftPoolKey } from '../shared/storage/keys.js';

    // --- DRAFT PLAYER-POOL STORAGE (v2) ---
    // Each draft profile remembers its own player pool, so switching profiles restores the
    // rankings that profile was drafted with. That pool used to live INLINE inside each draft
    // object in `KEYS.mds.drafts` -- which meant every save serialized every profile's entire pool,
    // whether or not it had changed. At ~600 players per pool and three profiles, a single
    // pick wrote roughly half a megabyte synchronously, and the cost grew with the number of
    // profiles rather than with the size of the change.
    //
    // The pools now live under their own `mdsDraftPoolKey(draftId)` keys, written only when the
    // pool itself actually changes (see savePlayerPool). `KEYS.mds.drafts` keeps the small,
    // frequently-changing parts -- settings, picks, roster, queue -- and is the only thing a
    // pick has to rewrite.
    //
    // Both the MDS_PREFIX scan behind Backup/Restore and the one behind Hard Reset pick the
    // new keys up automatically, so neither needed changing.
    const STORAGE_VERSION_KEY = KEYS.mds.storageVersion;
    export const PREMIGRATION_BACKUP_KEY = KEYS.mds.draftsPremigrationBackup;
    const CURRENT_STORAGE_VERSION = '2';

    export const draftPoolKey = mdsDraftPoolKey;

    // Reads a draft's pool, checking the v2 key first and falling back to an inline v1 copy.
    // The fallback is what makes the migration below safe to fail: if it can't complete (quota
    // exhausted mid-write, storage disabled), the inline copies are still there and still
    // authoritative, so the app keeps working in the old format rather than losing rankings.
    export function readDraftPlayerPool(draft) {
        if (!draft) return null;
        try {
            const raw = localStorage.getItem(draftPoolKey(draft.draftId));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.warn('Could not read saved player pool for draft', draft.draftId, e);
        }
        if (Array.isArray(draft.players) && draft.players.length > 0) return draft.players;
        return null;
    }

    // The single place State.players gets persisted. Writes the global pool (the fallback for
    // a profile that has none of its own) and the active profile's pool together, so the two
    // can't drift apart -- every site that used to call setItem(KEYS.mds.players, ...) directly
    // now calls this instead.
    export function savePlayerPool() {
        try {
            const serialized = JSON.stringify(State.players);
            localStorage.setItem(KEYS.mds.players, serialized);
            if (State.activeDraftId) localStorage.setItem(draftPoolKey(State.activeDraftId), serialized);
        } catch (e) {
            console.error('Could not save player pool (storage may be full):', e);
            if (window.showToast) window.showToast("Couldn't save your rankings - browser storage may be full.", { isError: true });
        }
    }

    // One-time move of inline pools out to their own keys. Ordered so that an interruption at
    // any point leaves readable data: the backup is taken first, then every pool is written to
    // its own key, and only then is the slimmed KEYS.mds.drafts written. If the process dies before
    // that last write, both copies exist and readDraftPlayerPool prefers the new one; if it
    // dies before the pools are written, the inline copies are untouched and the version
    // marker is never set, so the migration simply runs again next load.
    function migrateDraftStorage() {
        if (localStorage.getItem(STORAGE_VERSION_KEY) === CURRENT_STORAGE_VERSION) return;

        try {
            const raw = localStorage.getItem(KEYS.mds.drafts);
            if (!raw) {
                // Nothing to migrate (new install). Mark it so this never runs again.
                localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
                return;
            }

            const drafts = JSON.parse(raw);
            if (!Array.isArray(drafts)) {
                localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
                return;
            }

            // Safety net, written before anything is modified and never overwritten if one
            // already exists (so a second, partial run can't clobber the original snapshot).
            if (!localStorage.getItem(PREMIGRATION_BACKUP_KEY)) {
                localStorage.setItem(PREMIGRATION_BACKUP_KEY, raw);
            }

            let moved = 0;
            drafts.forEach(d => {
                if (!d || !d.draftId) return;
                if (Array.isArray(d.players) && d.players.length > 0) {
                    // Don't overwrite a pool that's already been written out -- on a re-run
                    // after a partial migration, the existing key is the newer copy.
                    if (!localStorage.getItem(draftPoolKey(d.draftId))) {
                        localStorage.setItem(draftPoolKey(d.draftId), JSON.stringify(d.players));
                    }
                    moved++;
                }
                delete d.players;
            });

            localStorage.setItem(KEYS.mds.drafts, JSON.stringify(drafts));
            localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
            if (moved > 0) console.log(`Draft storage migrated to v2 (${moved} player pool(s) moved out of ${KEYS.mds.drafts}).`);
        } catch (e) {
            // Deliberately swallowed. The version marker stays unset so this retries on the
            // next load, and every read path still falls back to the inline copies, so a
            // failed migration costs performance -- not data.
            console.error('Draft storage migration deferred:', e);
        }
    }

    migrateDraftStorage();
