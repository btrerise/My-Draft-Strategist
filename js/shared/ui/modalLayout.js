// --- DIALOGS WITH A PINNED BUTTON ROW (improvements F10) ---
// The shared dialogs (.preview-modal: the rankings upload previews of both apps and Lineup Strategist's league
// picker; .mds-modal: showConfirm and showPrompt) are a column in css/base.css: the title, a middle that scrolls
// (.preview-body / .mds-modal-body) and the button row, which stays at the bottom. Before, the whole card scrolled as
// one block, and on a phone with many leagues Cancel and Replace Set sat below the fold.
//
// watchModal(overlay) runs while a dialog is open and does two things CSS can't do on every browser:
//   * marks the button row .is-scrolled-under while there's more content below the fold (a line and a shadow above
//     the buttons, so it reads as pinned rather than as the end of the content), and the card .is-scrolled-down
//     once the middle is scrolled (the same line under the title, round 2);
//   * fits the overlay to the part of the window the person can see when that's smaller than the window, which is
//     what an on-screen keyboard does on phones (iOS Safari and Chrome on Android shrink only the "visual viewport").
//     The card then sizes to that band (max-height: 100% of the overlay), so the field and the buttons stay above
//     the keyboard. With nothing covering the window, the overlay keeps its CSS size.
// It returns a function that stops all of it; call it when the dialog closes.
const BODY = '.preview-body, .mds-modal-body';
const ACTIONS = '.preview-actions, .mds-modal-actions';

export function watchModal(overlay) {
    if (!overlay) return () => {};
    const body = overlay.querySelector(BODY);
    const actions = overlay.querySelector(ACTIONS);
    const stops = [];

    if (body && actions) {
        body.scrollTop = 0; // each opening starts at the top, not where the last one was left
        const update = () => {
            const below = body.scrollHeight - body.scrollTop - body.clientHeight;
            actions.classList.toggle('is-scrolled-under', below > 1);
            body.parentElement.classList.toggle('is-scrolled-down', body.scrollTop > 1);
        };
        body.addEventListener('scroll', update, { passive: true });
        stops.push(() => body.removeEventListener('scroll', update));
        // Content changes after opening (the preview's unmatched names arrive later, the league list re-renders), so
        // re-check whenever the body or anything in it changes size.
        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(update);
            const watch = () => { ro.observe(body); for (const child of body.children) ro.observe(child); };
            watch();
            const mo = typeof MutationObserver === 'function' ? new MutationObserver(watch) : null;
            if (mo) mo.observe(body, { childList: true });
            stops.push(() => { ro.disconnect(); if (mo) mo.disconnect(); });
        }
        update();
        stops.push(() => {
            actions.classList.remove('is-scrolled-under');
            body.parentElement.classList.remove('is-scrolled-down');
        });
    }

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
        const fit = () => {
            if (window.innerHeight - vv.height > 1) {
                overlay.style.top = `${vv.offsetTop}px`;
                overlay.style.height = `${vv.height}px`;
            } else {
                overlay.style.top = '';
                overlay.style.height = '';
            }
        };
        vv.addEventListener('resize', fit);
        vv.addEventListener('scroll', fit);
        fit();
        stops.push(() => {
            vv.removeEventListener('resize', fit);
            vv.removeEventListener('scroll', fit);
            overlay.style.top = '';
            overlay.style.height = '';
        });
    }

    return () => { stops.splice(0).forEach(stop => stop()); };
}
