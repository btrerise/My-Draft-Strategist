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
// While a transition runs, <html> carries data-vt (the kind: "tab" or "league"), data-vt-dir
// ("forward" / "back", tabs only) for the CSS, and data-vt-busy, which the tests wait on.

const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function canViewTransition() {
    return typeof document.startViewTransition === 'function'
        && document.visibilityState === 'visible'
        && !reduceMotion()
        && document.documentElement.dataset.vtStyle !== 'off'; // DEMO ONLY
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
 * @param {{ kind?: 'tab'|'league', direction?: 'forward'|'back'|'' , instant?: boolean }} [opts]
 * @returns {Promise<void>} resolves once `update` has run.
 */
export function withViewTransition(update, { kind = 'tab', direction = '', instant = false } = {}) {
    if (instant || !canViewTransition()) {
        runReporting(update);
        return Promise.resolve();
    }
    const root = document.documentElement;
    root.dataset.vt = kind;
    if (direction) root.dataset.vtDir = direction;
    else delete root.dataset.vtDir;
    root.dataset.vtBusy = '';

    const transition = document.startViewTransition(() => runReporting(update));
    current = transition;
    transition.finished.catch(() => {}).then(() => {
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

// DEMO ONLY (S16, until the owner picks): ?vt=slide|fade|auto|off and ?vtms=<milliseconds> choose
// the style and speed on a branch preview; &marker=1 shows the sliding tab-bar marker. Removed
// once the choice is made.
try {
    const params = new URLSearchParams(location.search);
    const style = params.get('vt');
    const ms = parseInt(params.get('vtms'), 10);
    const root = document.documentElement;
    root.dataset.vtStyle = ['slide', 'fade', 'auto', 'off'].includes(style) ? style : 'slide';
    if (ms >= 50 && ms <= 2000) root.style.setProperty('--vt-ms', `${ms}ms`);
    if (params.get('marker') === '1') root.dataset.vtMarker = '';
} catch (e) { /* demo only */ }

// DEMO ONLY (extra a, with &marker=1): a green bar along the top of the active tab-bar button that
// slides to the new tab. Both apps' showTab call this after moving .active.
export function placeTabMarker() {
    if (!('vtMarker' in document.documentElement.dataset)) return;
    const bar = document.querySelector('.nav-bar');
    const active = bar && bar.querySelector('.nav-btn.active');
    if (!bar) return;
    let marker = bar.querySelector('.nav-marker');
    if (!marker) {
        marker = document.createElement('span');
        marker.className = 'nav-marker';
        marker.setAttribute('aria-hidden', 'true');
        bar.appendChild(marker);
    }
    if (!active) { marker.style.width = '0'; return; }
    const w = active.offsetWidth * 0.5;
    marker.style.width = `${w}px`;
    marker.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - w) / 2}px)`;
}
window.addEventListener('resize', () => placeTabMarker());
window.addEventListener('load', () => placeTabMarker());
