// The Scoreboard's share image (improvements S22, rounds 2-3, js/mls/week/shareImage.js): a summary at any league count,
// with nothing that names a league. At most 3 MVPs / LVPs; names escaped; sections only when they have rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreboardImageHTML, SHARE_PLAYERS } from '../../js/mls/week/shareImage.js';

const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const base = {
    week: 7, final: false, statusHTML: '<span class="badge mls-week-status is-provisional">Provisional</span>',
    record: { W: 12, L: 7, T: 0 }, stillLive: 2, tooEarly: 0,
    splits: [{ label: 'By format', groups: [['Redraft', { W: 7, L: 4, T: 0 }], ['Dynasty', { W: 5, L: 3, T: 0 }]] }],
    mvps: many(9, i => ({ name: i === 0 ? 'Ja\'Marr <Chase>' : `MVP ${i}`, pos: 'WR', started: 3, own: 4, value: '22.5' })),
    lvps: many(9, i => ({ name: `LVP ${i}`, pos: 'RB', started: 2, own: 3, value: '1.5' })),
    scaleLabel: 'Half PPR',
    leagueCount: 21,
};
const count = (html, re) => (html.match(re) || []).length;

test('a summary: the record, the splits, 3 MVPs and 3 LVPs, however many leagues; no league names (round 3)', () => {
    const html = scoreboardImageHTML(base);
    assert.match(html, /Week 7 Recap/);
    assert.match(html, /Record 12–7 · 2 still live/);
    assert.match(html, /Redraft<\/span> 7–4/);
    assert.ok(!/Still in play|Biggest win|Worst loss|to win/i.test(html));
    assert.match(html, /Ja&#39;Marr &lt;Chase&gt;/); // escaped
    assert.equal(count(html, /MVP \d/g), SHARE_PLAYERS - 1);
    assert.equal(count(html, /LVP \d/g), SHARE_PLAYERS);
    assert.match(html, /started 3 of 4<\/span><span class="mls-share-num">22\.5/);
    assert.match(html, /started 2 of 3/);
    assert.match(html, /21 Sleeper leagues · Boom \/ Bust on Half PPR points · provisional/);
    assert.ok(!/MVP 3|LVP 3/.test(html));
});

test('empty parts leave no heading; Final drops the provisional note', () => {
    const html = scoreboardImageHTML({ ...base, final: true, lvps: [], stillLive: 0 });
    assert.ok(!/LVPs/.test(html));
    assert.match(html, /MVPs/);
    assert.match(html, /21 Sleeper leagues · Boom \/ Bust on Half PPR points · mydraftstrategist\.com/);
    const early = scoreboardImageHTML({ ...base, record: null, tooEarly: 5, stillLive: 0, splits: [] });
    assert.match(early, /5 too early to call/);
    assert.ok(!/Record/.test(early));
});
