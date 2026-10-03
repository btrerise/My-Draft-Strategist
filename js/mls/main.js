// Entry point of the Lineup Strategist page (<script type="module"> in lineup/index.html), added
// in refactor chunk 3A when lineup/mls.js became the js/mls/ module graph.
//
// The imports below are in the order the code sat in mls.js (they were legacy.js's import list
// until 3F deleted legacy.js), so the load-time code (State, event listeners) runs in the original
// order. Imports that name nothing are there only to keep that order.
import '../shared/api/sleeper.js';
import './sim/ui.js';
import '../shared/api/sleeperStats.js';
import './sim/stats.js';
import './compat.js';
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
import { cancelRankingsPreview, confirmRankingsPreview, processMultiRankings, processSingleRankingUpload } from './rankings/uploadPreview.js';
import { fetchLeagueLogsADP, runMarketDisconnectAnalysis, toggleDisconnectMode, toggleDisconnectRankBasis, updateMarketMetaDisplay } from './scout/marketDisconnect.js';
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
import { goToPowerRankings, refreshPowerRankings, renderPowerRankingsTable, runPositionalStrength, updatePowerSetting } from './power/rosterCard.js';
import { scrollToPowerRankings } from './power/snapshot.js';
import { runGlobalInjuryAudit } from './lineup/injuryAudit.js';
import './scout/waiverInsights.js';
import { lookupSimPlayer, runMatchupSim } from './sim/matchup.js';

// Re-exported for the modules that evaluate before the ones these live in (refactor 3E, moved here
// from legacy.js in 3F; see docs/refactor/LOG.md). Importing them from render/*.js, power/*.js or
// the like directly would evaluate those modules, and their imports, ahead of the importer:
// state.js would then read State in its TDZ, and the headshot/SoS/market load-time code would run
// out of mls.js order. main.js is the entry module, so it is always mid-evaluation while the
// others evaluate, and importing from it never triggers an evaluation.
export { checkForDraftStrategistHandoff, computePositionalPower, generateSoSGrid, getPowerLeagueKind, isAutoLockOverridden, loadRosterTab, POWER_UNRANKED_RANK, powerRankFor, powerTier, powerValueForRank, refreshPowerRankings, renderLineupUI, renderSyncLogs, updateMarketMetaDisplay };

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
