// Entry point of the Draft Strategist page (<script type="module"> in index.html), added in
// refactor chunk 2A when js/mds.js became the js/mds/ module graph.
//
// legacy.js is imported first. It imports every other js/mds/ module in the order their code sat
// in mds.js, so the load-time code (storage migration, State, event listeners) runs in the
// original order.
import './legacy.js';
import { draftPlayer, switchDraftProfile, undoDraft } from './state.js';
import { saveInlineEdit, setPosFilter, showTab, toggleCardDetails, toggleEditBar, toggleMenu } from './ui.js';
import { resetPicksOnly, saveSettings } from './settings.js';
import { exportMdsSettings, hardReset, importMdsSettings } from './backup.js';
import { addAndSyncSleeperDraft, createManualDraft, handleSmartSync, renderLiveSyncStatus, toggleAutoSync } from './sleeperSync.js';
import { handleQueueDragEnd, handleQueueDragOver, handleQueueDragStart, handleQueueDrop, moveQueueItem, toggleQueue } from './queue.js';
import { processPaste } from './import.js';
import { fetchLeagueLogsADP, processManualADP, quickStartLeagueLogs } from './market.js';
import { cycleAffinity, exportTeam, sendRosterToLineupStrategist, toggleHeadshots, toggleQueueCollapse, toggleRecapMath } from './legacy.js';

// The names the inline handlers (onclick="..." in index.html and in HTML these modules build)
// and the tests call. They used to be `window.x = function` assignments inside mds.js; the
// modules now export them, and this is the one place they become globals. Phase 5 removes
// them as the inline handlers go.
window.switchDraftProfile = switchDraftProfile;
window.toggleMenu = toggleMenu;
window.saveSettings = saveSettings;
window.resetPicksOnly = resetPicksOnly;
window.exportMdsSettings = exportMdsSettings;
window.importMdsSettings = importMdsSettings;
window.hardReset = hardReset;
window.showTab = showTab;
window.setPosFilter = setPosFilter;
window.toggleEditBar = toggleEditBar;
window.toggleCardDetails = toggleCardDetails;
window.saveInlineEdit = saveInlineEdit;
window.createManualDraft = createManualDraft;
window.addAndSyncSleeperDraft = addAndSyncSleeperDraft;
window.handleSmartSync = handleSmartSync;
window.renderLiveSyncStatus = renderLiveSyncStatus;
window.toggleAutoSync = toggleAutoSync;
window.draftPlayer = draftPlayer;
window.undoDraft = undoDraft;
window.toggleQueue = toggleQueue;
window.handleQueueDragStart = handleQueueDragStart;
window.handleQueueDragOver = handleQueueDragOver;
window.handleQueueDragEnd = handleQueueDragEnd;
window.handleQueueDrop = handleQueueDrop;
window.moveQueueItem = moveQueueItem;
window.processPaste = processPaste;
window.quickStartLeagueLogs = quickStartLeagueLogs;
window.fetchLeagueLogsADP = fetchLeagueLogsADP;
window.processManualADP = processManualADP;
window.sendRosterToLineupStrategist = sendRosterToLineupStrategist;
window.toggleRecapMath = toggleRecapMath;
window.exportTeam = exportTeam;
window.cycleAffinity = cycleAffinity;
window.toggleQueueCollapse = toggleQueueCollapse;
window.toggleHeadshots = toggleHeadshots;
