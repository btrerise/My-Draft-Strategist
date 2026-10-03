// Moved from js/mds.js in refactor chunk 2A:
// STATE MANAGEMENT and INITIALIZE DEFAULT DRAFT FALLBACK, plus
// draftPlayer/undoDraft, which sat at the end of the Sleeper section.
import { readJSON } from './compat.js';
import { draftPoolKey, readDraftPlayerPool, savePlayerPool } from './storage.js';
import { initSettingsUI } from './settings.js';
import { renderBoard } from './tracker.js';
import { KEYS } from '../shared/storage/keys.js';

    // --- STATE MANAGEMENT ---
    export const State = {
        players: readJSON(KEYS.mds.players, []),
        drafts: readJSON(KEYS.mds.drafts, []),
        activeDraftId: localStorage.getItem(KEYS.mds.activeDraftId) || null,
        rankingsMeta: readJSON(KEYS.mds.meta, null),
        adpMeta: readJSON(KEYS.mds.adpMeta, null),
        activePosFilter: 'ALL',
        autoSyncTimer: null,
        // Health of the live-draft poll, so the LIVE pill can tell the truth about it.
        // lastLiveSyncAt is the last tick that actually came back from Sleeper (a tick with
        // no new picks still counts -- we heard from them); liveSyncFailStreak is how many
        // silent ticks have failed back to back since then.
        lastLiveSyncAt: null,
        liveSyncFailStreak: 0,
        deferredPrompt: null,
        touchStartX: 0,
        touchEndX: 0
    };

    export const BYE_WEEKS_2026 = {
        "CAR": 5, "KC": 5, "CIN": 6, "DET": 6, "MIA": 6, "MIN": 6,
        "BUF": 7, "JAX": 7, "LAC": 7, "WAS": 7, "HOU": 8, "NO": 8,
        "NYG": 8, "SF": 8, "PIT": 9, "TEN": 9, "CHI": 10, "DEN": 10,
        "PHI": 10, "TB": 10, "ATL": 11, "CLE": 11, "GB": 11, "LAR": 11,
        "NE": 11, "SEA": 11, "BAL": 13, "IND": 13, "LV": 13, "NYJ": 13,
        "ARI": 14, "DAL": 14
    };

    // --- INITIALIZE DEFAULT DRAFT FALLBACK ---
    export function ensureDefaultDraft() {
        if (State.drafts.length === 0) {
            const defaultDraft = {
                draftId: 'draft_default',
                name: 'Main Draft',
                username: localStorage.getItem(KEYS.mds.username) || '',
                settings: readJSON(KEYS.mds.draftSettings, { teams: 12, rounds: 15 }),
                limits: readJSON(KEYS.mds.limits, { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1, BENCH: 5, TOTAL: 15 }),
                draftedPlayers: readJSON(KEYS.mds.drafted, []),
                myTeam: readJSON(KEYS.mds.myTeam, []),
                rawDraftPicks: readJSON(KEYS.mds.rawPicks, []),
                totalPicks: parseInt(localStorage.getItem(KEYS.mds.totalPicks)) || 0,
                queue: []
            };
            State.drafts = [defaultDraft];
            State.activeDraftId = 'draft_default';
            localStorage.setItem(KEYS.mds.drafts, JSON.stringify(State.drafts));
            localStorage.setItem(KEYS.mds.activeDraftId, 'draft_default');
        } else if (!State.activeDraftId || !State.drafts.some(d => d.draftId === State.activeDraftId)) {
            State.activeDraftId = State.drafts[0].draftId;
            localStorage.setItem(KEYS.mds.activeDraftId, State.activeDraftId);
        }
    }

    export function getActiveDraft() {
        ensureDefaultDraft();
        return State.drafts.find(d => d.draftId === State.activeDraftId) || State.drafts[0];
    }

    // PERSISTENCE ONLY -- deliberately does NOT render. This used to end with renderBoard() +
    // renderDraftMatrix() + renderDraftRecap(), which meant every one of the dozen callers
    // below repainted the entire app whether or not anything visible had changed, and meant
    // the grid and recap rendered TWICE per mutation, since renderBoard() already calls both
    // of them itself at its tail. It also silently defeated saveSettings' own `skipRender`
    // flag, which could never actually skip a render while the save it wrapped performed one.
    //
    // Callers that genuinely need the UI updated now say so, either by calling renderBoard()
    // themselves (several already did, and were paying for the duplicate) or via
    // saveAndRenderDraftState() below. renderBoard() stays the single full-render entry point
    // -- it still fans out to the grid and recap -- so a mutation is now one save and one
    // paint instead of one call that always did both, twice.
    export function saveActiveDraftState() {
        let activeDraft = getActiveDraft();
        // This used to do `activeDraft.players = [...State.players]` here, which is what put
        // every profile's whole pool into the KEYS.mds.drafts blob below. Pools now live under their
        // own keys and are written by savePlayerPool() when they actually change -- see the
        // storage notes at the top of this file. The delete keeps a v1-format draft (one whose
        // migration was deferred) from silently re-persisting its inline copy.
        if (activeDraft && activeDraft.players) {
            // Only reachable when the migration was deferred (it failed, so the drafts loaded
            // in v1 format). Rescue the inline pool to its own key BEFORE dropping it, or this
            // write would slim the draft down and take the only copy with it -- leaving the
            // profile to fall back to the shared global pool, i.e. silently inheriting
            // whichever rankings another profile last loaded. Guarded so it can never
            // overwrite a key that already holds the newer copy.
            try {
                if (Array.isArray(activeDraft.players) && activeDraft.players.length > 0
                    && !localStorage.getItem(draftPoolKey(activeDraft.draftId))) {
                    localStorage.setItem(draftPoolKey(activeDraft.draftId), JSON.stringify(activeDraft.players));
                }
                delete activeDraft.players;
            } catch (e) {
                // Couldn't write the rescue copy, so keep the inline one rather than dropping
                // both. KEYS.mds.drafts stays fat for now; the migration retries on the next load.
                console.warn('Deferred pool rescue failed; keeping inline copy for now.', e);
            }
        }
        localStorage.setItem(KEYS.mds.drafts, JSON.stringify(State.drafts));
        localStorage.setItem(KEYS.mds.activeDraftId, State.activeDraftId || '');
    }

    // The common "I changed draft state and the screen needs to reflect it" pairing. Exists so
    // the intent is visible at the call site rather than being an invisible side effect of
    // saving -- and so the sites that DON'T need a paint can simply not call it.
    export function saveAndRenderDraftState() {
        saveActiveDraftState();
        renderBoard();
    }

    export function refreshDraftDropdown() {
        const select = document.getElementById('draftProfileSelect');
        if (!select) return;
        // Built as Option elements rather than an HTML string. Draft names are typed by the
        // user or taken from Sleeper (a league's or draft's name, set by whoever runs it), so
        // markup in one would otherwise run as script. Option's text and value are plain strings.
        select.textContent = '';
        State.drafts.forEach(d => {
            const isActive = d.draftId === State.activeDraftId;
            select.appendChild(new Option(d.name, d.draftId, isActive, isActive));
        });
    }

    export const switchDraftProfile = function(draftId) {
        if (!draftId) return;
        State.activeDraftId = draftId;
        localStorage.setItem(KEYS.mds.activeDraftId, State.activeDraftId);

        let draft = getActiveDraft();
        if (draft) {
            // Load the rankings for this draft, fallback to global if none exist yet.
            // readDraftPlayerPool checks this draft's own key first and falls back to an
            // inline v1 copy, so a profile saved before the storage migration still restores.
            const savedPool = readDraftPlayerPool(draft);
            State.players = savedPool ? [...savedPool] : readJSON(KEYS.mds.players, []);
            // Persists under BOTH the global key and this draft's own key, which also means a
            // profile that fell through to the global fallback now has a pool of its own and
            // won't inherit whatever another profile loads next.
            savePlayerPool();

            initSettingsUI();
            if (draft.username === "Manual" && State.autoSyncTimer) {
                window.toggleAutoSync(false);
                const toggleEl = document.getElementById('autoSyncToggle');
                if (toggleEl) toggleEl.checked = false;
            }
        }

        refreshDraftDropdown();
        renderBoard();
    };

    export const draftPlayer = function(id, isMine) {
        let draft = getActiveDraft();
        if (!draft) return;
        if (!draft.draftedPlayers.includes(id)) {
            draft.draftedPlayers.push(id);
            if (isMine) draft.myTeam.push(id);
            saveAndRenderDraftState();

            let p = State.players.find(x => x.id === id);
            if (p && typeof window.showToast === 'function') window.showToast(`${p.name} drafted`);
        }
    };

    export const undoDraft = function(id) {
        let draft = getActiveDraft();
        if (!draft) return;
        draft.draftedPlayers = draft.draftedPlayers.filter(pId => pId !== id);
        draft.myTeam = draft.myTeam.filter(pId => pId !== id);
        saveAndRenderDraftState();

        let p = State.players.find(x => x.id === id);
        if (p && typeof window.showToast === 'function') window.showToast(`${p.name} returned to pool`);
    };
