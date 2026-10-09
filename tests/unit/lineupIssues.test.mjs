// What on a lineup needs you before kickoff (js/mls/lineup/issues.js, improvements S11): the rule the Lineup
// tab's "This lineup needs you" box and the Dashboard's "lineups need you" box share. gameInfo.js's
// getLineupIssues passes the real statuses, kickoffs, byes, locks and IR rules; here they're plain stand-ins.
// tests/mls-lineup-needs.spec.mjs covers both places end to end.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { lineupIssues, lineupIssueItems, joinAnd, needsLineupButton, needsYou, findChips, sleeperLineupChanges, swapFor, findChipFor, irEligible } from '../../js/mls/lineup/issues.js';

const OUT = ['D', 'OUT', 'IR', 'PUP', 'SUS', 'NFI', 'DNR']; // SIM_EXCLUDE_STATUSES
const ctx = (over = {}) => ({ bestBall: false, outStatuses: OUT, kickedOff: (p) => !!p.started, onBye: (p) => !!p.bye,
    kickoffMs: (p) => (p.ko ?? NaN), kept: (p) => !!p.locked, irRules: null, rosterSize: null, roster: [], ...over });
const s = (slot, player) => ({ slot, player });
const items = (issues) => lineupIssueItems(issues);
const texts = (issues) => items(issues).map(i => i.text.replace(/ /g, ' '));
let nextId = 1;
const pl = (name, pos, extra = {}) => ({ id: String(nextId++), name, pos, posRank: 50, flexRank: 50, ...extra });
const RULES = { slots: 2, allow: { OUT: true, D: false, SUS: false, DNR: false, COV: true, NA: false } };

const chase = pl("Ja'Marr Chase", 'WR', { isReserve: true, ko: 3000 });
const allen = pl('Josh Allen', 'QB', { inj: 'D', ko: 2000 });
const henry = pl('Derrick Henry', 'RB', { inj: 'Q' });
const higgins = pl('Tee Higgins', 'WR', { bye: true });

describe('lineupIssues: starters', () => {
    test('a healthy lineup has none', () => {
        const issues = lineupIssues([s('QB1', pl('A', 'QB')), s('RB1', henry)], ctx());
        assert.deepEqual(items(issues), []);
        assert.ok(Number.isNaN(issues.firstKickoffMs));
    });

    test('Questionable is not injured; Doubtful, Out and IR are', () => {
        const out = pl('B', 'RB', { inj: 'OUT' }), ir = pl('C', 'WR', { inj: 'IR' });
        const issues = lineupIssues([s('QB1', allen), s('RB1', henry), s('RB2', out), s('WR1', ir)], ctx());
        assert.deepEqual(issues.injured, [allen, out, ir]);
    });

    test('IR slot, bye and empty slots, in lineup order; the earliest kickoff among them', () => {
        const issues = lineupIssues([s('QB1', allen), s('WR1', chase), s('WR2', higgins), s('TE1', null), s('FLEX1', null), s('FLEX2', null)], ctx());
        assert.deepEqual([issues.injured, issues.irSlot, issues.bye, issues.empty], [[allen], [chase], [higgins], ['TE', 'FLEX', 'FLEX']]);
        assert.equal(issues.firstKickoffMs, 2000);
    });

    test('injured AND in the IR slot: injured only (no "activate" for a player who is out)', () => {
        const both = pl('D', 'WR', { inj: 'OUT', isReserve: true });
        const issues = lineupIssues([s('WR1', both)], ctx());
        assert.deepEqual([issues.injured, issues.irSlot], [[both], []]);
        assert.deepEqual(texts(issues), ['D is Out: no healthy WR on your bench']);
    });

    test('injured and on bye: injured only', () => {
        const both = pl('E', 'WR', { inj: 'OUT', bye: true });
        const issues = lineupIssues([s('WR1', both)], ctx());
        assert.deepEqual([issues.injured, issues.bye], [[both], []]);
    });

    test('a starter whose game has kicked off is left out; nothing in Best Ball; no lineup yet', () => {
        assert.deepEqual(items(lineupIssues([s('QB1', { ...allen, started: true }), s('WR1', { ...chase, started: true })], ctx())), []);
        assert.deepEqual(items(lineupIssues([s('QB1', allen), s('WR1', chase), s('TE1', null)], ctx({ bestBall: true }))), []);
        assert.deepEqual(items(lineupIssues(undefined, ctx())), []);
    });
});

