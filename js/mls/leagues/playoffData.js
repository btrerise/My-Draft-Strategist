// --- PLAYOFF CHANCES: WHAT SYNC SAVES (improvements S55) ---
// league.playoffs, read by sim/playoffOdds.js:
// { start, teams, median, divisions, firstWeek, standings: [{ rid, w, l, t, pf, div }], schedule: { week: [[rid, rid]] },
//   players: { rid: [ids] }, owners: { rid: name } }.
// start: Sleeper's playoff_week_start; teams: playoff_teams; median: the league also plays the median each week;
// divisions: more than one, with each roster's division. firstWeek: the first week the standings don't include yet
// (from the games played: Sleeper updates the records once a week is over). schedule: Sleeper's matchups for the weeks
// from firstWeek to the week before the playoffs (it sets them before the season). A schedule never changes, so the last
// sync's weeks are kept and only missing weeks are fetched. owners: the names Power Rankings shows ('You' for yours).
// null (nothing shown) in a guillotine league, without playoff settings, before anyone has played, once the regular
// season is over, more than MAX_WEEKS_LEFT weeks out (the chances matter most at the end, and it saves a request a week
// per league at sync), or when a week's matchups didn't load (the sync itself goes on).
import { getSleeperMatchups } from '../../shared/api/sleeper.js';

export const MAX_WEEKS_LEFT = 5;

const pts = (r, k) => (Number(r.settings[k]) || 0) + (Number(r.settings[`${k}_decimal`]) || 0) / 100;

// Sleeper's matchups for one week as pairs of roster ids (a roster with no matchup_id has no game).
export function pairsFrom(matchups) {
    const byId = new Map();
    (Array.isArray(matchups) ? matchups : []).forEach(m => {
        if (!m || m.matchup_id == null || m.roster_id == null) return;
        if (!byId.has(m.matchup_id)) byId.set(m.matchup_id, []);
        byId.get(m.matchup_id).push(m.roster_id);
    });
    return [...byId.values()].filter(p => p.length === 2);
}

export async function playoffDataFrom(leagueId, leagueData, rosters, { ownerOf, existing = null, fetchMatchups = getSleeperMatchups } = {}) {
    const ls = (leagueData && leagueData.settings) || {};
    const start = Number(ls.playoff_week_start) || 0;
    const teams = Number(ls.playoff_teams) || 0;
    if (!start || !teams || ls.type === 3) return null;
    const list = (Array.isArray(rosters) ? rosters : []).filter(r => r && r.settings && r.roster_id != null);
    if (list.length < 2) return null;
    const median = ls.league_average_match === 1;
    const divisions = Number(ls.divisions) > 1 && list.every(r => Number(r.settings.division) > 0);
    const standings = list.map(r => ({
        rid: r.roster_id, w: Number(r.settings.wins) || 0, l: Number(r.settings.losses) || 0, t: Number(r.settings.ties) || 0,
        pf: Math.round(pts(r, 'fpts') * 100) / 100, div: divisions ? Number(r.settings.division) : 0,
    }));
    const played = Math.max(...standings.map(s => s.w + s.l + s.t));
    if (!played) return null;
    const weeksDone = Math.round(played / (median ? 2 : 1));
    const firstWeek = (Number(ls.start_week) || 1) + weeksDone;
    const weeksLeft = start - firstWeek;
    if (weeksLeft < 1 || weeksLeft > MAX_WEEKS_LEFT) return null;

    const kept = existing && existing.schedule ? existing.schedule : {};
    const schedule = {};
    for (let w = firstWeek; w < start; w++) {
        if (Array.isArray(kept[w]) && kept[w].length) { schedule[w] = kept[w]; continue; }
        let pairs = [];
        try { pairs = pairsFrom(await fetchMatchups(leagueId, w)); } catch (e) { /* null below */ }
        if (!pairs.length) return null;
        schedule[w] = pairs;
    }
    const players = {}, owners = {};
    list.forEach(r => {
        players[r.roster_id] = (r.players || []).filter(id => id && id !== '0');
        owners[r.roster_id] = ownerOf(r);
    });
    return { start, teams, median, divisions, firstWeek, standings, schedule, players, owners };
}
