// Moved from js/mds.js in refactor chunk 2A:
// BACKUP & RESTORE (export, import, hard reset).
import { PREMIGRATION_BACKUP_KEY } from './storage.js';
import { State } from './state.js';
import { isMdsOwnedKey, isMdsOwnedOrLegacyKey } from '../shared/storage/keys.js';
import { renameLegacyKeys } from '../shared/storage/keyMigration.js';
import { showToast } from '../shared/ui/toast.js';
import { showConfirm } from '../shared/ui/confirm.js';

    // --- BACKUP & RESTORE ---
    // MDS and MLS share one origin (mydraftstrategist.com) and therefore one localStorage, so
    // "this app's data" has to be defined by key prefix rather than assumed to be everything.
    // MDS_PREFIX covers every MDS key. KEYS.shared.handoffRoster is deliberately left out -- it's a
    // transient signal to MLS, not a persistent setting, and backing it up would just replay
    // a stale handoff on restore. The filters are in js/shared/storage/keys.js. Since 6B, Backup
    // takes today's names only (isMdsOwnedKey), while Restore and Hard Reset also clear the
    // pre-6B names this browser may still hold (isMdsOwnedOrLegacyKey).
    function getMdsOwnedKeys() {
        return Object.keys(localStorage).filter(isMdsOwnedKey);
    }

    function getMdsOwnedOrLegacyKeys() {
        return Object.keys(localStorage).filter(isMdsOwnedOrLegacyKey);
    }

    export const exportMdsSettings = function() {
        // The pre-migration snapshot is deliberately left out of backups: it's a one-time,
        // device-local recovery artifact roughly the size of the old KEYS.mds.drafts blob, so
        // including it would near-double every backup file forever to carry a copy of data
        // the export already contains in its current form. Hard Reset still clears it, since
        // that path uses getMdsOwnedKeys() unfiltered.
        const keys = getMdsOwnedKeys().filter(k => k !== PREMIGRATION_BACKUP_KEY);
        const data = {};
        keys.forEach(k => data[k] = localStorage.getItem(k));

        const payload = {
            app: "MDS",
            appName: "My Draft Strategist",
            exportedAt: new Date().toISOString(),
            data: data
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-draft-strategist-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("Backup downloaded!");
    };

    export const importMdsSettings = function(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            let payload;
            try {
                payload = JSON.parse(e.target.result);
            } catch (err) {
                showToast("That file isn't valid JSON - couldn't read it as a backup.", { isError: true });
                fileInput.value = "";
                return;
            }

            if (!payload || payload.app !== "MDS" || typeof payload.data !== 'object') {
                showToast("This doesn't look like a My Draft Strategist backup file. If it's an MLS (Lineup Strategist) backup, use the Import button on that app instead.", { isError: true });
                fileInput.value = "";
                return;
            }

            // A backup saved before 6B uses the old key names; this gives them today's.
            const data = renameLegacyKeys(payload.data);
            const keyCount = Object.keys(data).length;
            const exportedDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : "an unknown date";
            const confirmMsg = `This replaces your current My Draft Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately.`;

            if (!await showConfirm(confirmMsg, { title: 'Restore from backup?', confirmText: 'Replace My Data', danger: true })) {
                fileInput.value = "";
                return;
            }

            // Clear existing MDS keys first so a restore from an older backup (missing keys
            // that exist now) doesn't leave stale data mixed in from the current session.
            //
            // This clear-then-write order is also what makes restoring a PRE-MIGRATION backup
            // work: such a file has no KEYS.mds.storageVersion key, so wiping the current one and
            // not restoring it leaves the marker unset, and migrateDraftStorage() converts the
            // restored v1 drafts on the reload below. A post-migration backup carries the
            // marker and its own mdsDraftPoolKey(draftId) keys, so it restores as-is.
            getMdsOwnedOrLegacyKeys().forEach(k => localStorage.removeItem(k));
            Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));

            showToast("Backup restored! Reloading now.");
            setTimeout(() => { window.location.reload(); }, 900);
        };
        reader.readAsText(file);
    };

    export const hardReset = async function() {
        if (await showConfirm("This deletes every saved draft, custom ranking set, and setting in My Draft Strategist.\n\nMy Lineup Strategist data is not affected. This can't be undone.", { title: 'Delete all My Draft Strategist data?', confirmText: 'Delete Everything', danger: true })) {
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
            getMdsOwnedOrLegacyKeys().forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };
