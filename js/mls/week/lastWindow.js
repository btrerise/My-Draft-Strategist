// --- THE FINAL WINDOW: WHAT RIDES ON THE LAST GAMES OF THE WEEK (improvements S36) ---
// When the week comes down to its last kickoff window (Sunday night, or Monday night with one or two games), the
// Scoreboard shows what's at stake across your leagues: how many matchups, expected wins with a middle range, the best
// case and a clean sweep's chance, then what each matchup needs, in words and, when two players decide it, a small
// table. This module is the arithmetic, with no app state, DOM or fetches (tests/unit/lastWindow.test.mjs runs it under
// node --test). week/thisWeek.js turns the Scoreboard's rows into the plain objects it takes.
//
// Owner's choices (2026-11-13): the name "Final Window" (ours; the idea came from FF Historian's "Monday Night Miracle",
// credited in the Guide); it shows when every live player in your matchups is in one night window, Sunday night
// included; and the range, best case and sweep come from one simulation across every live matchup together: each run
// draws every live player once and scores him in every league he's in (with that league's mean and spread), so one big
// night from a player moves all his matchups together, which per-league win chances combined as if independent miss.

// A window's games all kick off on the same day (US Eastern) at or after this hour: the night games. Two Monday games
// (7:15 and 8:15 PM, or 8:15 and 10:30 PM) are one window; SNF alone is one when nobody you care about plays Monday.
export const NIGHT_HOUR_ET = 17;
export const DEFAULT_RUNS = 10000;
// A matchup the shared simulation puts under this share (or over 1 − it) is settled, as the Scoreboard's own rule for
// "effectively decided" (thisWeek.js buildModel: under 0.5% or over 99.5%).
export const SETTLED = 0.005;
// The same game-script link the Simulator's worker uses (sim/worker.js QB_STACK_CORRELATION) between a QB and his own
// team's pass-catchers. Here it spans leagues: one Josh Allen draw per run, linked to one draw for each BUF WR/TE.
export const STACK_CORRELATION = 0.35;
// The "big night" row of the two-player table: the 90th percentile of his remaining points (mean + 1.28 spreads).
export const BIG_Z = 1.2816;

