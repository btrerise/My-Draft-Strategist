// --- RANK-CHANGE CHIPS ON PLAYER ROWS (improvements S3, round 2) ---
// After a ranking set is replaced, js/mls/rankings/changeSummary.js saves the moves on the set
// (`lastChanges`: { moves: { cleanName: { d, f, t } }, added: { cleanName: label } }), and the Lineup
// and Roster tabs (and the Scout tab's Top Available) show a chip beside each moved player's rank until the
// set's next upload, or until it expires (chipsExpired). Kept apart
// from changeSummary.js so the row renderers (render/lineup.js, render/roster.js) import only this.
import { escapeHtml } from '../../shared/html.js';
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { isSameRankingsWeek } from '../../shared/rankings/compare.js';
import { showToast } from '../../shared/ui/toast.js';

const CHIP_UP_ICON = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
const CHIP_DOWN_ICON = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;

// "Tue 9/15, 4:10 PM": when an upload happened, for the chips and the card's "Compared with" line.
export function formatUploadTime(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    const day = `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}`;
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day}, ${time}`;
}

// Chips go away on their own (owner's choice, round 5): a Weekly set's when its rankings week ends
// (the next Tuesday morning), a ROS set's 7 days after the upload that made them. Either way the set's
// next upload replaces them sooner.
const ROS_CHIP_DAYS = 7;
function chipsExpired(type, changes, now) {
    if (!Number.isFinite(changes.at)) return false;
    if (type === 'weekly') return !isSameRankingsWeek(changes.at, now);
    return now - changes.at > ROS_CHIP_DAYS * 24 * 60 * 60 * 1000;
}

// The chip for one of the active league's players, by the rankings of `type` ('weekly' | 'ros'):
// "up 8" / "down 4" / "New", or '' when he didn't move (or the league's set has no recent changes).
// A small button: hovering shows the explanation (title) on desktop, and a tap or click shows it as a
// toast (data-action="explainRankMove"), since phones have no hover and the rows clip tooltips.
export function rankMoveChip(type, cleanName) {
    const cfg = RANKING_TYPE_CONFIG[type];
    const league = getActiveLeague();
    if (!cfg || !league || !cleanName) return '';
    const setId = league[cfg.leagueSetIdKey];
    const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
    const changes = set && set.lastChanges;
    if (!changes || chipsExpired(type, changes, Date.now())) return '';
    const label = `${cfg.label} rankings`;
    const since = Number.isFinite(changes.since) ? `since ${formatUploadTime(changes.since)}` : 'since the last update';
    const chip = (cls, inner, text) => `<button type="button" class="badge mls-move-chip ${cls}" data-action="explainRankMove" data-tip="${escapeHtml(text)}" title="${escapeHtml(text)}">${inner}</button>`;
    const move = changes.moves && changes.moves[cleanName];
    if (move && Number.isFinite(move.d) && move.d !== 0) {
        const up = move.d > 0;
        const n = Math.abs(move.d);
        const text = `${up ? 'Up' : 'Down'} ${n} spots in your ${label} ${since} (${move.f} \u2192 ${move.t})`;
        return chip(up ? 'is-up' : 'is-down', `${up ? CHIP_UP_ICON : CHIP_DOWN_ICON}<span class="sr-only">${up ? 'Up' : 'Down'} </span>${n}<span class="sr-only"> spots in your ${escapeHtml(label)} ${escapeHtml(since)}</span>`, text);
    }
    const added = changes.added && changes.added[cleanName];
    if (added) {
        const text = `New in your ${label} ${since} (${added})`;
        return chip('is-new', `New<span class="sr-only"> in your ${escapeHtml(label)} ${escapeHtml(since)}</span>`, text);
    }
    return '';
}

// A tap or click on a chip: its explanation as a toast.
export function explainRankMove(chipEl) {
    const text = chipEl && chipEl.dataset ? chipEl.dataset.tip : '';
    if (text) showToast(text);
}
