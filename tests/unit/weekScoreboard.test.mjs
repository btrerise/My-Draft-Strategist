// The This week card's rules (improvements S21, js/mls/week/scoreboard.js): who's live, what's a swing, the
// league median, guillotine places, the headline's splits, the order of the swings, and the season record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    starterState, reachOf, sideSummary, classifyMatchup, resultOf, medianPlace, guillotinePlace, summarize, recordText,
    swingOrder, teamNamesFrom, playsMedian, isGuillotine, seasonRecord, ordinal,
} from '../../js/mls/week/scoreboard.js';

const p = (pos, points, gameState, extra = {}) => ({ id: `${pos}${points}${gameState}`, name: pos, pos, team: 'MIN', points, gameState, onBye: false, out: false, ...extra });
const side = (points, starters, opts = {}) => sideSummary({ points, starters, ...opts });

test('a starter is live until his game is final; bye, no team or Out is a dead slot', () => {
    assert.equal(starterState(p('WR', 0, 'pre')), 'live');
    assert.equal(starterState(p('WR', 7, 'in')), 'live');
    assert.equal(starterState(p('WR', 0, null)), 'live'); // game state unknown: still counts as live
    assert.equal(starterState(p('WR', 0, 'post')), 'done');
    assert.equal(starterState(p('WR', 0, 'pre', { onBye: true })), 'dead');
    assert.equal(starterState(p('WR', 0, 'pre', { out: true })), 'dead');
    assert.equal(starterState(p('WR', 0, 'pre', { team: null })), 'dead');
});

test('reach: the position\'s typical output less what he has scored', () => {
    assert.equal(reachOf(p('QB', 0, 'pre')), 20);
    assert.equal(reachOf(p('QB', 18, 'in')), 2);
    assert.equal(reachOf(p('WR', 0, 'pre')), 15);
    assert.equal(reachOf(p('TE', 10, 'in')), 0);
    assert.equal(reachOf(p('K', 0, 'pre')), 8);
});

test('trailing by 12 with a live WR is a swing; trailing with nobody live is decided', () => {
    const me = side(98, [p('WR', 0, 'pre'), p('QB', 22, 'post')]);
    const them = side(110, [p('QB', 24, 'post')]);
    const m = classifyMatchup(me, them);
    assert.deepEqual([m.margin, m.lead, m.status, resultOf(m)], [-12, 'opp', 'swing', 'L']);

    const lead = classifyMatchup(side(130.4, [p('WR', 0, 'pre')]), side(95.2, [p('QB', 20, 'post')]));
    assert.deepEqual([lead.status, resultOf(lead)], ['decided', 'W']); // leading while the opponent has nobody left
});

test('a lead under 25 is in play while the trailing side has someone; a bigger gap than the reach is decided', () => {
    // Trailing by 20 with a TE left (reach 8): under 25, so still in play.
    assert.equal(classifyMatchup(side(80, [p('TE', 0, 'pre')]), side(100, [p('QB', 1, 'post')])).status, 'swing');
    // Trailing by 30 with a TE left: decided.
    assert.equal(classifyMatchup(side(70, [p('TE', 0, 'pre')]), side(100, [p('QB', 1, 'post')])).status, 'decided');
    // Trailing by 30 with a QB and a WR left (reach 35): in play.
    assert.equal(classifyMatchup(side(70, [p('QB', 0, 'pre'), p('WR', 0, 'pre')]), side(100, [])).status, 'swing');
    // Tied with someone live: in play. Nobody live anywhere: done.
    assert.equal(classifyMatchup(side(90, [p('WR', 0, 'pre')]), side(90, [])).status, 'swing');
    const done = classifyMatchup(side(90, [p('WR', 9, 'post')]), side(91, [p('WR', 9, 'post')]));
    assert.deepEqual([done.status, resultOf(done)], ['done', 'L']);
});

