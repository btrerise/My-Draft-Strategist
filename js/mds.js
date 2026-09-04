/**
 * Fantasy Football Draft Strategist - Core Logic & Multi-Draft Engine
 * Merged with Custom UI/UX Features (T-Scores, Tiers, Inline Edits, Export)
 */

(function () {
    'use strict';

    // --- STATE MANAGEMENT ---
    const State = {
        players: JSON.parse(localStorage.getItem('ds_players')) || [],
        drafts: JSON.parse(localStorage.getItem('ds_drafts')) || [],
        activeDraftId: localStorage.getItem('ds_active_draft_id') || null,
        rankingsMeta: JSON.parse(localStorage.getItem('ds_meta')) || null,
        adpMeta: JSON.parse(localStorage.getItem('ds_adp_meta')) || null,
        activePosFilter: 'ALL',
        autoSyncTimer: null,
        deferredPrompt: null,
        touchstartX: 0,
        touchendX: 0,
        tabOrder: ['tracker', 'team', 'board']
    };

    const BYE_WEEKS_2026 = {
        "CAR": 5, "KC": 5, "CIN": 6, "DET": 6, "MIA": 6, "MIN": 6,
        "BUF": 7, "JAX": 7, "LAC": 7, "WAS": 7, "HOU": 8, "NO": 8,
        "NYG": 8, "SF": 8, "PIT": 9, "TEN": 9, "CHI": 10, "DEN": 10,
        "PHI": 10, "TB": 10, "ATL": 11, "CLE": 11, "GB": 11, "LAR": 11,
        "NE": 11, "SEA": 11, "BAL": 13, "IND": 13, "LV": 13, "NYJ": 13,
        "ARI": 14, "DAL": 14
    };

    // --- INITIALIZE DEFAULT DRAFT FALLBACK ---
    function ensureDefaultDraft() {
        if (State.drafts.length === 0) {
            const defaultDraft = {
                draftId: 'draft_default',
                name: 'Main Draft',
                username: localStorage.getItem('ds_username') || '',
                settings: JSON.parse(localStorage.getItem('ds_draft_settings')) || { teams: 12, rounds: 15 },
                limits: JSON.parse(localStorage.getItem('ds_limits')) || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6, TOTAL: 14 },
                draftedPlayers: JSON.parse(localStorage.getItem('ds_drafted')) || [],
                myTeam: JSON.parse(localStorage.getItem('ds_myTeam')) || [],
                rawDraftPicks: JSON.parse(localStorage.getItem('ds_raw_picks')) || [],
                totalPicks: parseInt(localStorage.getItem('ds_total_picks')) || 0,
                queue: []
            };
            State.drafts = [defaultDraft];
            State.activeDraftId = 'draft_default';
            localStorage.setItem('ds_drafts', JSON.stringify(State.drafts));
            localStorage.setItem('ds_active_draft_id', 'draft_default');
        } else if (!State.activeDraftId || !State.drafts.some(d => d.draftId === State.activeDraftId)) {
            State.activeDraftId = State.drafts[0].draftId;
            localStorage.setItem('ds_active_draft_id', State.activeDraftId);
        }
    }

    function getActiveDraft() {
        ensureDefaultDraft();
        return State.drafts.find(d => d.draftId === State.activeDraftId) || State.drafts[0];
    }

    function saveActiveDraftState() {
        let activeDraft = getActiveDraft();
        if (activeDraft) {
            // Save current rankings specifically to this draft
            activeDraft.players = [...State.players]; 
        }
        localStorage.setItem('ds_drafts', JSON.stringify(State.drafts));
        localStorage.setItem('ds_active_draft_id', State.activeDraftId || '');
        renderBoard();
        renderDraftMatrix();
        renderDraftRecap();
    }

    function refreshDraftDropdown() {
        const select = document.getElementById('draftProfileSelect');
        if (!select) return;
        let html = "";
        State.drafts.forEach(d => {
            let sel = d.draftId === State.activeDraftId ? "selected" : "";
            html += `<option value="${d.draftId}" ${sel}>${d.name}</option>`;
        });
        select.innerHTML = html;
    }

    window.switchDraftProfile = function(draftId) {
        if (!draftId) return;
        State.activeDraftId = draftId;
        localStorage.setItem('ds_active_draft_id', State.activeDraftId);

        let draft = getActiveDraft();
        if (draft) {
            // Load the rankings for this draft, fallback to global if none exist yet
            State.players = draft.players && draft.players.length > 0 ? [...draft.players] : JSON.parse(localStorage.getItem('ds_players')) || [];
            localStorage.setItem('ds_players', JSON.stringify(State.players));
            
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

    // --- PWA & SERVICE WORKER ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        State.deferredPrompt = e;
        const installCard = document.getElementById('installCard');
        if (installCard) installCard.style.display = 'block';
    });

    const installAppBtn = document.getElementById('installAppBtn');
    if (installAppBtn) {
        installAppBtn.addEventListener('click', async () => {
            if (State.deferredPrompt) {
                State.deferredPrompt.prompt();
                const { outcome } = await State.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    const installCard = document.getElementById('installCard');
                    if (installCard) installCard.style.display = 'none';
                }
                State.deferredPrompt = null;
            }
        });
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker registration failed: ', err));
        });
    }

    // --- UI HELPERS ---
    // Generic debounce: delays calling fn until `wait` ms have passed since the last call.
    // Used on the search input so renderBoard() (which rebuilds the whole player pool) doesn't
    // run on every single keystroke.
    function debounce(fn, wait) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // flashButton intentionally NOT declared here -- previously shadowed the shared version
    // now in js/utils.js (loaded before this file). Calls below resolve to that shared version.

    window.toggleMenu = function() {
    const menu = document.getElementById('hamburgerMenu');
    const overlay = document.getElementById('menuOverlay');
    const hamburgerBtn = document.querySelector('.hamburger-btn'); // Grab the button
    
    if (!menu || !overlay) return;
    
    const isOpen = menu.classList.toggle('open');
    overlay.style.display = isOpen ? 'block' : 'none';
    
    // Announce the new state to screen readers
    if (hamburgerBtn) {
        hamburgerBtn.setAttribute('aria-expanded', isOpen);
    }
};

    // --- GESTURE HANDLING ---
    function handleGesture(e) {
    // Prevent tab swipe if touch started/ended inside horizontal scrolling containers or inputs
    if (e && e.target && e.target.closest('.draft-board-container, .table-responsive, .data-table-wrapper, select, input, textarea')) {
        return;
    }

    const swipeThreshold = 80;
    const diffX = State.touchEndX - State.touchStartX;

    if (Math.abs(diffX) > swipeThreshold) {
        const activeNavBtn = document.querySelector('.nav-bar .nav-btn.active');
        if (!activeNavBtn) return;

        const tabs = ['setup', 'tracker', 'board', 'team'];
        const currentIdx = tabs.indexOf(activeNavBtn.getAttribute('data-target'));

        if (diffX < 0 && currentIdx < tabs.length - 1) {
            // Swiped Left -> Next Tab
            window.showTab(tabs[currentIdx + 1]);
        } else if (diffX > 0 && currentIdx > 0) {
            // Swiped Right -> Previous Tab
            window.showTab(tabs[currentIdx - 1]);
        }
    }
}

    document.addEventListener('touchstart', e => { State.touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    document.addEventListener('touchend', (e) => {
    State.touchEndX = e.changedTouches[0].screenX;
    handleGesture(e);
}, { passive: true });

    // --- INITIALIZE SETTINGS INPUTS ---
    function initSettingsUI() {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        let draft = getActiveDraft();

        setVal('sleeperUsername', draft && draft.username !== "Manual" ? draft.username : (localStorage.getItem('ds_username') || ""));
        setVal('sleeperDraftId', draft && !draft.draftId.startsWith('manual_') && !draft.draftId.startsWith('draft_') ? draft.draftId : (localStorage.getItem('ds_draftId') || ""));
        setVal('targetList', localStorage.getItem('ds_targets') || "");
        setVal('avoidList', localStorage.getItem('ds_avoids') || "");
        setVal('dartList', localStorage.getItem('ds_darts') || "");
        setCheck('stackToggle', localStorage.getItem('ds_stacks') === 'true');
        setCheck('byeWarningToggle', localStorage.getItem('ds_bye_warnings') === 'true');
        setCheck('tscoreToggle', localStorage.getItem('ds_tscore') === 'true');
        
        let settings = draft ? draft.settings : { teams: 12, rounds: 15, is3RR: false };
        setCheck('thirdRoundReversalToggle', settings.is3RR || false);
        let limits = draft ? draft.limits : { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6, TOTAL: 14 };

        setVal('leagueTeams', settings.teams || 12);
        setVal('leagueRounds', settings.rounds || 15);
        setVal('limitQB', limits.QB);
        setVal('limitRB', limits.RB);
        setVal('limitWR', limits.WR);
        setVal('limitTE', limits.TE);
        setVal('limitFLEX', limits.FLEX);
        setVal('limitSFLEX', limits.SFLEX);
        setVal('limitBENCH', limits.BENCH);
        updateTotalRounds();
    }

    function updateTotalRounds() {
        const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
        const total = getNum('limitQB') + getNum('limitRB') + getNum('limitWR') + getNum('limitTE') + getNum('limitFLEX') + getNum('limitSFLEX') + getNum('limitBENCH');
        const roundsEl = document.getElementById('leagueRounds');
        if (roundsEl) roundsEl.value = total;
    }

    function updateMetaDisplay() {
        const metaEl = document.getElementById('metaDisplay');
        if (metaEl) {
            if (State.rankingsMeta) {
                metaEl.style.display = 'block';
                metaEl.innerText = `Loaded: ${State.rankingsMeta.count} players on ${State.rankingsMeta.date}`;
            } else {
                metaEl.style.display = 'none';
            }
        }

        const adpEl = document.getElementById('adpStatusDisplay');
        if (adpEl) {
            if (State.adpMeta) {
                adpEl.style.display = 'block';
                adpEl.innerText = `Fetched: ${State.adpMeta.format} on ${State.adpMeta.date}`;
            } else {
                adpEl.style.display = 'none';
            }
        }
    }

    window.saveSettings = function(btnElement, skipRender = false) {
        const getVal = id => document.getElementById(id)?.value.trim() || "";
        const getCheck = id => document.getElementById(id)?.checked || false;

        localStorage.setItem('ds_username', getVal('sleeperUsername'));
        localStorage.setItem('ds_draftId', getVal('sleeperDraftId'));
        localStorage.setItem('ds_targets', document.getElementById('targetList')?.value || "");
        localStorage.setItem('ds_avoids', document.getElementById('avoidList')?.value || "");
        localStorage.setItem('ds_darts', document.getElementById('dartList')?.value || "");
        localStorage.setItem('ds_stacks', getCheck('stackToggle'));
        localStorage.setItem('ds_bye_warnings', getCheck('byeWarningToggle'));
        localStorage.setItem('ds_tscore', getCheck('tscoreToggle'));
        
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
                WT: draft.limits?.WT || 0, // NEW: Preserve W/T
                FLEX: parseInt(getVal('limitFLEX')) || 0,
                SFLEX: parseInt(getVal('limitSFLEX')) || 0,
                K: draft.limits?.K || 0,
                DEF: draft.limits?.DEF || 0,
                BENCH: parseInt(getVal('limitBENCH')) || 0,
            };
            draft.limits.TOTAL = draft.limits.QB + draft.limits.RB + draft.limits.WR + draft.limits.TE + draft.limits.WT + draft.limits.FLEX + draft.limits.SFLEX + draft.limits.K + draft.limits.DEF + draft.limits.BENCH;
            saveActiveDraftState();
        }

        if (!skipRender) renderBoard();
        if (btnElement) flashButton(btnElement, "Settings Saved");
    };

    window.resetPicksOnly = function() {
        let draft = getActiveDraft();
        if (!draft) return;
        if (window.confirm(`Reset draft picks for '${draft.name}' back to pick 1.01?`)) {
            draft.draftedPlayers = [];
            draft.myTeam = [];
            draft.rawDraftPicks = [];
            draft.totalPicks = 0;
            saveActiveDraftState();
            
            // The timeout ensures the heavy DOM render doesn't swallow the animation
            setTimeout(() => {
                if (typeof window.showToast === 'function') window.showToast("Draft picks reset to 1.01");
            }, 100);
        }
    };

    // --- BACKUP & RESTORE ---
    // MDS and MLS share one origin (mydraftstrategist.com) and therefore one localStorage, so
    // "this app's data" has to be defined by key prefix rather than assumed to be everything.
    // ds_* covers every MDS-specific key; mds_show_headshots is the one MDS setting that
    // doesn't follow that prefix. mds_handoff_roster is deliberately excluded -- it's a
    // transient signal to MLS, not a persistent setting, and backing it up would just replay
    // a stale handoff on restore.
    function getMdsOwnedKeys() {
        return Object.keys(localStorage).filter(k =>
            (k.startsWith('ds_') || k === 'mds_show_headshots') && k !== 'mds_handoff_roster'
        );
    }

    window.exportMdsSettings = function() {
        const keys = getMdsOwnedKeys();
        const data = {};
        keys.forEach(k => data[k] = localStorage.getItem(k));

        const payload = {
            app: "MDS",
            appName: "My Draft Strategist",
            exportedAt: new Date().toISOString(),
            data: data
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-draft-strategist-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showToast) window.showToast("Backup downloaded!");
    };

    window.importMdsSettings = function(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            let payload;
            try {
                payload = JSON.parse(e.target.result);
            } catch (err) {
                if (window.showToast) window.showToast("That file isn't valid JSON -- couldn't read it as a backup.", { isError: true });
                fileInput.value = "";
                return;
            }

            if (!payload || payload.app !== "MDS" || typeof payload.data !== 'object') {
                if (window.showToast) window.showToast("This doesn't look like a My Draft Strategist backup file. If it's an MLS (Lineup Strategist) backup, use the Import button on that app instead.", { isError: true });
                fileInput.value = "";
                return;
            }

            const keyCount = Object.keys(payload.data).length;
            const exportedDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : "an unknown date";
            const confirmMsg = `This will REPLACE your current My Draft Strategist data with this backup (from ${exportedDate}, ${keyCount} settings).\n\nYour current data will be lost unless you've backed it up separately. Continue?`;

            if (!window.confirm(confirmMsg)) {
                fileInput.value = "";
                return;
            }

            // Clear existing MDS keys first so a restore from an older backup (missing keys
            // that exist now) doesn't leave stale data mixed in from the current session.
            getMdsOwnedKeys().forEach(k => localStorage.removeItem(k));
            Object.keys(payload.data).forEach(k => localStorage.setItem(k, payload.data[k]));

            if (window.showToast) window.showToast("Backup restored! Reloading now.");
            setTimeout(() => { window.location.reload(); }, 900);
        };
        reader.readAsText(file);
    };

    window.hardReset = function() {
        if (window.confirm("WARNING: This will delete ALL My Draft Strategist data including saved drafts, custom rankings, and settings. (My Lineup Strategist data is not affected.)")) {
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
            getMdsOwnedKeys().forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };

    window.showTab = function(tabId, skipHistory = false) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(tabId + 'Tab');
    if (targetTab) targetTab.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.hamburger-menu .nav-btn[data-target="${tabId}"], .nav-bar .nav-btn[data-target="${tabId}"]`)
        .forEach(btn => btn.classList.add('active'));

    const menu = document.getElementById('hamburgerMenu');
    if (menu && menu.classList.contains('open')) window.toggleMenu();

    if (['tracker', 'team', 'board'].includes(tabId)) renderBoard();
    if (tabId === 'setup') refreshDraftDropdown();
    window.scrollTo(0, 0);

    // --- NEW: Push to browser history so the back button works ---
    if (!skipHistory) {
        history.pushState({ tab: tabId }, '', `#${tabId}`);
    }
};
// --- NEW: Catch the native back button ---
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) {
        // Pass 'true' so we don't accidentally create an infinite history loop
        window.showTab(e.state.tab, true); 
    } else {
        window.showTab('setup', true);
    }
});

    window.setPosFilter = function(pos) {
        // Ensure State.activePosFilter is an array (backwards compatibility)
        if (!Array.isArray(State.activePosFilter)) State.activePosFilter = [];

        if (pos === 'ALL') {
            State.activePosFilter = []; // Empty array means ALL
        } else {
            let idx = State.activePosFilter.indexOf(pos);
            if (idx !== -1) {
                State.activePosFilter.splice(idx, 1); // Toggle off
            } else {
                State.activePosFilter.push(pos); // Toggle on
            }
        }
        renderBoard();
    };

    window.toggleEditBar = function(id) {
        const bar = document.getElementById(`inline-edit-${id}`);
        if (bar) {
            const isFlex = bar.style.display === 'flex';
            bar.style.display = isFlex ? 'none' : 'flex';
            
            // Remember the edit state so it doesn't snap shut on auto-sync
            let p = State.players.find(x => x.id === id);
            if (p) p.isEditing = !isFlex;
        }
    };
    window.toggleCardDetails = function(e, id) {
    e.stopPropagation(); 
    const expandBtn = e.currentTarget; // Get the button that was clicked
    const card = document.getElementById(`details-${id}`).closest('.player-card');
    
    if (card) {
        const isNowExpanded = card.classList.toggle('is-expanded');
        
        // Announce the new state to screen readers
        if (expandBtn) expandBtn.setAttribute('aria-expanded', isNowExpanded);
        
        let p = State.players.find(x => x.id === id);
        if (p) {
            p.isExpanded = isNowExpanded;
        }
    }
};

    window.saveInlineEdit = function(id) {
        let p = State.players.find(x => x.id === id);
        if (!p) return;

        const getVal = elId => document.getElementById(elId)?.value;
        let newRank = parseInt(getVal(`edit-rank-val-${id}`));
        let newTier = getVal(`edit-tier-val-${id}`)?.trim() || "-";
        let newTeam = getVal(`edit-team-val-${id}`)?.trim().toUpperCase();
        let newBye = getVal(`edit-bye-val-${id}`)?.trim();

        if (!isNaN(newRank) && newRank !== p.rank) {
            let oldRank = p.rank;
            State.players.forEach(other => {
                if (other.id !== id) {
                    if (newRank < oldRank && other.rank >= newRank && other.rank < oldRank) other.rank += 1;
                    else if (newRank > oldRank && other.rank > oldRank && other.rank <= newRank) other.rank -= 1;
                }
            });
            p.rank = newRank;
        }
        p.tier = newTier;
        if (newTeam) p.team = newTeam;
        if (newBye) p.bye = newBye;
        
        p.isEditing = false;

        State.players.sort((a, b) => a.rank - b.rank);
        localStorage.setItem('ds_players', JSON.stringify(State.players));
        renderBoard();
    };

    // --- SLEEPER & MANUAL DRAFT CREATION LOGIC ---
    window.createManualDraft = function() {
        const nameInput = document.getElementById('newDraftName');
        const nickname = nameInput ? nameInput.value.trim() : "";
        const draftName = nickname || `Manual Draft (${new Date().toLocaleDateString()})`;

        const getVal = id => document.getElementById(id)?.value.trim() || "";
        const getCheck = id => document.getElementById(id)?.checked || false;
        let newId = 'manual_' + Date.now();

        let newDraft = {
            draftId: newId,
            name: draftName,
            username: "Manual",
            settings: {
                teams: parseInt(getVal('leagueTeams')) || 12,
                rounds: parseInt(getVal('leagueRounds')) || 15,
                is3RR: getCheck('thirdRoundReversalToggle')
            },
            limits: {
                QB: parseInt(getVal('limitQB')) || 1,
                RB: parseInt(getVal('limitRB')) || 2,
                WR: parseInt(getVal('limitWR')) || 3,
                TE: parseInt(getVal('limitTE')) || 1,
                FLEX: parseInt(getVal('limitFLEX')) || 1,
                SFLEX: parseInt(getVal('limitSFLEX')) || 0,
                BENCH: parseInt(getVal('limitBENCH')) || 6,
                TOTAL: 14
            },
            players: [...State.players],
            draftedPlayers: [],
            myTeam: [],
            rawDraftPicks: [],
            totalPicks: 0,
            queue: []
        };

        State.drafts.push(newDraft);
        State.activeDraftId = newId;
        saveActiveDraftState();

        if (nameInput) nameInput.value = "";
        refreshDraftDropdown();
        initSettingsUI();
        if (window.showToast) window.showToast(`Manual Draft '${draftName}' created!`);
    };

    async function processSleeperDraftData(username, draftId, btn, isSilent = false) {
        try {
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
            if (!userRes.ok) throw new Error("Could not find Sleeper User.");
            const userId = (await userRes.json()).user_id;
            const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
            if (!draftRes.ok) throw new Error("Could not fetch Draft ID details.");
            const dInfo = await draftRes.json();
            let draftName = document.getElementById('newDraftName')?.value.trim() || "";
            let fetchedLeague = null;
            let draftSlotNames = {}; // NEW: Store our mapped team names

            if (dInfo.league_id) {
                let currentUsername = document.getElementById('sleeperUsername')?.value.trim() || username || draftName || "";
                
                try {
                    const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${dInfo.league_id}`);
                    if (leagueRes.ok) {
                        fetchedLeague = await leagueRes.json();
                        if (!draftName) draftName = fetchedLeague.name;
                    }

                    // NEW: Fetch league users to map to the draft board columns
                    const usersRes = await fetch(`https://api.sleeper.app/v1/league/${dInfo.league_id}/users`);
                    if (usersRes.ok) {
                        const leagueUsers = await usersRes.json();
                        // dInfo.draft_order maps user_id to slot number (e.g., {"12345": 1})
                        if (dInfo.draft_order) {
                            for (const [uid, slot] of Object.entries(dInfo.draft_order)) {
                                let user = leagueUsers.find(u => u.user_id === uid);
                                if (user) {
                                    // Prefer custom Team Name, fallback to Display Name
                                    draftSlotNames[slot] = user.metadata?.team_name || user.display_name;
                                }
                            }
                        }
                    }
                } catch (e) { console.warn("Could not fetch league details or users", e); }
            }

            if (!draftName) draftName = dInfo.metadata?.name || `Sleeper Draft ${draftId}`;

            let draftSettings = {
                teams: dInfo.settings?.teams || 12,
                rounds: dInfo.settings?.rounds || 15,
                is3RR: dInfo.settings?.reversal_round === 3
            };

            let draftLimits = { QB: 0, RB: 0, WR: 0, TE: 0, WT: 0, FLEX: 0, SFLEX: 0, K: 0, DEF: 0, BENCH: 0 };

            // Parse Sleeper's roster_positions array if we successfully grabbed the league
            if (fetchedLeague && fetchedLeague.roster_positions) {
                fetchedLeague.roster_positions.forEach(pos => {
                    if (pos === 'QB') draftLimits.QB++;
                    else if (pos === 'RB') draftLimits.RB++;
                    else if (pos === 'WR') draftLimits.WR++;
                    else if (pos === 'TE') draftLimits.TE++;
                    else if (pos === 'W/T') draftLimits.WT++; // NEW: W/T Slot
                    else if (pos === 'FLEX' || pos === 'W/R/T') draftLimits.FLEX++;
                    else if (pos === 'SUPER_FLEX' || pos === 'Q/W/R/T') draftLimits.SFLEX++;
                    else if (pos === 'K') draftLimits.K++;
                    else if (pos === 'DEF') draftLimits.DEF++;
                    else if (pos === 'BN') draftLimits.BENCH++;
                });
            } else {
                // Fallback for manual/mock drafts unattached to a league
                // This strictly checks for undefined so that a '0' doesn't accidentally trigger the fallback
                const getSlot = (key, def) => dInfo.settings && dInfo.settings[key] !== undefined ? dInfo.settings[key] : def;
                
                draftLimits = {
                    QB: getSlot('slots_qb', 1),
                    RB: getSlot('slots_rb', 2),
                    WR: getSlot('slots_wr', 3),
                    TE: getSlot('slots_te', 0),
                    WT: getSlot('slots_rec_flex', 0), // NEW: Sleeper identifies W/T as rec_flex
                    FLEX: getSlot('slots_flex', 1),
                    SFLEX: getSlot('slots_super_flex', 0),
                    K: getSlot('slots_k', 0),
                    DEF: getSlot('slots_def', 0),
                    BENCH: getSlot('slots_bn', 6),
                };
            }
            draftLimits.TOTAL = draftLimits.QB + draftLimits.RB + draftLimits.WR + draftLimits.TE + draftLimits.WT + draftLimits.FLEX + draftLimits.SFLEX + draftLimits.K + draftLimits.DEF + draftLimits.BENCH;

            const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            if (!picksRes.ok) throw new Error("Could not fetch Draft ID picks.");
            const picksData = await picksRes.json();
            
            let sleeperDrafted = [];
            let sleeperMyTeam = [];

            if (picksData && picksData.length > 0) {
                picksData.forEach(pick => {
                    let matchedPlayer = State.players.find(p => p.sleeperId === pick.player_id);
                    if (!matchedPlayer && pick.metadata) {
                        let fullName = `${pick.metadata.first_name} ${pick.metadata.last_name}`;
                        matchedPlayer = State.players.find(p => typeof isNameMatch === 'function' ? isNameMatch(p.name, fullName) : p.name.toLowerCase() === fullName.toLowerCase());
                    }

                    if (matchedPlayer) {
                        sleeperDrafted.push(matchedPlayer.id);
                        if (pick.picked_by === userId) sleeperMyTeam.push(matchedPlayer.id);
                    }
                });
            }

            // --- PRESERVE MANUAL OVERRIDES ---
            let existingDraft = State.drafts.find(d => d.draftId === draftId);
            let manualDrafted = existingDraft ? existingDraft.draftedPlayers.filter(id => !sleeperDrafted.includes(id)) : [];
            let manualMyTeam = existingDraft ? existingDraft.myTeam.filter(id => !sleeperMyTeam.includes(id)) : [];

                        let draftObj = {
                draftId: draftId,
                leagueId: dInfo.league_id || null,
                name: draftName,
                username: username,
                settings: draftSettings,
                limits: draftLimits,
                players: [...State.players],
                draftedPlayers: Array.from(new Set([...sleeperDrafted, ...manualDrafted])),
                myTeam: Array.from(new Set([...sleeperMyTeam, ...manualMyTeam])),
                rawDraftPicks: picksData || [],
                totalPicks: picksData ? picksData.length : 0,
                draftSlotNames: draftSlotNames,
                queue: existingDraft && existingDraft.queue ? existingDraft.queue : []
            };

            let existingIdx = State.drafts.findIndex(d => d.draftId === draftId);
            if (existingIdx !== -1) State.drafts[existingIdx] = draftObj;
            else State.drafts.push(draftObj);

            State.activeDraftId = draftId;
            saveActiveDraftState();

            if (!isSilent) {
                const nameInput = document.getElementById('newDraftName');
                if (nameInput) nameInput.value = "";
                refreshDraftDropdown();
                initSettingsUI();
                if (btn) flashButton(btn, "Sync Complete!");
            }
            
        } catch (err) {
            console.error(err);
            if (!isSilent && btn) flashButton(btn, "Sync Failed", true);
            if (!isSilent && window.showToast) window.showToast(`Sleeper Sync Error:\n${err.message}`, { isError: true });
        }
    }

    window.addAndSyncSleeperDraft = function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim();
        let draftIdEl = document.getElementById('sleeperDraftId');
        let draftId = draftIdEl ? draftIdEl.value.trim() : "";
        
        // Safely extract ID from URL without destroying alphanumeric Mock Draft IDs
        if (draftId && draftId.includes('/')) {
            const parts = draftId.split('/');
            draftId = parts[parts.length - 1].split('?')[0];
            if (draftIdEl) draftIdEl.value = draftId;
        }

        if (!username || !draftId) {
            if (window.showToast) window.showToast("Please enter both Username and Draft ID.", { isError: true });
            return;
        }
        
        // Force a save to lock in the new credentials instantly
        if (typeof window.saveSettings === 'function') window.saveSettings(null, true);

        processSleeperDraftData(username, draftId, btn, false);
    };

    window.handleSmartSync = function() {
        if (State.autoSyncTimer) {
            window.toggleAutoSync(false);
            const toggleEl = document.getElementById('autoSyncToggle');
            if (toggleEl) toggleEl.checked = false;
        } else {
            let targetUser = document.getElementById('sleeperUsername')?.value.trim();
            let draftIdEl = document.getElementById('sleeperDraftId');
            let targetDraftId = draftIdEl ? draftIdEl.value.trim() : "";
            
            if (targetDraftId && targetDraftId.includes('/')) {
                const parts = targetDraftId.split('/');
                targetDraftId = parts[parts.length - 1].split('?')[0];
                if (draftIdEl) draftIdEl.value = targetDraftId;
            }

            let draft = getActiveDraft();
            targetUser = targetUser || (draft ? draft.username : "");
            targetDraftId = targetDraftId || (draft ? draft.draftId : "");

            if (!targetUser || targetUser === "Manual" || !targetDraftId) {
                if (window.showToast) window.showToast("Please enter your Sleeper Username and Draft ID on the Setup tab first.", { isError: true });
                return;
            }

            if (typeof window.saveSettings === 'function') window.saveSettings(null, true);
            processSleeperDraftData(targetUser, targetDraftId, document.getElementById('headerSyncBtn'), false);
        }
    };

    window.toggleAutoSync = function(isLive, sourceToggle = null) {
        // 1. Mirror the state across all toggles on all tabs
        document.querySelectorAll('.sync-toggle').forEach(el => {
            if (el !== sourceToggle) el.checked = isLive;
        });

        const syncWrap = document.getElementById('syncIconWrap');
        const liveWrap = document.getElementById('liveIconWrap');
        const syncBtn = document.getElementById('headerSyncBtn'); 
        
        if (isLive) {
            // 2. Aggressively grab credentials from the DOM
            let targetUser = document.getElementById('sleeperUsername')?.value.trim();
            let draftIdEl = document.getElementById('sleeperDraftId');
            let targetDraftId = draftIdEl ? draftIdEl.value.trim() : "";
            
            // Safely extract ID from URL
            if (targetDraftId && targetDraftId.includes('/')) {
                const parts = targetDraftId.split('/');
                targetDraftId = parts[parts.length - 1].split('?')[0];
                if (draftIdEl) draftIdEl.value = targetDraftId;
            }

            let draft = getActiveDraft();
            targetUser = targetUser || (draft ? draft.username : "");
            targetDraftId = targetDraftId || (draft ? draft.draftId : "");

            if (!targetUser || targetUser === "Manual" || !targetDraftId) {
                if (window.showToast) window.showToast("Please enter your Sleeper Username and Draft ID on the Setup tab first.", { isError: true });
                document.querySelectorAll('.sync-toggle').forEach(el => el.checked = false);
                return;
            }

            // Lock in settings (which also grabs the visual input values we just cleaned)
            if (typeof window.saveSettings === 'function') {
                window.saveSettings(null, true);
            }

            // Update UI styling for Live State
            if (syncWrap) syncWrap.style.display = 'none';
            if (liveWrap) liveWrap.style.display = 'flex';
            if (syncBtn) syncBtn.classList.add('is-live'); 
            
            // Fire immediately. We pass "false" so if the sync fails, you get an alert instead of silence!
            processSleeperDraftData(targetUser, targetDraftId, null, false);
            
            // 3. Smooth polling interval
            if (!State.autoSyncTimer) {
                State.autoSyncTimer = setInterval(() => {
                    let curDraft = getActiveDraft();
                    if (curDraft && curDraft.username !== "Manual") {
                        processSleeperDraftData(curDraft.username, curDraft.draftId, null, true);
                    }
                }, 3000); 
            }

        } else {
            // Stop Sync & Revert UI
            if (syncWrap) syncWrap.style.display = 'flex';
            if (liveWrap) liveWrap.style.display = 'none';
            if (syncBtn) syncBtn.classList.remove('is-live'); 
            
            if (State.autoSyncTimer) {
                clearInterval(State.autoSyncTimer);
                State.autoSyncTimer = null;
            }
        }
    };
    window.draftPlayer = function(id, isMine) {
        let draft = getActiveDraft();
        if (!draft) return;
        if (!draft.draftedPlayers.includes(id)) {
            draft.draftedPlayers.push(id);
            if (isMine) draft.myTeam.push(id);
            saveActiveDraftState();

            let p = State.players.find(x => x.id === id);
            if (p && typeof window.showToast === 'function') window.showToast(`${p.name} drafted`);
        }
    };

    window.undoDraft = function(id) {
        let draft = getActiveDraft();
        if (!draft) return;
        draft.draftedPlayers = draft.draftedPlayers.filter(pId => pId !== id);
        draft.myTeam = draft.myTeam.filter(pId => pId !== id);
        saveActiveDraftState();

        let p = State.players.find(x => x.id === id);
        if (p && typeof window.showToast === 'function') window.showToast(`${p.name} returned to pool`);
    };

    window.toggleQueue = function(id) {
        let draft = getActiveDraft();
        if (!draft) return;
        
        if (!draft.queue) draft.queue = [];

        if (draft.queue.includes(id)) {
            draft.queue = draft.queue.filter(qId => qId !== id);
        } else {
            draft.queue.push(id);
        }

        saveActiveDraftState();
        renderBoard();
    };

