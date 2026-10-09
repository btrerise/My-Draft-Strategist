// Moved from lineup/mls.js in refactor chunk 3A: DRAWER & SWIPE LOGIC and NAVIGATION LOGIC.
import { State } from './state.js';
import { updatePulsePrompts } from './init.js';
import { refreshLeagueDropdown } from './leagues/sync.js';
import { loadRosterTab, onScoutTabShown, optimizeLineup } from './main.js';
import { createFocusTrap } from '../shared/ui/focusTrap.js';
import { getTabFromHash } from '../shared/ui/tabHash.js';
import { renderBadgeLegend } from './legend.js';

    // --- DRAWER & SWIPE LOGIC ---
    // Focus trap instance for the drawer -- created lazily on first open rather than at
    // load time (written when createFocusTrap was a window global that might not exist yet;
    // it's an import since refactor 5D, and creating it on first use is still fine).
    let drawerFocusTrap = null;

    export const toggleDrawer = function() {
        const drawer = document.getElementById('drawer');
        const overlay = document.getElementById('drawerOverlay');
        const hamburgerBtn = document.querySelector('.hamburger-btn');

        if (!drawer || !overlay) return;

        const isOpen = drawer.classList.toggle('open');
        overlay.style.display = isOpen ? 'block' : 'none';

        // Announce the new state to screen readers
        if (hamburgerBtn) {
            hamburgerBtn.setAttribute('aria-expanded', isOpen);
        }

        if (isOpen) {
            // No onEscape here: the existing document-level Escape handler below already
            // calls toggleDrawer() when the drawer is open, which (via the isOpen === false
            // branch) deactivates this trap on its way out. Wiring a second Escape handler
            // through the trap itself would just be two paths to the same toggle.
            drawerFocusTrap = createFocusTrap(drawer);
            drawerFocusTrap.activate();
        } else if (drawerFocusTrap) {
            drawerFocusTrap.deactivate();
            drawerFocusTrap = null;
        }
    };

    export const navigateFromDrawer = function(tabId) {
        document.querySelectorAll('.hamburger-menu .nav-btn').forEach(l => l.classList.remove('active-link'));
        const targetBtn = document.querySelector(`.hamburger-menu .nav-btn[data-drawer-target="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active-link');
        
        toggleDrawer();
        showTab(tabId);
    };

    const mainAppEl = document.getElementById('mainApp');
    if (mainAppEl) {
        mainAppEl.addEventListener('touchstart', e => { State.touchStartX = e.changedTouches[0].screenX; }, {passive: true});
        // handleSwipe needs the event itself (not just the recorded X positions) so it can tell
        // whether the touch ended inside a scrollable/interactive element and skip the tab swipe.
        mainAppEl.addEventListener('touchend', e => { State.touchEndX = e.changedTouches[0].screenX; handleSwipe(e); }, {passive: true});
    }

    function handleSwipe(e) {
        // Skip the tab-swipe gesture entirely if the touch happened over a scrollable table,
        // grid, or form control -- otherwise a horizontal scroll/drag inside those elements
        // gets misread as a request to switch tabs.
        if (e && e.target && e.target.closest('.roster-container-wrapper, .lineup-container-wrapper, .sos-table-wrapper, select, input, textarea')) {
            return; 
        }

        // 20% of viewport width, with a floor so this doesn't get too twitchy on narrow
        // phones (e.g. 20% of a 320px-wide screen would be 64px, which is on the edge of
        // triggering from an imprecise scroll/tap rather than a deliberate swipe).
        const swipeThreshold = Math.max(80, window.innerWidth * 0.2);
        const activeTabBtn = document.querySelector('.nav-bar .nav-btn.active');
        if (!activeTabBtn) return;
        
        // 'guide' is deliberately left out of the swipe order -- it's still reachable from
        // the drawer, but swiping from Scout into a wall of documentation reads as a
        // misfire rather than a tab change. Scout is the last swipeable tab.
        const tabs = ['setup', 'roster', 'lineup', 'scout'];
        const currentIdx = tabs.indexOf(activeTabBtn.getAttribute('data-target'));
        
        if (State.touchEndX < State.touchStartX - swipeThreshold) {
            if (currentIdx < tabs.length - 1) {
                showTab(tabs[currentIdx + 1]);
                updateDrawerActiveState(tabs[currentIdx + 1]);
            }
        }
        if (State.touchEndX > State.touchStartX + swipeThreshold) {
            if (currentIdx > 0) {
                showTab(tabs[currentIdx - 1]);
                updateDrawerActiveState(tabs[currentIdx - 1]);
            }
        }
    }

    export function updateDrawerActiveState(tabId) {
        document.querySelectorAll('.hamburger-menu .nav-btn').forEach(l => l.classList.remove('active-link'));
        const targetBtn = document.querySelector(`.hamburger-menu .nav-btn[data-drawer-target="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active-link');
    }

    // --- NAVIGATION LOGIC ---
    export const showTab = function(tabId, skipHistory = false) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const targetTab = document.getElementById(tabId + 'Tab');
        if (targetTab) targetTab.classList.add('active');

        document.querySelectorAll('.nav-bar .nav-btn').forEach(b => b.classList.remove('active'));
        const activeNavBtn = document.querySelector(`.nav-bar .nav-btn[data-target="${tabId}"]`);
        if (activeNavBtn) activeNavBtn.classList.add('active');

        // Announced to screen readers via the aria-live region in index.html -- covers every
        // way a tab can change (swipe, number-key shortcuts, hamburger menu, browser back/
        // forward), not just one of them, since they all funnel through this one function.
        // Reads the nav button's own visible label rather than a separate hardcoded name map,
        // so it can't drift out of sync if a tab's label is ever renamed.
        const announcer = document.getElementById('tabChangeAnnouncer');
        if (announcer && activeNavBtn) {
            const label = activeNavBtn.querySelector('span');
            if (label) announcer.textContent = `${label.textContent} tab`;
        }

        if (tabId === 'lineup') optimizeLineup(false);
        if (tabId === 'roster') loadRosterTab();
        if (tabId === 'setup') refreshLeagueDropdown();
        if (tabId === 'scout') onScoutTabShown();
        // The Guide's badge legend is built the first time the Guide is shown (improvements S10).
        if (tabId === 'guide') renderBadgeLegend();
        window.scrollTo(0, 0);

        if (typeof updatePulsePrompts === 'function') updatePulsePrompts();

        // Push to browser history (unless explicitly skipped, e.g. when we're the ones
        // responding to a popstate event below) so the native back button works.
        if (!skipHistory) {
            history.pushState({ tab: tabId }, '', `#${tabId}`);
        }
    };

    // Catches the native back/forward button and replays it as a tab switch, passing
    // skipHistory=true so we don't push a duplicate entry back onto the history stack.
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.tab) {
            showTab(e.state.tab, true);
        } else {
            // No state = an entry we didn't push (a hand-edited hash), so honor its hash if
            // it names a real tab.
            showTab(getTabFromHash() || 'setup', true);
        }
    });
