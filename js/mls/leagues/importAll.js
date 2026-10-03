// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: IMPORT ALL LEAGUES.
import { getNflState, getSleeperPlayerMap, getSleeperUser, getSleeperUserLeagues } from '../../shared/api/sleeper.js';
import { State } from '../state.js';
import { updatePulsePrompts } from '../init.js';
import { formatNameList, loadActiveLeagueData, processSleeperData, refreshLeagueDropdown } from './sync.js';
import { KEYS } from '../../shared/storage/keys.js';

    // --- IMPORT ALL LEAGUES (by username only) ---
    // Pulls every league a Sleeper username belongs to for the current NFL season and syncs
    // each one, so the user doesn't have to find and paste in each League ID individually.
    // Reuses processSleeperData() per league (same logic as the single-league sync above) but
    // fetches the user lookup and the ~5MB players list ONCE up front and passes them in via
    // the preloaded param, rather than every league in the loop re-fetching both -- Sleeper's
    // own docs ask callers not to hit the players endpoint more than once a day.
    export const importAllSleeperLeagues = async function(btn) {
        const username = document.getElementById('sleeperUsername')?.value.trim() || "";
        if (!username) {
            if (window.showToast) window.showToast("Please enter your Sleeper Username first.", { isError: true });
            return;
        }

        const origText = btn ? btn.innerText : "";
        if (btn) { btn.innerText = "Finding your leagues…"; btn.disabled = true; btn.style.opacity = "0.7"; }

        try {
            const userId = (await getSleeperUser(username)).user_id;

            // Sleeper's "current" season isn't necessarily the calendar year during the
            // offseason -- league_season (not the more general "season" field) is what
            // Sleeper's own docs describe as the active season for league membership, and
            // it shifts earlier than "season" during the transition into a new year.
            const stateData = await getNflState();
            const season = stateData?.league_season || stateData?.season || String(new Date().getFullYear());

            const leagues = await getSleeperUserLeagues(userId, season);

            if (!leagues || leagues.length === 0) {
                if (window.showToast) window.showToast(`No ${season} NFL leagues found for that username.`, { isError: true });
                return;
            }

            if (btn) btn.innerText = "Loading player data…";
            const playerMap = await getSleeperPlayerMap();
            const preloaded = { userId, playerMap };

            let successCount = 0;
            // Name the misses rather than just counting them, the same way syncAllLeagues does:
            // "3 failed - check console for details" left you to guess which of your leagues
            // didn't make it, and the console isn't somewhere a phone user can look. A league
            // that failed here usually isn't stored at all (it's a first-time import), so it
            // won't show up on the dashboard with a "Last sync failed" row either -- this toast
            // is the only signal there is.
            let failedLeagueNames = [];
            for (let i = 0; i < leagues.length; i++) {
                if (btn) btn.innerText = `Syncing ${i + 1}/${leagues.length}…`;
                const ok = await processSleeperData(username, leagues[i].league_id, null, true, preloaded, true, false, true);
                if (ok) successCount++;
                else failedLeagueNames.push(leagues[i].name || leagues[i].league_id);
            }

            // Single write after the loop instead of one localStorage.setItem per league.
            localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
            localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);

            refreshLeagueDropdown();
            if (State.leagues.length > 0 && !State.activeLeagueId) {
                State.activeLeagueId = State.leagues[0].leagueId;
                localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);
            }
            loadActiveLeagueData();
            if (typeof updatePulsePrompts === 'function') updatePulsePrompts();

            const failCount = failedLeagueNames.length;
            const summary = failCount > 0
                ? `Imported ${successCount} of ${leagues.length}. Couldn't reach: ${formatNameList(failedLeagueNames)} — try Import All again.`
                : `Imported ${successCount} league${successCount === 1 ? '' : 's'}!`;
            // A partial import gets the longer window (and with it the dismiss button), matching
            // syncAllLeagues: there are league names in there to read and act on, and the
            // default duration isn't enough to do that.
            if (window.showToast) {
                window.showToast(summary, {
                    isError: failCount > 0,
                    duration: failCount > 0 ? 9000 : undefined
                });
            }

        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast(`Could not import leagues:\n${err.message}`, { isError: true });
        } finally {
            if (btn) { btn.innerText = origText; btn.disabled = false; btn.style.opacity = "1"; }
        }
    };
