// Moved out of js/mls/scout/engine.js in refactor chunk 3G: runScout's TRADE FAIRNESS VERDICT(S) block,
// now buildTradeVerdictHTML (its lines re-indented, otherwise unchanged), and renderTradeVerdict, which
// only that block calls.
import { escapeHtml } from '../../shared/html.js';
import { State } from '../state.js';
import { getFreshness } from '../../shared/freshness.js';
import { verdictFromValues } from './makeFair.js';

    // --- TRADE FAIRNESS VERDICT(S) ---
    // Returns the verdict banner(s) runScout puts above the Trade Analyzer's player cards, for a trade
    // with players on both sides. getResults/giveResults are runScout's buildCard results.
    export function buildTradeVerdictHTML(getResults, giveResults) {
        let verdictHTML;
        // A name that matches no player (a typo) counts as 0 in every total, so any verdict would be about a different
        // trade (improvements S19, round 11: "Fair Trade" with a misspelled Gibbs). One banner saying which name to fix,
        // and no verdict until it is; "Did you mean" is on its row below.
        const unknown = unknownNames(getResults, giveResults);
        if (unknown.length) {
            const names = unknown.map(n => `<strong>${escapeHtml(n)}</strong>`).join(', ');
            verdictHTML = `
        <div class="trade-verdict-banner verdict-incomplete" data-verdict-held>
            <div class="trade-verdict-result">No verdict yet</div>
            <div class="trade-verdict-note">Couldn't match ${names} to a player. Fix the name (Did you mean, below) to get a verdict.</div>
        </div>`;
            return verdictHTML + marketAgeHTML();
        }
        // Renders up to two independent verdicts ahead of the player lists: one from the
        // user's own custom ROS rankings (the default/primary lens -- no third-party API
        // needed, since ROS rankings are a core input most users already have from the
        // Roster tab), and one from market consensus if Market Value data has been loaded
        // (Trade Finder section below). Showing both side-by-side is deliberate: it lets a
        // user see "the market" and "how I personally value this" can disagree.
        const yours = renderTradeVerdict(
            "Your Rankings",
            "This value isn't something you entered; it's estimated by converting your ROS rank into a point value on a 0-10,000 scale, weighted so top-ranked players are worth disproportionately more (rank #1 &asymp; 10,000, decaying ~1.8% per rank). This provides a way to compare players on your own board.",
            getResults, giveResults, "userValue", "userMatched", State.rosRankings.length > 0
        );
        const market = renderTradeVerdict(
            "Market Consensus",
            "Same estimation method, applied to the market-consensus rank you loaded (Trade Finder section below). This only stores that source's overall rank, not its own internal value points, so this is an estimate of market value - not the source's official number.",
            getResults, giveResults, "marketValue", "marketMatched", State.marketRankings.length > 0
        );
        // Both lenses side by side from tablet width up (improvements S19, round 9: stacked, they filled the first
        // screen on desktop); stacked on phones (css/mls.css .trade-verdict-pair).
        verdictHTML = yours && market ? `<div class="trade-verdict-pair">${yours}${market}</div>` : yours + market;

        verdictHTML += marketAgeHTML();

        if (!verdictHTML) {
            verdictHTML = `<div class="trade-verdict-note" style="margin-bottom:1rem;">Load your ROS Rankings (Roster tab) and/or Market Value data (Trade Finder section below) to get a value total and fairness verdict.</div>`;
        }
        return verdictHTML;
    }

    // How old the market values are (improvements S14, round 6, owner's choice): always dated, and amber with a
    // nudge once they're more than a day old, since trade values move with every injury and depth-chart change.
    // On screen only: Export Trade copies the banners and notes, not this line.
    function marketAgeHTML() {
        if (State.marketRankings.length === 0) return '';
        const fresh = getFreshness(State.marketUpdatedAt, 0);
        return fresh
            ? `<div class="mls-trade-market-age${fresh.isStale ? ' is-stale' : ''}">Market values: ${fresh.label}${fresh.isStale ? '. Refresh them in Trade Finder (below) before you trade.' : '.'}</div>`
            : '';
    }

    // The names in a trade that match no player at all (runScout's rows mark them known: false), as shown on their rows.
    export function unknownNames(getResults, giveResults) {
        return getResults.concat(giveResults).filter(r => r.known === false).map(r => (r.exportRow && r.exportRow.name) || '?');
    }

    // The verdict's numbers, for the banner below and for the Trade Analyzer's headline under it (improvements
    // S14, js/mls/trade/lineupSection.js), so the two never disagree. getTotal/giveTotal include the waiver
    // adjustment (bonusGet/bonusGive). verdict: 'fair' | 'you' | 'them'. Returns null when nothing on either side
    // has a value.
    export function tradeVerdictNumbers(getResults, giveResults, valueKey) {
        // The math is verdictFromValues (trade/makeFair.js, improvements S19), so "what would make it fair"
        // checks each suggestion with exactly the banner's numbers.
        return verdictFromValues(getResults.map(r => r[valueKey]), giveResults.map(r => r[valueKey]), {
            on: !!State.tradeSettings.waiverAdjustment, perSpot: State.tradeSettings.waiverAdjustmentValue
        });
    }

    // Builds one verdict banner (label + totals + Fair/Favors-You/Favors-Them) from a set of
    // GET/GIVE card results, keyed off whichever value field ("userValue" or "marketValue") and
    // matched flag the caller wants. Returns "" when the underlying data source isn't loaded at
    // all, or when nothing on either side matched it, so callers can concatenate freely and fall
    // back to a single prompt only when BOTH sources come back empty.
    function renderTradeVerdict(label, methodologyText, getResults, giveResults, valueKey, matchedKey, sourceLoaded) {
        if (!sourceLoaded) return "";

        const unmatched = getResults.concat(giveResults).filter(r => !r[matchedKey]);
        let unmatchedCount = unmatched.length;
        const nums = tradeVerdictNumbers(getResults, giveResults, valueKey);

        if (!nums) {
            return unmatchedCount > 0
                ? `<div class="trade-verdict-note" style="margin-bottom:1rem;">${label}: none of the players entered were found, so no value total could be calculated.</div>`
                : "";
        }
        const { getTotal, giveTotal, diff, swingPct } = nums;
        let waiverSubnoteGet = nums.bonusGet ? `<span class="trade-verdict-subnote">+${nums.bonusGet.toLocaleString()} waiver adj.</span>` : "";
        let waiverSubnoteGive = nums.bonusGive ? `<span class="trade-verdict-subnote">+${nums.bonusGive.toLocaleString()} waiver adj.</span>` : "";

        // A draft pick only ever has a market value (your ROS rankings have no picks), so one without a value
        // isn't a typo: say why instead of "not found" (improvements S14, round 6). exportRow is the Trade
        // Analyzer's (scout/engine.js).
        const isPick = (r) => !!(r.exportRow && r.exportRow.pos === 'Pick');
        const picks = unmatched.filter(isPick).map(r => r.exportRow.name);
        const missing = unmatched.filter(r => !isPick(r)).map(r => `<strong>${escapeHtml(r.exportRow ? r.exportRow.name : '?')}</strong>`);
        const plural = missing.length > 1;
        // Real players this source has no value for (round 11; typos never get this far). By your rankings an unranked
        // player is worth 0, by your own board (the Trade Analyzer's rule), so the verdict stands and says so. The market
        // simply doesn't know him, so its total is missing a piece: no verdict from it ("Incomplete").
        const incomplete = matchedKey === 'marketMatched' && missing.length > 0;
        let unmatchedNote = !missing.length ? ""
            : incomplete
                ? `<div class="trade-verdict-note">${missing.join(', ')} ${plural ? "aren't" : "isn't"} in the Market Consensus data, so this total is missing ${plural ? 'them' : 'him'}.</div>`
                : `<div class="trade-verdict-note">${missing.join(', ')} ${plural ? "aren't" : "isn't"} in your ROS rankings, so ${plural ? 'they count' : 'he counts'} as 0.</div>`;
        if (picks.length) {
            const names = picks.map(n => escapeHtml(n)).join(', ');
            unmatchedNote += State.marketRankings.length > 0
                ? `<div class="trade-verdict-note">${names} ${picks.length > 1 ? "aren't" : "isn't"} in the Market Consensus data, so ${picks.length > 1 ? "they're" : "it's"} left out of this total.</div>`
                : `<div class="trade-verdict-note">${names} ${picks.length > 1 ? 'have' : 'has'} no value without Market Consensus data (Trade Finder below), so ${picks.length > 1 ? "they're" : "it's"} left out of this total.</div>`;
        }

        let verdictClass, verdictText;
        if (incomplete) {
            verdictClass = "verdict-incomplete";
            verdictText = "Incomplete";
        } else if (nums.verdict === 'fair') {
            verdictClass = "verdict-fair";
            verdictText = "Fair Trade";
        } else if (nums.verdict === 'you') {
            verdictClass = "verdict-favor-you";
            verdictText = "Favors You";
        } else {
            verdictClass = "verdict-favor-them";
            verdictText = "Favors Them";
        }

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
                ${incomplete ? '' : `<span class="trade-verdict-diff">(${diff >= 0 ? '+' : ''}${diff.toLocaleString()} pts, ${swingPct.toFixed(0)}%)</span>`}
            </div>
            ${unmatchedNote}
        </div>`;
    }
