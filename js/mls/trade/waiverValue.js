// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: DYNAMIC WAIVER
// ADJUSTMENT VALUE (getDynamicWaiverAdjustmentValue, getTopWaiverCandidatesByPosition).
import { State } from '../state.js';
import { rankingIndex, getActiveLeague } from '../helpers.js';
import { rankToTradeValue, isDraftPickName } from './valueCurve.js';
import { sleeperPosByName } from '../players.js';

    // --- DYNAMIC WAIVER ADJUSTMENT VALUE ---
    // The Trade Analyzer's waiver-adjustment credit (see renderTradeVerdict above) used to be
    // a single flat number, manually typed in and easy to forget about. League depth varies
    // enormously -- a shallow 10-team league's best streamable free agent is worth far more
    // than a deep 14-team dynasty league's -- so one flat number can't fit every league synced
    // in this tool. A separate maintained rating (updated through the season) would fix that
    // more precisely, but would also mean a second stat this app has to keep current -- not
    // something to take on right now. Instead, this reuses data the app already keeps current
    // for other reasons: the active league's own free-agent pool, priced on the exact same
    // rankToTradeValue curve the trade totals themselves already use, so the adjustment stays
    // apples-to-apples with the rest of the verdict rather than being a differently-scaled
    // number bolted on.
    //
    // Tiered the same way the trade verdict's two lenses already are: custom ROS rankings
    // first (the primary lens everywhere else in this tool), market consensus if that comes up
    // completely empty (e.g. every ROS-ranked player at this position happens to be rostered
    // somewhere in the league), and null if neither lens has ANY free agent to price -- the
    // caller falls back to the existing flat/manual value in that case, exactly as before this
    // existed.

    // An earlier version of this applied a flat discount to the raw top-3 average, because
    // that average was coming out far too high -- turned out the real cause was draft picks
    // (see isDraftPickName above) getting counted as "available free agents," since a pick is
    // never present in globalRosterMap and looked identical to a genuinely unrostered player.
    // With picks properly excluded from the pool below, the raw average of the actual top
    // free agents is the intended number on its own -- no separate discount needed on top of it.
    export function getDynamicWaiverAdjustmentValue() {
        let league = getActiveLeague();
        if (!league || !league.globalRosterMap) return null;
        let rosterMap = league.globalRosterMap;

        // Sentinel rank of 999 means "not actually ranked" (rankingsParser's own placeholder
        // for an unpopulated field) rather than a real deep-bench rank, so those are excluded
        // rather than priced as if genuinely 999th -- same reasoning as rankFieldOf elsewhere
        // in this file. Draft picks are excluded too: they're never present in globalRosterMap
        // (nobody's Sleeper roster contains a pick), so without this check every pick in a
        // dynasty market file would look exactly like an available free-agent player -- and
        // unlike a real free agent, you can't actually go pick one up off waivers. Returns the
        // actual free-agent records used (name + rank + value), not just the final number, so
        // the caller can show its work rather than a bare figure.
        const topFreeAgents = (rankings, rankField) => rankings
            .filter(r => !rosterMap[r.cleanName] && r[rankField] && r[rankField] < 999 && !isDraftPickName(r.name))
            .sort((a, b) => a[rankField] - b[rankField])
            .slice(0, 3)
            .map(r => ({ name: r.name, rank: r[rankField], value: rankToTradeValue(r[rankField]) }));

        const buildResult = (freeAgents, source) => {
            if (freeAgents.length === 0) return null;
            let value = Math.round(freeAgents.reduce((total, fa) => total + fa.value, 0) / freeAgents.length);
            return { value, source, players: freeAgents };
        };

        if (State.rosRankings.length > 0) {
            let result = buildResult(topFreeAgents(State.rosRankings, 'rank'), 'ROS Rankings');
            if (result) return result;
        }
        if (State.marketRankings.length > 0) {
            let result = buildResult(topFreeAgents(State.marketRankings, 'marketVal'), 'Market Consensus');
            if (result) return result;
        }
        return null;
    }

    // Same free-agent identification as getDynamicWaiverAdjustmentValue above (custom
    // rankings first, market consensus fallback, draft picks and rostered players excluded)
    // but grouped BY POSITION instead of taken as one flat top-N -- Waiver Insights (see
    // runMatchupSim) needs a real candidate at whichever position a starter might actually be
    // replaced at, not just whichever position happens to dominate the very top of the
    // rankings overall. perPositionLimit candidates per position, ROS-ranked positions never
    // touch market data at all; a position ROS has literally nothing left to offer at falls
    // back to market consensus for that position only (mirroring the same per-tier fallback,
    // just applied position-by-position instead of to the whole list at once).
    export function getTopWaiverCandidatesByPosition(rosterMap, perPositionLimit) {
        // Rankings files carry a name and a rank, not a position -- sleeperPosByName
        // (built by ensureSleeperPosByName in players.js) is the same position lookup the
        // Waiver Wire Assistant already relies on for this exact reason; market data ships its
        // own pos field as a fallback for a player Sleeper's sync hasn't covered.
        const marketIndex = rankingIndex(State.marketRankings);
        const getPos = (cleanName) => {
            if (sleeperPosByName && sleeperPosByName[cleanName]) return sleeperPosByName[cleanName];
            const mPlayer = marketIndex.get(cleanName);
            return (mPlayer && mPlayer.pos) ? mPlayer.pos : null;
        };

        const groupByPosition = (rankings, rankField) => {
            const byPosition = {};
            rankings
                .filter(r => !rosterMap[r.cleanName] && r[rankField] && r[rankField] < 999 && !isDraftPickName(r.name))
                .forEach(r => {
                    const pos = getPos(r.cleanName);
                    if (!pos) return; // can't even assign a position -- skip rather than guess
                    if (!byPosition[pos]) byPosition[pos] = [];
                    byPosition[pos].push({ name: r.name, cleanName: r.cleanName, pos, rank: r[rankField] });
                });
            Object.values(byPosition).forEach(list => list.sort((a, b) => a.rank - b.rank));
            return byPosition;
        };

        const rosByPos = State.rosRankings.length > 0 ? groupByPosition(State.rosRankings, 'rank') : {};
        const marketByPos = State.marketRankings.length > 0 ? groupByPosition(State.marketRankings, 'marketVal') : {};

        const results = [];
        new Set([...Object.keys(rosByPos), ...Object.keys(marketByPos)]).forEach(pos => {
            const list = (rosByPos[pos] && rosByPos[pos].length > 0) ? rosByPos[pos] : (marketByPos[pos] || []);
            results.push(...list.slice(0, perPositionLimit));
        });
        return results;
    }
