// --- FAAB HISTORY, FOR A SUGGESTED BID (improvements S35) ---
// Each FAAB league's winning claims this season (weeks 1 to now), for scout/faab.js. Sleeper's transactions are about
// 10 KB per league-week in the owner's leagues (1.6 MB for 15 FAAB leagues over 10 weeks), so:
//   - weeks that are over (two or more back) are kept in IndexedDB, as just the winning bids (a few hundred bytes a
//     week): they don't change, and a later visit reads only the recent weeks;
//   - this week's and last week's come from the drops fetch (scout/recentDrops.js), which already reads them;
//   - a few requests at a time, cached for the visit.
// On an error that league gets null: no bid, no toast (a hint, like the waiver chips).
import { normalizeName } from '../../shared/names.js';
import { getSleeperPlayerMap, getSleeperTransactions } from '../../shared/api/sleeper.js';
import { cacheData, getCachedData } from '../../shared/storage/idb.js';
import { recentDropsFor, recentTransactionList } from './recentDrops.js';
import { faabLeftFrom, suggestBid, winningBids } from './faab.js';

const PARALLEL = 6; // requests at once, across leagues
const cache = new Map(); // leagueId -> { key, promise }
const loaded = new Map(); // leagueId -> bids | null, once read

// A Sleeper league with FAAB waivers and a budget (S34's waiver settings).
export const isFaabLeague = (l) => !!(l && l.waivers && l.waivers.type === 'faab' && l.waivers.budget > 0
    && l.leagueId && !String(l.leagueId).startsWith('manual_'));

// The IndexedDB entry for a finished week's winning bids (the LineupStrategistDB cache, js/shared/storage/idb.js).
export const faabWeekCacheKey = (leagueId, week) => `faab_bids_${leagueId}_${week}`;

let active = 0;
const waiting = [];
function limited(fn) {
    return new Promise((resolve, reject) => {
        const run = () => {
            active++;
            Promise.resolve().then(fn).then(resolve, reject).finally(() => {
                active--;
                if (waiting.length) waiting.shift()();
            });
        };
        if (active < PARALLEL) run(); else waiting.push(run);
    });
}

async function weekBids(league, w, week) {
    const key = faabWeekCacheKey(league.leagueId, w);
    const settled = w <= week - 2;
    if (settled) {
        try {
            const hit = await getCachedData(key);
            if (Array.isArray(hit)) return hit;
        } catch (e) { /* no IndexedDB (private window): read it from Sleeper */ }
    }
    let list = recentTransactionList(league.leagueId, w);
    if (list === undefined) list = await limited(() => getSleeperTransactions(league.leagueId, w));
    const bids = winningBids([list]).map(b => ({ p: b.playerId, b: b.bid }));
    if (settled) cacheData(key, bids).catch(() => {});
    return bids;
}

async function load(league, week) {
    try {
        await recentDropsFor([league], week); // this week's and last week's lists, read once for the visit
        const weeks = Array.from({ length: week }, (_, i) => i + 1);
        const [perWeek, map] = await Promise.all([Promise.all(weeks.map(w => weekBids(league, w, week))), getSleeperPlayerMap()]);
        const bids = [];
        perWeek.flat().forEach(({ p, b }) => {
            const pl = map && map[p];
            if (!pl) return;
            const name = pl.position === 'DEF' ? null : (pl.first_name ? normalizeName(`${pl.first_name} ${pl.last_name}`) : null);
            bids.push({ cleanName: name, pos: pl.position || null, bid: b });
        });
        return bids;
    } catch (e) {
        console.warn(`Couldn't read ${league.name || league.leagueId}'s FAAB history; no suggested bids there.`, e);
        return null;
    }
}

// { leagueId: bids | null } for these leagues' FAAB history, this week. Non-FAAB leagues are left out.
export async function faabBidsFor(leagues, week) {
    const w = Number(week);
    const out = {};
    if (!(w >= 1)) return out;
    const faab = (leagues || []).filter(isFaabLeague);
    faab.forEach(l => {
        const key = `${w}:${l.lastSyncedAt || ''}`;
        const hit = cache.get(l.leagueId);
        if (hit && hit.key === key) return;
        const promise = load(l, w).then(bids => { loaded.set(l.leagueId, bids); return bids; });
        cache.set(l.leagueId, { key, promise });
    });
    for (const l of faab) out[l.leagueId] = await cache.get(l.leagueId).promise;
    return out;
}

// The history if it's loaded (undefined until then; null when it failed).
export const faabBidsLoaded = (leagueId) => loaded.get(leagueId);

// The suggestion for one player in a league, from the loaded history; null when there's none to give (not FAAB, the
// history isn't loaded or failed, no budgets). posRankOf: today's position rank by clean name, from the caller's
// rankings. need: 'empty' | 'starts' | 'bench' | null; over: whom he'd replace (a name).
export function suggestBidFor(league, { pos, posRank, need, over = null }, posRankOf, week) {
    if (!isFaabLeague(league)) return null;
    const history = loaded.get(league.leagueId);
    if (!history) return null;
    const budget = league.waivers.budget;
    const left = league.faabLeft || null;
    const bids = history.map(b => ({ pos: b.pos, posRank: b.cleanName && posRankOf ? posRankOf(b.cleanName) : null, bid: b.bid }));
    return suggestBid({
        pos, posRank, budget, left, myRosterId: league.rosterId, bids,
        kind: league.leagueType || 'redraft', week: Number(week) || null, lastWeek: league.lastWeek || 17,
        need, over, minBid: league.waivers.minBid || 0
    });
}

export { faabLeftFrom };
