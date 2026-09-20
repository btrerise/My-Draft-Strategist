// --- VIEW MODULE (ES MODULE) ---
// Fourth module pulled out of mls.js's single IIFE (see rankingsParser.js, sleeperApi.js,
// and marketDataApi.js for the first three). Unlike those, which each own one external data
// source, this one owns HTML-string generation for functions that were mixing business logic
// (trade value math, card-field decisions) directly into template literals -- exactly the
// pattern external UX/code review flagged in renderTradeVerdict and buildCard specifically.
//
// The split follows one rule throughout: a function here takes already-decided data and
// arranges it into markup, with no reads of State, no DOM access, and as few of its own
// conditionals as the layout genuinely requires. Deciding WHAT a card should say (is this
// player a free agent, did their value come from market data instead of ROS, did the trade
// favor you) is a business rule and stays in mls.js next to the data it depends on; deciding
// HOW to lay that decision out as HTML is what moved here. Where mls.js still passes in a
// small pre-built fragment (e.g. a status badge's exact wording), that's because the
// fragment's condition is itself a business rule about ownership/value-source, not a styling
// choice -- moving the wrapper div around it here still gets the layout out of mls.js without
// pretending those decisions are presentational.
//
// Pure functions only: given the same arguments, every export here returns the same string,
// every time, with no side effects. That's what makes them testable in isolation (see the
// verification harness used when this module was split out) and safely reusable if mls.js
// ever needs the same layout somewhere else.

/**
 * Renders one trade-fairness verdict banner (label + totals + Fair/Favors-You/Favors-Them),
 * given the already-computed verdict data. Pairs with computeTradeVerdict (mls.js), which
 * does the actual trade-value math (totals, waiver-adjustment bonus, swing %, verdict
 * classification) -- this function only lays that data out as markup, mirroring the fields
 * computeTradeVerdict returns exactly.
 *
 * @param {string} label - "Your Rankings" or "Market Consensus"
 * @param {string} methodologyText - shown in the banner's info tooltip; the exact "here's
 *   how this number was estimated" disclosure each lens uses (see the call sites in mls.js).
 * @param {Object} verdictData - computeTradeVerdict's return value.
 * @param {boolean} sourceLoaded - whether this lens's underlying data (ROS rankings, or
 *   market data) is loaded at all; a lens with nothing loaded renders nothing; matches
 *   renderTradeVerdict's original "return \"\" when sourceLoaded is false" contract exactly,
 *   including running BEFORE looking at verdictData, so callers never need a valid
 *   verdictData for an unloaded lens.
 * @returns {string} HTML, or "" if this lens has nothing to show.
 */
export function renderTradeVerdictHTML(label, methodologyText, verdictData, sourceLoaded) {
    if (!sourceLoaded) return "";

    if (verdictData.empty) {
        return verdictData.unmatchedCount > 0
            ? `<div class="trade-verdict-note" style="margin-bottom:1rem;">${label}: none of the players entered were found, so no value total could be calculated.</div>`
            : "";
    }

    const { getTotal, giveTotal, waiverBonusGet, waiverBonusGive, diff, swingPct, verdictClass, verdictText, unmatchedCount } = verdictData;

    const waiverSubnoteGet = waiverBonusGet > 0
        ? `<span class="trade-verdict-subnote">+${waiverBonusGet.toLocaleString()} waiver adj.</span>`
        : "";
    const waiverSubnoteGive = waiverBonusGive > 0
        ? `<span class="trade-verdict-subnote">+${waiverBonusGive.toLocaleString()} waiver adj.</span>`
        : "";
    const unmatchedNote = unmatchedCount > 0
        ? `<div class="trade-verdict-note">${unmatchedCount} player${unmatchedCount > 1 ? 's' : ''} not found, excluded from this total.</div>`
        : "";

    return `
    <div class="trade-verdict-banner ${verdictClass}">
        <div class="trade-verdict-source-label">
            By ${label}
            <div class="tooltip-container">
                <div class="tooltip-icon">i</div>
                <span class="tooltip-text">${methodologyText}</span>
            </div>
        </div>
        <div class="trade-verdict-totals">
            <div class="trade-verdict-side">
                <span class="trade-verdict-label">You Receive</span>
                <span class="trade-verdict-amount">${getTotal.toLocaleString()}</span>
                ${waiverSubnoteGet}
            </div>
            <div class="trade-verdict-vs">vs</div>
            <div class="trade-verdict-side">
                <span class="trade-verdict-label">You Give</span>
                <span class="trade-verdict-amount">${giveTotal.toLocaleString()}</span>
                ${waiverSubnoteGive}
            </div>
        </div>
        <div class="trade-verdict-result">
            ${verdictText}
            <span class="trade-verdict-diff">(${diff >= 0 ? '+' : ''}${diff.toLocaleString()} pts, ${swingPct.toFixed(0)}%)</span>
        </div>
        ${unmatchedNote}
    </div>`;
}

