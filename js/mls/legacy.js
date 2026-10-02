/**
 * Fantasy Football Season & Lineup Strategist - Core Logic
 * Refactored for modular encapsulation, performance, and clean architecture.
 */
//
// Renamed from lineup/mls.js in refactor chunk 3A. The sections above PLAYER HEADSHOTS moved to
// the other js/mls/ modules (see docs/refactor/LOG.md); 3B moved PLAYER HEADSHOTS through SOS
// ENGINE, except window.onload below; 3C moved SCOUT TAB ENGINE through ALL-LEAGUES PLAYER SEARCH
// (js/mls/scout/, js/mls/power/allLeagues.js); 3D moved RANKINGS ENGINE through SCREENSHOT EXPORT
// (js/mls/rankings/, js/mls/trade/, js/mls/settings.js, js/mls/scout/marketDisconnect.js), except
// lookupSimPlayer. The rest of mls.js is still here.

// Pilot ES module extraction (see rankingsParser.js for rationale) -- this is the only
// piece of mls.js currently split out. import statements must live at a module's top
// level, which is why this sits above the IIFE rather than inside it; the imported
// function is still just a normal binding the IIFE's closures can reference below.
import { getNflState, getSleeperUser, getSleeperLeagueRosters, getSleeperPlayerMap, getSleeperMatchups } from '../shared/api/sleeper.js';
import { runMatchupSimulation, clearSimResults, showSimNotice } from '../../lineup/monteCarloUi.js';
import { getPlayerWeeklyScoreHistory, getWeeklyProjections } from '../shared/api/sleeperStats.js';
import { MIN_RELIABLE_GAMES, getPlayerVarianceProfile, getProbabilityBeats } from '../../lineup/statsEngine.js';
import { escapeHtml } from './compat.js';
import { RANKING_TYPE_CONFIG, TEAM_BYES, tierTag } from './constants.js';
import { pushLineupUndoSnapshot, refreshCurrentNflWeek, refreshGameTimes, State, applyLineupSettingsToUI } from './state.js';
import { getShortInjuryStatus, isBestBallLeague, isExcludedFromSimulation, isUnavailableThisWeek, rankingIndex, renderHTMLInto, SIM_EXCLUDE_STATUSES, getActiveLeague, isConnectionError } from './helpers.js';
import './nav.js';
import './backup.js';
import { updatePulsePrompts } from './init.js';
import { ensureHeadshotNameIndex, playerHeadshotHTML } from './lineup/headshots.js';
import { attachPlayerAutocomplete, attachScoutSuggestionHandler, getCleanNameToIdIndex } from './players.js';
import { isEarlyPlayer, populateEarlyGameDropdown } from './lineup/earlyGames.js';
import { getByeBadgeHTML, getGameInfoHTML, getLeagueScoringKey, getLineupInjuryWarningHTML, getLineupProjection, getNextLockCountdownHTML, getPlayerPointsHTML, getValidSleeperStarterIds, hasKickedOff, lineupProjectionsLoaded, refreshLineupStats } from './lineup/gameInfo.js';
import { formatNameList, getLeagueRankingsStamp, hydrateRankingsForLeague, loadActiveLeagueData, processSleeperData, refreshLeagueDropdown, renderLeagueManager, switchActiveLeague } from './leagues/sync.js';
import './leagues/scoutResults.js';
import { checkForDraftStrategistHandoff } from './leagues/handoff.js';
import { initManualAddForm, renderManualAddLog } from './leagues/addPlayer.js';
import './leagues/importAll.js';
import { generateSoSGrid, getSoSBadgeHTML } from './sos.js';
import './scout/engine.js';
import { applyWaiverScanSettingsToUI, getSleeperMetaByName } from './scout/waivers.js';
import { ordinal } from './power/allLeagues.js';
import { isFullyMappedLeague } from './scout/allLeaguesSearch.js';
import { updateRankingsMetaDisplay } from './rankings/engine.js';
import './rankings/sets.js';
import './rankings/uploadPreview.js';
import { updateMarketMetaDisplay } from './scout/marketDisconnect.js';
import './rankings/rosFetch.js';
import { applySimSettingsToUI, applyTradeSettingsToUI, applyMarketSettingsToUI } from './settings.js';
import './trade/valueCurve.js';
import { getTopWaiverCandidatesByPosition } from './trade/waiverValue.js';
import './trade/export.js';

    export const onload = function() {
        initManualAddForm();
        attachPlayerAutocomplete(document.getElementById('simPlayerSearch'), (p) => {
            window.lookupSimPlayer(p);
        });
        attachScoutSuggestionHandler('waiverOutput');
        attachScoutSuggestionHandler('tradeOutput');
        populateEarlyGameDropdown();
        refreshLeagueDropdown();
        // State starts from the flat global rankings keys -- the last upload for ANY league --
        // and only switchActiveLeague() used to replace them with the active league's own set.
        // So after a reload, a league on set A showed set B's players until you switched away
        // and back, while its dropdown (and now the card header) said A. Hydrate up front, per
        // type, and only where the league has something of its own (a saved set that still
        // exists, or legacy data): otherwise that type keeps the global fallback, as before.
        {
            const bootLeague = getActiveLeague() || State.leagues[0] || null;
            if (bootLeague) {
                ['ros', 'weekly'].forEach(t => {
                    const cfg = RANKING_TYPE_CONFIG[t];
                    const setId = bootLeague[cfg.leagueSetIdKey];
                    const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
                    const legacy = bootLeague[cfg.leagueLegacyDataKey];
                    if (set) {
                        State[cfg.stateKey] = [...set.data];
                        State[cfg.updatedAtKey] = set.updatedAt;
                    } else if (Array.isArray(legacy) && legacy.length > 0) {
                        State[cfg.stateKey] = [...legacy];
                        State[cfg.updatedAtKey] = bootLeague[cfg.leagueLegacyUpdatedKey] || null;
                    }
                });
            }
        }
        updateRankingsMetaDisplay();
        // Market data persists across reloads, but this was only ever called right after a
        // fetch/upload -- so on a fresh page load the Trade Finder showed no count or age at all.
        updateMarketMetaDisplay();
        generateSoSGrid();
        checkForDraftStrategistHandoff();
        applyMarketSettingsToUI();
        applyTradeSettingsToUI();
        applyLineupSettingsToUI();
        applySimSettingsToUI();
        applyWaiverScanSettingsToUI();
        updatePulsePrompts();
        refreshCurrentNflWeek();
        if (typeof renderSyncLogs === 'function') renderSyncLogs();

        if (State.leagues.length > 0 && !State.activeLeagueId) {
            State.activeLeagueId = State.leagues[0].leagueId;
        }
        if (State.activeLeagueId) {
            const leagueSelect = document.getElementById('headerLeagueSelect');
            if (leagueSelect) leagueSelect.value = State.activeLeagueId;
            loadActiveLeagueData();
        }
        // Deep link: open the tab named in the URL hash (a reload, or a shared #lineup link),
        // else the Dashboard. skipHistory + replaceState instead of a push: pushing here added
        // a second history entry on every page load, so the first Back press went nowhere.
        // Stamping this entry with its tab also means Back to it restores the right tab.
        const initialTab = window.getTabFromHash() || 'setup';
        window.showTab(initialTab, true);
        history.replaceState({ tab: initialTab }, '', `#${initialTab}`);

        // Last line of init on purpose: tells the safety net in utils.js that this module --
        // and every module it imports -- evaluated all the way through and the page is
        // genuinely usable, so a later uncaught error gets logged instead of covering a
        // working screen with the fatal-boot banner. If any of the seven files in this
        // module graph 404s, or anything above throws, this never runs and the banner stays
        // armed, which is exactly the behavior we want.
        if (typeof window.markAppReady === 'function') window.markAppReady();
    };


