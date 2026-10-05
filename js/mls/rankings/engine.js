// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: RANKINGS ENGINE
// (getRankingsFreshness) and the unmarked rankings-card helpers after the ranking-set code: card
// expand/collapse, the card header's rankings meta line, and the single/multi upload mode toggles.
// Refactor 8B moved getRankingsFreshness to js/shared/freshness.js as getFreshness, and renamed
// the label classes rankings-fresh / rankings-stale to freshness-ok / freshness-stale.
import { State } from '../state.js';
import { updatePulsePrompts } from '../init.js';
import { populateRankingSetDropdown } from './sets.js';
import { getFreshness } from '../../shared/freshness.js';

    export const toggleRankingsCard = function(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const nowExpanded = card.classList.toggle('expanded');
        // aria-expanded lives on the <h3>/<h4> > <button> toggle, not the header wrapper.
        const toggleBtn = card.querySelector(':scope > .rankings-card-header .rankings-card-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
    };

    export function setRankingsCardExpanded(cardId, expanded) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.classList.toggle('expanded', expanded);
        const toggleBtn = card.querySelector(':scope > .rankings-card-header .rankings-card-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    export function updateRankingsMetaDisplay() {
        const rosMetaEl = document.getElementById('rosMetaDisplay');
        const rosHeaderEl = document.getElementById('rosHeaderFreshness');
        if (rosMetaEl) {
            if (State.rosRankings.length > 0) {
                rosMetaEl.style.display = 'block';
                const fresh = getFreshness(State.rosRankingsUpdatedAt, 14); // ROS: occasional refresh is normal
                const countText = `Loaded: ${State.rosRankings.length} players`;
                if (fresh) {
                    rosMetaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'freshness-stale' : 'freshness-ok'}">• ${fresh.label}${fresh.isStale ? ' — consider refreshing' : ''}</span>`;
                    if (rosHeaderEl) {
                        rosHeaderEl.textContent = fresh.label;
                        rosHeaderEl.classList.toggle('freshness-stale', fresh.isStale);
                    }
                } else {
                    rosMetaEl.innerText = countText;
                    if (rosHeaderEl) { rosHeaderEl.textContent = `${State.rosRankings.length} players`; rosHeaderEl.classList.remove('freshness-stale'); }
                }
            } else {
                rosMetaEl.style.display = 'none';
                if (rosHeaderEl) rosHeaderEl.textContent = '';
                setRankingsCardExpanded('rosRankingsCard', true); // nothing loaded yet -- show the actionable UI
            }
        }

        const weeklyMetaEl = document.getElementById('weeklyMetaDisplay');
        const weeklyHeaderEl = document.getElementById('weeklyHeaderFreshness');
        if (weeklyMetaEl) {
            if (State.weeklyRankings.length > 0) {
                weeklyMetaEl.style.display = 'block';
                const fresh = getFreshness(State.weeklyRankingsUpdatedAt, 6); // Weekly: expected to refresh every week
                const countText = `Loaded: ${State.weeklyRankings.length} players`;
                if (fresh) {
                    weeklyMetaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'freshness-stale' : 'freshness-ok'}">• ${fresh.label}${fresh.isStale ? ' — likely stale, re-upload for this week' : ''}</span>`;
                    if (weeklyHeaderEl) {
                        weeklyHeaderEl.textContent = fresh.label;
                        weeklyHeaderEl.classList.toggle('freshness-stale', fresh.isStale);
                    }
                } else {
                    weeklyMetaEl.innerText = countText;
                    if (weeklyHeaderEl) { weeklyHeaderEl.textContent = `${State.weeklyRankings.length} players`; weeklyHeaderEl.classList.remove('freshness-stale'); }
                }
            } else {
                weeklyMetaEl.style.display = 'none';
                if (weeklyHeaderEl) weeklyHeaderEl.textContent = '';
                setRankingsCardExpanded('weeklyRankingsCard', true); // nothing loaded yet -- show the actionable UI
            }
        }

        populateRankingSetDropdown('ros');
        populateRankingSetDropdown('weekly');
        // Every rankings change (upload, set switch, set delete, league switch) lands here,
        // so keep the setup checklist and pulses in step with it.
        updatePulsePrompts();
    }

    export const toggleUploadMode = function(type) {
        const mode = document.getElementById(`${type}UploadMode`).value;
        document.getElementById(`${type}SingleMode`).style.display = mode === 'single' ? 'block' : 'none';
        document.getElementById(`${type}MultiMode`).style.display = mode === 'multi' ? 'block' : 'none';
    };

    export const togglePosInput = function(type, pos) {
        const wrap = document.getElementById(`${type}-input-wrap-${pos}`);
        if (wrap.style.display === 'none') {
            wrap.style.display = 'flex';
        } else {
            wrap.style.display = 'none';
            const input = document.getElementById(`${type}FileInput-${pos}`);
            if (input) input.value = ''; // Clear file if unchecked
        }
    };

