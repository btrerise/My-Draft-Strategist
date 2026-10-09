// What on a lineup needs you before kickoff (js/mls/lineup/issues.js, improvements S11): the rule the Lineup
// tab's red and purple warnings and the Dashboard's "lineups need you" box share. gameInfo.js's
// getLineupIssues passes the real statuses, kickoffs and byes; here they're plain stand-ins.
// tests/mls-lineup-needs.spec.mjs covers both places end to end.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { lineupIssues, lineupIssueItems, hasLineupIssues, joinAnd, needsLineupButton, sleeperLineupChanges, swapFor, findChipFor } from '../../js/mls/lineup/issues.js';

const OUT = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR']; // SIM_EXCLUDE_STATUSES
const ctx = (over = {}) => ({ bestBall: false, outStatuses: OUT, kickedOff: (p) => !!p.started, onBye: (p) => !!p.bye,
    kickoffMs: (p) => (p.ko ?? NaN), ...over });
const s = (slot, player) => ({ slot, player });
const texts = (issues) => lineupIssueItems(issues).map(i => i.text.replace(/ /g, ' '));
let nextId = 1;
const pl = (name, pos, extra = {}) => ({ id: String(nextId++), name, pos, posRank: 50, flexRank: 50, ...extra });

const chase = pl("Ja'Marr Chase", 'WR', { isReserve: true, ko: 3000 });
const allen = pl('Josh Allen', 'QB', { inj: 'D', ko: 2000 });
const henry = pl('Derrick Henry', 'RB', { inj: 'Q' });
const higgins = pl('Tee Higgins', 'WR', { bye: true });

describe('lineupIssues', () => {
    test('a healthy lineup has none', () => {
        const issues = lineupIssues([s('QB1', pl('A', 'QB')), s('RB1', henry)], ctx());
        assert.equal(hasLineupIssues(issues), false);
        assert.deepEqual(lineupIssueItems(issues), []);
        assert.ok(Number.isNaN(issues.firstKickoffMs));
    });

    test('Questionable is not injured; Doubtful, Out and IR are', () => {
        const out = pl('B', 'RB', { inj: 'OUT' }), ir = pl('C', 'WR', { inj: 'IR' });
        const issues = lineupIssues([s('QB1', allen), s('RB1', henry), s('RB2', out), s('WR1', ir)], ctx());
        assert.deepEqual(issues.injured, [allen, out, ir]);
    });

    test('IR slot, bye and empty slots, in lineup order; the earliest kickoff among them', () => {
        const issues = lineupIssues([s('QB1', allen), s('WR1', chase), s('WR2', higgins), s('TE1', null), s('FLEX1', null), s('FLEX2', null)], ctx());
        assert.deepEqual(issues.injured, [allen]);
        assert.deepEqual(issues.irSlot, [chase]);
        assert.deepEqual(issues.bye, [higgins]);
        assert.deepEqual(issues.empty, ['TE', 'FLEX', 'FLEX']);
        assert.equal(issues.firstKickoffMs, 2000);
    });

    test('injured AND in the IR slot: injured only (no "activate" for a player who is out)', () => {
        const both = pl('D', 'WR', { inj: 'OUT', isReserve: true });
        const issues = lineupIssues([s('WR1', both)], ctx());
        assert.deepEqual(issues.injured, [both]);
        assert.deepEqual(issues.irSlot, []);
        assert.deepEqual(texts(issues), ['D is Out']);
    });

    test('injured and on bye: injured only', () => {
        const both = pl('E', 'WR', { inj: 'OUT', bye: true });
        const issues = lineupIssues([s('WR1', both)], ctx());
        assert.deepEqual([issues.injured, issues.bye], [[both], []]);
    });

    test('a starter whose game has kicked off is left out', () => {
        const issues = lineupIssues([s('QB1', { ...allen, started: true }), s('WR1', { ...chase, started: true })], ctx());
        assert.equal(hasLineupIssues(issues), false);
    });

    test('nothing in Best Ball', () => {
        const issues = lineupIssues([s('QB1', allen), s('WR1', chase), s('TE1', null)], ctx({ bestBall: true }));
        assert.equal(hasLineupIssues(issues), false);
    });

    test('no lineup yet', () => {
        assert.equal(hasLineupIssues(lineupIssues(undefined, ctx())), false);
        assert.equal(hasLineupIssues(lineupIssues([], ctx())), false);
    });
});

