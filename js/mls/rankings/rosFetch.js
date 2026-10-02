// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: SHARED
// MARKET-CONSENSUS FETCH (a comment only; the fetch lives in js/shared/api/market.js) and ROS
// RANKINGS AUTO-FETCH (autoFetchRosRankings).
import { fetchMarketConsensusData } from '../../shared/api/market.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { setRankingsCardExpanded } from './engine.js';
import { resolveRankingsTarget, saveRankingsAsSet, assignSetToLeagues, openLeaguePickerDialog, leagueCountText } from './sets.js';
import { loadRosterTab } from '../legacy.js';
    // --- SHARED MARKET-CONSENSUS FETCH ---
    // Moved to js/shared/api/market.js -- fetchMarketConsensusData is now imported at the top of
    // this file. It's still used the same way below (Scout tab's Power Rankings and the
    // ROS Rankings auto-fetch both call it), just no longer defined in this file.

    // --- ROS RANKINGS AUTO-FETCH ---
    // Reuses the exact same market-consensus fetch already proven for Scout's Power Rankings.
    // This is a deliberately narrower feature than "auto-fetch rankings" in general: ROS
    // (rest-of-season) value maps directly onto what FantasyCalc/LeagueLogs already provide
    // (a single overall value per player, no week-specific data). Weekly Rankings do NOT get
    // an equivalent auto-fetch -- the real expert-consensus weekly rankings source (FantasyPros)
    // requires a paid/partnership API key, and the free alternatives found either return raw
    // stats/projections rather than a ready-made ranking, or are of uncertain reliability. Rather
    // than guess at an unverified integration, Weekly Rankings stay upload-only for now.
    export const autoFetchRosRankings = async function(btn) {
        if (!btn) return;
        const origText = btn.innerText;
        btn.innerText = "Fetching…";
        btn.style.opacity = "0.7";
        btn.disabled = true;

        try {
            // Shared with the Scout tab's Power Rankings settings -- see updateMarketSetting()
            // and the "ros"-prefixed controls on this tab for where this gets configured.
            const s = State.marketSettings;
            const isTEP = s.tep ? 'true' : 'false';
            let teamCount = (typeof getActiveLeague === 'function' && getActiveLeague()?.settings?.teams) || 12;

            const { parsed, formatText } = await fetchMarketConsensusData(s.source, s.type, s.qbs, s.ppr, isTEP, teamCount);
            if (parsed.length === 0) throw new Error("No players returned from the market data source.");

            // Convert to the same shape manual ROS uploads use (rank/posRank/flexRank), computed
            // by sorting on marketVal (lower = better) both overall and within each position.
            let sorted = [...parsed].sort((a, b) => a.marketVal - b.marketVal);
            let posCounters = {};
            let rosRankings = sorted.map((p, i) => {
                const posKey = (p.pos || '').toUpperCase();
                posCounters[posKey] = (posCounters[posKey] || 0) + 1;
                return { name: p.name, cleanName: p.cleanName, rank: i + 1, posRank: posCounters[posKey], flexRank: i + 1 };
            });

            // Same destructive write an .xlsx/.csv upload makes, just reached without a file
            // picker: with a named set selected in the dropdown, this replaces that set's data
            // in place and every league pointed at it follows. Uploads get the preview modal's
            // destination line for this; there's no file to preview here, so the confirm below
            // carries the same information. A new set overwrites nothing, so it saves silently.
            const target = resolveRankingsTarget('ros');
            if (target.mode === 'replace') {
                const leagueNote = target.leagueCount === 1
                    ? 'It is used by 1 league.'
                    : `It is used by ${target.leagueCount} leagues.`;
                const confirmed = await window.showConfirm(
                    `The ${rosRankings.length} players just fetched (${formatText}) will replace the saved set "${target.name}".\n\n${leagueNote} This can't be undone.`,
                    { title: 'Replace saved set?', confirmText: 'Replace Set', danger: true }
                );
                if (!confirmed) {
                    if (window.showToast) window.showToast(`Nothing was changed — "${target.name}" is untouched.`);
                    return;
                }
            }

            const savedSetId = saveRankingsAsSet('ros', rosRankings);
            setRankingsCardExpanded('rosRankingsCard', false);

            if (window.showToast) window.showToast(`ROS Rankings pulled: ${rosRankings.length} players (${formatText})`);

            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id === 'rosterTab') loadRosterTab();

            // Uploads choose leagues in their preview modal; this path has none, so a brand-new
            // set offers the same choice right after saving. A replaced set already carries its
            // leagues with it, so there's nothing to ask.
            const newSet = target.mode === 'new' && State.rankingSets.ros.find(s => s.id === savedSetId);
            if (newSet && State.leagues.length > 1) {
                // The fetch itself is done -- restore the button now rather than leaving it on
                // "Fetching..." behind the dialog (finally below repeats this harmlessly).
                btn.innerText = origText;
                btn.style.opacity = "1";
                btn.disabled = false;
                const choice = await openLeaguePickerDialog('ros', newSet, {
                    title: 'Use this set in other leagues?',
                    intro: `"${newSet.name}" is saved for this league. Check any others that should use it too.`,
                    confirmText: 'Apply',
                    cancelText: 'Just This League'
                });
                if (choice && choice.add.length) {
                    assignSetToLeagues('ros', newSet.id, { add: choice.add });
                    if (window.showToast) window.showToast(`"${newSet.name}" also applied to ${leagueCountText(choice.add.length)}.`);
                }
            }

        } catch (error) {
            console.error("Error auto-fetching ROS rankings:", error);
            if (window.showToast) window.showToast(`Could not auto-fetch ROS rankings.\n\n${error.message}`, { isError: true });
        } finally {
            btn.innerText = origText;
            btn.style.opacity = "1";
            btn.disabled = false;
        }
    };
