// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: NAMED RANKING SETS
// and CHOOSING WHICH LEAGUES USE A RANKING SET (the set dropdown, saving an upload as a set, the
// league picker and its dialog, deleting a set).
import { escapeHtml } from '../compat.js';
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { saveActiveLeagueState } from '../leagues/sync.js';
import { setRankingsCardExpanded, updateRankingsMetaDisplay } from './engine.js';
import { loadRosterTab } from '../main.js';
import { KEYS } from '../../shared/storage/keys.js';

    // --- NAMED RANKING SETS ---
    // Rankings are now named, reusable sets that a league REFERENCES (by id) rather than owns
    // a full copy of -- so uploading "Dynasty PPR 2026" once and applying it to five leagues
    // stores that data once, not five times, and switching to a league shows exactly the set
    // you last picked for it rather than silently inheriting whatever another league last had
    // active. ROS and Weekly are kept as two separate pools, matching how they already work.
    //
    // Migration note: leagues that accumulated their own rankings copy under the old model
    // (league.rosRankings / league.weeklyRankings, still populated from before this existed)
    // are NOT auto-converted into a named set. That legacy data stays available as a distinct
    // "Unassigned Upload (legacy)" option in the dropdown until the user picks or creates a
    // real named set for that league -- nothing is silently discarded, but nothing is silently
    // promoted into the new system either.
    //
    // RANKING_TYPE_CONFIG itself lives up with the other top-of-file constants, since
    // switchActiveLeague() (defined well above this section) needs it too.

    // Works out where saveRankingsAsSet would put an upload right now, without writing anything.
    // Mirrors the branch below exactly (including '__legacy__' falling through to a new set),
    // so the preview modal can name the destination before the user commits.
    //
    // This matters because an in-place update is destructive and has no undo: with a named set
    // selected, an upload replaces that set's data, and every league pointed at the set follows
    // it (see the league picker below). The preview used to describe only the incoming file, never
    // what it was about to overwrite.
    export function resolveRankingsTarget(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const nameInput = document.getElementById(cfg.nameInputId);
        const currentSelection = selectEl ? selectEl.value : '__new__';

        if (currentSelection && currentSelection !== '__new__' && currentSelection !== '__legacy__') {
            const existing = State.rankingSets[cfg.setsKey].find(s => s.id === currentSelection);
            if (existing) {
                return {
                    mode: 'replace',
                    id: existing.id,
                    name: existing.name,
                    playerCount: Array.isArray(existing.data) ? existing.data.length : 0,
                    leagueCount: State.leagues.filter(l => l[cfg.leagueSetIdKey] === existing.id).length
                };
            }
        }

        const defaultName = `${cfg.label} Rankings – ${new Date().toLocaleDateString()}`;
        return { mode: 'new', name: (nameInput && nameInput.value.trim()) || defaultName };
    }

    // Called after a successful upload or auto-fetch with the freshly parsed data. Updates the
    // currently-selected set in place if one's selected in the dropdown; otherwise creates a new
    // named set (using the name field, or a sensible default) and assigns it to the active league.
    export function saveRankingsAsSet(type, parsedData) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const nameInput = document.getElementById(cfg.nameInputId);
        const currentSelection = selectEl ? selectEl.value : '__new__';

        let league = getActiveLeague();
        let setId = null;

        if (currentSelection && currentSelection !== '__new__' && currentSelection !== '__legacy__') {
            let existing = State.rankingSets[cfg.setsKey].find(s => s.id === currentSelection);
            if (existing) {
                existing.data = parsedData;
                existing.updatedAt = Date.now();
                setId = existing.id;
            }
        }

        if (!setId) {
            const defaultName = `${cfg.label} Rankings – ${new Date().toLocaleDateString()}`;
            const name = (nameInput && nameInput.value.trim()) || defaultName;
            const newSet = { id: 'rset_' + Date.now(), name, createdAt: Date.now(), updatedAt: Date.now(), data: parsedData };
            State.rankingSets[cfg.setsKey].push(newSet);
            setId = newSet.id;
            if (nameInput) nameInput.value = '';
        }

        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));

        State[cfg.stateKey] = [...parsedData];
        State[cfg.updatedAtKey] = Date.now();
        // Keep the flat global fallback keys updated too, for consistency with how they're
        // already used elsewhere (e.g. a brand new league with nothing assigned yet).
        localStorage.setItem(cfg.globalDataKey, JSON.stringify(parsedData));
        localStorage.setItem(cfg.globalUpdatedKey, State[cfg.updatedAtKey]);

        if (league) league[cfg.leagueSetIdKey] = setId;
        saveActiveLeagueState();
        updateRankingsMetaDisplay();
        return setId;
    }

    // Fills a type's <select> with the active league's legacy data (if any), every named set,
    // and a "+ Create New Set" option -- then selects whichever one the active league is
    // actually using right now, and shows/hides the name input and delete button to match.
    export function populateRankingSetDropdown(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        if (!selectEl) return;

        const league = getActiveLeague();
        const sets = State.rankingSets[cfg.setsKey];
        const assignedId = league ? league[cfg.leagueSetIdKey] : null;
        const legacyData = league ? league[cfg.leagueLegacyDataKey] : null;
        const hasLegacy = Array.isArray(legacyData) && legacyData.length > 0;

        let optionsHTML = '';
        if (hasLegacy) {
            optionsHTML += `<option value="__legacy__">Unassigned Upload (legacy) — ${legacyData.length} players</option>`;
        }
        sets.forEach(s => {
            // Set names are typed by the user (or defaulted from a file name), so escaped.
            optionsHTML += `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${s.data.length} players)</option>`;
        });
        optionsHTML += `<option value="__new__">+ Create New Set</option>`;
        selectEl.innerHTML = optionsHTML;

        let selectedVal = '__new__';
        if (assignedId && sets.some(s => s.id === assignedId)) {
            selectedVal = assignedId;
        } else if (hasLegacy) {
            selectedVal = '__legacy__';
        }
        selectEl.value = selectedVal;

        const nameWrap = document.getElementById(cfg.nameInputWrapId);
        const deleteBtn = document.getElementById(cfg.deleteBtnId);
        if (nameWrap) nameWrap.style.display = (selectedVal === '__new__') ? 'flex' : 'none';
        if (deleteBtn) deleteBtn.style.display = (selectedVal !== '__new__' && selectedVal !== '__legacy__') ? 'inline-block' : 'none';

        updateRankingSetHeader(type);
        updateSetLeaguesRow(type);
    }

    // Header line naming the set the active league actually uses. Kept in the card header (not
    // the body) so it's still readable with the card collapsed. Reads the league's assignment
    // rather than the dropdown, which can sit on "+ Create New Set" before anything is saved.
    function updateRankingSetHeader(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const el = document.getElementById(cfg.headerSetNameId);
        if (!el) return;
        const league = getActiveLeague();
        const text = league ? describeLeagueRankings(type, league) : null;
        if (!text || text === 'No set') {
            el.textContent = '';
            el.removeAttribute('title');
            return;
        }
        el.innerHTML = `Set: <strong>${escapeHtml(text)}</strong>`;
        el.title = text; // full name on hover when it's truncated
    }

    // "Used in 2 of 5 leagues · Choose leagues..." under the dropdown. Hidden when there's only
    // one league (nothing to choose) or no saved set is selected (nothing to apply yet).
    function updateSetLeaguesRow(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const row = document.getElementById(cfg.leaguesRowId);
        if (!row) return;
        const selectEl = document.getElementById(cfg.selectId);
        const val = selectEl ? selectEl.value : '__new__';
        const isRealSet = val && val !== '__new__' && val !== '__legacy__';
        if (!isRealSet || State.leagues.length < 2) { row.style.display = 'none'; return; }
        const used = State.leagues.filter(l => l[cfg.leagueSetIdKey] === val).length;
        const summary = document.getElementById(cfg.leaguesSummaryId);
        if (summary) summary.textContent = `Used in ${used} of ${State.leagues.length} leagues`;
        row.style.display = '';
    }

    // User manually picked a different set (or legacy data, or "create new") from the dropdown.
    export const onRankingSetSelectChange = function(type, selectEl) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const val = selectEl.value;
        const nameWrap = document.getElementById(cfg.nameInputWrapId);
        const deleteBtn = document.getElementById(cfg.deleteBtnId);

        if (val === '__new__') {
            if (nameWrap) nameWrap.style.display = 'flex';
            if (deleteBtn) deleteBtn.style.display = 'none';
            updateSetLeaguesRow(type);
            return; // don't touch State yet -- wait for an actual upload/fetch to create the set
        }
        if (nameWrap) nameWrap.style.display = 'none';

        let league = getActiveLeague();
        if (!league) return;

        if (val === '__legacy__') {
            State[cfg.stateKey] = league[cfg.leagueLegacyDataKey] || [];
            State[cfg.updatedAtKey] = league[cfg.leagueLegacyUpdatedKey] || null;
            league[cfg.leagueSetIdKey] = null;
            if (deleteBtn) deleteBtn.style.display = 'none';
        } else {
            const set = State.rankingSets[cfg.setsKey].find(s => s.id === val);
            if (!set) return;
            State[cfg.stateKey] = [...set.data];
            State[cfg.updatedAtKey] = set.updatedAt;
            league[cfg.leagueSetIdKey] = set.id;
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
        }

        saveActiveLeagueState();
        updateRankingsMetaDisplay();
        // Picking a set is the whole job for most visits to this card, so get it out of the way
        // of the roster/lineup below. The header keeps showing which set is in use.
        setRankingsCardExpanded(cfg.cardId, false);

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'rosterTab' && typeof loadRosterTab === 'function') loadRosterTab();
        if (activeTab && activeTab.id === 'lineupTab' && typeof window.optimizeLineup === 'function') window.optimizeLineup(false);
    };

    // --- CHOOSING WHICH LEAGUES USE A RANKING SET ---
    // Replaces the old all-or-nothing "Apply this set to all leagues" with a checklist, so a set
    // can go to three of five leagues without touching the other two ("Select all" covers the
    // old behavior). Used in three places, all through renderLeaguePicker below:
    //   * the upload preview modal ("Also use this set in"), so leagues are picked as the set
    //     is added -- additive only there, leagues already on the set stay locked on;
    //   * a standalone dialog after Auto-Fetch creates a new set (no preview modal on that path);
    //   * "Choose leagues..." under the set dropdown, any time -- the one place a league can be
    //     unchecked off a set, since that's the view built around editing the whole list.
    // The active league is always checked and locked: choosing a set in its dropdown, or saving
    // an upload, already assigns the set there.

    // What a league uses for this ranking type right now, for the picker's "Currently:" notes
    // and the card header. Same priority as hydrateRankingsForLeague.
    function describeLeagueRankings(type, league) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const setId = league[cfg.leagueSetIdKey];
        const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
        if (set) return set.name;
        const legacy = league[cfg.leagueLegacyDataKey];
        if (Array.isArray(legacy) && legacy.length > 0) return 'Unassigned upload (legacy)';
        return 'No set';
    }

    // setId: the set being assigned, or null for one that doesn't exist yet (a new upload).
    // allowRemove: leagues already on the set can be unchecked (standalone dialog) rather than
    // shown locked on (upload preview).
    export function renderLeaguePicker(container, type, { setId = null, allowRemove = false, heading = '' } = {}) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const activeId = State.activeLeagueId;
        const leagues = [...State.leagues].sort((a, b) => (b.leagueId === activeId) - (a.leagueId === activeId));

        let selectableCount = 0;
        const rows = leagues.map(l => {
            const isActive = l.leagueId === activeId;
            const onSet = !!setId && l[cfg.leagueSetIdKey] === setId;
            const locked = isActive || (onSet && !allowRemove);
            if (!locked) selectableCount++;
            const note = isActive ? 'This league'
                : onSet ? 'Already using this set'
                : `Currently: ${describeLeagueRankings(type, l)}`;
            return `
                <label class="mls-league-picker-row${locked ? ' is-locked' : ''}">
                    <input type="checkbox" value="${escapeHtml(l.leagueId)}" data-was-on="${onSet ? '1' : '0'}"${(isActive || onSet) ? ' checked' : ''}${locked ? ' disabled' : ''}>
                    <span class="mls-league-picker-text">
                        <span class="mls-league-picker-name">${escapeHtml(l.name || 'Unnamed league')}</span>
                        <span class="mls-league-picker-note">${escapeHtml(note)}</span>
                    </span>
                </label>`;
        }).join('');

        container.innerHTML = `
            <div class="mls-league-picker-head">
                <span>${escapeHtml(heading)}</span>
                ${selectableCount > 1 ? '<button type="button" class="mls-btn-sm btn-link-inline" data-picker-all>Select all</button>' : ''}
            </div>
            <div class="mls-league-picker-list">${rows}</div>`;

        // Property handlers rather than addEventListener: the same container is re-rendered on
        // every open, and this keeps it to exactly one handler each.
        const boxes = () => [...container.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
        const syncAllLabel = () => {
            const btn = container.querySelector('[data-picker-all]');
            if (btn) btn.textContent = boxes().every(b => b.checked) ? 'Clear all' : 'Select all';
        };
        container.onclick = (e) => {
            if (!e.target.closest('[data-picker-all]')) return;
            const turnOn = !boxes().every(b => b.checked);
            boxes().forEach(b => { b.checked = turnOn; });
            syncAllLabel();
        };
        container.onchange = syncAllLabel;
        syncAllLabel();
    }

    export function readLeaguePicker(container) {
        const boxes = [...container.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
        return {
            add: boxes.filter(b => b.checked && b.dataset.wasOn !== '1').map(b => b.value),
            remove: boxes.filter(b => !b.checked && b.dataset.wasOn === '1').map(b => b.value)
        };
    }

    // Removing a league leaves it with no set of this type (its legacy upload, if it still has
    // one, takes over -- same fallback hydrateRankingsForLeague already uses). Never touches the
    // active league: the picker locks that row, and this double-checks rather than trusting it.
    export function assignSetToLeagues(type, setId, { add = [], remove = [] } = {}) {
        const cfg = RANKING_TYPE_CONFIG[type];
        if (!setId || (add.length === 0 && remove.length === 0)) return;
        State.leagues.forEach(l => {
            if (l.leagueId === State.activeLeagueId) return;
            if (add.includes(l.leagueId)) l[cfg.leagueSetIdKey] = setId;
            else if (remove.includes(l.leagueId) && l[cfg.leagueSetIdKey] === setId) l[cfg.leagueSetIdKey] = null;
        });
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        updateSetLeaguesRow(type);
    }

    // Standalone picker dialog. Resolves { add, remove } on Save, or null on Cancel / Escape /
    // backdrop click. Same close behavior as showConfirm in js/shared/ui/confirm.js.
    let leaguePickerOpen = false;
    export function openLeaguePickerDialog(type, set, { title, intro, allowRemove = false, confirmText = 'Save', cancelText = 'Cancel' } = {}) {
        const overlay = document.getElementById('rankingLeaguesOverlay');
        if (!overlay || leaguePickerOpen) return Promise.resolve(null);
        const titleEl = document.getElementById('rankingLeaguesTitle');
        const introEl = document.getElementById('rankingLeaguesIntro');
        const listEl = document.getElementById('rankingLeaguesList');
        const okBtn = overlay.querySelector('[data-league-picker="ok"]');
        const cancelBtn = overlay.querySelector('[data-league-picker="cancel"]');

        if (titleEl) titleEl.textContent = title || `Leagues using "${set.name}"`;
        if (introEl) introEl.textContent = intro || '';
        if (okBtn) okBtn.textContent = confirmText;
        if (cancelBtn) cancelBtn.textContent = cancelText;
        renderLeaguePicker(listEl, type, { setId: set.id, allowRemove });

        leaguePickerOpen = true;
        overlay.style.display = 'flex';

        return new Promise(resolve => {
            let trap = null;
            function settle(result) {
                if (!leaguePickerOpen) return;
                leaguePickerOpen = false;
                overlay.style.display = 'none';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('mousedown', onBackdrop);
                if (trap) trap.deactivate();
                resolve(result);
            }
            function onOk() { settle(readLeaguePicker(listEl)); }
            function onCancel() { settle(null); }
            function onBackdrop(e) { if (e.target === overlay) settle(null); }
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            overlay.addEventListener('mousedown', onBackdrop);
            if (typeof window.createFocusTrap === 'function') {
                trap = window.createFocusTrap(overlay, { onEscape: () => settle(null) });
                trap.activate();
            }
        });
    }

    export function leagueCountText(n) { return `${n} league${n === 1 ? '' : 's'}`; }

    // "Choose leagues..." link under the set dropdown.
    export const openRankingSetLeagues = async function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const val = selectEl ? selectEl.value : null;

        if (!val || val === '__new__') {
            if (window.showToast) window.showToast("Please select a saved ranking set first.", { isError: true });
            return;
        }
        if (val === '__legacy__') {
            if (window.showToast) window.showToast("Legacy data can't be shared with other leagues. Upload it as a new set first.", { isError: true });
            return;
        }
        const set = State.rankingSets[cfg.setsKey].find(s => s.id === val);
        if (!set) return;

        const result = await openLeaguePickerDialog(type, set, {
            allowRemove: true,
            intro: `Check each league that should use this ${cfg.label} set. Unchecking a league leaves it with no ${cfg.label} set until you pick one there.`
        });
        if (!result) return;
        if (result.add.length === 0 && result.remove.length === 0) {
            if (window.showToast) window.showToast('No changes made.');
            return;
        }
        assignSetToLeagues(type, set.id, result);
        const usedCount = State.leagues.filter(l => l[cfg.leagueSetIdKey] === set.id).length;
        if (window.showToast) window.showToast(`"${set.name}" is now used in ${leagueCountText(usedCount)}.`);
    };

    // Deletes the currently-selected named set entirely. Any league referencing it (not just
    // the active one) falls back to unassigned, since the data it pointed to no longer exists.
    export const deleteRankingSet = async function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const setId = selectEl ? selectEl.value : null;
        if (!setId || setId === '__new__' || setId === '__legacy__') return;

        const set = State.rankingSets[cfg.setsKey].find(s => s.id === setId);
        if (!set) return;

        if (!await window.showConfirm("Any league using this set will need a new one selected. This can't be undone.", { title: `Delete "${set.name}"?`, confirmText: 'Delete Set', danger: true })) return;

        State.rankingSets[cfg.setsKey] = State.rankingSets[cfg.setsKey].filter(s => s.id !== setId);
        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));

        State.leagues.forEach(l => {
            if (l[cfg.leagueSetIdKey] === setId) l[cfg.leagueSetIdKey] = null;
        });
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));

        let league = getActiveLeague();
        if (league && league[cfg.leagueSetIdKey] === null) {
            State[cfg.stateKey] = [];
            State[cfg.updatedAtKey] = null;
        }

        if (window.showToast) window.showToast(`Deleted "${set.name}".`);
        updateRankingsMetaDisplay();
    };
