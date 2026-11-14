// The suggested FAAB bid (improvements S35, js/mls/scout/faab.js): the model alone, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bidLabel, bidTip, bidTitle, faabLeftFrom, seasonLastWeek, suggestBid, winningBids } from '../../js/mls/scout/faab.js';

// A 12-team league with 100 each; you (roster 1) have 63 left, the league averages 50.
const left100 = { 1: 63, 2: 88, 3: 71, 4: 50, 5: 45, 6: 40, 7: 40, 8: 40, 9: 40, 10: 40, 11: 40, 12: 43 };
// Winning WR bids near WR34: 4, 6, 8, 10, 15; RB bids elsewhere; a TE has none.
const bids100 = [
    { pos: 'WR', posRank: 30, bid: 4 }, { pos: 'WR', posRank: 32, bid: 6 }, { pos: 'WR', posRank: 35, bid: 8 },
    { pos: 'WR', posRank: 38, bid: 10 }, { pos: 'WR', posRank: 40, bid: 15 },
    { pos: 'WR', posRank: 70, bid: 0 }, { pos: 'WR', posRank: null, bid: 0 },
    { pos: 'RB', posRank: 20, bid: 30 }, { pos: 'RB', posRank: 33, bid: 12 }, { pos: 'RB', posRank: 36, bid: 2 },
    { pos: 'QB', posRank: 31, bid: 5 }
];
const base = { pos: 'WR', posRank: 34, budget: 100, left: left100, myRosterId: 1, bids: bids100, kind: 'dynasty', week: 11, lastWeek: 17 };

test('the band: same position within 6 ranks, median to 75th percentile, scaled by your budget', () => {
    const s = suggestBid(base);
    // Comparables 4, 6, 8, 10, 15 (WR30-WR40): median 8, 75th 10; you have 63 against an average of 50 → ×1.26.
    assert.equal(s.scope, 'band');
    assert.equal(s.low, 10);
    assert.equal(s.high, 13);
    assert.equal(s.left, 63);
    assert.equal(s.rough, false);
    // The sheet's lines: what it's based on, what raised it, the notes. Dynasty: no weeks line.
    assert.deepEqual(s.lines, [
        { kind: 'base', text: 'Similar WRs this season (WR28–40 today): 5 won, 4 to 15, median 8' },
        { kind: 'up', text: 'You have more left than the league average (50)' },
        { kind: 'note', text: '11 teams can outbid 13 (88, 71 and 50, … left)' },
        { kind: 'note', text: 'Ranks are today\'s; the bids were placed earlier.' }
    ]);
    // Every other team has more than 13 left: 11.
    assert.equal(s.outbid, 11);
    assert.equal(bidLabel(s), 'Bid 10–13');
    assert.equal(bidTitle(s), 'Bid 10–13 · you have 63 of 100');
    assert.match(bidTip(s), /^Suggested bid 10–13 of your 63 left \(budget 100\)\. Similar WRs/);
});

test('no history: no suggestion, and it says so', () => {
    const s = suggestBid({ ...base, bids: [] });
    assert.equal(s.noHistory, true);
    assert.equal(bidLabel(s), '');
    assert.match(bidTip(s), /No winning FAAB bids in this league this season yet/);
});

test('one position missing: a TE with no bids is based on every bid (never other positions near his rank), a rough guess', () => {
    const s = suggestBid({ ...base, pos: 'TE', posRank: 33 });
    assert.equal(s.scope, 'all');
    assert.equal(s.rough, true);
    assert.equal(s.lines[0].text, 'No winning bids for a TE yet; every position this season: 11 won, 0 to 30, median 6');
    assert.match(bidLabel(s), /^≈ Bid \d+–\d+$/);
    const u = suggestBid({ ...base, pos: 'TE', posRank: null });
    assert.equal(u.scope, 'all');
});

