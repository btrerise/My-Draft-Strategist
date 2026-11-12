// --- POWER RANKINGS: WHAT A PAST TRADE DID (improvements S29) ---
// Pure logic behind the line under the Roster tab's Power Rankings strip (power/tradeLine.js draws it). No DOM, no
// State: the caller passes the league, Sleeper's transactions and two lookups, so tests/unit/pastTrades.test.mjs runs
// all of it in Node.
//
// Nothing is stored. Today's rosters are known (league.globalRosterMap, league.picks), and Sleeper lists every move
// (league/<id>/transactions/<week>). Undoing moves newest first rebuilds the league as it was at any point this
// season: the league right after a trade is today's with every later move undone, and right before it the same with
// the trade undone too. Both are scored by the same rankings (computePositionalPower, as the Trade Analyzer does), so
// the change is the trade's alone, not a rankings update's or a later pickup's (owner's choice, question 5).
//
// Lookups the caller passes (deps):
//   ownerOf(rosterId) -> the team's owner as globalRosterMap names it ("You" for you), or null when unknown.
//   playerOf(playerId) -> { cleanName, name, pos } from Sleeper's player map, or null.
import { pickName } from '../leagues/picks.js';

// Sleeper's weekly lists in one, newest first: completed moves only (a failed waiver claim moved nobody), each once.
// Sleeper stamps status_updated when a move goes through (created when it was proposed or claimed).
export function completedMoves(weeklyLists) {
    const seen = new Set();
    const out = [];
    (weeklyLists || []).forEach(list => (Array.isArray(list) ? list : []).forEach(tx => {
        if (!tx || tx.status !== 'complete') return;
        const id = String(tx.transaction_id ?? '');
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        out.push(tx);
    }));
    return out.sort((a, b) => moveTime(b) - moveTime(a));
}
export const moveTime = (tx) => Number(tx.status_updated || tx.created || 0);

// The league with one move undone: each player the move added goes back where he came from (the team that dropped
// him in a trade, else off every roster), and each player it only dropped goes back to that team. Draft picks go back
// to their previous owner. state: { rosterMap, posMap, picks }; a new state is returned, the old one untouched.
export function undoMove(state, tx, deps) {
    const rosterMap = { ...(state.rosterMap || {}) };
    const posMap = { ...(state.posMap || {}) };
    const adds = tx.adds || {}, drops = tx.drops || {};
    const ids = new Set([...Object.keys(adds), ...Object.keys(drops)]);
    ids.forEach(pid => {
        const p = deps.playerOf(pid);
        if (!p) return;
        const from = drops[pid] != null ? deps.ownerOf(drops[pid]) : null;
        if (from) {
            rosterMap[p.cleanName] = from;
            if (!posMap[p.cleanName] && p.pos) posMap[p.cleanName] = p.pos;
        } else {
            delete rosterMap[p.cleanName];
        }
    });
    return { rosterMap, posMap, picks: undoPicks(state.picks, tx.draft_picks, deps) };
}

// league.picks ({ [owner]: [{ name, season, round, from }] }, js/mls/leagues/picks.js) with a move's draft picks
// handed back. Each of Sleeper's entries: { season, round, roster_id: whose pick it was originally, previous_owner_id,
// owner_id }. A pick the league's list doesn't have (a draft already held, a round past 4) is skipped.
export function undoPicks(picks, draftPicks, deps) {
    if (!picks || !Array.isArray(draftPicks) || draftPicks.length === 0) return picks;
    const out = Object.fromEntries(Object.entries(picks).map(([o, list]) => [o, list.slice()]));
    draftPicks.forEach(dp => {
        const original = deps.ownerOf(dp.roster_id);
        const holder = deps.ownerOf(dp.owner_id);
        const back = deps.ownerOf(dp.previous_owner_id);
        if (!original || !holder || !back || !out[holder]) return;
        const i = out[holder].findIndex(p => Number(p.season) === Number(dp.season) && Number(p.round) === Number(dp.round)
            && (p.from || holder) === original);
        if (i === -1) return;
        const { moved, ...pk } = out[holder].splice(i, 1)[0];
        (out[back] = out[back] || []).push({ ...pk, from: back === original ? null : original });
        out[back].sort((a, b) => a.season - b.season || a.round - b.round);
    });
    return out;
}

// The league right after and right before one move (by transaction_id), as copies: every move newer than it undone
// for "after", and it too for "before". moves: completedMoves' list (newest first). null when the move isn't there.
export function leaguesAroundMove(league, moves, moveId, deps) {
    const at = (moves || []).findIndex(tx => String(tx.transaction_id) === String(moveId));
    if (at === -1 || !league) return null;
    let state = { rosterMap: league.globalRosterMap || {}, posMap: league.globalPosMap || {}, picks: league.picks || null };
    for (let i = 0; i < at; i++) state = undoMove(state, moves[i], deps);
    const asLeague = (s) => ({ ...league, globalRosterMap: s.rosterMap, globalPosMap: s.posMap, picks: s.picks });
    const after = asLeague(state);
    const before = asLeague(undoMove(state, moves[at], deps));
    return { before, after };
}

