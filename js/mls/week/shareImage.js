// --- THE SCOREBOARD'S SHARE IMAGE (improvements S22, round 2) ---
// Export on the Scoreboard saves a PNG for a group chat. The owner's ask: a summary, a "TL;DR", not every league (with
// 21 leagues, 21 tiles would be too much to share). So, at any number of leagues, one phone-width image:
//     My Lineup Strategist · Week 7 Recap                      [Provisional]
//     Record 12–7 · 2 still live
//     Paid 4–2 | Free 8–5   Redraft 7–4 | Dynasty 5–3   Median 6–3
//     STILL IN PLAY      up to 3, most uncertain first, with the win chance
//     BIGGEST WIN / WORST LOSS     among the matchups already settled
//     MVPs               top 3: boomed X of N, points
//     LVPs               top 3: started X of N, points
//     19 Sleeper leagues · mydraftstrategist.com
// This module only builds the HTML from plain data (no app state or DOM), so tests/unit/shareImage.test.mjs can check
// it; week/thisWeek.js gathers the data and draws it with html2canvas, as Export Trade does.
import { escapeHtml } from '../../shared/html.js';

export const SHARE_MATCHUPS = 3;
export const SHARE_PLAYERS = 3;

const fmt = (n) => (Number(n) || 0).toFixed(1);
const signed = (n) => n > 0 ? `+${fmt(n)}` : (n < 0 ? `−${fmt(-n)}` : '0.0');
const rec = (r) => `${r.W}–${r.L}${r.T ? `–${r.T}` : ''}`;
const pct = (c) => c < 0.5 ? '<1%' : (c > 99.5 ? '>99%' : `${Math.round(c)}%`);

// data: {
//   week, final, statusHTML (the Provisional / Final pill), record ({ W, L, T } or null when nothing counts yet),
//   stillLive, tooEarly, splits: [{ label, groups: [[name, { W, L, T }], ...] }],
//   swings: [{ name, margin, chance }], bestWin: { name, margin } | null, worstLoss: { name, margin } | null,
//   mvps: [{ name, pos, boomed, own, range }], lvps: [{ name, pos, started, own, range }], leagueCount,
// }
export function scoreboardImageHTML(d) {
    const summary = [
        d.record ? `Record ${rec(d.record)}` : '',
        d.stillLive ? `${d.stillLive} still live` : '',
        d.tooEarly ? `${d.tooEarly} too early to call` : '',
    ].filter(Boolean).join(' · ');
    const splits = (d.splits || []).filter(g => g.groups.length).map(g =>
        `<span class="mls-share-split">${g.groups.map(([name, r]) => `<span class="mls-share-split-part"><span class="mls-share-muted">${escapeHtml(name)}</span> ${rec(r)}</span>`).join('')}</span>`).join('');
    const sections = [];
    const row = (left, right, extra = '') => `<div class="mls-share-row"><span class="mls-share-name">${left}</span>${extra}<span class="mls-share-num">${right}</span></div>`;
    const margin = (m) => `<span class="${m < 0 ? 'is-behind' : 'is-ahead'}">${signed(m)}</span>`;
    const swings = (d.swings || []).slice(0, SHARE_MATCHUPS);
    if (swings.length) {
        sections.push(`<div class="mls-share-sub">Still in play</div>` + swings.map(s =>
            row(escapeHtml(s.name), margin(s.margin), s.chance != null ? `<span class="mls-share-chance">${pct(s.chance)} to win</span>` : '')).join(''));
    }
    const ends = [];
    if (d.bestWin) ends.push(row(`<span class="mls-share-label">Biggest win</span> ${escapeHtml(d.bestWin.name)}`, margin(d.bestWin.margin)));
    if (d.worstLoss) ends.push(row(`<span class="mls-share-label">Worst loss</span> ${escapeHtml(d.worstLoss.name)}`, margin(d.worstLoss.margin)));
    if (ends.length) sections.push(ends.join(''));
    const player = (p, detail) => row(`${escapeHtml(p.name)} <span class="mls-share-muted">${escapeHtml(p.pos)}</span>`, escapeHtml(p.range), `<span class="mls-share-detail">${detail}</span>`);
    const mvps = (d.mvps || []).slice(0, SHARE_PLAYERS), lvps = (d.lvps || []).slice(0, SHARE_PLAYERS);
    if (mvps.length) sections.push(`<div class="mls-share-sub">MVPs</div>` + mvps.map(p => player(p, `boomed ${p.boomed} of ${p.own}`)).join(''));
    if (lvps.length) sections.push(`<div class="mls-share-sub">LVPs</div>` + lvps.map(p => player(p, `started ${p.started} of ${p.own}`)).join(''));
    return `
        <div class="mls-share-head">
            <span class="mls-share-title">My Lineup Strategist &middot; Week ${escapeHtml(d.week)} Recap</span>${d.statusHTML || ''}
        </div>
        ${summary ? `<div class="mls-share-summary">${summary}</div>` : ''}
        ${splits ? `<div class="mls-share-splits">${splits}</div>` : ''}
        ${sections.map(s => `<div class="mls-share-section">${s}</div>`).join('')}
        <div class="mls-share-foot">${d.leagueCount} Sleeper league${d.leagueCount === 1 ? '' : 's'}${d.final ? '' : ' · provisional until the last game is final'} · mydraftstrategist.com</div>`;
}
