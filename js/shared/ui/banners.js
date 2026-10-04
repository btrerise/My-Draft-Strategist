// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js; app modules may also import it directly.
import { KEYS } from '../storage/keys.js';

export function dismissBanner(bannerId, storageKey) {
    const banner = document.getElementById(bannerId);
    if (banner) banner.style.display = 'none';
    if (storageKey) localStorage.setItem(storageKey, 'true');
}

// Dismisses one banner and, in the same action, reveals a second banner that's staggered
// behind it -- used so the MLS dashboard's guide banner and cross-promo banner don't both
// stack on first load. nextBanner only appears once its own dismiss flag says it hasn't
// already been dismissed on some earlier visit (e.g. before this staggering existed).
export const dismissBannerAndReveal = function(bannerId, storageKey, nextBannerId, nextStorageKey) {
    dismissBanner(bannerId, storageKey);
    if (localStorage.getItem(nextStorageKey) === 'true') return;
    const nextBanner = document.getElementById(nextBannerId);
    if (nextBanner) nextBanner.style.display = 'flex';
};

// Hide on load if previously dismissed
document.addEventListener('DOMContentLoaded', () => {
    // Helper function to check storage and hide
    const checkAndHideBanner = (bannerId, storageKey) => {
        if (localStorage.getItem(storageKey) === 'true') {
            const banner = document.getElementById(bannerId);
            if (banner) banner.style.display = 'none';
        }
    };

    // Check all your app banners
    // NOTE: 'guideBanner' was previously checked against KEYS.mds.hideGuideBanner -- a leftover
    // from before app-scoped storage keys (see the localStorage key scoping principle) -- while
    // its own dismiss button has always written KEYS.mls.hideGuideBanner. That mismatch meant
    // dismissing the guide banner never actually stuck across reloads; fixed to check the same
    // key the button writes.
    checkAndHideBanner('guideBanner', KEYS.mls.hideGuideBanner);
    checkAndHideBanner('mlsBanner', KEYS.mds.hideMlsBanner);
    checkAndHideBanner('draftBanner', KEYS.mls.hideDraftBanner);
    checkAndHideBanner('sleeperSyncBanner', KEYS.mls.hideSleeperSyncBanner);
    checkAndHideBanner('installCard', KEYS.mds.hideInstallBanner);

    // Staggered reveal: draftBanner starts hidden (see its inline style in index.html) so it
    // never stacks with guideBanner on a first visit. Once guideBanner has been dismissed
    // (whether just now or on some earlier visit), and draftBanner itself hasn't been
    // dismissed, draftBanner takes its place.
    if (localStorage.getItem(KEYS.mls.hideGuideBanner) === 'true' && localStorage.getItem(KEYS.mls.hideDraftBanner) !== 'true') {
        const draftBanner = document.getElementById('draftBanner');
        if (draftBanner) draftBanner.style.display = 'flex';
    }
});
