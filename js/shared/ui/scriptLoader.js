// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js, which assigns its exports to the same window.* names utils.js set.
// Comments below that say "this file" or "utils.js" were written when this was one file.

// --- ON-DEMAND SCRIPT LOADING ---
// Loads a third-party script the first time something actually needs it, and returns the same
// promise on every later call so a second request never triggers a second download.
//
// Both apps previously loaded html2canvas (~200KB) from a <script defer> tag on every single
// page load, for a screenshot-export button most sessions never press. `defer` kept it off the
// critical rendering path, but it still cost the download, the parse and the memory on a phone
// every time either app opened. mls.js already had exactly this pattern for SheetJS
// (loadSheetJS, used only when someone uploads an .xlsx) -- this generalizes it so the same
// reasoning can apply to any heavy, rarely-used dependency, and so both apps share one copy.
//
// `globalName` is what the script defines on window; an already-present global short-circuits
// the whole thing, which also means this is safe if a <script> tag for the same library is
// ever added back.
const _loadedScriptPromises = new Map();
export const loadScriptOnce = function(src, globalName) {
    if (globalName && typeof window[globalName] !== 'undefined') return Promise.resolve();
    if (_loadedScriptPromises.has(src)) return _loadedScriptPromises.get(src);

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        // Clear the cached promise on failure so a later attempt (after reconnecting, or
        // after an ad-blocker is paused) genuinely retries instead of replaying this
        // rejection forever. Same reasoning as getPlayerSearchIndex's error path in mls.js.
        script.onerror = () => {
            script.remove();
            _loadedScriptPromises.delete(src);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });

    _loadedScriptPromises.set(src, promise);
    return promise;
};

// Convenience wrapper for the one library both apps lazy-load. Resolves true when html2canvas
// is ready to call, false when it couldn't be fetched -- callers surface that as a toast
// rather than silently doing nothing.
export const ensureHtml2Canvas = async function() {
    try {
        await window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
        return typeof html2canvas !== 'undefined';
    } catch (err) {
        return false;
    }
};

// Lazy-loads SheetJS (XLSX) on first use, so the many sessions that never upload an .xlsx
// don't pay for it. Previously lived only inside mls.js; mds.js had its own inline copy with
// no failure path at all, so a blocked/offline CDN left an .xlsx upload dead-ended in total
// silence. Shared here so both apps get the same error handling.
//
// Keeps the (callback, onError) signature rather than returning the promise, because
// rankingsParser.js takes this function as an injected parameter and documents that shape.
export const loadSheetJS = function(callback, onError) {
    window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX')
        .then(
            () => callback(),
            // Two arguments rather than .then().catch() on purpose: onError means "the library
            // didn't load", so it must not also fire when the library loaded fine and the
            // callback itself threw -- that would report a CDN failure for a parsing bug.
            () => { if (typeof onError === 'function') onError(); }
        );
};
