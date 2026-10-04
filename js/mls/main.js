// Entry point of the Lineup Strategist page (<script type="module"> in lineup/index.html), added
// in refactor chunk 3A when lineup/mls.js became the js/mls/ module graph.
//
// The imports below are in the order the code sat in mls.js (they were legacy.js's import list
// until 3F deleted legacy.js), so the load-time code (State, event listeners) runs in the original
// order. Imports that name nothing are there only to keep that order. migrateKeys.js (6B) comes
// first: it renames old storage keys, so it has to run before anything reads storage.
import './migrateKeys.js';
import '../shared/api/sleeper.js';
import './sim/ui.js';
import '../shared/api/sleeperStats.js';
import './sim/stats.js';
import './constants.js';
import { redoLineupChange, undoLineupChange, updateLineupSetting } from './state.js';
import './helpers.js';
import { navigateFromDrawer, showTab, toggleDrawer } from './nav.js';
import { exportMlsSettings, factoryReset, importMlsSettings } from './backup.js';
import { goToSetupStep, onload } from './init.js';
import { toggleMlsHeadshots } from './lineup/headshots.js';
import './players.js';
import { addEarlyTeam, removeEarlyTeam } from './lineup/earlyGames.js';
import { toggleLockCountdown } from './lineup/gameInfo.js';
import { addAndSyncLeague, createManualLeague, cycleLeague, deleteLeagueManager, moveLeague, saveRequirements, switchActiveLeague, syncActiveLeague } from './leagues/sync.js';
import './leagues/scoutResults.js';
import { checkForDraftStrategistHandoff, dismissDraftStrategistHandoff, importDraftStrategistRoster } from './leagues/handoff.js';
import { addManualPlayer, deletePlayer } from './leagues/addPlayer.js';
import { importAllSleeperLeagues } from './leagues/importAll.js';
import { generateSoSGrid, saveManualSoS } from './sos.js';
import './trade/verdict.js';
import { runScout } from './scout/engine.js';
import { autoFindWaiverUpgrades, setWaiverCompare, setWaiverIntent, setWaiverScope, updateWaiverScanSetting } from './scout/waivers.js';
import './power/allLeagues.js';
import { scoutGoToLeague } from './scout/allLeaguesSearch.js';
import { togglePosInput, toggleRankingsCard, toggleUploadMode } from './rankings/engine.js';
import { deleteRankingSet, onRankingSetSelectChange, openRankingSetLeagues } from './rankings/sets.js';
import { cancelRankingsPreview, confirmRankingsPreview, processMultiRankings } from './rankings/uploadPreview.js';
import { fetchMarketValue, runMarketDisconnectAnalysis, toggleDisconnectMode, toggleDisconnectRankBasis, updateMarketMetaDisplay } from './scout/marketDisconnect.js';
import { autoFetchRosRankings } from './rankings/rosFetch.js';
import { updateMarketSetting, updateSimSetting, updateTradeSetting } from './settings.js';
import './trade/valueCurve.js';
import './trade/waiverValue.js';
import { copyLineupAsText, exportLineup } from './trade/export.js';
import './render/rookies.js';
import { loadRosterTab } from './render/roster.js';
import { initiateSwap, isAutoLockOverridden, optimizeLineup, overrideAutoLock, renderLineupUI, toggleLock, unlockAllPlayers } from './render/lineup.js';
import { optimizeAllLineups, renderSyncLogs, syncAllLeagues } from './render/dashboard.js';
import './shortcuts.js';
import { computePositionalPower, POWER_UNRANKED_RANK, powerRankFor, powerTier, powerValueForRank } from './power/shared.js';
import './power/futureValue.js';
import { getPowerLeagueKind } from './power/directionLabels.js';
import { goToPowerRankings, refreshPowerRankings, updatePowerSetting } from './power/rosterCard.js';
import { scrollToPowerRankings } from './power/snapshot.js';
import { runGlobalInjuryAudit } from './lineup/injuryAudit.js';
import './scout/waiverInsights.js';
import { lookupSimPlayer, runMatchupSim } from './sim/matchup.js';
import { delegate } from '../shared/ui/delegate.js';
import { dismissBannerAndReveal, dismissBanner } from '../shared/ui/banners.js';

// Re-exported for the modules that evaluate before the ones these live in (refactor 3E, moved here
// from legacy.js in 3F; see docs/refactor/LOG.md). Importing them from render/*.js, power/*.js or
// the like directly would evaluate those modules, and their imports, ahead of the importer:
// state.js would then read State in its TDZ, and the headshot/SoS/market load-time code would run
// out of mls.js order. main.js is the entry module, so it is always mid-evaluation while the
// others evaluate, and importing from it never triggers an evaluation.
export { checkForDraftStrategistHandoff, computePositionalPower, generateSoSGrid, getPowerLeagueKind, isAutoLockOverridden, loadRosterTab, lookupSimPlayer, optimizeLineup, POWER_UNRANKED_RANK, powerRankFor, powerTier, powerValueForRank, refreshPowerRankings, renderLineupUI, renderSyncLogs, runScout, showTab, switchActiveLeague, updateMarketMetaDisplay };
// For the Playwright tests, which import this module (`import('/js/mls/main.js')` in the page returns
// this same instance) instead of reading the functions off window.
export { confirmRankingsPreview, createManualLeague, openRankingSetLeagues, setWaiverCompare, setWaiverScope, toggleDrawer };

