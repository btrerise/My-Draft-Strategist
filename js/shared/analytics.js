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
// Opting out: anyone can tap "Don't count this device" at the end of the Visitor Counts line
// (each Guide, T-Score's The Research), which then reads "Count this device again". Or open any
// page with ?nocount=1 (?nocount=0 counts it again); the parameter is then removed from the address
// bar so a reload or a bookmark doesn't repeat it. A toast says which. The choice is kept under
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

// Saves the choice and says so. The links (below) and ?nocount= both come through here.
function setOptOut(on) {
    if (!writeOptOut(on)) {
        showToast("This browser's storage is blocked, so the visitor-count setting couldn't be saved.", { isError: true });
        return;
    }
    if (on) showToast("This device won't be counted in the site's visitor numbers.");
    else showToast("This device is counted in the site's visitor numbers again.");
    updateNoCountLinks();
    if (!on) loadUmami(); // counted from this page on (only on the live site; shouldCount decides)
}

// ?nocount=1 / ?nocount=0, then the parameter is taken out of the address bar.
function applyNoCountParam() {
    const url = new URL(location.href);
    const value = url.searchParams.get('nocount');
    if (value !== '1' && value !== '0') return;
    setOptOut(value === '1');
    url.searchParams.delete('nocount');
    try { history.replaceState(history.state, '', url.pathname + url.search + url.hash); } catch { /* the toast already said it */ }
}

// The "Visitor Counts" lines (each app's Guide, T-Score's The Research) end with a link,
// <a data-nocount-link href="?nocount=1">. It shows the choice this device can make next, and a tap
// switches it in place (no reload, so it works the same in an installed app, which has no address
// bar). The href is the fallback if this module never runs. A listener on the document, not an
// inline handler: this module is shared, so it can't use a page's delegate().
const LINK_TEXT = { count: 'Count this device again', stop: "Don't count this device" };
function updateNoCountLinks() {
    const optedOut = readOptOut();
    document.querySelectorAll('a[data-nocount-link]').forEach((a) => {
        a.textContent = optedOut ? LINK_TEXT.count : LINK_TEXT.stop;
        a.setAttribute('href', optedOut ? '?nocount=0' : '?nocount=1');
    });
}
function onNoCountLinkClick(e) {
    const a = e.target instanceof Element ? e.target.closest('a[data-nocount-link]') : null;
    if (!a) return;
    e.preventDefault();
    setOptOut(!readOptOut());
}

function loadUmami() {
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

export function initAnalytics() {
    applyNoCountParam();
    updateNoCountLinks();
    document.addEventListener('click', onNoCountLinkClick);
    loadUmami();
}

// Not under node --test, which imports this file for shouldCount.
if (typeof document !== 'undefined') initAnalytics();
