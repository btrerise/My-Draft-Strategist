// js/tscore/inSeasonParse.js (improvements T1): the In-Season sheet's CSVs, read by header name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { parseInSeasonPlayers, parseInSeasonWeights, InSeasonColumnError } from '../../js/tscore/inSeasonParse.js';

const fixture = (tab) => Papa.parse(readFileSync(new URL(`../fixtures/tscore-inseason/${tab}.csv`, import.meta.url), 'utf8').trim(), { skipEmptyLines: true }).data;
const csv = (text) => Papa.parse(text.trim(), { skipEmptyLines: true }).data;

test('the fixture (the real sheet\'s format) reads into players sorted by ROS rank', () => {
    const wr = parseInSeasonPlayers(fixture('wr'), 'wr');
    assert.equal(wr.length, 21);
    assert.deepEqual(wr[0], { rank: 1, name: 'Puka Nacua', team: 'LA', rosPpg: 22.14, fpg: 24.8, targetShare: '36.1%', move: 1, buySell: '' });
    assert.deepEqual(wr.find(p => p.name === 'A.J. Brown'), { rank: 43, name: 'A.J. Brown', team: 'NE', rosPpg: 9.44, fpg: 6.37, targetShare: '22.0%', move: 38, buySell: 'Buy' });
    assert.equal(wr.filter(p => p.buySell === 'Sell').length, 4);
    assert.equal(parseInSeasonPlayers(fixture('te'), 'te')[3].move, -1);
});

test('header names match whatever the order, case or spacing; blank and note rows are skipped', () => {
    const players = parseInSeasonPlayers(csv(`
Extra,  buy/sell ,TEAM,Player,ros ppg,Target Share,FP/G,Rank Move,ROS  Rank
a,SELL,KC,Tyquan Thornton,9.06,12.7%,11.23,-16,49
,,,,,,,,
Notes row,,,,,,,,
b,buy,DEN,Jaylen Waddle,9.71,20.1%,9.11,+15,41`), 'wr');
    assert.deepEqual(players.map(p => [p.rank, p.name, p.move, p.buySell]), [[41, 'Jaylen Waddle', 15, 'Buy'], [49, 'Tyquan Thornton', -16, 'Sell']]);
});

test('Move falls back to YTD rank minus ROS rank when the sheet has no Rank move', () => {
    const [p] = parseInSeasonPlayers(csv('ROS rank,Player,Team,ROS PPG,FP/G,Target share,YTD rank,Buy/Sell\n43,A.J. Brown,NE,9.44,6.37,22.0%,81,Buy'), 'wr');
    assert.equal(p.move, 38);
});

test('a missing column throws InSeasonColumnError naming every missing one', () => {
    assert.throws(() => parseInSeasonPlayers(csv('Player,Team,ROS PPG\nPuka Nacua,LA,22'), 'wr'), (err) => {
        assert.ok(err instanceof InSeasonColumnError);
        assert.deepEqual(err.missing, ['ROS rank', 'FP/G', 'Target share', 'Buy/Sell', 'Rank move']);
        assert.equal(err.message, 'The WR sheet is missing columns this table needs: ROS rank, FP/G, Target share, Buy/Sell, Rank move.');
        return true;
    });
    assert.throws(() => parseInSeasonPlayers(csv('ROS rank,Player,Team,ROS PPG,FP/G,Buy/Sell,Rank move\n1,A,B,1,1,,0'), 'te'),
        { message: 'The TE sheet is missing a column this table needs: Target share.' });
});

test('a header row with no players is an error, not an empty table', () => {
    assert.throws(() => parseInSeasonPlayers(csv('ROS rank,Player'), 'rb'), { message: 'The RB sheet has no players.' });
    assert.throws(() => parseInSeasonPlayers(csv('ROS rank,Player,Team,ROS PPG,FP/G,Target share,Rank move,Buy/Sell\n,,,,,,,'), 'rb'), { message: 'The RB sheet has no players.' });
});

test('Model Weights: a row per position and the "Fit after week" row', () => {
    const w = parseInSeasonWeights(fixture('weights'));
    assert.equal(w.fitWeek, 9);
    assert.deepEqual(w.byPos.rb, { intercept: 1.4927, xfp: 0.6655, fpoe: 0.4805, lastSeason: 0.1668, noPrior: 1.7096, r2: 0.55, line: 36 });
    assert.deepEqual(Object.keys(w.byPos), ['wr', 'rb', 'te']);
    assert.throws(() => parseInSeasonWeights(csv('Position,Intercept\nWR,1')), InSeasonColumnError);
});
