// --- TRADE ANALYZER: "AFTER THE TRADE" SECTION (improvements S14) ---
// Drawn under the trade verdict by runScout (js/mls/scout/engine.js). The math is in
// trade/lineupImpact.js; this file resolves the typed names to players, picks the rankings, and draws.
// Display only: nothing is saved, and the Lineup tab's lineup and locks don't change.
import { escapeHtml } from '../../shared/html.js';
import { normalizeName } from '../../shared/names.js';
import { slotDisplayName, tierTag } from '../constants.js';
import { State } from '../state.js';
import { rankingIndex } from '../helpers.js';
import { computePositionalPower, POWER_DEFAULT_REQS, POWER_POSITIONS } from '../power/shared.js';
import { resolvePowerFuture, whenPowerAgesLoaded } from '../power/futureValue.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { getSleeperMetaByName, makeLeagueGetPos } from '../scout/waivers.js';
import { buildRankDisplayIndex } from '../scout/waiverScanner.js';
import { isDraftPickName } from './valueCurve.js';
import {
    FUTURE_COLUMN, lineupSlotCount, lineupSummaryText, lineupTradeChanges, POWER_COLUMNS,
    powerSummaryText, powerTradeImpact, tradePartner
} from './lineupImpact.js';

const INJURY_NOTE = 'Injuries and byes are left out: this compares your team for the rest of the season, not this week.';

const section = (title, body) => `
    <section class="mls-trade-impact" data-trade-impact>
        <div class="mls-trade-impact-head">${title}</div>
        ${body}
    </section>`;
const notesHTML = (notes) => notes.length ? `<ul class="mls-trade-impact-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '';
const oneLine = (title, text) => section(title, `<div class="mls-trade-impact-empty">${text}</div>`);

const listNames = (names) => names.map(n => `<strong>${escapeHtml(n)}</strong>`).join(', ');

// getNames / giveNames: the Trade Analyzer's two lists as typed. Returns '' when there's nothing
// to show: no league, or a side with no players (draft picks only, or empty).
export async function buildTradeImpactHTML(league, getNames, giveNames) {
    if (!league) return '';
    const getTyped = getNames.filter(n => !isDraftPickName(n));
    const giveTyped = giveNames.filter(n => !isDraftPickName(n));
    if (getTyped.length === 0 || giveTyped.length === 0) return '';
    const picks = getNames.concat(giveNames).filter(n => isDraftPickName(n));

    const fullLeague = isFullyMappedLeague(league) && !!league.globalPosMap;
    const title = fullLeague ? 'Power Rankings after the trade' : 'Your lineup after the trade';

    let meta = null;
    try { meta = await getSleeperMetaByName(); } catch (e) { meta = null; }
    const getPos = makeLeagueGetPos(league, meta);
    const rosIndex = rankingIndex(State.rosRankings);
    const nameOf = (typed, clean) => (rosIndex.get(clean) && rosIndex.get(clean).name) || typed;

    const notes = [];
    const rosterMap = league.globalRosterMap || {};
    const mine = new Set((league.roster || []).map(p => p.cleanName));
    const isMine = (clean) => mine.has(clean) || rosterMap[clean] === 'You';

    const unmatched = [], notYours = [], alreadyYours = [];
    const give = [];
    giveTyped.forEach(n => {
        const clean = normalizeName(n);
        if (!isMine(clean)) { (getPos(clean) === 'UNK' ? unmatched : notYours).push(n); return; }
        if (!give.some(g => g.cleanName === clean)) give.push({ cleanName: clean, name: nameOf(n, clean), pos: getPos(clean) });
    });
    const get = [];
    getTyped.forEach(n => {
        const clean = normalizeName(n);
        const pos = getPos(clean);
        if (pos === 'UNK') { unmatched.push(n); return; }
        if (isMine(clean)) { alreadyYours.push(n); return; }
        if (!get.some(g => g.cleanName === clean)) get.push({ cleanName: clean, name: nameOf(n, clean), pos });
    });
    if (unmatched.length) notes.push(`Couldn't match ${listNames(unmatched)} to a player, so ${unmatched.length > 1 ? 'they take' : 'he takes'} no spot.`);
    if (notYours.length) notes.push(`${listNames(notYours)} ${notYours.length > 1 ? "aren't" : "isn't"} on your roster, so ${notYours.length > 1 ? "they're" : "he's"} left out.`);
    if (alreadyYours.length) notes.push(`${listNames(alreadyYours)} ${alreadyYours.length > 1 ? 'are' : 'is'} already on your roster.`);
    if (picks.length) notes.push(`${listNames(picks)} ${picks.length > 1 ? 'are draft picks' : 'is a draft pick'}: no lineup spot.`);

    if (give.length === 0 || get.length === 0) {
        return section(title, `<div class="mls-trade-impact-empty">No players on one side of this trade could be matched, so there's nothing to compare.</div>${notesHTML(notes)}`);
    }

    return fullLeague
        ? await powerSection(league, title, give, get, notes)
        : manualSection(league, title, give, get, notes, getPos);
}

