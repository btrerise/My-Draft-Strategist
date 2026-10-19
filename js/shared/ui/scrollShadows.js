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
    if (containers.length === 0) return;

    // Checked after the browser's own layout, never in the middle of one (improvements S17): a ResizeObserver on each
    // container and on what's inside it reports once the sizes are known, so reading scrollWidth costs nothing. The
    // old check ran at DOMContentLoaded and after every change inside, and each read made the browser lay the page out
    // there and then (73 ms of forced layout before the first paint in PageSpeed's trace). It also covers a container
    // that only gets a size when its tab is shown, which the old code didn't recheck.
    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(entries => {
            const seen = new Set();
            entries.forEach(e => {
                const el = containers.find(c => c === e.target || c.contains(e.target));
                if (el && !seen.has(el)) { seen.add(el); updateShadow(el); }
            });
        })
        : null;
    const watch = (el) => {
        if (!resizeObserver) return;
        resizeObserver.observe(el);
        for (const child of el.children) resizeObserver.observe(child);
    };

    containers.forEach(el => {
        el.addEventListener('scroll', () => updateShadow(el), { passive: true });
        watch(el);

        // Both containers' inner tables are (re)built dynamically after load -- the Command
        // Center table on league/week changes, the SoS grid whenever new SoS data is
        // uploaded -- which can change scrollWidth without ever firing a 'scroll' event.
        // A MutationObserver watches the new content with the ResizeObserver, rather than
        // this needing every render call site to remember to re-run the check itself. A new
        // element is reported once it's laid out; one that stays the same size changes nothing.
        if (window.MutationObserver) {
            new MutationObserver((records) => {
                if (!resizeObserver) { updateShadow(el); return; }
                records.forEach(r => r.removedNodes.forEach(n => { if (n.nodeType === 1) resizeObserver.unobserve(n); }));
                watch(el);
            }).observe(el, { childList: true, subtree: true });
        }
        if (!resizeObserver) updateShadow(el);
    });

    if (!resizeObserver) window.addEventListener('resize', () => containers.forEach(updateShadow));
}
document.addEventListener('DOMContentLoaded', initScrollShadows);
