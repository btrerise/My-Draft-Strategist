// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: ACTIVE ROSTER: POWER
// RANKINGS SNAPSHOT (renderRosterPowerStrip, and scrollToPowerRankings, the strip's link to the
// card).
import { escapeHtml } from '../../shared/html.js';
import { powerTier } from './shared.js';

// --- ACTIVE ROSTER: POWER RANKINGS SNAPSHOT ---
// Your own row of the Positional Power Rankings, shown under the league name at the top of the
// Active Roster card (#rosterPowerStrip) -- the full table sits far enough down the Roster tab
// that people could miss it entirely. Ranks only, no tooltips: this is a glance, and the link
// underneath jumps to the table, which has the player-level detail and the explanations.
// Rendered from the exact same teams array as the table, so the two can't disagree.
export function renderRosterPowerStrip(teams, ctx = {}) {
    const el = document.getElementById('rosterPowerStrip');
    if (!el) return;
    const you = teams ? teams.find(t => t.owner === 'You') : null;
    if (!you) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    const N = teams.length;
    const hasFuture = teams.every(t => Number.isFinite(t.futureRank));
    const stats = [
        ['Start', you.starterRank], ['Ovr', you.overallRank],
        ['QB', you.qbRank], ['RB', you.rbRank], ['WR', you.wrRank], ['TE', you.teRank]
    ];
    if (hasFuture) stats.push(['Future', you.futureRank]);
    const label = you.label
        ? `<span class="mls-power-label mls-power-label-${String(you.label).toLowerCase()}">${escapeHtml(you.label)}${you.labelNote ? ` <span class="mls-power-label-note">&middot; ${escapeHtml(you.labelNote)}</span>` : ''}</span>` : '';
    const via = ctx.source && ctx.source.source === 'market' ? ' &middot; via Market Consensus' : '';
    el.innerHTML = `
        <div class="mls-roster-power-head">
            <span class="mls-roster-power-title">Positional Power Rankings</span>
            ${label}
            <span class="mls-roster-power-of">out of ${N} teams${via}</span>
        </div>
        <div class="mls-roster-power-stats" style="grid-template-columns: repeat(${stats.length}, minmax(0, 1fr));">
            ${stats.map(([name, rank]) => `
            <div class="mls-roster-power-stat">
                <span class="mls-roster-power-stat-name">${name}</span>
                <span class="mls-roster-power-stat-rank mls-power-cell-${powerTier(rank, N)}">${rank}</span>
            </div>`).join('')}
        </div>
        <button type="button" class="mls-roster-power-link btn-bare" data-action="scrollToPowerRankings">See the full league breakdown and explanations below &darr;</button>`;
    el.style.display = 'block';
}

// Scrolls the Roster tab's Power Rankings card into view (the snapshot's link above; the Scout
// tab's temporary pointer uses it too, via goToPowerRankings). #powerRankingsCard carries a
// scroll-margin-top in css/mls.css so the sticky header doesn't cover the card title.
export const scrollToPowerRankings = function() {
    const card = document.getElementById('powerRankingsCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
