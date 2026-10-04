// Moved verbatim from js/utils.js in refactor chunk 1A. An ES module: the code that uses it imports it.

// --- HTML ESCAPING ---
// The one copy for both apps and the T-Score page: js/mds/, js/mls/ and js/tscore/ import it. Use it on any outside text placed into an HTML string: player
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
