// Moved from lineup/mls.js in refactor chunk 3A: CONSTANTS & CONFIGURATION.
import { KEYS } from '../shared/storage/keys.js';

    // --- CONSTANTS & CONFIGURATION ---
    export const NFL_TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];
    
    export const TEAM_BYES = {
        "ARI": 11, "ATL": 12, "BAL": 14, "BUF": 12, "CAR": 11, "CHI": 7, "CIN": 12, "CLE": 10,
        "DAL": 7, "DEN": 14, "DET": 5, "GB": 10, "HOU": 14, "IND": 14, "JAX": 12, "KC": 6,
        "LAC": 5, "LAR": 6, "LV": 10, "MIA": 6, "MIN": 6, "NE": 14, "NO": 12, "NYG": 11,
        "NYJ": 12, "PHI": 5, "PIT": 9, "SEA": 10, "SF": 9, "TB": 11, "TEN": 5, "WAS": 14
    };

    // ESPN's scoreboard endpoint (see refreshGameTimes below) abbreviates a handful of teams
    // differently than Sleeper/this app do. Washington is the current known mismatch (ESPN:
    // "WSH", everywhere else in this app: "WAS") -- mapped here so State.gameTimesByTeam keys
    // line up with the same team codes used by TEAM_BYES, league.roster, etc.
    export const ESPN_TEAM_ALIASES = { "WSH": "WAS" };

    // Small muted "(T2)" suffix for a rank shown on a player card, when the rankings file that
    // rank came from also had a Tier column (see rankingsParser.js). Returns "" for a missing tier
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
        if (obj.posRank === obj.rank && (obj.posTier ?? null) === (obj.tier ?? null)) return '';
        return ` <span class="mls-rank-sep">&middot;</span> Pos: <strong class="${colorClass}">#${obj.posRank}</strong>${tierTag(obj.posTier)}`;
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
            nameInputId: 'rosNewSetName', deleteBtnId: 'rosDeleteSetBtn',
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
            nameInputId: 'weeklyNewSetName', deleteBtnId: 'weeklyDeleteSetBtn',
            cardId: 'weeklyRankingsCard', headerSetNameId: 'weeklyHeaderSetName',
            leaguesRowId: 'weeklySetLeaguesRow', leaguesSummaryId: 'weeklySetLeaguesSummary',
            label: 'Weekly', staleAfterDays: 6
        }
    };
