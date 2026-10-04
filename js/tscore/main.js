// T-Score page (/t-score/) script. Moved from the inline <script> at the end of
// t-score/index.html in refactor chunk 4B, loaded as a module after js/shared/globals.js.
// 4B dropped tscoreNormalize / tscoreEscapeHtml for the shared normalizeName / escapeHtml (which
// also escapes ') and made window.KEYS the KEYS import. 5E replaced the page's inline onclicks
// with data-action delegation (end of file) and the window.mdsFetch / showToast / createFocusTrap
// / getTabFromHash reads with imports, so this module sets no window.* names.
import { normalizeName } from '../shared/names.js';
import { escapeHtml } from '../shared/html.js';
import { KEYS } from '../shared/storage/keys.js';
import { mdsFetch } from '../shared/net.js';
import { showToast } from '../shared/ui/toast.js';
import { createFocusTrap } from '../shared/ui/focusTrap.js';
import { getTabFromHash } from '../shared/ui/tabHash.js';
import { delegate } from '../shared/ui/delegate.js';
import { migrateKeyNames } from '../shared/storage/keyMigration.js';

// Refactor chunk 6B: copy the T-Score cache keys from their pre-6B names (mds_tscore_cache*)
// before the DOMContentLoaded handler below reads them. Runs at load, as on the other two pages.
migrateKeyNames('tscore');

// --- T-SCORE SHEET AUTO-REFRESH ---
// Pulls the WR/RB Google Sheets (published to web as CSV, so no auth is needed -- the call
// goes through mdsFetch purely for its timeout, see below) and refreshes every data
// table on this page, plus caches a copy in localStorage that mds.js checks before falling
// back to the bundled tscore_data.js -- see that file's buildPlayerCardHTML() for the read
// side of this. This page and MDS share an origin (mydraftstrategist.com), so localStorage
// is already visible to both without any extra work.
const TSCORE_SHEET_URLS = {
    wr: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9ckcq-TOC3soaHNBwbZEGBzd8goU4j10x8UJ4qjIH79_f_oSsf7rZUghstUQ24DYbBTvXr5hAConB/pub?output=csv',
    rb: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQD7lelXI38YKAJhzszarIhjKlbjG5pYv5o2KTc79k1ibWUU1HhO4QcDOMbmnQnXt-O6tqlZSr6oC5s/pub?output=csv'
};

const TSCORE_LABEL_TO_CLASS = {
    'Elite': 'label-elite',
    'High-End Starter': 'label-high',
    'Strong Starter': 'label-strong',
    'Quality Contributor': 'label-quality',
    'Boom/Bust': 'label-boom',
    'Depth Player': 'label-depth'
};

// Stat columns shown alongside score/label differ by position: WR gets 3, RB gets 2. Matched
// by header NAME, not fixed column position, so this survives a column getting reordered or
// a new one inserted in the sheet later.
const TSCORE_STAT_COLUMNS = {
    wr: [
        { header: 'Yds/Gm', key: 'stat1' },
        { header: '1st D/Gm', key: 'stat2' },
        { header: 'RZ Tgts', key: 'stat3' }
    ],
    rb: [
        { header: 'Scrimmage Yds/Gm', key: 'stat1' },
        { header: 'HVT/Gm', key: 'stat2' }
    ]
};

