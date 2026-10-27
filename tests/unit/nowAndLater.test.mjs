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
