// Moved verbatim from js/utils.js in refactor chunk 1A. Has load-time side effects, so js/shared/globals.js
// imports it on every page (in the old utils.js order); code that uses its exports imports it too.

// --- SCROLL-SHADOW CUE FOR WIDE TABLES ---
// Toggles .has-scroll-shadow (css/base.css) on/off based on actual scroll position, rather
// than a static always-on shadow -- a shadow that's still showing after the user has
// scrolled all the way to the right would be actively misleading (implying there's more to
// see when there isn't). Applies to .table-responsive (Command Center) and .sos-table-wrapper
// (SoS grid) only; the Power Rankings heatmap intentionally doesn't use overflow-x: auto
// (see its own comment in css/mls.css -- tooltips would get clipped), so it's excluded here too.
function initScrollShadows() {
    const SCROLL_SHADOW_SELECTOR = '.table-responsive, .sos-table-wrapper';

    function updateShadow(el) {
        const hasOverflow = el.scrollWidth > el.clientWidth + 1;
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        el.classList.toggle('has-scroll-shadow', hasOverflow && !atEnd);
    }

    const containers = Array.from(document.querySelectorAll(SCROLL_SHADOW_SELECTOR));
    containers.forEach(el => {
        updateShadow(el);
        el.addEventListener('scroll', () => updateShadow(el), { passive: true });

        // Both containers' inner tables are (re)built dynamically after load -- the Command
        // Center table on league/week changes, the SoS grid whenever new SoS data is
        // uploaded -- which can change scrollWidth without ever firing a 'scroll' event.
        // A MutationObserver re-checks whenever that inner content actually changes, rather
        // than this needing every render call site to remember to re-run the check itself.
        if (window.MutationObserver) {
            new MutationObserver(() => updateShadow(el)).observe(el, { childList: true, subtree: true });
        }
    });

    window.addEventListener('resize', () => containers.forEach(updateShadow));
}
document.addEventListener('DOMContentLoaded', initScrollShadows);
