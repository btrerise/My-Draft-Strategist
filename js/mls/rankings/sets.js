// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: NAMED RANKING SETS
// and CHOOSING WHICH LEAGUES USE A RANKING SET (the set dropdown, saving an upload as a set, the
// league picker and its dialog, deleting a set).
import { escapeHtml } from '../../shared/html.js';
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { saveActiveLeagueState } from '../leagues/sync.js';
import { setRankingsCardExpanded, updateRankingsMetaDisplay } from './engine.js';
import { loadRosterTab, optimizeLineup } from '../main.js';
import { KEYS } from '../../shared/storage/keys.js';
import { createFocusTrap } from '../../shared/ui/focusTrap.js';
import { showToast } from '../../shared/ui/toast.js';
import { showConfirm } from '../../shared/ui/confirm.js';
import { showPrompt } from '../../shared/ui/prompt.js';
import { noteNewRankingsSet, noteRankingsReplace } from './changeSummary.js';
import { IN_SEASON, SEASON_SET_KEY, hasSeasonSlot, leaguesWithoutSeason, seasonOffer, seasonSetFor, setUsage } from './season.js';

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
                // Keep the old rankings in memory for the "What changed" card (changeSummary.js),
                // which the caller shows once it has re-optimized. Not stored anywhere.
                // A Weekly set is compared with this week's first upload, and not at all on a new
                // week's first upload (see changeSummary.js).
                noteRankingsReplace(type, { set: existing, newData: parsedData });
                // The chips on player rows describe the previous upload; showRankingsChange sets new ones.
                delete existing.lastChanges;
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
            noteNewRankingsSet(type, newSet); // a new set replaced nothing; a Weekly one starts its week
        }

        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));

        State[cfg.stateKey] = [...parsedData];
        State[cfg.updatedAtKey] = Date.now();
        // Keep the flat global fallback keys updated too. Since improvements F4 they're read only at
        // start-up, and only when no league has rankings of this type of its own (a setup from
        // before per-league rankings, where they're the only copy); see js/mls/init.js.
        localStorage.setItem(cfg.globalDataKey, JSON.stringify(parsedData));
        localStorage.setItem(cfg.globalUpdatedKey, State[cfg.updatedAtKey]);

        if (league) league[cfg.leagueSetIdKey] = setId;
        saveActiveLeagueState();
        updateRankingsMetaDisplay();
        return setId;
    }

    // Fills a type's <select> with the active league's legacy data (if any), every named set,
    // and a "+ Create New Set" option -- then selects whichever one the active league is
    // actually using right now, and shows/hides the name input and the Rename/Delete buttons to match.
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
        if (nameWrap) nameWrap.style.display = (selectedVal === '__new__') ? 'flex' : 'none';
        showSavedSetButtons(cfg, selectedVal !== '__new__' && selectedVal !== '__legacy__');

        updateRankingSetHeader(type);
        updateSetLeaguesRow(type);
        if (type === 'ros') populateSeasonPicker();
    }

    // Rename and Delete act on a saved set, so they show only while one is selected: not for
    // "+ Create New Set" or "Unassigned Upload (legacy)".
    function showSavedSetButtons(cfg, isSavedSet) {
        const deleteBtn = document.getElementById(cfg.deleteBtnId);
        const renameBtn = document.getElementById(cfg.renameBtnId);
        if (deleteBtn) deleteBtn.style.display = isSavedSet ? 'inline-block' : 'none';
        if (renameBtn) renameBtn.style.display = isSavedSet ? 'inline-flex' : 'none';
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
        // A dynasty or keeper league names both slots (improvements S23): "Dynasty: … · In-Season: …".
        const season = type === 'ros' && hasSeasonSlot(league) ? seasonSetFor(league, State.rankingSets.ros) : null;
        if (season) {
            // One line each, so the In-Season set's name shows with the card folded (it was cut off after "In-Season:").
            el.innerHTML = `<span class="rankings-header-slot">Dynasty: <strong>${escapeHtml(text)}</strong></span>`
                + `<span class="rankings-header-slot"><span class="mls-nowrap">In-Season</span>: <strong>${escapeHtml(season.name)}</strong></span>`;
            el.title = `Dynasty: ${text} · In-Season: ${season.name}`;
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
        const summary = document.getElementById(cfg.leaguesSummaryId);
        if (type === 'ros') {
            // A ROS set can also be a dynasty league's In-Season set (improvements S23); both count.
            const { used, asSeason } = setUsage(val, State.leagues);
            if (summary) summary.textContent = `Used in ${used} of ${State.leagues.length} leagues${asSeason ? ` (${asSeason} as In-Season)` : ''}`;
        } else {
            const used = State.leagues.filter(l => l[cfg.leagueSetIdKey] === val).length;
            if (summary) summary.textContent = `Used in ${used} of ${State.leagues.length} leagues`;
        }
        row.style.display = '';
    }

    // User manually picked a different set (or legacy data, or "create new") from the dropdown.
    export const onRankingSetSelectChange = function(type, selectEl) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const val = selectEl.value;
        const nameWrap = document.getElementById(cfg.nameInputWrapId);

        if (val === '__new__') {
            if (nameWrap) nameWrap.style.display = 'flex';
            showSavedSetButtons(cfg, false);
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
            showSavedSetButtons(cfg, false);
        } else {
            const set = State.rankingSets[cfg.setsKey].find(s => s.id === val);
            if (!set) return;
            State[cfg.stateKey] = [...set.data];
            State[cfg.updatedAtKey] = set.updatedAt;
            league[cfg.leagueSetIdKey] = set.id;
            showSavedSetButtons(cfg, true);
        }

        saveActiveLeagueState();
        updateRankingsMetaDisplay();
        // Picking a set is the whole job for most visits to this card, so get it out of the way
        // of the roster/lineup below. The header keeps showing which set is in use.
        setRankingsCardExpanded(cfg.cardId, false);

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'rosterTab' && typeof loadRosterTab === 'function') loadRosterTab();
        if (activeTab && activeTab.id === 'lineupTab') optimizeLineup(false);
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
    // slot 'season' (improvements S23): the In-Season slot of dynasty and keeper leagues, which are the
    // only ones listed.
    export function renderLeaguePicker(container, type, { setId = null, allowRemove = false, heading = '', slot = null } = {}) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const isSeason = slot === 'season';
        const key = isSeason ? SEASON_SET_KEY : cfg.leagueSetIdKey;
        const activeId = State.activeLeagueId;
        const leagues = [...State.leagues].filter(l => !isSeason || hasSeasonSlot(l))
            .sort((a, b) => (b.leagueId === activeId) - (a.leagueId === activeId));

        let selectableCount = 0;
        const rows = leagues.map(l => {
            const isActive = l.leagueId === activeId;
            // The Season slot: a league whose dynasty set is this one can't also use it as In-Season (round 5).
            const ownDynasty = isSeason && !!setId && l.rosRankingSetId === setId && !isActive;
            const onSet = !!setId && l[key] === setId && !ownDynasty;
            const locked = isActive || ownDynasty || (onSet && !allowRemove);
            if (!locked) selectableCount++;
            const seasonNow = isSeason ? seasonSetFor(l, State.rankingSets.ros) : null;
            const note = isActive ? 'This league'
                : ownDynasty ? 'Its dynasty rankings already'
                : onSet ? (isSeason ? 'Already using this set as In-Season' : 'Already using this set')
                : isSeason ? (seasonNow ? `In-Season now: ${seasonNow.name}` : 'No In-Season set (uses its dynasty rankings)')
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
    // slot 'season': a ROS set as the In-Season set of dynasty and keeper leagues (improvements S23).
    export function assignSetToLeagues(type, setId, { add = [], remove = [] } = {}, { slot = null } = {}) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const isSeason = slot === 'season';
        const key = isSeason ? SEASON_SET_KEY : cfg.leagueSetIdKey;
        if (!setId || (add.length === 0 && remove.length === 0)) return;
        State.leagues.forEach(l => {
            if (l.leagueId === State.activeLeagueId) return;
            if (isSeason && !hasSeasonSlot(l)) return;
            if (add.includes(l.leagueId)) l[key] = setId;
            else if (remove.includes(l.leagueId) && l[key] === setId) l[key] = null;
        });
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        updateSetLeaguesRow(type);
        if (isSeason) populateSeasonPicker();
    }

    // Standalone picker dialog. Resolves { add, remove } on Save, or null on Cancel / Escape /
    // backdrop click. Same close behavior as showConfirm in js/shared/ui/confirm.js.
    let leaguePickerOpen = false;
    export function openLeaguePickerDialog(type, set, { title, intro, allowRemove = false, confirmText = 'Save', cancelText = 'Cancel', slot = null } = {}) {
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
        renderLeaguePicker(listEl, type, { setId: set.id, allowRemove, slot });

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
            trap = createFocusTrap(overlay, { onEscape: () => settle(null) });
            trap.activate();
        });
    }

    export function leagueCountText(n) { return `${n} league${n === 1 ? '' : 's'}`; }

    // "Choose leagues..." link under the set dropdown.
    export const openRankingSetLeagues = async function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const val = selectEl ? selectEl.value : null;

        if (!val || val === '__new__') {
            showToast("Please select a saved ranking set first.", { isError: true });
            return;
        }
        if (val === '__legacy__') {
            showToast("Legacy data can't be shared with other leagues. Upload it as a new set first.", { isError: true });
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
            showToast('No changes made.');
            return;
        }
        assignSetToLeagues(type, set.id, result);
        const usedCount = State.leagues.filter(l => l[cfg.leagueSetIdKey] === set.id).length;
        showToast(`"${set.name}" is now used in ${leagueCountText(usedCount)}.`);
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

        const asSeason = type === 'ros' ? setUsage(setId, State.leagues).asSeason : 0;
        const seasonLine = asSeason ? ` ${leagueCountText(asSeason)} using it as ${IN_SEASON} rankings will go back to their dynasty rankings.` : '';
        if (!await showConfirm(`Any league using this set will need a new one selected.${seasonLine} This can't be undone.`, { title: `Delete "${set.name}"?`, confirmText: 'Delete Set', danger: true })) return;

        State.rankingSets[cfg.setsKey] = State.rankingSets[cfg.setsKey].filter(s => s.id !== setId);
        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));

        State.leagues.forEach(l => {
            if (l[cfg.leagueSetIdKey] === setId) l[cfg.leagueSetIdKey] = null;
            if (type === 'ros' && l[SEASON_SET_KEY] === setId) l[SEASON_SET_KEY] = null; // S23
        });
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));

        let league = getActiveLeague();
        if (league && league[cfg.leagueSetIdKey] === null) {
            State[cfg.stateKey] = [];
            State[cfg.updatedAtKey] = null;
        }

        showToast(`Deleted "${set.name}".`);
        updateRankingsMetaDisplay();
        if (type === 'ros' && asSeason) refreshAfterSeasonChange();
    };

    // --- RENAMING A RANKING SET (improvements S2) ---
    // A set's name was fixed when it was created, and the only way to change it was to delete the
    // set and upload again, which also unassigned every league using it. Leagues point at a set by
    // id (cfg.leagueSetIdKey), so a rename changes only `name`: the id, data and updatedAt stay as
    // they are (updatedAt dates the rankings, and a rename doesn't make them any fresher).
    //
    // Every place a set's name shows reads it from State.rankingSets when it draws (the dropdown,
    // the card header, the league picker, the upload preview, the Dashboard's Best Available card,
    // the Waiver Wire Assistant's notes), so redrawing this card is all a rename needs here; the
    // others pick the new name up the next time they draw.
    export const RANKING_SET_NAME_MAX = 60;

    // What's wrong with a proposed name, for showPrompt's validate: an error blocks saving, a
    // warning doesn't. `text` is already trimmed. Same-named sets are allowed (they're told apart
    // by id), but worth a warning, since the dropdown would then show two identical names.
    export function checkRankingSetName(type, setId, text) {
        const cfg = RANKING_TYPE_CONFIG[type];
        if (!text) return { error: 'Enter a name for this set.' };
        if (text.length > RANKING_SET_NAME_MAX) return { error: `Keep it to ${RANKING_SET_NAME_MAX} characters or fewer (this is ${text.length}).` };
        const lower = text.toLowerCase();
        const clash = State.rankingSets[cfg.setsKey].some(s => s.id !== setId && String(s.name || '').trim().toLowerCase() === lower);
        if (clash) return { warning: `Another ${cfg.label} set already has this name. You can still use it.` };
        return null;
    }

    // Renames the set selected in the dropdown.
    export const renameRankingSet = async function(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const selectEl = document.getElementById(cfg.selectId);
        const setId = selectEl ? selectEl.value : null;
        if (!setId || setId === '__new__' || setId === '__legacy__') return;

        const set = State.rankingSets[cfg.setsKey].find(s => s.id === setId);
        if (!set) return;

        const name = await showPrompt('Set name', {
            title: `Rename ${cfg.label} set`,
            value: set.name || '',
            maxLength: RANKING_SET_NAME_MAX,
            confirmText: 'Rename',
            validate: (text) => checkRankingSetName(type, set.id, text)
        });
        if (name === null) return;
        if (name === set.name) {
            showToast('No changes made.');
            return;
        }

        set.name = name;
        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));
        populateRankingSetDropdown(type);
        showToast(`Renamed to "${name}".`);
    };

    // --- SEASON RANKINGS IN DYNASTY AND KEEPER LEAGUES (improvements S23) ---
    // A second picker in the ROS card, under the dynasty set: "None (use your dynasty rankings)" plus
    // every saved ROS set. Shown only in dynasty and keeper leagues; a redraft league's card is exactly
    // as before. The resolver and its rules are in rankings/season.js.
    export function populateSeasonPicker() {
        const row = document.getElementById('seasonRankingsRow');
        const label = document.getElementById('rosRankingSetLabel');
        const league = getActiveLeague();
        const show = hasSeasonSlot(league);
        if (label) label.textContent = show ? 'Dynasty rankings for this league' : 'Ranking Set for this League';
        const title = document.getElementById('rosRankingsTitle');
        // "In-Season" kept whole: a phone wrapped the title at its hyphen.
        if (title) title.innerHTML = show ? 'Dynasty &amp; <span class="mls-nowrap">In-Season</span> Rankings' : 'Rest-of-Season (ROS) Rankings';
        if (!row) return;
        row.hidden = !show;
        if (!show) return;

        const sets = State.rankingSets.ros;
        const current = seasonSetFor(league, sets);
        const selectEl = document.getElementById('seasonRankingSetSelect');
        if (selectEl) {
            selectEl.innerHTML = `<option value="">None (use your dynasty rankings)</option>`
                + sets.filter(s => s.id !== league.rosRankingSetId).map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${s.data.length} players)</option>`).join('');
            selectEl.value = current ? current.id : '';
        }

        // "In-Season rankings in 6 of 13 dynasty and keeper leagues · Choose leagues…", for a chosen set.
        const leaguesRow = document.getElementById('seasonSetLeaguesRow');
        const dynastyCount = State.leagues.filter(hasSeasonSlot).length;
        if (leaguesRow) {
            leaguesRow.hidden = !current || dynastyCount < 2;
            const summary = document.getElementById('seasonSetLeaguesSummary');
            if (current && summary) {
                const n = State.leagues.filter(l => seasonSetFor(l, sets) === current).length;
                summary.textContent = `In ${n} of ${dynastyCount} dynasty and keeper leagues`; // the label above says In-Season
            }
        }

        // The offer for an empty slot: the ROS set your redraft leagues use.
        const offerEl = document.getElementById('seasonOffer');
        if (offerEl) {
            const offer = seasonOffer(league, State.leagues, sets);
            offerEl.hidden = !offer;
            offerEl.innerHTML = offer
                ? `<span>Your redraft leagues use <strong>${escapeHtml(offer.name)}</strong>.</span> <button type="button" class="mls-btn-sm btn-link-inline" data-action="useSeasonOffer" data-set-id="${escapeHtml(offer.id)}">Use it here</button>`
                : '';
        }
    }

    function setActiveSeason(setId) {
        const league = getActiveLeague();
        if (!league || !hasSeasonSlot(league)) return false;
        league[SEASON_SET_KEY] = setId || null;
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        return true;
    }

    // Everything that shows the In-Season set: the card's header and rows, Power Rankings (on the Roster
    // tab), and the lineup, whose rankings stamp includes it (it re-optimizes when next opened).
    function refreshAfterSeasonChange() {
        populateSeasonPicker();
        updateRankingSetHeader('ros');
        updateSetLeaguesRow('ros');
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'rosterTab' && typeof loadRosterTab === 'function') loadRosterTab();
    }

    export const onSeasonSetChange = function(selectEl) {
        const val = selectEl.value;
        if (val && !State.rankingSets.ros.some(s => s.id === val)) return;
        if (!setActiveSeason(val)) return;
        refreshAfterSeasonChange();
    };

    // "Choose leagues…" under the Season picker: the league picker, for the In-Season slot.
    export const openSeasonSetLeagues = async function() {
        const league = getActiveLeague();
        const set = seasonSetFor(league, State.rankingSets.ros);
        if (!set) { showToast(`Choose an ${IN_SEASON} set first.`, { isError: true }); return; }
        const result = await openLeaguePickerDialog('ros', set, {
            slot: 'season', allowRemove: true,
            title: `Use "${set.name}" as ${IN_SEASON} rankings in…`,
            intro: 'Check each dynasty or keeper league that should use this set for this season. Unchecking a league sends it back to its dynasty rankings.'
        });
        if (!result) return;
        if (result.add.length === 0 && result.remove.length === 0) { showToast('No changes made.'); return; }
        assignSetToLeagues('ros', set.id, result, { slot: 'season' });
        const n = State.leagues.filter(l => seasonSetFor(l, State.rankingSets.ros) === set).length;
        showToast(`"${set.name}" is now the ${IN_SEASON} set in ${leagueCountText(n)}.`);
        refreshAfterSeasonChange();
    };

    // The empty slot's "Use it here", then the offer to do the same in every other dynasty and keeper
    // league that has no In-Season set yet.
    export const useSeasonOffer = async function(setId) {
        const set = State.rankingSets.ros.find(s => s.id === setId);
        if (!set || !setActiveSeason(set.id)) return;
        refreshAfterSeasonChange();
        // Not a league whose dynasty set is this one (it can't be its In-Season set too).
        const others = leaguesWithoutSeason(State.leagues, State.rankingSets.ros, State.activeLeagueId)
            .filter(l => l.rosRankingSetId !== set.id);
        if (others.length === 0) { showToast(`"${set.name}" is now this league's ${IN_SEASON} set.`); return; }
        // Up to three are named, so you can answer without looking them up (round 5).
        const names = others.map(l => `"${l.name || 'Unnamed league'}"`);
        const where = others.length <= 3
            ? `in ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`} too`
            : `in the ${others.length} other dynasty and keeper leagues without ${IN_SEASON} rankings`;
        const all = await showConfirm(`Also use "${set.name}" ${where}?`,
            { title: `${IN_SEASON} rankings`, confirmText: others.length === 1 ? 'Use in that one too' : `Use in all ${others.length}`, cancelText: 'Just this league' });
        if (!all) { showToast(`"${set.name}" is now this league's ${IN_SEASON} set.`); return; }
        assignSetToLeagues('ros', set.id, { add: others.map(l => l.leagueId) }, { slot: 'season' });
        showToast(`"${set.name}" is now the ${IN_SEASON} set in ${leagueCountText(others.length + 1)}.`);
        refreshAfterSeasonChange();
    };
