// --- WHO SHOULD I DROP? (improvements S54) ---
// One droppability score per rostered player, 0 to 100 (higher = drop him first), with the reasons in plain words.
// The Roster tab badges your top three ("Drop 1", "Drop 2", "Drop 3"; render/roster.js), and Auto-Find's Whole Roster
// lens takes its drop candidate from the same order (scout/waivers.js). scout/dropPicks.js builds the input from the
// app's state; this module is the arithmetic only (no state, DOM or fetches), so tests/unit/droppable.test.mjs runs it.
//
// The owner's weights (Asks you, 2026-11-23, option A):
//   50  his rankings: ROS position rank against the league's starter line at his position (teams x starters there).
//       This week's rank (Weekly; in a dynasty league without Weekly, the In-Season set) counts for a quarter of it.
//       On bye or missing from that set, ROS alone (F30's fallback), so a starter on bye never rises for it.
//   20  depth on your team: WR7 when you start two or three WRs.
//   15  the league's Power Rankings at his position: your WR depth is spare when you're 2nd of 12 at WR (S29's table).
//   15  upside: Sleeper trending adds, the same tier as your starters there, and age in dynasty (young keeps him, old
//       at RB/WR/TE/QB makes him easier to let go).
// Never ranked: IR (Sleeper's IR slot or NFL IR), taxi, a player you locked in the app, and, with no ROS-shaped set
// loaded, a player on bye missing from Weekly (the app can't judge him). They're listed with the reason. A kicker or defense is ranked only
// beyond the number your lineup starts. Out players are ranked like anyone (owner's choice), with "Out this week".

