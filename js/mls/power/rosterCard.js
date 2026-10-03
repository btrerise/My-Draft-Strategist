// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: POSITIONAL POWER
// RANKINGS: ROSTER TAB CARD, plus the card's table renderer and Scout-tab pointer
// (goToPowerRankings, runPositionalStrength, renderPowerRankingsTable), which sat after ACTIVE
// ROSTER: POWER RANKINGS SNAPSHOT.
import { escapeHtml } from '../compat.js';
import { tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { ordinal } from './allLeagues.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { POWER_POSITIONS, computePositionalPower, POWER_STARTER_CARRY_CAP, powerTier } from './shared.js';
import { ensurePowerAgeIndex, resolvePowerFuture } from './futureValue.js';
import { getPowerLeagueKind, assignPowerLabels, powerLabelAdvice } from './directionLabels.js';
import { renderRosterPowerStrip } from './snapshot.js';
import { KEYS } from '../../shared/storage/keys.js';

// --- POSITIONAL POWER RANKINGS: ROSTER TAB CARD ---
// Generated automatically (no Calculate button) every time the Roster tab renders -- see the
// call at the top of loadRosterTab, which every rankings upload, set change, sync and league
// switch already funnels through. The math is a few milliseconds even for a 14-team league,
// so recomputing on every render is cheaper than tracking what changed.
export const updatePowerSetting = function(key, value) {
    State.powerSettings[key] = value;
    localStorage.setItem(KEYS.mls.powerSettings, JSON.stringify(State.powerSettings));
    refreshPowerRankings();
};

// Which rankings the card scores with: the person's pick, falling back to the other source
// (with a note saying so) rather than showing nothing, the same way the All My Leagues search
// falls back to Market Consensus for a league without rankings of its own.
function resolvePowerRankingsSource() {
    const wantMarket = State.powerSettings.source === 'market';
    const mine = State.rosRankings, market = State.marketRankings;
    if (wantMarket) {
        if (market.length > 0) return { rankings: market, source: 'market', note: '' };
        if (mine.length > 0) return { rankings: mine, source: 'custom', note: 'No Market Consensus data loaded yet, so this uses your own rankings instead.' };
    } else {
        if (mine.length > 0) return { rankings: mine, source: 'custom', note: '' };
        if (market.length > 0) return { rankings: market, source: 'market', note: 'No rankings of your own loaded for this league, so this uses Market Consensus instead. Upload rankings above for a board built for this league.' };
    }
    return null;
}

export function refreshPowerRankings() {
    const out = document.getElementById('powerRankingsOutput');
    if (!out) return;
    const sourceSelect = document.getElementById('powerRankingsSource');
    if (sourceSelect) sourceSelect.value = State.powerSettings.source === 'market' ? 'market' : 'custom';

    const showMessage = (msg) => {
        out.innerHTML = `<div class="mls-power-empty">${msg}</div>`;
        out.style.display = 'block';
        renderRosterPowerStrip(null); // nothing to summarize up top either
    };

    const league = getActiveLeague();
    if (!league) {
        showMessage('Select or sync a league on the Dashboard to see Positional Power Rankings.');
        return;
    }
    if (!isFullyMappedLeague(league) || !league.globalPosMap) {
        showMessage("Power Rankings compare every team in the league, so they need a Sleeper-synced league. This league only knows your own roster.");
        return;
    }
    const src = resolvePowerRankingsSource();
    if (!src) {
        showMessage('Upload your rankings above (or Auto-Fetch them) to see how every team in this league stacks up.');
        return;
    }
    // Future value only matters where rosters carry over. Ages load in the background the
    // first time (see ensurePowerAgeIndex), which re-runs this once they land.
    const kind = getPowerLeagueKind(league);
    let futureInfo = { future: null, label: 'none' };
    if (kind === 'dynasty') {
        ensurePowerAgeIndex();
        futureInfo = resolvePowerFuture();
    }
    const teams = computePositionalPower(league, src.rankings, { future: futureInfo.future });
    if (teams.length === 0) {
        showMessage('Not enough roster data to evaluate yet. Try re-syncing this league.');
        return;
    }
    assignPowerLabels(teams, kind);
    teams.forEach(t => { t.starterTier = powerTier(t.starterRank, teams.length); });
    renderPowerRankingsTable(teams, { league, source: src, kind, futureLabel: futureInfo.label });
    renderRosterPowerStrip(teams, { source: src });
}

// Scout tab's one-line "moved to the Roster tab" pointer (see #powerRankingsScoutPointer in
// index.html). The delay lets showTab's own scroll-to-top start before scrolling to the card,
// the same trick scoutGoToLeague uses.
// TODO (added 2026-09-27): recommend removing this pointer -- the #powerRankingsScoutPointer
// section in index.html, this function, and the .mls-moved-pointer CSS -- on or after
// 2026-10-04, once regular users have had a week to find the card's new home.
export const goToPowerRankings = function() {
    if (typeof window.showTab === 'function') window.showTab('roster');
    setTimeout(() => window.scrollToPowerRankings(), 60);
};

// Kept for anything still calling the old Scout-tab button handler.
export const runPositionalStrength = function() {
    refreshPowerRankings();
};

export const renderPowerRankingsTable = function(teamScores, ctx = {}) {
    let out = document.getElementById('powerRankingsOutput');
    if (!out) return;

    const totalTeams = teamScores.length;
    const tierCls = (rank) => `mls-power-cell-${powerTier(rank, totalTeams)}`;

    // Nested player tooltips. slot: show each player's lineup slot (Starters column).
    // Direction: the site-wide tooltip opens leftward from its anchor, which runs off-screen for
    // the left-hand columns on a phone -- so Start/Bench/QB open rightward instead, and RB and
    // everything right of it keep opening leftward.
    const buildTooltip = (players, title, { rightEdge = false, slot = false, limit = 6 } = {}) => {
        let html = `<div class="tooltip-text mls-power-tooltip ${rightEdge ? 'mls-power-tooltip-right' : 'mls-power-tooltip-left'}">`;
        html += `<div class="mls-power-tooltip-title">${escapeHtml(title)}</div>`;
        if (players.length === 0) {
            html += `<div class="mls-power-tooltip-empty">No players rostered.</div>`;
        } else {
            html += players.slice(0, limit).map(p => `
                <div class="mls-power-tooltip-row">
                    <span class="mls-power-tooltip-name">${slot ? `<span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : p.slot}</span>` : ''}${escapeHtml(p.name)}</span>
                    <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
                </div>`).join('');
            if (players.length > limit) {
                html += `<div class="mls-power-tooltip-more">+ ${players.length - limit} more</div>`;
            }
        }
        return html + `</div>`;
    };

    const cell = (rank, tooltipHTML, extraCls = '') => `
        <td class="${tierCls(rank)} ${extraCls}">
            <div class="tooltip-container mls-tooltip-center">
                <span class="mls-dotted-underline">${rank}</span>
                ${tooltipHTML}
            </div>
        </td>`;

    // Sorted by starting-lineup strength: "can this team win now?" is the question the table
    // leads with. The position columns still cover whole rooms, bench included.
    const rows = [...teamScores].sort((a, b) => a.starterRank - b.starterRank);
    const hasFuture = rows.every(t => Number.isFinite(t.futureRank));
    const labelCls = (t) => `mls-power-label mls-power-label-${String(t.label || '').toLowerCase()}`;
    const labelChip = (t) => t.label
        ? `<span class="${labelCls(t)}">${escapeHtml(t.label)}${t.labelNote ? ` <span class="mls-power-label-note">&middot; ${escapeHtml(t.labelNote)}</span>` : ''}</span>` : '';

    // Start tooltip: each position's starters vs the league average (what the rank is actually
    // built from -- see computePositionalPower step 3a), then the lineup itself.
    const startTooltip = (t) => {
        const ratioCls = (r) => r >= 1.15 ? 'mls-power-cell-strong' : (r < 0.85 ? 'mls-power-cell-weak' : '');
        const balance = POWER_POSITIONS.map(pos => {
            const r = t.starterRatios ? t.starterRatios[pos] : null;
            if (r == null) return '';
            const capped = r > POWER_STARTER_CARRY_CAP ? ' title="Counts as 150% - one position can only carry so much"' : '';
            return `<span class="mls-power-balance-item"${capped}>${pos} <strong class="${ratioCls(r)}">${Math.round(r * 100)}%</strong>${r > POWER_STARTER_CARRY_CAP ? '*' : ''}</span>`;
        }).join('');
        let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-left">`;
        html += `<div class="mls-power-tooltip-title">Starting Lineup</div>`;
        html += `<div class="mls-power-balance-label">Starters vs. league average</div><div class="mls-power-balance">${balance}</div>`;
        if (POWER_POSITIONS.some(pos => t.starterRatios && t.starterRatios[pos] > POWER_STARTER_CARRY_CAP)) {
            html += `<div class="mls-power-balance-foot">* capped at 150% - one position can only carry so much</div>`;
        }
        html += t.starters.map(p => `
            <div class="mls-power-tooltip-row">
                <span class="mls-power-tooltip-name"><span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : p.slot}</span>${escapeHtml(p.name)}</span>
                <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
            </div>`).join('');
        return html + `</div>`;
    };

    // Future tooltip: top contributors with their age (age mode) so the number is explainable.
    const futureTooltip = (t) => {
        const players = (t.futurePlayers || []).slice(0, 8);
        let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-right">`;
        html += `<div class="mls-power-tooltip-title">Future Value (age-adjusted)</div>`;
        html += players.map(p => `
            <div class="mls-power-tooltip-row">
                <span class="mls-power-tooltip-name">${escapeHtml(p.name)}</span>
                <span class="mls-power-tooltip-rank">${p.age != null ? `${p.age} yrs &middot; ` : ''}#${p.futureRank != null ? p.futureRank : p.rank}</span>
            </div>`).join('');
        if ((t.futurePlayers || []).length > players.length) html += `<div class="mls-power-tooltip-more">+ ${t.futurePlayers.length - players.length} more</div>`;
        return html + `</div>`;
    };

    // "Your Team" summary: the label in words, so nobody has to decode the table first.
    let summaryHTML = '';
    const you = rows.find(t => t.owner === 'You');
    if (you && you.label) {
        const facts = [`<strong>${ordinal(you.starterRank)}</strong> of ${totalTeams} in starting lineup`, `<strong>${ordinal(you.overallRank)}</strong> overall`];
        if (hasFuture) facts.push(`<strong>${ordinal(you.futureRank)}</strong> in future value`);
        summaryHTML = `
        <div class="mls-power-summary-card mls-power-summary-${String(you.label).toLowerCase()}">
            <div class="mls-power-summary-head">Your Team: ${labelChip(you)}</div>
            <div class="mls-power-summary-facts">${facts.join(' <span class="mls-rank-sep">&middot;</span> ')}</div>
            <div class="mls-power-summary-advice">${escapeHtml(powerLabelAdvice(you))}</div>
        </div>`;
    }

    let html = `
        <div class="mls-power-table-wrap">
        <table class="mls-power-table">
            <thead>
                <tr>
                    <th class="mls-power-manager">Manager</th>
                    <th title="Best legal starting lineup for this league's roster settings, weighed position by position against the league average">Start</th>
                    <th title="Whole roster (QB/RB/WR/TE), starters and depth together">Ovr</th>
                    <th>QB</th>
                    <th>RB</th>
                    <th>WR</th>
                    <th>TE</th>
                    ${hasFuture ? `<th title="Future value: roster value adjusted for age - who holds up beyond this season">Future</th>` : ''}
                </tr>
            </thead>
            <tbody>`;

    rows.forEach(t => {
        html += `
            <tr class="${t.owner === 'You' ? 'mls-power-you' : ''}">
                <td class="mls-power-manager"><span class="mls-power-owner">${escapeHtml(t.owner)}</span>${labelChip(t)}</td>
                ${cell(t.starterRank, startTooltip(t), 'mls-power-strong-col')}
                ${cell(t.overallRank, buildTooltip([...t.starters, ...t.bench].sort((a, b) => a.rank - b.rank), 'Top of the Roster', { limit: 8 }))}
                ${cell(t.qbRank, buildTooltip(t.players.QB, 'QB Room'))}
                ${cell(t.rbRank, buildTooltip(t.players.RB, 'RB Room', { rightEdge: true }))}
                ${cell(t.wrRank, buildTooltip(t.players.WR, 'WR Room', { rightEdge: true }))}
                ${cell(t.teRank, buildTooltip(t.players.TE, 'TE Room', { rightEdge: true }))}
                ${hasFuture ? cell(t.futureRank, futureTooltip(t)) : ''}
            </tr>`;
    });

    html += `</tbody></table></div>`;

    const notes = [];
    if (ctx.source && ctx.source.note) notes.push(escapeHtml(ctx.source.note));
    notes.push(`Ranked 1-${totalTeams} (1 = strongest). <strong>Start</strong> is each team's best legal lineup under this league's roster settings, with each position's starters measured against the league average and weighted by how many lineup spots it fills - so a stud at one position can't hide empty rooms at the others. <strong>Ovr</strong> is the whole roster, depth included.`);
    if (ctx.kind === 'dynasty') {
        if (ctx.futureLabel === 'age') notes.push(`<strong>Future</strong> is each roster's future value: its value from these rankings, adjusted for player age (from Sleeper) with rough positional age curves - younger players count a bit more, older players less.`);
        else if (ctx.futureLabel === 'market') notes.push(`<strong>Future</strong> is each roster's future value. Couldn't load player ages from Sleeper, so it uses dynasty Market Consensus values instead.`);
        else if (ctx.futureLabel === 'loading') notes.push(`Loading player ages from Sleeper for the Future column…`);
        else notes.push(`Couldn't load player ages from Sleeper, so there's no Future column; labels use the starting lineup alone. Pulling Dynasty Market Consensus data (Trade Finder on the Scout tab) gives a fallback.`);
        notes.push(`Labels: <strong>Contender</strong> = top-third starting lineup; <strong>Retool</strong> = mid-pack lineup with a decent future; <strong>Rebuild</strong> = bottom-third lineup, or mid-pack with a bottom-third future.`);
    } else {
        notes.push(`Labels: <strong>Contender</strong> / <strong>Bubble</strong> / <strong>Longshot</strong> = top / middle / bottom third in starting lineup strength.`);
    }
    notes.push(`Labels reflect roster strength only, not the standings.`);
    html += `<ul class="mls-power-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`;

    out.innerHTML = summaryHTML + html;
    out.style.display = 'block';
};
