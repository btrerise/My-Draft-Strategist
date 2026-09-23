// sleeperService.js
import { getCachedData, cacheData } from './db.js';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

/**
 * Fetches one week's stats for every NFL player: { player_id: { pts_ppr, pts_half_ppr,
 * pts_std, ... } }. This is Sleeper's per-week endpoint -- unlike the season-level
 * `/stats/nfl/regular/{season}` endpoint (which returns season *totals*, not a week-by-week
 * breakdown), this is what a variance calculation actually needs one call of per week.
 * Completed weeks never change once posted, so they're cached indefinitely per week.
 */
async function getWeekStats(season, week) {
    const cacheKey = `stats_${season}_w${week}`;

    // The IndexedDB cache is best-effort in both directions. A read failure (storage blocked,
    // private browsing, a connection closed mid-upgrade -- see db.js) is treated as a cache
    // miss rather than thrown: this read used to sit outside the try below, so a broken cache
    // took down the whole matchup simulation even though the stats themselves were reachable.
    let cached = null;
    try {
        cached = await getCachedData(cacheKey);
    } catch (e) {
        console.warn('Week stats cache unavailable, fetching from Sleeper instead:', e);
    }
    if (cached) return cached;

    try {
        const response = await window.mdsFetch(`${SLEEPER_BASE_URL}/stats/nfl/regular/${season}/${week}`);
        if (!response.ok) throw new Error(`Failed to fetch week ${week} stats`);

        const data = await response.json();
        // Same on the write side: a failed cache write (quota, storage blocked) used to land in
        // the catch below and return null, throwing away stats that had downloaded fine.
        cacheData(cacheKey, data).catch(e => console.warn('Could not cache week stats:', e));
        return data;
    } catch (error) {
        console.error('Sleeper API Error:', error);
        return null;
    }
}

// A completed prior NFL regular season runs 18 weeks (17 games + 1 bye per team since the
// 2021 schedule expansion). Used as the upper bound when pulling supplemental history from
// last season -- some of those weeks won't exist for a given player (bye weeks, IR stints),
// which getWeekStats/the loop below already handle by simply not finding an entry.
const REGULAR_SEASON_WEEKS = 18;

/**
 * Builds { [playerId]: [score, score, ...] } for the given ids across weeks
 * [startWeek, endWeek] (inclusive) of one season. Shared by both the current-season and
 * prior-season lookups below -- the only thing that differs between them is which season and
 * week range gets passed in.
 */
async function buildScoreHistory(playerIds, season, startWeek, endWeek, scoringKey) {
    const history = {};
    playerIds.forEach(id => { history[id] = []; });
    if (endWeek < startWeek) return history;

    const weekNumbers = [];
    for (let w = startWeek; w <= endWeek; w++) weekNumbers.push(w);

    const weeksStats = await Promise.all(weekNumbers.map(w => getWeekStats(season, w)));

    weeksStats.forEach(weekData => {
        if (!weekData) return; // that week's fetch failed -- skip it, don't break the rest
        playerIds.forEach(id => {
            const playerWeek = weekData[id];
            const score = playerWeek ? playerWeek[scoringKey] : undefined;
            if (typeof score === 'number') history[id].push(score);
        });
    });

    return history;
}

/**
 * Builds two views of a player's weekly scores: `currentSeasonOnly` (weeks 1 through
 * throughWeek - 1 of the current season -- i.e. every completed week so far, with the
 * in-progress week excluded since its score isn't final yet) and `blended` (the same, plus
 * last season's scores appended for anyone whose current-season sample is still short).
 *
 * Both views are returned, rather than just the merged one, because callers don't all want
 * the same trade-off: the Monte Carlo mean/stdDev is fine leaning on blended data (some
 * historical basis beats none for a stable estimate), but Boom/Bust specifically needs to
 * know which games actually happened THIS season -- see statsEngine.js's tiered
 * getBoomBustRates, which prefers currentSeasonOnly once the season has matured enough that
 * last year's role isn't the best available signal for a player's role today.
 *
 * @param {Array<string>} playerIds
 * @param {string|number} season
 * @param {number} throughWeek - the current NFL week; current-season history is built up to
 *   (not including) this
 * @param {'pts_ppr'|'pts_half_ppr'|'pts_std'} scoringKey - which of Sleeper's three scoring
 *   totals to read per player, matched to the league's actual scoring format rather than
 *   assumed to be PPR
 * @param {Object} [options]
 * @param {number} [options.minGamesBeforeSupplementing=3] - a player's current-season sample
 *   must be at least this long before prior-season data is skipped for them; matches
 *   statsEngine.js's own reliability threshold so a player isn't measured as "reliable" here
 *   but then flagged as a fallback estimate there, or vice versa.
 * @returns {Promise<{blended: Object, currentSeasonOnly: Object}>} a week is silently skipped
 *   for a player if they have no entry that week (bye, DNP, not yet in the league, etc.)
 *   rather than counted as a 0 -- a 0 would understate that player's real variance/mean.
 */
export async function getPlayerWeeklyScoreHistory(playerIds, season, throughWeek, scoringKey = 'pts_ppr', options = {}) {
    const { minGamesBeforeSupplementing = 3 } = options;

    const currentSeasonOnly = await buildScoreHistory(playerIds, season, 1, throughWeek - 1, scoringKey);

    // blended starts as a copy of currentSeasonOnly's arrays -- supplementation below appends
    // to these copies, never the originals, so currentSeasonOnly stays an untouched record of
    // "what actually happened this year" even for players who get supplemented.
    const blended = {};
    playerIds.forEach(id => { blended[id] = [...currentSeasonOnly[id]]; });

    const needsSupplement = playerIds.filter(id => currentSeasonOnly[id].length < minGamesBeforeSupplementing);
    if (needsSupplement.length > 0) {
        const priorSeason = String(Number(season) - 1);
        const priorSeasonHistory = await buildScoreHistory(needsSupplement, priorSeason, 1, REGULAR_SEASON_WEEKS, scoringKey);
        needsSupplement.forEach(id => {
            blended[id] = [...blended[id], ...priorSeasonHistory[id]];
        });
    }

    return { blended, currentSeasonOnly };
}

/**
 * Fetches current week projections to serve as the baseline for the Monte Carlo simulations.
 * Deliberately NOT cached like getWeekStats -- a completed week's stats are immutable once
 * posted, but a projection is live data that Sleeper updates through the week as inactives,
 * injury designations, and depth-chart news come in. Caching it the same way would mean a
 * projection fetched Tuesday morning never refreshing by kickoff.
 */
export async function getWeeklyProjections(season = '2026', week) {
    try {
        const response = await window.mdsFetch(`${SLEEPER_BASE_URL}/projections/nfl/regular/${season}/${week}`);
        if (!response.ok) throw new Error('Failed to fetch weekly projections');
        return await response.json();
    } catch (error) {
        console.error('Sleeper API Error:', error);
        return null;
    }
}