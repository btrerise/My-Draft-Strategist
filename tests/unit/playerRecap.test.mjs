// The Scoreboard's MVPs and LVPs (improvements S22, js/mls/week/playerRecap.js): ownership, boom share, partial booms,
// ties by ownership, byes, started zeros, dead weight, still open, worst benchings (never Best Ball), unresolved ids,
// and the editable lines' validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerRecap, normalizeLines, validateLines, DEFAULT_LINES, ownText, pointsRange, startedText } from '../../js/mls/week/playerRecap.js';

const PLAYERS = {
    chase: { name: "Ja'Marr Chase", pos: 'WR', team: 'CIN' },
    lamb: { name: 'CeeDee Lamb', pos: 'WR', team: 'DAL' },
    mcbride: { name: 'Trey McBride', pos: 'TE', team: 'ARI' },
    henry: { name: 'Derrick Henry', pos: 'RB', team: 'BAL' },
    allen: { name: 'Josh Allen', pos: 'QB', team: 'BUF' },
    jj: { name: 'Justin Jefferson', pos: 'WR', team: 'MIN' },
    nacua: { name: 'Puka Nacua', pos: 'WR', team: 'LAR' },
    bye: { name: 'On Bye', pos: 'WR', team: 'SEA' },
    fa: { name: 'No Team', pos: 'RB', team: null },
    kick: { name: 'Kicker', pos: 'K', team: 'BAL' },
};
const GAMES = { CIN: { state: 'post' }, DAL: { state: 'post' }, ARI: { state: 'post' }, BAL: { state: 'post' }, BUF: { state: 'post' }, MIN: { state: 'pre' }, LAR: { state: 'post' }, SEA: { state: 'pre' } };
// A league: your entry with these points; starters listed in `start`.
const lg = (id, pts, start, extra = {}) => ({
    id, name: `League ${id}`, bestBall: false, ...extra,
    entry: { players: Object.keys(pts), starters: start, players_points: pts },
});
const recap = (leagues, extra = {}) => buildPlayerRecap({ leagues, players: PLAYERS, games: GAMES, byeTeams: ['SEA'], ...extra });
const ids = (rows) => rows.map(r => r.id);

test('ownership counts the Sleeper leagues with your roster, bench included', () => {
    const r = recap([lg('a', { chase: 25 }, ['chase']), lg('b', { chase: 22, lamb: 1 }, ['lamb']), lg('c', { lamb: 3 }, ['lamb'])]);
    assert.equal(r.leagueCount, 3);
    const chase = r.mvps.find(x => x.id === 'chase');
    assert.deepEqual([chase.own, chase.ownPct, ownText(chase), chase.boomed, chase.started], [2, 67, '67% (2)', 2, 1]);
    assert.equal(startedText(chase), '50% (1)'); // started in 1 of the 2 leagues that own him
    assert.equal(pointsRange(chase), '22.0–25.0');
});

test('MVPs rank by leagues boomed, then ownership', () => {
    const r = recap([
        lg('a', { chase: 25, lamb: 21, henry: 20 }, ['chase', 'lamb', 'henry']),
        lg('b', { chase: 24, lamb: 10, henry: 22 }, ['chase', 'lamb', 'henry']),
        lg('c', { lamb: 22, henry: 25 }, ['lamb']),
    ]);
    // Henry boomed 3 of 3; Chase 2 of 2 and Lamb 2 of 3 tie on 2 leagues, Lamb owned more widely.
    assert.deepEqual(ids(r.mvps), ['henry', 'lamb', 'chase']);
    assert.equal(r.mvps[0].boomed, 3);
});

test('a partial boom (one TE-premium league of six) ranks below the full booms and is called out', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    const leagues = six.map((id, i) => lg(id, { mcbride: i === 0 ? 15.7 : 12 + i * 0.2, ...(i === 0 ? { chase: 21 } : {}) }, ['mcbride', 'chase']));
    const r = recap(leagues);
    assert.deepEqual(ids(r.mvps), ['chase', 'mcbride']); // Chase boomed in 1 of 1, so he's above McBride's 1 of 6
    const tePartial = r.mvps[1];
    assert.equal(tePartial.partial, true);
    assert.deepEqual(ids(r.partial), ['mcbride']);
    assert.equal(pointsRange(tePartial), '12.2–15.7');
    assert.equal(r.mvps[0].partial, false);
});

