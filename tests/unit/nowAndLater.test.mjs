// Now and long-term side by side (improvements S24): the Trade Analyzer's two verdicts and the headline joining them,
// and the Roster tab's gap chip rule. js/mls/rankings/nowAndLater.js is pure, so it loads straight into Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dualHeadline, dualVerdictNumbers, rankGap, rankGapTip, GAP_SPOTS, STARTABLE } from '../../js/mls/rankings/nowAndLater.js';
import { verdictFromValues } from '../../js/mls/trade/makeFair.js';

const row = (userValue, seasonValue) => ({ userValue, seasonValue });
const OFF = { on: false, perSpot: 0 };

test('dualVerdictNumbers: each verdict from its own value, with the banner\'s math', () => {
    const get = [row(8000, 9900)], give = [row(11400, 7800)];
    const { now, later } = dualVerdictNumbers(get, give, OFF);
    assert.deepEqual(now, verdictFromValues([9900], [7800], OFF));
    assert.deepEqual(later, verdictFromValues([8000], [11400], OFF));
    assert.equal(now.verdict, 'you');
    assert.equal(later.verdict, 'them');
    assert.equal(now.diff, 2100);
    assert.equal(later.diff, -3400);
});

test('dualVerdictNumbers: never blends the two values', () => {
    const { now, later } = dualVerdictNumbers([row(5000, 0)], [row(0, 5000)], OFF);
    assert.equal(now.getTotal, 0);
    assert.equal(now.giveTotal, 5000);
    assert.equal(later.getTotal, 5000);
    assert.equal(later.giveTotal, 0);
});

test('dualVerdictNumbers: the waiver adjustment applies to both alike', () => {
    const waiver = { on: true, perSpot: 1000 };
    const { now, later } = dualVerdictNumbers([row(6000, 6000)], [row(3000, 3000), row(3000, 3000)], waiver);
    assert.equal(now.getTotal, 7000); // you send more pieces: the side you receive gets the waiver credit
    assert.equal(later.getTotal, 7000);
    assert.equal(now.bonusGet, 1000);
    assert.equal(later.bonusGet, 1000);
});

test('dualVerdictNumbers: a set that values nothing on either side gives null', () => {
    const { now, later } = dualVerdictNumbers([row(4000, 0)], [row(3000, 0)], OFF);
    assert.equal(now, null);
    assert.equal(later.verdict, 'you');
    assert.equal(dualHeadline(now, later), null);
});

test('dualHeadline: the owner\'s wording, every combination', () => {
    const v = (verdict, diff) => ({ verdict, diff });
    assert.equal(dualHeadline(v('you', 2100), v('them', -3400)), 'Wins now (+2,100), costs long-term (−3,400)');
    assert.equal(dualHeadline(v('them', -1500), v('you', 4200.4)), 'Costs now (−1,500), wins long-term (+4,200)');
    assert.equal(dualHeadline(v('you', 900), v('you', 1200)), 'Wins now (+900) and long-term (+1,200)');
    assert.equal(dualHeadline(v('them', -900), v('them', -1200)), 'Costs now (−900) and long-term (−1,200)');
    assert.equal(dualHeadline(v('fair', 50), v('fair', -80)), 'Fair now and long-term');
    assert.equal(dualHeadline(v('fair', 50), v('them', -3000)), 'Fair now, costs long-term (−3,000)');
    assert.equal(dualHeadline(v('you', 3000), v('fair', -80)), 'Wins now (+3,000), fair long-term');
    assert.equal(dualHeadline(null, v('you', 1)), null);
});

test('rankGap: 12 or more spots apart, one rank inside the startable range', () => {
    assert.equal(GAP_SPOTS, 12);
    assert.deepEqual(STARTABLE, { QB: 24, RB: 36, WR: 36, TE: 24 });
    assert.equal(rankGap('WR', 24, 40), 'now');      // the owner's example: WR24 now, WR40 dynasty
    assert.equal(rankGap('WR', 40, 24), 'later');
    assert.equal(rankGap('WR', 24, 35), null);       // 11 apart
    assert.equal(rankGap('WR', 24, 36), 'now');      // exactly 12
    assert.equal(rankGap('WR', 36, 60), 'now');      // the better rank on the edge of the range
    assert.equal(rankGap('WR', 37, 60), null);       // both past it: a deep-bench shuffle
    assert.equal(rankGap('WR', 80, 95), null);
    assert.equal(rankGap('TE', 20, 40), 'now');
    assert.equal(rankGap('TE', 25, 40), null);       // TE's range is the top 24
    assert.equal(rankGap('QB', 1, 30), 'now');
    assert.equal(rankGap('RB', 36, 48), 'now');
});

test('rankGap: no chip for K, DEF, unknown positions or a rank that can\'t be compared', () => {
    assert.equal(rankGap('K', 1, 30), null);
    assert.equal(rankGap('DEF', 1, 30), null);
    assert.equal(rankGap('UNK', 1, 30), null);
    assert.equal(rankGap('K', 1, null), null);
    // In a set but without a position rank (999), or no number at all: nothing to compare.
    assert.equal(rankGap('WR', 999, 5), null);
    assert.equal(rankGap('WR', 5, 999), null);
    assert.equal(rankGap('WR', undefined, 5), null);
    assert.equal(rankGap('WR', 0, 30), null);
});

test('rankGap: a player missing from one set counts as far below it (owner\'s choice after the first review)', () => {
    assert.equal(rankGap('WR', 20, null), 'now');     // In-Season WR20, left out of the dynasty set
    assert.equal(rankGap('RB', null, 30), 'later');   // a dynasty-ranked stash the In-Season set leaves out
    assert.equal(rankGap('WR', 36, null), 'now');     // on the edge of the range
    assert.equal(rankGap('WR', 37, null), null);      // past it: no chip, like any deep-bench pair
    assert.equal(rankGap('TE', null, 25), null);
    assert.equal(rankGap('WR', null, null), null);    // in neither
});

test('rankGapTip: a player one set leaves out', () => {
    assert.equal(rankGapTip('now', 'WR', 20, null), 'Your In-Season rankings have him at WR20 and your dynasty rankings leave him out: he helps now more than later. A sell-high candidate.');
    assert.equal(rankGapTip('later', 'RB', null, 30), 'Your dynasty rankings have him at RB30 and your In-Season rankings leave him out: worth more later than now. A buy-low or hold candidate.');
});

test('rankGapTip names both ranks and what the gap suggests', () => {
    assert.match(rankGapTip('now', 'WR', 24, 40), /In-Season WR24, dynasty WR40.*sell-high/);
    assert.match(rankGapTip('later', 'RB', 30, 8), /In-Season RB30, dynasty RB8.*buy-low or hold/);
});

// Round 6: a 1QB In-Season set in a superflex league.
import { isSuperflex, oneQbLook } from '../../js/mls/rankings/nowAndLater.js';
test('isSuperflex: a SFLEX slot or two QB slots', () => {
    assert.equal(isSuperflex({ QB: 1, SFLEX: 1 }), true);
    assert.equal(isSuperflex({ QB: 2 }), true);
    assert.equal(isSuperflex({ QB: 1, SFLEX: 0 }), false);
    assert.equal(isSuperflex(null), false);
});
test('oneQbLook: QBs in the top 50 decide, scaled to the positions known', () => {
    const set = (qbEvery) => Array.from({ length: 60 }, (_, i) => ({ cleanName: `p${i}`, rank: i + 1, pos: i % qbEvery === 0 ? 'QB' : 'WR' }));
    const posOf = (data) => (c) => (data.find(p => p.cleanName === c) || {}).pos;
    const oneQb = set(12);                                   // 5 QBs in the top 50
    assert.deepEqual(oneQbLook(oneQb, posOf(oneQb)), { qbs: 5, known: 50, oneQb: true });
    const sf = set(4);                                       // 13 QBs in the top 50
    assert.equal(oneQbLook(sf, posOf(sf)).oneQb, false);
    // Too few positions known to judge: no warning.
    assert.equal(oneQbLook(oneQb, (c) => (c < 'p2' ? 'WR' : undefined)).oneQb, false);
    // Rank order, not array order; unranked (999) left out.
    const shuffled = [...oneQb].reverse().concat([{ cleanName: 'x', rank: 999, pos: 'QB' }]);
    assert.equal(oneQbLook(shuffled, posOf(shuffled)).qbs, 5);
});

