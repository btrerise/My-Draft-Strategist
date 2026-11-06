// One shared sheet for both apps (improvements M11, from round 2 of the Material 3 review, proposal 15): a modal
// side sheet from the right on wide windows, a bottom sheet on phones. Material 3 uses a side sheet for supplementary
// information on wide screens and a bottom sheet below that; the switch is at 840px, the same window size as the
// navigation rail (S26). The badge legend opens in it ("What do these mean?"); S32 reuses it for the Lineup row's details.
//
//   openSheet({ title, body, opener, scrollTo, footer })  -> Promise that resolves once it has closed
//   closeSheet()                                          -> Promise that resolves once it has closed
//
// MODAL. A scrim covers the page, focus moves in (to the title, so a screen reader reads it) and is trapped
// (js/shared/ui/focusTrap.js); closing gives focus back to `opener`. It closes with its close button, Escape, a tap on
// the scrim, the browser's Back and, on phones, a swipe down on the drag handle or header.
//
// BACK CLOSES IT, as Back closes the menu (js/shared/ui/navMenu.js, S26 round 6): opening pushes a history entry (same
// URL, marked `sheet`); Back takes it off and the popstate below closes the sheet. Closing any other way takes the
// entry off with history.back() and swallows that pop. The listener is a capturing one on window, so it runs before
// the apps' own popstate listeners (which would switch tabs) and stops them.
//
// BOTTOM SHEET. It opens at half the window's height and scrolls inside. Dragging the handle or header up expands it
// to nearly full height; down from there goes back to half, and down from half (a quarter of its height, or a flick)
// closes it. Tapping the handle (it's a button, so a keyboard reaches it too) toggles half and full.
//
// MOTION. It slides in with Material 3's emphasized decelerate curve (400ms) and out with emphasized accelerate (200ms),
// the tokens the menu uses (css/base.css, `.sheet`). With Reduce Motion nothing slides: it appears and goes at once.
import { createFocusTrap } from './focusTrap.js';

const SIDE_SHEET_FROM = 840; // px; keep in step with the `@media (min-width: 840px)` in css/base.css's sheet section

const CLOSE_ICON = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

let current = null;        // the open sheet: { host, sheet, body, trap, opener, resolve, closing }
let pendingPops = [];      // resolvers for the history.back() calls closeSheet made, oldest first
let titleSeq = 0;

const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const isBottomSheet = () => window.innerWidth < SIDE_SHEET_FROM;

/** Is a sheet open (or closing)? */
export function isSheetOpen() {
    return !!current;
}

/**
 * Opens the sheet. `body` is HTML (from the caller's own builder, so nothing is worded twice). `scrollTo`, an element
 * or a function given the body that returns one, is scrolled to the top of the sheet's body. `footer`, if given, is
 * `{ label, icon?, onClick }`: a link-style button at the foot; the sheet closes first, then onClick runs.
 * `opener` gets focus back when it closes. Resolves when the sheet has closed.
 */
export function openSheet({ title, body, opener = null, scrollTo = null, footer = null, className = '' }) {
    if (current) closeSheet({ restoreFocus: false, viaHistory: false });

    const titleId = `sheetTitle${++titleSeq}`;
    const host = document.createElement('div');
    host.className = 'sheet-host';
    host.innerHTML = `<div class="sheet-scrim"></div>
<section class="sheet${className ? ' ' + className : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
    <div class="sheet-grip"><button type="button" class="sheet-handle" aria-label="Resize the sheet" aria-expanded="false"><span aria-hidden="true"></span></button></div>
    <header class="sheet-header">
        <h2 class="sheet-title" id="${titleId}" tabindex="-1"></h2>
        <button type="button" class="sheet-close" aria-label="Close">${CLOSE_ICON}</button>
    </header>
    <div class="sheet-body">${body}</div>
    ${footer ? `<footer class="sheet-footer"><button type="button" class="btn-bare sheet-footer-link">${footer.icon || ''}<span></span></button></footer>` : ''}
</section>`;
    host.querySelector('.sheet-title').textContent = title;
    if (footer) host.querySelector('.sheet-footer-link span').textContent = footer.label;
    document.body.appendChild(host);

    const sheet = host.querySelector('.sheet');
    const sheetBody = host.querySelector('.sheet-body');
    const trap = createFocusTrap(sheet, { onEscape: () => closeSheet() });

    const done = new Promise((resolve) => {
        current = { host, sheet, body: sheetBody, trap, opener, resolve, closing: false };
    });

    host.querySelector('.sheet-scrim').addEventListener('click', () => closeSheet());
    host.querySelector('.sheet-close').addEventListener('click', () => closeSheet());
    host.querySelector('.sheet-handle').addEventListener('click', (e) => {
        if (host._dragged) { host._dragged = false; e.preventDefault(); return; }
        setExpanded(!sheet.classList.contains('is-expanded'));
    });
    if (footer) {
        host.querySelector('.sheet-footer-link').addEventListener('click', () => {
            closeSheet({ restoreFocus: false }).then(() => footer.onClick && footer.onClick());
        });
    }
    // The page behind doesn't scroll: wheel and touch moves over the scrim go nowhere.
    host.querySelector('.sheet-scrim').addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    wireDrag(host, sheet);

    history.pushState({ ...(history.state || {}), sheet: true }, '');
    document.documentElement.classList.add('sheet-open');

    trap.activate();
    host.querySelector('.sheet-title').focus({ preventScroll: true });

    const target = typeof scrollTo === 'function' ? scrollTo(sheetBody) : scrollTo;
    if (target) sheetBody.scrollTop = target.getBoundingClientRect().top - sheetBody.getBoundingClientRect().top;

    // Two frames so the starting position is laid out before the class that slides it in.
    if (reduceMotion()) host.classList.add('is-open');
    else requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('is-open')));
    return done;
}

