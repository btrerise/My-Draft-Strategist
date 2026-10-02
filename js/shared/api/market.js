// --- MARKET CONSENSUS DATA (FANTASYCALC / LEAGUELOGS) API CLIENT (ES MODULE) ---
// Third module pulled out of mls.js's single IIFE (see rankingsParser.js and sleeperApi.js
// for the first two). This was already written as a pure, self-contained function before
// this split -- "no DOM access, no state writes" was true in mls.js already -- so moving it
// here didn't require any restructuring, just relocating it and wiring up its one real
// dependency (getSleeperPlayerMap, needed for LeagueLogs' player-ID lookups) as an import
// from sleeperApi.js instead of a same-file function call.
import { getSleeperPlayerMap } from './sleeper.js';
import { normalizeName } from '../names.js';

// normalizeName is imported from js/shared/names.js above. window.mdsFetch, used for both API
// calls below, is assigned by js/shared/globals.js (from js/shared/net.js) before any app module
// runs -- it's fetch() with a timeout, so neither FantasyCalc nor LeagueLogs going quiet can
// leave the Market Value button spinning forever.

/**
 * Fetches one LeagueLogs market profile (e.g. "redraft-1qb-12t-ppr1") and returns its raw rows:
 * [{ sleeperPlayerId, overallRank, ... }], unfiltered and in LeagueLogs' order. Throws
 * "<errorPrefix>: <status>" on a non-ok response.
 *
 * Split out of fetchMarketConsensusData in refactor chunk 2C so Draft Strategist's Quick-Start
 * and ADP sync share it. Those need the Sleeper ID of every row (fetchMarketConsensusData drops
 * it, and drops rows missing from the Sleeper map) and pass profile keys the MLS settings can't
 * build (half-PPR). errorPrefix keeps each caller's existing toast wording.
 */
export async function fetchLeagueLogsMarket(profileKey, { errorPrefix = 'Market Error' } = {}) {
    const marketRes = await window.mdsFetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
    if (!marketRes.ok) throw new Error(`${errorPrefix}: ${marketRes.status}`);
    const llMarket = await marketRes.json();
    return llMarket.data;
}

/**
 * Fetches and normalizes market-consensus player values from either FantasyCalc or
 * LeagueLogs. Pure data in/out -- callers handle their own UI and State updates.
 *
 * @param {string} source - 'fantasycalc' or 'leaguelogs'
 * @param {string} isDynastyVal - 'dynasty' or 'redraft'
 * @param {string} numQbsVal - '1' or '2' (superflex)
 * @param {string} ppr - PPR value passed straight through to FantasyCalc's API
 * @param {string} isTEP - 'true'/'false', passed straight through to FantasyCalc's API
 * @param {number} teamCount - league size, passed straight through to FantasyCalc's API
 * @returns {Promise<{parsed: Array, formatText: string}>}
 */
export async function fetchMarketConsensusData(source, isDynastyVal, numQbsVal, ppr, isTEP, teamCount) {
    let parsed = [];
    let formatText = "";
    const isDynastyBool = isDynastyVal === 'dynasty';

    // --- 1. FANTASYCALC ---
    if (source === 'fantasycalc') {
        const fcRes = await window.mdsFetch(`https://api.fantasycalc.com/values/current?isDynasty=${isDynastyBool}&numQbs=${numQbsVal}&numTeams=${teamCount}&ppr=${ppr}&isTEP=${isTEP}`);
        if (!fcRes.ok) throw new Error(`FantasyCalc API Error: ${fcRes.status}`);
        const fcData = await fcRes.json();

        fcData.forEach(item => {
            if (item.player && item.player.name) {
                let fullName = item.player.name;
                let rankVal = parseFloat(item.overallRank);

                if (!isNaN(rankVal)) {
                    parsed.push({
                        name: fullName,
                        cleanName: normalizeName(fullName),
                        marketVal: rankVal,
                        pos: item.player.position || ""
                    });
                }
            }
        });
        formatText = `${isDynastyVal.toUpperCase()} (${numQbsVal === '2' ? 'Superflex' : '1QB'}, PPR: ${ppr})`;
    }

    // --- 2. LEAGUELOGS ---
    else if (source === 'leaguelogs') {
        let pprKey = "ppr1";
        let qbKey = numQbsVal === '2' ? '2qb' : '1qb';
        let typeKey = isDynastyVal;
        let profileKey = `${typeKey}-${qbKey}-12t-${pprKey}`;

        formatText = `${typeKey.toUpperCase()} - ${qbKey.toUpperCase()} (PPR)`;

        let sleeperMap = await getSleeperPlayerMap();

        const llMarketData = await fetchLeagueLogsMarket(profileKey);

        llMarketData.forEach(item => {
            let sId = item.sleeperPlayerId;
            let sp = sleeperMap[sId];
            if (!sp || !sp.first_name) return;

            let fullName = `${sp.first_name} ${sp.last_name}`;
            let rankVal = parseFloat(item.overallRank);

            if (!isNaN(rankVal)) {
                parsed.push({
                    name: fullName,
                    cleanName: normalizeName(fullName),
                    marketVal: rankVal,
                    pos: sp.position || ""
                });
            }
        });
    }

    return { parsed, formatText };
}