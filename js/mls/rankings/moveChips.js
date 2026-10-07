// --- RANK-CHANGE CHIPS ON PLAYER ROWS (improvements S3, round 2) ---
// After a ranking set is replaced, js/mls/rankings/changeSummary.js saves the moves on the set
// (`lastChanges`: { moves: { cleanName: { d, f, t } }, added: { cleanName: label } }), and the Lineup
// and Roster tabs show a chip beside each moved player's rank until the set's next upload. Kept apart
// from changeSummary.js so the row renderers (render/lineup.js, render/roster.js) import only this.
import { escapeHtml } from '../../shared/html.js';
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';

const CHIP_UP_ICON = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
const CHIP_DOWN_ICON = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;

// The chip for one of the active league's players, by the rankings of `type` ('weekly' | 'ros'):
// "up 8" / "down 4" / "New", or '' when he didn't move (or the league's set has no recent changes).
export function rankMoveChip(type, cleanName) {
    const cfg = RANKING_TYPE_CONFIG[type];
    const league = getActiveLeague();
    if (!cfg || !league || !cleanName) return '';
    const setId = league[cfg.leagueSetIdKey];
    const set = setId ? State.rankingSets[cfg.setsKey].find(s => s.id === setId) : null;
    const changes = set && set.lastChanges;
    if (!changes) return '';
    const label = `${cfg.label} rankings`;
    const move = changes.moves && changes.moves[cleanName];
    if (move && Number.isFinite(move.d) && move.d !== 0) {
        const up = move.d > 0;
        const n = Math.abs(move.d);
        const title = `${up ? 'Up' : 'Down'} ${n} spots in your ${label} since the last update (${move.f} → ${move.t})`;
        return `<span class="badge mls-move-chip ${up ? 'is-up' : 'is-down'}" title="${escapeHtml(title)}">${up ? CHIP_UP_ICON : CHIP_DOWN_ICON}<span class="sr-only">${up ? 'Up' : 'Down'} </span>${n}<span class="sr-only"> spots in your ${escapeHtml(label)} since the last update</span></span>`;
    }
    const added = changes.added && changes.added[cleanName];
    if (added) {
        const title = `New in your ${label} since the last update (${added})`;
        return `<span class="badge mls-move-chip is-new" title="${escapeHtml(title)}">New<span class="sr-only"> in your ${escapeHtml(label)} since the last update</span></span>`;
    }
    return '';
}
