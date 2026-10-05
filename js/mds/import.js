// Moved from js/mds.js in refactor chunk 2A:
// FILE PARSING & DATA IMPORT.
import { findCsvQuoteProblem, formatRankingsDiagnostic } from '../shared/rankings/diagnostics.js';
import { savePlayerPool } from './storage.js';
import { State, saveAndRenderDraftState } from './state.js';
import { getByeWeek } from '../shared/data/byes.js';
import { updateMetaDisplay } from './settings.js';
import { getSleeperPlayerMap } from '../shared/api/sleeper.js';
import { MDS_NAME_HEADERS, findHeaderRowIndex, normalizeHeader, stripTitleLines } from '../shared/rankings/parse.js';
import { KEYS } from '../shared/storage/keys.js';
import { flashButton } from '../shared/ui/flashButton.js';
import { isNameMatch } from '../shared/names.js';
import { showToast } from '../shared/ui/toast.js';
import { loadSheetJS } from '../shared/ui/scriptLoader.js';
import { enableFileDrop } from '../shared/ui/fileDrop.js';

    // --- FILE PARSING & DATA IMPORT ---
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'csv') {
            // Read as text first (rather than handing Papa the File) so title lines can be
            // stripped before the header parse; see stripTitleLines (js/shared/rankings/parse.js). Rankings files are small,
            // so reading the whole thing at once costs nothing over Papa's own file reading.
            file.text().then(
                text => parseRankingsCsvText(text, null, file.name),
                err => {
                    console.error("Error reading file:", file.name, err);
                    fileInput.value = '';
                    showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                }
            );
        } else if (ext === 'xlsx' || ext === 'xls') {
            // Fetches SheetJS on first use. The onError path matters: with an ad blocker, an
            // offline phone or a cdnjs outage the script never loads, and without this the
            // upload used to dead-end with nothing on screen at all.
            loadSheetJS(() => parseExcel(file), () => {
                console.error("Failed to load SheetJS library");
                showToast(`Couldn't load the Excel file reader, so "${file.name}" wasn't processed. Check your connection and try again, or save the file as .csv instead.`, { isError: true });
            });
        } else if (ext === 'numbers') {
            // Apple Numbers' file format isn't a spreadsheet format our parser (SheetJS) can
            // read -- it's a proprietary zip/binary format, not CSV/XLSX under the hood.
            // Point to Numbers' own CSV export rather than silently failing on a fake attempt.
            showToast("Numbers files aren't supported directly. In Numbers, use File > Export To > CSV, then upload that file instead.", { isError: true });
        } else {
            showToast("Please upload a .csv, .xlsx, or .xls file", { isError: true });
        }
    });

    // Drag-and-drop anywhere on the upload card (enableFileDrop, js/shared/ui/fileDrop.js). The
    // dropped file is handed to this same input and fires the listener above, so a drop and
    // a picked file take the identical path.
    enableFileDrop(fileInput.closest('.settings-card') || fileInput.parentElement, { pickInput: () => fileInput });
}

