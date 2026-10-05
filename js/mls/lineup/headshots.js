// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: PLAYER HEADSHOTS.
import { getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { escapeHtml } from '../../shared/html.js';
import { KEYS } from '../../shared/storage/keys.js';
import { normalizeName } from '../../shared/names.js';
import { fantasyPosition } from '../constants.js';

// --- PLAYER HEADSHOTS (Roster tab list + Lineup tab starters/bench) ---
// Same Sleeper CDN thumbnails MDS uses on its Draft Board and roster cards. Hotlinked, never
// downloaded or re-hosted: the browser fetches each image straight from Sleeper, and nothing
// is copied into the service worker cache (sw.js skips every cross-origin request).
//
// Every avatar is a fixed-size circle holding the player's initials, with the photo layered
// on top. When the photo can't load -- no Sleeper id, a 404 for a player Sleeper has no photo
// of, the CDN blocked or offline -- the <img> removes itself and the initials show through,
// so rows keep the same shape and alignment either way. DEF rows get the team code instead
// of a photo or logo (team logos are NFL trademarks, so they're deliberately not used here).
//
// Synced Sleeper leagues store the real Sleeper id as p.id. Manual and MDS-handoff rosters
// carry made-up ids ('p_...'), so those resolve by normalized name through a lazily built
// index, preferring a same-team match, then anyone currently on an NFL team -- the same
// tiebreak order resolveManualPlayer uses for the injury audit.
const HEADSHOT_URL = id => `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(id)}.jpg`;
const HEADSHOT_NAME_SUFFIX_RE = /^(jr|sr|ii|iii|iv|v)\.?$/i;
let _headshotNameIndex = null;
let _headshotNameIndexPromise = null;
// Renderers waiting to redraw once the name index lands. A Set of function references, so
// the Roster tab and Lineup tab each redraw exactly once however many renders asked.
const _headshotWaiters = new Set();

export function ensureHeadshotNameIndex(roster, rerender) {
    if (_headshotNameIndex) return;
    // Only worth the player-map lookup when some row can't be resolved by id already.
    const needsName = (roster || []).some(p => p && p.pos !== 'DEF' && !/^\d+$/.test(String(p.id || '')));
    if (!needsName) return;
    if (typeof rerender === 'function') _headshotWaiters.add(rerender);
    if (_headshotNameIndexPromise) return;
    _headshotNameIndexPromise = getSleeperPlayerMap().then(map => {
        const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K'];
        const index = new Map();
        Object.entries(map).forEach(([id, p]) => {
            // fantasyPosition (constants.js): Travis Hunter is listed DB but plays WR here (9C).
            if (!p || !p.first_name || !FANTASY_POS.includes(fantasyPosition(p))) return;
            const clean = normalizeName(`${p.first_name} ${p.last_name}`);
            const list = index.get(clean);
            const entry = { id, team: p.team || null };
            if (list) list.push(entry); else index.set(clean, [entry]);
        });
        _headshotNameIndex = index;
        const waiters = [..._headshotWaiters];
        _headshotWaiters.clear();
        waiters.forEach(fn => { try { fn(); } catch (e) { console.warn('Headshot re-render failed:', e); } });
    }).catch(err => {
        // Initials stay up; the next render gets a fresh attempt.
        _headshotNameIndexPromise = null;
        _headshotWaiters.clear();
        console.warn('Headshots for manually added players unavailable: Sleeper player map could not be loaded.', err);
    });
}

function resolveHeadshotId(p) {
    if (!p || p.pos === 'DEF') return null;
    const id = String(p.id || '');
    if (/^\d+$/.test(id)) return id;
    if (!_headshotNameIndex) return null;
    const candidates = _headshotNameIndex.get(p.cleanName || normalizeName(p.name || ''));
    if (!candidates || candidates.length === 0) return null;
    const team = p.team && p.team !== 'FA' ? p.team : null;
    const pick = (team && candidates.find(c => c.team === team))
        || candidates.find(c => c.team)
        || candidates[0];
    return pick.id;
}

function headshotInitials(p) {
    if (p.pos === 'DEF') return String(p.team && p.team !== 'FA' ? p.team : 'DEF').slice(0, 3);
    const words = String(p.name || '').trim().split(/\s+/).filter(w => w && !HEADSHOT_NAME_SUFFIX_RE.test(w));
    if (words.length === 0) return '';
    const first = words[0][0] || '';
    const last = words.length > 1 ? (words[words.length - 1][0] || '') : '';
    return (first + last).toUpperCase();
}

export function playerHeadshotHTML(p) {
    if (!p) return '';
    const id = resolveHeadshotId(p);
    // loading="lazy" matters beyond scrolling: while headshots are toggled off, the avatar is
    // display:none, and Chromium never starts a lazy image that isn't rendered -- so turning
    // the setting off also stops the requests to Sleeper's CDN, not just the pixels.
    const img = id
        ? `<img class="mls-headshot-img" src="${HEADSHOT_URL(id)}" alt="" width="32" height="32" loading="lazy" decoding="async" data-action="removeImage">`
        : '';
    return `<span class="mls-headshot${p.pos === 'DEF' ? ' mls-headshot-def' : ''}" aria-hidden="true"><span class="mls-headshot-initials">${escapeHtml(headshotInitials(p))}</span>${img}</span>`;
}

// "Show Player Headshots" (Settings > Advanced Settings). Defaults on, like MDS's toggle, but
// stored under its own MLS key: the two apps' display settings stay independent, and the
// MLS prefix means Backup/Restore and Factory Reset pick it up automatically.
function applyHeadshotSetting() {
    const show = localStorage.getItem(KEYS.mls.showHeadshots) !== 'false';
    document.body.classList.toggle('mls-hide-headshots', !show);
    const toggleEl = document.getElementById('mlsHeadshotsToggle');
    if (toggleEl) toggleEl.checked = show;
}

export const toggleMlsHeadshots = function(show) {
    localStorage.setItem(KEYS.mls.showHeadshots, show ? 'true' : 'false');
    applyHeadshotSetting();
};
// Applied as soon as this module runs rather than in window.onload (which waits on every
// image on the page): module scripts run after the document is parsed, so the body and the
// toggle both exist here, and a user who turned headshots off never sees them flash in first.
if (document.body) applyHeadshotSetting();
