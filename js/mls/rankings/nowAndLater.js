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
// range (top 36 at RB and WR, top 24 at QB and TE), so deep-bench shuffles (WR80 vs WR95) don't light up. K, DEF
// and anyone unranked in either set get no chip: there's nothing to compare.
export const GAP_SPOTS = 12;
export const STARTABLE = { QB: 24, RB: 36, WR: 36, TE: 24 };

const ranked = (r) => Number.isFinite(r) && r > 0 && r < 999;

// 'now' (In-Season ranks him well ahead: helps now, a sell-high candidate), 'later' (the dynasty set does: a buy-low
// or hold candidate), or null.
export function rankGap(pos, nowPosRank, laterPosRank) {
    const cap = STARTABLE[pos];
    if (!cap || !ranked(nowPosRank) || !ranked(laterPosRank)) return null;
    if (Math.abs(nowPosRank - laterPosRank) < GAP_SPOTS) return null;
    if (Math.min(nowPosRank, laterPosRank) > cap) return null;
    return nowPosRank < laterPosRank ? 'now' : 'later';
}

// The chip's tap text.
export function rankGapTip(kind, pos, nowPosRank, laterPosRank) {
    const ranks = `In-Season ${pos}${nowPosRank}, dynasty ${pos}${laterPosRank}`;
    return kind === 'now'
        ? `Your In-Season rankings have him well ahead of your dynasty rankings (${ranks}): he helps now more than later. A sell-high candidate.`
        : `Your dynasty rankings have him well ahead of your In-Season rankings (${ranks}): worth more later than now. A buy-low or hold candidate.`;
}
