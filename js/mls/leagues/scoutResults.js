// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: LEAGUE-SCOPED SCOUT
// RESULTS.
import { State } from '../state.js';

    // --- LEAGUE-SCOPED SCOUT RESULTS ---
    // The Trade Analyzer (the players typed into both sides, plus its verdict and the dynamic
    // waiver-adjustment hint naming the old league's free agents) and the Positional Power
    // Rankings table both describe ONE league. Left on screen after a switch, they read as
    // results for the league now shown in the header. Cleared from loadActiveLeagueData, the
    // one call every active-league change shares (header switcher, arrows, deleting the active
    // league, adding or importing a new one), and only when the id actually changed -- so
    // re-syncing the same league, or Optimize All handing control back to the league you
    // started on, leaves them alone.
    let _scoutResultsLeagueId = State.activeLeagueId;
    export function clearLeagueScopedResults() {
        if (State.activeLeagueId === _scoutResultsLeagueId) return;
        _scoutResultsLeagueId = State.activeLeagueId;

        ['buyInput', 'sellInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const tradeOutput = document.getElementById('tradeOutput');
        if (tradeOutput) tradeOutput.innerHTML = '';
        const adjustHint = document.getElementById('tradeWaiverAdjustHint');
        if (adjustHint) { adjustHint.innerText = ''; adjustHint.style.display = 'none'; }

        const powerOut = document.getElementById('powerRankingsOutput');
        if (powerOut) { powerOut.innerHTML = ''; powerOut.style.display = 'none'; }
        const powerStrip = document.getElementById('rosterPowerStrip');
        if (powerStrip) { powerStrip.innerHTML = ''; powerStrip.style.display = 'none'; }
    }