// --- QUEUE REORDERING LOGIC ---
    let draggedQueueIndex = null;

    window.handleQueueDragStart = function(e, index) {
        draggedQueueIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
    };

    window.handleQueueDragOver = function(e) {
        e.preventDefault(); // Required to allow drop
        e.dataTransfer.dropEffect = 'move';
    };

    window.handleQueueDragEnd = function(e) {
        e.currentTarget.style.opacity = '1';
        draggedQueueIndex = null;
    };

    window.handleQueueDrop = function(e, targetIndex) {
        e.preventDefault();
        if (draggedQueueIndex === null || draggedQueueIndex === targetIndex) return;

        let draft = getActiveDraft();
        if (!draft || !draft.queue) return;

        let draftedPlayers = draft.draftedPlayers || [];
        let activeQueue = draft.queue.filter(id => !draftedPlayers.includes(id));

        // Move the dragged item to the new index
        const [movedItem] = activeQueue.splice(draggedQueueIndex, 1);
        activeQueue.splice(targetIndex, 0, movedItem);

        // Combine back with any already-drafted queued items
        let draftedQueue = draft.queue.filter(id => draftedPlayers.includes(id));
        draft.queue = [...activeQueue, ...draftedQueue];

        saveActiveDraftState();
        renderBoard();
    };

    window.moveQueueItem = function(index, direction) {
        let draft = getActiveDraft();
        if (!draft || !draft.queue) return;

        let draftedPlayers = draft.draftedPlayers || [];
        let activeQueue = draft.queue.filter(id => !draftedPlayers.includes(id));

        let targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= activeQueue.length) return;

        const [movedItem] = activeQueue.splice(index, 1);
        activeQueue.splice(targetIndex, 0, movedItem);

        let draftedQueue = draft.queue.filter(id => draftedPlayers.includes(id));
        draft.queue = [...activeQueue, ...draftedQueue];

        saveActiveDraftState();
        renderBoard();
    };

    function getCallOutStyle(playerName) {
        let n = playerName.toLowerCase();
        let targets = (localStorage.getItem('ds_targets') || "").split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        let avoids = (localStorage.getItem('ds_avoids') || "").split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        let darts = (localStorage.getItem('ds_darts') || "").split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);

        if (targets.some(t => n.includes(t))) return `border-left: 5px solid var(--target-border); background-color: var(--target-bg);`;
        if (avoids.some(a => n.includes(a))) return `border-left: 5px solid var(--avoid-border); background-color: var(--avoid-bg);`;
        if (darts.some(d => n.includes(d))) return `border-left: 5px solid var(--dart-border); background-color: var(--dart-bg);`;
        return '';
    }

    function getTierTrackerData() {
        let draft = getActiveDraft();
        let drafted = draft ? draft.draftedPlayers : [];
        let trackers = { QB: null, RB: null, WR: null, TE: null, K: null, DEF: null };
        let available = State.players.filter(p => !drafted.includes(p.id));

        ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
            let posPlayers = available.filter(p => p.posGroup === pos && p.tier !== "-");
            if (posPlayers.length > 0) {
                let minTier = Math.min(...posPlayers.map(p => parseInt(p.tier) || 99));
                let count = posPlayers.filter(p => (parseInt(p.tier) || 99) === minTier).length;
                trackers[pos] = { tier: minTier, count: count };
            }
        });
        return trackers;
    }

    // --- FILE PARSING & DATA IMPORT ---
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'csv') {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: results => processData(results.data) });
        } else if (ext === 'xlsx' || ext === 'xls') {
            
            // Check if SheetJS is already loaded. If not, fetch it on the fly.
            if (typeof XLSX === 'undefined') {
                const script = document.createElement('script');
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                
                // Once the script finishes downloading, run the parser
                script.onload = () => {
                    parseExcel(file);
                };
                document.head.appendChild(script);
            } else {
                // If it was already loaded from a previous upload, just run it
                parseExcel(file);
            }
            
        } else if (ext === 'numbers') {
            // Apple Numbers' file format isn't a spreadsheet format our parser (SheetJS) can
            // read -- it's a proprietary zip/binary format, not CSV/XLSX under the hood.
            // Point to Numbers' own CSV export rather than silently failing on a fake attempt.
            if (window.showToast) window.showToast("Numbers files aren't supported directly. In Numbers, use File > Export To > CSV, then upload that file instead.", { isError: true });
        } else {
            if (window.showToast) window.showToast("Please upload a .csv, .xlsx, or .xls file", { isError: true });
        }
    });
}

