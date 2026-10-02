// --- MARKET CONSENSUS DATA (FANTASYCALC) API CLIENT (ES MODULE) ---
// Third module pulled out of mls.js's single IIFE (see rankingsParser.js and sleeperApi.js
// for the first two). This was already written as a pure, self-contained function before
// this split -- "no DOM access, no state writes" was true in mls.js already -- so moving it
// here didn't require any restructuring.
//
// Refactor 7A removed LeagueLogs (its public API now answers 410): fetchLeagueLogsMarket and
// fetchMarketConsensusData's LeagueLogs branch are gone, and with them this file's import of
// getSleeperPlayerMap. Draft Strategist's ADP sources moved to ./ffc.js.
import { normalizeName } from '../names.js';

// normalizeName is imported from js/shared/names.js above. window.mdsFetch, used for the API
// call below, is assigned by js/shared/globals.js (from js/shared/net.js) before any app module
// runs -- it's fetch() with a timeout, so FantasyCalc going quiet can't leave the Market
// Value button spinning forever.

/**
 * Fetches and normalizes market-consensus player values from FantasyCalc. Pure data in/out --
 * callers handle their own UI and State updates.
 *
 * @param {string} source - 'fantasycalc' (the only source since refactor 7A; anything else throws)
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

    else {
        throw new Error(`Unknown market source "${source}".`);
    }

    return { parsed, formatText };
}