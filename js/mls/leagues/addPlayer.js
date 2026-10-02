// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: ADD PLAYER MANUALLY
// (and deletePlayer, which sat with it).
import { escapeHtml } from '../compat.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { attachPlayerAutocomplete } from '../players.js';
import { loadRosterTab } from '../legacy.js';

    // --- ADD PLAYER MANUALLY: keyboard fast path + "Added this session" list ---
    // Built for keying in a whole league from the keyboard: type a name, Enter picks the
    // single (or arrowed-to) suggestion, Enter again saves and clears the field for the next
    // player. Every add still saves immediately -- there's deliberately no "Submit roster"
    // step, so closing the tab halfway through a league loses nothing. The list under the form
    // is the safety net instead: it shows who went in, newest first, with a one-click undo.
    //
    // _manualAddLog is in-memory only (resets on reload). It's a record of this sitting's
    // entries, not a second copy of the roster -- entries are resolved against league.roster at
    // render time, so a player removed anywhere else (Roster tab, re-sync) just drops out.
    const _manualAddLog = []; // { leagueId, playerId }, newest first
    let _manualSelected = null; // last autocomplete pick in the name field
    let _manualMsgTimer = null;

    export function setManualAddMsg(text, { isError = false, clearAfterMs = 0 } = {}) {
        const msgEl = document.getElementById('manualAddMsg');
        if (!msgEl) return;
        clearTimeout(_manualMsgTimer);
        msgEl.innerText = text || "";
        msgEl.classList.toggle('is-error', !!(text && isError));
        if (text && clearAfterMs) _manualMsgTimer = setTimeout(() => setManualAddMsg(""), clearAfterMs);
    }

    export function initManualAddForm() {
        const nameEl = document.getElementById('manualName');
        const teamEl = document.getElementById('manualTeam');
        const posEl = document.getElementById('manualPos');
        if (!nameEl) return;

        const ac = attachPlayerAutocomplete(nameEl, (p) => {
            _manualSelected = p;
            if (posEl) posEl.value = p.pos;
            if (teamEl) teamEl.value = p.team;
        });

        nameEl.addEventListener('input', () => {
            // Any edit after a pick means the field no longer holds that pick.
            if (_manualSelected && nameEl.value.trim() !== _manualSelected.name) _manualSelected = null;
            setManualAddMsg("");
        });

        // Registered after the autocomplete's own keydown listener, so on the Enter that picks
        // a suggestion, e.defaultPrevented is already true and this skips it -- one keypress
        // never both selects and saves. e.repeat guards against a held-down Enter saving twice.
        nameEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.isComposing) return;
            if (_manualSelected && nameEl.value.trim() === _manualSelected.name) {
                e.preventDefault();
                window.addManualPlayer({ fromKeyboard: true });
                return;
            }
            // Name was typed but never picked. Saving it on Enter would make every typo a
            // roster entry, so point at the deliberate routes instead. Stay quiet while the
            // dropdown is open or its results are still loading -- Enter there just means
            // "not narrowed down yet".
            if (nameEl.value.trim() && !(ac && (ac.isOpen() || ac.isPending()))) {
                setManualAddMsg("No match picked. Choose a player from the list, or fill in Position and Team and press Enter in the Team box to add this name as typed.");
            }
        });

        // Enter in Team = submit the form as filled. This is the keyboard route for a name
        // that isn't in Sleeper's player list (or when that list couldn't load).
        if (teamEl) {
            teamEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
                e.preventDefault();
                window.addManualPlayer({ fromKeyboard: true });
            });
        }

        const logEl = document.getElementById('manualAddLog');
        if (logEl) {
            logEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.mls-manual-log-remove');
                if (btn) undoManualAdd(btn.dataset.playerId);
            });
        }
    }

    function removePlayerFromLeague(league, playerId) {
        const pToRemove = (league.roster || []).find(p => p.id === playerId);
        if (!pToRemove) return null;
        if (league.globalRosterMap) delete league.globalRosterMap[pToRemove.cleanName];
        league.roster = league.roster.filter(p => p.id !== playerId);
        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        return pToRemove;
    }

    // No confirm dialog here, unlike deletePlayer: this only appears next to a player that was
    // just keyed in, and a confirm on every typo fix would undo the point of the fast path.
    function undoManualAdd(playerId) {
        const league = getActiveLeague();
        if (!league) return;
        const removed = removePlayerFromLeague(league, playerId);
        if (!removed) { renderManualAddLog(); return; }
        window.optimizeLineup(true);
        loadRosterTab(); // also re-renders the log
        setManualAddMsg(`Removed ${removed.name}`, { clearAfterMs: 4000 });
        const nameEl = document.getElementById('manualName');
        if (nameEl) nameEl.focus();
    }

    export function renderManualAddLog() {
        const el = document.getElementById('manualAddLog');
        if (!el) return;
        const league = getActiveLeague();
        const rosterById = new Map(((league && league.roster) || []).map(p => [p.id, p]));
        const entries = league
            ? _manualAddLog.filter(e => e.leagueId === league.leagueId && rosterById.has(e.playerId)).map(e => rosterById.get(e.playerId))
            : [];
        if (entries.length === 0) { el.innerHTML = ""; return; }

        const total = league.roster.length;
        el.innerHTML = `
            <div class="mls-manual-log-head">
                <span>Added this session (${entries.length})</span>
                <span class="mls-manual-log-total">${escapeHtml(league.name)}: ${total} player${total === 1 ? '' : 's'}</span>
            </div>
            <ul class="mls-manual-log-list">
                ${entries.map((p, i) => `
                <li class="mls-manual-log-item${i === 0 ? ' is-latest' : ''}">
                    <span class="mls-manual-log-name">${escapeHtml(p.name)}</span>
                    <span class="mls-manual-log-meta">${escapeHtml(p.pos)} · ${escapeHtml(p.team)}</span>
                    ${i === 0 ? '<span class="mls-manual-log-tag">Last added</span>' : ''}
                    <button type="button" class="mls-manual-log-remove" data-player-id="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.name)}" title="Remove from roster">&times;</button>
                </li>`).join('')}
            </ul>`;
    }

    export const addManualPlayer = function(opts = {}) {
        let league = getActiveLeague();
        if (!league) { if (window.showToast) window.showToast("Please add or select a league first.", { isError: true }); return; }
        const nameInput = document.getElementById('manualName');
        const posInput = document.getElementById('manualPos');
        const teamInput = document.getElementById('manualTeam');

        const name = nameInput ? nameInput.value.trim() : "";
        const pos = posInput ? posInput.value : "FLEX";
        const team = teamInput ? teamInput.value.trim().toUpperCase() || "FA" : "FA";

        if (!name) { if (window.showToast) window.showToast("Please enter a player name.", { isError: true }); return; }

        const cleanName = normalizeName(name);
        league.roster = league.roster || [];
        // Fast keyboard entry makes a double add easy (same name keyed twice in a long list),
        // and a duplicate would show up twice in the optimizer. Keep the text so it can be fixed.
        const existing = league.roster.find(p => p.cleanName === cleanName);
        if (existing) {
            setManualAddMsg(`${existing.name} is already on this roster.`, { isError: true });
            if (nameInput) { nameInput.focus(); nameInput.select(); }
            return;
        }

        let newP = { id: 'p_' + Date.now(), name: name, cleanName: cleanName, pos: pos, team: team };
        league.roster.push(newP);

        league.globalRosterMap = league.globalRosterMap || {};
        league.globalRosterMap[newP.cleanName] = "You";

        localStorage.setItem('mds_season_leagues', JSON.stringify(State.leagues));
        _manualAddLog.unshift({ leagueId: league.leagueId, playerId: newP.id });
        _manualSelected = null;
        if (nameInput) nameInput.value = "";
        if (teamInput) teamInput.value = "";
        setManualAddMsg("");
        window.optimizeLineup(true);
        loadRosterTab(); // also re-renders the "Added this session" list

        // Keyboard adds keep the cursor in the name field for the next player. Button taps
        // don't, since refocusing there would pop the on-screen keyboard back open on phones.
        if (opts.fromKeyboard && nameInput) nameInput.focus();
    };

    export const deletePlayer = async function(playerId) {
        let league = getActiveLeague();
        if (!league) return;
        // Name the player, for the same reason deleteLeagueManager names the league: the roster
        // is a column of identical ✕ buttons, and on a phone the dialog covers the row you just
        // tapped, so "Remove player?" gave you nothing to check the tap against. The name comes
        // from Sleeper; dialogMessageHTML escapes the body, so it goes in raw here.
        const player = (league.roster || []).find(p => p.id === playerId);
        const playerLabel = player && player.name ? `"${player.name}"` : 'this player';
        if (await window.showConfirm(`This takes ${playerLabel} off your active roster in this league. You can add them back from the Roster tab.`, { title: 'Remove player?', confirmText: 'Remove', danger: true })) {
            removePlayerFromLeague(league, playerId);
            window.optimizeLineup(true);
            loadRosterTab();
        }
    };
