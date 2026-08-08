/**
 * Fantasy Football Draft Strategist - Core Logic & Multi-Draft Engine
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

    // --- DRAFT STATE HELPERS ---
    function getActiveDraft() {
        return State.drafts.find(d => d.draftId === State.activeDraftId) || null;
    }

    function saveActiveDraftState() {
        localStorage.setItem('ds_drafts', JSON.stringify(State.drafts));
        localStorage.setItem('ds_active_draft_id', State.activeDraftId || '');
        renderBoard();
        renderDraftMatrix();
        renderDraftRecap();
    }

    function refreshDraftDropdown() {
        const select = document.getElementById('draftProfileSelect');
        if (!select) return;
        if (State.drafts.length === 0) {
            select.innerHTML = `<option value="">No Drafts</option>`;
            return;
        }
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
            initSettingsUI();
            
            // If active draft is manual, stop auto-sync
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
    function flashButton(btn, text, isError = false, fallbackText = null) {
        if (!btn) return;
        const originalText = fallbackText || btn.innerText;
        const originalBg = btn.style.backgroundColor;

        btn.innerText = text;
        btn.style.backgroundColor = isError ? "var(--error-color, #ea4335)" : "var(--success-color, #4ade80)";
        btn.style.color = isError ? "white" : "var(--bg-main, #0b132b)";

        setTimeout(() => {
            btn.innerText = originalText;
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

    // --- INITIALIZE SETTINGS INPUTS ---
    function initSettingsUI() {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        let draft = getActiveDraft();

        setVal('sleeperUsername', draft && draft.username !== "Manual" ? draft.username : (localStorage.getItem('ds_username') || ""));
        setVal('sleeperDraftId', draft && !draft.draftId.startsWith('manual_') ? draft.draftId : (localStorage.getItem('ds_draftId') || ""));
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
    }

    function updateTotalRounds() {
        const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
        const total = getNum('limitQB') + getNum('limitRB') + getNum('limitWR') + getNum('limitTE') + getNum('limitFLEX') + getNum('limitSFLEX') + getNum('limitBENCH');
        const roundsEl = document.getElementById('leagueRounds');
        if (roundsEl) roundsEl.value = total;
    }

    ['limitQB', 'limitRB', 'limitWR', 'limitTE', 'limitFLEX', 'limitSFLEX', 'limitBENCH'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateTotalRounds);
    });

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

            const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
            if (!draftRes.ok) throw new Error("Could not fetch Draft ID details.");
            const dInfo = await draftRes.json();

            // Fetch official League Name if linked
            let draftName = document.getElementById('newDraftName')?.value.trim() || "";
            if (!draftName && dInfo.league_id) {
                try {
                    const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${dInfo.league_id}`);
                    if (leagueRes.ok) draftName = (await leagueRes.json()).name;
                } catch (e) { console.warn("Could not fetch league name", e); }
            }
            if (!draftName) draftName = dInfo.metadata?.name || `Sleeper Draft ${draftId}`;

            let draftSettings = {
                teams: dInfo.settings?.teams || 12,
                rounds: dInfo.settings?.rounds || 15
            };

            let draftLimits = {
                QB: dInfo.settings?.slots_qb || 1,
                RB: dInfo.settings?.slots_rb || 2,
                WR: dInfo.settings?.slots_wr || 3,
                TE: dInfo.settings?.slots_te || 1,
                FLEX: dInfo.settings?.slots_flex || 1,
                SFLEX: dInfo.settings?.slots_super_flex || 0,
                BENCH: dInfo.settings?.slots_bn || 6,
            };
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
                        matchedPlayer = State.players.find(p => p.name.toLowerCase() === fullName.toLowerCase());
                    }

                    if (matchedPlayer) {
                        sleeperDrafted.push(matchedPlayer.id);
                        if (pick.picked_by === userId) sleeperMyTeam.push(matchedPlayer.id);
                    }
                });
            }

            let draftObj = {
                draftId: draftId,
                name: draftName,
                username: username,
                settings: draftSettings,
                limits: draftLimits,
                draftedPlayers: Array.from(new Set(sleeperDrafted)),
                myTeam: Array.from(new Set(sleeperMyTeam)),
                rawDraftPicks: picksData || [],
                totalPicks: picksData ? picksData.length : 0
            };

            let existingIdx = State.drafts.findIndex(d => d.draftId === draftId);
            if (existingIdx !== -1) State.drafts[existingIdx] = draftObj;
            else State.drafts.push(draftObj);

            State.activeDraftId = draftId;
            saveActiveDraftState();

            const nameInput = document.getElementById('newDraftName');
            if (nameInput) nameInput.value = "";
            refreshDraftDropdown();
            initSettingsUI();

            if (!isSilent && btn) flashButton(btn, "Sync Complete!");
        } catch (err) {
            console.error(err);
            if (!isSilent && btn) flashButton(btn, "Sync Failed", true);
            if (!isSilent) window.alert(`Sleeper Sync Error:\n${err.message}`);
        }
    }

    window.addAndSyncSleeperDraft = function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim();
        const draftId = document.getElementById('sleeperDraftId')?.value.trim();
        if (!username || !draftId) {
            window.alert("Please enter both Username and Draft ID.");
            return;
        }
        processSleeperDraftData(username, draftId, btn, false);
    };

    window.handleSmartSync = function() {
        if (State.autoSyncTimer) {
            window.toggleAutoSync(false);
            const toggleEl = document.getElementById('autoSyncToggle');
            if (toggleEl) toggleEl.checked = false;
        } else {
            let draft = getActiveDraft();
            if (draft && draft.username !== "Manual") {
                processSleeperDraftData(draft.username, draft.draftId, document.getElementById('headerSyncBtn'), false);
            } else {
                window.alert("Please select or sync a Sleeper draft first.");
            }
        }
    };

    window.toggleAutoSync = function(isLive) {
        const syncWrap = document.getElementById('syncIconWrap');
        const liveWrap = document.getElementById('liveIconWrap');
        
        if (isLive) {
            let draft = getActiveDraft();
            if (!draft || draft.username === "Manual") {
                window.alert("Live Auto-Sync only works with Sleeper drafts.");
                const toggleEl = document.getElementById('autoSyncToggle');
                if (toggleEl) toggleEl.checked = false;
                return;
            }
            if (syncWrap) syncWrap.style.display = 'none';
            if (liveWrap) liveWrap.style.display = 'flex';
            
            processSleeperDraftData(draft.username, draft.draftId, null, true);
            State.autoSyncTimer = setInterval(() => {
                let curDraft = getActiveDraft();
                if (curDraft && curDraft.username !== "Manual") {
                    processSleeperDraftData(curDraft.username, curDraft.draftId, null, true);
                }
            }, 1500);
        } else {
            if (syncWrap) syncWrap.style.display = 'flex';
            if (liveWrap) liveWrap.style.display = 'none';
            if (State.autoSyncTimer) clearInterval(State.autoSyncTimer);
        }
    };

    window.draftPlayer = function(id, isMine) {
        let draft = getActiveDraft();
        if (!draft) { window.alert("Please add or select a draft profile first."); return; }
        if (!draft.draftedPlayers.includes(id)) {
            draft.draftedPlayers.push(id);
            if (isMine) draft.myTeam.push(id);
            saveActiveDraftState();
        }
    };

    window.undoDraft = function(id) {
        let draft = getActiveDraft();
        if (!draft) return;
        draft.draftedPlayers = draft.draftedPlayers.filter(pId => pId !== id);
        draft.myTeam = draft.myTeam.filter(pId => pId !== id);
        saveActiveDraftState();
    };

    // --- INITIALIZATION ---
    window.onload = function() {
        initSettingsUI();
        updateMetaDisplay();
        refreshDraftDropdown();

        if (State.drafts.length > 0 && !State.activeDraftId) {
            State.activeDraftId = State.drafts[0].draftId;
        }
        if (State.activeDraftId) {
            const select = document.getElementById('draftProfileSelect');
            if (select) select.value = State.activeDraftId;
            initSettingsUI();
        }
        if (State.players.length > 0) renderBoard();
        window.showTab('setup');
    };

    // --- RENDER DRAFT MATRIX & RECAP ---
    function renderDraftMatrix() {
        const container = document.getElementById('draftMatrixContainer');
        if (!container) return;

        let draft = getActiveDraft();
        if (!draft) {
            container.innerHTML = `<div class="empty-state-card"><p>Select or create a draft on Setup to view the grid.</p></div>`;
            return;
        }

        let totalTeams = draft.settings?.teams || 12;
        let totalRounds = draft.settings?.rounds || 15;

        let gridHTML = `<div class="draft-grid" style="grid-template-columns: repeat(${totalTeams}, minmax(78px, 1fr));">`;

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
            gridHTML += `<div class="draft-col-header ${isMyCol ? 'mine' : ''}">T${t}</div>`;
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

                    cellContent = `
                        <div class="draft-cell-first" title="${pName}">${firstName}</div>
                        <div class="draft-cell-last" title="${pName}">${lastName}</div>
                    `;
                }

                gridHTML += `<div class="${cellClass}">${cellContent}</div>`;
            }
        }

        gridHTML += `</div>`;
        container.innerHTML = gridHTML;
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
                return `
                <div class="roster-slot">
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="roster-label" style="color:${color}">${label}</span>
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

        return rosterSlotsHTML;
    }

    function renderDraftRecap() {
        const recapCard = document.getElementById('draftRecapCard');
        const recapContent = document.getElementById('draftRecapContent');
        if (!recapCard || !recapContent) return;

        let draft = getActiveDraft();
        if (!draft) { recapCard.style.display = 'none'; return; }

        let totalRequired = draft.limits?.TOTAL || 14;
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

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(59, 130, 246, 0.1); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);">
                <div>
                    <div style="font-size: 0.75rem; color: #93c5fd; text-transform: uppercase; font-weight: 700;">Active Draft</div>
                    <div style="font-size: 1.05rem; font-weight: bold; color: var(--text-main);">${draft.name}</div>
                </div>
            </div>
        `;

        if (bestSteal && bestSteal.diff > 2) {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--target-bg); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--target-border); margin-top:0.5rem;">
                <span><strong>Biggest Steal:</strong> ${bestSteal.player.name} (${bestSteal.player.posDisplay})</span>
                <span class="badge badge-value">+${Math.abs(bestSteal.diff)} Value</span>
            </div>`;
        }

        recapContent.innerHTML = html;
    }

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

        State.players.forEach(p => {
            const isDrafted = draftedPlayers.includes(p.id);
            const isMine = myTeam.includes(p.id);

            if (isMine && posCounts[p.posGroup] !== undefined) posCounts[p.posGroup]++;

            if (!isDrafted) {
                if (State.activePosFilter !== 'ALL' && p.posGroup !== State.activePosFilter) return;

                if (p.name.toLowerCase().includes(searchTerm)) {
                    let diff = currentOverallPick - p.rank;
                    let valueBadgeHTML = diff > 0 ? ` | <span class="badge badge-value">+${diff} Value</span>` : diff < 0 ? ` | <span class="badge badge-reach">${diff} Reach</span>` : ` | <span class="badge" style="background:#3a506b;">At Rank</span>`;
                    
                    newPoolHTML += `
                        <div class="player-card">
                            <div class="player-card-main">
                                <div class="player-info">
                                    <h4>${p.rank}. ${p.name} <span class="badge pos-badge ${p.posGroup}">${p.posDisplay}</span></h4>
                                    <div class="player-stats">${p.team} | Bye: ${p.bye}${valueBadgeHTML}</div>
                                </div>
                                <div class="actions">
                                    <button class="btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)">Taken</button>
                                    <button class="btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)">My Pick</button>
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

        const limitsBodyEl = document.getElementById('limitsBody');
        if (limitsBodyEl) {
            limitsBodyEl.innerHTML = `
                <tr>
                    <td>${posCounts['QB']} / ${limits.QB}</td>
                    <td>${posCounts['RB']} / ${limits.RB}</td>
                    <td>${posCounts['WR']} / ${limits.WR}</td>
                    <td>${posCounts['TE']} / ${limits.TE}</td>
                    <td>0 / ${limits.FLEX}</td>
                    <td>0 / ${limits.SFLEX}</td>
                    <td><strong>${myTeam.length} / ${limits.TOTAL}</strong></td>
                </tr>`;
        }

        renderDraftMatrix();
        renderDraftRecap();
    }

    const searchBarEl = document.getElementById('searchBar');
    if (searchBarEl) searchBarEl.addEventListener('input', renderBoard);

})();
