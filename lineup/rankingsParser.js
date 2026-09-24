// --- RANKINGS FILE PARSER (ES MODULE) ---
// Pilot module: this is the first piece pulled out of mls.js's single IIFE into a real
// ES module, as a test of the pattern before splitting anything else out. It owns turning
// uploaded CSV/XLSX files into a combined { name, cleanName, rank, posRank, flexRank }
// player map -- nothing about the DOM, the preview modal, or app State lives here.
//
// Deliberately self-contained: instead of importing loadSheetJS/State/etc. from mls.js
// (which would recreate the same tight coupling this split is meant to reduce, and risks a
// circular import since mls.js needs to import THIS module too), the caller injects
// loadSheetJS as a parameter, and this module returns plain data (including any
// Strength-of-Schedule values it found) for the caller to merge into its own State --
// it never reaches into anyone else's global state directly.
//
// NFL_TEAMS is duplicated here rather than imported from mls.js: it's a static, essentially
// never-changing list of 32 abbreviations, so a second copy is a non-issue, and it keeps this
// module usable/testable without mls.js's IIFE ever having to export anything just for this.
const NFL_TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];
const TEAM_ALIASES = { "JAC": "JAX", "WSH": "WAS" };

// Headers the vertical parser accepts as the player-name column (matched lowercase).
// Position names count too, for files laid out as one list per position.
const VALID_NAME_HEADERS = ['player', 'name', 'player name', 'quarterback', 'running back', 'wide receiver', 'tight end', 'kicker', 'defense', 'flex'];

// Name columns the horizontal (by-position, side-by-side) layout looks for. Used only to
// tell the user what was expected when a file of that shape yields no players.
const HORIZONTAL_NAME_HEADERS = ['qb player', 'rb player', 'wr player', 'te player', 'k player', 'def team', 'flex player'];

// Common non-name column headers. They exist only to tell two cases apart when no name column
// matches: "row 0 is a header row that's missing its name column" and "this file has no header
// row at all". The headerless fallback reads row 0 as a player, so before this check a file
// headed Rank,Tm,Bye,Proj went to the preview as players named "Rank", "1", "2"... No player is
// named any of these, so if row 0 contains one, row 0 is a header row.
const KNOWN_NON_NAME_HEADERS = new Set([
    'rank', 'rk', 'overall', 'ovr', '#', 'ecr', 'tier',
    'team', 'tm', 'pos', 'position', 'pos rank', 'position rank', 'positional rank',
    'bye', 'bye week', 'sos', 'schedule', 'matchup', 'ros', 'opp', 'opponent',
    'proj', 'projection', 'projected', 'proj pts', 'fpts', 'pts', 'points',
    'adp', 'value', 'avg', 'std', 'std dev', 'best', 'worst', 'age', 'exp', 'notes'
]);

// normalizeName and showToast live in utils.js, a plain (non-module) script loaded before
// this one -- their top-level `function` declarations attach to `window`, so they're reached
// here explicitly via `window.` rather than assumed to be bare globals, since that's the only
// form of cross-script access a module can rely on.
function normalizeName(name) {
    return window.normalizeName(name);
}

// Optional tier cell -> number, accepting "2", "Tier 2", "T2" (anything with a digit in it).
// null (not 999) when absent or unparseable: unlike rank there's no "unranked" sentinel to keep
// consistent, and a missing tier just means nothing gets displayed.
function parseTier(cell) {
    if (cell === undefined || cell === null) return null;
    const m = String(cell).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}

// Combined horizontal sheet (old format or the newer 'wk1' format): positions side by side,
// each with its own rank/name columns. Only applies to single-file uploads.
function isHorizontalLayout(headers, context) {
    return (context === 'SINGLE') && headers.some(h =>
        h.includes('quarterback') ||
        h.includes('running back') ||
        h === 'flex' ||
        h.includes('qb player') ||
        h.includes('rb player') ||
        h.includes('flex player')
    );
}

