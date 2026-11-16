// Bye Crunch (improvements S52, js/mls/lineup/byeCrunch.js): a coming week when byes leave a starting slot nobody on
// the roster can fill. tests/mls-bye-crunch.spec.mjs covers the Dashboard card and the Lineup tab's box.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { byeCrunch, byeCrunchWeek, crunchFoldHTML, crunchGroup, crunchGroups, crunchRowsHTML, crunchWeeks, shortSlots, couldStart } from '../../js/mls/lineup/byeCrunch.js';
import { lineupIssueItems, lineupIssues, needsYouCount, leagueNeeds, findChips } from '../../js/mls/lineup/issues.js';
import { slotDisplayName } from '../../js/mls/constants.js';

let nextId = 1;
const pl = (name, pos, team, extra = {}) => ({ id: String(nextId++), name, pos, team, ...extra });
// Week 13's byes in 2026: BAL, IND, LV, NYJ. Week 14: ARI, DAL.
const BYES = { BAL: 13, IND: 13, LV: 13, NYJ: 13, ARI: 14, DAL: 14 };
const ctx = { byeWeek: (t) => BYES[t] ?? null };
const plain = (s) => s.replace(/ /g, ' ');
// One week's heading and rows, each row as "head · note · player · player" (rounds 4 and 5).
const group = (entries) => { const g = crunchGroup(entries, slotDisplayName); return [plain(g.text), ...g.rows.map(r => plain(r.text))]; };

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
        assert.deepEqual(group(out), ['Bye Crunch · Week 13: 1 starter short',
            'RB: 1 short · 3 of 4 on bye · Derrick Henry (BAL) · Breece Hall (NYJ) · Ashton Jeanty (LV)']);
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
        assert.deepEqual(group(out), ['Bye Crunch · Week 13: 1 starter short', 'FLEX: 1 short · W1 (WR, BAL) · W2 (WR, IND)']);
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
        assert.deepEqual(group(both), ['Bye Crunch · Week 13: 2 starters short', 'QB: 1 short · all 2 on bye · Q1 (BAL) · Q2 (LV)', 'SFLEX: 1 short · the players above']);
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
        assert.deepEqual(group(out), ['Bye Crunch · Week 13: 1 starter short',
            'RB: 1 short · Derrick Henry (BAL) · Joe Mixon · on IR, assumed still out']);
        // Healthy in your IR slot: he'd be activated, so he fills it.
        const healthyIr = pl('Healthy IR', 'RB', 'MIN', { isReserve: true });
        assert.deepEqual(byeCrunchWeek(reqs, [mixon, henry, cook, healthyIr], 13, ctx), []);
        // Questionable but still in the IR slot: not counted, and named.
        const qIr = pl('Q IR', 'RB', 'MIN', { isReserve: true, inj: 'Q' });
        assert.deepEqual(group(byeCrunchWeek(reqs, [henry, cook, qIr], 13, ctx)).slice(1),
            ['RB: 1 short · Derrick Henry (BAL) · Q IR · injured in your IR slot, assumed still out']);
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
        assert.deepEqual(items.map(i => [i.kind, i.note, i.find]), [['crunch', true, undefined]]);
        // One item for the week (round 4): the heading, a row per slot with its Find chip.
        assert.equal(items.length, 1);
        assert.equal(plain(items[0].text), 'Bye Crunch · Week 13: 2 starters short');
        assert.deepEqual(items[0].rows.map(r => [plain(r.text), r.find]), [['RB: 1 short · R1 (BAL)', 'RB'], ['W/T: 1 short · W (WR, LV)', 'FLEX']]);
        // The rows' HTML: the slot a shade brighter, its button, a bullet per player (names escaped).
        assert.equal(crunchRowsHTML({ rows: [{ head: 'RB: 1 short', note: '2 of 3 on bye', players: ['A & <B> (BAL)'] }] }, () => '<b>'),
            '<ul class="mls-crunch-list"><li><span class="mls-crunch-head">RB: 1 short</span> · 2 of 3 on bye<b><ul class="mls-crunch-players"><li>A &amp; &lt;B&gt; (BAL)</li></ul></li></ul>');
        // The fold (rounds 4 and 5): closed unless it was open, keyed for the redraw.
        const fold = crunchFoldHTML(items[0], { key: 'L1:13' });
        assert.match(fold, /^<details class="mls-change-fold mls-crunch-fold" data-crunch-key="L1:13"><summary>/);
        assert.match(crunchFoldHTML(items[0], { key: 'L1:13', open: true }), /data-crunch-key="L1:13" open>/);
        assert.equal(crunchRowsHTML({}), '');
        assert.equal(needsYouCount(items), 0);
        assert.deepEqual(leagueNeeds({ items }), { needs: false, fix: 0, set: false });
        // The card's right-hand buttons leave Bye Crunch alone: its rows carry their own.
        assert.deepEqual(findChips(items), []);
    });

    test('K and DEF are left out (round 3): they\'re streamed', () => {
        const roster = [pl('R', 'RB', 'MIN'), pl('Justin Tucker', 'K', 'BAL'), pl('Baltimore Ravens', 'DEF', 'BAL')];
        assert.deepEqual(byeCrunchWeek({ RB: 1, K: 1, DEF: 1 }, roster, 13, ctx), []);
    });

    test('a FLEX after the RB row names only who the rows above it didn\'t (round 4)', () => {
        const rbs = [pl('Derrick Henry', 'RB', 'BAL'), pl('Breece Hall', 'RB', 'NYJ'), pl('Ashton Jeanty', 'RB', 'LV'), pl('James Cook', 'RB', 'BUF')];
        const wrs = [pl('Garrett Wilson', 'WR', 'NYJ'), pl('Zay Flowers', 'WR', 'BAL'), pl('A', 'WR', 'MIN'), pl('B', 'WR', 'MIN')];
        const mixon = pl('Joe Mixon', 'RB', 'HOU', { inj: 'IR' });
        const roster = [...rbs, ...wrs, mixon, pl('Sam LaPorta', 'TE', 'DET', { inj: 'OUT' })];
        const issues = lineupIssues([], { bestBall: false, outStatuses: [], kickedOff: () => false, onBye: () => false, roster: [] });
        issues.crunch = byeCrunch({ RB: 2, WR: 2, FLEX: 1 }, roster, [13], ctx);
        const items = lineupIssueItems(issues);
        assert.equal(items.length, 1);
        assert.deepEqual([plain(items[0].text), ...items[0].rows.map(r => plain(r.text))], ['Bye Crunch · Week 13: 2 starters short',
            'RB: 1 short · 3 of 4 on bye · Derrick Henry (BAL) · Breece Hall (NYJ) · Ashton Jeanty (LV) · Joe Mixon · on IR, assumed still out',
            'FLEX: 1 short · Garrett Wilson (WR, NYJ) · Zay Flowers (WR, BAL) · Sam LaPorta (TE) · Out, assumed still out']);
        // Without the RB row above it, the FLEX names everyone.
        assert.deepEqual(group(issues.crunch.slice(1)).slice(1), ['FLEX: 1 short · Derrick Henry (RB, BAL) · Breece Hall (RB, NYJ) · '
            + 'Ashton Jeanty (RB, LV) · Garrett Wilson (WR, NYJ) · Zay Flowers (WR, BAL) · Joe Mixon (RB) · on IR, assumed still out · Sam LaPorta (TE) · Out, assumed still out']);
        // Two weeks: one item each, in week order.
        assert.deepEqual(crunchGroups(byeCrunch({ RB: 2 }, [pl('R1', 'RB', 'BAL'), pl('R2', 'RB', 'ARI')], [13, 14], ctx)).map(g => g.text),
            ['Bye Crunch · Week 13: 1 starter short', 'Bye Crunch · Week 14: 1 starter short']);
    });
});
