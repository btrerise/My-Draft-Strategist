// Alerts outside the page, shared by both apps (improvements N2; Draft Strategist's "on the clock" is N4). Research and
// sources: docs/improvements/notifications.md.
//
// - Permission is asked only from a tap (requestNotifyPermission, called by a Settings toggle): Safari refuses a prompt
//   that doesn't follow one, and Chrome quietens prompts nobody asked for.
// - A notification always goes through the service worker (registration.showNotification): Android Chrome throws
//   "Illegal constructor" on `new Notification()`. A tap on it is handled by sw.js's notificationclick listener, which
//   focuses (or opens) the page named in `url`.
// - Every alert also shows on the page as a card (showPageAlert: bottom right on computers, above the tab bar on phones).
//   It waits while the tab is hidden and goes 12 seconds after you're looking (PAGE_ALERT_MS), so whoever comes back to
//   the tab sees what to do (owner's request, N2 round 2: a flashing tab name alone doesn't say it). It doesn't take focus; screen readers announce it (role=alert).
// - Without permission, or with no Notification API at all (an iPhone or iPad Safari tab), the card is the alert. While
//   the tab is hidden, the browser tab's name also flashes ("(1) Starter alert" / "(1) Lineup Strategist") until the
//   tab is shown again. Both names carry the count, so the tab bar shows it even when a hidden tab's timers are slowed
//   to once a minute.
// - The clock is Date.now() through notifyNow(), which tests fix with Playwright's page.clock, and timers through
//   notifyAt(), which re-plans at most every 6 hours (a laptop that slept, a long wait).

export const notifyNow = () => Date.now();

// 'granted', 'denied', 'default' (not asked yet) or 'unsupported' (no Notification API or no service worker).
export function notifyPermission() {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
    return Notification.permission;
}

// Call from a tap only. Resolves to the permission afterwards (as notifyPermission).
export async function requestNotifyPermission() {
    const now = notifyPermission();
    if (now !== 'default') return now;
    try {
        const answer = await Notification.requestPermission();
        return answer || notifyPermission();
    } catch (e) {
        return notifyPermission();
    }
}

// --- TITLE FLASH ---
let flash = null; // { timer, base, count }

function stopTitleFlash() {
    if (!flash) return;
    clearInterval(flash.timer);
    document.title = flash.base;
    flash = null;
}

function onVisible() {
    if (document.visibilityState === 'visible') stopTitleFlash();
}

// While the tab is hidden: "(N) label" and "(N) <page title>", alternating every second. Stops (the title put back)
// when the tab is shown. A second alert while one flashes adds to the count.
export function flashTitle(label) {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') return;
    if (flash) clearInterval(flash.timer);
    const base = flash ? flash.base : document.title;
    const count = (flash ? flash.count : 0) + 1;
    let on = true;
    const draw = () => { document.title = on ? `(${count}) ${label}` : `(${count}) ${base}`; on = !on; };
    draw();
    flash = { base, count, timer: setInterval(draw, 1000) };
    document.removeEventListener('visibilitychange', onVisible);
    document.addEventListener('visibilitychange', onVisible);
}

export const titleFlashing = () => !!flash;

// --- THE CARD ON THE PAGE ---
const CARD_ID = 'notifyPageAlert';
const BELL = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

// How long the card stays once you're looking at the page (owner's choice, N2 round 3): it waits while the tab is hidden,
// then goes 12 seconds after the tab is in view, pausing while the mouse is over it or focus is in it, as toasts do.
// ✕ and its button close it at once. (A notification center under a bell was considered and left for later: LOG, N2.)
export const PAGE_ALERT_MS = 12000;
let cardClock = null; // { timer, remaining, startedAt, held, onVisibility }

function stopCardClock() {
    if (!cardClock) return;
    clearTimeout(cardClock.timer);
    document.removeEventListener('visibilitychange', cardClock.onVisibility);
    window.removeEventListener('focus', cardClock.onVisibility);
    window.removeEventListener('blur', cardClock.onVisibility);
    cardClock = null;
}

export function dismissPageAlert() {
    stopCardClock();
    const card = document.getElementById(CARD_ID);
    if (card) card.remove();
}

function startCardClock(card) {
    const c = { timer: null, remaining: PAGE_ALERT_MS, startedAt: 0, held: false, running: false };
    const pause = () => {
        if (!c.running) return;
        clearTimeout(c.timer);
        c.remaining = Math.max(0, c.remaining - (Date.now() - c.startedAt));
        c.running = false;
    };
    // Counts down only while you're looking: the tab in view and its window in front (N2 round 6: a window behind another
    // app is still "visible", and the card was gone by the time a notification's tap brought the page forward).
    const looking = () => document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());
    const resume = () => {
        if (c.running || c.held || !looking()) return;
        c.startedAt = Date.now();
        c.running = true;
        c.timer = setTimeout(dismissPageAlert, c.remaining);
    };
    c.onVisibility = () => (looking() ? resume() : pause());
    const hold = (on) => { c.held = on || card.matches(':hover') || card.contains(document.activeElement); if (c.held) pause(); else resume(); };
    card.addEventListener('mouseenter', () => hold(true));
    card.addEventListener('mouseleave', () => hold(false));
    card.addEventListener('focusin', () => hold(true));
    card.addEventListener('focusout', () => setTimeout(() => hold(false), 0));
    document.addEventListener('visibilitychange', c.onVisibility);
    window.addEventListener('focus', c.onVisibility);
    window.addEventListener('blur', c.onVisibility);
    cardClock = c;
    resume();
}

