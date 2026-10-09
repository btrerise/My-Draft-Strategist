// Entry point of the Draft Strategist page (<script type="module"> in index.html), added in
// refactor chunk 2A when js/mds.js became the js/mds/ module graph.
//
// init.js is imported first. It imports every other js/mds/ module in the order their code sat
// in mds.js, so the load-time code (storage migration, State, event listeners) runs in the
// original order. (Until refactor chunk 2B this was legacy.js.) Only migrateKeys.js (6B) comes
// before it: it renames old storage keys, so it has to run before anything reads storage.
import './migrateKeys.js';
import './init.js';
import { draftPlayer, switchDraftProfile, undoDraft } from './state.js';
import { saveInlineEdit, setPosFilter, showTab, toggleCardDetails, toggleEditBar, toggleMenu } from './ui.js';
import { focusBadgeLegend } from './legend.js';
import { resetPicksOnly, saveSettings } from './settings.js';
import { exportMdsSettings, hardReset, importMdsSettings } from './backup.js';
import { addAndSyncSleeperDraft, createManualDraft, handleSmartSync, renderLiveSyncStatus, toggleAutoSync } from './sleeperSync.js';
import { handleQueueDragEnd, handleQueueDragOver, handleQueueDragStart, handleQueueDrop, moveQueueItem, toggleQueue } from './queue.js';
import { processPaste } from './import.js';
import { cancelRankingsPreview, confirmRankingsPreview } from './uploadPreview.js';
import { fetchMarketValue, processManualADP, quickStartFfc } from './market.js';
import { toggleHeadshots, toggleQueueCollapse } from './tracker.js';
import { sendRosterToLineupStrategist } from './handoff.js';
import { toggleRecapMath } from './recap.js';
import { exportTeam } from './export.js';
import { cycleAffinity } from './affinity.js';
import { delegate } from '../shared/ui/delegate.js';
import { dismissBanner } from '../shared/ui/banners.js';
import { goToSetupStep } from './setupGuide.js';

// toggleAutoSync: state.js imports it from here. sleeperSync.js evaluates after state.js, so a direct
// import would evaluate it (and its imports) early; main.js is the entry module, always mid-evaluation
// while the others run, so importing from it never triggers an evaluation. showTab: for the
// Playwright tests (`import('/js/mds/main.js')` in the page returns this same instance).
export { showTab, toggleAutoSync };

// The only window.* name left. Until refactor chunk 5D this block held every name something read
// through window (originally the inline onclick="..." handlers); 5A replaced the handlers with the
// data-action listeners below, and 5D turned the remaining window.x(...) calls into imports.
//   exportMdsSettings: js/boot.js's rescue backup (works even when this module graph failed)
window.exportMdsSettings = exportMdsSettings;

// --- DATA-ACTION EVENT DELEGATION ---
// Refactor chunk 5A: each table maps a data-action name (in index.html and in the HTML
// tracker.js, team.js and board.js build) to the code its inline on*="..." handler ran. `this`
// is the element, as it was in the inline handler, and data-* attributes carry the arguments
// that used to be literals in the handler. Numbers go through Number(), since the handlers
// compare ids with ===. See js/shared/ui/delegate.js for how the walk works.
const clickActions = {
    toggleMenu() { toggleMenu(); },
    showTab() { showTab(this.dataset.tab); },
    // "What do these mean?" on the Tracker (improvements S10): the Guide tab, scrolled to its badge legend.
    openBadgeLegend() { showTab('guide'); focusBadgeLegend(); },
    handleSmartSync() { handleSmartSync(); },
    dismissBanner() { dismissBanner(this.dataset.banner, this.dataset.storageKey); },
    // The Setup Progress checklist's "Show me ↓" links (setupGuide.js, 8A)
    goToSetupStep() { goToSetupStep(this.dataset.step); },
    quickStartFfc() { quickStartFfc(this); },
    processPaste() { processPaste(this); },
    // The rankings upload preview's two buttons (uploadPreview.js, 8C)
    cancelRankingsPreview() { cancelRankingsPreview(); },
    confirmRankingsPreview() { confirmRankingsPreview(); },
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

// The hero logo hides itself if it fails to load; a Draft Board or Team tab headshot (headshots.js)
// removes itself, leaving the initials underneath.
const errorActions = {
    hideImage() { this.style.display='none'; },
    removeImage() { this.remove(); },
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

// The page's five top-level regions, each with one listener per event type it needs, plus the
// rankings upload preview (8C), which sits outside them. They're in the static HTML and never
// re-rendered, so the listeners survive every renderBoard().
const header = document.querySelector('body > header.header');
const menuOverlay = document.getElementById('menuOverlay');
const hamburgerMenu = document.getElementById('hamburgerMenu');
const main = document.getElementById('main');
const navBar = document.querySelector('body > nav.nav-bar');
const rankingsPreview = document.getElementById('rankingsPreviewOverlay');

for (const container of [header, menuOverlay, hamburgerMenu, main, navBar, rankingsPreview]) delegate(container, 'click', clickActions);
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
