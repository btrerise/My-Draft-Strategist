// Moved from js/mls/legacy.js in refactor chunk 3E: the Dashboard (Setup tab) part of RENDERERS. The
// sync-log accordion (renderSyncLogs) and the Optimize All / Sync All buttons.
// Improvements S11 added the "lineups need you" box under the buttons (renderLineupNeeds); since S12 its to-dos
// are in the league cards (render/leagueCards.js) and the box is a one-line strip.
import { getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { escapeHtml } from '../../shared/html.js';
import { refreshGameTimes, State } from '../state.js';
import { isBestBallLeague } from '../helpers.js';
import { formatNameList, hydrateRankingsForLeague, processSleeperData, renderLeagueManager, switchActiveLeague } from '../leagues/sync.js';
import { loadRosterTab } from './roster.js';
import { KEYS } from '../../shared/storage/keys.js';
import { setToastsSuppressed, showToast } from '../../shared/ui/toast.js';
import { optimizeLineup } from './lineup.js';
import { ensureLineupProjections, formatKickoffLabel, getLineupIssues, getSleeperLineupChanges, sleeperChangesHTML } from '../lineup/gameInfo.js';
import { findChips, lineupIssueItems, needsLineupButton, needsYou } from '../lineup/issues.js';
import { updateWaiverScanSetting } from '../scout/waivers.js';
import { isManualLeague, refreshManualInjuries } from '../leagues/manualInjuries.js';
import { INFO_ICON, WARNING_ICON } from '../badges.js';
import { showTab, updateDrawerActiveState } from '../nav.js';


    export const renderSyncLogs = function() {
        const accordion = document.getElementById('syncLogAccordion');
        const content = document.getElementById('syncLogContent');
        const summary = document.getElementById('syncLogSummary');
        
        if (!accordion || !content || !summary) return;

        if (!State.syncLogs || State.syncLogs.length === 0) {
            accordion.style.display = 'none';
            return;
        }

        accordion.style.display = 'block';
        let totalChanges = 0;
        let html = "";

        State.syncLogs.forEach(log => {
            let changes = [];
            if (log.added.length) changes.push(`<span style="color: #86efac; font-weight: 500;">+ ${log.added.map(escapeHtml).join(', ')}</span>`);
            if (log.dropped.length) changes.push(`<span style="color: #9ca3af; text-decoration: line-through;">- ${log.dropped.map(escapeHtml).join(', ')}</span>`);
            if (log.newlyOut.length) changes.push(`<span style="color: #fca5a5;">Out: ${log.newlyOut.map(escapeHtml).join(', ')}</span>`);
            
            if (changes.length > 0) {
                totalChanges += (log.added.length + log.dropped.length + log.newlyOut.length);
                html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.6rem 0.8rem; border-radius: 6px; border-left: 2px solid #60a5fa;">
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-bottom: 0.3rem;">${escapeHtml(log.leagueName)}</div>
                    <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem;">
                        ${changes.join('')}
                    </div>
                </div>`;
            }
        });

        if (totalChanges === 0) {
            html = `<div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No roster changes detected in the last sync.</div>`;
            summary.innerText = `Recent Sync Logs (No Changes)`;
        } else {
            summary.innerText = `Recent Sync Logs (${totalChanges} Change${totalChanges === 1 ? '' : 's'})`;
        }

        content.innerHTML = html;
    };

    // The roster changes this visit's last Sync All found, by league id (S12 round 8). Each league's card shows its own
    // ("Synced: + Mike Washington · − Chris Godwin"), since the Sync Logs above sit under every card, thousands of
    // pixels down on a phone. In memory only: after a reload the cards are quiet again and the logs keep the history.
    let syncChangesThisVisit = null;
    export function syncChangesFor(leagueId) {
        return (syncChangesThisVisit && syncChangesThisVisit.get(leagueId)) || null;
    }

    // "+ Mike Washington · − Chris Godwin · Tony Pollard (Out)", names kept whole (newly out ones muted). The log
    // stores a newly out player as "Tony Pollard (OUT)" (or "(IR)"): the card says "(Out)" rather than "Out: … (OUT)".
    export function syncChangesHTML(log) {
        const nb = (names) => names.map(n => escapeHtml(n).replace(/ /g, '&nbsp;')).join(', ');
        const parts = [];
        if (log.added.length) parts.push(`<span class="mls-lc-synced-add">+&nbsp;${nb(log.added)}</span>`);
        if (log.dropped.length) parts.push(`<span class="mls-lc-synced-drop">&minus;&nbsp;${nb(log.dropped)}</span>`);
        if (log.newlyOut.length) parts.push(`<span class="mls-lc-synced-out">${nb(log.newlyOut.map(n => n.replace(/\(OUT\)$/, '(Out)')))}</span>`);
        return parts.join('<span class="mls-needs-sep"> · </span>');
    }

    // --- LINEUPS THAT NEED YOU (improvements S11; in the league cards since S12) ---
    // Every league whose lineup needs you before kickoff: a starter who's injured, in your Sleeper IR slot or on
    // bye, or an empty starting slot. Each says what to do ("Justin Jefferson is Doubtful: start CeeDee Lamb
    // instead?"), when the first of those games kicks off, and has the buttons that fix it: Open lineup (a swap or
    // an activation) and Find <pos> (a pickup, on Top Available). And the leagues whose lineup differs from the one
    // on Sleeper, with the changes.
    // The rule is getLineupIssues, the one the Lineup tab's box uses, read from each league's lineup in
    // State.manualStartersMap / manualBenchMap without switching leagues. Manual and hand-off leagues have
    // no IR slot (only a Sleeper sync sets isReserve) and no Sleeper lineup to compare.
    // Since S12 (owner's choice: one League Command Center) each league's to-dos and Sleeper changes sit in that
    // league's card (render/leagueCards.js), and the box under the buttons (#lineupNeedsBox) is a one-line strip:
    // the count, ✕ and "Sync All again". It's always on (owner's decision, S11 round 3): drawn from the lineups as
    // they are now on every Dashboard render, so a fixed league drops off. ✕ hides the strip and the cards' to-dos
    // for the session (State.lineupNeedsDismissed, in memory) until a league it didn't list needs you, or the next
    // Optimize All or Sync All.
    const DAY_MS = 24 * 60 * 60 * 1000;
    // Feather arrow-down, after the strip's "Show".
    const JUMP_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;

    // { lines, sleeper, needCount, byLeague }: lines and sleeper in league order; byLeague maps a league id to its
    // { line, sleeper } (either may be missing). The league cards and the strip both read this; nothing else
    // works the to-dos out.
    export function collectLineupNeeds() {
        const leagues = (State.leagues || []).filter(l => !isBestBallLeague(l));
        const byLeague = new Map();
        const lines = [], sleeper = [];
        leagues.forEach(l => {
            const starters = State.manualStartersMap[l.leagueId] || [];
            const issues = getLineupIssues(starters, l, State.manualBenchMap[l.leagueId] || []);
            const items = lineupIssueItems(issues);
            const entry = {};
            if (items.length > 0) {
                entry.line = { league: l, issues, items, needs: needsYou(items) };
                lines.push(entry.line);
            }
            const changes = getSleeperLineupChanges(l, starters);
            if (changes) {
                entry.sleeper = { league: l, changes };
                sleeper.push(entry.sleeper);
            }
            byLeague.set(l.leagueId, entry);
        });
        // Leagues that need you: a to-do that counts, or a player in your Sleeper lineup who's injured or on bye.
        const needCount = [...byLeague.values()].filter(e => (e.line && e.line.needs) || (e.sleeper && e.sleeper.changes.urgent)).length;
        return { lines, sleeper, needCount, byLeague };
    }

    const needKeys = (needs) => [...needs.lines.filter(n => n.needs).map(n => `p:${n.league.leagueId}`), ...needs.sleeper.map(n => `s:${n.league.leagueId}`)];

    // Whether ✕ has hidden the to-dos: every league that needs you now was already listed when it was pressed.
    export function lineupNeedsHidden(needs) {
        const dismissed = State.lineupNeedsDismissed;
        return !!dismissed && needKeys(needs).every(k => dismissed.has(k));
    }

    const nb = (text) => escapeHtml(text).replace(/ /g, '&nbsp;');

    // A league card's to-dos (S12; the box's line before): "Needs you · Sun 1:00 PM" (amber within a day), one item per
    // line, then its Sleeper changes as one more item ("On Sleeper: Start X · Bench Y"; owner's choice, S12 round 4:
    // inline, not folded, since setting Sleeper is often the whole job), and one row of buttons. "Set on Sleeper" when
    // the Sleeper changes are all there is; "Notes" when nothing counts (starters you kept, IR moves).
    // n: the league's collectLineupNeeds line, or null; sl: its Sleeper changes, or null.
    export function leagueTodoHTML(n, sl) {
        const league = (n || sl).league;
        const id = escapeHtml(league.leagueId);
        const name = escapeHtml(league.name || 'Unnamed league');
        const urgentSleeper = !!(sl && sl.changes.urgent);
        const needs = !!(n && n.needs) || urgentSleeper;
        const ms = n && n.needs ? n.issues.firstKickoffMs : NaN;
        const when = Number.isFinite(ms) ? formatKickoffLabel(new Date(ms).toISOString()) : '';
        const soon = Number.isFinite(ms) && ms - Date.now() < DAY_MS;
        const label = needs ? 'Needs you' : sl ? 'Set on Sleeper' : 'Notes';
        // One item per line, as on the Lineup tab: a league with several reads as a list, not a run-on sentence.
        const items = (n ? n.items : []).map(i => `<span class="mls-needs-item is-${i.kind}">${escapeHtml(i.text)}</span>`);
        // "On Sleeper:" only beside other items; alone, the label already says "Set on Sleeper".
        // "On Sleeper:" unless the label already says "Set on Sleeper". An injured or bye player starting there is
        // urgent (S12 round 6): the item takes the injury color.
        if (sl) items.push(`<span class="mls-needs-item is-sleeper${urgentSleeper ? ' is-urgent' : ''}" title="As of your last sync: set it on Sleeper, then Sync All to clear this.">${label !== 'Set on Sleeper' ? 'On Sleeper: ' : ''}${sleeperChangesHTML(sl.changes)}</span>`);
        const buttons = [];
        if ((n && needsLineupButton(n.issues)) || sl) buttons.push(`<button type="button" class="btn btn-secondary mls-btn-sm mls-needs-open" data-action="openLeagueLineup" data-league-id="${id}" aria-label="Open ${name}'s lineup">Open lineup</button>`);
        (n ? findChips(n.items) : []).forEach(chip => {
            const label = chip === 'ALL' ? 'Find players' : `Find ${chip}`;
            buttons.push(`<button type="button" class="btn btn-secondary mls-btn-sm mls-needs-find" data-action="findLeaguePlayers" data-league-id="${id}" data-pos="${escapeHtml(chip)}" aria-label="${label} in ${name}">${label}</button>`);
        });
        return `
            <div class="mls-needs-line${needs || sl ? '' : ' is-kept-only'}">
                <div class="mls-needs-main">
                    <span class="mls-needs-head-line"><span class="mls-needs-label">${label}</span>${when ? ` <span class="mls-needs-when${soon ? ' is-soon' : ''}">${nb(when)}</span>` : ''}</span>
                    <span class="mls-needs-items is-stacked">${items.join('')}</span>
                </div>
                ${buttons.length ? `<div class="mls-needs-actions">${buttons.join('')}</div>` : ''}
            </div>`;
    }

    // The strip under the buttons: how many lineups need you, ✕, and "Sync All again". The to-dos themselves are
    // in the league cards. needs: collectLineupNeeds() when the caller has it.
    export function renderLineupNeeds(needs = collectLineupNeeds()) {
        const box = document.getElementById('lineupNeedsBox');
        if (!box) return;
        const shown = needs.lines.length > 0 || needs.sleeper.length > 0;
        if (!shown || lineupNeedsHidden(needs)) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        const p = needs.needCount, sl = needs.sleeper.length;
        const keptOnly = needs.lines.filter(n => !n.needs).length;
        const title = p > 0 ? `${p} lineup${p === 1 ? ' needs' : 's need'} you before kickoff`
            : keptOnly > 0 ? `Nothing needs you before kickoff · ${keptOnly} league${keptOnly === 1 ? '' : 's'} with notes`
            : `${sl} lineup${sl === 1 ? '' : 's'} to set on Sleeper`;
        // With to-dos as well, the Sleeper count is a second part of the title.
        const sleeperPart = p + keptOnly > 0 && sl > 0 ? `<span class="mls-needs-title-more"> · ${sl} to set on Sleeper</span>` : '';
        // "Show" scrolls to the league's card (owner's request, S12); with several, "Show next" steps through them.
        const leagues = new Set([...needs.lines, ...needs.sleeper].map(n => n.league.leagueId)).size;
        const jump = `<button type="button" class="btn-bare mls-needs-jump" data-action="jumpToLeagueNeeds" aria-label="${leagues === 1 ? 'Show the league that needs you' : 'Show the next league that needs you'}">${leagues === 1 ? 'Show' : 'Show next'}${JUMP_ICON}</button>`;
        // The next step (owner's choice, round 5): with lineups to set, that's setting them on Sleeper, then syncing.
        const syncLink = `<button type="button" class="btn-bare mls-needs-check-link" data-action="checkSleeperNow">Sync All again</button>`;
        const checkLine = `<p class="mls-needs-check">${sl > 0
            ? `Set ${sl === 1 ? 'the lineup' : 'the lineups'} on Sleeper, then ${syncLink} to clear ${sl === 1 ? 'it' : 'them'}.`
            : `${syncLink} to get the latest injury news and your current Sleeper lineups for every league.`}</p>`;
        box.innerHTML = `
            <div class="mls-needs-head">
                ${p > 0 ? WARNING_ICON : INFO_ICON}
                <span class="mls-needs-title">${title}${sleeperPart}</span>
                ${jump}
                <button type="button" class="close-banner-btn close-banner-btn-sm mls-needs-close" data-action="dismissLineupNeeds" aria-label="Hide the to-dos">✕</button>
            </div>
            ${checkLine}`;
        box.classList.toggle('has-problems', p > 0);
        box.hidden = false;
    }

    // ✕: hidden for the session, until a league it doesn't list now needs you (or the next run).
    export function dismissLineupNeeds() {
        State.lineupNeedsDismissed = new Set(needKeys(collectLineupNeeds()));
        renderLeagueManager();
    }

    // After Optimize All or Sync All: the box comes back even if it was closed, and the toast says how many
    // leagues need you.
    function showLineupNeedsAfterRun() {
        State.lineupNeedsDismissed = null;
        renderLeagueManager();
        return collectLineupNeeds().needCount;
    }

    const needYouText = (n) => `${n} need${n === 1 ? 's' : ''} you`;

    // The Lineup tab's pointer where the Global Injury Auditor was: the Dashboard, at the Command Center (the box
    // sits under its buttons).
    export function goToLineupNeeds() {
        updateDrawerActiveState('setup');
        showTab('setup').then(() => {
            const card = document.getElementById('dashboardCommandCenter');
            if (card && card.scrollIntoView) card.scrollIntoView({ block: 'start' });
        });
    }

    // "Sync All again" (the box's footer link; named so it's clear it's the button above, owner's choice S11 round 6):
    // Sync All, which gets the latest injury news (a fresh player map), your Sleeper lineups and
    // rosters, and looks up your manual leagues' players by name (S11 round 4: it replaces the Global Injury Auditor).
    export function checkSleeperNow() {
        const btn = document.getElementById('syncAllBtn');
        if (btn && !btn.disabled) syncAllLeagues(btn);
    }

    // "Open lineup": that league, on its Lineup tab, where the matching warning sits above the lineup.
    export function openLeagueLineup(leagueId) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        showTab('lineup');
        updateDrawerActiveState('lineup');
    }

    // "Find RB": nobody on that league's bench can fill the slot, so its Top Available on the Scout tab,
    // filtered to the position (as the Best Available card's View does).
    export function findLeaguePlayers(leagueId, pos) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        updateWaiverScanSetting('mode', 'top');
        updateWaiverScanSetting('pos', pos || 'ALL');
        showTab('scout');
        updateDrawerActiveState('scout');
    }

    export const optimizeAllLineups = function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        const origText = btn.innerHTML;
        btn.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Optimizing All…`;
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures the UI button state updates before locking the main thread
        setTimeout(async () => {
            // This week's projections first: they decide FLEX picks between positions (S12 round 5). And the kickoff
            // times (round 6): a starter whose game has started is auto-locked only once the app knows it has, so an
            // Optimize All before ESPN answered benched Thursday's players your updated rankings no longer list.
            await Promise.all([ensureLineupProjections(), refreshGameTimes()]);
            const originalActiveId = State.activeLeagueId;
            let failed = false;
            // The league the loop is working on. The loop stops at the first league that throws,
            // so if it's still set when the catch runs, the failure toast can name it -- every
            // league after it in the list was never reached. Cleared once the loop completes, so
            // a failure in the flush or the restore below isn't blamed on the last league.
            let workingOn = null;

            // Suppress the per-league toast optimizeLineup fires; one summary goes out below.
            setToastsSuppressed(true);

            try {
                State.leagues.forEach(l => {
                    let isBestBall = isBestBallLeague(l);
                    if (isBestBall) return; // Skip optimizing Best Ball leagues

                    workingOn = l;
                    State.activeLeagueId = l.leagueId;

                    // Hydrate this league's own rankings so the optimizer uses the correct set
                    hydrateRankingsForLeague(l);

                    optimizeLineup(true, false, { batch: true });
                });
                workingOn = null;

                // Single flush for the whole run. Each optimizeLineup call above deliberately
                // skipped these two writes (see its `batch` option): they serialize the entire
                // per-league map every time, so leaving them in the loop meant N leagues paid for
                // N serializations of all N leagues' lineups rather than one.
                localStorage.setItem(KEYS.mls.manualStarters, JSON.stringify(State.manualStartersMap));
                localStorage.setItem(KEYS.mls.manualBench, JSON.stringify(State.manualBenchMap));
            } catch (err) {
                // A bad ranking set, or a quota-exceeded write on the flush above, used to throw
                // straight out of this timeout: toasts stayed stubbed for the rest of the session
                // and the button sat disabled reading "Optimizing All..." with no way back.
                console.error("Optimize All Error:", err);
                failed = true;
            } finally {
                // However the run ended, the app has to come back usable: toasts on, the user's
                // real league re-selected, the button clickable.
                setToastsSuppressed(false);

                // switchActiveLeague re-hydrates the real active league's rankings (the loop
                // above left State.rosRankings/weeklyRankings pointing at whichever league it
                // stopped on) and calls optimizeLineup(false), which is the single render for
                // the entire batch. It must run even after a failure, or the app is left
                // displaying another league's data under the active league's header.
                try {
                    switchActiveLeague(originalActiveId);
                } catch (err) {
                    console.error("Optimize All: failed to restore the active league", err);
                    failed = true;
                }

                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }

            if (failed) {
                // showToast renders plain text, so the (Sleeper-set) league name needs no escaping.
                const msg = workingOn
                    ? `Stopped at "${workingOn.name || 'Unnamed league'}", so leagues after it weren't re-optimized. Try Optimize All again.`
                    : "Lineups were optimized, but saving them or restoring your league didn't finish. Try Optimize All again.";
                showToast(msg, { isError: true });
            } else {
                let managedLeaguesCount = State.leagues.filter(l => !isBestBallLeague(l)).length;
                const needYou = showLineupNeedsAfterRun();
                // And how many to set on Sleeper (S12 round 6): "Successfully optimized 14 lineups!" read oddly over
                // 14 lineups still to set there.
                const toSet = collectLineupNeeds().sleeper.length;
                const extras = [needYou > 0 ? needYouText(needYou) : '', toSet > 0 ? `${toSet} to set on Sleeper` : ''].filter(Boolean);
                showToast(extras.length
                    ? `Optimized ${managedLeaguesCount} lineups · ${extras.join(' · ')}`
                    : `Successfully optimized ${managedLeaguesCount} lineups!`);
            }
        }, 50);
    };

// Leagues whose lineup was optimized before this week's projections loaded (State.projectionlessLineups), other than the
// active one, re-optimized once they're here (S12 round 5; refreshLineupStats calls this when it loads them). Before,
// only the active league was redone, so the Dashboard's to-dos and Sleeper changes for the rest stayed on position
// rank alone until each Lineup tab was opened. Quiet (no toast), locks kept, like Optimize All's loop.
export function reoptimizeProjectionlessLeagues() {
    const originalActiveId = State.activeLeagueId;
    const leagues = (State.leagues || []).filter(l => l.leagueId !== originalActiveId && State.projectionlessLineups.has(l.leagueId));
    if (leagues.length === 0) return;
    setToastsSuppressed(true);
    try {
        leagues.forEach(l => {
            State.projectionlessLineups.delete(l.leagueId);
            if (isBestBallLeague(l)) return;
            State.activeLeagueId = l.leagueId;
            hydrateRankingsForLeague(l);
            optimizeLineup(true, false, { batch: true });
        });
        localStorage.setItem(KEYS.mls.manualStarters, JSON.stringify(State.manualStartersMap));
        localStorage.setItem(KEYS.mls.manualBench, JSON.stringify(State.manualBenchMap));
    } catch (err) {
        console.warn('Re-optimizing with projections did not finish; Optimize All redoes every league.', err);
    } finally {
        setToastsSuppressed(false);
        if (State.leagues.some(x => x.leagueId === originalActiveId)) switchActiveLeague(originalActiveId);
    }
}

export const syncAllLeagues = async function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        
        // Sleeper connections are re-synced. Manual and hand-off leagues have nothing to sync, but their
        // players' injury statuses are looked up by name and their lineups re-optimized (improvements S11,
        // round 4, in place of the Global Injury Auditor).
        const sleeperLeagues = State.leagues.filter(l => l.leagueId && !l.leagueId.startsWith('manual_') && l.username && l.username !== "Manual");
        const manualLeagues = State.leagues.filter(l => isManualLeague(l) && !isBestBallLeague(l) && (l.roster || []).length > 0);

        if (sleeperLeagues.length === 0 && manualLeagues.length === 0) {
            showToast("No Sleeper-synced leagues to refresh.", { isError: true });
            return;
        }

        const origText = btn.innerHTML;
        // The spinner and the text beside it are built once. The loop below changes only the span's
        // text for "Syncing 2/5…": rewriting the button's whole innerHTML made a new spinner element
        // each time, which restarted its animation from the top for every league.
        btn.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> <span class="sync-progress-label">Syncing All…</span>`;
        const progressLabel = btn.querySelector('.sync-progress-label');
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures UI button state updates before locking the main thread
        setTimeout(async () => {
            // processSleeperData makes each league active in turn (it's shared with the
            // single-league sync, where that's the point), so without this the loop ended on
            // whichever league synced last: the header still named yours, but the Lineup and
            // Roster tabs showed the last league's roster scored with your league's rankings,
            // and the app reopened on that league next visit. Put back in the finally below,
            // the same way optimizeAllLineups restores it.
            const originalActiveId = State.activeLeagueId;
            try {
                // Preload the heavy player map ONCE to save massive API bandwidth
                // forceRefresh: Sync All is also the "check Sleeper now" for injuries (it replaced the
                // Global Injury Auditor, which did the same), so it wants today's statuses, not the cached map.
                // This week's projections too, so every league re-optimized below can use them (S12 round 5).
                const [playerMap] = await Promise.all([getSleeperPlayerMap({ forceRefresh: true }), ensureLineupProjections(), refreshGameTimes()]);
                const preloaded = { playerMap }; 

                let successCount = 0;
                // processSleeperData returns false when a league couldn't be reached, and the
                // suppressErrorToast=true we pass below means that failure makes no noise of
                // its own. Counting only the successes and reporting "Successfully synced 5
                // leagues!" said nothing about the three now sitting on stale rosters -- you'd
                // go set lineups off them. Track the misses and name them, the way
                // importAllSleeperLeagues already does.
                let failedLeagueNames = [];
                let newLogs = [];

                // Suppress the per-league toasts processSleeperData fires during the loop; one
                // summary goes out below. Turned back off in the finally, not here: the writes
                // after the loop can throw (QuotaExceededError is realistic once someone has
                // eight or more leagues), and restoring only on the happy path used to mean the
                // catch's error toast went to a no-op stub and every toast in the app stayed
                // dead for the rest of the session.
                setToastsSuppressed(true);

                for (let i = 0; i < sleeperLeagues.length; i++) {
                    let l = sleeperLeagues[i];
                    // Mirrors importAllSleeperLeagues' per-league progress text below, instead
                    // of a static "Syncing All..." for the whole loop regardless of how many
                    // leagues or how long it takes. Text only: the spinner element stays as it is.
                    progressLabel.textContent = `Syncing ${i + 1}/${sleeperLeagues.length}…`;
                    // processSleeperData re-optimizes the league it just synced, and the optimizer
                    // reads whatever rankings are in State -- so load THIS league's first, or every
                    // league gets a lineup built from the originally active league's rankings.
                    hydrateRankingsForLeague(l);
                    // isRefresh = true, suppressErrorToast = true, showChangeSummary = true, skipSave = true
                    let result = await processSleeperData(l.username, l.leagueId, null, true, preloaded, true, true, true);
                    
                    if (result) {
                        successCount++;
                        // If it returned our rosterDiff object with actual changes, log it
                        if (typeof result === 'object' && (result.added.length || result.dropped.length || result.newlyOut.length)) {
                            newLogs.push({
                                leagueId: l.leagueId,
                                leagueName: l.name,
                                added: result.added,
                                dropped: result.dropped,
                                newlyOut: result.newlyOut
                            });
                        }
                    } else {
                        failedLeagueNames.push(l.name || l.leagueId);
                    }
                }

                // Manual and hand-off leagues: today's injury statuses by name, then a fresh lineup (locks kept),
                // the way Optimize All builds one, so an Out player there is benched where someone can replace
                // him and the "lineups need you" boxes name the rest. Their lineups are written below.
                const manualChecked = refreshManualInjuries(manualLeagues, playerMap);
                manualChecked.forEach(l => {
                    State.activeLeagueId = l.leagueId;
                    hydrateRankingsForLeague(l);
                    optimizeLineup(true, false, { batch: true });
                });
                if (manualChecked.length > 0) {
                    localStorage.setItem(KEYS.mls.manualStarters, JSON.stringify(State.manualStartersMap));
                    localStorage.setItem(KEYS.mls.manualBench, JSON.stringify(State.manualBenchMap));
                }

                // Single write after the loop instead of one localStorage.setItem per league. The
                // active league is put back first so the one saved is yours, not the last synced.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) State.activeLeagueId = originalActiveId;
                localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
                localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);

                // Save logs to state and local storage
                State.syncLogs = newLogs;
                // And on each league's card for the rest of the visit (S12 round 8): the logs sit under every card.
                syncChangesThisVisit = new Map(newLogs.map(log => [log.leagueId, log]));
                localStorage.setItem(KEYS.mls.syncLogs, JSON.stringify(State.syncLogs));
                
                // Toast a summary that accounts for every league we tried, not just the ones
                // that worked: a miss here is a roster you'd go on to set a lineup off, so it
                // gets named rather than quietly dropped from the count.
                const failedCount = failedLeagueNames.length;
                // One short line, since phones wrap a long toast onto many lines (owner's request, S11 round 7):
                // "Synced 2 leagues + 1 manual · 1 with roster changes · 2 lineups need you". The details are on
                // screen already: the Sync Logs open by themselves, and the box under the buttons lists the lineups.
                // A sync with nothing else to say keeps its old wording; a failed league keeps its own sentence.
                const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
                const after = collectLineupNeeds();
                const needYou = after.needCount;
                const extras = [];
                if (newLogs.length > 0) extras.push(`${newLogs.length} with roster changes`);
                if (needYou > 0) extras.push(`${plural(needYou, 'lineup')} need${needYou === 1 ? 's' : ''} you`);
                if (after.sleeper.length > 0) extras.push(`${after.sleeper.length} to set on Sleeper`);
                const manualPart = manualChecked.length > 0 ? ` + ${manualChecked.length} manual` : '';
                let summaryMsg;
                if (sleeperLeagues.length === 0) {
                    summaryMsg = [`Checked injuries in ${plural(manualChecked.length, 'manual league')}`, ...extras].join(' · ');
                } else if (failedCount > 0) {
                    summaryMsg = `Synced ${successCount} of ${sleeperLeagues.length}. Couldn't reach: ${formatNameList(failedLeagueNames)} — try Sync All again.`;
                    if (extras.length) summaryMsg += `\n\n${extras.join(' · ')}`;
                } else if (extras.length === 0 && !manualPart) {
                    summaryMsg = `Successfully synced ${plural(successCount, 'league')}!`;
                } else {
                    summaryMsg = [`Synced ${plural(successCount, 'league')}${manualPart}`, ...extras].join(' · ');
                }
                // force: toasts are still suppressed here (the finally below is what clears the
                // flag) and this summary is the whole point of having suppressed them.
                // A partial sync is shown as an error so it doesn't read like an all-clear --
                // that also gets it the dismiss button and a longer window, which it needs:
                // there are league names in there the person has to read and act on.
                showToast(summaryMsg, {
                    isError: failedCount > 0,
                    force: true,
                    duration: failedCount > 0 ? 9000 : undefined
                });

                // Re-render the logs accordion
                renderSyncLogs();
                
                // UX: Automatically open the accordion if there were changes so they don't have to hunt for them
                const accordion = document.getElementById('syncLogAccordion');
                if (accordion) accordion.open = newLogs.length > 0;
            } catch (err) {
                console.error("Sync All Error:", err);
                // A storage-quota failure on the writes above is the common case and has a
                // specific fix, so name it rather than hiding it behind the generic message.
                const isQuota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
                const msg = isQuota
                    ? "Synced your leagues, but there wasn't enough browser storage to save them. Remove a league you no longer use, then try again."
                    : "An error occurred while syncing leagues.";
                showToast(msg, { isError: true, force: true });
            } finally {
                setToastsSuppressed(false);

                btn.innerHTML = origText;
                btn.disabled = false;
                btn.style.opacity = '1';

                // Restore your league even if the loop threw partway: switchActiveLeague puts
                // back its id AND its rankings (the loop left State holding the last synced
                // league's), and re-renders the header, league manager and active tab.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) {
                    try { switchActiveLeague(originalActiveId); } catch (e) { console.error('Sync All: could not restore the active league.', e); }
                }

                // Refresh data states natively
                if (typeof renderLeagueManager === 'function') renderLeagueManager();
                if (typeof loadRosterTab === 'function') loadRosterTab();
                optimizeLineup(false);

                // Every league's lineup is final now (each synced league was re-optimized, yours last):
                // the to-dos come back even if ✕ hid them.
                State.lineupNeedsDismissed = null;
                renderLeagueManager();
            }
        }, 50);
    };
