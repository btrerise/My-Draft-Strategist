// --- THIS WEEK: MVPs AND LVPs ACROSS YOUR LEAGUES (improvements S22) ---
// The other half of the owner's weekly recap skill (sleeper-weekly-recap, v3): which of your players won and lost your
// week, counted across every Sleeper league you're in. This module is the arithmetic, with no app state, DOM, storage
// or fetches, so tests/unit/playerRecap.test.mjs can run it under node --test. week/thisWeek.js hands it each league's
// matchup entry (S21's fetch: `players`, `starters`, `players_points`), the player map and the week's game states, and
// draws what comes back in a folded section of the Scoreboard tab.
//
// The rules (the skill's, with the owner's answers in S22):
// - One verdict per player (round 8, owner's choice): Boom / Bust is judged once, on one scale for every league: the
//   player's own points for the week in Sleeper's stats, half PPR by default (Full PPR and Standard in Settings; Sleeper's
//   default 4-point passing TDs). A line is easier to reach in a full-PPR or 6-point-TD league, so judging each league's
//   own score made the same game a boom in one league and not another. TE premium and 6-point TDs don't count toward
//   the verdict; each league's own points still show (the Pts range). Without the week's stats (they didn't load), each
//   league's own points against the lines, as before round 8.
// - Boom / Bust lines by position, in each league's own scoring (Sleeper's points): QB Boom 24+, Bust under 12; RB 20 /
//   7; WR 20 / 7.5; TE 15 / 5.5. Editable in Advanced Settings (week/thisWeek.js keeps them under mls_recap_lines);
//   they're separate from the Matchup Simulator's boom/bust chances. K and DEF aren't covered.
// - Ownership: the leagues where the player is on your roster (bench included) out of your Sleeper leagues this week
//   (owner: Sleeper only, so every percent has points behind it). "26% (5)".
// - MVP: at or above Boom in at least one league where you started him (round 2, owner: a player who boomed only on your
//   bench "isn't really an MVP"; those get their own line). Ranked by those started booms, then ownership. A partial boom (boomed in under half the leagues that own him, like a
//   TE on 15.7 in one TE-premium league and 12-13 in five others) goes below the full ones and is called out.
// - Started: the share of the leagues that own him where he started (round 2: beside Own, "67% (4)").
// - Best Ball (round 3): Sleeper sets its lineup after the games, so during the week its `starters` are the lineup as it
//   was left (a TE on 17.6 can sit behind one on 0.0). With the league's slot order (saved at sync), "started" there is
//   the lineup Best Ball would pick from the points so far (bestBallLineup), so started booms, started zeros and LVPs
//   follow what will count. Without slot order (a league not synced since), Sleeper's starters as they stand.
// - LVP: below Bust in at least one league where you started him, and his game is final (round 5, owner: counting every
//   bench player under his line made "114 LVPs"; bench zeros are dead weight). Ranked by those started busts (what
//   hurt), then ownership.
// - The extra lines: started zeros (a starter on 0.0 whose game is final; usually inactive, which the app can't verify),
//   dead weight (widely owned, nothing scored, on the bench everywhere, and no injury designation: round 3), still open (game not final: could land on either
//   list), boomed on your bench (round 2) and worst benchings (outside Best Ball, a benched player who boomed while the
//   starter in a slot he could have filled scored far less).
// - Left out: players on a bye, players with no team, K and DEF. A player id the map can't resolve is listed as
//   unresolved, and called out when it scored a Boom-level number.

export const RECAP_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const DEFAULT_LINES = Object.freeze({
    QB: Object.freeze({ boom: 24, bust: 12 }),
    RB: Object.freeze({ boom: 20, bust: 7 }),
    WR: Object.freeze({ boom: 20, bust: 7.5 }),
    TE: Object.freeze({ boom: 15, bust: 5.5 }),
});
// The scales a verdict can use (round 8): Sleeper's week stats carry all three. Half PPR by default (owner: the more
// common format, between Standard and Full PPR).
export const RECAP_SCALES = Object.freeze({
    half: Object.freeze({ key: 'pts_half_ppr', label: 'Half PPR' }),
    ppr: Object.freeze({ key: 'pts_ppr', label: 'Full PPR' }),
    std: Object.freeze({ key: 'pts_std', label: 'Standard' }),
});
export const DEFAULT_SCALE = 'half';
const scaleOf = (v) => (typeof v === 'string' && RECAP_SCALES[v] ? v : DEFAULT_SCALE);
// A partial boom (without a verdict only): boomed in fewer than this share of the leagues that own him.
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
    out.scale = scaleOf(raw && typeof raw === 'object' ? raw.scale : null);
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
    lines.scale = scaleOf(input && input.scale);
    return errors.length ? { ok: false, lines: null, errors } : { ok: true, lines, errors };
}

// The lowest Boom line: what an unresolved player must reach to be called out.
const lowestBoom = (lines) => Math.min(...RECAP_POSITIONS.map(p => lines[p].boom));
const isTeamCode = (id) => /^[A-Z]{2,3}$/.test(String(id));

// Sleeper's starting slots and the positions each takes, for worst benchings. IDP slots aren't covered.
export const SLEEPER_SLOT_POSITIONS = {
    QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
    FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['WR', 'RB'],
};
const SLOT_LABELS = { SUPER_FLEX: 'SFLEX', REC_FLEX: 'W/T', WRRB_FLEX: 'W/R' };
export const slotLabel = (slot) => SLOT_LABELS[slot] || slot;

// Best Ball's lineup from the points so far: each slot, most specific first (QB, then W/T, then FLEX, then SUPER_FLEX),
// takes the highest scorer left who can play it; on equal points, Sleeper's own starter first (so before games, the
// lineup as it stands). Exact for nested slots (QB, RB, FLEX, SUPER_FLEX); W/R and W/T overlap, where it's nearly so.
// Returns a Set of player ids.
export function bestBallLineup(slots, playerIds, pointsOf, posOf, preferred = new Set()) {
    const order = slots.map((s, i) => ({ i, elig: SLEEPER_SLOT_POSITIONS[s] || [] }))
        .sort((a, b) => a.elig.length - b.elig.length || a.i - b.i);
    const pool = playerIds.filter(id => id && id !== '0' && posOf(id))
        .sort((a, b) => pointsOf(b) - pointsOf(a) || Number(preferred.has(b)) - Number(preferred.has(a)));
    const lineup = new Set();
    order.forEach(o => {
        const id = pool.find(x => !lineup.has(x) && o.elig.includes(posOf(x)));
        if (id) lineup.add(id);
    });
    return lineup;
}

