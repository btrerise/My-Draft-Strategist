// --- THIS WEEK'S OPPONENT (improvements S31) ---
// Some Weekly rankings files carry each player's opponent this week ("Opp": "vs KC", "@ KC", "KC") and how
// tough that opponent is for his position ("Matchup", a rank from 1 to 32). The parser stores them on the
// Weekly set's rows (opp, oppHome, oppRank; js/shared/rankings/parse.js), so they live in the set and travel
// with Backup / Restore; there's no storage key of their own. This draws them as a badge on the Lineup tab's
// rows and on the Waiver Wire Assistant's Auto-Find cards when Rank By is Weekly (owner's choices). It takes the
// place of the plain "vs KC" ESPN's scoreboard puts after the kickoff time (getGameInfoHTML, lineup/gameInfo.js),
// so the opponent is named once (owner's choice after a review as a user).
//
// Shown only when the league's Weekly rankings have opponent data and were uploaded this rankings week
// (Tuesday morning to Tuesday morning, isSameRankingsWeek), so last week's matchups never show as this
// week's. Who and where come from ESPN's scoreboard (State.gamesByTeam, refreshGameTimes in state.js) when it
// has his game, else from the file ("vs KC" / "@ KC"; a bare "KC" shows as "KC", no guess).
//
// The rank is stored as the file wrote it; the SoS card's "My SoS files rank 1 = hardest" switch
// (State.sosReversed) flips it when it's shown, so one switch covers every file from a site (owner's choice).
// Display only: the optimizer never reads it.
import { State } from './state.js';
import { rankingIndex } from './helpers.js';
import { isSameRankingsWeek } from '../shared/rankings/compare.js';
import { escapeHtml } from '../shared/html.js';
import { opponentBadgeMarkup } from './badges.js';

// Whether a set's rows carry any opponent data. Cached on the array, like rankingIndex: a new upload or
// a league switch gives State.weeklyRankings a new array.
const _hasOpponentCache = new WeakMap();
export function rankingsHaveOpponents(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    let has = _hasOpponentCache.get(rows);
    if (has === undefined) {
        has = rows.some(r => r && (r.opp || Number.isInteger(r.oppRank)));
        _hasOpponentCache.set(rows, has);
    }
    return has;
}

// True when the active league's Weekly rankings have opponents and are this week's.
export function weeklyOpponentsShown(now = Date.now()) {
    return rankingsHaveOpponents(State.weeklyRankings) && isSameRankingsWeek(State.weeklyRankingsUpdatedAt, now);
}

// The rank as the app reads it (1 = easiest), flipped when your files rank 1 = hardest.
export function shownOpponentRank(rank, reversed = State.sosReversed) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 32) return null;
    return reversed ? 33 - rank : rank;
}

// { opp, home, rank } for a player, or null. row: his Weekly rankings row (may be undefined).
// game: ESPN's { opp, home } for his team this week (may be undefined). The scoreboard wins on who and where;
// the file's rank counts only when the file names the same opponent (or none), so a stale or wrong file
// never puts its rank beside another team. With no scoreboard, the file's opponent, and "vs" / "@" only
// when the file says so (home: null otherwise; owner's choice, no guessing).
export function opponentFor(row, game) {
    let rank = shownOpponentRank(row && row.oppRank);
    if (game && game.opp) {
        if (row && row.opp && row.opp !== game.opp) rank = null;
        return { opp: game.opp, home: typeof game.home === 'boolean' ? game.home : null, rank };
    }
    if (!row || !row.opp) return null;
    return { opp: row.opp, home: typeof row.oppHome === 'boolean' ? row.oppHome : null, rank };
}

const POS_PLURAL = { DEF: 'defenses', K: 'kickers' };
const posPlural = (pos) => POS_PLURAL[pos] || `${pos}s`;

// Plain words for a rank (owner's choice: lead with words, then the number).
export function matchupWords(rank) {
    if (rank <= 8) return 'one of the easiest matchups';
    if (rank >= 25) return 'one of the toughest matchups';
    return 'a middling matchup';
}

// The tap / hover text, plain (escaped by the caller). Only for a ranked matchup.
export function opponentTip({ opp, home, rank }, pos) {
    const where = home === true ? `vs ${opp}` : home === false ? `at ${opp}` : `against ${opp}`;
    const flipped = State.sosReversed ? ' Flipped, since your SoS setting says your files rank 1 = hardest.' : '';
    return `This week ${where}: ${matchupWords(rank)} for ${pos ? posPlural(pos) : 'his position'} (${rank} of 32, where 1 = easiest).${flipped} Already reflected in your Weekly ranks.`;
}

// This week's opponent from the Weekly rankings for a player ({ cleanName, team, pos }), or null when the
// Weekly rankings aren't shown (no opponent data, or not this week's) or have nothing for him.
export function weeklyOpponentInfo(player) {
    if (!player || !player.team || player.team === 'FA' || !weeklyOpponentsShown()) return null;
    const row = rankingIndex(State.weeklyRankings).get(player.cleanName);
    if (!row || (!row.opp && !Number.isInteger(row.oppRank))) return null;
    return opponentFor(row, State.gamesByTeam ? State.gamesByTeam[player.team] : undefined);
}

// The colored badge for a ranked matchup, or "" (the caller then shows the plain "vs KC" text).
export function rankedOpponentBadgeHTML(info, pos) {
    if (!info || info.rank === null) return '';
    return opponentBadgeMarkup(info, escapeHtml(opponentTip(info, pos)));
}
