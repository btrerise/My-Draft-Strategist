// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: the code under the
// INDEXEDDB CACHE FOR THE SLEEPER PLAYER MAP marker -- the player-map indexes (autocomplete search
// index, clean name -> Sleeper id), the autocomplete dropdown, and the "did you mean" matcher.
import { getSleeperPlayerMap } from '../shared/api/sleeper.js';
import { escapeHtml } from '../shared/html.js';
import { State } from './state.js';

// --- INDEXEDDB CACHE FOR THE SLEEPER PLAYER MAP ---
// Moved to js/shared/api/sleeper.js -- getSleeperPlayerMap is now imported at the top of this file.

// Autocomplete Search Index
let _playerSearchIndexPromise = null;
// Shown at most once per outage -- getPlayerSearchIndex() is called on every autocomplete
// keystroke, so without this a network failure would toast repeatedly as the user kept
// typing. Resets to false on the next successful fetch, so a later, separate outage still
// gets its own toast rather than being silenced forever by this one.
let _playerSearchIndexErrorShown = false;
function getPlayerSearchIndex() {
    if (_playerSearchIndexPromise) return _playerSearchIndexPromise;
    _playerSearchIndexPromise = getSleeperPlayerMap().then(map => {
        _playerSearchIndexErrorShown = false;
        const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
        const index = [];
        Object.values(map).forEach(p => {
            if (!p.first_name || !FANTASY_POS.includes(p.position)) return;
            const name = `${p.first_name} ${p.last_name}`.trim();
            index.push({ name, pos: p.position, team: p.team || 'FA', searchKey: name.toLowerCase() });
        });
        return index;
    }).catch(err => {
        // Clear the cached promise so the next attempt (next keystroke, or after
        // reconnecting) actually retries instead of replaying this same rejected promise
        // forever -- unlike a successful result, a rejection here was never being retried.
        _playerSearchIndexPromise = null;
        if (!_playerSearchIndexErrorShown && typeof window.showToast === 'function') {
            _playerSearchIndexErrorShown = true;
            window.showToast("Couldn't load player data for search. Check your connection and try again.", { isError: true });
        }
        throw err;
    });
    return _playerSearchIndexPromise;
}

// Reverse index (normalized clean name -> Sleeper player id), built lazily off the same full
// player map getPlayerSearchIndex draws from -- but keyed the other direction, since anywhere
// this app only has a player by NAME (a rankings file, market data, the autocomplete result
// above) needs their Sleeper id to pull real weekly score history from. Waiver Insights'
// free-agent candidates and the standalone player-lookup search both go through this.
let _cleanNameToIdPromise = null;
export function getCleanNameToIdIndex() {
    if (_cleanNameToIdPromise) return _cleanNameToIdPromise;
    _cleanNameToIdPromise = getSleeperPlayerMap().then(map => {
        const index = {};
        Object.entries(map).forEach(([id, p]) => {
            if (!p.first_name) return;
            const clean = normalizeName(`${p.first_name} ${p.last_name}`);
            // First match wins on a rare exact-name collision -- not worth a disambiguation
            // UI for how infrequently two active, fantasy-relevant players share one name.
            if (!index[clean]) index[clean] = id;
        });
        return index;
    }).catch(err => {
        _cleanNameToIdPromise = null;
        throw err;
    });
    return _cleanNameToIdPromise;
}

// Clean name -> Sleeper position, kept on window.sleeperPosByName for the page's lifetime. Rankings
// files carry no positions, so the Scout tab's card badges (runScout) and Waiver Insights' free-agent
// picks (getTopWaiverCandidatesByPosition) look positions up here, with loaded Market data as their
// fallback. Moved out of runScout in refactor 3G so Waiver Insights builds it too: before, it existed
// only once a Scout action had run in the page. If the player map can't load, it stays unset (the
// callers fall back to Market data) and the next call tries again.
export async function ensureSleeperPosByName() {
    if (window.sleeperPosByName) return;
    try {
        let map = await getSleeperPlayerMap();
        window.sleeperPosByName = {};
        Object.values(map).forEach(p => {
            if (p.first_name) {
                window.sleeperPosByName[normalizeName(`${p.first_name} ${p.last_name}`)] = p.position || "UNK";
            }
        });
    } catch (e) {
        console.warn("Could not fetch Sleeper player map for player positions.");
    }
}

