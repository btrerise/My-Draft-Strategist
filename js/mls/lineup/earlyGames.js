// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: the early-teams part
// of EARLY GAMES LOGIC.
import { NFL_TEAMS } from '../constants.js';
import { State } from '../state.js';
import { renderLineupUI } from '../main.js';
import { KEYS } from '../../shared/storage/keys.js';

    // --- EARLY GAMES LOGIC ---
    export function populateEarlyGameDropdown() {
        const sel = document.getElementById('earlyTeamSelect');
        if (!sel) return;
        let html = `<option value="">-- Add an Early Team --</option>`;
        NFL_TEAMS.forEach(t => { html += `<option value="${t}">${t}</option>`; });
        sel.innerHTML = html;
        renderEarlyChips();
        checkEarlyBannerVisibility();
    }

    export const addEarlyTeam = function(team) {
        if (!team) return;
        if (!State.earlyTeams.includes(team)) {
            State.earlyTeams.push(team);
            localStorage.setItem(KEYS.mls.earlyTeams, JSON.stringify(State.earlyTeams));
            renderEarlyChips();
        }
        const sel = document.getElementById('earlyTeamSelect');
        if (sel) sel.value = "";
        checkEarlyBannerVisibility();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'lineupTab') renderLineupUI();
    };

    export const removeEarlyTeam = function(team) {
        State.earlyTeams = State.earlyTeams.filter(t => t !== team);
        localStorage.setItem(KEYS.mls.earlyTeams, JSON.stringify(State.earlyTeams));
        renderEarlyChips();
        checkEarlyBannerVisibility();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'lineupTab') renderLineupUI();
    };

    function renderEarlyChips() {
        const container = document.getElementById('earlyTeamChips');
        if (!container) return;
        // Removing a chip re-renders them all, which would drop keyboard focus to the top of the
        // page. Remember which ✕ had focus so it can move to the chip that takes its place (or
        // to the team picker once the last one is gone).
        const focusedChipIdx = [...container.querySelectorAll('.close-chip')].indexOf(document.activeElement);
        const restoreChipFocus = () => {
            if (focusedChipIdx === -1) return;
            const chips = container.querySelectorAll('.close-chip');
            (chips[Math.min(focusedChipIdx, chips.length - 1)] || document.getElementById('earlyTeamSelect'))?.focus();
        };
        if (State.earlyTeams.length === 0) {
            container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">No teams selected.</span>`;
            restoreChipFocus();
            return;
        }
        let html = "";
        State.earlyTeams.forEach(t => {
            html += `<div class="team-chip">${t} <button type="button" class="close-chip" data-action="removeEarlyTeam" data-team="${t}" aria-label="Remove ${t} from Early Games">✕</button></div>`;
        });
        container.innerHTML = html;
        restoreChipFocus();
    }

    function checkEarlyBannerVisibility() {
        const banner = document.getElementById('earlyBanner');
        if (banner) banner.style.display = State.earlyTeams.length > 0 ? 'block' : 'none';
    }

    export function isEarlyPlayer(teamStr) {
        if (!teamStr || teamStr === "FA") return false;
        return State.earlyTeams.includes(teamStr.toUpperCase());
    }
