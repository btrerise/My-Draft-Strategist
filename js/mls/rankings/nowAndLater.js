// --- NOW AND LONG-TERM SIDE BY SIDE (improvements S24) ---
// A dynasty or keeper league with an In-Season set (improvements S23, rankings/season.js) has two honest answers to
// "how good is this player?": this season (the In-Season set) and the long run (the dynasty set). These are the pure
// parts of showing both: the Trade Analyzer's two verdicts and the headline that joins them, and the Roster tab's gap
// chip. Each value comes from one set through the same curve (rankToTradeValue); the two are never blended.
// No DOM, no State: tests/unit/nowAndLater.test.mjs runs all of it in Node.
import { verdictFromValues } from '../trade/makeFair.js';

// Both verdicts from runScout's trade rows: `seasonValue` (In-Season) and `userValue` (dynasty), with the banners'
// own math and waiver adjustment (verdictFromValues). { now, later }; either is null when nothing on either side
// has a value by that set.
export function dualVerdictNumbers(getResults, giveResults, waiver) {
    const of = (key) => verdictFromValues(getResults.map(r => r[key] || 0), giveResults.map(r => r[key] || 0), waiver);
    return { now: of('seasonValue'), later: of('userValue') };
}

const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

// The one line above the verdicts (owner's sketch: "Wins now (+2,100), costs long-term (−3,400)"). null without
// both verdicts.
export function dualHeadline(now, later) {
    if (!now || !later) return null;
    const word = (v) => v.verdict === 'you' ? 'Wins' : v.verdict === 'them' ? 'Costs' : 'Fair';
    const part = (v) => v.verdict === 'fair' ? '' : ` (${signed(v.diff)})`;
    const a = word(now), b = word(later);
    if (a === 'Fair' && b === 'Fair') return 'Fair now and long-term';
    if (a === b) return `${a} now${part(now)} and long-term${part(later)}`;
    return `${a} now${part(now)}, ${b.toLowerCase()} long-term${part(later)}`;
}

// --- THE GAP CHIP ON ROSTER ROWS ---
// Owner's threshold: the two position ranks 12 or more spots apart, with at least one of them inside the startable
// range (top 36 at RB and WR, top 24 at QB and TE), so deep-bench shuffles (WR80 vs WR95) don't light up. K and DEF get
// no chip.
// A player missing from one set entirely (null) counts as far below it (owner, after S24's first review: "count
// unranked as much lower"), so a startable player in the other set gets the same chip: an In-Season WR20 your dynasty
// rankings leave out reads Now > long-term, a dynasty-ranked rookie your In-Season set leaves out Long-term > now.
// Missing from both, or in a set without a position rank (999), there's nothing to compare.
export const GAP_SPOTS = 12;
export const STARTABLE = { QB: 24, RB: 36, WR: 36, TE: 24 };

const ranked = (r) => Number.isFinite(r) && r > 0 && r < 999;

// nowPosRank / laterPosRank: his position rank in the In-Season / dynasty set, or null when he isn't in that set.
// 'now' (In-Season ranks him well ahead: helps now, a sell-high candidate), 'later' (the dynasty set does: a buy-low
// or hold candidate), or null.
export function rankGap(pos, nowPosRank, laterPosRank) {
    const cap = STARTABLE[pos];
    if (!cap) return null;
    const now = nowPosRank === null ? Infinity : nowPosRank;
    const later = laterPosRank === null ? Infinity : laterPosRank;
    if (!(ranked(now) || now === Infinity) || !(ranked(later) || later === Infinity)) return null;
    if (now === Infinity && later === Infinity) return null;
    if (Math.abs(now - later) < GAP_SPOTS) return null;
    if (Math.min(now, later) > cap) return null;
    return now < later ? 'now' : 'later';
}

// The chip's tap text. A null rank is "not in that set".
export function rankGapTip(kind, pos, nowPosRank, laterPosRank) {
    const tail = kind === 'now' ? 'he helps now more than later. A sell-high candidate.' : 'worth more later than now. A buy-low or hold candidate.';
    if (nowPosRank === null) return `Your dynasty rankings have him at ${pos}${laterPosRank} and your In-Season rankings leave him out: ${tail}`;
    if (laterPosRank === null) return `Your In-Season rankings have him at ${pos}${nowPosRank} and your dynasty rankings leave him out: ${tail}`;
    const lead = kind === 'now' ? 'Your In-Season rankings have him well ahead of your dynasty rankings' : 'Your dynasty rankings have him well ahead of your In-Season rankings';
    return `${lead} (In-Season ${pos}${nowPosRank}, dynasty ${pos}${laterPosRank}): ${tail}`;
}

// --- A 1QB IN-SEASON SET IN A SUPERFLEX LEAGUE (round 6) ---
// Trade values come from overall ranks, and a 1QB list ranks QBs far lower overall than a superflex one (the owner's
// "ROS Redraft": Lamar Jackson QB3 but #57), so in a superflex league its Now values undervalue every QB. A rankings set
// stores no format, so it's judged by how many QBs its top 50 holds: superflex lists have about 12-16, 1QB lists 3-6.
export const ONE_QB_TOP = 50;
export const ONE_QB_MAX_QBS = 8;

// reqs: the league's lineup slots. A superflex slot, or two QB slots.
export function isSuperflex(reqs) {
    return !!reqs && ((reqs.SFLEX || 0) > 0 || (reqs.QB || 0) >= 2);
}

// data: a set's players (rank order not assumed); posOf(cleanName) -> 'QB' | ... | undefined. { qbs, known }: QBs among
// the top 50 by rank whose position is known, and how many are known. oneQb: enough known (20+) to judge, and fewer than
// 8 QBs (scaled to the known count).
export function oneQbLook(data, posOf) {
    const top = [...(data || [])].filter(p => Number.isFinite(p.rank) && p.rank < 999).sort((a, b) => a.rank - b.rank).slice(0, ONE_QB_TOP);
    let qbs = 0, known = 0;
    top.forEach(p => { const pos = posOf(p.cleanName); if (!pos) return; known++; if (pos === 'QB') qbs++; });
    return { qbs, known, oneQb: known >= 20 && qbs * ONE_QB_TOP / known < ONE_QB_MAX_QBS };
}
