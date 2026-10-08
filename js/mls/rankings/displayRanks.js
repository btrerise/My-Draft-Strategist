// --- DISPLAY POSITION / FLEX RANKS FOR THE LINEUP AND ROSTER TABS (improvements F6) ---
// A single rankings file with no Pos Rank column stores each player's overall rank as his position and
// FLEX rank too (the "Fallback" branch in js/shared/rankings/parse.js). The Waiver Wire Assistant shows the
// real ones, re-derived per position group by buildRankDisplayIndex (js/mls/scout/waiverScanner.js), so
// Derrick Henry (overall #15) reads RB5 there. This hands the Lineup and Roster tabs the same numbers, built
// once per render with the Waiver Wire's positions (makeLeagueGetPos: the league's synced positions, then
// Sleeper's player map, then market data), plus the roster's own `pos` for anyone those don't know.
//
// Display only. optimizeLineup and compareFlexCandidates keep reading the raw posRank / flexRank on the
// player objects; the derived numbers keep the file's order within each group, so they never disagree.
//
// Only where the file took that fallback, recognised without positions (the parser writes these numbers
// from one rank):
//   Positions -- every ranked player's position and FLEX ranks equal his overall rank: a single file with
//                no Pos Rank column.
//   FLEX      -- every ranked player's FLEX rank equals his overall rank, QBs included: any single file, a
//                Pos Rank column too (its FLEX rank is still the overall one).
// Files with their own ranks (per-position uploads, a FLEX file, a horizontal Weekly sheet) fail both tests,
// and a Pos Rank column fails the first, so those numbers show exactly as before. The test is
// singleFileFallback in waiverScanner.js, the one buildRankDisplayIndex uses, so these tabs and the Waiver
// Wire always agree on which files get derived numbers. Checked here first so files with their own ranks
// never wait for Sleeper's player map.
import { buildRankDisplayIndex, singleFileFallback } from '../scout/waiverScanner.js';
import { getSleeperMetaByName, makeLeagueGetPos, sleeperMetaByNameIfLoaded } from '../scout/waivers.js';

// Renders waiting for Sleeper's player map, re-run once when it lands (once per page: after that it's in
// memory). Until then free agents' positions come from the league and market data only.
const _waitingForMeta = new Set();

// { byName, positions, flex } for displayRanksFor: byName is buildRankDisplayIndex's cleanName -> entry, and
// positions / flex say which of its numbers to show (see the tests above). null when neither applies (show
// the raw ones). `rerender` is called once if the Sleeper player map wasn't loaded yet.
export function leagueRankDisplayIndex(league, rankings, rerender) {
    const { positions, flex } = singleFileFallback(rankings);
    if (!positions && !flex) return null;
    league = league || {};
    const meta = sleeperMetaByNameIfLoaded();
    if (!meta && rerender && !_waitingForMeta.has(rerender)) {
        _waitingForMeta.add(rerender);
        getSleeperMetaByName()
            .then(() => rerender())
            .catch(e => console.warn('Position ranks: Sleeper player map unavailable, using league and market positions.', e))
            .finally(() => _waitingForMeta.delete(rerender));
    }
    const leaguePos = makeLeagueGetPos(league, meta);
    const rosterPos = {};
    (league.roster || []).forEach(p => { if (p && p.cleanName && p.pos) rosterPos[p.cleanName] = p.pos; });
    const byName = buildRankDisplayIndex(rankings, (clean) => {
        const pos = leaguePos(clean);
        return pos !== 'UNK' ? pos : (rosterPos[clean] || 'UNK');
    });
    return { byName, positions, flex };
}

const KNOWN_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// A player's position and FLEX ranks for display: the index's where it applies and knows his position, else
// his raw fields (999 = unranked, as the row renderers expect). Tiers fall back to the overall tier (S8, round 3).
export function displayRanksFor(index, cleanName, raw) {
    const d = index && index.byName[cleanName];
    const shown = { posRank: raw.posRank, posTier: raw.posTier, flexRank: raw.flexRank, flexTier: raw.flexTier };
    if (!d || !KNOWN_POSITIONS.includes(d.pos)) return shown;
    if (index.positions) Object.assign(shown, { posRank: d.posRank ?? 999, posTier: d.posTier });
    if (index.flex) Object.assign(shown, { flexRank: d.flexRank ?? 999, flexTier: d.flexTier });
    return shown;
}
