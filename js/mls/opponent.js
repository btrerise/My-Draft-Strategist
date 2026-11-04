// --- THIS WEEK'S OPPONENT (improvements S31) ---
// Some Weekly rankings files carry each player's opponent this week ("Opp": "vs KC", "@ KC", "KC") and how
// tough that opponent is for his position ("Matchup", a rank from 1 to 32). The parser stores them on the
// Weekly set's rows (opp, oppHome, oppRank; js/shared/rankings/parse.js), so they live in the set and travel
// with Backup / Restore; there's no storage key of their own. This draws them as a badge on the Lineup tab's
// rows and on the Waiver Wire Assistant's rows when Rank By is Weekly (owner's choices).
//
// Shown only when the league's Weekly rankings have opponent data and were uploaded this rankings week
// (Tuesday morning to Tuesday morning, isSameRankingsWeek), so last week's matchups never show as this
// week's. A row with a rank but no opponent column takes the opponent from ESPN's scoreboard
// (State.gamesByTeam, refreshGameTimes in state.js). "vs" or "@" comes from the file ("vs KC" / "@ KC"),
// else from the scoreboard when it agrees on the opponent, else "vs".
//
// The rank is stored as the file wrote it; the SoS card's "My SoS files rank 1 = hardest" switch
// (State.sosReversed) flips it when it's shown, so one switch covers every file from a site (owner's choice).
// Display only: the optimizer never reads it.
import { State } from './state.js';
import { rankingIndex } from './helpers.js';
import { isSameRankingsWeek } from '../shared/rankings/compare.js';
import { escapeHtml } from '../shared/html.js';
import { opponentBadgeMarkup } from './badges.js';
import { SOS_SCALE_TEXT } from './sosScale.js';

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
// game: ESPN's { opp, home } for his team this week (may be undefined).
export function opponentFor(row, game) {
    const rank = shownOpponentRank(row && row.oppRank);
    const opp = (row && row.opp) || (game && game.opp) || null;
    if (!opp) return null;
    let home = row && typeof row.oppHome === 'boolean' ? row.oppHome : null;
    if (home === null && game && game.opp === opp && typeof game.home === 'boolean') home = game.home;
    return { opp, home, rank };
}

const POS_PLURAL = { DEF: 'defenses', K: 'kickers' };
const posPlural = (pos) => POS_PLURAL[pos] || `${pos}s`;

// The tap / hover text, plain (escaped by the caller).
export function opponentTip({ opp, home, rank }, pos) {
    const where = `${home === false ? 'at' : 'vs'} ${opp}`;
    if (rank === null) return `This week: ${where}. Your Weekly rankings have no matchup rank for him.`;
    const flipped = State.sosReversed ? ' (flipped: your SoS setting says your files rank 1 = hardest)' : '';
    return `This week: ${where}, matchup ${rank} of 32 for ${pos ? posPlural(pos) : 'his position'} (${SOS_SCALE_TEXT})${flipped}, from your Weekly rankings.`;
}

// The badge for one player ({ cleanName, team, pos }), or "" when there's nothing to show.
export function getOpponentBadgeHTML(player) {
    if (!player || !player.team || player.team === 'FA' || !weeklyOpponentsShown()) return '';
    const row = rankingIndex(State.weeklyRankings).get(player.cleanName);
    const game = State.gamesByTeam ? State.gamesByTeam[player.team] : undefined;
    const info = opponentFor(row, game);
    if (!info) return '';
    return opponentBadgeMarkup(info, escapeHtml(opponentTip(info, player.pos)));
}
