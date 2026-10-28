// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3C: SCOUT TAB ENGINE
// (runScout, incl. dynamic waiver adjustment and the position resolver). The trade fairness verdicts
// and renderTradeVerdict (with its waiver adjustment) moved to trade/verdict.js in 3G.
import { escapeHtml } from '../../shared/html.js';
import { injuryBadgeMarkup, PICK_BADGE_HTML } from '../badges.js';
import { posRankTag, tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, rankingIndex } from '../helpers.js';
import { ensureSleeperPosByName, findClosestRankedName, sleeperPosByName } from '../players.js';
import { getSleeperMetaByName, buildWaiverContext, pastedRosterVerdict, resolveWaiverBasis, waiverCompareText, waiverDerivedNotes, waiverRanksRowHTML, waiverVerdictParts, WAIVER_SOS_OPTS } from './waivers.js';
import { getSoSBadgeHTML } from '../sos.js';
import { isFullyMappedLeague, runAllLeaguesSearch } from './allLeaguesSearch.js';
import { getMarketValue, isDraftPickName, rankToTradeValue } from '../trade/valueCurve.js';
import { getDynamicWaiverAdjustmentValue } from '../trade/waiverValue.js';
import { buildTradeVerdictHTML, tradeSeasonSet } from '../trade/verdict.js';
import { activeOwnRankings } from '../main.js';
import { buildTradeImpactHTML } from '../trade/lineupSection.js';
import { buildMakeFairHTML, moreAnalysisHTML, placeFairFocus } from '../trade/fairSection.js';
import { pickHolders } from '../leagues/picks.js';
import { setTradeExport } from '../trade/export.js';
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
        // The Trade Analyzer's rows show each player's injury from Sleeper (improvements S14, round 8). Without the
        // player map the rows just go without it.
        let tradeMeta = null;
        if (type === 'trade') {
            try { tradeMeta = await getSleeperMetaByName(); } catch (e) { tradeMeta = null; }
        }

        // Indexed once for this whole Scout run -- getPos and buildCard below are both called
        // per player, and each was scanning a full rankings array on every call.
        const marketIndex = rankingIndex(State.marketRankings);
        // The Trade Analyzer values your rankings with market QB prices when the league's switch is on (S24, round 9).
        const rosIndex = rankingIndex(type === 'trade' ? activeOwnRankings() : State.rosRankings);
        const weeklyIndex = rankingIndex(State.weeklyRankings);
        // A dynasty league with an In-Season set (improvements S24): each trade row also gets its In-Season value, by
        // the same curve, beside the dynasty one ("Your rankings"). null everywhere else: rows as before.
        const tradeSeason = type === 'trade' ? tradeSeasonSet() : null;
        const seasonIndex = tradeSeason ? rankingIndex(tradeSeason.data) : null;

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
            let marketValueObj = type === 'trade' ? getMarketValue(clean, name) : null;

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
            // The In-Season value (S24): the same rule, the In-Season set's rank in place of the dynasty one.
            let seasonObj = seasonIndex ? seasonIndex.get(clean) : null;
            let seasonValueObj = null;
            if (seasonIndex) {
                if (seasonObj) seasonValueObj = { rank: seasonObj.rank, value: rankToTradeValue(seasonObj.rank) };
                else if (isDraftPickName(name) && marketValueObj) seasonValueObj = { rank: marketValueObj.rank, value: marketValueObj.value, fromMarket: true };
            }

            let suggestHTML = "";
            if (!rosObj && !weekObj && !seasonObj && type) {
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
            
            let displayName = rosObj?.name || seasonObj?.name || weekObj?.name || name;
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

            // Trade Analyzer rows (improvements S14, round 5): one compact line per player instead of a card with
            // a large status circle, so a trade reads on a phone without scrolling: badge, name, ranks and who
            // has him, and his value on the right (the market's under it when loaded).
            if (type === 'trade') {
                const isPick = isDraftPickName(name);
                // Who holds a pick, in a league whose traded picks were synced (improvements S19, round 2).
                const pickOwns = isPick ? pickOwnerText(league, name, roleLabel) : null;
                let owns;
                if (pickOwns) {
                    owns = pickOwns;
                } else if (roleLabel === 'GIVE') {
                    owns = owner === 'You' ? { text: 'Yours', cls: '' }
                        : isPick ? { text: 'Pick', cls: '' }
                        : { text: owner ? `Not yours (${owner})` : 'Not on your roster', cls: 'mls-trade-row-warn' };
                } else {
                    owns = owner === 'You' ? { text: 'Already yours', cls: 'mls-trade-row-warn' }
                        : owner ? { text: `Rostered by ${owner}`, cls: '' }
                        : isPick ? { text: 'Pick', cls: '' }
                        : { text: knowsWholeLeague ? 'Free agent' : 'Not yours', cls: '' };
                }
                // Dynasty and In-Season ranks side by side in a league with both (S24): "Dyn 48 · Now 22 · Wk 30".
                const rankBits = isPick ? [] : seasonIndex ? [
                    `Dyn ${rRank}${tierTag(rosObj?.tier)}`,
                    `Now ${seasonObj ? seasonObj.rank : 'UR'}${tierTag(seasonObj?.tier)}`,
                    `Wk ${wRank}`
                ] : [
                    `ROS ${rRank}${tierTag(rosObj?.tier)}`,
                    `Wk ${wRank}`
                ];
                // "Dyn" before the dynasty value in a league with both sets (round 3: unlabeled, it read as the only value).
                // A pick's market value carries no "*" since S24 round 18 (a hover title phones never showed, and "*" on the
                // verdict cards means "see the note"): a line under the two sides says so instead.
                const valueText = userValueObj
                    ? `${seasonIndex ? '<span class="mls-trade-row-dyn">Dyn</span>' : ''}${userValueObj.value.toLocaleString()}`
                    : `<span class="mls-trade-row-ur">${isPick ? '&ndash;' : 'UR'}</span>`;
                // A pick's value comes from market data only (round 6): say so where the dash is.
                if (isPick && !userValueObj) rankBits.push(State.marketRankings.length > 0 ? 'Not in market data' : 'Needs market data');
                // The In-Season value under the dynasty one (S24), the market's under both.
                const now = seasonIndex
                    ? `<span class="mls-trade-row-now">Now ${seasonValueObj ? seasonValueObj.value.toLocaleString() : (isPick ? '&ndash;' : 'UR')}</span>` : '';
                const mkt = State.marketRankings.length > 0
                    ? `<span class="mls-trade-row-mkt">Mkt ${marketValueObj ? marketValueObj.value.toLocaleString() : '&ndash;'}</span>` : '';
                return {
                    html: `
                <div class="mls-trade-row">
                    ${isPick ? PICK_BADGE_HTML : `<span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing">${displayPos}</span>`}
                    <div class="mls-trade-row-main">
                        <div class="mls-trade-row-name">${escapeHtml(displayName)}${tradeMeta && tradeMeta[clean] && tradeMeta[clean].inj ? injuryBadgeMarkup(tradeMeta[clean].inj) : ''}${sosBadge}</div>
                        <div class="mls-trade-row-meta">${rankBits.map(b => `<span>${b}</span>`).join('')}<span class="${owns.cls}">${escapeHtml(owns.text)}</span></div>
                        ${suggestHTML}
                    </div>
                    <div class="mls-trade-row-value"><span class="mls-stat-value">${valueText}</span>${now}${mkt}</div>
                </div>`,
                    // One line of Export Trade's image (trade/export.js): who, his position, and his value by
                    // your rankings and the market (null = not in that source).
                    exportRow: {
                        name: displayName, pos: isPick ? 'Pick' : displayPos, badge: isPick ? 'FLEX' : badgeClass,
                        value: userValueObj ? userValueObj.value : null, valueFromMarket: !!(userValueObj && userValueObj.fromMarket),
                        market: marketValueObj ? marketValueObj.value : null,
                        // The In-Season value (S24); undefined outside a league with both sets.
                        now: seasonIndex ? (seasonValueObj ? seasonValueObj.value : null) : undefined
                    },
                    userValue: userValueObj ? userValueObj.value : 0,
                    userMatched: !!userValueObj,
                    seasonValue: seasonValueObj ? seasonValueObj.value : 0,
                    seasonMatched: !!seasonValueObj,
                    marketValue: marketValueObj ? marketValueObj.value : 0,
                    marketMatched: !!marketValueObj,
                    // A name that matches no player at all (a typo), as opposed to a real player one source doesn't
                    // value: the verdicts wait for it to be fixed (improvements S19, round 11; trade/verdict.js).
                    known: isPick || pos !== "UNK",
                    availabilityOrder, rosSortRank, weekSortRank
                };
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
            // How your team changes, under the verdict (improvements S14). Its own failure leaves the
            // verdict and the cards as they were.
            let impactHTML = '';
            try {
                impactHTML = await buildTradeImpactHTML(league, targetNames, sellNames, { getResults, giveResults });
            } catch (e) {
                console.warn('Trade Analyzer: lineup comparison unavailable.', e);
            }
            // What would make a lopsided trade fair (improvements S19), under the two sides (round 16). Same guard.
            let fairHTML = '';
            if (!isOneSided) {
                try {
                    fairHTML = buildMakeFairHTML(league, targetNames, sellNames, getResults, giveResults);
                } catch (e) {
                    console.warn('Trade Analyzer: fair-trade suggestions unavailable.', e);
                }
            }
            html += verdictHTML;

            // The two sides side by side on wider screens, stacked on phones (round 8; css/mls.css .mls-trade-sides).
            // Right under the verdict since S24 round 16 (owner: on a phone they sat over 1,000px below it); To make it fair
            // and Power Rankings follow under "More analysis", as extras.
            html += `<div class="mls-trade-sides">`;
            if (targetNames.length > 0) {
                html += `<div class="mls-trade-side"><div class="mls-trade-side-title mls-trade-side-get">You Receive</div>`;
                getResults.forEach(r => html += r.html);
                html += `</div>`;
            }
            if (sellNames.length > 0) {
                html += `<div class="mls-trade-side"><div class="mls-trade-side-title mls-trade-side-give">You Give Up</div>`;
                giveResults.forEach(r => html += r.html);
                html += `</div>`;
            }
            html += `</div>`;
            // Picks valued by the market (round 18): said once, under the two sides.
            if (getResults.concat(giveResults).some(r => r.exportRow && r.exportRow.valueFromMarket)) {
                html += `<div class="mls-trade-pick-note" data-pick-note>Picks are valued by Market Consensus: your rankings don't rank picks.</div>`;
            }
            html += moreAnalysisHTML(league, !!(fairHTML || impactHTML)) + fairHTML + impactHTML;

            // Export Trade (trade/export.js), at the bottom of the card: an image of the assets with their
            // values and the verdict, plus the Power Rankings change when "Include Power Rankings" is on
            // (owner's choice: off by default, since it isn't usually part of a trade talk). Both sides needed.
            setTradeExport(isOneSided ? null : {
                league: league && league.name ? league.name : '',
                get: getResults.map(r => r.exportRow),
                give: giveResults.map(r => r.exportRow),
                market: State.marketRankings.length > 0,
                dual: !!tradeSeason
            });
            if (!isOneSided) {
                html += `
                <div class="mls-trade-export-row">
                    <label class="mls-trade-export-toggle">
                        <input type="checkbox" id="tradeExportPower" data-action="updateTradeSettingChecked" data-setting="exportPower"${State.tradeSettings.exportPower ? ' checked' : ''}>
                        Include Power Rankings
                    </label>
                    <button type="button" id="exportTradeBtn" class="btn btn-purple" data-action="exportTrade" title="Save the trade, each asset's value and the verdict as an image">
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        Export Trade
                    </button>
                </div>`;
            }

            outputEl.innerHTML = html;
            placeFairFocus(outputEl);
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

    // A Trade Analyzer row's ownership text for a draft pick, from the league's synced picks (league.picks,
    // leagues/picks.js); null when there are none (redraft and manual leagues, older syncs), and the row says "Pick".
    // You give: yours, or not (you traded it away). You get: the From team's, or who holds one.
    function pickOwnerText(league, name, roleLabel) {
        const holders = pickHolders(league && league.picks, name);
        if (!holders) return null;
        if (roleLabel === 'GIVE') {
            return holders.includes('You') ? { text: 'Yours', cls: '' } : { text: "Not yours (you don't hold it)", cls: 'mls-trade-row-warn' };
        }
        const others = holders.filter(o => o !== 'You');
        const team = document.getElementById('tradeGetTeam')?.value || '';
        if (team) return others.includes(team) ? { text: `${team}'s`, cls: '' } : { text: `${team} doesn't hold it`, cls: 'mls-trade-row-warn' };
        if (others.length === 0) return { text: holders.length ? 'Already yours' : 'No team holds it', cls: 'mls-trade-row-warn' };
        return { text: `Held by ${others.join(', ')}`, cls: '' };
    }
