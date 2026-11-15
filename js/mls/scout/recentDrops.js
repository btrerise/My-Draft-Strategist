// --- RECENT DROPS, FOR WAIVERS OR FREE AGENT (improvements S34) ---
// Who each Sleeper league dropped lately, so waiverStatus (scout/waiverStatus.js) can tell a player still on waivers
// from a free agent. Only Sleeper leagues with waiver settings, only this NFL week's and last week's transactions
// (the longest clear in the owner's leagues is 2 days), a few leagues at a time, cached for the visit. A league
// re-read after a sync, since its drops may have changed. On an error that league gets null: no chips there, and no
// toast (the chips are a hint; the rest of the card works without them).
import { normalizeName } from '../../shared/names.js';
import { getSleeperPlayerMap, getSleeperTransactions } from '../../shared/api/sleeper.js';

const PARALLEL = 8; // leagues fetched at once (two requests each; round 5: 4 made 20 leagues take 1 to 3 s)
const cache = new Map(); // leagueId -> { key, promise }
// The raw transaction lists read for drops, { leagueId: { week: list } }, so the FAAB history (scout/faabHistory.js,
// improvements S35) reuses this week's and last week's instead of asking Sleeper again.
const rawLists = new Map();

// This visit's transactions for a league's week, if the drops fetch read them (else undefined).
export function recentTransactionList(leagueId, week) {
    const byWeek = rawLists.get(leagueId);
    return byWeek ? byWeek[week] : undefined;
}

// { cleanName: dropped at (ms) } from Sleeper transactions: the latest completed drop of each player. A guillotine
// league's cut (type 'chopped', round 6) is { at, chopped: true }: those players clear at the next weekly run, whatever
// the league's clear days (Chop Shop: 2-day clears, cuts on Monday 9:45 PM PT claimed at Wednesday's 12:11 AM run).
export function dropsFromTransactions(lists, playerMap) {
    const drops = {};
    (lists || []).flat().forEach(tx => {
        if (!tx || tx.status !== 'complete' || !tx.drops) return;
        const at = Number(tx.status_updated || tx.created) || 0;
        Object.keys(tx.drops).forEach(pid => {
            const p = playerMap && playerMap[pid];
            const clean = p && p.first_name ? normalizeName(`${p.first_name} ${p.last_name}`) : null;
            const prev = drops[clean] == null ? null : (typeof drops[clean] === 'object' ? drops[clean].at : drops[clean]);
            if (clean && (prev == null || prev < at)) drops[clean] = tx.type === 'chopped' ? { at, chopped: true } : at;
        });
    });
    return drops;
}

const eligible = (league) => !!(league && league.waivers && league.leagueId && !String(league.leagueId).startsWith('manual_'));

function load(league, week) {
    const weeks = [week, week - 1].filter(w => w >= 1);
    return Promise.all([Promise.all(weeks.map(w => getSleeperTransactions(league.leagueId, w))), getSleeperPlayerMap()])
        .then(([lists, map]) => {
            const byWeek = {};
            weeks.forEach((w, i) => { byWeek[w] = lists[i]; });
            rawLists.set(league.leagueId, byWeek);
            return dropsFromTransactions(lists, map);
        })
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
