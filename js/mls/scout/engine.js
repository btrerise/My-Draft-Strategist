// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3C: SCOUT TAB ENGINE
// (runScout, incl. dynamic waiver adjustment and the position resolver). The trade fairness verdicts
// and renderTradeVerdict (with its waiver adjustment) moved to trade/verdict.js in 3G.
import { escapeHtml } from '../../shared/html.js';
import { posRankTag, tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, rankingIndex } from '../helpers.js';
import { ensureSleeperPosByName, findClosestRankedName, sleeperPosByName } from '../players.js';
import { buildWaiverContext, pastedRosterVerdict, resolveWaiverBasis, waiverCompareText, waiverDerivedNotes, waiverRanksRowHTML, waiverVerdictParts, WAIVER_SOS_OPTS } from './waivers.js';
import { getSoSBadgeHTML } from '../sos.js';
import { isFullyMappedLeague, runAllLeaguesSearch } from './allLeaguesSearch.js';
import { getMarketValue, isDraftPickName, rankToTradeValue } from '../trade/valueCurve.js';
import { getDynamicWaiverAdjustmentValue } from '../trade/waiverValue.js';
import { buildTradeVerdictHTML } from '../trade/verdict.js';
import { KEYS } from '../../shared/storage/keys.js';
import { normalizeName } from '../../shared/names.js';

    // --- SCOUT TAB ENGINE ---
    export const runScout = async function(type) {
        const inputEl = document.getElementById(type === 'waiver' ? 'waiverInput' : 'buyInput');
        const sellEl = document.getElementById('sellInput');
        const outputEl = document.getElementById(type === 'waiver' ? 'waiverOutput' : 'tradeOutput');
        if (!inputEl || !outputEl) return;
        
        let targetNames = inputEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        let sellNames = (type === 'trade' && sellEl) ? sellEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
        
        if (targetNames.length === 0 && sellNames.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please enter at least one player name.</span>`;
            return;
        }

        // All-leagues search is a different question ("where is this guy?") than the rest of
        // this function answers ("what would he do for THIS lineup?"), so it forks here rather
        // than threading a scope flag through buildCard's lineup/verdict logic below.
        if (type === 'waiver' && State.waiverScanSettings.scope === 'all') {
            return runAllLeaguesSearch(targetNames, outputEl);
        }

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};
        // Manual / handoff leagues only know YOUR players, so "not in rosterMap" can't mean
        // "free agent" there -- see isFullyMappedLeague. Those leagues get the same neutral
        // "Not Yours" wording the All My Leagues search already uses, with a tooltip saying why.
        const knowsWholeLeague = isFullyMappedLeague(league);
        const notYoursTitle = "Manual league: this app only knows your roster, so it can't tell whether he's a free agent or on another team. Check your league's site before putting in a claim.";

        // Scan Pasted List follows the same Compare Against and Rank By settings as Auto-Find
        // (see buildWaiverContext) whenever a synced league and some rankings exist. Anything
        // missing just leaves the cards as they were -- rank and ownership still work without it.
        // Rank By also sets the sort order below, even with no synced league.
        const waiverMode = State.waiverScanSettings.compare === 'roster' ? 'roster' : 'lineup';
        const waiverScan = type === 'waiver' ? resolveWaiverBasis() : null;
        let waiverCtx = null;
        if (type === 'waiver' && league && league.globalRosterMap && league.roster && league.roster.length > 0
            && (State.weeklyRankings.length > 0 || State.rosRankings.length > 0)) {
            try {
                waiverCtx = await buildWaiverContext(league);
            } catch (e) {
                console.warn('Scan Pasted List: lineup check unavailable.', e);
            }
        }

        // --- DYNAMIC WAIVER ADJUSTMENT ---
        // Recomputed fresh on every trade check, rather than saved once and left stale, so it
        // always reflects this league's own current free-agent pool. See
        // getDynamicWaiverAdjustmentValue's own comment for the ROS -> Market -> flat-default
        // tiering. Updates the visible field (and the hint beneath it) so the number driving
        // the verdict is never hidden -- same "explain the methodology" principle as the
        // verdict banners themselves.
        if (type === 'trade' && State.tradeSettings.waiverAdjustment) {
            let dynamic = getDynamicWaiverAdjustmentValue();
            const valueEl = document.getElementById('tradeWaiverAdjustValue');
            const hintEl = document.getElementById('tradeWaiverAdjustHint');
            if (dynamic) {
                State.tradeSettings.waiverAdjustmentValue = dynamic.value;
                localStorage.setItem(KEYS.mls.tradeSettings, JSON.stringify(State.tradeSettings));
                if (valueEl) valueEl.value = dynamic.value;
                if (hintEl) {
                    hintEl.style.display = 'block';
                    let playerList = dynamic.players.map(p => p.name).join(', ');
                    hintEl.innerText = `${dynamic.source} top available: ${playerList} - avg ${dynamic.value.toLocaleString()}.`;
                }
            } else if (hintEl) {
                hintEl.style.display = 'block';
                hintEl.innerText = `No free agent data to auto-calculate this yet (sync a league and load rankings) - using the value above.`;
            }
        }

        // --- POSITION RESOLVER FOR CARD BADGES ---
        // Same lookup chain as buildWaiverContext's getPos (used by Auto-Find)
        // (reused rather than duplicated): a synced league's own globalPosMap first, then the
        // cache, then loaded Market Value data as a last resort. Populated lazily here too --
        // Scan Pasted List is usable without ever having run Auto-Find Upgrades first, and
        // without a synced Sleeper league at all (per the tool's own "Sleeper Sync Required"
        // banner, which already says position/rank still work either way) -- so this can't
        // assume the cache exists yet.
        if (!sleeperPosByName) {
            outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Looking up player positions…</div>`;
            await ensureSleeperPosByName();
        }

        // Indexed once for this whole Scout run -- getPos and buildCard below are both called
        // per player, and each was scanning a full rankings array on every call.
        const marketIndex = rankingIndex(State.marketRankings);
        const rosIndex = rankingIndex(State.rosRankings);
        const weeklyIndex = rankingIndex(State.weeklyRankings);

        const getPos = (cleanName) => {
            if (league && league.globalPosMap && league.globalPosMap[cleanName]) return league.globalPosMap[cleanName];
            if (sleeperPosByName && sleeperPosByName[cleanName]) return sleeperPosByName[cleanName];
            let mPlayer = marketIndex.get(cleanName);
            if (mPlayer && mPlayer.pos) return mPlayer.pos;
            return "UNK";
        };

        // For the Trade Analyzer, roleLabel is "GET" (players you'd receive) or "GIVE" (players
        // you'd send away). Returns the card HTML plus this player's value under BOTH lenses --
        // the user's own custom ROS rankings (primary/default) and, if loaded, market consensus
        // (secondary/comparison) -- so the caller can total each side under each lens separately.
        const buildCard = (name, roleLabel = null) => {
            let clean = normalizeName(name);
            let rosObj = rosIndex.get(clean);
            let weekObj = weeklyIndex.get(clean);
            let marketValueObj = type === 'trade' ? getMarketValue(clean) : null;

            // Rookie draft picks (2027 1st, 2026 2nd, etc.) are dynasty trade assets that a
            // Rest-of-Season rankings file has no reason to include -- ROS rankings project
            // real games this season, and a pick isn't a player who plays any of them. Without
            // this, "Your Rankings" would show every pick as a flat 0/Unranked, which distorts
            // whichever side of a trade holds picks under that lens even though Market
            // Consensus (when loaded) already prices them correctly. When ROS has no match, this
            // looks like a pick, and Market Value does have it, borrow the market value as this
            // line item's "Your Value" too -- flagged (fromMarket) so the card can disclose that
            // this particular number isn't actually from the user's own rankings.
            let userValueObj = null;
            if (type === 'trade') {
                if (rosObj) {
                    userValueObj = { rank: rosObj.rank, value: rankToTradeValue(rosObj.rank) };
                } else if (isDraftPickName(name) && marketValueObj) {
                    userValueObj = { rank: marketValueObj.rank, value: marketValueObj.value, fromMarket: true };
                }
            }

            let suggestHTML = "";
            if (!rosObj && !weekObj && type) {
                // Bug fix: this used to always point at a nonexistent 'tradeInput' element for
                // trade cards, silently no-op'ing the "Did you mean" fix-it link on both sides.
                // Route back to whichever textarea (buyInput/sellInput) this name actually came from.
                let sourceInputId = type === 'waiver' ? 'waiverInput' : (roleLabel === 'GIVE' ? 'sellInput' : 'buyInput');
                let suggestion = findClosestRankedName(name);
                if (suggestion) {
                    suggestHTML = `<div class="scout-suggest-hint">Did you mean
                        <button type="button" class="scout-suggest-link btn-bare" data-input-id="${sourceInputId}" data-original="${escapeHtml(name)}" data-suggested="${escapeHtml(suggestion)}" data-scout-type="${type}">${escapeHtml(suggestion)}</button>?</div>`;
                }
            }
            
            let displayName = rosObj?.name || weekObj?.name || name;
            let wRank = weekObj ? weekObj.rank : "UR";
            let rRank = rosObj ? rosObj.rank : "UR";
            let owner = rosterMap[clean];
            let pos = getPos(clean);
            let badgeClass = pos === "UNK" ? "FLEX" : pos;
            let displayPos = pos === "UNK" ? "FA" : pos;
            let statusHTML = "";
            
            if (roleLabel === "GIVE") {
                if (owner === "You") statusHTML = `<div class="scout-status status-owned">On Your Roster<br>(Ready to Send)</div>`;
                else if (owner) statusHTML = `<div class="scout-status status-avail">Already Dropped<br>/ Traded</div>`;
                else statusHTML = `<div class="scout-status status-avail">Not on your<br>roster</div>`;
            } else {
                if (!owner) statusHTML = knowsWholeLeague
                    ? `<div class="scout-status status-avail">Free Agent<br>(Available)</div>`
                    : `<div class="scout-status mls-status-unknown" title="${notYoursTitle}">Not Yours</div>`;
                else if (owner === "You") statusHTML = `<div class="scout-status status-mine">On Your<br>Roster</div>`;
                else statusHTML = `<div class="scout-status status-owned">Rostered by:<br>${escapeHtml(owner)}</div>`;
            }

            // Availability/rank fields for the Waiver path's sort below -- unused by the Trade
            // Analyzer, but harmless to compute unconditionally rather than threading roleLabel
            // through to gate it. Availability order puts actionable adds first (Free Agent),
            // then players already on your own roster (no action needed), then players someone
            // else owns (blocked without a trade) last.
            //
            // ROS and Weekly are kept as two separate sort keys rather than one merged number:
            // substituting Weekly rank in whenever ROS is missing put both scales on the same
            // number line, so an unranked-by-ROS player with a good Weekly rank (e.g. 75) sorted
            // ahead of a player ROS actually ranks at 129 -- exactly backwards. ROS rank is now
            // always the primary key (unranked-by-ROS -> Infinity, so it always sorts behind
            // every ROS-ranked player, never in front of one), with Weekly rank only breaking
            // ties within players who share the same ROS status.
            let availabilityOrder = !owner ? 0 : (owner === "You" ? 1 : 2);

            // Waiver path only: swap the rank line for the same Rank By-led line Auto-Find uses,
            // and give available players the same verdict Auto-Find would under the current
            // Compare Against setting. The lineup pill shows either way (as on Auto-Find cards);
            // under Whole Roster the explanation line becomes the drop-candidate comparison.
            // The most actionable adds sort ahead of other free agents (availabilityOrder -0.5):
            // would-starts under Starting Lineup, upgrades under Whole Roster.
            let ranksRowHTML = null, verdictLineHTML = "", sosBadge = "";
            if (waiverCtx && pos !== "UNK") {
                ranksRowHTML = waiverRanksRowHTML(waiverCtx, clean, pos);
                // The SoS badge at the end of the name line (improvements S7), for every listed
                // player whose team Sleeper knows, whoever has him: a schedule is the same either way.
                const meta = waiverCtx.meta[clean];
                sosBadge = getSoSBadgeHTML(meta && meta.team, pos, WAIVER_SOS_OPTS);
                if (!owner) {
                    let row = waiverCtx.evaluate({ name: displayName, cleanName: clean, pos });
                    let { pill, line } = waiverVerdictParts(waiverCtx, row);
                    if (waiverMode === 'roster' && waiverCtx.scan) {
                        const rosterVerdict = pastedRosterVerdict(waiverCtx, row.player);
                        line = rosterVerdict.line;
                        if (rosterVerdict.upgrade) availabilityOrder = -0.5;
                    } else if (row.verdict && row.verdict.status === 'starts') {
                        availabilityOrder = -0.5;
                    }
                    if (pill) statusHTML = knowsWholeLeague
                        ? `<div class="scout-status status-avail mls-nowrap">Free Agent</div><div class="mls-scan-pill-stack">${pill}</div>`
                        : `<div class="scout-status mls-status-unknown mls-nowrap" title="${notYoursTitle}">Not Yours</div><div class="mls-scan-pill-stack">${pill}</div>`;
                    if (line) verdictLineHTML = `<div class="mls-scan-verdict">${line}</div>`;
                }
            }
            let rosSortRank = (rRank !== "UR") ? rRank : Infinity;
            let weekSortRank = (wRank !== "UR") ? wRank : Infinity;

            let roleTag = roleLabel ? `<span class="badge" style="background:#112233;">${roleLabel === "GET" ? "Receiving" : "Giving"}</span>` : "";

            // Value badges only show on the Trade Analyzer. "Your Value" shows whenever the
            // player is (or isn't) in the user's own ROS rankings; "Mkt Value" only appears once
            // Market Value data has actually been loaded, so the card looks unchanged for anyone
            // not using that optional comparison.
            let valueHTML = "";
            if (type === 'trade') {
                valueHTML += userValueObj
                    ? `<span>Your Value: <strong class="mls-stat-value">${userValueObj.value.toLocaleString()}</strong>${userValueObj.fromMarket ? ' <span style="color:var(--text-muted); font-size:0.75em;">(mkt - no ROS value for picks)</span>' : ''}</span>`
                    : `<span style="color:var(--text-muted);">Your Value: Unranked</span>`;
                if (State.marketRankings.length > 0) {
                    valueHTML += marketValueObj
                        ? `<span>Mkt Value: <strong class="mls-stat-market">${marketValueObj.value.toLocaleString()}</strong></span>`
                        : `<span style="color:var(--text-muted);">Mkt Value: N/A</span>`;
                }
            }

            return {
                html: `
                <div class="scout-result-card">
                    <div>
                        <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                            <span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing">${displayPos}</span>
                            ${displayName} ${roleTag}${sosBadge}
                        </div>
                        ${ranksRowHTML || `<div class="mls-meta-row">
                            <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong>${tierTag(weekObj?.tier)}${posRankTag(weekObj, 'mls-stat-blue')}</span>
                            <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong>${tierTag(rosObj?.tier)}${posRankTag(rosObj, 'mls-stat-green')}</span>
                            ${valueHTML}
                        </div>`}
                        ${verdictLineHTML}
                        ${suggestHTML}
                    </div>
                    <div class="mls-text-right">${statusHTML}</div>
                </div>`,
                userValue: userValueObj ? userValueObj.value : 0,
                userMatched: !!userValueObj,
                marketValue: marketValueObj ? marketValueObj.value : 0,
                marketMatched: !!marketValueObj,
                availabilityOrder,
                rosSortRank,
                weekSortRank
            };
        };

        let html = "";

        if (type === 'trade') {
            let getResults = targetNames.map(n => buildCard(n, "GET"));
            let giveResults = sellNames.map(n => buildCard(n, "GIVE"));

            // A "trade" with only one side filled in isn't a trade -- it's an incomplete
            // comparison, but renderTradeVerdict below has no way to know that (an empty side
            // just totals to 0, which reads as a real, decisive "Favors You"/"Favors Them"
            // verdict). Catch it here instead of letting a misleading banner through; the
            // per-player cards below still render normally either way, since checking one
            // side's value on its own is still useful.
            let isOneSided = (targetNames.length === 0) !== (sellNames.length === 0);

            let verdictHTML;
            if (isOneSided) {
                verdictHTML = `<div class="trade-verdict-note" style="margin-bottom:1rem;">Enter players on both sides to get a fairness verdict; right now only one side has players.</div>`;
            } else {
                verdictHTML = buildTradeVerdictHTML(getResults, giveResults);
            }
            html += verdictHTML;

            if (targetNames.length > 0) {
                html += `<div style="font-weight:bold; color:#4ade80; margin-bottom:0.5rem;">You Receive</div>`;
                getResults.forEach(r => html += r.html);
            }
            if (sellNames.length > 0) {
                html += `<div style="font-weight:bold; color:#fca5a5; margin:1rem 0 0.5rem 0;">You Give Up</div>`;
                giveResults.forEach(r => html += r.html);
            }

            outputEl.innerHTML = html;
            return;
        }

        // Waiver path: sorted by availability (Free Agent first, then On Your Roster, then
        // Rostered by someone else), then by rank ascending within each group -- previously
        // this just listed results in whatever order they were pasted, which buried actionable
        // pickups (actual free agents) among names that aren't addable at all. Within a group
        // the Rank By set is the primary key and the other set only breaks ties (the two are
        // never merged onto one number line -- see the comment above availabilityOrder).
        const weeklyFirst = !!(waiverScan && waiverScan.basis === 'weekly');
        let waiverResults = targetNames.map(n => buildCard(n, null));
        waiverResults.sort((a, b) => {
            if (a.availabilityOrder !== b.availabilityOrder) return a.availabilityOrder - b.availabilityOrder;
            const [aP, bP, aS, bS] = weeklyFirst
                ? [a.weekSortRank, b.weekSortRank, a.rosSortRank, b.rosSortRank]
                : [a.rosSortRank, b.rosSortRank, a.weekSortRank, b.weekSortRank];
            if (aP !== bP) return aP - bP;
            return aS - bS;
        });

        // Same one-line summary Auto-Find opens with, so it's visible which lens and which
        // rankings produced these cards -- without it, a Whole Roster or ROS scan looked
        // identical to the default until you read the numbers.
        if (waiverCtx && waiverScan) {
            const notes = [];
            if (waiverScan.note) notes.push(waiverScan.note);
            if (waiverMode === 'lineup' && !waiverCtx.lineupReady) notes.push(`Couldn't build a starting lineup for this league yet, so there's no Would Start check - open the Lineup tab and tap Optimize Lineup.`);
            notes.push(...waiverDerivedNotes(waiverCtx));
            html += `
            <div class="mls-scan-summary">
                Your list, checked in <strong>${escapeHtml(league.name || 'this league')}</strong> by <strong>${waiverScan.name} rank</strong>, ${waiverCompareText(waiverCtx, waiverMode)}.
                ${notes.length ? `<ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
            </div>`;
        }
        waiverResults.forEach(r => html += r.html);
        outputEl.innerHTML = html;
    };
