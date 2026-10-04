// Moved from js/mds.js in refactor chunk 2A:
// GESTURE HANDLING.
import { State } from './state.js';

    // --- GESTURE HANDLING ---
    function handleGesture(e) {
    // Prevent tab swipe if touch started/ended inside horizontal scrolling containers or inputs
    if (e && e.target && e.target.closest('.draft-board-container, .table-responsive, .data-table-wrapper, select, input, textarea')) {
        return;
    }

    // 20% of viewport width, with a floor so this doesn't get too twitchy on narrow
    // phones (e.g. 20% of a 320px-wide screen would be 64px, which is on the edge of
    // triggering from an imprecise scroll/tap rather than a deliberate swipe). Same
    // threshold js/mls/nav.js uses for the same gesture.
    const swipeThreshold = Math.max(80, window.innerWidth * 0.2);
    const diffX = State.touchEndX - State.touchStartX;

    if (Math.abs(diffX) > swipeThreshold) {
        const activeNavBtn = document.querySelector('.nav-bar .nav-btn.active');
        if (!activeNavBtn) return;

        // Must match the on-screen order of the nav buttons (setup, tracker, team, board --
        // see both the drawer and the bottom nav bar in index.html), otherwise swiping jumps
        // over a tab and lands somewhere the tab bar says isn't next. 'guide' is deliberately
        // left out: it's reachable from the drawer, but swiping from the last tab into a wall
        // of documentation reads as a misfire rather than a tab change (same call as js/mls/nav.js).
        const tabs = ['setup', 'tracker', 'team', 'board'];
        const currentIdx = tabs.indexOf(activeNavBtn.getAttribute('data-target'));

        if (diffX < 0 && currentIdx < tabs.length - 1) {
            // Swiped Left -> Next Tab
            window.showTab(tabs[currentIdx + 1]);
        } else if (diffX > 0 && currentIdx > 0) {
            // Swiped Right -> Previous Tab
            window.showTab(tabs[currentIdx - 1]);
        }
    }
}

    document.addEventListener('touchstart', e => { State.touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    document.addEventListener('touchend', (e) => {
    State.touchEndX = e.changedTouches[0].screenX;
    handleGesture(e);
}, { passive: true });
