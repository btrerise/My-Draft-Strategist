// Moved from js/mds.js in refactor chunk 2A:
// SLEEPER & MANUAL DRAFT CREATION LOGIC, the session cache for
// Sleeper's draft metadata, and the live-sync status pill and toggle.
import { savePlayerPool } from './storage.js';
import { BYE_WEEKS_2026, State, getActiveDraft, refreshDraftDropdown, saveActiveDraftState, saveAndRenderDraftState } from './state.js';
import { initSettingsUI } from './settings.js';
import { renderBoard } from './legacy.js';

    // --- SLEEPER & MANUAL DRAFT CREATION LOGIC ---
    export const createManualDraft = function() {
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
                K: parseInt(getVal('limitK')) || 1,
                DEF: parseInt(getVal('limitDEF')) || 1,
                BENCH: parseInt(getVal('limitBENCH')) || 5,
                TOTAL: 15
            },
            // No inline `players` -- a new manual draft still starts from whatever rankings are
            // currently loaded, but that pool is written to its own ds_players_<draftId> key by
            // the savePlayerPool() call below instead of being embedded here. (Leaving it
            // embedded would still have worked, via saveActiveDraftState's rescue path for
            // v1-format drafts, but that path exists for deferred migrations -- routing a
            // routine "create a draft" through it would mean building the copy and then
            // immediately re-serializing it to move it back out.)
            draftedPlayers: [],
            myTeam: [],
            rawDraftPicks: [],
            totalPicks: 0,
            queue: []
        };

        State.drafts.push(newDraft);
        State.activeDraftId = newId;
        // After activeDraftId is set, so the pool lands under the NEW draft's key.
        savePlayerPool();
        saveAndRenderDraftState();

        if (nameInput) nameInput.value = "";
        refreshDraftDropdown();
        initSettingsUI();
        if (window.showToast) window.showToast(`Manual Draft '${draftName}' created!`);
    };

    // --- SESSION CACHE FOR SLEEPER'S STATIC DRAFT METADATA ---
    // The live-draft poll calls processSleeperDraftData every 3 seconds, and that function
    // hits FIVE endpoints: user, draft, league, league users, and picks. Only the last one
    // actually changes while a draft is running -- your user id, the draft's team/round
    // settings, the league's roster positions and the league's member list are all fixed for
    // the duration. Re-fetching them 20 times a minute was ~80 redundant requests per minute
    // against Sleeper's rate limit, and four extra round-trips of latency on every tick.
    //
    // Keyed by URL, so switching drafts or usernames simply misses and fetches fresh. Session
    // -only (a plain Map, not localStorage): this is about not re-asking within one sitting,
    // not about persisting anything.
    const _sleeperMetaCache = new Map();

    // `force` bypasses and overwrites the cache -- passed for any sync the person triggered
    // themselves, so an explicit "Sync" button press is always a genuine refresh and gives
    // them a way to pick up a mid-session change (a renamed team, a newly-set draft order).
    //
    // `shouldCache` guards against freezing an incomplete answer for the whole session. A
    // draft fetched before its order is set has a null draft_order, and a league whose members
    // haven't loaded returns an empty array; caching either would mean the column headers
    // never appear no matter how long the poll ran. Returning them uncached lets the next tick
    // try again, which is exactly the old behavior for those cases.
    async function fetchSleeperMeta(url, { force = false, required = false, errorMsg = '', shouldCache = () => true } = {}) {
        if (!force && _sleeperMetaCache.has(url)) return _sleeperMetaCache.get(url);

        // mdsFetch, so a tick of the 3s live-draft poll can't hang forever. A timed-out
        // request throws, which is what lets processSleeperDraftData's catch count the miss
        // and flip the LIVE pill to "stalled" -- a hung fetch never reached that code at all.
        const res = await window.mdsFetch(url);
        if (!res.ok) {
            if (required) throw new Error(errorMsg);
            return null;
        }
        const data = await res.json();
        if (shouldCache(data)) _sleeperMetaCache.set(url, data);
        return data;
    }

    async function processSleeperDraftData(username, draftId, btn, isSilent = false) {
        let originalBtnHTML = null;
        // A silent call is the 3s poll; anything else is the person asking for a sync.
        const forceMeta = !isSilent;
        
        // 1. Capture the original button state and apply the loading spinner
        if (!isSilent && btn) {
            originalBtnHTML = btn.innerHTML;
            btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" class="sync-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Syncing…</span>`;
            btn.style.pointerEvents = 'none'; // Prevents double-clicks while loading
            btn.style.opacity = '0.8';
        }

        try {
            const userData = await fetchSleeperMeta(`https://api.sleeper.app/v1/user/${username}`, {
                force: forceMeta, required: true, errorMsg: "Could not find Sleeper User.",
                shouldCache: (d) => !!(d && d.user_id)
            });
            const userId = userData.user_id;
            const dInfo = await fetchSleeperMeta(`https://api.sleeper.app/v1/draft/${draftId}`, {
                force: forceMeta, required: true, errorMsg: "Could not fetch Draft ID details.",
                // Don't freeze a draft whose order hasn't been set yet -- draft_order arrives
                // later and is what draftSlotNames (the grid's column headers) is built from.
                shouldCache: (d) => !!(d && d.draft_order)
            });
            let draftName = document.getElementById('newDraftName')?.value.trim() || "";
            let fetchedLeague = null;
            let draftSlotNames = {}; // NEW: Store our mapped team names

            if (dInfo.league_id) {
                let currentUsername = document.getElementById('sleeperUsername')?.value.trim() || username || draftName || "";
                
                try {
                    fetchedLeague = await fetchSleeperMeta(`https://api.sleeper.app/v1/league/${dInfo.league_id}`, {
                        force: forceMeta, shouldCache: (d) => !!(d && d.roster_positions)
                    });
                    if (fetchedLeague && !draftName) draftName = fetchedLeague.name;

                    // NEW: Fetch league users to map to the draft board columns
                    const leagueUsers = await fetchSleeperMeta(`https://api.sleeper.app/v1/league/${dInfo.league_id}/users`, {
                        force: forceMeta, shouldCache: (d) => Array.isArray(d) && d.length > 0
                    });
                    if (leagueUsers) {
                        // dInfo.draft_order maps user_id to slot number (e.g., {"12345": 1})
                        if (dInfo.draft_order) {
                            // Indexed rather than scanned per slot -- this is a small list, but
                            // the lookup was inside the loop over every draft slot.
                            const userById = new Map(leagueUsers.map(u => [u.user_id, u]));
                            for (const [uid, slot] of Object.entries(dInfo.draft_order)) {
                                let user = userById.get(uid);
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

            const picksRes = await window.mdsFetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
            if (!picksRes.ok) throw new Error("Could not fetch Draft ID picks.");
            const picksData = await picksRes.json();

            // Sleeper answered, so this tick is healthy -- a tick that finds no new picks
            // still means we're hearing from them, which is exactly what the LIVE pill is
            // claiming. Stamped here rather than at the end of the try because the common
            // outcome of a good poll is the unchanged-silent-tick early return further down.
            State.lastLiveSyncAt = Date.now();
            State.liveSyncFailStreak = 0;
            if (typeof window.renderLiveSyncStatus === 'function') window.renderLiveSyncStatus();

            let sleeperDrafted = [];
            let sleeperMyTeam = [];

            if (picksData && picksData.length > 0) {
                // Two indexes over the player pool, built once for the whole picks loop. This
                // loop runs on every sync that found a new pick, and each iteration used to
                // scan the entire pool by sleeperId -- O(picks x players), which at pick 180
                // of a 600-player pool is over 100k comparisons per tick and grows as the
                // draft goes on.
                //
                // The name index is keyed on normalizeName rather than searched with
                // isNameMatch, because isNameMatch IS normalizeName on both sides plus an
                // alias check, and normalizeName already applies that same alias map -- so a
                // normalized-key lookup resolves exactly the pairs the linear scan did. New
                // players synthesized below are added to both indexes so a later pick for the
                // same player still finds them, matching the old scan's behavior (it saw
                // State.players grow as it went).
                const bySleeperId = new Map();
                const byCleanName = new Map();
                const normFn = (typeof normalizeName === 'function') ? normalizeName : (s) => String(s || '').toLowerCase();
                State.players.forEach(p => {
                    if (p.sleeperId !== undefined && p.sleeperId !== null && !bySleeperId.has(p.sleeperId)) bySleeperId.set(p.sleeperId, p);
                    const clean = normFn(p.name);
                    if (clean && !byCleanName.has(clean)) byCleanName.set(clean, p);
                });

                picksData.forEach(pick => {
                    let matchedPlayer = bySleeperId.get(pick.player_id);

                    // Fallback 1: Try matching by name if ID fails
                    if (!matchedPlayer && pick.metadata) {
                        let fullName = `${pick.metadata.first_name} ${pick.metadata.last_name}`;
                        matchedPlayer = byCleanName.get(normFn(fullName));
                    }

                    // Fallback 2: Player genuinely isn't in the uploaded rankings. Create them on the fly.
                    if (!matchedPlayer && pick.metadata && pick.player_id) {
                        let posGroup = pick.metadata.position || "UNK";
                        if (['DST', 'D/ST', 'DEFENSE', 'D'].includes(posGroup)) posGroup = 'DEF';
                        if (['PK'].includes(posGroup)) posGroup = 'K';
                        
                        let pTeam = pick.metadata.team || "FA";
                        let pBye = BYE_WEEKS_2026[pTeam] || "-";

                        let pName = `${pick.metadata.first_name} ${pick.metadata.last_name}`.trim() || "Unknown Player";
                        
                        // Clean up Defense names (Sleeper sometimes passes "Chiefs" as first name with no last name)
                        if (posGroup === 'DEF' && pick.metadata.first_name && !pick.metadata.last_name) {
                            pName = pick.metadata.first_name + " D/ST";
                        }

                        matchedPlayer = {
                            id: Date.now() + Math.floor(Math.random() * 100000), // Generate unique internal ID
                            sleeperId: pick.player_id,
                            rank: 999, // Flag as unranked
                            name: pName,
                            posGroup: posGroup,
                            posDisplay: posGroup, 
                            tier: "-",
                            team: pTeam,
                            bye: pBye,
                            adp: "-",
                            isRookie: false,
                            injury: null
                        };
                        
                        State.players.push(matchedPlayer);
                        // Keep the lookup indexes in step with the pool they index, so a later
                        // pick referring to this same player resolves to the object we just
                        // created instead of synthesizing a second copy of him. The previous
                        // linear scan got this for free by re-scanning a growing State.players
                        // on every iteration.
                        if (matchedPlayer.sleeperId !== undefined && matchedPlayer.sleeperId !== null && !bySleeperId.has(matchedPlayer.sleeperId)) {
                            bySleeperId.set(matchedPlayer.sleeperId, matchedPlayer);
                        }
                        const newClean = normFn(matchedPlayer.name);
                        if (newClean && !byCleanName.has(newClean)) byCleanName.set(newClean, matchedPlayer);
                        State._needsPlayerSave = true; // Flag to save the database later
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

            // Did this sync actually change anything? During a live draft the 3s poll below
            // calls this function 20 times a minute, and on the large majority of those ticks
            // nobody has picked since the last one -- the response is byte-for-byte what we
            // already have. A full repaint of the pool, grid and recap for an identical board
            // is pure waste, and it lands precisely when the person is under a pick clock.
            //
            // Pick count is the signal: Sleeper's picks array only ever grows during a draft,
            // so a changed length means a new pick and an identical length means nothing
            // happened. Deliberately NOT a deep comparison -- that would cost more than the
            // render it's trying to avoid. A manual (non-Sleeper) pick made in this tool
            // between ticks renders through its own draftPlayer() call, not this one.
            let picksChanged = !existingDraft || (existingDraft.totalPicks || 0) !== (picksData ? picksData.length : 0);

            // Nothing new on a silent tick: stop here, before rebuilding draftObj, replacing
            // this draft in State.drafts, saving and repainting. Everything below would
            // reproduce what State already holds, by definition of picksChanged. A
            // user-initiated sync (isSilent === false) never takes this path
            // -- it always runs through and refreshes settings, limits and slot names, since
            // those CAN change without the pick count moving.
            //
            // _needsPlayerSave vetoes the shortcut: the picks loop above synthesizes players
            // who aren't in the uploaded rankings, and that flag means one was created and
            // hasn't been written to ds_players yet. Bailing out with it still pending would
            // leave a player who exists in memory but not on disk, so let the full path run
            // and flush him. In practice this is rare -- the tick that first sees his pick has
            // a changed pick count anyway -- but it costs one comparison to be certain.
            if (!picksChanged && isSilent && !State._needsPlayerSave) return;

                        let draftObj = {
                draftId: draftId,
                leagueId: dInfo.league_id || null,
                name: draftName,
                username: username,
                settings: draftSettings,
                limits: draftLimits,
                // No `players` here any more: this object is rebuilt and re-serialized on
                // every sync that finds a pick, and embedding the whole pool in it was the
                // other half of what made ds_drafts so expensive to write. The pool lives
                // under its own key and is saved by savePlayerPool() below when a player is
                // actually added -- see the storage notes at the top of this file.
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
            
            // If we generated unranked players on the fly, save the updated master list
            if (State._needsPlayerSave) {
                savePlayerPool();
                delete State._needsPlayerSave;
            }
            
            // Reached only when there's genuinely something new, or when the person asked for
            // this sync themselves -- the unchanged-silent-tick case returned above, which is
            // what keeps a board nobody has touched from being re-saved and repainted 20 times
            // a minute. The save itself is now cheap (ds_drafts no longer carries the player
            // pools -- see the storage notes at the top of this file), so what's being avoided
            // here is mostly the full repaint of the pool, grid and recap.
            saveActiveDraftState();
            renderBoard();

            if (!isSilent) {
                const nameInput = document.getElementById('newDraftName');
                if (nameInput) nameInput.value = "";
                refreshDraftDropdown();
                initSettingsUI();
                
                // 2. Restore pointer events and pass the original HTML to the success flash
                if (btn) {
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                    flashButton(btn, "Sync Complete!", false, originalBtnHTML);
                }
            }
            
        } catch (err) {
            console.error(err);

            // Every branch below is gated on !isSilent, so a failed tick of the 3s live-draft
            // poll used to be a console.error and nothing else: the 🔴 LIVE pill kept pulsing
            // while the board silently stopped updating -- a false "I'm live" signal at the
            // worst possible moment. Count the misses instead, and let the pill flip to amber
            // "LIVE · stalled" with the last good sync time once there have been enough of
            // them. The timer is deliberately left running: a rate limit or a dropped
            // connection clears on its own, and killing the poll turns a blip into a dead board.
            State.liveSyncFailStreak = (State.liveSyncFailStreak || 0) + 1;
            if (typeof window.renderLiveSyncStatus === 'function') window.renderLiveSyncStatus();

            // 3. Restore pointer events and pass the original HTML to the error flash
            if (!isSilent && btn) {
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
                flashButton(btn, "Sync Failed", true, originalBtnHTML);
            }
            if (!isSilent && window.showToast) window.showToast(`Sleeper Sync Error:\n${err.message}`, { isError: true });
        }
    }

    export const addAndSyncSleeperDraft = function(btn) {
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

    export const handleSmartSync = function() {
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

    // How many silent ticks have to fail back to back before the pill stops claiming to be
    // live. One miss is normal -- Sleeper rate-limits and phone connections blip -- but two
    // in a row is ~6s of a board that isn't moving while the dot keeps pulsing.
    const LIVE_STALL_THRESHOLD = 2;

    function formatClockTime(ts) {
        if (!ts) return "";
        try {
            return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch (e) {
            return new Date(ts).toLocaleTimeString();
        }
    }

    // The header LIVE pill was a bare pulsing dot with no timestamp, so it said exactly the
    // same thing whether picks were streaming in or the poll had been failing for a minute.
    // This makes it report the poll's actual state: live, or amber "LIVE · stalled" stamped
    // with the last tick that came back from Sleeper.
    // Last state written to #liveSyncAnnouncer ('off' | 'live' | 'stalled'), so the announcer
    // only speaks on a transition, not on every 3s tick.
    let lastAnnouncedSyncState = 'off';

    export const renderLiveSyncStatus = function() {
        const liveWrap = document.getElementById('liveIconWrap');
        if (!liveWrap) return;

        const label = document.getElementById('liveStatusLabel');
        const stamp = document.getElementById('liveStatusStamp');
        const syncBtn = document.getElementById('headerSyncBtn');

        const isLive = !!State.autoSyncTimer;
        const isStalled = isLive && (State.liveSyncFailStreak || 0) >= LIVE_STALL_THRESHOLD;
        const lastAt = formatClockTime(State.lastLiveSyncAt);

        // Writes are guarded on an actual change: this runs on every successful tick, so
        // the DOM isn't rewritten 20 times a minute. Screen reader announcements go through
        // #liveSyncAnnouncer below, and only when the state actually changes.
        const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

        liveWrap.classList.toggle('is-stalled', isStalled);
        setText(label, isStalled ? 'LIVE · stalled' : 'LIVE');
        // The stamp only earns its space in the header when something is wrong; while the
        // poll is healthy the same time lives in the button's tooltip.
        setText(stamp, isStalled && lastAt ? `Last pick sync: ${lastAt}` : '');

        if (syncBtn) {
            syncBtn.classList.toggle('is-stalled', isStalled);
            const stampNote = lastAt ? ` Last pick sync: ${lastAt}.` : '';
            let title;
            if (!isLive) {
                title = "Manual Sync (or click to stop Live Sync)";
            } else if (isStalled) {
                title = `Can't reach Sleeper — the board may be out of date. Still retrying every 3s.${stampNote} Click to stop Live Sync.`;
            } else {
                title = `Live Sync is on.${stampNote} Click to stop Live Sync.`;
            }
            if (syncBtn.title !== title) syncBtn.title = title;

            // The visible "Sync" text is hidden on mobile, so the button needs its own name.
            let ariaLabel;
            if (!isLive) {
                ariaLabel = 'Sync draft now';
            } else if (isStalled) {
                ariaLabel = "Live sync stalled, can't reach Sleeper. Click to stop";
            } else {
                ariaLabel = 'Live sync on, click to stop';
            }
            if (syncBtn.getAttribute('aria-label') !== ariaLabel) syncBtn.setAttribute('aria-label', ariaLabel);
        }

        const syncState = !isLive ? 'off' : (isStalled ? 'stalled' : 'live');
        if (syncState !== lastAnnouncedSyncState) {
            const announcer = document.getElementById('liveSyncAnnouncer');
            if (announcer) {
                let msg;
                if (syncState === 'stalled') {
                    msg = `Live sync stalled. Can't reach Sleeper, still retrying.${lastAt ? ` Last pick sync ${lastAt}.` : ''}`;
                } else if (syncState === 'live') {
                    msg = lastAnnouncedSyncState === 'stalled' ? 'Live sync recovered.' : 'Live sync on.';
                } else {
                    msg = 'Live sync off.';
                }
                announcer.textContent = msg;
            }
            lastAnnouncedSyncState = syncState;
        }
    };

    export const toggleAutoSync = function(isLive, sourceToggle = null) {
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

            // Fresh start: whatever went wrong before this toggle shouldn't have the pill
            // opening in the stalled state.
            State.liveSyncFailStreak = 0;

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
            // After the timer exists, so the pill reads as live rather than idle.
            window.renderLiveSyncStatus();

        } else {
            // Stop Sync & Revert UI
            if (syncWrap) syncWrap.style.display = 'flex';
            if (liveWrap) liveWrap.style.display = 'none';
            if (syncBtn) syncBtn.classList.remove('is-live'); 
            
            if (State.autoSyncTimer) {
                clearInterval(State.autoSyncTimer);
                State.autoSyncTimer = null;
            }

            // Drop the stalled styling with the timer, so turning Live Sync back on doesn't
            // inherit an amber button from the last session.
            State.liveSyncFailStreak = 0;
            window.renderLiveSyncStatus();
        }
    };