// Standalone "look up any player" search -- separate from the team-vs-team matchup
// simulation above it, by design (Benton's own call: simpler to reason about, and this is
// meant for evaluating someone you DON'T own yet -- "a podcaster mentioned this guy as a
// sleeper" -- not for slotting them into your current lineup). Reuses the app's one existing
// player autocomplete (attachPlayerAutocomplete) so this didn't need its own search UI, and
// the same getPlayerVarianceProfile everything else in the simulator is built on, just fed a
// single player's own history instead of a whole roster's.
//
// Scope note: unlike runMatchupSim, this does NOT check for an already-played actual score --
// that would need a live per-week stat lookup independent of any specific roster's matchup
// entry (Sleeper's matchup data is scoped per fantasy roster, and this player isn't
// necessarily on one), which isn't wired up anywhere in this app yet. For "should I add this
// person" -- the actual use case here -- a projection/history-based range is the right level
// of fidelity anyway; a live in-game update matters far less than it does for "will I win
// this specific matchup right now."
export const lookupSimPlayer = async function(p) {
    const resultEl = document.getElementById('simPlayerLookupResult');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<p class="text-helper">Looking up ${escapeHtml(p.name)}…</p>`;

    try {
        const nflState = await getNflState();
        if (!nflState) {
            resultEl.innerHTML = `<p class="text-helper">Couldn't reach Sleeper right now - try again in a moment.</p>`;
            return;
        }
        const currentWeek = nflState.week;
        const season = nflState.league_season || nflState.season;

        const nameToId = await getCleanNameToIdIndex();
        const id = nameToId[normalizeName(p.name)];
        if (!id) {
            resultEl.innerHTML = `<p class="text-helper">Couldn't find a Sleeper record for ${escapeHtml(p.name)}.</p>`;
            return;
        }

        const playerMap = await getSleeperPlayerMap();
        const rawPlayer = playerMap[id] || {};

        // This lookup isn't tied to any one league (that's the point -- checking out someone
        // you don't own yet), so there's no single "the" league scoring format to read.
        // Full PPR is the most common default across mainstream platforms and matches this
        // app's own fallback elsewhere.
        const scoringKey = 'pts_ppr';

        const { blended } = await getPlayerWeeklyScoreHistory([id], season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES });
        const weeklyScores = blended[id] || [];

        if (weeklyScores.length === 0) {
            resultEl.innerHTML = `<p class="text-helper">${escapeHtml(p.name)} doesn't have enough game history yet to estimate a range (rookie, recent signing, or long-term injury).</p>`;
            return;
        }

        const projections = await getWeeklyProjections(season, currentWeek);
        const proj = projections && projections[id];
        const projectedMean = (proj && typeof proj[scoringKey] === 'number') ? proj[scoringKey] : null;

        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean });
        const shortInj = getShortInjuryStatus(rawPlayer);
        const isExcluded = shortInj !== null && SIM_EXCLUDE_STATUSES.includes(shortInj);

        const injuryHTML = shortInj
            ? `<div class="sim-lookup-injury-flag${isExcluded ? ' is-excluded' : ''}">Status: ${escapeHtml(shortInj)}${isExcluded ? ' - unlikely to play this week' : ''}</div>`
            : '';

        resultEl.innerHTML = `
            <div class="sim-lookup-card">
                <div class="sim-lookup-header">
                    ${rawPlayer.position ? `<span class="pos-badge ${escapeHtml(rawPlayer.position)}">${escapeHtml(rawPlayer.position)}</span>` : ''}
                    <strong>${escapeHtml(p.name)}</strong>
                    <span class="text-helper">${escapeHtml(rawPlayer.team || 'FA')}</span>
                </div>
                ${injuryHTML}
                <div class="sim-lookup-range">${profile.usedFallback ? '~' : ''}${profile.floor}&ndash;${profile.ceiling} pts <span class="text-helper">(${profile.mean} ${projectedMean !== null ? 'proj' : 'avg'})</span></div>
                <p class="text-helper mt-1">Standalone estimate - not run against any specific matchup or lineup.</p>
            </div>`;
    } catch (err) {
        console.error(err);
        resultEl.innerHTML = `<p class="text-helper">Something went wrong looking that player up.</p>`;
    }
};

    // --- RENDERERS ---
    // --- ROOKIE LOOKUP (Roster tab "R" badge) ---
    // Rookie status isn't stored on league.roster -- it comes from Sleeper's years_exp (0 in a
    // player's rookie season), the same field the Matchup Simulator's rookie badge reads.
    // Looked up at render time rather than saved at sync so it can't go stale when the season
    // rolls over, and so leagues synced before this existed get badges without a re-sync.
    // Matched by Sleeper id first (synced leagues); manual and Draft Strategist handoff rosters
    // carry made-up ids ('p_...'), so those fall back to the normalized name -- on a name
    // collision preferring the player with an NFL team, like getSleeperMetaByName.
    let _rookieIndex = null;
    let _rookieIndexPromise = null;
    function getRookieIndex() {
        if (_rookieIndexPromise) return _rookieIndexPromise;
        _rookieIndexPromise = getSleeperPlayerMap().then(map => {
            const rookieIds = new Set();
            const knownIds = new Set();
            const byName = new Map();
            Object.entries(map).forEach(([id, p]) => {
                knownIds.add(id);
                const rookie = p.years_exp === 0;
                if (rookie) rookieIds.add(id);
                if (!p.first_name) return;
                const clean = normalizeName(`${p.first_name} ${p.last_name}`);
                const prev = byName.get(clean);
                if (!prev || (!prev.team && p.team)) byName.set(clean, { rookie, team: p.team || null });
            });
            _rookieIndex = { rookieIds, knownIds, byName };
            return _rookieIndex;
        }).catch(err => {
            _rookieIndexPromise = null;
            throw err;
        });
        return _rookieIndexPromise;
    }

    function isRookiePlayer(p, idx) {
        if (!idx || !p) return false;
        if (p.id && idx.knownIds.has(String(p.id))) return idx.rookieIds.has(String(p.id));
        const entry = idx.byName.get(p.cleanName);
        return !!(entry && entry.rookie);
    }

    export function loadRosterTab() {
        // Every roster change funnels through here (manual add/remove, Roster tab delete,
        // re-sync), so this keeps the Settings "Added this session" list in step with it.
        renderManualAddLog();
        // Same funnel keeps the Positional Power Rankings card current: rankings uploads, set
        // changes, syncs and league switches all end up here (see refreshPowerRankings).
        refreshPowerRankings();
        let league = getActiveLeague();
        const syncBtn = document.getElementById('rosterSyncBtn');
        const headerNameEl = document.getElementById('rosterLeagueHeader');
        const headerFormatEl = document.getElementById('rosterFormatBadge');

        // Dynamically update the header
        if (headerNameEl) {
            headerNameEl.innerText = league ? league.name : "Active Roster";
        }
        if (headerFormatEl) {
            headerFormatEl.innerText = league && league.formatBadge ? `(${league.formatBadge})` : "(Sorted by ROS)";
        }

        if (syncBtn) {
            if (league && league.leagueId && !league.leagueId.startsWith('manual_') && league.username) syncBtn.style.display = 'block';
            else syncBtn.style.display = 'none';
        }

        const rosterListEl = document.getElementById('rosterList');
        if (!rosterListEl) return;

        if (!league || !league.roster || league.roster.length === 0) {
            rosterListEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to your Roster</div>
                <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 1. Sync your Sleeper League (Dashboard)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 2. Upload ROS Rankings (Above)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 3. Evaluate your team</div>
                </div>
            </div>`;
            return;
        }
        
        // Rookie badges need the Sleeper player map. It's usually already cached for the
        // session; the first time it isn't, the roster renders now without badges and
        // re-renders once the lookup lands. That happens at most once per session: after it
        // resolves, _rookieIndex is set and this branch is skipped. A failed lookup just
        // leaves the badges off.
        const rookieIdx = _rookieIndex;
        if (!rookieIdx) {
            getRookieIndex().then(() => loadRosterTab()).catch(e => console.warn('Rookie badges unavailable: Sleeper player map could not be loaded.', e));
        }

        // Manual/handoff players need the name index for their headshots -- same
        // render-now, redraw-once-it-lands pattern as the rookie badges above.
        ensureHeadshotNameIndex(league.roster, loadRosterTab);

        const rosIndex = rankingIndex(State.rosRankings);
        let displayRoster = league.roster.map(p => {
            let rObj = rosIndex.get(p.cleanName);
            return {
                ...p, 
                rosRank: rObj ? rObj.rank : 999,
                posRank: rObj ? rObj.posRank : 999,
                rosTier: rObj ? rObj.tier : null,
                posTier: rObj ? rObj.posTier : null
            };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        displayRoster.sort((a, b) => {
            if (a.rosRank !== 999 || b.rosRank !== 999) return a.rosRank - b.rosRank;
            return (posOrder[a.pos] || 99) - (posOrder[b.pos] || 99);
        });

        let html = "";
        displayRoster.forEach(p => {
            let ovrStr = p.rosRank !== 999 ? `#${p.rosRank}${tierTag(p.rosTier)}` : "-";
            let posStr = p.posRank !== 999 ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
            let rankBadge = (p.rosRank !== 999 || p.posRank !== 999) ? `Ovr: ${ovrStr} | Pos: ${posStr}` : "Unranked";
            let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
            let byeBadge = getByeBadgeHTML(p.team);
            let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
            let sosBadge = getSoSBadgeHTML(p.team, p.pos);
            // Same "R" badge as MDS roster cards and the Matchup Simulator.
            let rookieBadge = isRookiePlayer(p, rookieIdx) ? `<span class="badge badge-rookie" title="Rookie" aria-label="Rookie">R</span>` : "";
            // Status badges ride on the name line (see .mls-name-badges) rather than a row of
            // their own: a separate row made badged cards a line taller than the rest, which
            // broke up the list's rhythm at phone width. Grouped so they wrap as one unit.
            // Ordered most-permanent first: rookie holds all season, so it keeps a fixed spot
            // beside the name; injury and bye come and go after it without shifting it.
            // Same TAXI badge the Lineup tab's bench uses. isTaxi is set at Sleeper sync time, so
            // manual leagues never show it. Sits right after rookie: both are season-long
            // roster-status markers, so they stay fixed ahead of injury/bye.
            let taxiBadge = p.isTaxi ? `<span class="badge taxi-badge" title="Taxi squad">TAXI</span>` : "";
            let statusBadges = [rookieBadge, taxiBadge, injBadge, byeBadge].filter(Boolean).join('');
            
            html += `
            <div class="roster-item">
                <div class="mls-player-row-info">
                    <span class="badge pos-badge ${escapeHtml(p.pos)} mls-pos-badge-sizing">${escapeHtml(p.pos)}</span>
                    ${playerHeadshotHTML(p)}
                    <div class="mls-player-row-text">
                        <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}${statusBadges ? ` <span class="mls-name-badges">${statusBadges}</span>` : ''}</div>
                        <div class="mls-player-row-meta">
                            <span class="badge">${escapeHtml(p.team)}</span>
                            <span class="badge mls-rank-badge">${rankBadge}</span>
                            ${sosBadge}
                        </div>
                    </div>
                </div>
                <div class="mls-row-actions">
                    <button class="btn-danger" style="padding:4px 8px; border-radius:4px;" onclick="deletePlayer('${p.id}')" aria-label="Remove ${escapeHtml(p.name)}">✕</button>
                </div>
            </div>`;
        });
        rosterListEl.innerHTML = html;
    }

    // Core lock/unlock mechanics shared by toggleLock (the manual lock icon) and the
    // keep-swaps-sticky logic in initiateSwap below. Updates both the season-long lock list
    // AND each player object's isLocked flag directly in the starters/bench arrays, since
    // renderLineupUI reads that flag off the object rather than re-checking the list. Returns
    // the player's name (for callers that want to reference it, e.g. in a toast).
    function setPlayerLockState(playerId, isLocked) {
        if (!State.activeLeagueId) return null;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let idx = locks.indexOf(playerId);
        if (isLocked && idx === -1) locks.push(playerId);
        else if (!isLocked && idx !== -1) locks.splice(idx, 1);
        State.lockedPlayersMap[State.activeLeagueId] = locks;
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));

        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let playerName = null;
        starters.forEach(s => {
            if (s.player && s.player.id === playerId) { s.player.isLocked = isLocked; playerName = s.player.name; }
        });
        bench.forEach(p => {
            if (p.id === playerId) { p.isLocked = isLocked; playerName = p.name; }
        });
        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = bench;
        return playerName;
    }

    export const toggleLock = function(playerId) {
        if (!State.activeLeagueId) return;
        pushLineupUndoSnapshot(State.activeLeagueId);
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let isLocking = !locks.includes(playerId);
        let playerName = setPlayerLockState(playerId, isLocking) || 'Player';

        if (typeof window.showToast === 'function') {
            window.showToast(`${playerName} is ${isLocking ? 'locked' : 'unlocked'}`);
        }
        renderLineupUI();
    };

    // True if the person has explicitly overridden auto-lock for this player this week (see
    // window.overrideAutoLock below). Scoped to the current week -- an override from a prior
    // week is stale (that week's kickoff data no longer applies) and is ignored here rather than
    // needing to be manually cleaned up.
    export function isAutoLockOverridden(leagueId, playerId) {
        let entry = State.autoLockOverridesMap[leagueId];
        if (!entry || entry.week !== State.currentNflWeek) return false;
        return entry.ids.includes(playerId);
    }

    // The failsafe for auto-lock (see optimizeLineup): if gameTimesByTeam or Sleeper's synced
    // starters ever get a specific player wrong -- a postponed/rescheduled game, a stale sync,
    // etc -- this lets the person pull that ONE player back into normal (unlocked) territory so
    // the optimizer will freely reconsider them again, without touching anything else about the
    // lineup or affecting the season-long manual lock list.
    export const overrideAutoLock = async function(playerId) {
        if (!State.activeLeagueId) return;
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let found = starters.find(s => s.player && s.player.id === playerId);
        let playerName = found ? found.player.name : (bench.find(p => p.id === playerId) || {}).name || 'This player';

        if (!await window.showConfirm(`${playerName}'s game shows as already started. Only override this if that's wrong; doing so lets the optimizer freely move or bench them again.`, { title: 'Override the auto-lock?', confirmText: 'Override Lock' })) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        let entry = State.autoLockOverridesMap[State.activeLeagueId];
        if (!entry || entry.week !== State.currentNflWeek) entry = { week: State.currentNflWeek, ids: [] };
        if (!entry.ids.includes(playerId)) entry.ids.push(playerId);
        State.autoLockOverridesMap[State.activeLeagueId] = entry;
        localStorage.setItem('mls_autolock_overrides_map', JSON.stringify(State.autoLockOverridesMap));

        if (typeof window.showToast === 'function') {
            window.showToast("Auto-lock removed - re-optimizing");
        }
        window.optimizeLineup(true);
    };

    // Bulk-clears the season-long MANUAL lock list for the active league only -- deliberately
    // does not touch auto-locks (see optimizeLineup/overrideAutoLock above): a player whose game
    // has genuinely already kicked off should stay pinned even after this, since un-pinning them
    // would let the optimizer bench or reshuffle someone who's already locked into that outcome
    // in real life. This is for clearing out manual picks made earlier in the season/week, not
    // for correcting auto-lock mistakes -- overrideAutoLock (the per-player control on an
    // auto-locked row) is the right tool for that instead.
    export const unlockAllPlayers = async function() {
        if (!State.activeLeagueId) return;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        if (locks.length === 0) return;
        if (!await window.showConfirm(`This clears all ${locks.length} manual lock${locks.length === 1 ? '' : 's'} in this league. Players auto-locked because their game already started stay locked.`, { title: 'Unlock all locked players?', confirmText: 'Unlock All' })) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        State.lockedPlayersMap[State.activeLeagueId] = [];
        localStorage.setItem('mds_season_locks_map', JSON.stringify(State.lockedPlayersMap));

        if (typeof window.showToast === 'function') {
            window.showToast("All manual locks cleared - re-optimizing");
        }
        window.optimizeLineup(true);
    };

    // True if `pos` is allowed to occupy a slot of type `slotType` ('QB', 'RB', 'WR', 'TE',
    // 'FLEX', 'SFLEX', 'K', or 'DEF' -- i.e. a starter slot label with its trailing number
    // stripped, same convention used everywhere else in this file). Mirrors the exact
    // eligibility rules fillSlot()/the SFLEX loop use when building the lineup in the first
    // place, so a manual swap can never produce a slot/position combination the optimizer
    // itself would never have created.
    function slotAcceptsPos(slotType, pos) {
        switch (slotType) {
            case 'QB': return pos === 'QB';
            case 'RB': return pos === 'RB';
            case 'WR': return pos === 'WR';
            case 'TE': return pos === 'TE';
            case 'FLEX': return ['RB', 'WR', 'TE'].includes(pos);
            case 'SFLEX': return ['QB', 'RB', 'WR', 'TE'].includes(pos);
            case 'K': return pos === 'K';
            case 'DEF': return pos === 'DEF';
            default: return false;
        }
    }

    export const initiateSwap = function(playerId) {
        if (State.swapSourceId === null) { State.swapSourceId = playerId; } 
        else if (State.swapSourceId === playerId) { State.swapSourceId = null; } 
        else {
            let starters = State.manualStartersMap[State.activeLeagueId] || [];
            let bench = State.manualBenchMap[State.activeLeagueId] || [];
            let p1StarterIdx = starters.findIndex(s => s.player && s.player.id === State.swapSourceId);
            let p1BenchIdx = bench.findIndex(p => p.id === State.swapSourceId);
            let p2StarterIdx = starters.findIndex(s => s.player && s.player.id === playerId);
            let p2BenchIdx = bench.findIndex(p => p.id === playerId);

            let p1Obj = (p1StarterIdx !== -1) ? starters[p1StarterIdx].player : bench[p1BenchIdx];
            let p2Obj = (p2StarterIdx !== -1) ? starters[p2StarterIdx].player : bench[p2BenchIdx];

            // Reject the swap up front if either player would land in a starter slot their
            // position doesn't fit (e.g. a bench DEF swapped into a QB slot). Bench slots have
            // no position identity of their own, so a player moving TO the bench never fails
            // this check -- only a move INTO a starter slot is constrained.
            let p1TargetSlotType = p2StarterIdx !== -1 ? starters[p2StarterIdx].slot.replace(/[0-9]/g, '') : null;
            let p2TargetSlotType = p1StarterIdx !== -1 ? starters[p1StarterIdx].slot.replace(/[0-9]/g, '') : null;
            let p1Fits = !p1TargetSlotType || slotAcceptsPos(p1TargetSlotType, p1Obj.pos);
            let p2Fits = !p2TargetSlotType || slotAcceptsPos(p2TargetSlotType, p2Obj.pos);

            if (!p1Fits || !p2Fits) {
                if (typeof window.showToast === 'function') {
                    window.showToast(`Can't swap ${p1Obj.name} (${p1Obj.pos}) with ${p2Obj.name} (${p2Obj.pos}); that position doesn't fit that slot.`, { isError: true });
                }
                State.swapSourceId = null;
                renderLineupUI();
                return;
            }

            pushLineupUndoSnapshot(State.activeLeagueId);

            if (p1StarterIdx !== -1 && p2StarterIdx !== -1) { starters[p1StarterIdx].player = p2Obj; starters[p2StarterIdx].player = p1Obj; } 
            else if (p1StarterIdx !== -1 && p2BenchIdx !== -1) { starters[p1StarterIdx].player = p2Obj; bench[p2BenchIdx] = p1Obj; }
            else if (p1BenchIdx !== -1 && p2StarterIdx !== -1) { starters[p2StarterIdx].player = p1Obj; bench[p1BenchIdx] = p2Obj; }
            else if (p1BenchIdx !== -1 && p2BenchIdx !== -1) { bench[p1BenchIdx] = p2Obj; bench[p2BenchIdx] = p1Obj; }

            State.manualStartersMap[State.activeLeagueId] = starters;
            State.manualBenchMap[State.activeLeagueId] = bench;
            localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
            localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));

            // Keep this swap "sticky" across the next sync. optimizeLineup's full recompute
            // (forced on every Sleeper sync) only protects locked players -- without this, a
            // manual swap into (or within) the starting lineup would silently get reverted
            // back to whatever the rankings alone would have picked. Whoever ends up starting
            // gets locked; whoever ends up on the bench gets unlocked, in case they carried a
            // lock over from before this swap (otherwise their old lock would just force them
            // straight back into a starting slot on the next recompute, undoing the swap).
            let newStarterIds = new Set(starters.filter(s => s.player).map(s => s.player.id));
            [p1Obj, p2Obj].forEach(p => {
                if (p) setPlayerLockState(p.id, newStarterIds.has(p.id));
            });

            State.swapSourceId = null;
        }
        renderLineupUI();
    };

    // FLEX kickoff optimization: given the starters array that fillSlot()/the SFLEX loop above
    // already produced (i.e. WHO starts is fully decided), reorders which specific players sit
    // in strict RB/WR/TE slots vs the true FLEX slot(s), so that FLEX is always occupied by the
    // latest-kickoff player(s) among that week's flex-eligible starters. This maximizes
    // late-swap flexibility: the slot with the most schedule flexibility (FLEX, in most
    // platforms' swap UIs) ends up genuinely being the one you can wait longest to lock in.
    //
    // This never changes the SET of starting players, never touches QB/K/DEF/SFLEX, and never
    // puts a player in a slot whose position they don't match (a WR can never occupy an "RB"
    // labeled slot) -- it only decides, among players who are already flex-eligible (RB/WR/TE)
    // and already starting, which of them gets which slot label.
    //
    // How it works: for each position (RB/WR/TE), sort that position's starters by kickoff time
    // ascending. Whichever `count` of them is needed to fill that position's strict slots (e.g.
    // 2 RB slots) are exactly the `count` earliest-kickoff players at that position -- anyone
    // left over (because they were already flex-allocated by rank) is "surplus" and gets
    // reassigned into a FLEX-labeled slot instead, in kickoff order. If kickoff data isn't
    // available for a player, they sort last (Infinity) so we never assume a game is early
    // without evidence -- and if kickoff data isn't available at all, the sort is a no-op and
    // slot assignments are left exactly as fillSlot() originally produced them.
    function optimizeFlexKickoffOrder(starters) {
        const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
        const byPos = { RB: [], WR: [], TE: [] };
        const strictSlotCount = { RB: 0, WR: 0, TE: 0 };

        starters.forEach((s, idx) => {
            const slotType = s.slot.replace(/[0-9]/g, '');
            // Locked players (manually locked, or auto-locked because their game already
            // kicked off -- see optimizeLineup) are pinned exactly where fillSlot put them.
            // Their slot doesn't count toward strictSlotCount either, since it's not available
            // for the unpinned pool below to be reassigned into.
            if (s.player && s.player.isLocked) return;
            if (FLEX_POSITIONS.includes(slotType)) strictSlotCount[slotType]++;
            if (!s.player) return;
            if (slotType !== 'FLEX' && !FLEX_POSITIONS.includes(slotType)) return;
            if (!FLEX_POSITIONS.includes(s.player.pos)) return; // safety guard against malformed data
            byPos[s.player.pos].push(idx);
        });

        const getKickoffMs = (idx) => {
            const p = starters[idx].player;
            const iso = p && p.team ? State.gameTimesByTeam[p.team] : null;
            const ms = iso ? new Date(iso).getTime() : NaN;
            return isNaN(ms) ? Infinity : ms;
        };

        FLEX_POSITIONS.forEach(pos => {
            byPos[pos].sort((a, b) => getKickoffMs(a) - getKickoffMs(b));
        });

        const strictAssignees = {};
        let flexAssignees = [];
        FLEX_POSITIONS.forEach(pos => {
            const indices = byPos[pos];
            strictAssignees[pos] = indices.slice(0, strictSlotCount[pos]).map(i => starters[i].player);
            flexAssignees.push(...indices.slice(strictSlotCount[pos]).map(i => starters[i].player));
        });
        // Earliest kickoff first, so multiple FLEX slots read chronologically top-to-bottom,
        // the same way the strict RB/WR/TE slots above them do. (This used to sort latest-
        // first, which put e.g. the MNF player in FLEX1 above the SNF player in FLEX2 and read
        // as reversed.) Which FLEX slot a player lands in doesn't affect late-swap flexibility
        // -- every FLEX slot accepts the same positions -- so this is purely display order.
        // Unknown kickoff sorts last, matching byPos above.
        flexAssignees.sort((a, b) => {
            const aMs = a.team && State.gameTimesByTeam[a.team] ? new Date(State.gameTimesByTeam[a.team]).getTime() : NaN;
            const bMs = b.team && State.gameTimesByTeam[b.team] ? new Date(State.gameTimesByTeam[b.team]).getTime() : NaN;
            return (isNaN(aMs) ? Infinity : aMs) - (isNaN(bMs) ? Infinity : bMs) || 0;
        });

        const cursors = { RB: 0, WR: 0, TE: 0, FLEX: 0 };
        starters.forEach(s => {
            if (!s.player) return;
            if (s.player.isLocked) return; // pinned above -- leave exactly as fillSlot placed them
            const slotType = s.slot.replace(/[0-9]/g, '');
            if (FLEX_POSITIONS.includes(slotType)) {
                const newPlayer = strictAssignees[slotType][cursors[slotType]++];
                if (newPlayer) s.player = newPlayer;
            } else if (slotType === 'FLEX') {
                const newPlayer = flexAssignees[cursors.FLEX++];
                if (newPlayer) s.player = newPlayer;
            }
        });
    }

    // opts.batch marks a call made as one iteration of a multi-league run (optimizeAllLineups).
    // In batch mode this function computes and stores the lineup in State exactly as normal,
    // but performs neither of its two localStorage writes nor its render -- the batch caller
    // writes once and renders once after the whole loop. Each of those writes serializes the
    // ENTIRE per-league map (every league's starters, every league's bench), so doing them
    // per-iteration meant N leagues cost N full serializations of all N leagues' lineups, and
    // N full renders to display only the last one.
    export const optimizeLineup = function(forceReset = true, isManualAction = false, opts = {}) {
        const batch = !!opts.batch;
        let league = getActiveLeague();
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');

        if (!league || !league.roster || league.roster.length === 0) {
            // A batch iteration must not paint this empty state: State.activeLeagueId is
            // pointing at some other league mid-loop, so an empty-rostered league partway
            // through the batch would stamp "Welcome to the Lineup Optimizer" over whatever
            // the Lineup tab was legitimately showing for the league the person is actually
            // on. Nothing to compute for this league either way, so just leave.
            if (batch) return;
            if (container) {
                container.innerHTML = `
                <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                    <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to the Lineup Optimizer</div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 1. Sync your Sleeper League (Dashboard)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 2. Upload Weekly Rankings (Above)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 3. Click 'Optimize Lineup'</div>
                    </div>
                </div>`;
            }
            if (benchContainer) benchContainer.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 1rem; font-size:0.9rem; font-style:italic;">No bench data yet.</div>`; 
            return;
        }

        // A saved lineup is only re-shown as-is if it was built from the rankings this league
        // uses now. Otherwise (a set was just assigned to this league from another league's
        // upload, the set was re-uploaded, or the lineup predates stamps) it's recomputed, the
        // same full recompute a sync does: locks and manual swaps (which lock) carry over.
        const rankingsStamp = getLeagueRankingsStamp(league);
        const savedLineupCurrent = State.lineupRankingsStamps[State.activeLeagueId] === rankingsStamp;
        if (!forceReset && savedLineupCurrent && State.manualStartersMap[State.activeLeagueId] && State.manualBenchMap[State.activeLeagueId]) {
            renderLineupUI(); 
            return;
        }

        // Only the literal "Optimize Lineup" button click gets its own undo checkpoint here.
        // unlockAllPlayers/overrideAutoLock also trigger a forceReset recompute, but they push
        // their own snapshot before their own mutation, so their whole compound action undoes
        // in one step -- pushing here too would double up and only undo half of it. Sync-
        // triggered recomputes (processSleeperData's unconditional optimizeLineup(true)) are
        // deliberately excluded from undo entirely: the roster/player pool itself just changed,
        // so restoring an older lineup snapshot could silently reintroduce a player who was
        // just dropped -- that's a correctness risk undo shouldn't create.
        if (isManualAction && forceReset && State.manualStartersMap[State.activeLeagueId]) {
            pushLineupUndoSnapshot(State.activeLeagueId);
        }

        let activeDataSet = State.weeklyRankings.length > 0 ? State.weeklyRankings : State.rosRankings;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };

        // Auto-lock: once a player's game has kicked off, their roster spot is frozen in real
        // life whether or not the person ever touches this tool again this week -- re-running
        // the optimizer (say, after a late rankings update) shouldn't be able to bench them or
        // have optimizeFlexKickoffOrder shuffle their slot. This never overrides a starter's
        // status *before* kickoff -- it only pins players who (a) have already kicked off AND
        // (b) were already established as a starter, checked against two sources: Sleeper's own
        // last-synced starting lineup (the ground truth for what actually happened in real
        // life, and the only signal available the very first time this is run in a given week)
        // and this app's own previous optimizer output (a fallback for when Sleeper starter
        // data is missing entirely -- see isSleeperStarter below for exactly when each source
        // applies). A bench player whose game has already passed is NOT auto-locked --
        // they were never started, so there's nothing to preserve.
        let sleeperStarterIds = getValidSleeperStarterIds(league);
        let prevStarters = State.manualStartersMap[State.activeLeagueId] || [];
        let prevStartingIds = new Set(prevStarters.filter(s => s.player).map(s => s.player.id));

        // Sleeper's synced starting lineup is the ground truth for "did this player actually
        // start in real life." prevStartingIds (this app's own prior pick) only steps in when
        // we have no Sleeper starter data at all -- it must NOT be OR'd in alongside real
        // Sleeper data, or a player this app recommended starting (but who Sleeper shows on
        // the bench) gets wrongly auto-locked into the lineup the moment their game kicks off.
        let isSleeperStarter = p => sleeperStarterIds.length > 0
            ? sleeperStarterIds.includes(p.id)
            : prevStartingIds.has(p.id);

        // Indexed once per run rather than scanned per roster player. Matters most under
        // Optimize All, which runs this whole function once per league.
        const rankIdx = rankingIndex(activeDataSet);
        // locks is a small array (manually locked players in this league), but it's checked
        // once per roster player, so a Set costs nothing and keeps the loop body uniform.
        const lockSet = new Set(locks);

        let scoredRoster = league.roster.map(p => {
            let rObj = rankIdx.get(p.cleanName);
            let manualLocked = lockSet.has(p.id);
            let overridden = isAutoLockOverridden(State.activeLeagueId, p.id);
            let autoLocked = !manualLocked && !overridden && hasKickedOff(p) && isSleeperStarter(p);
            return { ...p, posRank: rObj ? rObj.posRank : 999, flexRank: rObj ? rObj.flexRank : 999, posTier: rObj ? rObj.posTier : null, flexTier: rObj ? rObj.flexTier : null, isLocked: manualLocked || autoLocked, autoLocked };
        });

        // Sleeper projections for the FLEX fallback in compareFlexCandidates. Kept in a local
        // Map rather than spread onto each player object, because those objects are what gets
        // saved as the lineup -- a projection baked in there would go stale while the saved
        // lineup lives on.
        const projectionsReady = lineupProjectionsLoaded();
        const projById = new Map();
        if (projectionsReady) scoredRoster.forEach(p => projById.set(p.id, getLineupProjection(p.id, league)));
        if (projectionsReady) State.projectionlessLineups.delete(State.activeLeagueId);
        else State.projectionlessLineups.add(State.activeLeagueId);

        // Head-to-head for a FLEX-type slot (RB/WR/TE competing across positions). Tiers, in order:
        //   1. Both have a FLEX rank -> lower FLEX rank wins. Your rankings always come first.
        //   2. Only one has a FLEX rank -> that one wins.
        //   3. Neither has a FLEX rank -> higher Sleeper projection wins. Position ranks aren't
        //      comparable across positions (TE24 isn't better than WR45, it's just a shallower
        //      list), which is what used to push low-end TEs over depth RB/WRs here.
        //   4. Projection missing for one or both (not loaded yet, or Sleeper doesn't project
        //      him) -> a projected player beats an unprojected one; otherwise posRank as before.
        // Each tier is a strict ordering, so the comparator stays consistent (transitive).
        const compareFlexCandidates = (a, b) => {
            if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
            if (a.flexRank !== 999 && b.flexRank === 999) return -1;
            if (a.flexRank === 999 && b.flexRank !== 999) return 1;
            const aProj = projById.has(a.id) ? projById.get(a.id) : null;
            const bProj = projById.has(b.id) ? projById.get(b.id) : null;
            if (aProj !== null && bProj !== null && aProj !== bProj) return bProj - aProj;
            if (aProj !== null && bProj === null) return -1;
            if (aProj === null && bProj !== null) return 1;
            return a.posRank - b.posRank;
        };

        // Taxi-squad players are held out of the starter pool entirely rather than merely
        // deprioritized the way isUnavailableThisWeek handles byes and hard-out statuses.
        // That mechanism has a deliberate last-resort fallback that will start an unavailable
        // player rather than leave a slot empty -- correct for an Out RB (you get his zero
        // either way), wrong for a taxi player, whom the platform will not let you start at
        // all. A healthy, well-ranked rookie sitting on taxi is exactly the case that fallback
        // would otherwise promote into the lineup. They rejoin the bench pool after slotting.
        let taxiPlayers = scoredRoster.filter(p => p.isTaxi);
        let pool = scoredRoster.filter(p => !p.isTaxi);
        let starters = [];

        // Finds the best index in `pool` matching `matchFn`, using `compareFn` to rank
        // candidates against each other (same contract as Array.prototype.sort's comparator:
        // negative means `a` ranks ahead of `b`). Prefers players who are actually available
        // this week per isUnavailableThisWeek(); only falls back to an unavailable player if
        // NO eligible one exists at all, so a slot is never silently left empty just because
        // the best-ranked option happens to be on bye.
        const findBestStarterIndex = (matchFn, compareFn) => {
            let bestIdx = -1;
            pool.forEach((p, idx) => {
                if (!matchFn(p) || isUnavailableThisWeek(p)) return;
                if (bestIdx === -1 || compareFn(p, pool[bestIdx]) < 0) bestIdx = idx;
            });
            if (bestIdx !== -1) return bestIdx;

            // Fallback pass: nobody eligible is available at this position. Allow a bye/hard-out
            // player rather than leaving the slot empty -- they'll show up with a clear BYE or
            // injury badge in the UI instead of just vanishing from the lineup.
            pool.forEach((p, idx) => {
                if (!matchFn(p)) return;
                if (bestIdx === -1 || compareFn(p, pool[bestIdx]) < 0) bestIdx = idx;
            });
            return bestIdx;
        };

        const fillSlot = (slotLabel, posFilter, useFlexRank) => {
            let lockedIndex = pool.findIndex(p => p.isLocked && posFilter(p.pos));
            if (lockedIndex !== -1) { starters.push({ slot: slotLabel, player: pool.splice(lockedIndex, 1)[0], usedFlex: useFlexRank }); return; }

            const compareFn = useFlexRank ? compareFlexCandidates : (a, b) => a.posRank - b.posRank;

            let bestIndex = findBestStarterIndex(p => posFilter(p.pos), compareFn);
            if (bestIndex !== -1) starters.push({ slot: slotLabel, player: pool.splice(bestIndex, 1)[0], usedFlex: useFlexRank });
            else starters.push({ slot: slotLabel, player: null, usedFlex: useFlexRank });
        };

        for (let i = 0; i < (reqs.QB || 0); i++) fillSlot(`QB${i+1}`, pos => pos === 'QB', false);
        for (let i = 0; i < (reqs.RB || 0); i++) fillSlot(`RB${i+1}`, pos => pos === 'RB', false);
        for (let i = 0; i < (reqs.WR || 0); i++) fillSlot(`WR${i+1}`, pos => pos === 'WR', false);
        for (let i = 0; i < (reqs.TE || 0); i++) fillSlot(`TE${i+1}`, pos => pos === 'TE', false);
        for (let i = 0; i < (reqs.FLEX || 0); i++) fillSlot(`FLEX${i+1}`, pos => ['RB', 'WR', 'TE'].includes(pos), true);
        
        for (let i = 0; i < reqs.SFLEX; i++) {
            let slotLabel = `SFLEX${i+1}`;
            let lockedIndex = pool.findIndex(p => p.isLocked && ['QB', 'RB', 'WR', 'TE'].includes(p.pos));
            if (lockedIndex !== -1) {
                let lockedPlayer = pool.splice(lockedIndex, 1)[0];
                // Read pos off the player we just removed, not off pool[lockedIndex] -- after
                // splice() that index now holds a different (or no) element, since everything
                // after the removed slot shifts down by one.
                starters.push({ slot: slotLabel, player: lockedPlayer, usedFlex: lockedPlayer.pos !== 'QB' });
                continue;
            }

            let bestQBIdx = findBestStarterIndex(p => p.pos === 'QB' && p.posRank !== 999, (a, b) => a.posRank - b.posRank);
            if (bestQBIdx !== -1) {
                starters.push({ slot: slotLabel, player: pool.splice(bestQBIdx, 1)[0], usedFlex: false });
            } else {
                let bestFlexIdx = findBestStarterIndex(p => ['RB', 'WR', 'TE'].includes(p.pos) && p.flexRank !== 999, (a, b) => a.flexRank - b.flexRank);
                if (bestFlexIdx !== -1) {
                    starters.push({ slot: slotLabel, player: pool.splice(bestFlexIdx, 1)[0], usedFlex: true });
                } else {
                    // No one left has a FLEX rank, so compareFlexCandidates falls through to its
                    // projection tier -- same cross-position reasoning as the FLEX slots.
                    let bestPosIdx = findBestStarterIndex(p => ['RB', 'WR', 'TE'].includes(p.pos) && p.posRank !== 999, compareFlexCandidates);
                    if (bestPosIdx !== -1) starters.push({ slot: slotLabel, player: pool.splice(bestPosIdx, 1)[0], usedFlex: false });
                    else starters.push({ slot: slotLabel, player: null, usedFlex: false });
                }
            }
        }
        for (let i = 0; i < (reqs.K || 0); i++) fillSlot(`K${i+1}`, pos => pos === 'K', false);
        for (let i = 0; i < (reqs.DEF || 0); i++) fillSlot(`DEF${i+1}`, pos => pos === 'DEF', false);

        const benchOrder = (a, b) => {
            if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
            if (a.flexRank !== 999 && b.flexRank === 999) return -1;
            if (a.flexRank === 999 && b.flexRank !== 999) return 1;
            return a.posRank - b.posRank;
        };
        pool.sort(benchOrder);

        // Taxi players land beneath the entire real bench regardless of how well they're
        // ranked -- "Bench Priorities" is a list of who you'd turn to this week, and a taxi
        // player isn't an option at any rank. Sorted among themselves by the same comparator
        // so the group still reads best-to-worst internally. Appended after the sort rather
        // than folded into the comparator so this ordering can't be undone by a future change
        // to how the bench itself is ranked.
        taxiPlayers.sort(benchOrder);
        pool.push(...taxiPlayers);

        // Reassign which specific players occupy strict RB/WR/TE slots vs the FLEX slot(s),
        // purely by kickoff time -- who actually starts is already decided above by rank; this
        // only relabels slots so FLEX holds the latest games. See optimizeFlexKickoffOrder for
        // why this is safe (it never changes the set of starters, only slot labels). Gated by
        // the user-facing toggle (State.lineupSettings.flexKickoffOptimization, default on) --
        // when off, slots are left exactly as fillSlot()/the SFLEX loop above assigned them.
        if (State.lineupSettings.flexKickoffOptimization) {
            optimizeFlexKickoffOrder(starters);
        }

        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = pool;
        // Written even in batch mode: it's one short string per league, not the full lineup
        // maps the batch caller defers.
        State.lineupRankingsStamps[State.activeLeagueId] = rankingsStamp;
        localStorage.setItem('mls_lineup_rankings_stamps', JSON.stringify(State.lineupRankingsStamps));

        // Batch runs defer both writes to the caller -- see the note on this function's
        // signature. State above is updated either way, so a batch that somehow failed to
        // flush would lose the run, not corrupt it.
        if (!batch) {
            localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
            localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
        }

        if (isManualAction) {
            let hasOptimizedBefore = localStorage.getItem('mls_has_optimized');
            if (!hasOptimizedBefore) {
                if (typeof window.showToast === 'function') {
                    window.showToast("🎉 Lineup Optimized! You've successfully completed the setup flow.", { duration: 6000 });
                }
                localStorage.setItem('mls_has_optimized', 'true');
            } else {
                if (typeof window.showToast === 'function') window.showToast("Optimal lineup set");
            }
        }

        // A batch iteration renders nothing: State.activeLeagueId is pointing at a league the
        // person isn't looking at, and the next iteration is about to move it again. The batch
        // caller restores the real active league and renders once at the end.
        if (!batch) renderLineupUI();
    };

    export const renderSyncLogs = function() {
        const accordion = document.getElementById('syncLogAccordion');
        const content = document.getElementById('syncLogContent');
        const summary = document.getElementById('syncLogSummary');
        
        if (!accordion || !content || !summary) return;

        if (!State.syncLogs || State.syncLogs.length === 0) {
            accordion.style.display = 'none';
            return;
        }

        accordion.style.display = 'block';
        let totalChanges = 0;
        let html = "";

        State.syncLogs.forEach(log => {
            let changes = [];
            if (log.added.length) changes.push(`<span style="color: #86efac; font-weight: 500;">+ ${log.added.map(escapeHtml).join(', ')}</span>`);
            if (log.dropped.length) changes.push(`<span style="color: #9ca3af; text-decoration: line-through;">- ${log.dropped.map(escapeHtml).join(', ')}</span>`);
            if (log.newlyOut.length) changes.push(`<span style="color: #fca5a5;">Out: ${log.newlyOut.map(escapeHtml).join(', ')}</span>`);
            
            if (changes.length > 0) {
                totalChanges += (log.added.length + log.dropped.length + log.newlyOut.length);
                html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.6rem 0.8rem; border-radius: 6px; border-left: 2px solid #60a5fa;">
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-bottom: 0.3rem;">${escapeHtml(log.leagueName)}</div>
                    <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem;">
                        ${changes.join('')}
                    </div>
                </div>`;
            }
        });

        if (totalChanges === 0) {
            html = `<div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No roster changes detected in the last sync.</div>`;
            summary.innerText = `Recent Sync Logs (No Changes)`;
        } else {
            summary.innerText = `Recent Sync Logs (${totalChanges} Change${totalChanges === 1 ? '' : 's'})`;
        }

        content.innerHTML = html;
    };

    export const optimizeAllLineups = function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        const origText = btn.innerHTML;
        btn.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Optimizing All…`;
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures the UI button state updates before locking the main thread
        setTimeout(() => {
            const originalActiveId = State.activeLeagueId;
            let failed = false;
            // The league the loop is working on. The loop stops at the first league that throws,
            // so if it's still set when the catch runs, the failure toast can name it -- every
            // league after it in the list was never reached. Cleared once the loop completes, so
            // a failure in the flush or the restore below isn't blamed on the last league.
            let workingOn = null;

            // Suppress the per-league toast optimizeLineup fires; one summary goes out below.
            if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(true);

            try {
                State.leagues.forEach(l => {
                    let isBestBall = isBestBallLeague(l);
                    if (isBestBall) return; // Skip optimizing Best Ball leagues

                    workingOn = l;
                    State.activeLeagueId = l.leagueId;

                    // Hydrate this league's own rankings so the optimizer uses the correct set
                    hydrateRankingsForLeague(l);

                    window.optimizeLineup(true, false, { batch: true });
                });
                workingOn = null;

                // Single flush for the whole run. Each optimizeLineup call above deliberately
                // skipped these two writes (see its `batch` option): they serialize the entire
                // per-league map every time, so leaving them in the loop meant N leagues paid for
                // N serializations of all N leagues' lineups rather than one.
                localStorage.setItem('mds_season_manual_starters', JSON.stringify(State.manualStartersMap));
                localStorage.setItem('mds_season_manual_bench', JSON.stringify(State.manualBenchMap));
            } catch (err) {
                // A bad ranking set, or a quota-exceeded write on the flush above, used to throw
                // straight out of this timeout: toasts stayed stubbed for the rest of the session
                // and the button sat disabled reading "Optimizing All..." with no way back.
                console.error("Optimize All Error:", err);
                failed = true;
            } finally {
                // However the run ended, the app has to come back usable: toasts on, the user's
                // real league re-selected, the button clickable.
                if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(false);

                // switchActiveLeague re-hydrates the real active league's rankings (the loop
                // above left State.rosRankings/weeklyRankings pointing at whichever league it
                // stopped on) and calls optimizeLineup(false), which is the single render for
                // the entire batch. It must run even after a failure, or the app is left
                // displaying another league's data under the active league's header.
                try {
                    switchActiveLeague(originalActiveId);
                } catch (err) {
                    console.error("Optimize All: failed to restore the active league", err);
                    failed = true;
                }

                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }

            if (failed) {
                // showToast renders plain text, so the (Sleeper-set) league name needs no escaping.
                const msg = workingOn
                    ? `Stopped at "${workingOn.name || 'Unnamed league'}", so leagues after it weren't re-optimized. Try Optimize All again.`
                    : "Lineups were optimized, but saving them or restoring your league didn't finish. Try Optimize All again.";
                if (window.showToast) window.showToast(msg, { isError: true });
            } else {
                let managedLeaguesCount = State.leagues.filter(l => !isBestBallLeague(l)).length;
                if (window.showToast) window.showToast(`Successfully optimized ${managedLeaguesCount} lineups!`);
            }
        }, 50);
    };

export const syncAllLeagues = async function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        
        // Filter out manual leagues — only sync Sleeper connections
        const sleeperLeagues = State.leagues.filter(l => l.leagueId && !l.leagueId.startsWith('manual_') && l.username && l.username !== "Manual");
        
        if (sleeperLeagues.length === 0) {
            if (window.showToast) window.showToast("No Sleeper-synced leagues to refresh.", { isError: true });
            return;
        }

        const origText = btn.innerHTML;
        btn.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing All…`;
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures UI button state updates before locking the main thread
        setTimeout(async () => {
            // processSleeperData makes each league active in turn (it's shared with the
            // single-league sync, where that's the point), so without this the loop ended on
            // whichever league synced last: the header still named yours, but the Lineup and
            // Roster tabs showed the last league's roster scored with your league's rankings,
            // and the app reopened on that league next visit. Put back in the finally below,
            // the same way optimizeAllLineups restores it.
            const originalActiveId = State.activeLeagueId;
            try {
                // Preload the heavy player map ONCE to save massive API bandwidth
                const playerMap = await getSleeperPlayerMap();
                const preloaded = { playerMap }; 

                let successCount = 0;
                // processSleeperData returns false when a league couldn't be reached, and the
                // suppressErrorToast=true we pass below means that failure makes no noise of
                // its own. Counting only the successes and reporting "Successfully synced 5
                // leagues!" said nothing about the three now sitting on stale rosters -- you'd
                // go set lineups off them. Track the misses and name them, the way
                // importAllSleeperLeagues already does.
                let failedLeagueNames = [];
                let newLogs = [];

                // Suppress the per-league toasts processSleeperData fires during the loop; one
                // summary goes out below. Turned back off in the finally, not here: the writes
                // after the loop can throw (QuotaExceededError is realistic once someone has
                // eight or more leagues), and restoring only on the happy path used to mean the
                // catch's error toast went to a no-op stub and every toast in the app stayed
                // dead for the rest of the session.
                if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(true);

                for (let i = 0; i < sleeperLeagues.length; i++) {
                    let l = sleeperLeagues[i];
                    // Mirrors importAllSleeperLeagues' per-league progress text below, instead
                    // of a static "Syncing All..." for the whole loop regardless of how many
                    // leagues or how long it takes.
                    btn.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing ${i + 1}/${sleeperLeagues.length}…`;
                    // processSleeperData re-optimizes the league it just synced, and the optimizer
                    // reads whatever rankings are in State -- so load THIS league's first, or every
                    // league gets a lineup built from the originally active league's rankings.
                    hydrateRankingsForLeague(l);
                    // isRefresh = true, suppressErrorToast = true, showChangeSummary = true, skipSave = true
                    let result = await processSleeperData(l.username, l.leagueId, null, true, preloaded, true, true, true);
                    
                    if (result) {
                        successCount++;
                        // If it returned our rosterDiff object with actual changes, log it
                        if (typeof result === 'object' && (result.added.length || result.dropped.length || result.newlyOut.length)) {
                            newLogs.push({
                                leagueName: l.name,
                                added: result.added,
                                dropped: result.dropped,
                                newlyOut: result.newlyOut
                            });
                        }
                    } else {
                        failedLeagueNames.push(l.name || l.leagueId);
                    }
                }

                // Single write after the loop instead of one localStorage.setItem per league. The
                // active league is put back first so the one saved is yours, not the last synced.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) State.activeLeagueId = originalActiveId;
                localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
                localStorage.setItem('mds_season_active_league', State.activeLeagueId);

                // Save logs to state and local storage
                State.syncLogs = newLogs;
                localStorage.setItem('mls_sync_logs', JSON.stringify(State.syncLogs));
                
                // Toast a summary that accounts for every league we tried, not just the ones
                // that worked: a miss here is a roster you'd go on to set a lineup off, so it
                // gets named rather than quietly dropped from the count.
                const failedCount = failedLeagueNames.length;
                let summaryMsg = failedCount > 0
                    ? `Synced ${successCount} of ${sleeperLeagues.length}. Couldn't reach: ${formatNameList(failedLeagueNames)} — try Sync All again.`
                    : `Successfully synced ${successCount} league${successCount === 1 ? '' : 's'}!`;
                if (newLogs.length > 0) {
                    summaryMsg += `\n\nChanges found in ${newLogs.length} league${newLogs.length === 1 ? '' : 's'}. Check the Sync Logs!`;
                }
                // force: toasts are still suppressed here (the finally below is what clears the
                // flag) and this summary is the whole point of having suppressed them.
                // A partial sync is shown as an error so it doesn't read like an all-clear --
                // that also gets it the dismiss button and a longer window, which it needs:
                // there are league names in there the person has to read and act on.
                if (window.showToast) {
                    window.showToast(summaryMsg, {
                        isError: failedCount > 0,
                        force: true,
                        duration: failedCount > 0 ? 9000 : undefined
                    });
                }

                // Re-render the logs accordion
                renderSyncLogs();
                
                // UX: Automatically open the accordion if there were changes so they don't have to hunt for them
                const accordion = document.getElementById('syncLogAccordion');
                if (accordion) accordion.open = newLogs.length > 0;
                
            } catch (err) {
                console.error("Sync All Error:", err);
                // A storage-quota failure on the writes above is the common case and has a
                // specific fix, so name it rather than hiding it behind the generic message.
                const isQuota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
                const msg = isQuota
                    ? "Synced your leagues, but there wasn't enough browser storage to save them. Remove a league you no longer use, then try again."
                    : "An error occurred while syncing leagues.";
                if (window.showToast) window.showToast(msg, { isError: true, force: true });
            } finally {
                if (typeof window.setToastsSuppressed === 'function') window.setToastsSuppressed(false);

                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';

                // Restore your league even if the loop threw partway: switchActiveLeague puts
                // back its id AND its rankings (the loop left State holding the last synced
                // league's), and re-renders the header, league manager and active tab.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) {
                    try { switchActiveLeague(originalActiveId); } catch (e) { console.error('Sync All: could not restore the active league.', e); }
                }

                // Refresh data states natively
                if (typeof renderLeagueManager === 'function') renderLeagueManager();
                if (typeof loadRosterTab === 'function') loadRosterTab();
                if (typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
            }
        }, 50);
    };

    // Note on the renderLeagueManager() call at the tail of this function: it rebuilds a row
    // for EVERY league in the app, which is correct after a single interactive lineup edit (a
    // swap or a lock toggle genuinely changes that league's "matches Sleeper" status), but is
    // pure waste when many lineups are computed in a row. Batch callers (optimizeAllLineups)
    // therefore don't call this function at all per league -- see optimizeLineup's `batch`
    // option -- rather than calling it and suppressing half its work.
    // "Pos: #40 | Flex: #66" badge on each Lineup tab player. The second number depends on
    // which rankings the optimizer ran on (see optimizeLineup's activeDataSet: Weekly when
    // loaded, otherwise ROS):
    //   Weekly -- FLEX rank, RB/WR/TE only. Weekly exports carry a FLEX list.
    //   ROS    -- Overall rank, any position. ROS exports carry Overall + Positional and no
    //             FLEX list; the parser stores Overall in flexRank for those files, so the
    //             number is right but "Flex" was the wrong name for it. Same wording as the
    //             waiver cards ("ROS Overall").
    function lineupRankBadge(p, rankedByRos) {
        const hasPos = p.posRank !== 999;
        const hasCross = p.flexRank !== 999;
        if (!hasPos && !hasCross) return "Unranked";
        const posStr = hasPos ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
        const crossStr = hasCross ? `#${p.flexRank}${tierTag(p.flexTier)}` : "-";
        if (rankedByRos) return hasCross ? `Pos: ${posStr} | Overall: ${crossStr}` : `Pos: ${posStr}`;
        return (['QB', 'K', 'DEF'].includes(p.pos) || !hasCross) ? `Pos: ${posStr}` : `Pos: ${posStr} | Flex: ${crossStr}`;
    }

    export function renderLineupUI() {
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');
        if (!container || !benchContainer) return;

        let league = getActiveLeague();
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let benchPool = State.manualBenchMap[State.activeLeagueId] || [];
        let validSleeperStarters = getValidSleeperStarterIds(league);
        let optimizedStarterIds = starters.filter(s => s.player).map(s => s.player.id);
        // The season-long manual lock list -- used only to distinguish "manually locked" from
        // "auto-locked because the game already started" so the right lock control renders (see
        // lockControl below). Written via setPlayerLockState, by toggleLock (the lock icon) and
        // by initiateSwap (keeping a manual swap sticky across the next full recompute).
        let locksList = State.lockedPlayersMap[State.activeLeagueId] || [];
        // Mirrors optimizeLineup's activeDataSet choice, so the badges name the numbers the
        // lineup was actually built from.
        const rankedByRos = State.weeklyRankings.length === 0 && State.rosRankings.length > 0;

        let html = "";

        ensureHeadshotNameIndex(league && league.roster, renderLineupUI);

        html += getNextLockCountdownHTML(starters);
        html += getLineupInjuryWarningHTML(starters, league);

        if (validSleeperStarters.length > 0) {
            let sleeperSet = new Set(validSleeperStarters);
            let optSet = new Set(optimizedStarterIds);
            let isMatch = sleeperSet.size === optSet.size && [...sleeperSet].every(id => optSet.has(id));
            
            if (isMatch) {
                html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: var(--primary-green); display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Matches your active Sleeper lineup</div>`;
            } else {
                html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b; display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Action Required: Differs from Sleeper lineup</div>`;
            }
        }

        // Only shown when there's actually something to clear -- avoids a dead/no-op button
        // taking up space on the common case where nobody has manually locked anyone.
        if (locksList.length > 0) {
            html += `<div class="mb-3 text-center"><button class="mls-btn-sm btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="unlockAllPlayers()" title="Clears season-long manual locks in this league only - does not affect players auto-locked because their game already started">Unlock All (${locksList.length})</button></div>`;
        }

        // While a swap is pending, the source player's row gets an amber highlight (see
        // lockClass below) but nothing else on screen says what to actually do next --
        // this spells it out instead of leaving it to be inferred from one highlighted row.
        if (State.swapSourceId) {
            let swapSourcePlayer = (starters.find(s => s.player && s.player.id === State.swapSourceId) || {}).player
                || benchPool.find(p => p.id === State.swapSourceId);
            let swapSourceName = swapSourcePlayer ? swapSourcePlayer.name : 'this player';
            html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b;">Tap another player's ⇄ to swap with ${escapeHtml(swapSourceName)}, or tap Cancel to stop.</div>`;
        }

        starters.forEach(s => {
            let slotType = s.slot.replace(/[0-9]/g, '');

            if (s.player) {
                let p = s.player;
                let lockIcon = p.isLocked 
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--primary-green);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` 
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--text-muted); opacity: 0.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
                let lockClass = p.isLocked ? "locked" : "";
                if (State.swapSourceId === p.id) lockClass += " swapping";

                // Auto-locked (game already started -- see hasKickedOff/optimizeLineup) gets a
                // distinct control instead of the normal toggle button: clicking the normal
                // button would call toggleLock(), which -- since this player was never added to
                // the season-long lock list -- would actually CREATE a manual lock rather than
                // clear anything, the opposite of what tapping a "locked" icon implies. Instead
                // this calls overrideAutoLock(), the failsafe for when the underlying kickoff/
                // Sleeper data turns out to be wrong about this specific player.
                // Computed once so the control and the text badge below can never disagree --
                // a player can carry a stale autoLocked flag after the keep-swaps-sticky path
                // adds them to locksList, and in that case both should treat it as a manual lock.
                let isAutoLock = p.autoLocked && !locksList.includes(p.id);
                let lockControl = isAutoLock
                    ? `<button class="mls-btn-sm" title="Game in progress - tap to override if this is wrong" aria-label="${escapeHtml(p.name)}'s game has started. Override lock" style="background:none; border:none; cursor:pointer; padding:0 4px; display:inline-flex;" onclick="overrideAutoLock('${p.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: #60a5fa;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>`
                    : `<button class="mls-btn-sm lock-btn" style="background:none; cursor:pointer; padding:0 4px;" onclick="toggleLock('${p.id}')" aria-label="Lock ${escapeHtml(p.name)}" aria-pressed="${p.isLocked ? 'true' : 'false'}">${lockIcon}</button>`;

                let rankBadge = lineupRankBadge(p, rankedByRos);

                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
                let kickoffBadge = getGameInfoHTML(p.team);

                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && !validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b; font-size: 0.65rem; margin-left: 4px;">Bench in Sleeper</span>`;
                }
                // Text version of the padlock's state. Without it, manual vs auto lock differ
                // only by icon tint (green vs blue) plus a title= tooltip that never shows on a
                // phone. Worded AUTO-LOCKED rather than naming the reason, because the kickoff
                // badge on this same row already says "Started"/"Final" -- this adds the part
                // that badge can't say (a started bench player shows "Started" too).
                let lockBadge = !p.isLocked ? ""
                    : isAutoLock ? `<span class="badge mls-autolock-badge">AUTO-LOCKED</span>`
                    : `<span class="badge mls-lock-badge">LOCKED</span>`;
                let badgesRow = [lockBadge, injBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');

                // The slot badge below already spells out the position for strict slots (RB1
                // always holds an RB, etc), so a second colored position pill there is pure
                // duplication. It's only ambiguous for FLEX/SFLEX (could be RB/WR/TE) -- so the
                // player's real position gets shown as plain text, and only in those cases.
                // Now shown on every row regardless of slot type (previously only FLEX/SFLEX/
                // bench, where the slot badge alone doesn't reveal it) -- for consistency, per
                // Benton, and so every row's meta line starts with the same kind of element
                // instead of some starting with plain text and others starting with the team badge.
                let plainPos = `<span class="mls-plain-pos pos-text-${escapeHtml(String(p.pos).toLowerCase())}">${escapeHtml(p.pos)}</span>`;

                html += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotType}">${slotType}</span>
                        ${playerHeadshotHTML(p)}
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${escapeHtml(p.team)}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        ${getPlayerPointsHTML(p)}
                        <button class="mls-btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')" aria-label="${State.swapSourceId === p.id ? `Cancel swap of ${escapeHtml(p.name)}` : `Swap ${escapeHtml(p.name)}`}">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                        ${lockControl}
                    </div>
                </div>`;
            } else {
                html += `
                <div class="lineup-slot empty">
                    <span class="slot-badge slot-${slotType}">${slotType}</span>
                    <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                </div>`;
            }
        });
        renderHTMLInto(container, html);

        let benchHTML = "";
        if (benchPool.length > 0) {
            benchContainer.classList.remove('bench-empty-state');
            // optimizeLineup guarantees every taxi player sits at the tail of benchPool, so the
            // divider only ever needs to be emitted once, at the first one encountered. Driven
            // off the data rather than a precomputed count so a bench with no taxi players
            // renders byte-for-byte as it did before this existed.
            let taxiDividerShown = false;
            benchPool.forEach(p => {
                if (p.isTaxi && !taxiDividerShown) {
                    taxiDividerShown = true;
                    benchHTML += `<div class="bench-taxi-divider"><span>Taxi Squad</span></div>`;
                }
                let lockClass = State.swapSourceId === p.id ? "swapping" : "";
                let rankBadge = lineupRankBadge(p, rankedByRos);

                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                let byeStr = TEAM_BYES[p.team] ? ` (${TEAM_BYES[p.team]})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
                let kickoffBadge = getGameInfoHTML(p.team);
                // Kept even though the divider above already labels the group: the divider
                // scrolls off, and these rows get screenshotted and pasted into league chats.
                let taxiBadge = p.isTaxi ? `<span class="badge taxi-badge">TAXI</span>` : "";

                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; font-size: 0.65rem; margin-left: 4px;">Starting in Sleeper</span>`;
                }
                let badgesRow = [injBadge, taxiBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');
                // Bench ("BN") never reveals real position the way a strict slot badge does, so
                // always show it as plain text here -- same reasoning as the starters block above.
                let plainPos = `<span class="mls-plain-pos pos-text-${escapeHtml(String(p.pos).toLowerCase())}">${escapeHtml(p.pos)}</span>`;

                // "TX" rather than "BN" in the slot column, so the distinction survives even
                // where the badges row is dense -- same fixed 46px slot badge, no layout shift.
                const slotCode = p.isTaxi ? 'TX' : 'BN';

                // No swap control on a taxi row. The whole point of the flag is that this
                // player can't be started, so offering the button would be an invitation to
                // build a lineup Sleeper will reject -- and since swapping is the only way a
                // bench player reaches the starters here, withholding it is also what actually
                // enforces the exclusion in the UI, not just in the optimizer's own slotting.
                const rowActions = p.isTaxi
                    ? getPlayerPointsHTML(p)
                    : `${getPlayerPointsHTML(p)}
                        <button class="mls-btn-sm btn-secondary swap-btn" onclick="initiateSwap('${p.id}')" aria-label="${State.swapSourceId === p.id ? `Cancel swap of ${escapeHtml(p.name)}` : `Swap ${escapeHtml(p.name)}`}">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>`;

                benchHTML += `
                <div class="lineup-slot ${lockClass} ${p.isTaxi ? 'taxi-row' : ''}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotCode}">${slotCode}</span>
                        ${playerHeadshotHTML(p)}
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${escapeHtml(p.team)}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        ${rowActions}
                    </div>
                </div>`;
            });
        } else { 
            benchContainer.classList.add('bench-empty-state');
            benchHTML = `
                <div style="display:flex; justify-content:center; align-items:center; height: 60px; color:var(--text-muted); font-style:italic; font-size:0.9rem;">
                    [ No bench players available ]
                </div>`; 
        }
        renderHTMLInto(benchContainer, benchHTML);

        // Auto-update the dashboard matrix in the background so status icons stay live
        if (typeof renderLeagueManager === 'function') renderLeagueManager();

        // Fills in projections/final scores/opponents if they're missing or stale; a no-op
        // (and no re-render) when everything's already fresh. See refreshLineupStats.
        refreshLineupStats();
    }
    // --- STARTUP CLEANUP ---
