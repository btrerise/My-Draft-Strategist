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
document.addEventListener('DOMContentLoaded', injectFeedbackForm);
function dismissBanner(bannerId, storageKey) {
    const banner = document.getElementById(bannerId);
    if (banner) banner.style.display = 'none';
    if (storageKey) localStorage.setItem(storageKey, 'true');
}

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
    checkAndHideBanner('guideBanner', 'ds_hide_guide_banner');
    checkAndHideBanner('mlsBanner', 'ds_hide_mls_banner');
    checkAndHideBanner('draftBanner', 'mls_hide_draft_banner');
    checkAndHideBanner('sleeperSyncBanner', 'mls_hide_sleeper_sync_banner');
    checkAndHideBanner('installCard', 'ds_hide_install_banner');
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