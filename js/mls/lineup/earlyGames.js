// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: the early-teams part
// of EARLY GAMES LOGIC.
//
// Since improvements S50 the list fills itself from the week's kickoffs (lineup/earlyRule.js: every team playing
// before Sunday 1:00 PM Eastern), unless "Fill in from the schedule" is off (State.earlyFromSchedule,
// KEYS.mls.earlyFromSchedule). The owner's choices (2026-11-15): on by default; with it on you can still add a team or
// remove one the schedule filled in, for that week; and the list follows the NFL week, so a new week clears the teams
// you added and the ones you removed, switch on or off.
//   State.earlyTeams   the teams you added (KEYS.mls.earlyTeams, as before S50, so old installs keep their picks)
//   State.earlyWeek    { week: '2026-11', schedule: [team], removed: [team] } (KEYS.mls.earlyWeek). schedule is saved
//                      so the badges show before this visit's kickoffs load; until they load, what was saved stays.
// An install from before S50 has no week saved: its picks count as the current week's, and clear when the next starts.
import { NFL_TEAMS } from '../constants.js';
import { State } from '../state.js';
import { renderLineupUI } from '../main.js';
import { KEYS } from '../../shared/storage/keys.js';
import { escapeHtml } from '../../shared/html.js';
import { formatKickoffLabel } from './gameInfo.js';
import { earlyTeamsFromKickoffs } from './earlyRule.js';

    const weekStamp = () => (State.currentNflWeek == null ? null : `${State.currentNflSeason || ''}-${State.currentNflWeek}`);
    const weekState = () => {
        const w = State.earlyWeek;
        return {
            week: w && typeof w.week === 'string' ? w.week : null,
            schedule: w && Array.isArray(w.schedule) ? w.schedule : [],
            removed: w && Array.isArray(w.removed) ? w.removed : [],
        };
    };
    const writeJSON = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked: it still works this visit */ }
    };
    const saveWeek = (w) => { State.earlyWeek = w; writeJSON(KEYS.mls.earlyWeek, w); };
    const saveAdded = () => writeJSON(KEYS.mls.earlyTeams, State.earlyTeams);

    // The teams flagged EARLY now: with the switch on, the schedule's (less those you removed) and then yours; off, yours.
    export function getEarlyTeams() {
        const added = State.earlyTeams || [];
        if (!State.earlyFromSchedule) return [...added];
        const { schedule, removed } = weekState();
        const fromSchedule = schedule.filter(t => !removed.includes(t));
        return [...fromSchedule, ...added.filter(t => !fromSchedule.includes(t))];
    }

    // Once Sleeper says which NFL week it is (state.js, refreshCurrentNflWeek): a new week clears last week's teams.
    export function noteEarlyWeek() {
        const stamp = weekStamp();
        if (!stamp) return;
        const w = weekState();
        if (w.week === stamp) return;
        if (w.week !== null) {
            State.earlyTeams = [];
            saveAdded();
            saveWeek({ week: stamp, schedule: [], removed: [] });
        } else {
            saveWeek({ ...w, week: stamp });
        }
        refreshEarlyGames();
    }

    // Once the week's kickoffs load (state.js, refreshGameTimes): the schedule's teams for this week.
    export function noteEarlyKickoffs() {
        const stamp = weekStamp();
        if (!stamp || State.gameTimesFetchedForWeek !== State.currentNflWeek) return;
        noteEarlyWeek();
        const schedule = earlyTeamsFromKickoffs(State.gameTimesByTeam);
        const w = weekState();
        if (schedule.join() !== w.schedule.join()) saveWeek({ ...w, week: stamp, schedule });
        refreshEarlyGames(false);
    }

    const kickoffsLoaded = () => State.currentNflWeek != null && State.gameTimesFetchedForWeek === State.currentNflWeek
        && Object.keys(State.gameTimesByTeam).length > 0;

    export function populateEarlyGameDropdown() {
        const sel = document.getElementById('earlyTeamSelect');
        if (!sel) return;
        let html = `<option value="">-- Add an Early Team --</option>`;
        NFL_TEAMS.forEach(t => { html += `<option value="${t}">${t}</option>`; });
        sel.innerHTML = html;
        refreshEarlyGames(false);
    }

    // Redraws the card and the banner, and the Lineup tab when it's showing (its EARLY badges).
    function refreshEarlyGames(redrawLineup = true) {
        renderEarlyCard();
        checkEarlyBannerVisibility();
        if (!redrawLineup) return;
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'lineupTab') renderLineupUI();
    }

    export const addEarlyTeam = function(team) {
        const sel = document.getElementById('earlyTeamSelect');
        if (sel) sel.value = "";
        if (!team) return;
        const w = weekState();
        if (State.earlyFromSchedule && w.removed.includes(team)) {
            // One the schedule filled in that you had removed: it comes back as the schedule's.
            saveWeek({ ...w, removed: w.removed.filter(t => t !== team) });
        } else if (!getEarlyTeams().includes(team)) {
            State.earlyTeams.push(team);
            saveAdded();
            if (!w.week && weekStamp()) saveWeek({ ...w, week: weekStamp() });
        }
        refreshEarlyGames();
    };

    export const removeEarlyTeam = function(team) {
        if (State.earlyTeams.includes(team)) {
            State.earlyTeams = State.earlyTeams.filter(t => t !== team);
            saveAdded();
        }
        const w = weekState();
        if (State.earlyFromSchedule && w.schedule.includes(team) && !w.removed.includes(team)) {
            saveWeek({ ...w, removed: [...w.removed, team] });
        }
        refreshEarlyGames();
    };

    // "Put back" beside a team you removed from the schedule's.
    export const restoreEarlyTeam = function(team) {
        const w = weekState();
        saveWeek({ ...w, removed: w.removed.filter(t => t !== team) });
        refreshEarlyGames();
    };

    export const setEarlyFromSchedule = function(on) {
        State.earlyFromSchedule = !!on;
        try {
            if (on) localStorage.removeItem(KEYS.mls.earlyFromSchedule);
            else localStorage.setItem(KEYS.mls.earlyFromSchedule, '0');
        } catch (e) { /* storage blocked: the switch still works this visit */ }
        refreshEarlyGames();
    };

    // A chip's second line: the kickoff (your local time) for a team the schedule filled in, "Added" for one of yours.
    function chipNote(team, fromSchedule) {
        if (!fromSchedule) return 'Added';
        return formatKickoffLabel(State.gameTimesByTeam[team]) || 'Schedule';
    }

    function emptyText() {
        if (!State.earlyFromSchedule) return 'No teams selected.';
        if (kickoffsLoaded()) return 'No games before Sunday 1:00 PM Eastern this week.';
        return 'This week’s kickoff times haven’t loaded yet. You can add teams yourself.';
    }

    function renderEarlyCard() {
        const toggle = document.getElementById('earlyFromScheduleToggle');
        if (toggle) toggle.checked = State.earlyFromSchedule;
        const desc = document.getElementById('earlyFromScheduleDesc');
        if (desc) desc.textContent = State.earlyFromSchedule
            ? 'Every team playing before Sunday 1:00 PM Eastern, this week.'
            : 'Off: pick the teams yourself. They clear when a new NFL week starts.';
        renderEarlyChips();
        renderRemoved();
    }

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
        const teams = getEarlyTeams();
        if (teams.length === 0) {
            container.innerHTML = `<span class="early-empty" style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">${escapeHtml(emptyText())}</span>`;
            restoreChipFocus();
            return;
        }
        const { schedule } = weekState();
        let html = "";
        teams.forEach(t => {
            const fromSchedule = State.earlyFromSchedule && schedule.includes(t);
            const note = chipNote(t, fromSchedule);
            const source = fromSchedule ? 'from the schedule' : 'added by you';
            html += `<div class="team-chip" data-source="${fromSchedule ? 'schedule' : 'added'}">${t} <span class="team-chip-note">${escapeHtml(note)}</span> <button type="button" class="close-chip" data-action="removeEarlyTeam" data-team="${t}" aria-label="Remove ${t} (${source}) from Early Games">✕</button></div>`;
        });
        container.innerHTML = html;
        restoreChipFocus();
    }

    // The schedule's teams you removed this week, each with Put back.
    function renderRemoved() {
        const line = document.getElementById('earlyRemoved');
        if (!line) return;
        const { schedule, removed } = weekState();
        const list = State.earlyFromSchedule ? removed.filter(t => schedule.includes(t) && !(State.earlyTeams || []).includes(t)) : [];
        line.hidden = list.length === 0;
        line.innerHTML = list.length === 0 ? '' : `Removed this week: ${list.map(t =>
            `<span class="early-removed-team">${t} <button type="button" class="mls-btn-sm btn-link-inline" data-action="restoreEarlyTeam" data-team="${t}" aria-label="Put ${t} back in Early Games">Put back</button></span>`).join(' ')}`;
    }

    function checkEarlyBannerVisibility() {
        const banner = document.getElementById('earlyBanner');
        if (banner) banner.style.display = getEarlyTeams().length > 0 ? 'block' : 'none';
    }

    export function isEarlyPlayer(teamStr) {
        if (!teamStr || teamStr === "FA") return false;
        return getEarlyTeams().includes(teamStr.toUpperCase());
    }
