// --- BADGE MARKUP (improvements S10) ---
// The markup of Draft Strategist's badges that carry their own inline styles, in one module with no app
// state, so the Guide's badge legend (js/mds/legend.js) draws its samples with exactly the markup the
// Tracker and Team tabs use, and a later style change shows up in the legend too. The callers
// (tracker.js, team.js) decide whether and what to show. Imports nothing, so the legend's coverage test
// (tests/unit/badgeLegend.test.mjs) can load it in Node.

// A player card's value badge: picked later than his rank (+N Value), earlier (-N Reach), or right at it.
// diff: the current overall pick minus his rank.
export function valueBadgeMarkup(diff) {
    if (diff > 0) return `<span class="badge badge-value">+${diff} Value</span>`;
    if (diff < 0) return `<span class="badge badge-reach">${diff} Reach</span>`;
    return `<span class="badge" style="background:#3a506b;">At Rank</span>`;
}

// T-Score's label for a WR or RB (Elite, High-End Starter...), colored by its class (label-elite...).
const TSCORE_COLORS = {
    'label-elite': ['#a855f7', 'rgba(168, 85, 247, 0.15)', 'rgba(168, 85, 247, 0.3)'],
    'label-high': ['#3b82f6', 'rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0.3)'],
    'label-strong': ['#10b981', 'rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.3)'],
    'label-quality': ['#f59e0b', 'rgba(245, 158, 11, 0.15)', 'rgba(245, 158, 11, 0.3)'],
    'label-boom': ['#ef4444', 'rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0.3)'],
};
export function tScoreBadgeMarkup(cls, label) {
    const [tsColor, tsBg, tsBorder] = TSCORE_COLORS[cls] || ['#9ca3af', 'rgba(255,255,255,0.1)', 'var(--border)'];
    return `<span class="badge" style="background: ${tsBg}; color: ${tsColor}; border: 1px solid ${tsBorder}; font-weight: 700;">${label}</span>`;
}

// "Stack": a WR or TE whose QB you drafted, or a QB whose WR or TE you did (Highlight Stacks).
export const STACK_BADGE_HTML = `<span class="badge" style="background: var(--stack-color); color: white;">Stack</span>`;

// The Team tab's slot label: a strict slot in its position's color, or a flex slot's blend-colored text
// (textClass: flex-blend-text, sflex-blend-text, wt-blend-text, wr-blend-text; css/mds.css).
export const slotLabelMarkup = (label, color, textClass = '') => textClass
    ? `<span class="roster-label ${textClass}"><span class="roster-label-text">${label}</span></span>`
    : `<span class="roster-label" style="color:${color}">${label}</span>`;

// The Team tab's banner when 3 or more of your starters share a bye week.
export const BYE_WARNING_ICON = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
export const byeWarningMarkup = (count, week) =>
    `<div class="bye-warning-banner">${BYE_WARNING_ICON}<span>WARNING: You have ${count} starting players on Bye in Week ${week}!</span></div>`;

// The Tracker's position chip above the list: the position and its best tier still available, with how
// many are left in it ("T2 (4)"); tapping one filters the list. activeCls: 'active-filter' or ''.
export function tierChipMarkup(pos, tierText, activeCls, { pressed = false, label = '', sample = false } = {}) {
    const inner = `<span>${pos}</span><span style="font-size:0.65rem; opacity:0.9;">${tierText}</span>`;
    if (sample) return `<span class="badge pos-badge ${pos} pos-filter ${activeCls}">${inner}</span>`;
    return `<button type="button" class="badge pos-badge ${pos} pos-filter ${activeCls}" data-action="setPosFilter" data-pos="${pos}" aria-pressed="${pressed}" aria-label="${label}">${inner}</button>`;
}