document.addEventListener('DOMContentLoaded', () => {
    // One-time cleanup of 'shared_sleeper_league_id', a league-ID handoff from MDS that was
    // never finished: nothing in either app ever wrote the key, but MLS used to read it here
    // and auto-click Sync on page load. MDS hands off via mds_handoff_roster instead (see
    // checkForDraftStrategistHandoff). The key is off getMlsOwnedKeys() now, so Factory Reset
    // can no longer clear a stale copy -- hence removing it directly. Idempotent, so it needs
    // no "already migrated" flag; safe to delete once existing installs have loaded once.
    try { localStorage.removeItem('shared_sleeper_league_id'); } catch (e) {}

    // Tooltip tap/keyboard handling moved to js/utils.js (initInfoTooltips), shared with MDS
    // and T-Score. The per-icon listeners that lived here only covered icons present at load.
});
// --- POWER-USER KEYBOARD SHORTCUTS (MLS) ---
document.addEventListener('keydown', (e) => {
    // Escape closes the hamburger drawer from anywhere, so keyboard users have a way to
    // dismiss it without a mouse. The drawerOverlay backdrop is intentionally NOT a tab
    // stop (standard pattern for backdrops); this plus the existing visible close button
    // are the two keyboard-accessible ways to exit the menu.
    const openDrawer = document.getElementById('drawer');
    if (e.key === 'Escape' && openDrawer && openDrawer.classList.contains('open')) {
        window.toggleDrawer();
        return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
    
    if (isInputActive) return;

    // Shift + Arrow keys to quickly cycle leagues
    if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (typeof window.cycleLeague === 'function') window.cycleLeague(-1);
        return;
    }
    if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (typeof window.cycleLeague === 'function') window.cycleLeague(1);
        return;
    }

    // Ctrl+Z / Cmd+Z to undo the last lineup edit (swap, lock toggle, unlock-all, or a
    // manual "Optimize Lineup" click), Ctrl+Shift+Z or Ctrl+Y / Cmd+Shift+Z to redo --
    // see pushLineupUndoSnapshot and undoLineupChange/redoLineupChange above for scope.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (typeof window.undoLineupChange === 'function') window.undoLineupChange();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        if (typeof window.redoLineupChange === 'function') window.redoLineupChange();
        return;
    }

    switch(e.key) {
        case '1': if (typeof window.showTab === 'function') window.showTab('setup'); break;
        case '2': if (typeof window.showTab === 'function') window.showTab('roster'); break;
        case '3': if (typeof window.showTab === 'function') window.showTab('lineup'); break;
        case '4': if (typeof window.showTab === 'function') window.showTab('scout'); break;
        case '5': if (typeof window.showTab === 'function') window.showTab('guide'); break;
    }
});
// --- POSITIONAL POWER RANKINGS: SHARED MATH ---
// Scores every manager's QB/RB/WR/TE room in one league from a rankings list, then ranks the
// managers 1..N at each position and overall. Pure (no DOM, no toasts) so the Positional Power
// Rankings card and the All My Leagues player search (see getLeaguePowerContext) run the exact
// same numbers -- the search's "WR Power Rank: 9th" has to match what this league's table says.
// Also splits each roster into its best legal starting lineup vs bench (see
// pickPowerStarters): the position columns measure whole rooms, depth included, but whether a
// team can actually compete comes down to who it can put on the field each week.
// Returns [] when the league has no whole-league roster data.
const POWER_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const POWER_UNRANKED_RANK = 300;
// Power Curve: Heavily weights studs, incrementally adds value for depth
export const powerValueForRank = (rank) => Math.round(100000 / (rank + 5));
export function powerRankFor(rankingsIdx, cleanName) {
    const data = rankingsIdx.get(cleanName);
    // Use custom rank, or market rank. Default to 300 if not on the board.
    return { rank: data ? (data.rank || data.marketVal) : POWER_UNRANKED_RANK, data };
}

