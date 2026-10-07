// Regenerates the Sleeper API fixtures in this folder: `node make-fixtures.mjs`.
// One 2-team league (id LEAGUE_ID) owned by user "mds_test", 2026 season, week 2.
// Data is invented but shaped like Sleeper's real responses, trimmed to the fields the apps read.
import { writeFileSync } from 'node:fs';

export const LEAGUE_ID = '1000000000000000001';
const USERS = [
    { user_id: '900001', username: 'mds_test', display_name: 'mds_test' },
    { user_id: '900002', username: 'rival', display_name: 'Rival' },
];

// [id, first, last, pos, team, years_exp]
const PLAYERS = [
    ['4866', "Ja'Marr", 'Chase', 'WR', 'CIN', 5], ['9509', 'Bijan', 'Robinson', 'RB', 'ATL', 3],
    ['6794', 'Justin', 'Jefferson', 'WR', 'MIN', 6], ['9221', 'Jahmyr', 'Gibbs', 'RB', 'DET', 3],
    ['6786', 'CeeDee', 'Lamb', 'WR', 'DAL', 6], ['4892', 'Saquon', 'Barkley', 'RB', 'PHI', 8],
    ['9493', 'Puka', 'Nacua', 'WR', 'LAR', 3], ['11632', 'Malik', 'Nabers', 'WR', 'NYG', 2],
    ['7547', 'Amon-Ra', 'St. Brown', 'WR', 'DET', 5], ['4034', 'Christian', 'McCaffrey', 'RB', 'SF', 9],
    ['11604', 'Brock', 'Bowers', 'TE', 'LV', 2], ['7569', 'Nico', 'Collins', 'WR', 'HOU', 5],
    ['4984', 'Josh', 'Allen', 'QB', 'BUF', 8], ['4881', 'Lamar', 'Jackson', 'QB', 'BAL', 8],
    ['3198', 'Derrick', 'Henry', 'RB', 'BAL', 10], ['7564', 'Drake', 'London', 'WR', 'ATL', 4],
    ['7553', 'Trey', 'McBride', 'TE', 'ARI', 4], ['6904', 'Jalen', 'Hurts', 'QB', 'PHI', 6],
    ['5859', 'A.J.', 'Brown', 'WR', 'PHI', 7], ['9226', "De'Von", 'Achane', 'RB', 'MIA', 3],
    ['7523', 'Garrett', 'Wilson', 'WR', 'NYJ', 4], ['6770', 'Joe', 'Burrow', 'QB', 'CIN', 6],
    ['4217', 'George', 'Kittle', 'TE', 'SF', 9], ['8150', 'Kyren', 'Williams', 'RB', 'LAR', 4],
    ['17', 'Justin', 'Tucker', 'K', 'BAL', 14], ['5095', 'Harrison', 'Butker', 'K', 'KC', 8],
    ['BAL', 'Baltimore', 'Ravens', 'DEF', 'BAL', 0], ['PHI', 'Philadelphia', 'Eagles', 'DEF', 'PHI', 0],
];
// On no roster: the free agents Waiver Insights checks (refactor 3G). tests/fixtures/rankings-waivers.csv
// ranks them after the 24 players in rankings.csv.
const FREE_AGENTS = [
    ['11566', 'Jayden', 'Daniels', 'QB', 'WAS', 2], ['8138', 'James', 'Cook', 'RB', 'BUF', 4],
    ['9224', 'Chase', 'Brown', 'RB', 'CIN', 3], ['9488', 'Jaxon', 'Smith-Njigba', 'WR', 'SEA', 3],
    ['9997', 'Zay', 'Flowers', 'WR', 'BAL', 3], ['9480', 'Sam', 'LaPorta', 'TE', 'DET', 3],
];
const ALL_PLAYERS = [...PLAYERS, ...FREE_AGENTS];
// In the player map only (no stats or projections): a free agent no rankings file ranks, for the
// Trending view's "UR" (improvements S6).
const UNRANKED_FREE_AGENTS = [['10229', 'Tre', 'Tucker', 'WR', 'LV', 3]];

const players = {};
for (const [id, first, last, pos, team, exp] of [...ALL_PLAYERS, ...UNRANKED_FREE_AGENTS]) {
    players[id] = {
        player_id: id, first_name: first, last_name: last, full_name: `${first} ${last}`,
        search_full_name: `${first}${last}`.toLowerCase().replace(/[^a-z]/g, ''),
        position: pos, fantasy_positions: [pos], team, years_exp: exp, status: 'Active', active: true,
        injury_status: null, age: 21 + exp, number: 1,
    };
}

