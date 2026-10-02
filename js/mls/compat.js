// Moved from lineup/mls.js in refactor chunk 3A:
// the stale-cache fallbacks: readJSON (top of mls.js) and escapeHtml (end of INITIALIZATION).
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

// HTML escaping for outside text (player/league/set names, teams...) placed into markup.
// Forwards to the shared copy in js/utils.js (window.escapeHtml, used by MDS too). The
// inline fallback covers a browser briefly pairing this file with an older cached
// utils.js right after a deploy (see sw.js), when window.escapeHtml wouldn't exist yet.
export function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