// Round 7: superflex QB prices for a 1QB-looking In-Season set.
import { superflexQbPrices } from '../../js/mls/rankings/nowAndLater.js';
test('superflexQbPrices: QBs keep their In-Season order and take the dynasty set\'s QB prices', () => {
    // 60 players each; positions by name. In-Season: 1QB-style, QBs at 10, 30, 50 (q1..q3). Dynasty: superflex, QBs every 4th.
    const pos = {};
    const season = Array.from({ length: 60 }, (_, i) => {
        const qb = [9, 29, 49].indexOf(i);
        const cleanName = qb >= 0 ? `q${qb + 1}` : `s${i}`;
        pos[cleanName] = qb >= 0 ? 'QB' : 'WR';
        return { cleanName, rank: i + 1 };
    });
    const dynasty = Array.from({ length: 60 }, (_, i) => {
        const cleanName = i % 4 === 0 ? `d${i}` : `e${i}`;
        pos[cleanName] = i % 4 === 0 ? 'QB' : 'RB';
        return { cleanName, rank: i + 1 };
    });
    const posOf = (c) => pos[c];
    const sf = { QB: 1, SFLEX: 1 };
    const priced = superflexQbPrices(sf, season, dynasty, posOf);
    // QB1..QB3 of the In-Season set take the dynasty set's QB1..QB3 overall ranks (1, 5, 9).
    assert.deepEqual(priced.filter(p => pos[p.cleanName] === 'QB').map(p => [p.cleanName, p.rank, p.seasonRank]), [['q1', 1, 10], ['q2', 5, 30], ['q3', 9, 50]]);
    // Everyone else untouched, same objects.
    assert.equal(priced[0], season[0]);
    // Not superflex, or the In-Season set already superflex, or a 1QB-looking dynasty set: nothing to do.
    assert.equal(superflexQbPrices({ QB: 1, SFLEX: 0 }, season, dynasty, posOf), null);
    assert.equal(superflexQbPrices(sf, dynasty, dynasty, posOf), null);
    assert.equal(superflexQbPrices(sf, season, season, posOf), null);
});
test('superflexQbPrices: In-Season QBs past the dynasty set\'s last QB continue at its average gap', () => {
    const pos = {};
    // In-Season: 4 QBs in the top 50 (1QB-style), 12 in all. Dynasty: 10 QBs at ranks 2, 4, ... 20 (superflex-style).
    const seasonQbRanks = [10, 20, 30, 40, 51, 52, 53, 54, 55, 56, 57, 58];
    const season = Array.from({ length: 60 }, (_, i) => { const qb = seasonQbRanks.includes(i + 1); const c = (qb ? 'q' : 'w') + i; pos[c] = qb ? 'QB' : 'WR'; return { cleanName: c, rank: i + 1 }; });
    const dynasty = Array.from({ length: 60 }, (_, i) => { const qb = (i + 1) % 2 === 0 && i + 1 <= 20; const c = (qb ? 'dq' : 'r') + i; pos[c] = qb ? 'QB' : 'RB'; return { cleanName: c, rank: i + 1 }; });
    const priced = superflexQbPrices({ QB: 2 }, season, dynasty, (c) => pos[c]);
    assert.deepEqual(priced.filter(p => pos[p.cleanName] === 'QB').map(p => p.rank), [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
});

// Round 9: the owner's switch, QBs priced by Market Consensus (superflex).
import { marketAsRanked, qbMarketPricing, qbMarketNoteHTML } from '../../js/mls/rankings/nowAndLater.js';
test('qbMarketPricing: applies in a superflex league on a 1QB list; prices only when on and the market is superflex', () => {
    const pos = {};
    const oneQbList = Array.from({ length: 60 }, (_, i) => { const qb = [9, 29, 49].includes(i); const c = (qb ? 'q' : 'w') + i; pos[c] = qb ? 'QB' : 'WR'; return { cleanName: c, rank: i + 1 }; });
    // The market: the same QBs near the top (superflex-style), plus other QBs every 4th.
    const others = Array.from({ length: 60 }, (_, i) => i + 1).filter(r => ![1, 5, 9].includes(r));
    const market = marketAsRanked([...['q9', 'q29', 'q49'].map((c, i) => ({ cleanName: c, marketVal: i * 4 + 1, pos: 'QB' })),
        ...others.map(r => { const c = `m${r}`; pos[c] = r % 4 === 1 ? 'QB' : 'RB'; return { cleanName: c, marketVal: r, pos: pos[c] }; })]);
    const posOf = (c) => pos[c];
    const sf = { reqs: { QB: 1, SFLEX: 1 } };
    // Off: applies, nothing priced.
    let q = qbMarketPricing(sf, oneQbList, posOf, market, true);
    assert.deepEqual([q.applies, q.on, q.active], [true, false, false]);
    assert.equal(q.data, oneQbList);
    // On with superflex market values: QBs take the market's QB prices in your order.
    q = qbMarketPricing({ ...sf, qbMarketPrices: true }, oneQbList, posOf, market, true);
    assert.equal(q.active, true);
    assert.deepEqual(q.data.filter(p => pos[p.cleanName] === 'QB').map(p => p.rank), [1, 5, 9]);
    // On, but the market isn't superflex: waits.
    q = qbMarketPricing({ ...sf, qbMarketPrices: true }, oneQbList, posOf, market, false);
    assert.deepEqual([q.applies, q.on, q.active], [true, true, false]);
    // Not superflex: doesn't apply at all.
    assert.equal(qbMarketPricing({ reqs: { QB: 1 }, qbMarketPrices: true }, oneQbList, posOf, market, true).applies, false);
});
test('qbMarketNoteHTML: the three states', () => {
    const off = qbMarketNoteHTML({ applies: true, on: false, active: false }, 'ROS', '<button>Change</button>');
    assert.match(off, /data-qb-market="off"/);
    assert.match(off, /Your ROS rankings look 1QB/);
    assert.match(off, /<button>Change<\/button>/);
    assert.ok(!/ checked/.test(off));
    const waiting = qbMarketNoteHTML({ applies: true, on: true, active: false }, 'ROS', '<button>Change</button>');
    assert.match(waiting, /data-qb-market="waiting"/);
    assert.match(waiting, /fetch superflex market values for this league in Trade Finder/);
    assert.match(waiting, / checked/);
    const on = qbMarketNoteHTML({ applies: true, on: true, active: true }, 'ROS', '');
    assert.match(on, /QBs priced by Market Consensus \(superflex\), in your order\./);
    assert.match(on, /data-action="setQbMarketPrices" checked/);
});
