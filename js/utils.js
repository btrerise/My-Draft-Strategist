// --- SHARED UTILITIES ---

function normalizeName(name) {
    if (!name) return "";
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

    return aliasMap[n] || n;
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
    checkAndHideBanner('sleeperSyncBanner', 'mls_hide_sleeper_sync_banner');
});
// --- TOAST NOTIFICATIONS ---
window.showToast = function(message) {
  let toast = document.getElementById('mds-toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mds-toast';
    toast.className = 'mds-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  void toast.offsetWidth; // Force CSS reflow to ensure animation replays
  toast.classList.add('show');
  
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
};