const WEIGHTS = { rank: 50, depth: 20, need: 15, upside: 15 };
const LINE_STRETCH = 1.6;   // a rank 1.6x past the league's starter line scores as fully droppable
const FLEX_SHARE = { RB: 0.45, WR: 0.45, TE: 0.1, QB: 0 };
const SFLEX_SHARE = { QB: 0.9, RB: 0.033, WR: 0.033, TE: 0.033 };
const OLD_AT = { QB: 34, RB: 28, WR: 30, TE: 30 };
const YOUNG_AT = 23;
const DEFAULT_REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ranked = (r) => Number.isFinite(r) && r > 0 && r < 999;
const ordinal = (n) => {
    const v = n % 100;
    return `${n}${(v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
};

// How many lineup spots a team fills with this position, flex spots shared out (an RB takes ~45% of a FLEX).
export function startersAt(pos, reqs) {
    const r = Object.assign({}, DEFAULT_REQS, reqs || {});
    const n = (k) => parseInt(r[k], 10) || 0;
    let need = n(pos);
    if (pos in FLEX_SHARE) {
        need += n('FLEX') * FLEX_SHARE[pos] + n('SFLEX') * SFLEX_SHARE[pos];
        if (pos === 'RB' || pos === 'WR') need += n('WRRB') * 0.5;
        if (pos === 'WR' || pos === 'TE') need += n('WRTE') * 0.5;
    }
    return need;
}

// Why a player is never suggested, or null.
// `locked` is a lock you set in the app (round 4: kickoff locks don't count, since a claim runs after them). The bye
// rule is F30's case: with no ROS-shaped set loaded, a player on bye missing from Weekly can't be judged. With one
// loaded and him not in it, he's simply unranked, and a fair drop.
function protectedWhy(p, hasRos) {
    if (p.isReserve || p.inj === 'IR') return 'IR';
    if (p.isTaxi) return 'taxi';
    if (p.locked) return 'you locked him';
    if (hasRos === false && p.onBye && !(p.now && ranked(p.now.posRank))) return 'on bye, not in your rankings this week';
    return null;
}

// input: {
//   players: [{ id, name, cleanName, pos, team, inj, isTaxi, isReserve, locked, onBye,
//               ros: { posRank, posTier } | null,      // the league's ROS rankings (display ranks)
//               now: { posRank } | null,               // this week's set, when loaded
//               age, trending }],                      // trending: Sleeper's 24-hour add count, or 0
//   reqs, teamCount, powerRank: { QB, RB, WR, TE } | null (your place at each), dynasty, keeper, nowLabel ('Wk'),
//   hasRos (false: no ROS set loaded, so "not in your ROS rankings" isn't said)
// }
// returns { picks: [{ player, score, reasons }] most droppable first, protected: [{ player, why }], note }
// or null when no rankings set ranks anyone on the roster (nothing to judge by).
export function rankDroppable(input) {
    const players = (input && input.players) || [];
    if (!players.some(p => (p.ros && ranked(p.ros.posRank)) || (p.now && ranked(p.now.posRank)))) return null;
    const teams = Math.max(2, parseInt(input.teamCount, 10) || 12);
    const reqs = input.reqs || DEFAULT_REQS;
    const nowLabel = input.nowLabel || 'Wk';
    const protectedList = [];
    const candidates = [];
    players.forEach(p => {
        const why = protectedWhy(p, input.hasRos);
        if (why) protectedList.push({ player: p, why });
        else candidates.push(p);
    });

    // Depth: your active players at each position (IR and taxi left out), best first by ROS, then this week's set.
    const sortKey = (p) => (p.ros && ranked(p.ros.posRank) ? p.ros.posRank : 1000) + (p.now && ranked(p.now.posRank) ? p.now.posRank / 10000 : 0.9999);
    const byPos = {};
    players.filter(p => !['IR', 'taxi'].includes(protectedWhy(p, input.hasRos)))
        .forEach(p => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });
    Object.values(byPos).forEach(list => list.sort((a, b) => sortKey(a) - sortKey(b)));

    const picks = [];
    candidates.forEach(p => {
        const need = startersAt(p.pos, reqs);
        const mates = byPos[p.pos] || [p];
        const depth = mates.indexOf(p) + 1;
        // A kicker or defense counts only past what your lineup starts.
        if ((p.pos === 'K' || p.pos === 'DEF') && depth <= Math.round(need)) return;
        const line = Math.max(1, teams * need);
        const rankTerm = (r) => clamp01(r / (LINE_STRETCH * line));
        const rosR = p.ros && ranked(p.ros.posRank) ? p.ros.posRank : null;
        const nowR = !p.onBye && p.now && ranked(p.now.posRank) ? p.now.posRank : null;
        let rank;
        const noTeam = !p.team || p.team === 'FA';
        if (noTeam) rank = 1;   // no NFL team (round 4): nothing to rank him on this season
        else if (rosR && nowR) rank = 0.75 * rankTerm(rosR) + 0.25 * rankTerm(nowR);
        else if (rosR) rank = rankTerm(rosR);
        else if (nowR) rank = rankTerm(nowR);
        else rank = 1;
        const depthTerm = clamp01((depth - need) / (need + 1));
        const place = input.powerRank && Number.isFinite(input.powerRank[p.pos]) ? input.powerRank[p.pos] : null;
        const needTerm = place ? clamp01((teams - place) / (teams - 1)) : 0.5;

        // Upside keeps a player: trending adds, the same tier as one of your starters there, youth in dynasty.
        const starterTiers = mates.slice(0, Math.max(1, Math.round(need)))
            .filter(m => m !== p && m.ros && Number.isFinite(m.ros.posTier) && m.ros.posTier > 0).map(m => m.ros.posTier);
        const sameTier = depth > Math.round(need) && p.ros && Number.isFinite(p.ros.posTier) && p.ros.posTier > 0 && starterTiers.includes(p.ros.posTier);
        const age = Number.isFinite(p.age) && p.age > 0 ? p.age : null;
        const young = !!(input.dynasty && age && age <= YOUNG_AT);
        const old = !!(input.dynasty && age && OLD_AT[p.pos] && age >= OLD_AT[p.pos]);
        const trending = p.trending > 0;
        const up = (trending ? 0.5 : 0) + (young ? 0.5 : 0) + (sameTier ? 0.3 : 0) - (old ? 0.4 : 0);
        const upTerm = clamp01(0.5 - 0.5 * up);

        const score = Math.round(WEIGHTS.rank * rank + WEIGHTS.depth * depthTerm + WEIGHTS.need * needTerm + WEIGHTS.upside * upTerm);

        // The facts, each said once: this week's rank only when it differs from ROS (round 3).
        // The ROS-shaped set's name (round 4): a dynasty league's is its dynasty set.
        const rosShort = input.dynasty ? 'Dyn' : 'ROS', rosLong = input.dynasty ? 'dynasty' : 'ROS';
        const reasons = [`${p.pos}${depth} on your team`];
        if (noTeam) reasons.push('no NFL team');
        if (rosR) reasons.push(`${rosShort} ${p.pos}${rosR}`);
        else if (input.hasRos !== false) reasons.push(`not in your ${rosLong} rankings`);
        if (p.onBye) reasons.push('on bye');
        else if (nowR && nowR !== rosR) reasons.push(`${nowLabel} ${p.pos}${nowR}`);
        if (p.inj === 'OUT') reasons.push('Out this week');
        if (place) reasons.push(`you're ${ordinal(place)} of ${teams} at ${p.pos}`);
        if (sameTier) reasons.push('same tier as your starters');
        if (trending) reasons.push(`trending: ${Number(p.trending).toLocaleString('en-US')} adds`);
        if (input.dynasty && age) reasons.push(`age ${age}`);

        // The verdict in plain words (round 3, the owner's review): what the facts add up to. `short` leaves out the
        // position-room clause, which would repeat on every player at that position in a list.
        const starts = Math.max(1, Math.round(need));
        const best = rosR || nowR;
        const lead = depth > starts
            ? `Your ${ordinal(depth)} ${p.pos}, so he won't start for you`
            : `One of your starting ${p.pos}s`;
        const clauses = [];
        if (noTeam) clauses.push('no NFL team');
        else if (!best) clauses.push('not in your rankings');
        else if (best > line) clauses.push(`ranked outside the league's starting ${p.pos}s`);
        if (p.inj === 'OUT') clauses.push('Out this week');
        const buts = [];
        if (trending) buts.push(`trending (${Number(p.trending).toLocaleString('en-US')} adds)`);
        if (young) buts.push(`only ${age}`);
        if (sameTier) buts.push('in the same tier as your starters');
        if (old) clauses.push(`${age} years old`);
        // Your Power Rankings place there: a strong room makes him spare, a thin one is a reason to keep him.
        let room = '', thin = '';
        if (place && place <= Math.ceil(teams / 3)) room = place === 1 ? `your ${p.pos} room is the league's best` : `your ${p.pos} room is ${ordinal(place)} of ${teams}`;
        else if (place && place > Math.floor(teams * 2 / 3)) thin = `your ${p.pos} room is thin (${ordinal(place)} of ${teams})`;
        const butText = (list) => list.length ? `, but ${list.join(' and ')}` : '';
        const short = [lead, ...clauses].join('; ') + butText(buts) + '.';
        const verdict = [lead, ...clauses, room].filter(Boolean).join('; ') + butText(thin ? [...buts, thin] : buts) + '.';
        picks.push({ player: p, score, reasons, verdict, short });
    });
    picks.sort((a, b) => b.score - a.score || sortKey(b.player) - sortKey(a.player));
    protectedList.sort((a, b) => a.player.name.localeCompare(b.player.name));
    const note = input.keeper ? "Keeper league: the app can't see who you plan to keep, so check before dropping one of them." : '';
    return { picks, protected: protectedList, note };
}

// "Drake Maye, Jeremiyah Love (IR); Tez Johnson (taxi)" for the protected list: names grouped by reason (round 4).
export function protectedText(list) {
    const groups = new Map();
    (list || []).forEach(x => { if (!groups.has(x.why)) groups.set(x.why, []); groups.get(x.why).push(x.player.name); });
    return [...groups].map(([why, names]) => `${names.join(', ')} (${why})`).join('; ');
}