// How far above the league average one position's starters can count toward the Start score
// (1.5 = 150% of average). Lets a Josh Allen genuinely lift a lineup without letting him
// single-handedly paper over empty RB and WR rooms. See computePositionalPower step 3a.
const POWER_STARTER_CARRY_CAP = 1.5;

// Same fallback lineup the rest of this file uses for a league with no saved reqs.
const POWER_DEFAULT_REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };
// Filled in this order: fixed slots first, then FLEX, then Superflex -- most restrictive to
// least. Taking the best available player for each slot in that order is optimal here, since
// every eligibility set contains the one before it and a player's value doesn't depend on which
// slot he fills. K/DEF slots are skipped: power rankings don't score those positions.
const POWER_STARTER_SLOTS = [
    ['QB', ['QB']], ['RB', ['RB']], ['WR', ['WR']], ['TE', ['TE']],
    ['FLEX', ['RB', 'WR', 'TE']], ['SFLEX', ['QB', 'RB', 'WR', 'TE']]
];
function pickPowerStarters(players, reqs) {
    const r = Object.assign({}, POWER_DEFAULT_REQS, reqs || {});
    const pool = [...players].sort((a, b) => b.value - a.value || a.rank - b.rank);
    const used = new Set();
    const starters = [];
    POWER_STARTER_SLOTS.forEach(([slot, eligible]) => {
        let need = parseInt(r[slot], 10) || 0;
        for (const p of pool) {
            if (need <= 0) break;
            if (used.has(p) || !eligible.includes(p.pos)) continue;
            used.add(p);
            starters.push({ ...p, slot });
            need--;
        }
    });
    return { starters, bench: pool.filter(p => !used.has(p)) };
}

