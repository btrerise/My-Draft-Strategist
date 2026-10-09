// Moved from js/mls/legacy.js in refactor chunk 3E: the Dashboard (Setup tab) part of RENDERERS. The
// sync-log accordion (renderSyncLogs) and the Optimize All / Sync All buttons.
// Improvements S11 added the "lineups need you" box both buttons fill (renderLineupNeeds).
import { getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { escapeHtml } from '../../shared/html.js';
import { State } from '../state.js';
import { isBestBallLeague } from '../helpers.js';
import { formatNameList, hydrateRankingsForLeague, processSleeperData, renderLeagueManager, switchActiveLeague } from '../leagues/sync.js';
import { loadRosterTab } from './roster.js';
import { KEYS } from '../../shared/storage/keys.js';
import { setToastsSuppressed, showToast } from '../../shared/ui/toast.js';
import { optimizeLineup } from './lineup.js';
import { getLineupIssues } from '../lineup/gameInfo.js';
import { lineupIssueItems } from '../lineup/issues.js';
import { WARNING_ICON } from '../badges.js';
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

    // --- LINEUPS THAT NEED YOU (improvements S11) ---
    // After Optimize All or Sync All, every league whose lineup has an injured starter, a starter in your
    // Sleeper IR slot, a starter on bye or an empty starting slot, with what to do and a button that opens
    // its Lineup tab. A toast is gone before you can act on several leagues, so the box stays open (in
    // memory only) until the next run, its close button, or nothing being left to do. The rule is
    // getLineupIssues, the one the Lineup tab's warnings use, read from each league's lineup in
    // State.manualStartersMap without switching leagues. Manual and hand-off leagues have no IR slot (only
    // a Sleeper sync sets isReserve).
    function collectLineupNeeds() {
        return (State.leagues || [])
            .filter(l => !isBestBallLeague(l))
            .map(l => ({
                leagueId: l.leagueId,
                name: l.name || 'Unnamed league',
                items: lineupIssueItems(getLineupIssues(State.manualStartersMap[l.leagueId] || [], l)),
            }))
            .filter(n => n.items.length > 0);
    }

    function setLineupNeedsOpen(open) {
        State.lineupNeedsOpen = open;
        renderLineupNeeds();
    }

    // Drawn from the lineups as they are now, not as the run left them: renderLeagueManager calls this on
    // every Dashboard render (after a swap, a lock, a re-optimize or a sync, and when the Dashboard is
    // shown), so a league you've fixed drops off and the count follows. Once nothing is left, the box
    // closes until the next run (owner's request after S11's first version).
    export function renderLineupNeeds() {
        const box = document.getElementById('lineupNeedsBox');
        if (!box) return;
        const needs = State.lineupNeedsOpen ? collectLineupNeeds() : [];
        if (needs.length === 0) {
            State.lineupNeedsOpen = false;
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        // League and player names are set on Sleeper: escaped like any other outside text.
        const lines = needs.map(n => `
            <li class="mls-needs-line">
                <div class="mls-needs-main">
                    <span class="mls-needs-league">${escapeHtml(n.name)}</span>
                    <span class="mls-needs-items">${n.items.map(i => `<span class="mls-needs-item">${escapeHtml(i)}</span>`).join('<span class="mls-needs-sep"> · </span>')}</span>
                </div>
                <button type="button" class="btn btn-secondary mls-btn-sm mls-needs-open" data-action="openLeagueLineup" data-league-id="${escapeHtml(n.leagueId)}" aria-label="Open ${escapeHtml(n.name)}'s lineup">Open lineup</button>
            </li>`).join('');
        box.innerHTML = `
            <div class="mls-needs-head">
                ${WARNING_ICON}
                <span class="mls-needs-title">${needs.length} lineup${needs.length === 1 ? ' needs' : 's need'} you before kickoff</span>
                <button type="button" class="close-banner-btn close-banner-btn-sm mls-needs-close" data-action="dismissLineupNeeds" aria-label="Close this list">✕</button>
            </div>
            <ul class="mls-needs-list">${lines}</ul>`;
        box.hidden = false;
    }

    export function dismissLineupNeeds() {
        setLineupNeedsOpen(false);
    }

    // "Open lineup": that league, on its Lineup tab, where the matching warning sits above the lineup.
    // A league deleted meanwhile is already gone from the list (it's drawn from State.leagues).
    export function openLeagueLineup(leagueId) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        showTab('lineup');
        updateDrawerActiveState('lineup');
    }

    export const optimizeAllLineups = function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        // The last run's list goes as this one starts: a failed run shows none.
        setLineupNeedsOpen(false);
        const origText = btn.innerHTML;
        btn.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sync-spinner"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.73-5.73"/></svg> Optimizing All…`;
        btn.disabled = true;
        btn.style.opacity = '0.8';

        // Brief timeout ensures the UI button state updates before locking the main thread
        setTimeout(() => {
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
                showToast(`Successfully optimized ${managedLeaguesCount} lineups!`);
                setLineupNeedsOpen(true);
            }
        }, 50);
    };

export const syncAllLeagues = async function(btn) {
        if (!State.leagues || State.leagues.length === 0) return;
        
        // Filter out manual leagues — only sync Sleeper connections
        const sleeperLeagues = State.leagues.filter(l => l.leagueId && !l.leagueId.startsWith('manual_') && l.username && l.username !== "Manual");
        
        if (sleeperLeagues.length === 0) {
            showToast("No Sleeper-synced leagues to refresh.", { isError: true });
            return;
        }

        setLineupNeedsOpen(false);
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
            // Set once the run's writes are done; the "lineups need you" list shows only then.
            let synced = false;
            try {
                // Preload the heavy player map ONCE to save massive API bandwidth
                const playerMap = await getSleeperPlayerMap();
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

                // Single write after the loop instead of one localStorage.setItem per league. The
                // active league is put back first so the one saved is yours, not the last synced.
                if (originalActiveId && State.leagues.some(x => x.leagueId === originalActiveId)) State.activeLeagueId = originalActiveId;
                localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
                localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);

                // Save logs to state and local storage
                State.syncLogs = newLogs;
                localStorage.setItem(KEYS.mls.syncLogs, JSON.stringify(State.syncLogs));
                
                // Toast a summary that accounts for every league we tried, not just the ones
                // that worked: a miss here is a roster you'd go on to set a lineup off, so it
                // gets named rather than quietly dropped from the count.
                const failedCount = failedLeagueNames.length;
                let summaryMsg = failedCount > 0
                    ? `Synced ${successCount} of ${sleeperLeagues.length}. Couldn't reach: ${formatNameList(failedLeagueNames)} — try Sync All again.`
                    : `Successfully synced ${successCount} league${successCount === 1 ? '' : 's'}!`;
                if (newLogs.length > 0) {
                    summaryMsg += `\n\nChanges found in ${newLogs.length} league${newLogs.length === 1 ? '' : 's'}. Check the Sync Logs!`;
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
                synced = true;
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

                // Every league's lineup is final now (each synced league was re-optimized, yours last),
                // so the list reads them. Leagues it couldn't reach, and manual ones, keep their last lineup.
                if (synced) setLineupNeedsOpen(true);
            }
        }, 50);
    };
