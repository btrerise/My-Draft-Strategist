// Moved from js/mls/legacy.js in refactor chunk 3E: the Roster tab renderer (loadRosterTab), the first
// function under RENDERERS.
import { escapeHtml } from '../../shared/html.js';
import { tierTag } from '../constants.js';
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

        if (!league || !league.roster || league.roster.length === 0) {
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
        let displayRoster = league.roster.map(p => {
            let rObj = rosIndex.get(p.cleanName);
            return {
                ...p, 
                rosRank: rObj ? rObj.rank : 999,
                posRank: rObj ? rObj.posRank : 999,
                rosTier: rObj ? rObj.tier : null,
                // No position tier of its own: the file's overall tier stands in (improvements S8, round 3).
                posTier: rObj ? (rObj.posTier ?? rObj.tier ?? null) : null
            };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        displayRoster.sort((a, b) => {
            if (a.rosRank !== 999 || b.rosRank !== 999) return a.rosRank - b.rosRank;
            return (posOrder[a.pos] || 99) - (posOrder[b.pos] || 99);
        });

        let html = "";
        displayRoster.forEach(p => {
            let ovrStr = p.rosRank !== 999 ? `#${p.rosRank}${tierTag(p.rosTier)}` : "-";
            let posStr = p.posRank !== 999 ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
            let rankBadge = (p.rosRank !== 999 || p.posRank !== 999) ? `Ovr: ${ovrStr} | Pos: ${posStr}` : "Unranked";
            const byeWeek = getByeWeek(p.team, State.currentNflSeason);
            let byeStr = byeWeek ? ` (${byeWeek})` : "";
            let byeBadge = getByeBadgeHTML(p.team);
            let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
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
            let statusBadges = [rookieBadge, taxiBadge, injBadge, byeBadge].filter(Boolean).join('');
            
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
