// Moved from js/mds.js in refactor chunk 2A:
// the stale-cache fallbacks that sat at the top of mds.js.
// 5D removes this file once a CACHE_NAME bump has been live long enough.

    // Belt and braces for the service worker's stale-while-revalidate window. Assets are
    // served from cache first (see sw.js), so there is a narrow window after a deploy where a
    // browser could pair this file with an older cached js/utils.js from before readJSON
    // existed. State construction below would then throw on an undefined function and blank
    // the page -- precisely the failure readJSON was added to prevent. This local binding
    // falls back to the old inline behavior so that can't happen; once every client is on the
    // current utils.js it is simply never used.
    export const readJSON = window.readJSON || function (key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
    };
    // Same stale-utils.js guard for the helpers utils.js gained later. escapeHtml's fallback is
    // a full copy, since rendering player cards depends on it. The rankings-upload ones fall
    // back to a generic message / no quote check, which is all an old utils.js could offer.
    export const escapeHtml = window.escapeHtml || function (str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    export const formatRankingsDiagnostic = window.formatRankingsDiagnostic || (() => "Couldn't find any players in that file. Check the format and try again.");
    export const findCsvQuoteProblem = window.findCsvQuoteProblem || (() => null);
