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

/**
 * Parses one uploaded file (CSV or XLSX) and merges any player rank/SoS data it contains
 * into the shared accumulators. Resolves once parsing finishes -- it never rejects, since a
 * per-file failure should not stop the rest of a multi-file batch (see the try/catch and
 * reader.onerror below); it reports failures via window.showToast and resolves anyway.
 *
 * @param {{file: File, context: string}} fileObj - context is 'SINGLE', 'QB', 'FLEX', etc.
 * @param {Function} loadSheetJS - injected so this module never needs to import mls.js's
 *   private SheetJS-loader; same (callback, onError) signature as the original.
 * @param {Object} combinedPlayers - accumulator, mutated in place across all files in a batch.
 * @param {Object} sosUpdates - accumulator of { TEAM: { POS: sosValue } }, mutated in place.
 * @param {{value: boolean}} hasNewSosRef - boxed boolean so this function can report "found new
 *   SoS data" back without needing a return value (parseSingleFile's contract is just "done").
 */
function parseSingleFile(fileObj, loadSheetJS, combinedPlayers, sosUpdates, hasNewSosRef) {
    return new Promise((resolve) => {
        const file = fileObj.file;
        const parseContext = fileObj.context;

        function parseRowsIntoCombined(rows, context) {
            if (!rows || rows.length < 1) return;

            let headers = rows[0].map(h => String(h).trim().toLowerCase());

            // Check if this is a combined horizontal sheet (either old format or new 'wk1' format)
            let isHorizontal = (context === 'SINGLE') && headers.some(h =>
                h.includes('quarterback') ||
                h.includes('running back') ||
                h === 'flex' ||
                h.includes('qb player') ||
                h.includes('rb player') ||
                h.includes('flex player')
            );

            if (isHorizontal) {
                headers.forEach((h, idx) => {
                    // Name columns end in 'player', or are exactly 'def team' for defense
                    if (h.includes('player') || h === 'def team') {
                        let rankColIdx = idx - 1;
                        let isFlexCol = h.includes('flex');
                        let posMatch = h.match(/(qb|rb|wr|te|k)\s+player/);
                        let isDefCol = (h === 'def team');
                        let isPosCol = (posMatch !== null) || isDefCol;

                        if ((isFlexCol || isPosCol) && rankColIdx >= 0) {
                            for (let r = 1; r < rows.length; r++) {
                                let pName = rows[r][idx];
                                let pRank = rows[r][rankColIdx];

                                if (pName && pName.trim() && pRank && !isNaN(parseInt(pRank))) {
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

                // Include position names as valid player name headers
                const validNameHeaders = ['player', 'name', 'player name', 'quarterback', 'running back', 'wide receiver', 'tight end', 'kicker', 'defense', 'flex'];
                let hasHeaders = headers.some(h => validNameHeaders.includes(h));
                // 'tier' used to be accepted here as a rank column, which meant a file with both
                // a Rank and a Tier column could have the Tier values read as ranks (whichever
                // column came first won). Tier is now its own optional field (tierColIdx below);
                // a file with only a Tier column falls back to row order for rank, same as a file
                // with no rank column at all.
                let rankColIdx = hasHeaders ? headers.findIndex(h => h === 'rank' || h === 'overall') : (!isNaN(parseInt(rows[0][0])) ? 0 : -1);
                let tierColIdx = hasHeaders ? headers.findIndex(h => h === 'tier') : -1;
                let nameColIdx = hasHeaders ? headers.findIndex(h => validNameHeaders.includes(h)) : (!isNaN(parseInt(rows[0][0])) ? 1 : 0);

                let startIndex = hasHeaders ? 1 : 0;

                for (let i = startIndex; i < rows.length; i++) {
                    let nameStr = rows[i][nameColIdx];
                    if (nameStr && nameStr.trim()) {
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
            }
        }

        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            loadSheetJS(() => {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        workbook.SheetNames.forEach(sheetName => {
                            const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                            Papa.parse(csvStr, {
                                header: false,
                                skipEmptyLines: true,
                                complete: results => parseRowsIntoCombined(results.data, parseContext)
                            });
                        });
                    } catch (err) {
                        console.error("Error reading Excel file:", err);
                        if (typeof window.showToast === 'function') {
                            window.showToast(`Couldn't read "${file.name}" -- it may be corrupted or in an unsupported format. Try re-saving it as .xlsx or .csv and uploading again.`, { isError: true });
                        }
                    }
                    resolve();
                };
                reader.onerror = () => {
                    console.error("Error reading file:", file.name);
                    if (typeof window.showToast === 'function') {
                        window.showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                    }
                    resolve();
                };
                reader.readAsArrayBuffer(file);
            }, () => {
                // SheetJS itself failed to load -- see loadSheetJS's onerror in mls.js.
                console.error("Failed to load SheetJS library");
                if (typeof window.showToast === 'function') {
                    window.showToast(`Couldn't load the Excel file reader, so "${file.name}" wasn't processed. Check your connection and try again, or save the file as .csv instead.`, { isError: true });
                }
                resolve();
            });
        } else {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                complete: results => {
                    parseRowsIntoCombined(results.data, parseContext);
                    resolve();
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
 * @returns {Promise<{parsedData: Array, hasNewSos: boolean, sosUpdates: Object}>}
 */
export async function parseRankingsFiles(filesWithContext, { loadSheetJS, onProgress } = {}) {
    let combinedPlayers = {};
    let sosUpdates = {};
    let hasNewSosRef = { value: false };

    const total = filesWithContext.length;
    let completed = 0;
    if (typeof onProgress === 'function') onProgress(completed, total);

    await Promise.all(filesWithContext.map(f =>
        parseSingleFile(f, loadSheetJS, combinedPlayers, sosUpdates, hasNewSosRef).then(() => {
            completed++;
            if (typeof onProgress === 'function') onProgress(completed, total);
        })
    ));

    return { parsedData: Object.values(combinedPlayers), hasNewSos: hasNewSosRef.value, sosUpdates };
}