function setExpanded(expanded) {
    if (!current) return;
    current.sheet.classList.toggle('is-expanded', expanded);
    current.host.querySelector('.sheet-handle').setAttribute('aria-expanded', String(expanded));
}

/**
 * Closes the open sheet (if any). `viaHistory: false` is for Back, whose pop already took the entry off. Resolves once
 * it's gone and its history entry is off, so a caller about to push a history entry (a tab switch) can wait.
 */
export function closeSheet({ restoreFocus = true, viaHistory = true } = {}) {
    if (!current || current.closing) return Promise.resolve();
    const it = current;
    it.closing = true;
    it.trap.deactivate();
    document.documentElement.classList.remove('sheet-open');
    if (restoreFocus && it.opener && it.opener.isConnected) it.opener.focus({ preventScroll: true });

    const historyDone = viaHistory ? takeHistoryEntryOff() : Promise.resolve();

    it.host.classList.remove('is-open');
    it.sheet.style.transform = '';
    const ms = reduceMotion() ? 0 : parseFloat(getComputedStyle(it.sheet).transitionDuration) * 1000 || 0;
    const gone = new Promise((resolve) => setTimeout(() => {
        it.host.remove();
        if (current === it) current = null;
        resolve();
    }, ms));
    return Promise.all([gone, historyDone]).then(() => it.resolve());
}

function takeHistoryEntryOff() {
    if (!history.state || !history.state.sheet) return Promise.resolve();
    return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        pendingPops.push(finish);
        history.back();
        // A browser that never reports the pop mustn't leave a caller waiting, or swallow a later Back.
        setTimeout(() => {
            if (done) return;
            pendingPops = pendingPops.filter(f => f !== finish);
            finish();
        }, 1000);
    });
}

// Guarded: tests/unit/badgeLegend.test.mjs loads the legend modules (which import this one) in Node, with no window.
if (typeof window !== 'undefined') window.addEventListener('popstate', (e) => {
    if (pendingPops.length) {
        e.stopImmediatePropagation();
        pendingPops.shift()();
        return;
    }
    if (current && !current.closing) {
        e.stopImmediatePropagation();
        closeSheet({ viaHistory: false });
    }
}, true);

// Swipe down to close (bottom sheet only): a drag on the handle or the header moves the sheet with the finger.
function wireDrag(host, sheet) {
    const zones = [host.querySelector('.sheet-grip'), host.querySelector('.sheet-header')];
    let start = null;
    const onMove = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dy = e.clientY - start.y;
        // Capture only once it's a drag, so a plain tap still clicks the handle (capture moves the click to the zone).
        if (!start.moved && Math.abs(dy) > 4) {
            start.moved = true;
            if (start.zone.setPointerCapture) start.zone.setPointerCapture(e.pointerId);
        }
        // Down follows the finger; up is resisted (the sheet expands on release instead of stretching).
        sheet.style.transform = `translateY(${dy > 0 ? dy : dy / 4}px)`;
        start.lastY = e.clientY; start.lastT = e.timeStamp;
    };
    const onUp = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dy = e.clientY - start.y;
        const dt = Math.max(1, e.timeStamp - start.t);
        const height = sheet.getBoundingClientRect().height;
        const flick = dy > 30 && dy / dt > 0.5;
        const wasExpanded = sheet.classList.contains('is-expanded');
        sheet.classList.remove('is-dragging');
        if (start.moved) host._dragged = true;
        start = null;
        if (dy > height / 4 || flick) {
            if (wasExpanded && dy < height / 2 && !flick) { sheet.style.transform = ''; setExpanded(false); }
            else closeSheet();
        } else {
            sheet.style.transform = '';
            if (dy < -40) setExpanded(true);
        }
    };
    zones.forEach((zone) => {
        zone.addEventListener('pointerdown', (e) => {
            if (!isBottomSheet() || e.button > 0) return;
            if (e.target.closest('.sheet-close')) return;
            start = { id: e.pointerId, zone, y: e.clientY, t: e.timeStamp, moved: false };
            host._dragged = false;
            sheet.classList.add('is-dragging');
        });
        zone.addEventListener('pointermove', onMove);
        zone.addEventListener('pointerup', onUp);
        zone.addEventListener('pointercancel', onUp);
    });
}
