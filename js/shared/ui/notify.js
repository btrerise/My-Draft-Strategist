// Alerts outside the page, shared by both apps (improvements N2; Draft Strategist's "on the clock" is N4). Research and
// sources: docs/improvements/notifications.md.
//
// - Permission is asked only from a tap (requestNotifyPermission, called by a Settings toggle): Safari refuses a prompt
//   that doesn't follow one, and Chrome quietens prompts nobody asked for.
// - A notification always goes through the service worker (registration.showNotification): Android Chrome throws
//   "Illegal constructor" on `new Notification()`. A tap on it is handled by sw.js's notificationclick listener, which
//   focuses (or opens) the page named in `url`.
// - Every alert also stays on the page as a card (showPageAlert: bottom right on computers, above the tab bar on phones)
//   until it's dismissed or its button is used, so whoever comes back to the tab sees what to do (owner's request, N2
//   round 2: a flashing tab name alone doesn't say it). It doesn't take focus; screen readers announce it (role=alert).
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

export function dismissPageAlert() {
    const card = document.getElementById(CARD_ID);
    if (card) card.remove();
}

// title and lines: plain text (league and player names come from Sleeper, so never HTML). action: { label, run } for
// the card's button (it dismisses the card first), or none. A newer alert replaces the card. Returns the card.
export function showPageAlert({ title, lines = [], action = null } = {}) {
    dismissPageAlert();
    const card = document.createElement('section');
    card.id = CARD_ID;
    card.className = 'notify-card';
    card.setAttribute('role', 'alert');
    card.setAttribute('aria-labelledby', `${CARD_ID}Title`);
    card.innerHTML = `<div class="notify-card-head">${BELL}<h2 class="notify-card-title" id="${CARD_ID}Title"></h2>
        <button type="button" class="notify-card-close" aria-label="Dismiss alert">✕</button></div>
        <ul class="notify-card-lines"></ul><div class="notify-card-actions"></div>`;
    card.querySelector('.notify-card-title').textContent = title;
    const list = card.querySelector('.notify-card-lines');
    lines.forEach(line => { const li = document.createElement('li'); li.textContent = line; list.appendChild(li); });
    if (!lines.length) list.remove();
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
    return card;
}

// --- THE ALERT ---
// title: plain text; lines: plain-text lines (the notification's body, one per line, and the card's list). tag: one
// notification per tag (a newer one replaces it). url: the page a tap opens ('/lineup/', '/'). label: the flashing tab
// name's short text. action: the card's button ({ label, run }). The card always shows. Resolves to how else it was
// shown: 'notification' (the system's), 'page' (the card only, tab in view) or 'title' (the card, and the tab's name
// flashing while it's hidden).
export async function notify({ title, lines = [], tag, url = '/', label = title, action = null } = {}) {
    if (typeof document !== 'undefined') showPageAlert({ title, lines, action });
    const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
    if (notifyPermission() === 'granted') {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, { body: lines.join('\n'), tag, renotify: !!tag, data: { url } });
            // The tab bar says so too, in case the notification is missed (it goes to the system tray).
            if (hidden) flashTitle(label);
            return 'notification';
        } catch (e) {
            console.warn('Notification failed; the alert is on the page instead.', e);
        }
    }
    if (!hidden) return 'page';
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
