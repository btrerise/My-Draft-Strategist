// Moved from js/mds.js in refactor chunk 2A:
// BACKUP & RESTORE (export, import, hard reset).
import { PREMIGRATION_BACKUP_KEY } from './storage.js';
import { State } from './state.js';

    // --- BACKUP & RESTORE ---
    // MDS and MLS share one origin (mydraftstrategist.com) and therefore one localStorage, so
    // "this app's data" has to be defined by key prefix rather than assumed to be everything.
    // ds_* covers every MDS-specific key; mds_show_headshots is the one MDS setting that
    // doesn't follow that prefix. mds_handoff_roster is deliberately excluded -- it's a
    // transient signal to MLS, not a persistent setting, and backing it up would just replay
    // a stale handoff on restore. The filter itself is isMdsOwnedKey in
    // js/shared/storage/keys.js (assigned to window by js/shared/globals.js).
    function getMdsOwnedKeys() {
        return Object.keys(localStorage).filter(window.isMdsOwnedKey);
    }

    export const exportMdsSettings = function() {
        // The pre-migration snapshot is deliberately left out of backups: it's a one-time,
        // device-local recovery artifact roughly the size of the old ds_drafts blob, so
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

        if (window.showToast) window.showToast("Backup downloaded!");
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
                if (window.showToast) window.showToast("That file isn't valid JSON - couldn't read it as a backup.", { isError: true });
                fileInput.value = "";
                return;
            }

            if (!payload || payload.app !== "MDS" || typeof payload.data !== 'object') {
                if (window.showToast) window.showToast("This doesn't look like a My Draft Strategist backup file. If it's an MLS (Lineup Strategist) backup, use the Import button on that app instead.", { isError: true });
                fileInput.value = "";
                return;
            }

            const keyCount = Object.keys(payload.data).length;
            const exportedDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : "an unknown date";
            const confirmMsg = `This replaces your current My Draft Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately.`;

            if (!await window.showConfirm(confirmMsg, { title: 'Restore from backup?', confirmText: 'Replace My Data', danger: true })) {
                fileInput.value = "";
                return;
            }

            // Clear existing MDS keys first so a restore from an older backup (missing keys
            // that exist now) doesn't leave stale data mixed in from the current session.
            //
            // This clear-then-write order is also what makes restoring a PRE-MIGRATION backup
            // work: such a file has no ds_storage_version key, so wiping the current one and
            // not restoring it leaves the marker unset, and migrateDraftStorage() converts the
            // restored v1 drafts on the reload below. A post-migration backup carries the
            // marker and its own ds_players_<draftId> keys, so it restores as-is.
            getMdsOwnedKeys().forEach(k => localStorage.removeItem(k));
            Object.keys(payload.data).forEach(k => localStorage.setItem(k, payload.data[k]));

            if (window.showToast) window.showToast("Backup restored! Reloading now.");
            setTimeout(() => { window.location.reload(); }, 900);
        };
        reader.readAsText(file);
    };

    export const hardReset = async function() {
        if (await window.showConfirm("This deletes every saved draft, custom ranking set, and setting in My Draft Strategist.\n\nMy Lineup Strategist data is not affected. This can't be undone.", { title: 'Delete all My Draft Strategist data?', confirmText: 'Delete Everything', danger: true })) {
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
            getMdsOwnedKeys().forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };
