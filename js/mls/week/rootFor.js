// --- WHO TO ROOT FOR, ACROSS YOUR LEAGUES (improvements S27) ---
// The Scoreboard's Player Scoreboard opens with "Who to root for": every starter in this week's Sleeper matchups, sorted
// into the ones you want to score (yours), the ones you don't (your opponents'), and the ones on both sides. The idea
// came from Sleepy (sleepy-football.vercel.app); none of its code, words or design is used. This module is the rule, with
// no app state, DOM, storage or fetches, so tests/unit/rootFor.test.mjs can run it under node --test. week/thisWeek.js
// hands it each league's starters on both sides (bench players never count; Best Ball's are the lineup it would pick,
// bestBallLineup in playerRecap.js) and draws what comes back.
//
// The groups (the card's rule):
// - Root for: your starter in 2 or more leagues, and your opponent's in none.
// - Against you: your opponent's starter in 2 or more leagues, and yours in none.
// - Both sides: yours in at least one and against you in at least one, with a share score: the weight of the leagues
//   where he's yours divided by the weight of all his leagues, as a percent.
// A guillotine league, or one with no opponent this week (median only), has nobody against you: its starters count for
// you only, and the board says which leagues those are.
//
// The weight of one league for one player (owner's choice, S27): paid × stakes × impact.
// - paid: PAID_WEIGHT in a league marked "$ Paid", 1 otherwise.
// - stakes: how much the matchup is still open, from the Matchup Simulator's win chance p: 4·p·(1 − p), so 1 at 50/50,
//   0.36 at 90/10 and 0 at 0 or 100. A matchup that's done or effectively decided (week/scoreboard.js) is 0. Without a
//   chance (Best Ball, a guillotine league, week 1, or before the Simulator answers) an open matchup is 1.
// - impact: his share of what his side is still projected to score: his projected points left ÷ the side's. A kicker
//   counts for less than a receiver with his whole game ahead; once his game is over he's 0. Without projections, an
//   even share among the side's players still to play.
// The owner's fourth part, how many of your leagues he's in, is the sum itself: each league he starts in adds its weight.
// When every weight is 0 (a past week, or every game over), the share falls back to the paid weights alone, so a finished
// week still reads sensibly, and the lists order by how many leagues.

import { bestBallLineup } from './playerRecap.js';

export const PAID_WEIGHT = 1.5;
// "In 2 or more" of your matchups for Root for and Against you.
export const SPOTLIGHT_MIN = 2;

const round3 = (n) => Math.round(n * 1000) / 1000;

// status: 'swing' | 'decided' | 'done' | 'none' (no opponent); chance: your win chance in percent, or null.
export function stakesOf({ status, chance } = {}) {
    if (status === 'done' || status === 'decided') return 0;
    if (typeof chance !== 'number' || !Number.isFinite(chance)) return 1;
    const p = Math.min(Math.max(chance / 100, 0), 1);
    return round3(4 * p * (1 - p));
}

// side: [{ id, remaining: number | null, over: boolean }]. Returns Map id -> impact (0-1), summing to 1 across the side
// while anyone is still to play.
export function impactsOf(side = []) {
    const out = new Map();
    const open = side.filter(p => !p.over);
    const known = open.filter(p => typeof p.remaining === 'number' && Number.isFinite(p.remaining) && p.remaining > 0);
    // A player still to play with no projection takes the average of the known ones (or 1 when none is known), so a
    // missing projection doesn't make him count for nothing.
    const fill = known.length ? known.reduce((s, p) => s + p.remaining, 0) / known.length : 1;
    const valueOf = (p) => p.over ? 0 : (typeof p.remaining === 'number' && Number.isFinite(p.remaining) ? Math.max(p.remaining, 0) : fill);
    const total = side.reduce((s, p) => s + valueOf(p), 0);
    side.forEach(p => out.set(p.id, total > 0 ? round3(valueOf(p) / total) : 0));
    return out;
}

