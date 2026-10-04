// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: TRADE VALUE CURVE
// (rankToTradeValue, isDraftPickName, getMarketValue).
import { State } from '../state.js';
import { rankingIndex } from '../helpers.js';

    // --- TRADE VALUE CURVE ---
    // Converts an overall rank -- either the user's own ROS ranking or a market-consensus rank
    // from State.marketRankings -- into an approximate point value for the Trade Analyzer's side
    // totals. Raw rank isn't summable in a meaningful way -- the value gap between rank #1 and
    // #2 is enormous compared to the gap between #150 and #151, exactly like how KTC/FantasyCalc's
    // own dollar-style trade values are NOT linear with rank. This exponential decay approximates
    // that shape from rank alone. Decay factor is tuned so rank #1 ~= 10000 and value trails off
    // to near-zero by the deep bench (~rank 300+), mirroring typical dynasty value charts. Shared
    // by both lenses so "Your Value" and "Mkt Value" are on the same 0-10000 scale and directly
    // comparable.
    export function rankToTradeValue(rank) {
        if (!rank || rank < 1) return 0;
        return Math.round(10000 * Math.pow(0.982, rank - 1));
    }

    // Detects a rookie draft pick asset ("2027 1st (Early)", "2026 2nd", "2025 3rd Round",
    // etc.) by shape -- a draft year plus a round ordinal -- rather than by trusting any one
    // market source's internal "position" field, which isn't consistently documented across
    // market sources (FantasyCalc; LeagueLogs before refactor 7A) and isn't worth taking on faith. No real NFL player's name will
    // ever contain both a 4-digit year and a round ordinal, so this is a safe, source-agnostic
    // classifier. Used to keep picks out of contexts where they're not actually a fit: they're
    // never "rostered" in globalRosterMap (nobody's Sleeper roster contains a pick), so without
    // this they'd look identical to a genuinely available free-agent player -- and picks aren't
    // available via waivers at all, so that's a real mismatch, not just an edge case.
    export function isDraftPickName(name) {
        if (!name) return false;
        return /\b(19|20)\d{2}\b/.test(name) && /\b(1st|2nd|3rd|4th)\b/i.test(name);
    }

    // Looks up a player's MARKET value by clean name (the optional/secondary lens -- see
    // rankToTradeValue above). Returns null if no Market Value data is loaded at all, or if this
    // specific player isn't in it (unranked/deep bench/rookie not yet valued).
    export function getMarketValue(cleanName) {
        if (!cleanName) return null;
        // Unlike the other converted sites, this one can't hoist its index to a caller -- it's
        // a single-player helper called from several different loops. rankingIndex's WeakMap
        // covers that case: the index is built on the first call for a given rankings array and
        // every later call reuses it, so a loop over N players costs one build instead of N
        // scans, without the callers needing to know this function has an index at all.
        let m = rankingIndex(State.marketRankings).get(cleanName);
        if (!m) return null;
        return { rank: m.marketVal, value: rankToTradeValue(m.marketVal) };
    }