// Fetches and parses one position's sheet into structured player rows.
async function fetchTScoreSheet(pos) {
    // mdsFetch (js/shared/net.js) rather than a bare fetch, for the timeout: refreshTScoreData
    // disables the Refresh button and only restores it in its finally, so a stalled sheet
    // request left that button dead for the rest of the session with nothing on screen to say
    // why.
    const res = await mdsFetch(TSCORE_SHEET_URLS[pos]);
    if (!res.ok) throw new Error(`Could not fetch ${pos.toUpperCase()} sheet (HTTP ${res.status})`);
    const csvText = await res.text();

    const parsed = Papa.parse(csvText.trim(), { skipEmptyLines: true });
    const rows = parsed.data;
    if (!rows || rows.length < 2) throw new Error(`${pos.toUpperCase()} sheet returned no data`);

    const header = rows[0].map(h => (h || '').trim());
    const col = (name) => header.indexOf(name);

    const rankCol = col('Rank');
    const playerCol = col('Player');
    const scoreCol = col('T-Score (A)') !== -1 ? col('T-Score (A)') : col('T-Score');
    const labelCol = col('Label');
    const adpCol = col('ADP');
    const expCol = col('Exp T-Score');
    const diffCol = col('T-Score Diff');
    const classCol = col('Classification');
    const statCols = TSCORE_STAT_COLUMNS[pos].map(sc => ({ key: sc.key, idx: col(sc.header) }));

    if ([rankCol, playerCol, scoreCol, labelCol, classCol].includes(-1)) {
        throw new Error(`${pos.toUpperCase()} sheet is missing an expected column (Rank / Player / T-Score / Label / Classification)`);
    }

    const players = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const name = (r[playerCol] || '').trim();
        const score = parseFloat(r[scoreCol]);
        if (!name || isNaN(score)) continue; // skips blank rows and any non-data rows cleanly

        const label = (r[labelCol] || '').trim();
        const player = {
            rank: parseInt(r[rankCol], 10) || 0,
            name: name,
            cleanName: normalizeName(name),
            score: score,
            label: label,
            cssClass: TSCORE_LABEL_TO_CLASS[label] || 'label-depth',
            adp: adpCol !== -1 ? r[adpCol] : '',
            expScore: expCol !== -1 ? r[expCol] : '',
            diff: diffCol !== -1 ? r[diffCol] : '',
            classification: (r[classCol] || '').trim()
        };
        statCols.forEach(sc => { player[sc.key] = sc.idx !== -1 ? (r[sc.idx] || '') : ''; });
        players.push(player);
    }
    return players;
}

function tscoreTop50RowHTML(p, pos) {
    const statCells = TSCORE_STAT_COLUMNS[pos].map(sc => `<td>${escapeHtml(p[sc.key])}</td>`).join('');
    return `<tr><td>${p.rank}</td><td><strong>${escapeHtml(p.name)}</strong></td><td><span class="${p.cssClass}">${escapeHtml(p.label)}</span></td><td>${p.score.toFixed(2)}</td>${statCells}</tr>`;
}

function tscoreFilteredRowHTML(p, pos) {
    const diffNum = parseFloat(p.diff);
    const hasDiff = !isNaN(diffNum);
    const diffClass = hasDiff && diffNum >= 0 ? 'val-fire' : 'val-warn';
    const diffText = hasDiff ? `${diffNum >= 0 ? '+' : ''}${diffNum.toFixed(2)}` : escapeHtml(p.diff);
    const statCells = TSCORE_STAT_COLUMNS[pos].map(sc => `<td>${escapeHtml(p[sc.key])}</td>`).join('');
    return `<tr><td>${p.rank}</td><td><strong>${escapeHtml(p.name)}</strong></td><td><span class="${p.cssClass}">${escapeHtml(p.label)}</span></td><td>${p.score.toFixed(2)}</td><td>${escapeHtml(p.expScore)}</td><td><span class="val-badge ${diffClass}">${diffText}</span></td><td>${escapeHtml(p.adp)}</td>${statCells}</tr>`;
}