/**
 * Renders one player result card (Trade Analyzer and Waiver path both use this same card
 * shape). Pairs with buildCard (mls.js), which resolves every field below from State/rosterMap/
 * playerMap -- ownership, rank, value, the "did you mean" suggestion -- since each of those is
 * a business decision about this specific player, not a layout choice. This function only
 * arranges those already-decided pieces into the card's markup.
 *
 * @param {Object} cardData
 * @param {string} cardData.badgeClass - CSS modifier for the position badge (a real position,
 *   or "FLEX" as the fallback badge color for a player of unknown position).
 * @param {string} cardData.displayPos - text shown in the badge ("FA" for unknown position).
 * @param {string} cardData.displayName - the player's name as it should render on the card.
 * @param {string} cardData.roleTag - pre-built "Receiving"/"Giving" badge HTML, or "" outside
 *   the Trade Analyzer.
 * @param {number|string} cardData.wRank - Weekly rank, or "UR" if unranked.
 * @param {number|string} cardData.rRank - ROS rank, or "UR" if unranked.
 * @param {string} cardData.valueHTML - pre-built Your/Mkt Value line(s), "" outside the Trade
 *   Analyzer.
 * @param {string} cardData.suggestHTML - pre-built "Did you mean X?" hint, "" when the name
 *   matched or no suggestion was found.
 * @param {string} cardData.statusHTML - pre-built ownership status badge (Free Agent /
 *   Rostered by X / On Your Roster / etc.).
 * @returns {string} HTML for one card.
 */
export function renderPlayerCardHTML({ badgeClass, displayPos, displayName, roleTag, wRank, rRank, valueHTML, suggestHTML, statusHTML }) {
    return `
    <div class="scout-result-card">
        <div>
            <div style="font-weight:bold; font-size:0.95rem; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <span class="badge pos-badge ${badgeClass} mls-pos-badge-sizing">${displayPos}</span>
                ${displayName} ${roleTag}
            </div>
            <div class="mls-meta-row">
                <span>Wk Rank: <strong class="mls-stat-blue">${wRank}</strong></span>
                <span>ROS Rank: <strong class="mls-stat-green">${rRank}</strong></span>
                ${valueHTML}
            </div>
            ${suggestHTML}
        </div>
        <div class="mls-text-right">${statusHTML}</div>
    </div>`;
}

/**
 * Renders the Positional Power Rankings table (one row per team, one column per position,
 * colored by tier, with a hover tooltip listing each team's top players at that position).
 * Pairs with window.renderPowerRankingsTable (mls.js), which owns the DOM write and the
 * reveal animation -- this function only builds the table markup from teamScores.
 *
 * @param {Array<{owner, overallRank, qbRank, rbRank, wrRank, teRank, players: {QB, RB, WR, TE}}>} teamScores
 * @returns {string} HTML for the whole table (including its scroll wrapper).
 */