test('too few at his rank: the whole position', () => {
    const s = suggestBid({ ...base, posRank: 60 });
    assert.equal(s.scope, 'pos');
    assert.equal(s.rough, true);
    assert.equal(s.lines[0].text, 'Too few bids for WRs near WR60 (0); every WR this season: 7 won, 0 to 15, median 6');
    // Unranked: every bid at his position.
    assert.match(suggestBid({ ...base, posRank: null }).lines[0].text, /^He isn't in your rankings; every WR this season: 7 won/);
});

test('a budget nearly spent: never more than you have, and the factor bottoms out at 0.6', () => {
    const s = suggestBid({ ...base, left: { ...left100, 1: 3 } });
    assert.ok(s.high <= 3 && s.low <= s.high);
    assert.ok(s.lines.some(l => l.kind === 'down' && l.text === 'You have less left than the league average (45)'));
    const none = suggestBid({ ...base, left: { ...left100, 1: 0 } });
    assert.equal(none.low, 0);
    assert.equal(none.high, 0);
    assert.equal(bidLabel(none), 'Bid 0');
    assert.ok(none.reasons.some(r => /no FAAB left/.test(r)));
});

test('weeks left: flat in dynasty, up to ×1.5 in the last week of a redraft or keeper season', () => {
    const dyn = suggestBid({ ...base, week: 17 });
    const early = suggestBid({ ...base, kind: 'redraft', week: 1 });
    const late = suggestBid({ ...base, kind: 'redraft', week: 17 });
    const keeper = suggestBid({ ...base, kind: 'keeper', week: 17 });
    assert.equal(dyn.factor, suggestBid(base).factor);
    assert.ok(Math.abs(early.factor / dyn.factor - 1) < 1e-9, 'week 1 of 17: ×1');
    assert.ok(Math.abs(late.factor / dyn.factor - (1 + 0.5 * (16 / 17))) < 1e-9);
    assert.equal(keeper.factor, late.factor, 'keeper leagues like redraft (owner)');
    assert.ok(late.lines.some(l => l.kind === 'up' && /^1 week left: money left over is worth less/.test(l.text)));
    // An adjustment under 5% gets no line (week 1 of a redraft season: ×1).
    assert.ok(!early.lines.some(l => /weeks? left/.test(l.text)));
});

test('need: he\'d start ×1.25, fills an empty spot ×1.5, a stash ×0.5', () => {
    const f = suggestBid(base).factor;
    assert.ok(Math.abs(suggestBid({ ...base, need: 'starts' }).factor - f * 1.25) < 1e-9);
    assert.ok(Math.abs(suggestBid({ ...base, need: 'empty' }).factor - f * 1.5) < 1e-9);
    assert.deepEqual(suggestBid({ ...base, need: 'starts' }).lines[1], { kind: 'up', text: 'He\'d start for you' });
    // A player who wouldn't start for you (Bench on Auto-Find): a stash, halved.
    const stash = suggestBid({ ...base, need: 'bench' });
    assert.ok(Math.abs(stash.factor - f * 0.5) < 1e-9);
    assert.deepEqual(stash.lines[1], { kind: 'down', text: 'He wouldn\'t start for you now: a stash' });
});

test('a 1,000 budget league scales like a 100 one', () => {
    const left1000 = Object.fromEntries(Object.entries(left100).map(([k, v]) => [k, v * 10]));
    const bids1000 = bids100.map(b => ({ ...b, bid: b.bid * 10 }));
    const a = suggestBid(base);
    const b = suggestBid({ ...base, budget: 1000, left: left1000, bids: bids1000 });
    assert.equal(b.scope, a.scope);
    assert.ok(Math.abs(b.low - a.low * 10) <= 5, `${b.low} vs ${a.low * 10}`);
    assert.ok(Math.abs(b.high - a.high * 10) <= 5, `${b.high} vs ${a.high * 10}`);
    assert.equal(b.outbid, a.outbid);
});

test('mostly zero bids: the top is still a step above the bottom', () => {
    const zeros = Array.from({ length: 8 }, (_, i) => ({ pos: 'WR', posRank: 30 + i, bid: 0 }));
    const s = suggestBid({ ...base, bids: zeros });
    assert.equal(s.low, 0);
    assert.equal(s.high, 1);
    const big = suggestBid({ ...base, budget: 1000, left: Object.fromEntries(Object.entries(left100).map(([k, v]) => [k, v * 10])), bids: zeros });
    assert.equal(big.high, 10, '1% of a 1,000 budget');
});

test('missing inputs: no suggestion', () => {
    assert.equal(suggestBid({ ...base, budget: 0 }), null);
    assert.equal(suggestBid({ ...base, left: null }), null);
    assert.equal(suggestBid({ ...base, myRosterId: 99 }), null);
});

test('winningBids reads completed waiver claims with a bid; faabLeftFrom and seasonLastWeek', () => {
    const lists = [[
        { type: 'waiver', status: 'complete', adds: { 111: 3 }, settings: { waiver_bid: 12 }, status_updated: 5 },
        { type: 'waiver', status: 'failed', adds: { 111: 4 }, settings: { waiver_bid: 10 } },
        { type: 'free_agent', status: 'complete', adds: { 222: 3 } },
        { type: 'waiver', status: 'complete', adds: { 333: 5 }, settings: { waiver_bid: 0 } },
        { type: 'waiver', status: 'complete', adds: { 444: 5 }, settings: {} }
    ], []];
    assert.deepEqual(winningBids(lists).map(b => [b.playerId, b.bid, b.rosterId]), [['111', 12, 3], ['333', 0, 5]]);
    assert.deepEqual(faabLeftFrom([{ roster_id: 1, settings: { waiver_budget_used: 37 } }, { roster_id: 2, settings: {} }], 100), { 1: 63, 2: 100 });
    assert.equal(faabLeftFrom(null, 100), null);
    assert.equal(seasonLastWeek({ playoff_week_start: 15, playoff_teams: 6 }), 17);
    assert.equal(seasonLastWeek({ playoff_week_start: 15, playoff_teams: 4 }), 16);
    assert.equal(seasonLastWeek({ playoff_week_start: 0 }), 17);
});