// title and lines: plain text (league and player names come from Sleeper, so never HTML). action: { label, run } for
// the card's button (it dismisses the card first), or none. A newer alert replaces the card. Returns the card.
// groups: [{ heading, lines }] in place of lines, for a list under headings (a league's name, then its problems); a
// group with no heading lists its lines on their own.
export function showPageAlert({ title, lines = [], groups = null, action = null } = {}) {
    dismissPageAlert();
    const card = document.createElement('section');
    card.id = CARD_ID;
    card.className = 'notify-card';
    card.setAttribute('role', 'alert');
    card.setAttribute('aria-labelledby', `${CARD_ID}Title`);
    card.innerHTML = `<div class="notify-card-head">${BELL}<h2 class="notify-card-title" id="${CARD_ID}Title"></h2>
        <button type="button" class="notify-card-close" aria-label="Dismiss alert">✕</button></div>
        <div class="notify-card-body"></div><div class="notify-card-actions"></div>`;
    card.querySelector('.notify-card-title').textContent = title;
    const body = card.querySelector('.notify-card-body');
    (groups || [{ heading: null, lines }]).forEach(g => {
        if (!g.lines || !g.lines.length) return;
        if (g.heading) {
            const h = document.createElement('h3');
            h.className = 'notify-card-group';
            h.textContent = g.heading;
            body.appendChild(h);
        }
        const list = document.createElement('ul');
        list.className = 'notify-card-lines';
        g.lines.forEach(line => { const li = document.createElement('li'); li.textContent = line; list.appendChild(li); });
        body.appendChild(list);
    });
    if (!body.children.length) body.remove();
    card.querySelector('.notify-card-close').addEventListener('click', dismissPageAlert);
    const actions = card.querySelector('.notify-card-actions');
    if (action && action.label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary notify-card-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => { dismissPageAlert(); if (action.run) action.run(); });
        actions.appendChild(btn);
    } else actions.remove();
    document.body.appendChild(card);
    startCardClock(card);
    return card;
}

// --- THE ALERT ---
// title: plain text; lines: plain-text lines (the notification's body, one per line, and the card's list). tag: one
// notification per tag (a newer one replaces it). url: the page a tap opens ('/lineup/', '/'). label: the flashing tab
// name's short text. action: the card's button ({ label, run }). icon: the app icon's URL for the system notification. The card always shows. Resolves to how else it was
// shown: 'notification' (the system's, when you're not looking at the page), 'page' (the card only: you're looking at
// it) or 'title' (the card, and the tab's name flashing while it's hidden, with no notification permission).
export async function notify({ title, lines = [], groups = null, tag, url = '/', label = title, action = null, icon } = {}) {
    if (typeof document !== 'undefined') showPageAlert({ title, lines, groups, action });
    const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
    // Already looking at the page (in view, its window in front): the card is enough (N2 round 4: both at once was
    // redundant). Elsewhere: the system notification too.
    const looking = !hidden && (typeof document.hasFocus !== 'function' || document.hasFocus());
    if (looking) return 'page';
    if (notifyPermission() === 'granted') {
        try {
            const reg = await navigator.serviceWorker.ready;
            // icon: the app's icon beside the text (Windows, macOS and Android show it; without one Chrome shows its own logo).
            await reg.showNotification(title, { body: lines.join('\n'), tag, renotify: !!tag, data: { url }, ...(icon ? { icon } : {}) });
            // The tab bar says so too, in case the notification is missed (it goes to the system tray).
            if (hidden) flashTitle(label);
            return 'notification';
        } catch (e) {
            console.warn('Notification failed; the alert is on the page instead.', e);
        }
    }
    if (!hidden) return 'page'; // in view, but another window in front: the card waits for you
    flashTitle(label);
    return 'title';
}

// --- TIMERS ---
// Runs fn at the clock time atMs (soon, if that's past). Long waits are cut into pieces of at most 6 hours and re-planned
// from the clock, so a computer that slept or a throttled hidden tab still fires close to the time. Returns a cancel function.
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
export function notifyAt(atMs, fn) {
    let timer = null;
    let cancelled = false;
    const plan = () => {
        if (cancelled) return;
        const wait = atMs - notifyNow();
        if (wait <= 0) { fn(); return; }
        timer = setTimeout(plan, Math.min(wait, MAX_WAIT_MS));
    };
    plan();
    return () => { cancelled = true; clearTimeout(timer); };
}