// --- Sleeper leagues: Power Rankings before and after ---
async function powerSection(league, title, give, get, notes) {
    let rankings = State.rosRankings, via = 'by your ROS rankings';
    if (rankings.length === 0) {
        if (State.marketRankings.length === 0) {
            return oneLine(title, 'Load your ROS rankings (Roster tab) or Market Consensus data (Trade Finder below) to see how this trade changes your Power Rankings.');
        }
        rankings = State.marketRankings;
        via = 'by Market Consensus';
        notes.unshift('No ROS rankings loaded, so this uses Market Consensus. Upload ROS rankings on the Roster tab for your own board.');
    }
    const idx = rankingIndex(rankings);
    const rosterMap = league.globalRosterMap || {};
    const partner = tradePartner(rosterMap, get.map(p => p.cleanName));
    const owners = new Set(get.map(p => rosterMap[p.cleanName]).filter(o => o && o !== 'You'));
    if (owners.size > 1) notes.push('The players you get come from more than one team, so only your team is shown.');

    // Dynasty and keeper leagues: the Roster tab's Future column, from the same source (rankings value x
    // Sleeper age, else dynasty Market Consensus). Waits for the ages, which the Roster tab loads lazily.
    let futureInfo = { future: null, label: 'none' };
    const dynasty = getPowerLeagueKind(league) === 'dynasty';
    if (dynasty) {
        try { await whenPowerAgesLoaded(); } catch (e) { /* resolvePowerFuture says what's left */ }
        futureInfo = resolvePowerFuture();
    }

    const reqs = Object.assign({}, POWER_DEFAULT_REQS, league.reqs || {});
    const impact = powerTradeImpact(league, { give: give.map(p => p.cleanName), get, partner, reqs },
        (l) => computePositionalPower(l, rankings, { future: futureInfo.future }));
    if (!impact) return oneLine(title, 'Not enough roster data to score this league yet. Try re-syncing it.');
    const hasFuture = Number.isFinite(impact.you.before.futureRank) && Number.isFinite(impact.you.after.futureRank);
    const columns = hasFuture ? [...POWER_COLUMNS, FUTURE_COLUMN] : POWER_COLUMNS;
    if (hasFuture) {
        notes.push(futureInfo.label === 'market'
            ? "<strong>Future</strong> is each roster's dynasty Market Consensus value (player ages from Sleeper couldn't be loaded), as on the Roster tab."
            : "<strong>Future</strong> is each roster's value from these rankings, adjusted for player age (from Sleeper), as on the Roster tab: younger players count a bit more, older players less.");
    } else if (dynasty) {
        notes.push("Couldn't load player ages from Sleeper, so there's no Future column. Dynasty Market Consensus data (Trade Finder below) gives a fallback.");
    }

    const unranked = give.concat(get).filter(p => !idx.get(p.cleanName)).map(p => p.name);
    if (unranked.length) notes.push(`${listNames(unranked)} ${unranked.length > 1 ? "aren't" : "isn't"} in these rankings, so ${unranked.length > 1 ? 'they count' : 'he counts'} as unranked (almost no value).`);
    const holes = (side, whose) => side.newHoles.length
        ? [`Leaves ${whose} ${[...new Set(side.newHoles)].map(s => slotDisplayName(s)).join(' and ')} empty.`] : [];
    notes.unshift(...holes(impact.you, 'your'));
    notes.push(INJURY_NOTE);

    const youIn = new Set(get.map(p => p.cleanName)), youOut = give;
    let body = `
        <div class="mls-trade-impact-via">${via}</div>
        <div class="mls-trade-impact-summary">${escapeHtml(powerSummaryText(impact.you, impact.teams))}</div>
        ${powerTable([impact.you], impact.teams, youIn, youOut, columns)}`;
    if (impact.partner) {
        const pIn = new Set(give.map(p => p.cleanName));
        const pOut = get.filter(p => rosterMap[p.cleanName] === partner);
        const pHoles = holes(impact.partner, 'their');
        body += `
        <details class="mls-trade-impact-partner">
            <summary>Their team: ${escapeHtml(partner)}</summary>
            <div class="mls-trade-impact-summary">${escapeHtml(powerSummaryText(impact.partner, impact.teams))}</div>
            ${powerTable([impact.partner], impact.teams, pIn, pOut, columns)}
            ${notesHTML(pHoles)}
        </details>`;
    }
    return section(title, body + notesHTML(notes));
}

// One row per team: each column's rank before -> after (one number when it doesn't move). Each
// number opens the room after the trade, as the Roster tab's table does: players coming in marked +,
// players leaving listed underneath.
function powerTable(sides, teams, incoming, leaving, columns) {
    const rows = sides.map(s => {
        const cells = columns.map(([label, key, room], col) => {
            const b = s.before[key], a = s.after[key];
            const cls = a < b ? 'mls-trade-rank-up' : a > b ? 'mls-trade-rank-down' : '';
            const text = a === b ? `${a}` : `${b}&rarr;${a}`;
            return `
            <td class="${cls}">
                <div class="tooltip-container mls-tooltip-center">
                    <span class="mls-dotted-underline">${text}</span>
                    ${roomTooltip(s.after, label, room, incoming, leaving, col < 3)}
                </div>
            </td>`;
        }).join('');
        return `<tr class="${s.owner === 'You' ? 'mls-power-you' : ''}"><td class="mls-power-manager"><span class="mls-power-owner">${escapeHtml(s.owner)}</span></td>${cells}</tr>`;
    }).join('');
    return `
        <div class="mls-power-table-wrap">
        <table class="mls-power-table mls-trade-impact-table">
            <thead><tr><th class="mls-power-manager" title="Ranked 1-${teams}, 1 = strongest">Team</th>${columns.map(c => `<th${c === FUTURE_COLUMN ? ' title="Future value: roster value adjusted for age - who holds up beyond this season"' : ''}>${c[0]}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;
}

function roomTooltip(team, label, room, incoming, leaving, opensRight) {
    if (room === 'future') return futureTooltip(team, incoming, leaving);
    const slotted = room === null && label === 'Start';
    const players = slotted ? team.starters
        : room ? team.players[room]
        : POWER_POSITIONS.flatMap(pos => team.players[pos]).sort((a, b) => a.rank - b.rank).slice(0, 8);
    const title = slotted ? 'Starting lineup after' : room ? `${room} room after` : 'Top of the roster after';
    let html = `<div class="tooltip-text mls-power-tooltip ${opensRight ? 'mls-power-tooltip-left' : 'mls-power-tooltip-right'}">`;
    html += `<div class="mls-power-tooltip-title">${title}</div>`;
    html += players.length === 0 ? `<div class="mls-power-tooltip-empty">No players rostered.</div>` : players.map(p => `
        <div class="mls-power-tooltip-row${incoming.has(p.cleanName) ? ' mls-trade-in' : ''}">
            <span class="mls-power-tooltip-name">${slotted ? `<span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : slotDisplayName(p.slot)}</span>` : ''}${incoming.has(p.cleanName) ? '+ ' : ''}${escapeHtml(p.name)}</span>
            <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
        </div>`).join('');
    const out = room ? leaving.filter(p => p.pos === room) : leaving;
    if (out.length) html += `<div class="mls-power-tooltip-more mls-trade-out">Leaving: ${out.map(p => escapeHtml(p.name)).join(', ')}</div>`;
    return html + `</div>`;
}