// The only window.* names left. Until refactor chunk 5D this block held every name something read
// through window (originally the inline on*="..." handlers); 5B and 5C replaced the handlers with
// the data-action listeners at the end of this file, and 5D turned the remaining window.x(...) calls
// into imports (docs/refactor/LOG.md lists them). These two have readers outside the module graph:
//   exportMlsSettings: js/boot.js (the rescue backup on a fatal boot error)
//   onload: the browser (the page's startup handler, js/mls/init.js)
window.exportMlsSettings = exportMlsSettings;
window.onload = onload;

// --- DATA-ACTION EVENT DELEGATION ---
// Refactor chunks 5B and 5C (the pattern is 5A's, js/mds/main.js): each table maps a data-action
// name (in lineup/index.html and in the HTML leagues/sync.js, lineup/{earlyGames,gameInfo,headshots}.js,
// render/{lineup,roster}.js, scout/{waivers,allLeaguesSearch}.js and power/snapshot.js build) to the
// code its inline on*="..." handler ran. `this` is the
// element, as it was in the inline handler, and data-* attributes carry the arguments that used to
// be literals in the handler. Numbers go through Number(); ids stay strings, as the handlers passed
// them quoted. See js/shared/ui/delegate.js for how the walk works. No inline handler is left
// in MLS since 5C.
const clickActions = {
    // Drawer, header, bottom nav
    toggleDrawer() { toggleDrawer(); },
    navigateFromDrawer() { navigateFromDrawer(this.dataset.tab); },
    showTab() { showTab(this.dataset.tab); },
    cycleLeague() { cycleLeague(Number(this.dataset.direction)); },
    // Setup tab: banners, Draft Strategist handoff, Command Center, Add/Sync League, requirements
    dismissBannerAndReveal() { dismissBannerAndReveal(this.dataset.banner, this.dataset.storageKey, this.dataset.nextBanner, this.dataset.nextStorageKey); },
    dismissBanner() { dismissBanner(this.dataset.banner, this.dataset.storageKey); },
    importDraftStrategistRoster() { importDraftStrategistRoster(); },
    dismissDraftStrategistHandoff() { dismissDraftStrategistHandoff(); },
    syncAllLeagues() { syncAllLeagues(this); },
    optimizeAllLineups() { optimizeAllLineups(this); },
    addAndSyncLeague() { addAndSyncLeague(this); },
    createManualLeague() { createManualLeague(); },
    importAllSleeperLeagues() { importAllSleeperLeagues(this); },
    saveRequirements() { saveRequirements(this); },
    // Command Center league rows (leagues/sync.js)
    switchActiveLeague() { switchActiveLeague(this.dataset.leagueId); },
    moveLeague() { moveLeague(Number(this.dataset.index), Number(this.dataset.direction)); },
    deleteLeagueManager() { deleteLeagueManager(this.dataset.leagueId); },
    // ROS (Roster tab) and Weekly (Lineup tab) rankings cards
    toggleRankingsCard() { toggleRankingsCard(this.dataset.card); },
    deleteRankingSet() { deleteRankingSet(this.dataset.type); },
    openRankingSetLeagues() { openRankingSetLeagues(this.dataset.type); },
    processMultiRankings() { processMultiRankings(this.dataset.type, this.dataset.successMsgId); },
    autoFetchRosRankings() { autoFetchRosRankings(this); },
    // Roster tab (and render/roster.js), SoS
    syncActiveLeague() { syncActiveLeague(); },
    deletePlayer() { deletePlayer(this.dataset.id); },
    saveManualSoS() { saveManualSoS(this); },
    // Setup tab: Advanced Settings card (5C)
    addManualPlayer() { addManualPlayer(); },
    exportMlsSettings() { exportMlsSettings(); },
    chooseBackupFile() { document.getElementById('mlsImportFileInput').click(); },
    factoryReset() { factoryReset(); },
    // Roster tab: Power Rankings snapshot (power/snapshot.js) (5C)
    scrollToPowerRankings() { scrollToPowerRankings(); },
    // Lineup tab (and render/lineup.js, lineup/earlyGames.js, lineup/gameInfo.js)
    optimizeLineup() { optimizeLineup(true, true); },
    copyLineupAsText() { copyLineupAsText(this); },
    exportLineup() { exportLineup(); },
    toggleLockCountdown() { toggleLockCountdown(); },
    unlockAllPlayers() { unlockAllPlayers(); },
    overrideAutoLock() { overrideAutoLock(this.dataset.id); },
    toggleLock() { toggleLock(this.dataset.id); },
    initiateSwap() { initiateSwap(this.dataset.id); },
    removeEarlyTeam() { removeEarlyTeam(this.dataset.team); },
    runGlobalInjuryAudit() { runGlobalInjuryAudit(this); },
    // Lineup tab: Monte Carlo card (5C)
    runMatchupSim() { runMatchupSim(); },
    // Scout tab (and scout/waivers.js, scout/allLeaguesSearch.js) (5C). The Sleeper sync banner
    // uses dismissBanner above; the waiver sections' toggles use toggleRankingsCard.
    clearWaiverScout() { document.getElementById('waiverInput').value=''; document.getElementById('waiverOutput').innerHTML=''; },
    setWaiverCompare() { setWaiverCompare(this.dataset.compare); },
    autoFindWaiverUpgrades() { autoFindWaiverUpgrades(this); },
    setWaiverScope() { setWaiverScope(this.dataset.scope); },
    setWaiverIntent() { setWaiverIntent(this.dataset.intent); },
    runScout() { runScout(this.dataset.scoutType); },
    scoutGoToLeague() { scoutGoToLeague(this.dataset.leagueId); },
    clearBuyInput() { document.getElementById('buyInput').value=''; },
    clearSellInput() { document.getElementById('sellInput').value=''; },
    goToPowerRankings() { goToPowerRankings(); },
    fetchMarketValue() { fetchMarketValue(this); },
    runMarketDisconnectAnalysis() { runMarketDisconnectAnalysis(); },
    // Rankings upload preview modal
    cancelRankingsPreview() { cancelRankingsPreview(); },
    confirmRankingsPreview() { confirmRankingsPreview(); },
};

