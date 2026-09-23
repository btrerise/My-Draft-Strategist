// --- SHARED UTILITIES ---

// Cache of raw name -> normalized result. normalizeName() is called repeatedly on the
// same player names during sorting/matching (roster syncs, rankings uploads, waiver
// scans), so this avoids re-running the Unicode normalize + regex chain on inputs
// we've already seen. Keyed on the raw input string, since that's what every caller
// actually has on hand.
const _normalizeNameCache = new Map();

// Known cross-platform name mismatches, mapping the variant spelling to the canonical one.
// Hoisted to module scope from inside normalizeName and isNameMatch, which each declared their
// own identical copy of this object literal -- meaning a fresh 11-key object was allocated on
// every cache miss and on every isNameMatch call. Building an index over Sleeper's ~11,000
// -player map (mls.js does this in several places) is thousands of those allocations for an
// object that never changes.
const NAME_ALIASES = {
    'kennygainwell': 'kennethgainwell',
    'gabedavis': 'gabrieldavis',
    'joshpalmer': 'joshuapalmer',
    'mitchtrubisky': 'mitchelltrubisky',
    'tankdell': 'nathanieldell',
    'hollywoodbrown': 'marquisebrown',
    'scottymiller': 'scottmiller',
    'djchark': 'djcharkjr',
    'jeffwilson': 'jefferywilson',
    'nicholassingleton': 'nicksingleton',
    'kennethwalker': 'kenwalker'
};

function normalizeName(name) {
    if (!name) return "";

    const cached = _normalizeNameCache.get(name);
    if (cached !== undefined) return cached;

    let n = String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .replace(/(jr|sr|iii|ii|iv|v)$/, '');

    const result = NAME_ALIASES[n] || n;
    _normalizeNameCache.set(name, result);
    return result;
}

// NOTE: normalizeName already applies NAME_ALIASES, so by the time n1/n2 exist here they are
// both canonical -- and since no alias VALUE is also an alias KEY, NAME_ALIASES[n1] is always
// undefined at this point. The two lookups below are therefore unreachable in practice and the
// function is equivalent to comparing the two normalized names. They're kept because they cost
// nothing and would start mattering again the moment someone adds an alias whose value is
// itself another alias's key, which is an easy thing to do to the table above by accident.
function isNameMatch(name1, name2) {
    if (!name1 || !name2) return false;
    let n1 = normalizeName(name1);
    let n2 = normalizeName(name2);

    if (n1 === n2) return true;

    if (NAME_ALIASES[n1] === n2 || NAME_ALIASES[n2] === n1) return true;
    if (NAME_ALIASES[n1] && NAME_ALIASES[n1] === NAME_ALIASES[n2]) return true;

    return false;
}
// --- NETWORK FETCH WITH A TIMEOUT ---
// Every remote call this app makes -- Sleeper, LeagueLogs, FantasyCalc, ESPN -- used to be a
// bare fetch(), and fetch() has no timeout of any kind. A connection that FAILS rejects
// promptly, and every call site already handles that. A connection that STALLS never settles
// at all: the promise just sits there, forever, and so does everything awaiting it.
//
// That's not a hypothetical here -- it's the environment sw.js's own header comment describes
// as this app's real one: a phone, mid-draft or minutes before kickoff, on congested stadium
// or cellular data. With no timeout, a stall left syncActiveLeague's button spinning,
// runScout's "Looking up player positions..." on screen, and autoFindWaiverUpgrades' Scan
// button disabled -- no error, no toast, no way back except reloading the page.
//
// mdsFetch is the one place that fixes that, for all three apps. It's a drop-in for fetch():
// same arguments, same Response, same rejection on a genuine network failure. Two additions:
//
//   1. Every request carries an abort signal that fires after `ms`. The signal covers the
//      response BODY too, not just the headers, so a download that dies halfway through is
//      caught by the same clock as one that never starts.
//   2. A timeout rejects with a message naming the service that went quiet ("Sleeper didn't
//      respond in time."). This matters because the existing call sites interpolate
//      err.message straight into a toast -- a raw "signal is aborted without reason" there
//      reads like a bug in the app rather than a connection worth retrying.

// 12s is the ceiling for an ordinary JSON response (a league, a roster, a week of stats --
// tens to hundreds of KB). Long enough that a merely slow connection still succeeds, short
// enough that a person staring at a spinner gets an answer while they're still waiting on it.
const MDS_FETCH_TIMEOUT_MS = 12000;

