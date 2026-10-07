// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: parseFiles (unmarked,
// just above the preview), RANKINGS UPLOAD PREVIEW and UPLOAD PROCESSING INDICATOR, including the
// load-time listeners on the rankings file inputs and the drag-and-drop setup.
import { parseRankingsFiles } from '../../shared/rankings/parse.js';
import { escapeHtml } from '../../shared/html.js';
import { RANKING_TYPE_CONFIG, tierTag } from '../constants.js';
import { State } from '../state.js';
import { generateSoSGrid } from '../sos.js';
import { analyzeRankingsFile, derivedRanksWording } from '../scout/waivers.js';
import { createPreviewShell, formatUnmatchedNames } from '../../shared/rankings/uploadPreview.js';
import { setRankingsCardExpanded } from './engine.js';
import { resolveRankingsTarget, saveRankingsAsSet, renderLeaguePicker, readLeaguePicker, assignSetToLeagues, leagueCountText } from './sets.js';
import { showRankingsChange } from './changeSummary.js';
import { loadRosterTab, optimizeLineup } from '../main.js';
import { KEYS } from '../../shared/storage/keys.js';
import { loadSheetJS } from '../../shared/ui/scriptLoader.js';
import { showToast } from '../../shared/ui/toast.js';
import { formatRankingsDiagnostic } from '../../shared/rankings/diagnostics.js';
import { enableFileDrop } from '../../shared/ui/fileDrop.js';
import { SPINNER_SVG, setProcessingStatus } from '../../shared/ui/statusFeedback.js';
    const parseFiles = async (filesWithContext, isWeekly, successMsgId, onProgress) => {
        const { parsedData, hasNewSos, sosUpdates, diagnostics } = await parseRankingsFiles(filesWithContext, { loadSheetJS: loadSheetJS, onProgress });

        // The parser module returns SoS data rather than writing to State directly (it has no
        // access to State at all -- see js/shared/rankings/parse.js), so it's merged in here instead.
        Object.entries(sosUpdates).forEach(([team, posMap]) => {
            if (!State.sosMap[team]) State.sosMap[team] = {};
            Object.assign(State.sosMap[team], posMap);
        });

        const type = isWeekly ? 'weekly' : 'ros';
        const fileInputIds = filesWithContext.map(f =>
            f.context === 'SINGLE' ? `${type}FileInput` : `${type}FileInput-${f.context}`
        );

        if (parsedData.length === 0) {
            // Clear the file input(s) so the failed selection doesn't linger on screen
            // looking like it might still be "in progress" or successfully attached.
            fileInputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
            // Unreadable files were already toasted by the parser, where the error was caught,
            // so only the other diagnostics are reported here. Each one names its file and says
            // what was wrong (see formatRankingsDiagnostic in js/shared/rankings/diagnostics.js).
            const toReport = diagnostics.filter(d => d.reason !== 'unreadable');
            if (toReport.length > 0) {
                const MAX_SHOWN = 3;
                let message = toReport.slice(0, MAX_SHOWN).map(formatRankingsDiagnostic).join('\n\n');
                if (toReport.length > MAX_SHOWN) {
                    const rest = toReport.length - MAX_SHOWN;
                    message += `\n\n…and ${rest} more file${rest === 1 ? '' : 's'} with the same problem.`;
                }
                // Longer than the 6s error default: these messages carry a list to read and act on.
                showToast(message, { isError: true, duration: 12000 });
            }
            return;
        }

        // Some files in a multi-file upload worked and others didn't, or a workbook had a tab
        // skipped as notes. The preview still opens (what did parse is real data), but it lists
        // what was left out, so a set missing a whole position or tab isn't saved without anyone
        // noticing.
        openRankingsPreview({ parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds, target: resolveRankingsTarget(type), skipped: diagnostics });
    };

    // --- RANKINGS UPLOAD PREVIEW ---
    // Holds the most recently parsed-but-not-yet-committed upload so the confirm/cancel
    // handlers (wired to the modal's buttons) have something to act on. Only one upload
    // can be pending at a time, which matches the UI (one modal, one active upload flow).
    let pendingRankingsUpload = null;
    // Focus trap for the modal -- unlike the drawer, this overlay had no Escape handling at
    // all before, so onEscape is wired to cancelRankingsPreview (same behavior as clicking
    // Cancel: discards the pending upload and clears the file input for reselection).
    // The open / close itself is shared with Draft Strategist since refactor 8C
    // (createPreviewShell, js/shared/rankings/uploadPreview.js).
    const previewShell = createPreviewShell(() => document.getElementById('rankingsPreviewOverlay'), { onEscape: () => cancelRankingsPreview() });

    function openRankingsPreview({ parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds, target, skipped = [] }) {
        pendingRankingsUpload = { parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds, target };

        const rankType = isWeekly ? "Weekly" : "ROS";
        const sorted = [...parsedData].sort((a, b) => a.rank - b.rank);
        const preview = sorted.slice(0, 5);

        const titleEl = document.getElementById('rankingsPreviewTitle');
        if (titleEl) titleEl.textContent = `Preview: ${rankType} Rankings`;

        const countEl = document.getElementById('rankingsPreviewCount');
        if (countEl) countEl.textContent = `${parsedData.length} player${parsedData.length === 1 ? '' : 's'} parsed`;

        // Files from this upload that contributed no players, tabs skipped as notes, and rows
        // lost to an unclosed quote.
        const skippedEl = document.getElementById('rankingsPreviewSkipped');
        if (skippedEl) {
            if (skipped.length > 0) {
                // Whole files that failed, single workbook tabs skipped as notes, and rows lost to
                // an unclosed quote (see js/shared/rankings/parse.js), counted separately so the title says
                // which it was: e.g. "1 tab left out, 3 rows lost".
                const tabs = skipped.filter(d => d.reason === 'tab-without-header').length;
                const quoteDiags = skipped.filter(d => d.reason === 'unclosed-quote');
                const files = skipped.length - tabs - quoteDiags.length;
                const rowsLost = quoteDiags.reduce((sum, d) => sum + (d.rowsLost || 0), 0);
                const leftOut = [];
                if (files) leftOut.push(`${files} file${files === 1 ? '' : 's'}`);
                if (tabs) leftOut.push(`${tabs} tab${tabs === 1 ? '' : 's'}`);
                const titleBits = [];
                if (leftOut.length) titleBits.push(`${leftOut.join(' and ')} left out`);
                if (rowsLost) titleBits.push(`${rowsLost} row${rowsLost === 1 ? '' : 's'} lost`);
                else if (quoteDiags.length) titleBits.push(`${quoteDiags.length} row${quoteDiags.length === 1 ? '' : 's'} may be garbled`);
                const title = titleBits.join(', ');
                skippedEl.querySelector('.preview-unmatched-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
                // Built as text nodes: the messages carry file names and headers from the
                // user's file, and formatRankingsDiagnostic returns plain text.
                const listEl = skippedEl.querySelector('.preview-unmatched-list');
                listEl.textContent = '';
                skipped.forEach(d => {
                    const row = document.createElement('div');
                    row.style.marginBottom = '0.35rem';
                    row.textContent = formatRankingsDiagnostic(d);
                    listEl.appendChild(row);
                });
                skippedEl.style.display = 'block';
            } else {
                skippedEl.style.display = 'none';
            }
        }

        const listEl = document.getElementById('rankingsPreviewList');
        if (listEl) {
            listEl.innerHTML = preview.map(p =>
                `<li><span class="preview-rank">#${p.rank}</span> ${escapeHtml(p.name)}${tierTag(p.tier)}</li>`
            ).join('');
        }

        const noteEl = document.getElementById('rankingsPreviewNote');
        if (noteEl) {
            noteEl.style.display = hasNewSos ? 'block' : 'none';
        }

        // Unmatched-name check runs in the background (it needs Sleeper's player map) and fills
        // in when ready rather than holding the modal closed. The pendingRankingsUpload guard
        // stops a slow lookup from painting into a later upload's modal.
        const unmatchedEl = document.getElementById('rankingsPreviewUnmatched');
        if (unmatchedEl) {
            unmatchedEl.style.display = 'none';
            const derivedEl = document.getElementById('rankingsPreviewDerived');
            if (derivedEl) derivedEl.style.display = 'none';
            analyzeRankingsFile(parsedData).then(({ names, total, derivedPos, derivedFlex }) => {
                if (!pendingRankingsUpload || pendingRankingsUpload.parsedData !== parsedData) return;
                if (total > 0) {
                    const titleEl = unmatchedEl.querySelector('.preview-unmatched-title');
                    const listEl = unmatchedEl.querySelector('.preview-unmatched-list');
                    if (titleEl) titleEl.textContent = `${total} of ${parsedData.length} name${total === 1 ? "" : "s"} didn't match a Sleeper player`;
                    if (listEl) listEl.innerHTML = formatUnmatchedNames(names, 12);
                    unmatchedEl.style.display = 'block';
                }
                // Says up front what the Waiver Wire Assistant would otherwise only mention later:
                // this file carries one overall list, so its positional / FLEX ranks are inferred
                // from that order rather than read from the file.
                const wording = derivedRanksWording(derivedPos, derivedFlex, isWeekly);
                if (derivedEl && wording) {
                    derivedEl.querySelector('.preview-derived-title').textContent = wording.title;
                    derivedEl.querySelector('.preview-derived-body').textContent =
                        `${wording.detail} Either way the ordering is sound; it just means those numbers are this app's reading of your list, and tiers stay on the ranks your file published.`;
                    derivedEl.style.display = 'block';
                }
            }).catch(err => console.warn('Rankings file check skipped:', err));
        }

        // Name the destination, and say plainly when saving means overwriting something that
        // already exists. The replace wording leads with the set name rather than the file's,
        // since the set is the thing at risk.
        const targetEl = document.getElementById('rankingsPreviewTarget');
        const confirmBtn = document.getElementById('rankingsPreviewConfirmBtn');
        if (targetEl) {
            if (target && target.mode === 'replace') {
                const leagueNote = target.leagueCount === 1
                    ? 'Used by 1 league.'
                    : `Used by ${target.leagueCount} leagues.`;
                targetEl.innerHTML = `Replaces the saved set <strong>${escapeHtml(target.name)}</strong>` +
                    `${target.playerCount ? ` (${target.playerCount} player${target.playerCount === 1 ? '' : 's'})` : ''}. ` +
                    `${leagueNote} This can't be undone.`;
                targetEl.className = 'preview-target is-replace';
            } else {
                targetEl.innerHTML = target
                    ? `Saves as a new set: <strong>${escapeHtml(target.name)}</strong>. Nothing existing is changed.`
                    : 'Saves as a new set. Nothing existing is changed.';
                targetEl.className = 'preview-target';
            }
            targetEl.style.display = 'block';
        }
        // Other leagues to point at this set, chosen as it's added. Hidden with a single league.
        const leaguesEl = document.getElementById('rankingsPreviewLeagues');
        if (leaguesEl) {
            if (State.leagues.length > 1) {
                renderLeaguePicker(leaguesEl, isWeekly ? 'weekly' : 'ros', {
                    setId: target && target.mode === 'replace' ? target.id : null,
                    heading: 'Also use this set in'
                });
                leaguesEl.style.display = 'block';
            } else {
                leaguesEl.innerHTML = '';
                leaguesEl.style.display = 'none';
            }
        }

        if (confirmBtn) {
            const isReplace = !!(target && target.mode === 'replace');
            confirmBtn.className = isReplace ? 'btn btn-danger' : 'btn btn-primary';
            confirmBtn.textContent = isReplace ? 'Replace Set' : 'Looks Good, Save It';
        }

        previewShell.open();
    }

    export const cancelRankingsPreview = function() {
        // Clear the file input(s) so the user can immediately reselect the same file --
        // browsers don't fire a 'change' event if the value hasn't actually changed.
        if (pendingRankingsUpload && pendingRankingsUpload.fileInputIds) {
            pendingRankingsUpload.fileInputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
        }
        pendingRankingsUpload = null;
        previewShell.close();
    };

    export const confirmRankingsPreview = function() {
        if (!pendingRankingsUpload) return;
        const { parsedData, hasNewSos, isWeekly, successMsgId, fileInputIds } = pendingRankingsUpload;
        const type = isWeekly ? 'weekly' : 'ros';

        // Clear the file input(s) on save too, not just on cancel. Browsers only fire 'change'
        // when the selection differs, so re-picking the same filename next week (a re-downloaded
        // "rankings.csv", say) silently did nothing while the old selection was still sitting there.
        (fileInputIds || []).forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        // Read the league checklist before saving: saveRankingsAsSet re-renders the card, but
        // the modal's picker is separate, and this is the moment the choice is final.
        const leaguesEl = document.getElementById('rankingsPreviewLeagues');
        const leagueChoice = (leaguesEl && leaguesEl.style.display !== 'none') ? readLeaguePicker(leaguesEl) : { add: [], remove: [] };

        const savedSetId = saveRankingsAsSet(type, parsedData);
        assignSetToLeagues(type, savedSetId, { add: leagueChoice.add });
        setRankingsCardExpanded(RANKING_TYPE_CONFIG[type].cardId, false);

        if (hasNewSos) {
            localStorage.setItem(KEYS.mls.sos, JSON.stringify(State.sosMap));
            generateSoSGrid();
        }

        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') optimizeLineup(true);
        if (activeTab === 'rosterTab') loadRosterTab();
        // After a Replace Set: the "What changed" card (improvements S3). Drawn after the re-optimize
        // above, so it can name the starters that changed. A new set has nothing to show.
        showRankingsChange(type).catch(err => console.warn('What changed summary skipped:', err));

        let msgEl = document.getElementById(successMsgId);
        if (msgEl) {
            msgEl.style.display = 'block';
            setTimeout(() => msgEl.style.display = 'none', 2500);
        }
        let rankType = isWeekly ? "Weekly" : "ROS";
        let isFirstTime = !localStorage.getItem(KEYS.mls.hasSeenRankingsToast);

        const alsoText = leagueChoice.add.length ? ` Also applied to ${leagueCountText(leagueChoice.add.length)}.` : '';

        if (isFirstTime) {
            showToast(`${rankType} Rankings loaded!${alsoText} \n\nTip: We saved this as a reusable set. Use "Choose leagues…" under the set dropdown to share it with more of your leagues any time.`, { duration: 6000 });
            localStorage.setItem(KEYS.mls.hasSeenRankingsToast, 'true');
        } else {
            showToast(`${rankType} Rankings loaded successfully!${alsoText}`);
        }

        pendingRankingsUpload = null;
        previewShell.close();
    };

    // Disables a rankings section's file input(s) for the duration of a parse (type is
    // 'ros' or 'weekly'), so a second file selection can't fire a second overlapping parse
    // while the first is still running -- shared by both the single- and multi-file paths.
    function setUploadInputsDisabled(type, disabled) {
        const singleInput = document.getElementById(`${type}FileInput`);
        if (singleInput) singleInput.disabled = disabled;
        ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'].forEach(pos => {
            const posInput = document.getElementById(`${type}FileInput-${pos}`);
            if (posInput) posInput.disabled = disabled;
        });
    }

    // --- UPLOAD PROCESSING INDICATOR ---
    // The spinner line itself is shared (js/shared/ui/statusFeedback.js, refactor 8B). This finds a
    // rankings section's line by id (type is 'ros' or 'weekly'). Used by the single-file path, which
    // has no button of its own to carry a spinner; the multi-file path shows its progress on the
    // submit button instead (see processMultiRankings).
    function setUploadStatus(type, isProcessing, label) {
        setProcessingStatus(document.getElementById(`${type}ProcessingStatus`), isProcessing, label);
    }

    export const processSingleRankingUpload = function(type, successMsgId) {
        const fileInput = document.getElementById(`${type}FileInput`);
        if (!fileInput || !fileInput.files[0]) return;
        
        const isWeekly = type === 'weekly';
        setUploadInputsDisabled(type, true);
        setUploadStatus(type, true);
        parseFiles([{ file: fileInput.files[0], context: 'SINGLE' }], isWeekly, successMsgId)
            .finally(() => {
                setUploadInputsDisabled(type, false);
                setUploadStatus(type, false);
            });
    };

    export const processMultiRankings = function(type, successMsgId) {
        const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
        let filesWithContext = [];

        positions.forEach(pos => {
            const input = document.getElementById(`${type}FileInput-${pos}`);
            if (input && input.parentElement.style.display !== 'none' && input.files[0]) {
                filesWithContext.push({ file: input.files[0], context: pos });
            }
        });

        if (filesWithContext.length === 0) {
            showToast("Please select and upload at least one positional file.", { isError: true });
            return;
        }

        const isWeekly = type === 'weekly';
        const btn = document.getElementById(`${type}MultiProcessBtn`);
        const originalBtnContent = btn ? btn.innerHTML : null;
        if (btn) btn.disabled = true;
        setUploadInputsDisabled(type, true);

        // The spinner and a text span are built on the first call; after that only the span's text
        // changes, so the spinner element (and its animation) lasts the whole run.
        const updateProgress = (done, total) => {
            if (!btn) return;
            let label = btn.querySelector('.busy-label');
            if (!label) {
                btn.innerHTML = `${SPINNER_SVG} <span class="busy-label"></span>`;
                label = btn.querySelector('.busy-label');
            }
            label.textContent = `Processing ${done}/${total}…`;
        };
        updateProgress(0, filesWithContext.length);

        parseFiles(filesWithContext, isWeekly, successMsgId, updateProgress).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnContent; }
            setUploadInputsDisabled(type, false);
        });
    };

    const rosFileEl = document.getElementById('rosFileInput');
    const weeklyFileEl = document.getElementById('weeklyFileInput');
    if (rosFileEl) rosFileEl.addEventListener('change', () => processSingleRankingUpload('ros', 'rosSuccessMsg'));
    if (weeklyFileEl) weeklyFileEl.addEventListener('change', () => processSingleRankingUpload('weekly', 'weeklySuccessMsg'));

    // Drag-and-drop onto either rankings card (enableFileDrop, js/shared/ui/fileDrop.js). The drop
    // is handed to the same file input the picker uses, so it goes through the exact same
    // path. Single-file mode: the whole card is the target. Multiple-files mode: a file has
    // to land on a visible position box, because the card alone can't say which position it
    // is; that box's input gets it, and "Combine & Process Files" runs the batch as usual.
    ['ros', 'weekly'].forEach(type => {
        enableFileDrop(document.getElementById(`${type}RankingsCard`), {
            pickInput: e => {
                if (document.getElementById(`${type}UploadMode`)?.value !== 'multi') {
                    return document.getElementById(`${type}FileInput`);
                }
                const wrap = e.target instanceof Element ? e.target.closest(`[id^="${type}-input-wrap-"]`) : null;
                return (wrap && wrap.style.display !== 'none') ? wrap.querySelector('input[type="file"]') : null;
            },
            refuseMessage: () => "You're in Multiple Files mode: drop each file onto its position's box. Tick a position above to show its box."
        });
    });

    // loadSheetJS used to be defined here. Draft Strategist needed the same lazy-load with the same
    // failure path (it had its own copy with no error handling at all), so it now lives in
    // js/shared/ui/scriptLoader.js alongside loadScriptOnce. The call sites above import it; the (callback, onError) signature js/shared/rankings/parse.js documents is unchanged.
