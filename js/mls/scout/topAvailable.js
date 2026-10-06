// --- TOP AVAILABLE (Scout tab, Waiver Wire Assistant's first mode) ---
// Added in improvements card S1. The best-ranked players nobody in the active league has rostered,
// by the rankings you've loaded. No lineup lens and no pasted list: Auto-Find answers "who beats my
// players?" and Check a List "are these players free?"; this answers "who's the best player nobody
// has?". It shares the card's Rank By, Position chips and results area with the other two modes
// (owner's choice after the first version, which was a separate card above).
//
// Everything that decides who counts as available, and in what order, is Auto-Find's own code:
// buildWaiverContext (positions from the cached Sleeper player map, the display ranks, the Would
// Start check), resolveWaiverBasis (Rank By, with its fallback note) and findFreeAgents (not in
// globalRosterMap, draft picks out, unresolvable names reported, sorted by compareForScan).
// getTopWaiverCandidatesByPosition (trade/waiverValue.js) isn't used: it ranks by ROS or Market
// only, so it can't follow a Weekly Rank By, and it drops unresolvable names silently.
//
// When it draws: whenever the Scout tab is shown in this mode (nav.js), and on a league switch,
// a mode/position/Rank By change while it's on screen. Rankings uploads and syncs happen on other
// tabs, so coming back to the Scout tab redraws with them. Paging is in memory only.
import { escapeHtml } from '../../shared/html.js';
import { FANTASY_POSITIONS } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, isConnectionError } from '../helpers.js';
import { getByeBadgeHTML } from '../lineup/gameInfo.js';
import { findFreeAgents, FLEX_POSITIONS, matchesPosFilter } from './waiverScanner.js';
import { buildWaiverContext, resolveWaiverBasis, updateWaiverScanSetting, waiverDerivedNotes, WAIVER_MODES } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { formatUnmatchedNames } from '../../shared/rankings/uploadPreview.js';
import { getFreshness } from '../../shared/freshness.js';
import { runScout } from './engine.js';

    const POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
    const PER_GROUP = 5;   // All: top 5 at each position
    const PAGE = 15;       // one position or FLEX: 15 at a time, "Show 15 more"

    let pageLimit = PAGE;

    const outputEl = () => document.getElementById('waiverOutput');
    const inTopMode = () => (State.waiverScanSettings.mode || 'top') === 'top';
    const scoutTabShown = () => {
        const tab = document.getElementById('scoutTab');
        return !!(tab && tab.classList.contains('active'));
    };

    // Mode switch. Each mode answers a different question, so the results area is cleared;
    // Top Available draws straight away (the tap is the request).
    export function setWaiverMode(mode) {
        updateWaiverScanSetting('mode', WAIVER_MODES.includes(mode) ? mode : 'top');
        const out = outputEl();
        if (out) out.innerHTML = '';
        pageLimit = PAGE;
        if (inTopMode()) renderTopAvailable();
    }

    // Position chips: the same setting the old Position dropdown wrote (Auto-Find reads it too, and
    // Check a List's Whole Roster verdict, where a pasted list already on screen is re-checked).
    export function setWaiverPos(pos) {
        updateWaiverScanSetting('pos', POSITION_FILTERS.includes(pos) ? pos : 'ALL');
        pageLimit = PAGE;
        if (inTopMode()) { renderTopAvailable(); return; }
        const s = State.waiverScanSettings;
        const input = document.getElementById('waiverInput');
        const out = outputEl();
        if (s.mode === 'list' && s.scope !== 'all' && input && input.value.trim() !== '' && out && out.innerHTML.trim() !== '') runScout('waiver');
    }

    export function showMoreTopAvailable() {
        pageLimit += PAGE;
        renderTopAvailable();
    }

    // League switch or Rank By change: redraw if the list is what's on screen.
    export function refreshTopAvailable() {
        if (!inTopMode() || !scoutTabShown()) return;
        pageLimit = PAGE;
        renderTopAvailable();
    }

    // The Scout tab was just shown (nav.js showTab).
    export function onScoutTabShown() {
        if (!inTopMode()) return;
        pageLimit = PAGE;
        renderTopAvailable();
    }

    const STARTS_ICON = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    // One compact row: #, name, team, position rank (tier), injury/bye, a Would Start flag, and the
    // cross-position number for the basis on the right (Weekly Flex for RB/WR/TE, ROS Overall).
    function rowHTML(ctx, fa, i) {
        const row = ctx.evaluate(fa);
        const { player, verdict } = row;
        const d = ctx.scanDisplay[fa.cleanName] || {};
        // The rank chip is colored like the position badges everywhere else (.pos-badge.QB etc., css/base.css).
        const posRank = d.posRank ? `${escapeHtml(player.pos)}${d.posRank}` : escapeHtml(player.pos);
        const tier = Number.isFinite(d.posTier) && d.posTier > 0 ? ` <span class="mls-ta-tier">T${d.posTier}</span>` : '';
        const cross = ctx.scanCross === 'overall' ? d.rank : (FLEX_POSITIONS.includes(player.pos) ? d.flexRank : null);
        const injBadge = player.inj ? `<span class="badge inj-badge">${escapeHtml(player.inj)}</span>` : '';
        // Only the cheap, positive half of Auto-Find's verdict; Bench/Out pills would turn the list
        // back into Auto-Find.
        const starts = verdict && verdict.status === 'starts'
            ? `<span class="mls-ta-starts" title="Would start for you this week">${STARTS_ICON}Starts</span>` : '';
        return `<li class="mls-ta-row">
            <span class="mls-ta-idx">${i + 1}.</span>
            <span class="mls-ta-player">
                <span class="mls-ta-name">${escapeHtml(fa.name)}</span>
                ${player.team ? `<span class="mls-ta-team">${escapeHtml(player.team)}</span>` : ''}
                <span class="badge pos-badge ${escapeHtml(player.pos)} mls-ta-pos">${posRank}${tier}</span>${injBadge}${getByeBadgeHTML(player.team)}
            </span>
            ${starts}
            <span class="mls-ta-num">${cross ? `#${cross}` : '&ndash;'}</span>
        </li>`;
    }

    // A box's position heading as a colored position badge; FLEX gets the RB/WR/TE blend (css/base.css).
    const posTitle = (pos) => FANTASY_POSITIONS.includes(pos) ? `<span class="badge pos-badge ${pos} mls-ta-title-badge">${pos}</span>`
        : pos === 'FLEX' ? `<span class="badge flex-blend mls-ta-title-badge">FLEX</span>` : pos;

    function listHTML(ctx, items, title, countText, extra = '') {
        const crossLabel = ctx.scanCross === 'overall' ? `${ctx.scan.label} Ovr` : 'Wk Flex';
        return `<div class="mls-ta-group">
            <div class="mls-ta-head">
                <h4 class="mls-ta-title">${posTitle(title)} <span class="mls-ta-count">&middot; ${countText}</span></h4>
                ${extra}<span class="mls-ta-col">${crossLabel}</span>
            </div>
            <ol class="mls-ta-list">${items.map((fa, i) => rowHTML(ctx, fa, i)).join('')}</ol>
        </div>`;
    }

    export async function renderTopAvailable() {
        const out = outputEl();
        if (!out) return;

        const league = getActiveLeague();
        if (!league || !league.globalRosterMap) {
            out.innerHTML = `<div class="mls-scan-empty">No league yet. Sync a Sleeper league on the Dashboard first, so the app knows who's rostered.</div>`;
            return;
        }
        const scan = resolveWaiverBasis();
        if (!scan) {
            out.innerHTML = `<div class="mls-scan-empty">No rankings loaded. Upload Weekly rankings (Lineup tab) or ROS rankings (Roster tab) first.</div>`;
            return;
        }

        const pos = POSITION_FILTERS.includes(State.waiverScanSettings.pos) ? State.waiverScanSettings.pos : 'ALL';
        const knowsWholeLeague = isFullyMappedLeague(league);
        const freeWord = knowsWholeLeague ? 'available' : 'not on your roster';
        const takenText = knowsWholeLeague ? 'rostered in this league' : 'on your roster';
        try {
            const ctx = await buildWaiverContext(league);
            // A league switch or mode change while the player map loaded: the newer call draws.
            if (getActiveLeague() !== league || !inTopMode()) return;

            const { freeAgents, unresolvedCount, unresolvedNames } = findFreeAgents(scan.rankings, {
                posFilter: pos === 'FLEX' ? 'FLEX' : 'ALL',
                getPos: ctx.getPos,
                isRostered: (clean) => !!league.globalRosterMap[clean],
                isExcluded: (r) => isDraftPickName(r.name)
            });

            // How many players the rankings rank at each position, so an empty list can say
            // whether everyone is taken or the file doesn't rank that position at all.
            const rankedAtPos = {};
            scan.rankings.forEach(r => {
                if (!r || !r.cleanName || isDraftPickName(r.name)) return;
                const p = ctx.getPos(r.cleanName);
                if (p && p !== 'UNK') rankedAtPos[p] = (rankedAtPos[p] || 0) + 1;
            });
            const rankedIn = (filter) => FANTASY_POSITIONS.filter(p => matchesPosFilter(p, filter)).reduce((n, p) => n + (rankedAtPos[p] || 0), 0);
            const groupName = (filter) => filter === 'FLEX' ? 'RB/WR/TE' : filter === 'ALL' ? 'player' : filter;
            const noneText = (filter) => {
                const n = rankedIn(filter);
                return n > 0
                    ? `Every ${groupName(filter)} in your ${scan.name} rankings (${n} ranked) is already ${takenText}. A deeper rankings file would show who's left.`
                    : `Your ${scan.name} rankings don't include any ${groupName(filter)}.`;
            };

            const notes = [];
            if (knowsWholeLeague) {
                const fresh = getFreshness(league.lastSyncedAt, 2, 'synced');
                notes.push(`Ownership is from this league's last sync${fresh ? ` (${fresh.label})` : ''}. Re-run <strong>Sync All</strong> on the Dashboard if a recent add or drop is missing.`);
            } else {
                notes.push(`This is a manual league, so the app only knows your own roster. Everyone below is off your roster, but some may be on other teams - check your league before putting in a claim.`);
            }
            if (scan.note) notes.push(scan.note);
            notes.push(...waiverDerivedNotes(ctx));
            if (unresolvedCount > 0) notes.push(`${unresolvedCount} ranked name${unresolvedCount === 1 ? '' : 's'} couldn't be matched to a Sleeper player and ${unresolvedCount === 1 ? 'was' : 'were'} left out: ${formatUnmatchedNames(unresolvedNames)} Usually a spelling difference; renaming them in your rankings file to match Sleeper brings them back.`);

            let body;
            if (pos === 'ALL') {
                if (freeAgents.length === 0) {
                    body = `<div class="mls-scan-empty">${noneText('ALL')}</div>`;
                } else {
                    // Grouped by position (ranks from different positions aren't on one scale), in a
                    // grid that is two columns on desktop. Positions the file doesn't rank are left out.
                    body = `<div class="mls-ta-grid">${FANTASY_POSITIONS.filter(p => rankedIn(p) > 0).map(p => {
                        const items = freeAgents.filter(f => f.pos === p);
                        if (items.length === 0) {
                            return `<div class="mls-ta-group"><div class="mls-ta-head"><h4 class="mls-ta-title">${posTitle(p)} <span class="mls-ta-count">&middot; none ${freeWord}</span></h4></div><div class="mls-scan-empty">${noneText(p)}</div></div>`;
                        }
                        const more = items.length > PER_GROUP
                            ? `<button type="button" class="btn-bare mls-ta-more-link" data-action="setWaiverPos" data-pos="${p}">See all ${items.length}</button>` : '';
                        return listHTML(ctx, items.slice(0, PER_GROUP), p, `${items.length} ${freeWord}`, more);
                    }).join('')}</div>`;
                }
            } else {
                const items = pos === 'FLEX' ? freeAgents : freeAgents.filter(f => f.pos === pos);
                if (items.length === 0) {
                    body = `<div class="mls-scan-empty">${noneText(pos)}</div>`;
                } else {
                    const shown = items.slice(0, pageLimit);
                    const left = items.length - shown.length;
                    body = listHTML(ctx, shown, pos === 'FLEX' ? 'FLEX' : pos, `showing ${shown.length} of ${items.length} ${freeWord}`)
                        + (left > 0 ? `<button type="button" class="btn btn-secondary mls-ta-more" data-action="showMoreTopAvailable">Show ${Math.min(PAGE, left)} more</button>` : '');
                }
            }

            // "Top available WRs in X", or "Top WRs not on your roster in X" in a manual league.
            const which = pos === 'ALL' ? 'players' : pos === 'FLEX' ? 'RB/WR/TE' : `${pos}s`;
            const lead = knowsWholeLeague ? `Top available ${which}` : `Top ${which} not on your roster`;
            out.innerHTML = `
            <div class="mls-scan-summary">
                ${lead} in <strong>${escapeHtml(league.name || 'this league')}</strong> by <strong>${scan.name} rank</strong>.
                <ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>
            </div>${body}`;
        } catch (err) {
            console.error('Top Available failed:', err);
            const leagueName = escapeHtml(league.name || 'this league');
            out.innerHTML = isConnectionError(err)
                ? `<span class="mls-error-text">Couldn't reach Sleeper to list the top available players in ${leagueName}. Check your connection and try again.</span>`
                : `<span class="mls-error-text">Couldn't list the top available players in ${leagueName} - its saved roster data may be out of date. Tap Sync All Leagues on the Dashboard, then try again.</span>`;
        }
    }