// --- FUTURE VALUE (dynasty / keeper) ---
// Rough positional age curves: a multiplier on each player's rankings value, >1 before a
// position's typical peak and falling off after it (RBs earliest, QBs latest). Custom dynasty
// rankings usually price age in already, so these are deliberately gentle -- they tilt a
// roster's future score toward youth rather than overriding the board. A heuristic, and the
// guide says so; not a projection model. Each row is [max age, multiplier]; unknown age = 1.
const POWER_AGE_CURVES = {
    QB: [[26, 1.10], [30, 1.05], [32, 1.00], [33, 0.90], [34, 0.80], [35, 0.70], [Infinity, 0.55]],
    RB: [[24, 1.15], [25, 1.05], [26, 0.95], [27, 0.80], [28, 0.65], [29, 0.50], [Infinity, 0.35]],
    WR: [[24, 1.15], [26, 1.05], [27, 1.00], [28, 0.90], [29, 0.75], [30, 0.60], [31, 0.45], [Infinity, 0.35]],
    TE: [[25, 1.10], [27, 1.05], [28, 1.00], [29, 0.90], [30, 0.75], [31, 0.60], [Infinity, 0.45]]
};
function powerAgeFactor(pos, age) {
    const curve = POWER_AGE_CURVES[pos];
    if (!curve || !Number.isFinite(age) || age <= 0) return 1;
    for (const [maxAge, factor] of curve) if (age <= maxAge) return factor;
    return 1;
}

// opts.future (optional) adds a futureScore/futureRank per team:
//   { mode: 'age', ages: { [cleanName]: age } } -- this league's rankings value x age curve
//   { mode: 'market', rankings: [...] }          -- dynasty Market Consensus value, no age
// Without it, teams carry no future fields -- the All My Leagues search doesn't use them.
export function computePositionalPower(league, rankings, opts = {}) {
    if (!league || !league.globalRosterMap || !league.globalPosMap) return [];
    const rankingsIdx = rankingIndex(rankings);
    let teamScoresMap = {};

    // 1. Initialize scoring objects for every manager
    Object.values(league.globalRosterMap).forEach(owner => {
        if (!teamScoresMap[owner]) {
            teamScoresMap[owner] = {
                owner: owner,
                scores: { QB: 0, RB: 0, WR: 0, TE: 0 },
                total: 0,
                players: { QB: [], RB: [], WR: [], TE: [] } // For our tooltips
            };
        }
    });

    // 2. Assign Power Points to EVERY rostered player
    Object.keys(league.globalRosterMap).forEach(cleanName => {
        let owner = league.globalRosterMap[cleanName];
        let pos = league.globalPosMap[cleanName];
        const { rank, data } = powerRankFor(rankingsIdx, cleanName);
        let actualName = data ? data.name : cleanName;
        let powerValue = powerValueForRank(rank);

        if (teamScoresMap[owner] && POWER_POSITIONS.includes(pos)) {
            teamScoresMap[owner].scores[pos] += powerValue;
            teamScoresMap[owner].total += powerValue;
            teamScoresMap[owner].players[pos].push({ name: actualName, cleanName, pos, rank: rank, value: powerValue, tier: data?.tier });
        }
    });

    let teamScores = Object.values(teamScoresMap);
    if (teamScores.length === 0) return teamScores;

    // 3. Sort player arrays so the tooltip shows the best players at the top, and split each
    // roster into starters vs bench against this league's own lineup requirements.
    teamScores.forEach(team => {
        POWER_POSITIONS.forEach(pos => {
            team.players[pos].sort((a, b) => a.rank - b.rank);
        });
        const all = POWER_POSITIONS.flatMap(pos => team.players[pos]);
        const { starters, bench } = pickPowerStarters(all, league.reqs);
        team.starters = starters;
        team.bench = bench;
        team.starterRaw = starters.reduce((sum, p) => sum + p.value, 0);
        team.benchScore = bench.reduce((sum, p) => sum + p.value, 0);
        // Starters grouped by their real position (a WR in FLEX counts as a WR), for the
        // balance score below.
        team.starterByPos = { QB: 0, RB: 0, WR: 0, TE: 0 };
        team.starterCountByPos = { QB: 0, RB: 0, WR: 0, TE: 0 };
        starters.forEach(p => { team.starterByPos[p.pos] += p.value; team.starterCountByPos[p.pos]++; });
    });

    // 3a. Starting lineup strength, BALANCED across positions. A plain sum of starter values
    // let one or two studs hide empty rooms elsewhere -- the power curve is steep (a rank-1
    // player is worth ~9x a rank-50 one), so an elite QB + TE could post the league's best
    // "starters" total with the league's worst RBs and WRs. Instead, each position's starters
    // are measured against the league average at that position, capped so one room can only
    // carry so much (POWER_STARTER_CARRY_CAP), and averaged with weights equal to how many
    // lineup spots that position fills on an average team here (so 3 WR spots count 3x one TE
    // spot, and Superflex leagues weight QBs accordingly). starterRatios is kept for the Start
    // tooltip, so the rank is explainable.
    const avgStarterByPos = {}, slotWeight = {};
    POWER_POSITIONS.forEach(pos => {
        avgStarterByPos[pos] = teamScores.reduce((sum, t) => sum + t.starterByPos[pos], 0) / teamScores.length;
        slotWeight[pos] = teamScores.reduce((sum, t) => sum + t.starterCountByPos[pos], 0) / teamScores.length;
    });
    const totalWeight = POWER_POSITIONS.reduce((sum, pos) => sum + slotWeight[pos], 0) || 1;
    teamScores.forEach(team => {
        team.starterRatios = {};
        let weighted = 0;
        POWER_POSITIONS.forEach(pos => {
            const ratio = avgStarterByPos[pos] > 0 ? team.starterByPos[pos] / avgStarterByPos[pos] : 1;
            team.starterRatios[pos] = ratio;
            weighted += slotWeight[pos] * Math.min(ratio, POWER_STARTER_CARRY_CAP);
        });
        team.starterScore = weighted / totalWeight;
    });

    // 3b. Future value, when asked for.
    const future = opts.future || null;
    if (future) {
        const marketIdx = future.mode === 'market' ? rankingIndex(future.rankings) : null;
        teamScores.forEach(team => {
            const all = POWER_POSITIONS.flatMap(pos => team.players[pos]);
            team.futurePlayers = all.map(p => {
                if (future.mode === 'market') {
                    const { rank } = powerRankFor(marketIdx, p.cleanName);
                    return { ...p, futureValue: powerValueForRank(rank), futureRank: rank };
                }
                const age = future.ages ? future.ages[p.cleanName] : undefined;
                return { ...p, age: Number.isFinite(age) ? age : null, futureValue: Math.round(p.value * powerAgeFactor(p.pos, age)) };
            }).sort((a, b) => b.futureValue - a.futureValue);
            team.futureScore = team.futurePlayers.reduce((sum, p) => sum + p.futureValue, 0);
        });
    }

    // 4. Rank teams 1 to N (Highest Power Score = Rank 1)
    const scoreOf = (team, key) => key === 'total' ? team.total
        : key === 'starters' ? team.starterScore
        : key === 'bench' ? team.benchScore
        : key === 'future' ? team.futureScore
        : team.scores[key];
    const assignRanks = (arr, posKey, rankKey) => {
        let sorted = [...arr].sort((a, b) => scoreOf(b, posKey) - scoreOf(a, posKey)); // Descending Sort

        sorted.forEach((team, idx) => {
            let original = arr.find(t => t.owner === team.owner);
            original[rankKey] = idx + 1;
        });
    };

    assignRanks(teamScores, 'QB', 'qbRank');
    assignRanks(teamScores, 'RB', 'rbRank');
    assignRanks(teamScores, 'WR', 'wrRank');
    assignRanks(teamScores, 'TE', 'teRank');
    assignRanks(teamScores, 'total', 'overallRank');
    assignRanks(teamScores, 'starters', 'starterRank');
    assignRanks(teamScores, 'bench', 'benchRank');
    if (future) assignRanks(teamScores, 'future', 'futureRank');

    // Final sort by overall rank for the table display
    teamScores.sort((a, b) => a.overallRank - b.overallRank);
    return teamScores;
}

// Top third / middle / bottom third -- the same split renderPowerRankingsTable colors its
// cells by (green / neutral / red), so a "weak" label in the All My Leagues search lines up
// with a red cell in that league's table.
export function powerTier(rank, totalTeams) {
    if (rank <= Math.ceil(totalTeams / 3)) return 'strong';
    if (rank > Math.floor(totalTeams * 2 / 3)) return 'weak';
    return 'middle';
}

// --- TEAM DIRECTION LABELS ---
// Dynasty and keeper leagues get Contender / Retool / Rebuild; redraft (and anything else) gets
// Contender / Bubble / Longshot, since "rebuild" means nothing when rosters reset each year.
// leagueType is stored at sync (see the leagueObj in the Sleeper sync); leagues synced before
// it existed fall back to reading formatBadge.
export function getPowerLeagueKind(league) {
    const t = league && league.leagueType;
    if (t) return (t === 'dynasty' || t === 'keeper') ? 'dynasty' : 'redraft';
    return /^(Dynasty|Keeper)\b/.test((league && league.formatBadge) || '') ? 'dynasty' : 'redraft';
}

// Labels come from the starting lineup's tier (top / middle / bottom third, as powerTier), with
// future value deciding the dynasty cases where "now" alone is ambiguous:
//   Dynasty:  top-third starters                -> Contender ("window closing" if the roster's
//                                                  future value is bottom-third)
//             middle starters                    -> Retool, unless future is bottom-third ->
//                                                  Rebuild (a mid-pack team that's also old)
//             bottom-third starters              -> Rebuild ("young core" if future is top-third)
//   Redraft:  top / middle / bottom starters     -> Contender / Bubble / Longshot
// A top-third lineup is never told to Retool: whatever the ages, the best move for one of the
// best teams in the league is to push for a title. Based on roster strength only -- not
// the standings -- which the card's notes say.
function assignPowerLabels(teams, kind) {
    const N = teams.length;
    const hasFuture = teams.every(t => Number.isFinite(t.futureRank));
    teams.forEach(t => {
        const st = powerTier(t.starterRank, N);
        const ft = hasFuture ? powerTier(t.futureRank, N) : null;
        t.labelNote = '';
        if (kind === 'redraft') {
            t.label = st === 'strong' ? 'Contender' : (st === 'middle' ? 'Bubble' : 'Longshot');
            return;
        }
        if (st === 'strong') {
            t.label = 'Contender';
            if (ft === 'weak') t.labelNote = 'window closing';
        } else if (st === 'middle') {
            t.label = ft === 'weak' ? 'Rebuild' : 'Retool';
        } else {
            t.label = 'Rebuild';
            if (ft === 'strong') t.labelNote = 'young core';
        }
    });
}

// One sentence per label for the "Your Team" summary above the table.
function powerLabelAdvice(t) {
    const key = t.label + (t.labelNote ? `|${t.labelNote}` : '');
    return ({
        'Contender': "Your starting lineup is one of the league's best. Depth or future value you can spare is worth turning into starters.",
        'Contender|window closing': "Your starting lineup is one of the league's best, but the roster is old. Push for a title now; this window won't stay open long.",
        'Retool': "Your lineup is mid-pack with a solid future behind it. One or two targeted starter upgrades could make you a contender, without selling your young core.",
        'Rebuild': t.starterTier === 'middle'
            ? "Your lineup is mid-pack and the roster is aging. Consider selling veterans for younger players and picks before their value drops."
            : "Your starting lineup is in the bottom third. Consider selling veterans for younger players and picks.",
        'Rebuild|young core': "Your lineup is in the bottom third now, but your future value is among the league's best. The rebuild is on track; keep adding youth.",
        'Bubble': "Your lineup is mid-pack. A starter upgrade or two could swing a playoff spot.",
        'Longshot': "Your starting lineup is in the bottom third. Take swings on upside, on waivers and in trades."
    })[key] || '';
}

// Clean name -> age, from the same day-cached Sleeper player map everything else uses. The card
// renders without the Future column until this resolves, then re-renders once; a failed load
// is remembered for the session so it doesn't retry on every Roster tab render.
let _powerAgeIndex = null;
let _powerAgeState = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed'
function ageFromMeta(m) {
    if (m.birthDate) {
        const b = new Date(m.birthDate + 'T00:00:00');
        if (!isNaN(b)) {
            const now = new Date();
            let age = now.getFullYear() - b.getFullYear();
            if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
            if (age > 15 && age < 50) return age;
        }
    }
    const a = Number(m.age);
    return Number.isFinite(a) && a > 0 ? a : null;
}
function ensurePowerAgeIndex() {
    if (_powerAgeState !== 'idle') return;
    _powerAgeState = 'loading';
    getSleeperMetaByName().then(meta => {
        const idx = {};
        Object.entries(meta).forEach(([clean, m]) => {
            const age = ageFromMeta(m);
            if (age != null) idx[clean] = age;
        });
        _powerAgeIndex = idx;
        _powerAgeState = 'ready';
        refreshPowerRankings();
    }).catch(err => {
        console.warn('Power Rankings: Sleeper player ages unavailable; future value falls back to Market Consensus if loaded.', err);
        _powerAgeState = 'failed';
        refreshPowerRankings();
    });
}

// Future value source for the active league: rankings x Sleeper age (preferred), else dynasty
// Market Consensus values, else none. Market data only counts when it was pulled as Dynasty --
// redraft market values say nothing about next year.
function resolvePowerFuture() {
    if (_powerAgeState === 'ready') return { future: { mode: 'age', ages: _powerAgeIndex }, label: 'age' };
    const dynastyMarket = State.marketRankings.length > 0 && State.marketSettings && State.marketSettings.type === 'dynasty';
    if (_powerAgeState === 'failed' && dynastyMarket) return { future: { mode: 'market', rankings: State.marketRankings }, label: 'market' };
    return { future: null, label: _powerAgeState === 'loading' ? 'loading' : 'none' };
}

// --- POSITIONAL POWER RANKINGS: ROSTER TAB CARD ---
// Generated automatically (no Calculate button) every time the Roster tab renders -- see the
// call at the top of loadRosterTab, which every rankings upload, set change, sync and league
// switch already funnels through. The math is a few milliseconds even for a 14-team league,
// so recomputing on every render is cheaper than tracking what changed.
export const updatePowerSetting = function(key, value) {
    State.powerSettings[key] = value;
    localStorage.setItem('mls_power_settings', JSON.stringify(State.powerSettings));
    refreshPowerRankings();
};

