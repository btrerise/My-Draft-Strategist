// T-Score page: reading the In-Season sheet's CSVs (improvements T1). Pure: rows in (Papa.parse's arrays of
// cells), players or weights out, no DOM and no storage, so tests/unit/tscoreInSeason.test.mjs loads it in Node.
//
// Columns are found by their header NAME (case, extra spaces and the order of columns don't matter), so a sheet
// whose columns get reordered, or that gains a column, still reads the same. A column the table needs that isn't
// there throws an InSeasonColumnError naming it, which the page shows as a plain message instead of a broken table.
// The sheet ("T-Score In-Season (public)", one tab per position, published to the web as CSV) holds only columns
// built from open data; see docs/improvements/LOG.md, T1, for why.

export const IN_SEASON_POSITIONS = ['wr', 'rb', 'te'];

// --- LABELS ---
// The preseason tabs' six labels ("Flex Play" in place of Boom/Bust). The owner's pick (2026-11-11, round 3): by
// POINTS, as the preseason T-Score labelled by score cutoffs. Model Weights carries a ROS PPG cutoff per label and
// position: the 95th / 90th / 80th / 65th / 50th percentiles of what this week's model would have projected for
// 2016–2025's players at the same week (block "Label cutoffs (ROS PPG)", parseInSeasonWeights). A player at or above
// a cutoff earns that label, so a tier's size changes with the projections, week to week and season to season.
// Without that block (or with a position missing from it), the fallback is by ROS rank: the same percentiles over a
// fixed pool of twice the Buy/Sell line (WR 96, RB 72, TE 36), where Flex Play ends at the line.
export const DEFAULT_LINES = { wr: 48, rb: 36, te: 18 };
export const LABEL_BANDS = [
    { label: 'Elite', share: 0.05, cls: 'label-elite' },
    { label: 'High-End Starter', share: 0.10, cls: 'label-high' },
    { label: 'Strong Starter', share: 0.20, cls: 'label-strong' },
    { label: 'Quality Contributor', share: 0.35, cls: 'label-quality' },
    { label: 'Flex Play', share: 0.50, cls: 'label-boom' },
];
export const DEPTH_LABEL = { label: 'Depth Player', cls: 'label-depth' };
// A Label column in the sheet wins over the computed one (a hand override); these are the names it may use.
const SHEET_LABEL_CLASS = { ...Object.fromEntries(LABEL_BANDS.map(b => [b.label.toLowerCase(), b.cls])), 'boom/bust': 'label-boom', 'depth player': 'label-depth' };

/** Each band's last ROS rank for a Buy/Sell line: line 48 → Elite 1–5, High-End 6–10, Strong 11–19, Quality 20–34, Flex 35–48. */
export function labelCutoffs(line) {
    const pool = 2 * (line > 0 ? line : 0);
    return LABEL_BANDS.map(b => ({ ...b, maxRank: Math.round(pool * b.share) }));
}

/** The label for a ROS rank (the fallback): { label, cls }. */
export function inSeasonLabel(rank, line) {
    const band = labelCutoffs(line).find(b => rank <= b.maxRank);
    return band ? { label: band.label, cls: band.cls } : DEPTH_LABEL;
}

/** The label for a projection, from one position's cutoffs ({ Elite: 15.9, …, 'Flex Play': 8.2 }): { label, cls }. */
export function inSeasonLabelByPoints(rosPpg, cutoffs) {
    if (rosPpg === null || rosPpg === undefined) return DEPTH_LABEL;
    const band = LABEL_BANDS.find(b => rosPpg >= cutoffs[b.label]);
    return band ? { label: band.label, cls: band.cls } : DEPTH_LABEL;
}

/** One player's label: the sheet's own Label if it has one, else by points when the position has cutoffs, else by rank. */
export function labelFor(player, { cutoffs, line } = {}) {
    if (player.label) return player.label;
    if (cutoffs) return inSeasonLabelByPoints(player.rosPpg, cutoffs);
    return inSeasonLabel(player.rank, line);
}

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

// XFP/G and FPOE/G for one row: the sheet's numbers, FPOE/G from FP/G − XFP/G when its column is missing.
function optionalExpected(fpg, xfp, fpoe) {
    if (fpoe === null && xfp !== null && fpg !== null) fpoe = Math.round((fpg - xfp) * 100) / 100;
    return { xfp, fpoe };
}

