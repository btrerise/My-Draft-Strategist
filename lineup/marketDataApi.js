// --- MARKET CONSENSUS DATA (FANTASYCALC / LEAGUELOGS) API CLIENT (ES MODULE) ---
// Third module pulled out of mls.js's single IIFE (see rankingsParser.js and sleeperApi.js
// for the first two). This was already written as a pure, self-contained function before
// this split -- "no DOM access, no state writes" was true in mls.js already -- so moving it
// here didn't require any restructuring, just relocating it and wiring up its one real
// dependency (getSleeperPlayerMap, needed for LeagueLogs' player-ID lookups) as an import
// from sleeperApi.js instead of a same-file function call.
import { getSleeperPlayerMap } from './sleeperApi.js';

// normalizeName lives in utils.js, a plain (non-module) script loaded before this one -- its
// top-level `function` declaration attaches to `window`, so it's reached here explicitly via
// `window.` rather than assumed to be a bare global, since that's the only form of cross-script
// access a module can rely on.
function normalizeName(name) {
    return window.normalizeName(name);
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
        const fcRes = await fetch(`https://api.fantasycalc.com/values/current?isDynasty=${isDynastyBool}&numQbs=${numQbsVal}&numTeams=${teamCount}&ppr=${ppr}&isTEP=${isTEP}`);
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

        const marketRes = await fetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
        if (!marketRes.ok) throw new Error(`Market Error: ${marketRes.status}`);
        const llMarket = await marketRes.json();

        llMarket.data.forEach(item => {
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