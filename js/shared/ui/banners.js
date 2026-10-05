// Moved verbatim from js/utils.js in refactor chunk 1A. Has load-time side effects, so js/shared/globals.js
// imports it on every page (in the old utils.js order); code that uses its exports imports it too.
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
    // NOTE: both apps have a '#guideBanner', and each one's dismiss button writes its own app's key:
    // KEYS.mls.hideGuideBanner on Lineup Strategist (/lineup/), KEYS.mds.hideGuideBanner on Draft
    // Strategist. This used to check only the MLS key on every page, so Draft Strategist's guide
    // banner came back on every reload (unless Lineup Strategist's had been dismissed). Each page
    // now checks the key its own button writes (refactor chunk 8A).
    const isLineupPage = location.pathname.includes('/lineup/');
    checkAndHideBanner('guideBanner', isLineupPage ? KEYS.mls.hideGuideBanner : KEYS.mds.hideGuideBanner);
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
