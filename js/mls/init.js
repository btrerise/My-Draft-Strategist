// Moved from lineup/mls.js in refactor chunk 3A: INITIALIZATION (the setup checklist and the
// pulse prompts). The page's window.onload handler is still in legacy.js.
import { State } from './state.js';
import { isBestBallLeague, getActiveLeague } from './helpers.js';
import { updateDrawerActiveState } from './nav.js';
import { setRankingsCardExpanded } from './legacy.js';

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
            window.showTab(cfg.tab);
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
            btn.addEventListener('click', () => window.goToSetupStep(step));
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