test('Best Ball: a live bench player counts, since the lineup picks itself', () => {
    const me = side(90, [p('WR', 0, 'post')], { bestBall: true, bench: [p('RB', 0, 'pre')] });
    assert.equal(me.liveBench.length, 1);
    assert.equal(me.reach, 15);
    assert.equal(classifyMatchup(me, side(100, [])).status, 'swing');
    // Not Best Ball: the bench is ignored.
    assert.equal(side(90, [p('WR', 0, 'post')], { bench: [p('RB', 0, 'pre')] }).liveBench.length, 0);
});

test('the league median: your place among every team\'s points', () => {
    assert.deepEqual(medianPlace(120, [130, 120, 110, 100]), { rank: 2, of: 4, above: true });
    assert.deepEqual(medianPlace(110, [130, 120, 110, 100]), { rank: 3, of: 4, above: false });
});

test('guillotine: your place among the teams still alive and the cushion over the lowest', () => {
    const teams = [{ points: 100, alive: true }, { points: 90, alive: true }, { points: 80, alive: true }, { points: 0, alive: false }];
    assert.deepEqual(guillotinePlace(90, teams), { rank: 2, of: 3, cushion: 10 });
    assert.deepEqual(guillotinePlace(80, teams), { rank: 3, of: 3, cushion: -10 }); // lowest: behind the next team
    assert.equal(guillotinePlace(0, teams, false), null); // chopped
});

test('the headline: W-L split paid / free and redraft / dynasty, keeper with redraft', () => {
    const s = summarize([
        { result: 'W', paid: true, group: 'dynasty', status: 'decided' },
        { result: 'L', paid: false, group: 'redraft', status: 'swing' },
        { result: 'W', paid: false, group: 'redraft', keeper: true, status: 'done' },
        { result: 'T', paid: false, group: 'redraft', status: 'swing' },
    ]);
    assert.equal(recordText(s.all), '2–1–1');
    assert.equal(recordText(s.paid), '1–0');
    assert.equal(recordText(s.free), '1–1–1');
    assert.equal(recordText(s.redraft), '1–1–1');
    assert.equal(recordText(s.dynasty), '1–0');
    assert.equal(s.stillLive, 2);
    assert.equal(s.keeper, true);
});

test('swings: the most uncertain first by win chance, then the smallest gap', () => {
    const rows = [
        { name: 'a', margin: -5, winChance: 10 },  // 10% upset chance
        { name: 'b', margin: 20, winChance: 55 },  // 45%
        { name: 'c', margin: -2, winChance: null },
        { name: 'd', margin: -1, winChance: null },
    ];
    assert.deepEqual(rows.sort(swingOrder).map(r => r.name), ['b', 'a', 'd', 'c']);
});

test('from a sync: team names, median, guillotine and your season record', () => {
    const users = [{ user_id: 'u1', display_name: 'BTrerise' }, { user_id: 'u2', display_name: 'Rival' }];
    const rosters = [
        { roster_id: 1, owner_id: 'u1', settings: { wins: 5, losses: 2, ties: 0, fpts: 812, fpts_decimal: 40, fpts_against: 760, fpts_against_decimal: 10 } },
        { roster_id: 2, owner_id: 'u2', settings: { wins: 2, losses: 5, ties: 0, fpts: 900, fpts_against: 700 } },
        { roster_id: 3, owner_id: null, settings: { wins: 0, losses: 0, ties: 0, fpts: 600, fpts_against: 800 } },
    ];
    assert.deepEqual(teamNamesFrom(users, rosters), { 1: 'BTrerise', 2: 'Rival', 3: 'Team 3' });
    assert.equal(playsMedian({ league_average_match: 1 }), true);
    assert.equal(playsMedian({ league_average_match: 0 }), false);
    assert.equal(isGuillotine({ type: 3 }), true);
    assert.equal(isGuillotine({ type: 0 }), false);
    assert.deepEqual(seasonRecord(rosters, 1), { wins: 5, losses: 2, ties: 0, pf: 812.4, pa: 760.1, pfRank: 2, paRank: 2, of: 3 });
    // Nobody has played (a guillotine league's rosters, or week 1): no record.
    assert.equal(seasonRecord([{ roster_id: 1, settings: { wins: 0, losses: 0, ties: 0 } }], 1), null);
    assert.equal(seasonRecord(rosters, 9), null);
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
});
