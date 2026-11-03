// --- VISITOR COUNTS (improvements A1) ---
// Adds Umami Cloud's script (https://umami.is) to the page, so the owner can see how many real
// people use each page. Umami sets no cookies and stores nothing in the browser: its server turns
// the visitor's IP address and browser string into a code with a salt that changes every month,
// and never stores the address itself. What it records per page view: the path, the page title,
// the referring site, screen size, language, and (from the request) browser, OS, device type and
// country. Nothing from the apps (leagues, rankings, Sleeper usernames) is ever sent.
//
// Loaded on every page as the LAST <script type="module"> (after the app's own module), so it
// can never delay the first paint or the app's start-up; Umami's script itself is added with
// `defer` and runs after that.
//
// Counted only on the production site. Branch previews (*.pages.dev), localhost and the tests
// never load the script. data-domains repeats the check inside Umami's own script.
//
// Opting out (the owner's own browsers): open any page with ?nocount=1 and this browser is no
// longer counted; ?nocount=0 counts it again. A toast says which, and the parameter is removed
// from the address bar so a reload or a bookmark doesn't repeat it. The choice is kept under
// KEYS.shared.analyticsOptOut, which is in neither app's backup and survives both apps' resets.
//
// Settings live here (not in an inline snippet) so the pages carry no inline script for it. The
// website ID is public by design: it ends up in every page anyway.
import { KEYS } from './storage/keys.js';
import { showToast } from './ui/toast.js';

export const UMAMI_SCRIPT_URL = 'https://cloud.umami.is/script.js';
export const UMAMI_WEBSITE_ID = '9cf14075-37fe-4528-bd9c-a596c26c0671';
export const COUNTED_HOSTS = ['mydraftstrategist.com', 'www.mydraftstrategist.com'];

// The one place that decides. Pure, so tests/unit/analytics.test.mjs can check every case.
export function shouldCount(hostname, optedOut) {
    return COUNTED_HOSTS.includes(hostname) && !optedOut;
}

// Storage can throw (private windows, blocked site data): the opt-out then simply isn't kept,
// and counting stays as it was. Never worth an error.
function readOptOut() {
    try { return localStorage.getItem(KEYS.shared.analyticsOptOut) === '1'; } catch { return false; }
}
function writeOptOut(on) {
    try {
        if (on) localStorage.setItem(KEYS.shared.analyticsOptOut, '1');
        else localStorage.removeItem(KEYS.shared.analyticsOptOut);
        return true;
    } catch { return false; }
}

// ?nocount=1 / ?nocount=0. Returns true when the address had the parameter.
function applyNoCountParam() {
    const url = new URL(location.href);
    const value = url.searchParams.get('nocount');
    if (value !== '1' && value !== '0') return false;
    const on = value === '1';
    const saved = writeOptOut(on);
    if (!saved) {
        showToast("This browser's storage is blocked, so the visitor-count setting couldn't be saved.", { isError: true });
    } else if (on) {
        showToast("This browser won't be counted in the site's visitor numbers. Open any page with ?nocount=0 to undo.", { duration: 6000 });
    } else {
        showToast("This browser is counted in the site's visitor numbers again.");
    }
    url.searchParams.delete('nocount');
    try { history.replaceState(history.state, '', url.pathname + url.search + url.hash); } catch { /* the toast already said it */ }
    return true;
}

export function initAnalytics() {
    applyNoCountParam();
    if (!shouldCount(location.hostname, readOptOut())) return;
    if (document.querySelector(`script[src="${UMAMI_SCRIPT_URL}"]`)) return;

    const s = document.createElement('script');
    s.src = UMAMI_SCRIPT_URL;
    s.defer = true;
    s.dataset.websiteId = UMAMI_WEBSITE_ID;
    s.dataset.domains = COUNTED_HOSTS.join(',');
    // Tab switches change only the #hash (history.pushState): without this every tab would count
    // as a page view and use up the free plan's 100K events a month. The pages are /, /lineup/ and
    // /t-score/. Query strings (?week=6) are left out of the recorded address for the same reason.
    s.dataset.excludeHash = 'true';
    s.dataset.excludeSearch = 'true';
    // Offline, or blocked by an ad blocker: the script just doesn't run. The browser notes the
    // failed request itself; there's nothing for the app to do or log.
    document.head.appendChild(s);
}

// Not under node --test, which imports this file for shouldCount.
if (typeof document !== 'undefined') initAnalytics();
