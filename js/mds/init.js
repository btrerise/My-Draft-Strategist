/**
 * Fantasy Football Draft Strategist - Core Logic & Multi-Draft Engine
 * Merged with Custom UI/UX Features (T-Scores, Tiers, Inline Edits, Export)
 */

// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// INITIALIZATION, with the POWER-USER KEYBOARD SHORTCUTS and MOBILE COLLAPSE TOGGLE inside it,
// plus legacy.js's import list. main.js imports this file first.
// The import order below sets the order in which the modules' load-time code runs: it matches
// the order that code had in mds.js. state.js must come before storage.js (see storage.js).
// The modules 2B added come last; they only declare things. This file's DOMContentLoaded
// listener registers after every other module's load-time code, as it did at the end of mds.js.
import { State, ensureDefaultDraft, refreshDraftDropdown } from './state.js';
import './storage.js';
import './pwa.js';
import { debounce } from './ui.js';
import './gestures.js';
import { initSettingsUI, updateMetaDisplay, updateTotalRounds } from './settings.js';
import './backup.js';
import './sleeperSync.js';
import './queue.js';
import './import.js';
import './market.js';
import { renderBoard, toggleHeadshots } from './tracker.js';
import { KEYS } from '../shared/storage/keys.js';
import './board.js';
import './team.js';
import './handoff.js';
import './recap.js';
import './export.js';
import './affinity.js';

    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        ensureDefaultDraft();
        refreshDraftDropdown();
        initSettingsUI();
        updateMetaDisplay();
        
        ['limitQB', 'limitRB', 'limitWR', 'limitTE', 'limitFLEX', 'limitSFLEX', 'limitK', 'limitDEF', 'limitBENCH'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateTotalRounds);
        });

        const searchBarEl = document.getElementById('searchBar');
        if (searchBarEl) {
            searchBarEl.addEventListener('input', debounce(renderBoard, 200));
        }

        // (Player cards used to be focusable role="button" wrappers that proxied Enter/Space to
        // their Taken button. A button can't contain other buttons -- screen readers flatten or
        // skip the star, color label, Pick and expand buttons inside it -- so the card is now a
        // plain labeled group and each of its buttons is reached with Tab directly.)
        // --- POWER-USER KEYBOARD SHORTCUTS ---
        document.addEventListener('keydown', (e) => {
            // Escape closes the hamburger drawer from anywhere, so keyboard users have a way to
            // dismiss it without a mouse. The menuOverlay backdrop is intentionally NOT a tab
            // stop (standard pattern for backdrops); this plus the existing visible close button
            // are the two keyboard-accessible ways to exit the menu.
            const openMenu = document.getElementById('hamburgerMenu');
            if (e.key === 'Escape' && openMenu && openMenu.classList.contains('open')) {
                window.toggleMenu();
                return;
            }

            // Check if user is typing in an input field to prevent accidental triggers
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

            if (isInputActive) {
                // EXCEPTION: Allow Escape key to quickly clear and exit the search bar
                if (e.key === 'Escape' && document.activeElement.id === 'searchBar') {
                    document.activeElement.value = '';
                    document.activeElement.blur();
                    renderBoard(); // Force board to reset instantly
                }
                return; // Stop processing other hotkeys if typing
            }

            // Global Hotkeys
            switch(e.key.toLowerCase()) {
                case '/': // Focus search bar
                    e.preventDefault(); 
                    const searchEl = document.getElementById('searchBar');
                    if (searchEl) {
                        searchEl.focus();
                        searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    break;
                case 'a': // Filter All
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('ALL');
                    break;
                case 'q': // Filter QB
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('QB');
                    break;
                case 'r': // Filter RB
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('RB');
                    break;
                case 'w': // Filter WR
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('WR');
                    break;
                case 't': // Filter TE
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('TE');
                    break;
                case '1':
                    if (typeof window.showTab === 'function') window.showTab('setup');
                    break;
                case '2':
                    if (typeof window.showTab === 'function') window.showTab('tracker');
                    break;
                case '3':
                    if (typeof window.showTab === 'function') window.showTab('team');
                    break;
                case '4':
                    if (typeof window.showTab === 'function') window.showTab('board');
                    break;
                case '5':
                    if (typeof window.showTab === 'function') window.showTab('guide');
                    break;
            }
        });

        if (State.players.length > 0) renderBoard();
    // --- MOBILE COLLAPSE TOGGLE ---
        const collapseCheckbox = document.getElementById('ds_mobile_collapse');
        if (collapseCheckbox) {
            const savedPref = localStorage.getItem(KEYS.mds.mobileCollapsePref);
            if (savedPref !== null) collapseCheckbox.checked = savedPref === 'true';
            
            const applyCollapsePref = (isChecked) => {
                if (isChecked) document.body.classList.add('enable-mobile-collapse');
                else document.body.classList.remove('enable-mobile-collapse');
            };
            
            applyCollapsePref(collapseCheckbox.checked);
            
            collapseCheckbox.addEventListener('change', (e) => {
                localStorage.setItem(KEYS.mds.mobileCollapsePref, e.target.checked);
                applyCollapsePref(e.target.checked);
            });
        }
        const showHeadshots = localStorage.getItem(KEYS.mds.showHeadshots) !== 'false';
        const toggleEl = document.getElementById('toggleHeadshots');
        if (toggleEl) toggleEl.checked = showHeadshots;
        toggleHeadshots(showHeadshots);

        // Deep link: open the tab named in the URL hash (a reload, or a shared #tracker link).
        // Runs after everything above so the board has its data before showTab renders it.
        // replaceState stamps this first history entry with its tab, so pressing Back to it
        // later restores the right tab instead of falling through to Setup.
        const initialTab = window.getTabFromHash() || 'setup';
        if (initialTab !== 'setup') window.showTab(initialTab, true);
        history.replaceState({ tab: initialTab }, '');

        // Last line of init on purpose: tells the safety net in js/boot.js that this script
        // evaluated all the way through and the page is genuinely usable, so a later uncaught
        // error gets logged instead of covering a working screen with the fatal-boot banner.
        // If anything above throws, this never runs and the banner stays armed -- which is
        // exactly the behavior we want.
        if (typeof window.markAppReady === 'function') window.markAppReady();
    });
