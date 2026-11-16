// Bye Crunch (improvements S52, js/mls/lineup/byeCrunch.js): a coming week when byes leave a starting slot nobody on
// the roster can fill. tests/mls-bye-crunch.spec.mjs covers the Dashboard card and the Lineup tab's box.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { byeCrunch, byeCrunchWeek, crunchText, crunchDetails, crunchListHTML, crunchWeeks, shortSlots, couldStart } from '../../js/mls/lineup/byeCrunch.js';
import { lineupIssueItems, lineupIssues, needsYouCount, leagueNeeds, findChips } from '../../js/mls/lineup/issues.js';
import { slotDisplayName } from '../../js/mls/constants.js';

let nextId = 1;
const pl = (name, pos, team, extra = {}) => ({ id: String(nextId++), name, pos, team, ...extra });
// Week 13's byes in 2026: BAL, IND, LV, NYJ. Week 14: ARI, DAL.
const BYES = { BAL: 13, IND: 13, LV: 13, NYJ: 13, ARI: 14, DAL: 14 };
const ctx = { byeWeek: (t) => BYES[t] ?? null };
const plain = (s) => s.replace(/ /g, ' ');

describe('shortSlots: the matching', () => {
    test('strict slots fill first; FLEX takes whoever is left', () => {
        const players = [pl('Q', 'QB'), pl('R1', 'RB'), pl('W1', 'WR'), pl('W2', 'WR'), pl('T', 'TE')];
        assert.deepEqual(shortSlots({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 }, players), { RB: 1, FLEX: 1 });
    });
    test('a W/T slot is not left short because FLEX took the only WR', () => {
        // FLEX could take the WR or the RB; the matching gives the WR to W/T and the RB to FLEX.
        assert.deepEqual(shortSlots({ WRTE: 1, FLEX: 1 }, [pl('W', 'WR'), pl('R', 'RB')]), {});
    });
});