const ids = PLAYERS.map(p => p[0]);
// Alternate players between the two teams so each roster has every position.
const rosterIds = [ids.filter((_, i) => i % 2 === 0), ids.filter((_, i) => i % 2 === 1)];
const rosters = rosterIds.map((pl, i) => ({
    roster_id: i + 1, owner_id: USERS[i].user_id, league_id: LEAGUE_ID, players: pl,
    starters: [], reserve: [], taxi: [],
    settings: { wins: i, losses: 1 - i, ties: 0, fpts: 120 - i * 10, fpts_against: 110 },
}));

const league = {
    league_id: LEAGUE_ID, name: 'Fixture League', season: '2026', status: 'in_season', sport: 'nfl',
    total_rosters: 2, draft_id: '2000000000000000001',
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN'],
    scoring_settings: { rec: 1, pass_td: 4, rush_td: 6, rec_td: 6 },
    settings: { type: 0, playoff_week_start: 15 },
};

// Each team's Sleeper starters, filled slot by slot from its roster in order (refactor 3G), so the
// matchup simulator has an opponent lineup and runs end to end.
const startersFor = (pl) => {
    const left = [...pl];
    const fits = { FLEX: ['RB', 'WR', 'TE'] };
    return league.roster_positions.filter(s => s !== 'BN').map(slot => {
        const i = left.findIndex(id => (fits[slot] || [slot]).includes(PLAYERS.find(x => x[0] === id)[3]));
        return i === -1 ? '0' : left.splice(i, 1)[0];
    });
};
const matchups = rosters.map(r => ({ roster_id: r.roster_id, matchup_id: 1, points: 0, starters: startersFor(r.players), players: r.players }));

// Deterministic pseudo-random points, so variance-based features (sim, boom/bust) have
// something to work with and every run produces the same numbers.
const BASE = { QB: 20, RB: 14, WR: 13, TE: 9, K: 8, DEF: 7 };
function points(id, season, week) {
    let h = 0;
    for (const c of `${id}|${season}|${week}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const p = ALL_PLAYERS.find(x => x[0] === id);
    const ppr = Math.round((BASE[p[3]] * (0.5 + (h % 1000) / 1000)) * 10) / 10;
    return { pts_ppr: ppr, pts_half_ppr: Math.round(ppr * 0.9 * 10) / 10, pts_std: Math.round(ppr * 0.8 * 10) / 10, gp: 1 };
}
const weekFile = (season, week) => Object.fromEntries(ALL_PLAYERS.map(p => [p[0], points(p[0], season, week)]));

// Sleeper's trending adds (players/nfl/trending/add, improvements S6), most adds first as Sleeper sends
// them: free agents (ranked and not), a rostered player the Trending view must leave out, and an id
// the player map doesn't have.
const trendingAdd = [
    { player_id: '9224', count: 8214 },   // Chase Brown, free, ranked
    { player_id: '4866', count: 7012 },   // Ja'Marr Chase, rostered
    { player_id: '10229', count: 5120 },  // Tre Tucker, free, unranked
    { player_id: '9480', count: 2010 },   // Sam LaPorta, free, ranked
    { player_id: '99999', count: 1500 },  // not in the player map
    { player_id: '9997', count: 640 },    // Zay Flowers, free, ranked
];

const out = {
    'players-nfl.json': players,
    'league.json': league,
    'league-users.json': USERS.map(u => ({ ...u, league_id: LEAGUE_ID, metadata: { team_name: `${u.display_name} Team` } })),
    'league-rosters.json': rosters,
    'league-matchups.json': matchups,
    'user.json': USERS[0],
    'user-leagues.json': [league],
    'trending-add.json': trendingAdd,
    'projections-2026-2.json': weekFile('2026-proj', 2),
    'stats-2026-1.json': weekFile('2026', 1),
};
for (let w = 1; w <= 18; w++) out[`stats-2025-${w}.json`] = weekFile('2025', w);
for (const [file, data] of Object.entries(out)) writeFileSync(new URL(file, import.meta.url), JSON.stringify(data, null, 1) + '\n');
console.log('wrote', Object.keys(out).join(', '));
