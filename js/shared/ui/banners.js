// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js, which assigns its exports to the same window.* names utils.js set.
// Comments below that say "this file" or "utils.js" were written when this was one file.

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
    // NOTE: 'guideBanner' was previously checked against 'ds_hide_guide_banner' -- a leftover
    // from before app-scoped storage keys (see the localStorage key scoping principle) -- while
    // its own dismiss button has always written 'mls_hide_guide_banner'. That mismatch meant
    // dismissing the guide banner never actually stuck across reloads; fixed to check the same
    // key the button writes.
    checkAndHideBanner('guideBanner', 'mls_hide_guide_banner');
    checkAndHideBanner('mlsBanner', 'ds_hide_mls_banner');
    checkAndHideBanner('draftBanner', 'mls_hide_draft_banner');
    checkAndHideBanner('sleeperSyncBanner', 'mls_hide_sleeper_sync_banner');
    checkAndHideBanner('installCard', 'ds_hide_install_banner');

    // Staggered reveal: draftBanner starts hidden (see its inline style in index.html) so it
    // never stacks with guideBanner on a first visit. Once guideBanner has been dismissed
    // (whether just now or on some earlier visit), and draftBanner itself hasn't been
    // dismissed, draftBanner takes its place.
    if (localStorage.getItem('mls_hide_guide_banner') === 'true' && localStorage.getItem('mls_hide_draft_banner') !== 'true') {
        const draftBanner = document.getElementById('draftBanner');
        if (draftBanner) draftBanner.style.display = 'flex';
    }
});