// What row 0 of a sheet is, using the same tests parseRowsIntoCombined applies:
//   'empty'      nothing in the sheet
//   'header'     a header row: has a name column, or recognizable non-name columns
//   'headerless' no header row, so every row is read as data (a plain list of names)
// The xlsx path uses this to decide which tabs to skip; see there.
function classifyFirstRow(rows, context) {
    if (!rows || rows.length < 1) return 'empty';
    return looksLikeHeaderRow(rows[0], context) ? 'header' : 'headerless';
}

function looksLikeHeaderRow(row, context) {
    const headers = row.map(h => String(h).trim().toLowerCase());
    if (isHorizontalLayout(headers, context)) return true;
    return headers.some(h => VALID_NAME_HEADERS.includes(h) || KNOWN_NON_NAME_HEADERS.has(h));
}

// How far down to look for a header row below title lines ("Week 3 Rankings", "Updated 9/22",
// a source credit...). Generous on purpose: a false match needs a cell that is exactly a header
// word like "Player" or "Rank", which a list of names doesn't have. The cap just keeps the
// scan short.
const MAX_TITLE_ROWS = 10;

// Drops title lines above the real header row. Without this, a file starting
// "Week 3 Rankings" / "Rank,Player,Team" had no header in row 0, fell into the headerless
// path, and came through as players named "Week 3 Rankings", "Rank", "1"...
// Only applies when row 0 isn't a header row itself and one of the next few rows is. A
// headerless list of names never contains a cell like "Player" or "Rank", so it's left alone.
// Expects rows parsed with skipEmptyLines, so blank lines between title and header don't count.
function dropTitleRows(rows, context) {
    if (!rows || rows.length < 2 || looksLikeHeaderRow(rows[0], context)) return rows;
    const limit = Math.min(MAX_TITLE_ROWS, rows.length - 1);
    for (let i = 1; i <= limit; i++) {
        if (looksLikeHeaderRow(rows[i], context)) return rows.slice(i);
    }
    return rows;
}

/**
 * Parses one uploaded file (CSV or XLSX) and merges any player rank/SoS data it contains
 * into the shared accumulators. Resolves once parsing finishes -- it never rejects, since a
 * per-file failure should not stop the rest of a multi-file batch (see the try/catch and
 * reader.onerror below).
 *
 * Resolves with an array of diagnostics (see parseRankingsFiles for the shape): empty when the
 * file parsed cleanly, a file-level entry when it contributed no players, an entry per
 * skipped workbook tab, and one for an unclosed quote. Read/load failures
 * still toast here, where the error is caught, and come back as reason 'unreadable' so the
 * caller knows they've already been reported.
 *
 * @param {{file: File, context: string}} fileObj - context is 'SINGLE', 'QB', 'FLEX', etc.
 * @param {Function} loadSheetJS - injected so this module never needs to import mls.js's
 *   private SheetJS-loader; same (callback, onError) signature as the original.
 * @param {Object} combinedPlayers - accumulator, mutated in place across all files in a batch.
 * @param {Object} sosUpdates - accumulator of { TEAM: { POS: sosValue } }, mutated in place.
 * @param {{value: boolean}} hasNewSosRef - boxed boolean so this function can report "found new
 *   SoS data" back alongside the diagnostic it resolves with.
 */
