/**
 * Fantasy Football Season & Lineup Strategist - Core Logic
 * Refactored for modular encapsulation, performance, and clean architecture.
 */
//
// Renamed from lineup/mls.js in refactor chunk 3A. The sections above PLAYER HEADSHOTS moved to
// the other js/mls/ modules (see docs/refactor/LOG.md); 3B moved PLAYER HEADSHOTS through SOS
// ENGINE, except window.onload (3E moved it to init.js); 3C moved SCOUT TAB ENGINE through ALL-LEAGUES PLAYER SEARCH
// (js/mls/scout/, js/mls/power/allLeagues.js); 3D moved RANKINGS ENGINE through SCREENSHOT EXPORT
// (js/mls/rankings/, js/mls/trade/, js/mls/settings.js, js/mls/scout/marketDisconnect.js), except
// lookupSimPlayer; 3E moved RENDERERS through POWER-USER KEYBOARD SHORTCUTS (js/mls/render/,
// js/mls/init.js, js/mls/shortcuts.js). The rest of mls.js is still here.

// Pilot ES module extraction (see rankingsParser.js for rationale) -- this is the only
// piece of mls.js currently split out. import statements must live at a module's top
// level, which is why this sits above the IIFE rather than inside it; the imported
// function is still just a normal binding the IIFE's closures can reference below.
import { getNflState, getSleeperUser, getSleeperLeagueRosters, getSleeperPlayerMap, getSleeperMatchups } from '../shared/api/sleeper.js';
import { runMatchupSimulation, clearSimResults, showSimNotice } from '../../lineup/monteCarloUi.js';
import { getPlayerWeeklyScoreHistory, getWeeklyProjections } from '../shared/api/sleeperStats.js';
import { MIN_RELIABLE_GAMES, getPlayerVarianceProfile, getProbabilityBeats } from '../../lineup/statsEngine.js';
import { escapeHtml } from './compat.js';
import { tierTag } from './constants.js';
import { refreshGameTimes, State } from './state.js';
import { getShortInjuryStatus, isBestBallLeague, isExcludedFromSimulation, rankingIndex, SIM_EXCLUDE_STATUSES, getActiveLeague, isConnectionError } from './helpers.js';
import './nav.js';
import './backup.js';
import './init.js';
import './lineup/headshots.js';
import { getCleanNameToIdIndex } from './players.js';
import './lineup/earlyGames.js';
import { getLeagueScoringKey, hasKickedOff } from './lineup/gameInfo.js';
import './leagues/sync.js';
import './leagues/scoutResults.js';
import { checkForDraftStrategistHandoff } from './leagues/handoff.js';
import './leagues/addPlayer.js';
import './leagues/importAll.js';
import { generateSoSGrid } from './sos.js';
import './scout/engine.js';
import { getSleeperMetaByName } from './scout/waivers.js';
import { ordinal } from './power/allLeagues.js';
import { isFullyMappedLeague } from './scout/allLeaguesSearch.js';
import './rankings/engine.js';
import './rankings/sets.js';
import './rankings/uploadPreview.js';
import { updateMarketMetaDisplay } from './scout/marketDisconnect.js';
import './rankings/rosFetch.js';
import './settings.js';
import './trade/valueCurve.js';
import { getTopWaiverCandidatesByPosition } from './trade/waiverValue.js';
import './trade/export.js';
import './render/rookies.js';
import { loadRosterTab } from './render/roster.js';
import { isAutoLockOverridden, slotAcceptsPos, renderLineupUI } from './render/lineup.js';
import { renderSyncLogs } from './render/dashboard.js';
import './shortcuts.js';
// Re-exported for the modules that evaluate before the ones these live in (refactor 3E, see
// docs/refactor/LOG.md). Importing them from render/*.js or the like directly would evaluate
// those modules, and their imports, ahead of the importer: state.js would then read State in
// its TDZ, and the headshot/SoS/market load-time code would run out of mls.js order.
export { updateMarketMetaDisplay, generateSoSGrid, checkForDraftStrategistHandoff, renderSyncLogs, loadRosterTab, renderLineupUI, isAutoLockOverridden };

// Standalone "look up any player" search -- separate from the team-vs-team matchup
// simulation above it, by design (Benton's own call: simpler to reason about, and this is
// meant for evaluating someone you DON'T own yet -- "a podcaster mentioned this guy as a
// sleeper" -- not for slotting them into your current lineup). Reuses the app's one existing
// player autocomplete (attachPlayerAutocomplete) so this didn't need its own search UI, and
// the same getPlayerVarianceProfile everything else in the simulator is built on, just fed a
// single player's own history instead of a whole roster's.
//
// Scope note: unlike runMatchupSim, this does NOT check for an already-played actual score --
// that would need a live per-week stat lookup independent of any specific roster's matchup
// entry (Sleeper's matchup data is scoped per fantasy roster, and this player isn't
// necessarily on one), which isn't wired up anywhere in this app yet. For "should I add this
// person" -- the actual use case here -- a projection/history-based range is the right level
// of fidelity anyway; a live in-game update matters far less than it does for "will I win
// this specific matchup right now."
export const lookupSimPlayer = async function(p) {
    const resultEl = document.getElementById('simPlayerLookupResult');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<p class="text-helper">Looking up ${escapeHtml(p.name)}…</p>`;

    try {
        const nflState = await getNflState();
        if (!nflState) {
            resultEl.innerHTML = `<p class="text-helper">Couldn't reach Sleeper right now - try again in a moment.</p>`;
            return;
        }
        const currentWeek = nflState.week;
        const season = nflState.league_season || nflState.season;

        const nameToId = await getCleanNameToIdIndex();
        const id = nameToId[normalizeName(p.name)];
        if (!id) {
            resultEl.innerHTML = `<p class="text-helper">Couldn't find a Sleeper record for ${escapeHtml(p.name)}.</p>`;
            return;
        }

        const playerMap = await getSleeperPlayerMap();
        const rawPlayer = playerMap[id] || {};

        // This lookup isn't tied to any one league (that's the point -- checking out someone
        // you don't own yet), so there's no single "the" league scoring format to read.
        // Full PPR is the most common default across mainstream platforms and matches this
        // app's own fallback elsewhere.
        const scoringKey = 'pts_ppr';

        const { blended } = await getPlayerWeeklyScoreHistory([id], season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES });
        const weeklyScores = blended[id] || [];

        if (weeklyScores.length === 0) {
            resultEl.innerHTML = `<p class="text-helper">${escapeHtml(p.name)} doesn't have enough game history yet to estimate a range (rookie, recent signing, or long-term injury).</p>`;
            return;
        }

        const projections = await getWeeklyProjections(season, currentWeek);
        const proj = projections && projections[id];
        const projectedMean = (proj && typeof proj[scoringKey] === 'number') ? proj[scoringKey] : null;

        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean });
        const shortInj = getShortInjuryStatus(rawPlayer);
        const isExcluded = shortInj !== null && SIM_EXCLUDE_STATUSES.includes(shortInj);

        const injuryHTML = shortInj
            ? `<div class="sim-lookup-injury-flag${isExcluded ? ' is-excluded' : ''}">Status: ${escapeHtml(shortInj)}${isExcluded ? ' - unlikely to play this week' : ''}</div>`
            : '';

        resultEl.innerHTML = `
            <div class="sim-lookup-card">
                <div class="sim-lookup-header">
                    ${rawPlayer.position ? `<span class="pos-badge ${escapeHtml(rawPlayer.position)}">${escapeHtml(rawPlayer.position)}</span>` : ''}
                    <strong>${escapeHtml(p.name)}</strong>
                    <span class="text-helper">${escapeHtml(rawPlayer.team || 'FA')}</span>
                </div>
                ${injuryHTML}
                <div class="sim-lookup-range">${profile.usedFallback ? '~' : ''}${profile.floor}&ndash;${profile.ceiling} pts <span class="text-helper">(${profile.mean} ${projectedMean !== null ? 'proj' : 'avg'})</span></div>
                <p class="text-helper mt-1">Standalone estimate - not run against any specific matchup or lineup.</p>
            </div>`;
    } catch (err) {
        console.error(err);
        resultEl.innerHTML = `<p class="text-helper">Something went wrong looking that player up.</p>`;
    }
};

// --- POSITIONAL POWER RANKINGS: SHARED MATH ---
// Scores every manager's QB/RB/WR/TE room in one league from a rankings list, then ranks the
// managers 1..N at each position and overall. Pure (no DOM, no toasts) so the Positional Power
// Rankings card and the All My Leagues player search (see getLeaguePowerContext) run the exact
// same numbers -- the search's "WR Power Rank: 9th" has to match what this league's table says.
// Also splits each roster into its best legal starting lineup vs bench (see
// pickPowerStarters): the position columns measure whole rooms, depth included, but whether a
// team can actually compete comes down to who it can put on the field each week.
// Returns [] when the league has no whole-league roster data.
const POWER_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
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
const POWER_STARTER_CARRY_CAP = 1.5;

