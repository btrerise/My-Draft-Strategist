// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// the pick-number helpers above DRAFT RECAP & ANALYSIS RENDERER, that section, and
// RECAP MATH TOGGLE HELPER.
import { escapeHtml } from '../shared/html.js';
import { State, getActiveDraft } from './state.js';

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
    export function renderDraftRecap() {
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
