// --- BADGE MARKUP (improvements S10) ---
// The markup of Lineup Strategist's badges that have a helper, in one module with no app state, so the
// Guide's badge legend (js/mls/legend.js) draws its samples with exactly the markup the rows use and a
// later style or wording change shows up in the legend too. The callers (sos.js, rankings/moveChips.js,
// lineup/gameInfo.js, render/{lineup,roster}.js, scout/{topAvailable,bestAvailable}.js) decide whether
// and what to show; this only builds the HTML. Imports nothing but html.js, so the legend's coverage
// test (tests/unit/badgeLegend.test.mjs) can load it in Node.
//
// { sample: true } gives a legend sample: the same element classes and contents, but a <span> with no
// data-action, tip or title, since the legend's samples aren't interactive (the tappable badges are
// buttons on the rows).
import { escapeHtml } from '../shared/html.js';

// --- STRENGTH OF SCHEDULE (sos.js, getSoSBadgeHTML) ---
// Feather calendar: shown instead of "SoS: " on phones and touch screens (css/mls.css).
export const SOS_CALENDAR_ICON = `<svg class="sos-badge-icon" aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

// rank: 1-32, colored green (1, easiest) to red (32, hardest). tip: already escaped.
export function sosBadgeMarkup(rank, tip, { compact = false, sample = false } = {}) {
    let hue = Math.max(0, 120 - ((rank - 1) * 3.87));
    let color = `hsl(${hue}, 80%, 65%)`;
    let bg = `hsl(${hue}, 80%, 15%)`;
    const cls = `badge sos-badge${compact ? ' sos-badge-compact' : ''}`;
    const style = `--sos-color:${color}; --sos-bg:${bg};`;
    const inner = `${SOS_CALENDAR_ICON}<span class="sos-badge-label">SoS: </span>${rank}`;
    if (sample) return `<span class="${cls}" style="${style}">${inner}</span>`;
    return `<button type="button" class="${cls}" style="${style}" data-action="explainSoS" data-tip="${tip}" title="${tip}" aria-label="${tip}">${inner}</button>`;
}

// --- RANK-CHANGE CHIPS (rankings/moveChips.js, rankMoveChip) ---
export const CHIP_UP_ICON = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
export const CHIP_DOWN_ICON = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;

// kind: 'up' | 'down' | 'new'; n: spots moved; label: "Weekly rankings"; since: "since Tue 9/15, 4:10 PM";
// text: the tip (plain, escaped here).
export function moveChipMarkup(kind, n, label, since, text, { sample = false } = {}) {
    const cls = kind === 'up' ? 'is-up' : kind === 'down' ? 'is-down' : 'is-new';
    const inner = kind === 'new'
        ? `New<span class="sr-only"> in your ${escapeHtml(label)} ${escapeHtml(since)}</span>`
        : `${kind === 'up' ? CHIP_UP_ICON : CHIP_DOWN_ICON}<span class="sr-only">${kind === 'up' ? 'Up' : 'Down'} </span>${n}<span class="sr-only"> spots in your ${escapeHtml(label)} ${escapeHtml(since)}</span>`;
    if (sample) return `<span class="badge mls-move-chip ${cls}">${inner}</span>`;
    return `<button type="button" class="badge mls-move-chip ${cls}" data-action="explainRankMove" data-tip="${escapeHtml(text)}" title="${escapeHtml(text)}">${inner}</button>`;
}

// --- AVAILABILITY (lineup/gameInfo.js) ---
// Sleeper IR slot (S9). tip: already escaped.
export function irSlotBadgeMarkup(tip, { sample = false } = {}) {
    if (sample) return `<span class="badge ir-slot-badge">IR</span>`;
    return `<button type="button" class="badge ir-slot-badge" data-action="explainIrSlot" data-tip="${tip}" title="${tip}" aria-label="${tip}">IR</button>`;
}

// The red injury badge: "Q", "D", "OUT", "IR"...
export const injuryBadgeMarkup = (inj) => `<span class="badge inj-badge">${escapeHtml(inj)}</span>`;

export const BYE_BADGE_HTML = `<span class="badge bye-badge">BYE</span>`;

// text: "Sun 1:05 PM", or "Started" / "Final" with started = true.
export const kickoffBadgeMarkup = (text, started = false) =>
    `<span class="badge kickoff-badge${started ? ' kickoff-started' : ''}">${text}</span>`;

// The Lineup tab's banners above the lineup: a starter who's unlikely to play (red), and a starter in
// the Sleeper IR slot (S9, purple).
export const WARNING_ICON = `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
export const INFO_ICON = `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

// --- RANKS (render/lineup.js, lineupRankBadge) ---
// The two halves of a two-number badge, each kept whole, so on a phone the badge splits onto two lines
// at the "|" instead of the row cutting it off (owner's choice in improvements F6).
export function rankBadgeParts(first, second) {
    return `<span class="mls-rank-parts"><span class="mls-rank-part">${first}</span><span class="mls-rank-part"><span class="mls-rank-bar"> | </span>${second}</span></span>`;
}

// --- TRENDS (scout/topAvailable.js, S6) ---
// Feather trending-up.
export const TREND_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
// Top Available's "Starts" (he'd make your lineup this week): a check, inside .mls-ta-starts.
export const STARTS_ICON = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
// The icon alone (owner's choice: rows are tight on a phone); the count is in the tooltip and the label.
export const trendBadgeMarkup = (addsText) =>
    `<span class="mls-ta-trend" role="img" title="${addsText}" aria-label="Trending: ${addsText.toLowerCase()}">${TREND_ICON}</span>`;

// --- BEST AVAILABLE (scout/bestAvailable.js, S5) ---
export const UPGRADE_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
export const DISMISS_ICON = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// --- ROSTER TAB POSITION COUNTS (render/roster.js, S9) ---
// One chip: label ("RB"), count, notes (["1 IR", "1 taxi"]), colorClass ("pos-badge RB", "badge-all").
// lit: drawn in full color; on: the picked filter; extra: e.g. ' disabled'.
export function posCountChipMarkup(pos, label, count, notes, colorClass, { lit = true, on = false, extra = '', sample = false } = {}) {
    const inner = `<span class="mls-poscount-name">${escapeHtml(label)}</span>`
        + `<span class="mls-poscount-num">${count}</span>`
        + (notes.length ? `<span class="mls-poscount-notes">${notes.map(n => `<span class="mls-poscount-note">${escapeHtml(n)}</span>`).join('')}</span>` : '');
    const cls = `badge ${colorClass} pos-filter mls-poscount${lit ? ' active-filter' : ''}`;
    if (sample) return `<span class="${cls}">${inner}</span>`;
    const spoken = `${label} ${count}${notes.length ? ` (${notes.join(' · ')})` : ''}`;
    return `<button type="button" class="${cls}" data-action="setRosterPos" data-pos="${escapeHtml(pos)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${escapeHtml(spoken)}"${extra}>`
        + inner
        + `</button>`;
}

// --- LEAGUE COMMAND CENTER (leagues/sync.js) ---
// The Rankings and Lineup columns' status icons, inside .status-icon.status-good / -warn / -danger.
export const STATUS_CHECK_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
export const STATUS_WARN_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
export const STATUS_PENDING_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
// The grey "not optimized yet" icon, and "BB" for a Best Ball league. tooltip: its .tooltip-text span.
export const pendingStatusIconMarkup = (tooltip = '') =>
    `<span class="status-icon${tooltip ? ' tooltip-container' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">${STATUS_PENDING_ICON}${tooltip}</span>`;
export const bestBallBadgeMarkup = (tooltip = '') =>
    `<span class="badge${tooltip ? ' tooltip-container' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border); padding: 2px 6px;">BB${tooltip}</span>`;

// --- LINEUP TAB (render/lineup.js) ---
// The player's spot on Sleeper differs from this lineup: on a starter row "Bench in Sleeper",
// on a bench row "Starting in Sleeper" (starting = true).
export const sleeperLineupBadgeMarkup = (starting) => starting
    ? `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; font-size: 0.65rem; margin-left: 4px;">Starting in Sleeper</span>`
    : `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b; font-size: 0.65rem; margin-left: 4px;">Bench in Sleeper</span>`;

// --- WAIVER WIRE ASSISTANT (scout/waivers.js) ---
// A lineup verdict ("Would Start", "Bench", "Out"...) or ownership pill. cls: mls-verdict-start / -bench /
// -out, or status-avail / status-mine / status-owned / mls-status-unknown.
export const scoutPillMarkup = (cls, text) => `<span class="scout-status ${cls}">${text}</span>`;
// "· 1 tier up" after a verdict (S8). cls: is-up / is-same / is-down.
export const tierGapMarkup = (cls, text, title = '') =>
    `<span class="mls-tier-gap ${cls}"${title ? ` title="${title}"` : ''}><span class="mls-rank-sep">&middot;</span> ${text}</span>`;

// --- TRADE FINDER (scout/marketDisconnect.js) ---
// How far the market's rank is from yours: green for a buy-low target (+12), red for a sell-high one (-9).
export const edgeBadgeMarkup = (delta, buyLow) => buyLow
    ? `<span class="badge" style="background:var(--target-bg); color:var(--primary-green); border:1px solid var(--target-border);">+${delta} Edge</span>`
    : `<span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${delta} Edge</span>`;
