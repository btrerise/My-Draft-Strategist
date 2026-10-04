// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3C: ALL-LEAGUES PLAYER
// SEARCH.
import { escapeHtml } from '../../shared/html.js';
import { posRankTag, tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, rankingIndex } from '../helpers.js';
import { findClosestRankedName } from '../players.js';
import { getSleeperMetaByName } from './waivers.js';
import { buildPowerRead, getLeaguePowerContext, POWER_RANK_KEY, renderPowerRead, renderPowerSourceNote } from '../power/allLeagues.js';

    // --- ALL-LEAGUES PLAYER SEARCH (Scout tab: Scan Pasted List -> "All My Leagues") ---
    // Answers "where does this player stand across everything I'm in?" -- one card per player,
    // one row per league. Ownership is a pure read over the globalRosterMaps already stored on
    // State.leagues -- no per-league fetch, so ten leagues cost the same as one. The only
    // network call is the shared Sleeper player map (cached in IndexedDB for a day, and
    // optional -- see the try/catch below). What that stored data can't do is notice a
    // transaction made since the last sync, which is why the summary points at Sync All rather
    // than quietly refetching every league behind a paste.
    //
    // Deliberately NOT given the Would Start verdict that the single-league scan carries: that
    // check needs one league's optimized lineup, locks and manual starters (see
    // buildWaiverContext), all of which are per-league state that only exists for whichever
    // league is currently active. Pointing it at ten leagues at once would mean rebuilding all
    // of that ten times over for a question this view isn't asking.

    // A league can only report "Free Agent" if its roster map covers the WHOLE league. A
    // Sleeper sync writes every team's players into globalRosterMap, so a missing name there
    // genuinely means unrostered. Manual and Draft-Strategist-handoff leagues only ever store
    // your own players, so a missing name means "not on your roster" -- a strictly weaker claim
    // that gets its own neutral status instead of being reported as an available add.
    export function isFullyMappedLeague(l) {
        return !!(l && l.leagueId && !l.leagueId.startsWith('manual_') && !l.leagueId.startsWith('handoff_')
            && l.username && l.username !== 'Manual' && l.globalRosterMap);
    }

    const LEAGUE_SEARCH_STATUS = {
        free:    { cls: 'status-avail',       label: 'Free Agent' },
        mine:    { cls: 'status-mine',        label: 'On Your Roster' },
        taken:   { cls: 'status-owned',       label: 'Rostered' },
        unknown: { cls: 'mls-status-unknown', label: 'Not Yours' }
    };

    // "Switch" on a league row. No re-render needed here: switchActiveLeague already re-runs
    // runScout('waiver') whenever the textarea still has names in it, which lands right back on
    // this view with the newly-active league's rankings behind the Wk/ROS numbers. All this
    // adds is scrolling the results back into view once that re-render lands, since the
    // rebuilt cards can change height above or below where the person tapped. (switchActiveLeague
    // no longer scrolls to the top on its own.)
    export const scoutGoToLeague = function(leagueId) {
        if (!leagueId || leagueId === State.activeLeagueId) return;
        window.switchActiveLeague(leagueId);
        setTimeout(() => {
            const out = document.getElementById('waiverOutput');
            if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    };

    export async function runAllLeaguesSearch(names, outputEl) {
        const leagues = State.leagues || [];
        if (leagues.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">No leagues yet - sync a Sleeper league on the Dashboard first.</span>`;
            return;
        }

        outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Searching ${leagues.length} league${leagues.length === 1 ? '' : 's'}…</div>`;

        // Needed specifically for the players this view is best at finding: someone unrostered
        // in every league has no globalPosMap entry anywhere to read a position off, and an
        // unlabelled card is the one case a "he's available in 3 leagues" answer can't afford.
        let meta = {};
        try {
            meta = await getSleeperMetaByName();
        } catch (e) {
            console.warn('All-leagues search: Sleeper player map unavailable, falling back to league/market positions.', e);
        }

        const mappedCount = leagues.filter(isFullyMappedLeague).length;

        // Positional Power Ranks, computed once per league for the whole search (see
        // getLeaguePowerContext) -- every searched name reads from the same per-league tables.
        const intent = State.waiverScanSettings.intent === 'sell' ? 'sell' : 'buy';
        const powerCtxByLeague = new Map(leagues.map(l => [l.leagueId, getLeaguePowerContext(l)]));

        // All three rankings arrays are indexed once for the whole search -- getPos runs per
        // searched name, and the two lookups in the names loop below do as well.
        const marketIndex = rankingIndex(State.marketRankings);
        const rosIndex = rankingIndex(State.rosRankings);
        const weeklyIndex = rankingIndex(State.weeklyRankings);

        const getPos = (clean) => {
            for (const l of leagues) {
                if (l.globalPosMap && l.globalPosMap[clean]) return l.globalPosMap[clean];
            }
            if (meta[clean]) return meta[clean].pos;
            const m = marketIndex.get(clean);
            return (m && m.pos) ? m.pos : 'UNK';
        };

        // Deduped on the normalized name, so the same player pasted twice -- or under two
        // spellings that normalize together -- produces one card rather than two identical ones.
        const seen = new Set();
        const results = [];

        names.forEach(name => {
            const clean = normalizeName(name);
            if (!clean || seen.has(clean)) return;
            seen.add(clean);

            const rosObj = rosIndex.get(clean);
            const weekObj = weeklyIndex.get(clean);
            const m = meta[clean] || null;
            const pos = getPos(clean);

            const rows = leagues.map(l => {
                const owner = (l.globalRosterMap || {})[clean];
                let status;
                if (owner === 'You') status = 'mine';
                else if (owner) status = 'taken';
                else if (isFullyMappedLeague(l)) status = 'free';
                else status = 'unknown';
                const power = buildPowerRead(powerCtxByLeague.get(l.leagueId), { clean, pos }, status, owner, intent);
                return { league: l, owner, status, power, rec: !!(power && power.verdict && power.verdict.rec) };
            });

            const counts = { free: 0, mine: 0, taken: 0, unknown: 0 };
            rows.forEach(r => counts[r.status]++);
            const recCount = rows.filter(r => r.rec).length;

            // Recommended leagues (for the chosen Buy/Sell intent) lead the card, strongest case
            // first: Buy puts your thinnest room first, then the biggest jump; Sell puts the
            // league that would miss him least first. Everything else keeps the original order:
            // free agents -- the only rows that are actionable today -- then leagues you already
            // own him in, then blocked, then the ones that can't say. Sorted by name inside each
            // group so a card's row order is stable between searches.
            const ORDER = { free: 0, mine: 1, taken: 2, unknown: 3 };
            const recScore = (r) => intent === 'sell'
                ? r.power.withoutRank
                : -(r.power.myRank * 100 + r.power.gain);
            rows.sort((a, b) => {
                if (a.rec !== b.rec) return a.rec ? -1 : 1;
                if (a.rec && b.rec) {
                    const d = recScore(a) - recScore(b);
                    if (d !== 0) return d;
                }
                return (ORDER[a.status] - ORDER[b.status])
                    || String(a.league.name || '').localeCompare(String(b.league.name || ''));
            });

            results.push({
                clean, name, rosObj, weekObj, meta: m, rows, counts, recCount,
                displayName: (rosObj && rosObj.name) || (weekObj && weekObj.name) || name,
                pos
            });
        });

        if (results.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please enter at least one player name.</span>`;
            return;
        }

        // Most actionable first: whoever has the most leagues flagged for the chosen Buy/Sell
        // intent, then whoever is sitting on the most waiver wires. Ties fall back to ROS then
        // Weekly rank, matching how the single-league scan breaks its own ties.
        results.sort((a, b) => {
            if (a.recCount !== b.recCount) return b.recCount - a.recCount;
            if (a.counts.free !== b.counts.free) return b.counts.free - a.counts.free;
            const ar = a.rosObj ? a.rosObj.rank : Infinity, br = b.rosObj ? b.rosObj.rank : Infinity;
            if (ar !== br) return ar - br;
            return (a.weekObj ? a.weekObj.rank : Infinity) - (b.weekObj ? b.weekObj.rank : Infinity);
        });

        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        const activeLeague = getActiveLeague();
        const unmapped = leagues.length - mappedCount;

        const notes = [];
        if (unmapped > 0) {
            notes.push(`${plural(unmapped, 'league')} here ${unmapped === 1 ? "isn't" : "aren't"} Sleeper-synced, so ${unmapped === 1 ? 'it' : 'they'} can only say whether a player is on your own roster - not whether he's available.`);
        }
        if (activeLeague && (State.rosRankings.length > 0 || State.weeklyRankings.length > 0)) {
            notes.push(`Wk/ROS ranks come from the rankings loaded for <strong>${escapeHtml(activeLeague.name)}</strong> (your active league); only the ownership rows below are per-league.`);
        }
        notes.push(`Ownership is from your last sync of each league. Re-run <strong>Sync All</strong> on the Dashboard if a recent add or drop is missing.`);

        // Power-rank provenance, per the "say where the numbers came from" rule the Trade
        // Analyzer verdicts follow: whose rankings, and which leagues couldn't be scored.
        const powerCtxs = [...powerCtxByLeague.values()];
        const scoredCtxs = powerCtxs.filter(c => c && !c.missing);
        if (scoredCtxs.length > 0) {
            let powerNote = `${intent === 'sell' ? '<strong>Sell / Drop</strong>' : '<strong>Buy / Add</strong>'} recommendations use each league's <strong>Positional Power Rankings</strong> (same math as that card), scored with that league's own ROS rankings.`;
            const mktCount = scoredCtxs.filter(c => c.source === 'market').length;
            if (mktCount > 0) powerNote += ` ${plural(mktCount, 'league')} without ROS rankings used Market Consensus instead (marked <em>mkt</em>).`;
            const noRankCount = powerCtxs.filter(c => c && c.missing === 'rankings').length;
            if (noRankCount > 0) powerNote += ` ${plural(noRankCount, 'league')} ${noRankCount === 1 ? 'has' : 'have'} no rankings loaded, so no power rank.`;
            notes.push(powerNote);
        } else if (mappedCount > 0) {
            notes.push(`Load ROS rankings (or pull Market Consensus data) to see your Positional Power Rank in each league and get Buy/Sell recommendations.`);
        }

        let html = `<div class="mls-scan-summary">Searched <strong>${plural(leagues.length, 'league')}</strong> for <strong>${plural(results.length, 'player')}</strong>.`;
        html += `<ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul></div>`;

        results.forEach(res => {
            const badgeClass = res.pos === 'UNK' ? 'FLEX' : res.pos;
            const displayPos = res.pos === 'UNK' ? 'FA' : res.pos;
            const wRank = res.weekObj ? res.weekObj.rank : 'UR';
            const rRank = res.rosObj ? res.rosObj.rank : 'UR';

            const teamTag = res.meta && res.meta.team
                ? ` <span class="mls-league-search-team">${escapeHtml(res.meta.team)}</span>` : '';
            const injTag = res.meta && res.meta.inj
                ? ` <span class="badge inj-badge">${escapeHtml(res.meta.inj)}</span>` : '';

            // Headline pill. "Free in X of Y" counts only the leagues that can actually answer
            // the availability question (see isFullyMappedLeague), so the denominator never
            // implies a manual league said "taken" when it simply couldn't say.
            let pillCls, pillText;
            if (mappedCount === 0) {
                pillCls = res.counts.mine > 0 ? 'status-mine' : 'mls-status-unknown';
                pillText = res.counts.mine > 0 ? `Yours in ${res.counts.mine}` : 'No synced leagues';
            } else {
                pillCls = res.counts.free > 0 ? 'status-avail' : (res.counts.mine > 0 ? 'status-mine' : 'status-owned');
                pillText = `Free in ${res.counts.free} of ${mappedCount}`;
            }

            const breakdown = [];
            if (res.counts.free) breakdown.push(`<span class="mls-nowrap"><strong class="mls-stat-green">${res.counts.free}</strong> available</span>`);
            if (res.counts.mine) breakdown.push(`<span class="mls-nowrap"><strong class="mls-stat-blue">${res.counts.mine}</strong> on your roster</span>`);
            if (res.counts.taken) breakdown.push(`<span class="mls-nowrap"><strong class="mls-stat-red">${res.counts.taken}</strong> rostered by someone else</span>`);
            if (res.counts.unknown) breakdown.push(`<span class="mls-nowrap">${res.counts.unknown} not synced</span>`);

            // Same "Did you mean" fix-it link as the single-league scan, routed back through the
            // same textarea -- attachScoutSuggestionHandler('waiverOutput') is already wired, and
            // re-running runScout('waiver') lands back here while the toggle is still on All My
            // Leagues.
            let suggestHTML = '';
            if (!res.rosObj && !res.weekObj) {
                const suggestion = findClosestRankedName(res.name);
                if (suggestion) {
                    suggestHTML = `<div class="scout-suggest-hint">Did you mean
                        <button type="button" class="scout-suggest-link btn-bare" data-input-id="waiverInput" data-original="${escapeHtml(res.name)}" data-suggested="${escapeHtml(suggestion)}" data-scout-type="waiver">${escapeHtml(suggestion)}</button>?</div>`;
                } else if (!res.meta) {
                    suggestHTML = `<div class="scout-suggest-hint">No Sleeper player matched this name - check the spelling.</div>`;
                }
            }

            const rowsHTML = res.rows.map(r => {
                const conf = LEAGUE_SEARCH_STATUS[r.status];
                const label = r.status === 'taken' ? `Rostered by: ${escapeHtml(r.owner)}` : conf.label;
                const isActive = r.league.leagueId === State.activeLeagueId;
                const activeTag = isActive ? ` <span class="mls-league-search-active">Active</span>` : '';
                const goTo = isActive ? '' :
                    `<button class="btn btn-secondary mls-btn-sm" data-action="scoutGoToLeague" data-league-id="${r.league.leagueId}" title="Make this your active league">Switch</button>`;
                const format = r.league.formatBadge
                    ? `<div class="mls-league-search-format">${escapeHtml(r.league.formatBadge)}</div>` : '';
                return `
                <div class="mls-league-search-row mls-league-search-${r.status}${r.rec ? ' mls-league-search-rec' : ''}">
                    <div class="mls-league-search-meta">
                        <div class="mls-league-search-league">${escapeHtml(r.league.name || 'Unnamed League')}${activeTag}</div>
                        ${format}
                        ${renderPowerRead(r.power, r.status, intent)}
                        ${renderPowerSourceNote(powerCtxByLeague.get(r.league.leagueId), res.pos)}
                    </div>
                    <div class="mls-league-search-actions">
                        <span class="scout-status ${conf.cls}">${label}</span>
                        ${goTo}
                    </div>
                </div>`;
            }).join('');

            // One-line answer to "so where should I act?", naming the flagged leagues so the
            // person doesn't have to scan every row for the purple edge.
            let recHTML = '';
            const hasPower = res.rows.some(r => r.power);
            if (!POWER_RANK_KEY[res.pos]) {
                if (res.pos !== 'UNK' && scoredCtxs.length > 0) {
                    recHTML = `<div class="mls-power-summary mls-power-summary-none">Positional Power Rankings cover QB, RB, WR and TE only.</div>`;
                }
            } else if (hasPower) {
                const recRows = res.rows.filter(r => r.rec);
                if (recRows.length > 0) {
                    const byLabel = {};
                    recRows.forEach(r => {
                        const label = r.power.verdict.label;
                        (byLabel[label] = byLabel[label] || []).push(`<strong>${escapeHtml(r.league.name || 'Unnamed League')}</strong>`);
                    });
                    const parts = Object.entries(byLabel).map(([label, names]) => `${label} in ${names.join(', ')}`);
                    recHTML = `<div class="mls-power-summary"><span class="mls-power-chip mls-power-chip-rec">Consider</span> ${parts.join(' <span class="mls-rank-sep">&middot;</span> ')}</div>`;
                } else if (intent === 'sell' && res.counts.mine === 0) {
                    recHTML = `<div class="mls-power-summary mls-power-summary-none">He isn't on your roster in any synced league, so there's nothing to sell.</div>`;
                } else if (intent === 'sell') {
                    recHTML = `<div class="mls-power-summary mls-power-summary-none">No league where you're deep enough at ${escapeHtml(res.pos)} to sell him comfortably.</div>`;
                } else if (res.counts.free + res.counts.taken === 0) {
                    recHTML = `<div class="mls-power-summary mls-power-summary-none">He's already yours everywhere he could be.</div>`;
                } else {
                    recHTML = `<div class="mls-power-summary mls-power-summary-none">No league where you're weak enough at ${escapeHtml(res.pos)} for him to make a real difference.</div>`;
                }
            }

            html += `
            <div class="mls-league-search-card">
                <div class="mls-league-search-head">
                    <div class="mls-scan-main">
                        <div class="mls-league-search-name">
                            <span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing">${displayPos}</span>
                            ${escapeHtml(res.displayName)}${teamTag}${injTag}
                        </div>
                        <div class="mls-meta-row mls-scan-ranks">
                            <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong>${tierTag(res.weekObj?.tier)}${posRankTag(res.weekObj, 'mls-stat-blue')}</span>
                            <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong>${tierTag(res.rosObj?.tier)}${posRankTag(res.rosObj, 'mls-stat-green')}</span>
                        </div>
                        ${breakdown.length ? `<div class="mls-scan-verdict">${breakdown.join(' <span class="mls-rank-sep">&middot;</span> ')}</div>` : ''}
                        ${recHTML}
                        ${suggestHTML}
                    </div>
                    <div class="mls-text-right"><div class="scout-status ${pillCls} mls-nowrap">${pillText}</div></div>
                </div>
                <div class="mls-league-search-rows">${rowsHTML}</div>
            </div>`;
        });

        outputEl.innerHTML = html;
    }