const round1 = (n) => Math.round(n * 10) / 10;
export const fmt = (n) => round1(Number(n) || 0).toFixed(1);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- When it shows ---
const ET = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }) : null;
function etDayHour(ms) {
    const parts = Object.fromEntries(ET.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

/**
 * The final window, or null when the week isn't down to it.
 * liveTeams: the NFL teams of every live player in your head-to-head matchups (both sides).
 * times: { team: ISO kickoff }, games: { team: { opp, home, state } } (the Scoreboard's ctx.times / ctx.games).
 * It's the window when every one of those teams has a known kickoff, none is final, and they all kick off on one day
 * (US Eastern) at NIGHT_HOUR_ET or later. Returns { teams, games: [{ away, home, kickoff (ms), state }], kickoff
 * (earliest ms) }.
 */
export function finalWindow({ liveTeams, times = {}, games = {} }) {
    const teams = [...new Set([...(liveTeams || [])].filter(Boolean))];
    if (!teams.length || !ET) return null;
    let day = null;
    const list = new Map();
    for (const team of teams) {
        const ms = times[team] ? new Date(times[team]).getTime() : NaN;
        if (isNaN(ms)) return null;
        const g = games[team] || {};
        if (g.state === 'post') return null; // a live player's team can't be final; the data disagrees, so don't guess
        const at = etDayHour(ms);
        if (at.hour < NIGHT_HOUR_ET) return null;
        if (day === null) day = at.day;
        else if (day !== at.day) return null;
        const opp = g.opp || null;
        const [away, home] = g.home === true ? [opp, team] : [team, opp];
        const key = [away, home].join('@');
        if (!list.has(key)) list.set(key, { away, home, kickoff: ms, state: g.state || null });
    }
    const gs = [...list.values()].sort((a, b) => a.kickoff - b.kickoff || String(a.away).localeCompare(String(b.away)));
    return { teams, games: gs, kickoff: gs[0].kickoff };
}

// --- The shared simulation ---
function randomNormal(random) {
    let u = 0, v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Already settled whatever happens: 'W' when only your side can still score and you lead, 'L' when only theirs can and
// you don't (a tie at best). Points still to come never go below zero here (as the Simulator floors its draws).
export function certainResult(m) {
    const mine = (m.mine || []).length, theirs = (m.theirs || []).length;
    if (!theirs && m.margin > 0) return 'W';
    if (!mine && m.margin <= 0) return 'L';
    return null;
}

/**
 * matchups: [{ key, margin (your points less theirs, now), mine: [P], theirs: [P] }], P being a live player as scored in
 * that league: { id, pos, team, mean, sd }, mean and sd of his points still to come (never below 0 when drawn).
 * Each run draws one standard normal per player id (QB and his team's WR/TE share part of it), and every matchup
 * scores it with its own mean and sd. Options: runs, random (for tests).
 * Returns { runs, chances: Map key -> your win share 0-1, tiles: { live, atStake, stake: [keys], expected, low, high,
 * best, bestShare, sweepShare } } where the tiles count only the matchups at stake (not certain, and between SETTLED
 * and 1 − SETTLED in the runs): low / high are the 10th and 90th percentiles of their wins.
 */
export function simulateWindow(matchups, { runs = DEFAULT_RUNS, random = Math.random } = {}) {
    const n = matchups.length;
    const ids = new Map(); // id -> index
    const info = [];
    const idx = (p) => {
        if (!ids.has(p.id)) { ids.set(p.id, info.length); info.push({ pos: p.pos, team: p.team }); }
        return ids.get(p.id);
    };
    const sides = matchups.map(m => ({
        margin: Number(m.margin) || 0,
        mine: (m.mine || []).map(p => [idx(p), Math.max(Number(p.mean) || 0, 0), Math.max(Number(p.sd) || 0, 0)]),
        theirs: (m.theirs || []).map(p => [idx(p), Math.max(Number(p.mean) || 0, 0), Math.max(Number(p.sd) || 0, 0)]),
    }));
    // Stacks: a QB and his own team's WR/TE, across every league.
    const byTeam = new Map();
    info.forEach((p, i) => {
        if (!p.team || !['QB', 'WR', 'TE'].includes(p.pos)) return;
        if (!byTeam.has(p.team)) byTeam.set(p.team, []);
        byTeam.get(p.team).push(i);
    });
    const stackOf = new Array(info.length).fill(-1);
    let stacks = 0;
    byTeam.forEach(list => {
        if (list.length < 2 || !list.some(i => info[i].pos === 'QB') || !list.some(i => info[i].pos !== 'QB')) return;
        list.forEach(i => { stackOf[i] = stacks; });
        stacks++;
    });
    const a = Math.sqrt(STACK_CORRELATION), b = Math.sqrt(1 - STACK_CORRELATION);
    const z = new Float64Array(info.length), shared = new Float64Array(stacks);
    const won = new Uint8Array(runs * n);
    const wins = new Float64Array(n);
    const score = (list) => { let t = 0; for (const [i, mean, sd] of list) t += sd > 0 ? Math.max(0, mean + sd * z[i]) : mean; return t; };
    for (let r = 0; r < runs; r++) {
        for (let s = 0; s < stacks; s++) shared[s] = randomNormal(random);
        for (let i = 0; i < info.length; i++) z[i] = stackOf[i] >= 0 ? a * shared[stackOf[i]] + b * randomNormal(random) : randomNormal(random);
        for (let k = 0; k < n; k++) {
            const s = sides[k];
            if (s.margin + score(s.mine) - score(s.theirs) > 0) { won[r * n + k] = 1; wins[k]++; }
        }
    }
    const chances = new Map();
    const stake = [];
    matchups.forEach((m, k) => {
        const c = certainResult(m);
        const share = c === 'W' ? 1 : (c === 'L' ? 0 : (runs ? wins[k] / runs : 0));
        chances.set(m.key, share);
        if (!c && share >= SETTLED && share <= 1 - SETTLED) stake.push(k);
    });
    const hist = new Array(stake.length + 1).fill(0);
    for (let r = 0; r < runs; r++) {
        let w = 0;
        for (const k of stake) w += won[r * n + k];
        hist[w]++;
    }
    const pct = (q) => { let cum = 0; for (let w = 0; w < hist.length; w++) { cum += hist[w]; if (cum >= q * runs) return w; } return hist.length - 1; };
    let best = 0;
    hist.forEach((c, w) => { if (c > 0) best = w; });
    const expected = runs ? hist.reduce((t, c, w) => t + c * w, 0) / runs : 0;
    return {
        runs, chances,
        tiles: {
            live: n, atStake: stake.length, stake: stake.map(k => matchups[k].key),
            expected: Math.round(expected * 10) / 10,
            low: runs ? pct(0.1) : 0, high: runs ? pct(0.9) : 0,
            best, bestShare: runs ? hist[best] / runs : 0,
            sweepShare: runs && stake.length ? hist[stake.length] / runs : 0,
        },
    };
}

// "under 1%", "about 12%", ">99%": a share of the runs in words.
export function shareText(share) {
    const p = share * 100;
    if (p < 1) return p === 0 ? '0%' : 'under 1%';
    if (p > 99) return p === 100 ? '100%' : 'over 99%';
    return `${Math.round(p)}%`;
}

// --- What each matchup needs, in words ---
const namesOf = (list, esc) => list.map(p => `<strong>${esc(p.name)}</strong>`).join(' + ');
const needVerb = (list) => list.length === 1 ? 'needs' : 'need';

/**
 * One line, from your side: the margin and what it takes. m: { margin, mine: [{ name }], theirs: [{ name }] }.
 * Names are escaped (esc: escapeHtml by default) and wrapped in <strong>.
 */
export function needsLine(m, esc = escapeHtml) {
    const g = fmt(Math.abs(m.margin));
    const mine = m.mine || [], theirs = m.theirs || [];
    const M = namesOf(mine, esc), T = namesOf(theirs, esc);
    const lead = m.margin > 0 ? `Up ${g}.` : (m.margin < 0 ? `Down ${g}.` : 'Level.');
    if (!mine.length && !theirs.length) return `${lead} Nobody left to play.`;
    if (!theirs.length) {
        if (m.margin > 0) return `${lead} Nobody left on their side: anything from ${M} does it.`;
        if (m.margin === 0) return `${lead} Any points from ${M} win it.`;
        return `${lead} ${M} ${needVerb(mine)} ${g}+ more.`;
    }
    if (!mine.length) {
        if (m.margin > 0) return `${lead} Hold ${T} under ${g} more.`;
        if (m.margin === 0) return `${lead} Nobody left on your side: any points from ${T} win it for them.`;
        return `${lead} Nobody left on your side: even a zero from ${T} isn't enough.`;
    }
    if (m.margin < 0) return `${lead} ${M} ${needVerb(mine)} ${g}+ more than ${T}.`;
    if (m.margin > 0) return `${lead} ${T} ${needVerb(theirs)} ${g}+ more than ${M}.`;
    return `${lead} ${M} ${needVerb(mine)} more than ${T}.`;
}

/**
 * When exactly two live players decide a matchup: "if the first gets 0 / his projection / a big night, the second
 * needs …". The first is the one with more still to come. m: { margin, mine: [P], theirs: [P] } with P { name, mean, sd }.
 * Returns null, or { first: { name, side }, second: { name, side }, head, rows: [{ label, value, text }] }:
 * text is "12.3+" or "anything" when the second is yours, "under 12.3" or "even a zero isn't enough" when he's theirs.
 */
export function twoPlayerTable(m) {
    const all = [...(m.mine || []).map(p => ({ ...p, side: 'mine' })), ...(m.theirs || []).map(p => ({ ...p, side: 'theirs' }))];
    if (all.length !== 2) return null;
    const [first, second] = [...all].sort((x, y) => (Number(y.mean) || 0) - (Number(x.mean) || 0));
    const mean = Math.max(Number(first.mean) || 0, 0), sd = Math.max(Number(first.sd) || 0, 0);
    const scenarios = [
        { label: 'Quiet', value: 0 },
        { label: 'Projection', value: round1(mean) },
        { label: 'Big night', value: round1(mean + BIG_Z * sd) },
    ];
    // Your lead once the first has scored x: he adds to it if he's yours, takes from it if he's theirs.
    const leadAfter = (x) => round1(m.margin + (first.side === 'mine' ? x : -x));
    const rows = scenarios.map(s => {
        const lead = leadAfter(s.value);
        if (second.side === 'mine') {
            const need = round1(-lead);
            return { ...s, need, text: need < 0 ? 'anything' : `${fmt(need)}+` };
        }
        return { ...s, need: lead, text: lead <= 0 ? "even a zero isn't enough" : `under ${fmt(lead)}` };
    });
    return {
        first: { name: first.name, side: first.side }, second: { name: second.name, side: second.side },
        head: second.side === 'mine' ? 'needs' : 'must stay',
        rows,
    };
}