// Same fallback lineup the rest of this file uses for a league with no saved reqs.
const POWER_DEFAULT_REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0 };
// Filled in this order: fixed slots first, then FLEX, then Superflex -- most restrictive to
// least. Taking the best available player for each slot in that order is optimal here, since
// every eligibility set contains the one before it and a player's value doesn't depend on which
// slot he fills. K/DEF slots are skipped: power rankings don't score those positions.
const POWER_STARTER_SLOTS = [
    ['QB', ['QB']], ['RB', ['RB']], ['WR', ['WR']], ['TE', ['TE']],
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

// --- FUTURE VALUE (dynasty / keeper) ---
// Rough positional age curves: a multiplier on each player's rankings value, >1 before a
// position's typical peak and falling off after it (RBs earliest, QBs latest). Custom dynasty
// rankings usually price age in already, so these are deliberately gentle -- they tilt a
// roster's future score toward youth rather than overriding the board. A heuristic, and the
// guide says so; not a projection model. Each row is [max age, multiplier]; unknown age = 1.
const POWER_AGE_CURVES = {
    QB: [[26, 1.10], [30, 1.05], [32, 1.00], [33, 0.90], [34, 0.80], [35, 0.70], [Infinity, 0.55]],
    RB: [[24, 1.15], [25, 1.05], [26, 0.95], [27, 0.80], [28, 0.65], [29, 0.50], [Infinity, 0.35]],
    WR: [[24, 1.15], [26, 1.05], [27, 1.00], [28, 0.90], [29, 0.75], [30, 0.60], [31, 0.45], [Infinity, 0.35]],
    TE: [[25, 1.10], [27, 1.05], [28, 1.00], [29, 0.90], [30, 0.75], [31, 0.60], [Infinity, 0.45]]
};
function powerAgeFactor(pos, age) {
    const curve = POWER_AGE_CURVES[pos];
    if (!curve || !Number.isFinite(age) || age <= 0) return 1;
    for (const [maxAge, factor] of curve) if (age <= maxAge) return factor;
    return 1;
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

// --- TEAM DIRECTION LABELS ---
// Dynasty and keeper leagues get Contender / Retool / Rebuild; redraft (and anything else) gets
// Contender / Bubble / Longshot, since "rebuild" means nothing when rosters reset each year.
// leagueType is stored at sync (see the leagueObj in the Sleeper sync); leagues synced before
// it existed fall back to reading formatBadge.
export function getPowerLeagueKind(league) {
    const t = league && league.leagueType;
    if (t) return (t === 'dynasty' || t === 'keeper') ? 'dynasty' : 'redraft';
    return /^(Dynasty|Keeper)\b/.test((league && league.formatBadge) || '') ? 'dynasty' : 'redraft';
}

// Labels come from the starting lineup's tier (top / middle / bottom third, as powerTier), with
// future value deciding the dynasty cases where "now" alone is ambiguous:
//   Dynasty:  top-third starters                -> Contender ("window closing" if the roster's
//                                                  future value is bottom-third)
//             middle starters                    -> Retool, unless future is bottom-third ->
//                                                  Rebuild (a mid-pack team that's also old)
//             bottom-third starters              -> Rebuild ("young core" if future is top-third)
//   Redraft:  top / middle / bottom starters     -> Contender / Bubble / Longshot
// A top-third lineup is never told to Retool: whatever the ages, the best move for one of the
// best teams in the league is to push for a title. Based on roster strength only -- not
// the standings -- which the card's notes say.
function assignPowerLabels(teams, kind) {
    const N = teams.length;
    const hasFuture = teams.every(t => Number.isFinite(t.futureRank));
    teams.forEach(t => {
        const st = powerTier(t.starterRank, N);
        const ft = hasFuture ? powerTier(t.futureRank, N) : null;
        t.labelNote = '';
        if (kind === 'redraft') {
            t.label = st === 'strong' ? 'Contender' : (st === 'middle' ? 'Bubble' : 'Longshot');
            return;
        }
        if (st === 'strong') {
            t.label = 'Contender';
            if (ft === 'weak') t.labelNote = 'window closing';
        } else if (st === 'middle') {
            t.label = ft === 'weak' ? 'Rebuild' : 'Retool';
        } else {
            t.label = 'Rebuild';
            if (ft === 'strong') t.labelNote = 'young core';
        }
    });
}

// One sentence per label for the "Your Team" summary above the table.
function powerLabelAdvice(t) {
    const key = t.label + (t.labelNote ? `|${t.labelNote}` : '');
    return ({
        'Contender': "Your starting lineup is one of the league's best. Depth or future value you can spare is worth turning into starters.",
        'Contender|window closing': "Your starting lineup is one of the league's best, but the roster is old. Push for a title now; this window won't stay open long.",
        'Retool': "Your lineup is mid-pack with a solid future behind it. One or two targeted starter upgrades could make you a contender, without selling your young core.",
        'Rebuild': t.starterTier === 'middle'
            ? "Your lineup is mid-pack and the roster is aging. Consider selling veterans for younger players and picks before their value drops."
            : "Your starting lineup is in the bottom third. Consider selling veterans for younger players and picks.",
        'Rebuild|young core': "Your lineup is in the bottom third now, but your future value is among the league's best. The rebuild is on track; keep adding youth.",
        'Bubble': "Your lineup is mid-pack. A starter upgrade or two could swing a playoff spot.",
        'Longshot': "Your starting lineup is in the bottom third. Take swings on upside, on waivers and in trades."
    })[key] || '';
}

// Clean name -> age, from the same day-cached Sleeper player map everything else uses. The card
// renders without the Future column until this resolves, then re-renders once; a failed load
// is remembered for the session so it doesn't retry on every Roster tab render.
let _powerAgeIndex = null;
let _powerAgeState = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed'
function ageFromMeta(m) {
    if (m.birthDate) {
        const b = new Date(m.birthDate + 'T00:00:00');
        if (!isNaN(b)) {
            const now = new Date();
            let age = now.getFullYear() - b.getFullYear();
            if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
            if (age > 15 && age < 50) return age;
        }
    }
    const a = Number(m.age);
    return Number.isFinite(a) && a > 0 ? a : null;
}
function ensurePowerAgeIndex() {
    if (_powerAgeState !== 'idle') return;
    _powerAgeState = 'loading';
    getSleeperMetaByName().then(meta => {
        const idx = {};
        Object.entries(meta).forEach(([clean, m]) => {
            const age = ageFromMeta(m);
            if (age != null) idx[clean] = age;
        });
        _powerAgeIndex = idx;
        _powerAgeState = 'ready';
        refreshPowerRankings();
    }).catch(err => {
        console.warn('Power Rankings: Sleeper player ages unavailable; future value falls back to Market Consensus if loaded.', err);
        _powerAgeState = 'failed';
        refreshPowerRankings();
    });
}

// Future value source for the active league: rankings x Sleeper age (preferred), else dynasty
// Market Consensus values, else none. Market data only counts when it was pulled as Dynasty --
// redraft market values say nothing about next year.
function resolvePowerFuture() {
    if (_powerAgeState === 'ready') return { future: { mode: 'age', ages: _powerAgeIndex }, label: 'age' };
    const dynastyMarket = State.marketRankings.length > 0 && State.marketSettings && State.marketSettings.type === 'dynasty';
    if (_powerAgeState === 'failed' && dynastyMarket) return { future: { mode: 'market', rankings: State.marketRankings }, label: 'market' };
    return { future: null, label: _powerAgeState === 'loading' ? 'loading' : 'none' };
}

// --- POSITIONAL POWER RANKINGS: ROSTER TAB CARD ---
// Generated automatically (no Calculate button) every time the Roster tab renders -- see the
// call at the top of loadRosterTab, which every rankings upload, set change, sync and league
// switch already funnels through. The math is a few milliseconds even for a 14-team league,
// so recomputing on every render is cheaper than tracking what changed.
export const updatePowerSetting = function(key, value) {
    State.powerSettings[key] = value;
    localStorage.setItem('mls_power_settings', JSON.stringify(State.powerSettings));
    refreshPowerRankings();
};

// Which rankings the card scores with: the person's pick, falling back to the other source
// (with a note saying so) rather than showing nothing, the same way the All My Leagues search
// falls back to Market Consensus for a league without rankings of its own.
function resolvePowerRankingsSource() {
    const wantMarket = State.powerSettings.source === 'market';
    const mine = State.rosRankings, market = State.marketRankings;
    if (wantMarket) {
        if (market.length > 0) return { rankings: market, source: 'market', note: '' };
        if (mine.length > 0) return { rankings: mine, source: 'custom', note: 'No Market Consensus data loaded yet, so this uses your own rankings instead.' };
    } else {
        if (mine.length > 0) return { rankings: mine, source: 'custom', note: '' };
        if (market.length > 0) return { rankings: market, source: 'market', note: 'No rankings of your own loaded for this league, so this uses Market Consensus instead. Upload rankings above for a board built for this league.' };
    }
    return null;
}

export function refreshPowerRankings() {
    const out = document.getElementById('powerRankingsOutput');
    if (!out) return;
    const sourceSelect = document.getElementById('powerRankingsSource');
    if (sourceSelect) sourceSelect.value = State.powerSettings.source === 'market' ? 'market' : 'custom';

    const showMessage = (msg) => {
        out.innerHTML = `<div class="mls-power-empty">${msg}</div>`;
        out.style.display = 'block';
        renderRosterPowerStrip(null); // nothing to summarize up top either
    };

    const league = getActiveLeague();
    if (!league) {
        showMessage('Select or sync a league on the Dashboard to see Positional Power Rankings.');
        return;
    }
    if (!isFullyMappedLeague(league) || !league.globalPosMap) {
        showMessage("Power Rankings compare every team in the league, so they need a Sleeper-synced league. This league only knows your own roster.");
        return;
    }
    const src = resolvePowerRankingsSource();
    if (!src) {
        showMessage('Upload your rankings above (or Auto-Fetch them) to see how every team in this league stacks up.');
        return;
    }
    // Future value only matters where rosters carry over. Ages load in the background the
    // first time (see ensurePowerAgeIndex), which re-runs this once they land.
    const kind = getPowerLeagueKind(league);
    let futureInfo = { future: null, label: 'none' };
    if (kind === 'dynasty') {
        ensurePowerAgeIndex();
        futureInfo = resolvePowerFuture();
    }
    const teams = computePositionalPower(league, src.rankings, { future: futureInfo.future });
    if (teams.length === 0) {
        showMessage('Not enough roster data to evaluate yet. Try re-syncing this league.');
        return;
    }
    assignPowerLabels(teams, kind);
    teams.forEach(t => { t.starterTier = powerTier(t.starterRank, teams.length); });
    renderPowerRankingsTable(teams, { league, source: src, kind, futureLabel: futureInfo.label });
    renderRosterPowerStrip(teams, { source: src });
}

// --- ACTIVE ROSTER: POWER RANKINGS SNAPSHOT ---
// Your own row of the Positional Power Rankings, shown under the league name at the top of the
// Active Roster card (#rosterPowerStrip) -- the full table sits far enough down the Roster tab
// that people could miss it entirely. Ranks only, no tooltips: this is a glance, and the link
// underneath jumps to the table, which has the player-level detail and the explanations.
// Rendered from the exact same teams array as the table, so the two can't disagree.
function renderRosterPowerStrip(teams, ctx = {}) {
    const el = document.getElementById('rosterPowerStrip');
    if (!el) return;
    const you = teams ? teams.find(t => t.owner === 'You') : null;
    if (!you) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    const N = teams.length;
    const hasFuture = teams.every(t => Number.isFinite(t.futureRank));
    const stats = [
        ['Start', you.starterRank], ['Ovr', you.overallRank],
        ['QB', you.qbRank], ['RB', you.rbRank], ['WR', you.wrRank], ['TE', you.teRank]
    ];
    if (hasFuture) stats.push(['Future', you.futureRank]);
    const label = you.label
        ? `<span class="mls-power-label mls-power-label-${String(you.label).toLowerCase()}">${escapeHtml(you.label)}${you.labelNote ? ` <span class="mls-power-label-note">&middot; ${escapeHtml(you.labelNote)}</span>` : ''}</span>` : '';
    const via = ctx.source && ctx.source.source === 'market' ? ' &middot; via Market Consensus' : '';
    el.innerHTML = `
        <div class="mls-roster-power-head">
            <span class="mls-roster-power-title">Positional Power Rankings</span>
            ${label}
            <span class="mls-roster-power-of">out of ${N} teams${via}</span>
        </div>
        <div class="mls-roster-power-stats" style="grid-template-columns: repeat(${stats.length}, minmax(0, 1fr));">
            ${stats.map(([name, rank]) => `
            <div class="mls-roster-power-stat">
                <span class="mls-roster-power-stat-name">${name}</span>
                <span class="mls-roster-power-stat-rank mls-power-cell-${powerTier(rank, N)}">${rank}</span>
            </div>`).join('')}
        </div>
        <button type="button" class="mls-roster-power-link btn-bare" onclick="scrollToPowerRankings()">See the full league breakdown and explanations below &darr;</button>`;
    el.style.display = 'block';
}

// Scrolls the Roster tab's Power Rankings card into view (the snapshot's link above; the Scout
// tab's temporary pointer uses it too, via goToPowerRankings). #powerRankingsCard carries a
// scroll-margin-top in styles.css so the sticky header doesn't cover the card title.
export const scrollToPowerRankings = function() {
    const card = document.getElementById('powerRankingsCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Scout tab's one-line "moved to the Roster tab" pointer (see #powerRankingsScoutPointer in
// index.html). The delay lets showTab's own scroll-to-top start before scrolling to the card,
// the same trick scoutGoToLeague uses.
// TODO (added 2026-09-27): recommend removing this pointer -- the #powerRankingsScoutPointer
// section in index.html, this function, and the .mls-moved-pointer CSS -- on or after
// 2026-10-04, once regular users have had a week to find the card's new home.
export const goToPowerRankings = function() {
    if (typeof window.showTab === 'function') window.showTab('roster');
    setTimeout(() => window.scrollToPowerRankings(), 60);
};

// Kept for anything still calling the old Scout-tab button handler.
export const runPositionalStrength = function() {
    refreshPowerRankings();
};

export const renderPowerRankingsTable = function(teamScores, ctx = {}) {
    let out = document.getElementById('powerRankingsOutput');
    if (!out) return;

    const totalTeams = teamScores.length;
    const tierCls = (rank) => `mls-power-cell-${powerTier(rank, totalTeams)}`;

    // Nested player tooltips. slot: show each player's lineup slot (Starters column).
    // Direction: the site-wide tooltip opens leftward from its anchor, which runs off-screen for
    // the left-hand columns on a phone -- so Start/Bench/QB open rightward instead, and RB and
    // everything right of it keep opening leftward.
    const buildTooltip = (players, title, { rightEdge = false, slot = false, limit = 6 } = {}) => {
        let html = `<div class="tooltip-text mls-power-tooltip ${rightEdge ? 'mls-power-tooltip-right' : 'mls-power-tooltip-left'}">`;
        html += `<div class="mls-power-tooltip-title">${escapeHtml(title)}</div>`;
        if (players.length === 0) {
            html += `<div class="mls-power-tooltip-empty">No players rostered.</div>`;
        } else {
            html += players.slice(0, limit).map(p => `
                <div class="mls-power-tooltip-row">
                    <span class="mls-power-tooltip-name">${slot ? `<span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : p.slot}</span>` : ''}${escapeHtml(p.name)}</span>
                    <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
                </div>`).join('');
            if (players.length > limit) {
                html += `<div class="mls-power-tooltip-more">+ ${players.length - limit} more</div>`;
            }
        }
        return html + `</div>`;
    };

    const cell = (rank, tooltipHTML, extraCls = '') => `
        <td class="${tierCls(rank)} ${extraCls}">
            <div class="tooltip-container mls-tooltip-center" ontouchstart="">
                <span class="mls-dotted-underline">${rank}</span>
                ${tooltipHTML}
            </div>
        </td>`;

    // Sorted by starting-lineup strength: "can this team win now?" is the question the table
    // leads with. The position columns still cover whole rooms, bench included.
    const rows = [...teamScores].sort((a, b) => a.starterRank - b.starterRank);
    const hasFuture = rows.every(t => Number.isFinite(t.futureRank));
    const labelCls = (t) => `mls-power-label mls-power-label-${String(t.label || '').toLowerCase()}`;
    const labelChip = (t) => t.label
        ? `<span class="${labelCls(t)}">${escapeHtml(t.label)}${t.labelNote ? ` <span class="mls-power-label-note">&middot; ${escapeHtml(t.labelNote)}</span>` : ''}</span>` : '';

    // Start tooltip: each position's starters vs the league average (what the rank is actually
    // built from -- see computePositionalPower step 3a), then the lineup itself.
    const startTooltip = (t) => {
        const ratioCls = (r) => r >= 1.15 ? 'mls-power-cell-strong' : (r < 0.85 ? 'mls-power-cell-weak' : '');
        const balance = POWER_POSITIONS.map(pos => {
            const r = t.starterRatios ? t.starterRatios[pos] : null;
            if (r == null) return '';
            const capped = r > POWER_STARTER_CARRY_CAP ? ' title="Counts as 150% - one position can only carry so much"' : '';
            return `<span class="mls-power-balance-item"${capped}>${pos} <strong class="${ratioCls(r)}">${Math.round(r * 100)}%</strong>${r > POWER_STARTER_CARRY_CAP ? '*' : ''}</span>`;
        }).join('');
        let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-left">`;
        html += `<div class="mls-power-tooltip-title">Starting Lineup</div>`;
        html += `<div class="mls-power-balance-label">Starters vs. league average</div><div class="mls-power-balance">${balance}</div>`;
        if (POWER_POSITIONS.some(pos => t.starterRatios && t.starterRatios[pos] > POWER_STARTER_CARRY_CAP)) {
            html += `<div class="mls-power-balance-foot">* capped at 150% - one position can only carry so much</div>`;
        }
        html += t.starters.map(p => `
            <div class="mls-power-tooltip-row">
                <span class="mls-power-tooltip-name"><span class="mls-power-tooltip-slot">${p.slot === 'SFLEX' ? 'SF' : p.slot}</span>${escapeHtml(p.name)}</span>
                <span class="mls-power-tooltip-rank">#${p.rank}${tierTag(p.tier)}</span>
            </div>`).join('');
        return html + `</div>`;
    };

    // Future tooltip: top contributors with their age (age mode) so the number is explainable.
    const futureTooltip = (t) => {
        const players = (t.futurePlayers || []).slice(0, 8);
        let html = `<div class="tooltip-text mls-power-tooltip mls-power-tooltip-right">`;
        html += `<div class="mls-power-tooltip-title">Future Value (age-adjusted)</div>`;
        html += players.map(p => `
            <div class="mls-power-tooltip-row">
                <span class="mls-power-tooltip-name">${escapeHtml(p.name)}</span>
                <span class="mls-power-tooltip-rank">${p.age != null ? `${p.age} yrs &middot; ` : ''}#${p.futureRank != null ? p.futureRank : p.rank}</span>
            </div>`).join('');
        if ((t.futurePlayers || []).length > players.length) html += `<div class="mls-power-tooltip-more">+ ${t.futurePlayers.length - players.length} more</div>`;
        return html + `</div>`;
    };

    // "Your Team" summary: the label in words, so nobody has to decode the table first.
    let summaryHTML = '';
    const you = rows.find(t => t.owner === 'You');
    if (you && you.label) {
        const facts = [`<strong>${ordinal(you.starterRank)}</strong> of ${totalTeams} in starting lineup`, `<strong>${ordinal(you.overallRank)}</strong> overall`];
        if (hasFuture) facts.push(`<strong>${ordinal(you.futureRank)}</strong> in future value`);
        summaryHTML = `
        <div class="mls-power-summary-card mls-power-summary-${String(you.label).toLowerCase()}">
            <div class="mls-power-summary-head">Your Team: ${labelChip(you)}</div>
            <div class="mls-power-summary-facts">${facts.join(' <span class="mls-rank-sep">&middot;</span> ')}</div>
            <div class="mls-power-summary-advice">${escapeHtml(powerLabelAdvice(you))}</div>
        </div>`;
    }

    let html = `
        <div class="mls-power-table-wrap">
        <table class="mls-power-table">
            <thead>
                <tr>
                    <th class="mls-power-manager">Manager</th>
                    <th title="Best legal starting lineup for this league's roster settings, weighed position by position against the league average">Start</th>
                    <th title="Whole roster (QB/RB/WR/TE), starters and depth together">Ovr</th>
                    <th>QB</th>
                    <th>RB</th>
                    <th>WR</th>
                    <th>TE</th>
                    ${hasFuture ? `<th title="Future value: roster value adjusted for age - who holds up beyond this season">Future</th>` : ''}
                </tr>
            </thead>
            <tbody>`;

    rows.forEach(t => {
        html += `
            <tr class="${t.owner === 'You' ? 'mls-power-you' : ''}">
                <td class="mls-power-manager"><span class="mls-power-owner">${escapeHtml(t.owner)}</span>${labelChip(t)}</td>
                ${cell(t.starterRank, startTooltip(t), 'mls-power-strong-col')}
                ${cell(t.overallRank, buildTooltip([...t.starters, ...t.bench].sort((a, b) => a.rank - b.rank), 'Top of the Roster', { limit: 8 }))}
                ${cell(t.qbRank, buildTooltip(t.players.QB, 'QB Room'))}
                ${cell(t.rbRank, buildTooltip(t.players.RB, 'RB Room', { rightEdge: true }))}
                ${cell(t.wrRank, buildTooltip(t.players.WR, 'WR Room', { rightEdge: true }))}
                ${cell(t.teRank, buildTooltip(t.players.TE, 'TE Room', { rightEdge: true }))}
                ${hasFuture ? cell(t.futureRank, futureTooltip(t)) : ''}
            </tr>`;
    });

    html += `</tbody></table></div>`;

    const notes = [];
    if (ctx.source && ctx.source.note) notes.push(escapeHtml(ctx.source.note));
    notes.push(`Ranked 1-${totalTeams} (1 = strongest). <strong>Start</strong> is each team's best legal lineup under this league's roster settings, with each position's starters measured against the league average and weighted by how many lineup spots it fills - so a stud at one position can't hide empty rooms at the others. <strong>Ovr</strong> is the whole roster, depth included.`);
    if (ctx.kind === 'dynasty') {
        if (ctx.futureLabel === 'age') notes.push(`<strong>Future</strong> is each roster's future value: its value from these rankings, adjusted for player age (from Sleeper) with rough positional age curves - younger players count a bit more, older players less.`);
        else if (ctx.futureLabel === 'market') notes.push(`<strong>Future</strong> is each roster's future value. Couldn't load player ages from Sleeper, so it uses dynasty Market Consensus values instead.`);
        else if (ctx.futureLabel === 'loading') notes.push(`Loading player ages from Sleeper for the Future column…`);
        else notes.push(`Couldn't load player ages from Sleeper, so there's no Future column; labels use the starting lineup alone. Pulling Dynasty Market Consensus data (Trade Finder on the Scout tab) gives a fallback.`);
        notes.push(`Labels: <strong>Contender</strong> = top-third starting lineup; <strong>Retool</strong> = mid-pack lineup with a decent future; <strong>Rebuild</strong> = bottom-third lineup, or mid-pack with a bottom-third future.`);
    } else {
        notes.push(`Labels: <strong>Contender</strong> / <strong>Bubble</strong> / <strong>Longshot</strong> = top / middle / bottom third in starting lineup strength.`);
    }
    notes.push(`Labels reflect roster strength only, not the standings.`);
    html += `<ul class="mls-power-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`;

    out.innerHTML = summaryHTML + html;
    out.style.display = 'block';
};

// A player this audit considers a genuine problem to leave in an active slot. Deliberately
// narrower than HARD_OUT_STATUSES / getShortInjuryStatus's full vocabulary: Questionable and
// Doubtful players are game-time calls you may well still want rostered and even started, so
// flagging them here would bury the real "this guy is definitively not playing, go move him"
// signal this tool exists to surface. Shared by the Sleeper and manual-league paths below so
// the two can't drift on what counts as injured.
function isAuditOut(p) {
    if (!p) return false;
    return p.injury_status === "Out" || ["IR", "PUP", "NFI", "Suspended"].includes(p.status);
}

// Clean name -> raw Sleeper player entries, built over a player map the caller already has in
// hand (the audit's own force-refreshed one) rather than the session-cached indexes near the
// top of this file -- an injury audit specifically wants today's statuses, not whatever was
// cached when some earlier feature first needed a name lookup.
//
// Values are ARRAYS of candidates, unlike getCleanNameToIdIndex's first-match-wins: manual
// players carry a position and team the caller can disambiguate with (see resolveManualPlayer),
// and picking a retired namesake here wouldn't just mislabel a row, it would report the wrong
// injury status for somebody's actual starter.
function buildCleanNameCandidateIndex(playerMap) {
    const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const index = {};
    Object.entries(playerMap).forEach(([id, p]) => {
        if (!p || !p.first_name || !FANTASY_POS.includes(p.position)) return;
        const clean = normalizeName(`${p.first_name} ${p.last_name}`);
        (index[clean] = index[clean] || []).push({ ...p, id });
    });
    return index;
}

// Best guess at which real NFL player a manually-entered roster entry refers to. Returns null
// when nothing matches at all -- manual entries are free text (typos, nicknames, team defenses
// written any number of ways), so "no match" is an expected outcome, not an error, and the
// caller reports the count rather than silently pretending those players were audited.
function resolveManualPlayer(p, candidateIndex) {
    const candidates = candidateIndex[p.cleanName];
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Ordered tiebreakers, most trustworthy first. The manual "team" field defaults to FA and
    // the position dropdown defaults to FLEX, so neither is worth matching on when it is still
    // sitting at that default -- hence the guards.
    const team = p.team && p.team !== "FA" ? p.team : null;
    const pos = p.pos && p.pos !== "FLEX" ? p.pos : null;
    return (team && candidates.find(c => c.team === team))
        || (pos && candidates.find(c => c.position === pos && c.team))
        || (pos && candidates.find(c => c.position === pos))
        || candidates.find(c => c.team)
        || candidates[0];
}

export const runGlobalInjuryAudit = async function(btn) {
    const outputEl = document.getElementById('injuryAuditOutput');
    const origText = btn.innerHTML;
    btn.innerHTML = "Scanning Leagues…";
    btn.disabled = true;
    btn.style.opacity = "0.7";
    outputEl.innerHTML = "";

    try {
        if (!State.leagues || State.leagues.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">No leagues synced.</span>`;
            return;
        }

        // Fetch global player map to check current injury status
        const playerMap = await getSleeperPlayerMap({ forceRefresh: true });
        // Only built if a manual league actually turns up -- it is a full pass over every
        // player Sleeper knows about, not worth doing for an all-Sleeper set of leagues.
        let candidateIndex = null;

        // The locked-player filter below is only as good as the kickoff data behind it, and
        // State.currentNflWeek/gameTimesByTeam can be null on a fresh load or stale if the
        // background refresh hasn't caught up -- so this Run gets current data rather than
        // whatever happened to be cached. Failure is deliberately swallowed: hasKickedOff
        // returns false for a team it has no data for, so a dead ESPN/Sleeper endpoint just
        // means nothing gets filtered and the audit reports everything, exactly as it did
        // before this filter existed. Losing the whole audit over it would be far worse.
        try {
            const nflState = await getNflState();
            if (nflState && typeof nflState.week === 'number') {
                State.currentNflWeek = nflState.week;
                await refreshGameTimes();
            }
        } catch (err) { /* see above -- degrade to "nothing is locked" */ }

        let auditResults = [];
        let scannedSleeper = 0;
        let scannedManual = 0;
        let skippedBestBall = 0;
        // Injured players whose game has already kicked off: real problems, but ones no
        // platform will let you fix this week. Collected rather than dropped so the notice at
        // the top can account for them -- silently omitting them would look like the audit
        // missed an obvious IR starter sitting right there on the Lineup tab.
        let lockedOut = [];

        // --- PREFETCH EVERY LEAGUE'S NETWORK DATA IN PARALLEL ---
        // The loop below used to `await getSleeperLeagueRosters(...)` and
        // `await getSleeperUser(...)` inside itself, one league at a time. Ten Sleeper leagues
        // meant twenty strictly serialized round-trips before a single result appeared, with
        // no progress indication -- the audit read as a hang rather than as work. Nothing in
        // the loop depends on a previous league's response, so there was never a reason to
        // serialize them; fetched together, the whole set costs roughly one round-trip of
        // wall time.
        //
        // The username lookup is also deduplicated. Most people use the same Sleeper account
        // for every league they're in, so the old code re-fetched an identical user record
        // once per league.
        const isSleeperAuditLeague = (l) => !!l.leagueId
            && !isBestBallLeague(l)
            && !l.leagueId.startsWith('manual_')
            && !l.leagueId.startsWith('handoff_');

        const rostersByLeagueId = new Map();
        const userIdByUsername = new Map();
        const sleeperAuditLeagues = State.leagues.filter(isSleeperAuditLeague);

        if (sleeperAuditLeagues.length > 0) {
            const uniqueUsernames = [...new Set(sleeperAuditLeagues.map(l => l.username).filter(Boolean))];
            const [rosterResults, userIdResults] = await Promise.all([
                // Promise.all, not allSettled: a failed roster fetch rejects out to this
                // function's own catch and surfaces as an audit error, which is exactly what
                // happened before when the bare await inside the loop threw. Keeping that
                // deliberately -- quietly dropping a league would make an unscanned league
                // indistinguishable from a clean one.
                Promise.all(sleeperAuditLeagues.map(l => getSleeperLeagueRosters(l.leagueId))),
                // Per-username catch, mirroring the try/catch this replaces: a bad username
                // skips the leagues that use it and the rest of the audit carries on.
                Promise.all(uniqueUsernames.map(u => getSleeperUser(u).then(d => d.user_id).catch(() => null)))
            ]);
            sleeperAuditLeagues.forEach((l, i) => rostersByLeagueId.set(l.leagueId, rosterResults[i]));
            uniqueUsernames.forEach((u, i) => userIdByUsername.set(u, userIdResults[i]));
        }

        for (let league of State.leagues) {
            if (!league.leagueId) continue;

            // Nothing to act on in a Best Ball league: lineups are scored automatically, and
            // they do not hand you an IR slot to stash an Out player in either -- so every row
            // this audit could produce for one would be a chore the format does not allow.
            if (isBestBallLeague(league)) { skippedBestBall++; continue; }

            // Draft-Strategist-handoff leagues count as manual here for the same reason
            // isFullyMappedLeague groups them: they're a locally-stored roster of your own
            // players with no Sleeper league behind them. Previously only 'manual_' was
            // checked and a handoff league fell through to the Sleeper branch below, where
            // getSleeperLeagueRosters('handoff_...') threw and took the whole audit down with
            // it rather than just skipping that one league.
            const isManual = league.leagueId.startsWith('manual_') || league.leagueId.startsWith('handoff_');

            // Manually added leagues: Sleeper has no roster for them, but it still knows the
            // injury status of the actual NFL players on them, matched by name. There is no
            // Sleeper lineup to compare against, so "starting" means the lineup as it stands in
            // this tool (the optimizer's output on the Lineup tab), and an injured bench player
            // is reported as-is rather than as "Move to IR" -- whether the real league even has
            // an IR slot isn't something we can know from here.
            if (isManual) {
                const roster = league.roster || [];
                if (roster.length === 0) continue;

                if (!candidateIndex) candidateIndex = buildCleanNameCandidateIndex(playerMap);
                scannedManual++;

                const localStarters = State.manualStartersMap[league.leagueId] || [];
                const starterIds = new Set(localStarters.filter(s => s.player).map(s => s.player.id));
                // A league whose lineup has never been optimized has no starter/bench split at
                // all, so every injured player there is reported neutrally as "On Roster"
                // instead of being miscast as a benching that has already been handled.
                const lineupIsSet = starterIds.size > 0;

                let leagueIssues = [];
                let unmatched = 0;

                roster.forEach(rp => {
                    // Team defenses are keyed by team abbreviation in Sleeper's player map, and
                    // the manual entry's name for one is free text ("Eagles", "Philadelphia
                    // D/ST"), so they're resolved off the team code instead of by name. One
                    // that can't be resolved is dropped rather than counted as unmatched: a
                    // D/ST has no injury designation to report, so telling the person it went
                    // unchecked would be noise about nothing.
                    let match;
                    if (rp.pos === 'DEF') {
                        const def = rp.team ? playerMap[rp.team] : null;
                        if (!def || def.position !== 'DEF') return;
                        match = def;
                    } else {
                        match = resolveManualPlayer(rp, candidateIndex);
                        if (!match) { unmatched++; return; }
                    }
                    if (!isAuditOut(match)) return;

                    // Sleeper's team code, not the manually-typed one -- the manual entry's
                    // team defaults to FA and can go stale after a trade, and a wrong team here
                    // means either a locked player reported as fixable or a fixable one hidden.
                    if (hasKickedOff({ team: match.team })) {
                        lockedOut.push({ leagueName: league.name, name: rp.name });
                        return;
                    }

                    const location = !lineupIsSet ? "On Roster"
                        : (starterIds.has(rp.id) ? "Starting Lineup" : "Bench");
                    leagueIssues.push({
                        name: rp.name,
                        status: match.injury_status || match.status,
                        location
                    });
                });

                // Unmatched names are surfaced even when nothing else is wrong -- otherwise a
                // league full of typo'd names would render as a clean bill of health.
                if (leagueIssues.length > 0 || unmatched > 0) {
                    auditResults.push({
                        leagueName: league.name,
                        format: league.leagueId.startsWith('handoff_') ? "Imported Roster" : "Manual League",
                        issues: leagueIssues, unmatched: unmatched
                    });
                }
                continue;
            }

            // Both of these were network calls made here, one league at a time; they're now
            // read from the parallel prefetch above. The safety check covers the case where
            // this loop's own skip conditions and isSleeperAuditLeague's ever drift apart --
            // without it, a league the prefetch didn't cover would throw on rosters.find below.
            const rosters = rostersByLeagueId.get(league.leagueId);
            if (!rosters) continue;

            // Resolve User ID. getSleeperUser throws on a not-found/error response (the
            // original inline fetch here didn't check response.ok at all, so a bad username
            // would just produce userId===undefined, myRoster staying undefined below, and
            // this league getting silently skipped by the "if (!myRoster) continue" a few
            // lines down). The prefetch's per-username catch stores null for that case,
            // preserving the same "skip this one league, keep scanning the rest" behavior.
            // A league with no username at all was never fetched, so it reads back undefined
            // and skips here too -- previously it reached getSleeperUser(undefined), threw,
            // and hit the same continue.
            const userId = userIdByUsername.get(league.username);
            if (userId === null || userId === undefined) continue;

            const myRoster = rosters.find(r => r.owner_id === userId);
            if (!myRoster) continue;
            scannedSleeper++;

            const starters = myRoster.starters || [];
            const reserve = myRoster.reserve || [];
            // Sleeper's roster object lists taxi-squad players in their own array, but ALSO
            // leaves them in `players` alongside everyone else -- same as `reserve` -- so both
            // have to be subtracted explicitly to arrive at the actual active bench. Absent on
            // leagues with no taxi squad configured, hence the fallback.
            const taxi = myRoster.taxi || [];
            const allPlayers = myRoster.players || [];
            let leagueIssues = [];

            allPlayers.forEach(pId => {
                let p = playerMap[pId];
                if (!p) return;

                if (isAuditOut(p)) {
                    let isStarting = starters.includes(pId);
                    // A taxi player is excluded for the same reason a reserve player is: they
                    // aren't occupying an active roster spot, so there's no move to prompt.
                    // Dynasty taxi squads are also where an injured rookie is *supposed* to
                    // sit, which made this the one slot most likely to generate a standing
                    // false positive week after week.
                    let isBench = !isStarting && !reserve.includes(pId) && !taxi.includes(pId);

                    // Once a player's team has kicked off, their roster spot is frozen on
                    // essentially every platform -- they can't be benched, and they can't be
                    // stashed on IR either. Reporting them would be handing the person a to-do
                    // they're unable to complete. Checked here rather than up front so someone
                    // already correctly parked on reserve or taxi (neither starting nor active
                    // bench) never counts toward the locked-out notice.
                    if ((isStarting || isBench) && hasKickedOff({ team: p.team })) {
                        lockedOut.push({ leagueName: league.name, name: `${p.first_name} ${p.last_name}` });
                        return;
                    }

                    if (isStarting) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Starting Lineup" });
                    } else if (isBench) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Active Bench (Move to IR)" });
                    }
                }
            });

            if (leagueIssues.length > 0) {
                auditResults.push({ leagueName: league.name, format: league.formatBadge || "", issues: leagueIssues });
            }
        }

        // States what was and wasn't covered, so a Best Ball league going unreported reads as a
        // deliberate exclusion rather than the audit having quietly missed it.
        const scanParts = [];
        if (scannedSleeper > 0) scanParts.push(`${scannedSleeper} Sleeper league${scannedSleeper === 1 ? '' : 's'}`);
        if (scannedManual > 0) scanParts.push(`${scannedManual} manual league${scannedManual === 1 ? '' : 's'}`);
        let summaryLine = scanParts.length > 0 ? `Scanned ${scanParts.join(' and ')}` : `No auditable leagues found`;
        if (skippedBestBall > 0) summaryLine += ` · Skipped ${skippedBestBall} Best Ball league${skippedBestBall === 1 ? '' : 's'}`;
        const summaryHTML = `<div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:0.75rem;">${escapeHtml(summaryLine)}</div>`;

        // Rendered AFTER the results in both branches below, never before: everything in this
        // notice is a dead end the person can't act on this week, so it sits underneath the
        // roster moves they can actually go make rather than pushing them down the page.
        //
        // It names names on purpose. A bare count would leave the person wondering which player
        // it meant and re-checking the roster by hand -- the whole point of listing them is so
        // they can confirm at a glance that the IR starter they already know about is the one
        // being excluded, not some other problem going unreported.
        let lockedHTML = "";
        if (lockedOut.length > 0) {
            const one = lockedOut.length === 1;
            const namesHTML = lockedOut
                .map(l => `${escapeHtml(l.name)} <span style="opacity:0.7;">(${escapeHtml(l.leagueName)})</span>`)
                .join(', ');
            lockedHTML = `
            <div class="info-banner" style="display:flex; margin-top: 1.25rem; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color:#fcd34d;">
                <div class="cluster cluster-sm">
                    <div class="info-banner-icon" aria-hidden="true" style="background:#f59e0b; color:white;">i</div>
                    <div><strong>${lockedOut.length} injured player${one ? '' : 's'} excluded (game already started):</strong> ${namesHTML}. Most platforms lock a roster spot once that player's game kicks off, so ${one ? 'this one' : 'these'} can't be moved until next week.</div>
                </div>
            </div>`;
        }

        if (auditResults.length === 0) {
            // Wording has to shift in both of these cases -- a flat "All clear!" is a claim
            // about rosters that were actually examined, and it reads as either a
            // contradiction (directly under a notice listing injured starters) or an outright
            // false negative (when nothing was examined at all).
            const clearText = scannedSleeper + scannedManual === 0
                ? `Nothing to audit. Best Ball leagues are skipped, and no other leagues were found.`
                : (lockedOut.length > 0
                    ? `Nothing actionable. Every injured player found is already locked in for this week.`
                    : `All clear! No injured players found in active slots across your leagues.`);
            outputEl.innerHTML = summaryHTML +
                `<div class="scout-result-card" style="justify-content:center; color:var(--primary-green);">${clearText}</div>` +
                lockedHTML;
        } else {
            let html = summaryHTML;
            auditResults.forEach(res => {
                html += `<div style="font-weight:bold; color:#fca5a5; margin: 1rem 0 0.5rem 0;">${escapeHtml(res.leagueName)} <span style="color:var(--text-muted); font-size: 0.75rem; font-weight: normal;">${escapeHtml(res.format)}</span></div>`;
                if (res.unmatched > 0) {
                    const one = res.unmatched === 1;
                    html += `<div style="color:var(--text-muted); font-size:0.75rem; font-style:italic; margin-bottom:0.5rem;">${res.unmatched} player${one ? '' : 's'} could not be matched to Sleeper's player database and ${one ? 'was' : 'were'} not checked. Re-add ${one ? 'that player' : 'those players'} using their full name to include them here.</div>`;
                }
                res.issues.forEach(issue => {
                    html += `
                    <div class="scout-result-card" style="border-color: #ef4444;">
                        <div>
                            <div class="mls-item-name">${escapeHtml(issue.name)}</div>
                            <div class="mls-meta-row">
                                <span style="color: #fca5a5; font-weight: bold;">${escapeHtml(issue.status)}</span>
                            </div>
                        </div>
                        <div class="mls-text-right">
                            <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${escapeHtml(issue.location)}</span>
                        </div>
                    </div>`;
                });
            });
            outputEl.innerHTML = html + lockedHTML;
        }

    } catch (err) {
        console.error('Global injury audit failed:', err);
        // Every message says the audit didn't finish, on purpose: an empty results panel after
        // an audit reads as "all clear," which is the one conclusion a failed run must not
        // leave behind. Three realistic causes, each with its own fix:
        //   * Connection -- the forced-fresh player map (~5MB) or a league's roster fetch
        //     failed or timed out. Common on phone data; retrying is the fix.
        //   * SyntaxError -- getSleeperLeagueRosters doesn't check res.ok, so when Sleeper is
        //     down or rate-limiting, its HTML/plain-text error page gets fed to res.json() and
        //     fails here. getSleeperPlayerMap checks, and throws an isSleeperResponseError
        //     error instead (refactor 2C follow-up); same message. Not the person's
        //     connection, so telling them to check it would send them the wrong way.
        //   * Anything else -- a saved league whose data isn't shaped the way the audit
        //     expects. Re-syncing rewrites it.
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper for current injury statuses, so the audit didn't finish - no leagues were checked. Check your connection and tap Run Global Audit again.`;
        } else if (err && (err.name === 'SyntaxError' || err.isSleeperResponseError)) {
            msg = `Sleeper sent back an unexpected response, so the audit didn't finish - no leagues were checked. Sleeper may be having problems; try Run Global Audit again in a few minutes.`;
        } else {
            msg = `The audit stopped partway through, so treat this as no result, not an all-clear. Some saved league data may be out of date - tap Sync All Leagues on the Dashboard, then run the audit again.`;
        }
        outputEl.innerHTML = `<span class="mls-error-text">${msg}</span>`;
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
};

// --- MATCHUP SIMULATOR (MONTE CARLO) ---
// Bound via onclick="runMatchupSim()" on #run-sim-btn, matching this file's existing
// convention of exposing handlers on window rather than addEventListener wiring (see
// switchActiveLeague, addEarlyTeam, etc.) -- runMatchupSimulation itself (from
// monteCarloUi.js) stays a pure hand-off to the Worker with no knowledge of State, matching
// how sleeperApi.js/marketDataApi.js/rankingsParser.js are kept free of State access too.
export const runMatchupSim = async function() {
    const btn = document.getElementById('run-sim-btn');
    const league = getActiveLeague();

    // Nothing else ever clears #monte-carlo-results, so without this every path that returns
    // below leaves the PREVIOUS run's card on screen -- a win probability for a different
    // week, lineup or league, sitting there looking like the answer to what was just asked.
    // Each of those paths now writes its reason into that same container: a toast that
    // vanishes after six seconds isn't enough on its own when the thing it's explaining is a
    // stale card that stays.
    clearSimResults();

    if (!league || league.leagueId.startsWith('manual_')) {
        const msg = "Sync a Sleeper league on the Dashboard first.";
        showSimNotice(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
        return;
    }
    if (!league.rosterId) {
        const msg = "Re-sync this league from the Dashboard to enable simulations.";
        showSimNotice(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
        return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Simulating…</span>`;
    }

    try {
        const nflState = await getNflState();
        // getNflState returns null only when Sleeper answered with an error status (a network
        // failure throws instead, and lands in the connection branch of the catch below). This
        // used to throw a generic Error here, which the catch had no way to tell apart from a
        // bug -- so it's reported in place, like the other early exits in this function.
        if (!nflState || typeof nflState.week !== 'number') {
            const msg = "Sleeper didn't return the current NFL week, so the simulation didn't run. Sleeper may be having problems - try Run Matchup Simulations again in a few minutes.";
            showSimNotice(msg, { isError: true });
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }
        const currentWeek = nflState.week;
        const season = nflState.league_season || nflState.season;
        const rosterMap = league.globalRosterMap || {}; // needed by Waiver Insights below, to exclude anyone already rostered in this league

        if (currentWeek < 2) {
            const msg = "Not enough completed weeks yet to estimate variance.";
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }

        // Needed for the actual-score check below (hasKickedOff) to be trustworthy for THIS
        // specific week -- State.currentNflWeek could still be null (first load) or stale
        // (background refresh hasn't caught up) at the moment this runs, and hasKickedOff
        // silently returns false for a team it has no data for, which would just make every
        // player fall back to their projection rather than error -- safe, but defeats the
        // point of checking at all. Syncing here and awaiting the fetch (see refreshGameTimes'
        // own comment on why it's awaitable) means this Run always uses kickoff data for the
        // actual week it's simulating, not whatever the last background refresh happened to be.
        State.currentNflWeek = currentWeek;
        await refreshGameTimes();

        const matchups = await getSleeperMatchups(league.leagueId, currentWeek);
        const myEntry = matchups.find(m => m.roster_id === league.rosterId);
        if (!myEntry || !myEntry.matchup_id) {
            const msg = `No matchup found for Week ${currentWeek} (bye week?).`;
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }
        const oppEntry = matchups.find(m => m.matchup_id === myEntry.matchup_id && m.roster_id !== league.rosterId);
        if (!oppEntry) {
            const msg = "Couldn't find an opponent for this week's matchup.";
            showSimNotice(msg);
            if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
            return;
        }

        // Sleeper pads empty slots with the literal string "0" rather than omitting them.
        const sleeperMyStarters = (myEntry.starters || []).filter(id => id && id !== '0');
        const oppStarters = (oppEntry.starters || []).filter(id => id && id !== '0');

        // Simulate the lineup the person is actually looking at in this tool, not necessarily
        // what's live on Sleeper -- State.manualStartersMap is the same in-app editable lineup
        // the optimizer/swap UI already reads and writes (see renderLineupUI), so a swap made
        // here but not yet pushed to Sleeper is reflected immediately. Only the opponent's side
        // has to come from Sleeper, since there's no in-app editing of their roster.
        const localStarters = State.manualStartersMap[league.leagueId] || [];
        const localStarterIds = localStarters.filter(s => s.player).map(s => s.player.id).filter(id => id && id !== '0');
        const usingLocalLineup = localStarterIds.length > 0;
        const myStarters = usingLocalLineup ? localStarterIds : sleeperMyStarters;

        const lineupDiffersFromSleeper = usingLocalLineup &&
            (myStarters.length !== sleeperMyStarters.length || !myStarters.every(id => sleeperMyStarters.includes(id)));

        // Bench comparisons only make sense against the in-app lineup -- there's no bench
        // context at all for Sleeper's raw current-week starters (myEntry.starters is just a
        // flat list of IDs with no slot assignment), and manualBenchMap is itself an in-app-only
        // concept. localStarters carries each player's slot (e.g. "RB1", "FLEX2"), needed below
        // to figure out which bench players are even eligible to replace which starter.
        // Taxi players live in manualBenchMap alongside real bench depth (see optimizeLineup),
        // but Lineup Insights' entire output is "swap this bench player in for that starter" --
        // a move the platform won't allow for someone on taxi. Filtered here rather than in
        // isExcludedFromSimulation, which answers a different question ("is this player likely
        // to take the field"): a healthy taxi rookie would pass that check and still be an
        // illegal suggestion.
        //
        // Bench players whose game has already kicked off are dropped for the same reason:
        // Sleeper won't let you move them into the lineup anymore, so "Player Y outscored
        // Player Z" after TNF (or the early Sunday slate) is a suggestion you can't act on.
        // refreshGameTimes was awaited above, so hasKickedOff is current for this week.
        const benchPool = usingLocalLineup
            ? (State.manualBenchMap[league.leagueId] || []).filter(p => !p.isTaxi && !hasKickedOff(p))
            : [];
        const benchIds = benchPool.map(p => p.id).filter(id => id && id !== '0');

        const scoringKey = getLeagueScoringKey(league);
        const { blended: history, currentSeasonOnly } = await getPlayerWeeklyScoreHistory(
            [...myStarters, ...oppStarters, ...benchIds], season, currentWeek, scoringKey,
            { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
        );

        // Needed to show names/positions next to each player's projected range in the
        // results panel -- the pipeline up to this point only deals in Sleeper player IDs.
        const playerMap = await getSleeperPlayerMap();

        // Sleeper's own weekly projection factors in this week's specific matchup, injury
        // designation, byes, etc. -- a better center-of-distribution estimate for THIS week
        // than a flat trailing average across every week played so far. A missing/failed
        // fetch (or a player Sleeper simply doesn't bother projecting -- common for deep
        // bench/waiver-tier guys) just means projectedMean stays null and that player falls
        // back to their historical average, exactly as before.
        const projections = await getWeeklyProjections(season, currentWeek);
        const getProjectedMean = (id) => {
            const proj = projections && projections[id];
            const val = proj ? proj[scoringKey] : undefined;
            return typeof val === 'number' ? val : null;
        };

        const toPlayerObj = (id, matchupEntry) => {
            const p = playerMap[id] || {};
            const name = p.first_name ? `${p.first_name} ${p.last_name}` : (p.last_name || id);
            // years_exp is Sleeper's own experience counter (0 for a player's rookie season) --
            // more reliable than inferring "rookie" from a lack of game history, which would
            // also catch a 2nd-year player coming back from an injury-lost season.
            //
            // actualScore: this week's real, already-recorded score, once this player's game
            // has actually started -- most relevant for Thursday Night, but just as real for
            // the Sunday early slate once it's wrapped up, or checking win odds ahead of
            // Sunday/Monday night with the early games already final.
            //
            // Whether a game has started is checked directly via hasKickedOff (the same
            // kickoff-time data already powering the lineup tab's kickoff badges and FLEX
            // auto-lock), NOT by looking at whether players_points is a positive number.
            // Points alone can't tell "hasn't played" apart from "played and scored": Sleeper
            // pre-populates players_points with 0 for every starter before kickoff, but a
            // real, already-played result can ALSO legitimately be 0 or negative (e.g. DJ
            // Moore's -0.1 in a real game he exited early from injury) -- so a value-based
            // check would either treat every pre-game player as final, or wrongly discard a
            // genuine low/negative result depending on which way it's biased. Kickoff time is
            // the actual fact being asked about ("has this game happened yet"); points were
            // never the right signal for that question, just a proxy that broke on both ends.
            const actualPts = matchupEntry && matchupEntry.players_points ? matchupEntry.players_points[id] : undefined;
            const playerTeam = p.team || '';
            const actualScore = (typeof actualPts === 'number' && hasKickedOff({ team: playerTeam })) ? actualPts : null;
            return {
                id, name, pos: p.position || '', team: playerTeam, weeklyScores: history[id] || [], currentSeasonScores: currentSeasonOnly[id] || [],
                isRookie: p.years_exp === 0, projectedMean: getProjectedMean(id),
                actualScore
            };
        };

        // Players with zero completed games (rookies, recent signings, bye-adjacent
        // call-ups with no prior season either) get excluded rather than contributing a
        // phantom mean-0 score to their team's total -- see getPlayerWeeklyScoreHistory's
        // contract for why a missing week isn't the same as a 0. Doubtful/Out/IR players are
        // excluded the same way and for a related reason: every profile this pipeline builds
        // implicitly assumes its subject is taking the field, and that's exactly what those
        // three statuses mean isn't a safe assumption right now (see isExcludedFromSimulation's
        // own comment on why this list is stricter than the lineup optimizer's). Applied here,
        // in the one place all three roster arrays (team1, team2, and the bench pool used for
        // Lineup Insights) are built, rather than only on team1/team2, so a Doubtful/Out/IR
        // bench player can't be suggested as a "swap in" pick either.
        let excludedCount = 0;
        let injuryExcludedCount = 0;
        const toPlayerObjs = (ids, matchupEntry) => ids.reduce((arr, id) => {
            const rawPlayer = playerMap[id] || {};
            if (isExcludedFromSimulation(rawPlayer)) { injuryExcludedCount++; return arr; }
            const playerObj = toPlayerObj(id, matchupEntry);
            if (playerObj.weeklyScores.length > 0) arr.push(playerObj); else excludedCount++;
            return arr;
        }, []);

        const team1Players = toPlayerObjs(myStarters, myEntry);
        const team2Players = toPlayerObjs(oppStarters, oppEntry);

        if (typeof window.showToast === 'function') {
            const exclusionNotes = [];
            if (excludedCount > 0) exclusionNotes.push(`${excludedCount} without enough game history yet`);
            if (injuryExcludedCount > 0) exclusionNotes.push(`${injuryExcludedCount} listed as Doubtful, Out, or IR`);
            if (exclusionNotes.length > 0) {
                window.showToast(`${exclusionNotes.join(' and ')} excluded from the simulation.`);
            }
        }

        // "Bench Player Y outscored Starting Player Z X% of the time" -- for each bench
        // player with enough history, find the starters slotAcceptsPos actually allows them
        // to replace (same eligibility the swap UI itself enforces, see slotAcceptsPos's own
        // comment), then compare against the weakest of those -- the one an actual lineup
        // swap would target -- rather than every eligible starter, which would just restate
        // the obvious for anyone but the weakest link. starterSlotTypes/team1ProfilesById are
        // computed once here (rather than nested inside the bench-only block below) since
        // Waiver Insights, right after, needs the exact same "which starter would this
        // replace" eligibility and profile lookup, just sourced from a different candidate
        // pool.
        const starterSlotTypes = localStarters
            .filter(s => s.player)
            .map(s => ({ id: s.player.id, slotType: s.slot.replace(/[0-9]/g, '') }));

        const team1ProfilesById = {};
        team1Players.forEach(p => { team1ProfilesById[p.id] = getPlayerVarianceProfile(p.weeklyScores, { projectedMean: p.projectedMean, actualScore: p.actualScore }); });

        // Given a candidate's own variance profile and position, finds the weakest eligible
        // starter they could replace and returns the win probability against that starter --
        // shared by both Lineup Insights (bench) and Waiver Insights (free agents) below,
        // since the eligibility rule and "compare against the weakest link" logic is identical
        // either way; only where the candidate came from differs.
        //
        // Starters whose game has already kicked off are never the target, for the mirror-
        // image reason bench players who already played are left out of benchPool above:
        // their slot is locked in Sleeper, so they can't be swapped out. Without this, a TNF
        // starter's final (a fixed, zero-variance number) could be flagged as the weakest link
        // and "lose" to a bench player you have no way to put in his place.
        const lockedStarterIds = new Set(team1Players.filter(p => hasKickedOff({ team: p.team })).map(p => p.id));
        const compareAgainstWeakestStarter = (candidateProfile, candidatePos) => {
            const eligibleStarterIds = starterSlotTypes
                .filter(s => slotAcceptsPos(s.slotType, candidatePos))
                .map(s => s.id)
                .filter(id => !lockedStarterIds.has(id))
                .filter(id => team1ProfilesById[id]); // must have a valid profile too
            if (eligibleStarterIds.length === 0) return null;

            const weakestStarterId = eligibleStarterIds.reduce((weakestId, id) =>
                team1ProfilesById[id].mean < team1ProfilesById[weakestId].mean ? id : weakestId
            );
            const weakestStarter = team1Players.find(p => p.id === weakestStarterId);
            const winPct = getProbabilityBeats(candidateProfile, team1ProfilesById[weakestStarterId]);
            return { weakestStarter, winPct };
        };

        const benchInsights = [];
        if (benchPool.length > 0) {
            const benchObjs = toPlayerObjs(benchIds, myEntry);

            benchObjs.forEach(benchPlayer => {
                const benchProfile = getPlayerVarianceProfile(benchPlayer.weeklyScores, { projectedMean: benchPlayer.projectedMean, actualScore: benchPlayer.actualScore });
                const result = compareAgainstWeakestStarter(benchProfile, benchPlayer.pos);
                if (!result) return;

                // Only worth flagging if the bench player is actually favored -- anything at
                // or below 50% just confirms the current starter is the right call, which
                // isn't an actionable "you should consider this swap" insight.
                if (result.winPct <= 50) return;

                benchInsights.push({
                    benchName: benchPlayer.name, benchPos: benchPlayer.pos, benchIsRookie: benchPlayer.isRookie,
                    starterName: result.weakestStarter.name, starterPos: result.weakestStarter.pos, starterIsRookie: result.weakestStarter.isRookie,
                    benchWinPct: result.winPct
                });
            });

            benchInsights.sort((a, b) => b.benchWinPct - a.benchWinPct);
            benchInsights.splice(5); // top 5 by margin -- the rest would just be noise
        }

        // --- WAIVER INSIGHTS ---
        // Same comparison as Lineup Insights above, pointed at available free agents instead
        // of your bench. Off by default (see the toggle in the Matchup Simulator card) since
        // it costs an extra round trip this function wouldn't otherwise make: free-agent
        // candidates come from a rankings file (a name and a rank -- no Sleeper id, no weekly
        // score history), so getting them into the same win-probability math as everyone else
        // here means resolving each one's Sleeper id and fetching their history separately,
        // rather than reusing the one batched history fetch already done above for your
        // roster and your opponent's.
        const waiverInsights = [];
        // What the waiver check actually did, so the results card can tell "nobody out there
        // beats your starters" apart from "the check never ran" -- an empty waiverInsights
        // list alone reads identically either way, which left people unsure whether the
        // toggle had done anything at all. Stays null while the toggle is off (nothing to
        // report). checkedCount counts only free agents that made it all the way through the
        // comparison (resolved to a Sleeper id, had score history, had an eligible starter
        // to measure against), so "checked N" never overstates the work.
        let waiverInsightsStatus = null;
        if (State.simSettings.waiverInsights) {
            // startersAllStarted / kickedOffCount let the empty-result message name the real
            // reason nothing was compared, now that already-started starters and free agents
            // are left out (see lockedStarterIds above and the candidates filter below).
            waiverInsightsStatus = {
                checkedCount: 0, positions: [], noRankings: false, failed: false,
                startersAllStarted: team1Players.length > 0 && team1Players.every(p => lockedStarterIds.has(p.id)),
                kickedOffCount: 0
            };
            const checkedPositions = new Set();
            try {
                if (State.rosRankings.length === 0 && State.marketRankings.length === 0) {
                    waiverInsightsStatus.noRankings = true;
                }
                const nameToIdIndex = await getCleanNameToIdIndex();
                const candidates = getTopWaiverCandidatesByPosition(rosterMap, 3)
                    .map(c => ({ ...c, id: nameToIdIndex[c.cleanName] }))
                    .filter(c => c.id && !isExcludedFromSimulation(playerMap[c.id]))
                    // A free agent whose game has kicked off is locked on Sleeper until next
                    // week -- same "can't act on it" reasoning as the bench filter above.
                    .filter(c => {
                        if (!hasKickedOff({ team: (playerMap[c.id] || {}).team })) return true;
                        waiverInsightsStatus.kickedOffCount++;
                        return false;
                    });

                if (candidates.length > 0) {
                    const candidateIds = candidates.map(c => c.id);
                    const { blended: waiverHistory } = await getPlayerWeeklyScoreHistory(
                        candidateIds, season, currentWeek, scoringKey, { minGamesBeforeSupplementing: MIN_RELIABLE_GAMES }
                    );

                    candidates.forEach(c => {
                        const weeklyScores = waiverHistory[c.id] || [];
                        if (weeklyScores.length === 0) return; // same "not enough history" bar as everyone else

                        const rawPlayer = playerMap[c.id] || {};
                        const faPos = rawPlayer.position || c.pos;
                        const profile = getPlayerVarianceProfile(weeklyScores, { projectedMean: getProjectedMean(c.id) });
                        const result = compareAgainstWeakestStarter(profile, faPos);
                        if (!result) return;

                        waiverInsightsStatus.checkedCount++;
                        checkedPositions.add(faPos);
                        if (result.winPct <= 50) return;

                        waiverInsights.push({
                            faName: c.name, faPos,
                            starterName: result.weakestStarter.name, starterPos: result.weakestStarter.pos, starterIsRookie: result.weakestStarter.isRookie,
                            faWinPct: result.winPct
                        });
                    });

                    waiverInsights.sort((a, b) => b.faWinPct - a.faWinPct);
                    waiverInsights.splice(5);
                }
            } catch (err) {
                // Waiver Insights is a bonus layer on top of the main simulation -- a failure
                // here (a rankings/market fetch hiccup, an unresolvable name) shouldn't take
                // down the matchup simulation itself. The results card still says the check
                // didn't finish, rather than letting silence read as "no upgrades found".
                console.error('Waiver Insights failed:', err);
                waiverInsightsStatus.failed = true;
            }
            const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
            waiverInsightsStatus.positions = [...checkedPositions].sort((a, b) =>
                (POS_ORDER.indexOf(a) + 1 || 99) - (POS_ORDER.indexOf(b) + 1 || 99));
        }

        runMatchupSimulation(team1Players, team2Players, { lineupDiffersFromSleeper, benchInsights, waiverInsights, waiverInsightsStatus, currentWeek });
    } catch (err) {
        console.error('Matchup simulation failed:', err);
        // Same three-way split as runGlobalInjuryAudit's catch, for the same reasons:
        //   * Connection -- any of the Sleeper calls above (matchups, weekly stats, the ~5MB
        //     player map) failed or timed out. Retrying is the fix.
        //   * SyntaxError / isSleeperResponseError -- a Sleeper outage or rate-limit page:
        //     getSleeperPlayerMap throws the latter for a non-ok or malformed response (refactor
        //     2C follow-up); other calls fail in res.json(). Sleeper's side, not the connection.
        //   * Anything else -- most likely the saved lineup/roster for this league isn't in
        //     the shape this function expects (a non-ok matchups response lands here too,
        //     which in practice means the stored league ID is stale). Re-syncing rewrites both.
        // Worker failures never reach this catch -- runMatchupSimulation reports those itself.
        // Escaped because both showSimNotice and showToast write their message as HTML.
        const leagueName = escapeHtml(league.name || 'this league');
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper, so the simulation for ${leagueName} didn't run. Check your connection and tap Run Matchup Simulations again.`;
        } else if (err && (err.name === 'SyntaxError' || err.isSleeperResponseError)) {
            msg = `Sleeper sent back an unexpected response, so the simulation for ${leagueName} didn't run. Sleeper may be having problems - try again in a few minutes.`;
        } else {
            msg = `Couldn't run the simulation for ${leagueName} - its saved lineup or roster data may be out of date. Tap Sync All Leagues on the Dashboard, then run it again.`;
        }
        showSimNotice(msg, { isError: true });
        if (typeof window.showToast === 'function') window.showToast(msg, { isError: true });
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
};

    // loadSheetJS used to be defined here. mds.js needed the same lazy-load with the same
    // failure path (it had its own copy with no error handling at all), so it now lives in
    // js/utils.js as window.loadSheetJS alongside loadScriptOnce. The call sites above use it
    // directly; the (callback, onError) signature rankingsParser.js documents is unchanged.