function parseSingleFile(fileObj, loadSheetJS, combinedPlayers, sosUpdates, hasNewSosRef) {
    return new Promise((resolve) => {
        const file = fileObj.file;
        const parseContext = fileObj.context;

        // Returns { added, reason, headersFound, missing }: `added` is how many rows produced a
        // player; when it's 0, `reason` says why, for the diagnostic built in parseSingleFile.
        function parseRowsIntoCombined(rows, context) {
            if (!rows || rows.length < 1) return { added: 0, reason: 'empty-file', headersFound: [], missing: [] };

            let headers = rows[0].map(h => String(h).trim().toLowerCase());
            // Original casing, for showing back to the user ("Found: Rank, Tm, Bye, Proj").
            const headersFound = rows[0].map(h => String(h).trim()).filter(Boolean);
            let added = 0;

            let isHorizontal = isHorizontalLayout(headers, context);

            if (isHorizontal) {
                let nameColsFound = 0;
                headers.forEach((h, idx) => {
                    // Name columns end in 'player', or are exactly 'def team' for defense
                    if (h.includes('player') || h === 'def team') {
                        let rankColIdx = idx - 1;
                        let isFlexCol = h.includes('flex');
                        let posMatch = h.match(/(qb|rb|wr|te|k)\s+player/);
                        let isDefCol = (h === 'def team');
                        let isPosCol = (posMatch !== null) || isDefCol;

                        if ((isFlexCol || isPosCol) && rankColIdx >= 0) {
                            nameColsFound++;
                            for (let r = 1; r < rows.length; r++) {
                                let pName = rows[r][idx];
                                let pRank = rows[r][rankColIdx];

                                if (pName && pName.trim() && pRank && !isNaN(parseInt(pRank))) {
                                    added++;
                                    let clean = normalizeName(pName.trim());
                                    if (!combinedPlayers[clean]) {
                                        combinedPlayers[clean] = { name: pName.trim(), cleanName: clean, posRank: 999, flexRank: 999, rank: 999 };
                                    }
                                    let rVal = parseInt(pRank);
                                    // Tier lives in a sibling column named for the same section
                                    // ("QB Tier", "DEF Tier", "FLEX Tier"), found by header name
                                    // rather than offset since the columns between a section's
                                    // player and tier vary (Team/Opponent/Total/Matchup/...).
                                    // Sections without one (K, and FLEX in current exports) get null.
                                    let sectionKey = isFlexCol ? 'flex' : (isDefCol ? 'def' : posMatch[1]);
                                    let tierIdx = headers.indexOf(sectionKey + ' tier');
                                    let tVal = tierIdx !== -1 ? parseTier(rows[r][tierIdx]) : null;
                                    // Same lockstep rule as the vertical parser below: a tier field is
                                    // overwritten whenever its rank counterpart is, even with null, so a
                                    // stale tier never sits beside a rank from a different section.
                                    let p = combinedPlayers[clean];
                                    if (isFlexCol) {
                                        p.flexRank = rVal;
                                        p.flexTier = tVal;
                                        p.rank = rVal;
                                        p.tier = tVal;
                                    } else {
                                        p.posRank = rVal;
                                        p.posTier = tVal;
                                        if (p.rank === 999) {
                                            p.rank = rVal;
                                            p.tier = tVal;
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                if (added > 0) return { added };
                if (nameColsFound === 0) return { added: 0, reason: 'no-name-column', headersFound, missing: HORIZONTAL_NAME_HEADERS };
                return { added: 0, reason: rows.length < 2 ? 'no-rows' : 'no-names-in-column', headersFound, missing: [] };
            } else {
                // Vertical Parsing Engine
                // 'ros' included alongside the more obvious 'sos'/'schedule'/'matchup' names --
                // several ranking exports label this column "ROS" (rest-of-season) even though
                // it's the same team+position schedule-strength value, not an overall rank (the
                // overall rank column is caught separately below via 'rank'/'overall').
                let sosColIdx = headers.findIndex(h => h === 'sos' || h === 'schedule' || h === 'matchup' || h === 'ros');
                let teamColIdx = headers.findIndex(h => h === 'team' || h === 'tm');
                let posColIdx = headers.findIndex(h => h === 'pos' || h === 'position');
                let explicitPosRankColIdx = headers.findIndex(h => h === 'pos rank' || h === 'position rank' || h === 'positional rank');

                let hasHeaders = headers.some(h => VALID_NAME_HEADERS.includes(h));

                // A header row without a recognizable name column. Stop here rather than
                // falling through to the headerless path, which would read the header cells
                // and whatever column comes first as player names.
                if (!hasHeaders && headers.some(h => KNOWN_NON_NAME_HEADERS.has(h))) {
                    return { added: 0, reason: 'no-name-column', headersFound, missing: VALID_NAME_HEADERS };
                }
                // 'tier' used to be accepted here as a rank column, which meant a file with both
                // a Rank and a Tier column could have the Tier values read as ranks (whichever
                // column came first won). Tier is now its own optional field (tierColIdx below);
                // a file with only a Tier column falls back to row order for rank, same as a file
                // with no rank column at all.
                let rankColIdx = hasHeaders ? headers.findIndex(h => h === 'rank' || h === 'overall') : (!isNaN(parseInt(rows[0][0])) ? 0 : -1);
                let tierColIdx = hasHeaders ? headers.findIndex(h => h === 'tier') : -1;
                let nameColIdx = hasHeaders ? headers.findIndex(h => VALID_NAME_HEADERS.includes(h)) : (!isNaN(parseInt(rows[0][0])) ? 1 : 0);

                let startIndex = hasHeaders ? 1 : 0;

                for (let i = startIndex; i < rows.length; i++) {
                    let nameStr = rows[i][nameColIdx];
                    if (nameStr && nameStr.trim()) {
                        added++;
                        let clean = normalizeName(nameStr.trim());

                        let overallRankVal = (rankColIdx !== -1 && rows[i][rankColIdx]) ? parseInt(rows[i][rankColIdx]) : (i + 1 - startIndex);
                        if (isNaN(overallRankVal)) overallRankVal = i + 1 - startIndex;

                        let extractedPosRank = 999;
                        if (explicitPosRankColIdx !== -1 && rows[i][explicitPosRankColIdx]) {
                            extractedPosRank = parseInt(rows[i][explicitPosRankColIdx]);
                            if (isNaN(extractedPosRank)) extractedPosRank = 999;
                        }

                        if (!combinedPlayers[clean]) {
                            combinedPlayers[clean] = { name: nameStr.trim(), cleanName: clean, rank: 999, posRank: 999, flexRank: 999 };
                        }

                        let tierVal = tierColIdx !== -1 ? parseTier(rows[i][tierColIdx]) : null;

                        // Determine where ranks go based on user UI selection. Each tier field
                        // (tier / posTier / flexTier) is written in exactly the same branches as
                        // its rank counterpart (rank / posRank / flexRank), so a tier always
                        // describes the same list its rank came from -- a WR's tier in the WR file
                        // is not the same thing as their tier in a FLEX file. It's overwritten
                        // even when null, so a stale tier never sits beside a replaced rank.
                        let p = combinedPlayers[clean];
                        if (context === 'FLEX') {
                            p.flexRank = overallRankVal;
                            p.flexTier = tierVal;
                            p.rank = overallRankVal;
                            p.tier = tierVal;
                        } else if (context !== 'SINGLE') {
                            // Specific position like QB, RB
                            p.posRank = overallRankVal;
                            p.posTier = tierVal;
                            if (p.rank === 999) {
                                p.rank = overallRankVal;
                                p.tier = tierVal;
                            }
                        } else {
                            // Single File: the Tier column describes the overall list. An explicit
                            // Pos Rank column has no matching tier, so posTier is null in that case.
                            p.rank = overallRankVal;
                            p.tier = tierVal;
                            if (extractedPosRank !== 999) {
                                p.posRank = extractedPosRank;
                                p.posTier = null;
                            } else if (p.posRank === 999) {
                                p.posRank = overallRankVal; // Fallback
                                p.posTier = tierVal;
                            }
                            p.flexRank = overallRankVal;
                            p.flexTier = tierVal;
                        }

                        // SoS Extraction
                        if (sosColIdx !== -1 && teamColIdx !== -1 && posColIdx !== -1) {
                            let teamStr = rows[i][teamColIdx] ? rows[i][teamColIdx].toString().trim().toUpperCase() : "";                            
                            teamStr = TEAM_ALIASES[teamStr] || teamStr; 
                            
                            let posStr = rows[i][posColIdx] ? rows[i][posColIdx].toString().trim().toUpperCase() : "";
                            let sosVal = rows[i][sosColIdx] ? rows[i][sosColIdx].toString().replace(/[^0-9]/g, '') : "";

                            if (teamStr && posStr && sosVal && NFL_TEAMS.includes(teamStr)) {
                                let posGroup = posStr.includes('QB') ? 'QB' : posStr.includes('RB') ? 'RB' : posStr.includes('WR') ? 'WR' : posStr.includes('TE') ? 'TE' : null;
                                if (posGroup) {
                                    if (!sosUpdates[teamStr]) sosUpdates[teamStr] = {};
                                    sosUpdates[teamStr][posGroup] = sosVal;
                                    hasNewSosRef.value = true;
                                }
                            }
                        }
                    }
                }
                if (added > 0) return { added };
                // A header-only file has nothing below its header row. For a headerless file,
                // every row was read as data, so zero names means the name column was blank.
                if (hasHeaders && rows.length < 2) return { added: 0, reason: 'no-rows', headersFound, missing: [] };
                return { added: 0, reason: 'no-names-in-column', headersFound, missing: [] };
            }
        }

        // Builds this file's diagnostics from its per-sheet results. A note goes in for every tab
        // skipped for having no header row, whether or not the file worked otherwise: if one
        // held real rankings, the user needs to know it wasn't read. If no sheet produced a player,
        // a file-level entry comes first, describing the first sheet that was actually parsed
        // and had something in it. A blank extra tab shouldn't hide the real problem on another tab.
        function diagnosticsFor(results) {
            const diags = [];
            const base = { fileName: file.name, context: parseContext };
            if (!results.some(r => r.added > 0)) {
                const parsed = results.filter(x => !x.skipped);
                const r = parsed.find(x => x.reason !== 'empty-file') || parsed[0] || { reason: 'empty-file', headersFound: [], missing: [] };
                const diag = { ...base, reason: r.reason, headersFound: r.headersFound, missing: r.missing };
                if (results.length > 1 && r.sheetName) diag.sheetName = r.sheetName;
                diags.push(diag);
            }
            results.filter(r => r.skipped).forEach(r => {
                diags.push({ ...base, reason: 'tab-without-header', headersFound: r.headersFound, missing: [], sheetName: r.sheetName });
            });
            return diags;
        }
        const unreadable = () => [{ fileName: file.name, context: parseContext, reason: 'unreadable', headersFound: [], missing: [] }];

        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            loadSheetJS(() => {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        // Every tab is read into rows before any are parsed, because whether a
                        // tab counts as data depends on the other tabs (below). Papa.parse on a
                        // string is synchronous, so each sheet's rows are in hand right away.
                        const sheets = workbook.SheetNames.map(sheetName => {
                            let rows = [];
                            Papa.parse(XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]), {
                                header: false,
                                skipEmptyLines: true,
                                complete: results => { rows = dropTitleRows(results.data, parseContext); }
                            });
                            return { sheetName, rows, kind: classifyFirstRow(rows, parseContext) };
                        });

                        // A tab with no header row is normally read as a plain list of names.
                        // That's right for a workbook made only of such lists. But when any other
                        // tab has a header row, the workbook is laid out as a table, and a tab
                        // without one is almost always notes ("Updated Tuesday",
                        // "Injuries not reflected"). Before this, each note line became a player.
                        // Those tabs are skipped and reported by name, so a real list that was
                        // just missing its header row doesn't vanish without a trace.
                        const workbookHasHeaders = sheets.some(s => s.kind === 'header');
                        const sheetResults = sheets.map(({ sheetName, rows, kind }) => {
                            if (workbookHasHeaders && kind === 'headerless') {
                                return { added: 0, skipped: true, sheetName, headersFound: rows[0].map(c => String(c).trim()).filter(Boolean) };
                            }
                            return { ...parseRowsIntoCombined(rows, parseContext), sheetName };
                        });
                        resolve(diagnosticsFor(sheetResults));
                    } catch (err) {
                        console.error("Error reading Excel file:", err);
                        if (typeof window.showToast === 'function') {
                            window.showToast(`Couldn't read "${file.name}"; it may be corrupted or in an unsupported format. Try re-saving it as .xlsx or .csv and uploading again.`, { isError: true });
                        }
                        resolve(unreadable());
                    }
                };
                reader.onerror = () => {
                    console.error("Error reading file:", file.name);
                    if (typeof window.showToast === 'function') {
                        window.showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                    }
                    resolve(unreadable());
                };
                reader.readAsArrayBuffer(file);
            }, () => {
                // SheetJS itself failed to load -- see window.loadSheetJS in js/utils.js.
                console.error("Failed to load SheetJS library");
                if (typeof window.showToast === 'function') {
                    window.showToast(`Couldn't load the Excel file reader, so "${file.name}" wasn't processed. Check your connection and try again, or save the file as .csv instead.`, { isError: true });
                }
                resolve(unreadable());
            });
        } else {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                complete: results => {
                    // try/catch for the same reason as `error` below: a throw in here would
                    // leave the promise pending and the upload stuck on its spinner.
                    try {
                        const diags = diagnosticsFor([parseRowsIntoCombined(dropTitleRows(results.data, parseContext), parseContext)]);
                        // Quote damage is the one results.errors entry that means rows were
                        // lost (see findCsvQuoteProblem in js/utils.js). The XLSX branch doesn't
                        // check: SheetJS writes its CSV with valid quoting.
                        const quote = typeof window.findCsvQuoteProblem === 'function' ? window.findCsvQuoteProblem(results, 1) : null;
                        if (quote) diags.push({ fileName: file.name, context: parseContext, reason: 'unclosed-quote', row: quote.row, rowsLost: quote.rowsLost, headersFound: [], missing: [] });
                        resolve(diags);
                    } catch (err) {
                        console.error("Error parsing file:", file.name, err);
                        if (typeof window.showToast === 'function') {
                            window.showToast(`Couldn't process "${file.name}". Check that it's a rankings file and try again.`, { isError: true });
                        }
                        resolve(unreadable());
                    }
                },
                // Papa calls this instead of `complete` when it can't read the File (e.g. it
                // was moved or deleted after being picked). Without it the promise never
                // settled and the upload stalled on its progress indicator.
                error: err => {
                    console.error("Error reading file:", file.name, err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                    }
                    resolve(unreadable());
                }
            });
        }
    });
}

/**
 * Parses a batch of rankings files (single upload or multi-position upload) and returns the
 * combined result. This is the module's only export -- everything above is a private
 * implementation detail.
 *
 * @param {Array<{file: File, context: string}>} filesWithContext
 * @param {Object} options
 * @param {Function} options.loadSheetJS - (onSuccess, onError) => void; loads the SheetJS lib.
 * @param {Function} [options.onProgress] - (completedCount, totalCount) => void.
 * @returns {Promise<{parsedData: Array, hasNewSos: boolean, sosUpdates: Object, diagnostics: Array}>}
 *
 * `diagnostics` lists, in upload order, one entry per file that contributed NO players, plus
 * one per workbook tab that was skipped and one per CSV damaged by an unclosed quote (these
 * two can come from a file that otherwise worked).
 * Files that parsed cleanly aren't listed.
 *   { fileName, context, reason, headersFound, missing, sheetName? }
 *   - reason: 'no-name-column'     header row present, but none of `missing` is in it
 *             'no-names-in-column' name column found, but every row's name cell is blank
 *             'no-rows'            header row only, nothing below it
 *             'empty-file'         nothing in the file at all
 *             'unreadable'         couldn't be read/loaded; already toasted here
 *             'tab-without-header' workbook tab with no header row, skipped because another
 *                                  tab has one (usually a notes tab); always has sheetName
 *             'unclosed-quote'     CSV row opens a quote that never closes; the file's
 *                                  players were still read, but `rowsLost` rows after line
 *                                  `row` were swallowed into one cell (both extra fields)
 *   - headersFound: the header row as written (original casing, blanks dropped); for a
 *     skipped tab, its first row
 *   - missing: the lowercase name headers that were looked for (only for 'no-name-column')
 *   - sheetName: set for multi-sheet workbooks, naming the tab the diagnostic describes
 * window.formatRankingsDiagnostic (js/utils.js) turns one into the user-facing message.
 */
export async function parseRankingsFiles(filesWithContext, { loadSheetJS, onProgress } = {}) {
    let combinedPlayers = {};
    let sosUpdates = {};
    let hasNewSosRef = { value: false };

    const total = filesWithContext.length;
    let completed = 0;
    if (typeof onProgress === 'function') onProgress(completed, total);

    const perFile = await Promise.all(filesWithContext.map(f =>
        parseSingleFile(f, loadSheetJS, combinedPlayers, sosUpdates, hasNewSosRef).then(diags => {
            completed++;
            if (typeof onProgress === 'function') onProgress(completed, total);
            return diags;
        })
    ));

    return {
        parsedData: Object.values(combinedPlayers),
        hasNewSos: hasNewSosRef.value,
        sosUpdates,
        diagnostics: perFile.flat()
    };
}