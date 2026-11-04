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
// The rank is stored as the file wrote it, and flipped when shown if "My matchup files rank 1 = hardest" is on (Lineup
// settings, State.matchupReversed, KEYS.mls.matchupReversed). Its own switch since round 8 (owner's choice): an SoS
// source and a Weekly source can rank opposite ways. Display only: the optimizer never reads it.
import { State } from './state.js';
import { rankingIndex } from './helpers.js';
import { isSameRankingsWeek } from '../shared/rankings/compare.js';
import { escapeHtml } from '../shared/html.js';
import { opponentBadgeMarkup } from './badges.js';
import { KEYS } from '../shared/storage/keys.js';
import { showToast } from '../shared/ui/toast.js';
import { renderLineupUI } from './main.js';

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

// Whether a set's rows carry any matchup rank (not just opponents): the Lineup settings toggle shows only then.
const _hasRankCache = new WeakMap();
export function rankingsHaveMatchupRanks(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    let has = _hasRankCache.get(rows);
    if (has === undefined) {
        has = rows.some(r => r && Number.isInteger(r.oppRank));
        _hasRankCache.set(rows, has);
    }
    return has;
}

// True when the active league's Weekly rankings have opponents and are this week's.
export function weeklyOpponentsShown(now = Date.now()) {
    return rankingsHaveOpponents(State.weeklyRankings) && isSameRankingsWeek(State.weeklyRankingsUpdatedAt, now);
}

// The rank as the app reads it (1 = easiest), flipped when your files rank 1 = hardest.
export function shownOpponentRank(rank, reversed = State.matchupReversed) {
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
    const on = State.matchupReversed;
    const scale = on ? `${rank} of 32 with your file's order flipped, so 1 = easiest` : `${rank} of 32, where 1 = easiest`;
    return `This week ${where}: ${matchupWords(rank)} for ${pos ? posPlural(pos) : 'his position'} (${scale}). Reads backwards? Turn ${on ? 'off' : 'on'} "My matchup files rank 1 = hardest" in Lineup settings.`;
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

// --- LINEUP SETTINGS: "My matchup files rank 1 = hardest" (round 6, its own switch since round 8) ---
// Shown when the league's Weekly rankings have matchup ranks, or when it's on (so it can be turned off). Called with
// the rankings' meta (rankings/engine.js), so an upload, a set switch or a league switch shows or hides it.
export function renderLineupSettings() {
    const row = document.getElementById('matchupFlipRow');
    if (!row) return;
    row.hidden = !(rankingsHaveMatchupRanks(State.weeklyRankings) || State.matchupReversed);
    const toggle = document.getElementById('matchupReversedToggle');
    if (toggle) toggle.checked = State.matchupReversed;
}

// The toggle: remembered, and the Lineup tab redraws (matchups never change who starts, so no re-optimize, which would
// undo your swaps). Nothing saved is rewritten: ranks are flipped when shown.
export function setMatchupReversed(on) {
    on = !!on;
    if (on === State.matchupReversed) return;
    State.matchupReversed = on;
    localStorage.setItem(KEYS.mls.matchupReversed, on ? '1' : '0');
    renderLineupSettings();
    showToast(on ? 'Matchups flipped: a 1 in your file now shows as 32 (hardest).' : 'Matchups flipped back: a 1 in your file shows as 1 (easiest).');
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'lineupTab') renderLineupUI();
}
