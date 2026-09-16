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

    const cached = await getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch(`${SLEEPER_BASE_URL}/stats/nfl/regular/${season}/${week}`);
        if (!response.ok) throw new Error(`Failed to fetch week ${week} stats`);

        const data = await response.json();
        await cacheData(cacheKey, data);
        return data;
    } catch (error) {
        console.error('Sleeper API Error:', error);
        return null;
    }
}

/**
 * Builds { [playerId]: [week1Score, week2Score, ...] } for every id in playerIds, covering
 * weeks 1 through (throughWeek - 1) -- i.e. every completed week of the season so far. The
 * current/in-progress week is deliberately excluded since its score isn't final yet.
 *
 * @param {Array<string>} playerIds
 * @param {string|number} season
 * @param {number} throughWeek - the current NFL week; history is built up to (not including) this
 * @param {'pts_ppr'|'pts_half_ppr'|'pts_std'} scoringKey - which of Sleeper's three scoring
 *   totals to read per player, matched to the league's actual scoring format rather than
 *   assumed to be PPR
 * @returns {Promise<Object>} a week is silently skipped for a player if they have no entry
 *   that week (bye, DNP, not yet in the league, etc.) rather than counted as a 0 -- a 0 would
 *   understate that player's real variance/mean.
 */
export async function getPlayerWeeklyScoreHistory(playerIds, season, throughWeek, scoringKey = 'pts_ppr') {
    const history = {};
    playerIds.forEach(id => { history[id] = []; });

    const weekNumbers = [];
    for (let w = 1; w < throughWeek; w++) weekNumbers.push(w);

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
 * Fetches current week projections to serve as the baseline for the Monte Carlo simulations.
 */
export async function getWeeklyProjections(season = '2026', week) {
    const cacheKey = `projections_${season}_w${week}`;
    
    const cachedProjections = await getCachedData(cacheKey);
    if (cachedProjections) {
        console.log(`Loaded Week ${week} projections from cache.`);
        return cachedProjections;
    }

    try {
        const response = await fetch(`${SLEEPER_BASE_URL}/projections/nfl/regular/${season}/${week}`);
        if (!response.ok) throw new Error('Failed to fetch weekly projections');
        
        const data = await response.json();
        await cacheData(cacheKey, data);
        return data;
    } catch (error) {
        console.error('Sleeper API Error:', error);
        return null;
    }
}