// Autocomplete Dropdown Logic
export function attachPlayerAutocomplete(inputEl, onSelect) {
    if (!inputEl || inputEl.dataset.autocompleteAttached) return;
    inputEl.dataset.autocompleteAttached = '1';

    const wrap = document.createElement('div');
    wrap.className = 'autocomplete-wrap';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);

    let matches = [];
    let highlightedIdx = -1;
    // True between a keystroke and its search results landing. Callers that add their own
    // Enter behavior (the manual-add form) check this so an Enter pressed before the dropdown
    // has caught up isn't mistaken for "nothing matched".
    let pending = false;

    function render() {
        if (matches.length === 0) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; return; }
        dropdown.innerHTML = matches.map((p, i) => `
            <div class="autocomplete-item${i === highlightedIdx ? ' highlighted' : ''}" role="option" data-idx="${i}">
                <span>${escapeHtml(p.name)}</span>
                <span class="autocomplete-meta">${escapeHtml(p.pos)} ·${escapeHtml(p.team)}</span>
            </div>
        `).join('');
        dropdown.style.display = 'block';
    }

    function close() {
        matches = [];
        highlightedIdx = -1;
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }

    function select(p) {
        inputEl.value = p.name;
        close();
        if (typeof onSelect === 'function') onSelect(p);
    }

    inputEl.addEventListener('input', () => {
        const q = inputEl.value.trim().toLowerCase();
        highlightedIdx = -1;
        if (q.length < 2) { pending = false; close(); return; }
        pending = true;
        getPlayerSearchIndex().then(index => {
            if (inputEl.value.trim().toLowerCase() !== q) return;
            pending = false;
            const starts = [], contains = [];
            for (const p of index) {
                if (p.searchKey.startsWith(q)) { starts.push(p); if (starts.length >= 8) break; }
                else if (contains.length < 8 && p.searchKey.includes(q)) contains.push(p);
            }
            matches = starts.concat(contains).slice(0, 8);
            render();
        }).catch(() => { pending = false; });
    });

    dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        e.preventDefault();
        select(matches[parseInt(item.dataset.idx, 10)]);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (matches.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); highlightedIdx = Math.min(highlightedIdx + 1, matches.length - 1); render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlightedIdx = Math.max(highlightedIdx - 1, 0); render(); }
        else if (e.key === 'Enter') {
            // Enter takes the arrowed-to row, or the only row when the search has narrowed to
            // one -- so "type a name, Enter" works without reaching for the arrow keys. With
            // several rows and none highlighted it stays a no-op rather than guessing.
            const pick = highlightedIdx !== -1 ? matches[highlightedIdx] : (matches.length === 1 ? matches[0] : null);
            // preventDefault doubles as the "handled" signal: any Enter listener added after
            // this one (the manual-add form's save-on-Enter) checks e.defaultPrevented, so the
            // same keypress can't both pick a player and save them.
            if (pick) { e.preventDefault(); select(pick); }
        }
        else if (e.key === 'Escape') { close(); }
    });

    inputEl.addEventListener('blur', () => setTimeout(close, 150));

    return {
        isOpen: () => matches.length > 0,
        isPending: () => pending
    };
}

// Levenshtein (edit) distance math
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let curr = [i];
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr.push(Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost));
        }
        prev = curr;
    }
    return prev[n];
}

// "Did you mean" Matcher
export function findClosestRankedName(inputName) {
    const candidates = new Map();
    (State.rosRankings || []).forEach(r => candidates.set(r.cleanName, r.name));
    (State.weeklyRankings || []).forEach(r => candidates.set(r.cleanName, r.name));

    const target = normalizeName(inputName);
    if (!target) return null;

    let best = null, bestDist = Infinity;
    candidates.forEach((displayName, cleanName) => {
        const dist = levenshtein(target, cleanName);
        if (dist < bestDist) { bestDist = dist; best = displayName; }
    });

    const threshold = Math.max(2, Math.floor(target.length * 0.25));
    return (best && bestDist > 0 && bestDist <= threshold) ? best : null;
}

export function attachScoutSuggestionHandler(outputElId) {
    const el = document.getElementById(outputElId);
    if (!el) return;
    el.addEventListener('click', (e) => {
        const link = e.target.closest('.scout-suggest-link');
        if (!link) return;
        e.preventDefault();
        const inputEl = document.getElementById(link.dataset.inputId);
        if (!inputEl) return;
        const original = link.dataset.original;
        const idx = inputEl.value.indexOf(original);
        if (idx !== -1) {
            inputEl.value = inputEl.value.slice(0, idx) + link.dataset.suggested + inputEl.value.slice(idx + original.length);
        }
        window.runScout(link.dataset.scoutType);
    });
}
