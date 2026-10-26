// --- THE SCOREBOARD'S SHARE IMAGE (improvements S22, round 2) ---
// Export Recap on the Scoreboard saves a PNG for a group chat. The owner's ask: a summary, a "TL;DR", not every league
// (with 21 leagues, 21 tiles would be too much to share), and nothing that names your leagues (round 3: in a Discord
// server nobody has context for them; round 2's Still in play, Biggest win and Worst loss are gone). So, at any number
// of leagues, one phone-width image:
//     My Lineup Strategist · Week 7 Recap                      [Provisional]
//     Record 12–7 · 2 still live
//     Paid 4–2 | Free 8–5   Redraft 7–4 | Dynasty 5–3   Median 6–3
//     MVPs               top 3: boomed X of N, points
//     LVPs               top 3: started X of N, points
//     19 Sleeper leagues · mydraftstrategist.com
// This module only builds the HTML from plain data (no app state or DOM), so tests/unit/shareImage.test.mjs can check
// it; week/thisWeek.js gathers the data and draws it with html2canvas, as Export Trade does.
import { escapeHtml } from '../../shared/html.js';

export const SHARE_PLAYERS = 3;

const rec = (r) => `${r.W}–${r.L}${r.T ? `–${r.T}` : ''}`;

// data: {
//   week, final, statusHTML (the Provisional / Final pill), record ({ W, L, T } or null when nothing counts yet),
//   stillLive, tooEarly, splits: [{ label, groups: [[name, { W, L, T }], ...] }],
//   mvps / lvps: [{ name, pos, started, own, value }]: value is his points on the verdict's scale ("28.4"), or each
//   league's range without one; scaleLabel ("Half PPR") or null, single (one league counted), leagueCount,
// }
// Round 8: both lists read "started X of N" and the number Boom / Bust was judged on; the footer names the scale.
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
    // With one league, "started 1 of 1" on every row says nothing (round 10): just the name and the number.
    const player = (p) => row(`${escapeHtml(p.name)} <span class="mls-share-muted">${escapeHtml(p.pos)}</span>`, escapeHtml(p.value), d.single ? '' : `<span class="mls-share-detail">started ${p.started} of ${p.own}</span>`);
    const mvps = (d.mvps || []).slice(0, SHARE_PLAYERS), lvps = (d.lvps || []).slice(0, SHARE_PLAYERS);
    if (mvps.length) sections.push(`<div class="mls-share-sub">MVPs</div>` + mvps.map(player).join(''));
    if (lvps.length) sections.push(`<div class="mls-share-sub">LVPs</div>` + lvps.map(player).join(''));
    return `
        <div class="mls-share-head">
            <span class="mls-share-title">My Lineup Strategist &middot; Week ${escapeHtml(d.week)} Recap</span>${d.statusHTML || ''}
        </div>
        ${summary ? `<div class="mls-share-summary">${summary}</div>` : ''}
        ${splits ? `<div class="mls-share-splits">${splits}</div>` : ''}
        ${sections.map(s => `<div class="mls-share-section">${s}</div>`).join('')}
        <div class="mls-share-foot">${d.leagueCount} Sleeper league${d.leagueCount === 1 ? '' : 's'}${d.scaleLabel ? ` · Boom / Bust on ${escapeHtml(d.scaleLabel)} points` : ''}${d.final ? '' : ' · provisional'} · mydraftstrategist.com</div>`;
}
