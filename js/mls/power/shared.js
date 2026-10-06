// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: POSITIONAL POWER
// RANKINGS: SHARED MATH, plus computePositionalPower and powerTier, which sat under FUTURE VALUE
// but are the shared math that marker describes (power/allLeagues.js uses them too).
import { rankingIndex } from '../helpers.js';
import { powerAgeFactor } from './futureValue.js';

// --- POSITIONAL POWER RANKINGS: SHARED MATH ---
// Scores every manager's QB/RB/WR/TE room in one league from a rankings list, then ranks the
// managers 1..N at each position and overall. Pure (no DOM, no toasts) so the Positional Power
// Rankings card and the All My Leagues player search (see getLeaguePowerContext) run the exact
// same numbers -- the search's "WR Power Rank: 9th" has to match what this league's table says.
// Also splits each roster into its best legal starting lineup vs bench (see
// pickPowerStarters): the position columns measure whole rooms, depth included, but whether a
// team can actually compete comes down to who it can put on the field each week.
// Returns [] when the league has no whole-league roster data.
export const POWER_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const POWER_UNRANKED_RANK = 300;
// Power Curve: Heavily weights studs, incrementally adds value for depth
export const powerValueForRank = (rank) => Math.round(100000 / (rank + 5));
export function powerRankFor(rankingsIdx, cleanName) {
    const data = rankingsIdx.get(cleanName);
    // Use custom rank, or market rank. Default to 300 if not on the board.
    return { rank: data ? (data.rank || data.marketVal) : POWER_UNRANKED_RANK, data };
}

// How far above the league average one position's starters can count toward the Start score
// (1.5 = 150% of average). Lets a Josh Allen genuinely lift a lineup without letting him
// single-handedly paper over empty RB and WR rooms. See computePositionalPower step 3a.
export const POWER_STARTER_CARRY_CAP = 1.5;

// Same fallback lineup the rest of this file uses for a league with no saved reqs.
const POWER_DEFAULT_REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };
// Filled in this order: fixed slots first, then Sleeper's restricted flex slots (W/R, W/T; added in
// improvements S1), then FLEX, then Superflex -- most restrictive to least, the optimizer's order.
// Taking the best available player for each slot in that order is optimal for the fixed-FLEX-SFLEX
// chain, where every eligibility set contains the one before it; W/R and W/T don't contain each
// other, so a league with both can (rarely) come out a little below its true best. A player's
// value doesn't depend on which slot he fills. K/DEF slots are skipped: power rankings don't score
// those positions.
const POWER_STARTER_SLOTS = [
    ['QB', ['QB']], ['RB', ['RB']], ['WR', ['WR']], ['TE', ['TE']],
    ['WRRB', ['WR', 'RB']], ['WRTE', ['WR', 'TE']],
    ['FLEX', ['RB', 'WR', 'TE']], ['SFLEX', ['QB', 'RB', 'WR', 'TE']]
];
function pickPowerStarters(players, reqs) {
    const r = Object.assign({}, POWER_DEFAULT_REQS, reqs || {});
    const pool = [...players].sort((a, b) => b.value - a.value || a.rank - b.rank);
    const used = new Set();
    const starters = [];
    POWER_STARTER_SLOTS.forEach(([slot, eligible]) => {
        let need = parseInt(r[slot], 10) || 0;
        for (const p of pool) {
            if (need <= 0) break;
            if (used.has(p) || !eligible.includes(p.pos)) continue;
            used.add(p);
            starters.push({ ...p, slot });
            need--;
        }
    });
    return { starters, bench: pool.filter(p => !used.has(p)) };
}

