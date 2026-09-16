// sleeperService.js
import { getCachedData, cacheData } from './db.js';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

/**
 * Fetches historical game logs/stats for variance calculation.
 */
export async function getHistoricalStats(season = '2025') {
    const cacheKey = `stats_${season}`;
    
    // 1. Check IndexedDB
    const cachedStats = await getCachedData(cacheKey);
    if (cachedStats) {
        console.log(`Loaded ${season} stats from cache.`);
        return cachedStats;
    }

    // 2. Fetch if not cached
    try {
        const response = await fetch(`${SLEEPER_BASE_URL}/stats/nfl/regular/${season}`);
        if (!response.ok) throw new Error('Failed to fetch historical stats');
        
        const data = await response.json();
        
        // 3. Store in IndexedDB
        await cacheData(cacheKey, data);
        return data;
    } catch (error) {
        console.error('Sleeper API Error:', error);
        return null;
    }
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