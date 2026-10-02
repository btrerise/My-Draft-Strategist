// Entry point of the Lineup Strategist page (<script type="module"> in lineup/index.html), added
// in refactor chunk 3A when lineup/mls.js became the js/mls/ module graph.
//
// legacy.js is imported first. It imports every other js/mls/ module in the order their code sat
// in mls.js, so the load-time code (State, event listeners) runs in the original order.
import { autoFetchRosRankings, autoFindWaiverUpgrades, cancelRankingsPreview, confirmRankingsPreview, copyLineupAsText, deleteRankingSet, exportLineup, fetchLeagueLogsADP, goToPowerRankings, initiateSwap, lookupSimPlayer, onload, onRankingSetSelectChange, openRankingSetLeagues, optimizeAllLineups, optimizeLineup, overrideAutoLock, processMultiRankings, processSingleRankingUpload, renderPowerRankingsTable, renderSyncLogs, runGlobalInjuryAudit, runMarketDisconnectAnalysis, runMatchupSim, runPositionalStrength, runScout, scoutGoToLeague, scrollToPowerRankings, setWaiverCompare, setWaiverIntent, setWaiverScope, syncAllLeagues, toggleDisconnectMode, toggleDisconnectRankBasis, toggleLock, toggleLockCountdown, togglePosInput, toggleRankingsCard, toggleUploadMode, unlockAllPlayers, updateLineupSetting, updateMarketSetting, updatePowerSetting, updateSimSetting, updateTradeSetting, updateWaiverScanSetting } from './legacy.js';
import { redoLineupChange, undoLineupChange } from './state.js';
import { navigateFromDrawer, showTab, toggleDrawer } from './nav.js';
import { exportMlsSettings, factoryReset, importMlsSettings } from './backup.js';
import { goToSetupStep } from './init.js';
import { toggleMlsHeadshots } from './lineup/headshots.js';
import { addEarlyTeam, removeEarlyTeam } from './lineup/earlyGames.js';
import { addAndSyncLeague, createManualLeague, cycleLeague, deleteLeagueManager, moveLeague, saveRequirements, switchActiveLeague, syncActiveLeague } from './leagues/sync.js';
import { dismissDraftStrategistHandoff, importDraftStrategistRoster } from './leagues/handoff.js';
import { addManualPlayer, deletePlayer } from './leagues/addPlayer.js';
import { importAllSleeperLeagues } from './leagues/importAll.js';
import { saveManualSoS } from './sos.js';

// The names the inline handlers (onclick="..." in lineup/index.html and in HTML these modules
// build) and the tests call, plus window.onload. They used to be `window.x = function`
// assignments inside mls.js; the modules now export them, and this is the one place they become
// globals. Phase 5 removes them as the inline handlers go.
window.undoLineupChange = undoLineupChange;
window.redoLineupChange = redoLineupChange;
window.toggleDrawer = toggleDrawer;
window.navigateFromDrawer = navigateFromDrawer;
window.showTab = showTab;
window.exportMlsSettings = exportMlsSettings;
window.importMlsSettings = importMlsSettings;
window.factoryReset = factoryReset;
window.goToSetupStep = goToSetupStep;
window.toggleMlsHeadshots = toggleMlsHeadshots;
window.onload = onload;
window.addEarlyTeam = addEarlyTeam;
window.removeEarlyTeam = removeEarlyTeam;
window.moveLeague = moveLeague;
window.deleteLeagueManager = deleteLeagueManager;
window.switchActiveLeague = switchActiveLeague;
window.cycleLeague = cycleLeague;
window.saveRequirements = saveRequirements;
window.createManualLeague = createManualLeague;
window.importDraftStrategistRoster = importDraftStrategistRoster;
window.dismissDraftStrategistHandoff = dismissDraftStrategistHandoff;
window.addManualPlayer = addManualPlayer;
window.deletePlayer = deletePlayer;
window.addAndSyncLeague = addAndSyncLeague;
window.importAllSleeperLeagues = importAllSleeperLeagues;
window.syncActiveLeague = syncActiveLeague;
window.saveManualSoS = saveManualSoS;
window.runScout = runScout;
window.updateWaiverScanSetting = updateWaiverScanSetting;
window.setWaiverCompare = setWaiverCompare;
window.setWaiverScope = setWaiverScope;
window.setWaiverIntent = setWaiverIntent;
window.scoutGoToLeague = scoutGoToLeague;
window.autoFindWaiverUpgrades = autoFindWaiverUpgrades;
window.onRankingSetSelectChange = onRankingSetSelectChange;
window.openRankingSetLeagues = openRankingSetLeagues;
window.deleteRankingSet = deleteRankingSet;
window.toggleLockCountdown = toggleLockCountdown;
window.toggleRankingsCard = toggleRankingsCard;
window.toggleUploadMode = toggleUploadMode;
window.togglePosInput = togglePosInput;
window.cancelRankingsPreview = cancelRankingsPreview;
window.confirmRankingsPreview = confirmRankingsPreview;
window.processSingleRankingUpload = processSingleRankingUpload;
window.processMultiRankings = processMultiRankings;
window.toggleDisconnectMode = toggleDisconnectMode;
window.toggleDisconnectRankBasis = toggleDisconnectRankBasis;
window.autoFetchRosRankings = autoFetchRosRankings;
window.fetchLeagueLogsADP = fetchLeagueLogsADP;
window.updateMarketSetting = updateMarketSetting;
window.updateTradeSetting = updateTradeSetting;
window.updateLineupSetting = updateLineupSetting;
window.updateSimSetting = updateSimSetting;
window.lookupSimPlayer = lookupSimPlayer;
window.runMarketDisconnectAnalysis = runMarketDisconnectAnalysis;
window.copyLineupAsText = copyLineupAsText;
window.exportLineup = exportLineup;
window.toggleLock = toggleLock;
window.overrideAutoLock = overrideAutoLock;
window.unlockAllPlayers = unlockAllPlayers;
window.initiateSwap = initiateSwap;
window.optimizeLineup = optimizeLineup;
window.renderSyncLogs = renderSyncLogs;
window.optimizeAllLineups = optimizeAllLineups;
window.syncAllLeagues = syncAllLeagues;
window.updatePowerSetting = updatePowerSetting;
window.scrollToPowerRankings = scrollToPowerRankings;
window.goToPowerRankings = goToPowerRankings;
window.runPositionalStrength = runPositionalStrength;
window.renderPowerRankingsTable = renderPowerRankingsTable;
window.runGlobalInjuryAudit = runGlobalInjuryAudit;
window.runMatchupSim = runMatchupSim;