/**
 * One position's tab → players sorted by ROS rank:
 * { rank, name, team, rosPpg (number|null), fpg (number|null), xfp / fpoe (number|null, optional columns),
 *   targetShare (text as written), move (number|null),
 *   buySell ('Buy' | 'Sell' | '') }.
 * Rows without a player or a ROS rank (blank rows, notes) are skipped. Throws InSeasonColumnError.
 */
export function parseInSeasonPlayers(rows, pos) {
    const what = String(pos).toUpperCase();
    if (!Array.isArray(rows) || rows.length < 2) throw new Error(`The ${what} sheet has no players.`);
    const col = headerIndex(rows[0]);
    const idx = Object.fromEntries(PLAYER_COLUMNS.map(([key, header]) => [key, col(header)]));
    const moveIdx = col('Rank move');
    // Optional (owner, 2026-11-12): expected points and points over expected per game, after FP/G. Shown only when the
    // sheet has them; FPOE/G is worked out from FP/G − XFP/G when only XFP/G is there.
    const xfpIdx = col('XFP/G');
    const fpoeIdx = col('FPOE/G');
    const labelIdx = col('Label'); // optional: a hand-set label, used over the computed one
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
            ...optionalExpected(toNum(cell(row, idx.fpg)), toNum(cell(row, xfpIdx)), toNum(cell(row, fpoeIdx))),
            targetShare: cell(row, idx.targetShare),
            move,
            buySell: bs === 'buy' ? 'Buy' : bs === 'sell' ? 'Sell' : '',
        });
        const sheetLabel = cell(row, labelIdx);
        const cls = SHEET_LABEL_CLASS[sheetLabel.toLowerCase()];
        if (cls) players[players.length - 1].label = { label: sheetLabel, cls };
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
 * The Model Weights tab → { byPos: { wr: {intercept, xfp, fpoe, lastSeason, noPrior, r2, line}, ... }, fitWeek,
 * cutoffs: { wr: { Elite: 15.9, …, 'Flex Play': 8.2 }, … } | null, cutoffsFrom }.
 * r2, line and fitWeek are null when the sheet doesn't have them. The cutoffs block is found by its header row
 * ("Label cutoffs (ROS PPG)", then a column per position) wherever it sits; a position is kept only with a number for
 * all five labels (else it falls back to rank labels). Throws InSeasonColumnError.
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
    let cutCols = null; // inside the cutoffs block: { wr: column, … }
    const cutRaw = {};
    let cutoffsFrom = '';
    const bandOf = Object.fromEntries([...LABEL_BANDS.map(b => [norm(b.label), b.label]), ['boom/bust', 'Flex Play']]);
    for (const row of rows.slice(1)) {
        const first = cell(row, 0);
        if (norm(first).startsWith('label cutoffs')) {
            cutCols = {};
            row.forEach((h, i) => { const pos = norm(h); if (i > 0 && IN_SEASON_POSITIONS.includes(pos)) cutCols[pos] = i; });
            continue;
        }
        if (cutCols) {
            const band = bandOf[norm(first)];
            if (band) {
                for (const [pos, i] of Object.entries(cutCols)) {
                    const n = toNum(cell(row, i));
                    if (n !== null) (cutRaw[pos] ??= {})[band] = n;
                }
                continue;
            }
            if (norm(first) === 'cutoffs from') { cutoffsFrom = cell(row, 1); continue; }
            if (first) cutCols = null; // any other row ends the block
        }
        if (norm(first) === 'fit after week') { fitWeek = parseInt(cell(row, 1), 10) || null; continue; }
        const pos = cell(row, posIdx).toLowerCase();
        if (!IN_SEASON_POSITIONS.includes(pos)) continue;
        const w = Object.fromEntries(WEIGHT_COLUMNS.map(([key]) => [key, toNum(cell(row, idx[key]))]));
        w.r2 = toNum(cell(row, r2Idx));
        w.line = parseInt(cell(row, lineIdx), 10) || null;
        byPos[pos] = w;
    }
    if (!Object.keys(byPos).length) throw new Error('The Model Weights sheet has no WR, RB or TE row.');
    const complete = Object.entries(cutRaw).filter(([, c]) => LABEL_BANDS.every(b => Number.isFinite(c[b.label])));
    const cutoffs = complete.length ? Object.fromEntries(complete) : null;
    return { byPos, fitWeek, cutoffs, cutoffsFrom: cutoffs ? cutoffsFrom : '' };
}