describe('swaps and pickups', () => {
    const jj = pl('Justin Jefferson', 'WR', { inj: 'D', posRank: 2, flexRank: 3 });
    const lamb = pl('CeeDee Lamb', 'WR', { posRank: 3, flexRank: 5 });
    const nacua = pl('Puka Nacua', 'WR', { posRank: 4, flexRank: 7 });
    const bijan = pl('Bijan Robinson', 'RB', { posRank: 1, flexRank: 1 });

    test('the best healthy bench player at his position, with a Swap', () => {
        const issues = lineupIssues([s('WR1', jj)], ctx(), [nacua, bijan, lamb]);
        assert.equal(swapFor(issues, jj), lamb);
        const [item] = items(issues);
        assert.equal(item.text.replace(/ /g, ' '), 'Justin Jefferson is Doubtful: start CeeDee Lamb instead?');
        assert.deepEqual(item.swap, { out: jj, in: lamb });
        assert.deepEqual(findChips(items(issues)), []);
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

    test('a flex slot takes the best FLEX rank once his position has nobody; a strict slot never another position', () => {
        const te = pl('Hurt TE', 'TE', { inj: 'OUT' });
        assert.equal(swapFor(lineupIssues([s('FLEX1', te)], ctx(), [lamb, bijan]), te), bijan);
        const issues = lineupIssues([s('TE1', te)], ctx(), [lamb, bijan]);
        assert.equal(swapFor(issues, te), null);
        assert.deepEqual(items(issues).map(i => [i.text, i.find]), [['Hurt TE is Out: no healthy TE on your bench', 'TE']]);
    });

    test('each bench player is suggested once', () => {
        const a = pl('A', 'WR', { inj: 'D' }), b = pl('B', 'WR', { inj: 'D' });
        const issues = lineupIssues([s('WR1', a), s('WR2', b)], ctx(), [lamb]);
        assert.equal(swapFor(issues, a), lamb);
        assert.equal(swapFor(issues, b), null);
        assert.deepEqual(findChips(items(issues)), ['WR']);
    });

    test('a bye starter with a healthy backup gets a swap too', () => {
        assert.deepEqual(texts(lineupIssues([s('WR1', higgins)], ctx(), [lamb])), ['Tee Higgins is on bye: start CeeDee Lamb instead?']);
    });

    test('pickups: empty slots and starters nobody can replace, as Top Available chips', () => {
        const out = pl('Out RB', 'RB', { inj: 'OUT' });
        const issues = lineupIssues([s('RB1', out), s('RB2', null), s('WRTE1', null), s('SFLEX1', null), s('K1', null), s('FLEX1', null), s('FLEX2', null)], ctx(), []);
        assert.deepEqual(texts(issues), ['Out RB is Out: no healthy RB on your bench', 'RB slot is empty', 'W/T slot is empty',
            'SFLEX slot is empty', 'K slot is empty', '2 FLEX slots are empty']);
        assert.deepEqual(findChips(items(issues)), ['RB', 'FLEX', 'ALL', 'K']);
        assert.equal(needsLineupButton(issues), false);
        assert.deepEqual([findChipFor('WRRB'), findChipFor('DEF')], ['FLEX', 'DEF']);
        // A flex slot's "who": every position it takes.
        const flexOut = pl('Hurt Flex', 'WR', { inj: 'OUT' });
        assert.deepEqual(texts(lineupIssues([s('FLEX1', flexOut)], ctx(), [])), ['Hurt Flex is Out: no healthy RB, WR or TE on your bench']);
    });
});

describe('starters you kept are muted', () => {
    test('a locked injured or bye starter: muted, not counted, no swap', () => {
        const lamb = pl('CeeDee Lamb', 'WR', { posRank: 3 });
        const issues = lineupIssues([s('QB1', { ...allen, locked: true }), s('WR1', { ...higgins, locked: true })], ctx(), [lamb]);
        assert.deepEqual(issues.swaps, []);
        const list = items(issues);
        assert.deepEqual(list.map(i => [i.kind, i.muted, i.text.replace(/ /g, ' ')]),
            [['kept', true, 'Josh Allen is Doubtful (you locked him in)'], ['kept', true, 'Tee Higgins is on bye (you locked him in)']]);
        assert.equal(needsYou(list), false);
        assert.ok(Number.isNaN(issues.firstKickoffMs));
    });

    test('a locked IR-slot starter still has to be activated', () => {
        assert.equal(needsYou(items(lineupIssues([s('WR1', { ...chase, locked: true })], ctx()))), true);
    });
});

describe('the IR slot: its rules and the roster size', () => {
    test('irEligible: NFL IR always; the league allows Out here, not Doubtful; PUP/NFI unknown; healthy and Q never', () => {
        assert.equal(irEligible('IR', RULES), true);
        assert.equal(irEligible('OUT', RULES), true);
        assert.equal(irEligible('D', RULES), false);
        assert.equal(irEligible('PUP', RULES), null);
        assert.equal(irEligible(null, RULES), false);
        assert.equal(irEligible('Q', RULES), false);
        assert.equal(irEligible('OUT', null), null);
    });

    test('a bench player whose status the IR takes, with a slot open: move him; the count when they outnumber the slots', () => {
        const kittle = pl('George Kittle', 'TE', { inj: 'OUT' }), henryOut = pl('Derrick Henry', 'RB', { inj: 'IR' });
        const doubtful = pl('Doubtful Guy', 'WR', { inj: 'D' });
        const starter = pl('Starter', 'QB');
        const roster = [starter, kittle, henryOut, doubtful, pl('Already In', 'WR', { isReserve: true, inj: 'IR' })];
        const issues = lineupIssues([s('QB1', starter)], ctx({ irRules: RULES, roster }));
        assert.equal(issues.irSlotsOpen, 1);
        assert.deepEqual(texts(issues), ['Move George Kittle to IR to free a roster spot (1 IR slot open)',
            'Move Derrick Henry to IR to free a roster spot (1 IR slot open)']);
        // No open slot: no moves. Unknown rules (manual leagues, old syncs): none either.
        assert.deepEqual(texts(lineupIssues([s('QB1', starter)], ctx({ irRules: { ...RULES, slots: 1 }, roster }))), []);
        assert.deepEqual(texts(lineupIssues([s('QB1', starter)], ctx({ roster }))), []);
    });

    test('an IR-slot bench player no longer eligible there (healthy, Questionable, or a status this IR refuses) must come out', () => {
        const healthy = pl('George Kittle', 'TE', { isReserve: true }), questionable = pl('Q Guy', 'WR', { isReserve: true, inj: 'Q' });
        const doubtful = pl('D Guy', 'RB', { isReserve: true, inj: 'D' }), out = pl('Still Out', 'RB', { isReserve: true, inj: 'OUT' });
        const pup = pl('Pup Guy', 'RB', { isReserve: true, inj: 'PUP' });
        const issues = lineupIssues([s('QB1', pl('QB', 'QB'))], ctx({ irRules: RULES, roster: [healthy, questionable, doubtful, out, pup] }));
        assert.deepEqual(issues.irStuck, [healthy, questionable, doubtful]);
        assert.equal(texts(issues)[0], "Activate George Kittle from IR: he's no longer eligible there, and Sleeper blocks adds and drops until you do");
        assert.equal(items(issues)[0].kind, 'ir');
    });

    test('a full roster: activations say to drop someone first', () => {
        const roster = [chase, pl('A', 'QB'), pl('B', 'RB')];
        const starters = [s('WR1', chase), s('QB1', roster[1])];
        assert.deepEqual(texts(lineupIssues(starters, ctx({ irRules: RULES, roster, rosterSize: 2 }))),
            ["Activate Ja'Marr Chase from IR on Sleeper before kickoff (roster full: drop someone first)"]);
        assert.deepEqual(texts(lineupIssues(starters, ctx({ irRules: RULES, roster, rosterSize: 3 }))),
            ["Activate Ja'Marr Chase from IR on Sleeper before kickoff"]);
    });
});

describe('lineupIssueItems wording', () => {
    test('names use no-break spaces, so a line never wraps inside one', () => {
        assert.equal(items(lineupIssues([s('QB1', allen)], ctx()))[0].text, 'Josh Allen is Doubtful: no healthy QB on your bench');
    });

    test('every status spelled out', () => {
        const players = OUT.map((inj, i) => pl(`P${i}`, 'WR', { inj }));
        assert.deepEqual(texts(lineupIssues(players.map((p, i) => s(`WR${i + 1}`, p)), ctx())).map(t => t.replace(/: no healthy WR on your bench$/, '')),
            ['P0 is Doubtful', 'P1 is Out', 'P2 is on IR', 'P3 is on PUP', 'P4 is suspended', 'P5 is on NFI', "P6 hasn't reported"]);
    });

    test('order: activations, injuries, byes, empty slots, IR moves, then what you kept', () => {
        const kittle = pl('Kittle', 'TE', { inj: 'OUT' });
        const kept = pl('Kept', 'RB', { inj: 'D', locked: true });
        const issues = lineupIssues([s('RB1', kept), s('TE1', null), s('WR2', higgins), s('QB1', allen), s('WR1', chase)],
            ctx({ irRules: RULES, roster: [kittle, chase] }));
        assert.deepEqual(items(issues).map(i => i.kind), ['ir', 'injured', 'bye', 'empty', 'ir', 'kept']);
    });

    test('joinAnd', () => {
        assert.equal(joinAnd([]), '');
        assert.equal(joinAnd(['A']), 'A');
        assert.equal(joinAnd(['A', 'B']), 'A and B');
        assert.equal(joinAnd(['A', 'B', 'C'], 'or'), 'A, B or C');
    });
});

describe('sleeperLineupChanges', () => {
    test('who to start and bench on Sleeper; none when they match', () => {
        assert.deepEqual(sleeperLineupChanges(['1', '2', '3'], ['3', '2', '4']), { start: ['1'], bench: ['4'] });
        assert.deepEqual(sleeperLineupChanges(['1', '2'], ['2', '1']), { start: [], bench: [] });
    });
});
