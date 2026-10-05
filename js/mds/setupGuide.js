// Added in refactor chunk 8A: the Setup tab's "Setup Progress" checklist and the pulsing
// "do this next" cues, Draft Strategist's version of Lineup Strategist's updatePulsePrompts
// (js/mls/init.js). The <li> builder and the scroll-and-focus are shared
// (js/shared/ui/setupChecklist.js); the steps, done conditions and pulse rules below are the
// ones the owner approved for Draft Strategist (docs/refactor/LOG.md, 8A).
// No load-time side effects. renderBoard (tracker.js) and showTab (ui.js) call updateSetupGuidance,
// so it follows every change to the rankings, the active draft and the ADP, and every tab switch.
import { State, getActiveDraft } from './state.js';
import { showTab } from './main.js';
import { renderSetupStep, scrollToCard } from '../shared/ui/setupChecklist.js';

    // --- SETUP GUIDANCE ---
    // Where each step gets done on the Setup tab: the card to scroll to and the control to focus.
    const SETUP_STEPS = {
        rankings: { cardId: 'setupRankingsCard', focusId: 'quickStartBtn' },
        draft:    { cardId: 'setupDraftCard',    focusId: 'sleeperUsername' },
        adp:      { cardId: 'setupAdpCard',      focusId: 'adpFormatSelect' },
    };

    // A player has an ADP once Quick-Start, Fetch Market Value, the manual paste or an ADP
    // column in the uploaded file gave it one. The import writes "-" for none.
    function hasAdp(p) {
        return p.adp !== undefined && p.adp !== null && p.adp !== '' && p.adp !== '-';
    }

    // The three setup states, read from State. The draft step counts as done once the active
    // draft is one the user added (synced from Sleeper or Create Manual Draft), not the
    // built-in "Main Draft" (draft_default) every new user starts on (ensureDefaultDraft).
    export function getSetupState() {
        const draft = getActiveDraft();
        return {
            rankings: State.players.length > 0,
            draft: !!draft && draft.draftId !== 'draft_default',
            adp: State.players.some(hasAdp),
            playerCount: State.players.length,
            draftName: draft ? draft.name : '',
        };
    }

    // Takes the user to a step's card on the Setup tab: switches to Setup if needed, scrolls the
    // card into view and focuses its first control.
    export const goToSetupStep = function(step) {
        const cfg = SETUP_STEPS[step];
        if (!cfg) return;
        const setupTab = document.getElementById('setupTab');
        if (setupTab && !setupTab.classList.contains('active')) showTab('setup');
        scrollToCard(document.getElementById(cfg.cardId), document.getElementById(cfg.focusId));
    };

    export function updateSetupGuidance() {
        const s = getSetupState();
        const order = ['rankings', 'draft', 'adp'];
        const nextStep = order.find(step => !s[step]) || null;

        // Setup Checklist, at the top of the Setup tab: all three steps until everything is in
        // place, then hidden. The jump links say "Show me ↓", since every step is on this tab.
        const checklist = document.getElementById('setupChecklist');
        if (checklist) {
            checklist.style.display = nextStep ? '' : 'none';
            const title = document.getElementById('setupChecklistTitle');
            if (title) title.textContent = `Setup Progress · ${order.filter(step => s[step]).length} of 3 done`;
            const steps = {
                rankings: {
                    label: s.rankings ? `Rankings loaded (${s.playerCount} player${s.playerCount === 1 ? '' : 's'})` : 'Load rankings',
                    how: "In Load Rankings, tap Quick-Start for Fantasy Football Calculator's ADP, or upload or paste your own rankings.",
                },
                draft: {
                    // Draft names come from the user or Sleeper; renderSetupStep appends them as text.
                    label: s.draft ? `Draft added: ${s.draftName}` : 'Add or sync your draft',
                    how: 'In Add / Sync Draft, enter your Sleeper username and draft ID, then tap Sync Sleeper Draft. Drafting offline? Tap Create Manual Draft.',
                },
                adp: {
                    label: s.adp ? 'ADP loaded' : 'Load ADP (market value)',
                    // Fetch Market Value needs rankings to attach the ADP to, so there's nothing
                    // to do here until step 1 is done (Quick-Start does both at once).
                    how: s.rankings ? "In Live Market Value, pick your league's format and tap Fetch Market Value, to see where players go in real drafts." : null,
                },
            };
            [['setupStepRankings', 'rankings'], ['setupStepDraft', 'draft'], ['setupStepAdp', 'adp']].forEach(([id, step]) => {
                const li = document.getElementById(id);
                if (!li) return;
                renderSetupStep(li, {
                    done: s[step], label: steps[step].label, how: steps[step].how,
                    goLabel: 'Show me ↓',
                    goClass: 'btn-sm',
                    goData: { action: 'goToSetupStep', step },
                });
            });
        }

        // Card pulse: the card of the next unfinished step; none once all three are done.
        Object.entries(SETUP_STEPS).forEach(([step, cfg]) => {
            const card = document.getElementById(cfg.cardId);
            if (card) card.classList.toggle('pulse-border', step === nextStep);
        });

        // Logo pulse: only while no rankings are loaded (the Tracker, Team and Board tabs are
        // empty without them) and only when you're on another tab.
        const logo = document.querySelector('.logo-container');
        const setupTab = document.getElementById('setupTab');
        if (logo) logo.classList.toggle('nav-pulse', !s.rankings && !!setupTab && !setupTab.classList.contains('active'));
    }