export function renderPowerRankingsTableHTML(teamScores) {
    const totalTeams = teamScores.length;

    // Hardcoded hex values prevent CSS root variables from clashing
    const getRankColor = (rank) => {
        if (rank <= Math.ceil(totalTeams / 3)) return '#4ade80'; // Top Tier (Green)
        if (rank > Math.floor(totalTeams * 2 / 3)) return '#fca5a5'; // Bottom Tier (Red)
        return 'var(--text-main, #f8fafc)'; // Middle Tier (Neutral)
    };

    // Helper to generate the nested player tooltips
    const buildTooltip = (players, posName, isRightEdge = false) => {
        const shiftStyle = isRightEdge ? "right: 0; left: auto; transform: translateY(-4px);" : "";
        let html = `<div class="tooltip-text" style="width: 220px; font-weight: normal; z-index: 1005; ${shiftStyle}">`;
        html += `<div style="font-weight: 700; color: var(--text-main); margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border);">${posName} Room</div>`;

        if (players.length === 0) {
            html += `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem;">No players rostered.</div>`;
        } else {
            // Show up to the top 6 players at the position
            const listHtml = players.slice(0, 6).map(p => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 12px; font-size: 0.8rem;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;">${p.name}</span>
                    <span style="color: var(--text-muted); font-weight: 600; flex-shrink: 0;">#${p.rank}</span>
                </div>
            `).join('');

            html += listHtml;
            if (players.length > 6) {
                html += `<div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 6px; text-align: center;">+ ${players.length - 6} more</div>`;
            }
        }
        return html + `</div>`;
    };

    // Note: We use overflow: visible here so the tooltips don't get clipped by the scroll container
    let html = `
        <div style="overflow: visible; border-radius: 6px; border: 1px solid var(--border-color, #334155); margin-top: 15px;">
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.9rem;">
            <thead>
                <tr style="border-bottom: 2px solid var(--border-color, #334155); color: var(--text-muted, #94a3b8); font-size: 0.8rem; text-transform: uppercase;">
                    <th style="padding: 12px 10px; text-align: left;">Manager</th>
                    <th class="mls-table-header-cell">Ovr</th>
                    <th class="mls-table-header-cell">QB</th>
                    <th class="mls-table-header-cell">RB</th>
                    <th class="mls-table-header-cell">WR</th>
                    <th class="mls-table-header-cell">TE</th>
                </tr>
            </thead>
            <tbody>
    `;

    teamScores.forEach(t => {
        const isYou = t.owner === "You" ? "font-weight: bold; background: rgba(147, 197, 253, 0.08);" : "";

        html += `
            <tr style="border-bottom: 1px solid var(--border-color, #334155); ${isYou}">
                <td style="padding: 12px 10px; text-align: left; color: var(--text-main, #f8fafc);">${t.owner}</td>

                <td style="padding: 12px 10px; font-weight: 800; color: ${getRankColor(t.overallRank)};">
                    ${t.overallRank}
                </td>

                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.qbRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.qbRank}</span>
                        ${buildTooltip(t.players.QB, 'QB')}
                    </div>
                </td>

                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.rbRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.rbRank}</span>
                        ${buildTooltip(t.players.RB, 'RB')}
                    </div>
                </td>

                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.wrRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.wrRank}</span>
                        ${buildTooltip(t.players.WR, 'WR', true)}
                    </div>
                </td>

                <td style="padding: 12px 10px; font-weight: 600; color: ${getRankColor(t.teRank)};">
                    <div class="tooltip-container" class="mls-tooltip-center" ontouchstart="">
                        <span class="mls-dotted-underline">${t.teRank}</span>
                        ${buildTooltip(t.players.TE, 'TE', true)}
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    return html;
}

/**
 * Renders the Recent Sync Logs accordion content: one card per league with any roster
 * changes (additions, drops, newly-flagged-Out players) since the last sync, plus the
 * summary line the accordion's own <summary> shows. Pairs with window.renderSyncLogs
 * (mls.js), which owns the DOM guard clauses (missing elements, no logs at all -> hide the
 * whole accordion) and the actual writes -- this function only turns a syncLogs array into
 * the two strings that go into it.
 *
 * The "how many total changes" count lives here rather than in mls.js: unlike the trade
 * verdict's waiver-adjustment bonus or a player card's ownership status, this isn't a
 * business rule with its own meaning independent of the display -- it's just a tally that
 * exists to answer "what does the summary line say," so keeping it next to the template that
 * actually uses it doesn't hide any real decision-making from mls.js.
 *
 * @param {Array<{leagueName, added: string[], dropped: string[], newlyOut: string[]}>} syncLogs
 * @returns {{contentHTML: string, summaryText: string}}
 */
export function renderSyncLogsHTML(syncLogs) {
    let totalChanges = 0;
    let html = "";

    syncLogs.forEach(log => {
        const changes = [];
        if (log.added.length) changes.push(`<span style="color: #86efac; font-weight: 500;">+ ${log.added.join(', ')}</span>`);
        if (log.dropped.length) changes.push(`<span style="color: #9ca3af; text-decoration: line-through;">- ${log.dropped.join(', ')}</span>`);
        if (log.newlyOut.length) changes.push(`<span style="color: #fca5a5;">Out: ${log.newlyOut.join(', ')}</span>`);

        if (changes.length > 0) {
            totalChanges += (log.added.length + log.dropped.length + log.newlyOut.length);
            html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.6rem 0.8rem; border-radius: 6px; border-left: 2px solid #60a5fa;">
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-bottom: 0.3rem;">${log.leagueName}</div>
                    <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem;">
                        ${changes.join('')}
                    </div>
                </div>`;
        }
    });

    let summaryText;
    if (totalChanges === 0) {
        html = `<div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No roster changes detected in the last sync.</div>`;
        summaryText = `Recent Sync Logs (No Changes)`;
    } else {
        summaryText = `Recent Sync Logs (${totalChanges} Change${totalChanges === 1 ? '' : 's'})`;
    }

    return { contentHTML: html, summaryText };
}
