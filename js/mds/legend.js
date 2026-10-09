// --- THE BADGE LEGEND (improvements S10) ---
// "What the badges mean", the last step of the Guide tab: every badge, label and color Draft Strategist
// puts on players, slots and the board, drawn with the app's own markup and CSS, with a sentence on what
// it means. Owner's choices: in each app's Guide, grouped by kind, one line per color set. Lineup
// Strategist's is js/mls/legend.js; the CSS for both is in css/base.css (.badge-legend-*).
//
// Samples use the helpers the Tracker and Team tabs use where one exists (js/mds/badges.js), and
// otherwise their own classes, so a later style or wording change shows up here too. They aren't
// interactive. Built once, the first time the Guide tab is shown (ui.js, showTab), into #badgeLegendList.
//
// A new badge or symbol gets a line here in the same change (CLAUDE.md, "Rules that bite").
// tests/unit/badgeLegend.test.mjs fails when a badge class used in js/mds or index.html isn't in the HTML
// this builds. Imports only modules with no app state, so that test can load it in Node.
import { STACK_BADGE_HTML, byeWarningMarkup, slotLabelMarkup, tScoreBadgeMarkup, tierChipMarkup, valueBadgeMarkup } from './badges.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const boardCell = (pos, mine) => `<div class="draft-cell picked ${pos}${mine ? ' mine' : ''}"><div style="display:flex; flex-direction:column; align-items:center;"><div class="draft-cell-first">${mine ? 'Your' : 'Their'}</div><div class="draft-cell-last">Pick</div></div></div>`;
const livePill = (stalled) => `<span class="btn-header is-live${stalled ? ' is-stalled' : ''}"><span class="${stalled ? 'is-stalled' : ''}" style="display: flex; align-items: center; gap: 4px; font-weight: bold;"><span class="pulse-dot"></span><span>${stalled ? 'LIVE · stalled' : 'LIVE'}</span></span></span>`;

// [group title, [[samples HTML, meaning HTML], ...]]
const GROUPS = [
    ['Positions and slots', [
        [POSITIONS.map(p => `<span class="badge pos-badge ${p}">${p}</span>`).join(''),
            'A player\'s position. Each position keeps its color everywhere: player cards, the Board and the Team tab.'],
        ['<span class="badge">KC</span>', 'His NFL team.'],
        [`<span class="badge badge-all pos-filter active-filter"><span>ALL</span></span>${tierChipMarkup('RB', 'T2 (4)', 'active-filter', { sample: true })}`,
            'Above the Tracker\'s list: the best tier still available at each position, and how many players are left in it. Tap one to show only that position.'],
        [slotLabelMarkup('RB1', 'var(--pos-rb-border)') + slotLabelMarkup('BN', 'var(--text-muted)'),
            'On the Team tab: a starting spot in its position\'s color, or a bench spot.'],
        [[['W/R', 'wr-blend-text'], ['W/T', 'wt-blend-text'], ['FLX', 'flex-blend-text'], ['SFLX', 'sflex-blend-text']].map(([l, c]) => slotLabelMarkup(l, null, c)).join(''),
            'A flex spot, in a blend of the colors of the positions it takes: W/R a WR or RB, W/T a WR or TE, FLX an RB, WR or TE, and SFLX also a QB.'],
        [boardCell('RB', false) + boardCell('WR', true),
            'On the Board: each pick in its position\'s color. Your own picks are highlighted.'],
    ]],
    ['Ranks and tiers', [
        ['<div class="tier-divider">Tier 3</div>', 'In the Tracker\'s list: where the next tier of your rankings starts.'],
        [valueBadgeMarkup(12) + valueBadgeMarkup(-5) + valueBadgeMarkup(0),
            'How the current pick compares with his rank: Value means he\'s gone later than your rankings say, Reach that taking him now is earlier, and At Rank that this is his spot.'],
        [[['label-elite', 'Elite'], ['label-high', 'High-End Starter'], ['label-strong', 'Strong Starter'], ['label-quality', 'Quality Contributor'], ['label-boom', 'Boom/Bust'], ['label-depth', 'Depth Player']].map(([c, l]) => tScoreBadgeMarkup(c, l)).join(''),
            'T-Score\'s label for a WR or RB, when T-Score Analytics is on. Hover for the score.'],
    ]],
    ['Availability and status', [
        ['<span class="badge badge-rookie">R</span>', 'A rookie, from Sleeper\'s database.'],
        ['<span class="badge inj-badge">Q</span><span class="badge inj-badge">OUT</span>',
            'His injury status from Sleeper (Q questionable, D doubtful, OUT, IR injured reserve). Check before you take him.'],
        [STACK_BADGE_HTML, 'With Highlight Stacks on: he pairs with a QB, or a WR or TE, you already drafted from his team.'],
        [byeWarningMarkup(3, 9), 'On the Team tab: 3 or more of your starters share a bye week, with Bye Week Warnings on.'],
        ['<div class="pick-badge">Pick: 3.07</div>', 'The pick that\'s on the clock: round, then pick in the round.'],
        [livePill(false) + livePill(true),
            'Live Sync with Sleeper: LIVE while picks are arriving. Amber "stalled" means the last few checks failed, so the board may be behind; it keeps trying.'],
    ]],
];

// The legend's HTML: one titled list per group, each line a sample and its meaning (same markup as
// js/mls/legend.js, so css/base.css styles both).
export function buildBadgeLegendHTML() {
    return GROUPS.map(([title, rows]) => `<div class="badge-legend-group">
    <h5 class="badge-legend-group-title">${title}</h5>
    <dl class="badge-legend-list">${rows.map(([samples, text]) => `
        <div class="badge-legend-row"><dt class="badge-legend-sample">${samples}</dt><dd class="badge-legend-text">${text}</dd></div>`).join('')}
    </dl>
</div>`).join('');
}

// Fills the Guide's legend once, the first time the Guide is shown (ui.js, showTab).
export function renderBadgeLegend() {
    const el = document.getElementById('badgeLegendList');
    if (el && !el.dataset.built) {
        el.innerHTML = buildBadgeLegendHTML();
        el.dataset.built = '1';
    }
}

// "What do these mean?" on the Tracker (data-action="openBadgeLegend", js/mds/main.js): after the Guide
// tab is shown, scroll its legend into view and move focus to the legend's heading.
export function focusBadgeLegend() {
    renderBadgeLegend();
    const section = document.getElementById('badgeLegend');
    const title = document.getElementById('badgeLegendTitle');
    if (!section) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (title) title.focus({ preventScroll: true });
}
