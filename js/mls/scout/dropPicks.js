// --- WHO SHOULD I DROP? THE APP'S SIDE (improvements S54) ---
// Builds scout/droppable.js's input for a league from the app's state, and shows a player's reasons in the shared sheet.
// Used by the Roster tab ("Drop 1"/"Drop 2"/"Drop 3" badges, render/roster.js) and Auto-Find's Whole Roster lens
// (its drop candidate, scout/waivers.js), so the two always agree.
//   Rankings: the league's ROS set (State.rosRankings; a dynasty league's dynasty set), with display ranks as the rows
//     show them. This week: Weekly when loaded, else in a dynasty or keeper league its In-Season set.
//   Power Rankings: your place at each position, from the Roster tab's own source (S29's table).
//   Sleeper's trending adds and ages load in the background; the first one to land redraws (`rerender`), once.
import { State } from '../state.js';
import { escapeHtml } from '../../shared/html.js';
import { getActiveLeague, isUnavailableThisWeek, lineupWeek, rankingIndex } from '../helpers.js';
import { getSleeperTrendingAdds } from '../../shared/api/sleeper.js';
import { displayRanksFor, leagueRankDisplayIndex } from '../rankings/displayRanks.js';
import { seasonSetFor } from '../rankings/season.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';
import { computePositionalPower } from '../power/shared.js';
import { resolvePowerRankingsSource } from '../power/rosterCard.js';
import { ageFromMeta } from '../power/futureValue.js';
import { getSleeperMetaByName, lineupCheckDeps, sleeperMetaByNameIfLoaded } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isWeekOver } from './waiverStatus.js';
import { openSheet } from '../../shared/ui/sheet.js';
import { protectedText, rankDroppable } from './droppable.js';

const TRENDING = { lookbackHours: 24, limit: 50 };    // Top Available's request (S6), so the cache is shared
let trendById = null;
let trendAsked = 0;
const waiting = new Set();

// Starts a background load and redraws once with `rerender` when it lands.
function whenLoaded(promise, rerender) {
    if (!rerender || waiting.has(rerender)) return;
    waiting.add(rerender);
    promise.then(() => rerender(), () => {}).finally(() => waiting.delete(rerender));
}

function trendingMap(rerender) {
    if (!trendById && Date.now() - trendAsked > 5 * 60 * 1000) {
        trendAsked = Date.now();
        whenLoaded(getSleeperTrendingAdds(TRENDING).then(rows => {
            trendById = new Map(rows.map(r => [String(r.player_id), r.count]));
        }, err => { console.warn('Who to drop: Sleeper trending adds unavailable.', err); throw err; }), rerender);
    }
    return trendById;
}

function ranksFrom(rankings, league, rerender) {
    if (!rankings || rankings.length === 0) return null;
    const index = rankingIndex(rankings);
    const display = leagueRankDisplayIndex(league, rankings, rerender);
    return (clean) => {
        const o = index.get(clean);
        if (!o) return null;
        const shown = displayRanksFor(display, clean, { posRank: o.posRank ?? 999, posTier: o.posTier ?? o.tier ?? null });
        return { posRank: shown.posRank ?? 999, posTier: shown.posTier ?? null };
    };
}

function yourPowerPlaces(league) {
    if (!isFullyMappedLeague(league) || !league.globalPosMap) return { places: null, teams: null };
    const src = resolvePowerRankingsSource();
    if (!src) return { places: null, teams: null };
    const teams = computePositionalPower(league, src.rankings, { startRankings: src.start });
    const you = teams.find(t => t.owner === 'You');
    if (!you) return { places: null, teams: teams.length || null };
    return { places: { QB: you.qbRank, RB: you.rbRank, WR: you.wrRank, TE: you.teRank }, teams: teams.length };
}

// The drop order for a league (the active one by default), or null without rankings or a roster.
export function dropPicksFor(league = getActiveLeague(), rerender = null) {
    if (!league || !Array.isArray(league.roster) || league.roster.length === 0) return null;
    const dynasty = getPowerLeagueKind(league) === 'dynasty';
    const rosOf = ranksFrom(State.rosRankings, league, rerender);
    const season = dynasty && State.weeklyRankings.length === 0 && State.rosRankings.length > 0 ? seasonSetFor(league, State.rankingSets.ros) : null;
    const nowOf = State.weeklyRankings.length > 0 ? ranksFrom(State.weeklyRankings, league, rerender) : season ? ranksFrom(season.data, league, rerender) : null;
    if (!rosOf && !nowOf) return null;

    const meta = sleeperMetaByNameIfLoaded();
    if (!meta && dynasty) whenLoaded(getSleeperMetaByName(), rerender);
    const trend = trendingMap(rerender);
    const kickoffs = State.gameTimesFetchedForWeek === State.currentNflWeek ? State.gameTimesByTeam : null;
    const weekOver = isWeekOver(kickoffs, Date.now());
    const byeWeek = lineupWeek(weekOver);
    const deps = lineupCheckDeps(league.leagueId, {}, { weekOver });
    const { places, teams } = yourPowerPlaces(league);
    const teamCount = teams || (league.globalRosterMap ? new Set(Object.values(league.globalRosterMap)).size : 0) || 12;

    const players = league.roster.map(p => {
        const m = meta && meta[p.cleanName];
        return {
            ...p,
            ros: rosOf ? rosOf(p.cleanName) : null,
            now: nowOf ? nowOf(p.cleanName) : null,
            onBye: byeWeek != null && isUnavailableThisWeek({ team: p.team }, byeWeek),
            locked: !!deps.isLocked(p),
            age: m ? ageFromMeta(m) : null,
            trending: (trend && trend.get(String(p.id))) || 0
        };
    });
    return rankDroppable({
        players, reqs: league.reqs, teamCount, powerRank: places, dynasty, hasRos: !!rosOf,
        keeper: league.leagueType === 'keeper', nowLabel: State.weeklyRankings.length > 0 ? 'Wk' : 'In-Season'
    });
}

// "Drop 1" on the Roster tab: what the badge means for this player, in the shared sheet.
export const openDropReasons = function(btn) {
    const league = getActiveLeague();
    const result = dropPicksFor(league);
    if (!result || !btn) return;
    const at = result.picks.findIndex(x => String(x.player.id) === String(btn.dataset.id));
    if (at < 0) return;
    const pick = result.picks[at];
    const item = (x) => `<li><strong>${escapeHtml(x.player.name)}</strong> <span class="mls-drop-score">${x.score}</span>
        <div class="mls-drop-why">${escapeHtml(x.reasons.join(' · '))}</div></li>`;
    const body = `
        <p class="mls-drop-lead"><strong>${escapeHtml(pick.player.name)}</strong> is your number ${at + 1} drop: ${escapeHtml(pick.reasons.join(' · '))}.</p>
        <ol class="mls-drop-list">${result.picks.slice(0, 5).map(item).join('')}</ol>
        ${result.protected.length ? `<p class="mls-drop-note">Not suggested: ${escapeHtml(protectedText(result.protected))}.</p>` : ''}
        ${result.note ? `<p class="mls-drop-note">${escapeHtml(result.note)}</p>` : ''}
        <p class="mls-drop-note">Higher score = drop first (out of 100). Your ROS rank against the league's starters at his position counts most (Weekly a quarter of it), then your depth there, your Power Rankings place there, and upside: trending adds, tier and, in dynasty, age. The app doesn't make the move on Sleeper.</p>`;
    openSheet({ title: 'Who to drop', body, opener: btn });
};
