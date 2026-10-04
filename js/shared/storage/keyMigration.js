// --- STORAGE KEY RENAME (refactor chunk 6B) ---
// 6B renamed the localStorage keys so each app has one prefix (the table is OLD NAMES in
// keys.js). Two things carry existing data across:
//   * migrateKeyNames(page) runs once per page on load, before anything reads storage, and
//     copies this browser's old keys to their new names. It copies rather than moves: an
//     already-open tab, or a script the service worker served from its old cache, may still
//     read the old names. A later release deletes the old keys (LOG, 6B). Only when storage
//     is too full for both copies does it move them instead.
//   * renameLegacyKeys(data) renames the keys in a backup file, so files saved before 6B
//     still restore.
// Imports only keys.js, so it's safe to run at module top level (6A's convention).
import { KEYS, renamedKey, isLegacyKey, LEGACY_MDS_PREFIX, LEGACY_MLS_PREFIX } from './keys.js';

// Like MDS's draft-storage marker (js/mds/storage.js): the migration runs until it has set this.
const KEY_NAMES_VERSION = '1';

const TSCORE_CACHE_KEYS = [KEYS.tscore.cache, KEYS.tscore.cacheUpdated];

// Which old keys each page copies: its own, plus the cross-app keys it reads. A page never
// copies the other app's keys, so opening one app leaves the other's data exactly as it was.
const MIGRATIONS = {
    // /: ds_*, and the T-Score cache it shows in the T-Score column.
    mds: {
        marker: KEYS.mds.keyNamesVersion,
        copies: (oldKey, newKey) => oldKey.startsWith(LEGACY_MDS_PREFIX) || TSCORE_CACHE_KEYS.includes(newKey),
    },
    // /lineup/: mds_season_*, and the roster MDS hands off.
    mls: {
        marker: KEYS.mls.keyNamesVersion,
        copies: (oldKey, newKey) => oldKey.startsWith(LEGACY_MLS_PREFIX) || newKey === KEYS.shared.handoffRoster,
    },
    // /t-score/: the cache it writes and labels with "Sheet data: Updated ...".
    tscore: {
        marker: KEYS.tscore.keyNamesVersion,
        copies: (oldKey, newKey) => TSCORE_CACHE_KEYS.includes(newKey),
    },
};

// The marker makes this one-time on purpose. Without it, every key the new code deletes (MLS
// consuming the hand-off, a reset, a cleared setting) would be copied back from its old name on
// the next load.
export function migrateKeyNames(page, storage = localStorage) {
    const { marker, copies } = MIGRATIONS[page];
    try {
        if (storage.getItem(marker) === KEY_NAMES_VERSION) return;

        const oldKeys = [];
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (isLegacyKey(k) && copies(k, renamedKey(k))) oldKeys.push(k);
        }

        const copied = [];
        let moved = 0;
        let full = false;
        oldKeys.forEach(oldKey => {
            const newKey = renamedKey(oldKey);
            // Never overwrite a value already saved under the new name: it's the newer one.
            if (storage.getItem(newKey) !== null) return;
            const value = storage.getItem(oldKey);
            if (!full) {
                try {
                    storage.setItem(newKey, value);
                    copied.push(oldKey);
                    return;
                } catch (e) {
                    // Storage is full, so both copies don't fit (MDS's player pools and MLS's
                    // ranking sets are large, and both apps share one quota). Move from here on,
                    // starting by dropping the old copies of the keys just copied.
                    full = true;
                    copied.forEach(k => storage.removeItem(k));
                }
            }
            // Rewriting the old key first throws, before anything is removed, if storage refuses
            // every write. Otherwise it proves the old value can go back if the new name doesn't fit.
            storage.setItem(oldKey, value);
            storage.removeItem(oldKey);
            try {
                storage.setItem(newKey, value);
                moved++;
            } catch (e) {
                storage.setItem(oldKey, value);
                throw e;
            }
        });

        storage.setItem(marker, KEY_NAMES_VERSION);
        if (full) {
            console.log(`Storage keys renamed: storage was full, so ${copied.length + moved} were moved instead of copied.`);
        } else if (copied.length > 0) {
            console.log(`Storage keys renamed (${copied.length} copied; the old names stay for now).`);
        }
    } catch (e) {
        // The marker stays unset, so this runs again on the next load; keys already copied are
        // skipped then.
        console.error('Storage key rename deferred:', e);
    }
}

// A backup file's data with every old key name replaced by its new one. When a file holds both
// names of a key (js/boot.js's rescue backup takes both), the new name's value wins.
export function renameLegacyKeys(data) {
    const out = {};
    Object.keys(data).forEach(k => { if (!isLegacyKey(k)) out[k] = data[k]; });
    Object.keys(data).forEach(k => {
        const newKey = renamedKey(k);
        if (newKey !== k && !Object.prototype.hasOwnProperty.call(out, newKey)) out[newKey] = data[k];
    });
    return out;
}
