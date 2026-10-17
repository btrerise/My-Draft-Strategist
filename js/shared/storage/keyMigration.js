// --- STORAGE KEY RENAME (refactor chunk 6B) ---
// 6B renamed the localStorage keys so each app has one prefix (the table is OLD NAMES in
// keys.js). Two things carry existing data across:
//   * migrateKeyNames(page) runs once per page on load, before anything reads storage, and
//     copies this browser's old keys to their new names. It copies rather than moves: an
//     already-open tab, or a script the service worker served from its old cache, may still
//     read the old names. Only when storage is too full for both copies does it move them
//     instead.
//   * deleteOldKeyNames(page) runs right after it (refactor chunk 6C) and deletes the old
//     copies, once the rename has finished.
//   * renameLegacyKeys(data) renames the keys in a backup file, so files saved before 6B
//     still restore.
// Imports only keys.js, so it's safe to run at module top level (6A's convention).
import { KEYS, renamedKey, isLegacyKey, LEGACY_MDS_PREFIX, LEGACY_MLS_PREFIX } from './keys.js';

// Each page's *_key_names_version marker (KEYS.<page>.keyNamesVersion). Like MDS's draft-storage
// marker (js/mds/storage.js): each step runs until it has set its value. 6C bumped it to '2' rather
// than adding a key, so a backup holds no more keys than before.
const KEY_NAMES_COPIED = '1';      // migrateKeyNames has copied the old names (6B)
const OLD_KEY_NAMES_DELETED = '2'; // deleteOldKeyNames has deleted them too (6C)
const RENAME_DONE = [KEY_NAMES_COPIED, OLD_KEY_NAMES_DELETED];

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
        if (RENAME_DONE.includes(storage.getItem(marker))) return;

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

        storage.setItem(marker, KEY_NAMES_COPIED);
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

// --- OLD KEY DELETION (refactor chunk 6C) ---
// Deletes the old copies migrateKeyNames(page) leaves behind: the same keys it copies (MIGRATIONS
// above), so the two can't drift, and never the other app's, which that app still has to copy
// the next time it's opened. Only once the rename has finished (marker '1'): while it's deferred
// (storage full, marker unset) this deletes nothing, and both retry on the next load. Every value
// is under its new name by then: migrateKeyNames copied it, or a newer one was already there.
// An old key whose new name has since been removed (MLS consumed the hand-off, a cleared setting)
// goes too; copying it back is what the marker prevents.
export function deleteOldKeyNames(page, storage = localStorage) {
    const { marker, copies } = MIGRATIONS[page];
    try {
        if (storage.getItem(marker) !== KEY_NAMES_COPIED) return;

        const oldKeys = [];
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (isLegacyKey(k) && copies(k, renamedKey(k))) oldKeys.push(k);
        }
        oldKeys.forEach(k => storage.removeItem(k));

        storage.setItem(marker, OLD_KEY_NAMES_DELETED);
        if (oldKeys.length > 0) console.log(`Old storage key names deleted (${oldKeys.length}).`);
    } catch (e) {
        // The marker stays at '1', so this runs again on the next load.
        console.error('Old storage key deletion deferred:', e);
    }
}

// Restore (js/mds/backup.js, js/mls/backup.js) replaces an app's keys with a backup file's, and
// the marker is one of them. It records what this browser's rename has done, not a setting, so
// this keeps this browser's value across run() (the clear-and-write). Otherwise an older file (no
// marker, or '1') would make the reload run the deletion again, and it would reach keys outside
// the app's backup (MDS the old T-Score cache names, MLS the old hand-off), which a Restore never
// touches. The restored data needs neither step: renameLegacyKeys has given it today's names.
export function keepKeyNamesMarker(page, run, storage = localStorage) {
    const { marker } = MIGRATIONS[page];
    const kept = storage.getItem(marker);
    run();
    if (kept === null) storage.removeItem(marker);
    else storage.setItem(marker, kept);
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