// Helper function that processes the Excel file
function parseExcel(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        // XLSX.read throws on a corrupt or unexpected workbook. Uncaught inside a FileReader
        // callback that means a silent dead-end, so the failure is surfaced instead.
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            // The header row is read separately (header: 1 gives raw rows) because the object
            // form below has no rows at all for a header-only sheet, so its keys can't be used
            // to report which columns the file actually has.
            // Header row per tab, found past any title lines (findHeaderRowIndex). blankrows:
            // true keeps the raw row indexes lined up with the sheet's own rows, so `startRow`
            // can be handed to SheetJS's `range` option below to start reading at the header.
            const headerInfo = name => {
                const ws = workbook.Sheets[name];
                if (!ws || !ws['!ref']) return { headers: [], startRow: 0 };
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' });
                const idx = findHeaderRowIndex(raw);
                return { headers: raw[idx] || [], startRow: XLSX.utils.decode_range(ws['!ref']).s.r + idx };
            };
            const headerRowOf = name => headerInfo(name).headers;
            // Use the first tab with a player-name column, not simply the first tab. A workbook
            // that opens on a notes or instructions tab used to fail outright here. If no tab
            // qualifies, the error describes the first tab that looks like a table (2+ header
            // cells), which is most likely the one meant to hold the rankings, and falls back to
            // the first tab.
            const sheetName = workbook.SheetNames.find(name =>
                headerRowOf(name).some(h => MDS_NAME_HEADERS.includes(normalizeHeader(h)))
            ) || workbook.SheetNames.find(name => headerRowOf(name).filter(h => String(h).trim()).length >= 2)
              || workbook.SheetNames[0];
            const { headers, startRow } = headerInfo(sheetName);
            const source = { fileName: file.name, headers };
            if (workbook.SheetNames.length > 1) source.sheetName = sheetName;
            processData(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", range: startRow }), null, source);
        } catch (err) {
            console.error("Error reading Excel file:", err);
            showToast(`Couldn't read "${file.name}"; it may be corrupted or in an unsupported format. Try re-saving it as .xlsx or .csv and uploading again.`, { isError: true });
        }
    };
    reader.onerror = () => {
        console.error("Error reading file:", file.name);
        showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
    };
    reader.readAsArrayBuffer(file);
}

    export const processPaste = function(btn) {
        const text = document.getElementById('csvPasteArea')?.value;
        if (text) parseRankingsCsvText(text, btn, null);
    };

    // Shared by CSV uploads and pastes (fileName null). Papa is given a string here, never a
    // File, so it can't fail to read: it always calls `complete`, and read failures are
    // handled where the file is read (file.text() above).
    //
    // The quote check runs on the ORIGINAL text, not the title-stripped copy. stripTitleLines
    // re-serializes the rows with Papa.unparse, which would quote the swallowed cell properly
    // and hide the damage from the main parse. Checking the original also makes the row
    // number match the user's file.
    function parseRankingsCsvText(text, btn, fileName) {
        const quoteProblem = findCsvQuoteProblem(Papa.parse(text, { header: false, skipEmptyLines: true }), 1);
        Papa.parse(stripTitleLines(text), {
            header: true, skipEmptyLines: true,
            complete: results => processData(results.data, btn, { fileName, headers: results.meta.fields, quoteProblem })
        });
    }

    // source: { fileName, headers, sheetName?, quoteProblem?, replace?, successLabel?,
    // successToast? }. fileName is null for pasted text; sheetName is set when the rankings
    // came from one tab of a multi-tab workbook; quoteProblem is findCsvQuoteProblem's result
    // for CSV text. headers is the file's header row as written, used both to catch a missing
    // name column before any work starts and to show the user what columns were found. The
    // diagnostic follows the same shape as js/shared/rankings/parse.js's so both apps share
    // formatRankingsDiagnostic's wording (js/shared/rankings/diagnostics.js).
    //
    // Quick-Start (market.js, refactor 7A) sends Fantasy Football Calculator's rows through here
    // too, as the rows an upload would give, and sets the last three: replace (ignore the
    // aggregate toggle; Quick-Start always replaces the pool, as it did before), successLabel
    // (button text) and successToast ({ text, opts } in place of "Loaded N players"; N fills
    // in for {count}). Returns true once the pool is loaded, false otherwise.
    export async function processData(data, btn = null, source = {}) {
        const metaEl = document.getElementById('metaDisplay');
        const originalBtnText = btn ? btn.innerHTML : "Upload";

        // Blank header cells show up as SheetJS's "__EMPTY" placeholders or Papa's
        // "__parsed_extra"; neither is something the user typed.
        const headersFound = (source.headers || (data[0] ? Object.keys(data[0]) : []))
            .map(h => String(h ?? '').trim())
            .filter(h => h && !h.startsWith('__EMPTY') && h !== '__parsed_extra');
        const fail = reason => {
            const diag = { fileName: source.fileName || null, reason, headersFound, missing: reason === 'no-name-column' ? MDS_NAME_HEADERS : [] };
            if (source.sheetName) diag.sheetName = source.sheetName;
            // Nothing was replaced, so put back whatever the rankings status line said before.
            updateMetaDisplay();
            if (btn) flashButton(btn, "Error Parsing Data", true, originalBtnText);
            // Clear the picker so choosing the same file again (after fixing it) fires 'change'.
            if (source.fileName && fileInput) fileInput.value = '';
            // Longer than the 6s error default: the message lists columns to read and act on.
            showToast(formatRankingsDiagnostic(diag), { isError: true, duration: 12000 });
            return false;
        };

        // Checked before the Sleeper download below (~5MB): no point fetching it for a file
        // that can't produce a single player.
        if (headersFound.length === 0 && data.length === 0) return fail('empty-file');
        if (!headersFound.some(h => MDS_NAME_HEADERS.includes(normalizeHeader(h)))) return fail('no-name-column');
        if (data.length === 0) return fail('no-rows');

        if (metaEl) {
            metaEl.style.display = 'block';
            metaEl.innerText = "Processing players and building database…";
        }
        if (btn) btn.innerHTML = "Processing…";

        // Yield to the browser to ensure the UI updates before the heavy lifting starts
        await new Promise(resolve => setTimeout(resolve, 15));

        let newPlayers = [];
        let posCounters = {}; 
        let sleeperMap = {};

        try {
            // The shared player map (js/shared/api/sleeper.js, refactor 2C): cached in IndexedDB
            // for a day and shared with Lineup Strategist, so a re-upload usually skips the ~5MB
            // download. A fresh download still gets the long fetch timeout.
            sleeperMap = await getSleeperPlayerMap();
        } catch(err) {
            console.warn("Could not fetch Sleeper database.");
        }

        // --- OPTIMIZATION ---
        // Build the Sleeper array ONCE outside the loop.
        const sleeperArray = Object.entries(sleeperMap)
            .filter(([_, sp]) => sp.first_name && sp.last_name)
            .map(([sId, sp]) => ({
                id: sId,
                fullName: `${sp.first_name} ${sp.last_name}`,
                lowerName: `${sp.first_name} ${sp.last_name}`.toLowerCase(),
                pos: (sp.position || "").toUpperCase(),
                // Every position Sleeper scores the player at: a two-way player such as Travis
                // Hunter is position "DB" with fantasy_positions ["DB", "WR"], and rankings list
                // him as a WR. Refactor 7A; before that he never matched a Sleeper ID.
                fantasyPos: (Array.isArray(sp.fantasy_positions) ? sp.fantasy_positions : []).map(p => String(p).toUpperCase()),
                team: sp.team ? sp.team.toUpperCase() : ""
            }));

        data.forEach((row, index) => {
            let keys = Object.keys(row);
            let getVal = possibleNames => {
                let key = keys.find(k => possibleNames.includes(k.toLowerCase().trim().replace(/['"]/g, '')));
                return key ? row[key] : "";
            };

            let name = getVal(['player', 'name', 'player name']);
            if (!name) return;

            let cleanName = String(name).trim();
            let team = getVal(['team', 'tm', 'franchise']);
            let bye = getVal(['bye', 'bye week']);

            let nameMatch = cleanName.match(/(.+)\s+\(([A-Z]{2,3})\)/i);
            if (nameMatch) {
                cleanName = nameMatch[1].trim();
                if (!team) team = nameMatch[2].toUpperCase();
            }

            let posRaw = getVal(['position', 'pos', 'pos rank', 'posn']);
            let posGroup = posRaw ? String(posRaw).replace(/[0-9]/g, '').toUpperCase().trim() : "FLEX";
            if (['DST', 'D/ST', 'DEFENSE', 'D'].includes(posGroup)) posGroup = 'DEF';
            if (['PK'].includes(posGroup)) posGroup = 'K';

            let posDisplay = posRaw ? String(posRaw).toUpperCase().trim() : posGroup;
            posDisplay = posDisplay.replace(/^(DST|D\/ST|DEFENSE|PK)/i, posGroup);

            if (!posCounters[posGroup]) posCounters[posGroup] = 1;
            if (!/\d/.test(posDisplay)) posDisplay = posGroup + posCounters[posGroup];
            posCounters[posGroup]++;

            let tier = getVal(['tier', '#', 'tier #']) || "-";
            let adp = getVal(['adp', 'auction', 'value', 'auction value', 'rank/auction value']) || "-";

            let bestMatchId = null;
            let fallbackId = null;
            
            // Iterate over the pre-built array instead of running Object.entries() 
            for (let i = 0; i < sleeperArray.length; i++) {
                let sp = sleeperArray[i];
                let isName = isNameMatch(cleanName, sp.fullName);
                let isPos = posGroup === "FLEX" || sp.pos === posGroup || sp.fantasyPos.includes(posGroup);
                
                if (isName && isPos) {
                    fallbackId = sp.id;
                    if (team && team !== "FA" && sp.team === team) {
                        bestMatchId = sp.id;
                        break;
                    } else if (sp.team) {
                        bestMatchId = sp.id;
                    }
                }
            }
            
            let masterId = bestMatchId || fallbackId || null;
            let finalIsRookie = false;
            let finalInjury = null;
            
            // Dictionary to map full words to abbreviations
            const injMap = { "Questionable": "Q", "Doubtful": "D", "Out": "O", "Suspended": "SUSP" };

            if (masterId && sleeperMap[masterId]) {
                let sp = sleeperMap[masterId];
                if (!team || team === "FA") team = sp.team || "FA";
                
                // Grab Rookie & Injury info directly from Sleeper
                finalIsRookie = (sp.years_exp === 0 || sp.years_exp === null);
                
                let rawInj = sp.injury_status;
                // If it exists in our map, abbreviate it. Otherwise, return what Sleeper gave us (like "IR" or "PUP").
                finalInjury = rawInj ? (injMap[rawInj] || rawInj) : null; 
            }

            if (team && team !== "FA" && (!bye || bye === "-" || String(bye).trim() === "")) {
                bye = getByeWeek(team.toUpperCase(), new Date().getFullYear()) || "-";
            }

            newPlayers.push({ 
                id: index + 1, sleeperId: masterId || `custom_${index}`, rank: index + 1, name: cleanName, 
                posGroup: posGroup, posDisplay: posDisplay, tier: tier, 
                team: (team ? String(team).toUpperCase() : "FA"), bye: (bye || "-"), adp: adp,
                isRookie: finalIsRookie, // UPDATED
                injury: finalInjury      // NEW
            });
        });

        if (newPlayers.length > 0) {
            const isAggregate = !source.replace && document.getElementById('aggregateToggle')?.checked;
            
            if (isAggregate && State.players.length > 0) {
                let combinedMap = new Map();
                let maxRankA = State.players.length;
                let maxRankB = newPlayers.length;
                let penaltyRank = maxRankA + maxRankB; // Safe fallback for a player missing from one of the lists

                // 1. Add existing players to the map
                State.players.forEach(p => {
                    let key = p.sleeperId && !p.sleeperId.toString().startsWith('custom_') ? p.sleeperId : p.name.toLowerCase();
                    combinedMap.set(key, { player: p, rankA: p.rank, rankB: penaltyRank });
                });

                // 2. Merge incoming players
                newPlayers.forEach(p => {
                    let key = p.sleeperId && !p.sleeperId.toString().startsWith('custom_') ? p.sleeperId : p.name.toLowerCase();
                    if (combinedMap.has(key)) {
                        let existing = combinedMap.get(key);
                        existing.rankB = p.rank; // Player exists in both, update rank B
                    } else {
                        combinedMap.set(key, { player: p, rankA: penaltyRank, rankB: p.rank }); // New player entirely
                    }
                });

                // 3. Calculate Weighted Average and sort
                let mergedPlayers = Array.from(combinedMap.values());
                let sliderValue = document.getElementById('weightSlider') ? parseInt(document.getElementById('weightSlider').value) : 50;
                
                // Convert to decimals (e.g., 70 on slider = 0.7 weight for New, 0.3 for Old)
                let weightNew = sliderValue / 100;
                let weightOld = 1 - weightNew;

                mergedPlayers.forEach(entry => {
                    entry.avgRank = (entry.rankA * weightOld) + (entry.rankB * weightNew);
                });
                
                // Sort by the new averaged rank
                mergedPlayers.sort((a, b) => a.avgRank - b.avgRank);

                // 4. Assign clean, sequential integer ranks to the newly sorted master list
                State.players = mergedPlayers.map((entry, index) => {
                    let p = entry.player;
                    p.rank = index + 1;
                    p.id = index + 1;
                    return p;
                });
            } else {
                // Normal overwrite behavior if toggle is off
                State.players = newPlayers;
            }

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            State.rankingsMeta = { count: State.players.length, date: dateString };

            localStorage.setItem(KEYS.mds.meta, JSON.stringify(State.rankingsMeta));
            savePlayerPool();
            updateMetaDisplay();
            saveAndRenderDraftState();

            if (btn) flashButton(btn, source.successLabel || "Loaded Successfully", false, originalBtnText);
            if (source.successToast) {
                showToast(source.successToast.text.replace('{count}', State.players.length), source.successToast.opts);
            } else {
                // Loaded, but an unclosed quote swallowed rows (see findCsvQuoteProblem in
                // js/shared/rankings/diagnostics.js). Shown as an error: the list is missing players the user expects.
                if (source.quoteProblem) {
                    const q = { fileName: source.fileName || null, reason: 'unclosed-quote', row: source.quoteProblem.row, rowsLost: source.quoteProblem.rowsLost, headersFound: [], missing: [] };
                    showToast(`Loaded ${State.players.length} players, but some are missing.\n${formatRankingsDiagnostic(q)}`, { isError: true, duration: 12000 });
                } else {
                    showToast(`Loaded ${State.players.length} players`);
                }
            }
            return true;
        } else {
            // The name column exists (checked above), so every row's name cell was blank.
            return fail('no-names-in-column');
        }
    }