describe('byeCrunchWeek', () => {
    test('2 RB slots with 3 of 4 RBs on bye: 1 RB short, naming them', () => {
        const henry = pl('Derrick Henry', 'RB', 'BAL'), hall = pl('Breece Hall', 'RB', 'NYJ'),
            jeanty = pl('Ashton Jeanty', 'RB', 'LV'), cook = pl('James Cook', 'RB', 'BUF');
        const roster = [pl('Josh Allen', 'QB', 'BUF'), henry, hall, jeanty, cook, pl('A', 'WR', 'MIN'), pl('B', 'WR', 'MIN')];
        const out = byeCrunchWeek({ QB: 1, RB: 2, WR: 2 }, roster, 13, ctx);
        assert.equal(out.length, 1);
        assert.deepEqual({ ...out[0], onBye: out[0].onBye.map(p => p.name) },
            { week: 13, slotType: 'RB', short: 1, onBye: ['Derrick Henry', 'Breece Hall', 'Ashton Jeanty'], out: [], pos: 'RB', total: 4 });
        assert.equal(plain(crunchText(out[0], slotDisplayName)), 'Bye Crunch · Week 13: 1 RB short (3 of your 4 RBs on bye)');
        // One line per player (owner's request, round 2).
        assert.deepEqual(crunchDetails(out[0]).map(plain), ['Derrick Henry (BAL) on bye', 'Breece Hall (NYJ) on bye', 'Ashton Jeanty (LV) on bye']);
        // Another week: nothing.
        assert.deepEqual(byeCrunchWeek({ QB: 1, RB: 2, WR: 2 }, roster, 14, ctx), []);
    });

    test('FLEX covers a short WR slot\'s byes: a spare RB fills FLEX, so nothing is short', () => {
        const roster = [pl('W1', 'WR', 'BAL'), pl('W2', 'WR', 'IND'), pl('W3', 'WR', 'MIN'), pl('W4', 'WR', 'MIN'),
            pl('R1', 'RB', 'MIN'), pl('R2', 'RB', 'MIN'), pl('R3', 'RB', 'MIN')];
        assert.deepEqual(byeCrunchWeek({ RB: 2, WR: 2, FLEX: 1 }, roster, 13, ctx), []);
        // Without the spare RB, it's FLEX that's short, not a WR slot.
        const out = byeCrunchWeek({ RB: 2, WR: 2, FLEX: 1 }, roster.slice(0, 6), 13, ctx);
        assert.deepEqual(out.map(c => [c.slotType, c.short, c.pos, c.onBye.map(p => p.name)]), [['FLEX', 1, null, ['W1', 'W2']]]);
        assert.equal(plain(crunchText(out[0], slotDisplayName)), 'Bye Crunch · Week 13: 1 FLEX short');
        // A flex slot's bullets are one per position (round 3).
        assert.deepEqual(crunchDetails(out[0]).map(plain), ['WRs on bye: W1 and W2']);
    });

    test('superflex: a second QB on bye leaves SFLEX to an RB, WR or TE; short only when none is left', () => {
        const reqs = { QB: 1, RB: 1, WR: 1, SFLEX: 1 };
        const qbs = [pl('Lamar Jackson', 'QB', 'BAL'), pl('Jalen Hurts', 'QB', 'PHI')];
        assert.deepEqual(byeCrunchWeek(reqs, [...qbs, pl('R', 'RB', 'MIN'), pl('W', 'WR', 'MIN'), pl('T', 'TE', 'MIN')], 13, ctx), []);
        const out = byeCrunchWeek(reqs, [...qbs, pl('R', 'RB', 'MIN'), pl('W', 'WR', 'MIN')], 13, ctx);
        assert.deepEqual(out.map(c => [c.slotType, c.short, c.onBye.map(p => p.name)]), [['SFLEX', 1, ['Lamar Jackson']]]);
        // Both QBs on bye: the QB slot is short; SFLEX too.
        const both = byeCrunchWeek(reqs, [pl('Q1', 'QB', 'BAL'), pl('Q2', 'QB', 'LV'), pl('R', 'RB', 'MIN'), pl('W', 'WR', 'MIN')], 13, ctx);
        assert.deepEqual(both.map(c => [c.slotType, c.short]), [['QB', 1], ['SFLEX', 1]]);
        assert.equal(plain(crunchText(both[0])), 'Bye Crunch · Week 13: 1 QB short (all 2 of your QBs on bye)');
    });

    test('an IR player: out now counts as still out and is named; an IR-slot player only when healthy; taxi never', () => {
        const reqs = { RB: 2 };
        const mixon = pl('Joe Mixon', 'RB', 'HOU', { inj: 'IR' });
        const henry = pl('Derrick Henry', 'RB', 'BAL');
        const cook = pl('James Cook', 'RB', 'BUF');
        const taxi = pl('Taxi Back', 'RB', 'MIN', { isTaxi: true });
        const out = byeCrunchWeek(reqs, [mixon, henry, cook, taxi], 13, ctx);
        assert.deepEqual(out.map(c => [c.slotType, c.short, c.onBye.map(p => p.name), c.out.map(p => p.name)]),
            [['RB', 1, ['Derrick Henry'], ['Joe Mixon']]]);
        assert.equal(plain(crunchText(out[0])), 'Bye Crunch · Week 13: 1 RB short (1 of your 2 RBs on bye)');
        assert.deepEqual(crunchDetails(out[0]).map(plain), ['Derrick Henry (BAL) on bye', 'Joe Mixon is on IR, assumed still out']);
        // Healthy in your IR slot: he'd be activated, so he fills it.
        const healthyIr = pl('Healthy IR', 'RB', 'MIN', { isReserve: true });
        assert.deepEqual(byeCrunchWeek(reqs, [mixon, henry, cook, healthyIr], 13, ctx), []);
        // Questionable but still in the IR slot: not counted, and named.
        const qIr = pl('Q IR', 'RB', 'MIN', { isReserve: true, inj: 'Q' });
        assert.deepEqual(crunchDetails(byeCrunchWeek(reqs, [henry, cook, qIr], 13, ctx)[0]).map(plain),
            ['Derrick Henry (BAL) on bye', 'Q IR is in your IR slot, assumed still out']);
        assert.equal(couldStart(pl('D', 'RB', 'MIN', { inj: 'D' })), true);
    });

    test('a slot short without byes is the Lineup box\'s empty slot, not a Bye Crunch', () => {
        assert.deepEqual(byeCrunchWeek({ RB: 1, TE: 1 }, [pl('R', 'RB', 'BAL'), pl('R2', 'RB', 'MIN')], 13, ctx), []);
    });
});