// Renders all 8 tables from already-fetched player arrays. Top-50 tables are capped at 50
// (by rank) per an explicit decision to keep those specific tables focused; Values/Sleepers/
// Avoids show every player matching that classification, sorted by rank.
function renderTScoreTables(wrPlayers, rbPlayers) {
    const byPos = { wr: wrPlayers, rb: rbPlayers };

    ['wr', 'rb'].forEach(pos => {
        const players = [...byPos[pos]].sort((a, b) => a.rank - b.rank);
        const idPrefix = pos === 'wr' ? 'Wr' : 'Rb';

        const top50 = players.slice(0, 50);
        const top50Body = document.getElementById(`top50${idPrefix}Body`);
        if (top50Body) top50Body.innerHTML = top50.map(p => tscoreTop50RowHTML(p, pos)).join('');

        [['values', 'Value'], ['sleepers', 'Sleeper'], ['avoids', 'Avoid']].forEach(([tableName, classification]) => {
            const filtered = players.filter(p => p.classification === classification);
            const body = document.getElementById(`${tableName}${idPrefix}Body`);
            if (body) body.innerHTML = filtered.map(p => tscoreFilteredRowHTML(p, pos)).join('');
        });
    });
}

function updateTscoreFreshnessLabel(timestamp) {
    const el = document.getElementById('tscoreFreshness');
    if (!el) return;
    if (!timestamp) { el.textContent = ''; return; }
    const days = Math.floor((Date.now() - Number(timestamp)) / (1000 * 60 * 60 * 24));
    let label = days <= 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
    el.textContent = `Sheet data: ${label}`;
}

async function refreshTScoreData(btn) {
    const origText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; btn.innerHTML = 'Refreshing…'; }

    try {
        const [wrPlayers, rbPlayers] = await Promise.all([fetchTScoreSheet('wr'), fetchTScoreSheet('rb')]);

        renderTScoreTables(wrPlayers, rbPlayers);

        // Build the same {cleanName: {s, l, c}} shape tscore_data.js already uses, so
        // mds.js's lookup logic doesn't need to know or care whether it's reading the
        // bundled static file or this cached override.
        const combined = {};
        [...wrPlayers, ...rbPlayers].forEach(p => {
            combined[p.cleanName] = { s: p.score, l: p.label, c: p.cssClass };
        });

        const timestamp = Date.now();
        localStorage.setItem(KEYS.tscore.cache, JSON.stringify(combined));
        localStorage.setItem(KEYS.tscore.cacheUpdated, String(timestamp));
        // Separate from the compact MDS-format cache above: this keeps the FULL per-player
        // data (ADP, stat columns, etc.) this page's own tables need, so a reload re-renders
        // the actual tables from cache too, instead of the freshness label saying "today"
        // while the visible tables still show whatever shipped in the static HTML.
        localStorage.setItem(KEYS.tscore.pageCache, JSON.stringify({ wr: wrPlayers, rb: rbPlayers }));
        updateTscoreFreshnessLabel(timestamp);

        showToast(`T-Score data refreshed: ${wrPlayers.length} WRs, ${rbPlayers.length} RBs.`);

    } catch (err) {
        console.error(err);
        showToast(`Could not refresh T-Score data:\n${err.message}`, { isError: true });
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = origText; }
    }
}

// On page open: if a previous refresh left cached data, render from that instead of the
// static (potentially stale) HTML that ships with the page. If there's no cache yet, the
// static tables stay exactly as written until the first refresh. Waits for DOMContentLoaded, as
// the inline script this module came from had to (it ran during parsing, before Papa's
// <script defer> and js/shared/). This module runs after both, so the wait is no longer needed,
// but it keeps the render at the same moment.
document.addEventListener('DOMContentLoaded', () => {
    const cachedUpdatedAt = localStorage.getItem(KEYS.tscore.cacheUpdated);
    if (cachedUpdatedAt) updateTscoreFreshnessLabel(cachedUpdatedAt);

    const pageCacheRaw = localStorage.getItem(KEYS.tscore.pageCache);
    if (pageCacheRaw) {
        try {
            const pageCache = JSON.parse(pageCacheRaw);
            if (pageCache && Array.isArray(pageCache.wr) && Array.isArray(pageCache.rb)) {
                renderTScoreTables(pageCache.wr, pageCache.rb);
            }
        } catch (e) {
            console.error('Could not restore cached T-Score table data:', e);
        }
    }
});