// Sleeper's players/nfl payload is close to 5MB (see sleeperApi.js's cache comment). The
// default above would abort a perfectly healthy download of it on a slow connection, so its
// callers pass this instead. Still bounded -- the point of this whole wrapper is that there
// is always a ceiling, not that some requests are exempt from one.
window.MDS_LONG_FETCH_TIMEOUT_MS = 30000;

// Used only to name the service in a timeout message. Matched against the hostname (exact, or
// as a suffix after a dot) rather than searched for anywhere in the URL, so a profile key or
// query param that happens to contain one of these strings can't mislabel the error.
const MDS_FETCH_SERVICES = [
    ['sleeper.app', 'Sleeper'],
    ['sleeper.com', 'Sleeper'],
    ['leaguelogs.com', 'LeagueLogs'],
    ['fantasycalc.com', 'FantasyCalc'],
    ['espn.com', 'ESPN'],
    ['google.com', 'Google Sheets']
];

function mdsFetchServiceName(url) {
    let host;
    try {
        host = new URL(String(url), window.location.href).hostname;
    } catch (e) {
        return 'The server'; // unparseable URL -- still better than naming the wrong service
    }
    const match = MDS_FETCH_SERVICES.find(([domain]) => host === domain || host.endsWith('.' + domain));
    return match ? match[1] : 'The server';
}

// Builds the signal for one request. Returns { signal, timedOut } where timedOut is read
// AFTER the request settles, to tell our own timeout apart from a caller's cancellation.
function mdsFetchSignal(ms, callerSignal) {
    const state = { signal: null, timedOut: false };

    // AbortSignal.timeout aborts with a DOMException named 'TimeoutError', which is what the
    // catch below keys on -- state.timedOut stays false on this path and doesn't need to be
    // set. AbortSignal.any is what lets a caller's own signal coexist with the timeout instead
    // of one silently replacing the other.
    const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
    const hasAny = typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function';
    if (hasTimeout && (!callerSignal || hasAny)) {
        const timeoutSignal = AbortSignal.timeout(ms);
        state.signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
        return state;
    }

    // Fallback for browsers without those two (and for the one combination they don't cover):
    // identical behavior wired by hand. The timer is deliberately never cleared -- aborting an
    // already-settled request is a no-op, and leaving it armed is precisely what keeps the
    // timeout covering the body stream after the headers have arrived.
    const controller = new AbortController();
    setTimeout(() => { state.timedOut = true; controller.abort(); }, ms);
    if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    state.signal = controller.signal;
    return state;
}

/**
 * fetch() with a timeout. Drop-in replacement -- same arguments, same Response.
 *
 * @param {string} url
 * @param {RequestInit} [opts] - passed through; a `signal` here is honored alongside the timeout
 * @param {number} [ms=12000] - pass window.MDS_LONG_FETCH_TIMEOUT_MS for multi-megabyte payloads
 * @returns {Promise<Response>} rejects with a TimeoutError whose .message is user-facing
 *   ("Sleeper didn't respond in time...") and whose .isTimeout is true, so a call site that
 *   wants to distinguish a timeout from a 404 can, while one that just toasts err.message
 *   gets something readable for free.
 */
window.mdsFetch = async function(url, opts = {}, ms = MDS_FETCH_TIMEOUT_MS) {
    const req = mdsFetchSignal(ms, opts.signal);

    // A timeout on the AbortSignal.timeout path arrives as a DOMException named 'TimeoutError'.
    // On the hand-wired fallback it's a plain 'AbortError', so that one is read as a timeout
    // only when our own timer is what fired -- otherwise an unrelated failure that happens to
    // land after the timer (a malformed-JSON SyntaxError, say) would be reported as one.
    const translate = (err) => {
        const name = err && err.name;
        if (name !== 'TimeoutError' && !(req.timedOut && name === 'AbortError')) return err;
        const timeoutErr = new Error(`${mdsFetchServiceName(url)} didn't respond in time. Check your connection and try again.`);
        timeoutErr.name = 'TimeoutError';
        timeoutErr.isTimeout = true;
        timeoutErr.cause = err;
        return timeoutErr;
    };

    let res;
    try {
        res = await fetch(url, { ...opts, signal: req.signal });
    } catch (err) {
        throw translate(err);
    }

    // The body is read at the call site (res.json()), outside the try above -- so a stall that
    // happens AFTER the headers arrive would otherwise surface there as a raw abort. Shadow
    // the two readers this app uses with versions that run the same translation, rather than
    // asking twenty call sites to each remember to handle it. These are own properties sitting
    // in front of Response.prototype; nothing else about the Response changes.
    ['json', 'text'].forEach(method => {
        const original = res[method].bind(res);
        res[method] = () => original().catch(err => { throw translate(err); });
    });

    return res;
};