const changeActions = {
    selectActiveLeague() { switchActiveLeague(this.value); },
    onRankingSetSelectChange() { onRankingSetSelectChange(this.dataset.type, this); },
    toggleUploadMode() { toggleUploadMode(this.dataset.type); },
    togglePosInput() { togglePosInput(this.dataset.type, this.dataset.pos); },
    updateMarketSetting() { updateMarketSetting(this.dataset.setting, this.value); },
    updateMarketSettingChecked() { updateMarketSetting(this.dataset.setting, this.checked); },
    updateLineupSetting() { updateLineupSetting(this.dataset.setting, this.checked); },
    addEarlyTeam() { addEarlyTeam(this.value); },
    // 5C: Advanced Settings, Power Rankings, Monte Carlo and Scout tab controls
    toggleMlsHeadshots() { toggleMlsHeadshots(this.checked); },
    importMlsSettings() { importMlsSettings(this); },
    updatePowerSetting() { updatePowerSetting(this.dataset.setting, this.value); },
    updateSimSetting() { updateSimSetting(this.dataset.setting, this.checked); },
    updateWaiverScanSetting() { updateWaiverScanSetting(this.dataset.setting, this.value); },
    updateWaiverScanSettingInt() { updateWaiverScanSetting(this.dataset.setting, parseInt(this.value, 10)); },
    updateWaiverScanSettingChecked() { updateWaiverScanSetting(this.dataset.setting, this.checked); },
    updateTradeSettingChecked() { updateTradeSetting(this.dataset.setting, this.checked); },
    updateTradeSetting() { updateTradeSetting(this.dataset.setting, this.value); },
    toggleDisconnectMode() { toggleDisconnectMode(); },
    toggleDisconnectRankBasis() { toggleDisconnectRankBasis(); },
};

// The hero logo hides itself if it fails to load; a player headshot (lineup/headshots.js) removes
// itself, leaving the initials underneath.
const errorActions = {
    hideImage() { this.style.display='none'; },
    removeImage() { this.remove(); },
};

// The page's static regions, each with one listener per event type it needs. None of them is ever
// re-rendered, so the listeners survive every tab and lineup rebuild.
const drawerOverlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('drawer');
const header = document.querySelector('body > header.header');
const mainApp = document.getElementById('mainApp');
const navBar = document.querySelector('body > nav.nav-bar');
const rankingsPreviewOverlay = document.getElementById('rankingsPreviewOverlay');

for (const container of [drawerOverlay, drawer, header, mainApp, navBar, rankingsPreviewOverlay]) delegate(container, 'click', clickActions);
delegate(header, 'change', changeActions);
delegate(mainApp, 'change', changeActions);
delegate(mainApp, 'error', errorActions);
// The inline onerror was attached while the HTML was parsed. This module runs after parsing, so
// an image in the static HTML (the hero logo) may already have failed: hide it now.
mainApp.querySelectorAll('img[data-action="hideImage"]').forEach(img => {
    if (img.complete && img.naturalWidth === 0) errorActions.hideImage.call(img);
});
