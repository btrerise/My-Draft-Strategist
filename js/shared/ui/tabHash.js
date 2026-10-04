// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js; app modules may also import it directly.

// --- TAB DEEP LINKS ---
// Every tab switch writes its tab to the URL hash (#tracker, #lineup, #top50Tab...), so a reload
// or a shared link should land on that tab. Returns the hash's tab id only when this page really
// has that tab, so a stale, mistyped or unrelated hash falls back to the page's default tab
// instead of blanking every tab. toElementId maps the hash to the tab's element id: MDS/MLS
// store the bare name ("tracker" -> #trackerTab); T-Score stores the full id, so it passes an
// identity function.
export const getTabFromHash = function(toElementId = id => id + 'Tab') {
  let id = '';
  try { id = decodeURIComponent((window.location.hash || '').slice(1)); } catch (e) { return null; }
  if (!id) return null;
  const el = document.getElementById(toElementId(id));
  return el && el.classList.contains('tab-content') ? id : null;
};
