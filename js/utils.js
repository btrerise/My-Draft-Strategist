// --- SHARED UTILITIES ---

// Cache of raw name -> normalized result. normalizeName() is called repeatedly on the
// same player names during sorting/matching (roster syncs, rankings uploads, waiver
// scans), so this avoids re-running the Unicode normalize + regex chain on inputs
// we've already seen. Keyed on the raw input string, since that's what every caller
// actually has on hand.
const _normalizeNameCache = new Map();

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

    const aliasMap = {
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

    const result = aliasMap[n] || n;
    _normalizeNameCache.set(name, result);
    return result;
}

function isNameMatch(name1, name2) {
    if (!name1 || !name2) return false;
    let n1 = normalizeName(name1);
    let n2 = normalizeName(name2);
    
    if (n1 === n2) return true;

    const aliasMap = {
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

    if (aliasMap[n1] === n2 || aliasMap[n2] === n1) return true;
    if (aliasMap[n1] && aliasMap[n1] === aliasMap[n2]) return true;

    return false;
}
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
window.showToast = function(message, options = {}) {
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