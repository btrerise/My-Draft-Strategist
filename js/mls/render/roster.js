// Moved from js/mls/legacy.js in refactor chunk 3E: the Roster tab renderer (loadRosterTab), the first
// function under RENDERERS.
import { escapeHtml } from '../../shared/html.js';
import { tierTag, SLOT_POSITIONS } from '../constants.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { State } from '../state.js';
import { rankingIndex, getActiveLeague } from '../helpers.js';
import { ensureHeadshotNameIndex, playerHeadshotHTML } from '../lineup/headshots.js';
import { getByeBadgeHTML } from '../lineup/gameInfo.js';
import { renderManualAddLog } from '../leagues/addPlayer.js';
import { getSoSBadgeHTML } from '../sos.js';
import { _rookieIndex, getRookieIndex, isRookiePlayer } from './rookies.js';
import { refreshPowerRankings } from '../main.js';
import { rankMoveChip } from '../rankings/moveChips.js';
import { displayRanksFor, leagueRankDisplayIndex } from '../rankings/displayRanks.js';

    // --- POSITION COUNTS (improvements S9) ---
    // The strip of chips above the roster list: one per position with how many you roster, a
    // note for taxi and IR players (they count), and an "All" chip. Tapping a chip filters the
    // list to that position. The filter lives in memory only, per league: a reload or a league
    // switch shows everyone again.
    const POS_COUNT_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const DEFAULT_REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 }; // as render/lineup.js
    let rosterPosFilter = { leagueId: null, pos: null };

    // [{ pos, count, ir, taxi }] in QB, RB, WR, TE, K, DEF order, then any other position on the
    // roster. A standard position is left out only when you have none and no starting slot takes
    // it (a league without kickers shows no K); a QB still shows in a superflex league with no QB slot.
    // IR counts a player in your Sleeper IR slot (isReserve, set at sync) or on NFL IR (inj), once.
    export function rosterPositionCounts(roster, reqs) {
        const slots = reqs || DEFAULT_REQS;
        const hasSlot = pos => Object.entries(SLOT_POSITIONS).some(([type, takes]) => (slots[type] || 0) > 0 && takes.includes(pos));
        const byPos = new Map();
        (roster || []).forEach(p => {
            const c = byPos.get(p.pos) || { pos: p.pos, count: 0, ir: 0, taxi: 0 };
            c.count++;
            if (p.isReserve || p.inj === 'IR') c.ir++;
            if (p.isTaxi) c.taxi++;
            byPos.set(p.pos, c);
        });
        const standard = POS_COUNT_ORDER
            .filter(pos => byPos.has(pos) || hasSlot(pos))
            .map(pos => byPos.get(pos) || { pos, count: 0, ir: 0, taxi: 0 });
        const others = [...byPos.keys()].filter(pos => !POS_COUNT_ORDER.includes(pos)).sort().map(pos => byPos.get(pos));
        return [...standard, ...others];
    }

    // A chip's tap: show only that position, or everyone again ('ALL', or the picked chip a second time).
    export function setRosterPosFilter(pos) {
        const league = getActiveLeague();
        const current = league && rosterPosFilter.leagueId === league.leagueId ? rosterPosFilter.pos : null;
        rosterPosFilter = { leagueId: league ? league.leagueId : null, pos: (!pos || pos === 'ALL' || pos === current) ? null : pos };
        loadRosterTab();
    }

    function renderRosterPosCounts(el, counts, total, picked) {
        const noteOf = c => [c.ir ? `${c.ir} IR` : '', c.taxi ? `${c.taxi} taxi` : ''].filter(Boolean).join(' · ');
        const chip = (pos, label, count, note, colorClass, extra = '') => {
            const on = picked === pos || (pos === 'ALL' && !picked);
            const lit = !picked || on;
            const spoken = `${label} ${count}${note ? ` (${note})` : ''}`;
            return `<button type="button" class="badge ${colorClass} pos-filter mls-poscount${lit ? ' active-filter' : ''}" data-action="setRosterPos" data-pos="${escapeHtml(pos)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${escapeHtml(spoken)}"${extra}>`
                + `<span class="mls-poscount-name">${escapeHtml(label)}</span>`
                + `<span class="mls-poscount-num">${count}</span>`
                + (note ? `<span class="mls-poscount-note">${escapeHtml(note)}</span>` : '')
                + `</button>`;
        };
        el.innerHTML = chip('ALL', 'All', total, '', 'badge-all')
            + counts.map(c => chip(c.pos, c.pos, c.count, noteOf(c),
                POS_COUNT_ORDER.includes(c.pos) ? `pos-badge ${c.pos}` : '',
                c.count === 0 ? ' disabled' : '')).join('');
        el.hidden = false;
    }

    // --- RENDERERS ---

    export function loadRosterTab() {
        // Every roster change funnels through here (manual add/remove, Roster tab delete,
        // re-sync), so this keeps the Settings "Added this session" list in step with it.
        renderManualAddLog();
        // Same funnel keeps the Positional Power Rankings card current: rankings uploads, set
        // changes, syncs and league switches all end up here (see refreshPowerRankings).
        refreshPowerRankings();
        let league = getActiveLeague();
        const syncBtn = document.getElementById('rosterSyncBtn');
        const headerNameEl = document.getElementById('rosterLeagueHeader');
        const headerFormatEl = document.getElementById('rosterFormatBadge');

        // Dynamically update the header
        if (headerNameEl) {
            headerNameEl.innerText = league ? league.name : "Active Roster";
        }
        if (headerFormatEl) {
            headerFormatEl.innerText = league && league.formatBadge ? `(${league.formatBadge})` : "(Sorted by ROS)";
        }

        if (syncBtn) {
            if (league && league.leagueId && !league.leagueId.startsWith('manual_') && league.username) syncBtn.style.display = 'block';
            else syncBtn.style.display = 'none';
        }

        const rosterListEl = document.getElementById('rosterList');
        if (!rosterListEl) return;
        const posCountsEl = document.getElementById('rosterPosCounts');

        if (!league || !league.roster || league.roster.length === 0) {
            if (posCountsEl) { posCountsEl.hidden = true; posCountsEl.innerHTML = ''; }
            rosterPosFilter = { leagueId: league ? league.leagueId : null, pos: null };
            rosterListEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to your Roster</div>
                <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 1. Sync your Sleeper League (Dashboard)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 2. Upload ROS Rankings (Above)</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 3. Evaluate your team</div>
                </div>
            </div>`;
            return;
        }
        
        // Rookie badges need the Sleeper player map. It's usually already cached for the
        // session; the first time it isn't, the roster renders now without badges and
        // re-renders once the lookup lands. That happens at most once per session: after it
        // resolves, _rookieIndex is set and this branch is skipped. A failed lookup just
        // leaves the badges off.
        const rookieIdx = _rookieIndex;
        if (!rookieIdx) {
            getRookieIndex().then(() => loadRosterTab()).catch(e => console.warn('Rookie badges unavailable: Sleeper player map could not be loaded.', e));
        }

        // Manual/handoff players need the name index for their headshots -- same
        // render-now, redraw-once-it-lands pattern as the rookie badges above.
        ensureHeadshotNameIndex(league.roster, loadRosterTab);

        const rosIndex = rankingIndex(State.rosRankings);
        // Position ranks as the Waiver Wire shows them: a single file's are re-derived per position
        // (improvements F6); null keeps a file's own. Built once per render.
        const rosDisplay = leagueRankDisplayIndex(league, State.rosRankings, loadRosterTab);
        let displayRoster = league.roster.map(p => {
            let rObj = rosIndex.get(p.cleanName);
            const shown = displayRanksFor(rosDisplay, p.cleanName, {
                posRank: rObj ? rObj.posRank : 999,
                // No position tier of its own: the file's overall tier stands in (improvements S8, round 3).
                posTier: rObj ? (rObj.posTier ?? rObj.tier ?? null) : null
            });
            return {
                ...p, 
                rosRank: rObj ? rObj.rank : 999,
                posRank: shown.posRank,
                rosTier: rObj ? rObj.tier : null,
                posTier: shown.posTier
            };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        displayRoster.sort((a, b) => {
            if (a.rosRank !== 999 || b.rosRank !== 999) return a.rosRank - b.rosRank;
            return (posOrder[a.pos] || 99) - (posOrder[b.pos] || 99);
        });

        // Position counts over the whole roster; the picked chip (if any) narrows the list below.
        // A filter from another league, or on a position you no longer have, shows everyone.
        const posCounts = rosterPositionCounts(league.roster, league.reqs);
        let picked = rosterPosFilter.leagueId === league.leagueId ? rosterPosFilter.pos : null;
        if (picked && !posCounts.some(c => c.pos === picked && c.count > 0)) picked = null;
        rosterPosFilter = { leagueId: league.leagueId, pos: picked };
        if (posCountsEl) renderRosterPosCounts(posCountsEl, posCounts, league.roster.length, picked);
        if (picked) displayRoster = displayRoster.filter(p => p.pos === picked);

        let html = "";
        displayRoster.forEach(p => {
            let ovrStr = p.rosRank !== 999 ? `#${p.rosRank}${tierTag(p.rosTier)}` : "-";
            let posStr = p.posRank !== 999 ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
            let rankBadge = (p.rosRank !== 999 || p.posRank !== 999) ? `Ovr: ${ovrStr} | Pos: ${posStr}` : "Unranked";
            const byeWeek = getByeWeek(p.team, State.currentNflSeason);
            let byeStr = byeWeek ? ` (${byeWeek})` : "";
            let byeBadge = getByeBadgeHTML(p.team);
            // A player in your Sleeper IR slot gets an IR badge like TAXI (improvements S9). If he's
            // also on NFL IR, that one badge says it, so the red injury "IR" is left off.
            let irSlotBadge = p.isReserve ? `<span class="badge ir-slot-badge" title="In your IR slot on Sleeper">IR</span>` : "";
            let injBadge = p.inj && !(p.isReserve && p.inj === 'IR') ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
            let sosBadge = getSoSBadgeHTML(p.team, p.pos);
            // Same "R" badge as MDS roster cards and the Matchup Simulator.
            let rookieBadge = isRookiePlayer(p, rookieIdx) ? `<span class="badge badge-rookie" title="Rookie" aria-label="Rookie">R</span>` : "";
            // Status badges ride on the name line (see .mls-name-badges) rather than a row of
            // their own: a separate row made badged cards a line taller than the rest, which
            // broke up the list's rhythm at phone width. Grouped so they wrap as one unit.
            // Ordered most-permanent first: rookie holds all season, so it keeps a fixed spot
            // beside the name; injury and bye come and go after it without shifting it.
            // Same TAXI badge the Lineup tab's bench uses. isTaxi is set at Sleeper sync time, so
            // manual leagues never show it. Sits right after rookie: both are season-long
            // roster-status markers, so they stay fixed ahead of injury/bye.
            let taxiBadge = p.isTaxi ? `<span class="badge taxi-badge" title="Taxi squad">TAXI</span>` : "";
            let statusBadges = [rookieBadge, taxiBadge, irSlotBadge, injBadge, byeBadge].filter(Boolean).join('');
            
            html += `
            <div class="roster-item">
                <div class="mls-player-row-info">
                    <span class="badge pos-badge ${escapeHtml(p.pos)} mls-pos-badge-sizing">${escapeHtml(p.pos)}</span>
                    ${playerHeadshotHTML(p)}
                    <div class="mls-player-row-text">
                        <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}${statusBadges ? ` <span class="mls-name-badges">${statusBadges}</span>` : ''}</div>
                        <div class="mls-player-row-meta">
                            <span class="badge">${escapeHtml(p.team)}</span>${rankMoveChip('ros', p.cleanName)}
                            <span class="badge mls-rank-badge">${rankBadge}</span>
                            ${sosBadge}
                        </div>
                    </div>
                </div>
                <div class="mls-row-actions">
                    <button class="btn-danger" style="padding:4px 8px; border-radius:4px;" data-action="deletePlayer" data-id="${p.id}" aria-label="Remove ${escapeHtml(p.name)}">✕</button>
                </div>
            </div>`;
        });
        rosterListEl.innerHTML = html;
    }
