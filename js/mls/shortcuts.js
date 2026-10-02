// Moved from js/mls/legacy.js in refactor chunk 3E: POWER-USER KEYBOARD SHORTCUTS (MLS). Registers
// its document keydown listener when the module evaluates.

// --- POWER-USER KEYBOARD SHORTCUTS (MLS) ---
document.addEventListener('keydown', (e) => {
    // Escape closes the hamburger drawer from anywhere, so keyboard users have a way to
    // dismiss it without a mouse. The drawerOverlay backdrop is intentionally NOT a tab
    // stop (standard pattern for backdrops); this plus the existing visible close button
    // are the two keyboard-accessible ways to exit the menu.
    const openDrawer = document.getElementById('drawer');
    if (e.key === 'Escape' && openDrawer && openDrawer.classList.contains('open')) {
        window.toggleDrawer();
        return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
    
    if (isInputActive) return;

    // Shift + Arrow keys to quickly cycle leagues
    if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (typeof window.cycleLeague === 'function') window.cycleLeague(-1);
        return;
    }
    if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (typeof window.cycleLeague === 'function') window.cycleLeague(1);
        return;
    }

    // Ctrl+Z / Cmd+Z to undo the last lineup edit (swap, lock toggle, unlock-all, or a
    // manual "Optimize Lineup" click), Ctrl+Shift+Z or Ctrl+Y / Cmd+Shift+Z to redo --
    // see pushLineupUndoSnapshot and undoLineupChange/redoLineupChange above for scope.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (typeof window.undoLineupChange === 'function') window.undoLineupChange();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        if (typeof window.redoLineupChange === 'function') window.redoLineupChange();
        return;
    }

    switch(e.key) {
        case '1': if (typeof window.showTab === 'function') window.showTab('setup'); break;
        case '2': if (typeof window.showTab === 'function') window.showTab('roster'); break;
        case '3': if (typeof window.showTab === 'function') window.showTab('lineup'); break;
        case '4': if (typeof window.showTab === 'function') window.showTab('scout'); break;
        case '5': if (typeof window.showTab === 'function') window.showTab('guide'); break;
    }
});
