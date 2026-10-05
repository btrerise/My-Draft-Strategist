// --- TOP AVAILABLE (Scout tab) ---
// Added in improvements card S1. The best-ranked players nobody in the active league has rostered,
// by the rankings you've loaded, with a position filter. No lineup lens and no pasted list: Auto-Find
// answers "who beats my players?" and Scan Pasted List "are these players free?"; this answers
// "who's the best player nobody has?".
//
// Everything that decides who counts as available, and in what order, is Auto-Find's own code:
// buildWaiverContext (positions from the cached Sleeper player map, the display ranks, the Would
// Start check), resolveWaiverBasis (the shared Rank By choice, with its fallback note) and
// findFreeAgents (not in globalRosterMap, draft picks out, unresolvable names reported, sorted by
// compareForScan). getTopWaiverCandidatesByPosition (trade/waiverValue.js) isn't used: it ranks by
// ROS or Market only, so it can't follow a Weekly Rank By, and it drops unresolvable names silently.
//
// Chips and paging live in memory (reset on reload); Rank By is the waiver scan's existing setting.
import { escapeHtml } from '../../shared/html.js';
import { FANTASY_POSITIONS } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, isConnectionError } from '../helpers.js';
import { getByeBadgeHTML, getGameInfoHTML } from '../lineup/gameInfo.js';
import { findFreeAgents, matchesPosFilter } from './waiverScanner.js';
import { buildWaiverContext, resolveWaiverBasis, updateWaiverScanSetting, waiverDerivedNotes, waiverRanksRowHTML, waiverVerdictParts } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { formatUnmatchedNames } from '../../shared/rankings/uploadPreview.js';
import { getFreshness } from '../../shared/freshness.js';

    export const TOP_AVAILABLE_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
    const PER_GROUP = 5;   // All: top 5 at each position
    const PAGE = 15;       // one position or FLEX: 15 at a time, "Show 15 more"

    const view = { pos: 'ALL', limit: PAGE, shown: false };

    const outputEl = () => document.getElementById('topAvailableOutput');

    // Chip and Rank By buttons reflect the current choice (aria-pressed for screen readers).
    export function applyTopAvailableUI() {
        document.querySelectorAll('#topAvailablePosChips [data-pos]').forEach(b => {
            const on = b.dataset.pos === view.pos;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const ros = State.waiverScanSettings.basis === 'ros';
        document.querySelectorAll('#topAvailableBasisToggle [data-basis]').forEach(b => {
            const on = (b.dataset.basis === 'ros') === ros;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    export function setTopAvailablePos(pos) {
        view.pos = TOP_AVAILABLE_FILTERS.includes(pos) ? pos : 'ALL';
        view.limit = PAGE;
        applyTopAvailableUI();
        if (view.shown) showTopAvailable();
    }

    // Writes the waiver scan's Rank By (the same setting as its dropdown), so the two never disagree.
    export function setTopAvailableBasis(basis) {
        updateWaiverScanSetting('basis', basis === 'ros' ? 'ros' : 'weekly');
        applyTopAvailableUI();
        refreshTopAvailable();
    }

    export function showMoreTopAvailable() {
        view.limit += PAGE;
        if (view.shown) showTopAvailable();
    }

    // Re-run only if the list is on screen: after a league switch or a Rank By change elsewhere.
    export function refreshTopAvailable() {
        applyTopAvailableUI();
        if (view.shown) {
            view.limit = PAGE;
            showTopAvailable();
        }
    }

    function topAvailableRowHTML(ctx, fa, knowsWholeLeague) {
        const row = ctx.evaluate(fa);
        const { player, verdict } = row;
        // Only the cheap, positive half of Auto-Find's verdict: a Would Start pill. Bench / Out
        // pills would turn a plain list back into Auto-Find.
        const pill = verdict && verdict.status === 'starts' ? waiverVerdictParts(ctx, row).pill : '';
        const injBadge = player.inj ? `<span class="badge inj-badge">${escapeHtml(player.inj)}</span>` : '';
        const teamText = player.team ? `<span class="mls-opp">${escapeHtml(player.team)}</span>` : '';
        const notMine = knowsWholeLeague ? '' : `<span class="mls-topavail-notmine">Not on your roster</span>`;
        return `
        <div class="scout-result-card mls-scan-card mls-topavail-row">
            <div class="mls-scan-main">
                <div class="mls-item-name mls-topavail-name">
                    <span class="badge pos-badge ${escapeHtml(player.pos)} mls-pos-badge-sizing">${escapeHtml(player.pos)}</span>
                    <span>${escapeHtml(fa.name)}</span>
                    ${teamText}
                </div>
                <div class="mls-player-badges-row">${notMine}${injBadge}${getByeBadgeHTML(player.team)}${getGameInfoHTML(player.team)}</div>
                ${waiverRanksRowHTML(ctx, fa.cleanName, player.pos)}
            </div>
            <div class="mls-text-right">${pill}</div>
        </div>`;
    }

    export async function showTopAvailable() {
        const out = outputEl();
        if (!out) return;
        view.shown = true;
        applyTopAvailableUI();

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

        const knowsWholeLeague = isFullyMappedLeague(league);
        const freeWord = knowsWholeLeague ? 'available' : 'not on your roster';
        const takenText = knowsWholeLeague ? 'rostered in this league' : 'on your roster';
        try {
            const ctx = await buildWaiverContext(league);
            // A league switch while the player map loaded: the newer call draws its own list.
            if (getActiveLeague() !== league) return;

            const { freeAgents, unresolvedCount, unresolvedNames } = findFreeAgents(scan.rankings, {
                posFilter: view.pos === 'FLEX' ? 'FLEX' : 'ALL',
                getPos: ctx.getPos,
                isRostered: (clean) => !!league.globalRosterMap[clean],
                isExcluded: (r) => isDraftPickName(r.name)
            });

            // How many players the rankings rank at each position, so an empty list can say
            // whether everyone is taken or the file doesn't rank that position at all.
            const rankedAtPos = {};
            scan.rankings.forEach(r => {
                if (!r || !r.cleanName || isDraftPickName(r.name)) return;
                const pos = ctx.getPos(r.cleanName);
                if (pos && pos !== 'UNK') rankedAtPos[pos] = (rankedAtPos[pos] || 0) + 1;
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
            if (view.pos === 'ALL') {
                if (freeAgents.length === 0) {
                    body = `<div class="mls-scan-empty">${noneText('ALL')}</div>`;
                } else {
                    // Grouped by position: ranks from different positions aren't on one scale.
                    // Positions the file doesn't rank at all are left out.
                    body = FANTASY_POSITIONS.filter(pos => rankedIn(pos) > 0).map(pos => {
                        const items = freeAgents.filter(f => f.pos === pos);
                        const more = items.length > PER_GROUP
                            ? `<button type="button" class="btn-bare mls-topavail-more-link" data-action="setTopAvailablePos" data-pos="${pos}">See all ${items.length}</button>` : '';
                        const rows = items.length
                            ? items.slice(0, PER_GROUP).map(fa => topAvailableRowHTML(ctx, fa, knowsWholeLeague)).join('')
                            : `<div class="mls-scan-empty">${noneText(pos)}</div>`;
                        return `<div class="mls-topavail-group">
                            <h4 class="mls-topavail-group-title">${pos} <span class="mls-topavail-count">&middot; ${items.length} ${freeWord}</span>${more}</h4>
                            ${rows}
                        </div>`;
                    }).join('');
                }
            } else {
                const items = view.pos === 'FLEX' ? freeAgents : freeAgents.filter(f => f.pos === view.pos);
                if (items.length === 0) {
                    body = `<div class="mls-scan-empty">${noneText(view.pos)}</div>`;
                } else {
                    const shown = items.slice(0, view.limit);
                    const left = items.length - shown.length;
                    body = `<div class="mls-topavail-count-line">Showing ${shown.length} of ${items.length} ${freeWord}.</div>`
                        + shown.map(fa => topAvailableRowHTML(ctx, fa, knowsWholeLeague)).join('')
                        + (left > 0 ? `<button type="button" class="btn btn-secondary mls-topavail-more" data-action="showMoreTopAvailable">Show ${Math.min(PAGE, left)} more</button>` : '');
                }
            }

            // "Top available WRs in X", or "Top WRs not on your roster in X" in a manual league.
            const which = view.pos === 'ALL' ? 'players' : view.pos === 'FLEX' ? 'RB/WR/TE' : `${view.pos}s`;
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

    export function clearTopAvailable() {
        view.shown = false;
        view.limit = PAGE;
        const out = outputEl();
        if (out) out.innerHTML = '';
    }
