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
                totalPicks: parseInt(localStorage.getItem('ds_total_picks')) || 0
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
    function flashButton(btn, text, isError = false, fallbackContent = null) {
        if (!btn) return;
        const originalContent = fallbackContent || btn.innerHTML; // Changed to innerHTML
        const originalBg = btn.style.backgroundColor;

        btn.innerHTML = text; // Changed to innerHTML
        btn.style.backgroundColor = isError ? "var(--error-color, #ea4335)" : "var(--success-color, #4ade80)";
        btn.style.color = isError ? "white" : "var(--bg-main, #0b132b)";

        setTimeout(() => {
            btn.innerHTML = originalContent; // Changed to innerHTML
            btn.style.backgroundColor = originalBg;
            btn.style.color = "";
        }, 2500);
    }
    
    window.toggleMenu = function() {
        const menu = document.getElementById('hamburgerMenu');
        const overlay = document.getElementById('menuOverlay');
        if (!menu || !overlay) return;
        menu.classList.toggle('open');
        overlay.style.display = menu.classList.contains('open') ? 'block' : 'none';
    };

    // --- GESTURE HANDLING ---
    function handleGesture() {
        const menu = document.getElementById('hamburgerMenu');
        if (!menu) return;
        const isOpen = menu.classList.contains('open');
        let diffX = State.touchendX - State.touchstartX;

        if (diffX > 50 && State.touchstartX < 40 && !isOpen) {
            window.toggleMenu();
            return;
        }
        if (diffX < -50 && isOpen) {
            window.toggleMenu();
            return;
        }

        if (!isOpen && Math.abs(diffX) > 80) {
            let activeTabEl = document.querySelector('.tab-content.active');
            if (!activeTabEl) return;
            let currentId = activeTabEl.id.replace('Tab', '');
            if (currentId === 'board') return;

            let currentIndex = State.tabOrder.indexOf(currentId);
            if (currentIndex !== -1) {
                if (diffX < 0 && currentIndex < State.tabOrder.length - 1) {
                    window.showTab(State.tabOrder[currentIndex + 1]);
                } else if (diffX > 0 && currentIndex > 0) {
                    window.showTab(State.tabOrder[currentIndex - 1]);
                }
            }
        }
    }

    document.addEventListener('touchstart', e => { State.touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    document.addEventListener('touchend', e => { State.touchendX = e.changedTouches[0].screenX; handleGesture(); }, {passive: true});

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
        
        let settings = draft ? draft.settings : { teams: 12, rounds: 15 };
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
                rounds: parseInt(getVal('leagueRounds')) || 15
            };
            draft.limits = {
                QB: parseInt(getVal('limitQB')) || 0,
                RB: parseInt(getVal('limitRB')) || 0,
                WR: parseInt(getVal('limitWR')) || 0,
                TE: parseInt(getVal('limitTE')) || 0,
                FLEX: parseInt(getVal('limitFLEX')) || 0,
                SFLEX: parseInt(getVal('limitSFLEX')) || 0,
                BENCH: parseInt(getVal('limitBENCH')) || 0,
            };
            draft.limits.TOTAL = draft.limits.QB + draft.limits.RB + draft.limits.WR + draft.limits.TE + draft.limits.FLEX + draft.limits.SFLEX + draft.limits.BENCH;
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

    window.hardReset = function() {
        if (window.confirm("WARNING: This will delete ALL data including saved drafts, custom rankings, and settings.")) {
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
            localStorage.clear();
            window.location.reload();
        }
    };

    window.showTab = function(tabId) {
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
    };

    window.setPosFilter = function(pos) {
        State.activePosFilter = pos;
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
        e.stopPropagation(); // Prevents the space/enter keydown listener from firing if clicked
        const card = document.getElementById(`details-${id}`).closest('.player-card');
        if (card) {
            card.classList.toggle('is-expanded');
            
            // Track the state in memory so it persists during live sync redraws
            let p = State.players.find(x => x.id === id);
            if (p) {
                p.isExpanded = card.classList.contains('is-expanded');
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
        let newId = 'manual_' + Date.now();

        let newDraft = {
            draftId: newId,
            name: draftName,
            username: "Manual",
            settings: {
                teams: parseInt(getVal('leagueTeams')) || 12,
                rounds: parseInt(getVal('leagueRounds')) || 15
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
            totalPicks: 0
        };

        State.drafts.push(newDraft);
        State.activeDraftId = newId;
        saveActiveDraftState();

        if (nameInput) nameInput.value = "";
        refreshDraftDropdown();
        initSettingsUI();
        window.alert(`Manual Draft '${draftName}' created!`);
    };

    async function processSleeperDraftData(username, draftId, btn, isSilent = false) {
        try {
            const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
            if (!userRes.ok) throw new Error("Could not find Sleeper User.");
            const userId = (await userRes.json()).user_id;

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
                rounds: dInfo.settings?.rounds || 15
            };

            let draftLimits = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6 };

            // Parse Sleeper's roster_positions array if we successfully grabbed the league
            if (fetchedLeague && fetchedLeague.roster_positions) {
                draftLimits = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SFLEX: 0, BENCH: 0 };
                fetchedLeague.roster_positions.forEach(pos => {
                    if (pos === 'QB') draftLimits.QB++;
                    else if (pos === 'RB') draftLimits.RB++;
                    else if (pos === 'WR') draftLimits.WR++;
                    else if (pos === 'TE') draftLimits.TE++;
                    else if (pos === 'FLEX' || pos === 'W/R/T') draftLimits.FLEX++;
                    else if (pos === 'SUPER_FLEX' || pos === 'Q/W/R/T') draftLimits.SFLEX++;
                    else if (pos === 'BN') draftLimits.BENCH++;
                });
            } else {
                // Fallback for manual/mock drafts unattached to a league
                draftLimits = {
                    QB: dInfo.settings?.slots_qb || 1,
                    RB: dInfo.settings?.slots_rb || 2,
                    WR: dInfo.settings?.slots_wr || 3,
                    TE: dInfo.settings?.slots_te || 1,
                    FLEX: dInfo.settings?.slots_flex || 1,
                    SFLEX: dInfo.settings?.slots_super_flex || 0,
                    BENCH: dInfo.settings?.slots_bn || 6,
                };
            }
            draftLimits.TOTAL = draftLimits.QB + draftLimits.RB + draftLimits.WR + draftLimits.TE + draftLimits.FLEX + draftLimits.SFLEX + draftLimits.BENCH;

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
                draftSlotNames: draftSlotNames // <-- Add this here
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
            if (!isSilent) window.alert(`Sleeper Sync Error:\n${err.message}`);
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
            window.alert("Please enter both Username and Draft ID.");
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
                window.alert("Please enter your Sleeper Username and Draft ID on the Setup tab first.");
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
                window.alert("Please enter your Sleeper Username and Draft ID on the Setup tab first.");
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
        let trackers = { QB: null, RB: null, WR: null, TE: null };
        let available = State.players.filter(p => !drafted.includes(p.id));

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
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
            
        } else {
            window.alert("Please upload a .csv, .xlsx, or .xls file");
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
            if (masterId && sleeperMap[masterId]) {
                let sp = sleeperMap[masterId];
                if (!team || team === "FA") team = sp.team || "FA";
            }

            if (team && team !== "FA" && (!bye || bye === "-" || String(bye).trim() === "")) {
                bye = BYE_WEEKS_2026[team.toUpperCase()] || "-";
            }

            newPlayers.push({ 
                id: index + 1, sleeperId: masterId || `custom_${index}`, rank: index + 1, name: cleanName, 
                posGroup: posGroup, posDisplay: posDisplay, tier: tier, 
                team: (team ? String(team).toUpperCase() : "FA"), bye: (bye || "-"), adp: adp,
                isRookie: false
            });
        });

        if (newPlayers.length > 0) {
            State.players = newPlayers;
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
            window.alert("Error: Could not detect player names. Please check your CSV format.");
        }
    }

    // --- LEAGUE LOGS INTEGRATION ---
    window.quickStartLeagueLogs = async function(btn) {
        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return;
        if (!formatSelect.value.startsWith('leaguelogs')) {
            window.alert("Quick-Start auto-generation is currently only supported for LeagueLogs formats. Please select a LeagueLogs option from the dropdown.");
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
                if (!['QB', 'RB', 'WR', 'TE'].includes(posGroup)) return;

                if (!posCounters[posGroup]) posCounters[posGroup] = 1;
                let posDisplay = posGroup + posCounters[posGroup];
                posCounters[posGroup]++;

                let lp = playerMetaMap[sId];
                let isRookie = lp ? (lp.yearsExp === 0 || lp.yearsExp === "0" || lp.yearsExp === null) : false;
                let adpNum = parseFloat(item.overallRank);

                newPlayers.push({
                    id: newPlayers.length + 1, sleeperId: sId, rank: newPlayers.length + 1,
                    name: cleanName, posGroup: posGroup, posDisplay: posDisplay, tier: "-", 
                    team: team, bye: bye, adp: isNaN(adpNum) ? "-" : adpNum.toFixed(1), isRookie: isRookie
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
            window.alert(`Failed to load Quick-Start.\n\n${err.message}`);
        }
    };

    window.fetchLeagueLogsADP = async function(btn) {
    if (State.players.length === 0) {
        flashButton(btn, "Load Rankings First", true);
        window.alert("You must load a set of player rankings before fetching Market Value.");
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
        window.alert(`Failed to fetch live Market Value.\n\n${err.message}`);
    }
};

    window.processManualADP = function(btn) {
        const text = document.getElementById('adpPasteArea')?.value;
        if (!text) {
            flashButton(btn, "Paste Rank First", true);
            return;
        }

        let matchedCount = 0;
        text.split('\n').forEach(row => {
            let parts = row.split(/\t|,/); 
            if (parts.length >= 2) {
                let pName = parts[0];
                let newAdp = parts[parts.length - 1].trim(); 
                if (pName && newAdp && !isNaN(parseFloat(newAdp))) {
                    let matchedPlayer = State.players.find(p => typeof isNameMatch === 'function' ? isNameMatch(p.name, pName) : p.name.toLowerCase() === pName.toLowerCase());
                    if (matchedPlayer) { matchedPlayer.adp = parseFloat(newAdp).toFixed(1); matchedCount++; }
                }
            }
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

        let gridHTML = `<div class="draft-grid" style="grid-template-columns: repeat(${totalTeams}, minmax(64px, 1fr));">`;

                for (let t = 1; t <= totalTeams; t++) {
            let isMyCol = false;
            for (let r = 1; r <= totalRounds; r++) {
                let pNum = (r % 2 !== 0) ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                
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
            for (let t = 1; t <= totalTeams; t++) {
                let pickNum = (r % 2 !== 0) ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                let displayTeamNum = (r % 2 !== 0) ? t : (totalTeams - t + 1);

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
        let draft = getActiveDraft();
        if (!draft) return `<div style="text-align:center; color:var(--text-muted);">Select or add a draft first.</div>`;

        let myPlayersObjects = draft.myTeam.map(id => State.players.find(p => p.id === id)).filter(Boolean);
        let availablePool = [...myPlayersObjects];
        let rosterSlotsHTML = '';
        let limits = draft.limits || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6 };

                const buildSlotHTML = (label, color, p) => {
            if (p) {
                let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
                
                // 1. Grab ID and build the image tag (same logic as Draft Board)
                let playerId = p.sleeperId || p.id;
                let imgHTML = playerId && !playerId.toString().startsWith('custom_') 
                    ? `<img src="https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg" class="roster-avatar" onerror="this.style.display='none'">` 
                    : `<div class="roster-avatar placeholder"></div>`;

                return `
                <div class="roster-slot">
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
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
                        <button class="btn-sm btn-draft" style="padding: 2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                    </div>
                </div>`;
            } else {
                return `
                <div class="roster-slot empty">
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="roster-label" style="color:var(--text-muted)">${label}</span>
                        <div class="roster-avatar placeholder"></div>
                        <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                    </div>
                    <div></div>
                </div>`;
            }
        };

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let count = limits[pos] || 0;
            let color = `var(--pos-${pos.toLowerCase()}-border)`;
            for (let i = 0; i < count; i++) {
                let idx = availablePool.findIndex(p => p.posGroup === pos);
                let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
                rosterSlotsHTML += buildSlotHTML(`${pos}${i+1}`, color, p);
            }
        });

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
            let pickNum = index + 1;
            if (draft.rawDraftPicks && draft.rawDraftPicks.length > 0) {
                let match = draft.rawDraftPicks.find(r => r.player_id === p.sleeperId);
                if (match) pickNum = match.pick_no;
            }

            let valueDiff = pickNum - p.rank;
            if (valueDiff > maxDiff) { maxDiff = valueDiff; bestSteal = { player: p, diff: valueDiff }; }
            if (valueDiff < minDiff) { minDiff = valueDiff; worstReach = { player: p, diff: valueDiff }; }
        });

        // Archetype Detection
        let firstPosRound = { QB: 99, RB: 99, WR: 99, TE: 99 };
        myPlayers.forEach(p => {
            let pickNum = p.id;
            if (draft.rawDraftPicks) {
                let m = draft.rawDraftPicks.find(r => r.player_id === p.sleeperId);
                if (m) pickNum = m.pick_no;
            }
            let rd = Math.ceil(pickNum / teams);
            if (rd < firstPosRound[p.posGroup]) firstPosRound[p.posGroup] = rd;
        });

        let archetype = "Balanced Build";
        let rbCountRds12 = myPlayers.filter(p => {
            let pNum = p.id;
            if (draft.rawDraftPicks) { let m = draft.rawDraftPicks.find(r => r.player_id === p.sleeperId); if (m) pNum = m.pick_no; }
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
                gradesHTML += `<div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border); text-align: center;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${pos}</div>
                    <div style="font-size: 1.25rem; font-weight: bold; color: var(--text-muted);">—</div>
                </div>`;
                return;
            }

            let efficiencies = posPlayers.map(sp => {
                let pPick = 50; 
                if (draft.rawDraftPicks) { 
                    let m = draft.rawDraftPicks.find(r => r.player_id === sp.sleeperId); 
                    if (m) pPick = m.pick_no; 
                }
                return pPick - sp.rank; 
            });

            efficiencies.sort((a, b) => a - b);
            let mid = Math.floor(efficiencies.length / 2);
            let medianVal = efficiencies.length % 2 !== 0 ? efficiencies[mid] : (efficiencies[mid - 1] + efficiencies[mid]) / 2;

            let gInfo = getLetterGrade(medianVal);
            
            totalValSum += medianVal;
            gradeCount++;

            gradesHTML += `<div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border); text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">${pos}</div>
                <div style="font-size: 1.25rem; font-weight: bold; color: ${gInfo.color};">${gInfo.grade}</div>
            </div>`;
        });

        let overallAvg = gradeCount > 0 ? (totalValSum / gradeCount) : 0;
        let overallG = getLetterGrade(overallAvg);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(59, 130, 246, 0.1); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);">
                <div>
                    <div style="font-size: 0.75rem; color: #93c5fd; text-transform: uppercase; font-weight: 700;">Draft Archetype</div>
                    <div style="font-size: 1.05rem; font-weight: bold; color: var(--text-main);">${archetype}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: #93c5fd; text-transform: uppercase; font-weight: 700;">Overall Grade</div>
                    <div style="font-size: 1.4rem; font-weight: bold; color: ${overallG.color};">${overallG.grade}</div>
                </div>
            </div>
        `;

        if (bestSteal && bestSteal.diff > 2) {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--target-bg); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--target-border); margin-top:0.5rem;">
                <span style="display:flex; align-items:center; gap:6px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary-green);"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                    <strong>Biggest Steal:</strong> ${bestSteal.player.name} (${bestSteal.player.posDisplay})
                </span>
                <span class="badge badge-value">+${Math.abs(bestSteal.diff)} Value</span>
            </div>`;
        }

        if (worstReach && worstReach.diff < -5) {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--avoid-bg); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--avoid-border); margin-top:0.5rem;">
                <span style="display:flex; align-items:center; gap:6px;">
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
                let pickA = 0, pickB = 0;
                if (draft.rawDraftPicks) {
                    let mA = draft.rawDraftPicks.find(r => r.player_id === a.sleeperId);
                    let mB = draft.rawDraftPicks.find(r => r.player_id === b.sleeperId);
                    if (mA) pickA = mA.pick_no;
                    if (mB) pickB = mB.pick_no;
                }
                return pickA - pickB;
            });

            posPlayers.forEach(sp => {
                let pPick = 0; 
                if (draft.rawDraftPicks) { let m = draft.rawDraftPicks.find(r => r.player_id === sp.sleeperId); if (m) pPick = m.pick_no; }
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
            window.alert("Screenshot library loading. Please try again in a moment."); 
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
                onclone: (clonedDoc) => {
                    const clonedContainer = clonedDoc.getElementById('exportableTeamContainer');
                    const includeRecap = clonedDoc.getElementById('includeRecapInExport')?.checked;
                    const branding = clonedDoc.getElementById('exportBranding');
                    
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
            window.alert("Export failed. Please try again.");
        } finally {
            buttons.forEach(b => b.style.display = '');
            if (exportBtn) exportBtn.innerText = origText;
        }
    };

    function renderBoard() {
        const poolEl = document.getElementById('playerPool');
        const myTeamEl = document.getElementById('myTeamList');
        const otherEl = document.getElementById('otherDraftedList');
        const searchEl = document.getElementById('searchBar');
        const searchTerm = searchEl ? searchEl.value.toLowerCase() : "";

        let draft = getActiveDraft();
        let draftedPlayers = draft ? draft.draftedPlayers : [];
        let myTeam = draft ? draft.myTeam : [];
        let limits = draft ? draft.limits : { QB:1, RB:2, WR:3, TE:1, FLEX:1, SFLEX:0, BENCH:6, TOTAL:14 };

        let newPoolHTML = '';
        let posCounts = { "QB": 0, "RB": 0, "WR": 0, "TE": 0 };
        let totalPicksDone = draftedPlayers.length;
        let currentOverallPick = totalPicksDone + 1;
        
        let teamsInLeague = draft?.settings?.teams || 12;
        let round = Math.ceil(currentOverallPick / teamsInLeague);
        let pickInRound = currentOverallPick - ((round - 1) * teamsInLeague);
        
        const pickTrackerEl = document.getElementById('pickTracker');
        if (pickTrackerEl) pickTrackerEl.innerText = `Pick: ${round}.${pickInRound.toString().padStart(2, '0')}`;

        const trackers = getTierTrackerData();
        let trackerHTML = `<div class="badge badge-all pos-filter ${State.activePosFilter === 'ALL' ? 'active-filter' : ''}" onclick="setPosFilter('ALL')"><span>ALL</span></div>`;

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            let isActive = State.activePosFilter === pos ? 'active-filter' : '';
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
                if (State.activePosFilter !== 'ALL' && p.posGroup !== State.activePosFilter) return;

                if (p.name.toLowerCase().includes(searchTerm)) {
                    if (searchTerm === "" && p.tier !== lastTier && p.tier !== "-") {
                        newPoolHTML += `<div class="tier-divider">Tier ${p.tier}</div>`;
                        lastTier = p.tier;
                    }

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
                    
                    if (p.posGroup === 'WR' && localStorage.getItem('ds_tscore') === 'true' && typeof tScoreData !== 'undefined') {
                        const normFunc = (typeof normalizeName === 'function') ? normalizeName : (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const normName = normFunc(p.name); 
                        const tInfo = tScoreData[normName];
                        
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
                    
                    // Check if the card was expanded before the sync happened
                    let expandedClass = p.isExpanded ? " is-expanded" : "";

                    newPoolHTML += `
                        <div class="player-card${expandedClass}" style="${customStyle}" tabindex="0" role="button" aria-label="${p.rank}. ${p.name}">
                            <div class="card-grid">
                                <div class="player-info">
                                    <h4>
                                        ${p.rank}. ${p.name} 
                                        <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span> 
                                        ${rookieBadge}
                                        ${stackBadge}
                                    </h4>
                                </div>
                                
                                <div class="actions">
                                    <button class="btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)">Taken</button>
                                    <button class="btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)">My Pick</button>
                                    <button class="btn-sm btn-expand hide-on-desktop" onclick="toggleCardDetails(event, ${p.id})" aria-label="Expand details">
                                        <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </button>
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
                                                <label style="font-size:0.75rem; font-weight:bold; display:block;">Rank</label>
                                                <input type="number" id="edit-rank-val-${p.id}" value="${p.rank}" style="width:55px;">
                                            </div>
                                            <div>
                                                <label style="font-size:0.75rem; font-weight:bold; display:block;">Tier</label>
                                                <input type="text" id="edit-tier-val-${p.id}" value="${p.tier}" style="width:45px;">
                                            </div>
                                            <div>
                                                <label style="font-size:0.75rem; font-weight:bold; display:block;">Team</label>
                                                <input type="text" id="edit-team-val-${p.id}" value="${p.team}" style="width:55px;">
                                            </div>
                                            <div>
                                                <label style="font-size:0.75rem; font-weight:bold; display:block;">Bye</label>
                                                <input type="text" id="edit-bye-val-${p.id}" value="${p.bye}" style="width:45px;">
                                            </div>
                                            <div style="margin-left:auto; display:flex; gap:4px; align-self:flex-end;">
                                                <button class="btn-sm btn-mine" style="padding:0.4rem 0.8rem;" onclick="saveInlineEdit(${p.id})">Save</button>
                                                <button class="btn-sm btn-draft" style="padding:0.4rem 0.6rem;" onclick="toggleEditBar(${p.id})">Cancel</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                }
            }
        });

        if (poolEl) poolEl.innerHTML = newPoolHTML;
        if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster();

        let otherDraftedIds = draftedPlayers.filter(id => !myTeam.includes(id)).slice().reverse();
        let newOtherHTML = '';
        otherDraftedIds.forEach(id => {
            let p = State.players.find(player => player.id === id);
            if (p) {
                newOtherHTML += `
                    <div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                        <div style="color: var(--text-muted);"><strike>${p.name}</strike> <span class="badge">${p.posGroup}</span></div>
                        <button class="btn-sm btn-draft" style="padding:2px 6px;" onclick="undoDraft(${p.id})">Undo</button>
                    </div>`;
            }
        });
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
            searchBarEl.addEventListener('input', renderBoard);
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
    // --- UPDATE SHARED STORAGE ON DRAFT SWITCH ---
        // Verify 'draftSelect' matches the ID of your draft dropdown in index.html
        const draftDropdown = document.getElementById('draftSelect'); 
        if (draftDropdown) {
        }
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
