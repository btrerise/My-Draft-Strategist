// T-Score page (/t-score/) script. Moved from the inline <script> at the end of
// t-score/index.html in refactor chunk 4B, loaded as a module after js/shared/globals.js.
// 4B dropped tscoreNormalize / tscoreEscapeHtml for the shared normalizeName / escapeHtml (which
// also escapes ') and made window.KEYS the KEYS import. 5E replaced the page's inline onclicks
// with data-action delegation (end of file) and the window.mdsFetch / showToast / createFocusTrap
// / getTabFromHash reads with imports, so this module sets no window.* names.
import { escapeHtml } from '../shared/html.js';
import { KEYS } from '../shared/storage/keys.js';
import { createFocusTrap } from '../shared/ui/focusTrap.js';
import { getTabFromHash } from '../shared/ui/tabHash.js';
import { delegate } from '../shared/ui/delegate.js';
import { shareSite } from '../shared/ui/share.js';
import { migrateKeyNames, deleteOldKeyNames } from '../shared/storage/keyMigration.js';
import { initInSeason, switchInSeasonPos, toggleBuySellOnly } from './inSeason.js';

// Refactor chunk 6B: copy the T-Score cache keys from their pre-6B names (mds_tscore_cache*)
// before the DOMContentLoaded handler below reads them, then (6C) delete the old copies. Runs at
// load, as on the other two pages.
migrateKeyNames('tscore');
deleteOldKeyNames('tscore');

// --- THE PRESEASON TABLES ---
// The preseason tables ship in the page's HTML. Until improvements T3, a "Sync with most recent data" button fetched the
// owner's preseason WR/RB sheets, redrew these tables and saved two copies: tscore_page_cache (these tables, drawn from
// it on the next visit, below) and tscore_cache (the badges Draft Strategist shows on draft cards, js/mds/tracker.js).
// The owner had it removed (2026-11-23): the preseason model is final for the season and the In-Season tab fetches its
// own sheet on every visit. A browser that synced before still draws its saved copy.

// Stat columns shown alongside score/label differ by position: WR gets 3, RB gets 2 (header: the sheet's column
// they were read from; key: the saved copy's field).
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

// On page open: if a refresh before improvements T3 left cached data, render from that instead of the
// static HTML that ships with the page. If there's no cache, the static tables stay exactly as written. Waits for DOMContentLoaded, as
// the inline script this module came from had to (it ran during parsing, before Papa's
// <script defer> and js/shared/). This module runs after both, so the wait is no longer needed,
// but it keeps the render at the same moment.
document.addEventListener('DOMContentLoaded', () => {
    initInSeason(); // the In-Season tab: its saved copy now, the sheet's latest when it arrives (improvements T1)

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


// The tab a visit opens on without a #tab in the address (improvements T1: In-Season during the season).
const DEFAULT_TAB = 'inSeasonTab';

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
        switchTab(DEFAULT_TAB, true);
    }
});

// Deep link: open the tab named in the URL hash on load (a reload, or a shared #top50Tab
// link), else In-Season (the default since improvements T1; The Research before). Waits for DOMContentLoaded, like the cached render above.
// replaceState stamps this first entry with its tab so Back restores it.
document.addEventListener('DOMContentLoaded', () => {
    const initialTab = getTabFromHash(id => id) || DEFAULT_TAB;
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
    // The In-Season tab's WR / RB / TE and "Buy & Sell only" (improvements T1)
    switchInSeasonPos() { switchInSeasonPos(this.dataset.pos); },
    toggleBuySellOnly() { toggleBuySellOnly(this); },
    // "How it differs from the preseason T-Score": The Research, at its In-Season section
    readInSeasonModel(event) {
        event.preventDefault();
        switchTab('researchTab');
        document.getElementById('inSeasonModel')?.scrollIntoView({ block: 'start' });
    },
    // "Share this site" (drawer) and the line at the end of The Research: improvements K2
    shareSite() { shareSite(this.dataset.share); },
};

// The page's static regions that hold those buttons, one click listener each. None is ever
// re-rendered.
for (const container of [
    document.querySelector('body > header.header'),
    document.getElementById('menuOverlay'),
    document.getElementById('hamburgerMenu'),
    document.querySelector('.tscore-nav-wrapper'),
    document.getElementById('main'),
]) delegate(container, 'click', clickActions);
