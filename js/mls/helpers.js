// Moved from lineup/mls.js in refactor chunk 3A: the player/league status predicates that sat
// at the end of STATE MANAGEMENT, UTILITY HELPERS, RANKINGS LOOKUP INDEX, and showStatusFeedback /
// renderHTMLInto (unmarked, at the end of INITIALIZATION).
import { TEAM_BYES } from './constants.js';
import { State } from './state.js';

    // Statuses from Sleeper's player sync (see rosterDetails in processSleeperData) that mean
    // a player has ~zero chance of playing this week. Deliberately excludes "Q" (Questionable)
    // and "D" (Doubtful) -- those are still game-time calls, not a reason to auto-bench someone
    // your rankings already have rated highly.
    export const HARD_OUT_STATUSES = ['OUT', 'IR', 'SUS', 'PUP', 'NFI'];

    // True if a player should be avoided as an optimizer pick this week -- on bye, or flagged
    // with a hard-out status above -- unless no eligible alternative exists at all (see
    // findBestStarterIndex), in which case they're started anyway rather than leaving a slot
    // empty. Locked players bypass this check entirely at the call sites below: a lock is an
    // explicit instruction to start someone regardless of bye/injury status.
    export function isUnavailableThisWeek(p) {
        const onBye = State.currentNflWeek != null && TEAM_BYES[p.team] === State.currentNflWeek;
        const hardOut = p.inj && HARD_OUT_STATUSES.includes(p.inj);
        return onBye || hardOut;
    }

    // Canonical short injury-status code for a raw Sleeper player object -- 'Q', 'D', 'OUT',
    // 'IR', 'SUS', 'PUP', 'NFI', or null if healthy/no concern. Mirrors the same
    // classification already used for the roster-details injury badge (see rosterDetails in
    // processSleeperData) so "what counts as Doubtful/Out/IR" can't silently drift between
    // the two -- kept as its own function rather than merged into that inline block since that
    // block's job is building a display badge, not answering a yes/no eligibility question.
    export function getShortInjuryStatus(p) {
        if (!p) return null;
        let inj = null;
        if (p.injury_status && p.injury_status !== "None" && p.injury_status !== "Active") inj = p.injury_status;
        else if (p.status && ['Suspended', 'PUP', 'IR', 'NFI', 'Did Not Report'].includes(p.status)) inj = p.status;
        if (!inj) return null;

        const iUpper = inj.toUpperCase();
        if (iUpper.includes('QUESTIONABLE')) return 'Q';
        if (iUpper.includes('DOUBTFUL')) return 'D';
        if (iUpper.includes('OUT')) return 'OUT';
        if (iUpper.includes('SUSPENDED')) return 'SUS';
        if (iUpper.includes('IR') || iUpper.includes('INJURED RESERVE')) return 'IR';
        if (iUpper.includes('PUP')) return 'PUP';
        if (iUpper.includes('NFI')) return 'NFI';
        if (iUpper.includes('DID NOT REPORT') || iUpper === 'DNR') return 'DNR';
        return inj;
    }

    // Statuses that mean a player has a real, non-trivial chance of not actually taking the
    // field this week -- specifically the ones the Monte Carlo simulator and its Lineup
    // Insights bench comparisons should never simulate as if they're playing normally.
    // Deliberately a SEPARATE, stricter list from HARD_OUT_STATUSES above: that one exists for
    // the lineup optimizer's "should I auto-start this person" decision and intentionally
    // leaves Doubtful in play there (still a game-time call, worth trusting rankings over) --
    // but simulating a distribution around a normal week's variance isn't a start/sit call,
    // it's an implicit claim that this player is taking the field at all, which Doubtful
    // specifically hasn't been decided yet, and Out/IR/PUP/NFI/Suspended/DNR already answer as
    // no. NFI is included alongside the PUP/Suspended/DNR grouping Benton asked for -- it's the
    // same "not injury-related but definitely not playing" category HARD_OUT_STATUSES already
    // treats identically to PUP, so leaving it out here looked more like an oversight than a
    // deliberate choice; flag if that's not what's wanted.
    export const SIM_EXCLUDE_STATUSES = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR'];

    export function isExcludedFromSimulation(p) {
        const shortInj = getShortInjuryStatus(p);
        return shortInj !== null && SIM_EXCLUDE_STATUSES.includes(shortInj);
    }

    // Best Ball leagues have no weekly lineup to set and (almost always) no IR slot, so every
    // tool whose whole premise is "you need to go move somebody" has to sit them out. The
    // formatBadge string is the only place this is recorded -- processSleeperData stamps
    // "Best Ball" into it from leagueData.settings.best_ball, and the raw setting isn't kept
    // on the league object afterwards. Factored out of the three near-identical inline copies
    // that had accumulated (dashboard matrix, optimizeAllLineups' skip + its count) so a
    // fourth caller can't drift from them.
    export function isBestBallLeague(l) {
        return !!(l && l.formatBadge && l.formatBadge.toLowerCase().includes("best ball"));
    }

    // --- UTILITY HELPERS ---
    // normalizeName intentionally NOT redeclared here -- it previously shadowed the
    // shared, alias-aware version in js/utils.js (loaded before this file), which caused
    // Sleeper-sourced names to fail matching against user-uploaded rankings for any player
    // needing suffix stripping, accent stripping, or the alias map (e.g. Gabe Davis /
    // Gabriel Davis). Calls to normalizeName() below now resolve to that shared version.
    // Do not add a local normalizeName() back without updating utils.js instead.

    // flashButton intentionally NOT declared here either -- previously a separate near-duplicate
    // of mds.js's local copy. Both now consolidated into the single shared version in
    // js/utils.js. Calls below resolve to that shared version.

    // --- RANKINGS LOOKUP INDEX ---
    // cleanName -> ranking row, for the three big rankings arrays (ROS, Weekly, Market). Nearly
    // every consumer of these arrays looks players up by cleanName, and nearly all of them were
    // doing it with `arr.find(r => r.cleanName === x)` from inside a loop -- O(n x m) work. The
    // worst case was runMarketDisconnectAnalysis, which scanned all of rosRankings once per
    // market entry: ~250,000 comparisons for two ~500-row lists.
    //
    // Cached in a WeakMap keyed on the ARRAY ITSELF rather than on a State field name, which is
    // what makes this safe to hold onto: every assignment to State.rosRankings /
    // weeklyRankings / marketRankings in this file creates a brand-new array (either a
    // [...spread] or a []), and nothing anywhere mutates one of these arrays in place. So a
    // rankings swap -- switching leagues, loading a named set, uploading a file -- produces a
    // different array identity that simply misses the cache and rebuilds. There is no
    // invalidation to remember to call, and no way for a stale index to be handed back.
    //
    // First entry wins, matching the .find() calls this replaces.
    const _rankingIndexCache = new WeakMap();
    const EMPTY_RANKING_INDEX = new Map(); // shared; callers only ever read from an index
    export function rankingIndex(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return EMPTY_RANKING_INDEX;
        let idx = _rankingIndexCache.get(arr);
        if (!idx) {
            idx = new Map();
            arr.forEach(r => {
                if (r && r.cleanName && !idx.has(r.cleanName)) idx.set(r.cleanName, r);
            });
            _rankingIndexCache.set(arr, idx);
        }
        return idx;
    }

