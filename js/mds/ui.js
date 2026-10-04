// Moved from js/mds.js in refactor chunk 2A:
// UI HELPERS, plus the block that sat between BACKUP & RESTORE and
// the Sleeper section: showTab and the back-button handler, and the player-card handlers
// (setPosFilter, toggleEditBar, toggleCardDetails, saveInlineEdit).
import { savePlayerPool } from './storage.js';
import { State, refreshDraftDropdown } from './state.js';
import { renderBoard } from './tracker.js';
import { createFocusTrap } from '../shared/ui/focusTrap.js';
import { getTabFromHash } from '../shared/ui/tabHash.js';

    // --- UI HELPERS ---
    // Generic debounce: delays calling fn until `wait` ms have passed since the last call.
    // Used on the search input so renderBoard() (which rebuilds the whole player pool) doesn't
    // run on every single keystroke.
    export function debounce(fn, wait) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // flashButton intentionally NOT declared here -- previously shadowed the shared version
    // now in js/shared/ui/flashButton.js (loaded before this file). Calls below resolve to that shared version.

    // Focus trap for the open drawer, mirroring MLS's toggleDrawer. No onEscape: the
    // document-level Escape handler in the keydown listener already calls toggleMenu()
    // when the menu is open, and the close branch below deactivates the trap, which
    // returns focus to the hamburger button.
    let menuFocusTrap = null;

    export const toggleMenu = function() {
    const menu = document.getElementById('hamburgerMenu');
    const overlay = document.getElementById('menuOverlay');
    const hamburgerBtn = document.querySelector('.hamburger-btn'); // Grab the button
    
    if (!menu || !overlay) return;
    
    const isOpen = menu.classList.toggle('open');
    overlay.style.display = isOpen ? 'block' : 'none';
    
    // Announce the new state to screen readers
    if (hamburgerBtn) {
        hamburgerBtn.setAttribute('aria-expanded', isOpen);
    }

    if (isOpen) {
        menuFocusTrap = createFocusTrap(menu);
        menuFocusTrap.activate();
    } else if (menuFocusTrap) {
        menuFocusTrap.deactivate();
        menuFocusTrap = null;
    }
};

    export const showTab = function(tabId, skipHistory = false) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(tabId + 'Tab');
    if (targetTab) targetTab.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.hamburger-menu .nav-btn[data-target="${tabId}"], .nav-bar .nav-btn[data-target="${tabId}"]`)
        .forEach(btn => btn.classList.add('active'));

    const menu = document.getElementById('hamburgerMenu');
    if (menu && menu.classList.contains('open')) toggleMenu();

    if (['tracker', 'team', 'board'].includes(tabId)) renderBoard();
    if (tabId === 'setup') refreshDraftDropdown();
    window.scrollTo(0, 0);

    // --- NEW: Push to browser history so the back button works ---
    if (!skipHistory) {
        history.pushState({ tab: tabId }, '', `#${tabId}`);
    }
};
// --- NEW: Catch the native back button ---
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) {
        // Pass 'true' so we don't accidentally create an infinite history loop
        showTab(e.state.tab, true); 
    } else {
        // No state = an entry we didn't push (a hand-edited hash, or an in-page link), so
        // honor its hash if it names a real tab.
        showTab(getTabFromHash() || 'setup', true);
    }
});

    export const setPosFilter = function(pos) {
        // Ensure State.activePosFilter is an array (backwards compatibility)
        if (!Array.isArray(State.activePosFilter)) State.activePosFilter = [];

        if (pos === 'ALL') {
            State.activePosFilter = []; // Empty array means ALL
        } else {
            let idx = State.activePosFilter.indexOf(pos);
            if (idx !== -1) {
                State.activePosFilter.splice(idx, 1); // Toggle off
            } else {
                State.activePosFilter.push(pos); // Toggle on
            }
        }
        renderBoard();
    };

    export const toggleEditBar = function(id) {
        const bar = document.getElementById(`inline-edit-${id}`);
        if (bar) {
            const isFlex = bar.style.display === 'flex';
            bar.style.display = isFlex ? 'none' : 'flex';
            
            // Remember the edit state so it doesn't snap shut on auto-sync
            let p = State.players.find(x => x.id === id);
            if (p) p.isEditing = !isFlex;

            // Keep the pencil button's expanded state in sync, and move keyboard users into
            // the editor they just opened (its first field is Rank). Keyboard only (the button
            // shows :focus-visible): on a tap, focusing a number field would pop the phone's
            // keyboard over the card before anyone asked for it.
            const toggleBtn = document.querySelector(`[aria-controls="inline-edit-${id}"]`);
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!isFlex));
            if (!isFlex && toggleBtn && toggleBtn.matches(':focus-visible')) bar.querySelector('input')?.focus();
        }
    };
    // expandBtn: the button that was clicked. The inline handler read it from e.currentTarget;
    // since refactor chunk 5A the delegated listener in main.js passes it.
    export const toggleCardDetails = function(e, id, expandBtn) {
    e.stopPropagation(); 
    const card = document.getElementById(`details-${id}`).closest('.player-card');
    
    if (card) {
        const isNowExpanded = card.classList.toggle('is-expanded');
        
        // Announce the new state to screen readers
        if (expandBtn) expandBtn.setAttribute('aria-expanded', isNowExpanded);
        
        let p = State.players.find(x => x.id === id);
        if (p) {
            p.isExpanded = isNowExpanded;
        }
    }
};

    export const saveInlineEdit = function(id) {
        let p = State.players.find(x => x.id === id);
        if (!p) return;

        const getVal = elId => document.getElementById(elId)?.value;
        let newRank = parseInt(getVal(`edit-rank-val-${id}`));
        let newTier = getVal(`edit-tier-val-${id}`)?.trim() || "-";
        let newTeam = getVal(`edit-team-val-${id}`)?.trim().toUpperCase();
        let newBye = getVal(`edit-bye-val-${id}`)?.trim();

        if (!isNaN(newRank) && newRank !== p.rank) {
            let oldRank = p.rank;
            State.players.forEach(other => {
                if (other.id !== id) {
                    if (newRank < oldRank && other.rank >= newRank && other.rank < oldRank) other.rank += 1;
                    else if (newRank > oldRank && other.rank > oldRank && other.rank <= newRank) other.rank -= 1;
                }
            });
            p.rank = newRank;
        }
        p.tier = newTier;
        if (newTeam) p.team = newTeam;
        if (newBye) p.bye = newBye;
        
        p.isEditing = false;

        State.players.sort((a, b) => a.rank - b.rank);
        savePlayerPool();
        renderBoard();
    };
