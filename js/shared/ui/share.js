// --- SHARE THIS SITE (improvements K2) ---
// "Share this site" in the three drawers, "Share with your league" in both Guides' "About this project" note and the
// Dashboard feet, and T-Score's line at the end of The Research. One helper for all of them, called by each page's
// data-action table (`shareSite`, with data-share="mds" | "mls" | "tscore").
//
// Where the browser has the Web Share API (phones, and Chrome and Safari on many computers) it opens the system share
// sheet; elsewhere (Firefox on computers) it copies the link and says "Link copied". Per MDN, navigator.share needs a
// tap (transient activation) and rejects with AbortError when the person closes the sheet: that stays silent. Any other
// rejection (NotAllowedError, a busy sheet, a share target that failed) falls back to copying, so a tap always does
// something. If copying fails too, the toast shows the link to copy by hand.
//
// Texts and URLs: docs/improvements/support.md, section 5 (K1). Each URL carries ?ref=share, which K3's analytics
// loader counts once and takes out of the address bar.
import { showToast } from './toast.js';

export const SHARE_DATA = Object.freeze({
    mds: Object.freeze({
        title: 'My Draft Strategist',
        text: 'Drafting with my own rankings in My Draft Strategist: live Sleeper sync, free, no ads.',
        url: 'https://mydraftstrategist.com/?ref=share',
    }),
    mls: Object.freeze({
        title: 'My Lineup Strategist',
        text: "All my leagues' lineups, waivers and trades in one place: My Lineup Strategist, free, no ads.",
        url: 'https://mydraftstrategist.com/lineup/?ref=share',
    }),
    tscore: Object.freeze({
        title: 'The T-Score Model',
        text: 'The T-Score model for WR and RB production.',
        url: 'https://mydraftstrategist.com/t-score/?ref=share',
    }),
});

// Resolves to what happened: 'shared', 'cancelled', 'copied' or 'failed' (the tests read it; the buttons ignore it).
// `nav` and `toast` are for the unit tests; the pages pass only `app`.
export async function shareSite(app, { nav = globalThis.navigator, toast = showToast } = {}) {
    const data = SHARE_DATA[app] || SHARE_DATA.mds;
    if (nav && typeof nav.share === 'function') {
        try {
            await nav.share({ title: data.title, text: data.text, url: data.url });
            return 'shared';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'cancelled';
            // Anything else: copy instead.
        }
    }
    try {
        if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== 'function') throw new Error('No clipboard');
        await nav.clipboard.writeText(data.url);
        toast('Link copied');
        return 'copied';
    } catch {
        toast(`Couldn't copy the link. Here it is to copy: ${data.url}`, { isError: true });
        return 'failed';
    }
}