function injectFeedbackForm() {
    const container = document.getElementById('shared-feedback-container');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--border); margin-top: 1rem;">
            <h4 style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">Report a Bug / Feedback</h4>
            <form action="https://formspree.io/f/xaewqqkq" method="POST" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="email" name="email" class="form-input" placeholder="Your email (optional)" style="padding: 0.5rem; font-size: 0.85rem;">
                <textarea name="message" class="form-input" placeholder="What went wrong?" required style="padding: 0.5rem; font-size: 0.85rem; min-height: 80px; resize: vertical;"></textarea>
                <button type="submit" class="btn btn-primary btn-sm">Submit</button>
            </form>
        </div>
    `;
}

// Automatically run this when the page loads
// --- FOCUS TRAPPING FOR OVERLAYS ---
// Shared by the hamburger drawer and the rankings preview modal (both in mls.js) so a
// keyboard user Tabbing through an open overlay stays inside it instead of tabbing into the
// page behind it -- previously neither one did this, despite the preview modal's markup
// already declaring role="dialog" aria-modal="true", a promise the JS wasn't keeping.
//
// Focusable elements are queried fresh every time the trap engages (open, and every Tab
// press) rather than cached once at open-time, because the drawer's feedback form is
// injected asynchronously into #shared-feedback-container and its inputs need to be
// included once they exist.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null); // skip anything hidden (display:none ancestor)
}

/**
 * Creates a focus trap scoped to `container`. Returns { activate, deactivate }; activate()
 * remembers what had focus beforehand, moves focus to the first focusable element inside
 * the container, and keeps Tab/Shift+Tab cycling within it. deactivate() removes that
 * listener and restores focus to whatever had it before activate() was called, so closing
 * an overlay puts a keyboard user right back where they were (e.g. the hamburger button).
 *
 * @param {HTMLElement} container
 * @param {{ onEscape?: Function }} [options] - onEscape, if given, is called (with no
 *   arguments) when Escape is pressed while the trap is active, instead of the trap doing
 *   anything itself with that key -- the caller decides what "close" means for it.
 */
window.createFocusTrap = function(container, options = {}) {
    let previouslyFocused = null;
    let active = false;

    function handleKeydown(e) {
        if (e.key === 'Escape' && typeof options.onEscape === 'function') {
            options.onEscape();
            return;
        }
        if (e.key !== 'Tab') return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    return {
        activate() {
            if (active) return;
            active = true;
            previouslyFocused = document.activeElement;
            container.addEventListener('keydown', handleKeydown);

            const focusable = getFocusableElements(container);
            if (focusable.length > 0) focusable[0].focus();
        },
        deactivate() {
            if (!active) return;
            active = false;
            container.removeEventListener('keydown', handleKeydown);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
            previouslyFocused = null;
        }
    };
};

// --- SHARED IN-APP CONFIRM DIALOG ---
// window.showConfirm() replaces window.confirm() across all three pages. Native confirm()
// freezes the whole page, can't be styled to match the app, and on mobile browsers renders
// with the site's origin in its title bar, which reads like a security warning rather than
// a question the app is asking. This keeps the same "stop and answer" semantics but inside
// the app, reusing the same overlay treatment as the rankings preview modal.
//
// Returns a Promise<boolean>, so call sites become `if (!await showConfirm(...)) return;`
// and the enclosing function picks up an `async`. Every caller is an onclick handler whose
// return value is discarded, so nothing downstream had to change.
//
// The markup is built here on first use rather than written into index.html, lineup/index.html
// and t-score/index.html, so all three apps get the dialog from this one shared script - the
// same reason showToast further down builds its own element.
let confirmDialogEls = null;
let confirmDialogOpen = false;

function escapeForDialog(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// A blank line starts a new paragraph, a single newline is a line break - matching how the
// confirm() messages this replaces were already formatted. Escaped first: these messages
// interpolate names the user typed (ranking sets, leagues, filenames) and names that came
// back from Sleeper, and unlike confirm() an innerHTML sink would treat those as markup.
function dialogMessageHTML(message) {
    return String(message)
        .split(/\n{2,}/)
        .map(block => `<p>${escapeForDialog(block).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function buildConfirmDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'mds-confirm-overlay';
    overlay.className = 'mds-modal-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mds-confirm-title');
    overlay.setAttribute('aria-describedby', 'mds-confirm-body');
    overlay.innerHTML = `
        <div class="mds-modal mds-confirm-modal">
            <h3 id="mds-confirm-title"></h3>
            <div id="mds-confirm-body" class="mds-confirm-body"></div>
            <div class="mds-modal-actions">
                <button type="button" class="btn btn-secondary" data-confirm-action="cancel"></button>
                <button type="button" class="btn" data-confirm-action="ok"></button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return {
        overlay,
        titleEl: overlay.querySelector('#mds-confirm-title'),
        bodyEl: overlay.querySelector('#mds-confirm-body'),
        cancelBtn: overlay.querySelector('[data-confirm-action="cancel"]'),
        okBtn: overlay.querySelector('[data-confirm-action="ok"]')
    };
}

/**
 * In-app replacement for window.confirm(). Resolves true if the person confirms, false if
 * they cancel, press Escape, or click the backdrop.
 *
 * @param {string} message - Body text. Blank lines become separate paragraphs.
 * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 *   danger styles the confirm button red (.btn-danger) for anything that destroys data;
 *   everything else gets the normal green primary button.
 * @returns {Promise<boolean>}
 */
window.showConfirm = function(message, options = {}) {
    // Two open dialogs would stack two focus traps on each other, and the second one's
    // deactivate() would restore focus into the first. The overlay covers the page while it's
    // open so this should be unreachable - answer "no" rather than half-open a second copy.
    if (confirmDialogOpen) return Promise.resolve(false);
    if (!confirmDialogEls) confirmDialogEls = buildConfirmDialog();

    const { overlay, titleEl, bodyEl, cancelBtn, okBtn } = confirmDialogEls;
    titleEl.textContent = options.title || 'Are you sure?';
    bodyEl.innerHTML = dialogMessageHTML(message);
    cancelBtn.textContent = options.cancelText || 'Cancel';
    okBtn.textContent = options.confirmText || 'Confirm';
    okBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';

    confirmDialogOpen = true;
    overlay.style.display = 'flex';

    return new Promise(resolve => {
        let trap = null;

        function settle(result) {
            if (!confirmDialogOpen) return;
            confirmDialogOpen = false;
            overlay.style.display = 'none';
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            overlay.removeEventListener('mousedown', onBackdrop);
            if (trap) trap.deactivate();
            resolve(result);
        }

        function onCancel() { settle(false); }
        function onOk() { settle(true); }

        // Clicking the dimmed area outside the card cancels, same as Escape. mousedown rather
        // than click so a drag that starts on the card and ends on the backdrop (selecting the
        // message text, say) isn't read as a dismissal.
        function onBackdrop(e) { if (e.target === overlay) settle(false); }

        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        overlay.addEventListener('mousedown', onBackdrop);

        // Cancel is first in the DOM, so the trap lands initial focus there rather than on a
        // destructive confirm button - Enter on an unread dialog does the safe thing.
        if (typeof window.createFocusTrap === 'function') {
            trap = window.createFocusTrap(overlay, { onEscape: () => settle(false) });
            trap.activate();
        }
    });
};

document.addEventListener('DOMContentLoaded', injectFeedbackForm);

// --- SCROLL-SHADOW CUE FOR WIDE TABLES ---
// Toggles .has-scroll-shadow (styles.css) on/off based on actual scroll position, rather
// than a static always-on shadow -- a shadow that's still showing after the user has
// scrolled all the way to the right would be actively misleading (implying there's more to
// see when there isn't). Applies to .table-responsive (Command Center) and .sos-table-wrapper
// (SoS grid) only; the Power Rankings heatmap intentionally doesn't use overflow-x: auto
// (see its own comment in mls.js -- tooltips would get clipped), so it's excluded here too.
function initScrollShadows() {
    const SCROLL_SHADOW_SELECTOR = '.table-responsive, .sos-table-wrapper';

    function updateShadow(el) {
        const hasOverflow = el.scrollWidth > el.clientWidth + 1;
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        el.classList.toggle('has-scroll-shadow', hasOverflow && !atEnd);
    }

    const containers = Array.from(document.querySelectorAll(SCROLL_SHADOW_SELECTOR));
    containers.forEach(el => {
        updateShadow(el);
        el.addEventListener('scroll', () => updateShadow(el), { passive: true });

        // Both containers' inner tables are (re)built dynamically after load -- the Command
        // Center table on league/week changes, the SoS grid whenever new SoS data is
        // uploaded -- which can change scrollWidth without ever firing a 'scroll' event.
        // A MutationObserver re-checks whenever that inner content actually changes, rather
        // than this needing every render call site to remember to re-run the check itself.
        if (window.MutationObserver) {
            new MutationObserver(() => updateShadow(el)).observe(el, { childList: true, subtree: true });
        }
    });

    window.addEventListener('resize', () => containers.forEach(updateShadow));
}
document.addEventListener('DOMContentLoaded', initScrollShadows);
function dismissBanner(bannerId, storageKey) {
    const banner = document.getElementById(bannerId);
    if (banner) banner.style.display = 'none';
    if (storageKey) localStorage.setItem(storageKey, 'true');
}

// Dismisses one banner and, in the same action, reveals a second banner that's staggered
// behind it -- used so the MLS dashboard's guide banner and cross-promo banner don't both
// stack on first load. nextBanner only appears once its own dismiss flag says it hasn't
// already been dismissed on some earlier visit (e.g. before this staggering existed).
window.dismissBannerAndReveal = function(bannerId, storageKey, nextBannerId, nextStorageKey) {
    dismissBanner(bannerId, storageKey);
    if (localStorage.getItem(nextStorageKey) === 'true') return;
    const nextBanner = document.getElementById(nextBannerId);
    if (nextBanner) nextBanner.style.display = 'flex';
};

// Hide on load if previously dismissed
document.addEventListener('DOMContentLoaded', () => {
    // Helper function to check storage and hide
    const checkAndHideBanner = (bannerId, storageKey) => {
        if (localStorage.getItem(storageKey) === 'true') {
            const banner = document.getElementById(bannerId);
            if (banner) banner.style.display = 'none';
        }
    };

    // Check all your app banners
    // NOTE: 'guideBanner' was previously checked against 'ds_hide_guide_banner' -- a leftover
    // from before app-scoped storage keys (see the localStorage key scoping principle) -- while
    // its own dismiss button has always written 'mls_hide_guide_banner'. That mismatch meant
    // dismissing the guide banner never actually stuck across reloads; fixed to check the same
    // key the button writes.
    checkAndHideBanner('guideBanner', 'mls_hide_guide_banner');
    checkAndHideBanner('mlsBanner', 'ds_hide_mls_banner');
    checkAndHideBanner('draftBanner', 'mls_hide_draft_banner');
    checkAndHideBanner('sleeperSyncBanner', 'mls_hide_sleeper_sync_banner');
    checkAndHideBanner('installCard', 'ds_hide_install_banner');

    // Staggered reveal: draftBanner starts hidden (see its inline style in index.html) so it
    // never stacks with guideBanner on a first visit. Once guideBanner has been dismissed
    // (whether just now or on some earlier visit), and draftBanner itself hasn't been
    // dismissed, draftBanner takes its place.
    if (localStorage.getItem('mls_hide_guide_banner') === 'true' && localStorage.getItem('mls_hide_draft_banner') !== 'true') {
        const draftBanner = document.getElementById('draftBanner');
        if (draftBanner) draftBanner.style.display = 'flex';
    }
});
// --- TOAST NOTIFICATIONS ---
// Batch operations (optimizeAllLineups, syncAllLeagues) call a per-league routine that toasts
// on its own, so firing N of them in a row is spam. Those callers suppress toasts for the
// length of the loop and report one summary at the end. They flip this flag rather than
// reassigning window.showToast to a no-op: a monkey-patch that never gets restored -- a throw
// mid-loop, an early return that skips the restore line -- silently kills every toast in the
// app for the rest of the session, including the error toast that would have explained why.
let toastsSuppressed = false;
window.setToastsSuppressed = function(suppressed) {
  toastsSuppressed = !!suppressed;
};

window.showToast = function(message, options = {}) {
  // options.force lets a batch caller surface something that genuinely matters (its summary,
  // or a failure) without having to unsuppress around the call.
  if (toastsSuppressed && !options.force) return;

  const isError = options.isError || false;
  const duration = options.duration || (isError ? 6000 : 3500);

  let toast = document.getElementById('mds-toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mds-toast';
    toast.className = 'mds-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }

  toast.classList.toggle('toast-error', isError);
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  // Support \n line breaks the same way the alert() messages this replaces already used them
  const textHTML = String(message).replace(/\n/g, '<br>');
  if (isError) {
    toast.innerHTML = `<span class="toast-message">${textHTML}</span><button class="toast-dismiss-btn" onclick="this.parentElement.classList.remove('show')" aria-label="Dismiss">✕</button>`;
  } else {
    toast.innerHTML = textHTML;
  }

  void toast.offsetWidth; // Force CSS reflow to ensure animation replays
  toast.classList.add('show');
  
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
};

// --- ON-DEMAND SCRIPT LOADING ---
// Loads a third-party script the first time something actually needs it, and returns the same
// promise on every later call so a second request never triggers a second download.
//
// Both apps previously loaded html2canvas (~200KB) from a <script defer> tag on every single
// page load, for a screenshot-export button most sessions never press. `defer` kept it off the
// critical rendering path, but it still cost the download, the parse and the memory on a phone
// every time either app opened. mls.js already had exactly this pattern for SheetJS
// (loadSheetJS, used only when someone uploads an .xlsx) -- this generalizes it so the same
// reasoning can apply to any heavy, rarely-used dependency, and so both apps share one copy.
//
// `globalName` is what the script defines on window; an already-present global short-circuits
// the whole thing, which also means this is safe if a <script> tag for the same library is
// ever added back.
const _loadedScriptPromises = new Map();
window.loadScriptOnce = function(src, globalName) {
    if (globalName && typeof window[globalName] !== 'undefined') return Promise.resolve();
    if (_loadedScriptPromises.has(src)) return _loadedScriptPromises.get(src);

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        // Clear the cached promise on failure so a later attempt (after reconnecting, or
        // after an ad-blocker is paused) genuinely retries instead of replaying this
        // rejection forever. Same reasoning as getPlayerSearchIndex's error path in mls.js.
        script.onerror = () => {
            script.remove();
            _loadedScriptPromises.delete(src);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });

    _loadedScriptPromises.set(src, promise);
    return promise;
};

// Convenience wrapper for the one library both apps lazy-load. Resolves true when html2canvas
// is ready to call, false when it couldn't be fetched -- callers surface that as a toast
// rather than silently doing nothing.
window.ensureHtml2Canvas = async function() {
    try {
        await window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
        return typeof html2canvas !== 'undefined';
    } catch (err) {
        return false;
    }
};

// Lazy-loads SheetJS (XLSX) on first use, so the many sessions that never upload an .xlsx
// don't pay for it. Previously lived only inside mls.js; mds.js had its own inline copy with
// no failure path at all, so a blocked/offline CDN left an .xlsx upload dead-ended in total
// silence. Shared here so both apps get the same error handling.
//
// Keeps the (callback, onError) signature rather than returning the promise, because
// rankingsParser.js takes this function as an injected parameter and documents that shape.
window.loadSheetJS = function(callback, onError) {
    window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX')
        .then(
            () => callback(),
            // Two arguments rather than .then().catch() on purpose: onError means "the library
            // didn't load", so it must not also fire when the library loaded fine and the
            // callback itself threw -- that would report a CDN failure for a parsing bug.
            () => { if (typeof onError === 'function') onError(); }
        );
};

// --- FLASH BUTTON FEEDBACK ---
// Shared by mds.js and mls.js (previously two separate near-identical copies).
// Uses innerHTML rather than innerText: some buttons' resting state includes icon markup
// (callers capture btn.innerHTML beforehand as the fallback to restore), and plain-text
// flash messages render identically either way, so innerHTML is the safe common choice.
window.flashButton = function(btn, text, isError = false, fallbackContent = null, duration = 2500) {
    if (!btn) return;
    const originalContent = fallbackContent || btn.innerHTML;
    const originalBg = btn.style.backgroundColor;

    btn.innerHTML = text;
    btn.style.backgroundColor = isError ? "var(--error-color, #ea4335)" : "var(--success-color, #4ade80)";
    btn.style.color = isError ? "white" : "var(--bg-main, #0b132b)";

    clearTimeout(btn.flashTimeout);
    btn.flashTimeout = setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.style.backgroundColor = originalBg;
        btn.style.color = "";
    }, duration);
};