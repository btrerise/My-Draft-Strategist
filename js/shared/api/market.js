// --- MARKET CONSENSUS DATA (FANTASYCALC) API CLIENT (ES MODULE) ---
// Third module pulled out of lineup/mls.js's single IIFE (see js/shared/rankings/parse.js and
// js/shared/api/sleeper.js for the first two). This was already written as a pure, self-contained function before
// this split -- "no DOM access, no state writes" was true in lineup/mls.js already -- so moving it
// here didn't require any restructuring.
//
// Refactor 7A removed LeagueLogs (its public API now answers 410): fetchLeagueLogsMarket and
// fetchMarketConsensusData's LeagueLogs branch are gone, and with them this file's import of
// getSleeperPlayerMap. Draft Strategist's ADP sources moved to ./ffc.js.
import { normalizeName } from '../names.js';
import { mdsFetch } from '../net.js';

// normalizeName and mdsFetch are imported above. mdsFetch, used for the API call below, is
// fetch() with a timeout, so FantasyCalc going quiet can't leave the Market
// Value button spinning forever.

// FantasyCalc's league sizes (its API docs: 8, 10, 12, 14). A league of another size gets the nearest one, the
// smaller on a tie, so 6 teams read as 8 and 16 or more as 14.
export const FC_TEAM_SIZES = [8, 10, 12, 14];
export function fcTeamSize(teamCount) {
    const n = Number(teamCount) || 12;
    return FC_TEAM_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), FC_TEAM_SIZES[0]);
}

// TE premium in FantasyCalc's words (improvements K8). The app used to send isTEP=true, a parameter FantasyCalc
// doesn't read, so TE Premium changed nothing; FantasyCalc takes tep=none | te+ | te++.
export const FC_TEP_ON = 'te+';

// The same-origin URL for one parameter set, in the order functions/api/fantasycalc.js keys its cache by.
export function fantasyCalcUrl(isDynasty, numQbs, teamCount, ppr, isTEP) {
    const q = new URLSearchParams({
        isDynasty: String(!!isDynasty),
        numQbs: String(numQbs) === '2' ? '2' : '1',
        numTeams: String(fcTeamSize(teamCount)),
        ppr: ['0', '0.5', '1'].includes(String(ppr)) ? String(ppr) : '1',
        tep: String(isTEP) === 'true' ? FC_TEP_ON : 'none',
    });
    return `/api/fantasycalc?${q}`;
}

/**
 * Fetches and normalizes market-consensus player values from FantasyCalc. Pure data in/out --
 * callers handle their own UI and State updates.
 *
 * @param {string} source - 'fantasycalc' (the only source since refactor 7A; anything else throws)
 * @param {string} isDynastyVal - 'dynasty' or 'redraft'
 * @param {string} numQbsVal - '1' or '2' (superflex)
 * @param {string} ppr - PPR value passed straight through to FantasyCalc's API
 * @param {string} isTEP - 'true'/'false' (sent to FantasyCalc as tep=te+ or none)
 * @param {number} teamCount - league size (sent as the nearest of FantasyCalc's 8, 10, 12, 14)
 * @returns {Promise<{parsed: Array, formatText: string}>}
 */
export async function fetchMarketConsensusData(source, isDynastyVal, numQbsVal, ppr, isTEP, teamCount) {
    let parsed = [];
    let formatText = "";
    const isDynastyBool = isDynastyVal === 'dynasty';

    // --- 1. FANTASYCALC ---
    if (source === 'fantasycalc') {
        // Through the site's own cached copy (functions/api/fantasycalc.js, improvements K8): FantasyCalc's terms ask
        // for one copy shared by every user, refreshed at most every three hours, not one fetch per browser.
        const fcRes = await mdsFetch(fantasyCalcUrl(isDynastyBool, numQbsVal, teamCount, ppr, isTEP));
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