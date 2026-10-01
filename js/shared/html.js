// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js, which assigns its exports to the same window.* names utils.js set.
// Comments below that say "this file" or "utils.js" were written when this was one file.

// --- HTML ESCAPING ---
// The one copy for both apps: mds.js (a plain script) calls it directly, and mls.js's own
// escapeHtml forwards here. Use it on any outside text placed into an HTML string: player
// names, teams, tiers and the like from uploaded or pasted rankings (and inline edits), plus
// names from Sleeper. Safe in element text and in quoted attribute values ("..." or '...').
// Not enough on its own inside an unquoted attribute, a URL, or inline JS/CSS.
export const escapeHtml = function(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
