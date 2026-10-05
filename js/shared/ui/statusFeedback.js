// The "Processing…" and "Uploaded successfully" status lines, shared in refactor chunk 8B.
// showStatusFeedback is from js/mls/helpers.js. SPINNER_SVG and setProcessingStatus are Lineup Strategist's
// UPLOAD_SPINNER_SVG and setUploadStatus (js/mls/rankings/uploadPreview.js), with setUploadStatus taking
// the element instead of finding it by a `${type}ProcessingStatus` id. Styles: .upload-processing and
// .success-feedback in css/base.css. Pure: no load-time side effects.
import { escapeHtml } from '../html.js';

// Shows a role="status" feedback line that sits at display:none until now. Some screen
// readers skip a live region that is revealed with its text already in it, so the box is
// shown empty and the text goes in a beat later -- a content change, which they do announce.
// `text` overrides the message; omitted, the element's current message is reused.
export function showStatusFeedback(el, text, hideAfterMs) {
    if (!el) return;
    const msg = text ?? el._feedbackText ?? el.textContent;
    el._feedbackText = msg;
    clearTimeout(el._feedbackShowT);
    clearTimeout(el._feedbackHideT);
    el.textContent = '';
    el.style.display = 'block';
    el._feedbackShowT = setTimeout(() => { el.textContent = msg; }, 100);
    el._feedbackHideT = setTimeout(() => { el.style.display = 'none'; }, hideAfterMs);
}

// --- UPLOAD PROCESSING INDICATOR ---
// Same spinner icon already used for the Sleeper sync buttons elsewhere in the app,
// reused here so an upload or fetch gives the same kind of "something is happening"
// signal instead of going silent until it finishes.
export const SPINNER_SVG = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner" style="flex-shrink:0;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg>`;

// Shows/hides an inline "Processing..." status line (a .upload-processing element). Lineup
// Strategist uses it for single-file rankings uploads (setUploadStatus in
// js/mls/rankings/uploadPreview.js); Draft Strategist for rankings imports and ADP fetches.
export function setProcessingStatus(statusEl, isProcessing, label) {
    if (!statusEl) return;
    // role="status" region (index.html): shown empty first, filled a beat later, so screen
    // readers that ignore a live region revealed with its content already in place still
    // announce it. The timer is cleared on hide so a fast parse can't refill it afterward.
    clearTimeout(statusEl._fillT);
    statusEl.innerHTML = '';
    statusEl.style.display = isProcessing ? 'flex' : 'none';
    if (isProcessing) {
        statusEl._fillT = setTimeout(() => {
            statusEl.innerHTML = `${SPINNER_SVG}<span>${escapeHtml(label || 'Processing…')}</span>`;
        }, 100);
    }
}
