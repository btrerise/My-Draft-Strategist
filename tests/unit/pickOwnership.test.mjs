// Who holds which rookie-draft pick (improvements S19, round 2): js/mls/leagues/picks.js, built at sync from
// Sleeper's traded picks for dynasty and keeper leagues.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickHolders, pickKey, pickName, pickOwnership, picksAfterTrade, tablePickRank } from '../../js/mls/leagues/picks.js';

const rosters = [{ rosterId: 1, owner: 'You' }, { rosterId: 2, owner: 'Rival' }, { rosterId: 3, owner: 'Third' }];
const names = (list) => list.map(p => p.from ? `${p.name} (${p.from})` : p.name);

test('every team holds its own picks when nothing was traded', () => {
    const picks = pickOwnership({ rosters, tradedPicks: [], seasons: [2027, 2028], rounds: 2 });
    assert.deepEqual(names(picks.Rival), ['2027 1st', '2027 2nd', '2028 1st', '2028 2nd']);
    assert.deepEqual(Object.keys(picks).sort(), ['Rival', 'Third', 'You']);
});

test('a traded pick moves to the roster that holds it now, marked with whose it was', () => {
    const traded = [
        { season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }, // Rival's 1st -> you
        { season: '2027', round: 2, roster_id: 1, previous_owner_id: 1, owner_id: 3 }, // your 2nd -> Third
        { season: '2028', round: 1, roster_id: 3, previous_owner_id: 2, owner_id: 2 }, // Third's 1st, via you, -> Rival
    ];
    const picks = pickOwnership({ rosters, tradedPicks: traded, seasons: [2027, 2028], rounds: 2 });
    assert.deepEqual(names(picks.You), ['2027 1st', '2027 1st (Rival)', '2028 1st', '2028 2nd']);
    assert.deepEqual(names(picks.Rival), ['2027 2nd', '2028 1st', '2028 1st (Third)', '2028 2nd']);
    assert.deepEqual(names(picks.Third), ['2027 1st', '2027 2nd (You)', '2027 2nd', '2028 2nd']);
});

test('rounds: the league\'s, at most 4 (the ones with names and market values); traded picks for other drafts ignored', () => {
    const picks = pickOwnership({ rosters: rosters.slice(0, 1), tradedPicks: [{ season: '2031', round: 1, roster_id: 1, owner_id: 2 }], seasons: [2027], rounds: 6 });
    assert.deepEqual(names(picks.You), ['2027 1st', '2027 2nd', '2027 3rd', '2027 4th']);
    assert.equal(pickName(2027, 3), '2027 3rd');
    // No rounds setting: 4.
    assert.equal(pickOwnership({ rosters: rosters.slice(0, 1), tradedPicks: [], seasons: [2027] }).You.length, 4);
});

test('a pick traded to a roster nobody owns is left out', () => {
    const picks = pickOwnership({ rosters: rosters.slice(0, 2), tradedPicks: [{ season: '2027', round: 1, roster_id: 1, owner_id: 9 }], seasons: [2027], rounds: 1 });
    assert.deepEqual(names(picks.You), []);
    assert.deepEqual(names(picks.Rival), ['2027 1st']);
});

test('pickHolders: who holds a pick by name; null without synced picks', () => {
    const picks = pickOwnership({ rosters, tradedPicks: [{ season: '2027', round: 1, roster_id: 2, owner_id: 1 }], seasons: [2027], rounds: 1 });
    assert.deepEqual(pickHolders(picks, '2027 1st'), ['You', 'Third']);
    assert.deepEqual(pickHolders(picks, '2027 2nd'), []);
    // Who holds a pick ignores Early / Mid / Late (Sleeper's picks are plain).
    assert.deepEqual(pickHolders(picks, '2027 1st (Late)'), ['You', 'Third']);
    assert.equal(pickHolders(null, '2027 1st'), null);
});

test('pickKey: year and round, so 2027 and 2029 picks never match (player names are matched without digits)', () => {
    assert.equal(pickKey('2027 1st'), 'pick 2027 1st');
    // Market Consensus prices Early / Mid / Late and plain picks apart (round 4): the key keeps the tier.
    assert.equal(pickKey('2027 1st (Early)'), 'pick 2027 1st early');
    assert.equal(pickKey('2027 Late 1st'), 'pick 2027 1st late');
    assert.notEqual(pickKey('2027 1st'), pickKey('2027 1st (Mid)'));
    assert.equal(pickKey('2027 1st (Early)', { tier: false }), 'pick 2027 1st');
    assert.notEqual(pickKey('2027 1st'), pickKey('2029 1st'));
    assert.notEqual(pickKey('2027 1st'), pickKey('2027 2nd'));
    assert.equal(pickKey('Bijan Robinson'), null);
});

test('tablePickRank: a 1st like the 48th player, later rounds and drafts further down', () => {
    assert.equal(tablePickRank(1, 0), 48);
    assert.equal(tablePickRank(2, 0), 100);
    assert.equal(tablePickRank(4, 0), 230);
    assert.equal(tablePickRank(1, 2), 62);
    assert.ok(tablePickRank(1, 1) < tablePickRank(2, 0));
});

test('picksAfterTrade: picks you give go to the partner, picks you get come to you, marked moved', () => {
    const picks = { You: [{ name: '2027 1st' }, { name: '2027 1st', from: 'Rival' }], Rival: [{ name: '2027 2nd' }], Third: [{ name: '2028 3rd' }] };
    const after = picksAfterTrade(picks, { give: ['2027 1st'], get: ['2027 2nd'], partner: 'Rival' });
    assert.deepEqual(after.You.map(p => p.name), ['2027 1st', '2027 2nd']);
    assert.deepEqual(after.Rival.map(p => `${p.name}${p.moved ? '*' : ''}`), ['2027 1st*']);
    assert.equal(picks.You.length, 2); // untouched
    // No single partner: a pick you get comes from whoever holds one; a pick nobody holds is skipped.
    const any = picksAfterTrade(picks, { get: ['2028 3rd', '2030 1st'] });
    assert.deepEqual(any.You.map(p => p.name), ['2027 1st', '2027 1st', '2028 3rd']);
    assert.deepEqual(any.Third, []);
    assert.equal(picksAfterTrade(null, { give: ['2027 1st'] }), null);
});
