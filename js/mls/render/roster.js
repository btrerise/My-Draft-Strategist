// Moved from js/mls/legacy.js in refactor chunk 3E: the Roster tab renderer (loadRosterTab), the first
// function under RENDERERS.
import { escapeHtml } from '../../shared/html.js';
import { tierTag, SLOT_POSITIONS } from '../constants.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { State } from '../state.js';
import { rankingIndex, getActiveLeague } from '../helpers.js';
import { ensureHeadshotNameIndex, playerHeadshotHTML } from '../lineup/headshots.js';
import { getByeBadgeHTML, getInjuryBadgeHTML, getIrSlotBadgeHTML } from '../lineup/gameInfo.js';
import { renderManualAddLog } from '../leagues/addPlayer.js';
import { getSoSBadgeHTML } from '../sos.js';
import { _rookieIndex, getRookieIndex, isRookiePlayer } from './rookies.js';
import { fitRankBadges, refreshPowerRankings } from '../main.js';
import { rankMoveChip } from '../rankings/moveChips.js';
import { posCountChipMarkup, rankBadgeParts, rankGapChipMarkup } from '../badges.js';
import { displayRanksFor, leagueRankDisplayIndex } from '../rankings/displayRanks.js';
import { ordinal } from '../week/scoreboard.js';
import { hasSeasonSlot, seasonOffer, seasonSetFor } from '../rankings/season.js';
import { rankGap, rankGapTip } from '../rankings/nowAndLater.js';
import { KEYS } from '../../shared/storage/keys.js';

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
    // The redraw replaces the chips, so a chip that had focus (keyboard use) hands it to its new self;
    // otherwise focus would fall back to the top of the page.
    export function setRosterPosFilter(pos) {
        const league = getActiveLeague();
        const current = league && rosterPosFilter.leagueId === league.leagueId ? rosterPosFilter.pos : null;
        rosterPosFilter = { leagueId: league ? league.leagueId : null, pos: (!pos || pos === 'ALL' || pos === current) ? null : pos };
        const active = document.activeElement;
        const hadFocus = !!(active && active.closest && active.closest('#rosterPosCounts'));
        loadRosterTab();
        if (hadFocus) {
            const strip = document.getElementById('rosterPosCounts');
            const again = strip && [...strip.querySelectorAll('button[data-pos]')].find(b => b.dataset.pos === (pos || 'ALL'));
            if (again) again.focus();
        }
    }

    function renderRosterPosCounts(el, counts, total, picked) {
        // One note per line ("1 IR" over "1 taxi"), so a narrow chip never breaks a note in two.
        const notesOf = c => [c.ir ? `${c.ir} IR` : '', c.taxi ? `${c.taxi} taxi` : ''].filter(Boolean);
        const chip = (pos, label, count, notes, colorClass, extra = '') => {
            const on = picked === pos || (pos === 'ALL' && !picked);
            return posCountChipMarkup(pos, label, count, notes, colorClass, { lit: !picked || on, on, extra });
        };
        el.innerHTML = chip('ALL', 'All', total, [], 'badge-all')
            + counts.map(c => chip(c.pos, c.pos, c.count, notesOf(c),
                POS_COUNT_ORDER.includes(c.pos) ? `pos-badge ${c.pos}` : '',
                c.count === 0 ? ' disabled' : '')).join('');
        el.hidden = false;
    }

    // --- SORT: DYNASTY | IN-SEASON (improvements S24) ---
    // In a dynasty or keeper league with an In-Season set the rows show both sets' ranks, but a list sorts by one. The
    // choice is saved on the league (league.rosterSortSeason, carried over by a sync), so no storage key; Dynasty, as
    // before, by default.
    export function setRosterSort(sort) {
        const league = getActiveLeague();
        if (!league) return;
        league.rosterSortSeason = sort === 'season';
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        const hadFocus = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#rosterSort'));
        loadRosterTab();
        if (hadFocus) document.querySelector(`#rosterSort button[data-sort="${sort === 'season' ? 'season' : 'dynasty'}"]`)?.focus();
    }

    // Both sets' ranks in one badge (round 3, after the owner's review: two badges with overall ranks and repeated tiers
    // made rows three or four lines tall): "In-Season WR16 (T8) | Dyn WR20 (T6)", position ranks only, each tier once.
    // Overall ranks don't compare across a 1QB redraft set and a superflex dynasty one, so they're in the title. The
    // halves are rankBadgeParts' (F6), so a narrow row splits the badge at the bar (fitRankBadges).
    function dualRankBadge(pos, now, later) {
        const half = (label, r) => r.posRank !== 999 ? `${label} ${escapeHtml(pos)}${r.posRank}${tierTag(r.posTier)}`
            : r.rank !== 999 ? `${label} #${r.rank}${tierTag(r.tier)}` : `${label} UR`;
        const ovr = (r) => r.rank !== 999 ? `#${r.rank}` : 'unranked';
        const title = `Overall: In-Season ${ovr(now)}, dynasty ${ovr(later)}`;
        return `<span class="badge mls-rank-badge mls-rank-dual" title="${title}">${rankBadgeParts(half('<span class="mls-nowrap">In-Season</span>', now), half('Dyn', later))}</span>`;
    }

    // A two-part badge whose halves landed on two lines gets .is-stacked, so its box fits its text (the Lineup tab's
    // fitRankBadges, render/lineup.js, through main.js). Refit when the list's width changes (rotation, the tab shown).
    let _rosterBadgeObserver = null;
    function fitRosterRankBadges(listEl) {
        fitRankBadges([listEl]);
        if (_rosterBadgeObserver || typeof ResizeObserver === 'undefined') return;
        let width = null;
        _rosterBadgeObserver = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width === width) return;
            width = entry.contentRect.width;
            requestAnimationFrame(() => fitRankBadges([listEl]));
        });
        _rosterBadgeObserver.observe(listEl);
    }

    // A player's overall and position ranks (with tiers) in one set, as the rows show them (F6's display ranks).
    function ranksIn(index, display, cleanName) {
        const o = index.get(cleanName);
        const shown = displayRanksFor(display, cleanName, {
            posRank: o ? o.posRank : 999,
            // No position tier of its own: the file's overall tier stands in (improvements S8, round 3).
            posTier: o ? (o.posTier ?? o.tier ?? null) : null
        });
        return { rank: o ? o.rank : 999, tier: o ? o.tier : null, posRank: shown.posRank ?? 999, posTier: shown.posTier };
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
        renderRosterRecord(league);

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
        // A dynasty or keeper league with an In-Season set and its dynasty set loaded (improvements S24): each row shows
        // both sets' ranks, a chip when they're far apart, and the list sorts by the one picked above it.
        const seasonSet = State.rosRankings.length > 0 ? seasonSetFor(league, State.rankingSets.ros) : null;
        const seasonIndex = seasonSet ? rankingIndex(seasonSet.data) : null;
        const seasonDisplay = seasonSet ? leagueRankDisplayIndex(league, seasonSet.data, loadRosterTab) : null;
        const sortSeason = !!(seasonSet && league.rosterSortSeason);
        let displayRoster = league.roster.map(p => {
            const ros = ranksIn(rosIndex, rosDisplay, p.cleanName);
            return {
                ...p, 
                rosRank: ros.rank,
                posRank: ros.posRank,
                rosTier: ros.tier,
                posTier: ros.posTier,
                now: seasonIndex ? ranksIn(seasonIndex, seasonDisplay, p.cleanName) : null
            };
        });

        const posOrder = { "QB": 1, "RB": 2, "WR": 3, "TE": 4, "K": 5, "DEF": 6 };
        const sortRank = (p) => sortSeason ? p.now.rank : p.rosRank;
        displayRoster.sort((a, b) => {
            if (sortRank(a) !== 999 || sortRank(b) !== 999) return sortRank(a) - sortRank(b);
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
        // A dynasty or keeper league with an In-Season set (improvements S23, round 13): these rows show the dynasty set's
        // ranks while the Lineup tab and Power Rankings' Start read In-Season, so say which. Both ranks per row are S24.
        // Since S24 each row shows both, so the line names both sets, with the sort switch under it.
        if (seasonSet) {
            const dyn = league.rosRankingSetId ? State.rankingSets.ros.find(s => s.id === league.rosRankingSetId) : null;
            html += `<div class="mls-roster-source">Ranks by your <span class="mls-nowrap">In-Season</span> rankings (<strong>${escapeHtml(seasonSet.name || '')}</strong>) and your dynasty rankings${dyn ? ` (<strong>${escapeHtml(dyn.name)}</strong>)` : ''}.</div>`;
            const btn = (sort, label) => {
                const on = (sort === 'season') === sortSeason;
                return `<button type="button" class="mls-segmented-btn${on ? ' active' : ''}" data-action="setRosterSort" data-sort="${sort}" aria-pressed="${on}">${label}</button>`;
            };
            html += `<div class="mls-roster-sort" id="rosterSort"><span>Sort by</span><div class="mls-segmented" role="group" aria-label="Sort your roster by">${btn('dynasty', 'Dynasty')}${btn('season', '<span class="mls-nowrap">In-Season</span>')}</div></div>`;
        } else if (hasSeasonSlot(league) && State.rosRankings.length > 0) {
            // A dynasty or keeper league with no In-Season set shows only its dynasty ranks, as before S24. Say so, and how
            // to get both (owner's report: after restoring a backup the app opened on such a league, and both ranks, the
            // chips and the Trade Analyzer's two verdicts looked broken). The offer is the ROS card's own (S23).
            const offer = seasonOffer(league, State.leagues, State.rankingSets.ros);
            html += `<div class="mls-roster-season-hint" data-season-hint>No <span class="mls-nowrap">In-Season</span> rankings in this league, so these are your dynasty ranks alone. `
                + (offer
                    ? `Your redraft leagues use <strong>${escapeHtml(offer.name)}</strong>: <button type="button" class="mls-btn-sm btn-link-inline" data-action="useSeasonOffer" data-set-id="${escapeHtml(offer.id)}">Use it here</button> to see this season's ranks beside them.`
                    : `Choose <span class="mls-nowrap">In-Season</span> rankings in the card above to see this season's ranks beside them.`)
                + `</div>`;
        }
        displayRoster.forEach(p => {
            let ovrStr = p.rosRank !== 999 ? `#${p.rosRank}${tierTag(p.rosTier)}` : "-";
            let posStr = p.posRank !== 999 ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
            let rankBadge = (p.rosRank !== 999 || p.posRank !== 999) ? `Ovr: ${ovrStr} | Pos: ${posStr}` : "Unranked";
            // Both sets (S24): one badge with both ranks (In-Season first), each set's rank-change chip before it, and the
            // gap chip after it when they're far apart.
            let ranksHTML = `${rankMoveChip('ros', p.cleanName)}
                            <span class="badge mls-rank-badge">${rankBadge}</span>`, dualHTML = '';
            if (p.now) {
                // Not in a set at all (overall 999) counts as far below it (rankings/nowAndLater.js).
                const nowPos = p.now.rank === 999 ? null : p.now.posRank, laterPos = p.rosRank === 999 ? null : p.posRank;
                const gap = rankGap(p.pos, nowPos, laterPos);
                // Team, change chips and SoS first; the badge (and gap chip) after them, on a line of its own on phones
                // (.mls-meta-break), so every row has the same shape (round 3).
                ranksHTML = `${rankMoveChip('season', p.cleanName)}${rankMoveChip('ros', p.cleanName)}`;
                dualHTML = `<span class="mls-meta-break" aria-hidden="true"></span>
                            ${dualRankBadge(p.pos, p.now, { rank: p.rosRank, tier: p.rosTier, posRank: p.posRank, posTier: p.posTier })}
                            ${gap ? rankGapChipMarkup(gap, rankGapTip(gap, p.pos, nowPos, laterPos)) : ''}`;
            }
            const byeWeek = getByeWeek(p.team, State.currentNflSeason);
            let byeStr = byeWeek ? ` (${byeWeek})` : "";
            let byeBadge = getByeBadgeHTML(p.team);
            // IR-slot badge (Sleeper IR slot) and the injury badge, shared with the Lineup tab
            // (js/mls/lineup/gameInfo.js; improvements S9).
            let irSlotBadge = getIrSlotBadgeHTML(p);
            let injBadge = getInjuryBadgeHTML(p);
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
                            <span class="badge">${escapeHtml(p.team)}</span>${ranksHTML}
                            ${sosBadge}${dualHTML}
                        </div>
                    </div>
                </div>
                <div class="mls-row-actions">
                    <button class="btn-danger" style="padding:4px 8px; border-radius:4px;" data-action="deletePlayer" data-id="${p.id}" aria-label="Remove ${escapeHtml(p.name)}">✕</button>
                </div>
            </div>`;
        });
        rosterListEl.innerHTML = html;
        if (seasonSet) fitRosterRankBadges(rosterListEl);
    }

// Your season record under the Roster tab's league name (improvements S21, the owner's ask): W-L, and where your
// points for and against rank in the league (1st = the most), as of the league's last sync (league.record, set by
// processSleeperData). Hidden for manual leagues, a league synced before S21, and before anyone has played.
function renderRosterRecord(league) {
    const el = document.getElementById('rosterRecord');
    if (!el) return;
    const r = league && league.record;
    if (!r) { el.hidden = true; el.textContent = ''; return; }
    const wl = `${r.wins}\u2013${r.losses}${r.ties ? `\u2013${r.ties}` : ''}`;
    el.innerHTML = `<span class="mls-roster-record-part">Record <strong class="mls-roster-record-wl">${wl}</strong></span>`
        + `<span class="mls-roster-record-part">Points for ${ordinal(r.pfRank)} of ${r.of} <span class="text-helper">(${r.pf.toFixed(1)})</span></span>`
        + `<span class="mls-roster-record-part">Points against ${ordinal(r.paRank)} of ${r.of} <span class="text-helper">(${r.pa.toFixed(1)})</span></span>`;
    el.title = 'This season, as of your last sync. 1st = the most points in your league.';
    el.hidden = false;
}

