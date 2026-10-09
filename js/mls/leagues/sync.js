// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: LEAGUE & SYNC LOGIC
// (league dropdown, League Manager, switching the active league), the league functions that sat
// after LEAGUE-SCOPED SCOUT RESULTS (market defaults, loadActiveLeagueData, requirements, manual
// league), and the Sleeper sync (processSleeperData and its roster diff, addAndSyncLeague,
// syncActiveLeague), which sat under ADD PLAYER MANUALLY and IMPORT ALL LEAGUES.
import { getSleeperLeague, getSleeperLeagueRosters, getSleeperLeagueUsers, getSleeperPlayerMap, getSleeperUser } from '../../shared/api/sleeper.js';
import { clearSimResults } from '../sim/ui.js';
import { escapeHtml } from '../../shared/html.js';
import { RANKING_TYPE_CONFIG, fantasyPosition } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, getShortInjuryStatus, HARD_OUT_STATUSES, isBestBallLeague } from '../helpers.js';
import { updatePulsePrompts } from '../init.js';
import { isEarlyPlayer } from '../lineup/earlyGames.js';
import { sleeperLineupChanges } from '../lineup/issues.js';
import { clearLeagueScopedResults } from './scoutResults.js';
import { renderManualAddLog, setManualAddMsg } from './addPlayer.js';
import { runScout } from '../scout/engine.js';
import { getPowerLeagueKind, loadRosterTab, optimizeLineup, refreshTopAvailable, renderBestAvailable, renderLineupNeeds } from '../main.js';
import { updateRankingsMetaDisplay } from '../rankings/engine.js';
import { getFreshness } from '../../shared/freshness.js';
import { applyMarketSettingsToUI } from '../settings.js';
import { KEYS } from '../../shared/storage/keys.js';
import { flashButton } from '../../shared/ui/flashButton.js';
import { normalizeName } from '../../shared/names.js';
import { showConfirm } from '../../shared/ui/confirm.js';
import { showToast } from '../../shared/ui/toast.js';
import { STATUS_CHECK_ICON, STATUS_WARN_ICON, bestBallBadgeMarkup, pendingStatusIconMarkup } from '../badges.js';

    // --- LEAGUE & SYNC LOGIC ---
    export function refreshLeagueDropdown() {
        renderLeagueManager();
        renderHeaderLeagueSelect();
    }

    // The header's league <select> and its prev/next buttons, without the Dashboard's league
    // table (addLeagueAndOpen's switchActiveLeague draws that).
    function renderHeaderLeagueSelect() {
        const select = document.getElementById('headerLeagueSelect');
        if (!select) return;
        if (State.leagues.length === 0) {
            select.innerHTML = `<option value="">No Leagues</option>`;
            return;
        }
        let html = "";
        State.leagues.forEach(l => {
            let sel = l.leagueId === State.activeLeagueId ? "selected" : "";
            // League names are set by whoever runs the league on Sleeper, so they're escaped
            // like any other outside text. The id is escaped too; it's Sleeper's, not ours.
            html += `<option value="${escapeHtml(l.leagueId)}" ${sel}>${escapeHtml(l.name)}</option>`;
        });
        select.innerHTML = html;
        if (typeof updateLeagueNavUI === 'function') updateLeagueNavUI();
    }

    export function renderLeagueManager() {
        const cmdCenter = document.getElementById('dashboardCommandCenter');
        const tbody = document.getElementById('dashboardMatrixBody');
        
        if (!cmdCenter || !tbody) return;

        // The card under this one (scout/bestAvailable.js); it draws only while the Dashboard is shown.
        renderBestAvailable();
        // The "lineups need you" box under Optimize All (render/dashboard.js, improvements S11), from the
        // lineups as they are now: a league fixed since the run drops off.
        renderLineupNeeds();

        if (State.leagues.length === 0) {
            cmdCenter.style.display = 'none';
            return;
        }

        cmdCenter.style.display = 'block';
        let html = "";
        
        State.leagues.forEach((l, index) => {
            // --- Rankings Status Check ---
            let wDate = null;
            let wSet = l.weeklyRankingSetId ? State.rankingSets.weekly.find(s => s.id === l.weeklyRankingSetId) : null;
            if (wSet) wDate = wSet.updatedAt;
            else if (l.weeklyRankingsUpdatedAt) wDate = l.weeklyRankingsUpdatedAt;
            
            let wFresh = getFreshness(wDate, 6);
            let wIsStale = !wFresh || wFresh.isStale;

            let rankIcon = wIsStale 
                ? `<span class="status-icon status-warn tooltip-container">${STATUS_WARN_ICON}<span class="tooltip-text">Weekly Rankings Stale or Missing</span></span>`
                : `<span class="status-icon status-good tooltip-container">${STATUS_CHECK_ICON}<span class="tooltip-text">Weekly Rankings Fresh</span></span>`;

            // --- Lineup Match Check ---
            let isBestBall = isBestBallLeague(l);
            let starters = State.manualStartersMap[l.leagueId] || [];
            let optStarterIds = starters.filter(s => s.player).map(s => s.player.id);
            let sleeperStarters = (l.sleeperStarters || []).filter(id => id && id !== "0");
            
            let isMatch = false;
            let isSetup = optStarterIds.length > 0;
            
            if (isSetup && sleeperStarters.length > 0) {
                // The same comparison as the "lineups need you" box's Sleeper drop-down (improvements S11).
                const changes = sleeperLineupChanges(optStarterIds, sleeperStarters);
                isMatch = changes.start.length === 0 && changes.bench.length === 0;
            } else if (isSetup && l.leagueId.startsWith('manual_')) {
                isMatch = true; 
            }

            let lineupIcon = '';
            if (isBestBall) {
                lineupIcon = bestBallBadgeMarkup('<span class="tooltip-text">Best Ball (No Lineup Management)</span>');
            } else if (!isSetup) {
                lineupIcon = pendingStatusIconMarkup('<span class="tooltip-text">Not Optimized Yet</span>');
            } else if (isMatch) {
                lineupIcon = `<span class="status-icon status-good tooltip-container">${STATUS_CHECK_ICON}<span class="tooltip-text">Matches Sleeper Lineup</span></span>`;
            } else {
                lineupIcon = `<span class="status-icon status-danger tooltip-container">${STATUS_WARN_ICON}<span class="tooltip-text">Action Required: Differs from Sleeper Lineup</span></span>`;
            }

            // --- Early Game Check ---
            let hasEarly = false;
            if (isSetup) {
                hasEarly = starters.some(s => s.player && isEarlyPlayer(s.player.team));
            }
            let earlyIcon = hasEarly ? `<span class="badge early-badge tooltip-container" style="padding: 2px 4px; font-size: 0.6rem; margin-left: 6px; cursor: help;">EARLY<span class="tooltip-text">Starter has an Early Game</span></span>` : '';

            // --- Layout ---
            let formatText = l.formatBadge ? `<span style="display: block; color:var(--text-muted); font-size: 0.75rem; margin-top: 2px; font-weight: normal;">${l.formatBadge}</span>` : "";
            // Roster age. Manual and Draft Strategist handoff leagues are never synced from
            // Sleeper, so they get no label. A Sleeper league with no lastSyncedAt was last
            // synced before this was tracked -- flagged the same way the Rankings column treats
            // a missing date (stale), since we can't vouch for it. Past 2 days a waiver run or
            // trade has likely landed, so it goes amber.
            let syncText = "";
            if (!/^(manual|handoff)_/.test(l.leagueId)) {
                const syncFresh = getFreshness(l.lastSyncedAt, 2, 'Synced');
                const syncStale = !syncFresh || syncFresh.isStale;
                const syncLabel = syncFresh ? syncFresh.label : 'Last sync unknown';
                if (l.lastSyncFailedAt) {
                    // A failed sync outranks the age label: this roster is not just old, we
                    // know it's behind. Age still gets shown alongside it, since how stale the
                    // data is decides whether you can trust a lineup off it before retrying.
                    // Set in processSleeperData's catch, cleared on the next successful sync.
                    const staleFor = syncFresh ? syncFresh.label.replace(/^Synced /, 'from ') : 'never synced';
                    syncText = `<span class="sync-failed" style="display: block; font-size: 0.75rem; margin-top: 2px;">Last sync failed · roster ${staleFor}</span>`;
                } else {
                    syncText = `<span class="${syncStale ? 'freshness-stale' : 'freshness-ok'}" style="display: block; font-size: 0.75rem; margin-top: 2px;">${syncLabel}</span>`;
                }
            }
            let activeStyle = l.leagueId === State.activeLeagueId ? 'background: rgba(16, 185, 129, 0.08);' : '';
            let activeIndicator = l.leagueId === State.activeLeagueId ? `<div style="width: 3px; height: 100%; background: var(--primary-green); position: absolute; left: 0; top: 0;"></div>` : '';

            html += `
            <tr style="position: relative; ${activeStyle}">
                <td style="padding: 0; border-bottom: 1px solid var(--border); position: relative;">
                    ${activeIndicator}
                    <!-- A real button (was a clickable <td>) so the row can be reached with Tab and
                         switched to with Enter/Space. Fills the cell, so the click area is unchanged. -->
                    <button type="button" class="mls-league-row-btn" data-focus-key="row:${escapeHtml(l.leagueId)}" data-action="switchActiveLeague" data-league-id="${l.leagueId}" ${l.leagueId === State.activeLeagueId ? 'aria-current="true"' : ''}>
                        <strong style="color: var(--text-main); font-size: 0.9rem;">${escapeHtml(l.name)}</strong>
                        ${formatText}
                        ${syncText}
                    </button>
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); text-align: center;">
                    ${rankIcon}
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); text-align: center; white-space: nowrap;">
                    ${lineupIcon} ${earlyIcon}
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap;">
                    <button class="btn-sm btn-secondary mls-league-move-btn" style="padding: 0.3rem 0.5rem;" data-focus-key="up:${escapeHtml(l.leagueId)}" data-action="moveLeague" data-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(l.name)} up">▲</button>
                    <button class="btn-sm btn-secondary mls-league-move-btn" style="padding: 0.3rem 0.5rem;" data-focus-key="down:${escapeHtml(l.leagueId)}" data-action="moveLeague" data-index="${index}" data-direction="1" ${index === State.leagues.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeHtml(l.name)} down">▼</button>
                    <button class="btn-sm btn-danger" style="padding: 0.3rem 0.5rem; margin-left: 0.3rem;" data-action="deleteLeagueManager" data-league-id="${l.leagueId}" aria-label="Remove ${escapeHtml(l.name)}">✕</button>
                </td>
            </tr>`;
        });

        // Rebuilding the rows destroys whatever button had focus, which drops a keyboard user
        // back at the top of the page after every switch or reorder. Put focus back on the same
        // control for the same league (or its row, if that control is now disabled, e.g. ▲ on a
        // league that just moved to the top).
        const focusKey = tbody.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus-key') : null;
        tbody.innerHTML = html;
        if (focusKey) {
            const leagueId = focusKey.slice(focusKey.indexOf(':') + 1);
            const same = tbody.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
            const target = (same && !same.disabled) ? same : tbody.querySelector(`[data-focus-key="${CSS.escape('row:' + leagueId)}"]`);
            if (target) target.focus();
        }
    }

    export const moveLeague = function(index, direction) {
        if (index + direction < 0 || index + direction >= State.leagues.length) return;
        let temp = State.leagues[index];
        State.leagues[index] = State.leagues[index + direction];
        State.leagues[index + direction] = temp;
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        refreshLeagueDropdown();
    };

    export const deleteLeagueManager = async function(leagueId) {
        // Name the league being removed. The dashboard is a stack of identical ✕ buttons, so
        // "Remove this league?" asked you to trust you'd clicked the right row -- and getting
        // it wrong costs that league's rankings assignment and sync history. The name goes in
        // the body rather than the title: dialogMessageHTML escapes it (Sleeper league names
        // are set by whoever created the league, so they're outside text) and a long one wraps
        // better in a paragraph than in the h3.
        const league = State.leagues.find(l => l.leagueId === leagueId);
        const leagueLabel = league && league.name ? `"${league.name}"` : 'this league';
        // Manual and Draft Strategist handoff leagues have no Sleeper league behind them, so
        // don't offer a re-sync that can't happen -- rebuilding one means entering it by hand.
        const recovery = /^(manual|handoff)_/.test(leagueId)
            ? "It wasn't synced from Sleeper, so you'd have to set it up again by hand."
            : 'You can sync it again from Sleeper later.';
        if (!await showConfirm(`This removes ${leagueLabel} and its saved settings from the app. ${recovery}`, { title: 'Remove this league?', confirmText: 'Remove League', danger: true })) return;
        State.leagues = State.leagues.filter(l => l.leagueId !== leagueId);
        if (State.activeLeagueId === leagueId) {
            State.activeLeagueId = State.leagues.length > 0 ? State.leagues[0].leagueId : null;
            localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId || "");
        }
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        refreshLeagueDropdown();
        loadActiveLeagueData();
        updatePulsePrompts();
        if (typeof loadRosterTab === 'function') loadRosterTab();
        optimizeLineup(false);
    };

    // Loads a league's own ROS/Weekly rankings into State (its saved named set, else the
    // rankings stored on the league itself, else none). State.rosRankings/weeklyRankings are
    // what the optimizer and every card read, so anything that works league-by-league
    // (switchActiveLeague, Optimize All, Sync All) has to call this per league first, or
    // league B gets optimized with league A's rankings.
    export function hydrateRankingsForLeague(league) {
        if (!league) return;
        ['ros', 'weekly'].forEach(type => {
            const cfg = RANKING_TYPE_CONFIG[type];
            const found = getLeagueRankings(league, type);
            State[cfg.stateKey] = found ? [...found.data] : [];
            State[cfg.updatedAtKey] = found ? found.updatedAt : null;
        });
    }

    // One league's rankings of one type ('ros' | 'weekly'), read without making it the active league.
    // Priority: its named set, then its legacy per-league upload (from before named sets), then none
    // (null). hydrateRankingsForLeague loads these into State; the Dashboard's Best Available card
    // (scout/bestAvailable.js) reads every league's this way. `data` is the stored array: copy it
    // before changing it.
    export function getLeagueRankings(league, type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        if (!league || !cfg) return null;
        const setId = league[cfg.leagueSetIdKey];
        const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
        if (set) return { data: set.data, updatedAt: set.updatedAt, setName: set.name || null };
        const legacy = league[cfg.leagueLegacyDataKey];
        if (Array.isArray(legacy) && legacy.length > 0) return { data: legacy, updatedAt: league[cfg.leagueLegacyUpdatedKey] || null, setName: null };
        return null;
    }

    // Identifies the rankings a league currently resolves to, in the same priority order
    // hydrateRankingsForLeague uses: its named set (id + last-updated time, so re-uploading into
    // a set counts as a change), else its legacy per-league upload, else none. Weekly and ROS
    // both, since the optimizer falls back to ROS when there's no Weekly.
    export function getLeagueRankingsStamp(league) {
        if (!league) return '';
        return ['weekly', 'ros'].map(type => {
            const cfg = RANKING_TYPE_CONFIG[type];
            const setId = league[cfg.leagueSetIdKey];
            const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
            if (set) return `${set.id}@${set.updatedAt || 0}`;
            const legacy = league[cfg.leagueLegacyDataKey];
            if (Array.isArray(legacy) && legacy.length > 0) return `legacy@${league[cfg.leagueLegacyUpdatedKey] || 0}:${legacy.length}`;
            return 'none';
        }).join('|');
    }

    export const switchActiveLeague = function(leagueId) {
        if (!leagueId) return;
        State.activeLeagueId = leagueId;
        localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);
        
        // Keep UI elements in sync with the active state
        const headerSelect = document.getElementById('headerLeagueSelect');
        if (headerSelect && headerSelect.value !== leagueId) headerSelect.value = leagueId;
        if (typeof renderLeagueManager === 'function') renderLeagueManager();
        
        // HYDRATION: Unpack rankings for this specific league. Priority: named set assignment,
        // then legacy per-league data (from before named ranking sets existed), then empty --
        // deliberately NOT falling back to the global flat key anymore. That fallback used to
        // be exactly why a league with nothing of its own could appear to "inherit" whatever
        // another league had most recently active, rather than genuinely remembering its own.
        let league = getActiveLeague();
        if (league) {
            hydrateRankingsForLeague(league);
            updateRankingsMetaDisplay();
        }

        loadActiveLeagueData();
        State.swapSourceId = null;

        if (typeof updateLeagueNavUI === 'function') updateLeagueNavUI();
        // No scroll-to-top here anymore: flipping through leagues to compare the same card
        // (e.g. each league's Positional Power Rankings) meant scrolling back down every time.
        // The header's league switcher is sticky, so it's always reachable from where you are.

        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') optimizeLineup(false);
        if (activeTab === 'rosterTab') loadRosterTab();
        
        // The Waiver Wire Assistant's results area follows its mode (improvements S1): Top
        // Available redraws for the new league, Check a List re-runs a pasted list, and anything
        // else (Auto-Find, an empty list) is cleared.
        const waiverInput = document.getElementById('waiverInput');
        const waiverOutput = document.getElementById('waiverOutput');
        const waiverMode = State.waiverScanSettings.mode || 'top';
        if (waiverMode === 'top') refreshTopAvailable();
        else if (waiverMode === 'list' && waiverInput && waiverInput.value.trim() !== '') runScout('waiver');
        else if (waiverOutput) waiverOutput.innerHTML = '';
        
        // Trade Analyzer and Positional Power Rankings were already cleared by
        // loadActiveLeagueData above (see clearLeagueScopedResults). The trade used to be
        // re-run here against the new league, but a trade is built from one league's rosters,
        // so carrying it over to another league didn't make sense.

        // Same reasoning as the two output panes above, and the sim card is the worst of the
        // three to leave behind: it's headed "Your Team 61.4%" with no league name on it, so
        // switching from League A to League B silently presents League A's win probability
        // under League B's header. There's no equivalent of the re-run branches above -- the
        // sim is an explicit, network-bound action the user has to press Run for.
        clearSimResults();
    };

    // Adds a league the app builds itself (a manual league, a Draft Strategist hand-off) and
    // opens it the way switching to it would. switchActiveLeague is what loads the new league's
    // own rankings (none yet): without it State kept the previous league's, and the first
    // rankings save in the new league (saveActiveLeagueState) copied them into its legacy
    // per-league slots (improvements F4).
    export function addLeagueAndOpen(leagueObj) {
        State.leagues.push(leagueObj);
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        renderHeaderLeagueSelect();
        switchActiveLeague(leagueObj.leagueId);
    }

    export const cycleLeague = function(direction) {
        if (!State.leagues || State.leagues.length <= 1) return;
        
        const currentIndex = State.leagues.findIndex(l => l.leagueId === State.activeLeagueId);
        if (currentIndex === -1) return;
        
        let newIndex = currentIndex + direction;
        
        // Wrap around seamlessly
        if (newIndex < 0) newIndex = State.leagues.length - 1;
        if (newIndex >= State.leagues.length) newIndex = 0;
        
        const newLeagueId = State.leagues[newIndex].leagueId;
        
        // Ensure the dropdown UI updates visually before triggering the data switch
        const selectEl = document.getElementById('headerLeagueSelect');
        if (selectEl) selectEl.value = newLeagueId;
        
        switchActiveLeague(newLeagueId);
    };

    function updateLeagueNavUI() {
        const prevBtn = document.getElementById('prevLeagueBtn');
        const nextBtn = document.getElementById('nextLeagueBtn');
        
        if (!State.leagues || State.leagues.length <= 1) {
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        if (prevBtn) prevBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = false;
    }
    export function saveActiveLeagueState() {
        let league = getActiveLeague();
        if (league) {
            // Only sync the legacy per-league copy when this league ISN'T using a named ranking
            // set -- once a set is assigned, its data lives once in State.rankingSets (referenced
            // by id, not copied per league), so writing a full copy here on every save would
            // silently reintroduce the exact duplication named ranking sets exist to avoid.
            if (!league.rosRankingSetId) {
                league.rosRankings = [...State.rosRankings];
                league.rosRankingsUpdatedAt = State.rosRankingsUpdatedAt;
            }
            if (!league.weeklyRankingSetId) {
                league.weeklyRankings = [...State.weeklyRankings];
                league.weeklyRankingsUpdatedAt = State.weeklyRankingsUpdatedAt;
            }
        }
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
    }

    // Points the Market Consensus controls (Scout tab, plus the Roster tab's copy -- they share
    // State.marketSettings) at the active league's own format, so a fetch is priced for the
    // league you're looking at without re-picking four dropdowns every time you switch. Runs on
    // every active-league change and after a sync (both go through loadActiveLeagueData), so
    // it's a default, not a lock: changing a dropdown still works and holds until the next
    // switch. Only what the league actually knows is set -- a manual league has no scoring or
    // league type from Sleeper, so those keep whatever was last chosen. Source is a
    // preference, not a league setting, and is left alone (only FantasyCalc since refactor 7A).
    function applyLeagueDefaultsToMarketSettings(league) {
        if (!league) return;
        const s = State.marketSettings;
        const badge = league.formatBadge || '';

        if (league.leagueType || badge) s.type = getPowerLeagueKind(league); // 'dynasty' (incl. keeper) or 'redraft'
        if (league.reqs) s.qbs = ((league.reqs.SFLEX || 0) > 0 || (league.reqs.QB || 0) >= 2) ? '2' : '1';
        if (typeof league.pprVal === 'number') {
            // FantasyCalc only offers 1 / 0.5 / 0, so an unusual value (e.g. 0.25 PPR) rounds to the nearest.
            s.ppr = league.pprVal >= 0.75 ? '1' : (league.pprVal >= 0.25 ? '0.5' : '0');
        }
        if (badge) s.tep = /\bTEP\b/.test(badge);

        localStorage.setItem(KEYS.mls.marketSettings, JSON.stringify(s));
        applyMarketSettingsToUI();
    }

    export function loadActiveLeagueData() {
        clearLeagueScopedResults();
        let league = getActiveLeague();
        if (!league) return;
        applyLeagueDefaultsToMarketSettings(league);
        
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('reqQB', reqs.QB);
        setVal('reqRB', reqs.RB);
        setVal('reqWR', reqs.WR);
        setVal('reqTE', reqs.TE);
        setVal('reqFLEX', reqs.FLEX);
        setVal('reqWRTE', reqs.WRTE || 0);
        setVal('reqWRRB', reqs.WRRB || 0);
        setVal('reqSFLEX', reqs.SFLEX);
        setVal('reqK', reqs.K !== undefined ? reqs.K : 1);
        setVal('reqDEF', reqs.DEF !== undefined ? reqs.DEF : 1);
        
        const titleEl = document.getElementById('activeLeagueReqTitle');
        if (titleEl) titleEl.innerText = `(${league.name})`;
        setVal('sleeperUsername', league.username !== "Manual" ? league.username : "");
        renderManualAddLog(); // show only this league's session adds
    }

    export const saveRequirements = function(btn) {
        let league = getActiveLeague();
        if (!league) { showToast("Please select or add a league first.", { isError: true }); return; }
        const getInt = id => parseInt(document.getElementById(id)?.value) || 0;
        league.reqs = {
            QB: getInt('reqQB'), RB: getInt('reqRB'), WR: getInt('reqWR'),
            TE: getInt('reqTE'), FLEX: getInt('reqFLEX'), WRTE: getInt('reqWRTE'), WRRB: getInt('reqWRRB'), SFLEX: getInt('reqSFLEX'),
            K: getInt('reqK'), DEF: getInt('reqDEF')
        };
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        if (btn) flashButton(btn, "Requirements Saved");
        optimizeLineup(true);
        // The Roster tab's position counts show a position you have none of only when a slot takes it
        // (improvements S9), so a new K or DEF count shows up, or goes, right away.
        loadRosterTab();
    };

    export const createManualLeague = function() {
        const nameInput = document.getElementById('newLeagueName');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) { showToast("Please enter a League Name to create a manual league.", { isError: true }); return; }

        let newId = 'manual_' + Date.now();
        let leagueObj = {
            leagueId: newId, name: name, username: "Manual",
            reqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1 }, roster: [], globalRosterMap: {},
            rosRankings: [], weeklyRankings: [], rosRankingsUpdatedAt: null, weeklyRankingsUpdatedAt: null,
            rosRankingSetId: null, weeklyRankingSetId: null
        };
        if (nameInput) nameInput.value = "";
        addLeagueAndOpen(leagueObj);

        setManualAddMsg(`Manual League '${name}' Created`, { clearAfterMs: 3000 });
    };

    // Compares two roster arrays (same shape as rosterDetails: {cleanName, name, inj, ...}) by
    // cleanName and returns:
    //   - added/dropped: display names for players who entered/left the roster
    //   - newlyOut: display names for players who were still rostered but crossed into a
    //     HARD_OUT_STATUSES injury status they weren't in before (e.g. Q -> OUT, or nothing -> IR)
    // Deliberately does NOT surface Q/D fluctuations, recoveries, or team/bye changes -- those
    // are either too noisy (Q/D shift constantly) or effectively never happen mid-season (team,
    // bye), so they'd add clutter without adding much signal to a re-sync toast.
    function diffRosterChanges(prevRoster, newRoster) {
        const prevMap = new Map((prevRoster || []).map(p => [p.cleanName, p]));
        const newMap = new Map((newRoster || []).map(p => [p.cleanName, p]));
        const added = [];
        const dropped = [];
        const newlyOut = [];
        newMap.forEach((p, cleanName) => {
            const prevP = prevMap.get(cleanName);
            if (!prevP) {
                added.push(p.name);
            } else {
                const wasHardOut = prevP.inj && HARD_OUT_STATUSES.includes(prevP.inj);
                const isHardOut = p.inj && HARD_OUT_STATUSES.includes(p.inj);
                if (isHardOut && !wasHardOut) newlyOut.push(`${p.name} (${p.inj})`);
            }
        });
        prevMap.forEach((p, cleanName) => { if (!newMap.has(cleanName)) dropped.push(p.name); });
        return { added, dropped, newlyOut };
    }

    // Keeps the "Added: X, Y, Z" toast readable when a big roster shuffle (or a first-time
    // sync misclassified as a refresh) would otherwise dump a huge name list on the user.
    export function formatNameList(names) {
        if (names.length <= 4) return names.join(', ');
        return `${names.slice(0, 4).join(', ')} +${names.length - 4} more`;
    }

    export async function processSleeperData(username, leagueId, btn, isRefresh = false, preloaded = {}, suppressErrorToast = false, showChangeSummary = false, skipSave = false) {
        // Flipped once the fresh leagueObj is in State.leagues. The catch below covers steps
        // that run after that (optimizeLineup, loadRosterTab...), and a throw there doesn't mean
        // the stored roster is behind -- so it mustn't earn the "Last sync failed" flag.
        let rosterSaved = false;
        try {
            let userId = preloaded.userId;
            if (!userId) {
                userId = (await getSleeperUser(username)).user_id;
            }

            const leagueData = await getSleeperLeague(leagueId);
            let leagueName = leagueData.name || "My League";
            
            let formatBadge = "";
            if (leagueData.settings) {
                let typeStr = leagueData.settings.type === 2 ? "Dynasty" : (leagueData.settings.type === 1 ? "Keeper" : "Redraft");
                if (leagueData.settings.best_ball === 1) typeStr = "Best Ball";
                let pprVal = leagueData.scoring_settings?.rec || 0;
                let pprStr = pprVal === 1 ? "PPR" : (pprVal === 0.5 ? "Half-PPR" : "Std");
                let isSF = leagueData.roster_positions?.includes("SUPER_FLEX") ? "SF" : "1QB";
                let tepVal = leagueData.scoring_settings?.bonus_rec_te || 0;
                let tepStr = tepVal > 0 ? `TEP (+${tepVal})` : "";
                formatBadge = `${typeStr} ${isSF} ${pprStr} ${tepStr}`.trim();
            }

            // REC_FLEX (WR/TE) and WRRB_FLEX (WR/RB) are their own slot types since improvements S1;
            // counting them as FLEX let the optimizer start an RB in a W/T slot.
            let autoReqs = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, WRTE: 0, WRRB: 0, SFLEX: 0, K: 0, DEF: 0 };
            if (leagueData.roster_positions) {
                leagueData.roster_positions.forEach(pos => {
                    if (pos === 'QB') autoReqs.QB++;
                    else if (pos === 'RB') autoReqs.RB++;
                    else if (pos === 'WR') autoReqs.WR++;
                    else if (pos === 'TE') autoReqs.TE++;
                    else if (pos === 'FLEX') autoReqs.FLEX++;
                    else if (pos === 'REC_FLEX') autoReqs.WRTE++;
                    else if (pos === 'WRRB_FLEX') autoReqs.WRRB++;
                    else if (pos === 'SUPER_FLEX') autoReqs.SFLEX++;
                    else if (pos === 'K') autoReqs.K++;
                    else if (pos === 'DEF') autoReqs.DEF++;
                });
            } else {
                autoReqs = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };
            }

            if (btn) btn.innerText = "Mapping League…";
            const usersData = await getSleeperLeagueUsers(leagueId);
            let userMap = {};
            usersData.forEach(u => userMap[u.user_id] = u.display_name);

            const rosters = await getSleeperLeagueRosters(leagueId);
            
            if (btn) btn.innerText = "Loading Players…";
            const playerMap = preloaded.playerMap || await getSleeperPlayerMap();

            let myTeam = rosters.find(r => r.owner_id === userId);
            if (!myTeam && !isRefresh) throw new Error("Could not find your team in this league.");
            let sleeperStarters = myTeam && myTeam.starters ? myTeam.starters : [];
            
            let globalRosterMap = {};
            let globalPosMap = {}; 
            rosters.forEach(r => {
                let ownerName = userMap[r.owner_id] || "Unknown Team";
                if (r.owner_id === userId) ownerName = "You";
                
                if (r.players) {
                    r.players.forEach(pId => {
                        let p = playerMap[pId];
                        if (p) {
                            let clean = normalizeName(`${p.first_name} ${p.last_name}`);
                            globalRosterMap[clean] = ownerName;
                            // Fantasy position: a two-way player such as Travis Hunter (listed DB,
                            // scored at WR) is a WR here, so he can fill a WR/FLEX slot (9C).
                            globalPosMap[clean] = fantasyPosition(p) || "FLEX";
                        }
                    });
                }
            });

            let rosterDetails = [];
            // Sleeper lists taxi-squad players in their own array but ALSO leaves them in
            // `players`, so without this they'd be indistinguishable from real bench depth --
            // eligible to be slotted as starters by the optimizer and counted as active bench
            // by the Global Injury Auditor, neither of which is true of a taxi player. Empty
            // on leagues with no taxi squad configured, hence the fallback.
            const taxiIds = new Set((myTeam && myTeam.taxi) || []);
            // Sleeper's IR slot (the roster's `reserve` array), kept like taxi so the Roster tab can
            // count and badge IR-slot players (improvements S9). Also left in `players`; empty on
            // leagues with no IR slots.
            const reserveIds = new Set((myTeam && myTeam.reserve) || []);
            if (myTeam && myTeam.players) {
                myTeam.players.forEach(id => {
                    let p = playerMap[id];
                    if (p) {
                        rosterDetails.push({
                            id: id,
                            name: `${p.first_name} ${p.last_name}`,
                            cleanName: normalizeName(`${p.first_name} ${p.last_name}`),
                            pos: fantasyPosition(p) || "FLEX",
                            team: p.team || "FA",
                            inj: getShortInjuryStatus(p),
                            isTaxi: taxiIds.has(id),
                            isReserve: reserveIds.has(id)
                        });
                    }
                });
            }

            let existingIdx = State.leagues.findIndex(l => l.leagueId === leagueId);
            let existingLeague = existingIdx !== -1 ? State.leagues[existingIdx] : null;

            // Stored separately from formatBadge because the badge swaps its type word for
            // "Best Ball" -- a dynasty best-ball league would otherwise read as redraft to the
            // Power Rankings' Contender/Retool/Rebuild labels (see getPowerLeagueKind).
            const leagueType = leagueData.settings
                ? (leagueData.settings.type === 2 ? 'dynasty' : (leagueData.settings.type === 1 ? 'keeper' : 'redraft'))
                : 'redraft';

            let leagueObj = {
                leagueId: leagueId, name: leagueName, username: username, formatBadge: formatBadge, leagueType: leagueType,
                reqs: autoReqs, roster: rosterDetails, globalRosterMap: globalRosterMap,
                globalPosMap: globalPosMap, sleeperStarters: sleeperStarters,
                // Needed by the Matchup Simulator: rosterId identifies "us" within this
                // league's matchups endpoint response, and pprVal (already computed above for
                // the format badge) says which of Sleeper's pts_ppr/pts_half_ppr/pts_std
                // fields is the right one to read out of historical weekly stats.
                rosterId: myTeam ? myTeam.roster_id : null,
                pprVal: leagueData.scoring_settings?.rec || 0,
                // Preserve this league's existing rankings assignment across a re-sync rather
                // than rebuilding it from whatever happens to be currently active in State --
                // a re-sync should only refresh roster/matchup data, not silently reassign
                // rankings. A genuinely new league starts with nothing assigned.
                rosRankings: existingLeague ? existingLeague.rosRankings : [],
                weeklyRankings: existingLeague ? existingLeague.weeklyRankings : [],
                rosRankingsUpdatedAt: existingLeague ? existingLeague.rosRankingsUpdatedAt : null,
                weeklyRankingsUpdatedAt: existingLeague ? existingLeague.weeklyRankingsUpdatedAt : null,
                rosRankingSetId: existingLeague ? existingLeague.rosRankingSetId : null,
                weeklyRankingSetId: existingLeague ? existingLeague.weeklyRankingSetId : null,
                // Set only here, i.e. only once every Sleeper fetch above has succeeded. A league
                // that fails during Sync All keeps its previous object, and with it its previous
                // lastSyncedAt -- which is exactly what the dashboard row's age label surfaces.
                lastSyncedAt: Date.now()
                // lastSyncFailedAt is deliberately NOT carried over from existingLeague the way
                // the fields above are: rebuilding leagueObj without it is what clears the
                // dashboard's "Last sync failed" flag once a league syncs cleanly again. If this
                // object ever starts spreading existingLeague, clear the field explicitly.
            };

            // Capture the "what changed" diff before existingLeague's roster is overwritten below.
            // Only meaningful for a re-sync of a league we'd already stored a roster for --
            // a brand-new league (existingLeague null) has nothing to diff against, and every
            // player would show up as "Added", which isn't useful signal.
            let rosterDiff = null;
            if (isRefresh && showChangeSummary && existingLeague) {
                rosterDiff = diffRosterChanges(existingLeague.roster, rosterDetails);
            }

            if (existingIdx !== -1) State.leagues[existingIdx] = leagueObj;
            else State.leagues.push(leagueObj);
            rosterSaved = true;

            State.activeLeagueId = leagueId;
            // Load this league's own rankings before optimizeLineup below reads State: a league
            // synced for the first time has none, and keeping the previous league's meant its
            // first lineup was built from them and its first rankings save copied them into its
            // legacy slots (improvements F4). A re-sync keeps its assignment (leagueObj above),
            // so this reloads the same rankings. The card display is refreshed here only for a
            // single-league sync: the bulk callers refresh it once after their loop.
            hydrateRankingsForLeague(leagueObj);
            if (!skipSave) updateRankingsMetaDisplay();
            // Bulk callers (importAllSleeperLeagues, syncAllLeagues) pass skipSave=true and
            // write to localStorage once after their loop finishes, instead of every iteration
            // serializing the entire State.leagues array to disk.
            if (!skipSave) {
                localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
                localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);
            }

            if (!isRefresh) {
                const nLeagueNameEl = document.getElementById('newLeagueName');
                const sLeagueIdEl = document.getElementById('sleeperLeagueId');
                if (nLeagueNameEl) nLeagueNameEl.value = "";
                if (sLeagueIdEl) sLeagueIdEl.value = "";
                refreshLeagueDropdown(); 
                loadActiveLeagueData();
            }
            
            optimizeLineup(true); 
            loadRosterTab();
            
            if (btn) flashButton(btn, isRefresh ? "Sync Complete" : "Synced Successfully", false, isRefresh ? 'Sync Sleeper Waivers & Trades' : "Sync Sleeper");

            if (rosterDiff && (rosterDiff.added.length || rosterDiff.dropped.length || rosterDiff.newlyOut.length)) {
                const parts = [];
                if (rosterDiff.added.length) parts.push(`Added: ${formatNameList(rosterDiff.added)}`);
                if (rosterDiff.dropped.length) parts.push(`Dropped: ${formatNameList(rosterDiff.dropped)}`);
                if (rosterDiff.newlyOut.length) parts.push(`Now OUT: ${formatNameList(rosterDiff.newlyOut)}`);
                showToast(parts.join(' · '));
            }

            if (typeof updatePulsePrompts === 'function') updatePulsePrompts();
            return rosterDiff || true;

        } catch(err) {
            console.error(err);
            // Stamp the failure on the stored league so the dashboard row can flag it. The only
            // trace of a failed sync used to be a toast -- Sync All's summary names the leagues
            // it couldn't reach, but that's gone in seconds, and the row's age label reads off
            // lastSyncedAt, so a league that synced fine yesterday and failed today still looked
            // healthy until the 2-day staleness threshold caught up. Cleared on the next
            // success, where leagueObj is rebuilt without this field.
            //
            // A brand-new league whose first sync failed was never stored, so there's nothing to
            // find here -- correct, since there's no stale roster to warn about. Likewise a sync
            // that throws after rosterSaved: the stored roster is the fresh one, so the flag
            // would be a false alarm.
            try {
                const failedLeague = rosterSaved ? null : State.leagues.find(x => x.leagueId === leagueId);
                if (failedLeague) {
                    failedLeague.lastSyncFailedAt = Date.now();
                    // Bulk callers (importAllSleeperLeagues, syncAllLeagues) pass skipSave=true
                    // and write State.leagues once after their loop, which picks this up along
                    // with that run's successes.
                    if (!skipSave) {
                        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
                        // Single-league syncs don't otherwise re-render the dashboard, so the row
                        // would keep showing the old age label until something else redrew it.
                        // Sync All does its own render in the finally, after the whole loop.
                        if (typeof renderLeagueManager === 'function') renderLeagueManager();
                    }
                }
            } catch (e) {
                // Never let flagging the failure swallow the failure itself -- the toast below
                // is the part the user actually needs.
                console.error(e);
            }
            if (btn) flashButton(btn, "Sync Failed", true, isRefresh ? 'Sync Sleeper Waivers & Trades' : "Sync Sleeper");
            if (!suppressErrorToast) showToast(`Sync Error:\n${err.message}`, { isError: true });
            return false;
        }
    }

    export const addAndSyncLeague = function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim() || "";
        const leagueId = document.getElementById('sleeperLeagueId')?.value.trim() || "";
        if (!username || !leagueId) { showToast("Please enter both Sleeper Username and League ID to sync.", { isError: true }); return; }
        // Just the label changes here -- flashButton (called inside processSleeperData once
        // the sync finishes) handles the actual color flash and restores the button to its
        // "Sync Sleeper" text afterward. Previously this line also force-set an inline
        // background color, which flashButton would then capture as the color to restore to
        // once its flash finished -- permanently overriding the button's real ".btn-blue" CSS
        // color with this purple for the rest of the session after the first sync.
        if (btn) { btn.innerText = "Syncing…"; }
        processSleeperData(username, leagueId, btn, false);
    };

    export const syncActiveLeague = function() {
        let league = getActiveLeague();
        if (!league || !league.leagueId || league.leagueId.startsWith('manual_') || !league.username) {
            showToast("Only Sleeper-synced leagues can be refreshed via this button.", { isError: true }); return;
        }
        const btn = document.getElementById('rosterSyncBtn');
        if (btn) btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Syncing…</span>`;
        // showChangeSummary=true: this is a single, user-initiated re-sync, so a roster diff
        // toast is useful signal. The bulk "import all leagues" path deliberately leaves this
        // off (see importAllSleeperLeagues) since a diff per league would be noisy there.
        processSleeperData(league.username, league.leagueId, btn, true, {}, false, true);
    };
