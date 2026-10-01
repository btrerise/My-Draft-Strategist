// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js, which assigns its exports to the same window.* names utils.js set.
// Comments below that say "this file" or "utils.js" were written when this was one file.

// --- RANKINGS UPLOAD DIAGNOSTICS ---
// Turns one per-file diagnostic into the message the user sees. Diagnostics come from
// rankingsParser.js's parseRankingsFiles (MLS) and from mds.js's processData (MDS), both
// shaped { fileName, reason, headersFound, missing, sheetName? } -- see parseRankingsFiles for
// what each reason means. Kept here so both apps describe the same problem in the same words.
//
// Returns plain text, not HTML. The file name and headers come straight from the user's file,
// so callers must render it as text: showToast (above) does, and the MLS preview box sets
// textContent.
export const formatRankingsDiagnostic = function(diag) {
  const MAX_HEADERS_SHOWN = 8;
  const headers = diag.headersFound || [];
  const foundList = headers.slice(0, MAX_HEADERS_SHOWN).map(String).join(', ') +
    (headers.length > MAX_HEADERS_SHOWN ? `, +${headers.length - MAX_HEADERS_SHOWN} more` : '');
  // No fileName means the rankings were pasted rather than uploaded (MDS's paste box).
  const file = diag.fileName ? `"${diag.fileName}"` : 'your pasted rankings';
  const where = diag.sheetName ? `the "${diag.sheetName}" tab of ${file}` : file;

  switch (diag.reason) {
    case 'no-name-column':
      // The side-by-side, one-section-per-position layout looks for different column names.
      if ((diag.missing || []).includes('qb player')) {
        return `No player-name columns in ${where}. Found: ${foundList}. For a sheet with positions side by side, head each name column like 'QB Player', 'RB Player' or 'FLEX Player'.`;
      }
      return `No player-name column in ${where}. Found: ${foundList}. Rename one column to 'Player' or 'Name'.`;
    case 'no-names-in-column':
      return `The player-name column in ${where} is blank on every row. Check that the names are in that column and not the one next to it.`;
    case 'no-rows':
      return `${where.charAt(0).toUpperCase() + where.slice(1)} has a header row${foundList ? ` (${foundList})` : ''} but no players under it.`;
    case 'empty-file':
      return `${where.charAt(0).toUpperCase() + where.slice(1)} is empty.`;
    case 'unreadable':
      return `Couldn't read ${where}.`;
    case 'unclosed-quote': {
      const lost = diag.rowsLost || 0;
      return lost > 0
        ? `Row ${diag.row} of ${where} opens a quote (") that never closes, so the ${lost} row${lost === 1 ? '' : 's'} after it ${lost === 1 ? 'was' : 'were'} swallowed into one cell and ${lost === 1 ? 'is' : 'are'} missing. Add the closing quote and upload again.`
        : `Row ${diag.row} of ${where} opens a quote (") that never closes, so that row may be garbled. Add the closing quote and upload again.`;
    }
    case 'tab-without-header':
      // Always a single tab, so `where` already reads 'the "Notes" tab of "x.xlsx"'.
      return `Skipped ${where}: it has no header row, and the file's other tabs do, so it was treated as notes. If it holds rankings, add a header row with a 'Player' or 'Name' column.`;
    default:
      return `Couldn't find any players in ${where}.`;
  }
};

// --- CSV QUOTE DAMAGE ---
// Papa's results.errors is NOT a list of skipped rows. Papa never skips a row, and most of
// what it reports is harmless: every single-column file gets an "UndetectableDelimiter"
// notice, and rows with too many or too few fields are still returned. The one entry that
// means data was lost is a quote error. An opening quote that never closes makes Papa read
// the rest of the file as a single cell, so every row after it disappears into that cell
// (e.g. a player named "Josh Allen,BUF\n2,Lamar Jackson,BAL").
//
// Returns null, or { row, rowsLost }: `row` is the 1-based line of the damaged row, counting
// the lines Papa kept (blank lines are skipped, so it can be off in a file with blank lines).
// `rowsLost` is how many rows ended up inside the swallowed cell. lineOffset converts Papa's
// row index to a line number: 1 for header: false, 2 (+ any title lines dropped) for
// header: true, where Papa's index doesn't count the header line.
export const findCsvQuoteProblem = function(results, lineOffset = 1) {
  const err = (results.errors || []).find(e => e.type === 'Quotes' && typeof e.row === 'number');
  if (!err) return null;
  const row = results.data[err.row];
  const cells = row == null ? [] : (Array.isArray(row) ? row : Object.values(row)).flat();
  const swallowed = cells.map(c => String(c ?? '')).find(c => /[\r\n]/.test(c)) || '';
  const rowsLost = swallowed.split(/\r\n|\n|\r/).slice(1).filter(l => l.trim()).length;
  return { row: err.row + lineOffset, rowsLost };
};
