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
//
// Sleeper trending adds (improvements S6): beside your rankings, never blended into them. Rows of a
// player in Sleeper's 50 most-added of the last 24 hours get a trending-up icon (the count is in its
// tooltip), and a "Your rankings | Trending" toggle shows those players that are still free here,
// most adds first, each with your position rank or UR. Rank order never changes. The fetch runs in the
// background after the list draws, so a slow Sleeper never holds the list up; when it fails (offline,
// an outage) the icon and the toggle simply don't show. The view choice is in memory only.
import { escapeHtml } from '../../shared/html.js';
import { getSleeperPlayerMap, getSleeperTrendingAdds } from '../../shared/api/sleeper.js';
import { normalizeName } from '../../shared/names.js';
import { FANTASY_POSITIONS, fantasyPosition } from '../constants.js';
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

    // --- SLEEPER TRENDING ADDS (S6) ---
    const TRENDING = { lookbackHours: 24, limit: 50 };   // owner's choice before building
    const TREND_REFRESH_MS = 60 * 60 * 1000;             // matches getSleeperTrendingAdds' cache
    const TREND_RETRY_MS = 5 * 60 * 1000;                // after a failure, don't ask again on every redraw
    let topView = 'ranked';                              // 'ranked' | 'trending'
    let trend = null;                                    // { rows: [{ player_id, count }], byId: Map, at }
    let trendLoading = false;
    let trendFailedAt = 0;

    // Starts the fetch when there's nothing fresh and no recent failure. A success redraws the list if
    // it's still on screen, which adds the icons and the toggle; a failure drops what was shown.
    function ensureTrending() {
        const now = Date.now();
        if (trendLoading) return;
        if (trend && now - trend.at < TREND_REFRESH_MS) return;
        if (trendFailedAt && now - trendFailedAt < TREND_RETRY_MS) return;
        trendLoading = true;
        getSleeperTrendingAdds(TRENDING).then(rows => {
            trend = { rows, byId: new Map(rows.map(r => [r.player_id, r.count])), at: Date.now() };
            trendFailedAt = 0;
        }, err => {
            // Quiet by design (the card's rule): no toast, no console.error; the UI just hides it.
            console.warn('Sleeper trending adds unavailable; hiding the trending icons and view.', err);
            trend = null;
            trendFailedAt = Date.now();
        }).finally(() => {
            trendLoading = false;
            if (inTopMode() && scoutTabShown()) renderTopAvailable();
        });
    }

    // "Your rankings | Trending", above the position chips. Shown only once trending data is in and
    // there's a list to look at (a league and rankings), so nothing moves on a page without them.
    function updateTopViewToggle(show) {
        const wrap = document.getElementById('waiverTopViewWrap');
        if (!wrap) return;
        wrap.hidden = !show;
        wrap.querySelectorAll('[data-view]').forEach(b => {
            const on = b.dataset.view === (show ? topView : 'ranked');
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    export function setTopAvailableView(view) {
        topView = view === 'trending' ? 'trending' : 'ranked';
        pageLimit = PAGE;
        renderTopAvailable();
    }

    // 8214 -> "8.2k", 15400 -> "15k", 640 -> "640".
    function compactCount(n) {
        if (n < 1000) return String(n);
        if (n < 10000) return `${(Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
        return `${Math.round(n / 1000)}k`;
    }
    const addsText = (n) => `Added in ${n.toLocaleString('en-US')} Sleeper leagues in the last ${TRENDING.lookbackHours} hours`;

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

    // Feather trending-up.
    const TREND_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
    // The icon alone (owner's choice: rows are tight on a phone); the count is in the tooltip and the label.
    const trendBadgeHTML = (count) => `<span class="mls-ta-trend" role="img" title="${addsText(count)}" aria-label="Trending: ${addsText(count).toLowerCase()}">${TREND_ICON}</span>`;

    const STARTS_ICON = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    // One compact row: #, name, team, position rank (tier), injury/bye, a Would Start flag, and the
    // cross-position number for the basis on the right (Weekly Flex for RB/WR/TE, ROS Overall).
    function rowHTML(ctx, fa, i) {
        const row = ctx.evaluate(fa);
        const sleeperId = ctx.meta[fa.cleanName] && ctx.meta[fa.cleanName].id;
        const adds = trend && sleeperId ? trend.byId.get(String(sleeperId)) : undefined;
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
                <span class="badge pos-badge ${escapeHtml(player.pos)} mls-ta-pos">${posRank}${tier}</span>${adds ? trendBadgeHTML(adds) : ''}${injBadge}${getByeBadgeHTML(player.team)}
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

    // One Trending row: like rowHTML, but the chip is your position rank or "UR", and the number on
    // the right is Sleeper's add count (the list's order).
    function trendRowHTML(ctx, t, i) {
        const { player, verdict } = ctx.evaluate(t);
        const team = t.team || player.team;
        const d = ctx.scanDisplay[t.cleanName] || {};
        const ranked = !!ctx.scan.byName[t.cleanName];
        const chip = ranked
            ? `${escapeHtml(t.pos)}${d.posRank || ''}${Number.isFinite(d.posTier) && d.posTier > 0 ? ` <span class="mls-ta-tier">T${d.posTier}</span>` : ''}`
            : `${escapeHtml(t.pos)} <span class="mls-ta-tier" title="Not in your ${ctx.scan.name} rankings">UR</span>`;
        const injBadge = player.inj ? `<span class="badge inj-badge">${escapeHtml(player.inj)}</span>` : '';
        const starts = verdict && verdict.status === 'starts'
            ? `<span class="mls-ta-starts" title="Would start for you this week">${STARTS_ICON}Starts</span>` : '';
        return `<li class="mls-ta-row">
            <span class="mls-ta-idx">${i + 1}.</span>
            <span class="mls-ta-player">
                <span class="mls-ta-name">${escapeHtml(t.name)}</span>
                ${team ? `<span class="mls-ta-team">${escapeHtml(team)}</span>` : ''}
                <span class="badge pos-badge ${escapeHtml(t.pos)} mls-ta-pos">${chip}</span>${injBadge}${getByeBadgeHTML(team)}
            </span>
            ${starts}
            <span class="mls-ta-num" title="${addsText(t.count)}">${compactCount(t.count)}</span>
        </li>`;
    }

    // The Trending view's body: Sleeper's trending adds that are free here (by the same
    // globalRosterMap test as the ranked list) and match the position chip, most adds first.
    function trendingBodyHTML(ctx, map, league, pos, freeWord) {
        const items = [];
        trend.rows.forEach(({ player_id, count }) => {
            const p = map[player_id];
            const pPos = p && fantasyPosition(p);
            if (!p || !p.first_name || !FANTASY_POSITIONS.includes(pPos)) return;
            const clean = normalizeName(`${p.first_name} ${p.last_name}`);
            if (league.globalRosterMap[clean] || !matchesPosFilter(pPos, pos)) return;
            items.push({ name: `${p.first_name} ${p.last_name}`, cleanName: clean, pos: pPos, team: p.team || null, count });
        });
        items.sort((a, b) => b.count - a.count);
        const among = `Sleeper's ${trend.rows.length} most-added players of the last ${TRENDING.lookbackHours} hours`;
        if (items.length === 0) {
            const who = pos === 'ALL' ? 'None of' : pos === 'FLEX' ? 'No RB, WR or TE among' : `No ${pos} among`;
            return `<div class="mls-scan-empty">${who} ${among} is ${freeWord === 'available' ? 'available in this league' : 'off your roster'}.</div>`;
        }
        const title = pos === 'ALL' ? 'Trending' : pos;
        return `<div class="mls-ta-group mls-ta-trending">
            <div class="mls-ta-head">
                <h4 class="mls-ta-title">${pos === 'ALL' ? `<span class="mls-ta-trend-title">${TREND_ICON}Trending</span>` : posTitle(title)} <span class="mls-ta-count">&middot; ${items.length} ${freeWord}</span></h4>
                <span class="mls-ta-col">Adds ${TRENDING.lookbackHours}h</span>
            </div>
            <ol class="mls-ta-list">${items.map((t, i) => trendRowHTML(ctx, t, i)).join('')}</ol>
        </div>`;
    }

    export async function renderTopAvailable() {
        const out = outputEl();
        if (!out) return;

        const league = getActiveLeague();
        if (!league || !league.globalRosterMap) {
            updateTopViewToggle(false);
            out.innerHTML = `<div class="mls-scan-empty">No league yet. Sync a Sleeper league on the Dashboard first, so the app knows who's rostered.</div>`;
            return;
        }
        const scan = resolveWaiverBasis();
        if (!scan) {
            updateTopViewToggle(false);
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
            ensureTrending();
            // Trending needs the data and the player map (to put names to Sleeper's ids; already in
            // memory when buildWaiverContext got it, and when it didn't, trending stays hidden).
            let trendMap = null;
            if (trend && Object.keys(ctx.meta).length > 0) {
                try { trendMap = await getSleeperPlayerMap(); } catch (e) { trendMap = null; }
                if (getActiveLeague() !== league || !inTopMode()) return;
            }
            const showTrending = !!trendMap && topView === 'trending';
            updateTopViewToggle(!!trendMap);

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
            if (showTrending) {
                body = trendingBodyHTML(ctx, trendMap, league, pos, freeWord);
            } else if (pos === 'ALL') {
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
            const leagueName = `<strong>${escapeHtml(league.name || 'this league')}</strong>`;
            const summary = showTrending
                ? `Sleeper's most-added ${which} in the last ${TRENDING.lookbackHours} hours ${knowsWholeLeague ? 'still available' : 'not on your roster'} in ${leagueName}, most adds first. Beside each: your <strong>${scan.name}</strong> position rank, or UR when your rankings don't include him.`
                : `${lead} in ${leagueName} by <strong>${scan.name} rank</strong>.`;
            out.innerHTML = `
            <div class="mls-scan-summary">
                ${summary}
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