function switchTab(tabId, skipHistory) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tscore-nav-btn').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-pressed', 'false');
    });
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    const targetBtn = document.querySelector(`.tscore-nav-btn[data-tab="${tabId}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-pressed', 'true');
    }

    if (skipHistory !== true) {
        history.pushState({ tab: tabId }, '', `#${tabId}`);
    }
}

function switchPosition(pos, tabId) {
    const activeTab = document.getElementById(tabId);
    if (!activeTab) return;
    
    const btns = activeTab.querySelectorAll('.pos-toggle-btn');
    btns.forEach(btn => {
        const isActive = btn.dataset.pos === pos;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    const wrContent = activeTab.querySelector('.wr-content');
    const rbContent = activeTab.querySelector('.rb-content');

    if (pos === 'wr') {
        if (wrContent) wrContent.style.display = 'block';
        if (rbContent) rbContent.style.display = 'none';
    } else {
        if (wrContent) wrContent.style.display = 'none';
        if (rbContent) rbContent.style.display = 'block';
    }
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) {
        switchTab(e.state.tab, true);
    } else if (window.location.hash) {
        switchTab(window.location.hash.substring(1), true);
    } else {
        switchTab('researchTab', true);
    }
});

// Deep link: open the tab named in the URL hash on load (a reload, or a shared #top50Tab
// link), else The Research. Waits for DOMContentLoaded, like the cached render above.
// replaceState stamps this first entry with its tab so Back restores it.
document.addEventListener('DOMContentLoaded', () => {
    const initialTab = getTabFromHash(id => id) || 'researchTab';
    switchTab(initialTab, true);
    history.replaceState({ tab: initialTab }, '');

    // switchPosition() only runs on click, so give the WR/RB pairs their starting
    // aria-pressed from the markup's .active class.
    document.querySelectorAll('.pos-toggle-btn').forEach(btn => {
        btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    });
});

// Focus trap for the open drawer, same as MDS/MLS. This page has no document-level
// Escape handler, so the trap's onEscape is what closes the menu; deactivate() then
// returns focus to the hamburger button.
let menuFocusTrap = null;

function toggleMenu() {
    const menu = document.getElementById('hamburgerMenu');
    const overlay = document.getElementById('menuOverlay');
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    
    if (!menu || !overlay) return;
    
    const isOpen = menu.classList.toggle('open');
    overlay.style.display = isOpen ? 'block' : 'none';
    
    if (hamburgerBtn) {
        hamburgerBtn.setAttribute('aria-expanded', isOpen);
    }

    if (isOpen) {
        menuFocusTrap = createFocusTrap(menu, { onEscape: toggleMenu });
        menuFocusTrap.activate();
    } else if (menuFocusTrap) {
        menuFocusTrap.deactivate();
        menuFocusTrap = null;
    }
}

// --- DATA-ACTION EVENT DELEGATION ---
// Refactor chunk 5E: maps each data-action name in t-score/index.html to the code its inline
// onclick ran. `this` is the button, as it was in the inline handler; data-tab and data-pos carry
// the arguments that used to be literals. switchTab still gets the button as its second
// argument, as onclick="switchTab('…', this)" passed it (it isn't `true`, so the tab is pushed
// to history). See js/shared/ui/delegate.js for how the walk works.
const clickActions = {
    toggleMenu() { toggleMenu(); },
    switchTab() { switchTab(this.dataset.tab, this); },
    switchPosition() { switchPosition(this.dataset.pos, this.dataset.tab); },
    refreshTScoreData() { refreshTScoreData(this); },
};

// The page's static regions that hold those buttons, one click listener each. None is ever
// re-rendered (refreshTScoreData only rebuilds the table bodies and the button's own contents).
// The Refresh button sits in an unnamed wrapper, so it is its own container.
for (const container of [
    document.querySelector('body > header.header'),
    document.getElementById('menuOverlay'),
    document.getElementById('hamburgerMenu'),
    document.querySelector('.tscore-nav-wrapper'),
    document.getElementById('tscoreRefreshBtn'),
    document.getElementById('main'),
]) delegate(container, 'click', clickActions);
