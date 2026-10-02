// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: RANKINGS ENGINE
// (getRankingsFreshness) and the unmarked rankings-card helpers after the ranking-set code: card
// expand/collapse, the card header's rankings meta line, and the single/multi upload mode toggles.
import { State } from '../state.js';
import { updatePulsePrompts } from '../init.js';
import { populateRankingSetDropdown } from './sets.js';
    // --- RANKINGS ENGINE ---
    // Formats a stored timestamp into a short relative string, and flags it as "stale" past
    // the given threshold (in days) so the UI can call attention to rankings that likely need
    // a refresh. Returns null if there's no timestamp at all (e.g. rankings from before this
    // tracking existed) so the caller can fall back to a neutral message rather than claim
    // false freshness. `verb` swaps the leading word so league rows can read "Synced 4 days
    // ago" off the same logic; market data and rankings keep the default "Updated".
    export function getRankingsFreshness(timestamp, staleAfterDays, verb = 'Updated') {
        if (!timestamp) return null;
        const ms = Date.now() - Number(timestamp);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        let label;
        if (days <= 0) label = `${verb} today`;
        else if (days === 1) label = `${verb} yesterday`;
        else label = `${verb} ${days} days ago`;
        return { label, isStale: days > staleAfterDays };
    }

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
                const fresh = getRankingsFreshness(State.rosRankingsUpdatedAt, 14); // ROS: occasional refresh is normal
                const countText = `Loaded: ${State.rosRankings.length} players`;
                if (fresh) {
                    rosMetaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'rankings-stale' : 'rankings-fresh'}">• ${fresh.label}${fresh.isStale ? ' — consider refreshing' : ''}</span>`;
                    if (rosHeaderEl) {
                        rosHeaderEl.textContent = fresh.label;
                        rosHeaderEl.classList.toggle('rankings-stale', fresh.isStale);
                    }
                } else {
                    rosMetaEl.innerText = countText;
                    if (rosHeaderEl) { rosHeaderEl.textContent = `${State.rosRankings.length} players`; rosHeaderEl.classList.remove('rankings-stale'); }
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
                const fresh = getRankingsFreshness(State.weeklyRankingsUpdatedAt, 6); // Weekly: expected to refresh every week
                const countText = `Loaded: ${State.weeklyRankings.length} players`;
                if (fresh) {
                    weeklyMetaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'rankings-stale' : 'rankings-fresh'}">• ${fresh.label}${fresh.isStale ? ' — likely stale, re-upload for this week' : ''}</span>`;
                    if (weeklyHeaderEl) {
                        weeklyHeaderEl.textContent = fresh.label;
                        weeklyHeaderEl.classList.toggle('rankings-stale', fresh.isStale);
                    }
                } else {
                    weeklyMetaEl.innerText = countText;
                    if (weeklyHeaderEl) { weeklyHeaderEl.textContent = `${State.weeklyRankings.length} players`; weeklyHeaderEl.classList.remove('rankings-stale'); }
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

