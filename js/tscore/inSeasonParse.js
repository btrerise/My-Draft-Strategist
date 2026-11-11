// T-Score page: reading the In-Season sheet's CSVs (improvements T1). Pure: rows in (Papa.parse's arrays of
// cells), players or weights out, no DOM and no storage, so tests/unit/tscoreInSeason.test.mjs loads it in Node.
//
// Columns are found by their header NAME (case, extra spaces and the order of columns don't matter), so a sheet
// whose columns get reordered, or that gains a column, still reads the same. A column the table needs that isn't
// there throws an InSeasonColumnError naming it, which the page shows as a plain message instead of a broken table.
// The sheet ("T-Score In-Season (public)", one tab per position, published to the web as CSV) holds only columns
// built from open data; see docs/improvements/LOG.md, T1, for why.

export const IN_SEASON_POSITIONS = ['wr', 'rb', 'te'];

export class InSeasonColumnError extends Error {
    constructor(what, missing) {
        super(`The ${what} sheet is missing ${missing.length === 1 ? 'a column' : 'columns'} this table needs: ${missing.join(', ')}.`);
        this.missing = missing;
    }
}

const norm = (h) => String(h ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Index of each named header, -1 when absent.
function headerIndex(headerRow) {
    const names = headerRow.map(norm);
    return (name) => names.indexOf(norm(name));
}

const cell = (row, idx) => (idx === -1 ? '' : String(row[idx] ?? '').trim());
const toNum = (s) => { const n = parseFloat(String(s).replace(/[+,]/g, '')); return Number.isFinite(n) ? n : null; };

// Each table column and the sheet header it reads. Move is "Rank move" (positive = moving up); a sheet without it
// but with "YTD rank" still works, as YTD rank minus ROS rank.
const PLAYER_COLUMNS = [
    ['rank', 'ROS rank'],
    ['name', 'Player'],
    ['team', 'Team'],
    ['rosPpg', 'ROS PPG'],
    ['fpg', 'FP/G'],
    ['targetShare', 'Target share'],
    ['buySell', 'Buy/Sell'],
];

/**
 * One position's tab → players sorted by ROS rank:
 * { rank, name, team, rosPpg (number|null), fpg (number|null), targetShare (text as written), move (number|null),
 *   buySell ('Buy' | 'Sell' | '') }.
 * Rows without a player or a ROS rank (blank rows, notes) are skipped. Throws InSeasonColumnError.
 */
export function parseInSeasonPlayers(rows, pos) {
    const what = String(pos).toUpperCase();
    if (!Array.isArray(rows) || rows.length < 2) throw new Error(`The ${what} sheet has no players.`);
    const col = headerIndex(rows[0]);
    const idx = Object.fromEntries(PLAYER_COLUMNS.map(([key, header]) => [key, col(header)]));
    const moveIdx = col('Rank move');
    const ytdIdx = col('YTD rank');

    const missing = PLAYER_COLUMNS.filter(([key]) => idx[key] === -1).map(([, header]) => header);
    if (moveIdx === -1 && ytdIdx === -1) missing.push('Rank move');
    if (missing.length) throw new InSeasonColumnError(what, missing);

    const players = [];
    for (const row of rows.slice(1)) {
        const name = cell(row, idx.name);
        const rank = parseInt(cell(row, idx.rank), 10);
        if (!name || !Number.isFinite(rank)) continue;
        let move = moveIdx !== -1 ? toNum(cell(row, moveIdx)) : null;
        if (move === null && ytdIdx !== -1) {
            const ytd = parseInt(cell(row, ytdIdx), 10);
            if (Number.isFinite(ytd)) move = ytd - rank;
        }
        const bs = cell(row, idx.buySell).toLowerCase();
        players.push({
            rank,
            name,
            team: cell(row, idx.team),
            rosPpg: toNum(cell(row, idx.rosPpg)),
            fpg: toNum(cell(row, idx.fpg)),
            targetShare: cell(row, idx.targetShare),
            move,
            buySell: bs === 'buy' ? 'Buy' : bs === 'sell' ? 'Sell' : '',
        });
    }
    if (!players.length) throw new Error(`The ${what} sheet has no players.`);
    return players.sort((a, b) => a.rank - b.rank);
}

const WEIGHT_COLUMNS = [
    ['intercept', 'Intercept'],
    ['xfp', 'XFP/G'],
    ['fpoe', 'FPOE/G'],
    ['lastSeason', 'Last-season PPG'],
    ['noPrior', 'No-prior adjustment'],
];

/**
 * The Model Weights tab → { byPos: { wr: {intercept, xfp, fpoe, lastSeason, noPrior, r2, line}, ... }, fitWeek }.
 * r2, line and fitWeek are null when the sheet doesn't have them. Throws InSeasonColumnError.
 */
export function parseInSeasonWeights(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('The Model Weights sheet is empty.');
    const col = headerIndex(rows[0]);
    const posIdx = col('Position');
    const idx = Object.fromEntries(WEIGHT_COLUMNS.map(([key, header]) => [key, col(header)]));
    const missing = [...(posIdx === -1 ? ['Position'] : []), ...WEIGHT_COLUMNS.filter(([key]) => idx[key] === -1).map(([, h]) => h)];
    if (missing.length) throw new InSeasonColumnError('Model Weights', missing);
    const r2Idx = col('R² (fit)') !== -1 ? col('R² (fit)') : col('R2 (fit)');
    const lineIdx = col('Buy/Sell line (rank)');

    const byPos = {};
    let fitWeek = null;
    for (const row of rows.slice(1)) {
        const first = cell(row, 0);
        if (norm(first) === 'fit after week') { fitWeek = parseInt(cell(row, 1), 10) || null; continue; }
        const pos = cell(row, posIdx).toLowerCase();
        if (!IN_SEASON_POSITIONS.includes(pos)) continue;
        const w = Object.fromEntries(WEIGHT_COLUMNS.map(([key]) => [key, toNum(cell(row, idx[key]))]));
        w.r2 = toNum(cell(row, r2Idx));
        w.line = parseInt(cell(row, lineIdx), 10) || null;
        byPos[pos] = w;
    }
    if (!Object.keys(byPos).length) throw new Error('The Model Weights sheet has no WR, RB or TE row.');
    return { byPos, fitWeek };
}
