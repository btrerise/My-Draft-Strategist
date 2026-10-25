// Season rankings for dynasty and keeper leagues (improvements S23): the resolver in
// js/mls/rankings/season.js and the split Start / rooms / Future sources in computePositionalPower.
// season.js imports power/directionLabels.js, which imports power/shared.js: powerEnv.mjs stubs that
// module's two app imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPower } from './helpers/powerEnv.mjs';

await loadPower();
const season = await import('../../js/mls/rankings/season.js');
const { computePositionalPower } = await loadPower();

const DYN = { id: 'dyn', name: 'Dynasty SF', updatedAt: 10, data: [{ cleanName: 'a', name: 'A', rank: 1 }] };
const RED = { id: 'red', name: 'Redraft ROS', updatedAt: 20, data: [{ cleanName: 'b', name: 'B', rank: 1 }] };
const SETS = [DYN, RED];
const dynasty = (extra = {}) => ({ leagueId: 'd1', leagueType: 'dynasty', rosRankingSetId: 'dyn', ...extra });
const redraft = (extra = {}) => ({ leagueId: 'r1', leagueType: 'redraft', rosRankingSetId: 'red', ...extra });
const rosFound = { data: DYN.data, updatedAt: 10, setName: 'Dynasty SF' };

test('only dynasty and keeper leagues have a Season slot', () => {
    assert.equal(season.hasSeasonSlot(dynasty()), true);
    assert.equal(season.hasSeasonSlot({ leagueType: 'keeper' }), true);
    assert.equal(season.hasSeasonSlot({ formatBadge: 'Dynasty PPR' }), true);
    assert.equal(season.hasSeasonSlot(redraft()), false);
    assert.equal(season.hasSeasonSlot(null), false);
});

test('this season = the Season set, else the ROS rankings as they are', () => {
    const withSet = season.resolveSeasonRankings(dynasty({ seasonRankingSetId: 'red' }), SETS, rosFound);
    assert.equal(withSet.data, RED.data);
    assert.equal(withSet.setName, 'Redraft ROS');
    assert.equal(withSet.fromSeason, true);

    const none = season.resolveSeasonRankings(dynasty(), SETS, rosFound);
    assert.equal(none.data, DYN.data);
    assert.equal(none.fromSeason, false);

    // A deleted set, or a league that's no longer dynasty, falls back the same way.
    assert.equal(season.resolveSeasonRankings(dynasty({ seasonRankingSetId: 'gone' }), SETS, rosFound).fromSeason, false);
    assert.equal(season.resolveSeasonRankings(redraft({ seasonRankingSetId: 'red' }), SETS, rosFound).fromSeason, false);
    assert.equal(season.resolveSeasonRankings(dynasty(), SETS, null), null);
    // The league's own dynasty set as In-Season counts as none.
    assert.equal(season.seasonSetFor(dynasty({ seasonRankingSetId: 'dyn' }), SETS), null);
    assert.deepEqual(season.setUsage('dyn', [dynasty({ seasonRankingSetId: 'dyn' })]), { used: 1, asSeason: 0 });
});

test('the stamp part is empty without a Season set and names the set with one', () => {
    assert.equal(season.seasonStamp(dynasty(), SETS), '');
    assert.equal(season.seasonStamp(redraft({ seasonRankingSetId: 'red' }), SETS), '');
    assert.equal(season.seasonStamp(dynasty({ seasonRankingSetId: 'red' }), SETS), '|season:red@20');
});

test("rooms use Season only with I'm competing and a Season set", () => {
    assert.equal(season.roomsUseSeason(dynasty({ seasonRankingSetId: 'red' }), SETS), false);
    assert.equal(season.roomsUseSeason(dynasty({ seasonRankingSetId: 'red', powerCompeting: true }), SETS), true);
    assert.equal(season.roomsUseSeason(dynasty({ powerCompeting: true }), SETS), false);
});

test('usage counts both slots; the offer is the set redraft leagues use most', () => {
    const leagues = [
        dynasty({ seasonRankingSetId: 'red' }),
        dynasty({ leagueId: 'd2' }),
        redraft(), redraft({ leagueId: 'r2' }),
    ];
    assert.deepEqual(season.setUsage('red', leagues), { used: 3, asSeason: 1 });
    assert.deepEqual(season.setUsage('dyn', leagues), { used: 2, asSeason: 0 });
    assert.equal(season.seasonOffer(leagues[1], leagues, SETS).id, 'red');
    assert.equal(season.seasonOffer(leagues[0], leagues, SETS), null); // already has one
    assert.equal(season.seasonOffer(redraft(), leagues, SETS), null); // no slot
    assert.equal(season.seasonOffer(dynasty(), [dynasty()], SETS), null); // no redraft league with a set
    assert.deepEqual(season.leaguesWithoutSeason(leagues, SETS, 'none').map(l => l.leagueId), ['d2']);
});

// Two teams, one RB each and one WR each. By the dynasty list You are better; by the season list Them.
const league = {
    reqs: { QB: 0, RB: 1, WR: 1, TE: 0, FLEX: 0, SFLEX: 0 },
    globalRosterMap: { rb1: 'You', wr1: 'You', rb2: 'Them', wr2: 'Them' },
    globalPosMap: { rb1: 'RB', wr1: 'WR', rb2: 'RB', wr2: 'WR' },
};
const list = (order) => order.map((cleanName, i) => ({ cleanName, name: cleanName, rank: i + 1 }));
const dynastyList = list(['rb1', 'wr1', 'rb2', 'wr2']);
const seasonList = list(['rb2', 'wr2', 'rb1', 'wr1']);
const byOwner = (teams) => Object.fromEntries(teams.map(t => [t.owner, t]));

test('Start reads startRankings; Ovr and rooms read rankings; Future reads futureRankings', () => {
    const t = byOwner(computePositionalPower(league, dynastyList, {
        startRankings: seasonList, futureRankings: dynastyList, future: { mode: 'age', ages: {} } }));
    assert.equal(t.Them.starterRank, 1);
    assert.equal(t.You.overallRank, 1);
    assert.equal(t.You.rbRank, 1);
    assert.equal(t.You.futureRank, 1);
    assert.equal(t.Them.starters[0].rank, 1); // the Start tooltip shows Season ranks
    assert.equal(t.You.startSeparate, true);
});

test('without separate lists the numbers are what they were', () => {
    const before = computePositionalPower(league, dynastyList, { future: { mode: 'age', ages: {} } });
    const same = computePositionalPower(league, dynastyList, { startRankings: dynastyList, futureRankings: dynastyList, future: { mode: 'age', ages: {} } });
    const strip = (teams) => teams.map(({ startSeparate, ...rest }) => rest);
    assert.deepEqual(strip(same), strip(before));
    assert.equal(before[0].startSeparate, false);
});
