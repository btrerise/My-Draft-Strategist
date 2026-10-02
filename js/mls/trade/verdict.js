// Moved out of js/mls/scout/engine.js in refactor chunk 3G: runScout's TRADE FAIRNESS VERDICT(S) block,
// now buildTradeVerdictHTML (its lines re-indented, otherwise unchanged), and renderTradeVerdict, which
// only that block calls.
import { State } from '../state.js';

    // --- TRADE FAIRNESS VERDICT(S) ---
    // Returns the verdict banner(s) runScout puts above the Trade Analyzer's player cards, for a trade
    // with players on both sides. getResults/giveResults are runScout's buildCard results.
    export function buildTradeVerdictHTML(getResults, giveResults) {
        let verdictHTML;
        // Renders up to two independent verdicts ahead of the player lists: one from the
        // user's own custom ROS rankings (the default/primary lens -- no third-party API
        // needed, since ROS rankings are a core input most users already have from the
        // Roster tab), and one from market consensus if Market Value data has been loaded
        // (Trade Finder section below). Showing both side-by-side is deliberate: it lets a
        // user see "the market" and "how I personally value this" can disagree.
        verdictHTML = renderTradeVerdict(
            "Your Rankings",
            "This value isn't something you entered; it's estimated by converting your ROS rank into a point value on a 0-10,000 scale, weighted so top-ranked players are worth disproportionately more (rank #1 &asymp; 10,000, decaying ~1.8% per rank). This provides a way to compare players on your own board.",
            getResults, giveResults, "userValue", "userMatched", State.rosRankings.length > 0
        );
        verdictHTML += renderTradeVerdict(
            "Market Consensus",
            "Same estimation method, applied to the market-consensus rank you loaded (Trade Finder section below). This only stores that source's overall rank, not its own internal value points, so this is an estimate of market value - not the source's official number.",
            getResults, giveResults, "marketValue", "marketMatched", State.marketRankings.length > 0
        );

        if (!verdictHTML) {
            verdictHTML = `<div class="trade-verdict-note" style="margin-bottom:1rem;">Load your ROS Rankings (Roster tab) and/or Market Value data (Trade Finder section below) to get a value total and fairness verdict.</div>`;
        }
        return verdictHTML;
    }

    // Builds one verdict banner (label + totals + Fair/Favors-You/Favors-Them) from a set of
    // GET/GIVE card results, keyed off whichever value field ("userValue" or "marketValue") and
    // matched flag the caller wants. Returns "" when the underlying data source isn't loaded at
    // all, or when nothing on either side matched it, so callers can concatenate freely and fall
    // back to a single prompt only when BOTH sources come back empty.
    function renderTradeVerdict(label, methodologyText, getResults, giveResults, valueKey, matchedKey, sourceLoaded) {
        if (!sourceLoaded) return "";

        let getTotal = getResults.reduce((sum, r) => sum + r[valueKey], 0);
        let giveTotal = giveResults.reduce((sum, r) => sum + r[valueKey], 0);
        let unmatchedCount = getResults.concat(giveResults).filter(r => !r[matchedKey]).length;

        if (getTotal === 0 && giveTotal === 0) {
            return unmatchedCount > 0
                ? `<div class="trade-verdict-note" style="margin-bottom:1rem;">${label}: none of the players entered were found, so no value total could be calculated.</div>`
                : "";
        }

        // --- WAIVER ADJUSTMENT ---
        // Credits whichever side of the trade includes FEWER total players. A straight sum of
        // player values overvalues the many-piece side of an uneven trade: consolidating value
        // into fewer roster spots is worth something on its own, since the newly-freed bench
        // spot(s) can be refilled off waivers. This mirrors the "waiver adjustment" concept sites
        // like FantasyCalc apply to their own trade calculators, though the credit amount here is
        // a flat, user-configurable estimate (see the Trade Analyzer's settings above) rather
        // than one derived from real trade data.
        let waiverSubnoteGet = "", waiverSubnoteGive = "";
        if (State.tradeSettings.waiverAdjustment) {
            let spotDiff = giveResults.length - getResults.length; // >0 = you're sending more pieces than you receive
            let perSpot = parseFloat(State.tradeSettings.waiverAdjustmentValue) || 0;
            if (spotDiff !== 0 && perSpot > 0) {
                let bonus = Math.abs(spotDiff) * perSpot;
                if (spotDiff > 0) {
                    getTotal += bonus;
                    waiverSubnoteGet = `<span class="trade-verdict-subnote">+${bonus.toLocaleString()} waiver adj.</span>`;
                } else {
                    giveTotal += bonus;
                    waiverSubnoteGive = `<span class="trade-verdict-subnote">+${bonus.toLocaleString()} waiver adj.</span>`;
                }
            }
        }

        let diff = getTotal - giveTotal;
        let biggerSide = Math.max(getTotal, giveTotal, 1); // avoid div-by-zero
        let swingPct = (Math.abs(diff) / biggerSide) * 100;

        // Within 10% of the larger side's value counts as a fair trade -- outside that, it
        // clearly favors whoever's receiving more value.
        let verdictClass, verdictText;
        if (swingPct < 10) {
            verdictClass = "verdict-fair";
            verdictText = "Fair Trade";
        } else if (diff > 0) {
            verdictClass = "verdict-favor-you";
            verdictText = "Favors You";
        } else {
            verdictClass = "verdict-favor-them";
            verdictText = "Favors Them";
        }

        let unmatchedNote = unmatchedCount > 0
            ? `<div class="trade-verdict-note">${unmatchedCount} player${unmatchedCount > 1 ? 's' : ''} not found, excluded from this total.</div>`
            : "";

        return `
        <div class="trade-verdict-banner ${verdictClass}">
            <div class="trade-verdict-source-label">
                By ${label}
                <div class="tooltip-container">
                    <div class="tooltip-icon">i</div>
                    <span class="tooltip-text">${methodologyText}</span>
                </div>
            </div>
            <div class="trade-verdict-totals">
                <div class="trade-verdict-side">
                    <span class="trade-verdict-label">You Receive</span>
                    <span class="trade-verdict-amount"><span class="trade-verdict-est">est.</span>${getTotal.toLocaleString()}</span>
                    ${waiverSubnoteGet}
                </div>
                <div class="trade-verdict-vs">vs</div>
                <div class="trade-verdict-side">
                    <span class="trade-verdict-label">You Give</span>
                    <span class="trade-verdict-amount"><span class="trade-verdict-est">est.</span>${giveTotal.toLocaleString()}</span>
                    ${waiverSubnoteGive}
                </div>
            </div>
            <div class="trade-verdict-result">
                ${verdictText}
                <span class="trade-verdict-diff">(${diff >= 0 ? '+' : ''}${diff.toLocaleString()} pts, ${swingPct.toFixed(0)}%)</span>
            </div>
            ${unmatchedNote}
        </div>`;
    }
