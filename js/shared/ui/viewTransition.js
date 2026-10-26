// View Transitions (improvements S16): tab and league switches animate between the old and the new
// screen with the browser's View Transitions API and plain CSS (css/base.css, "VIEW TRANSITIONS").
// Browsers without document.startViewTransition, Reduce Motion, and a hidden page all run the
// update straight away, as before.
//
// How a transition runs: the browser takes a picture of the page, calls `update` (the real DOM
// change) one frame later, then animates from the picture to the live new page. So the DOM change
// is asynchronous: code that needs the new tab on screen (a scroll, a focus) waits for the promise
// this returns. Calling it again before an earlier transition has finished skips that one (its
// update still runs, first), so rapid taps end on the last one and every update runs once.
//
// While a transition runs, <html> carries data-vt (the kind: "tab", "league" or "cards"), data-vt-dir
// ("forward" / "back", tabs only) for the CSS, and data-vt-busy, which the tests wait on.
//
// Owner's choices (S16): tabs slide on phones (in the direction of the swipe or of the tab tapped) and
// fade on wider screens; 275 ms on phones, 375 ms wider; a league switch fades; the tab bar has a
// marker that slides to the active tab; League Command Center cards fold and reorder in place.

const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function canViewTransition() {
    return typeof document.startViewTransition === 'function'
        && document.visibilityState === 'visible'
        && !reduceMotion();
}

// An exception in `update` would otherwise only reject the transition's promises; report it the
// way an exception in a click handler is reported today.
function runReporting(update) {
    try {
        update();
    } catch (e) {
        if (typeof window.reportError === 'function') window.reportError(e);
        else setTimeout(() => { throw e; });
    }
}

let current = null;

/**
 * Runs `update` inside a view transition when the browser can animate, else right away.
 * @param {() => void} update the DOM change (synchronous).
 * @param {{ kind?: 'tab'|'league'|'cards', direction?: 'forward'|'back'|'', instant?: boolean, onEnd?: () => void }} [opts]
 *   onEnd runs once the transition is over (or straight after `update` without one).
 * @returns {Promise<void>} resolves once `update` has run.
 */
export function withViewTransition(update, { kind = 'tab', direction = '', instant = false, onEnd = null } = {}) {
    if (instant || !canViewTransition()) {
        runReporting(update);
        if (onEnd) onEnd();
        return Promise.resolve();
    }
    const root = document.documentElement;
    root.dataset.vt = kind;
    if (direction) root.dataset.vtDir = direction;
    else delete root.dataset.vtDir;
    root.dataset.vtBusy = '';

    const transition = document.startViewTransition(() => runReporting(update));
    current = transition;
    // A transition skipped by the next one (rapid taps) rejects `ready`. Chrome 153 reports that as an unhandled
    // rejection unless something handles it; nothing here waits on `ready`, so swallow it like `finished`.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {}).then(() => {
        if (onEnd) onEnd();
        if (current !== transition) return; // a later transition owns the attributes now
        current = null;
        delete root.dataset.vt;
        delete root.dataset.vtDir;
        delete root.dataset.vtBusy;
    });
    return transition.updateCallbackDone.catch(() => {});
}

// "forward" when `to` comes after `from` in `order` (the tab bar's order), "back" before it.
export function tabDirection(order, from, to) {
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a === -1 || b === -1 || a === b) return '';
    return b > a ? 'forward' : 'back';
}


// A view-transition-name for an id from outside the app (a Sleeper league id, "manual_…"): a valid CSS
// identifier, unique per id. Letters, digits and "-" stay; any other character becomes "_" plus four hex
// digits, so two different ids never give the same name.
export function vtName(prefix, id) {
    return prefix + String(id).replace(/[^a-zA-Z0-9-]/g, c => '_' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// Where the marker sits under each tab-bar button: half the button's width, centered. Measured once, then
// again only when the bar changes size (a ResizeObserver, which also sees a desktop scrollbar come or go,
// which no resize event reports). The buttons don't move otherwise, and measuring on every switch read the
// layout just after showTab had shown the new tab, so the browser laid the whole new tab out an extra time in
// the middle of the switch (improvements S17).
let markerSpots = null;
function measureMarkerSpots(bar) {
    markerSpots = new Map();
    for (const btn of bar.querySelectorAll('.nav-btn')) {
        const w = Math.round(btn.offsetWidth * 0.5);
        markerSpots.set(btn, { w, x: Math.round(btn.offsetLeft + (btn.offsetWidth - w) / 2) });
    }
}

// The tab bar's marker (owner's choice, S16): a short green bar above the active tab, which slides to
// the new one (css/base.css, .nav-marker). Both apps' showTab call this after moving .active; it's
// built on first use, so neither page's HTML carries it. With a ResizeObserver it's first placed from the
// observer's first report, after the browser's own first layout: measuring when the page's init first called
// this forced that layout early (74 ms in PageSpeed's trace of Draft Strategist, improvements S17).
let markerObserved = false;
export function placeTabMarker(measureNow = false) {
    const bar = document.querySelector('.nav-bar');
    if (!bar) return;
    if (!markerObserved) {
        markerObserved = true;
        if (typeof ResizeObserver === 'function') {
            // Runs after the browser's own layout, so reading the sizes there costs nothing extra.
            new ResizeObserver(() => { markerSpots = null; placeTabMarker(true); }).observe(bar);
            return;
        }
        window.addEventListener('resize', () => { markerSpots = null; placeTabMarker(true); });
        measureNow = true;
    }
    const active = bar.querySelector('.nav-btn.active');
    if (!markerSpots || (active && !markerSpots.has(active))) {
        if (!measureNow) return; // not measured yet: the observer's first report places it
        measureMarkerSpots(bar);
    }
    const { w, x } = (active && markerSpots.get(active)) || { w: 0, x: 0 };
    let marker = bar.querySelector('.nav-marker');
    if (!marker) {
        // Positioned before it's added, so the first one starts in place instead of sliding in.
        marker = document.createElement('span');
        marker.className = 'nav-marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.style.width = `${w}px`;
        marker.style.left = `${x}px`;
        bar.appendChild(marker);
    }
    marker.hidden = !active;
    marker.style.width = `${w}px`;
    marker.style.left = `${x}px`;
}
