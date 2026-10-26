// --- THIS WEEK: MVPs AND LVPs ACROSS YOUR LEAGUES (improvements S22) ---
// The other half of the owner's weekly recap skill (sleeper-weekly-recap, v3): which of your players won and lost your
// week, counted across every Sleeper league you're in. This module is the arithmetic, with no app state, DOM, storage
// or fetches, so tests/unit/playerRecap.test.mjs can run it under node --test. week/thisWeek.js hands it each league's
// matchup entry (S21's fetch: `players`, `starters`, `players_points`), the player map and the week's game states, and
// draws what comes back in a folded section of the Scoreboard tab.
//
// The rules (the skill's, with the owner's answers in S22):
// - Boom / Bust lines by position, in each league's own scoring (Sleeper's points): QB Boom 24+, Bust under 12; RB 20 /
//   7; WR 20 / 7.5; TE 15 / 5.5. Editable in Advanced Settings (week/thisWeek.js keeps them under mls_recap_lines);
//   they're separate from the Matchup Simulator's boom/bust chances. K and DEF aren't covered.
// - Ownership: the leagues where the player is on your roster (bench included) out of your Sleeper leagues this week
//   (owner: Sleeper only, so every percent has points behind it). "26% (5)".
// - MVP: on a roster, at or above Boom in at least one league. Ranked by the leagues where he was owned and boomed, then
//   ownership. A partial boom (boomed in under half the leagues that own him, like a TE on 15.7 in one TE-premium league
//   and 12-13 in five others) goes below the full ones and is called out.
// - LVP: on a roster, below Bust in at least one league, and his game is final. Ranked by the leagues where he started
//   and busted (what hurt), then ownership.
// - The extra lines: started zeros (a starter on 0.0 whose game is final; usually inactive, which the app can't verify),
//   dead weight (widely owned, nothing scored, on the bench everywhere), still open (game not final: could land on either
//   list) and worst benchings (outside Best Ball, a benched player who boomed while your lowest starter at his position
//   in that league scored far less).
// - Left out: players on a bye, players with no team, K and DEF. A player id the map can't resolve is listed as
//   unresolved, and called out when it scored a Boom-level number.

export const RECAP_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const DEFAULT_LINES = Object.freeze({
    QB: Object.freeze({ boom: 24, bust: 12 }),
    RB: Object.freeze({ boom: 20, bust: 7 }),
    WR: Object.freeze({ boom: 20, bust: 7.5 }),
    TE: Object.freeze({ boom: 15, bust: 5.5 }),
});
// A partial boom: boomed in fewer than this share of the leagues that own him.
export const PARTIAL_SHARE = 0.5;
// Dead weight is "widely owned": on at least this share of your leagues, and in at least 2.
export const WIDE_SHARE = 0.2;
// A benching is one of the worst when the starter scored at least this many points less than the bench player.
export const BENCHING_GAP = 10;

const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

// Saved lines, or anything else, as a full, valid set: a position whose numbers are missing or wrong keeps the defaults.
export function normalizeLines(raw) {
    const out = {};
    RECAP_POSITIONS.forEach(pos => {
        const r = raw && typeof raw === 'object' ? raw[pos] : null;
        const boom = num(r && r.boom), bust = num(r && r.bust);
        out[pos] = Number.isFinite(boom) && Number.isFinite(bust) && bust > 0 && boom > bust ? { boom, bust } : { ...DEFAULT_LINES[pos] };
    });
    return out;
}

// What the Settings form sends ({ QB: { boom: '24', bust: '12' }, ... }): { ok, lines, errors: [{ pos, field, message }] }.
// Both numbers positive, Boom above Bust.
export function validateLines(input) {
    const lines = {}, errors = [];
    RECAP_POSITIONS.forEach(pos => {
        const r = (input && input[pos]) || {};
        const boom = num(r.boom), bust = num(r.bust);
        if (!Number.isFinite(boom) || boom <= 0) errors.push({ pos, field: 'boom', message: `${pos} Boom must be a number above 0.` });
        if (!Number.isFinite(bust) || bust <= 0) errors.push({ pos, field: 'bust', message: `${pos} Bust must be a number above 0.` });
        if (Number.isFinite(boom) && Number.isFinite(bust) && boom > 0 && bust > 0 && boom <= bust) errors.push({ pos, field: 'boom', message: `${pos} Boom must be above its Bust line.` });
        lines[pos] = { boom, bust };
    });
    return errors.length ? { ok: false, lines: null, errors } : { ok: true, lines, errors };
}

