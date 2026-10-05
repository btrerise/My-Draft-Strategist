// Refactor 8C: the parts of Lineup Strategist's rankings upload preview that both apps use.
// formatUnmatchedNames was moved from js/mls/scout/waivers.js (dedented 4 spaces);
// createPreviewShell is the open / close-with-a-focus-trap code that openRankingsPreview,
// cancelRankingsPreview and confirmRankingsPreview (js/mls/rankings/uploadPreview.js) each
// repeated. What goes inside the window stays with each app: MLS's ranking sets and league
// picker (js/mls/rankings/), MDS's pool (js/mds/import.js).
import { escapeHtml } from '../html.js';
import { createFocusTrap } from '../ui/focusTrap.js';

// --- UPLOAD PREVIEW HELPERS ---
// "Marquise Brown, Gabe Davis and 4 more." -- capped so a badly-matched file doesn't push
// the actual results off the screen. Names come straight from the rankings file, so they're
// exactly what the person would search for to fix them.
export function formatUnmatchedNames(names, max = 6) {
    const shown = (names || []).slice(0, max).map(n => escapeHtml(n));
    const rest = (names || []).length - shown.length;
    if (shown.length === 0) return '';
    const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
    return rest > 0 ? `${shown.join(', ')} and ${rest} more.` : `${list}.`;
}

// --- UPLOAD PREVIEW SHELL ---
// Shows and hides a preview overlay (`.preview-overlay`, display flex / none) and traps focus
// inside it while it's open. getOverlay is called on every open and close, so the element is
// looked up when it's used, as the MLS code did. onEscape decides what Escape means; both apps
// pass their Cancel, which discards the pending upload. close() also gives focus back to
// whatever had it before open() (createFocusTrap, js/shared/ui/focusTrap.js).
export function createPreviewShell(getOverlay, { onEscape } = {}) {
    let focusTrap = null;
    return {
        open() {
            const overlay = getOverlay();
            if (overlay) overlay.style.display = 'flex';

            if (overlay) {
                focusTrap = createFocusTrap(overlay, { onEscape });
                focusTrap.activate();
            }
        },
        close() {
            const overlay = getOverlay();
            if (overlay) overlay.style.display = 'none';
            if (focusTrap) { focusTrap.deactivate(); focusTrap = null; }
        }
    };
}
