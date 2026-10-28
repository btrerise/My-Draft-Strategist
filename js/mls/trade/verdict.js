// Moved out of js/mls/scout/engine.js in refactor chunk 3G: runScout's TRADE FAIRNESS VERDICT(S) block,
// now buildTradeVerdictHTML (its lines re-indented, otherwise unchanged), and renderTradeVerdict, which
// only that block calls.
import { escapeHtml } from '../../shared/html.js';
import { State } from '../state.js';
import { getFreshness } from '../../shared/freshness.js';
import { verdictFromValues } from './makeFair.js';
import { marketFormatWarning } from '../main.js';
import { getActiveLeague } from '../helpers.js';
import { IN_SEASON, hasSeasonSlot, seasonSetFor } from '../rankings/season.js';
import { dualHeadline, dualVerdictNumbers } from '../rankings/nowAndLater.js';

    // The active league's In-Season set when the Trade Analyzer shows two values and two verdicts (improvements
    // S24): a dynasty or keeper league with an In-Season set (S23) and its dynasty set loaded. null everywhere else,
    // and the Trade Analyzer looks exactly as before.
    export function tradeSeasonSet() {
        if (State.rosRankings.length === 0) return null;
        return seasonSetFor(getActiveLeague(), State.rankingSets.ros);
    }

    const YOUR_METHOD = "This value isn't something you entered; it's estimated by converting your ROS rank into a point value on a 0-10,000 scale, weighted so top-ranked players are worth disproportionately more (rank #1 &asymp; 10,000, decaying ~1.8% per rank). This provides a way to compare players on your own board.";

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
        // A dynasty league with an In-Season set (improvements S24, owner's choice): two verdicts by your rankings, In-Season
        // (this season) and Dynasty (the long run), side by side, with one line above joining them ("Wins now (+2,100),
        // costs long-term (−3,400)"). Each from its own set through the same curve; never one blended number.
        const seasonSet = tradeSeasonSet();
        let yours;
        if (seasonSet) {
            // Two matching tiles, Now (In-Season) and Long-term (Dynasty), side by side at every width, with the market as a
            // slim muted strip under them (round 4, owner's review of round 3: the card's small, tight text looked busy, the
            // market's full banner drew the eye, and the one-sentence headline didn't appeal; the tiles are the headline).
            const now = renderTradeVerdict(`Your ${IN_SEASON} Rankings`, '', getResults, giveResults, "seasonValue", "seasonMatched", true, 'your In-Season rankings', true);
            const later = renderTradeVerdict("Your Dynasty Rankings", '', getResults, giveResults, "userValue", "userMatched", true, 'your dynasty rankings', true);
            const waiver = { on: !!State.tradeSettings.waiverAdjustment, perSpot: State.tradeSettings.waiverAdjustmentValue };
            const both = dualVerdictNumbers(getResults, giveResults, waiver);
            const market = State.marketRankings.length > 0
                ? renderTradeVerdict("Market Consensus", '', getResults, giveResults, "marketValue", "marketMatched", true, '', true) : null;
            verdictHTML = dualVerdictTiles(seasonSet, now, later, dualHeadline(both.now, both.later)) + marketStrip(market) + marketAgeHTML();
            return verdictHTML || `<div class="trade-verdict-note" style="margin-bottom:1rem;">Load your ROS Rankings (Roster tab) and/or Market Value data (Trade Finder section below) to get a value total and fairness verdict.</div>`;
        } else {
            yours = renderTradeVerdict(
                "Your Rankings", YOUR_METHOD,
                getResults, giveResults, "userValue", "userMatched", State.rosRankings.length > 0
            );
        }
        const market = renderTradeVerdict(
            "Market Consensus",
            "Same estimation method, applied to the market-consensus rank you loaded (Trade Finder section below). This only stores that source's overall rank, not its own internal value points, so this is an estimate of market value - not the source's official number.",
            getResults, giveResults, "marketValue", "marketMatched", State.marketRankings.length > 0
        );
        // Both lenses side by side from tablet width up (improvements S19, round 9: stacked, they filled the first
        // screen on desktop); stacked on phones (css/mls.css .trade-verdict-pair).
        verdictHTML = yours && market ? `<div class="trade-verdict-pair">${yours}${market}</div>` : yours + market;

        verdictHTML += marketAgeHTML();
        // A dynasty or keeper league with no In-Season set (S24, owner's report): one verdict by your rankings, as before,
        // and a line saying how to get the this-season one beside it. On screen only (Export Trade doesn't pick it up).
        if (!seasonSet && yours && hasSeasonSlot(getActiveLeague())) {
            verdictHTML += `<div class="mls-trade-season-hint" data-season-hint>Choose <span class="mls-nowrap">In-Season</span> rankings for this league on the Roster tab to get a this-season verdict beside your dynasty one.</div>`;
        }

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
        // Values fetched for another format than this league's (S23 follow-up): said under the age, in the same amber.
        const warning = marketFormatWarning();
        return (fresh
            ? `<div class="mls-trade-market-age${fresh.isStale ? ' is-stale' : ''}">Market values: ${fresh.label}${fresh.isStale ? '. Refresh them in Trade Finder (below) before you trade.' : '.'}</div>`
            : '')
            + (warning ? `<div class="mls-trade-market-age is-stale">${escapeHtml(warning)} Fetch again in Trade Finder (below).</div>` : '');
    }

    // The names in a trade that match no player at all (runScout's rows mark them known: false), as shown on their rows.
    export function unknownNames(getResults, giveResults) {
        return getResults.concat(giveResults).filter(r => r.known === false).map(r => (r.exportRow && r.exportRow.name) || '?');
    }

    const signedPts = (n) => `${n >= 0 ? '+' : '\u2212'}${Math.abs(n).toLocaleString()}`;
    const totalsWaiver = (nums) => nums.bonusGet ? ` Includes a +${nums.bonusGet.toLocaleString()} waiver adjustment on what you get.`
        : nums.bonusGive ? ` Includes a +${nums.bonusGive.toLocaleString()} waiver adjustment on what you give.` : '';

    // The In-Season and Dynasty verdicts as two tiles (S24, round 4): "NOW" / "LONG-TERM", the verdict, the points and
    // swing, and the totals; each tinted by its verdict like the banners, its (i) naming the set. headline: dualHeadline's
    // sentence, for screen readers. parts: renderTradeVerdict's.
    function dualVerdictTiles(seasonSet, now, later, headline) {
        const tile = (cls, label, set, setTip, p) => {
            if (!p || !p.nums) return '';
            const { nums } = p;
            return `
            <div class="mls-trade-tile ${p.verdictClass} ${cls}">
                <div class="mls-trade-tile-label">${label}
                    <div class="tooltip-container"><div class="tooltip-icon">i</div><span class="tooltip-text">${setTip}${totalsWaiver(nums)} ${YOUR_METHOD}</span></div>
                </div>
                <div class="mls-trade-tile-set">by ${set}</div>
                <div class="trade-verdict-result mls-trade-tile-result">${p.verdictText}</div>
                <div class="mls-trade-tile-diff">${signedPts(nums.diff)} pts &middot; ${nums.swingPct.toFixed(0)}%</div>
                <div class="mls-trade-tile-totals">Get ${nums.getTotal.toLocaleString()} &middot; Give ${nums.giveTotal.toLocaleString()}</div>
            </div>`;
        };
        const tiles = tile('is-now', 'Now', '<span class="mls-nowrap">In-Season</span>', `This season, by your In-Season rankings (${escapeHtml(seasonSet.name || '')}).`, now)
            + tile('is-later', '<span class="mls-nowrap">Long-term</span>', 'dynasty', 'The long run, by your dynasty rankings.', later);
        const notes = [now, later].map(p => (p && (p.unmatchedNote || p.note)) || '').join('');
        if (!tiles) return notes;
        return `<div class="mls-trade-tiles" data-trade-verdict-dual role="group"${headline ? ` aria-label="${escapeHtml(headline)}"` : ''}>${tiles}</div>${notes}`;
    }

    // Market Consensus beside your two verdicts (S24, round 4): one muted line, there for comparison, so it doesn't draw
    // the eye from your own. parts: renderTradeVerdict's, or null without market values.
    function marketStrip(p) {
        if (!p) return '';
        if (!p.nums) return p.note || '';
        const { nums } = p;
        return `
        <div class="mls-trade-market-strip ${p.verdictClass}" data-trade-market-strip>
            <span class="mls-trade-market-strip-label">Market</span>
            <span class="mls-trade-market-strip-result">${p.verdictText}</span>
            ${p.incomplete ? '' : `<span>${signedPts(nums.diff)} &middot; ${nums.swingPct.toFixed(0)}%</span>`}
            <span>Get ${nums.getTotal.toLocaleString()} &middot; Give ${nums.giveTotal.toLocaleString()}</span>
            <div class="tooltip-container"><div class="tooltip-icon">i</div><span class="tooltip-text">By Market Consensus: the same estimate applied to the market's ranks (Trade Finder below), for comparison.${totalsWaiver(nums)}</span></div>
        </div>${p.unmatchedNote || ''}`;
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
    // setWord: how the "isn't in your …" note names the rankings (S24: In-Season or dynasty).
    // asParts (S24, round 3): the pieces instead of the banner, for the In-Season / Dynasty card ({ note } with no total).
    function renderTradeVerdict(label, methodologyText, getResults, giveResults, valueKey, matchedKey, sourceLoaded, setWord = 'your ROS rankings', asParts = false) {
        if (!sourceLoaded) return "";

        const unmatched = getResults.concat(giveResults).filter(r => !r[matchedKey]);
        let unmatchedCount = unmatched.length;
        const nums = tradeVerdictNumbers(getResults, giveResults, valueKey);

        if (!nums) {
            if (asParts) return { note: unmatchedCount > 0 ? `<div class="trade-verdict-note">${label}: none of the players entered were found, so no value total could be calculated.</div>` : '' };
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
                : `<div class="trade-verdict-note">${missing.join(', ')} ${plural ? "aren't" : "isn't"} in ${setWord}, so ${plural ? 'they count' : 'he counts'} as 0.</div>`;
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

        if (asParts) return { nums, verdictClass, verdictText, unmatchedNote, incomplete };

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