// The lowest Boom line: what an unresolved player must reach to be called out.
const lowestBoom = (lines) => Math.min(...RECAP_POSITIONS.map(p => lines[p].boom));
const isTeamCode = (id) => /^[A-Z]{2,3}$/.test(String(id));

// leagues: [{ id, name, bestBall, entry: { players, starters, players_points } }] — your entry in each Sleeper league.
//   A league with no entry, or an entry with no players (a chopped guillotine team), isn't counted.
// players: { id: { name, pos, team } } from the player map (pos: the fantasy position).
// games: { TEAM: { state: 'pre' | 'in' | 'post' } } (none: game states unknown, so nobody is final).
// byeTeams: the teams on a bye this week (a Set or an array).
// Returns { leagueCount, mvps, lvps, partial, startedZeros, deadWeight, stillOpen, worstBenchings, unresolved,
// bestBallNote }. Each player row: { id, name, pos, team, own, ownPct, boomed, busted, started, startedBusted, min, max,
// state, partial, leagues: [{ id, name, bestBall, points, started }] }.
export function buildPlayerRecap({ leagues = [], players = {}, games = {}, byeTeams = [], lines: rawLines } = {}) {
    const lines = normalizeLines(rawLines);
    const byes = byeTeams instanceof Set ? byeTeams : new Set(byeTeams || []);
    const counted = leagues.filter(l => l && l.entry && Array.isArray(l.entry.players) && l.entry.players.length);
    const n = counted.length;
    const empty = { leagueCount: n, mvps: [], lvps: [], partial: [], startedZeros: [], deadWeight: [], stillOpen: [], worstBenchings: [], unresolved: [], bestBallNote: false };
    if (!n) return empty;

    const stateOf = (team) => (team && games[team] && games[team].state) || null;
    const byId = new Map();
    const unresolved = new Map();
    counted.forEach(l => {
        const pts = l.entry.players_points || {};
        const starters = new Set((l.entry.starters || []).filter(id => id && id !== '0'));
        l.entry.players.forEach(id => {
            if (!id || id === '0') return;
            const points = typeof pts[id] === 'number' ? pts[id] : 0;
            const p = players[id];
            if (!p) {
                if (isTeamCode(id)) return; // a defense: not covered
                const u = unresolved.get(id) || { id, max: 0, leagues: [] };
                u.max = Math.max(u.max, points);
                u.leagues.push({ id: l.id, name: l.name, points });
                unresolved.set(id, u);
                return;
            }
            if (!RECAP_POSITIONS.includes(p.pos) || !p.team || byes.has(p.team)) return;
            let row = byId.get(id);
            if (!row) {
                row = { id, name: p.name || id, pos: p.pos, team: p.team, state: stateOf(p.team), leagues: [] };
                byId.set(id, row);
            }
            row.leagues.push({ id: l.id, name: l.name, bestBall: !!l.bestBall, points: round1(points), started: starters.has(id) });
        });
    });

    const rows = [...byId.values()].map(r => {
        const line = lines[r.pos];
        const ls = r.leagues;
        const boomedIn = ls.filter(x => x.points >= line.boom);
        const bustedIn = ls.filter(x => x.points < line.bust);
        const values = ls.map(x => x.points);
        const own = ls.length;
        return {
            ...r,
            own, ownPct: Math.round(own / n * 100),
            boomed: boomedIn.length, busted: bustedIn.length,
            started: ls.filter(x => x.started).length,
            startedBusted: bustedIn.filter(x => x.started).length,
            min: Math.min(...values), max: Math.max(...values),
            partial: boomedIn.length > 0 && boomedIn.length / own < PARTIAL_SHARE,
        };
    });

    const byOwn = (a, b) => b.own - a.own || b.max - a.max || a.name.localeCompare(b.name);
    const mvpAll = rows.filter(r => r.boomed > 0);
    const full = mvpAll.filter(r => !r.partial).sort((a, b) => b.boomed - a.boomed || byOwn(a, b));
    const partial = mvpAll.filter(r => r.partial).sort((a, b) => b.boomed - a.boomed || byOwn(a, b));
    const mvps = [...full, ...partial];
    const mvpIds = new Set(mvps.map(r => r.id));

    const final = (r) => r.state === 'post';
    const lvps = rows.filter(r => final(r) && r.busted > 0 && !mvpIds.has(r.id))
        .sort((a, b) => b.startedBusted - a.startedBusted || byOwn(a, b) || a.min - b.min);

    const startedZeros = rows.filter(r => final(r) && r.leagues.some(x => x.started && x.points === 0))
        .map(r => ({ ...r, zeroIn: r.leagues.filter(x => x.started && x.points === 0).length }))
        .sort((a, b) => b.zeroIn - a.zeroIn || byOwn(a, b));

    const wide = Math.max(2, Math.ceil(n * WIDE_SHARE));
    const deadWeight = rows.filter(r => final(r) && r.own >= wide && r.started === 0 && r.leagues.every(x => x.points === 0)).sort(byOwn);

    const stillOpen = rows.filter(r => !final(r) && !mvpIds.has(r.id)).sort((a, b) => b.own - a.own || b.started - a.started || a.name.localeCompare(b.name));

    // Worst benchings: outside Best Ball (its lineup isn't yours to set), a bench player who boomed while your lowest
    // starter at his position in that league, whose game is over (or who was on a bye or had no team), scored at least
    // BENCHING_GAP less. Same position, so the swap was always allowed, whatever slot that starter filled.
    const worstBenchings = [];
    counted.filter(l => !l.bestBall).forEach(l => {
        const pts = l.entry.players_points || {};
        const starters = (l.entry.starters || []).filter(id => id && id !== '0');
        const startSet = new Set(starters);
        const pointsOf = (id) => round1(typeof pts[id] === 'number' ? pts[id] : 0);
        l.entry.players.forEach(id => {
            if (startSet.has(id)) return;
            const p = players[id];
            if (!p || !RECAP_POSITIONS.includes(p.pos) || !p.team || byes.has(p.team)) return;
            const benchPts = pointsOf(id);
            if (benchPts < lines[p.pos].boom) return;
            const rivals = starters.map(sid => ({ sid, sp: players[sid] })).filter(x => x.sp && x.sp.pos === p.pos)
                .filter(x => !x.sp.team || byes.has(x.sp.team) || stateOf(x.sp.team) === 'post')
                .map(x => ({ id: x.sid, name: x.sp.name || x.sid, pos: x.sp.pos, points: pointsOf(x.sid) }))
                .sort((a, b) => a.points - b.points);
            const starter = rivals[0];
            if (!starter || benchPts - starter.points < BENCHING_GAP) return;
            worstBenchings.push({ league: { id: l.id, name: l.name }, bench: { id, name: p.name || id, pos: p.pos, points: benchPts }, starter, gap: round1(benchPts - starter.points) });
        });
    });
    worstBenchings.sort((a, b) => b.gap - a.gap);

    // Best Ball's lineup is set after the games, so "Started" there is Sleeper's lineup as it stands: worth saying when
    // a listed player sat on a Best Ball bench.
    const benchedInBestBall = (r) => r.leagues.some(x => x.bestBall && !x.started);
    const bestBallNote = [...mvps, ...lvps].some(benchedInBestBall);

    const floor = lowestBoom(lines);
    const unresolvedList = [...unresolved.values()].map(u => ({ ...u, max: round1(u.max), boomLevel: u.max >= floor }))
        .sort((a, b) => b.max - a.max);

    return { leagueCount: n, mvps, lvps, partial, startedZeros, deadWeight, stillOpen, worstBenchings, unresolved: unresolvedList, bestBallNote };
}

// "26% (5)".
export const ownText = (r) => `${r.ownPct}% (${r.own})`;
// "24.1–29.6", or one number when every league scored him the same.
export const pointsRange = (r) => r.min === r.max ? r.min.toFixed(1) : `${r.min.toFixed(1)}–${r.max.toFixed(1)}`;
