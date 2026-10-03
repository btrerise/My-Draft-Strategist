// The window.* names js/utils.js used to define, for code that isn't an ES module yet: js/mds.js
// (a classic script), lineup/mls.js and its imports (which read window.normalizeName etc.),
// the T-Score page's inline script, and onclick="..." handlers in the HTML.
//
// Loaded on every page as <script type="module"> right after js/boot.js and before the page's
// app script. Module scripts run in document order with defer scripts, so everything below is
// defined before js/mds.js or lineup/mls.js runs, and before DOMContentLoaded.
//
// The imports are in the order their code sat in utils.js, so the modules with load-time side
// effects (DOMContentLoaded listeners, the stray-drop guard, tooltip delegation) register them
// in the same order as before.
import { normalizeName, isNameMatch } from './names.js';
import { MDS_LONG_FETCH_TIMEOUT_MS, mdsFetch } from './net.js';
import './ui/feedbackForm.js';
import { createFocusTrap } from './ui/focusTrap.js';
import { showConfirm } from './ui/confirm.js';
import './ui/scrollShadows.js';
import { dismissBanner, dismissBannerAndReveal } from './ui/banners.js';
import { setToastsSuppressed, showToast } from './ui/toast.js';
import { formatRankingsDiagnostic, findCsvQuoteProblem } from './rankings/diagnostics.js';
import { enableFileDrop } from './ui/fileDrop.js';
import { escapeHtml } from './html.js';
import { loadScriptOnce, ensureHtml2Canvas, loadSheetJS } from './ui/scriptLoader.js';
import { flashButton } from './ui/flashButton.js';
import { getTabFromHash } from './ui/tabHash.js';
import './ui/tooltips.js';
import { isMdsOwnedKey, KEYS } from './storage/keys.js';

// Top-level function declarations in utils.js (a classic script), so they were window
// properties too. Callers use them as bare names: mds.js, mls.js, the T-Score inline script,
// and the banners' onclick handlers.
window.normalizeName = normalizeName;
window.isNameMatch = isNameMatch;
window.dismissBanner = dismissBanner;

// Explicit window.* assignments in utils.js.
window.MDS_LONG_FETCH_TIMEOUT_MS = MDS_LONG_FETCH_TIMEOUT_MS;
window.mdsFetch = mdsFetch;
window.createFocusTrap = createFocusTrap;
window.showConfirm = showConfirm;
window.dismissBannerAndReveal = dismissBannerAndReveal;
window.setToastsSuppressed = setToastsSuppressed;
window.showToast = showToast;
window.formatRankingsDiagnostic = formatRankingsDiagnostic;
window.enableFileDrop = enableFileDrop;
window.escapeHtml = escapeHtml;
window.findCsvQuoteProblem = findCsvQuoteProblem;
window.loadScriptOnce = loadScriptOnce;
window.ensureHtml2Canvas = ensureHtml2Canvas;
window.loadSheetJS = loadSheetJS;
window.flashButton = flashButton;
window.getTabFromHash = getTabFromHash;

// Added in refactor chunk 1B for js/mds.js (a classic script, so it can't import keys.js).
window.isMdsOwnedKey = isMdsOwnedKey;

// Added in refactor chunk 6A for the T-Score page's inline script (a classic script, so it can't
// import keys.js). It reads its storage keys from here at event time (Refresh, DOMContentLoaded).
window.KEYS = KEYS;
