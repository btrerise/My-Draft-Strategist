// The Scoreboard's share image (improvements S22, round 2, js/mls/week/shareImage.js): a summary at any league count,
// not a tile per league. At most 3 matchups in play and 3 MVPs / LVPs; names escaped; sections only when they have rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreboardImageHTML, SHARE_MATCHUPS, SHARE_PLAYERS } from '../../js/mls/week/shareImage.js';

const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const base = {
    week: 7, final: false, statusHTML: '<span class="badge mls-week-status is-provisional">Provisional</span>',
    record: { W: 12, L: 7, T: 0 }, stillLive: 2, tooEarly: 0,
    splits: [{ label: 'By format', groups: [['Redraft', { W: 7, L: 4, T: 0 }], ['Dynasty', { W: 5, L: 3, T: 0 }]] }],
    swings: many(6, i => ({ name: `Swing ${i}`, margin: -i, chance: 40 + i })),
    bestWin: { name: 'Dynasty <Bros>', margin: 48.2 }, worstLoss: { name: 'Charity 2', margin: -31.5 },
    mvps: many(9, i => ({ name: `MVP ${i}`, pos: 'WR', boomed: 3, own: 4, range: '20.0–25.0' })),
    lvps: many(9, i => ({ name: `LVP ${i}`, pos: 'RB', started: 2, own: 3, range: '1.0–2.0' })),
    leagueCount: 21,
};
const count = (html, re) => (html.match(re) || []).length;

test('a summary: the record, the splits, 3 swings, best and worst, 3 MVPs and 3 LVPs, however many leagues', () => {
    const html = scoreboardImageHTML(base);
    assert.match(html, /Week 7 Recap/);
    assert.match(html, /Record 12–7 · 2 still live/);
    assert.match(html, /Redraft<\/span> 7–4/);
    assert.equal(count(html, /Swing \d/g), SHARE_MATCHUPS);
    assert.match(html, /40% to win/);
    assert.match(html, /Biggest win<\/span> Dynasty &lt;Bros&gt;/); // escaped
    assert.match(html, /Worst loss<\/span> Charity 2/);
    assert.match(html, /−31\.5/);
    assert.equal(count(html, /MVP \d/g), SHARE_PLAYERS);
    assert.equal(count(html, /LVP \d/g), SHARE_PLAYERS);
    assert.match(html, /boomed 3 of 4/);
    assert.match(html, /started 2 of 3/);
    assert.match(html, /21 Sleeper leagues · provisional until the last game is final/);
    assert.ok(!/Swing 3|MVP 3|LVP 3/.test(html));
});

test('empty parts leave no heading; Final drops the provisional note', () => {
    const html = scoreboardImageHTML({ ...base, final: true, swings: [], bestWin: null, worstLoss: null, lvps: [], stillLive: 0 });
    assert.ok(!/Still in play|Biggest win|Worst loss|LVPs/.test(html));
    assert.match(html, /MVPs/);
    assert.match(html, /21 Sleeper leagues · mydraftstrategist\.com/);
    const early = scoreboardImageHTML({ ...base, record: null, tooEarly: 5, stillLive: 0, splits: [] });
    assert.match(early, /5 too early to call/);
    assert.ok(!/Record/.test(early));
});