// Which rankings the card scores with: the person's pick, falling back to the other source
// (with a note saying so) rather than showing nothing, the same way the All My Leagues search
// falls back to Market Consensus for a league without rankings of its own.
function resolvePowerRankingsSource() {
    const wantMarket = State.powerSettings.source === 'market';
    const mine = State.rosRankings, market = State.marketRankings;
    if (wantMarket) {
        if (market.length > 0) return { rankings: market, source: 'market', note: '' };
        if (mine.length > 0) return { rankings: mine, source: 'custom', note: 'No Market Consensus data loaded yet, so this uses your own rankings instead.' };
    } else {
        if (mine.length > 0) return { rankings: mine, source: 'custom', note: '' };
        if (market.length > 0) return { rankings: market, source: 'market', note: 'No rankings of your own loaded for this league, so this uses Market Consensus instead. Upload rankings above for a board built for this league.' };
    }
    return null;
}

function refreshPowerRankings() {
    const out = document.getElementById('powerRankingsOutput');
    if (!out) return;
    const sourceSelect = document.getElementById('powerRankingsSource');
    if (sourceSelect) sourceSelect.value = State.powerSettings.source === 'market' ? 'market' : 'custom';

    const showMessage = (msg) => {
        out.innerHTML = `<div class="mls-power-empty">${msg}</div>`;
        out.style.display = 'block';
        renderRosterPowerStrip(null); // nothing to summarize up top either
    };

    const league = getActiveLeague();
    if (!league) {
        showMessage('Select or sync a league on the Dashboard to see Positional Power Rankings.');
        return;
    }
    if (!isFullyMappedLeague(league) || !league.globalPosMap) {
        showMessage("Power Rankings compare every team in the league, so they need a Sleeper-synced league. This league only knows your own roster.");
        return;
    }
    const src = resolvePowerRankingsSource();
    if (!src) {
        showMessage('Upload your rankings above (or Auto-Fetch them) to see how every team in this league stacks up.');
        return;
    }
    // Future value only matters where rosters carry over. Ages load in the background the
    // first time (see ensurePowerAgeIndex), which re-runs this once they land.
    const kind = getPowerLeagueKind(league);
    let futureInfo = { future: null, label: 'none' };
    if (kind === 'dynasty') {
        ensurePowerAgeIndex();
        futureInfo = resolvePowerFuture();
    }
    const teams = computePositionalPower(league, src.rankings, { future: futureInfo.future });
    if (teams.length === 0) {
        showMessage('Not enough roster data to evaluate yet. Try re-syncing this league.');
        return;
    }
    assignPowerLabels(teams, kind);
    teams.forEach(t => { t.starterTier = powerTier(t.starterRank, teams.length); });
    renderPowerRankingsTable(teams, { league, source: src, kind, futureLabel: futureInfo.label });
    renderRosterPowerStrip(teams, { source: src });
}

// --- ACTIVE ROSTER: POWER RANKINGS SNAPSHOT ---
// Your own row of the Positional Power Rankings, shown under the league name at the top of the
// Active Roster card (#rosterPowerStrip) -- the full table sits far enough down the Roster tab
// that people could miss it entirely. Ranks only, no tooltips: this is a glance, and the link
// underneath jumps to the table, which has the player-level detail and the explanations.
// Rendered from the exact same teams array as the table, so the two can't disagree.
function renderRosterPowerStrip(teams, ctx = {}) {
    const el = document.getElementById('rosterPowerStrip');
    if (!el) return;
    const you = teams ? teams.find(t => t.owner === 'You') : null;
    if (!you) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    const N = teams.length;
    const hasFuture = teams.every(t => Number.isFinite(t.futureRank));
    const stats = [
        ['Start', you.starterRank], ['Ovr', you.overallRank],
        ['QB', you.qbRank], ['RB', you.rbRank], ['WR', you.wrRank], ['TE', you.teRank]
    ];
    if (hasFuture) stats.push(['Future', you.futureRank]);
    const label = you.label
        ? `<span class="mls-power-label mls-power-label-${String(you.label).toLowerCase()}">${escapeHtml(you.label)}${you.labelNote ? ` <span class="mls-power-label-note">&middot; ${escapeHtml(you.labelNote)}</span>` : ''}</span>` : '';
    const via = ctx.source && ctx.source.source === 'market' ? ' &middot; via Market Consensus' : '';
    el.innerHTML = `
        <div class="mls-roster-power-head">
            <span class="mls-roster-power-title">Positional Power Rankings</span>
            ${label}
            <span class="mls-roster-power-of">out of ${N} teams${via}</span>
        </div>
        <div class="mls-roster-power-stats" style="grid-template-columns: repeat(${stats.length}, minmax(0, 1fr));">
            ${stats.map(([name, rank]) => `
            <div class="mls-roster-power-stat">
                <span class="mls-roster-power-stat-name">${name}</span>
                <span class="mls-roster-power-stat-rank mls-power-cell-${powerTier(rank, N)}">${rank}</span>
            </div>`).join('')}
        </div>
        <button type="button" class="mls-roster-power-link btn-bare" onclick="scrollToPowerRankings()">See the full league breakdown and explanations below &darr;</button>`;
    el.style.display = 'block';
}