// Helper function that processes the Excel file
function parseExcel(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        processData(XLSX.utils.sheet_to_json(firstSheet, {defval: ""}));
    };
    reader.readAsArrayBuffer(file);
}

    window.processPaste = function(btn) {
        const text = document.getElementById('csvPasteArea')?.value;
        if (text) Papa.parse(text, { header: true, skipEmptyLines: true, complete: results => processData(results.data, btn) });
    };
    async function processData(data, btn = null) {
        const metaEl = document.getElementById('metaDisplay');
        const originalBtnText = btn ? btn.innerHTML : "Upload"; 
        
        if (metaEl) {
            metaEl.style.display = 'block';
            metaEl.innerText = "Processing players and building database...";
        }
        if (btn) btn.innerHTML = "Processing...";

        // Yield to the browser to ensure the UI updates before the heavy lifting starts
        await new Promise(resolve => setTimeout(resolve, 15));

        let newPlayers = [];
        let posCounters = {}; 
        let sleeperMap = {};

        try {
            let res = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (res.ok) sleeperMap = await res.json();
        } catch(err) {
            console.warn("Could not fetch Sleeper database.");
        }

        // --- OPTIMIZATION ---
        // Build the Sleeper array ONCE outside the loop.
        const sleeperArray = Object.entries(sleeperMap)
            .filter(([_, sp]) => sp.first_name && sp.last_name)
            .map(([sId, sp]) => ({
                id: sId,
                fullName: `${sp.first_name} ${sp.last_name}`,
                lowerName: `${sp.first_name} ${sp.last_name}`.toLowerCase(),
                pos: (sp.position || "").toUpperCase(),
                team: sp.team ? sp.team.toUpperCase() : ""
            }));

        data.forEach((row, index) => {
            let keys = Object.keys(row);
            let getVal = possibleNames => {
                let key = keys.find(k => possibleNames.includes(k.toLowerCase().trim().replace(/['"]/g, '')));
                return key ? row[key] : "";
            };

            let name = getVal(['player', 'name', 'player name']);
            if (!name) return;

            let cleanName = String(name).trim();
            let team = getVal(['team', 'tm', 'franchise']);
            let bye = getVal(['bye', 'bye week']);

            let nameMatch = cleanName.match(/(.+)\s+\(([A-Z]{2,3})\)/i);
            if (nameMatch) {
                cleanName = nameMatch[1].trim();
                if (!team) team = nameMatch[2].toUpperCase();
            }

            let posRaw = getVal(['position', 'pos', 'pos rank', 'posn']);
            let posGroup = posRaw ? String(posRaw).replace(/[0-9]/g, '').toUpperCase().trim() : "FLEX";
            let posDisplay = posRaw ? String(posRaw).toUpperCase().trim() : posGroup;

            if (!posCounters[posGroup]) posCounters[posGroup] = 1;
            if (!/\d/.test(posDisplay)) posDisplay = posGroup + posCounters[posGroup];
            posCounters[posGroup]++;

            let tier = getVal(['tier', '#', 'tier #']) || "-";
            let adp = getVal(['adp', 'auction', 'value', 'auction value', 'rank/auction value']) || "-";

            let bestMatchId = null;
            let fallbackId = null;
            
            // Iterate over the pre-built array instead of running Object.entries() 
            for (let i = 0; i < sleeperArray.length; i++) {
                let sp = sleeperArray[i];
                let isName = typeof isNameMatch === 'function' ? isNameMatch(cleanName, sp.fullName) : cleanName.toLowerCase() === sp.lowerName;
                let isPos = posGroup === "FLEX" || sp.pos === posGroup;
                
                if (isName && isPos) {
                    fallbackId = sp.id;
                    if (team && team !== "FA" && sp.team === team) {
                        bestMatchId = sp.id;
                        break;
                    } else if (sp.team) {
                        bestMatchId = sp.id;
                    }
                }
            }
            
            let masterId = bestMatchId || fallbackId || null;
            let finalIsRookie = false;
            let finalInjury = null;
            
            // Dictionary to map full words to abbreviations
            const injMap = { "Questionable": "Q", "Doubtful": "D", "Out": "O", "Suspended": "SUSP" };

            if (masterId && sleeperMap[masterId]) {
                let sp = sleeperMap[masterId];
                if (!team || team === "FA") team = sp.team || "FA";
                
                // Grab Rookie & Injury info directly from Sleeper
                finalIsRookie = (sp.years_exp === 0 || sp.years_exp === null);
                
                let rawInj = sp.injury_status;
                // If it exists in our map, abbreviate it. Otherwise, return what Sleeper gave us (like "IR" or "PUP").
                finalInjury = rawInj ? (injMap[rawInj] || rawInj) : null; 
            }

            if (team && team !== "FA" && (!bye || bye === "-" || String(bye).trim() === "")) {
                bye = BYE_WEEKS_2026[team.toUpperCase()] || "-";
            }

            newPlayers.push({ 
                id: index + 1, sleeperId: masterId || `custom_${index}`, rank: index + 1, name: cleanName, 
                posGroup: posGroup, posDisplay: posDisplay, tier: tier, 
                team: (team ? String(team).toUpperCase() : "FA"), bye: (bye || "-"), adp: adp,
                isRookie: finalIsRookie, // UPDATED
                injury: finalInjury      // NEW
            });
        });

        if (newPlayers.length > 0) {
            const isAggregate = document.getElementById('aggregateToggle')?.checked;
            
            if (isAggregate && State.players.length > 0) {
                let combinedMap = new Map();
                let maxRankA = State.players.length;
                let maxRankB = newPlayers.length;
                let penaltyRank = maxRankA + maxRankB; // Safe fallback for a player missing from one of the lists

                // 1. Add existing players to the map
                State.players.forEach(p => {
                    let key = p.sleeperId && !p.sleeperId.toString().startsWith('custom_') ? p.sleeperId : p.name.toLowerCase();
                    combinedMap.set(key, { player: p, rankA: p.rank, rankB: penaltyRank });
                });

                // 2. Merge incoming players
                newPlayers.forEach(p => {
                    let key = p.sleeperId && !p.sleeperId.toString().startsWith('custom_') ? p.sleeperId : p.name.toLowerCase();
                    if (combinedMap.has(key)) {
                        let existing = combinedMap.get(key);
                        existing.rankB = p.rank; // Player exists in both, update rank B
                    } else {
                        combinedMap.set(key, { player: p, rankA: penaltyRank, rankB: p.rank }); // New player entirely
                    }
                });

                // 3. Calculate 50/50 average and sort
                let mergedPlayers = Array.from(combinedMap.values());
                mergedPlayers.forEach(entry => {
                    entry.avgRank = (entry.rankA + entry.rankB) / 2;
                });
                
                // Sort by the new averaged rank
                mergedPlayers.sort((a, b) => a.avgRank - b.avgRank);

                // 4. Assign clean, sequential integer ranks to the newly sorted master list
                State.players = mergedPlayers.map((entry, index) => {
                    let p = entry.player;
                    p.rank = index + 1;
                    p.id = index + 1;
                    return p;
                });
            } else {
                // Normal overwrite behavior if toggle is off
                State.players = newPlayers;
            }

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            State.rankingsMeta = { count: State.players.length, date: dateString };

            localStorage.setItem('ds_meta', JSON.stringify(State.rankingsMeta));
            localStorage.setItem('ds_players', JSON.stringify(State.players));
            updateMetaDisplay();
            saveActiveDraftState();

            if (btn) flashButton(btn, "Loaded Successfully", false, originalBtnText);
            if (typeof window.showToast === 'function') window.showToast(`Loaded ${State.players.length} players`);
        } else {
            if (metaEl) metaEl.style.display = 'none';
            if (btn) flashButton(btn, "Error Parsing Data", true, originalBtnText);
            if (window.showToast) window.showToast("Error: Could not detect player names. Please check your CSV format.", { isError: true });
        }
    }

    // --- LEAGUE LOGS INTEGRATION ---
    window.quickStartLeagueLogs = async function(btn) {
        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return;
        if (!formatSelect.value.startsWith('leaguelogs')) {
            if (window.showToast) window.showToast("Quick-Start auto-generation is currently only supported for LeagueLogs formats. Please select a LeagueLogs option from the dropdown.", { isError: true });
            return;
        }
        const profileKey = formatSelect.value.split('|')[1];
        const formatText = formatSelect.options[formatSelect.selectedIndex].text;

        const originalText = btn.innerHTML;
        btn.innerHTML = "Building Quick-Start...";

        try {
            let sleeperMap = {};
            try {
                let res = await fetch('https://api.sleeper.app/v1/players/nfl');
                if (res.ok) sleeperMap = await res.json();
            } catch(e) { console.warn("Sleeper DB fetch failed", e); }

            const marketRes = await fetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();

            let playerMetaMap = {};
            try {
                let pRes = await fetch(`https://developer.leaguelogs.com/v1/players`);
                if (pRes.ok) {
                    let pData = await pRes.json();
                    pData.data.forEach(lp => { playerMetaMap[lp.sleeperPlayerId] = lp; });
                }
            } catch(e) { console.warn("LeagueLogs Meta fetch failed", e); }

            let newPlayers = [];
            let posCounters = {};
            let sortedMarket = llMarket.data.sort((a, b) => parseFloat(a.overallRank) - parseFloat(b.overallRank));

            sortedMarket.forEach(item => {
                let sId = item.sleeperPlayerId;
                let sp = sleeperMap[sId];
                if (!sp || !sp.first_name) return;

                let cleanName = `${sp.first_name} ${sp.last_name}`;
                let team = sp.team || "FA";
                let bye = BYE_WEEKS_2026[team] || "-";
                
                let posGroup = (sp.position || "FLEX").toUpperCase();
                if (!['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(posGroup)) return;

                if (!posCounters[posGroup]) posCounters[posGroup] = 1;
                let posDisplay = posGroup + posCounters[posGroup];
                posCounters[posGroup]++;

                let lp = playerMetaMap[sId];
                
                // Prefer Sleeper DB for Rookie status if we have it, else fallback to LeagueLogs
                let isRookie = sp ? (sp.years_exp === 0 || sp.years_exp === null) : (lp ? (lp.yearsExp === 0 || lp.yearsExp === "0" || lp.yearsExp === null) : false);
                
                // Dictionary to map full words to abbreviations
                const injMap = { "Questionable": "Q", "Doubtful": "D", "Out": "O", "Suspended": "SUSP" };
                let rawInj = sp ? sp.injury_status : null;
                let injuryStatus = rawInj ? (injMap[rawInj] || rawInj) : null;
                
                let adpNum = parseFloat(item.overallRank);

                newPlayers.push({
                    id: newPlayers.length + 1, sleeperId: sId, rank: newPlayers.length + 1,
                    name: cleanName, posGroup: posGroup, posDisplay: posDisplay, tier: "-", 
                    team: team, bye: bye, adp: isNaN(adpNum) ? "-" : adpNum.toFixed(1), 
                    isRookie: isRookie, 
                    injury: injuryStatus
                });
            });

            if (newPlayers.length > 0) {
                State.players = newPlayers;
                let now = new Date();
                let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                State.rankingsMeta = { count: State.players.length, date: dateString };
                State.adpMeta = { format: "LeagueLogs: " + formatText, date: dateString };

                localStorage.setItem('ds_meta', JSON.stringify(State.rankingsMeta));
                localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
                localStorage.setItem('ds_players', JSON.stringify(State.players));
                
                updateMetaDisplay();
                saveActiveDraftState();
                flashButton(btn, "Quick-Start Loaded!", false, originalText);
                if (typeof window.showToast === 'function') window.showToast("Quick-Start market rankings loaded");
            } else {
                throw new Error("No players generated.");
            }
        } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            let adBlockerTip = err.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block URLs containing the word 'logs'. Please pause your ad-blocker to use this feature.)" : "";
            if (window.showToast) window.showToast(`Failed to load Quick-Start.\n\n${err.message}${adBlockerTip}`, { isError: true });
        }
    };

    window.fetchLeagueLogsADP = async function(btn) {
    if (State.players.length === 0) {
        flashButton(btn, "Load Rankings First", true);
        if (window.showToast) window.showToast("You must load a set of player rankings before fetching Market Value.", { isError: true });
        return;
    }

    const formatSelect = document.getElementById('adpFormatSelect');
    if (!formatSelect) return;
    
    // Split the value to route to the correct API
    const [source, profileKey] = formatSelect.value.split('|');
    const formatText = formatSelect.options[formatSelect.selectedIndex].text;

    const originalText = btn.innerHTML;
    btn.innerHTML = "Fetching...";

    try {
        let adpMap = {}; // Key: SleeperID (or Name string), Value: ADP

        // --- 1. LEAGUELOGS ---
        if (source === 'leaguelogs') {
            const marketRes = await fetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`LeagueLogs Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();
            llMarket.data.forEach(item => { adpMap[item.sleeperPlayerId] = item.overallRank; });
        } 
        
        // --- 2. SLEEPER ---
        else if (source === 'sleeper') {
            const sleeperRes = await fetch(`https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=${profileKey}`);
            if (!sleeperRes.ok) throw new Error(`Sleeper API Error: ${sleeperRes.status}`);
            const sleeperData = await sleeperRes.json();
            sleeperData.forEach(item => {
                // Check if the specific ADP metric exists in the stats object
                if (item.player_id && item.stats && item.stats[profileKey]) {
                    adpMap[item.player_id] = item.stats[profileKey];
                }
            });
        } 

        // --- APPLY TO STATE ---
        State.players.forEach(p => {
            // Optional: fallback normalizeName function if you don't have it globally scoped
            let cleanName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (adpMap[p.sleeperId] !== undefined) {
                p.adp = parseFloat(adpMap[p.sleeperId]).toFixed(1);
            } else if (adpMap['name_' + cleanName] !== undefined) {
                p.adp = parseFloat(adpMap['name_' + cleanName]).toFixed(1);
            } else {
                p.adp = "-"; // Reset if no ADP is found in this specific pull
            }
        });

        localStorage.setItem('ds_players', JSON.stringify(State.players));
        renderBoard();

        let now = new Date();
        let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        State.adpMeta = { format: `${source.toUpperCase()}: ${formatText}`, date: dateString };
        localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
        updateMetaDisplay();

        flashButton(btn, "Complete!", false, originalText);
        if (typeof window.showToast === 'function') window.showToast("Market Value (ADP) updated");
        
    } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            let adBlockerTip = err.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block URLs containing the word 'logs'. Please pause your ad-blocker to use this feature.)" : "";
            if (window.showToast) window.showToast(`Failed to fetch live Market Value.\n\n${err.message}${adBlockerTip}`, { isError: true });
        }
};

    // Splits one pasted row into fields, trying delimiters in order of how unlikely they are
    // to appear inside a player's name (tab/pipe/semicolon first, comma last, then falling back
    // to runs of 2+ spaces for plain-text-aligned data e.g. copied out of a PDF). Quoted fields
    // (e.g. "Smith, Jr., John",5) are respected so an embedded comma doesn't split a name apart.
    function splitAdpRow(row) {
        if (row.includes('"')) {
            let fields = [];
            let re = /"([^"]*)"|([^,\t|;]+)/g, m;
            while ((m = re.exec(row)) !== null) {
                let val = (m[1] !== undefined ? m[1] : m[2]).trim();
                if (val !== '') fields.push(val);
            }
            if (fields.length >= 2) return fields;
        }
        if (row.includes('\t')) return row.split('\t');
        if (row.includes('|')) return row.split('|');
        if (row.includes(';')) return row.split(';');
        if (row.includes(',')) return row.split(',');
        return row.split(/\s{2,}/);
    }

    window.processManualADP = function(btn) {
        const text = document.getElementById('adpPasteArea')?.value;
        if (!text) {
            flashButton(btn, "Paste Rank First", true);
            return;
        }

        let matchedCount = 0;
        text.split('\n').forEach(row => {
            row = row.trim();
            if (!row) return;

            let parts = splitAdpRow(row).map(p => p.trim()).filter(p => p !== '');
            if (parts.length < 2) return;

            // The rank/ADP number can be the first OR last column -- detect which side is
            // actually numeric rather than assuming a fixed order. Rows where both or neither
            // side is numeric (a two-number row, a header row, name+position with no rank) are
            // ambiguous and skipped rather than guessed at.
            let first = parts[0];
            let last = parts[parts.length - 1];
            let pName, newAdp;

            if (!isNaN(parseFloat(last)) && isNaN(parseFloat(first))) {
                pName = first; newAdp = last;
            } else if (!isNaN(parseFloat(first)) && isNaN(parseFloat(last))) {
                pName = last; newAdp = first;
            } else {
                return;
            }

            let matchedPlayer = State.players.find(p => typeof isNameMatch === 'function' ? isNameMatch(p.name, pName) : p.name.toLowerCase() === pName.toLowerCase());
            if (matchedPlayer) { matchedPlayer.adp = parseFloat(newAdp).toFixed(1); matchedCount++; }
        });

        if (matchedCount > 0) {
            localStorage.setItem('ds_players', JSON.stringify(State.players));
            renderBoard();
            flashButton(btn, "Updated!");
        } else {
            flashButton(btn, "No Matches", true);
        }
    };

    // --- RENDER DRAFT MATRIX ---
    function renderDraftMatrix() {
        const container = document.getElementById('draftMatrixContainer');
        if (!container) return;

        let currentScroll = 0;
        const existingGrid = container.querySelector('.draft-grid');
        if (existingGrid) {
            currentScroll = existingGrid.scrollLeft;
        } else {
            currentScroll = container.scrollLeft; 
        }

        let draft = getActiveDraft();
        if (!draft) {
            container.innerHTML = `<div class="empty-state-card"><p>Select or create a draft on Setup to view the grid.</p></div>`;
            return;
        }

        let totalTeams = draft.settings?.teams || 12;
        let totalRounds = draft.settings?.rounds || 15;
        let is3RR = draft.settings?.is3RR || false;

        let gridHTML = `<div class="draft-grid" style="--num-teams: ${totalTeams}; grid-template-columns: repeat(${totalTeams}, minmax(64px, 1fr));">`;

            for (let t = 1; t <= totalTeams; t++) {
            let isMyCol = false;
            for (let r = 1; r <= totalRounds; r++) {
                // --- 3RR MATH FIX START ---
                let isOddLogic = (r % 2 !== 0);
                if (is3RR && r >= 3) { isOddLogic = !isOddLogic; }
                let pNum = isOddLogic ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                // --- 3RR MATH FIX END ---
                
                if (draft.rawDraftPicks && draft.rawDraftPicks.length > 0) {
                    let matched = draft.rawDraftPicks.find(p => p.pick_no === pNum);
                    if (matched) {
                        let pl = State.players.find(x => x.sleeperId === matched.player_id);
                        if (pl && draft.myTeam.includes(pl.id)) { isMyCol = true; break; }
                    }
                } else {
                    let manualPId = draft.draftedPlayers[pNum - 1];
                    if (manualPId && draft.myTeam.includes(manualPId)) { isMyCol = true; break; }
                }
            }
            
            // Apply custom team name if we fetched it, otherwise fallback gracefully to T1, T2
            let headerText = (draft.draftSlotNames && draft.draftSlotNames[t]) ? draft.draftSlotNames[t] : `T${t}`;
            
            gridHTML += `<div class="draft-col-header ${isMyCol ? 'mine' : ''}" title="${headerText}">${headerText}</div>`;
        }


        for (let r = 1; r <= totalRounds; r++) {
            // --- 3RR MATH FIX START ---
            let isOddLogic = (r % 2 !== 0);
            if (is3RR && r >= 3) { isOddLogic = !isOddLogic; }

            for (let t = 1; t <= totalTeams; t++) {
                let pickNum = isOddLogic ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                let displayTeamNum = isOddLogic ? t : (totalTeams - t + 1);
            // --- 3RR MATH FIX END ---

                let pObj = null;
                let pName = "";
                let pPos = "";

                if (draft.rawDraftPicks && draft.rawDraftPicks.length > 0) {
                    let matchedPick = draft.rawDraftPicks.find(p => p.pick_no === pickNum);
                    if (matchedPick) {
                        pObj = State.players.find(pl => pl.sleeperId === matchedPick.player_id);
                        pName = pObj ? pObj.name : (matchedPick.metadata?.first_name?.[0] + ". " + matchedPick.metadata?.last_name) || "Player";
                        pPos = pObj ? pObj.posGroup : matchedPick.metadata?.position || "";
                    }
                } else {
                    let manualPlayerId = draft.draftedPlayers[pickNum - 1];
                    if (manualPlayerId) {
                        pObj = State.players.find(pl => pl.id === manualPlayerId);
                        if (pObj) { pName = pObj.name; pPos = pObj.posGroup; }
                    }
                }

                let cellClass = "draft-cell";
                let cellContent = `<span style="opacity:0.35; font-size:0.58rem;">${r}.${displayTeamNum < 10 ? '0'+displayTeamNum : displayTeamNum}</span>`;

                if (pName) {
                    let nameParts = pName.split(' ');
                    let firstName = nameParts[0];
                    let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

                    cellClass += ` picked ${pPos}`;
                    if (pObj && draft.myTeam.includes(pObj.id)) cellClass += " mine";

                    // 1. Grab the exact Sleeper ID safely (removing the undefined matchedPick variable)
                    let playerId = pObj ? (pObj.sleeperId || pObj.id) : null;
                    
                    // 2. Build the image string (excluding custom uploaded players)
                    let imgHTML = playerId && !playerId.toString().startsWith('custom_') ? 
                        `<img src="https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg" class="draft-cell-img" onerror="this.style.display='none'">` : '';

                    // 3. Inject into the cell
                    cellContent = `
                        ${imgHTML}
                        <div style="display:flex; flex-direction:column; align-items:center;">
                            <div class="draft-cell-first" title="${pName}">${firstName}</div>
                            <div class="draft-cell-last" title="${pName}">${lastName}</div>
                        </div>
                    `;
                }

                gridHTML += `<div class="${cellClass}">${cellContent}</div>`;
            }
        }

        gridHTML += `</div>`;
        container.innerHTML = gridHTML;

        const newGrid = container.querySelector('.draft-grid');
        if (newGrid && currentScroll > 0) {
            newGrid.scrollLeft = currentScroll;
        } else if (currentScroll > 0) {
            container.scrollLeft = currentScroll;
        }
    }

    function renderFantasyRoster() {
        if (State.players.length === 0) {
            return `<div class="empty-state-card"><p>Load rankings on the Setup tab to start building your roster.</p><button class="btn btn-primary empty-state-cta" onclick="showTab('setup')">Go to Setup</button></div>`;
        }

        let draft = getActiveDraft();
        if (!draft) return `<div style="text-align:center; color:var(--text-muted);">Select or add a draft first.</div>`;

        let myPlayersObjects = draft.myTeam.map(id => State.players.find(p => p.id === id)).filter(Boolean);
        let availablePool = [...myPlayersObjects];
        let rosterSlotsHTML = '';
        let limits = draft.limits || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6 };

                const buildSlotHTML = (label, color, p) => {
            if (p) {
                let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
                
                // 1. Grab ID and build the image tag (crossorigin removed)
                let playerId = p.sleeperId || p.id;
                let imgHTML = playerId && !playerId.toString().startsWith('custom_') 
                    ? `<img src="https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg" class="roster-avatar" onerror="this.style.display='none'">` 
                    : `<div class="roster-avatar placeholder"></div>`;

                return `
                <div class="roster-slot">
                    <div class="roster-slot-label-row">
                        <span class="roster-label" style="color:${color}">${label}</span>
                        ${imgHTML} <!-- Inject Image Here -->
                        <div>
                            <div style="font-weight: bold;">${p.name} ${rookieBadge}</div>
                            <div style="margin-top: 2px;">
                                <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span>
                                <span class="badge">${p.team}</span>
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Bye: ${p.bye}</div>
                        <button class="mds-btn-sm btn-draft" style="padding: 2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                    </div>
                </div>`;
            } else {
                return `
                <div class="roster-slot empty">
                    <div class="roster-slot-label-row">
                        <span class="roster-label" style="color:var(--text-muted)">${label}</span>
                        <div class="roster-avatar placeholder"></div>
                        <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                    </div>
                    <div></div>
                </div>`;
            }
        };

        ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
            let count = limits[pos] || 0;
            let color = `var(--pos-${pos.toLowerCase()}-border)`;
            for (let i = 0; i < count; i++) {
                let idx = availablePool.findIndex(p => p.posGroup === pos);
                let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
                rosterSlotsHTML += buildSlotHTML(`${pos}${i+1}`, color, p);
            }
        });

        // NEW: Fill W/T (Wide Receiver / Tight End) Flex Slots
        for (let i = 0; i < (limits.WT || 0); i++) {
            let idx = availablePool.findIndex(p => ['WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('W/T', '#2dd4bf', p); // Distinct teal color
        }

        // Fill Standard W/R/T Flex Slots
        for (let i = 0; i < (limits.FLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('FLX', '#86efac', p);
        }

        for (let i = 0; i < (limits.SFLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['QB', 'RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('SFLX', '#fca5a5', p);
        }

        if (availablePool.length > 0) {
            rosterSlotsHTML += `<div style="font-weight:bold; margin: 0.8rem 0 0.4rem 0; font-size: 0.85rem; color:var(--text-muted);">BENCH</div>`;
            availablePool.forEach(p => { rosterSlotsHTML += buildSlotHTML('BN', 'var(--text-muted)', p); });
        }

        const bannerContainer = document.getElementById('byeWarningContainer');
        const showByeWarnings = localStorage.getItem('ds_bye_warnings') === 'true';
        
        if (bannerContainer && showByeWarnings && myPlayersObjects.length > 0) {
            let byeCounts = {};
            let starterSlotsCount = (limits.QB||0) + (limits.RB||0) + (limits.WR||0) + (limits.TE||0) + (limits.FLEX||0) + (limits.SFLEX||0);
            let activeStarters = myPlayersObjects.slice(0, starterSlotsCount);

            activeStarters.forEach(sp => {
                if (sp.bye && sp.bye !== "-") byeCounts[sp.bye] = (byeCounts[sp.bye] || 0) + 1;
            });

            let heavyByes = Object.keys(byeCounts).filter(bye => byeCounts[bye] >= 3);
            if (heavyByes.length > 0) {
                bannerContainer.innerHTML = `<div class="bye-warning-banner"><span>⚠️ WARNING: You have ${byeCounts[heavyByes[0]]} starting players on Bye in Week ${heavyByes[0]}!</span></div>`;
            } else {
                bannerContainer.innerHTML = '';
            }
        } else if (bannerContainer) {
            bannerContainer.innerHTML = '';
        }

        return rosterSlotsHTML;
    }

    // --- SEND ROSTER TO LINEUP STRATEGIST ---
    // MDS (mydraftstrategist.com) and MLS (mydraftstrategist.com/lineup/) are same-origin, so
    // they already share localStorage directly -- no URL params or backend needed. This writes
    // the drafted roster to a shared key that MLS's Setup tab checks for on load and offers to
    // import as a new league. See mls.js's checkForDraftStrategistHandoff().
    window.sendRosterToLineupStrategist = function() {
        const draft = getActiveDraft();
        if (!draft || !draft.myTeam || draft.myTeam.length === 0) {
            if (window.showToast) window.showToast("Draft a roster first before sending it to Lineup Strategist.");
            return;
        }

        const myPlayers = draft.myTeam.map(id => State.players.find(p => p.id === id)).filter(Boolean);
        const players = myPlayers.map(p => ({ name: p.name, pos: p.posGroup, team: p.team || "FA" }));

        const limits = draft.limits || {};
        // MLS doesn't have a WR/TE-only flex slot type yet -- folding W/T into FLEX keeps the
        // total roster-spot count correct, though MLS's optimizer will (for now) also consider
        // RB eligible there, unlike the stricter W/T rule this count came from.
        const reqs = {
            QB: limits.QB || 0,
            RB: limits.RB || 0,
            WR: limits.WR || 0,
            TE: limits.TE || 0,
            FLEX: (limits.FLEX || 0) + (limits.WT || 0),
            SFLEX: limits.SFLEX || 0
        };

        const payload = {
            sourceLeagueName: draft.name || "Drafted Team",
            players: players,
            reqs: reqs,
            timestamp: Date.now()
        };

        localStorage.setItem('mds_handoff_roster', JSON.stringify(payload));

        if (window.showToast) window.showToast(`Sending ${players.length} players to Lineup Strategist...`);
        setTimeout(() => { window.location.href = './lineup/'; }, 700);
    };

    // Resolves the overall pick number a player was actually drafted at. Sleeper syncs have
    // precise data via rawDraftPicks; manual drafts don't, but draft.draftedPlayers is pushed to
    // in real draft order by draftPlayer(), so its index is the correct fallback -- NOT the
    // three different broken placeholders (an index into myTeam only, the player's own internal
    // id, or a hardcoded 50) that used to be scattered across the functions below, none of which
    // reflected a real pick number for a manual draft.
    function getPickNumberForPlayer(draft, player) {
        if (draft.rawDraftPicks && draft.rawDraftPicks.length > 0) {
            let match = draft.rawDraftPicks.find(r => r.player_id === player.sleeperId);
            if (match) return match.pick_no;
        }
        if (draft.draftedPlayers) {
            let idx = draft.draftedPlayers.indexOf(player.id);
            if (idx !== -1) return idx + 1;
        }
        return player.rank; // last-resort neutral fallback: treat as "drafted right at their rank"
    }

    // --- DRAFT RECAP & ANALYSIS RENDERER ---
    function renderDraftRecap() {
        const recapCard = document.getElementById('draftRecapCard');
        const recapContent = document.getElementById('draftRecapContent');
        if (!recapCard || !recapContent) return;

        let draft = getActiveDraft();
        if (!draft) { recapCard.style.display = 'none'; return; }

        let totalRequired = draft.limits?.TOTAL || 15;
        let teams = draft.settings?.teams || 12;

        if (!draft.myTeam || draft.myTeam.length < totalRequired) {
            recapCard.style.display = 'none';
            return;
        }

        recapCard.style.display = 'block';

        let myPlayers = draft.myTeam.map(id => State.players.find(p => p.id === id)).filter(Boolean);
        
        let bestSteal = null;
        let worstReach = null;
        let maxDiff = -999;
        let minDiff = 999;

        myPlayers.forEach((p, index) => {
            let pickNum = getPickNumberForPlayer(draft, p);

            let valueDiff = pickNum - p.rank;
            if (valueDiff > maxDiff) { maxDiff = valueDiff; bestSteal = { player: p, diff: valueDiff }; }
            if (valueDiff < minDiff) { minDiff = valueDiff; worstReach = { player: p, diff: valueDiff }; }
        });

        // Archetype Detection
        let firstPosRound = { QB: 99, RB: 99, WR: 99, TE: 99 };
        myPlayers.forEach(p => {
            let pickNum = getPickNumberForPlayer(draft, p);
            let rd = Math.ceil(pickNum / teams);
            if (rd < firstPosRound[p.posGroup]) firstPosRound[p.posGroup] = rd;
        });

        let archetype = "Balanced Build";
        let rbCountRds12 = myPlayers.filter(p => {
            let pNum = getPickNumberForPlayer(draft, p);
            return p.posGroup === 'RB' && Math.ceil(pNum / teams) <= 2;
        }).length;

        if (rbCountRds12 >= 2) archetype = "Robust / Heavy RB";
        else if (rbCountRds12 === 1) archetype = "Hero RB Strategy";
        else if (firstPosRound.RB >= 5) archetype = "Zero RB Build";
        else if (firstPosRound.QB <= 3) archetype = "Early QB Build";
        else if (firstPosRound.TE <= 4) archetype = "Elite TE Build";

        // Position Grades evaluated across ALL drafted players using Median Value
        let gradesHTML = "";
        let totalValSum = 0;
        let gradeCount = 0;

        const getLetterGrade = (val) => {
            if (val >= 10) return { grade: "A+", color: "#4ade80" };
            if (val >= 4) return { grade: "A", color: "#4ade80" };
            if (val >= 0) return { grade: "B", color: "#60a5fa" };
            if (val >= -5) return { grade: "C", color: "#fde047" };
            if (val >= -15) return { grade: "D", color: "#f97316" };
            return { grade: "F", color: "#ef4444" };
        };

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let posPlayers = myPlayers.filter(p => p.posGroup === pos);
            
            if (posPlayers.length === 0) {
                gradesHTML += `<div class="recap-grade-box">
                    <div class="roster-slot-pos-caption">${pos}</div>
                    <div style="font-size: 1.25rem; font-weight: bold; color: var(--text-muted);">—</div>
                </div>`;
                return;
            }

            let efficiencies = posPlayers.map(sp => {
                let pPick = getPickNumberForPlayer(draft, sp);
                return pPick - sp.rank; 
            });

            efficiencies.sort((a, b) => a - b);
            let mid = Math.floor(efficiencies.length / 2);
            let medianVal = efficiencies.length % 2 !== 0 ? efficiencies[mid] : (efficiencies[mid - 1] + efficiencies[mid]) / 2;

            let gInfo = getLetterGrade(medianVal);
            
            totalValSum += medianVal;
            gradeCount++;

            gradesHTML += `<div class="recap-grade-box">
                <div class="roster-slot-pos-caption">${pos}</div>
                <div style="font-size: 1.25rem; font-weight: bold; color: ${gInfo.color};">${gInfo.grade}</div>
            </div>`;
        });

        let overallAvg = gradeCount > 0 ? (totalValSum / gradeCount) : 0;
        let overallG = getLetterGrade(overallAvg);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(59, 130, 246, 0.1); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);">
                <div>
                    <div class="recap-label">Draft Archetype</div>
                    <div style="font-size: 1.05rem; font-weight: bold; color: var(--text-main);">${archetype}</div>
                </div>
                <div style="text-align: right;">
                    <div class="recap-label">Overall Grade</div>
                    <div style="font-size: 1.4rem; font-weight: bold; color: ${overallG.color};">${overallG.grade}</div>
                </div>
            </div>
        `;

        if (bestSteal && bestSteal.diff > 2) {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--target-bg); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--target-border); margin-top:0.5rem;">
                <span class="recap-callout-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary-green);"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                    <strong>Biggest Steal:</strong> ${bestSteal.player.name} (${bestSteal.player.posDisplay})
                </span>
                <span class="badge badge-value">+${Math.abs(bestSteal.diff)} Value</span>
            </div>`;
        }

        if (worstReach && worstReach.diff < -5) {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--avoid-bg); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--avoid-border); margin-top:0.5rem;">
                <span class="recap-callout-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--avoid-border);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <strong>Biggest Reach:</strong> ${worstReach.player.name} (${worstReach.player.posDisplay})
                </span>
                <span class="badge badge-reach">${worstReach.diff} Reach</span>
            </div>`;
        }

        html += `<div style="margin-top: 0.25rem; font-weight: 600; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase;">Positional Grades (Draft Value Efficiency)</div>`;
        html += `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.25rem;">`;
        html += gradesHTML;
        html += `</div>`;

        recapContent.innerHTML = html;

        let mathHTML = `<div style="display:flex; flex-direction:column; gap:0.4rem;">`;
        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let posPlayers = myPlayers.filter(p => p.posGroup === pos);
            if (posPlayers.length === 0) return;

            posPlayers.sort((a, b) => {
                return getPickNumberForPlayer(draft, a) - getPickNumberForPlayer(draft, b);
            });

            posPlayers.forEach(sp => {
                let pPick = getPickNumberForPlayer(draft, sp);
                let diff = pPick - sp.rank;
                let valColor = diff >= 0 ? "var(--primary-green)" : "var(--avoid-border)";
                let sign = diff >= 0 ? "+" : "";

                mathHTML += `
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:3px;">
                        <span><strong>${sp.posDisplay}:</strong> ${sp.name} (Rank: ${sp.rank} | Pick: ${pPick})</span>
                        <span style="color:${valColor}; font-weight:bold;">${sign}${diff} Value</span>
                    </div>`;
            });
        });
        mathHTML += `</div>`;

        const mathContainer = document.getElementById('recapMathBreakdown');
        if (mathContainer) mathContainer.innerHTML = mathHTML;
    }

    // --- RECAP MATH TOGGLE HELPER ---
    window.toggleRecapMath = function() {
        const breakdown = document.getElementById('recapMathBreakdown');
        const arrow = document.getElementById('recapMathArrow');
        const btnText = document.querySelector('#toggleRecapMathBtn span');
        if (!breakdown) return;

        if (breakdown.style.display === 'none') {
            breakdown.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(180deg)';
            if (btnText) btnText.innerText = 'Hide Value Breakdown';
        } else {
            breakdown.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            if (btnText) btnText.innerText = 'Show Value Breakdown';
        }
    };

    // --- TEAM EXPORT LOGIC ---
    window.exportTeam = async function() {
        if (typeof html2canvas === 'undefined') { 
            if (window.showToast) window.showToast("Screenshot library loading. Please try again in a moment.", { isError: true });
            return; 
        }
        
        const container = document.getElementById('exportableTeamContainer'); 
        const exportBtn = document.getElementById('exportTeamBtn');
        
        if (!container) return;

        const origText = exportBtn ? exportBtn.innerText : "Export";
        if (exportBtn) exportBtn.innerText = "Capturing...";
        
        const buttons = container.querySelectorAll('.btn-draft, #toggleRecapMathBtn');
        buttons.forEach(b => b.style.display = 'none');
        
                try {
            const canvas = await html2canvas(container, { 
                backgroundColor: '#0a0e17', // Updated to match your true app background
                scale: 2,
                useCORS: true,     
                allowTaint: true,
                onclone: (clonedDoc) => {
                    const clonedContainer = clonedDoc.getElementById('exportableTeamContainer');
                    const includeRecap = clonedDoc.getElementById('includeRecapInExport')?.checked;
                    const branding = clonedDoc.getElementById('exportBranding');
                    
                    // NEW: Hide all roster avatars in the clone so we don't get blank circles in the export
                    const avatars = clonedDoc.querySelectorAll('.roster-avatar');
                    avatars.forEach(av => av.style.display = 'none');
                    
                    // Reveal the logo only in the screenshot
                    if (branding) {
                        branding.style.display = 'flex';
                    }
                    
                    if (!includeRecap) {
                        const clonedRecap = clonedDoc.getElementById('draftRecapCard');
                        if (clonedRecap) clonedRecap.style.display = 'none';
                    }

                    if (clonedContainer) {
                        clonedContainer.style.width = '480px';
                        clonedContainer.style.maxWidth = '100%';
                        clonedContainer.style.margin = '0 auto';
                        clonedContainer.style.padding = '1.5rem'; // Slight padding bump to frame the logo beautifully
                        clonedContainer.style.boxSizing = 'border-box';
                    }
                }
            });

            const link = document.createElement('a');
            link.download = `My_Draft_Strategist_Team.png`; 
            link.href = canvas.toDataURL('image/png'); 
            link.click();
        } catch (err) {
            console.error("Export failed:", err); 
            if (window.showToast) window.showToast("Export failed. Please try again.", { isError: true });
        } finally {
            buttons.forEach(b => b.style.display = '');
            if (exportBtn) exportBtn.innerText = origText;
        }
    };

    // Reads the T-Score cache the T-Score page's "Refresh from Google Sheets" button writes to
    // localStorage (same origin as this page, so it's already visible here with no extra work).
    // Falls back to the bundled tscore_data.js if no cache exists yet, or if it fails to parse.
    // Memoized per page load: buildPlayerCardHTML() below calls this once per player per render
    // (potentially hundreds of times), so re-reading and re-parsing localStorage on every call
    // would be wasteful -- if the T-Score page writes a fresher cache mid-session, MDS picks it
    // up on its next full page load, not instantly without a reload.
    let cachedEffectiveTScoreData = null;
    function getEffectiveTScoreData() {
        if (cachedEffectiveTScoreData !== null) return cachedEffectiveTScoreData;
        try {
            const raw = localStorage.getItem('mds_tscore_cache');
            if (raw) {
                cachedEffectiveTScoreData = JSON.parse(raw);
                return cachedEffectiveTScoreData;
            }
        } catch (e) {
            console.error('Could not parse cached T-Score data, falling back to bundled tscore_data.js:', e);
        }
        cachedEffectiveTScoreData = (typeof tScoreData !== 'undefined') ? tScoreData : {};
        return cachedEffectiveTScoreData;
    }

    // Pure function: player object + current draft context in, one player-card's HTML string out.
    // No side effects, no DOM access -- extracted from what used to be inline in renderBoard()'s
    // main forEach loop so this ~130-line template is readable and testable on its own.
    function buildPlayerCardHTML(p, currentOverallPick, showStacks, myQbs, myPassCatchers, draft) {
        let customStyle = getCallOutStyle(p.name);
        let valueBadgeHTML = "";
        let diff = currentOverallPick - p.rank;
        if (diff > 0) {
            valueBadgeHTML = ` | <span class="badge badge-value">+${diff} Value</span>`;
        } else if (diff < 0) {
            valueBadgeHTML = ` | <span class="badge badge-reach">${diff} Reach</span>`;
        } else {
            valueBadgeHTML = ` | <span class="badge" style="background:#3a506b;">At Rank</span>`;
        }
        
        if (['WR', 'RB'].includes(p.posGroup) && localStorage.getItem('ds_tscore') === 'true') {
            const normFunc = (typeof normalizeName === 'function') ? normalizeName : (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normName = normFunc(p.name); 
            const tInfo = getEffectiveTScoreData()[normName];
            
            if (tInfo) {
                let tsColor = "#9ca3af";
                let tsBg = "rgba(255,255,255,0.1)";
                let tsBorder = "var(--border)";
                
                if (tInfo.c === 'label-elite') { tsColor = "#a855f7"; tsBg = "rgba(168, 85, 247, 0.15)"; tsBorder = "rgba(168, 85, 247, 0.3)"; }
                else if (tInfo.c === 'label-high') { tsColor = "#3b82f6"; tsBg = "rgba(59, 130, 246, 0.15)"; tsBorder = "rgba(59, 130, 246, 0.3)"; }
                else if (tInfo.c === 'label-strong') { tsColor = "#10b981"; tsBg = "rgba(16, 185, 129, 0.15)"; tsBorder = "rgba(16, 185, 129, 0.3)"; }
                else if (tInfo.c === 'label-quality') { tsColor = "#f59e0b"; tsBg = "rgba(245, 158, 11, 0.15)"; tsBorder = "rgba(245, 158, 11, 0.3)"; }
                else if (tInfo.c === 'label-boom') { tsColor = "#ef4444"; tsBg = "rgba(239, 68, 68, 0.15)"; tsBorder = "rgba(239, 68, 68, 0.3)"; }
                
                let tScoreHTML = ` | 
                    <div class="tooltip-container" style="display:inline-flex;">
                        <span class="badge" style="background: ${tsBg}; color: ${tsColor}; border: 1px solid ${tsBorder}; font-weight: 700;">${tInfo.l}</span>
                        <span class="tooltip-text" style="width: max-content; white-space: nowrap;">T-Score: ${tInfo.s} | ${tInfo.l}</span>
                    </div>`;
                
                valueBadgeHTML += tScoreHTML;
            }
        }

        let adpText = (p.adp && p.adp !== "-") ? ` | Market: ${p.adp}` : "";
        let isStack = false;
        if (showStacks && p.team !== "FA") {
            if (['WR', 'TE'].includes(p.posGroup) && myQbs.includes(p.team)) isStack = true;
            if (p.posGroup === 'QB' && myPassCatchers.includes(p.team)) isStack = true;
        }

        let stackBadge = isStack ? `<span class="badge" style="background: var(--stack-color); color: white;">Stack</span>` : "";
        let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
        
        // NEW: Generate the injury badge using your existing CSS class
        let injuryBadge = p.injury ? `<span class="badge inj-badge">${p.injury}</span>` : "";
        
        // Check if the card was expanded before the sync happened
        let expandedClass = p.isExpanded ? " is-expanded" : "";

        let isQueued = draft.queue && draft.queue.includes(p.id);
        let queueStarIcon = isQueued ? "★" : "☆";
        let queueStarColor = isQueued ? "#f59e0b" : "var(--text-muted)";

        return `
            <div class="player-card${expandedClass}" style="${customStyle}" tabindex="0" role="button" aria-label="${p.rank}. ${p.name}">
                
                <div class="card-grid" style="display: flex; flex-direction: column; gap: 0.6rem; width: 100%; align-items: stretch; text-align: left;">
                    
                    <!-- TOP ROW: Rank & Name -->
                    <div class="card-top-row">
                        <span style="color: var(--text-muted); font-weight: 500; font-size: 1rem; flex-shrink: 0;">${p.rank}.</span> 
                        <h4 class="card-name">
                            ${p.name}
                        </h4>
                    </div>

                    <!-- BOTTOM ROW: Badges & Actions -->
                    <div class="card-bottom-row">
                        
                        <!-- Bottom Left: Badges & Star -->
                        <div class="card-badges-row">
                            <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span> 
                            ${rookieBadge}
                            ${injuryBadge}
                            ${stackBadge}
                            <button onclick="toggleQueue(${p.id})" style="background: none; border: none; font-size: 1.15rem; color: ${queueStarColor}; cursor: pointer; padding: 0 4px; transform: translateY(-1px);" title="Toggle Queue">${queueStarIcon}</button>
                        </div>
                        
                        <!-- Bottom Right: Draft Actions & Chevron -->
                        <div class="actions" style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                            <button class="mds-btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)">Taken</button>
                            <button class="mds-btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)">Pick</button>
                            <button class="btn-expand hide-on-desktop" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center;" onclick="toggleCardDetails(event, ${p.id})" aria-label="Expand details" aria-expanded="${p.isExpanded ? 'true' : 'false'}">
                                <svg class="chevron-icon" style="transform: ${p.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card-details" id="details-${p.id}">
                    <div class="player-stats">
                        <span>${p.team} | Bye: ${p.bye}${adpText}${valueBadgeHTML}</span>
                        <span class="edit-link" onclick="toggleEditBar(${p.id})" title="Edit Details">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin: 0 2px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </span>
                    </div>
                    <div class="inline-editor" id="inline-edit-${p.id}" style="${p.isEditing ? 'display: flex;' : ''}">
                        <div style="display:flex; gap:0.4rem; width:100%; flex-wrap:wrap; align-items:center;">
                            <div>
                                <label class="card-field-label">Rank</label>
                                <input type="number" id="edit-rank-val-${p.id}" value="${p.rank}" style="width:55px;">
                            </div>
                            <div>
                                <label class="card-field-label">Tier</label>
                                <input type="text" id="edit-tier-val-${p.id}" value="${p.tier}" style="width:45px;">
                            </div>
                            <div>
                                <label class="card-field-label">Team</label>
                                <input type="text" id="edit-team-val-${p.id}" value="${p.team}" style="width:55px;">
                            </div>
                            <div>
                                <label class="card-field-label">Bye</label>
                                <input type="text" id="edit-bye-val-${p.id}" value="${p.bye}" style="width:45px;">
                            </div>
                            <div style="margin-left:auto; display:flex; gap:4px; align-self:flex-end;">
                                <button class="mds-btn-sm btn-mine" style="padding:0.4rem 0.8rem;" onclick="saveInlineEdit(${p.id})">Save</button>
                                <button class="mds-btn-sm btn-draft" style="padding:0.4rem 0.6rem;" onclick="toggleEditBar(${p.id})">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }
    function buildQueueCardHTML(p, idx, isFirst, isLast) {
        return `
            <div class="player-card queue-card" 
                 draggable="true" 
                 ondragstart="handleQueueDragStart(event, ${idx})" 
                 ondragover="handleQueueDragOver(event)" 
                 ondragend="handleQueueDragEnd(event)" 
                 ondrop="handleQueueDrop(event, ${idx})"
                 style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.04); padding: 0.75rem; text-align: left;">
                 
                <div style="display: flex; flex-direction: column; gap: 0.6rem; width: 100%; align-items: stretch;">
                    
                    <!-- TOP ROW: Grip & Name -->
                    <div class="card-top-row">
                        <span style="color: var(--text-muted); cursor: grab; user-select: none; flex-shrink: 0; font-size: 1.1rem; margin-right: 0.2rem;" title="Drag to reorder">⋮⋮</span>
                        <h4 class="card-name">
                            ${p.name}
                        </h4>
                    </div>

                    <!-- BOTTOM ROW: Arrows, Badges, Star & Actions -->
                    <div class="card-bottom-row">
                        
                        <!-- Left Side: Arrows, Badges & Star -->
                        <div class="card-badges-row">
                            <button class="mds-btn-sm btn-secondary queue-arrow-btn" onclick="moveQueueItem(${idx}, -1)" ${isFirst ? 'disabled' : ''}>▲</button>
                            <button class="mds-btn-sm btn-secondary queue-arrow-btn" onclick="moveQueueItem(${idx}, 1)" ${isLast ? 'disabled' : ''}>▼</button>
                            <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span>
                            <button onclick="toggleQueue(${p.id})" style="background: none; border: none; font-size: 1.15rem; color: #f59e0b; cursor: pointer; padding: 0 4px; transform: translateY(-1px);" title="Remove from Queue">★</button>
                        </div>
                        
                        <!-- Right Side: Draft Actions -->
                        <div style="display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center;">
                            <button class="mds-btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)">Taken</button>
                            <button class="mds-btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)">Pick</button>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // Queue collapse state lives here, outside renderBoard(), because renderBoard() rebuilds
    // the queue's HTML from scratch via innerHTML on every call (every pick, every queue
    // add/remove) -- a class toggled directly on the old DOM node wouldn't survive that. This
    // is read by renderBoard() each time it runs so the user's choice persists across re-renders
    // for the rest of the session (not saved to localStorage -- matches how the MLS rankings
    // cards' collapse state also doesn't persist across a page reload).
    let isQueueCollapsed = false;
    window.toggleQueueCollapse = function() {
        isQueueCollapsed = !isQueueCollapsed;
        renderBoard();
    };

    function renderBoard() {
        const poolEl = document.getElementById('playerPool');
        const myTeamEl = document.getElementById('myTeamList');
        const otherEl = document.getElementById('otherDraftedList');
        const searchEl = document.getElementById('searchBar');
        const searchTerm = searchEl ? searchEl.value.toLowerCase() : "";
        const tierTrackerElEarly = document.getElementById('tierTracker');

        // Same empty-state pattern as renderDraftMatrix() (Board tab): without any rankings
        // loaded, there's nothing to show yet, so say so instead of leaving this blank.
        // Covers Tracker (tierTracker/playerPool) AND Team (myTeamList/otherDraftedList) --
        // both tabs render through this same function, so both need to be handled here or
        // an early return leaves the Team tab silently blank with no guidance.
        if (State.players.length === 0) {
            if (tierTrackerElEarly) tierTrackerElEarly.innerHTML = '';
            if (poolEl) {
                poolEl.innerHTML = `<div class="empty-state-card"><p>Load rankings on the Setup tab to see your player pool here.</p><button class="btn btn-primary empty-state-cta" onclick="showTab('setup')">Go to Setup</button></div>`;
            }
            if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster();
            if (otherEl) {
                otherEl.innerHTML = `<div class="empty-state-card"><p>Drafted players from other teams will show up here once you're synced or tracking picks.</p><button class="btn btn-primary empty-state-cta" onclick="showTab('setup')">Go to Setup</button></div>`;
            }
            const limitsBodyElEmpty = document.getElementById('limitsBody');
            if (limitsBodyElEmpty) {
                const dLimits = getActiveDraft()?.limits || { QB:1, RB:2, WR:3, TE:1, FLEX:1, SFLEX:0, BENCH:6, TOTAL:14 };
                limitsBodyElEmpty.innerHTML = `<tr><td>0 / ${dLimits.QB}</td><td>0 / ${dLimits.RB}</td><td>0 / ${dLimits.WR}</td><td>0 / ${dLimits.TE}</td><td>0 / ${dLimits.FLEX}</td><td>0 / ${dLimits.SFLEX}</td><td><strong>0 / ${dLimits.TOTAL}</strong></td></tr>`;
            }
            return;
        }

        let draft = getActiveDraft();
        let draftedPlayers = draft ? draft.draftedPlayers : [];
        let myTeam = draft ? draft.myTeam : [];
        let limits = draft ? draft.limits : { QB:1, RB:2, WR:3, TE:1, FLEX:1, SFLEX:0, BENCH:6, TOTAL:14 };

        let newPoolHTML = '';
        let posCounts = { "QB": 0, "RB": 0, "WR": 0, "TE": 0 };
        // Check Sleeper's raw pick count first so unranked K/DEF are included in the math
        let totalPicksDone = (draft && draft.rawDraftPicks && draft.rawDraftPicks.length > 0) ? draft.rawDraftPicks.length : draftedPlayers.length;
        let currentOverallPick = totalPicksDone + 1;
        
        let teamsInLeague = draft?.settings?.teams || 12;
        let round = Math.ceil(currentOverallPick / teamsInLeague);
        let pickInRound = currentOverallPick - ((round - 1) * teamsInLeague);
        
        const pickTrackerEl = document.getElementById('pickTracker');
        if (pickTrackerEl) pickTrackerEl.innerText = `Pick: ${round}.${pickInRound.toString().padStart(2, '0')}`;

        const trackers = getTierTrackerData();
        let isAllActive = !Array.isArray(State.activePosFilter) || State.activePosFilter.length === 0;
        let trackerHTML = `<div class="badge badge-all pos-filter ${isAllActive ? 'active-filter' : ''}" onclick="setPosFilter('ALL')"><span>ALL</span></div>`;

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            // If ALL is active, everything lights up. Otherwise, check if this specific pos is selected.
            let isActive = isAllActive || (Array.isArray(State.activePosFilter) && State.activePosFilter.includes(pos)) ? 'active-filter' : '';
            let tText = trackers[pos] ? `T${trackers[pos].tier} (${trackers[pos].count})` : "—";
            trackerHTML += `<div class="badge pos-badge ${pos} pos-filter ${isActive}" onclick="setPosFilter('${pos}')"><span>${pos}</span><span style="font-size:0.65rem; opacity:0.9;">${tText}</span></div>`;
        });
        const tierTrackerEl = document.getElementById('tierTracker');
        if (tierTrackerEl) tierTrackerEl.innerHTML = trackerHTML;

        let showStacks = localStorage.getItem('ds_stacks') === 'true';
        let myQbs = myTeam.map(id => State.players.find(p => p.id === id)).filter(p => p && p.posGroup === 'QB').map(p => p.team).filter(t => t !== "FA");
        let myPassCatchers = myTeam.map(id => State.players.find(p => p.id === id)).filter(p => p && ['WR', 'TE'].includes(p.posGroup)).map(p => p.team).filter(t => t !== "FA");


        let lastTier = null;

        State.players.forEach(p => {
            const isDrafted = draftedPlayers.includes(p.id);
            const isMine = myTeam.includes(p.id);

            if (isMine && posCounts[p.posGroup] !== undefined) posCounts[p.posGroup]++;

            if (!isDrafted) {
                if (Array.isArray(State.activePosFilter) && State.activePosFilter.length > 0) {
                    if (!State.activePosFilter.includes(p.posGroup)) return;
                }

                if (p.name.toLowerCase().includes(searchTerm)) {
                    if (searchTerm === "" && p.tier !== lastTier && p.tier !== "-") {
                        newPoolHTML += `<div class="tier-divider">Tier ${p.tier}</div>`;
                        lastTier = p.tier;
                    }

                    newPoolHTML += buildPlayerCardHTML(p, currentOverallPick, showStacks, myQbs, myPassCatchers, draft);
                }
            }
        });
        if (newPoolHTML === '') {
            newPoolHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(0,0,0,0.1); border-radius: 8px; margin-top: 1rem;">
                    <h4>No players found</h4>
                    <p style="font-size: 0.9rem;">Try clearing your search term or adjusting your position filter.</p>
                </div>`;
        }
        if (poolEl) poolEl.innerHTML = newPoolHTML;
        const queueEl = document.getElementById('queueContainer');
        let newQueueHTML = '';

        if (draft && draft.queue && draft.queue.length > 0) {
            let activeQueue = draft.queue.filter(id => !draftedPlayers.includes(id));

            if (activeQueue.length > 0) {
                let queueExpandedClass = isQueueCollapsed ? "" : " is-expanded";
                newQueueHTML += `<div class="queue-header${queueExpandedClass}" onclick="toggleQueueCollapse()" role="button" tabindex="0" aria-expanded="${isQueueCollapsed ? 'false' : 'true'}" aria-label="Toggle Queue" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleQueueCollapse();}">                    <span class="queue-header-title"><span class="pulse-dot" style="background-color: #f59e0b; box-shadow: none; animation: none;"></span> My Queue (${activeQueue.length})</span>
                    <svg class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>`;

                if (!isQueueCollapsed) {
                    newQueueHTML += `<div class="player-pool-container" style="margin-bottom: 1.5rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.5rem;">`;

                    activeQueue.forEach((qId, idx) => {
                        let p = State.players.find(x => x.id === qId);
                        if (p) {
                            let isFirst = idx === 0;
                            let isLast = idx === activeQueue.length - 1;
                            newQueueHTML += buildQueueCardHTML(p, idx, isFirst, isLast);
                        }
                    });
                    newQueueHTML += `</div>`;
                }
            }
        }
        if (queueEl) queueEl.innerHTML = newQueueHTML;
        if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster();

        let otherDraftedIds = draftedPlayers.filter(id => !myTeam.includes(id)).slice().reverse();
        let newOtherHTML = '';
        if (otherDraftedIds.length === 0) {
            newOtherHTML = `
                <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                    <em>No other players drafted yet.</em>
                </div>`;
        } else {
            otherDraftedIds.forEach(id => {
                let p = State.players.find(player => player.id === id);
                if (p) {
                    newOtherHTML += `
                        <div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                            <div style="color: var(--text-muted);"><strike>${p.name}</strike> <span class="badge">${p.posGroup}</span></div>
                            <button class="mds-btn-sm btn-draft" style="padding:2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                        </div>`;
                }
            });
        }
        if (otherEl) otherEl.innerHTML = newOtherHTML;

        let flexOverflow = Math.max(0, posCounts['RB'] - limits.RB) + Math.max(0, posCounts['WR'] - limits.WR) + Math.max(0, posCounts['TE'] - limits.TE);
        let flexUsed = Math.min(flexOverflow, limits.FLEX);
        let sflexOverflow = Math.max(0, posCounts['QB'] - limits.QB) + Math.max(0, flexOverflow - limits.FLEX);
        let sflexUsed = Math.min(sflexOverflow, limits.SFLEX);

        const limitsBodyEl = document.getElementById('limitsBody');
        if (limitsBodyEl) {
            limitsBodyEl.innerHTML = `
                <tr>
                    <td>${posCounts['QB']} / ${limits.QB}</td>
                    <td>${posCounts['RB']} / ${limits.RB}</td>
                    <td>${posCounts['WR']} / ${limits.WR}</td>
                    <td>${posCounts['TE']} / ${limits.TE}</td>
                    <td>${flexUsed} / ${limits.FLEX}</td>
                    <td>${sflexUsed} / ${limits.SFLEX}</td>
                    <td><strong>${myTeam.length} / ${limits.TOTAL}</strong></td>
                </tr>`;
        }

        const exportRecapContainer = document.getElementById('exportRecapContainer');
        if (exportRecapContainer) {
            exportRecapContainer.style.display = (myTeam.length >= limits.TOTAL) ? 'flex' : 'none';
        }

        renderDraftMatrix();
        renderDraftRecap();
    }