test('a boom only on your bench isn\'t an MVP: it gets its own line (round 2); in Best Ball a bench boom counts', () => {
    // Raridon boomed in all three leagues, benched in each; Chase boomed once, started.
    const raridon = { name: 'Eli Raridon', pos: 'TE', team: 'CIN' };
    const r = buildPlayerRecap({
        leagues: [lg('a', { er: 16, chase: 21 }, ['chase']), lg('b', { er: 17 }, []), lg('c', { er: 15.4 }, [])],
        players: { ...PLAYERS, er: raridon }, games: GAMES,
    });
    assert.deepEqual(ids(r.mvps), ['chase']);
    assert.deepEqual(ids(r.benchBooms), ['er']);
    assert.deepEqual([r.benchBooms[0].boomed, r.benchBooms[0].started, startedText(r.benchBooms[0])], [3, 0, '0% (0)']);
    assert.ok(!ids(r.stillOpen).includes('er') && !ids(r.lvps).includes('er'));
    const bb = buildPlayerRecap({ leagues: [lg('bb', { er: 16 }, [], { bestBall: true })], players: { ...PLAYERS, er: raridon }, games: GAMES });
    assert.deepEqual([ids(bb.mvps), ids(bb.benchBooms)], [['er'], []]);
});

test('MVPs rank by booms where you started him, then all booms, then ownership', () => {
    // Allen: boomed 2, started in 1 of them. Chase: boomed 1, started. Henry: boomed 2, started in both.
    const r = recap([
        lg('a', { allen: 30, chase: 22, henry: 21 }, ['allen', 'chase', 'henry']),
        lg('b', { allen: 26, henry: 25 }, ['henry']),
    ]);
    assert.deepEqual(ids(r.mvps), ['henry', 'allen', 'chase']);
    assert.deepEqual(r.mvps.map(x => x.startedBoomed), [2, 1, 1]);
});

test('LVPs: below Bust with a final game, ranked by started busts, then ownership', () => {
    const r = recap([
        lg('a', { allen: 8, henry: 5, lamb: 4 }, ['allen', 'henry']),
        lg('b', { allen: 9, henry: 6, lamb: 3 }, ['allen']),
        lg('c', { lamb: 2, nacua: 6 }, ['nacua']),
    ]);
    // Allen started and busted twice; Henry and Nacua once each (Henry owned twice); Lamb busted on the bench only.
    assert.deepEqual(ids(r.lvps), ['allen', 'henry', 'nacua', 'lamb']);
    assert.equal(r.lvps[0].startedBusted, 2);
});

test('players on a bye, with no team, and K / DEF are left out', () => {
    const r = recap([lg('a', { bye: 0, fa: 0, kick: 0, BAL: 0, chase: 30 }, ['bye', 'fa', 'kick', 'BAL', 'chase'])]);
    assert.deepEqual(ids(r.mvps), ['chase']);
    assert.deepEqual([r.lvps, r.startedZeros, r.stillOpen, r.unresolved], [[], [], [], []]);
});

test('a 0.0 starter whose game is final is a started zero; one whose game is still to come is still open', () => {
    const r = recap([lg('a', { nacua: 0, jj: 0 }, ['nacua', 'jj']), lg('b', { nacua: 0 }, ['nacua'])]);
    assert.deepEqual(ids(r.startedZeros), ['nacua']);
    assert.equal(r.startedZeros[0].zeroIn, 2);
    assert.deepEqual(ids(r.stillOpen), ['jj']);
    assert.ok(!ids(r.lvps).includes('jj'), 'not an LVP until his game is final');
});

test('still open: any game not final, unless he has already boomed', () => {
    const games = { ...GAMES, CIN: { state: 'in' }, DAL: { state: 'in' } };
    const r = recap([lg('a', { chase: 22, lamb: 4 }, ['chase', 'lamb'])], { games });
    assert.deepEqual(ids(r.mvps), ['chase']); // 22 mid-game is already a Boom
    assert.deepEqual(ids(r.stillOpen), ['lamb']);
    assert.deepEqual(r.lvps, []);
    // Without game states nobody is final: no LVPs.
    const unknown = recap([lg('a', { lamb: 4 }, ['lamb'])], { games: {} });
    assert.deepEqual([ids(unknown.lvps), ids(unknown.stillOpen)], [[], ['lamb']]);
});

test('dead weight: widely owned, nothing scored, on the bench everywhere', () => {
    const r = recap([
        lg('a', { nacua: 0, chase: 25 }, ['chase']),
        lg('b', { nacua: 0, chase: 21 }, ['chase']),
        lg('c', { lamb: 0 }, []),
    ]);
    assert.deepEqual(ids(r.deadWeight), ['nacua']); // Lamb is on one roster only
});

