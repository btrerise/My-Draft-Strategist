// --- THE LEAGUE COMMAND CENTER: ONE CARD PER LEAGUE (improvements S12) ---
// Before S12 the Dashboard showed each league three times: a row in the Command Center's table (League, Rankings,
// Lineup, Settings), a line in the "lineups need you" box under Sync All / Optimize All (S11), and a line in the
// Best Available card (S5). On a phone the table wrapped league names and squeezed its icons, and folding the
// to-dos into it would have traded a vertical problem for a horizontal one (owner's point, S11 round 4).
//
// Owner's choices (S12): one League Command Center at every width, with one card per league, in your league
// order (▲▼); the separate box and the Best Available card go. Each card holds:
// - its header: a fold chevron, the name (a button that makes it the active league), the format and the last
//   sync, and ▲ ▼ ✕ (reorder, delete);
// - its status: a chip each for Weekly rankings (fresh in the last 6 days) and the lineup against Sleeper, with
//   the table's tooltips (they open on a tap, js/shared/ui/tooltips.js), EARLY or BB, and counts that stay
//   readable with the card folded ("2 to do", "1 upgrade");
// - its to-dos and their buttons (render/dashboard.js, leagueNeedsHTML: S11's items) and its Sleeper changes,
//   folded (leagueSleeperFoldHTML);
// - its Best Available line (scout/bestAvailable.js fills .mls-lc-ba after its async render).
// Every card folds to its header, even with to-dos (owner's choice, so you can move through many leagues
// quickly), and that's remembered per league (KEYS.mls.leagueCardsCollapsed). "Fold all" / "Unfold all" above
// the cards does every league at once.
//
// One source for each fact: the to-dos and Sleeper changes come from collectLineupNeeds (dashboard.js), computed
// once per render for the strip and the cards; the status is leagueStatus below (what the table computed).
import { escapeHtml } from '../../shared/html.js';
import { getFreshness } from '../../shared/freshness.js';
import { KEYS } from '../../shared/storage/keys.js';
import { State } from '../state.js';
import { isBestBallLeague } from '../helpers.js';
import { isEarlyPlayer } from '../lineup/earlyGames.js';
import { getValidSleeperStarterIds } from '../lineup/gameInfo.js';
import { needsYouCount } from '../lineup/issues.js';
import { bestBallBadgeMarkup, leagueStatusChipMarkup } from '../badges.js';
import { collectLineupNeeds, leagueNeedsHTML, leagueSleeperFoldHTML, lineupNeedsHidden, renderLineupNeeds } from './dashboard.js';
import { renderBestAvailable } from '../scout/bestAvailable.js';

    const CHEVRON = `<svg class="mls-lc-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const isOffSleeper = (l) => /^(manual|handoff)_/.test(l.leagueId);

    // --- Folded cards: [leagueId], remembered ---
    function readCollapsed() {
        try {
            const v = JSON.parse(localStorage.getItem(KEYS.mls.leagueCardsCollapsed) || '[]');
            return new Set(Array.isArray(v) ? v : []);
        } catch (e) { return new Set(); }
    }
    function writeCollapsed(set) {
        // Only leagues that still exist, so a deleted league's id doesn't linger.
        const ids = [...set].filter(id => (State.leagues || []).some(l => l.leagueId === id));
        try {
            if (ids.length) localStorage.setItem(KEYS.mls.leagueCardsCollapsed, JSON.stringify(ids));
            else localStorage.removeItem(KEYS.mls.leagueCardsCollapsed);
        } catch (e) { /* storage blocked: it still folds for this visit */ }
    }

    // A league's status, as the Command Center's table worked it out before S12 (its Rankings and Lineup columns,
    // the EARLY badge, the format and the sync age). sleeper: the league's Sleeper changes from
    // collectLineupNeeds, or null when it matches or there's nothing to compare.
    export function leagueStatus(l, sleeper) {
        // Weekly rankings: fresh within 6 days.
        let wDate = null;
        const wSet = l.weeklyRankingSetId ? State.rankingSets.weekly.find(s => s.id === l.weeklyRankingSetId) : null;
        if (wSet) wDate = wSet.updatedAt;
        else if (l.weeklyRankingsUpdatedAt) wDate = l.weeklyRankingsUpdatedAt;
        const wFresh = getFreshness(wDate, 6);
        const rankingsFresh = !!wFresh && !wFresh.isStale;

        // The lineup against your Sleeper lineup (the same comparison as the Sleeper changes).
        const starters = State.manualStartersMap[l.leagueId] || [];
        const isSetup = starters.some(s => s.player);
        let lineup;
        if (isBestBallLeague(l)) lineup = 'bestball';
        else if (!isSetup) lineup = 'pending';
        else if (sleeper) lineup = 'differs';
        else if (getValidSleeperStarterIds(l).length > 0 || isOffSleeper(l)) lineup = 'matches';
        else lineup = 'unknown';

        const early = isSetup && starters.some(s => s.player && isEarlyPlayer(s.player.team));

        // Roster age. Manual and Draft Strategist hand-off leagues are never synced from Sleeper, so they get
        // no label. A Sleeper league with no lastSyncedAt was last synced before this was tracked: flagged
        // stale, since we can't vouch for it. Past 2 days a waiver run or trade has likely landed, so it goes
        // amber. A failed sync outranks the age label (set in processSleeperData's catch, cleared on the next
        // successful sync), with the age alongside, since how stale the data is decides whether you can trust
        // a lineup off it before retrying.
        let sync = null;
        if (!isOffSleeper(l)) {
            const syncFresh = getFreshness(l.lastSyncedAt, 2, 'Synced');
            if (l.lastSyncFailedAt) {
                const staleFor = syncFresh ? syncFresh.label.replace(/^Synced /, 'from ') : 'never synced';
                sync = { cls: 'sync-failed', text: `Last sync failed · roster ${staleFor}` };
            } else {
                sync = { cls: (!syncFresh || syncFresh.isStale) ? 'freshness-stale' : 'freshness-ok', text: syncFresh ? syncFresh.label : 'Last sync unknown' };
            }
        }
        return { rankingsFresh, lineup, early, sync, format: l.formatBadge || '' };
    }

    function statusChipsHTML(st) {
        const chips = [st.rankingsFresh
            ? leagueStatusChipMarkup('good', 'Rankings', 'Weekly rankings are fresh (updated in the last 6 days)')
            : leagueStatusChipMarkup('warn', 'Rankings', 'Weekly rankings are stale or missing: upload this week\'s on the Lineup tab')];
        if (st.lineup === 'bestball') chips.push(bestBallBadgeMarkup('<span class="tooltip-text">Best Ball (no lineup to set)</span>'));
        else if (st.lineup === 'pending') chips.push(leagueStatusChipMarkup('pending', 'Lineup', 'Not optimized yet'));
        else if (st.lineup === 'matches') chips.push(leagueStatusChipMarkup('good', 'Lineup', 'Matches your Sleeper lineup'));
        else if (st.lineup === 'differs') chips.push(leagueStatusChipMarkup('danger', 'Lineup', 'Differs from your Sleeper lineup: the changes are in this card'));
        else chips.push(leagueStatusChipMarkup('warn', 'Lineup', 'No Sleeper lineup to compare yet: Sync All gets it'));
        if (st.early) chips.push(`<span class="badge early-badge tooltip-container">EARLY<span class="tooltip-text">A starter has an early game</span></span>`);
        return chips.join('');
    }

    function cardHTML(l, index, entry, ctx) {
        const id = escapeHtml(l.leagueId);
        const name = escapeHtml(l.name || 'Unnamed league');
        const active = l.leagueId === State.activeLeagueId;
        const st = leagueStatus(l, entry.sleeper ? entry.sleeper.changes : null);
        const collapsed = ctx.collapsed.has(l.leagueId);
        const showNeeds = !ctx.hidden;
        const line = showNeeds ? entry.line : null;
        const needsYou = !!(line && line.needs);
        const count = line ? needsYouCount(line.items) : 0;
        const meta = [st.format ? `<span class="mls-lc-format">${escapeHtml(st.format)}</span>` : '', st.sync ? `<span class="${st.sync.cls}">${st.sync.text}</span>` : '']
            .filter(Boolean).join('<span class="mls-lc-sep"> · </span>');

        const todo = [
            line ? leagueNeedsHTML(line) : '',
            showNeeds && entry.sleeper ? leagueSleeperFoldHTML(entry.sleeper, ctx.openSleeper.has(l.leagueId)) : ''
        ].join('');
        const n = State.leagues.length;
        return `
            <li class="mls-lc-card${active ? ' is-active' : ''}${needsYou ? ' needs-you' : ''}${collapsed ? ' is-collapsed' : ''}" data-league-id="${id}">
                <div class="mls-lc-head">
                    <button type="button" class="btn-bare mls-lc-fold" data-focus-key="fold:${id}" data-action="toggleLeagueCard" data-league-id="${id}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="${collapsed ? 'Unfold' : 'Fold'} ${name}">${CHEVRON}</button>
                    <button type="button" class="mls-lc-name-btn" data-focus-key="row:${id}" data-action="switchActiveLeague" data-league-id="${id}"${active ? ' aria-current="true"' : ''}>
                        <strong class="mls-lc-name">${name}</strong>
                        ${meta ? `<span class="mls-lc-meta">${meta}</span>` : ''}
                    </button>
                    <div class="mls-lc-controls">
                        <button type="button" class="btn-sm btn-secondary mls-league-move-btn" data-focus-key="up:${id}" data-action="moveLeague" data-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move ${name} up">▲</button>
                        <button type="button" class="btn-sm btn-secondary mls-league-move-btn" data-focus-key="down:${id}" data-action="moveLeague" data-index="${index}" data-direction="1" ${index === n - 1 ? 'disabled' : ''} aria-label="Move ${name} down">▼</button>
                        <button type="button" class="btn-sm btn-danger mls-lc-delete" data-focus-key="del:${id}" data-action="deleteLeagueManager" data-league-id="${id}" aria-label="Remove ${name}">✕</button>
                    </div>
                </div>
                <div class="mls-lc-status">
                    ${statusChipsHTML(st)}
                    <span class="mls-lc-counts">${count > 0 ? `<span class="mls-lc-count-todo">${count} to do</span>` : ''}<span class="mls-lc-count-upgrades" data-league-id="${id}">${ctx.upgrades.get(l.leagueId) || ''}</span></span>
                </div>
                <div class="mls-lc-body"${collapsed ? ' hidden' : ''}>
                    ${todo ? `<div class="mls-lc-todo">${todo}</div>` : ''}
                    <div class="mls-lc-ba" data-league-id="${id}">${ctx.ba.get(l.leagueId) || ''}</div>
                </div>
            </li>`;
    }

    // The Command Center's league list, the strip above it, and the toolbar. Called by renderLeagueManager
    // (leagues/sync.js) on every Dashboard render, after every lineup render, sync, switch, reorder and delete.
    export function renderLeagueCards() {
        const cmdCenter = document.getElementById('dashboardCommandCenter');
        const list = document.getElementById('leagueCards');
        if (!cmdCenter || !list) return;

        const needs = collectLineupNeeds();
        renderLineupNeeds(needs);

        if (State.leagues.length === 0) {
            cmdCenter.style.display = 'none';
            list.innerHTML = '';
            return;
        }
        cmdCenter.style.display = 'block';

        // Kept from the cards being replaced: which Sleeper folds are open, and each Best Available section and
        // its upgrade count (redrawn by renderBestAvailable after its async part, which reads its fold's state
        // from here), so a redraw doesn't flash or fold them.
        const ctx = { collapsed: readCollapsed(), hidden: lineupNeedsHidden(needs), openSleeper: new Set(), ba: new Map(), upgrades: new Map() };
        list.querySelectorAll('.mls-needs-sleeper[open]').forEach(d => ctx.openSleeper.add(d.dataset.leagueId));
        list.querySelectorAll('.mls-lc-ba').forEach(s => ctx.ba.set(s.dataset.leagueId, s.innerHTML));
        list.querySelectorAll('.mls-lc-count-upgrades').forEach(s => ctx.upgrades.set(s.dataset.leagueId, s.innerHTML));

        // Rebuilding the cards destroys whatever button had focus, which drops a keyboard user back at the top of
        // the page after every switch or reorder. Put focus back on the same control for the same league (or its
        // name, if that control is now disabled, e.g. ▲ on a league that just moved to the top).
        const focusKey = list.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus-key') : null;
        list.innerHTML = State.leagues.map((l, i) => cardHTML(l, i, needs.byLeague.get(l.leagueId) || {}, ctx)).join('');
        if (focusKey) {
            const leagueId = focusKey.slice(focusKey.indexOf(':') + 1);
            const same = list.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
            const target = (same && !same.disabled) ? same : list.querySelector(`[data-focus-key="${CSS.escape('row:' + leagueId)}"]`);
            if (target) target.focus();
        }
        renderFoldAllButton();
        // Each card's Best Available section and the toolbar's switch and summary (only while the Dashboard is shown).
        renderBestAvailable();
    }

    function renderFoldAllButton() {
        const btn = document.getElementById('foldAllLeagueCards');
        if (!btn) return;
        const anyOpen = !!document.querySelector('#leagueCards .mls-lc-card:not(.is-collapsed)');
        btn.textContent = anyOpen ? 'Fold all' : 'Unfold all';
        btn.setAttribute('aria-label', anyOpen ? 'Fold every league card' : 'Unfold every league card');
    }

    function setCardCollapsed(card, collapsed) {
        const name = card.querySelector('.mls-lc-name');
        const fold = card.querySelector('.mls-lc-fold');
        card.classList.toggle('is-collapsed', collapsed);
        const body = card.querySelector('.mls-lc-body');
        if (body) body.hidden = collapsed;
        if (fold) {
            fold.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            fold.setAttribute('aria-label', `${collapsed ? 'Unfold' : 'Fold'} ${name ? name.textContent : 'this league'}`);
        }
    }

    // A card's chevron: fold it to its header, or open it. Remembered per league.
    export function toggleLeagueCard(leagueId) {
        const card = document.querySelector(`#leagueCards .mls-lc-card[data-league-id="${CSS.escape(leagueId)}"]`);
        if (!card) return;
        const collapsed = !card.classList.contains('is-collapsed');
        setCardCollapsed(card, collapsed);
        const set = readCollapsed();
        if (collapsed) set.add(leagueId); else set.delete(leagueId);
        writeCollapsed(set);
        renderFoldAllButton();
    }

    // The strip's "Show" / "Show next" (owner's request, S12): scrolls to the next card with to-dos or Sleeper changes,
    // in league order, wrapping around. A folded card unfolds (remembered, as its chevron would), and a card whose
    // only item is its Sleeper changes opens that fold. Focus moves to the league's name, without a second scroll.
    let lastJumpId = null;
    export function jumpToLeagueNeeds() {
        const targets = [...document.querySelectorAll('#leagueCards .mls-lc-card')].filter(c => c.querySelector('.mls-lc-todo'));
        if (targets.length === 0) return;
        const prev = targets.findIndex(c => c.dataset.leagueId === lastJumpId);
        const card = targets[(prev + 1) % targets.length];
        lastJumpId = card.dataset.leagueId;
        if (card.classList.contains('is-collapsed')) toggleLeagueCard(lastJumpId);
        const sleeperFold = card.querySelector('.mls-needs-sleeper');
        if (sleeperFold && !card.querySelector('.mls-lc-todo > .mls-needs-line')) sleeperFold.open = true;
        card.scrollIntoView({ block: 'start', behavior: 'smooth' });
        const name = card.querySelector('.mls-lc-name-btn');
        if (name) name.focus({ preventScroll: true });
    }

    // "Fold all" while any card is open, "Unfold all" when none is.
    export function foldAllLeagueCards() {
        const cards = [...document.querySelectorAll('#leagueCards .mls-lc-card')];
        const collapse = cards.some(c => !c.classList.contains('is-collapsed'));
        cards.forEach(c => setCardCollapsed(c, collapse));
        writeCollapsed(collapse ? new Set(cards.map(c => c.dataset.leagueId)) : new Set());
        renderFoldAllButton();
    }
