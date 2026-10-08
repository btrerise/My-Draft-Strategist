// Moved from lineup/mls.js in refactor chunk 3A: CONSTANTS & CONFIGURATION.
import { KEYS } from '../shared/storage/keys.js';

    // --- CONSTANTS & CONFIGURATION ---
    export const NFL_TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];

    // ESPN's scoreboard endpoint (see refreshGameTimes below) abbreviates a handful of teams
    // differently than Sleeper/this app do. Washington is the current known mismatch (ESPN:
    // "WSH", everywhere else in this app: "WAS") -- mapped here so State.gameTimesByTeam keys
    // line up with the same team codes used by the bye table (js/shared/data/byes.js), league.roster, etc.
    export const ESPN_TEAM_ALIASES = { "WSH": "WAS" };

    // The positions Lineup Strategist plays and ranks, and the one it gives a Sleeper player.
    // Sleeper's `position` is the player's listed NFL position; `fantasy_positions` is every
    // position Sleeper scores him at. They differ for two-way players (Travis Hunter: DB, scored
    // at DB and WR) and for fullbacks (FB, scored at RB). Lineup Strategist used to read
    // `position` alone, so a rostered Travis Hunter was a "DB", fit no lineup slot and never
    // started (refactor 9C). The listed position wins when it's a fantasy one; otherwise the first
    // fantasy position Sleeper scores him at; otherwise the listed one, unchanged. Draft
    // Strategist matches by fantasy_positions the same way (js/mds/import.js, refactor 7A).
    export const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    export function fantasyPosition(p) {
        if (!p) return null;
        if (FANTASY_POSITIONS.includes(p.position)) return p.position;
        const scored = Array.isArray(p.fantasy_positions) ? p.fantasy_positions.find(pos => FANTASY_POSITIONS.includes(pos)) : null;
        return scored || p.position || null;
    }

    // Lineup slot types and the positions each accepts. WRTE and WRRB are Sleeper's restricted flex
    // slots (REC_FLEX = WR/TE, WRRB_FLEX = WR/RB), shown as "W/T" and "W/R" (improvements S1; before,
    // league sync counted them as a full FLEX, which let the optimizer start an RB in a W/T slot).
    // Starter slot labels are the type plus a number ("WRTE1"); the digit-stripped label is the type.
    // js/mls/scout/waiverScanner.js keeps its own copy, since it has to run under Node without imports.
    export const SLOT_POSITIONS = {
        QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
        WRRB: ['WR', 'RB'], WRTE: ['WR', 'TE'], FLEX: ['RB', 'WR', 'TE'], SFLEX: ['QB', 'RB', 'WR', 'TE'],
        K: ['K'], DEF: ['DEF']
    };
    const SLOT_NAMES = { WRRB: 'W/R', WRTE: 'W/T' };
    export const slotDisplayName = (slotType) => SLOT_NAMES[slotType] || slotType;

    // Small muted "(T2)" suffix for a rank shown on a player card, when the rankings file that
    // rank came from also had a Tier column (see js/shared/rankings/parse.js). Returns "" for a missing tier
    // -- the common case, since Tier is an optional column -- so callers can append it
    // unconditionally and cards for tier-less rankings look exactly as they always have.
    export const tierTag = (tier) => (Number.isFinite(tier) && tier > 0)
        ? ` <span class="mls-tier" title="Tier ${tier}">(T${tier})</span>`
        : '';

    // Second rank for the Scout tab's cards: the player's position rank (and its tier), shown
    // after their overall "Rank" so it's clear which number is which. On flex-style weekly sheets
    // the overall rank is really a FLEX rank for RB/WR/TE, so the position rank is the only place
    // their position tier can show. Returns "" when there's no position rank, or when it would just
    // repeat the overall one (a QB, or a file with no separate Pos Rank column, where posRank falls
    // back to the overall rank) -- unless the tiers differ, in which case it still has something to say.
    export const posRankTag = (obj, colorClass) => {
        if (!obj || obj.posRank === undefined || obj.posRank === null || obj.posRank === 999) return '';
        if (obj.posRank === obj.rank && (obj.posTier ?? obj.tier ?? null) === (obj.tier ?? null)) return '';
        // No position tier of its own: the file's overall tier stands in (improvements S8, round 3).
        return ` <span class="mls-rank-sep">&middot;</span> Pos: <strong class="${colorClass}">#${obj.posRank}</strong>${tierTag(obj.posTier ?? obj.tier)}`;
    };

    // How long the Lineup tab's per-player projected/final points data (see refreshLineupStats)
    // is reused before a re-render is allowed to refetch it. Deliberately short-ish rather than
    // live: this is a companion view refreshed when the person opens or interacts with the tab,
    // not a scoreboard that updates itself through Sunday.
    export const LINEUP_STATS_TTL_MS = 2 * 60 * 1000;
    export const LINEUP_PROJECTION_TTL_MS = 5 * 60 * 1000;

    // Per-type field/key mapping shared by the Named Ranking Sets feature (see the full
    // explanation further down, near saveRankingsAsSet) -- keeping ROS and Weekly's parallel
    // state keys, localStorage keys, and DOM element ids in one lookup table instead of two
    // near-duplicate code paths. Declared up here (rather than next to its main usage) because
    // switchActiveLeague(), just below, already needs it during page load.
    export const RANKING_TYPE_CONFIG = {
        ros: {
            stateKey: 'rosRankings', updatedAtKey: 'rosRankingsUpdatedAt',
            leagueLegacyDataKey: 'rosRankings', leagueLegacyUpdatedKey: 'rosRankingsUpdatedAt',
            leagueSetIdKey: 'rosRankingSetId', setsKey: 'ros',
            localStorageSetsKey: KEYS.mls.rankingSetsRos,
            globalDataKey: KEYS.mls.ros, globalUpdatedKey: KEYS.mls.rosUpdated,
            selectId: 'rosRankingSetSelect', nameInputWrapId: 'rosNewSetNameWrap',
            nameInputId: 'rosNewSetName', deleteBtnId: 'rosDeleteSetBtn', renameBtnId: 'rosRenameSetBtn',
            cardId: 'rosRankingsCard', headerSetNameId: 'rosHeaderSetName',
            leaguesRowId: 'rosSetLeaguesRow', leaguesSummaryId: 'rosSetLeaguesSummary',
            label: 'ROS', staleAfterDays: 14
        },
        weekly: {
            stateKey: 'weeklyRankings', updatedAtKey: 'weeklyRankingsUpdatedAt',
            leagueLegacyDataKey: 'weeklyRankings', leagueLegacyUpdatedKey: 'weeklyRankingsUpdatedAt',
            leagueSetIdKey: 'weeklyRankingSetId', setsKey: 'weekly',
            localStorageSetsKey: KEYS.mls.rankingSetsWeekly,
            globalDataKey: KEYS.mls.weekly, globalUpdatedKey: KEYS.mls.weeklyUpdated,
            selectId: 'weeklyRankingSetSelect', nameInputWrapId: 'weeklyNewSetNameWrap',
            nameInputId: 'weeklyNewSetName', deleteBtnId: 'weeklyDeleteSetBtn', renameBtnId: 'weeklyRenameSetBtn',
            cardId: 'weeklyRankingsCard', headerSetNameId: 'weeklyHeaderSetName',
            leaguesRowId: 'weeklySetLeaguesRow', leaguesSummaryId: 'weeklySetLeaguesSummary',
            label: 'Weekly', staleAfterDays: 6
        }
    };
