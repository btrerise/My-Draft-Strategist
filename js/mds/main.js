// Entry point of the Draft Strategist page (<script type="module"> in index.html), added in
// refactor chunk 2A when js/mds.js became the js/mds/ module graph.
//
// init.js is imported first. It imports every other js/mds/ module in the order their code sat
// in mds.js, so the load-time code (storage migration, State, event listeners) runs in the
// original order. (Until refactor chunk 2B this was legacy.js.)
import './init.js';
import { draftPlayer, switchDraftProfile, undoDraft } from './state.js';
import { saveInlineEdit, setPosFilter, showTab, toggleCardDetails, toggleEditBar, toggleMenu } from './ui.js';
import { resetPicksOnly, saveSettings } from './settings.js';
import { exportMdsSettings, hardReset, importMdsSettings } from './backup.js';
import { addAndSyncSleeperDraft, createManualDraft, handleSmartSync, renderLiveSyncStatus, toggleAutoSync } from './sleeperSync.js';
import { handleQueueDragEnd, handleQueueDragOver, handleQueueDragStart, handleQueueDrop, moveQueueItem, toggleQueue } from './queue.js';
import { processPaste } from './import.js';
import { fetchMarketValue, processManualADP, quickStartFfc } from './market.js';
import { toggleHeadshots, toggleQueueCollapse } from './tracker.js';
import { sendRosterToLineupStrategist } from './handoff.js';
import { toggleRecapMath } from './recap.js';
import { exportTeam } from './export.js';
import { cycleAffinity } from './affinity.js';
import { delegate } from '../shared/ui/delegate.js';

// The window.* names other code still calls. They used to be `window.x = function` assignments
// inside mds.js, which inline onclick="..." handlers called; refactor chunk 5A replaced those
// handlers with the data-action listeners below and removed every name nothing else uses.
// These remain because something outside the inline handlers reads them through window:
//   toggleMenu: ui.js (showTab) and init.js (Escape key)
//   saveSettings, renderLiveSyncStatus: sleeperSync.js
//   exportMdsSettings: js/boot.js's rescue backup (works even when this module graph failed)
//   showTab: ui.js (back button), gestures.js, init.js, and the tests (tests/helpers.mjs)
//   setPosFilter: init.js (keyboard shortcuts)
//   toggleAutoSync: state.js and sleeperSync.js
window.toggleMenu = toggleMenu;
window.saveSettings = saveSettings;
window.exportMdsSettings = exportMdsSettings;
window.showTab = showTab;
window.setPosFilter = setPosFilter;
window.renderLiveSyncStatus = renderLiveSyncStatus;
window.toggleAutoSync = toggleAutoSync;

// --- DATA-ACTION EVENT DELEGATION ---
// Refactor chunk 5A: each table maps a data-action name (in index.html and in the HTML
// tracker.js, team.js and board.js build) to the code its inline on*="..." handler ran. `this`
// is the element, as it was in the inline handler, and data-* attributes carry the arguments
// that used to be literals in the handler. Numbers go through Number(), since the handlers
// compare ids with ===. See js/shared/ui/delegate.js for how the walk works.
const clickActions = {
    toggleMenu() { toggleMenu(); },
    showTab() { showTab(this.dataset.tab); },
    handleSmartSync() { handleSmartSync(); },
    dismissBanner() { window.dismissBanner(this.dataset.banner, this.dataset.storageKey); },
    quickStartFfc() { quickStartFfc(this); },
    processPaste() { processPaste(this); },
    addAndSyncSleeperDraft() { addAndSyncSleeperDraft(this); },
    createManualDraft() { createManualDraft(); },
    fetchMarketValue() { fetchMarketValue(this); },
    processManualADP() { processManualADP(this); },
    saveSettings() { saveSettings(this); },
    exportMdsSettings() { exportMdsSettings(); },
    chooseBackupFile() { document.getElementById('mdsImportFileInput').click(); },
    resetPicksOnly() { resetPicksOnly(); },
    hardReset() { hardReset(); },
    exportTeam() { exportTeam(); },
    sendRosterToLineupStrategist() { sendRosterToLineupStrategist(); },
    toggleRecapMath() { toggleRecapMath(); },
    // Player cards, the queue and the position filters (tracker.js), the Team tab (team.js)
    toggleQueue() { toggleQueue(Number(this.dataset.id)); },
    cycleAffinity(event) { cycleAffinity(event, Number(this.dataset.id)); },
    draftPlayer() { draftPlayer(Number(this.dataset.id), this.dataset.mine === 'true'); },
    toggleCardDetails(event) { toggleCardDetails(event, Number(this.dataset.id), this); },
    toggleEditBar() { toggleEditBar(Number(this.dataset.id)); },
    saveInlineEdit() { saveInlineEdit(Number(this.dataset.id)); },
    moveQueueItem() { moveQueueItem(Number(this.dataset.index), Number(this.dataset.direction)); },
    setPosFilter() { setPosFilter(this.dataset.pos); },
    toggleQueueCollapse() { toggleQueueCollapse(); },
    undoDraft() { undoDraft(Number(this.dataset.id)); },
};

