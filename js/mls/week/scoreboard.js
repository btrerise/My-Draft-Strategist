// --- THIS WEEK: THE SCOREBOARD'S RULES (improvements S21) ---
// The Dashboard's "This week" card (week/thisWeek.js) shows every Sleeper league's matchup, live: the W-L, a line per
// league, and the matchups still in play. This module is its arithmetic, with no app state, DOM or fetches, so
// tests/unit/weekScoreboard.test.mjs can run it under node --test. thisWeek.js turns Sleeper's matchups, the player
// map and the week's game states into the plain objects these functions take.
//
// The rules are the owner's weekly recap skill's (sleeper-weekly-recap, v3), which they ran three times a week
// (before SNF, before MNF, after MNF):
// - A starter is live while his team's game isn't final and he isn't Out or on bye, whatever he has scored so far
//   (a 0.0 whose team still has to play is live). A 0.0 for a team that has played, is on bye or is out is a dead slot.
// - A matchup is in play (a "swing") when the trailing side has live players who could realistically close the gap
//   (typical remaining output: QB ~20, RB/WR ~15, TE ~8), or the lead is under about 25 and the trailing side still
//   has someone live. Trailing with nobody live, or leading while the opponent has nobody live, is effectively decided.
// - In Best Ball the lineup picks itself after the games, so anyone on the roster with a game to come can still count.
// - The whole week is provisional until its last game is final.

// What a live player can still add, by position: the skill's "typical remaining output". K and DEF weren't in the
// skill; 8, like a TE.
export const REACH_BY_POS = { QB: 20, RB: 15, WR: 15, TE: 8, K: 8, DEF: 8 };
// A lead under this is never "effectively decided" while the trailing side has someone live.
export const CLOSE_LEAD = 25;

const round1 = (n) => Math.round(n * 10) / 10;

// p: { team, gameState: 'pre' | 'in' | 'post' | null (unknown), onBye, out }.
// 'live' (still to play or playing), 'done' (his game is final) or 'dead' (no team, on bye, or out before playing).
export function starterState(p) {
    if (!p || !p.team || p.onBye) return 'dead';
    if (p.gameState === 'post') return 'done';
    if (p.out) return 'dead';
    return 'live';
}

// What a live player can still add: his position's typical output, less what he has already scored (a QB on 18 late
// in his game has about 2 left). Never negative.
export function reachOf(p) {
    const typical = REACH_BY_POS[p.pos] ?? 8;
    return Math.max(typical - Math.max(Number(p.points) || 0, 0), 0);
}

// One side of a matchup. starters / bench: [{ id, name, pos, team, points, gameState, onBye, out }].
// Returns { points, starters (each with .state), live, liveBench, reach }: live starters, and in Best Ball the live
// bench players too (any of them can still replace a starter's score). reach: what the live players can add; in
// Best Ball the best `starters.length` of everyone live, since only that many count.
export function sideSummary({ points, starters = [], bench = [], bestBall = false }) {
    const withState = (p) => ({ ...p, state: starterState(p) });
    const all = starters.map(withState);
    const live = all.filter(p => p.state === 'live');
    const liveBench = bestBall ? bench.map(withState).filter(p => p.state === 'live') : [];
    const reaches = [...live, ...liveBench].map(reachOf).sort((a, b) => b - a);
    const reach = round1((bestBall ? reaches.slice(0, Math.max(all.length, 1)) : reaches).reduce((s, n) => s + n, 0));
    return { points: round1(Number(points) || 0), starters: all, live, liveBench, reach };
}

const liveCount = (side) => side.live.length + side.liveBench.length;

// A head-to-head matchup from your side (me) and the opponent's.
// margin: your points less theirs. lead: 'me' | 'opp' | null (tied).
// status: 'done' (nobody live on either side), 'swing' (still in play) or 'decided' (effectively decided).
// underdogLive: whether the side behind has anyone left (for the wording).
export function classifyMatchup(me, opp) {
    const margin = round1(me.points - opp.points);
    const lead = margin > 0 ? 'me' : (margin < 0 ? 'opp' : null);
    if (liveCount(me) + liveCount(opp) === 0) return { margin, lead, status: 'done' };
    if (lead === null) return { margin, lead, status: 'swing' };
    const trailing = lead === 'me' ? opp : me;
    const gap = Math.abs(margin);
    if (liveCount(trailing) === 0) return { margin, lead, status: 'decided' };
    const swing = trailing.reach >= gap || gap < CLOSE_LEAD;
    return { margin, lead, status: swing ? 'swing' : 'decided' };
}

// 'W' | 'L' | 'T' for the matchup as it stands.
export const resultOf = (m) => m.lead === 'me' ? 'W' : (m.lead === 'opp' ? 'L' : 'T');

// Your place among every team's points this week, for a league that also plays the league median (Sleeper's
// league_average_match): rank 1 = most points; above = in the top half, which wins the median game.
export function medianPlace(myPoints, allPoints) {
    const n = allPoints.length;
    const rank = allPoints.filter(p => p > myPoints).length + 1;
    return { rank, of: n, above: rank <= n / 2 };
}

