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
import { NFL_TEAMS, SLOT_POSITIONS, slotDisplayName } from '../constants.js';
import { State } from '../state.js';
import { renderLineupUI } from '../main.js';
import { KEYS } from '../../shared/storage/keys.js';
import { escapeHtml } from '../../shared/html.js';
import { formatKickoffLabel, hasKickedOff } from './gameInfo.js';
import { earlySwaps, earlyTeamsFromKickoffs } from './earlyRule.js';
import { sleeperLineup } from './starterAlertRules.js';

    const weekStamp = () => (State.currentNflWeek == null ? null : `${State.currentNflSeason || ''}-${State.currentNflWeek}`);
    const weekState = () => {
        const w = State.earlyWeek;
        return {
            week: w && typeof w.week === 'string' ? w.week : null,
            schedule: w && Array.isArray(w.schedule) ? w.schedule : [],
            removed: w && Array.isArray(w.removed) ? w.removed : [],
        };
    };
    const readJSON = (key, fallback) => {
        try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
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
        } else if ((State.earlyTeams || []).length || w.schedule.length || w.removed.length) {
            // An install from before S50 with picks: they're this week's now. With nothing to keep, nothing is written
            // (a fresh visit, or one just restored from a backup, gets no key it didn't have; backup.spec.mjs).
            saveWeek({ ...w, week: stamp });
        } else {
            return;
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

    // Also at start-up (init.js), since the page's switches start checked.
    export function syncEarlyFromScheduleToggles() {
        document.querySelectorAll('input[data-action="setEarlyFromSchedule"]').forEach(t => { t.checked = State.earlyFromSchedule; });
    }

    export const setEarlyFromSchedule = function(on) {
        State.earlyFromSchedule = !!on;
        try {
            if (on) localStorage.removeItem(KEYS.mls.earlyFromSchedule);
            else localStorage.setItem(KEYS.mls.earlyFromSchedule, '0');
        } catch (e) { /* storage blocked: the switch still works this visit */ }
        syncEarlyFromScheduleToggles();
        refreshEarlyGames();
    };

    // The day a schedule team plays, in your time ("Thu"), or null when this visit's kickoffs haven't loaded.
    // The kickoff a schedule team plays at, in your time ("Thu 5:15 PM"), or null when this visit's kickoffs haven't loaded.
    function kickoffOf(team) {
        const iso = State.gameTimesByTeam[team];
        const ms = iso ? new Date(iso).getTime() : NaN;
        const label = formatKickoffLabel(iso);
        return label && !isNaN(ms) ? { iso, label, ms } : null;
    }

    // The chips in rows (round 2, owner's choice after a review as a user: a pill per team with its kickoff took ~400px on
    // a phone). One row per kickoff, labelled with it in your time (round 3: a row labelled just "Sun" left you wondering
    // why Sunday was listed; it's the morning games abroad), "Schedule" while this visit's kickoffs haven't loaded, then
    // the teams you added.
    function earlyGroups(teams) {
        const { schedule } = weekState();
        const groups = [];
        const groupFor = (key, label, ms) => {
            let g = groups.find(x => x.key === key);
            if (!g) { g = { key, label, ms, teams: [] }; groups.push(g); }
            return g;
        };
        teams.forEach(t => {
            if (State.earlyFromSchedule && schedule.includes(t)) {
                const k = kickoffOf(t);
                const g = k ? groupFor(k.iso, k.label, k.ms) : groupFor('schedule', 'Schedule', Infinity);
                g.teams.push({ team: t, source: 'schedule' });
            } else {
                groupFor('added', 'Added', Infinity).teams.push({ team: t, source: 'added' });
            }
        });
        const rank = (g) => (g.key === 'added' ? 2 : g.key === 'schedule' ? 1 : 0);
        return groups.sort((x, y) => rank(x) - rank(y) || x.ms - y.ms);
    }

    function emptyText() {
        if (!State.earlyFromSchedule) return 'No teams selected.';
        if (kickoffsLoaded()) return 'No games before Sunday 1:00 PM Eastern this week.';
        return 'This week’s kickoff times haven’t loaded yet. You can add teams yourself.';
    }

    function renderEarlyCard() {
        // Every copy of the switch: the Early Games card's and Advanced Settings' (S52 round 8, owner's choice).
        syncEarlyFromScheduleToggles();
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
        const html = earlyGroups(teams).map(g => `<div class="early-day" data-group="${g.key}"><span class="early-day-label">${escapeHtml(g.label)}</span><div class="early-day-teams">${
            g.teams.map(({ team, source }) => `<div class="team-chip" data-source="${source}">${team}<button type="button" class="close-chip" data-action="removeEarlyTeam" data-team="${team}" aria-label="Remove ${team} (${source === 'schedule' ? 'from the schedule' : 'added by you'}) from Early Games"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`).join('')
        }</div></div>`).join('');
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

    // The early-game swaps (round 3, owner's choice): the swaps that put the later game in a flex slot (earlyRule.js,
    // earlySwaps), read from your Sleeper lineup as of the last sync in a synced league (owner: "just because it looks
    // right on our app, doesn't mean the player is in the correct place on Sleeper"), or from this app's lineup in a
    // manual league or one with no Sleeper lineup set. None when nobody early is in a flex slot, or nobody later can
    // trade places with him. Round 2 showed a reminder whenever a starter played early, every week, with FLEX Kickoff
    // Optimization having already done the swap.
    function reminderSwaps(league) {
        const fromSleeper = league ? sleeperLineup(league) : null;
        const onSleeper = !!fromSleeper && fromSleeper.starters.some(s => s.player);
        const starters = onSleeper ? fromSleeper.starters : ((league && State.manualStartersMap[league.leagueId]) || []);
        const swaps = earlySwaps(starters, {
            slotPositions: SLOT_POSITIONS,
            isEarly: (p) => isEarlyPlayer(p.team),
            started: (p) => hasKickedOff(p),
            kickoffMs: (p) => { const k = kickoffOf(p.team); return k ? k.ms : NaN; },
        });
        return { swaps, onSleeper };
    }

    // Swaps you dismissed with Got it, this NFL week (round 4; KEYS.mls.earlyDismissed, { week, keys }).
    const swapKey = (w) => `${w.early.id}>${w.later.id}`;
    function dismissedKeys() {
        const d = readJSON(KEYS.mls.earlyDismissed, null);
        return d && d.week === weekStamp() && Array.isArray(d.keys) ? d.keys : [];
    }
    export const dismissEarlySwaps = function(keys) {
        const add = String(keys || '').split(',').filter(Boolean);
        writeJSON(KEYS.mls.earlyDismissed, { week: weekStamp(), keys: [...new Set([...dismissedKeys(), ...add])] });
        renderLineupUI();
        // The button is gone with the redraw: keep keyboard focus in the box (its title line), not the top of the page
        // (round 6).
        (document.querySelector('#optimalLineupContainer .lineup-needs-title')
            || document.querySelector('#lineupTab [data-action="optimizeLineup"]'))?.focus();
    };

    // The swaps as part of "This lineup needs you" (round 4, owner's choice: the amber banner above the lineup took
    // ~150px on a phone, on top of that box): { title, summary, body, count } for getLineupNeedsHTML (gameInfo.js), or
    // null. A suggestion, so it doesn't count toward the box's "needs you" or the Dashboard's (F12's rule stays).
    // The swaps still to show for a league: Got it's left out. { swaps, onSleeper }.
    function openSwaps(league) {
        const { swaps, onSleeper } = reminderSwaps(league);
        const gone = dismissedKeys();
        return { swaps: swaps.filter(w => !gone.includes(swapKey(w))), onSleeper };
    }

    // The Dashboard's league card (round 5, render/leagueCards.js): one muted line naming the swaps, so a Thursday look
    // across every league shows which have one, without opening each. "" when there's none. Never counted either.
    export function earlySwapCardLine(league) {
        const { swaps, onSleeper } = openSwaps(league);
        if (!swaps.length) return '';
        const who = (p, slot) => `${escapeHtml(p.name)} (${escapeHtml(slotDisplayName(slot))})`;
        return `Early games: swap ${swaps.map(w => `${who(w.early, w.earlySlot)} with ${who(w.later, w.laterSlot)}`).join('; ')}${onSleeper ? ' on Sleeper' : ''}`;
    }

    export function earlySwapNeeds(league) {
        const { swaps, onSleeper } = openSwaps(league);
        if (!swaps.length) return null;
        const n = swaps.length, s = n === 1 ? '' : 's';
        const who = (p, slot) => `<strong class="text-main">${escapeHtml(p.name)}</strong> (${escapeHtml(slotDisplayName(slot))}, ${escapeHtml(kickoffOf(p.team).label)})`;
        const items = swaps.map(w => `${who(w.early, w.earlySlot)} with ${who(w.later, w.laterSlot)}`);
        // One swap is one sentence; several lead with why, then the list (round 6): "Swap these, so your FLEX slots hold
        // the later games:" (a slot named twice is plural).
        const slotNames = [...new Set(swaps.map(w => w.earlySlot))].map(t => {
            const many = swaps.filter(w => w.earlySlot === t).length > 1;
            return `${slotDisplayName(t)}${many ? ' slots' : ''}`;
        });
        const plural = n > 1;
        const why = `so your ${slotNames.join(' and ')} ${plural ? 'hold' : 'holds'} the later game${s}`;
        const text = n === 1 ? `Swap ${items[0]}, ${why}.` : `Swap these, ${why}:<ul class="early-swap-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
        const synced = league && league.lastSyncedAt ? formatKickoffLabel(new Date(league.lastSyncedAt).toISOString()) : '';
        const note = onSleeper
            ? `On Sleeper, as of your last sync${synced ? `, ${escapeHtml(synced)}` : ''}.`
            : 'Use ⇄ Swap on his row.';
        const body = `<p class="lineup-needs-sleeper-text">${text}</p>`
            + `<p class="lineup-needs-note early-swap-note"><span>${note}</span> <button type="button" class="btn btn-secondary mls-btn-sm lineup-needs-btn" data-action="dismissEarlySwaps" data-keys="${escapeHtml(swaps.map(swapKey).join(','))}" aria-label="Got it: hide ${n === 1 ? 'this early-game swap' : 'these early-game swaps'} for the week">Got it</button></p>`;
        return {
            count: n,
            onSleeper,
            title: `Early games: ${n} swap${s} to consider`,
            summary: `Early games: ${n} swap${s}${onSleeper ? ' on Sleeper' : ''}`,
            body,
        };
    }

    export function isEarlyPlayer(teamStr) {
        if (!teamStr || teamStr === "FA") return false;
        return getEarlyTeams().includes(teamStr.toUpperCase());
    }