test('worst benchings: a benched boom over a far lower starter at his position; never in Best Ball', () => {
    const pts = { lamb: 25, chase: 6, nacua: 18 };
    const r = recap([lg('a', pts, ['chase', 'nacua']), lg('bb', pts, ['chase', 'nacua'], { bestBall: true, name: 'Best Ball League' })]);
    assert.equal(r.worstBenchings.length, 1);
    const b = r.worstBenchings[0];
    assert.deepEqual([b.league.id, b.bench.id, b.starter.id, b.gap], ['a', 'lamb', 'chase', 19]);
    // Lamb sat on a Best Ball bench, so the note about Best Ball's lineup shows.
    assert.equal(r.bestBallNote, true);
    // A gap under BENCHING_GAP isn't one of the worst.
    const close = recap([lg('a', { lamb: 21, chase: 15 }, ['chase'])]);
    assert.deepEqual(close.worstBenchings, []);
    // With the league's slot order (round 2): Lamb (WR) could have taken the FLEX, where Henry (RB) scored 3, which a
    // same-position comparison misses (the WR starter scored 18).
    const slotted = recap([{ ...lg('s', { lamb: 25, nacua: 18, henry: 3, allen: 30 }, ['allen', 'nacua', 'henry']), slots: ['QB', 'WR', 'FLEX'] }]);
    assert.deepEqual(slotted.worstBenchings.map(b => [b.starter.id, b.starter.slot, b.gap]), [['henry', 'FLEX', 22]]);
    // A QB can't go in a FLEX: no benching for a benched QB over that RB.
    const qb = recap([{ ...lg('q', { allen: 30, chase: 2, henry: 3 }, ['chase', 'henry']), slots: ['WR', 'FLEX'] }]);
    assert.deepEqual(qb.worstBenchings, []);
    // Slots that don't match the starters (an old sync, a changed league): the same-position rule.
    const off = recap([{ ...lg('o', { lamb: 25, nacua: 4, henry: 3 }, ['nacua', 'henry']), slots: ['QB', 'WR', 'FLEX'] }]);
    assert.deepEqual(off.worstBenchings.map(b => [b.starter.id, b.starter.slot]), [['nacua', null]]);
    // A starter whose game isn't final could still catch up.
    const open = recap([lg('a', { lamb: 25, jj: 2 }, ['jj'])]);
    assert.deepEqual(open.worstBenchings, []);
});

test('an id the player map can\'t resolve is listed, and called out at a Boom-level number', () => {
    const r = recap([lg('a', { x1: 22, x2: 3, chase: 1 }, ['x1'])]);
    assert.deepEqual(r.unresolved.map(u => [u.id, u.max, u.boomLevel]), [['x1', 22, true], ['x2', 3, false]]);
});

test('custom lines change what counts', () => {
    const r = recap([lg('a', { chase: 18 }, ['chase'])], { lines: { ...DEFAULT_LINES, WR: { boom: 18, bust: 5 } } });
    assert.deepEqual(ids(r.mvps), ['chase']);
});

test('no leagues, or only an empty (chopped) entry: nothing to show', () => {
    assert.equal(recap([]).leagueCount, 0);
    const chopped = recap([{ id: 'g', name: 'Chop', entry: { players: [], starters: [], players_points: {} } }]);
    assert.deepEqual([chopped.leagueCount, chopped.mvps], [0, []]);
});

test('lines: validation and normalizing', () => {
    const good = validateLines({ QB: { boom: '24', bust: '12' }, RB: { boom: 20, bust: 7 }, WR: { boom: '20', bust: '7.5' }, TE: { boom: 15, bust: 5.5 } });
    assert.equal(good.ok, true);
    assert.deepEqual(good.lines.WR, { boom: 20, bust: 7.5 });
    const bad = validateLines({ QB: { boom: '10', bust: '12' }, RB: { boom: '', bust: 7 }, WR: { boom: 20, bust: -1 }, TE: { boom: 15, bust: 5.5 } });
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.errors.map(e => `${e.pos}.${e.field}`), ['QB.boom', 'RB.boom', 'WR.bust']);
    assert.deepEqual(normalizeLines(null), { QB: { boom: 24, bust: 12 }, RB: { boom: 20, bust: 7 }, WR: { boom: 20, bust: 7.5 }, TE: { boom: 15, bust: 5.5 } });
    assert.deepEqual(normalizeLines({ QB: { boom: 30, bust: 15 }, RB: { boom: 5, bust: 9 } }).RB, { boom: 20, bust: 7 });
    assert.deepEqual(normalizeLines({ QB: { boom: 30, bust: 15 } }).QB, { boom: 30, bust: 15 });
});
