// Alerts outside the page, shared by both apps (improvements N2; Draft Strategist's "on the clock" is N4). Research and
// sources: docs/improvements/notifications.md.
//
// - Permission is asked only from a tap (requestNotifyPermission, called by a Settings toggle): Safari refuses a prompt
//   that doesn't follow one, and Chrome quietens prompts nobody asked for.
// - A notification always goes through the service worker (registration.showNotification): Android Chrome throws
//   "Illegal constructor" on `new Notification()`. A tap on it is handled by sw.js's notificationclick listener, which
//   focuses (or opens) the page named in `url`.
// - Without permission, or with no Notification API at all (an iPhone or iPad Safari tab): a toast if the tab is in
//   view, and while it's hidden the tab's title flashes ("(1) Starter alert" / "(1) Lineup Strategist"), until the
//   tab is shown again. Both titles carry the count, so the tab bar shows it even when a hidden tab's timers are
//   slowed to once a minute.
// - The clock is Date.now() through notifyNow(), which tests fix with Playwright's page.clock, and timers through
//   notifyAt(), which re-plans at most every 6 hours (a laptop that slept, a long wait).
import { showToast } from './toast.js';

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

// --- THE ALERT ---
// title, body: plain text. tag: one notification per tag (a newer one replaces it). url: the page a tap opens
// ('/lineup/', '/'). label: the title flash's short text. Resolves to how it was shown: 'notification', 'toast',
// 'title' or 'none' (the tab hidden with nothing else possible can't happen: the title always works).
export async function notify({ title, body = '', tag, url = '/', label = title } = {}) {
    if (notifyPermission() === 'granted') {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, { body, tag, renotify: !!tag, data: { url } });
            // The tab bar says so too, in case the notification is missed (it goes to the system tray).
            flashTitle(label);
            return 'notification';
        } catch (e) {
            console.warn('Notification failed; showing the alert in the page instead.', e);
        }
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        showToast(body ? `${title}\n${body}` : title, { force: true, duration: 12000 });
        return 'toast';
    }
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