describe('the weeks, and the items', () => {
    test('the next 2 weeks after Sleeper\'s, within the season', () => {
        assert.deepEqual(crunchWeeks(11), [12, 13]);
        assert.deepEqual(crunchWeeks('12'), [13, 14]);
        assert.deepEqual(crunchWeeks(17), [18]);
        assert.deepEqual(crunchWeeks(null), []);
    });

    test('byeCrunch flattens the weeks in order', () => {
        const roster = [pl('R1', 'RB', 'BAL'), pl('R2', 'RB', 'ARI')];
        assert.deepEqual(byeCrunch({ RB: 2 }, roster, [13, 14], ctx).map(c => [c.week, c.slotType]), [[13, 'RB'], [14, 'RB']]);
    });

    test('a note with a Find button, never counted toward "needs you"', () => {
        const issues = lineupIssues([], { bestBall: false, outStatuses: [], kickedOff: () => false, onBye: () => false, roster: [] });
        issues.crunch = byeCrunch({ RB: 2, WRTE: 1 }, [pl('R1', 'RB', 'BAL'), pl('R2', 'RB', 'MIN'), pl('W', 'WR', 'LV')], [13], ctx);
        const items = lineupIssueItems(issues);
        assert.deepEqual(items.map(i => [i.kind, i.note, i.find]), [['crunch', true, 'RB'], ['crunch', true, 'FLEX']]);
        assert.equal(plain(items[1].text), 'Bye Crunch · Week 13: 1 W/T short');
        assert.deepEqual(items[1].details, ['WR on bye: W']);
        // The list escapes names.
        assert.equal(crunchListHTML({ details: ['A & <B>'] }), '<ul class="mls-crunch-list"><li>A &amp; &lt;B&gt;</li></ul>');
        assert.equal(crunchListHTML({}), '');
        assert.equal(needsYouCount(items), 0);
        assert.deepEqual(leagueNeeds({ items }), { needs: false, fix: 0, set: false });
        assert.deepEqual(findChips(items), ['RB', 'FLEX']);
    });

    test('K and DEF are left out (round 3): they\'re streamed', () => {
        const roster = [pl('R', 'RB', 'MIN'), pl('Justin Tucker', 'K', 'BAL'), pl('Baltimore Ravens', 'DEF', 'BAL')];
        assert.deepEqual(byeCrunchWeek({ RB: 1, K: 1, DEF: 1 }, roster, 13, ctx), []);
    });

    test('a FLEX after the RB note: one line per position, and the backs already named are "the 3 above" (round 3)', () => {
        const rbs = [pl('Derrick Henry', 'RB', 'BAL'), pl('Breece Hall', 'RB', 'NYJ'), pl('Ashton Jeanty', 'RB', 'LV'), pl('James Cook', 'RB', 'BUF')];
        const wrs = [pl('Garrett Wilson', 'WR', 'NYJ'), pl('Zay Flowers', 'WR', 'BAL'), pl('A', 'WR', 'MIN'), pl('B', 'WR', 'MIN')];
        const mixon = pl('Joe Mixon', 'RB', 'HOU', { inj: 'IR' });
        const roster = [...rbs, ...wrs, mixon, pl('Sam LaPorta', 'TE', 'DET', { inj: 'OUT' })];
        const issues = lineupIssues([], { bestBall: false, outStatuses: [], kickedOff: () => false, onBye: () => false, roster: [] });
        issues.crunch = byeCrunch({ RB: 2, WR: 2, FLEX: 1 }, roster, [13], ctx);
        const items = lineupIssueItems(issues);
        assert.deepEqual(items.map(i => plain(i.text)), ['Bye Crunch · Week 13: 1 RB short (3 of your 4 RBs on bye)', 'Bye Crunch · Week 13: 1 FLEX short']);
        assert.deepEqual(items[0].details.map(plain), ['Derrick Henry (BAL) on bye', 'Breece Hall (NYJ) on bye', 'Ashton Jeanty (LV) on bye', 'Joe Mixon is on IR, assumed still out']);
        assert.deepEqual(items[1].details.map(plain), ['RBs: the 3 above', 'WRs on bye: Garrett Wilson and Zay Flowers', 'Out now, assumed still out: Sam LaPorta (Out)']);
        // On its own (nothing above), every name, and one partly above.
        assert.deepEqual(crunchDetails(issues.crunch[1]).map(plain), ['RBs on bye: Derrick Henry, Breece Hall and Ashton Jeanty',
            'WRs on bye: Garrett Wilson and Zay Flowers', 'Out now, assumed still out: Joe Mixon (IR), Sam LaPorta (Out)']);
        assert.deepEqual(crunchDetails(issues.crunch[1], new Set([rbs[0].id])).map(plain)[0], 'RBs on bye: Breece Hall and Ashton Jeanty, and the 1 above');
    });
});
