// Moved from lineup/mls.js in refactor chunk 3A: BACKUP & RESTORE.
import { isMlsOwnedKey } from '../shared/storage/keys.js';

    // --- BACKUP & RESTORE ---
    // Counterpart to MDS's exportMdsSettings/importMdsSettings/hardReset in mds.js -- see that
    // file's comment for why key-prefix scoping matters on a shared origin. MLS's own keys are
    // the ones under MLS_PREFIXES. KEYS.shared.handoffRoster is excluded -- transient signal from MDS,
    // not a persistent MLS setting. The filter itself is isMlsOwnedKey in
    // js/shared/storage/keys.js.
    function getMlsOwnedKeys() {
        return Object.keys(localStorage).filter(isMlsOwnedKey);
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

        if (window.showToast) window.showToast("Backup downloaded!");
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
                if (window.showToast) window.showToast("That file isn't valid JSON - couldn't read it as a backup.", { isError: true });
                fileInput.value = "";
                return;
            }

            if (!payload || payload.app !== "MLS" || typeof payload.data !== 'object') {
                if (window.showToast) window.showToast("This doesn't look like a My Lineup Strategist backup file. If it's an MDS (Draft Strategist) backup, use the Import button on that app instead.", { isError: true });
                fileInput.value = "";
                return;
            }

            const keyCount = Object.keys(payload.data).length;
            const exportedDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : "an unknown date";
            const confirmMsg = `This replaces your current My Lineup Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately.`;

            if (!await window.showConfirm(confirmMsg, { title: 'Restore from backup?', confirmText: 'Replace My Data', danger: true })) {
                fileInput.value = "";
                return;
            }

            getMlsOwnedKeys().forEach(k => localStorage.removeItem(k));
            Object.keys(payload.data).forEach(k => localStorage.setItem(k, payload.data[k]));

            if (window.showToast) window.showToast("Backup restored! Reloading now.");
            setTimeout(() => { window.location.reload(); }, 900);
        };
        reader.readAsText(file);
    };

    export const factoryReset = async function() {
        if (await window.showConfirm("This clears every league, cached ranking set, custom SoS grid, and setting in My Lineup Strategist.\n\nMy Draft Strategist data is not affected. This cannot be undone.", { title: 'Factory reset this app?', confirmText: 'Factory Reset', danger: true })) {
            getMlsOwnedKeys().forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };
