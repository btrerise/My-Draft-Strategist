// --- PLAYOFF CHANCES: THE SEASON AND BRACKET SIMULATION (improvements S55) ---
// Pure functions (no DOM, no imports): run in sim/playoffWorker.js, unit-tested in tests/unit/playoffs.test.mjs.
// The inputs are built by sim/playoffOdds.js from what sync saved (leagues/playoffData.js).
//
// Owner's choices (S55): each team's weekly score is one normal draw from its mean and spread (team-level draws, not
// the Matchup Simulator's draw per player, which is too slow for 20 leagues on a phone); the mean and spread come from
// its best lineup by Sleeper's projections with the Simulator's per-player spreads (sim/playoffStrength.js), or from its
// points so far when there are no projections. Divisions count: their winners take the top seeds, as Sleeper seeds them.

// A team's place in the standings: a tie counts as half a win (as scoreboard.js's seasonRecord orders them).
const winScore = (t) => (Number(t.w) || 0) + (Number(t.t) || 0) / 2;

/**
 * Which teams are certain to make the playoffs, or certain to miss them, whatever happens in the weeks left. Only what
 * the records prove: a tie on record could go either way (points for decides it), so it never counts as safe.
 * teams: [{ rid, w, l, t, div }]; weeksLeft: regular-season weeks still to play; median: each week is two games.
 * Returns { rid: { clinched, eliminated } }.
 */
export function playoffCertainty({ teams, weeksLeft, median = false, playoffTeams, divisions = false }) {
    const games = Math.max(0, weeksLeft) * (median ? 2 : 1);
    const P = Number(playoffTeams) || 0;
    const divCount = divisions ? new Set(teams.map(t => t.div)).size : 0;
    const out = {};
    teams.forEach(x => {
        const others = teams.filter(y => y !== x);
        const low = winScore(x), high = winScore(x) + games;
        if (P >= teams.length) { out[x.rid] = { clinched: true, eliminated: false }; return; }
        // Teams that could still finish level with or ahead of x's worst case.
        const threats = others.filter(y => winScore(y) + games >= low);
        // With divisions, every division's winner is in ahead of the rest: at worst, all of them are someone else.
        const winsDivision = divisions && !threats.some(y => y.div === x.div);
        const clinched = P > 0 && (winsDivision || divCount + threats.length < P);
        // Teams already sure to finish ahead of x's best case.
        const ahead = others.filter(y => winScore(y) > high);
        const eliminated = P > 0 && ahead.length >= P && (!divisions || ahead.some(y => y.div === x.div));
        out[x.rid] = { clinched, eliminated };
    });
    return out;
}

/**
 * The standings with finished weeks added (round 9): weeks Sleeper's records don't include yet (from the end of Monday
 * night's game until Sleeper processes the week, usually Tuesday, or longer without a sync). finals: [{ games:
 * [[ridA, ridB]], points: { rid: final score } }], in order. Each game is a win, loss or tie; with the median, the top
 * half of the week's scores win one more and the rest lose one; every team's points for grow by its score.
 * Returns new standings (the input isn't changed).
 */
export function applyFinals(standings, finals = [], median = false) {
    const out = standings.map(t => ({ ...t }));
    const byRid = new Map(out.map(t => [t.rid, t]));
    finals.forEach(({ games = [], points = {} }) => {
        const pts = (rid) => Number(points[rid]) || 0;
        games.forEach(([a, b]) => {
            const ta = byRid.get(a), tb = byRid.get(b);
            if (!ta || !tb) return;
            if (pts(a) > pts(b)) { ta.w++; tb.l++; } else if (pts(b) > pts(a)) { tb.w++; ta.l++; } else { ta.t++; tb.t++; }
        });
        if (median) {
            const order = out.slice().sort((x, y) => pts(y.rid) - pts(x.rid));
            const half = Math.floor(order.length / 2);
            order.forEach((t, k) => { if (k < half) t.w++; else t.l++; });
        }
        out.forEach(t => { t.pf = Math.round((t.pf + pts(t.rid)) * 100) / 100; });
    });
    return out;
}

// The bracket's size (the next power of two) and so how many top seeds sit out the first round.
export const bracketSize = (P) => { let b = 1; while (b < P) b *= 2; return b; };
export const byeCount = (P) => (P > 1 ? bracketSize(P) - P : 0);

