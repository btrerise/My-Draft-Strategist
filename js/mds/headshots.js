// Player headshots on the Draft Board and the Team tab (improvements F3, round 2). Same idea as Lineup
// Strategist's (js/mls/lineup/headshots.js): a circle with the player's initials, and the Sleeper photo
// layered on top. The photo paints the circle's background, so no letters show behind it, even where it's
// transparent or while it loads. When it can't load (a 404, the CDN blocked, offline) it removes itself
// and the initials show. Custom players from an uploaded file have no Sleeper id, so they get initials
// only, and DEF the team code. Hotlinked from Sleeper's CDN, never cached (sw.js skips cross-origin).
import { escapeHtml } from '../shared/html.js';
import { headshotInitials } from '../shared/names.js';

// sizeClass sets the circle's size and where it sits: 'draft-cell-img' (board, hidden by the Show Player
// Headshots toggle) or 'roster-avatar' (Team tab, hidden in the Export Team image).
export function headshotHTML({ id, name, pos, team }, sizeClass) {
    const sleeperId = id != null && !String(id).startsWith('custom_') ? String(id) : null;
    const img = sleeperId
        ? `<img class="mds-headshot-img" src="https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(sleeperId)}.jpg" alt="" loading="lazy" decoding="async" data-action="removeImage">`
        : '';
    return `<span class="${sizeClass} mds-headshot" aria-hidden="true"><span class="mds-headshot-initials">${escapeHtml(headshotInitials(name, pos, team))}</span>${img}</span>`;
}
