// Moved from lineup/mls.js in refactor chunk 3A: INITIALIZATION (the setup checklist and the
// pulse prompts). Chunk 3E added the page's window.onload handler (from legacy.js, where 3A-3D left
// it) and STARTUP CLEANUP.
import { State, refreshCurrentNflWeek, applyLineupSettingsToUI } from './state.js';
import { isBestBallLeague, getActiveLeague } from './helpers.js';
import { updateDrawerActiveState } from './nav.js';
import { setRankingsCardExpanded, updateRankingsMetaDisplay } from './rankings/engine.js';
import { RANKING_TYPE_CONFIG } from './constants.js';
import { attachPlayerAutocomplete, attachScoutSuggestionHandler } from './players.js';
import { populateEarlyGameDropdown } from './lineup/earlyGames.js';
import { loadActiveLeagueData, refreshLeagueDropdown } from './leagues/sync.js';
import { initManualAddForm } from './leagues/addPlayer.js';
import { applyWaiverScanSettingsToUI } from './scout/waivers.js';
import { applySimSettingsToUI, applyTradeSettingsToUI, applyMarketSettingsToUI } from './settings.js';
import { checkForDraftStrategistHandoff, generateSoSGrid, updateMarketMetaDisplay, renderSyncLogs, showTab, lookupSimPlayer } from './main.js';
import { KEYS } from '../shared/storage/keys.js';
import { getTabFromHash } from '../shared/ui/tabHash.js';

    // --- INITIALIZATION ---
    // Where each setup step gets done: the tab it lives on, the card to reveal, and the control
    // to focus once there. Shared by the checklist's buttons and goToSetupStep.
    const SETUP_STEPS = {
        leagues: { tab: 'setup',  tabLabel: 'Dashboard', cardId: 'setupSyncCard',      focusId: 'sleeperUsername' },
        ros:     { tab: 'roster', tabLabel: 'Roster',    cardId: 'rosRankingsCard',    focusId: 'rosFileInput' },
        weekly:  { tab: 'lineup', tabLabel: 'Lineup',    cardId: 'weeklyRankingsCard', focusId: 'weeklyFileInput' },
    };

    // Takes the user to where a setup step gets done: switches tab if needed, opens the
    // rankings card if it's collapsed, scrolls it into view and focuses its first control.
    export const goToSetupStep = function(step) {
        const cfg = SETUP_STEPS[step];
        if (!cfg) return;
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || activeTab.id !== cfg.tab + 'Tab') {
            showTab(cfg.tab);
            updateDrawerActiveState(cfg.tab);
        }
        if (step !== 'leagues') setRankingsCardExpanded(cfg.cardId, true);
        const card = document.getElementById(cfg.cardId);
        if (!card) return;
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        const focusEl = document.getElementById(cfg.focusId);
        if (focusEl && focusEl.offsetParent !== null) focusEl.focus({ preventScroll: true });
    };

    // Fills one setup-checklist <li>. The ✓ / — mark is decorative; the sr-only prefix
    // carries the done/not-done state for screen readers. `how` (a sentence of instructions)
    // and the jump button only appear on unfinished steps the user can act on right now.
    function renderSetupStep(id, step, done, text, how, activeTabId) {
        const li = document.getElementById(id);
        if (!li) return;
        li.classList.toggle('is-done', done);
        li.classList.toggle('is-actionable', !done && !!how);
        const mark = document.createElement('span');
        mark.className = 'setup-step-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = done ? '✓' : '—';
        const body = document.createElement('div');
        body.className = 'setup-step-body';
        const label = document.createElement('div');
        label.className = 'setup-step-label';
        const status = document.createElement('span');
        status.className = 'sr-only';
        status.textContent = done ? 'Done: ' : 'Not done: ';
        label.append(status, text);
        body.append(label);

        if (!done && how) {
            const cfg = SETUP_STEPS[step];
            const howEl = document.createElement('p');
            howEl.className = 'setup-step-how';
            howEl.textContent = how;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mls-btn-sm btn-link-inline setup-step-go';
            btn.textContent = activeTabId === cfg.tab + 'Tab' ? 'Show me ↓' : `Go to ${cfg.tabLabel} tab →`;
            btn.setAttribute('aria-label', `${btn.textContent.slice(0, -2)} for ${text}`);
            btn.addEventListener('click', () => goToSetupStep(step));
            body.append(howEl, btn);
        }
        li.replaceChildren(mark, body);
    }

    export function updatePulsePrompts() {
        // The three setup states. The checklist states them in words; the pulses below
        // highlight whichever card is next.
        const leagueCount = State.leagues.length;
        const hasLeagues = leagueCount > 0;
        const hasRos = State.rosRankings.length > 0;
        // Best Ball sets its own lineups, so there's no weekly lineup to rank for -- the rest of
        // the app skips it too (Optimize All, the injury audit). Count the step as done there.
        // Like the rankings themselves, this follows the active league.
        const activeLeague = getActiveLeague();
        const weeklyNotNeeded = isBestBallLeague(activeLeague);
        const hasWeekly = State.weeklyRankings.length > 0 || weeklyNotNeeded;

        // Setup Checklist. Dashboard shows all three steps until everything is in place;
        // Roster and Lineup show only their own step (ROS / Weekly) while it's unfinished --
        // or the league step in its place, since rankings are per-league and can't be added
        // before one exists. Hidden on every other tab.
        const checklist = document.getElementById('setupChecklist');
        if (checklist) {
            const activeTab = document.querySelector('.tab-content.active');
            const activeTabId = activeTab ? activeTab.id : '';
            const doneState = { leagues: hasLeagues, ros: hasRos, weekly: hasWeekly };
            const allDone = hasLeagues && hasRos && hasWeekly;
            let visibleSteps = [];
            if (activeTabId === 'setupTab') visibleSteps = allDone ? [] : ['leagues', 'ros', 'weekly'];
            else if (activeTabId === 'rosterTab') visibleSteps = !hasLeagues ? ['leagues'] : (!hasRos ? ['ros'] : []);
            else if (activeTabId === 'lineupTab') visibleSteps = !hasLeagues ? ['leagues'] : (!hasWeekly ? ['weekly'] : []);
            checklist.style.display = visibleSteps.length > 0 ? '' : 'none';
            [['setupStepLeagues', 'leagues'], ['setupStepRos', 'ros'], ['setupStepWeekly', 'weekly']].forEach(([id, step]) => {
                const li = document.getElementById(id);
                if (li) li.style.display = visibleSteps.includes(step) ? '' : 'none';
            });
            const title = document.getElementById('setupChecklistTitle');
            if (title) title.textContent = `Setup Progress · ${Object.values(doneState).filter(Boolean).length} of 3 done`;
            renderSetupStep('setupStepLeagues', 'leagues', hasLeagues,
                hasLeagues ? `${leagueCount} league${leagueCount === 1 ? '' : 's'} synced` : 'Sync or create a league',
                "In Add/Sync League, enter your Sleeper username and tap Import All My Leagues. Not on Sleeper? Tap Create Manual instead.",
                activeTabId);
            // Rankings belong to each league, so with several leagues the ROS/Weekly steps name
            // the active one -- otherwise switching to a new league reads as "1 of 3 done" for
            // the whole app. renderSetupStep appends labels as text, so no escaping needed.
            const forLeague = leagueCount > 1 && activeLeague ? ` for ${activeLeague.name || 'this league'}` : '';
            renderSetupStep('setupStepRos', 'ros', hasRos, `ROS rankings${forLeague}`,
                hasLeagues ? "Upload a .csv or .xlsx of rest-of-season rankings, or tap Auto-Fetch ROS Rankings to pull market values." : null,
                activeTabId);
            renderSetupStep('setupStepWeekly', 'weekly', hasWeekly,
                weeklyNotNeeded ? `Weekly rankings${forLeague}: not needed for Best Ball` : `Weekly rankings${forLeague} (needed for the Lineup tab)`,
                hasLeagues ? "Upload this week's rankings as a .csv or .xlsx. Re-upload each week." : null,
                activeTabId);
        }

        // Sync Button Pulse
        const syncBtn = document.getElementById('mainSyncBtn');
        if (syncBtn) syncBtn.classList.toggle('btn-pulse', !hasLeagues);

        // Dashboard Sync Card Pulse
        const syncCard = document.getElementById('setupSyncCard');
        if (syncCard) syncCard.classList.toggle('pulse-border', !hasLeagues);

        // ROS Rankings Pulse
        const rosCard = document.getElementById('rosRankingsCard');
        if (rosCard) rosCard.classList.toggle('pulse-border', hasLeagues && !hasRos);

        // Weekly Rankings Pulse
        const weeklyCard = document.getElementById('weeklyRankingsCard');
        if (weeklyCard) weeklyCard.classList.toggle('pulse-border', hasLeagues && !hasWeekly);

        // Navigation Element Pulses (Only Logo, and only when NOT on Dashboard tab)
        const setupNav = document.querySelector('.logo-container');
        const setupTab = document.getElementById('setupTab');
        
        if (setupNav) {
            setupNav.classList.remove('nav-pulse');
            // Only pulse the logo if they have zero leagues AND they are currently on another tab
            if (State.leagues.length === 0 && setupTab && !setupTab.classList.contains('active')) {
                setupNav.classList.add('nav-pulse');
            }
        }
    }

    export const onload = function() {
        initManualAddForm();
        attachPlayerAutocomplete(document.getElementById('simPlayerSearch'), (p) => {
            lookupSimPlayer(p);
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
        const initialTab = getTabFromHash() || 'setup';
        showTab(initialTab, true);
        history.replaceState({ tab: initialTab }, '', `#${initialTab}`);

        // Last line of init on purpose: tells the safety net in js/boot.js that this module --
        // and every module it imports -- evaluated all the way through and the page is
        // genuinely usable, so a later uncaught error gets logged instead of covering a
        // working screen with the fatal-boot banner. If any of the seven files in this
        // module graph 404s, or anything above throws, this never runs and the banner stays
        // armed, which is exactly the behavior we want.
        if (typeof window.markAppReady === 'function') window.markAppReady();
    };


    // --- STARTUP CLEANUP ---
document.addEventListener('DOMContentLoaded', () => {
    // One-time cleanup of KEYS.shared.sleeperLeagueId, a league-ID handoff from MDS that was
    // never finished: nothing in either app ever wrote the key, but MLS used to read it here
    // and auto-click Sync on page load. MDS hands off via KEYS.shared.handoffRoster instead (see
    // checkForDraftStrategistHandoff). The key is off getMlsOwnedKeys() now, so Factory Reset
    // can no longer clear a stale copy -- hence removing it directly. Idempotent, so it needs
    // no "already migrated" flag; safe to delete once existing installs have loaded once.
    try { localStorage.removeItem(KEYS.shared.sleeperLeagueId); } catch (e) {}

    // Tooltip tap/keyboard handling moved to js/shared/ui/tooltips.js, shared with MDS
    // and T-Score. The per-icon listeners that lived here only covered icons present at load.
});