window.toggleHeadshots = function(show) {
    localStorage.setItem('mds_show_headshots', show);
    if (show) {
        document.body.classList.remove('hide-headshots');
    } else {
        document.body.classList.add('hide-headshots');
    }
};
    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        ensureDefaultDraft();
        refreshDraftDropdown();
        initSettingsUI();
        updateMetaDisplay();
        
        ['limitQB', 'limitRB', 'limitWR', 'limitTE', 'limitFLEX', 'limitSFLEX', 'limitBENCH'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateTotalRounds);
        });

        const searchBarEl = document.getElementById('searchBar');
        if (searchBarEl) {
            searchBarEl.addEventListener('input', debounce(renderBoard, 200));
        }

        // --- KEYBOARD ACCESSIBILITY FOR PLAYER CARDS ---
        const poolEl = document.getElementById('playerPool');
        if (poolEl) {
            poolEl.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('player-card')) {
                    e.preventDefault();
                    const draftBtn = e.target.querySelector('.btn-draft');
                    if (draftBtn) draftBtn.click();
                }
            });
        }
        // --- POWER-USER KEYBOARD SHORTCUTS ---
        document.addEventListener('keydown', (e) => {
            // Escape closes the hamburger drawer from anywhere, so keyboard users have a way to
            // dismiss it without a mouse. The menuOverlay backdrop is intentionally NOT a tab
            // stop (standard pattern for backdrops); this plus the existing visible close button
            // are the two keyboard-accessible ways to exit the menu.
            const openMenu = document.getElementById('hamburgerMenu');
            if (e.key === 'Escape' && openMenu && openMenu.classList.contains('open')) {
                window.toggleMenu();
                return;
            }

            // Check if user is typing in an input field to prevent accidental triggers
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

            if (isInputActive) {
                // EXCEPTION: Allow Escape key to quickly clear and exit the search bar
                if (e.key === 'Escape' && document.activeElement.id === 'searchBar') {
                    document.activeElement.value = '';
                    document.activeElement.blur();
                    renderBoard(); // Force board to reset instantly
                }
                return; // Stop processing other hotkeys if typing
            }

            // Global Hotkeys
            switch(e.key.toLowerCase()) {
                case '/': // Focus search bar
                    e.preventDefault(); 
                    const searchEl = document.getElementById('searchBar');
                    if (searchEl) {
                        searchEl.focus();
                        searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    break;
                case 'a': // Filter All
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('ALL');
                    break;
                case 'q': // Filter QB
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('QB');
                    break;
                case 'r': // Filter RB
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('RB');
                    break;
                case 'w': // Filter WR
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('WR');
                    break;
                case 't': // Filter TE
                    if (typeof window.setPosFilter === 'function') window.setPosFilter('TE');
                    break;
                case '1':
                    if (typeof window.showTab === 'function') window.showTab('setup');
                    break;
                case '2':
                    if (typeof window.showTab === 'function') window.showTab('tracker');
                    break;
                case '3':
                    if (typeof window.showTab === 'function') window.showTab('team');
                    break;
                case '4':
                    if (typeof window.showTab === 'function') window.showTab('board');
                    break;
                case '5':
                    if (typeof window.showTab === 'function') window.showTab('guide');
                    break;
            }
        });

        if (State.players.length > 0) renderBoard();
    // --- MOBILE COLLAPSE TOGGLE ---
        const collapseCheckbox = document.getElementById('ds_mobile_collapse');
        if (collapseCheckbox) {
            const savedPref = localStorage.getItem('ds_mobile_collapse_pref');
            if (savedPref !== null) collapseCheckbox.checked = savedPref === 'true';
            
            const applyCollapsePref = (isChecked) => {
                if (isChecked) document.body.classList.add('enable-mobile-collapse');
                else document.body.classList.remove('enable-mobile-collapse');
            };
            
            applyCollapsePref(collapseCheckbox.checked);
            
            collapseCheckbox.addEventListener('change', (e) => {
                localStorage.setItem('ds_mobile_collapse_pref', e.target.checked);
                applyCollapsePref(e.target.checked);
            });
        }
        const showHeadshots = localStorage.getItem('mds_show_headshots') !== 'false';
        const toggleEl = document.getElementById('toggleHeadshots');
        if (toggleEl) toggleEl.checked = showHeadshots;
        toggleHeadshots(showHeadshots);
    });

})();