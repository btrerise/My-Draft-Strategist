// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// RENDER DRAFT MATRIX.
import { escapeHtml } from '../shared/html.js';
import { State, getActiveDraft } from './state.js';
import { headshotHTML } from './headshots.js';

    // --- RENDER DRAFT MATRIX ---
    export function renderDraftMatrix() {
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
                    
                    // 2. The headshot: initials, with the photo on top when there's a Sleeper id (headshots.js)
                    let imgHTML = headshotHTML({ id: playerId, name: pName, pos: pPos, team: pObj?.team }, 'draft-cell-img');

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
