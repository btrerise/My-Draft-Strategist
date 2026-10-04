// Moved from lineup/mls.js in refactor chunk 3A: BACKUP & RESTORE.
import { isMlsOwnedKey, isMlsOwnedOrLegacyKey } from '../shared/storage/keys.js';
import { renameLegacyKeys } from '../shared/storage/keyMigration.js';
import { showToast } from '../shared/ui/toast.js';
import { showConfirm } from '../shared/ui/confirm.js';

    // --- BACKUP & RESTORE ---
    // Counterpart to MDS's exportMdsSettings/importMdsSettings/hardReset in js/mds/backup.js -- see that
    // file's comment for why key-prefix scoping matters on a shared origin. MLS's own keys are
    // the ones under MLS_PREFIX. KEYS.shared.handoffRoster is excluded -- transient signal from MDS,
    // not a persistent MLS setting. The filters are in js/shared/storage/keys.js. Since 6B, Backup
    // takes today's names only (isMlsOwnedKey), while Restore and Factory Reset also clear the
    // pre-6B names this browser may still hold (isMlsOwnedOrLegacyKey).
    function getMlsOwnedKeys() {
        return Object.keys(localStorage).filter(isMlsOwnedKey);
    }

    function getMlsOwnedOrLegacyKeys() {
        return Object.keys(localStorage).filter(isMlsOwnedOrLegacyKey);
    }

    export const exportMlsSettings = function() {
        const keys = getMlsOwnedKeys();
        const data = {};
        keys.forEach(k => data[k] = localStorage.getItem(k));

        const payload = {
            app: "MLS",
            appName: "My Lineup Strategist",
            exportedAt: new Date().toISOString(),
            data: data
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-lineup-strategist-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("Backup downloaded!");
    };

    export const importMlsSettings = function(fileInput) {
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

            if (!payload || payload.app !== "MLS" || typeof payload.data !== 'object') {
                showToast("This doesn't look like a My Lineup Strategist backup file. If it's an MDS (Draft Strategist) backup, use the Import button on that app instead.", { isError: true });
                fileInput.value = "";
                return;
            }

            // A backup saved before 6B uses the old key names; this gives them today's.
            const data = renameLegacyKeys(payload.data);
            const keyCount = Object.keys(data).length;
            const exportedDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : "an unknown date";
            const confirmMsg = `This replaces your current My Lineup Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately.`;

            if (!await showConfirm(confirmMsg, { title: 'Restore from backup?', confirmText: 'Replace My Data', danger: true })) {
                fileInput.value = "";
                return;
            }

            getMlsOwnedOrLegacyKeys().forEach(k => localStorage.removeItem(k));
            Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));

            showToast("Backup restored! Reloading now.");
            setTimeout(() => { window.location.reload(); }, 900);
        };
        reader.readAsText(file);
    };

    export const factoryReset = async function() {
        if (await showConfirm("This clears every league, cached ranking set, custom SoS grid, and setting in My Lineup Strategist.\n\nMy Draft Strategist data is not affected. This cannot be undone.", { title: 'Factory reset this app?', confirmText: 'Factory Reset', danger: true })) {
            getMlsOwnedOrLegacyKeys().forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };
