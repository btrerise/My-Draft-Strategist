// --- TRADE ANALYZER: HOW YOUR TEAM CHANGES (improvements S14) ---
// Pure logic behind the "after the trade" section under the Trade Analyzer's verdict
// (js/mls/trade/lineupSection.js draws it). No DOM, no State: the caller passes the league, the
// trade and the scoring function, so tests/unit/tradeImpact.test.mjs runs all of it in Node.
//
// Two views, by what the app knows about the league (owner's choice):
//   - Sleeper-synced leagues (every roster known): the Positional Power Rankings before and after,
//     for you and, when everyone you'd get comes from one team, for that team. computePositionalPower
//     (js/mls/power/shared.js) does the scoring, run on a copy of the league with the players moved,
//     so the numbers are the Roster tab's own.
//   - Manual leagues (only your roster known): your best starting lineup before and after, by the
//     Lineup tab's optimizer rules (bestLineup in js/mls/scout/waiverScanner.js), slot by slot.
// Injuries and byes are left out of both: a trade is for the rest of the season, not this week.
import { bestLineup } from '../scout/waiverScanner.js';
import { picksAfterTrade } from '../leagues/picks.js';

// The starting slots the Power Rankings fill (pickPowerStarters in power/shared.js; K and DEF aren't scored).
export const POWER_LINEUP_SLOTS = ['QB', 'RB', 'WR', 'TE', 'WRRB', 'WRTE', 'FLEX', 'SFLEX'];
// The Power Rankings columns, in the Roster tab table's order: [label, team field, room key].
export const POWER_COLUMNS = [['Start', 'starterRank', null], ['Ovr', 'overallRank', null],
    ['QB', 'qbRank', 'QB'], ['RB', 'rbRank', 'RB'], ['WR', 'wrRank', 'WR'], ['TE', 'teRank', 'TE']];
// Dynasty and keeper leagues add the Roster tab's Future column (future value: rankings value x age).
export const FUTURE_COLUMN = ['Future', 'futureRank', 'future'];

// The one other team every rostered player you'd get comes from, or null: none (free agents only,
// or nobody matched) or more than one (a three-way trade, where who gets your players is unknown).
// rosterMap: league.globalRosterMap (clean name -> owner, "You" for you).
export function tradePartner(rosterMap, getCleanNames) {
    const owners = new Set();
    (getCleanNames || []).forEach(c => {
        const o = rosterMap && rosterMap[c];
        if (o && o !== 'You') owners.add(o);
    });
    return owners.size === 1 ? [...owners][0] : null;
}

// A copy of the league with the trade made: the players you give leave your roster (to the partner
// when there is one, else off every roster), and the players you get join yours with their position.
// give: [cleanName] (on your roster); get: [{ cleanName, pos }]. picks: the draft picks traded ({ give, get }: names),
// moved in league.picks when the league has them (improvements S19, round 3: picks count toward Future value).
// The original league is untouched.
export function leagueAfterTrade(league, give, get, partner, picks = null) {
    const rosterMap = { ...(league.globalRosterMap || {}) };
    const posMap = { ...(league.globalPosMap || {}) };
    give.forEach(c => {
        if (partner) rosterMap[c] = partner;
        else delete rosterMap[c];
    });
    get.forEach(p => {
        rosterMap[p.cleanName] = 'You';
        if (!posMap[p.cleanName]) posMap[p.cleanName] = p.pos;
    });
    const after = { ...league, globalRosterMap: rosterMap, globalPosMap: posMap };
    if (league.picks && picks) after.picks = picksAfterTrade(league.picks, { give: picks.give || [], get: picks.get || [], partner });
    return after;
}

// The Power Rankings' starting slots a team can't fill ("RB", "FLEX"), one entry per empty slot.
// reqs: the league's slots with the Power Rankings' defaults filled in (POWER_DEFAULT_REQS).
export function openPowerSlots(team, reqs) {
    const open = [];
    POWER_LINEUP_SLOTS.forEach(slot => {
        const need = parseInt((reqs || {})[slot], 10) || 0;
        const filled = ((team && team.starters) || []).filter(p => p.slot === slot).length;
        for (let i = filled; i < need; i++) open.push(slot);
    });
    return open;
}

// Before and after for you and the partner. computePower(league) -> computePositionalPower's teams.
// Returns null when the league can't be scored (no teams, or you aren't in it).
export function powerTradeImpact(league, { give, get, partner, reqs, picks = null }, computePower) {
    const before = computePower(league);
    const after = computePower(leagueAfterTrade(league, give, get, partner, picks));
    const find = (teams, owner) => (teams || []).find(t => t.owner === owner) || null;
    const you = { owner: 'You', before: find(before, 'You'), after: find(after, 'You') };
    if (!you.before || !you.after) return null;
    // Only holes the trade opens: a slot that was already empty stays out of the note.
    const side = (s) => {
        const left = {};
        openPowerSlots(s.before, reqs).forEach(x => { left[x] = (left[x] || 0) + 1; });
        s.newHoles = openPowerSlots(s.after, reqs).filter(x => !(left[x]-- > 0));
        return s;
    };
    const p = partner ? { owner: partner, before: find(before, partner), after: find(after, partner) } : null;
    return { teams: before.length, you: side(you), partner: p && p.before && p.after ? side(p) : null };
}

