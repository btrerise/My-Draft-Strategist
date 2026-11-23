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
import { getActiveLeague, isBestBallLeague, isUnavailableThisWeek, lineupWeek, rankingIndex } from '../helpers.js';
import { _rookieIndex, getRookieIndex, isRookiePlayer } from '../render/rookies.js';
import { getSleeperTrendingAdds } from '../../shared/api/sleeper.js';
import { displayRanksFor, leagueRankDisplayIndex } from '../rankings/displayRanks.js';
import { seasonSetFor } from '../rankings/season.js';
import { getPowerLeagueKind } from '../power/directionLabels.js';
import { computePositionalPower } from '../power/shared.js';
import { resolvePowerRankingsSource } from '../power/rosterCard.js';
import { ageFromMeta } from '../power/futureValue.js';
import { autoFindWaiverUpgrades, getSleeperMetaByName, sleeperMetaByNameIfLoaded, updateWaiverScanSetting } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isWeekOver } from './waiverStatus.js';
import { closeSheet, openSheet } from '../../shared/ui/sheet.js';
import { showTab } from '../main.js';
import { setWaiverMode } from './topAvailable.js';
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

// The drop order for the active league, or null without rankings or a roster. Only the active league: State's
// rankings are the active league's, so any other league would be scored with the wrong sets (round 5; the owner's
// backup review caught a script doing that). Pass a copy of the active league (same leagueId) to vary it in a test.
export function dropPicksFor(league = getActiveLeague(), rerender = null) {
    if (!league || league.leagueId !== State.activeLeagueId) return null;
    if (!Array.isArray(league.roster) || league.roster.length === 0) return null;
    const dynasty = getPowerLeagueKind(league) === 'dynasty';
    const rosOf = ranksFrom(State.rosRankings, league, rerender);
    // This season (round 5): a dynasty league's In-Season set when it has one (its rows show it, and a 200-player
    // dynasty set leaves deep benches unranked), else Weekly. Weekly still feeds the breakout check either way.
    const season = dynasty && State.rosRankings.length > 0 ? seasonSetFor(league, State.rankingSets.ros) : null;
    const weekOf = State.weeklyRankings.length > 0 ? ranksFrom(State.weeklyRankings, league, rerender) : null;
    const nowOf = season ? ranksFrom(season.data, league, rerender) : weekOf;
    if (!rosOf && !nowOf) return null;
    const rookies = _rookieIndex;
    if (!rookies) whenLoaded(getRookieIndex(), rerender);

    const meta = sleeperMetaByNameIfLoaded();
    if (!meta && dynasty) whenLoaded(getSleeperMetaByName(), rerender);
    const trend = trendingMap(rerender);
    const kickoffs = State.gameTimesFetchedForWeek === State.currentNflWeek ? State.gameTimesByTeam : null;
    const weekOver = isWeekOver(kickoffs, Date.now());
    const byeWeek = lineupWeek(weekOver);
    // Only locks you set (round 4, the owner's review): a kickoff lock is over by the time a claim runs.
    const locks = new Set((State.lockedPlayersMap[league.leagueId] || []).map(String));
    const { places, teams } = yourPowerPlaces(league);
    // A manual league knows only your roster (round 4: it read as 2 teams, so RB13 was "outside the starters"): 12.
    const teamCount = isFullyMappedLeague(league)
        ? (teams || (league.globalRosterMap ? new Set(Object.values(league.globalRosterMap)).size : 0) || 12) : 12;

    const players = league.roster.map(p => {
        const m = meta && meta[p.cleanName];
        return {
            ...p,
            ros: rosOf ? rosOf(p.cleanName) : null,
            now: nowOf ? nowOf(p.cleanName) : null,
            week: weekOf ? weekOf(p.cleanName) : null,
            rookie: isRookiePlayer(p, rookies),
            onBye: byeWeek != null && isUnavailableThisWeek({ team: p.team }, byeWeek),
            locked: locks.has(String(p.id)),
            age: m ? ageFromMeta(m) : null,
            trending: (trend && trend.get(String(p.id))) || 0
        };
    });
    return rankDroppable({
        players, reqs: league.reqs, teamCount, powerRank: places, dynasty, hasRos: !!rosOf,
        keeper: league.leagueType === 'keeper', nowLabel: season ? 'In-Season' : 'Wk', bestBall: isBestBallLeague(league)
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
    // Round 3 (the owner's review): the verdict first, the facts once under it, and a way on to the claim. The list
    // shows each player's short verdict, no scores (a bare number had no scale), with this player marked.
    const item = (x, i) => `<li${i === at ? ' class="is-current" aria-current="true"' : ''}><strong>${escapeHtml(x.player.name)}</strong>
        <div class="mls-drop-why">${escapeHtml(x.short)}</div></li>`;
    const canFind = REPLACEABLE.includes(pick.player.pos);
    const body = `
        <p class="mls-drop-lead"><strong>${escapeHtml(pick.player.name)}</strong> is your number ${at + 1} drop. ${escapeHtml(pick.verdict)}</p>
        <p class="mls-drop-facts">${escapeHtml(pick.reasons.join(' · '))}</p>
        ${canFind ? `<button type="button" class="btn btn-primary mls-drop-find" data-pos="${escapeHtml(pick.player.pos)}">Find his replacement</button>` : ''}
        <h3 class="mls-drop-heading">Your drop order</h3>
        <ol class="mls-drop-list">${result.picks.slice(0, 5).map(item).join('')}</ol>
        ${result.protected.length ? `<p class="mls-drop-note">Not suggested: ${escapeHtml(protectedText(result.protected))}.</p>` : ''}
        ${result.note ? `<p class="mls-drop-note">${escapeHtml(result.note)}</p>` : ''}
        <p class="mls-drop-note">How it's ordered: his rank against the league's starters at his position counts most (ROS, or your dynasty rankings in a dynasty league, with this season's rank a quarter of it), then your depth there, your Power Rankings place there, and upside: trending adds, tier, a rookie, a big week in this week's rankings and, in dynasty, age. Never suggested: IR, taxi, or a player you locked. The app doesn't make the move on Sleeper.</p>`;
    openSheet({ title: 'Who to drop', body, opener: btn, className: 'mls-drop-sheet' });
    // The sheet sits outside the containers delegate() watches (as the Lineup details sheet's lock button).
    const find = document.querySelector('.mls-drop-sheet .mls-drop-find');
    if (find) find.addEventListener('click', () => findDropReplacement(find));
};

// Positions Auto-Find's position filter takes (its FLEX and ALL aside).
const REPLACEABLE = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// "Find his replacement" (round 3): Auto-Find, Whole Roster, at his position, run straight away. Its drop candidate is
// the same player (the drop order within the position), so the list is who ranks ahead of him.
async function findDropReplacement(btn) {
    const pos = btn && btn.dataset.pos;
    if (!REPLACEABLE.includes(pos)) return;
    await closeSheet({ restoreFocus: false });
    setWaiverMode('auto');          // clears the last results, as switching by hand does
    updateWaiverScanSetting('compare', 'roster');
    updateWaiverScanSetting('pos', pos);
    const shown = showTab('scout');
    await autoFindWaiverUpgrades(document.querySelector('[data-action="autoFindWaiverUpgrades"]'));
    // Straight to the answer (round 4): on a phone the results sit a screen and a half below the controls. After the
    // tab's own scroll to the top, as scoutGoToLeague and goToPowerRankings wait for it.
    await Promise.resolve(shown);
    setTimeout(() => {
        const out = document.getElementById('waiverOutput');
        if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
}
