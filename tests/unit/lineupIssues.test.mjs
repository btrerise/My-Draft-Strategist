// What on a lineup needs you before kickoff (js/mls/lineup/issues.js, improvements S11): the rule the Lineup
// tab's red and purple warnings and the Dashboard's list after Optimize All share. gameInfo.js's
// getLineupIssues passes the real statuses, kickoffs and byes; here they're plain stand-ins.
// tests/mls-lineup-needs.spec.mjs covers both places end to end.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { lineupIssues, lineupIssueItems, hasLineupIssues, joinAnd } from '../../js/mls/lineup/issues.js';

const OUT = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR']; // SIM_EXCLUDE_STATUSES
const ctx = (over = {}) => ({ bestBall: false, outStatuses: OUT, kickedOff: (p) => !!p.started, onBye: (p) => !!p.bye, ...over });
const s = (slot, player) => ({ slot, player });
const nb = (str) => str.replace(/ /g, ' ');

const chase = { name: "Ja'Marr Chase", isReserve: true };
const allen = { name: 'Josh Allen', inj: 'D' };
const henry = { name: 'Derrick Henry', inj: 'Q' };
const higgins = { name: 'Tee Higgins', bye: true };

describe('lineupIssues', () => {
    test('a healthy lineup has none', () => {
        const issues = lineupIssues([s('QB1', { name: 'A' }), s('RB1', henry)], ctx());
        assert.deepEqual(issues, { injured: [], irSlot: [], bye: [], empty: [] });
        assert.equal(hasLineupIssues(issues), false);
        assert.deepEqual(lineupIssueItems(issues), []);
    });

    test('Questionable is not injured; Doubtful, Out and IR are', () => {
        const out = { name: 'B', inj: 'OUT' }, ir = { name: 'C', inj: 'IR' };
        const issues = lineupIssues([s('QB1', allen), s('RB1', henry), s('RB2', out), s('WR1', ir)], ctx());
        assert.deepEqual(issues.injured, [allen, out, ir]);
    });

    test('IR slot, bye and empty slots, in lineup order', () => {
        const issues = lineupIssues([s('QB1', allen), s('WR1', chase), s('WR2', higgins), s('TE1', null), s('FLEX1', null), s('FLEX2', null)], ctx());
        assert.deepEqual(issues, { injured: [allen], irSlot: [chase], bye: [higgins], empty: ['TE', 'FLEX', 'FLEX'] });
    });

    test('a starter whose game has kicked off is left out', () => {
        const issues = lineupIssues([s('QB1', { ...allen, started: true }), s('WR1', { ...chase, started: true })], ctx());
        assert.equal(hasLineupIssues(issues), false);
    });

    test('nothing in Best Ball', () => {
        const issues = lineupIssues([s('QB1', allen), s('WR1', chase), s('TE1', null)], ctx({ bestBall: true }));
        assert.equal(hasLineupIssues(issues), false);
    });

    test('injured and in the IR slot: both lists, as on the Lineup tab; injured and on bye: injured only', () => {
        const both = { name: 'D', inj: 'OUT', isReserve: true, bye: true };
        const issues = lineupIssues([s('WR1', both)], ctx());
        assert.deepEqual(issues, { injured: [both], irSlot: [both], bye: [], empty: [] });
    });

    test('no lineup yet', () => {
        assert.equal(hasLineupIssues(lineupIssues(undefined, ctx())), false);
        assert.equal(hasLineupIssues(lineupIssues([], ctx())), false);
    });
});

describe('lineupIssueItems: the Dashboard wording', () => {
    test("the card's example", () => {
        const items = lineupIssueItems(lineupIssues([s('QB1', allen), s('WR1', chase)], ctx()));
        assert.deepEqual(items.map(nb), ["Activate Ja'Marr Chase from IR", 'Josh Allen is Doubtful']);
    });

    test('names use no-break spaces, so a line never wraps inside one', () => {
        assert.equal(lineupIssueItems(lineupIssues([s('QB1', allen)], ctx()))[0], 'Josh Allen is Doubtful');
    });

    test('several IR-slot starters share one item', () => {
        const items = lineupIssueItems(lineupIssues([s('WR1', chase), s('WR2', { name: 'Justin Jefferson', isReserve: true })], ctx()));
        assert.deepEqual(items.map(nb), ["Activate Ja'Marr Chase and Justin Jefferson from IR"]);
    });

    test('every status spelled out', () => {
        const players = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR'].map((inj, i) => ({ name: `P${i}`, inj }));
        const items = lineupIssueItems(lineupIssues(players.map((p, i) => s(`WR${i + 1}`, p)), ctx()));
        assert.deepEqual(items, ['P0 is Doubtful', 'P1 is Out', 'P2 is on IR', 'P3 is on PUP', 'P4 is suspended', 'P5 is on NFI', "P6 hasn't reported"]);
    });

    test('byes and empty slots, counted per slot type, with W/T and W/R named as on the Lineup tab', () => {
        assert.deepEqual(lineupIssueItems(lineupIssues([s('WR1', higgins), s('TE1', null)], ctx())).map(nb),
            ['Tee Higgins is on bye', 'TE slot is empty']);
        assert.deepEqual(lineupIssueItems(lineupIssues([s('FLEX1', null), s('FLEX2', null), s('WRTE1', null)], ctx())),
            ['2 FLEX and W/T slots are empty']);
    });

    test('joinAnd', () => {
        assert.equal(joinAnd([]), '');
        assert.equal(joinAnd(['A']), 'A');
        assert.equal(joinAnd(['A', 'B']), 'A and B');
        assert.equal(joinAnd(['A', 'B', 'C']), 'A, B and C');
    });
});