// Shows a role="status" feedback line that sits at display:none until now. Some screen
// readers skip a live region that is revealed with its text already in it, so the box is
// shown empty and the text goes in a beat later -- a content change, which they do announce.
// `text` overrides the message; omitted, the element's current message is reused.
export function showStatusFeedback(el, text, hideAfterMs) {
    if (!el) return;
    const msg = text ?? el._feedbackText ?? el.textContent;
    el._feedbackText = msg;
    clearTimeout(el._feedbackShowT);
    clearTimeout(el._feedbackHideT);
    el.textContent = '';
    el.style.display = 'block';
    el._feedbackShowT = setTimeout(() => { el.textContent = msg; }, 100);
    el._feedbackHideT = setTimeout(() => { el.style.display = 'none'; }, hideAfterMs);
}

// Parses an HTML string into a DocumentFragment using a detached <template>, then swaps
// it into `container` in one operation. The parsing happens off-DOM (the template's
// content is never attached to the live tree), and the fragment's children are moved
// into place in a single call -- avoids the container sitting attached-but-empty
// mid-rebuild the way `container.innerHTML = html` does.
export function renderHTMLInto(container, html) {
    if (!container) return;
    const template = document.createElement('template');
    template.innerHTML = html;
    container.replaceChildren(template.content);
}
