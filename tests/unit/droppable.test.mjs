// Who should I drop? (improvements S54): js/mls/scout/droppable.js's score and reasons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankDroppable, startersAt, protectedText } from '../../js/mls/scout/droppable.js';

const REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 0, DEF: 0 };
let nextId = 1;
const pl = (name, pos, rosPos, extra = {}) => ({
    id: String(nextId++), name, cleanName: name.toLowerCase(), pos, team: 'KC',
    ros: rosPos ? { posRank: rosPos, posTier: extra.tier ?? null } : null, now: null, ...extra
});

test('startersAt shares flex spots out by position', () => {
    assert.equal(startersAt('WR', REQS), 2 + 2 * 0.45);
    assert.equal(startersAt('TE', REQS), 1 + 2 * 0.1);
    assert.equal(startersAt('QB', { ...REQS, SFLEX: 1 }), 1.9);
});

test('no ranks anywhere: nothing to judge by', () => {
    assert.equal(rankDroppable({ players: [pl('A', 'WR', null)], reqs: REQS, teamCount: 12 }), null);
});

test('the deep, low-ranked bench WR is the clear first drop, with reasons in plain words', () => {
    const roster = [
        pl('Qb One', 'QB', 5), pl('Rb One', 'RB', 3), pl('Rb Two', 'RB', 14), pl('Rb Three', 'RB', 30),
        pl('Wr One', 'WR', 2), pl('Wr Two', 'WR', 9), pl('Wr Three', 'WR', 25), pl('Wr Four', 'WR', 41),
        pl('Wr Five', 'WR', 70), pl('Te One', 'TE', 6)
    ];
    const r = rankDroppable({ players: roster, reqs: REQS, teamCount: 12, powerRank: { QB: 6, RB: 5, WR: 2, TE: 7 } });
    assert.equal(r.picks[0].player.name, 'Wr Five');
    assert.deepEqual(r.picks[0].reasons, ['WR5 on your team', 'ROS WR70', "you're 2nd of 12 at WR"]);
    // Round 3: the verdict in plain words, and a short one without the room clause for lists.
    assert.equal(r.picks[0].verdict, "Your 5th WR, so he won't start for you; ranked outside the league's starting WRs; your WR room is 2nd of 12.");
    assert.equal(r.picks[0].short, "Your 5th WR, so he won't start for you; ranked outside the league's starting WRs.");
    // The top starters are last.
    assert.deepEqual(r.picks.slice(-4).map(x => x.player.name).sort(), ['Qb One', 'Rb One', 'Te One', 'Wr One']);
    assert.ok(r.picks[0].score > r.picks[1].score);
});

test('IR, taxi and locked players are never suggested, and are named', () => {
    const roster = [
        pl('Wr One', 'WR', 2), pl('Wr Two', 'WR', 9), pl('Wr Hurt', 'WR', 90, { isReserve: true }),
        pl('Wr Kid', 'WR', 95, { isTaxi: true }), pl('Wr Locked', 'WR', 80, { locked: true }), pl('Wr Low', 'WR', 60)
    ];
    const r = rankDroppable({ players: roster, reqs: REQS, teamCount: 12 });
    assert.equal(r.picks[0].player.name, 'Wr Low');
    assert.ok(!r.picks.some(x => ['Wr Hurt', 'Wr Kid', 'Wr Locked'].includes(x.player.name)));
    assert.equal(protectedText(r.protected), 'Wr Hurt (IR); Wr Kid (taxi); Wr Locked (you locked him)');
});

test('a starter on bye is judged by ROS, not as unranked this week', () => {
    const wk = (n) => ({ posRank: n });
    const roster = [
        pl('Star On Bye', 'WR', 3, { onBye: true, now: null }),
        pl('Wr Two', 'WR', 20, { now: wk(18) }), pl('Wr Three', 'WR', 35, { now: wk(30) }), pl('Wr Four', 'WR', 55, { now: wk(50) })
    ];
    const r = rankDroppable({ players: roster, reqs: REQS, teamCount: 12 });
    assert.equal(r.picks[r.picks.length - 1].player.name, 'Star On Bye');
    assert.ok(r.picks.find(x => x.player.name === 'Star On Bye').reasons.includes('on bye'));
    // With no ROS rank either, he can't be judged: listed, not suggested.
    // With no ROS set loaded at all, he can't be judged: listed, not suggested.
    const weeklyOnly = roster.map(p => ({ ...p, ros: null }));
    const r2 = rankDroppable({ players: weeklyOnly, reqs: REQS, teamCount: 12, hasRos: false });
    assert.ok(!r2.picks.some(x => x.player.name === 'Star On Bye'));
    assert.equal(r2.protected[0].why, 'on bye, not in your rankings this week');
    // With a ROS set loaded and him not in it, he's unranked, and a fair drop (round 4).
    const r3 = rankDroppable({ players: [{ ...roster[0], ros: null }, ...roster.slice(1)], reqs: REQS, teamCount: 12, hasRos: true });
    assert.equal(r3.picks[0].player.name, 'Star On Bye');
});

