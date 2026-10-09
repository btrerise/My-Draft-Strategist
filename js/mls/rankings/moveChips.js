// --- RANK-CHANGE CHIPS ON PLAYER ROWS (improvements S3, round 2) ---
// After a ranking set is replaced, js/mls/rankings/changeSummary.js saves the moves on the set
// (`lastChanges`: { moves: { cleanName: { d, f, t } }, added: { cleanName: label } }), and the Lineup
// and Roster tabs (and the Scout tab's Top Available) show a chip beside each moved player's rank until the
// set's next upload, or until it expires (chipsExpired). Kept apart
// from changeSummary.js so the row renderers (render/lineup.js, render/roster.js) import only this.
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { isSameRankingsWeek } from '../../shared/rankings/compare.js';
import { showToast } from '../../shared/ui/toast.js';
import { moveChipMarkup } from '../badges.js';

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
// toast (data-action="explainRankMove"), since phones have no hover and the rows clip tooltips. The markup is
// moveChipMarkup in js/mls/badges.js, shared with the Guide's badge legend (improvements S10).
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
    const move = changes.moves && changes.moves[cleanName];
    if (move && Number.isFinite(move.d) && move.d !== 0) {
        const up = move.d > 0;
        const n = Math.abs(move.d);
        const text = `${up ? 'Up' : 'Down'} ${n} spots in your ${label} ${since} (${move.f} \u2192 ${move.t})`;
        return moveChipMarkup(up ? 'up' : 'down', n, label, since, text);
    }
    const added = changes.added && changes.added[cleanName];
    if (added) {
        const text = `New in your ${label} ${since} (${added})`;
        return moveChipMarkup('new', 0, label, since, text);
    }
    return '';
}

// A tap or click on a chip: its explanation as a toast.
export function explainRankMove(chipEl) {
    const text = chipEl && chipEl.dataset ? chipEl.dataset.tip : '';
    if (text) showToast(text);
}
