// The Final Window (improvements S36, js/mls/week/lastWindow.js): when the week is down to its last night window, the
// shared simulation's tiles, what each matchup needs in words, and the two-player table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalWindow, simulateWindow, certainResult, needsLine, twoPlayerTable, shareText, shortName } from '../../js/mls/week/lastWindow.js';

// A seeded generator, so the runs are the same every time.
function seeded(seed = 1) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const P = (id, mean, sd, extra = {}) => ({ id, name: id, pos: 'WR', team: 'MIN', mean, sd, ...extra });
const run = (ms, runs = 4000) => simulateWindow(ms, { runs, random: seeded(7) });

// --- When it shows ---
const times = {
    // Monday Nov 16 2026: 7:15 PM and 8:15 PM Eastern (00:15 and 01:15 UTC Tuesday).
    BUF: '2026-11-17T00:15:00Z', MIN: '2026-11-17T00:15:00Z', KC: '2026-11-17T01:15:00Z', DEN: '2026-11-17T01:15:00Z',
    // Sunday night 8:20 PM Eastern, and a Sunday 1:00 PM game.
    DAL: '2026-11-16T01:20:00Z', PHI: '2026-11-16T01:20:00Z', NYG: '2026-11-15T18:00:00Z', WAS: '2026-11-15T18:00:00Z',
};
const games = {
    BUF: { opp: 'MIN', home: false, state: 'pre' }, MIN: { opp: 'BUF', home: true, state: 'pre' },
    KC: { opp: 'DEN', home: false, state: 'pre' }, DEN: { opp: 'KC', home: true, state: 'pre' },
    DAL: { opp: 'PHI', home: false, state: 'pre' }, PHI: { opp: 'DAL', home: true, state: 'pre' },
    NYG: { opp: 'WAS', home: false, state: 'in' }, WAS: { opp: 'NYG', home: true, state: 'in' },
};

test('finalWindow: two Monday games are one window; Sunday night alone is one; an afternoon game left is not', () => {
    const mon = finalWindow({ liveTeams: ['MIN', 'BUF', 'KC'], times, games });
    assert.ok(mon);
    assert.deepEqual(mon.games.map(g => `${g.away}@${g.home}`), ['BUF@MIN', 'KC@DEN']);
    assert.equal(mon.kickoff, new Date(times.BUF).getTime());
    assert.ok(finalWindow({ liveTeams: ['DAL'], times, games }), 'SNF is the last game that matters');
    assert.equal(finalWindow({ liveTeams: ['DAL', 'BUF'], times, games }), null, 'Sunday night and Monday are two windows');
    assert.equal(finalWindow({ liveTeams: ['NYG', 'DAL'], times, games }), null, 'an afternoon game is still left');
    assert.equal(finalWindow({ liveTeams: [], times, games }), null);
    assert.equal(finalWindow({ liveTeams: ['XYZ'], times, games }), null, 'an unknown kickoff');
    assert.equal(finalWindow({ liveTeams: ['BUF'], times, games: { ...games, BUF: { ...games.BUF, state: 'post' } } }), null);
});

// --- The tiles ---
test('a sure win and a sure loss are certain, never at stake', () => {
    assert.equal(certainResult({ margin: 4, mine: [P('a', 5, 3)], theirs: [] }), 'W');
    assert.equal(certainResult({ margin: -4, mine: [], theirs: [P('b', 5, 3)] }), 'L');
    assert.equal(certainResult({ margin: 0, mine: [], theirs: [P('b', 5, 3)] }), 'L');
    assert.equal(certainResult({ margin: -4, mine: [P('a', 5, 3)], theirs: [] }), null);
    const sim = run([
        { key: 'win', margin: 4, mine: [P('a', 5, 3)], theirs: [] },
        { key: 'loss', margin: -4, mine: [], theirs: [P('b', 5, 3)] },
        { key: 'open', margin: 0, mine: [P('c', 10, 4)], theirs: [P('d', 10, 4)] },
    ]);
    assert.equal(sim.chances.get('win'), 1);
    assert.equal(sim.chances.get('loss'), 0);
    assert.ok(Math.abs(sim.chances.get('open') - 0.5) < 0.05);
    assert.equal(sim.tiles.live, 3);
    assert.equal(sim.tiles.atStake, 1);
    assert.deepEqual(sim.tiles.stake, ['open']);
    assert.equal(sim.tiles.best, 1);
    assert.ok(Math.abs(sim.tiles.sweepShare - 0.5) < 0.05);
    assert.ok(Math.abs(sim.tiles.expected - 0.5) < 0.05);
});