// The season's trades, newest first, for the picker: [{ id, time, week, teams: [owner], gets: { [owner]: [name] },
// mine }]. teams lists you first, then the others in Sleeper's order; a team the lookups can't name is left out.
export function tradeEntries(moves, deps) {
    return (moves || []).filter(tx => tx.type === 'trade').map(tx => {
        const teams = [];
        const add = (o) => { if (o && !teams.includes(o)) teams.push(o); };
        (tx.roster_ids || []).forEach(r => add(deps.ownerOf(r)));
        const gets = {};
        const give = (owner, name) => { if (owner && name) { add(owner); (gets[owner] = gets[owner] || []).push(name); } };
        Object.entries(tx.adds || {}).forEach(([pid, r]) => { const p = deps.playerOf(pid); give(deps.ownerOf(r), p && p.name); });
        (tx.draft_picks || []).forEach(dp => give(deps.ownerOf(dp.owner_id), dp.round >= 1 && dp.round <= 4 ? pickName(dp.season, dp.round) : `${dp.season} round ${dp.round}`));
        teams.sort((a, b) => (b === 'You') - (a === 'You'));
        return { id: String(tx.transaction_id), time: moveTime(tx), week: tx.leg ?? null, teams, gets, mine: teams.includes('You') };
    });
}

// Your trades only (owner, round 3: other teams' trades were clutter in a busy league; the full table compares them).
export const yourTrades = (entries) => (entries || []).filter(e => e.mine && e.teams.length >= 2);

// The trade the line opens on: the one you picked, else your newest, else the league's newest. null with no trades.
export function defaultTradeId(entries, picked = null) {
    if (!entries || entries.length === 0) return null;
    if (picked && entries.some(e => e.id === picked)) return picked;
    const mine = entries.find(e => e.mine);
    return (mine || entries[0]).id;
}

// The columns the strip shows, in its order: [label, team field].
export const TRADE_LINE_COLUMNS = [['Start', 'starterRank'], ['Ovr', 'overallRank'], ['QB', 'qbRank'], ['RB', 'rbRank'],
    ['WR', 'wrRank'], ['TE', 'teRank'], ['Future', 'futureRank']];

// The ranks that moved for one team: [{ label, from, to }] (lower is better). Future only when both sides have it.
export function rankChanges(before, after) {
    if (!before || !after) return [];
    return TRADE_LINE_COLUMNS
        .filter(([, k]) => Number.isFinite(before[k]) && Number.isFinite(after[k]) && before[k] !== after[k])
        .map(([label, k]) => ({ label, from: before[k], to: after[k] }));
}

// Sleeper roster id -> owner, as the sync names teams in globalRosterMap: your roster is "You", the others by display
// name (league.teamNames, improvements S21). A name no current roster entry uses (a team with no owner: the sync calls
// it "Unknown Team", teamNames "Team 3") falls back to "Unknown Team" when that's in use, else null, so an undone move
// never invents a team the Power Rankings would count.
export function makeOwnerOf(league) {
    const owners = new Set(Object.values((league && league.globalRosterMap) || {}));
    const names = (league && league.teamNames) || {};
    return (rosterId) => {
        if (rosterId == null) return null;
        if (league && league.rosterId != null && Number(rosterId) === Number(league.rosterId)) return 'You';
        const n = names[rosterId];
        if (n && owners.has(n)) return n;
        return owners.has('Unknown Team') ? 'Unknown Team' : null;
    };
}

// "1st", "2nd", "11th".
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// The box's verdict in one sentence (owner, round 4: the rank list made you add it up yourself). Round 5: the ranks are
// in the lines under it, so the sentence says what they hide: how much your starting lineup changed, as a percent of the
// league average (computePositionalPower's starterScore, 1 = average; the Trade Analyzer's headline uses the same).
//   "Your starting lineup went 6th → 3rd of 12 and got stronger (96% → 108% of league average)."
//   "Your starting lineup stayed 1st of 2 and got weaker (118% → 112% of league average)."
//   "Your starting lineup stayed 3rd of 12 (104% of league average)."
// Lower ranks are better. null when either side wasn't scored.
export const startPercent = (team) => Math.round(((team && team.starterScore) || 0) * 100);
export function tradeVerdictText(before, after, teams) {
    if (!before || !after) return null;
    const rank = before.starterRank !== after.starterRank
        ? `went ${ord(before.starterRank)} \u2192 ${ord(after.starterRank)} of ${teams}`
        : `stayed ${ord(after.starterRank)} of ${teams}`;
    const pb = startPercent(before), pa = startPercent(after);
    if (pa === pb) return `Your starting lineup ${rank} (${pa}% of league average).`;
    return `Your starting lineup ${rank} and got ${pa > pb ? 'stronger' : 'weaker'} (${pb}% \u2192 ${pa}% of league average).`;
}
