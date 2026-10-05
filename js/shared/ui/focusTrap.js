// Moved verbatim from js/utils.js in refactor chunk 1A. An ES module: the code that uses it imports it.

// --- FOCUS TRAPPING FOR OVERLAYS ---
// Shared by the hamburger drawer and the rankings preview modal (js/mls/nav.js; both apps' preview since 8C,
// through createPreviewShell in js/shared/rankings/uploadPreview.js) so a
// keyboard user Tabbing through an open overlay stays inside it instead of tabbing into the
// page behind it -- previously neither one did this, despite the preview modal's markup
// already declaring role="dialog" aria-modal="true", a promise the JS wasn't keeping.
//
// Focusable elements are queried fresh every time the trap engages (open, and every Tab
// press) rather than cached once at open-time, because the drawer's feedback form is
// injected asynchronously into #shared-feedback-container and its inputs need to be
// included once they exist.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null); // skip anything hidden (display:none ancestor)
}

/**
 * Creates a focus trap scoped to `container`. Returns { activate, deactivate }; activate()
 * remembers what had focus beforehand, moves focus to the first focusable element inside
 * the container, and keeps Tab/Shift+Tab cycling within it. deactivate() removes that
 * listener and restores focus to whatever had it before activate() was called, so closing
 * an overlay puts a keyboard user right back where they were (e.g. the hamburger button).
 *
 * @param {HTMLElement} container
 * @param {{ onEscape?: Function }} [options] - onEscape, if given, is called (with no
 *   arguments) when Escape is pressed while the trap is active, instead of the trap doing
 *   anything itself with that key -- the caller decides what "close" means for it.
 */
export const createFocusTrap = function(container, options = {}) {
    let previouslyFocused = null;
    let active = false;

    function handleKeydown(e) {
        if (e.key === 'Escape' && typeof options.onEscape === 'function') {
            options.onEscape();
            return;
        }
        if (e.key !== 'Tab') return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    return {
        activate() {
            if (active) return;
            active = true;
            previouslyFocused = document.activeElement;
            container.addEventListener('keydown', handleKeydown);

            const focusable = getFocusableElements(container);
            if (focusable.length > 0) focusable[0].focus();
        },
        deactivate() {
            if (!active) return;
            active = false;
            container.removeEventListener('keydown', handleKeydown);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
            previouslyFocused = null;
        }
    };
};