// Scrolls the Roster tab's Power Rankings card into view (the snapshot's link above; the Scout
// tab's temporary pointer uses it too, via goToPowerRankings). #powerRankingsCard carries a
// scroll-margin-top in styles.css so the sticky header doesn't cover the card title.
export const scrollToPowerRankings = function() {
    const card = document.getElementById('powerRankingsCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Scout tab's one-line "moved to the Roster tab" pointer (see #powerRankingsScoutPointer in
// index.html). The delay lets showTab's own scroll-to-top start before scrolling to the card,
// the same trick scoutGoToLeague uses.
// TODO (added 2026-09-27): recommend removing this pointer -- the #powerRankingsScoutPointer
// section in index.html, this function, and the .mls-moved-pointer CSS -- on or after
// 2026-10-04, once regular users have had a week to find the card's new home.
export const goToPowerRankings = function() {
    if (typeof window.showTab === 'function') window.showTab('roster');
    setTimeout(() => window.scrollToPowerRankings(), 60);
};

// Kept for anything still calling the old Scout-tab button handler.
export const runPositionalStrength = function() {
    refreshPowerRankings();
};

export const renderPowerRankingsTable = function(teamScores, ctx = {}) {
    let out = document.getElementById('powerRankingsOutput');
    if (!out) return;

    const totalTeams = teamScores.length;
    const tierCls = (rank) => `mls-power-cell-${powerTier(rank, totalTeams)}`;

    // Nested player tooltips. slot: show each player's lineup slot (Starters column).
    // Direction: the site-wide tooltip opens leftward from its anchor, which runs off-screen for
    // the left-hand columns on a phone -- so Start/Bench/QB open rightward instead, and RB and
    // everything right of it keep opening leftward.
    const buildTooltip = (players, title, { rightEdge = false, slot = false, limit = 6 } = {}) => {
        let html = `<div class="tooltip-text mls-power-tooltip ${rightEdge ? 'mls-power-tooltip-right' : 'mls-power-tooltip-left'}">`;
        html += `<div class="mls-power-tooltip-title">${escapeHtml(title)}</div>`;
        if (players.length === 0) {
            html += `<div class="mls-power-tooltip-empty">No players rostered.</div>`;
        } else {
            html += players.slice(0, limit).map(p => `
                <div class="mls-power-tooltip-row">
                    <span class="mls-power-tooltip-name">${slot ? `<span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : p.slot}</span>` : ''}${escapeHtml(p.name)}</span>
                    <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
                </div>`).join('');
            if (players.length > limit) {
                html += `<div class="mls-power-tooltip-more">+ ${players.length - limit} more</div>`;
            }
        }
        return html + `</div>`;
    };

    const cell = (rank, tooltipHTML, extraCls = '') => `
        <td class="${tierCls(rank)} ${extraCls}">
            <div class="tooltip-container mls-tooltip-center" ontouchstart="">
                <span class="mls-dotted-underline">${rank}</span>
                ${tooltipHTML}
            </div>
        </td>`;

    // Sorted by starting-lineup strength: "can this team win now?" is the question the table
    // leads with. The position columns still cover whole rooms, bench included.
    const rows = [...teamScores].sort((a, b) => a.starterRank - b.starterRank);
    const hasFuture = rows.every(t => Number.isFinite(t.futureRank));
    const labelCls = (t) => `mls-power-label mls-power-label-${String(t.label || '').toLowerCase()}`;
    const labelChip = (t) => t.label
        ? `<span class="${labelCls(t)}">${escapeHtml(t.label)}${t.labelNote ? ` <span class="mls-power-label-note">&middot; ${escapeHtml(t.labelNote)}</span>` : ''}</span>` : '';

    // Start tooltip: each position's starters vs the league average (what the rank is actually
    // built from -- see computePositionalPower step 3a), then the lineup itself.
    const startTooltip = (t) => {
        const ratioCls = (r) => r >= 1.15 ? 'mls-power-cell-strong' : (r < 0.85 ? 'mls-power-cell-weak' : '');
        const balance = POWER_POSITIONS.map(pos => {
            const r = t.starterRatios ? t.starterRatios[pos] : null;
            if (r == null) return '';
            const capped = r > POWER_STARTER_CARRY_CAP ? ' title="Counts as 150% - one position can only carry so much"' : '';
            return `<span class="mls-power-balance-item"${capped}>${pos} <strong class="${ratioCls(r)}">${Math.round(r * 100)}%</strong>${r > POWER_STARTER_CARRY_CAP ? '*' : ''}</span>`;
        }).join('');
        let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-left">`;
        html += `<div class="mls-power-tooltip-title">Starting Lineup</div>`;
        html += `<div class="mls-power-balance-label">Starters vs. league average</div><div class="mls-power-balance">${balance}</div>`;
        if (POWER_POSITIONS.some(pos => t.starterRatios && t.starterRatios[pos] > POWER_STARTER_CARRY_CAP)) {
            html += `<div class="mls-power-balance-foot">* capped at 150% - one position can only carry so much</div>`;
        }
        html += t.starters.map(p => `
            <div class="mls-power-tooltip-row">
                <span class="mls-power-tooltip-name"><span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : p.slot}</span>${escapeHtml(p.name)}</span>
                <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
            </div>`).join('');
        return html + `</div>`;
    };

    // Future tooltip: top contributors with their age (age mode) so the number is explainable.
    const futureTooltip = (t) => {
        const players = (t.futurePlayers || []).slice(0, 8);
        let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-right">`;
        html += `<div class="mls-power-tooltip-title">Future Value (age-adjusted)</div>`;
        html += players.map(p => `
            <div class="mls-power-tooltip-row">
                <span class="mls-power-tooltip-name">${escapeHtml(p.name)}</span>
                <span class="mls-power-tooltip-rank">${p.age != null ? `${p.age} yrs &middot; ` : ''}#${p.futureRank != null ? p.futureRank : p.rank}</span>
            </div>`).join('');
        if ((t.futurePlayers || []).length > players.length) html += `<div class="mls-power-tooltip-more">+ ${t.futurePlayers.length - players.length} more</div>`;
        return html + `</div>`;
    };

    // "Your Team" summary: the label in words, so nobody has to decode the table first.
    let summaryHTML = '';
    const you = rows.find(t => t.owner === 'You');
    if (you && you.label) {
        const facts = [`<strong>${ordinal(you.starterRank)}</strong> of ${totalTeams} in starting lineup`, `<strong>${ordinal(you.overallRank)}</strong> overall`];
        if (hasFuture) facts.push(`<strong>${ordinal(you.futureRank)}</strong> in future value`);
        summaryHTML = `
        <div class="mls-power-summary-card mls-power-summary-${String(you.label).toLowerCase()}">
            <div class="mls-power-summary-head">Your Team: ${labelChip(you)}</div>
            <div class="mls-power-summary-facts">${facts.join(' <span class="mls-rank-sep">&middot;</span> ')}</div>
            <div class="mls-power-summary-advice">${escapeHtml(powerLabelAdvice(you))}</div>
        </div>`;
    }

    let html = `
        <div class="mls-power-table-wrap">
        <table class="mls-power-table">
            <thead>
                <tr>
                    <th class="mls-power-manager">Manager</th>
                    <th title="Best legal starting lineup for this league's roster settings, weighed position by position against the league average">Start</th>
                    <th title="Whole roster (QB/RB/WR/TE), starters and depth together">Ovr</th>
                    <th>QB</th>
                    <th>RB</th>
                    <th>WR</th>
                    <th>TE</th>
                    ${hasFuture ? `<th title="Future value: roster value adjusted for age - who holds up beyond this season">Future</th>` : ''}
                </tr>
            </thead>
            <tbody>`;

    rows.forEach(t => {
        html += `
            <tr class="${t.owner === 'You' ? 'mls-power-you' : ''}">
                <td class="mls-power-manager"><span class="mls-power-owner">${escapeHtml(t.owner)}</span>${labelChip(t)}</td>
                ${cell(t.starterRank, startTooltip(t), 'mls-power-strong-col')}
                ${cell(t.overallRank, buildTooltip([...t.starters, ...t.bench].sort((a, b) => a.rank - b.rank), 'Top of the Roster', { limit: 8 }))}
                ${cell(t.qbRank, buildTooltip(t.players.QB, 'QB Room'))}
                ${cell(t.rbRank, buildTooltip(t.players.RB, 'RB Room', { rightEdge: true }))}
                ${cell(t.wrRank, buildTooltip(t.players.WR, 'WR Room', { rightEdge: true }))}
                ${cell(t.teRank, buildTooltip(t.players.TE, 'TE Room', { rightEdge: true }))}
                ${hasFuture ? cell(t.futureRank, futureTooltip(t)) : ''}
            </tr>`;
    });

    html += `</tbody></table></div>`;

    const notes = [];
    if (ctx.source && ctx.source.note) notes.push(escapeHtml(ctx.source.note));
    notes.push(`Ranked 1-${totalTeams} (1 = strongest). <strong>Start</strong> is each team's best legal lineup under this league's roster settings, with each position's starters measured against the league average and weighted by how many lineup spots it fills - so a stud at one position can't hide empty rooms at the others. <strong>Ovr</strong> is the whole roster, depth included.`);
    if (ctx.kind === 'dynasty') {
        if (ctx.futureLabel === 'age') notes.push(`<strong>Future</strong> is each roster's future value: its value from these rankings, adjusted for player age (from Sleeper) with rough positional age curves - younger players count a bit more, older players less.`);
        else if (ctx.futureLabel === 'market') notes.push(`<strong>Future</strong> is each roster's future value. Couldn't load player ages from Sleeper, so it uses dynasty Market Consensus values instead.`);
        else if (ctx.futureLabel === 'loading') notes.push(`Loading player ages from Sleeper for the Future column…`);
        else notes.push(`Couldn't load player ages from Sleeper, so there's no Future column; labels use the starting lineup alone. Pulling Dynasty Market Consensus data (Trade Finder on the Scout tab) gives a fallback.`);
        notes.push(`Labels: <strong>Contender</strong> = top-third starting lineup; <strong>Retool</strong> = mid-pack lineup with a decent future; <strong>Rebuild</strong> = bottom-third lineup, or mid-pack with a bottom-third future.`);
    } else {
        notes.push(`Labels: <strong>Contender</strong> / <strong>Bubble</strong> / <strong>Longshot</strong> = top / middle / bottom third in starting lineup strength.`);
    }
    notes.push(`Labels reflect roster strength only, not the standings.`);
    html += `<ul class="mls-power-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`;

    out.innerHTML = summaryHTML + html;
    out.style.display = 'block';
};

// A player this audit considers a genuine problem to leave in an active slot. Deliberately
// narrower than HARD_OUT_STATUSES / getShortInjuryStatus's full vocabulary: Questionable and
// Doubtful players are game-time calls you may well still want rostered and even started, so
// flagging them here would bury the real "this guy is definitively not playing, go move him"
// signal this tool exists to surface. Shared by the Sleeper and manual-league paths below so
// the two can't drift on what counts as injured.
function isAuditOut(p) {
    if (!p) return false;
    return p.injury_status === "Out" || ["IR", "PUP", "NFI", "Suspended"].includes(p.status);
}

// Clean name -> raw Sleeper player entries, built over a player map the caller already has in
// hand (the audit's own force-refreshed one) rather than the session-cached indexes near the
// top of this file -- an injury audit specifically wants today's statuses, not whatever was
// cached when some earlier feature first needed a name lookup.
//
// Values are ARRAYS of candidates, unlike getCleanNameToIdIndex's first-match-wins: manual
// players carry a position and team the caller can disambiguate with (see resolveManualPlayer),
// and picking a retired namesake here wouldn't just mislabel a row, it would report the wrong
// injury status for somebody's actual starter.
function buildCleanNameCandidateIndex(playerMap) {
    const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const index = {};
    Object.entries(playerMap).forEach(([id, p]) => {
        if (!p || !p.first_name || !FANTASY_POS.includes(p.position)) return;
        const clean = normalizeName(`${p.first_name} ${p.last_name}`);
        (index[clean] = index[clean] || []).push({ ...p, id });
    });
    return index;
}

// Best guess at which real NFL player a manually-entered roster entry refers to. Returns null
// when nothing matches at all -- manual entries are free text (typos, nicknames, team defenses
// written any number of ways), so "no match" is an expected outcome, not an error, and the
// caller reports the count rather than silently pretending those players were audited.
function resolveManualPlayer(p, candidateIndex) {
    const candidates = candidateIndex[p.cleanName];
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Ordered tiebreakers, most trustworthy first. The manual "team" field defaults to FA and
    // the position dropdown defaults to FLEX, so neither is worth matching on when it is still
    // sitting at that default -- hence the guards.
    const team = p.team && p.team !== "FA" ? p.team : null;
    const pos = p.pos && p.pos !== "FLEX" ? p.pos : null;
    return (team && candidates.find(c => c.team === team))
        || (pos && candidates.find(c => c.position === pos && c.team))
        || (pos && candidates.find(c => c.position === pos))
        || candidates.find(c => c.team)
        || candidates[0];
}

export const runGlobalInjuryAudit = async function(btn) {
    const outputEl = document.getElementById('injuryAuditOutput');
    const origText = btn.innerHTML;
    btn.innerHTML = "Scanning Leagues…";
    btn.disabled = true;
    btn.style.opacity = "0.7";
    outputEl.innerHTML = "";

    try {
        if (!State.leagues || State.leagues.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">No leagues synced.</span>`;
            return;
        }

        // Fetch global player map to check current injury status
        const playerMap = await getSleeperPlayerMap({ forceRefresh: true });
        // Only built if a manual league actually turns up -- it is a full pass over every
        // player Sleeper knows about, not worth doing for an all-Sleeper set of leagues.
        let candidateIndex = null;

        // The locked-player filter below is only as good as the kickoff data behind it, and
        // State.currentNflWeek/gameTimesByTeam can be null on a fresh load or stale if the
        // background refresh hasn't caught up -- so this Run gets current data rather than
        // whatever happened to be cached. Failure is deliberately swallowed: hasKickedOff
        // returns false for a team it has no data for, so a dead ESPN/Sleeper endpoint just
        // means nothing gets filtered and the audit reports everything, exactly as it did
        // before this filter existed. Losing the whole audit over it would be far worse.
        try {
            const nflState = await getNflState();
            if (nflState && typeof nflState.week === 'number') {
                State.currentNflWeek = nflState.week;
                await refreshGameTimes();
            }
        } catch (err) { /* see above -- degrade to "nothing is locked" */ }

        let auditResults = [];
        let scannedSleeper = 0;
        let scannedManual = 0;
        let skippedBestBall = 0;
        // Injured players whose game has already kicked off: real problems, but ones no
        // platform will let you fix this week. Collected rather than dropped so the notice at
        // the top can account for them -- silently omitting them would look like the audit
        // missed an obvious IR starter sitting right there on the Lineup tab.
        let lockedOut = [];

        // --- PREFETCH EVERY LEAGUE'S NETWORK DATA IN PARALLEL ---
        // The loop below used to `await getSleeperLeagueRosters(...)` and
        // `await getSleeperUser(...)` inside itself, one league at a time. Ten Sleeper leagues
        // meant twenty strictly serialized round-trips before a single result appeared, with
        // no progress indication -- the audit read as a hang rather than as work. Nothing in
        // the loop depends on a previous league's response, so there was never a reason to
        // serialize them; fetched together, the whole set costs roughly one round-trip of
        // wall time.
        //
        // The username lookup is also deduplicated. Most people use the same Sleeper account
        // for every league they're in, so the old code re-fetched an identical user record
        // once per league.
        const isSleeperAuditLeague = (l) => !!l.leagueId
            && !isBestBallLeague(l)
            && !l.leagueId.startsWith('manual_')
            && !l.leagueId.startsWith('handoff_');

        const rostersByLeagueId = new Map();
        const userIdByUsername = new Map();
        const sleeperAuditLeagues = State.leagues.filter(isSleeperAuditLeague);

        if (sleeperAuditLeagues.length > 0) {
            const uniqueUsernames = [...new Set(sleeperAuditLeagues.map(l => l.username).filter(Boolean))];
            const [rosterResults, userIdResults] = await Promise.all([
                // Promise.all, not allSettled: a failed roster fetch rejects out to this
                // function's own catch and surfaces as an audit error, which is exactly what
                // happened before when the bare await inside the loop threw. Keeping that
                // deliberately -- quietly dropping a league would make an unscanned league
                // indistinguishable from a clean one.
                Promise.all(sleeperAuditLeagues.map(l => getSleeperLeagueRosters(l.leagueId))),
                // Per-username catch, mirroring the try/catch this replaces: a bad username
                // skips the leagues that use it and the rest of the audit carries on.
                Promise.all(uniqueUsernames.map(u => getSleeperUser(u).then(d => d.user_id).catch(() => null)))
            ]);
            sleeperAuditLeagues.forEach((l, i) => rostersByLeagueId.set(l.leagueId, rosterResults[i]));
            uniqueUsernames.forEach((u, i) => userIdByUsername.set(u, userIdResults[i]));
        }

        for (let league of State.leagues) {
            if (!league.leagueId) continue;

            // Nothing to act on in a Best Ball league: lineups are scored automatically, and
            // they do not hand you an IR slot to stash an Out player in either -- so every row
            // this audit could produce for one would be a chore the format does not allow.
            if (isBestBallLeague(league)) { skippedBestBall++; continue; }

            // Draft-Strategist-handoff leagues count as manual here for the same reason
            // isFullyMappedLeague groups them: they're a locally-stored roster of your own
            // players with no Sleeper league behind them. Previously only 'manual_' was
            // checked and a handoff league fell through to the Sleeper branch below, where
            // getSleeperLeagueRosters('handoff_...') threw and took the whole audit down with
            // it rather than just skipping that one league.
            const isManual = league.leagueId.startsWith('manual_') || league.leagueId.startsWith('handoff_');

            // Manually added leagues: Sleeper has no roster for them, but it still knows the
            // injury status of the actual NFL players on them, matched by name. There is no
            // Sleeper lineup to compare against, so "starting" means the lineup as it stands in
            // this tool (the optimizer's output on the Lineup tab), and an injured bench player
            // is reported as-is rather than as "Move to IR" -- whether the real league even has
            // an IR slot isn't something we can know from here.
            if (isManual) {
                const roster = league.roster || [];
                if (roster.length === 0) continue;

                if (!candidateIndex) candidateIndex = buildCleanNameCandidateIndex(playerMap);
                scannedManual++;

                const localStarters = State.manualStartersMap[league.leagueId] || [];
                const starterIds = new Set(localStarters.filter(s => s.player).map(s => s.player.id));
                // A league whose lineup has never been optimized has no starter/bench split at
                // all, so every injured player there is reported neutrally as "On Roster"
                // instead of being miscast as a benching that has already been handled.
                const lineupIsSet = starterIds.size > 0;

                let leagueIssues = [];
                let unmatched = 0;

                roster.forEach(rp => {
                    // Team defenses are keyed by team abbreviation in Sleeper's player map, and
                    // the manual entry's name for one is free text ("Eagles", "Philadelphia
                    // D/ST"), so they're resolved off the team code instead of by name. One
                    // that can't be resolved is dropped rather than counted as unmatched: a
                    // D/ST has no injury designation to report, so telling the person it went
                    // unchecked would be noise about nothing.
                    let match;
                    if (rp.pos === 'DEF') {
                        const def = rp.team ? playerMap[rp.team] : null;
                        if (!def || def.position !== 'DEF') return;
                        match = def;
                    } else {
                        match = resolveManualPlayer(rp, candidateIndex);
                        if (!match) { unmatched++; return; }
                    }
                    if (!isAuditOut(match)) return;

                    // Sleeper's team code, not the manually-typed one -- the manual entry's
                    // team defaults to FA and can go stale after a trade, and a wrong team here
                    // means either a locked player reported as fixable or a fixable one hidden.
                    if (hasKickedOff({ team: match.team })) {
                        lockedOut.push({ leagueName: league.name, name: rp.name });
                        return;
                    }

                    const location = !lineupIsSet ? "On Roster"
                        : (starterIds.has(rp.id) ? "Starting Lineup" : "Bench");
                    leagueIssues.push({
                        name: rp.name,
                        status: match.injury_status || match.status,
                        location
                    });
                });

                // Unmatched names are surfaced even when nothing else is wrong -- otherwise a
                // league full of typo'd names would render as a clean bill of health.
                if (leagueIssues.length > 0 || unmatched > 0) {
                    auditResults.push({
                        leagueName: league.name,
                        format: league.leagueId.startsWith('handoff_') ? "Imported Roster" : "Manual League",
                        issues: leagueIssues, unmatched: unmatched
                    });
                }
                continue;
            }

            // Both of these were network calls made here, one league at a time; they're now
            // read from the parallel prefetch above. The safety check covers the case where
            // this loop's own skip conditions and isSleeperAuditLeague's ever drift apart --
            // without it, a league the prefetch didn't cover would throw on rosters.find below.
            const rosters = rostersByLeagueId.get(league.leagueId);
            if (!rosters) continue;

            // Resolve User ID. getSleeperUser throws on a not-found/error response (the
            // original inline fetch here didn't check response.ok at all, so a bad username
            // would just produce userId===undefined, myRoster staying undefined below, and
            // this league getting silently skipped by the "if (!myRoster) continue" a few
            // lines down). The prefetch's per-username catch stores null for that case,
            // preserving the same "skip this one league, keep scanning the rest" behavior.
            // A league with no username at all was never fetched, so it reads back undefined
            // and skips here too -- previously it reached getSleeperUser(undefined), threw,
            // and hit the same continue.
            const userId = userIdByUsername.get(league.username);
            if (userId === null || userId === undefined) continue;

            const myRoster = rosters.find(r => r.owner_id === userId);
            if (!myRoster) continue;
            scannedSleeper++;

            const starters = myRoster.starters || [];
            const reserve = myRoster.reserve || [];
            // Sleeper's roster object lists taxi-squad players in their own array, but ALSO
            // leaves them in `players` alongside everyone else -- same as `reserve` -- so both
            // have to be subtracted explicitly to arrive at the actual active bench. Absent on
            // leagues with no taxi squad configured, hence the fallback.
            const taxi = myRoster.taxi || [];
            const allPlayers = myRoster.players || [];
            let leagueIssues = [];

            allPlayers.forEach(pId => {
                let p = playerMap[pId];
                if (!p) return;

                if (isAuditOut(p)) {
                    let isStarting = starters.includes(pId);
                    // A taxi player is excluded for the same reason a reserve player is: they
                    // aren't occupying an active roster spot, so there's no move to prompt.
                    // Dynasty taxi squads are also where an injured rookie is *supposed* to
                    // sit, which made this the one slot most likely to generate a standing
                    // false positive week after week.
                    let isBench = !isStarting && !reserve.includes(pId) && !taxi.includes(pId);

                    // Once a player's team has kicked off, their roster spot is frozen on
                    // essentially every platform -- they can't be benched, and they can't be
                    // stashed on IR either. Reporting them would be handing the person a to-do
                    // they're unable to complete. Checked here rather than up front so someone
                    // already correctly parked on reserve or taxi (neither starting nor active
                    // bench) never counts toward the locked-out notice.
                    if ((isStarting || isBench) && hasKickedOff({ team: p.team })) {
                        lockedOut.push({ leagueName: league.name, name: `${p.first_name} ${p.last_name}` });
                        return;
                    }

                    if (isStarting) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Starting Lineup" });
                    } else if (isBench) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Active Bench (Move to IR)" });
                    }
                }
            });

            if (leagueIssues.length > 0) {
                auditResults.push({ leagueName: league.name, format: league.formatBadge || "", issues: leagueIssues });
            }
        }

        // States what was and wasn't covered, so a Best Ball league going unreported reads as a
        // deliberate exclusion rather than the audit having quietly missed it.
        const scanParts = [];
        if (scannedSleeper > 0) scanParts.push(`${scannedSleeper} Sleeper league${scannedSleeper === 1 ? '' : 's'}`);
        if (scannedManual > 0) scanParts.push(`${scannedManual} manual league${scannedManual === 1 ? '' : 's'}`);
        let summaryLine = scanParts.length > 0 ? `Scanned ${scanParts.join(' and ')}` : `No auditable leagues found`;
        if (skippedBestBall > 0) summaryLine += ` · Skipped ${skippedBestBall} Best Ball league${skippedBestBall === 1 ? '' : 's'}`;
        const summaryHTML = `<div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:0.75rem;">${escapeHtml(summaryLine)}</div>`;

        // Rendered AFTER the results in both branches below, never before: everything in this
        // notice is a dead end the person can't act on this week, so it sits underneath the
        // roster moves they can actually go make rather than pushing them down the page.
        //
        // It names names on purpose. A bare count would leave the person wondering which player
        // it meant and re-checking the roster by hand -- the whole point of listing them is so
        // they can confirm at a glance that the IR starter they already know about is the one
        // being excluded, not some other problem going unreported.
        let lockedHTML = "";
        if (lockedOut.length > 0) {
            const one = lockedOut.length === 1;
            const namesHTML = lockedOut
                .map(l => `${escapeHtml(l.name)} <span style="opacity:0.7;">(${escapeHtml(l.leagueName)})</span>`)
                .join(', ');
            lockedHTML = `
            <div class="info-banner" style="display:flex; margin-top: 1.25rem; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color:#fcd34d;">
                <div class="cluster cluster-sm">
                    <div class="info-banner-icon" aria-hidden="true" style="background:#f59e0b; color:white;">i</div>
                    <div><strong>${lockedOut.length} injured player${one ? '' : 's'} excluded (game already started):</strong> ${namesHTML}. Most platforms lock a roster spot once that player's game kicks off, so ${one ? 'this one' : 'these'} can't be moved until next week.</div>
                </div>
            </div>`;
        }

        if (auditResults.length === 0) {
            // Wording has to shift in both of these cases -- a flat "All clear!" is a claim
            // about rosters that were actually examined, and it reads as either a
            // contradiction (directly under a notice listing injured starters) or an outright
            // false negative (when nothing was examined at all).
            const clearText = scannedSleeper + scannedManual === 0
                ? `Nothing to audit. Best Ball leagues are skipped, and no other leagues were found.`
                : (lockedOut.length > 0
                    ? `Nothing actionable. Every injured player found is already locked in for this week.`
                    : `All clear! No injured players found in active slots across your leagues.`);
            outputEl.innerHTML = summaryHTML +
                `<div class="scout-result-card" style="justify-content:center; color:var(--primary-green);">${clearText}</div>` +
                lockedHTML;
        } else {
            let html = summaryHTML;
            auditResults.forEach(res => {
                html += `<div style="font-weight:bold; color:#fca5a5; margin: 1rem 0 0.5rem 0;">${escapeHtml(res.leagueName)} <span style="color:var(--text-muted); font-size: 0.75rem; font-weight: normal;">${escapeHtml(res.format)}</span></div>`;
                if (res.unmatched > 0) {
                    const one = res.unmatched === 1;
                    html += `<div style="color:var(--text-muted); font-size:0.75rem; font-style:italic; margin-bottom:0.5rem;">${res.unmatched} player${one ? '' : 's'} could not be matched to Sleeper's player database and ${one ? 'was' : 'were'} not checked. Re-add ${one ? 'that player' : 'those players'} using their full name to include them here.</div>`;
                }
                res.issues.forEach(issue => {
                    html += `
                    <div class="scout-result-card" style="border-color: #ef4444;">
                        <div>
                            <div class="mls-item-name">${escapeHtml(issue.name)}</div>
                            <div class="mls-meta-row">
                                <span style="color: #fca5a5; font-weight: bold;">${escapeHtml(issue.status)}</span>
                            </div>
                        </div>
                        <div class="mls-text-right">
                            <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${escapeHtml(issue.location)}</span>
                        </div>
                    </div>`;
                });
            });
            outputEl.innerHTML = html + lockedHTML;
        }

    } catch (err) {
        console.error('Global injury audit failed:', err);
        // Every message says the audit didn't finish, on purpose: an empty results panel after
        // an audit reads as "all clear," which is the one conclusion a failed run must not
        // leave behind. Three realistic causes, each with its own fix:
        //   * Connection -- the forced-fresh player map (~5MB) or a league's roster fetch
        //     failed or timed out. Common on phone data; retrying is the fix.
        //   * SyntaxError -- getSleeperLeagueRosters doesn't check res.ok, so when Sleeper is
        //     down or rate-limiting, its HTML/plain-text error page gets fed to res.json() and
        //     fails here. getSleeperPlayerMap checks, and throws an isSleeperResponseError
        //     error instead (refactor 2C follow-up); same message. Not the person's
        //     connection, so telling them to check it would send them the wrong way.
        //   * Anything else -- a saved league whose data isn't shaped the way the audit
        //     expects. Re-syncing rewrites it.
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper for current injury statuses, so the audit didn't finish - no leagues were checked. Check your connection and tap Run Global Audit again.`;
        } else if (err && (err.name === 'SyntaxError' || err.isSleeperResponseError)) {
            msg = `Sleeper sent back an unexpected response, so the audit didn't finish - no leagues were checked. Sleeper may be having problems; try Run Global Audit again in a few minutes.`;
        } else {
            msg = `The audit stopped partway through, so treat this as no result, not an all-clear. Some saved league data may be out of date - tap Sync All Leagues on the Dashboard, then run the audit again.`;
        }
        outputEl.innerHTML = `<span class="mls-error-text">${msg}</span>`;
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
};

