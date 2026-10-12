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
// - its to-dos and their buttons (render/dashboard.js, leagueTodoHTML: S11's items, and its Sleeper changes);
// - its Best Available line (scout/bestAvailable.js fills .mls-lc-ba after its async render).
// Every card folds to its header, even with to-dos (owner's choice, so you can move through many leagues
// quickly), and that's remembered per league (KEYS.mls.leagueCardsCollapsed). "Fold all" / "Unfold all" above
// the cards does every league at once.
//
// Round 4 (the owner's go-ahead after my review as a user, with 21 leagues the list ran about six phone screens):
// - A card with nothing to do (no to-dos, no Sleeper changes, no upgrade) starts folded; your own fold or unfold of
//   a card wins and is remembered (KEYS.mls.leagueCardsCollapsed now holds { folded: [ids], open: [ids] }; the
//   round-1 array is read as folded).
// - The Sleeper changes are an item of the to-dos, not a fold. Round 5: they count as "1 to set", in neutral text,
//   not toward "N to do" or the amber border, which are for what needs you before kickoff.
// - ▲ ▼ ✕ show only in Reorder mode (the toolbar's Reorder / Done, in memory), so names get the width and there's
//   no red ✕ on every card.
// - The sync age shows only when it's old or failed.
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
import { collectLineupNeeds, leagueTodoHTML, lineupNeedsHidden, renderLineupNeeds, syncChangesFor, syncChangesHTML } from './dashboard.js';
import { renderBestAvailable } from '../scout/bestAvailable.js';
import { canViewTransition, vtName, withViewTransition } from '../../shared/ui/viewTransition.js';

    const CHEVRON = `<svg class="mls-lc-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const isOffSleeper = (l) => /^(manual|handoff)_/.test(l.leagueId);

    // --- Folded cards: your own choices, remembered: { folded: [leagueId], open: [leagueId] } ---
    // A card you haven't folded or unfolded yourself follows the default: folded when it has nothing to do.
    function readFolds() {
        try {
            const v = JSON.parse(localStorage.getItem(KEYS.mls.leagueCardsCollapsed) || 'null');
            if (Array.isArray(v)) return { folded: new Set(v), open: new Set() }; // round 1's format
            return { folded: new Set((v && v.folded) || []), open: new Set((v && v.open) || []) };
        } catch (e) { return { folded: new Set(), open: new Set() }; }
    }
    function writeFolds(folds) {
        // Only leagues that still exist, so a deleted league's id doesn't linger.
        const keep = (set) => [...set].filter(id => (State.leagues || []).some(l => l.leagueId === id));
        const folded = keep(folds.folded), open = keep(folds.open);
        try {
            if (folded.length || open.length) localStorage.setItem(KEYS.mls.leagueCardsCollapsed, JSON.stringify({ folded, open }));
            else localStorage.removeItem(KEYS.mls.leagueCardsCollapsed);
        } catch (e) { /* storage blocked: it still folds for this visit */ }
    }

    // Reorder mode (the toolbar's Reorder / Done): ▲ ▼ ✕ on each card. In memory: it starts off on every visit.
    let reordering = false;

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
        // Your own choice; the default (folded when there's nothing to do) is applied by applyDefaultFolds.
        const collapsed = ctx.folds.folded.has(l.leagueId);
        const showNeeds = !ctx.hidden;
        const line = showNeeds ? entry.line || null : null;
        const sleeper = showNeeds ? entry.sleeper || null : null;
        // Amber (the border, "N to do") only for what needs you before kickoff. Sleeper changes alone are routine (most
        // leagues have some after an Optimize All), so they read "1 to set", in neutral text (owner's choice, round 5:
        // amber on 13 of 14 cards drowned out the injuries).
        // Except a player still starting on Sleeper who's injured or on bye (round 6): that needs you.
        const urgentSleeper = !!(sleeper && sleeper.changes.urgent);
        const needsYou = !!(line && line.needs) || urgentSleeper;
        const count = (line ? needsYouCount(line.items) : 0) + (urgentSleeper ? 1 : 0);
        // The sync age only when it's worth a look (old, unknown or failed), not "Synced today" on every card.
        const syncNote = st.sync && st.sync.cls !== 'freshness-ok' ? `<span class="${st.sync.cls}">${st.sync.text}</span>` : '';
        const meta = [st.format ? `<span class="mls-lc-format">${escapeHtml(st.format)}</span>` : '', syncNote]
            .filter(Boolean).join('<span class="mls-lc-sep"> · </span>');

        const todo = line || sleeper ? leagueTodoHTML(line, sleeper) : '';
        // What this visit's Sync All changed on the roster, under the status row so a folded card shows it too.
        const synced = syncChangesFor(l.leagueId);
        const n = State.leagues.length;
        return `
            <li class="mls-lc-card${active ? ' is-active' : ''}${needsYou ? ' needs-you' : ''}${collapsed ? ' is-collapsed' : ''}" data-league-id="${id}">
                <div class="mls-lc-head">
                    <button type="button" class="btn-bare mls-lc-fold" data-focus-key="fold:${id}" data-action="toggleLeagueCard" data-league-id="${id}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="${collapsed ? 'Unfold' : 'Fold'} ${name}">${CHEVRON}</button>
                    <button type="button" class="mls-lc-name-btn" data-focus-key="row:${id}" data-action="switchActiveLeague" data-league-id="${id}"${active ? ' aria-current="true"' : ''}>
                        <strong class="mls-lc-name">${name}</strong>
                        ${meta ? `<span class="mls-lc-meta">${meta}</span>` : ''}
                    </button>
                    ${reordering ? `<div class="mls-lc-controls">
                        <button type="button" class="btn-sm btn-secondary mls-league-move-btn" data-focus-key="up:${id}" data-action="moveLeague" data-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move ${name} up">▲</button>
                        <button type="button" class="btn-sm btn-secondary mls-league-move-btn" data-focus-key="down:${id}" data-action="moveLeague" data-index="${index}" data-direction="1" ${index === n - 1 ? 'disabled' : ''} aria-label="Move ${name} down">▼</button>
                        <button type="button" class="btn-sm btn-danger mls-lc-delete" data-focus-key="del:${id}" data-action="deleteLeagueManager" data-league-id="${id}" aria-label="Remove ${name}">✕</button>
                    </div>` : ''}
                </div>
                <div class="mls-lc-status">
                    ${statusChipsHTML(st)}
                    <span class="mls-lc-counts">${count > 0 ? `<span class="mls-lc-count-todo">${count} to do</span>` : ''}${sleeper && !urgentSleeper ? '<span class="mls-lc-count-sleeper">1 to set</span>' : ''}<span class="mls-lc-count-upgrades" data-league-id="${id}">${ctx.upgrades.get(l.leagueId) || ''}</span></span>
                </div>
                ${synced ? `<p class="mls-lc-synced"><span class="mls-lc-synced-label">Synced:</span> ${syncChangesHTML(synced)}</p>` : ''}
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

        // Kept from the cards being replaced: each Best Available section and its upgrade count (redrawn by
        // renderBestAvailable after its async part, which reads its fold's state from here), so a redraw doesn't
        // flash or fold them.
        const ctx = { folds: readFolds(), hidden: lineupNeedsHidden(needs), ba: new Map(), upgrades: new Map() };
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
        applyDefaultFolds();
        renderToolbarButtons();
        // Each card's Best Available section and the toolbar's switch and summary (only while the Dashboard is shown).
        renderBestAvailable();
    }

    // Cards you haven't folded or unfolded yourself: folded when there's nothing to do (no to-dos, no Sleeper changes,
    // no upgrade, no rankings to upload), open otherwise. Run after each draw, and by renderBestAvailable once it knows the upgrades.
    export function applyDefaultFolds() {
        const folds = readFolds();
        document.querySelectorAll('#leagueCards .mls-lc-card').forEach(card => {
            const id = card.dataset.leagueId;
            if (folds.folded.has(id) || folds.open.has(id)) return;
            // Best available counts when its section opens by default: an upgrade, or rankings still to upload
            // while no league has any.
            const quiet = !card.querySelector('.mls-lc-todo') && !card.querySelector('.mls-ba-fold[data-default="true"]');
            setCardCollapsed(card, quiet);
        });
        renderToolbarButtons();
    }

    function renderToolbarButtons() {
        const btn = document.getElementById('foldAllLeagueCards');
        if (btn) {
            const anyOpen = !!document.querySelector('#leagueCards .mls-lc-card:not(.is-collapsed)');
            btn.textContent = anyOpen ? 'Fold all' : 'Unfold all';
            btn.setAttribute('aria-label', anyOpen ? 'Fold every league card' : 'Unfold every league card');
        }
        const re = document.getElementById('reorderLeagueCards');
        if (re) {
            re.textContent = reordering ? 'Done' : 'Reorder';
            re.setAttribute('aria-pressed', reordering ? 'true' : 'false');
            re.setAttribute('aria-label', reordering ? 'Done reordering' : 'Reorder or remove leagues');
        }
    }

    // The toolbar's Reorder / Done: shows or hides ▲ ▼ ✕ on every card.
    export function toggleLeagueReorder() {
        withCardsTransition(() => {
            reordering = !reordering;
            renderLeagueCards();
            const re = document.getElementById('reorderLeagueCards');
            if (re) re.focus();
        });
    }

    // Folding, Fold all, Reorder and ▲ ▼ move the cards in place (owner's choice, S16): each card gets a
    // view-transition-name from its league id while the transition runs, in the picture before and in the
    // redrawn list after, so the browser moves each one from its old box to its new one (css/base.css,
    // .vt-card). The names come off when the last such transition ends; until then a second fold or move
    // still needs them.
    // The Command Center's own box and everything after the list (the sync log, then the Dashboard's other cards) get
    // names too, so they grow, shrink and move with the cards instead of jumping to their new places at once.
    let cardTransitions = 0;
    function nameEl(el, name) {
        el.style.setProperty('view-transition-name', name || '');
        el.style.setProperty('view-transition-class', name ? 'vt-card' : '');
        if (!name && !el.getAttribute('style')) el.removeAttribute('style');
    }
    function nameCards(on) {
        document.querySelectorAll('#leagueCards .mls-lc-card').forEach(card => nameEl(card, on && vtName('vt-lc-', card.dataset.leagueId)));
        const list = document.getElementById('leagueCards');
        const center = document.getElementById('dashboardCommandCenter');
        if (!list || !center) return;
        nameEl(center, on && 'vt-lc-center');
        let i = 0;
        for (let el = list.nextElementSibling; el; el = el.nextElementSibling) nameEl(el, on && `vt-lc-after-${i++}`);
        for (let el = center.nextElementSibling; el; el = el.nextElementSibling) nameEl(el, on && `vt-lc-after-${i++}`);
    }
    export function withCardsTransition(update) {
        if (!canViewTransition()) { update(); return Promise.resolve(); }
        cardTransitions++;
        nameCards(true);
        return withViewTransition(() => { update(); nameCards(true); }, {
            kind: 'cards',
            onEnd: () => { if (--cardTransitions === 0) nameCards(false); },
        });
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
        const find = () => document.querySelector(`#leagueCards .mls-lc-card[data-league-id="${CSS.escape(leagueId)}"]`);
        if (!find()) return Promise.resolve();
        return withCardsTransition(() => {
            const card = find();
            if (!card) return;
            const collapsed = !card.classList.contains('is-collapsed');
            setCardCollapsed(card, collapsed);
            const folds = readFolds();
            if (collapsed) { folds.folded.add(leagueId); folds.open.delete(leagueId); }
            else { folds.open.add(leagueId); folds.folded.delete(leagueId); }
            writeFolds(folds);
            renderToolbarButtons();
        });
    }

    // The strip's "Show" / "Show next" (owner's request, S12): scrolls to the next card with to-dos or Sleeper changes,
    // in league order, wrapping around. A folded card unfolds (remembered, as its chevron would). Focus moves to the
    // league's name, without a second scroll.
    let lastJumpId = null;
    export function jumpToLeagueNeeds() {
        const targets = [...document.querySelectorAll('#leagueCards .mls-lc-card')].filter(c => c.querySelector('.mls-lc-todo'));
        if (targets.length === 0) return;
        const prev = targets.findIndex(c => c.dataset.leagueId === lastJumpId);
        const card = targets[(prev + 1) % targets.length];
        lastJumpId = card.dataset.leagueId;
        const opened = card.classList.contains('is-collapsed') ? toggleLeagueCard(lastJumpId) : Promise.resolve();
        opened.then(() => {
            card.scrollIntoView({ block: 'start', behavior: 'smooth' });
            const name = card.querySelector('.mls-lc-name-btn');
            if (name) name.focus({ preventScroll: true });
        });
    }

    // "Fold all" while any card is open, "Unfold all" when none is.
    export function foldAllLeagueCards() {
        withCardsTransition(() => {
            const cards = [...document.querySelectorAll('#leagueCards .mls-lc-card')];
            const collapse = cards.some(c => !c.classList.contains('is-collapsed'));
            cards.forEach(c => setCardCollapsed(c, collapse));
            const ids = new Set(cards.map(c => c.dataset.leagueId));
            writeFolds(collapse ? { folded: ids, open: new Set() } : { folded: new Set(), open: ids });
            renderToolbarButtons();
        });
    }
