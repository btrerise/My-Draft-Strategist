/**
 * Fantasy Football Draft Strategist - Core Logic & Multi-Draft Engine
 * Merged with Custom UI/UX Features (T-Scores, Tiers, Inline Edits, Export)
 */

// What's left of js/mds.js. Refactor chunk 2A renamed it to js/mds/legacy.js, dropped the IIFE
// and moved everything above RENDER DRAFT MATRIX into the other js/mds/ modules; 2B empties it.
// The import order below sets the order in which the modules' load-time code runs: it matches
// the order that code had in mds.js. state.js must come before storage.js (see storage.js).
import { escapeHtml } from './compat.js';
import { State, ensureDefaultDraft, getActiveDraft, refreshDraftDropdown } from './state.js';
import { savePlayerPool } from './storage.js';
import './pwa.js';
import { debounce } from './ui.js';
import './gestures.js';
import { initSettingsUI, updateMetaDisplay, updateTotalRounds } from './settings.js';
import './backup.js';
import './sleeperSync.js';
import './queue.js';
import './import.js';
import './market.js';

    // Reads and parses the three call-out lists ONCE, for a caller that is about to style many
    // player cards. getCallOutStyle below used to do this itself on every single call -- and
    // it's called once per player card from buildPlayerCardHTML -- so rendering a 600-player
    // pool meant 1,800 synchronous localStorage reads and 1,800 throwaway arrays, on a
    // function wired to a debounced keystroke handler. The lists are identical for every card
    // in a given render, so this is pure repeated work with no per-player input.
    function getCallOutLists() {
        const parse = (key) => (localStorage.getItem(key) || "")
            .split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        return { targets: parse('ds_targets'), avoids: parse('ds_avoids'), darts: parse('ds_darts') };
    }

    // `lists` is optional purely so the handful of one-off callers outside a render loop can
    // keep calling this with just a name; inside a loop, hoist getCallOutLists() out and pass
    // it in. Matching order (targets, then avoids, then darts) is unchanged.
    function getCallOutStyle(playerName, lists) {
        let n = playerName.toLowerCase();
        const { targets, avoids, darts } = lists || getCallOutLists();

        if (targets.some(t => n.includes(t))) return `border-left: 5px solid var(--target-border); background-color: var(--target-bg);`;
        if (avoids.some(a => n.includes(a))) return `border-left: 5px solid var(--avoid-border); background-color: var(--avoid-bg);`;
        if (darts.some(d => n.includes(d))) return `border-left: 5px solid var(--dart-border); background-color: var(--dart-bg);`;
        return '';
    }

    // `draftedSet` is optional: renderBoard already builds one for its own loop and passes it
    // in, which avoids re-deriving it here. Without it this filtered the whole player pool
    // with drafted.includes(), i.e. O(players x drafted) -- ~120k comparisons deep into a
    // real draft, on every render.
    function getTierTrackerData(draftedSet) {
        let draft = getActiveDraft();
        let drafted = draftedSet || new Set(draft ? draft.draftedPlayers : []);
        let trackers = { QB: null, RB: null, WR: null, TE: null, K: null, DEF: null };

        // Single pass over the pool tracking the best (lowest) live tier per position and how
        // many players share it, rather than filtering the pool once per position and then
        // walking each position's slice three more times (min, spread into Math.min, count).
        State.players.forEach(p => {
            if (drafted.has(p.id)) return;
            if (p.tier === "-") return;
            const t = trackers[p.posGroup];
            if (t === undefined) return; // position outside the six tracked here
            const tier = parseInt(p.tier) || 99;
            if (t === null || tier < t.tier) trackers[p.posGroup] = { tier: tier, count: 1 };
            else if (tier === t.tier) t.count++;
        });
        return trackers;
    }

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

        // Three indexes built once for the whole grid. Both loops below visit every cell
        // (teams x rounds, e.g. 180), and each cell previously ran rawDraftPicks.find() by
        // pick number AND State.players.find() by sleeperId AND myTeam.includes() -- so a
        // single grid render cost on the order of a quarter-million comparisons, and it ran
        // twice per mutation and on every search keystroke via renderBoard's tail.
        // First entry wins throughout, matching the .find() calls these replace -- relevant if
        // the pool ever ends up holding two entries for one sleeperId (the sync path can
        // synthesize players for picks it can't match against the rankings).
        const hasRawPicks = !!(draft.rawDraftPicks && draft.rawDraftPicks.length > 0);
        const pickByNumber = new Map();
        if (hasRawPicks) draft.rawDraftPicks.forEach(p => { if (!pickByNumber.has(p.pick_no)) pickByNumber.set(p.pick_no, p); });
        const playerBySleeperId = new Map();
        const playerById = new Map();
        State.players.forEach(p => {
            if (p.sleeperId !== undefined && p.sleeperId !== null && !playerBySleeperId.has(p.sleeperId)) playerBySleeperId.set(p.sleeperId, p);
            if (!playerById.has(p.id)) playerById.set(p.id, p);
        });
        const myTeamSet = new Set(draft.myTeam || []);

        let gridHTML = `<div class="draft-grid" style="--num-teams: ${totalTeams}; grid-template-columns: repeat(${totalTeams}, minmax(64px, 1fr));">`;

            for (let t = 1; t <= totalTeams; t++) {
            let isMyCol = false;
            for (let r = 1; r <= totalRounds; r++) {
                // --- 3RR MATH FIX START ---
                let isOddLogic = (r % 2 !== 0);
                if (is3RR && r >= 3) { isOddLogic = !isOddLogic; }
                let pNum = isOddLogic ? ((r - 1) * totalTeams) + t : (r * totalTeams) - (t - 1);
                // --- 3RR MATH FIX END ---

                if (hasRawPicks) {
                    let matched = pickByNumber.get(pNum);
                    if (matched) {
                        let pl = playerBySleeperId.get(matched.player_id);
                        if (pl && myTeamSet.has(pl.id)) { isMyCol = true; break; }
                    }
                } else {
                    let manualPId = draft.draftedPlayers[pNum - 1];
                    if (manualPId && myTeamSet.has(manualPId)) { isMyCol = true; break; }
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

                if (hasRawPicks) {
                    let matchedPick = pickByNumber.get(pickNum);
                    if (matchedPick) {
                        pObj = playerBySleeperId.get(matchedPick.player_id);
                        pName = pObj ? pObj.name : (matchedPick.metadata?.first_name?.[0] + ". " + matchedPick.metadata?.last_name) || "Player";
                        pPos = pObj ? pObj.posGroup : matchedPick.metadata?.position || "";
                    }
                } else {
                    let manualPlayerId = draft.draftedPlayers[pickNum - 1];
                    if (manualPlayerId) {
                        pObj = playerById.get(manualPlayerId);
                        if (pObj) { pName = pObj.name; pPos = pObj.posGroup; }
                    }
                }

                let cellClass = "draft-cell";
                let cellContent = `<span style="opacity:0.35; font-size:0.58rem;">${r}.${displayTeamNum < 10 ? '0'+displayTeamNum : displayTeamNum}</span>`;

                if (pName) {
                    let nameParts = pName.split(' ');
                    let firstName = nameParts[0];
                    let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

                    cellClass += ` picked ${escapeHtml(pPos)}`;
                    if (pObj && myTeamSet.has(pObj.id)) cellClass += " mine";

                    // 1. Grab the exact Sleeper ID safely (removing the undefined matchedPick variable)
                    let playerId = pObj ? (pObj.sleeperId || pObj.id) : null;
                    
                    // 2. Build the image string (excluding custom uploaded players)
                    let imgHTML = playerId && !playerId.toString().startsWith('custom_') ? 
                        `<img src="https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg" class="draft-cell-img" alt="" width="22" height="22" loading="lazy" decoding="async" onerror="this.style.display='none'">` : '';

                    // 3. Inject into the cell
                    cellContent = `
                        ${imgHTML}
                        <div style="display:flex; flex-direction:column; align-items:center;">
                            <div class="draft-cell-first" title="${escapeHtml(pName)}">${escapeHtml(firstName)}</div>
                            <div class="draft-cell-last" title="${escapeHtml(pName)}">${escapeHtml(lastName)}</div>
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

    // `playerById` is optional: renderBoard, the main caller, already has one built for its own
    // loop and passes it in. Without it this scanned the whole player pool once per rostered
    // player, on every render.
    function renderFantasyRoster(playerById) {
        if (State.players.length === 0) {
            return `<div class="empty-state-card"><p>Load rankings on the Setup tab to start building your roster.</p><button class="btn btn-primary empty-state-cta" onclick="showTab('setup')">Go to Setup</button></div>`;
        }

        let draft = getActiveDraft();
        if (!draft) return `<div style="text-align:center; color:var(--text-muted);">Select or add a draft first.</div>`;

        let byId = playerById;
        if (!byId) {
            byId = new Map();
            State.players.forEach(p => { if (!byId.has(p.id)) byId.set(p.id, p); });
        }
        let myPlayersObjects = draft.myTeam.map(id => byId.get(id)).filter(Boolean);
        let availablePool = [...myPlayersObjects];
        let rosterSlotsHTML = '';
        let limits = draft.limits || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6 };

                const buildSlotHTML = (label, color, p) => {
            if (p) {
                let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
                
                // 1. Grab ID and build the image tag (crossorigin removed)
                let playerId = p.sleeperId || p.id;
                let imgHTML = playerId && !playerId.toString().startsWith('custom_') 
                    ? `<img src="https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg" class="roster-avatar" alt="" width="32" height="32" loading="lazy" decoding="async" onerror="this.style.display='none'">` 
                    : `<div class="roster-avatar placeholder"></div>`;

                return `
                <div class="roster-slot">
                    <div class="roster-slot-label-row">
                        <span class="roster-label" style="color:${color}">${label}</span>
                        ${imgHTML} <!-- Inject Image Here -->
                        <div>
                            <div style="font-weight: bold;">${escapeHtml(p.name)} ${rookieBadge}</div>
                            <div style="margin-top: 2px;">
                                <span class="badge pos-badge ${escapeHtml(p.posGroup)}">${escapeHtml(p.posDisplay)}</span>
                                <span class="badge">${escapeHtml(p.team)}</span>
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Bye: ${escapeHtml(p.bye)}</div>
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
    export const sendRosterToLineupStrategist = function() {
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
            SFLEX: limits.SFLEX || 0,
            K: limits.K || 0,        // NEW
            DEF: limits.DEF || 0
        };

        const payload = {
            sourceLeagueName: draft.name || "Drafted Team",
            players: players,
            reqs: reqs,
            timestamp: Date.now()
        };

        localStorage.setItem('mds_handoff_roster', JSON.stringify(payload));

        if (window.showToast) window.showToast(`Sending ${players.length} players to Lineup Strategist…`);
        setTimeout(() => { window.location.href = './lineup/'; }, 700);
    };

    // Resolves the overall pick number a player was actually drafted at. Sleeper syncs have
    // precise data via rawDraftPicks; manual drafts don't, but draft.draftedPlayers is pushed to
    // in real draft order by draftPlayer(), so its index is the correct fallback -- NOT the
    // three different broken placeholders (an index into myTeam only, the player's own internal
    // id, or a hardcoded 50) that used to be scattered across the functions below, none of which
    // reflected a real pick number for a manual draft.
    // Builds the two lookups getPickNumberForPlayer needs, once, for a caller that is about to
    // ask about many players. First entry wins in both, matching the .find()/.indexOf() the
    // lookup replaces.
    function buildPickNumberIndex(draft) {
        const bySleeperId = new Map();
        if (draft.rawDraftPicks && draft.rawDraftPicks.length > 0) {
            draft.rawDraftPicks.forEach(r => { if (!bySleeperId.has(r.player_id)) bySleeperId.set(r.player_id, r.pick_no); });
        }
        const byPlayerId = new Map();
        if (draft.draftedPlayers) {
            draft.draftedPlayers.forEach((id, i) => { if (!byPlayerId.has(id)) byPlayerId.set(id, i + 1); });
        }
        return { bySleeperId, byPlayerId };
    }

    // `index` is optional (built on demand when absent) but callers in a loop should pass one.
    // renderDraftRecap calls this seven times over the same roster -- including from inside a
    // sort comparator, where a per-call scan of rawDraftPicks turns an O(n log n) sort into
    // O(n log n * picks).
    function getPickNumberForPlayer(draft, player, index) {
        const idx = index || buildPickNumberIndex(draft);
        const byPick = idx.bySleeperId.get(player.sleeperId);
        if (byPick !== undefined) return byPick;
        const byManual = idx.byPlayerId.get(player.id);
        if (byManual !== undefined) return byManual;
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

        // Built once and shared by every getPickNumberForPlayer call in this function -- see
        // the note on buildPickNumberIndex. The roster lookup gets the same treatment: the
        // map/find chain scanned the whole player pool once per rostered player.
        const pickIndex = buildPickNumberIndex(draft);
        const playerById = new Map();
        State.players.forEach(p => { if (!playerById.has(p.id)) playerById.set(p.id, p); });
        let myPlayers = draft.myTeam.map(id => playerById.get(id)).filter(Boolean);

        let bestSteal = null;
        let worstReach = null;
        let maxDiff = -999;
        let minDiff = 999;

        myPlayers.forEach((p, index) => {
            // Ignore dynamically created unranked players (K, DEF, etc.) so they don't trigger as a massive reach
            if (p.rank === 999) return; 

            let pickNum = getPickNumberForPlayer(draft, p, pickIndex);

            let valueDiff = pickNum - p.rank;
            if (valueDiff > maxDiff) { maxDiff = valueDiff; bestSteal = { player: p, diff: valueDiff }; }
            if (valueDiff < minDiff) { minDiff = valueDiff; worstReach = { player: p, diff: valueDiff }; }
        });

        // Archetype Detection
        let firstPosRound = { QB: 99, RB: 99, WR: 99, TE: 99 };
        myPlayers.forEach(p => {
            let pickNum = getPickNumberForPlayer(draft, p, pickIndex);
            let rd = Math.ceil(pickNum / teams);
            if (rd < firstPosRound[p.posGroup]) firstPosRound[p.posGroup] = rd;
        });

        let archetype = "Balanced Build";
        let rbCountRds12 = myPlayers.filter(p => {
            let pNum = getPickNumberForPlayer(draft, p, pickIndex);
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
                let pPick = getPickNumberForPlayer(draft, sp, pickIndex);
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
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary-green);"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                    <strong>Biggest Steal:</strong> ${escapeHtml(bestSteal.player.name)} (${escapeHtml(bestSteal.player.posDisplay)})
                </span>
                <span class="badge badge-value">+${Math.abs(bestSteal.diff)} Value</span>
            </div>`;
        }

        if (worstReach && worstReach.diff < -5) {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--avoid-bg); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--avoid-border); margin-top:0.5rem;">
                <span class="recap-callout-label">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--avoid-border);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <strong>Biggest Reach:</strong> ${escapeHtml(worstReach.player.name)} (${escapeHtml(worstReach.player.posDisplay)})
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
                return getPickNumberForPlayer(draft, a, pickIndex) - getPickNumberForPlayer(draft, b, pickIndex);
            });

            posPlayers.forEach(sp => {
                let pPick = getPickNumberForPlayer(draft, sp, pickIndex);
                let diff = pPick - sp.rank;
                let valColor = diff >= 0 ? "var(--primary-green)" : "var(--avoid-border)";
                let sign = diff >= 0 ? "+" : "";

                mathHTML += `
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:3px;">
                        <span><strong>${escapeHtml(sp.posDisplay)}:</strong> ${escapeHtml(sp.name)} (Rank: ${sp.rank} | Pick: ${pPick})</span>
                        <span style="color:${valColor}; font-weight:bold;">${sign}${diff} Value</span>
                    </div>`;
            });
        });
        mathHTML += `</div>`;

        const mathContainer = document.getElementById('recapMathBreakdown');
        if (mathContainer) mathContainer.innerHTML = mathHTML;
    }

    // --- RECAP MATH TOGGLE HELPER ---
    export const toggleRecapMath = function() {
        const breakdown = document.getElementById('recapMathBreakdown');
        const arrow = document.getElementById('recapMathArrow');
        const btn = document.getElementById('toggleRecapMathBtn');
        const btnText = document.querySelector('#toggleRecapMathBtn span');
        if (!breakdown) return;

        if (breakdown.style.display === 'none') {
            breakdown.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(180deg)';
            if (btnText) btnText.innerText = 'Hide Value Breakdown';
            if (btn) btn.setAttribute('aria-expanded', 'true');
        } else {
            breakdown.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            if (btnText) btnText.innerText = 'Show Value Breakdown';
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    };

    // --- TEAM EXPORT LOGIC ---
    export const exportTeam = async function() {
        // Fetched on first use rather than on every page load -- see loadScriptOnce in
        // utils.js. The old message here ("loading, try again in a moment") was a symptom of
        // the eager <script defer> tag: the only thing the user could do was wait and
        // re-press. Now the press itself starts the download and the export continues once
        // it lands.
        if (!(await window.ensureHtml2Canvas())) {
            if (window.showToast) window.showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
            return;
        }

        const container = document.getElementById('exportableTeamContainer'); 
        const exportBtn = document.getElementById('exportTeamBtn');
        
        if (!container) return;

        const origText = exportBtn ? exportBtn.innerText : "Export";
        if (exportBtn) exportBtn.innerText = "Capturing…";
        
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

    // --- 5-COLOR AFFINITY SYSTEM ---
    export const cycleAffinity = function(e, id) {
        e.preventDefault();
        e.stopPropagation();
        
        let p = State.players.find(x => x.id === id);
        if (p) {
            // Cycle 0 (Empty) -> 1 (Green) -> 2 (Yellow) -> 3 (Orange) -> 4 (Red) -> 5 (Purple)
            p.affinity = ((p.affinity || 0) + 1) % 6;
            
            savePlayerPool();
            renderBoard();
        }
    };

    // Pure function: player object + current draft context in, one player-card's HTML string out.
    // No side effects, no DOM access -- extracted from what used to be inline in renderBoard()'s
    // main forEach loop so this ~130-line template is readable and testable on its own.
    //
    // `ctx` carries the values that are the same for every card in one render pass and were
    // previously re-derived per card: the parsed call-out lists (3 localStorage reads each
    // time) and the T-Score toggle (a 4th read). Across a 600-player pool that was ~2,400
    // synchronous storage hits per render. They're read once in renderBoard now and passed
    // down, which also makes this function genuinely pure -- it no longer touches
    // localStorage at all, so the "no side effects" claim above is now literally true.
    function buildPlayerCardHTML(p, currentOverallPick, showStacks, myQbs, myPassCatchers, draft, ctx) {
        let customStyle = getCallOutStyle(p.name, ctx.callOutLists);
        let valueBadgeHTML = "";
        let diff = currentOverallPick - p.rank;
        if (diff > 0) {
            valueBadgeHTML = ` | <span class="badge badge-value">+${diff} Value</span>`;
        } else if (diff < 0) {
            valueBadgeHTML = ` | <span class="badge badge-reach">${diff} Reach</span>`;
        } else {
            valueBadgeHTML = ` | <span class="badge" style="background:#3a506b;">At Rank</span>`;
        }
        
        if (['WR', 'RB'].includes(p.posGroup) && ctx.showTScore) {
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

        let adpText = (p.adp && p.adp !== "-") ? ` | Market: ${escapeHtml(p.adp)}` : "";
        let isStack = false;
        if (showStacks && p.team !== "FA") {
            if (['WR', 'TE'].includes(p.posGroup) && myQbs.includes(p.team)) isStack = true;
            if (p.posGroup === 'QB' && myPassCatchers.includes(p.team)) isStack = true;
        }

        let stackBadge = isStack ? `<span class="badge" style="background: var(--stack-color); color: white;">Stack</span>` : "";
        let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
        
        // NEW: Generate the injury badge using your existing CSS class
        let injuryBadge = p.injury ? `<span class="badge inj-badge">${escapeHtml(p.injury)}</span>` : "";
        
        // Check if the card was expanded before the sync happened
        let expandedClass = p.isExpanded ? " is-expanded" : "";

        let isQueued = draft.queue && draft.queue.includes(p.id);
        let queueStarIcon = isQueued ? "★" : "☆";
        let queueStarColor = isQueued ? "#f59e0b" : "var(--text-muted)";

        return `
            <div class="player-card${expandedClass}" data-player-id="${p.id}" style="${customStyle}" role="group" aria-label="${escapeHtml(p.rank)}. ${escapeHtml(p.name)}">
                
                <div class="card-grid" style="display: flex; flex-direction: column; gap: 0.6rem; width: 100%; align-items: stretch; text-align: left;">
                    
                    <!-- TOP ROW: Rank & Name -->
                    <div class="card-top-row">
                        <span style="color: var(--text-muted); font-weight: 500; font-size: 1rem; flex-shrink: 0;">${p.rank}.</span> 
                        <h4 class="card-name">
                            ${escapeHtml(p.name)}
                        </h4>
                    </div>

                    <!-- BOTTOM ROW: Badges & Actions -->
                    <div class="card-bottom-row">
                        
                        <!-- Bottom Left: Badges, Star & Affinity -->
                        <div class="card-badges-row">
                            <span class="badge pos-badge ${escapeHtml(p.posGroup)}">${escapeHtml(p.posDisplay)}</span> 
                            ${rookieBadge}
                            ${injuryBadge}
                            ${stackBadge}
                            <div style="display: flex; align-items: center; gap: 2px;">
                                <button type="button" onclick="toggleQueue(${p.id})" style="background: none; border: none; font-size: 1.15rem; color: ${queueStarColor}; cursor: pointer; padding: 0 4px; transform: translateY(-1px);" title="Toggle Queue" aria-label="Queue ${escapeHtml(p.name)}" aria-pressed="${isQueued ? 'true' : 'false'}">${queueStarIcon}</button>
                                <button onclick="cycleAffinity(event, ${p.id})" style="background: transparent; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Toggle Color Label" aria-label="Color label: ${['None', 'Green', 'Yellow', 'Orange', 'Red', 'Purple'][p.affinity || 0]}. Change color">
                                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; 
                                                 border: 2px solid ${['var(--text-muted)', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 background-color: ${['transparent', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 opacity: ${p.affinity ? '1' : '0.4'}; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;">
                                    </span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Bottom Right: Draft Actions & Chevron -->
                        <div class="actions" style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                            <button class="mds-btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)" aria-label="${escapeHtml(p.name)} taken by another team">Taken</button>
                            <button class="mds-btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)" aria-label="Pick ${escapeHtml(p.name)} for my team">Pick</button>
                            <button class="btn-expand hide-on-desktop" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center;" onclick="toggleCardDetails(event, ${p.id})" aria-label="Expand details" aria-expanded="${p.isExpanded ? 'true' : 'false'}">
                                <svg aria-hidden="true" class="chevron-icon" style="transform: ${p.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card-details" id="details-${p.id}">
                    <div class="player-stats">
                        <span>${escapeHtml(p.team)} | Bye: ${escapeHtml(p.bye)}${adpText}${valueBadgeHTML}</span>
                        <button type="button" class="edit-link" onclick="toggleEditBar(${p.id})" title="Edit Details" aria-label="Edit ${escapeHtml(p.name)}'s details" aria-expanded="${p.isEditing ? 'true' : 'false'}" aria-controls="inline-edit-${p.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin: 0 2px;" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                    </div>
                    <div class="inline-editor" id="inline-edit-${p.id}" style="${p.isEditing ? 'display: flex;' : ''}">
                        <div style="display:flex; gap:0.4rem; width:100%; flex-wrap:wrap; align-items:center;">
                            <div>
                                <label class="card-field-label" for="edit-rank-val-${p.id}">Rank</label>
                                <input type="number" id="edit-rank-val-${p.id}" value="${escapeHtml(p.rank)}" style="width:55px;">
                            </div>
                            <div>
                                <label class="card-field-label" for="edit-tier-val-${p.id}">Tier</label>
                                <input type="text" id="edit-tier-val-${p.id}" value="${escapeHtml(p.tier)}" style="width:45px;">
                            </div>
                            <div>
                                <label class="card-field-label" for="edit-team-val-${p.id}">Team</label>
                                <input type="text" id="edit-team-val-${p.id}" value="${escapeHtml(p.team)}" style="width:55px;">
                            </div>
                            <div>
                                <label class="card-field-label" for="edit-bye-val-${p.id}">Bye</label>
                                <input type="text" id="edit-bye-val-${p.id}" value="${escapeHtml(p.bye)}" style="width:45px;">
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
                 data-player-id="${p.id}"
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
                            ${escapeHtml(p.name)}
                        </h4>
                    </div>

                    <!-- BOTTOM ROW: Arrows, Badges, Star & Actions -->
                    <div class="card-bottom-row">
                        
                        <!-- Left Side: Arrows, Badges, Star & Affinity -->
                        <div class="card-badges-row">
                            <button class="mds-btn-sm btn-secondary queue-arrow-btn" onclick="moveQueueItem(${idx}, -1)" ${isFirst ? 'disabled' : ''} aria-label="Move ${escapeHtml(p.name)} up the queue">▲</button>
                            <button class="mds-btn-sm btn-secondary queue-arrow-btn" onclick="moveQueueItem(${idx}, 1)" ${isLast ? 'disabled' : ''} aria-label="Move ${escapeHtml(p.name)} down the queue">▼</button>
                            <span class="badge pos-badge ${escapeHtml(p.posGroup)}">${escapeHtml(p.posDisplay)}</span>
                            <div style="display: flex; align-items: center; gap: 2px;">
                                <button onclick="toggleQueue(${p.id})" style="background: none; border: none; font-size: 1.15rem; color: #f59e0b; cursor: pointer; padding: 0 4px; transform: translateY(-1px);" title="Remove from Queue" aria-label="Remove ${escapeHtml(p.name)} from queue">★</button>
                                <button onclick="cycleAffinity(event, ${p.id})" style="background: transparent; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Toggle Color Label" aria-label="Color label: ${['None', 'Green', 'Yellow', 'Orange', 'Red', 'Purple'][p.affinity || 0]}. Change color">
                                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; 
                                                 border: 2px solid ${['var(--text-muted)', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 background-color: ${['transparent', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 opacity: ${p.affinity ? '1' : '0.4'}; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;">
                                    </span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Right Side: Draft Actions -->
                        <div style="display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center;">
                            <button class="mds-btn-sm btn-draft" onclick="draftPlayer(${p.id}, false)" aria-label="${escapeHtml(p.name)} taken by another team">Taken</button>
                            <button class="mds-btn-sm btn-mine" onclick="draftPlayer(${p.id}, true)" aria-label="Pick ${escapeHtml(p.name)} for my team">Pick</button>
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
    export const toggleQueueCollapse = function() {
        // renderBoard() replaces the header <button> via innerHTML, which would drop keyboard
        // focus to <body>; put it back on the new header if it was focused before the toggle.
        const hadFocus = !!(document.activeElement && document.activeElement.classList.contains('queue-header'));
        isQueueCollapsed = !isQueueCollapsed;
        renderBoard();
        if (hadFocus) {
            const newHeader = document.querySelector('#queueContainer .queue-header');
            if (newHeader) newHeader.focus();
        }
    };

    export function renderBoard() {
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

        // Per-render lookup index, built once and shared by everything below. All of this used
        // to be done with State.players.find(...) / array.includes(...) from inside loops over
        // the full player pool -- O(players x drafted) work, repeated in several places per
        // render -- and renderBoard runs on every (debounced) search keystroke, every pick,
        // and every live-sync tick that finds a new pick. First entry wins, matching .find().
        const playerById = new Map();
        State.players.forEach(p => { if (!playerById.has(p.id)) playerById.set(p.id, p); });
        const draftedSet = new Set(draftedPlayers);
        const myTeamSet = new Set(myTeam);

        let newPoolHTML = '';
        let posCounts = { "QB": 0, "RB": 0, "WR": 0, "TE": 0, "K": 0, "DEF": 0 };
        // Check Sleeper's raw pick count first so unranked K/DEF are included in the math
        let totalPicksDone = (draft && draft.rawDraftPicks && draft.rawDraftPicks.length > 0) ? draft.rawDraftPicks.length : draftedPlayers.length;
        let currentOverallPick = totalPicksDone + 1;
        
        let teamsInLeague = draft?.settings?.teams || 12;
        let round = Math.ceil(currentOverallPick / teamsInLeague);
        let pickInRound = currentOverallPick - ((round - 1) * teamsInLeague);
        
        const pickTrackerEl = document.getElementById('pickTracker');
        if (pickTrackerEl) pickTrackerEl.innerText = `Pick: ${round}.${pickInRound.toString().padStart(2, '0')}`;

        const trackers = getTierTrackerData(draftedSet);
        let isAllActive = !Array.isArray(State.activePosFilter) || State.activePosFilter.length === 0;
        let trackerHTML = `<button type="button" class="badge badge-all pos-filter ${isAllActive ? 'active-filter' : ''}" onclick="setPosFilter('ALL')" aria-pressed="${isAllActive}" aria-label="Show all positions"><span>ALL</span></button>`;

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            // If ALL is active, everything lights up. Otherwise, check if this specific pos is selected.
            let isActive = isAllActive || (Array.isArray(State.activePosFilter) && State.activePosFilter.includes(pos)) ? 'active-filter' : '';
            let tText = trackers[pos] ? `T${trackers[pos].tier} (${trackers[pos].count})` : "—";
            // aria-pressed reflects an explicit pick only: with ALL active every badge is lit up, but
            // none of them is individually "on".
            const isPicked = !isAllActive && State.activePosFilter.includes(pos);
            const tLabel = trackers[pos] ? `top available tier ${trackers[pos].tier}, ${trackers[pos].count} left` : 'none left';
            trackerHTML += `<button type="button" class="badge pos-badge ${pos} pos-filter ${isActive}" onclick="setPosFilter('${pos}')" aria-pressed="${isPicked}" aria-label="Filter ${pos}, ${tLabel}"><span>${pos}</span><span style="font-size:0.65rem; opacity:0.9;">${tText}</span></button>`;
        });
        const tierTrackerEl = document.getElementById('tierTracker');
        if (tierTrackerEl) tierTrackerEl.innerHTML = trackerHTML;

        let showStacks = localStorage.getItem('ds_stacks') === 'true';

        // One pass over myTeam instead of two full map/find/filter chains over it (each of
        // which scanned the entire player pool once per rostered player) to derive the same
        // two team lists.
        let myQbs = [];
        let myPassCatchers = [];
        myTeam.forEach(id => {
            const p = playerById.get(id);
            if (!p || p.team === "FA") return;
            if (p.posGroup === 'QB') myQbs.push(p.team);
            else if (p.posGroup === 'WR' || p.posGroup === 'TE') myPassCatchers.push(p.team);
        });

        // Read once per render rather than once per card -- see buildPlayerCardHTML's `ctx`.
        const cardCtx = { callOutLists: getCallOutLists(), showTScore: localStorage.getItem('ds_tscore') === 'true' };

        let lastTier = null;

        State.players.forEach(p => {
            const isDrafted = draftedSet.has(p.id);
            const isMine = myTeamSet.has(p.id);

            if (isMine && posCounts[p.posGroup] !== undefined) posCounts[p.posGroup]++;

            if (!isDrafted) {
                if (Array.isArray(State.activePosFilter) && State.activePosFilter.length > 0) {
                    if (!State.activePosFilter.includes(p.posGroup)) return;
                }

                if (p.name.toLowerCase().includes(searchTerm)) {
                    if (searchTerm === "" && p.tier !== lastTier && p.tier !== "-") {
                        newPoolHTML += `<div class="tier-divider">Tier ${escapeHtml(p.tier)}</div>`;
                        lastTier = p.tier;
                    }

                    newPoolHTML += buildPlayerCardHTML(p, currentOverallPick, showStacks, myQbs, myPassCatchers, draft, cardCtx);
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
        // --- Focus retention across the pool and queue swaps ---
        // innerHTML replaces every card, so whatever button had keyboard focus is destroyed and
        // focus drops to <body> -- mid-draft, every time a Live Sync pick lands. Snapshot which
        // card and which control inside it held focus, then put focus back on the same control
        // in the rebuilt card. If that card is gone (player drafted, or taken off the queue),
        // move to the same control on the next card in the same list, falling back to the
        // previous one. Covers both lists that get rebuilt here: #playerPool and the queue.
        //
        // The control is matched by its position among the card's focusable elements, checked
        // against its class. Position alone is exact because every card in a list comes from the
        // same template; the class check guards against a template change shifting the order.
        // Class alone isn't enough: .btn-mine / .btn-draft are also the inline editor's Save /
        // Cancel, and both queue arrows share .queue-arrow-btn.
        const queueEl = document.getElementById('queueContainer');
        const FOCUSABLE_SEL = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';
        const KEY_CLASSES = ['btn-mine', 'btn-draft', 'edit-link', 'btn-expand', 'queue-arrow-btn'];
        let focusSnap = null;
        const activeEl = document.activeElement;
        const focusList = (activeEl && activeEl !== document.body)
            ? [poolEl, queueEl].find(el => el && el.contains(activeEl)) : null;
        if (focusList) {
            const card = activeEl.closest('.player-card[data-player-id]');
            if (card) {
                const collectIds = (start, dir) => {
                    const ids = [];
                    let sib = start[dir];
                    while (sib && ids.length < 25) {
                        if (sib.dataset && sib.dataset.playerId) ids.push(sib.dataset.playerId);
                        sib = sib[dir];
                    }
                    return ids;
                };
                // A card that's still in edit mode keeps whatever the user had typed; without
                // this a sync tick mid-edit silently reverts the fields to the saved values.
                const inputVals = {};
                card.querySelectorAll('.inline-editor input[id]').forEach(inp => { inputVals[inp.id] = inp.value; });
                let sel = null;
                try { if (activeEl.selectionStart != null) sel = [activeEl.selectionStart, activeEl.selectionEnd]; } catch (e) { /* number inputs */ }
                focusSnap = {
                    listId: focusList.id,
                    playerId: card.dataset.playerId,
                    index: Array.from(card.querySelectorAll(FOCUSABLE_SEL)).indexOf(activeEl),
                    keyClass: KEY_CLASSES.find(c => activeEl.classList.contains(c)) || null,
                    nextIds: collectIds(card, 'nextElementSibling'),
                    prevIds: collectIds(card, 'previousElementSibling'),
                    inputVals,
                    sel
                };
            }
        }

        const restoreFocus = (listEl) => {
            if (!focusSnap || !listEl || focusSnap.listId !== listEl.id) return;
            const findCard = (id) => listEl.querySelector(`.player-card[data-player-id="${id}"]`);
            const usable = (el) => el && !el.disabled && el.getClientRects().length > 0;
            const firstUsable = (card, cls) => Array.from(card.querySelectorAll(`.${cls}`)).find(usable) || null;
            const pickControl = (card) => {
                const byIndex = card.querySelectorAll(FOCUSABLE_SEL)[focusSnap.index];
                if (byIndex && (!focusSnap.keyClass || byIndex.classList.contains(focusSnap.keyClass)) && usable(byIndex)) return byIndex;
                // Same kind of control, first usable one: an open editor's Save on a drafted
                // card maps to the next card's Pick (its editor is closed); a queue arrow that
                // just became disabled (card moved to the top/bottom) maps to the other arrow.
                return (focusSnap.keyClass && firstUsable(card, focusSnap.keyClass)) || firstUsable(card, 'btn-mine');
            };

            let targetCard = findCard(focusSnap.playerId);
            const sameCard = !!targetCard;
            if (!targetCard) {
                for (const id of [...focusSnap.nextIds, ...focusSnap.prevIds]) {
                    targetCard = findCard(id);
                    if (targetCard) break;
                }
            }
            // The last queued player was just drafted or un-queued, so the queue is gone
            // entirely: land on the top card of the pool rather than dropping to <body>.
            if (!targetCard && listEl === queueEl && poolEl) {
                targetCard = poolEl.querySelector('.player-card[data-player-id]');
            }
            if (!targetCard) return;
            if (sameCard) {
                Object.keys(focusSnap.inputVals).forEach(inputId => {
                    const inp = targetCard.querySelector(`#${CSS.escape(inputId)}`);
                    if (inp) inp.value = focusSnap.inputVals[inputId];
                });
            }
            const target = pickControl(targetCard);
            if (target) {
                target.focus();
                if (sameCard && focusSnap.sel) {
                    try { target.setSelectionRange(focusSnap.sel[0], focusSnap.sel[1]); } catch (e) { /* number inputs */ }
                }
            }
        };

        if (poolEl) poolEl.innerHTML = newPoolHTML;
        restoreFocus(poolEl);
        let newQueueHTML = '';

        if (draft && draft.queue && draft.queue.length > 0) {
            let activeQueue = draft.queue.filter(id => !draftedSet.has(id));

            if (activeQueue.length > 0) {
                let queueExpandedClass = isQueueCollapsed ? "" : " is-expanded";
                newQueueHTML += `<button type="button" class="queue-header btn-bare${queueExpandedClass}" onclick="toggleQueueCollapse()" aria-expanded="${isQueueCollapsed ? 'false' : 'true'}" aria-label="Toggle Queue">                    <span class="queue-header-title"><span class="pulse-dot" style="background-color: #f59e0b; box-shadow: none; animation: none;"></span> My Queue (${activeQueue.length})</span>
                    <svg aria-hidden="true" class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>`;

                if (!isQueueCollapsed) {
                    newQueueHTML += `<div class="player-pool-container" style="margin-bottom: 1.5rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.5rem;">`;

                    activeQueue.forEach((qId, idx) => {
                        let p = playerById.get(qId);
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
        restoreFocus(queueEl);
        if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster(playerById);

        let otherDraftedIds = draftedPlayers.filter(id => !myTeamSet.has(id)).slice().reverse();
        let newOtherHTML = '';
        if (otherDraftedIds.length === 0) {
            newOtherHTML = `
                <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                    <em>No other players drafted yet.</em>
                </div>`;
        } else {
            otherDraftedIds.forEach(id => {
                let p = playerById.get(id);
                if (p) {
                    newOtherHTML += `
                        <div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                            <div style="color: var(--text-muted);"><strike>${escapeHtml(p.name)}</strike> <span class="badge">${escapeHtml(p.posGroup)}</span></div>
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
                    <td>${posCounts['QB']} / ${limits.QB || 0}</td>
                    <td>${posCounts['RB']} / ${limits.RB || 0}</td>
                    <td>${posCounts['WR']} / ${limits.WR || 0}</td>
                    <td>${posCounts['TE']} / ${limits.TE || 0}</td>
                    <td>${flexUsed} / ${limits.FLEX || 0}</td>
                    <td>${sflexUsed} / ${limits.SFLEX || 0}</td>
                    <td>${posCounts['K'] || 0} / ${limits.K || 0}</td>
                    <td>${posCounts['DEF'] || 0} / ${limits.DEF || 0}</td>
                    <td><strong>${myTeam.length} / ${limits.TOTAL || 0}</strong></td>
                </tr>`;
        }

        const exportRecapContainer = document.getElementById('exportRecapContainer');
        if (exportRecapContainer) {
            exportRecapContainer.style.display = (myTeam.length >= limits.TOTAL) ? 'flex' : 'none';
        }

        renderDraftMatrix();
        renderDraftRecap();
    }
export const toggleHeadshots = function(show) {
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
        
        ['limitQB', 'limitRB', 'limitWR', 'limitTE', 'limitFLEX', 'limitSFLEX', 'limitK', 'limitDEF', 'limitBENCH'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateTotalRounds);
        });

        const searchBarEl = document.getElementById('searchBar');
        if (searchBarEl) {
            searchBarEl.addEventListener('input', debounce(renderBoard, 200));
        }

        // (Player cards used to be focusable role="button" wrappers that proxied Enter/Space to
        // their Taken button. A button can't contain other buttons -- screen readers flatten or
        // skip the star, color label, Pick and expand buttons inside it -- so the card is now a
        // plain labeled group and each of its buttons is reached with Tab directly.)
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

        // Deep link: open the tab named in the URL hash (a reload, or a shared #tracker link).
        // Runs after everything above so the board has its data before showTab renders it.
        // replaceState stamps this first history entry with its tab, so pressing Back to it
        // later restores the right tab instead of falling through to Setup.
        const initialTab = window.getTabFromHash() || 'setup';
        if (initialTab !== 'setup') window.showTab(initialTab, true);
        history.replaceState({ tab: initialTab }, '');

        // Last line of init on purpose: tells the safety net in utils.js that this script
        // evaluated all the way through and the page is genuinely usable, so a later uncaught
        // error gets logged instead of covering a working screen with the fatal-boot banner.
        // If anything above throws, this never runs and the banner stays armed -- which is
        // exactly the behavior we want.
        if (typeof window.markAppReady === 'function') window.markAppReady();
    });