// leagues: [{ id, name, bestBall, slots, entry: { players, starters, players_points } }] — your entry in each Sleeper
//   league; slots: its starting slots in order (league.starterSlots, saved at sync since round 2), or null.
//   A league with no entry, or an entry with no players (a chopped guillotine team), isn't counted.
// players: { id: { name, pos, team, injured } } from the player map (pos: the fantasy position; injured: any injury
//   designation, IR, Out, Questionable...). K and DEF entries too: Best Ball's lineup needs them.
// games: { TEAM: { state: 'pre' | 'in' | 'post' } } (none: game states unknown, so nobody is final).
// byeTeams: the teams on a bye this week (a Set or an array).
// verdict (round 8): { points: { id: number } }, each player's points for the week on lines.scale (Sleeper's week
//   stats); a player missing from it scored 0 (he hasn't played). null: each league's own points decide, as before.
// Returns { leagueCount, mvps, lvps, partial, benchBooms, startedZeros, deadWeight, stillOpen, worstBenchings, unresolved,
// bestBallNote, bestBallUnslotted, scale (null without a verdict) }. Each player row: { id, name, pos, team, own, ownPct, boomed,
// startedBoomed, busted, started, startedPct, startedBusted, min, max, ref (his verdict points, or null), state, partial, leagues: [{ id, name, bestBall, points, started }] }.
export function buildPlayerRecap({ leagues = [], players = {}, games = {}, byeTeams = [], lines: rawLines, verdict = null } = {}) {
    const lines = normalizeLines(rawLines);
    const refPts = verdict && verdict.points && typeof verdict.points === 'object' ? verdict.points : null;
    const refOf = (id) => (refPts ? round1(typeof refPts[id] === 'number' ? refPts[id] : 0) : null);
    const byes = byeTeams instanceof Set ? byeTeams : new Set(byeTeams || []);
    const counted = leagues.filter(l => l && l.entry && Array.isArray(l.entry.players) && l.entry.players.length);
    const n = counted.length;
    const empty = { leagueCount: n, mvps: [], lvps: [], partial: [], benchBooms: [], startedZeros: [], deadWeight: [], stillOpen: [], worstBenchings: [], unresolved: [], bestBallNote: false, bestBallUnslotted: [], scale: refPts ? lines.scale : null };
    if (!n) return empty;

    const stateOf = (team) => (team && games[team] && games[team].state) || null;
    const byId = new Map();
    const unresolved = new Map();
    // Who started in each league: Sleeper's starters, or in Best Ball with the slot order, its own lineup (round 3).
    const ptsIn = (l, id) => { const v = (l.entry.players_points || {})[id]; return typeof v === 'number' ? v : 0; };
    const sleeperStarters = (l) => new Set((l.entry.starters || []).filter(id => id && id !== '0'));
    const slotted = (l) => Array.isArray(l.slots) && l.slots.length === (l.entry.starters || []).length && l.slots.length > 0;
    const startedIn = new Map(counted.map(l => [l.id, l.bestBall && slotted(l)
        ? bestBallLineup(l.slots, l.entry.players, id => ptsIn(l, id), id => players[id] && players[id].pos, sleeperStarters(l))
        : sleeperStarters(l)]));
    counted.forEach(l => {
        const pts = l.entry.players_points || {};
        const starters = startedIn.get(l.id);
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
                row = { id, name: p.name || id, pos: p.pos, team: p.team, injured: !!p.injured, state: stateOf(p.team), ref: refOf(id), leagues: [] };
                byId.set(id, row);
            }
            row.leagues.push({ id: l.id, name: l.name, bestBall: !!l.bestBall, points: round1(points), started: starters.has(id) });
        });
    });

    const rows = [...byId.values()].map(r => {
        const line = lines[r.pos];
        const ls = r.leagues;
        // With a verdict, one answer for every league that owns him (round 8); without, each league's own points.
        const boomedIn = r.ref != null ? (r.ref >= line.boom ? ls : []) : ls.filter(x => x.points >= line.boom);
        const bustedIn = r.ref != null ? (r.ref < line.bust ? ls : []) : ls.filter(x => x.points < line.bust);
        const values = ls.map(x => x.points);
        const own = ls.length;
        const started = ls.filter(x => x.started).length;
        return {
            ...r,
            own, ownPct: Math.round(own / n * 100),
            boomed: boomedIn.length, busted: bustedIn.length,
            startedBoomed: boomedIn.filter(x => x.started).length,
            started, startedPct: Math.round(started / own * 100),
            startedBusted: bustedIn.filter(x => x.started).length,
            min: Math.min(...values), max: Math.max(...values),
            partial: r.ref == null && boomedIn.length > 0 && boomedIn.length / own < PARTIAL_SHARE,
        };
    });

    // The verdict's points when there is one (round 8), else his best league score.
    const scoreOf = (r) => (r.ref != null ? r.ref : r.max);
    const byOwn = (a, b) => b.own - a.own || scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name);
    const mvpAll = rows.filter(r => r.startedBoomed > 0);
    // Booms where you started him, then ownership (round 3: a tiebreak on booms anywhere lifted bench booms).
    const byBooms = (a, b) => b.startedBoomed - a.startedBoomed || byOwn(a, b);
    const full = mvpAll.filter(r => !r.partial).sort(byBooms);
    const partial = mvpAll.filter(r => r.partial).sort(byBooms);
    const mvps = [...full, ...partial];
    // Boomed, but only where you'd benched him: not an MVP (owner, round 2).
    const benchBooms = rows.filter(r => r.boomed > 0 && r.startedBoomed === 0).sort((a, b) => b.boomed - a.boomed || byOwn(a, b));
    const mvpIds = new Set([...mvps, ...benchBooms].map(r => r.id));

    const final = (r) => r.state === 'post';
    const lvps = rows.filter(r => final(r) && r.startedBusted > 0 && !mvpIds.has(r.id))
        .sort((a, b) => b.startedBusted - a.startedBusted || b.own - a.own || (a.ref != null ? a.ref : a.min) - (b.ref != null ? b.ref : b.min) || a.name.localeCompare(b.name));

    const startedZeros = rows.filter(r => final(r) && r.leagues.some(x => x.started && x.points === 0))
        .map(r => ({ ...r, zeroIn: r.leagues.filter(x => x.started && x.points === 0).length }))
        .sort((a, b) => b.zeroIn - a.zeroIn || byOwn(a, b));

    const wide = Math.max(2, Math.ceil(n * WIDE_SHARE));
    const deadWeight = rows.filter(r => final(r) && r.own >= wide && !r.injured && r.started === 0 && (r.ref != null ? r.ref === 0 : r.leagues.every(x => x.points === 0))).sort(byOwn);

    const stillOpen = rows.filter(r => !final(r) && !mvpIds.has(r.id)).sort((a, b) => b.own - a.own || b.started - a.started || a.name.localeCompare(b.name));

    // Worst benchings: outside Best Ball (its lineup isn't yours to set), a bench player who boomed while a starter he
    // could have replaced, whose game is over (or who was on a bye or had no team), scored at least BENCHING_GAP less;
    // the lowest such starter. "Could have replaced": a starter in a slot that takes the bench player's position, when the
    // league's slot order is known (saved at sync, round 2) and matches its starters; else a starter at his position (a
    // same-position swap is always allowed, whatever slot that starter filled).
    const worstBenchings = [];
    counted.filter(l => !l.bestBall).forEach(l => {
        const pts = l.entry.players_points || {};
        const starters = l.entry.starters || [];
        const slots = Array.isArray(l.slots) && l.slots.length === starters.length ? l.slots : null;
        const startSet = new Set(starters.filter(id => id && id !== '0'));
        const pointsOf = (id) => round1(typeof pts[id] === 'number' ? pts[id] : 0);
        l.entry.players.forEach(id => {
            if (startSet.has(id)) return;
            const p = players[id];
            if (!p || !RECAP_POSITIONS.includes(p.pos) || !p.team || byes.has(p.team)) return;
            const benchPts = pointsOf(id);
            // Boomed by the verdict when there is one (round 8); the gap is still this league's points.
            if ((refPts ? refOf(id) : benchPts) < lines[p.pos].boom) return;
            const rivals = starters.map((sid, i) => ({ sid, sp: players[sid], slot: slots ? slots[i] : null }))
                .filter(x => x.sid && x.sid !== '0' && x.sp)
                .filter(x => x.slot ? (SLEEPER_SLOT_POSITIONS[x.slot] || []).includes(p.pos) : x.sp.pos === p.pos)
                .filter(x => !x.sp.team || byes.has(x.sp.team) || stateOf(x.sp.team) === 'post')
                .map(x => ({ id: x.sid, name: x.sp.name || x.sid, pos: x.sp.pos, slot: x.slot, points: pointsOf(x.sid) }))
                .sort((a, b) => a.points - b.points);
            const starter = rivals[0];
            if (!starter || benchPts - starter.points < BENCHING_GAP) return;
            worstBenchings.push({ league: { id: l.id, name: l.name }, bench: { id, name: p.name || id, pos: p.pos, points: benchPts }, starter, gap: round1(benchPts - starter.points) });
        });
    });
    worstBenchings.sort((a, b) => b.gap - a.gap);

    // Best Ball (round 3): say that Started there is the lineup it would pick now, when a listed player has a Best Ball
    // league; and name any Best Ball league without its slot order (synced before round 2), read from Sleeper's starters.
    const bbIds = new Set(counted.filter(l => l.bestBall).map(l => l.id));
    const bestBallNote = [...mvps, ...lvps].some(r => r.leagues.some(x => bbIds.has(x.id)));
    const bestBallUnslotted = counted.filter(l => l.bestBall && !slotted(l)).map(l => l.name);

    const floor = lowestBoom(lines);
    const unresolvedList = [...unresolved.values()].map(u => ({ ...u, max: round1(u.max), boomLevel: u.max >= floor }))
        .sort((a, b) => b.max - a.max);

    return { leagueCount: n, mvps, lvps, partial, benchBooms, startedZeros, deadWeight, stillOpen, worstBenchings, unresolved: unresolvedList, bestBallNote, bestBallUnslotted, scale: refPts ? lines.scale : null };
}

// "26% (5)".
export const ownText = (r) => `${r.ownPct}% (${r.own})`;
// "67% (4)": started in 4 of the 6 leagues that own him.
export const startedText = (r) => `${r.startedPct}% (${r.started})`;
// "24.1–29.6", or one number when every league scored him the same.
export const pointsRange = (r) => r.min === r.max ? r.min.toFixed(1) : `${r.min.toFixed(1)}–${r.max.toFixed(1)}`;