test('a matchup the runs never lose (or never win) is settled, not at stake', () => {
    const sim = run([
        { key: 'blowout', margin: 60, mine: [], theirs: [P('a', 10, 3)] },
        { key: 'open', margin: 0, mine: [P('c', 10, 4)], theirs: [P('d', 10, 4)] },
    ]);
    assert.equal(sim.chances.get('blowout'), 1);
    assert.deepEqual(sim.tiles.stake, ['open']);
});

test('a shared player moves his matchups together: one on your side in two leagues, against you in a third', () => {
    // Allen alone decides three matchups: yours in A and B (you need 15+), theirs in C (you win if he's under 15).
    const allen = (mean = 15, sd = 6) => P('allen', mean, sd, { pos: 'QB', team: 'BUF' });
    const ms = [
        { key: 'A', margin: -15, mine: [allen()], theirs: [] },
        { key: 'B', margin: -15, mine: [allen()], theirs: [] },
        { key: 'C', margin: 15, mine: [], theirs: [allen()] },
    ];
    const sim = run(ms);
    // A and B win together, and C wins exactly when they don't: every run has 2 wins or 1, never 0 or 3.
    assert.equal(sim.tiles.atStake, 3);
    assert.equal(sim.tiles.sweepShare, 0);
    assert.equal(sim.tiles.best, 2);
    assert.ok(sim.tiles.low >= 1 && sim.tiles.high <= 2);
    assert.ok(Math.abs(sim.chances.get('A') - sim.chances.get('B')) < 1e-9);
    assert.ok(Math.abs(sim.chances.get('A') + sim.chances.get('C') - 1) < 1e-9);
    // As if independent, a sweep would come up about an eighth of the time; a shutout too.
});

test('a league\'s own scoring: the same draw, scaled by each league\'s mean and spread', () => {
    // PPR and half PPR: 12 ± 4 and 10 ± 3.33 are the same percentile, so with the bars at 12 and 10 they win together.
    const sim = run([
        { key: 'ppr', margin: -12, mine: [P('x', 12, 4)], theirs: [] },
        { key: 'half', margin: -10, mine: [P('x', 10, 4 * 10 / 12)], theirs: [] },
    ]);
    assert.ok(Math.abs(sim.chances.get('ppr') - sim.chances.get('half')) < 0.01);
    assert.ok(sim.tiles.sweepShare > 0.45);
});

test('the clean sweep, expected wins and the middle 80% over many open matchups', () => {
    const ms = Array.from({ length: 6 }, (_, i) => ({ key: `m${i}`, margin: 0, mine: [P(`me${i}`, 10, 4)], theirs: [P(`them${i}`, 10, 4)] }));
    const sim = run(ms, 8000);
    assert.equal(sim.tiles.atStake, 6);
    assert.ok(Math.abs(sim.tiles.expected - 3) < 0.15);
    // Six coin flips: 1 or fewer wins 7 times in 64 (over a tenth), 4 or fewer 57 in 64 (under nine tenths).
    assert.equal(sim.tiles.low, 1);
    assert.equal(sim.tiles.high, 5);
    // Six coin flips: a sweep 1 in 64.
    assert.ok(Math.abs(sim.tiles.sweepShare - 1 / 64) < 0.008);
    assert.equal(sim.tiles.best, 6);
    assert.equal(sim.tiles.bestShare, sim.tiles.sweepShare);
    // The most common number of wins: 3 (20 in 64).
    assert.equal(sim.tiles.likely, 3);
    assert.ok(Math.abs(sim.tiles.likelyShare - 20 / 64) < 0.02);
});

test('shareText', () => {
    assert.equal(shareText(0), '0%');
    assert.equal(shareText(0.004), 'under 1%');
    assert.equal(shareText(0.123), '12%');
    assert.equal(shareText(0.995), 'over 99%');
    assert.equal(shareText(1), '100%');
});