// opts.future (optional) adds a futureScore/futureRank per team:
//   { mode: 'age', ages: { [cleanName]: age } } -- this league's rankings value x age curve
//   { mode: 'market', rankings: [...] }          -- dynasty Market Consensus value, no age
// Without it, teams carry no future fields -- the All My Leagues search doesn't use them.
export function computePositionalPower(league, rankings, opts = {}) {
    if (!league || !league.globalRosterMap || !league.globalPosMap) return [];
    const rankingsIdx = rankingIndex(rankings);
    let teamScoresMap = {};

    // 1. Initialize scoring objects for every manager
    Object.values(league.globalRosterMap).forEach(owner => {
        if (!teamScoresMap[owner]) {
            teamScoresMap[owner] = {
                owner: owner,
                scores: { QB: 0, RB: 0, WR: 0, TE: 0 },
                total: 0,
                players: { QB: [], RB: [], WR: [], TE: [] } // For our tooltips
            };
        }
    });

    // 2. Assign Power Points to EVERY rostered player
    Object.keys(league.globalRosterMap).forEach(cleanName => {
        let owner = league.globalRosterMap[cleanName];
        let pos = league.globalPosMap[cleanName];
        const { rank, data } = powerRankFor(rankingsIdx, cleanName);
        let actualName = data ? data.name : cleanName;
        let powerValue = powerValueForRank(rank);

        if (teamScoresMap[owner] && POWER_POSITIONS.includes(pos)) {
            teamScoresMap[owner].scores[pos] += powerValue;
            teamScoresMap[owner].total += powerValue;
            teamScoresMap[owner].players[pos].push({ name: actualName, cleanName, pos, rank: rank, value: powerValue, tier: data?.tier });
        }
    });

    let teamScores = Object.values(teamScoresMap);
    if (teamScores.length === 0) return teamScores;

    // 3. Sort player arrays so the tooltip shows the best players at the top, and split each
    // roster into starters vs bench against this league's own lineup requirements.
    teamScores.forEach(team => {
        POWER_POSITIONS.forEach(pos => {
            team.players[pos].sort((a, b) => a.rank - b.rank);
        });
        const all = POWER_POSITIONS.flatMap(pos => team.players[pos]);
        const { starters, bench } = pickPowerStarters(all, league.reqs);
        team.starters = starters;
        team.bench = bench;
        team.starterRaw = starters.reduce((sum, p) => sum + p.value, 0);
        team.benchScore = bench.reduce((sum, p) => sum + p.value, 0);
        // Starters grouped by their real position (a WR in FLEX counts as a WR), for the
        // balance score below.
        team.starterByPos = { QB: 0, RB: 0, WR: 0, TE: 0 };
        team.starterCountByPos = { QB: 0, RB: 0, WR: 0, TE: 0 };
        starters.forEach(p => { team.starterByPos[p.pos] += p.value; team.starterCountByPos[p.pos]++; });
    });

    // 3a. Starting lineup strength, BALANCED across positions. A plain sum of starter values
    // let one or two studs hide empty rooms elsewhere -- the power curve is steep (a rank-1
    // player is worth ~9x a rank-50 one), so an elite QB + TE could post the league's best
    // "starters" total with the league's worst RBs and WRs. Instead, each position's starters
    // are measured against the league average at that position, capped so one room can only
    // carry so much (POWER_STARTER_CARRY_CAP), and averaged with weights equal to how many
    // lineup spots that position fills on an average team here (so 3 WR spots count 3x one TE
    // spot, and Superflex leagues weight QBs accordingly). starterRatios is kept for the Start
    // tooltip, so the rank is explainable.
    const avgStarterByPos = {}, slotWeight = {};
    POWER_POSITIONS.forEach(pos => {
        avgStarterByPos[pos] = teamScores.reduce((sum, t) => sum + t.starterByPos[pos], 0) / teamScores.length;
        slotWeight[pos] = teamScores.reduce((sum, t) => sum + t.starterCountByPos[pos], 0) / teamScores.length;
    });
    const totalWeight = POWER_POSITIONS.reduce((sum, pos) => sum + slotWeight[pos], 0) || 1;
    teamScores.forEach(team => {
        team.starterRatios = {};
        let weighted = 0;
        POWER_POSITIONS.forEach(pos => {
            const ratio = avgStarterByPos[pos] > 0 ? team.starterByPos[pos] / avgStarterByPos[pos] : 1;
            team.starterRatios[pos] = ratio;
            weighted += slotWeight[pos] * Math.min(ratio, POWER_STARTER_CARRY_CAP);
        });
        team.starterScore = weighted / totalWeight;
    });

    // 3b. Future value, when asked for.
    const future = opts.future || null;
    if (future) {
        const marketIdx = future.mode === 'market' ? rankingIndex(future.rankings) : null;
        teamScores.forEach(team => {
            const all = POWER_POSITIONS.flatMap(pos => team.players[pos]);
            team.futurePlayers = all.map(p => {
                if (future.mode === 'market') {
                    const { rank } = powerRankFor(marketIdx, p.cleanName);
                    return { ...p, futureValue: powerValueForRank(rank), futureRank: rank };
                }
                const age = future.ages ? future.ages[p.cleanName] : undefined;
                return { ...p, age: Number.isFinite(age) ? age : null, futureValue: Math.round(p.value * powerAgeFactor(p.pos, age)) };
            }).sort((a, b) => b.futureValue - a.futureValue);
            team.futureScore = team.futurePlayers.reduce((sum, p) => sum + p.futureValue, 0);
        });
    }

    // 4. Rank teams 1 to N (Highest Power Score = Rank 1)
    const scoreOf = (team, key) => key === 'total' ? team.total
        : key === 'starters' ? team.starterScore
        : key === 'bench' ? team.benchScore
        : key === 'future' ? team.futureScore
        : team.scores[key];
    const assignRanks = (arr, posKey, rankKey) => {
        let sorted = [...arr].sort((a, b) => scoreOf(b, posKey) - scoreOf(a, posKey)); // Descending Sort

        sorted.forEach((team, idx) => {
            let original = arr.find(t => t.owner === team.owner);
            original[rankKey] = idx + 1;
        });
    };

    assignRanks(teamScores, 'QB', 'qbRank');
    assignRanks(teamScores, 'RB', 'rbRank');
    assignRanks(teamScores, 'WR', 'wrRank');
    assignRanks(teamScores, 'TE', 'teRank');
    assignRanks(teamScores, 'total', 'overallRank');
    assignRanks(teamScores, 'starters', 'starterRank');
    assignRanks(teamScores, 'bench', 'benchRank');
    if (future) assignRanks(teamScores, 'future', 'futureRank');

    // Final sort by overall rank for the table display
    teamScores.sort((a, b) => a.overallRank - b.overallRank);
    return teamScores;
}

// Top third / middle / bottom third -- the same split renderPowerRankingsTable colors its
// cells by (green / neutral / red), so a "weak" label in the All My Leagues search lines up
// with a red cell in that league's table.
export function powerTier(rank, totalTeams) {
    if (rank <= Math.ceil(totalTeams / 3)) return 'strong';
    if (rank > Math.floor(totalTeams * 2 / 3)) return 'weak';
    return 'middle';
}
