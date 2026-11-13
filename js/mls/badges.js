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

// --- DRAFT PICK (the Trade Analyzer's rows, scout/engine.js, and "To make it fair", trade/fairSection.js) ---
// A position badge in the FLEX color reading "Pick" (improvements S14; a helper since S19, with its legend line).
export const PICK_BADGE_HTML = `<span class="badge pos-badge FLEX mls-pos-badge-sizing">Pick</span>`;

// --- STRENGTH OF SCHEDULE (sos.js, getSoSBadgeHTML) ---
// Feather calendar: shown instead of "SoS: " on phones and touch screens (css/mls.css).
export const SOS_CALENDAR_ICON = `<svg class="sos-badge-icon" aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

// rank: 1-32, colored green (1, easiest) to red (32, hardest). tip: already escaped.
// The green-to-red scale's colors for a rank, as the style attribute's custom properties. Shared with the
// opponent badge below (improvements S31), so a 28 is the same red on both.
export function sosColorStyle(rank) {
    const hue = Math.max(0, 120 - ((rank - 1) * 3.87));
    return `--sos-color:hsl(${hue}, 80%, 65%); --sos-bg:hsl(${hue}, 80%, 15%);`;
}

export function sosBadgeMarkup(rank, tip, { compact = false, sample = false } = {}) {
    const cls = `badge sos-badge${compact ? ' sos-badge-compact' : ''}`;
    const style = sosColorStyle(rank);
    const inner = `${SOS_CALENDAR_ICON}<span class="sos-badge-label">SoS: </span>${rank}`;
    if (sample) return `<span class="${cls}" style="${style}">${inner}</span>`;
    return `<button type="button" class="${cls}" style="${style}" data-action="explainSoS" data-tip="${tip}" title="${tip}" aria-label="${tip}">${inner}</button>`;
}

// --- THIS WEEK'S OPPONENT (opponent.js, rankedOpponentBadgeHTML; improvements S31) ---
// "vs KC 28" / "@ KC 3" / "KC 16" (home or away unknown): this week's opponent with his matchup rank from your
// Weekly rankings. Colored text, not a box (owner's choice, round 3: boxes in green and red sat too close to the
// position chips' colors), on the SoS scale (1 = easiest, green; 32 = hardest, red), with a faint dotted underline
// that says it can be tapped. It stands where the plain "vs KC" (.mls-opp) follows the kickoff time
// (lineup/gameInfo.js). opp: a team code; home: true, false or null; rank: 1-32. tip: already escaped.
export function opponentBadgeMarkup({ opp, home = null, rank }, tip, { sample = false } = {}) {
    const style = ` style="${sosColorStyle(rank)}"`;
    const inner = `${home === true ? 'vs ' : home === false ? '@ ' : ''}${escapeHtml(opp)} ${rank}`;
    if (sample) return `<span class="mls-opp opp-rank-badge"${style}>${inner}</span>`;
    return `<button type="button" class="mls-opp opp-rank-badge"${style} data-action="explainSoS" data-tip="${tip}" title="${tip}" aria-label="${tip}">${inner}</button>`;
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

// --- LEAGUE COMMAND CENTER (render/leagueCards.js) ---
// The league cards' status icons (the table's Rankings and Lineup columns before S12), inside .status-icon.status-good /
// -warn / -danger / -pending.
export const STATUS_CHECK_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
export const STATUS_WARN_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
export const STATUS_PENDING_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
// The grey "not optimized yet" icon, and "BB" for a Best Ball league. tooltip: its .tooltip-text span.
export const pendingStatusIconMarkup = (tooltip = '') =>
    `<span class="status-icon${tooltip ? ' tooltip-container' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">${STATUS_PENDING_ICON}${tooltip}</span>`;
export const bestBallBadgeMarkup = (tooltip = '') =>
    `<span class="badge${tooltip ? ' tooltip-container' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border); padding: 2px 6px;">BB${tooltip}</span>`;
// A league card's status chip (improvements S12): the status icon and a one-word label ("Rankings",
// "Lineup"), so a phone shows what each icon is about without hover. tone: 'good' | 'warn' | 'danger' |
// 'pending'. tip: the sentence (plain, escaped here), shown on hover, focus or a tap (js/shared/ui/tooltips.js).
export function leagueStatusChipMarkup(tone, label, tip, { sample = false } = {}) {
    const icon = tone === 'good' ? STATUS_CHECK_ICON : tone === 'pending' ? STATUS_PENDING_ICON : STATUS_WARN_ICON;
    const dot = tone === 'pending'
        ? `<span class="status-icon status-pending">${icon}</span>`
        : `<span class="status-icon status-${tone}">${icon}</span>`;
    const tipHTML = sample ? '' : `<span class="tooltip-text">${escapeHtml(tip)}</span>`;
    return `<span class="mls-lc-chip is-${tone}${sample ? '' : ' tooltip-container'}">${dot}<span class="mls-lc-chip-label">${escapeHtml(label)}</span>${tipHTML}</span>`;
}

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

// --- NOW VS. LONG-TERM (render/roster.js, improvements S24) ---
// On a Roster tab row in a dynasty or keeper league with an In-Season set, when the two sets' position ranks are far
// apart (rankings/nowAndLater.js rankGap). kind: 'now' | 'later'; tip: plain text, escaped here. Tap: the tip as a
// toast, like the rank-change chips (data-action="explainRankMove").
export function rankGapChipMarkup(kind, tip, { sample = false } = {}) {
    const cls = kind === 'now' ? 'is-now' : 'is-later';
    const text = kind === 'now' ? 'Now &gt; long-term' : 'Long-term &gt; now';
    if (sample) return `<span class="badge mls-gap-chip ${cls}">${text}</span>`;
    return `<button type="button" class="badge mls-gap-chip ${cls}" data-action="explainRankMove" data-tip="${escapeHtml(tip)}" title="${escapeHtml(tip)}">${text}</button>`;
}

// --- TRADE FINDER (scout/marketDisconnect.js) ---
// How far the market's rank is from yours: green for a buy-low target (+12), red for a sell-high one (-9).
export const edgeBadgeMarkup = (delta, buyLow) => buyLow
    ? `<span class="badge" style="background:var(--target-bg); color:var(--primary-green); border:1px solid var(--target-border);">+${delta} Edge</span>`
    : `<span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${delta} Edge</span>`;

// --- THIS WEEK (week/thisWeek.js, improvements S21) ---
// "$" on a league you marked paid (Edit on the League Command Center): on its card's header and its line in the
// This week card. The words are for screen readers; sighted users get the title on hover.
export const paidBadgeMarkup = ({ sample = false } = {}) =>
    `<span class="badge mls-paid-badge"${sample ? '' : ' title="Paid league"'}><span aria-hidden="true">$</span><span class="sr-only">Paid league</span></span>`;
// A matchup's result as it stands: W, L or T (green, red, grey).
export const weekResultMarkup = (result) =>
    `<span class="badge mls-week-result is-${result === 'W' ? 'win' : (result === 'L' ? 'loss' : 'tie')}">${result === 'W' ? 'W' : (result === 'L' ? 'L' : 'T')}</span>`;
// The week's state: Provisional (amber) until its last game is final, then Final.
export const weekStatusMarkup = (final) => final
    ? `<span class="badge mls-week-status is-final">Final</span>`
    : `<span class="badge mls-week-status is-provisional">Provisional</span>`;

// --- WHO TO ROOT FOR (the Scoreboard's Player Scoreboard, week/thisWeek.js, improvements S27) ---
// The three sides a player can be on across your matchups, each with a Feather-style icon: thumbs up (yours), thumbs
// down (your opponents'), and crossing arrows (both).
export const ROOT_ICONS = {
    root: `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`,
    against: `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>`,
    both: `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>`,
};
// "in 3": how many of your matchups he starts in, in the side's color (green yours, red against you, amber both).
export const rootCountBadgeMarkup = (kind, n) =>
    `<span class="badge mls-root-count is-${kind === 'against' ? 'against' : (kind === 'both' ? 'both' : 'root')}">in ${Number(n) || 0}</span>`;
// A player on both sides, "3 of 4 yours": the matchups where he's yours out of all his (owner's choice, S27 round 3, in
// the Both sides amber; round 2's "3 | 1" in green and red was one color too many beside it). Same pill as "in 4".
// In Root for or Against you (round 4), a player who leans that way keeps the counts, in that group's color.
export const rootOfBadgeMarkup = (yours, of, kind = 'both') =>
    `<span class="badge mls-root-count is-${kind === 'root' ? 'root' : (kind === 'against' ? 'against' : 'both')}">${Number(yours) || 0} of ${Number(of) || 0} yours</span>`;
// The Final Window's win chance (improvements S36): a bar, green for your chance in the shared simulation, red for
// theirs, and the percent, green when you're favored (50% or more) and red when not (round 5). pctLabel is the caption ("26% to win", "<1% to win").
export const finalChanceMarkup = (share, pctLabel) => {
    const pct = Math.max(0, Math.min(100, Math.round((Number(share) || 0) * 1000) / 10));
    return `<div class="mls-fw-bar"><span class="mls-fw-bar-track" aria-hidden="true"><span style="width:${pct}%"></span></span><span class="mls-week-chance ${pct >= 50 ? 'is-fav' : 'is-dog'}">${pctLabel}</span></div>`;
};
// His stake, in the row's detail: a bar, green for the part of his weight that's in your leagues, red for the rest.
export const rootShareMarkup = (share) => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(share) || 0)));
    return `<span class="badge mls-root-share"><span class="mls-root-share-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>Your stake: ${pct}%</span>`;
};