test('upside keeps a player: trending adds and youth in dynasty; age counts against in dynasty', () => {
    const base = () => [pl('Wr One', 'WR', 2), pl('Wr Two', 'WR', 9), pl('Wr Three', 'WR', 25)];
    const a = pl('Wr Hot', 'WR', 60, { trending: 12000 }), b = pl('Wr Cold', 'WR', 60);
    const r = rankDroppable({ players: [...base(), a, b], reqs: REQS, teamCount: 12 });
    assert.ok(r.picks.find(x => x.player === b).score > r.picks.find(x => x.player === a).score);
    assert.ok(r.picks.find(x => x.player === a).reasons.includes('trending: 12,000 adds'));
    const y = pl('Wr Young', 'WR', 60, { age: 22 }), o = pl('Wr Old', 'WR', 60, { age: 31 });
    const d = rankDroppable({ players: [...base(), y, o], reqs: REQS, teamCount: 12, dynasty: true });
    assert.equal(d.picks[0].player, o);
    assert.ok(d.picks[0].reasons.includes('age 31'));
});

test('Out players are ranked like anyone, saying so; a keeper league says the app cannot see keepers', () => {
    const roster = [pl('Wr One', 'WR', 2), pl('Wr Two', 'WR', 9), pl('Wr Out', 'WR', 50, { inj: 'OUT' })];
    const r = rankDroppable({ players: roster, reqs: REQS, teamCount: 12, keeper: true });
    assert.equal(r.picks[0].player.name, 'Wr Out');
    assert.ok(r.picks[0].reasons.includes('Out this week'));
    assert.match(r.note, /Keeper league/);
});

test('a lone kicker is not a drop; a second one is', () => {
    const reqs = { ...REQS, K: 1 };
    const one = rankDroppable({ players: [pl('Wr One', 'WR', 2), pl('Kick One', 'K', null)], reqs, teamCount: 12 });
    assert.ok(!one.picks.some(x => x.player.pos === 'K'));
    const two = rankDroppable({ players: [pl('Wr One', 'WR', 2), pl('Kick One', 'K', 4), pl('Kick Two', 'K', 20)], reqs, teamCount: 12 });
    assert.deepEqual(two.picks.filter(x => x.player.pos === 'K').map(x => x.player.name), ['Kick Two']);
});

test("this week's rank is said only when it differs from ROS; a thin room is a reason to keep him", () => {
    const roster = [pl('Rb One', 'RB', 3, { now: { posRank: 3 } }), pl('Rb Two', 'RB', 14, { now: { posRank: 20 } }), pl('Rb Three', 'RB', 40, { now: { posRank: 40 } })];
    const r = rankDroppable({ players: roster, reqs: REQS, teamCount: 12, powerRank: { RB: 12 } });
    const by = (n) => r.picks.find(x => x.player.name === n);
    assert.ok(!by('Rb Three').reasons.some(t => t.startsWith('Wk')));
    assert.ok(by('Rb Two').reasons.includes('Wk RB20'));
    assert.match(by('Rb Three').verdict, /, but your RB room is thin \(12th of 12\)\.$/);
});

test('round 4: no NFL team leads the verdict; a dynasty league names its dynasty set; reasons group by kind', () => {
    const roster = [pl('Wr One', 'WR', 2), pl('Wr Two', 'WR', 9), pl('Wr Three', 'WR', 25), pl('Wr Gone', 'WR', null, { team: 'FA' }), pl('Wr Deep', 'WR', null)];
    const r = rankDroppable({ players: roster, reqs: REQS, teamCount: 12, dynasty: true, hasRos: true });
    const gone = r.picks.find(x => x.player.name === 'Wr Gone');
    assert.match(gone.verdict, /won't start for you; no NFL team/);
    assert.ok(gone.reasons.includes('no NFL team'));
    assert.ok(r.picks.find(x => x.player.name === 'Wr Deep').reasons.includes('not in your dynasty rankings'));
    assert.ok(r.picks.find(x => x.player.name === 'Wr One').reasons.includes('Dyn WR2'));
});

test('round 5: a breakout this week is upside, rookies keep upside (more in dynasty), Best Ball says points', () => {
    const base = () => [pl('Rb One', 'RB', 3), pl('Rb Two', 'RB', 8), pl('Rb Three', 'RB', 12)];
    const hot = pl('Rb Hot', 'RB', 30, { now: { posRank: 1 } }), cold = pl('Rb Cold', 'RB', 30, { now: { posRank: 31 } });
    const r = rankDroppable({ players: [...base(), hot, cold], reqs: REQS, teamCount: 12 });
    const h = r.picks.find(x => x.player === hot), c = r.picks.find(x => x.player === cold);
    assert.ok(c.score > h.score, 'the breakout is kept ahead of his twin');
    assert.equal(h.verdict, 'Your 4th RB, but Wk RB1 this week.');
    assert.doesNotMatch(h.verdict, /won't start/);

    const rook = pl('Rb Rookie', 'RB', 40, { rookie: true }), vet = pl('Rb Vet', 'RB', 40);
    const red = rankDroppable({ players: [...base(), rook, vet], reqs: REQS, teamCount: 12 });
    const dyn = rankDroppable({ players: [...base(), rook, vet], reqs: REQS, teamCount: 12, dynasty: true });
    const gap = (res) => res.picks.find(x => x.player === vet).score - res.picks.find(x => x.player === rook).score;
    assert.ok(gap(red) > 0 && gap(dyn) > gap(red), 'a rookie keeps more upside in dynasty');
    assert.match(dyn.picks.find(x => x.player === rook).verdict, /but a rookie, still developing\.$/);
    assert.match(red.picks.find(x => x.player === rook).verdict, /but a rookie\.$/);
    assert.ok(red.picks.find(x => x.player === rook).reasons.includes('rookie'));

    const bb = rankDroppable({ players: [...base(), vet], reqs: REQS, teamCount: 12, bestBall: true });
    assert.match(bb.picks[0].verdict, /so his points rarely count/);
});
