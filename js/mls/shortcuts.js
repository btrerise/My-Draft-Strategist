// Moved from js/mls/legacy.js in refactor chunk 3E: POWER-USER KEYBOARD SHORTCUTS (MLS). Registers
// its document keydown listener when the module evaluates.
import { toggleDrawer, showTab } from './nav.js';
import { cycleLeague } from './leagues/sync.js';
import { undoLineupChange, redoLineupChange } from './state.js';

// --- POWER-USER KEYBOARD SHORTCUTS (MLS) ---
document.addEventListener('keydown', (e) => {
    // Escape closes the hamburger drawer from anywhere, so keyboard users have a way to
    // dismiss it without a mouse. The drawerOverlay backdrop is intentionally NOT a tab
    // stop (standard pattern for backdrops); this plus the existing visible close button
    // are the two keyboard-accessible ways to exit the menu.
    const openDrawer = document.getElementById('drawer');
    if (e.key === 'Escape' && openDrawer && openDrawer.classList.contains('open')) {
        toggleDrawer();
        return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
    
    if (isInputActive) return;

    // Shift + Arrow keys to quickly cycle leagues
    if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        cycleLeague(-1);
        return;
    }
    if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        cycleLeague(1);
        return;
    }

    // Ctrl+Z / Cmd+Z to undo the last lineup edit (swap, lock toggle, unlock-all, or a
    // manual "Optimize Lineup" click), Ctrl+Shift+Z or Ctrl+Y / Cmd+Shift+Z to redo --
    // see pushLineupUndoSnapshot and undoLineupChange/redoLineupChange above for scope.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLineupChange();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redoLineupChange();
        return;
    }

    switch(e.key) {
        case '1': showTab('setup'); break;
        case '2': showTab('roster'); break;
        case '3': showTab('lineup'); break;
        case '4': showTab('scout'); break;
        case '5': showTab('guide'); break;
    }
});