// --- MATCHUP SIMULATOR (MONTE CARLO) ---
// Bound via onclick="runMatchupSim()" on #run-sim-btn, matching this file's existing
// convention of exposing handlers on window rather than addEventListener wiring (see
// switchActiveLeague, addEarlyTeam, etc.) -- runMatchupSimulation itself (from
// monteCarloUi.js) stays a pure hand-off to the Worker with no knowledge of State, matching
// how sleeperApi.js/marketDataApi.js/rankingsParser.js are kept free of State access too.
export const runMatchupSim = async function() {
    const btn = document.getElementById('run-sim-btn');
    const league = getActiveLeague();

    // Nothing else ever clears #monte-carlo-results, so without this every path that returns
    // below leaves the PREVIOUS run's card on screen -- a win probability for a different
    // week, lineup or league, sitting there looking like the answer to what was just asked.
    // Each of those paths now writes its reason into that same container: a toast that
    // vanishes after six seconds isn't enough on its own when the thing it's explaining is a
    // stale card that stays.
    clearSimResults();

    if (!league || league.leagueId.startsWith('manual_')) {
        const msg = "Sync a Sleeper league on the Dashboard first.";
        showSimNotice(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
        return;
    }
    if (!league.rosterId) {
        const msg = "Re-sync this league from the Dashboard to enable simulations.";
        showSimNotice(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
        return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Simulating…</span>`;
    }

    try {
        const nflState = await getNflState();
        // getNflState returns null only when Sleeper answered with an error status (a network
        // failure throws instead, and lands in the connection branch of the catch below). This
        // used to throw a generic Error here, which the catch had no way to tell apart from a
        // bug -- so it's reported in place, like the other early exits in this function.
        if (!nflState || typeof nflState.week !== 'number') {
            const msg = "Sleeper didn't return the current NFL week, so the simulation didn't run. Sleeper may be having problems - try Run Matchup Simulations again in a few minutes.";
            showSimNotice(msg, { isError: true });
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }
        const currentWeek = nflState.week;
        const season = nflState.league_season || nflState.season;
        const rosterMap = league.globalRosterMap || {}; // needed by Waiver Insights below, to exclude anyone already rostered in this league

        if (currentWeek < 2) {
            const msg = "Not enough completed weeks yet to estimate variance.";
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }

        // Needed for the actual-score check below (hasKickedOff) to be trustworthy for THIS
        // specific week -- State.currentNflWeek could still be null (first load) or stale
        // (background refresh hasn't caught up) at the moment this runs, and hasKickedOff
        // silently returns false for a team it has no data for, which would just make every
        // player fall back to their projection rather than error -- safe, but defeats the
        // point of checking at all. Syncing here and awaiting the fetch (see refreshGameTimes'
        // own comment on why it's awaitable) means this Run always uses kickoff data for the
        // actual week it's simulating, not whatever the last background refresh happened to be.
        State.currentNflWeek = currentWeek;
        await refreshGameTimes();

        const matchups = await getSleeperMatchups(league.leagueId, currentWeek);
        const myEntry = matchups.find(m => m.roster_id === league.rosterId);
        if (!myEntry || !myEntry.matchup_id) {
            const msg = `No matchup found for Week ${currentWeek} (bye week?).`;
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }
        const oppEntry = matchups.find(m => m.matchup_id === myEntry.matchup_id && m.roster_id !== league.rosterId);
        if (!oppEntry) {
            const msg = "Couldn't find an opponent for this week's matchup.";
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }

        // Sleeper pads empty slots with the literal string "0" rather than omitting them.
        const sleeperMyStarters = (myEntry.starters || []).filter(id => id && id !== '0');
        const oppStarters = (oppEntry.starters || []).filter(id => id && id !== '0');

        // Simulate the lineup the person is actually looking at in this tool, not necessarily
        // what's live on Sleeper -- State.manualStartersMap is the same in-app editable lineup
        // the optimizer/swap UI already reads and writes (see renderLineupUI), so a swap made
        // here but not yet pushed to Sleeper is reflected immediately. Only the opponent's side
        // has to come from Sleeper, since there's no in-app editing of their roster.
        const localStarters = State.manualStartersMap[league.leagueId] || [];
        const localStarterIds = localStarters.filter(s => s.player).map(s => s.player.id).filter(id => id && id !== '0');
        const usingLocalLineup = localStarterIds.length > 0;
        const myStarters = usingLocalLineup ? localStarterIds : sleeperMyStarters;

        const lineupDiffersFromSleeper = usingLocalLineup &&
            (myStarters.length !== sleeperMyStarters.length || !myStarters.every(id => sleeperMyStarters.includes(id)));

        // Bench comparisons only make sense against the in-app lineup -- there's no bench
        // context at all for Sleeper's raw current-week starters (myEntry.starters is just a
        // flat list of IDs with no slot assignment), and manualBenchMap is itself an in-app-only
        // concept. localStarters carries each player's slot (e.g. "RB1", "FLEX2"), needed below
        // to figure out which bench players are even eligible to replace which starter.
        // Taxi players live in manualBenchMap alongside real bench depth (see optimizeLineup),
        // but Lineup Insights' entire output is "swap this bench player in for that starter" --
        // a move the platform won't allow for someone on taxi. Filtered here rather than in
        // isExcludedFromSimulation, which answers a different question ("is this player likely
        // to take the field"): a healthy taxi rookie would pass that check and still be an
        // illegal suggestion.
        //
        // Bench players whose game has already kicked off are dropped for the same reason:
        // Sleeper won't let you move them into the lineup anymore, so "Player Y outscored
        // Player Z" after TNF (or the early Sunday slate) is a suggestion you can't act on.
        // refreshGameTimes was awaited above, so hasKickedOff is current for this week.
        const benchPool = usingLocalLineup
            ? (State.manualBenchMap[league.leagueId] || []).filter(p => !p.isTaxi && !hasKickedOff(p))
            : [];
        const benchIds = benchPool.map(p => p.id).filter(id => id && id !== '0');

        const scoringKey = getLeagueScoringKey(league);
        const { blended: history, currentSeasonOnly } = await getPlayerWeeklyScoreHistory(
            [...myStarters, ...oppStarters, ...benchIds], season, currentWeek, scoringKey,
            { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
        );

        // Needed to show names/positions next to each player's projected range in the
        // results panel -- the pipeline up to this point only deals in Sleeper player IDs.
        const playerMap = await getSleeperPlayerMap();

        // Sleeper's own weekly projection factors in this week's specific matchup, injury
        // designation, byes, etc. -- a better center-of-distribution estimate for THIS week
        // than a flat trailing average across every week played so far. A missing/failed
        // fetch (or a player Sleeper simply doesn't bother projecting -- common for deep
        // bench/waiver-tier guys) just means projectedMean stays null and that player falls
        // back to their historical average, exactly as before.
        const projections = await getWeeklyProjections(season, currentWeek);
        const getProjectedMean = (id) => {
            const proj = projections && projections[id];
            const val = proj ? proj[scoringKey] : undefined;
            return typeof val === 'number' ? val : null;
        };

        const toPlayerObj = (id, matchupEntry) => {
            const p = playerMap[id] || {};
            const name = p.first_name ? `${p.first_name} ${p.last_name}` : (p.last_name || id);
            // years_exp is Sleeper's own experience counter (0 for a player's rookie season) --
            // more reliable than inferring "rookie" from a lack of game history, which would
            // also catch a 2nd-year player coming back from an injury-lost season.
            //
            // actualScore: this week's real, already-recorded score, once this player's game
            // has actually started -- most relevant for Thursday Night, but just as real for
            // the Sunday early slate once it's wrapped up, or checking win odds ahead of
            // Sunday/Monday night with the early games already final.
            //
            // Whether a game has started is checked directly via hasKickedOff (the same
            // kickoff-time data already powering the lineup tab's kickoff badges and FLEX
            // auto-lock), NOT by looking at whether players_points is a positive number.
            // Points alone can't tell "hasn't played" apart from "played and scored": Sleeper
            // pre-populates players_points with 0 for every starter before kickoff, but a
            // real, already-played result can ALSO legitimately be 0 or negative (e.g. DJ
            // Moore's -0.1 in a real game he exited early from injury) -- so a value-based
            // check would either treat every pre-game player as final, or wrongly discard a
            // genuine low/negative result depending on which way it's biased. Kickoff time is
            // the actual fact being asked about ("has this game happened yet"); points were
            // never the right signal for that question, just a proxy that broke on both ends.
            const actualPts = matchupEntry && matchupEntry.players_points ? matchupEntry.players_points[id] : undefined;
            const playerTeam = p.team || '';
            const actualScore = (typeof actualPts === 'number' && hasKickedOff({ team: playerTeam })) ? actualPts : null;
            return {
                id, name, pos: p.position || '', team: playerTeam, weeklyScores: history[id] || [], currentSeasonScores: currentSeasonOnly[id] || [],
                isRookie: p.years_exp === 0, projectedMean: getProjectedMean(id),
                actualScore
            };
        };

        // Players with zero completed games (rookies, recent signings, bye-adjacent
        // call-ups with no prior season either) get excluded rather than contributing a
        // phantom mean-0 score to their team's total -- see getPlayerWeeklyScoreHistory's
        // contract for why a missing week isn't the same as a 0. Doubtful/Out/IR players are
        // excluded the same way and for a related reason: every profile this pipeline builds
        // implicitly assumes its subject is taking the field, and that's exactly what those
        // three statuses mean isn't a safe assumption right now (see isExcludedFromSimulation's
        // own comment on why this list is stricter than the lineup optimizer's). Applied here,
        // in the one place all three roster arrays (team1, team2, and the bench pool used for
        // Lineup Insights) are built, rather than only on team1/team2, so a Doubtful/Out/IR
        // bench player can't be suggested as a "swap in" pick either.
        let excludedCount = 0;
        let injuryExcludedCount = 0;
        const toPlayerObjs = (ids, matchupEntry) => ids.reduce((arr, id) => {
            const rawPlayer = playerMap[id] || {};
            if (isExcludedFromSimulation(rawPlayer)) { injuryExcludedCount++; return arr; }
            const playerObj = toPlayerObj(id, matchupEntry);
            if (playerObj.weeklyScores.length > 0) arr.push(playerObj); else excludedCount++;
            return arr;
        }, []);

        const team1Players = toPlayerObjs(myStarters, myEntry);
        const team2Players = toPlayerObjs(oppStarters, oppEntry);

        if (typeof window.showToast === 'function') {
            const exclusionNotes = [];
            if (excludedCount > 0) exclusionNotes.push(`${excludedCount} without enough game history yet`);
            if (injuryExcludedCount > 0) exclusionNotes.push(`${injuryExcludedCount} listed as Doubtful, Out, or IR`);
            if (exclusionNotes.length > 0) {
                window.showToast(`${exclusionNotes.join(' and ')} excluded from the simulation.`);
            }
        }

        // "Bench Player Y outscored Starting Player Z X% of the time" -- for each bench
        // player with enough history, find the starters slotAcceptsPos actually allows them
        // to replace (same eligibility the swap UI itself enforces, see slotAcceptsPos's own
        // comment), then compare against the weakest of those -- the one an actual lineup
        // swap would target -- rather than every eligible starter, which would just restate
        // the obvious for anyone but the weakest link. starterSlotTypes/team1ProfilesById are
        // computed once here (rather than nested inside the bench-only block below) since
        // Waiver Insights, right after, needs the exact same "which starter would this
        // replace" eligibility and profile lookup, just sourced from a different candidate
        // pool.
        const starterSlotTypes = localStarters
            .filter(s => s.player)
            .map(s => ({ id: s.player.id, slotType: s.slot.replace(/[0-9]/g, '') }));

        const team1ProfilesById = {};
        team1Players.forEach(p => { team1ProfilesById[p.id] = getPlayerVarianceProfile(p.weeklyScores, { projectedMean: p.projectedMean, actualScore: p.actualScore }); });

        // Given a candidate's own variance profile and position, finds the weakest eligible
        // starter they could replace and returns the win probability against that starter --
        // shared by both Lineup Insights (bench) and Waiver Insights (free agents) below,
        // since the eligibility rule and "compare against the weakest link" logic is identical
        // either way; only where the candidate came from differs.
        //
        // Starters whose game has already kicked off are never the target, for the mirror-
        // image reason bench players who already played are left out of benchPool above:
        // their slot is locked in Sleeper, so they can't be swapped out. Without this, a TNF
        // starter's final (a fixed, zero-variance number) could be flagged as the weakest link
        // and "lose" to a bench player you have no way to put in his place.
        const lockedStarterIds = new Set(team1Players.filter(p => hasKickedOff({ team: p.team })).map(p => p.id));
        const compareAgainstWeakestStarter = (candidateProfile, candidatePos) => {
            const eligibleStarterIds = starterSlotTypes
                .filter(s => slotAcceptsPos(s.slotType, candidatePos))
                .map(s => s.id)
                .filter(id => !lockedStarterIds.has(id))
                .filter(id => team1ProfilesById[id]); // must have a valid profile too
            if (eligibleStarterIds.length === 0) return null;

            const weakestStarterId = eligibleStarterIds.reduce((weakestId, id) =>
                team1ProfilesById[id].mean < team1ProfilesById[weakestId].mean ? id : weakestId
            );
            const weakestStarter = team1Players.find(p => p.id === weakestStarterId);
            const winPct = getProbabilityBeats(candidateProfile, team1ProfilesById[weakestStarterId]);
            return { weakestStarter, winPct };
        };

        const benchInsights = [];
        if (benchPool.length > 0) {
            const benchObjs = toPlayerObjs(benchIds, myEntry);

            benchObjs.forEach(benchPlayer => {
                const benchProfile = getPlayerVarianceProfile(benchPlayer.weeklyScores, { projectedMean: benchPlayer.projectedMean, actualScore: benchPlayer.actualScore });
                const result = compareAgainstWeakestStarter(benchProfile, benchPlayer.pos);
                if (!result) return;

                // Only worth flagging if the bench player is actually favored -- anything at
                // or below 50% just confirms the current starter is the right call, which
                // isn't an actionable "you should consider this swap" insight.
                if (result.winPct <= 50) return;

                benchInsights.push({
                    benchName: benchPlayer.name, benchPos: benchPlayer.pos, benchIsRookie: benchPlayer.isRookie,
                    starterName: result.weakestStarter.name, starterPos: result.weakestStarter.pos, starterIsRookie: result.weakestStarter.isRookie,
                    benchWinPct: result.winPct
                });
            });

            benchInsights.sort((a, b) => b.benchWinPct - a.benchWinPct);
            benchInsights.splice(5); // top 5 by margin -- the rest would just be noise
        }

        // --- WAIVER INSIGHTS ---
        // Same comparison as Lineup Insights above, pointed at available free agents instead
        // of your bench. Off by default (see the toggle in the Matchup Simulator card) since
        // it costs an extra round trip this function wouldn't otherwise make: free-agent
        // candidates come from a rankings file (a name and a rank -- no Sleeper id, no weekly
        // score history), so getting them into the same win-probability math as everyone else
        // here means resolving each one's Sleeper id and fetching their history separately,
        // rather than reusing the one batched history fetch already done above for your
        // roster and your opponent's.
        const waiverInsights = [];
        // What the waiver check actually did, so the results card can tell "nobody out there
        // beats your starters" apart from "the check never ran" -- an empty waiverInsights
        // list alone reads identically either way, which left people unsure whether the
        // toggle had done anything at all. Stays null while the toggle is off (nothing to
        // report). checkedCount counts only free agents that made it all the way through the
        // comparison (resolved to a Sleeper id, had score history, had an eligible starter
        // to measure against), so "checked N" never overstates the work.
        let waiverInsightsStatus = null;
        if (State.simSettings.waiverInsights) {
            // startersAllStarted / kickedOffCount let the empty-result message name the real
            // reason nothing was compared, now that already-started starters and free agents
            // are left out (see lockedStarterIds above and the candidates filter below).
            waiverInsightsStatus = {
                checkedCount: 0, positions: [], noRankings: false, failed: false,
                startersAllStarted: team1Players.length > 0 && team1Players.every(p => lockedStarterIds.has(p.id)),
                kickedOffCount: 0
            };
            const checkedPositions = new Set();
            try {
                if (State.rosRankings.length === 0 && State.marketRankings.length === 0) {
                    waiverInsightsStatus.noRankings = true;
                }
                const nameToIdIndex = await getCleanNameToIdIndex();
                const candidates = getTopWaiverCandidatesByPosition(rosterMap, 3)
                    .map(c => ({ ...c, id: nameToIdIndex[c.cleanName] }))
                    .filter(c => c.id && !isExcludedFromSimulation(playerMap[c.id]))
                    // A free agent whose game has kicked off is locked on Sleeper until next
                    // week -- same "can't act on it" reasoning as the bench filter above.
                    .filter(c => {
                        if (!hasKickedOff({ team: (playerMap[c.id] || {}).team })) return true;
                        waiverInsightsStatus.kickedOffCount++;
                        return false;
                    });

                if (candidates.length > 0) {
                    const candidateIds = candidates.map(c => c.id);
                    const { blended: waiverHistory } = await getPlayerWeeklyScoreHistory(
                        candidateIds, season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
                    );

                    candidates.forEach(c => {
                        const weeklyScores = waiverHistory[c.id] || [];
                        if (weeklyScores.length === 0) return; // same "not enough history" bar as everyone else

                        const rawPlayer = playerMap[c.id] || {};
                        const faPos = rawPlayer.position || c.pos;
                        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean: getProjectedMean(c.id) });
                        const result = compareAgainstWeakestStarter(profile, faPos);
                        if (!result) return;

                        waiverInsightsStatus.checkedCount++;
                        checkedPositions.add(faPos);
                        if (result.winPct <= 50) return;

                        waiverInsights.push({
                            faName: c.name, faPos,
                            starterName: result.weakestStarter.name, starterPos: result.weakestStarter.pos, starterIsRookie: result.weakestStarter.isRookie,
                            faWinPct: result.winPct
                        });
                    });

                    waiverInsights.sort((a, b) => b.faWinPct - a.faWinPct);
                    waiverInsights.splice(5);
                }
            } catch (err) {
                // Waiver Insights is a bonus layer on top of the main simulation -- a failure
                // here (a rankings/market fetch hiccup, an unresolvable name) shouldn't take
                // down the matchup simulation itself. The results card still says the check
                // didn't finish, rather than letting silence read as "no upgrades found".
                console.error('Waiver Insights failed:', err);
                waiverInsightsStatus.failed = true;
            }
            const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
            waiverInsightsStatus.positions = [...checkedPositions].sort((a, b) =>
                (POS_ORDER.indexOf(a) + 1 || 99) - (POS_ORDER.indexOf(b) + 1 || 99));
        }

        runMatchupSimulation(team1Players, team2Players, { lineupDiffersFromSleeper, benchInsights, waiverInsights, waiverInsightsStatus, currentWeek });
    } catch (err) {
        console.error('Matchup simulation failed:', err);
        // Same three-way split as runGlobalInjuryAudit's catch, for the same reasons:
        //   * Connection -- any of the Sleeper calls above (matchups, weekly stats, the ~5MB
        //     player map) failed or timed out. Retrying is the fix.
        //   * SyntaxError / isSleeperResponseError -- a Sleeper outage or rate-limit page:
        //     getSleeperPlayerMap throws the latter for a non-ok or malformed response (refactor
        //     2C follow-up); other calls fail in res.json(). Sleeper's side, not the connection.
        //   * Anything else -- most likely the saved lineup/roster for this league isn't in
        //     the shape this function expects (a non-ok matchups response lands here too,
        //     which in practice means the stored league ID is stale). Re-syncing rewrites both.
        // Worker failures never reach this catch -- runMatchupSimulation reports those itself.
        // Escaped because both showSimNotice and showToast write their message as HTML.
        const leagueName = escapeHtml(league.name || 'this league');
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper, so the simulation for ${leagueName} didn't run. Check your connection and tap Run Matchup Simulations again.`;
        } else if (err && (err.name === 'SyntaxError' || err.isSleeperResponseError)) {
            msg = `Sleeper sent back an unexpected response, so the simulation for ${leagueName} didn't run. Sleeper may be having problems - try again in a few minutes.`;
        } else {
            msg = `Couldn't run the simulation for ${leagueName} - its saved lineup or roster data may be out of date. Tap Sync All Leagues on the Dashboard, then run it again.`;
        }
        showSimNotice(msg, { isError: true });
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
};

    // loadSheetJS used to be defined here. mds.js needed the same lazy-load with the same
    // failure path (it had its own copy with no error handling at all), so it now lives in
    // js/utils.js as window.loadSheetJS alongside loadScriptOnce. The call sites above use it
    // directly; the (callback, onError) signature rankingsParser.js documents is unchanged.
