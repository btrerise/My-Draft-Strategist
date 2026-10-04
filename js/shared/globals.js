// Page-wide setup that every page runs before its app module: the shared modules with load-time
// side effects, and the one window.* name the shared code still provides.
//
// Loaded on every page as <script type="module"> right after js/boot.js and before the page's app
// module (js/mds/main.js, js/mls/main.js, js/tscore/main.js). Module scripts run in document order
// with defer scripts, so this has run before any app module and before DOMContentLoaded.
//
// Until refactor chunk 5D this file put about twenty shared helpers on window, for code that
// couldn't import them: the old classic scripts, then inline handlers, then module code still
// written as window.showToast(...). 5D turned all of those into imports, so what's left is:
//   - window.showToast for js/boot.js, a plain script that can't import (it toasts a corrupt
//     storage key it had to skip);
//   - the side-effect modules, imported here in the order their code sat in the old js/utils.js, so
//     their DOMContentLoaded listeners, the stray-drop guard and tooltip delegation register in
//     the same order as before.
import './ui/feedbackForm.js';
import './ui/scrollShadows.js';
import './ui/banners.js';
import { showToast } from './ui/toast.js';
import './ui/fileDrop.js';
import './ui/tooltips.js';

window.showToast = showToast;