// A guillotine league (Sleeper type 3): no opponent, the lowest score among the teams still alive is chopped.
// teams: [{ points, alive }] for every roster, mine included (alive: it still has players). Returns null when your
// team is out, else { rank, of, cushion }: your place among the alive teams and how far you are above the lowest
// of them (or, when you're the lowest, how far behind the next team: negative).
export function guillotinePlace(myPoints, teams, myAlive = true) {
    if (!myAlive) return null;
    const alive = teams.filter(t => t.alive).map(t => Number(t.points) || 0);
    const of = alive.length;
    const rank = alive.filter(p => p > myPoints).length + 1;
    const others = [...alive].sort((a, b) => a - b);
    // Remove one copy of your own score, then compare with the lowest (or next-lowest) of the rest.
    const i = others.indexOf(myPoints);
    if (i !== -1) others.splice(i, 1);
    const lowestOther = others.length ? others[0] : myPoints;
    return { rank, of, cushion: round1(myPoints - lowestOther) };
}

// The headline: the W-L as it stands across head-to-head matchups, split paid / free and redraft / dynasty.
// rows: [{ result: 'W' | 'L' | 'T', paid, group: 'redraft' | 'dynasty', keeper, status }]. Keeper counts with redraft.
export function summarize(rows) {
    const blank = () => ({ W: 0, L: 0, T: 0 });
    const out = { all: blank(), paid: blank(), free: blank(), redraft: blank(), dynasty: blank(), stillLive: 0, keeper: false };
    rows.forEach(r => {
        out.all[r.result]++;
        out[r.paid ? 'paid' : 'free'][r.result]++;
        out[r.group === 'dynasty' ? 'dynasty' : 'redraft'][r.result]++;
        if (r.status === 'swing') out.stillLive++;
        if (r.keeper) out.keeper = true;
    });
    return out;
}

// "9–6", or "9–6–1" with a tie.
export const recordText = (r) => `${r.W}–${r.L}${r.T ? `–${r.T}` : ''}`;

// The order of the matchups still in play: the most uncertain first, by the Simulator's win chance when it has one
// (the underdog side's chance: a comeback when you trail, a collapse when you lead), else by the gap left once the
// trailing side's reach is counted.
export function swingOrder(a, b) {
    const upset = (m) => m.winChance == null ? null : Math.min(m.winChance, 100 - m.winChance);
    const ua = upset(a), ub = upset(b);
    if (ua != null && ub != null && ua !== ub) return ub - ua;
    if (ua != null && ub == null) return -1;
    if (ua == null && ub != null) return 1;
    return Math.abs(a.margin) - Math.abs(b.margin);
}

// --- FROM A SLEEPER SYNC (leagues/sync.js) ---
// Saved on the league at sync, so the card needn't fetch them again (a league synced before S21 has none until its
// next sync; thisWeek.js then reads them from Sleeper once per visit).

// { roster_id: owner's display name } for every team, from the league's users and rosters.
export function teamNamesFrom(users, rosters) {
    const byUser = {};
    (Array.isArray(users) ? users : []).forEach(u => { if (u && u.user_id) byUser[u.user_id] = u.display_name || u.username || ''; });
    const out = {};
    (Array.isArray(rosters) ? rosters : []).forEach(r => {
        if (!r || r.roster_id == null) return;
        out[r.roster_id] = byUser[r.owner_id] || `Team ${r.roster_id}`;
    });
    return out;
}

// Whether the league also plays the league median each week (Sleeper's league_average_match), and whether it's a
// guillotine league (type 3; a redraft league with no opponent, where the lowest score is chopped each week).
export const playsMedian = (settings) => !!(settings && settings.league_average_match === 1);
export const isGuillotine = (settings) => !!(settings && settings.type === 3);

// Your season record from the league's rosters, for the Roster tab: { wins, losses, ties, pf, pa, pfRank, paRank, of }.
// Ranks: 1 = the most points for (or against) in the league. null before anyone has played, or without your roster.
export function seasonRecord(rosters, rosterId) {
    const list = Array.isArray(rosters) ? rosters.filter(r => r && r.settings) : [];
    const mine = list.find(r => r.roster_id === rosterId);
    if (!mine) return null;
    const pts = (r, k) => (Number(r.settings[k]) || 0) + (Number(r.settings[`${k}_decimal`]) || 0) / 100;
    const s = mine.settings;
    const wins = Number(s.wins) || 0, losses = Number(s.losses) || 0, ties = Number(s.ties) || 0;
    if (wins + losses + ties === 0) return null;
    const pf = round1(pts(mine, 'fpts')), pa = round1(pts(mine, 'fpts_against'));
    const rankBy = (k, mineVal) => list.filter(r => round1(pts(r, k)) > mineVal).length + 1;
    return { wins, losses, ties, pf, pa, pfRank: rankBy('fpts', pf), paRank: rankBy('fpts_against', pa), of: list.length };
}

// 1st, 2nd, 3rd, 4th... 11th, 12th, 13th, 21st.
export function ordinal(n) {
    const v = n % 100;
    const suffix = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return `${n}${suffix}`;
}
