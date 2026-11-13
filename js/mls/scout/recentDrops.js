// --- RECENT DROPS, FOR WAIVERS OR FREE AGENT (improvements S34) ---
// Who each Sleeper league dropped lately, so waiverStatus (scout/waiverStatus.js) can tell a player still on waivers
// from a free agent. Only Sleeper leagues with waiver settings, only this NFL week's and last week's transactions
// (the longest clear in the owner's leagues is 2 days), a few leagues at a time, cached for the visit. A league
// re-read after a sync, since its drops may have changed. On an error that league gets null: no chips there, and no
// toast (the chips are a hint; the rest of the card works without them).
import { normalizeName } from '../../shared/names.js';
import { getSleeperPlayerMap, getSleeperTransactions } from '../../shared/api/sleeper.js';

const PARALLEL = 4; // leagues fetched at once (two requests each)
const cache = new Map(); // leagueId -> { key, promise }

// { cleanName: dropped at (ms) } from Sleeper transactions: the latest completed drop of each player.
export function dropsFromTransactions(lists, playerMap) {
    const drops = {};
    (lists || []).flat().forEach(tx => {
        if (!tx || tx.status !== 'complete' || !tx.drops) return;
        const at = Number(tx.status_updated || tx.created) || 0;
        Object.keys(tx.drops).forEach(pid => {
            const p = playerMap && playerMap[pid];
            const clean = p && p.first_name ? normalizeName(`${p.first_name} ${p.last_name}`) : null;
            if (clean && (!drops[clean] || drops[clean] < at)) drops[clean] = at;
        });
    });
    return drops;
}

const eligible = (league) => !!(league && league.waivers && league.leagueId && !String(league.leagueId).startsWith('manual_'));

function load(league, week) {
    const weeks = [week, week - 1].filter(w => w >= 1);
    return Promise.all([Promise.all(weeks.map(w => getSleeperTransactions(league.leagueId, w))), getSleeperPlayerMap()])
        .then(([lists, map]) => dropsFromTransactions(lists, map))
        .catch(e => {
            console.warn(`Couldn't read ${league.name || league.leagueId}'s transactions; no waiver chips there.`, e);
            return null;
        });
}

// { leagueId: drops | null } for these leagues, this week. Leagues without waiver settings are left out.
export async function recentDropsFor(leagues, week) {
    const w = Number(week);
    const out = {};
    if (!(w >= 1)) return out;
    const todo = [];
    (leagues || []).filter(eligible).forEach(l => {
        const key = `${w}:${l.lastSyncedAt || ''}`;
        const hit = cache.get(l.leagueId);
        if (hit && hit.key === key) return;
        // The promise exists at once (a second caller waits on it); the request starts when a slot is free.
        let start;
        const promise = new Promise(resolve => { start = () => load(l, w).then(resolve); });
        cache.set(l.leagueId, { key, promise });
        todo.push(start);
    });
    let next = 0;
    const worker = async () => { while (next < todo.length) await todo[next++](); };
    Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
    for (const l of (leagues || []).filter(eligible)) out[l.leagueId] = await cache.get(l.leagueId).promise;
    return out;
}
