// The menu (the drawer, which is the expanded navigation rail on computers) and the tab bar's keyboard, shared by both
// apps (improvements S26, from a Material 3 review of the rail).
//
// BACK CLOSES THE MENU. Material 3 dismisses a modal expanded rail with Back. Opening the menu pushes a history entry
// (the same URL and tab, marked `menu`), so the browser's Back takes it off and the popstate below closes the menu
// instead of the app's own popstate listener switching tabs. Closing the menu any other way (its button, Escape, the
// backdrop, choosing a tab) takes that entry off with history.back(), and the popstate it causes is swallowed; a tab
// switch from the menu waits for it (the promise menuClosed returns), so the new tab's history entry lands after it.
//
// This module's popstate listener must run before the app's: each app's nav module imports it, so it evaluates (and
// registers) first, and stopImmediatePropagation keeps the app's listener from seeing the pops handled here.

let menuOpen = false;
let closeOnBack = null;
let pendingPops = []; // resolvers for the history.back() calls menuClosed made, oldest first

/** The app's way to close its menu without touching history (called when Back takes the menu's entry off). */
export function closeMenuOnBack(close) {
    closeOnBack = close;
}

/** Call when the menu opens: adds the history entry Back will take off. */
export function menuOpened() {
    menuOpen = true;
    history.pushState({ ...(history.state || {}), menu: true }, '');
}

/**
 * Call when the menu closes by anything but Back: takes the menu's history entry off. Resolves once the browser has
 * done so (at once if there's no entry), so a caller about to push a history entry of its own can wait.
 */
export function menuClosed() {
    menuOpen = false;
    if (!history.state || !history.state.menu) return Promise.resolve();
    return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        pendingPops.push(finish);
        history.back();
        // A browser that never reports the pop mustn't leave a tab switch waiting, or swallow a later Back.
        setTimeout(() => {
            if (done) return;
            pendingPops = pendingPops.filter(f => f !== finish);
            finish();
        }, 1000);
    });
}

/**
 * Shows or hides the menu's backdrop. It fades (css/base.css, `.menu-overlay.open`) rather than appearing at once: a
 * whole page dimming and blurring in one frame, while the menu has barely started to move, read as a jolt
 * (improvements S26). It's display:none while hidden, so it isn't laid out or blurred then; hiding waits for the fade.
 */
export function setBackdrop(overlay, open) {
    clearTimeout(overlay._hideTimer);
    if (open) {
        overlay.style.display = 'block';
        overlay.classList.add('open'); // @starting-style fades it in from display:none
        return;
    }
    overlay.classList.remove('open');
    const ms = parseFloat(getComputedStyle(overlay).transitionDuration) * 1000 || 0;
    if (!ms) { overlay.style.display = 'none'; return; }
    overlay._hideTimer = setTimeout(() => { if (!overlay.classList.contains('open')) overlay.style.display = 'none'; }, ms);
}

window.addEventListener('popstate', (e) => {
    if (pendingPops.length) {
        e.stopImmediatePropagation();
        pendingPops.shift()();
        return;
    }
    if (menuOpen) {
        e.stopImmediatePropagation();
        menuOpen = false;
        if (closeOnBack) closeOnBack();
    }
});

// ARROW KEYS. Material 3: Tab or the arrow keys move between navigation items, Space or Enter selects. In the tab bar,
// the navigation rail and the menu's list, the arrows (either direction pair, whichever way the items run) move focus
// to the next or previous item, wrapping round; Home and End go to the first and last.
document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    const item = e.target.closest && e.target.closest('.nav-btn');
    const list = item && item.closest('.nav-bar, .menu-nav-links');
    if (!list) return;
    const items = [...list.querySelectorAll('.nav-btn')].filter(b => b.offsetParent !== null);
    const at = items.indexOf(item);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + step + items.length) % items.length;
    items[next].focus();
});
