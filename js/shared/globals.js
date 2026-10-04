// Puts the shared helpers on window for code that reads them there instead of importing them:
// js/boot.js (a plain script; it calls window.showToast) and the many module-internal
// `window.showToast(...)`, `window.showConfirm(...)` etc. calls, plus bare `normalizeName` /
// `isNameMatch` / `flashButton` calls, in js/mds/, js/mls/ and js/shared/. No page has an inline
// script or inline handler that needs these any more (refactor chunks 5A-5C, 5E). Refactor chunk
// 5D removed the two names nothing read any more (escapeHtml, isMdsOwnedKey); every name below
// still has a reader, listed in docs/refactor/LOG.md (5D). Turning those reads into imports would
// let this file shrink further.
//
// Loaded on every page as <script type="module"> right after js/boot.js and before the page's
// app module. Module scripts run in document order with defer scripts, so everything below is
// defined before js/mds/main.js, js/mls/main.js or js/tscore/main.js runs, and before
// DOMContentLoaded.
//
// The imports are in the order their code sat in the old js/utils.js, so the modules with
// load-time side effects (DOMContentLoaded listeners, the stray-drop guard, tooltip delegation)
// register them in the same order as before.
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
import { loadScriptOnce, ensureHtml2Canvas, loadSheetJS } from './ui/scriptLoader.js';
import { flashButton } from './ui/flashButton.js';
import { getTabFromHash } from './ui/tabHash.js';
import './ui/tooltips.js';

// Top-level function declarations in the old utils.js (a classic script), so they were window
// properties too. normalizeName and isNameMatch are still called as bare names in js/mds/ and
// js/mls/; dismissBanner is called by both apps' dismissBanner action (js/mds/main.js, js/mls/main.js).
window.normalizeName = normalizeName;
window.isNameMatch = isNameMatch;
window.dismissBanner = dismissBanner;

// Explicit window.* assignments in the old utils.js.
window.MDS_LONG_FETCH_TIMEOUT_MS = MDS_LONG_FETCH_TIMEOUT_MS;
window.mdsFetch = mdsFetch;
window.createFocusTrap = createFocusTrap;
window.showConfirm = showConfirm;
window.dismissBannerAndReveal = dismissBannerAndReveal;
window.setToastsSuppressed = setToastsSuppressed;
window.showToast = showToast;
window.formatRankingsDiagnostic = formatRankingsDiagnostic;
window.enableFileDrop = enableFileDrop;
window.findCsvQuoteProblem = findCsvQuoteProblem;
window.loadScriptOnce = loadScriptOnce;
window.ensureHtml2Canvas = ensureHtml2Canvas;
window.loadSheetJS = loadSheetJS;
window.flashButton = flashButton;
window.getTabFromHash = getTabFromHash;