// "1st", "2nd", "11th".
export function ordinalOf(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const POWER_ROOM_NAMES = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE' };

// The Start score as a percent of the league average (computePositionalPower's starterScore: 1 = average).
export const startPct = (team) => Math.round(((team && team.starterScore) || 0) * 100);

// One line in words: "Starting lineup 5th → 3rd of 12 (96% → 108% of league average). Stronger at WR (8th → 4th);
// weaker at RB (2nd → 7th)." Lower is better (1 = strongest). Positions that don't move are left out. The percent
// shows a change the rank alone hides ("stays 5th of 12, but stronger: 96% → 108% of league average"). With future
// value (dynasty and keeper leagues), a last sentence: "Future value 4th → 2nd."
// pct: false leaves the percents out (the headline above already gives them).
export function powerSummaryText(side, teams, { pct = true } = {}) {
    const { before: b, after: a } = side;
    const parts = [];
    const pb = startPct(b), pa = startPct(a);
    if (b.starterRank !== a.starterRank) {
        parts.push(`Starting lineup ${ordinalOf(b.starterRank)} → ${ordinalOf(a.starterRank)} of ${teams}${pct ? ` (${pb}% → ${pa}% of league average)` : ''}.`);
    } else if (pb === pa) {
        parts.push(`Starting lineup stays ${ordinalOf(a.starterRank)} of ${teams}${pct ? ` (${pa}% of league average)` : ''}.`);
    } else {
        parts.push(`Starting lineup stays ${ordinalOf(a.starterRank)} of ${teams}, but ${pa > pb ? 'stronger' : 'weaker'}${pct ? `: ${pb}% → ${pa}% of league average` : ''}.`);
    }
    const up = [], down = [];
    POWER_COLUMNS.filter(c => c[2]).forEach(([label, key]) => {
        if (a[key] < b[key]) up.push(`${POWER_ROOM_NAMES[label]} (${ordinalOf(b[key])} → ${ordinalOf(a[key])})`);
        else if (a[key] > b[key]) down.push(`${POWER_ROOM_NAMES[label]} (${ordinalOf(b[key])} → ${ordinalOf(a[key])})`);
    });
    const rooms = [];
    if (up.length) rooms.push(`stronger at ${up.join(', ')}`);
    if (down.length) rooms.push(`weaker at ${down.join(', ')}`);
    if (rooms.length) parts.push(rooms.join('; ').replace(/^./, ch => ch.toUpperCase()) + '.');
    else parts.push('No position room changes rank.');
    // Dynasty and keeper leagues: future value too, when both sides were scored with it.
    if (Number.isFinite(b.futureRank) && Number.isFinite(a.futureRank)) {
        parts.push(b.futureRank === a.futureRank
            ? `Future value stays ${ordinalOf(a.futureRank)}.`
            : `Future value ${ordinalOf(b.futureRank)} → ${ordinalOf(a.futureRank)}.`);
    }
    return parts.join(' ');
}

// The same as powerSummaryText in short labeled lines (improvements S24, round 4: in a dynasty league with In-Season
// rankings the section read as a wall of text on a phone). [{ label, text }]: "Lineup" ("3rd of 12, stronger (107% →
// 108% of avg)"), "Rooms" ("RB 7th → 5th · TE 2nd → 4th", or "no change"), and "Future" when scored.
export function powerSummaryLines(side, teams) {
    const { before: b, after: a } = side;
    const pb = startPct(b), pa = startPct(a);
    const pct = pb === pa ? `${pa}% of avg` : `${pb}% → ${pa}% of avg`;
    const rank = b.starterRank === a.starterRank ? `${ordinalOf(a.starterRank)} of ${teams}` : `${ordinalOf(b.starterRank)} → ${ordinalOf(a.starterRank)} of ${teams}`;
    const how = pa > pb ? ', stronger' : pa < pb ? ', weaker' : '';
    const lines = [{ label: 'Lineup', text: `${rank}${how} (${pct})` }];
    const moved = POWER_COLUMNS.filter(c => c[2]).filter(([, key]) => a[key] !== b[key])
        .map(([label, key]) => `${POWER_ROOM_NAMES[label]} ${ordinalOf(b[key])} → ${ordinalOf(a[key])}`);
    lines.push({ label: 'Rooms', text: moved.length ? moved.join(' · ') : 'no change' });
    if (Number.isFinite(b.futureRank) && Number.isFinite(a.futureRank)) {
        lines.push({ label: 'Future', text: b.futureRank === a.futureRank ? `stays ${ordinalOf(a.futureRank)}` : `${ordinalOf(b.futureRank)} → ${ordinalOf(a.futureRank)}` });
    }
    return lines;
}

// The headline over the section: the value verdict and the lineup change in one sentence, so a trade that
// costs value to get better now (or the reverse) says so. value: tradeVerdictNumbers (trade/verdict.js) for
// the rankings the section uses, or null; side: powerTradeImpact's you. Lineup "stronger" / "weaker" means the
// Start score moved at least 1 point of league average. Returns null without a value verdict.
export function tradeHeadline(value, side) {
    if (!value || !side) return null;
    const pb = startPct(side.before), pa = startPct(side.after);
    const lineup = pa > pb ? 'better' : pa < pb ? 'worse' : 'same';
    const pts = `${value.diff >= 0 ? '+' : '\u2212'}${Math.abs(Math.round(value.diff)).toLocaleString('en-US')} pts`;
    const change = `${pb}% → ${pa}% of league average`;
    if (value.verdict === 'fair') {
        if (lineup === 'better') return `A fair trade by value that makes your starting lineup stronger (${change}).`;
        if (lineup === 'worse') return `A fair trade by value, but your starting lineup gets weaker (${change}).`;
        return "A fair trade by value that doesn't change your starting lineup.";
    }
    if (value.verdict === 'them') {
        if (lineup === 'better') return `You pay in value (${pts}) to make your starting lineup stronger (${change}).`;
        if (lineup === 'worse') return `You lose value (${pts}) and your starting lineup gets weaker (${change}).`;
        return `You lose value (${pts}) without changing your starting lineup.`;
    }
    if (lineup === 'better') return `You gain value (${pts}) and your starting lineup gets stronger (${change}).`;
    if (lineup === 'worse') return `You gain value (${pts}), but your starting lineup gets weaker (${change}): a move for later, not now.`;
    return `You gain value (${pts}) without changing your starting lineup.`;
}

// --- MANUAL LEAGUES: YOUR STARTERS BEFORE AND AFTER ---
// roster: [{ id, cleanName, name, isTaxi }]; give: Set of clean names; get: [{ cleanName, name, pos }].
// deps: bestLineup's getPos and rankOf ({ posRank, flexRank }, 999 or missing = unranked). Nobody is
// locked or unavailable: injuries and byes are this week's question, not the trade's.
// Returns { rows: [{ slotType, out, in }] } for every slot whose starter changes (out/in: a player or
// null for an empty slot), in the optimizer's slot order.
export function lineupTradeChanges(reqs, roster, give, get, deps) {
    const lineupDeps = { getPos: deps.getPos, rankOf: deps.rankOf, isLocked: () => false, isUnavailable: () => false };
    const after = (roster || []).filter(p => !give.has(p.cleanName))
        .concat(get.map(p => ({ id: `trade:${p.cleanName}`, cleanName: p.cleanName, name: p.name, isTaxi: false })));
    const was = bestLineup(reqs, roster, lineupDeps);
    const now = bestLineup(reqs, after, lineupDeps);
    const rows = [];
    was.forEach((s, i) => {
        const n = now[i];
        const outId = s.player ? s.player.cleanName : null, inId = n && n.player ? n.player.cleanName : null;
        if (outId !== inId) rows.push({ slotType: s.slotType, out: s.player, in: n ? n.player : null });
    });
    return { rows };
}

const isRankedNum = (v) => typeof v === 'number' && Number.isFinite(v) && v !== 999;

// The number a slot is judged by: a strict slot's position rank; a flex slot's FLEX rank between
// positions (position rank within one; the overall rank for a QB against anyone else in Superflex).
function slotComparison(slotType, out, inP, rankOf) {
    const ro = rankOf(out) || {}, ri = rankOf(inP) || {};
    const flexType = !['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(slotType);
    if (!flexType || out.pos === inP.pos) return [ro.posRank, ri.posRank];
    // A QB against an RB/WR/TE (Superflex): only the overall rank spans both.
    if (out.pos === 'QB' || inP.pos === 'QB') return [ro.rank, ri.rank];
    return [ro.flexRank, ri.flexRank];
}

// One line in words for the manual view: "Better at RB; worse at FLEX; WR left empty." Unranked players
// can't be compared: "can't compare at RB (Kenneth Walker is unranked)". displayName(p) -> his name.
export function lineupSummaryText(rows, rankOf, displayName = (p) => p.name) {
    if (!rows.length) return "Your starters don't change.";
    const parts = rows.map(r => {
        const slot = r.slotType === 'WRRB' ? 'W/R' : r.slotType === 'WRTE' ? 'W/T' : r.slotType;
        if (!r.in) return `${slot} left empty`;
        if (!r.out) return `fills the empty ${slot}`;
        const [o, i] = slotComparison(r.slotType, r.out, r.in, rankOf);
        if (!isRankedNum(o) || !isRankedNum(i)) {
            const who = !isRankedNum(i) ? r.in : r.out;
            return `can't compare at ${slot} (${displayName(who)} is unranked)`;
        }
        if (i === o) return `even at ${slot}`;
        return `${i < o ? 'better' : 'worse'} at ${slot}`;
    });
    // Two RB slots that both get better read once.
    return [...new Set(parts)].join('; ').replace(/^./, ch => ch.toUpperCase()) + '.';
}

// Total starting slots in a league's settings (0 = none set).
export const lineupSlotCount = (reqs) => Object.values(reqs || {}).reduce((s, n) => s + (parseInt(n, 10) || 0), 0);

