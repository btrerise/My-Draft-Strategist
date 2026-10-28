// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: POSITIONAL POWER
// RANKINGS: ROSTER TAB CARD, plus the card's table renderer and Scout-tab pointer
// (goToPowerRankings, runPositionalStrength, renderPowerRankingsTable), which sat after ACTIVE
// ROSTER: POWER RANKINGS SNAPSHOT.
import { escapeHtml } from '../../shared/html.js';
import { RANKING_TYPE_CONFIG, slotDisplayName, tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { ordinal } from './allLeagues.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { POWER_POSITIONS, computePositionalPower, POWER_STARTER_CARRY_CAP, powerTier } from './shared.js';
import { ensurePowerAgeIndex, futureRankText, futureMoreHTML, powerPicksNote, resolvePowerFuture } from './futureValue.js';
import { getPowerLeagueKind, assignPowerLabels, competingSuggestion, powerLabelAdvice } from './directionLabels.js';
import { renderRosterPowerStrip, scrollToPowerRankings } from './snapshot.js';
import { KEYS } from '../../shared/storage/keys.js';
import { roomsUseSeason, seasonSetFor } from '../rankings/season.js';
import { showTab } from '../nav.js';
import { activePowerRankings, leagueQbMarketPricing } from '../main.js';
import { qbMarketNoteHTML, SF_QB_NOTE } from '../rankings/nowAndLater.js';

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
// With your own rankings, a dynasty league's In-Season set (improvements S23) gives Start, and Ovr and the
// rooms when "I'm competing" is on; `rankings` is then the rooms' list, `start` and `future` the other two
// (all three the same list without an In-Season set). Market Consensus scores every column alike.
function resolvePowerRankingsSource() {
    const wantMarket = State.powerSettings.source === 'market';
    const own = activePowerRankings();
    const mine = own.rooms, market = State.marketRankings;
    const fromMine = (note) => ({ rankings: mine, start: own.start, future: own.future, source: 'custom', note, sfQbPrices: own.sfQbPrices });
    if (wantMarket) {
        if (market.length > 0) return { rankings: market, source: 'market', note: '' };
        if (mine.length > 0) return fromMine('No Market Consensus data loaded yet, so this uses your own rankings instead.');
    } else {
        if (mine.length > 0) return fromMine('');
        if (market.length > 0) return { rankings: market, source: 'market', note: 'No rankings of your own loaded for this league, so this uses Market Consensus instead. Upload rankings above for a board built for this league.' };
    }
    return null;
}

// Keeper leagues (S23, round 10): say how the app treats this one and where to change it (Setup tab, League style),
// since labels, Future, picks and In-Season rankings all depend on it.
function renderKeeperStyleNote(league) {
    const el = document.getElementById('keeperStyleNote');
    if (!el) return;
    if (!league || league.leagueType !== 'keeper') { el.hidden = true; el.innerHTML = ''; return; }
    const style = league.keeperStyle === 'redraft' ? 'redraft' : 'dynasty';
    const keeps = league.maxKeepers ? ` (each team keeps up to ${league.maxKeepers})` : '';
    el.innerHTML = `<span>Keeper league${keeps}, treated as <strong>${style}</strong> here.</span> `
        + `<button type="button" class="mls-btn-sm btn-link-inline" data-action="goToLeagueStyle">Change League style</button>`;
    el.hidden = false;
}

// The note's button: the Setup tab's League style drop-down, scrolled to and focused.
export const goToLeagueStyle = function() {
    showTab('setup').then(() => setTimeout(() => {
        const wrap = document.getElementById('leagueStyleWrap');
        if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('leagueStyleSelect')?.focus({ preventScroll: true });
    }, 60));
};

function oneQbTableNote(ctx) {
    const league = ctx.league;
    if (!league || !ctx.source || ctx.source.source !== 'custom' || ctx.source.sfQbPrices || State.rosRankings.length === 0) return '';
    // With its switch (round 9): price QBs by Market Consensus (superflex) instead.
    const q = leagueQbMarketPricing(league, State.rosRankings);
    if (!q.applies) return '';
    const word = getPowerLeagueKind(league) === 'dynasty' ? 'dynasty' : 'ROS';
    return qbMarketNoteHTML(q, word, '<button type="button" class="mls-btn-sm btn-link-inline" data-action="goToSeasonPicker">Change it above</button>');
}

// The Roster tab's In-Season picker, opened, scrolled to and focused (improvements S24, round 6): the Trade Analyzer's notes
// about In-Season rankings point here.
export const goToSeasonPicker = function() {
    showTab('roster').then(() => setTimeout(() => {
        const card = document.getElementById('rosRankingsCard');
        if (card && !card.classList.contains('expanded')) card.querySelector(':scope > .rankings-card-header .rankings-card-toggle')?.click();
        // In a league with no In-Season slot (redraft), the league's own ROS set picker (round 8).
        const row = document.getElementById('seasonRankingsRow');
        const useSeason = row && !row.hidden;
        (useSeason ? row : document.getElementById('rosRankingSetSelect'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById(useSeason ? 'seasonRankingSetSelect' : 'rosRankingSetSelect')?.focus({ preventScroll: true });
    }, 60));
};

// "I'm competing this year" (improvements S23): per league, saved on the league object.
export const setPowerCompeting = function(checked) {
    const league = getActiveLeague();
    if (!league) return;
    league.powerCompeting = !!checked;
    localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
    refreshPowerRankings();
};

// The switch shows only in a dynasty or keeper league with an In-Season set, and only with your own rankings
// as the source (Market Consensus scores every column alike).
function renderCompetingSwitch(league, src) {
    const wrap = document.getElementById('powerCompetingWrap');
    if (!wrap) return;
    const show = !!league && !!seasonSetFor(league, State.rankingSets.ros) && !!src && src.source === 'custom';
    wrap.style.display = show ? '' : 'none'; // .toggle-row sets display, which would beat [hidden]
    const box = document.getElementById('powerCompeting');
    if (box) box.checked = !!(league && league.powerCompeting);
}

// The suggestion (S23, round 7; the owner's rule in directionLabels.js): your label, moved at most one step by your
// record and points for from the last sync (league.record, improvements S21). Only with the switch (a dynasty or keeper
// league with an In-Season set, your own rankings as the source). Since round 13 it's written in the Your Team card,
// beside the label and advice it weighs against; the switch keeps a pointer, and the power strip at the top of the tab
// a tag when the record moves it, so "Rebuild" next to a 6-1 record isn't the whole story at a glance.
const COMPETING_WORDS = { competing: 'Competing', retool: 'Retool (your call)', rebuilding: 'Rebuilding' };
const COMPETING_SHORT = { competing: 'Competing', retool: 'Retool', rebuilding: 'Rebuilding' };
function suggestionFor(league, you, src) {
    if (!league || !you || !src || src.source !== 'custom' || !seasonSetFor(league, State.rankingSets.ros)) return null;
    return competingSuggestion(you.label, league.record, { starterRank: you.starterRank });
}

// "Suggested: Retool (your call) · 6–1, 1st in points for, 2nd in Start. Your results beat your roster."
function suggestionHTML(s, league) {
    let text = `Suggested: <strong>${COMPETING_WORDS[s.verdict]}</strong>`;
    if (s.fromRoster) {
        return text + (league.record === undefined
            ? ' &middot; from your roster; sync this league to add your record.'
            : ' &middot; from your roster (too early in the season for your record).');
    }
    const r = s.record;
    let rec = `${r.wins}&ndash;${r.losses}${r.ties ? `&ndash;${r.ties}` : ''}`;
    if (s.paRank) rec += ` with the ${s.paRank === 1 ? '' : `${ordinal(s.paRank)}-`}most points against`;
    const facts = [rec, `${ordinal(s.pfRank)} in points for`];
    if (Number.isFinite(s.starterRank)) facts.push(`${ordinal(s.starterRank)} in Start`);
    return text + ` &middot; ${facts.join(', ')}.${s.reason ? ` ${escapeHtml(s.reason)}` : ''}`;
}

// Under the switch: the verdict and where the reasons are.
function renderCompetingPointer(s) {
    const el = document.getElementById('powerCompetingSuggestion');
    if (!el) return;
    if (!s) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `Suggested: <strong>${COMPETING_WORDS[s.verdict]}</strong> &middot; why, under Your Team below.`;
    el.hidden = false;
}

// Where each column came from (S23, round 4: a one-line key right under the table, in place of a long note), or
// null without an In-Season set. "Start and labels by In-Season (Redraft ROS) · Ovr, position rooms and Future by dynasty
// (Dynasty SF)". futureLabel: resolvePowerFuture's ('age' reads the dynasty set; 'market' dynasty Market Consensus).
function seasonSourceKey(league, src, futureLabel) {
    if (!league || !src || src.source !== 'custom') return null;
    const season = seasonSetFor(league, State.rankingSets.ros);
    if (!season) return null;
    const dynId = league.rosRankingSetId;
    const dyn = dynId ? State.rankingSets.ros.find(s => s.id === dynId) : null;
    const named = (s) => s && s.name ? ` (<strong>${escapeHtml(s.name)}</strong>)` : '';
    const inSeason = `<span class="mls-nowrap">In-Season</span>${named(season)}`;
    const part = (html) => `<span class="mls-power-key-part">${html}</span>`;
    const sep = ' <span class="mls-rank-sep">&middot;</span> ';
    if (State.rosRankings.length === 0) return part(`Every column by ${inSeason}: no dynasty rankings are loaded`);
    const competing = roomsUseSeason(league, State.rankingSets.ros);
    const future = futureLabel === 'age' ? 'Future' : null;
    const parts = [];
    if (competing) {
        parts.push(part(`Start, labels, Ovr and position rooms by ${inSeason}`));
        if (future) parts.push(part(`Future by dynasty${named(dyn)}`));
        else if (futureLabel === 'market') parts.push(part('Future by dynasty Market Consensus'));
    } else {
        parts.push(part(`Start and labels by ${inSeason}`));
        parts.push(part(`Ovr, position rooms${future ? ' and Future' : ''} by dynasty${named(dyn)}`));
        if (futureLabel === 'market') parts.push(part('Future by dynasty Market Consensus'));
    }
    return parts.join(sep);
}

// The power strip's tag (S23, round 4): which columns In-Season gives, or '' without it.
function seasonStripTag(league, src) {
    if (!league || !src || src.source !== 'custom' || !seasonSetFor(league, State.rankingSets.ros)) return '';
    return roomsUseSeason(league, State.rankingSets.ros) ? 'by In-Season, Future by dynasty' : 'Start by In-Season';
}

// The two-week hint (S23): a Contender whose dynasty rankings are 14+ days old (when the ROS freshness
// label turns amber), with "I'm competing" off.
function competingHint(league, src, you) {
    if (!league || !src || src.source !== 'custom' || league.powerCompeting) return null;
    if (!seasonSetFor(league, State.rankingSets.ros) || !you || you.label !== 'Contender') return null;
    const updated = Number(State.rosRankingsUpdatedAt);
    if (!(updated > 0) || State.rosRankings.length === 0) return null;
    const days = Math.floor((Date.now() - updated) / 86400000);
    if (days < RANKING_TYPE_CONFIG.ros.staleAfterDays) return null;
    return `Your dynasty rankings are ${days} days old. If you're competing, turn on <strong>I'm competing this year</strong>.`;
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
    renderKeeperStyleNote(league);
    if (!league) {
        showMessage('Select or sync a league on the Dashboard to see Positional Power Rankings.');
        return;
    }
    if (!isFullyMappedLeague(league) || !league.globalPosMap) {
        showMessage("Power Rankings compare every team in the league, so they need a Sleeper-synced league. This league only knows your own roster.");
        return;
    }
    const src = resolvePowerRankingsSource();
    renderCompetingSwitch(league, src);
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
    const teams = computePositionalPower(league, src.rankings, { future: futureInfo.future, startRankings: src.start, futureRankings: src.future });
    if (teams.length === 0) {
        showMessage('Not enough roster data to evaluate yet. Try re-syncing this league.');
        return;
    }
    assignPowerLabels(teams, kind);
    teams.forEach(t => { t.starterTier = powerTier(t.starterRank, teams.length); });
    const suggestion = kind === 'dynasty' ? suggestionFor(league, teams.find(t => t.owner === 'You'), src) : null;
    renderCompetingPointer(suggestion);
    renderPowerRankingsTable(teams, { league, source: src, kind, futureLabel: futureInfo.label, picksLabel: futureInfo.picks, suggestion });
    const stripTag = [seasonStripTag(league, src), suggestion && suggestion.moved ? `with your record: ${COMPETING_SHORT[suggestion.verdict]}` : '']
        .filter(Boolean).join(' · ');
    renderRosterPowerStrip(teams, { source: src, tag: stripTag });
}

// Scout tab's one-line "moved to the Roster tab" pointer (see #powerRankingsScoutPointer in
// index.html). The delay lets showTab's own scroll-to-top start before scrolling to the card,
// the same trick scoutGoToLeague uses.
// TODO (added 2026-09-27): recommend removing this pointer -- the #powerRankingsScoutPointer
// section in index.html, this function, and the .mls-moved-pointer CSS -- on or after
// 2026-10-04, once regular users have had a week to find the card's new home.
export const goToPowerRankings = function() {
    showTab('roster').then(() => setTimeout(() => scrollToPowerRankings(), 60));
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
                    <span class="mls-power-tooltip-name">${slot ? `<span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : slotDisplayName(p.slot)}</span>` : ''}${escapeHtml(p.name)}</span>
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
                <span class="mls-power-tooltip-name"><span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : slotDisplayName(p.slot)}</span>${escapeHtml(p.name)}</span>
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
                <span class="mls-power-tooltip-rank">${futureRankText(p)}</span>
            </div>`).join('');
        html += futureMoreHTML(t.futurePlayers, players.length, escapeHtml);
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
            ${ctx.suggestion ? `<div class="mls-power-summary-suggestion">${suggestionHTML(ctx.suggestion, ctx.league)}</div>` : ''}
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
                ${cell(t.overallRank, buildTooltip((t.startSeparate ? POWER_POSITIONS.flatMap(pos => t.players[pos]) : [...t.starters, ...t.bench]).sort((a, b) => a.rank - b.rank), 'Top of the Roster', { limit: 8 }))}
                ${cell(t.qbRank, buildTooltip(t.players.QB, 'QB Room'))}
                ${cell(t.rbRank, buildTooltip(t.players.RB, 'RB Room', { rightEdge: true }))}
                ${cell(t.wrRank, buildTooltip(t.players.WR, 'WR Room', { rightEdge: true }))}
                ${cell(t.teRank, buildTooltip(t.players.TE, 'TE Room', { rightEdge: true }))}
                ${hasFuture ? cell(t.futureRank, futureTooltip(t)) : ''}
            </tr>`;
    });

    html += `</tbody></table></div>`;
    // In a dynasty league with an In-Season set, which set gave each column, right under the table (S23).
    const seasonKey = seasonSourceKey(ctx.league, ctx.source, ctx.futureLabel);
    if (seasonKey) html += `<div class="mls-power-source-key">${seasonKey}</div>`;
    // Superflex QB prices for a 1QB-looking In-Season set (S24, round 7), under the line naming the sets.
    // A superflex league whose own rankings look 1QB with no prices to borrow (round 8): the same note as the trade's.
    const oneQb = oneQbTableNote(ctx);
    if (oneQb) html += oneQb;
    if (ctx.source && ctx.source.sfQbPrices) html += `<div class="mls-power-source-key" data-sf-qb-note>${SF_QB_NOTE.replaceAll('In-Season', '<span class="mls-nowrap">In-Season</span>')}</div>`;

    const notes = [];
    if (ctx.source && ctx.source.note) notes.push(escapeHtml(ctx.source.note));
    const hint = competingHint(ctx.league, ctx.source, you);
    if (hint) notes.push(hint);
    notes.push(`Ranked 1-${totalTeams} (1 = strongest). <strong>Start</strong> is each team's best legal lineup under this league's roster settings, with each position's starters measured against the league average and weighted by how many lineup spots it fills - so a stud at one position can't hide empty rooms at the others. <strong>Ovr</strong> is the whole roster, depth included.`);
    if (ctx.kind === 'dynasty') {
        if (ctx.futureLabel === 'age') notes.push(`<strong>Future</strong> is each roster's future value: its value from ${seasonKey && State.rosRankings.length > 0 ? 'your dynasty rankings' : 'these rankings'}, adjusted for player age (from Sleeper) with rough positional age curves - younger players count a bit more, older players less.`);
        else if (ctx.futureLabel === 'market') notes.push(`<strong>Future</strong> is each roster's future value. Couldn't load player ages from Sleeper, so it uses dynasty Market Consensus values instead.`);
        // Draft picks in the Future column (improvements S19, round 3), when this league's picks were synced.
        if (ctx.futureLabel === 'age' || ctx.futureLabel === 'market') {
            const picksNote = powerPicksNote(ctx.league, ctx.picksLabel);
            if (picksNote) notes.push(picksNote);
        }
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