const changeActions = {
    switchDraftProfile() { switchDraftProfile(this.value); },
    toggleWeightSlider() { document.getElementById('weightSliderContainer').style.display = this.checked ? 'block' : 'none'; },
    toggleAutoSync() { toggleAutoSync(this.checked, this); },
    autoSaveSettings() { saveSettings(); },
    toggleHeadshots() { toggleHeadshots(this.checked); },
    importMdsSettings() { importMdsSettings(this); },
};

const inputActions = {
    updateWeightLabels() { document.getElementById('weightLabelOld').innerText = (100 - this.value) + '% Existing'; document.getElementById('weightLabelNew').innerText = this.value + '% New Upload'; this.setAttribute('aria-valuetext', this.value + '% new, ' + (100 - this.value) + '% existing'); },
};

// The hero logo, Draft Board thumbnails and Team tab avatars hide themselves if they fail to load.
const errorActions = {
    hideImage() { this.style.display='none'; },
};

// Queue cards (tracker.js): drag to reorder. `dragend` is the one event not delegated: it fires on
// the dragged card after the drop, and by then handleQueueDrop's renderBoard() has replaced the
// queue, so the card is detached and the event never reaches #main. The inline ondragend still
// ran on the detached card (resetting draggedQueueIndex, so a later stray drop does nothing), so
// the card gets its own one-time dragend listener when the drag starts.
const dragActions = {
    dragstart: {
        queueDrag(event) {
            handleQueueDragStart(event, Number(this.dataset.index), this);
            this.addEventListener('dragend', (e) => handleQueueDragEnd(e, this), { once: true });
        },
    },
    dragover: { queueDrag(event) { handleQueueDragOver(event); } },
    drop: { queueDrag(event) { handleQueueDrop(event, Number(this.dataset.index)); } },
};

// The page's five top-level regions, each with one listener per event type it needs. They're
// in the static HTML and never re-rendered, so the listeners survive every renderBoard().
const header = document.querySelector('body > header.header');
const menuOverlay = document.getElementById('menuOverlay');
const hamburgerMenu = document.getElementById('hamburgerMenu');
const main = document.getElementById('main');
const navBar = document.querySelector('body > nav.nav-bar');

for (const container of [header, menuOverlay, hamburgerMenu, main, navBar]) delegate(container, 'click', clickActions);
delegate(header, 'change', changeActions);
delegate(main, 'change', changeActions);
delegate(main, 'input', inputActions);
for (const [type, actions] of Object.entries(dragActions)) delegate(main, type, actions);
delegate(main, 'error', errorActions);
// The inline onerror was attached while the HTML was parsed. This module runs after parsing, so
// an image in the static HTML (the hero logo) may already have failed: hide it now.
main.querySelectorAll('img[data-action="hideImage"]').forEach(img => {
    if (img.complete && img.naturalWidth === 0) errorActions.hideImage.call(img);
});
