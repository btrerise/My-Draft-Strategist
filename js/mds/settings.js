// Moved from js/mds.js in refactor chunk 2A:
// INITIALIZE SETTINGS INPUTS (settings form, save, reset picks).
import { State, getActiveDraft, saveActiveDraftState, saveAndRenderDraftState } from './state.js';
import { renderBoard } from './tracker.js';
import { KEYS } from '../shared/storage/keys.js';
import { flashButton } from '../shared/ui/flashButton.js';
import { showConfirm } from '../shared/ui/confirm.js';
import { showToast } from '../shared/ui/toast.js';
import { escapeHtml } from '../shared/html.js';
import { getFreshness } from '../shared/freshness.js';

    // --- INITIALIZE SETTINGS INPUTS ---
    export function initSettingsUI() {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        let draft = getActiveDraft();

        setVal('sleeperUsername', draft && draft.username !== "Manual" ? draft.username : (localStorage.getItem(KEYS.mds.username) || ""));
        setVal('sleeperDraftId', draft && !draft.draftId.startsWith('manual_') && !draft.draftId.startsWith('draft_') ? draft.draftId : (localStorage.getItem(KEYS.mds.draftId) || ""));
        setVal('targetList', localStorage.getItem(KEYS.mds.targets) || "");
        setVal('avoidList', localStorage.getItem(KEYS.mds.avoids) || "");
        setVal('dartList', localStorage.getItem(KEYS.mds.darts) || "");
        setCheck('stackToggle', localStorage.getItem(KEYS.mds.stacks) === 'true');
        setCheck('byeWarningToggle', localStorage.getItem(KEYS.mds.byeWarnings) === 'true');
        setCheck('tscoreToggle', localStorage.getItem(KEYS.mds.tscore) === 'true');
        
        let settings = draft ? draft.settings : { teams: 12, rounds: 15, is3RR: false };
        setCheck('thirdRoundReversalToggle', settings.is3RR || false);
        let limits = draft ? draft.limits : { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1, BENCH: 5, TOTAL: 15 };

        setVal('leagueTeams', settings.teams || 12);
        setVal('leagueRounds', settings.rounds || 15);
        setVal('limitQB', limits.QB);
        setVal('limitRB', limits.RB);
        setVal('limitWR', limits.WR);
        setVal('limitTE', limits.TE);
        setVal('limitFLEX', limits.FLEX);
        setVal('limitSFLEX', limits.SFLEX);
        setVal('limitK', limits.K !== undefined ? limits.K : 1);
        setVal('limitDEF', limits.DEF !== undefined ? limits.DEF : 1);
        setVal('limitBENCH', limits.BENCH);
        updateTotalRounds();
    }

    export function updateTotalRounds() {
        const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
        const total = getNum('limitQB') + getNum('limitRB') + getNum('limitWR') + getNum('limitTE') + getNum('limitFLEX') + getNum('limitSFLEX') + getNum('limitK') + getNum('limitDEF') + getNum('limitBENCH');
        const roundsEl = document.getElementById('leagueRounds');
        if (roundsEl) roundsEl.value = total;
    }

    // Refactor 8B: meta saved with an updatedAt timestamp shows its age ("Updated 3 days ago",
    // the shared getFreshness), amber past 14 days for rankings and 3 for ADP (the owner's
    // thresholds, as Lineup Strategist's ROS rankings and market data). Meta saved before 8B has
    // only the formatted date and keeps the old text.
    export function updateMetaDisplay() {
        const RANKINGS_STALE_AFTER_DAYS = 14;
        const ADP_STALE_AFTER_DAYS = 3;
        const metaEl = document.getElementById('metaDisplay');
        if (metaEl) {
            if (State.rankingsMeta) {
                metaEl.style.display = 'block';
                const fresh = getFreshness(State.rankingsMeta.updatedAt, RANKINGS_STALE_AFTER_DAYS);
                if (fresh) {
                    metaEl.innerHTML = `Loaded: ${escapeHtml(State.rankingsMeta.count)} players <span class="${fresh.isStale ? 'freshness-stale' : 'freshness-ok'}">• ${fresh.label}${fresh.isStale ? ' — consider refreshing' : ''}</span>`;
                } else {
                    metaEl.innerText = `Loaded: ${State.rankingsMeta.count} players on ${State.rankingsMeta.date}`;
                }
            } else {
                metaEl.style.display = 'none';
            }
        }

        const adpEl = document.getElementById('adpStatusDisplay');
        if (adpEl) {
            if (State.adpMeta) {
                adpEl.style.display = 'block';
                const fresh = getFreshness(State.adpMeta.updatedAt, ADP_STALE_AFTER_DAYS, 'Fetched');
                if (fresh) {
                    adpEl.innerHTML = `${escapeHtml(State.adpMeta.format)} <span class="${fresh.isStale ? 'freshness-stale' : 'freshness-ok'}">• ${fresh.label}${fresh.isStale ? ' — fetch again before you draft' : ''}</span>`;
                } else {
                    adpEl.innerText = `Fetched: ${State.adpMeta.format} on ${State.adpMeta.date}`;
                }
            } else {
                adpEl.style.display = 'none';
            }
        }
    }

    export const saveSettings = function(btnElement, skipRender = false) {
        const getVal = id => document.getElementById(id)?.value.trim() || "";
        const getCheck = id => document.getElementById(id)?.checked || false;

        localStorage.setItem(KEYS.mds.username, getVal('sleeperUsername'));
        localStorage.setItem(KEYS.mds.draftId, getVal('sleeperDraftId'));
        localStorage.setItem(KEYS.mds.targets, document.getElementById('targetList')?.value || "");
        localStorage.setItem(KEYS.mds.avoids, document.getElementById('avoidList')?.value || "");
        localStorage.setItem(KEYS.mds.darts, document.getElementById('dartList')?.value || "");
        localStorage.setItem(KEYS.mds.stacks, getCheck('stackToggle'));
        localStorage.setItem(KEYS.mds.byeWarnings, getCheck('byeWarningToggle'));
        localStorage.setItem(KEYS.mds.tscore, getCheck('tscoreToggle'));
        
        let draft = getActiveDraft();
        if (draft) {
            if (getVal('sleeperUsername')) draft.username = getVal('sleeperUsername');
            draft.settings = {
                teams: parseInt(getVal('leagueTeams')) || 12,
                rounds: parseInt(getVal('leagueRounds')) || 15,
                is3RR: getCheck('thirdRoundReversalToggle')
            };
            draft.limits = {
                QB: parseInt(getVal('limitQB')) || 0,
                RB: parseInt(getVal('limitRB')) || 0,
                WR: parseInt(getVal('limitWR')) || 0,
                TE: parseInt(getVal('limitTE')) || 0,
                WT: draft.limits?.WT || 0,
                WRRB: draft.limits?.WRRB || 0, // like WT: set by Sleeper sync, not editable here
                FLEX: parseInt(getVal('limitFLEX')) || 0,
                SFLEX: parseInt(getVal('limitSFLEX')) || 0,
                K: parseInt(getVal('limitK')) || 0,
                DEF: parseInt(getVal('limitDEF')) || 0,
                BENCH: parseInt(getVal('limitBENCH')) || 0,
            };
            draft.limits.TOTAL = draft.limits.QB + draft.limits.RB + draft.limits.WR + draft.limits.TE + draft.limits.WT + draft.limits.WRRB + draft.limits.FLEX + draft.limits.SFLEX + draft.limits.K + draft.limits.DEF + draft.limits.BENCH;
            saveActiveDraftState();
        }

        if (!skipRender) renderBoard();
        if (btnElement) flashButton(btnElement, "Settings Saved");
    };

    export const resetPicksOnly = async function() {
        let draft = getActiveDraft();
        if (!draft) return;
        if (await showConfirm(`This puts '${draft.name}' back at pick 1.01. Your rankings and settings aren't affected.`, { title: 'Reset draft picks?', confirmText: 'Reset Picks', danger: true })) {
            draft.draftedPlayers = [];
            draft.myTeam = [];
            draft.rawDraftPicks = [];
            draft.totalPicks = 0;
            saveAndRenderDraftState();
            
            // The timeout ensures the heavy DOM render doesn't swallow the animation
            setTimeout(() => {
                showToast("Draft picks reset to 1.01");
            }, 100);
        }
    };