// --- Words ---
const N = (name) => ({ name });
test('needsLine: the margin and what it takes, from your side', () => {
    assert.equal(needsLine({ margin: 5.2, mine: [], theirs: [N('James Cook III'), N('Jordan Mason')] }),
        'Up 5.2. Hold <strong>James Cook III</strong> + <strong>Jordan Mason</strong> under 5.2 more.');
    assert.equal(needsLine({ margin: -11.5, mine: [N('T.J. Hockenson'), N('Jordan Addison')], theirs: [] }),
        'Down 11.5. <strong>T.J. Hockenson</strong> + <strong>Jordan Addison</strong> need 11.5+ more.');
    assert.equal(needsLine({ margin: -2.3, mine: [N('Josh Allen')], theirs: [N('Justin Jefferson')] }),
        'Down 2.3. <strong>Josh Allen</strong> needs 2.3+ more than <strong>Justin Jefferson</strong>.');
    assert.equal(needsLine({ margin: 2.3, mine: [N('Josh Allen')], theirs: [N('Justin Jefferson')] }),
        'Up 2.3. <strong>Justin Jefferson</strong> needs 2.3+ more than <strong>Josh Allen</strong>.');
    assert.equal(needsLine({ margin: 4, mine: [N('A')], theirs: [] }), 'Up 4.0. Nobody left on their side: anything from <strong>A</strong> does it.');
    assert.equal(needsLine({ margin: -4, mine: [], theirs: [N('B')] }), "Down 4.0. Nobody left on your side: even a zero from <strong>B</strong> isn't enough.");
    assert.equal(needsLine({ margin: 0, mine: [N('A')], theirs: [N('B')] }), 'Level. <strong>A</strong> needs more than <strong>B</strong>.');
    // Names are escaped.
    assert.equal(needsLine({ margin: -1, mine: [N('<b>Ja\'Marr</b>')], theirs: [] }), 'Down 1.0. <strong>&lt;b&gt;Ja&#39;Marr&lt;/b&gt;</strong> needs 1.0+ more.');
});

test('twoPlayerTable: two of yours, two of theirs, one each; none with three', () => {
    const mine = twoPlayerTable({ margin: -11.5, mine: [{ name: 'Addison', mean: 9, sd: 5 }, { name: 'Hockenson', mean: 7.9, sd: 4 }], theirs: [] });
    assert.equal(mine.first.name, 'Addison');
    assert.equal(mine.second.name, 'Hockenson');
    assert.equal(mine.head, 'needs');
    assert.deepEqual(mine.rows.map(r => [r.label, r.value, r.text]), [['Quiet', 0, '11.5+'], ['Projection', 9, '2.5+'], ['Big night', 15.4, 'anything']]);

    const theirs = twoPlayerTable({ margin: 5.2, mine: [], theirs: [{ name: 'Cook', mean: 11.8, sd: 6 }, { name: 'Mason', mean: 4, sd: 3 }] });
    assert.equal(theirs.head, 'must stay');
    assert.deepEqual(theirs.rows.map(r => r.text), ['under 5.2', 'you lose either way', 'you lose either way']);

    // One each: Allen (yours, more to come) against Jefferson.
    const each = twoPlayerTable({ margin: -2.3, mine: [{ name: 'Allen', mean: 20, sd: 7 }], theirs: [{ name: 'Jefferson', mean: 15, sd: 6 }] });
    assert.equal(each.first.name, 'Allen');
    assert.equal(each.second.side, 'theirs');
    assert.deepEqual(each.rows.map(r => r.text), ['you lose either way', 'under 17.7', 'under 26.7']);

    assert.equal(twoPlayerTable({ margin: 1, mine: [{ name: 'a', mean: 1, sd: 1 }], theirs: [] }), null);
    assert.equal(twoPlayerTable({ margin: 1, mine: [{ name: 'a' }, { name: 'b' }], theirs: [{ name: 'c' }] }), null);
});

test('needsLine with a name drawn by the caller (the Scoreboard adds a position badge)', () => {
    const line = needsLine({ margin: -3, mine: [{ name: 'A&B', pos: 'WR' }], theirs: [] }, undefined, (p, esc) => `[${p.pos}] ${esc(p.name)}`);
    assert.equal(line, 'Down 3.0. [WR] A&amp;B needs 3.0+ more.');
});

test('shortName', () => {
    assert.equal(shortName('Justin Jefferson'), 'Jefferson');
    assert.equal(shortName('James Cook III'), 'Cook III');
    assert.equal(shortName('T.J. Hockenson'), 'Hockenson');
    assert.equal(shortName('Ravens'), 'Ravens');
    assert.equal(shortName(''), '');
});
