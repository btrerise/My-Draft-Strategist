// Refactor 8C: the rankings upload preview. processData (js/mds/import.js) parses a file or a
// paste, then hands the players here instead of loading them; "Looks Good, Save It" (or
// "Replace Rankings") loads them, Cancel drops them and leaves the current pool as it was.
// Quick-Start (js/mds/market.js) skips the preview. The window's open / close and the name-list
// wording are shared with Lineup Strategist (js/shared/rankings/uploadPreview.js), and so are its
// classes (.preview-*, css/base.css). What it says is Draft Strategist's own: no ranking sets
// or leagues, and the unmatched names are the rows processData itself couldn't link to a Sleeper
// player (the ones saved with a custom_ id), not a second lookup.
import { escapeHtml } from '../shared/html.js';
import { createPreviewShell, formatUnmatchedNames } from '../shared/rankings/uploadPreview.js';
import { formatRankingsDiagnostic } from '../shared/rankings/diagnostics.js';
import { State } from './state.js';

    // --- RANKINGS UPLOAD PREVIEW ---
    // One upload can be pending at a time (one window). It holds the callbacks processData passed.
    let pendingRankingsUpload = null;
    const previewShell = createPreviewShell(() => document.getElementById('rankingsPreviewOverlay'), { onEscape: () => cancelRankingsPreview() });

    // players: processData's parsed rows, in file order. quoteProblem: findCsvQuoteProblem's
    // result (CSV only). sleeperChecked: false when Sleeper's player map couldn't be loaded, in
    // which case every row has a custom_ id and listing them all as unmatched would mislead.
    export function openRankingsPreview({ players, fileName = null, quoteProblem = null, sleeperChecked = true, onConfirm, onCancel }) {
        pendingRankingsUpload = { onConfirm, onCancel };

        const countEl = document.getElementById('rankingsPreviewCount');
        if (countEl) countEl.textContent = `${players.length} player${players.length === 1 ? '' : 's'} parsed`;

        // An unclosed quote swallowed the rows after it (or may have garbled one). Before 8C this
        // was only an error toast after the pool had already been replaced.
        const skippedEl = document.getElementById('rankingsPreviewSkipped');
        if (skippedEl) {
            if (quoteProblem) {
                const lost = quoteProblem.rowsLost || 0;
                skippedEl.querySelector('.preview-unmatched-title').textContent = lost > 0
                    ? `${lost} row${lost === 1 ? '' : 's'} lost`
                    : '1 row may be garbled';
                const diag = { fileName, reason: 'unclosed-quote', row: quoteProblem.row, rowsLost: quoteProblem.rowsLost, headersFound: [], missing: [] };
                skippedEl.querySelector('.preview-unmatched-list').textContent = formatRankingsDiagnostic(diag);
                skippedEl.style.display = 'block';
            } else {
                skippedEl.style.display = 'none';
            }
        }

        const listEl = document.getElementById('rankingsPreviewList');
        if (listEl) {
            listEl.innerHTML = players.slice(0, 5).map(p =>
                `<li><span class="preview-rank">#${p.rank}</span> ${escapeHtml(p.name)}` +
                ` <span class="preview-meta">${escapeHtml(p.posDisplay)} · ${escapeHtml(p.team)}</span></li>`
            ).join('');
        }

        // No row had a position, so processData filed every player under FLEX.
        const derivedEl = document.getElementById('rankingsPreviewDerived');
        if (derivedEl) derivedEl.style.display = players.every(p => p.posGroup === 'FLEX') ? 'block' : 'none';

        const unmatchedEl = document.getElementById('rankingsPreviewUnmatched');
        if (unmatchedEl) {
            const names = sleeperChecked
                ? players.filter(p => String(p.sleeperId).startsWith('custom_')).map(p => p.name)
                : [];
            if (names.length > 0) {
                unmatchedEl.querySelector('.preview-unmatched-title').textContent =
                    `${names.length} of ${players.length} name${names.length === 1 ? '' : 's'} didn't match a Sleeper player`;
                unmatchedEl.querySelector('.preview-unmatched-list').innerHTML = formatUnmatchedNames(names, 12);
                unmatchedEl.style.display = 'block';
            } else {
                unmatchedEl.style.display = 'none';
            }
        }

        // What saving does to the pool already loaded. The same test processData's apply step
        // uses: blend only when the Aggregate toggle is on and there's a pool to blend with.
        const current = State.players.length;
        const isBlend = current > 0 && !!document.getElementById('aggregateToggle')?.checked;
        const isReplace = current > 0 && !isBlend;
        const currentText = `${current} player${current === 1 ? '' : 's'}`;
        const targetEl = document.getElementById('rankingsPreviewTarget');
        if (targetEl) {
            if (isReplace) {
                targetEl.innerHTML = `Replaces your current rankings (<strong>${currentText}</strong>). This can't be undone.`;
                targetEl.className = 'preview-target is-replace';
            } else if (isBlend) {
                const weightNew = parseInt(document.getElementById('weightSlider')?.value ?? '50', 10);
                targetEl.innerHTML = `Blends with your current rankings (<strong>${currentText}</strong>): ` +
                    `${weightNew}% this file, ${100 - weightNew}% current.`;
                targetEl.className = 'preview-target';
            } else {
                targetEl.textContent = 'Loads as your player pool.';
                targetEl.className = 'preview-target';
            }
            targetEl.style.display = 'block';
        }

        const confirmBtn = document.getElementById('rankingsPreviewConfirmBtn');
        if (confirmBtn) {
            confirmBtn.className = isReplace ? 'btn btn-danger' : 'btn btn-primary';
            confirmBtn.textContent = isReplace ? 'Replace Rankings' : 'Looks Good, Save It';
        }

        previewShell.open();
    }

    export const cancelRankingsPreview = function() {
        const pending = pendingRankingsUpload;
        pendingRankingsUpload = null;
        previewShell.close();
        if (pending && pending.onCancel) pending.onCancel();
    };

    export const confirmRankingsPreview = function() {
        const pending = pendingRankingsUpload;
        if (!pending) return;
        pendingRankingsUpload = null;
        previewShell.close();
        pending.onConfirm();
    };