// The Future column's room: the roster's top future values after the trade, with age, as the Roster tab's
// Future tooltip shows them.
function futureTooltip(team, incoming, leaving) {
    const players = (team.futurePlayers || []).slice(0, 8);
    let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-right">`;
    html += `<div class="mls-power-tooltip-title">Future value after</div>`;
    html += players.map(p => `
        <div class="mls-power-tooltip-row${incoming.has(p.cleanName) ? ' mls-trade-in' : ''}">
            <span class="mls-power-tooltip-name">${incoming.has(p.cleanName) ? '+ ' : ''}${escapeHtml(p.name)}</span>
            <span class="mls-power-tooltip-rank">${p.age != null ? `${p.age} yrs &middot; ` : ''}#${p.futureRank != null ? p.futureRank : p.rank}</span>
        </div>`).join('');
    if ((team.futurePlayers || []).length > players.length) html += `<div class="mls-power-tooltip-more">+ ${team.futurePlayers.length - players.length} more</div>`;
    if (leaving.length) html += `<div class="mls-power-tooltip-more mls-trade-out">Leaving: ${leaving.map(p => escapeHtml(p.name)).join(', ')}</div>`;
    return html + `</div>`;
}

// --- Manual leagues: your starters before and after ---
function manualSection(league, title, give, get, notes, getPos) {
    if (State.rosRankings.length === 0) {
        return oneLine(title, 'Load your ROS rankings (Roster tab) to see how this trade changes your starting lineup.');
    }
    if (!league.reqs || lineupSlotCount(league.reqs) === 0) {
        return oneLine(title, "Set this league's lineup slots (Active League Requirements, Settings tab) to see how this trade changes your starting lineup.");
    }
    const byName = {};
    State.rosRankings.forEach(r => { if (r && r.cleanName && !byName[r.cleanName]) byName[r.cleanName] = r; });
    const display = buildRankDisplayIndex(State.rosRankings, getPos);
    const rankOf = (p) => (p && display[p.cleanName]) || null;
    const nameOf = (p) => (byName[p.cleanName] && byName[p.cleanName].name) || p.name || p.cleanName;
    const { rows } = lineupTradeChanges(league.reqs, league.roster || [], new Set(give.map(p => p.cleanName)), get,
        { getPos, rankOf: (p) => byName[p.cleanName] || null });

    const unranked = give.concat(get).filter(p => !byName[p.cleanName]).map(p => p.name);
    if (unranked.length) notes.push(`${listNames(unranked)} ${unranked.length > 1 ? "aren't" : "isn't"} in your ROS rankings, so ${unranked.length > 1 ? 'they only start' : 'he only starts'} when nobody else fits.`);
    notes.push(INJURY_NOTE);

    const rankText = (p) => {
        const d = rankOf(p);
        return d && d.posRank ? `${p.pos}${d.posRank}` : 'UR';
    };
    const line = (sign, p, cls) => `
            <div class="mls-trade-lineup-line ${cls}">
                <span class="mls-trade-lineup-sign" aria-hidden="true">${sign}</span>
                <span class="mls-trade-lineup-name">${p ? escapeHtml(nameOf(p)) : '<em>empty</em>'}</span>
                <span class="mls-trade-lineup-rank">${p ? rankText(p) : ''}</span>
            </div>`;
    const rowsHTML = rows.map(r => `
        <div class="mls-trade-lineup-row">
            <span class="mls-trade-lineup-slot">${r.slotType === 'SFLEX' ? 'SF' : slotDisplayName(r.slotType)}</span>
            <div class="mls-trade-lineup-change">
                ${line('&minus;', r.out, 'mls-trade-out')}${line('+', r.in, 'mls-trade-in')}
            </div>
        </div>`).join('');
    return section(title, `
        <div class="mls-trade-impact-via">by your ROS rankings</div>
        <div class="mls-trade-impact-summary">${escapeHtml(lineupSummaryText(rows, rankOf, nameOf))}</div>
        ${rowsHTML}
        ${notesHTML(notes)}`);
}