// leagues: [{ id, name, paid, status ('swing' | 'decided' | 'done' | 'none'), chance (percent or null),
//   mine: [{ id, remaining, over }], theirs: [...] (empty for a league with no opponent), noOpponent: boolean }].
// Returns { players: [row], root, against, both, noOpponent: [league names] }, each list sorted: players still to play
// first, by total weight, then by how many leagues, then by id (stable for the tests). A row:
//   { id, yours: [part], against: [part], count, yoursWeight, againstWeight, weight, share (percent, both sides only),
//     group: 'root' | 'against' | 'both' | null, over (his game is over in every league) }
// and a part: { leagueId, name, paid, status, chance, stakes, impact, weight }.
export function buildRootFor({ leagues = [] } = {}) {
    const byId = new Map();
    const rowOf = (id) => {
        if (!byId.has(id)) byId.set(id, { id, yours: [], against: [], over: true });
        return byId.get(id);
    };
    const noOpponent = [];
    leagues.forEach(l => {
        if (!l) return;
        const paid = l.paid ? PAID_WEIGHT : 1;
        const stakes = stakesOf(l.noOpponent ? { status: 'none', chance: null } : l);
        if (l.noOpponent) noOpponent.push(l.name);
        const add = (side, list) => {
            const impacts = impactsOf(side || []);
            (side || []).forEach(p => {
                if (!p || !p.id) return;
                const row = rowOf(p.id);
                if (!p.over) row.over = false;
                const impact = impacts.get(p.id) || 0;
                row[list].push({ leagueId: l.id, name: l.name, paid: !!l.paid, status: l.noOpponent ? 'none' : l.status, chance: l.noOpponent ? null : (l.chance ?? null), stakes, impact, weight: round3(paid * stakes * impact) });
            });
        };
        add(l.mine, 'yours');
        if (!l.noOpponent) add(l.theirs, 'against');
    });
    const sum = (parts, f) => parts.reduce((s, x) => s + f(x), 0);
    const paidOnly = (x) => (x.paid ? PAID_WEIGHT : 1);
    const players = [...byId.values()].map(r => {
        const yoursWeight = round3(sum(r.yours, x => x.weight)), againstWeight = round3(sum(r.against, x => x.weight));
        const weight = round3(yoursWeight + againstWeight);
        let group = null;
        if (r.yours.length && r.against.length) group = 'both';
        else if (r.yours.length >= SPOTLIGHT_MIN) group = 'root';
        else if (r.against.length >= SPOTLIGHT_MIN) group = 'against';
        let share = null;
        if (group === 'both') {
            const [y, t] = weight > 0 ? [yoursWeight, weight] : [sum(r.yours, paidOnly), sum(r.yours, paidOnly) + sum(r.against, paidOnly)];
            share = Math.round((y / t) * 100);
        }
        return { ...r, count: r.yours.length + r.against.length, yoursWeight, againstWeight, weight, share, group };
    });
    const order = (a, b) => Number(a.over) - Number(b.over) || b.weight - a.weight || b.count - a.count || String(a.id).localeCompare(String(b.id));
    players.sort(order);
    return {
        players,
        root: players.filter(r => r.group === 'root'),
        against: players.filter(r => r.group === 'against'),
        both: players.filter(r => r.group === 'both'),
        noOpponent,
    };
}

// One side's list for a kickoff window ("Your starters" / "Against you"), ordered by that side's weight, then count.
export function sideOrder(rows, side) {
    const w = side === 'yours' ? 'yoursWeight' : 'againstWeight';
    const n = (r) => r[side].length;
    return rows.filter(r => n(r) > 0).sort((a, b) => b[w] - a[w] || n(b) - n(a) || String(a.id).localeCompare(String(b.id)));
}

// The ids that count as one team's starters this week: Sleeper's starters (empty slots, '0', dropped; the bench never
// counts), or in Best Ball, with the league's slot order, the lineup Best Ball would pick from the points so far
// (bestBallLineup, as the Scoreboard scores it). entry: Sleeper's matchup entry { starters, players, players_points }.
export function starterIdsOf(entry, { bestBall = false, slots = null, posOf = () => null } = {}) {
    if (!entry) return [];
    const starters = (entry.starters || []).filter(id => id && id !== '0');
    if (!bestBall || !Array.isArray(slots) || !slots.length || (entry.starters || []).length !== slots.length) return starters;
    const pts = entry.players_points || {};
    return [...bestBallLineup(slots, entry.players || [], id => (typeof pts[id] === 'number' ? pts[id] : 0), posOf, new Set(starters))];
}