describe('swap suggestions and pickups', () => {
    const jj = pl('Justin Jefferson', 'WR', { inj: 'D', posRank: 2, flexRank: 3 });
    const lamb = pl('CeeDee Lamb', 'WR', { posRank: 3, flexRank: 5 });
    const nacua = pl('Puka Nacua', 'WR', { posRank: 4, flexRank: 7 });
    const bijan = pl('Bijan Robinson', 'RB', { posRank: 1, flexRank: 1 });

    test('the best healthy bench player at his position', () => {
        const issues = lineupIssues([s('WR1', jj)], ctx(), [nacua, bijan, lamb]);
        assert.equal(swapFor(issues, jj), lamb);
        assert.deepEqual(texts(issues), ['Justin Jefferson is Doubtful: start CeeDee Lamb instead?']);
        assert.deepEqual(issues.find, []);
        assert.equal(needsLineupButton(issues), true);
    });

    test('skips bench players who are injured, on bye, kicked off, in the IR slot or on taxi', () => {
        const bench = [
            pl('Hurt', 'WR', { inj: 'OUT', posRank: 1 }), pl('Bye', 'WR', { bye: true, posRank: 1 }),
            pl('Played', 'WR', { started: true, posRank: 1 }), pl('Reserve', 'WR', { isReserve: true, posRank: 1 }),
            pl('Taxi', 'WR', { isTaxi: true, posRank: 1 }), nacua,
        ];
        assert.equal(swapFor(lineupIssues([s('WR1', jj)], ctx(), bench), jj), nacua);
    });

    test('a flex slot takes the best FLEX rank once his position has nobody', () => {
        const te = pl('Hurt TE', 'TE', { inj: 'OUT' });
        assert.equal(swapFor(lineupIssues([s('FLEX1', te)], ctx(), [lamb, bijan]), te), bijan);
        // A strict slot never takes another position: a pickup instead.
        const issues = lineupIssues([s('TE1', te)], ctx(), [lamb, bijan]);
        assert.equal(swapFor(issues, te), null);
        assert.deepEqual(issues.find, ['TE']);
    });

    test('each bench player is suggested once', () => {
        const a = pl('A', 'WR', { inj: 'D' }), b = pl('B', 'WR', { inj: 'D' });
        const issues = lineupIssues([s('WR1', a), s('WR2', b)], ctx(), [lamb]);
        assert.equal(swapFor(issues, a), lamb);
        assert.equal(swapFor(issues, b), null);
        assert.deepEqual(issues.find, ['WR']);
    });

    test('a bye starter with a healthy backup gets a swap too', () => {
        const issues = lineupIssues([s('WR1', higgins)], ctx(), [lamb]);
        assert.deepEqual(texts(issues), ['Tee Higgins is on bye: start CeeDee Lamb instead?']);
    });

    test('pickups: empty slots and starters nobody can replace, as Top Available chips', () => {
        const out = pl('Out RB', 'RB', { inj: 'OUT' });
        const issues = lineupIssues([s('RB1', out), s('RB2', null), s('WRTE1', null), s('SFLEX1', null), s('K1', null)], ctx(), []);
        assert.deepEqual(issues.find, ['RB', 'FLEX', 'ALL', 'K']);
        assert.equal(needsLineupButton(issues), false);
        assert.deepEqual([findChipFor('WRRB'), findChipFor('DEF')], ['FLEX', 'DEF']);
    });

    test('an IR activation is a Lineup tab job', () => {
        assert.equal(needsLineupButton(lineupIssues([s('WR1', chase)], ctx())), true);
    });
});

describe('lineupIssueItems: the Dashboard wording', () => {
    test("the card's example, with each item's kind for its color", () => {
        const items = lineupIssueItems(lineupIssues([s('QB1', allen), s('WR1', chase)], ctx()));
        assert.deepEqual(items.map(i => [i.kind, i.text.replace(/ /g, ' ')]),
            [['ir', "Activate Ja'Marr Chase from IR"], ['injured', 'Josh Allen is Doubtful']]);
    });

    test('names use no-break spaces, so a line never wraps inside one', () => {
        assert.equal(lineupIssueItems(lineupIssues([s('QB1', allen)], ctx()))[0].text, 'Josh Allen is Doubtful');
    });

    test('several IR-slot starters share one item', () => {
        const jeff = pl('Justin Jefferson', 'WR', { isReserve: true });
        assert.deepEqual(texts(lineupIssues([s('WR1', chase), s('WR2', jeff)], ctx())), ["Activate Ja'Marr Chase and Justin Jefferson from IR"]);
    });

    test('every status spelled out', () => {
        const players = OUT.map((inj, i) => pl(`P${i}`, 'WR', { inj }));
        assert.deepEqual(texts(lineupIssues(players.map((p, i) => s(`WR${i + 1}`, p)), ctx())),
            ['P0 is Doubtful', 'P1 is Out', 'P2 is on IR', 'P3 is on PUP', 'P4 is suspended', 'P5 is on NFI', "P6 hasn't reported"]);
    });

    test('byes and empty slots, counted per slot type, with W/T and W/R named as on the Lineup tab', () => {
        assert.deepEqual(texts(lineupIssues([s('WR1', higgins), s('TE1', null)], ctx())), ['Tee Higgins is on bye', 'TE slot is empty']);
        assert.deepEqual(texts(lineupIssues([s('FLEX1', null), s('FLEX2', null), s('WRTE1', null)], ctx())), ['2 FLEX and W/T slots are empty']);
    });

    test('joinAnd', () => {
        assert.equal(joinAnd([]), '');
        assert.equal(joinAnd(['A']), 'A');
        assert.equal(joinAnd(['A', 'B']), 'A and B');
        assert.equal(joinAnd(['A', 'B', 'C']), 'A, B and C');
    });
});

describe('sleeperLineupChanges', () => {
    test('who to start and bench on Sleeper; none when they match', () => {
        assert.deepEqual(sleeperLineupChanges(['1', '2', '3'], ['3', '2', '4']), { start: ['1'], bench: ['4'] });
        assert.deepEqual(sleeperLineupChanges(['1', '2'], ['2', '1']), { start: [], bench: [] });
    });
});