// Seeds in bracket order: [1, 8, 4, 5, 2, 7, 3, 6] for 8, so neighbours play and the winners meet in order (1 v 8, then
// the winner of 4 v 5). A seed past the playoff teams is a bye.
export function bracketOrder(size) {
    let order = [1];
    while (order.length < size) {
        const n = order.length * 2 + 1;
        order = order.flatMap(s => [s, n - s]);
    }
    return order;
}

// Standard normal draws, two at a time (Marsaglia's polar method: no sine or cosine, which matters at a few million draws).
function normalSource(random) {
    let spare = 0, has = false;
    return () => {
        if (has) { has = false; return spare; }
        let u, v, q;
        do { u = 2 * random() - 1; v = 2 * random() - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
        const f = Math.sqrt(-2 * Math.log(q) / q);
        spare = v * f; has = true;
        return u * f;
    };
}

/**
 * Plays the rest of the regular season `runs` times, seeds each finish and plays the bracket.
 * teams: [{ rid, w, l, t, pf, div }] (pf: points for so far).
 * weeks: [{ games: [[ridA, ridB], ...], strength: { rid: [mean, sd] }, share?: { rid: 0-1 } }], in order (share: how
 *   much of a week under way is still to play; 1 when left out). Every team scores every week (for the
 *   median and points for), whether it has a game or not.
 * playoffStrength: { rid: [mean, sd] } for the bracket's games.
 * reseed: re-seed after every round (Sleeper's playoff_seed_type 1), else a fixed bracket. roundType: Sleeper's
 *   playoff_round_type: 0 a week a round, 1 a two-week final, 2 two weeks every round (owner, round 5).
 * lastingSd: how far a team's true level can sit from its projections for the rest of the season (points a week). Each
 *   run draws one such miss per team and adds it to every week: without it, four weeks were treated as four fresh
 *   coins and long shots read "<1%" too often (S55 round 2, calibrated on the owner's leagues: playoffStrength.js).
 * Returns { odds: { rid: { playoff, bye, title } } (shares 0-1), byes, runs }. Each run puts exactly playoffTeams
 * teams in, so the playoff shares add up to playoffTeams.
 */
export function simulatePlayoffs({ teams, weeks = [], median = false, playoffTeams, divisions = false, playoffStrength = {}, lastingSd = 0, reseed = false, roundType = 0, runs = 10000, random = Math.random }) {
    const n = teams.length;
    const P = Math.min(Number(playoffTeams) || 0, n);
    const idx = new Map(teams.map((t, i) => [t.rid, i]));
    const baseWins = Float64Array.from(teams, winScore);
    const basePf = Float64Array.from(teams, t => Number(t.pf) || 0);
    const div = teams.map(t => (divisions ? t.div : 0));
    const tiebreak = new Float64Array(n);
    const wins = new Float64Array(n), pf = new Float64Array(n), score = new Float64Array(n);
    const plan = weeks.map(w => ({
        games: Int32Array.from((w.games || []).map(([a, b]) => [idx.get(a), idx.get(b)]).filter(([a, b]) => a !== undefined && b !== undefined).flat()),
        mean: Float64Array.from(teams, t => (w.strength[t.rid] ? w.strength[t.rid][0] : 0)),
        sd: Float64Array.from(teams, t => (w.strength[t.rid] ? w.strength[t.rid][1] : 0)),
        // The share of a team's week still to play (1 unless given: this week's live scores), for the lasting miss.
        share: Float64Array.from(teams, t => (w.share && typeof w.share[t.rid] === 'number' ? w.share[t.rid] : 1)),
    }));
    const pMean = Float64Array.from(teams, t => (playoffStrength[t.rid] ? playoffStrength[t.rid][0] : 0));
    const pSd = Float64Array.from(teams, t => (playoffStrength[t.rid] ? playoffStrength[t.rid][1] : 0));
    // Each run's lasting miss per team (see lastingSd above), the same in every week and the bracket.
    const lasting = new Float64Array(n);
    const byes = byeCount(P);
    const size = bracketSize(P);
    const bracket = bracketOrder(size);
    const made = new Float64Array(n), bye = new Float64Array(n), title = new Float64Array(n);
    const normal = normalSource(random);
    const half = Math.floor(n / 2);
    // Preallocated: with 20 leagues on a phone, sorting and allocating in every run cost most of the time (S55).
    const sorted = new Float64Array(n);
    const table = new Int32Array(n), seeds = new Int32Array(n), isWinner = new Uint8Array(n);
    const round = new Int32Array(size);
    // One bracket game over `weeks` weeks (a two-week round adds both weeks' scores: twice the mean and lasting miss,
    // the spread of two independent weeks).
    const play = (a, b, weeks = 1) => {
        const r = Math.sqrt(weeks);
        const sa = weeks * (pMean[a] + lasting[a]) + r * pSd[a] * normal(), sb = weeks * (pMean[b] + lasting[b]) + r * pSd[b] * normal();
        return sa > sb || (sa === sb && random() < 0.5) ? a : b;
    };
    const rounds = Math.round(Math.log2(size));
    const weeksOf = (r) => (roundType === 2 || (roundType === 1 && r === rounds - 1) ? 2 : 1);
    const alive = new Int32Array(P), next = new Int32Array(P);

    for (let run = 0; run < runs; run++) {
        wins.set(baseWins); pf.set(basePf);
        if (lastingSd > 0) for (let i = 0; i < n; i++) lasting[i] = lastingSd * normal();
        for (let wk = 0; wk < plan.length; wk++) {
            const w = plan[wk], g = w.games;
            for (let i = 0; i < n; i++) { score[i] = w.mean[i] + lasting[i] * w.share[i] + w.sd[i] * normal(); pf[i] += score[i]; }
            for (let k = 0; k < g.length; k += 2) {
                const a = g[k], b = g[k + 1];
                if (score[a] > score[b]) wins[a] += 1;
                else if (score[b] > score[a]) wins[b] += 1;
                else { wins[a] += 0.5; wins[b] += 0.5; }
            }
            // The median game: the top half of the week's scores each win one more.
            if (median && half > 0) {
                sorted.set(score);
                sorted.sort(); // a typed array sorts numerically, in native code
                const line = sorted[n - half]; // the lowest score in the top half
                for (let i = 0; i < n; i++) if (score[i] >= line) wins[i] += 1;
            }
        }
        // The standings: best first (insertion sort; a dozen teams).
        for (let i = 0; i < n; i++) {
            tiebreak[i] = random();
            let k = i;
            while (k > 0) {
                const j = table[k - 1];
                const d = (wins[i] - wins[j]) || (pf[i] - pf[j]) || (tiebreak[i] - tiebreak[j]);
                if (d <= 0) break;
                table[k] = j; k--;
            }
            table[k] = i;
        }
        let order = table;
        if (divisions) {
            // Each division's best first, in standings order, then the rest.
            let s = 0;
            isWinner.fill(0);
            for (let k = 0; k < n; k++) {
                const i = table[k];
                let first = true;
                for (let m = 0; m < k; m++) if (div[table[m]] === div[i]) { first = false; break; }
                if (first) { isWinner[i] = 1; seeds[s++] = i; }
            }
            for (let k = 0; k < n; k++) if (!isWinner[table[k]]) seeds[s++] = table[k];
            order = seeds;
        }
        if (P < 1) continue;
        for (let s = 0; s < P; s++) { made[order[s]]++; if (s < byes) bye[order[s]]++; }
        if (reseed) {
            // Re-seeded after every round (Sleeper's playoff_seed_type 1): the best seed left plays the worst. Round
            // one: the top seeds sit out and the rest pair off best against worst. alive holds seed numbers, best first.
            let n = 0;
            for (let s = byes; s < P; s++) alive[n++] = s;
            let m = 0;
            for (let s = 0; s < byes; s++) next[m++] = s;
            for (let r = 0; n > 1 || m > 0; r++) {
                for (let k = 0; k < n >> 1; k++) {
                    const a = alive[k], b = alive[n - 1 - k];
                    next[m++] = play(order[a], order[b], weeksOf(r)) === order[a] ? a : b;
                }
                if (n & 1) next[m++] = alive[n >> 1];
                next.subarray(0, m).sort();
                alive.set(next.subarray(0, m)); n = m; m = 0;
                if (n === 1) break;
            }
            title[order[alive[0]]]++;
            continue;
        }
        // The fixed bracket: a seed past the playoff teams is a bye, so its opponent goes through.
        for (let k = 0; k < size; k++) round[k] = bracket[k] <= P ? order[bracket[k] - 1] : -1;
        for (let len = size, r = 0; len > 1; len >>= 1, r++) {
            for (let k = 0; k < len; k += 2) {
                const a = round[k], b = round[k + 1];
                round[k >> 1] = a < 0 ? b : b < 0 ? a : play(a, b, weeksOf(r));
            }
        }
        if (round[0] >= 0) title[round[0]]++;
    }
    const odds = {};
    teams.forEach((t, i) => { odds[t.rid] = { playoff: made[i] / runs, bye: bye[i] / runs, title: title[i] / runs }; });
    return { odds, byes, runs };
}
