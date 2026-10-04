// Characterization tests for js/shared/rankings/parse.js (was lineup/rankingsParser.js) (refactor chunk 0B).
// Inputs are real-looking rankings exports: title lines above the header, odd header casing and
// spacing, notes tabs in workbooks. Papa/XLSX/FileReader are stand-ins, see helpers/parserEnv.mjs.
// Oddities pinned here on purpose are listed in docs/refactor/LOG.md.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { installParserEnv, csvFile, xlsxFile, loadSheetJSOk, loadSheetJSFails, dedent } from './helpers/parserEnv.mjs';
import * as parser from '../../js/shared/rankings/parse.js';
import { parseRankingsFiles } from '../../js/shared/rankings/parse.js';
import { findHeaderRowIndex, stripTitleLines } from '../../js/shared/rankings/parse.js';

// Real PapaParse, when `cd tests && npm install` has been run; null otherwise.
let realPapa = null;
try { realPapa = createRequire(import.meta.url)('../node_modules/papaparse'); } catch { /* not installed */ }

const env = installParserEnv();
beforeEach(() => { env.toasts.length = 0; });

const parse = (files, opts = {}) => parseRankingsFiles(files, { loadSheetJS: loadSheetJSOk, showToast: env.showToast, ...opts });
const single = file => [{ file, context: 'SINGLE' }];
const byName = parsedData => Object.fromEntries(parsedData.map(p => [p.cleanName, p]));
// Some fields are only set on some branches; this compares a fixed set so absent === undefined is explicit.
const pick = (p, keys = ['name', 'rank', 'tier', 'posRank', 'posTier', 'flexRank', 'flexTier']) =>
    Object.fromEntries(keys.map(k => [k, p[k]]));

describe('exports', () => {
    // 2C added the four MDS title-line exports (moved from js/mds/import.js).
    test('parseRankingsFiles plus the MDS title-line helpers', () => {
        assert.deepEqual(Object.keys(parser).sort(), ['MDS_NAME_HEADERS', 'findHeaderRowIndex', 'normalizeHeader', 'parseRankingsFiles', 'stripTitleLines']);
    });
});

describe('vertical CSV, single-file upload', () => {
    test('title lines, a blank line and a padded header are handled', async () => {
        const file = csvFile('week3-ppr.csv', dedent(`
            Week 3 PPR Rankings

            Source: Example Analyst (updated 9/22)
             Rank , Player ,Team,Pos,Tier,Pos Rank
            1,Ja'Marr Chase,CIN,WR,1,7
            2,Bijan Robinson,ATL,RB,1,1
            3,Kenneth Walker III,SEA,RB,Tier 2,
            4,Hollywood Brown,KC,WR,T2,WR2
            5,Tank Dell,HOU,WR,,
        `));
        const res = await parse(single(file));
        assert.deepEqual(res.diagnostics, []);
        assert.equal(res.hasNewSos, false);
        assert.deepEqual(res.sosUpdates, {});
        assert.deepEqual(res.parsedData.map(p => p.cleanName), ['jamarrchase', 'bijanrobinson', 'kenwalker', 'marquisebrown', 'nathanieldell']);
        const p = byName(res.parsedData);
        // Explicit numeric Pos Rank wins and gets no tier.
        assert.deepEqual(pick(p.jamarrchase), { name: "Ja'Marr Chase", rank: 1, tier: 1, posRank: 7, posTier: null, flexRank: 1, flexTier: 1 });
        assert.deepEqual(pick(p.bijanrobinson), { name: 'Bijan Robinson', rank: 2, tier: 1, posRank: 1, posTier: null, flexRank: 2, flexTier: 1 });
        // Blank Pos Rank: falls back to the overall rank, with the overall tier. Alias applied
        // to cleanName, original spelling kept as name.
        assert.deepEqual(pick(p.kenwalker), { name: 'Kenneth Walker III', rank: 3, tier: 2, posRank: 3, posTier: 2, flexRank: 3, flexTier: 2 });
        // "WR2": the number after the position is the Pos Rank (refactor 9A; before it, the cell
        // was ignored and posRank fell back to the overall rank, 4).
        assert.deepEqual(pick(p.marquisebrown), { name: 'Hollywood Brown', rank: 4, tier: 2, posRank: 2, posTier: null, flexRank: 4, flexTier: 2 });
        assert.deepEqual(pick(p.nathanieldell), { name: 'Tank Dell', rank: 5, tier: null, posRank: 5, posTier: null, flexRank: 5, flexTier: null });
    });

    test('Pos Rank cells with the position in front: WR2, RB14, D/ST3, WR-2, lower case', async () => {
        const file = csvFile('posrank.csv', dedent(`
            Rank,Player,Pos Rank
            1,Bijan Robinson,RB1
            2,Puka Nacua,wr2
            3,Jahmyr Gibbs, RB14
            4,Ravens,D/ST3
            5,Drake London,WR-2
            6,Chris Olave,7th
            7,Garrett Wilson,WR
            8,Tee Higgins,N/A
        `));
        const p = byName((await parse(single(file))).parsedData);
        assert.deepEqual(['bijanrobinson', 'pukanacua', 'jahmyrgibbs', 'ravens', 'drakelondon', 'chrisolave'].map(k => [p[k].posRank, p[k].posTier]),
            [[1, null], [2, null], [14, null], [3, null], [2, null], [7, null]]);
        // No number in the cell: falls back to the overall rank, as a blank cell does.
        assert.deepEqual(pick(p.garrettwilson, ['rank', 'posRank']), { rank: 7, posRank: 7 });
        assert.deepEqual(pick(p.teehiggins, ['rank', 'posRank']), { rank: 8, posRank: 8 });
    });

    test('FantasyPros-style headers: RK / PLAYER NAME / TIERS', async () => {
        const file = csvFile('FantasyPros_2026_Week_3_OP_Rankings.csv', dedent(`
            RK,TIERS,PLAYER NAME,TEAM,POS,SOS SEASON,ECR VS. ADP
            1,1,Josh Allen,BUF,QB1,3 out of 5 stars,0
            2,1,Lamar Jackson,BAL,QB2,2 out of 5 stars,-1
        `));
        const res = await parse(single(file));
        assert.deepEqual(res.diagnostics, []);
        const p = byName(res.parsedData);
        // RK is the rank and TIERS the tier (refactor 9A; before it, rank came from row order and
        // tier was null). SOS SEASON is a star rating, not a matchup rank, so it stays unread.
        assert.deepEqual(pick(p.joshallen), { name: 'Josh Allen', rank: 1, tier: 1, posRank: 1, posTier: 1, flexRank: 1, flexTier: 1 });
        assert.deepEqual(pick(p.lamarjackson), { name: 'Lamar Jackson', rank: 2, tier: 1, posRank: 2, posTier: 1, flexRank: 2, flexTier: 1 });
        assert.equal(res.hasNewSos, false);
    });

    test('RK is used even when the file is not sorted by it; TIERS accepts "Tier 2"', async () => {
        const file = csvFile('fp-unsorted.csv', dedent(`
            PLAYER NAME,RK,TIERS
            Puka Nacua,12,Tier 3
            Ja'Marr Chase,3,1
            Drake London,,
        `));
        const p = byName((await parse(single(file))).parsedData);
        assert.deepEqual(pick(p.pukanacua, ['rank', 'tier']), { rank: 12, tier: 3 });
        assert.deepEqual(pick(p.jamarrchase, ['rank', 'tier']), { rank: 3, tier: 1 });
        // A blank RK cell falls back to row order, as a blank Rank cell does.
        assert.deepEqual(pick(p.drakelondon, ['rank', 'tier']), { rank: 3, tier: null });
    });

    test('rank column: "Overall" accepted; unparseable or blank cells fall back to row order', async () => {
        const file = csvFile('ovr.csv', dedent(`
            Name,Overall
            Puka Nacua,12
            Garrett Wilson,T-14
            Drake London,
        `));
        const p = byName((await parse(single(file))).parsedData);
        assert.equal(p.pukanacua.rank, 12);
        assert.equal(p.garrettwilson.rank, 2);
        assert.equal(p.drakelondon.rank, 3);
    });

    test('a later title row that looks like a header word is taken as the header', async () => {
        // Rows 0-1 aren't headers; row 2 is. Everything above it is dropped.
        const file = csvFile('titles.csv', dedent(`
            My League Rankings - Week 7
            Half PPR
            Player,Rank
            Chris Olave,1
        `));
        const res = await parse(single(file));
        assert.deepEqual(res.parsedData.map(p => [p.name, p.rank]), [['Chris Olave', 1]]);
    });

    test('title rows are only searched 10 rows deep', async () => {
        // Distinct letters, not numbers: digits are stripped, so "Note 1".."Note 11" would all
        // normalize to the same player and dedupe.
        const titles = Array.from({ length: 11 }, (_, i) => `Note ${'ABCDEFGHIJK'[i]}`).join('\n');
        const file = csvFile('deep.csv', `${titles}\nPlayer,Rank\nChris Olave,1\n`);
        const res = await parse(single(file));
        // The header is row 11, past MAX_TITLE_ROWS, so the whole file is read headerless.
        assert.equal(res.parsedData.length, 13);
        assert.equal(res.parsedData[0].name, 'Note A');
        assert.equal(res.parsedData[11].name, 'Player');
    });
});

describe('headerless lists', () => {
    test('plain list of names: rank is row order', async () => {
        const file = csvFile('my-qbs.csv', 'Josh Allen\nLamar Jackson\nJalen Hurts\n');
        const res = await parse(single(file));
        assert.deepEqual(res.parsedData.map(p => [p.cleanName, p.rank, p.posRank, p.flexRank]), [
            ['joshallen', 1, 1, 1], ['lamarjackson', 2, 2, 2], ['jalenhurts', 3, 3, 3]
        ]);
        assert.deepEqual(res.diagnostics, []);
    });
    test('numeric first cell: column 0 is rank, column 1 is name', async () => {
        const file = csvFile('ranked.csv', '3,Josh Allen\n7,Lamar Jackson\n');
        const res = await parse(single(file));
        assert.deepEqual(res.parsedData.map(p => [p.name, p.rank]), [['Josh Allen', 3], ['Lamar Jackson', 7]]);
    });
});

describe('per-position uploads', () => {
    test('QB + FLEX files: posRank from the position file, rank/flexRank from FLEX', async () => {
        const qb = csvFile('qb.csv', dedent(`
            Quarterback,Rank,Tier
            Josh Allen,1,1
            Jalen Hurts,2,1
        `));
        const flex = csvFile('flex.csv', dedent(`
            Rank,Player,Tier
            1,Bijan Robinson,1
            2,Josh Allen,1
        `));
        const wr = csvFile('wr.csv', dedent(`
            WIDE RECEIVER,Rank,Tier
            Ja'Marr Chase,1,1
        `));
        const res = await parse([{ file: qb, context: 'QB' }, { file: flex, context: 'FLEX' }, { file: wr, context: 'WR' }]);
        assert.deepEqual(res.diagnostics, []);
        const p = byName(res.parsedData);
        // A QB in a FLEX file gets a flexRank; that's what waiverScanner's contamination check catches.
        assert.deepEqual(pick(p.joshallen), { name: 'Josh Allen', rank: 2, tier: 1, posRank: 1, posTier: 1, flexRank: 2, flexTier: 1 });
        assert.deepEqual(pick(p.jalenhurts), { name: 'Jalen Hurts', rank: 2, tier: 1, posRank: 2, posTier: 1, flexRank: 999, flexTier: undefined });
        assert.deepEqual(pick(p.bijanrobinson), { name: 'Bijan Robinson', rank: 1, tier: 1, posRank: 999, posTier: undefined, flexRank: 1, flexTier: 1 });
        assert.deepEqual(pick(p.jamarrchase), { name: "Ja'Marr Chase", rank: 1, tier: 1, posRank: 1, posTier: 1, flexRank: 999, flexTier: undefined });
    });

    test('a position file never overwrites a rank already set by an earlier file', async () => {
        const flex = csvFile('flex.csv', 'Player,Rank\nDe\'Von Achane,4\n');
        const rb = csvFile('rb.csv', 'Player,Rank\nDe\'Von Achane,2\n');
        const p = byName((await parse([{ file: flex, context: 'FLEX' }, { file: rb, context: 'RB' }])).parsedData);
        assert.deepEqual(pick(p.devonachane, ['rank', 'posRank', 'flexRank']), { rank: 4, posRank: 2, flexRank: 4 });
    });

    test('CURRENT BEHAVIOR: "Quarterback" as the name header works in a QB upload but not a single-file one', async () => {
        const text = 'Rank,Quarterback\n1,Josh Allen\n';
        const asQb = await parse([{ file: csvFile('qb.csv', text), context: 'QB' }]);
        assert.deepEqual(asQb.parsedData.map(p => p.cleanName), ['joshallen']);
        // In SINGLE context a "quarterback" header switches to the horizontal layout, which
        // then finds no "... player" column.
        const asSingle = await parse(single(csvFile('qb.csv', text)));
        assert.deepEqual(asSingle.parsedData, []);
        assert.deepEqual(asSingle.diagnostics, [{
            fileName: 'qb.csv', context: 'SINGLE', reason: 'no-name-column', headersFound: ['Rank', 'Quarterback'],
            missing: ['qb player', 'rb player', 'wr player', 'te player', 'k player', 'def team', 'flex player']
        }]);
        // "Wide Receiver" doesn't trigger the horizontal layout, so it works in SINGLE.
        const wr = await parse(single(csvFile('wr.csv', 'Rank,Wide Receiver\n1,Puka Nacua\n')));
        assert.deepEqual(wr.parsedData.map(p => p.cleanName), ['pukanacua']);
    });
});

describe('horizontal (side-by-side) weekly sheet', () => {
    test('sections by "<POS> Player" columns, tiers by "<POS> Tier", FLEX sets rank', async () => {
        const file = csvFile('wk1.csv', dedent(`
            Week 1 Rankings,,,,,,,,,,,,
            QB Rank,QB Player,QB Tier,RB Rank,RB Player,Team,RB Tier,FLEX Rank,FLEX Player,K Rank,K Player,DEF Rank,DEF Team
            1,Josh Allen,1,1,Bijan Robinson,ATL,1,1,Bijan Robinson,1,Brandon Aubrey,1,Ravens
            2,Lamar Jackson,1,2,Saquon Barkley,PHI,2,2,Ja'Marr Chase,2,Jake Bates,2,Broncos
            ,,,3,Jahmyr Gibbs,DET,2,3,Saquon Barkley,,,x,Bills
        `));
        const res = await parse(single(file));
        assert.deepEqual(res.diagnostics, []);
        const p = byName(res.parsedData);
        assert.deepEqual(pick(p.joshallen), { name: 'Josh Allen', rank: 1, tier: 1, posRank: 1, posTier: 1, flexRank: 999, flexTier: undefined });
        assert.deepEqual(pick(p.lamarjackson), { name: 'Lamar Jackson', rank: 2, tier: 1, posRank: 2, posTier: 1, flexRank: 999, flexTier: undefined });
        // RB section first (rank + tier), then the FLEX column overwrites rank and tier.
        // There's no "FLEX Tier" column, so the tier becomes null.
        assert.deepEqual(pick(p.bijanrobinson), { name: 'Bijan Robinson', rank: 1, tier: null, posRank: 1, posTier: 1, flexRank: 1, flexTier: null });
        assert.deepEqual(pick(p.saquonbarkley), { name: 'Saquon Barkley', rank: 3, tier: null, posRank: 2, posTier: 2, flexRank: 3, flexTier: null });
        assert.deepEqual(pick(p.jahmyrgibbs), { name: 'Jahmyr Gibbs', rank: 3, tier: 2, posRank: 3, posTier: 2, flexRank: 999, flexTier: undefined });
        assert.deepEqual(pick(p.jamarrchase), { name: "Ja'Marr Chase", rank: 2, tier: null, posRank: 999, posTier: undefined, flexRank: 2, flexTier: null });
        assert.deepEqual(pick(p.brandonaubrey), { name: 'Brandon Aubrey', rank: 1, tier: null, posRank: 1, posTier: null, flexRank: 999, flexTier: undefined });
        assert.deepEqual(pick(p.ravens), { name: 'Ravens', rank: 1, tier: null, posRank: 1, posTier: null, flexRank: 999, flexTier: undefined });
        // A non-numeric rank cell skips the row.
        assert.equal(p.bills, undefined);
        assert.deepEqual(res.parsedData.map(x => x.cleanName), [
            'joshallen', 'lamarjackson', 'bijanrobinson', 'saquonbarkley', 'jahmyrgibbs',
            'jamarrchase', 'brandonaubrey', 'jakebates', 'ravens', 'broncos'
        ]);
    });

    test('horizontal header with no name columns', async () => {
        const res = await parse(single(csvFile('h.csv', 'QB Rank,Running Back\n1,x\n')));
        assert.equal(res.diagnostics[0].reason, 'no-name-column');
    });
    test('horizontal header with name columns but no data rows', async () => {
        const res = await parse(single(csvFile('h.csv', 'QB Rank,QB Player\n')));
        assert.equal(res.diagnostics[0].reason, 'no-rows');
    });
    test('horizontal header whose name cells are all blank', async () => {
        const res = await parse(single(csvFile('h.csv', 'QB Rank,QB Player\n1,\n')));
        assert.equal(res.diagnostics[0].reason, 'no-names-in-column');
    });
});

describe('strength of schedule extraction', () => {
    test('Team + Pos + SOS columns fill sosUpdates as number strings', async () => {
        const file = csvFile('ros-sos.csv', dedent(`
            Rank,Player,Team,Pos,SOS
            1,Christian McCaffrey,SF,RB,3
            2,CeeDee Lamb,dal,WR1,12
            3,Travis Kelce,KC,TE,4.5
            4,Jayden Daniels,WSH,QB,-2
            5,Brandon Aubrey,DAL,K,9
            6,Matthew Stafford,LA,QB,7
            7,Trevor Lawrence,JAC,QB,
        `));
        const res = await parse(single(file));
        assert.equal(res.hasNewSos, true);
        assert.deepEqual(res.sosUpdates, {
            SF: { RB: '3' },
            DAL: { WR: '12' },
            // Sign and decimal point kept (refactor 9A; before it, "45" and "2").
            KC: { TE: '4.5' },
            WAS: { QB: '-2' }
            // K has no SoS group; "LA" isn't a team abbreviation; a blank SoS cell is skipped.
        });
        assert.equal(res.parsedData.length, 7);
    });
    test('SoS cells: one number is kept as written; none or several add no SoS', async () => {
        const file = csvFile('sos-cells.csv', dedent(`
            Player,Team,Pos,SOS
            A,ARI,QB,+3
            B,ATL,QB,#4
            C,BAL,QB,4th
            D,BUF,QB,12 (easy)
            E,CAR,QB,4.50
            F,CHI,QB,007
            G,CIN,QB,-0.5
            H,CLE,QB,3 out of 5 stars
            I,DAL,QB,easy
            J,DEN,QB,1-3
        `));
        const res = await parse(single(file));
        assert.deepEqual(res.sosUpdates, {
            ARI: { QB: '3' }, ATL: { QB: '4' }, BAL: { QB: '4' }, BUF: { QB: '12' },
            CAR: { QB: '4.5' }, CHI: { QB: '7' }, CIN: { QB: '-0.5' }
            // "3 out of 5 stars" (two numbers; was "35"), "easy" (none) and "1-3" (two; was "13") are skipped.
        });
        // A file whose only SoS cells are skipped reports no new SoS.
        const none = await parse(single(csvFile('s.csv', 'Player,Team,Pos,SOS\nJosh Allen,BUF,QB,3 out of 5 stars\n')));
        assert.equal(none.hasNewSos, false);
        assert.deepEqual(none.sosUpdates, {});
    });
    test('"ROS", "Schedule" and "Matchup" headers are all read as SoS', async () => {
        for (const header of ['ROS', 'Schedule', 'Matchup']) {
            const res = await parse(single(csvFile('s.csv', `Player,Tm,Position,${header}\nJosh Allen,BUF,QB,5\n`)));
            assert.deepEqual(res.sosUpdates, { BUF: { QB: '5' } }, header);
        }
    });
    test('no SoS without all three of Team, Pos and SoS', async () => {
        const res = await parse(single(csvFile('s.csv', 'Player,Team,SOS\nJosh Allen,BUF,5\n')));
        assert.equal(res.hasNewSos, false);
        assert.deepEqual(res.sosUpdates, {});
    });
});

describe('diagnostics', () => {
    test('header row with no name column (Rank,Tm,Bye,Proj)', async () => {
        const res = await parse(single(csvFile('projections.csv', 'Rank,Tm,Bye,Proj\n1,BUF,7,24.1\n')));
        assert.deepEqual(res.parsedData, []);
        assert.deepEqual(res.diagnostics, [{
            fileName: 'projections.csv', context: 'SINGLE', reason: 'no-name-column', headersFound: ['Rank', 'Tm', 'Bye', 'Proj'],
            missing: ['player', 'name', 'player name', 'quarterback', 'running back', 'wide receiver', 'tight end', 'kicker', 'defense', 'flex']
        }]);
    });
    test('header only', async () => {
        const res = await parse(single(csvFile('h.csv', 'Rank,Player\n')));
        assert.deepEqual(res.diagnostics, [{ fileName: 'h.csv', context: 'SINGLE', reason: 'no-rows', headersFound: ['Rank', 'Player'], missing: [] }]);
    });
    test('name column present but every name blank', async () => {
        const res = await parse(single(csvFile('b.csv', 'Rank,Player\n1,\n2,\n')));
        assert.deepEqual(res.diagnostics, [{ fileName: 'b.csv', context: 'SINGLE', reason: 'no-names-in-column', headersFound: ['Rank', 'Player'], missing: [] }]);
    });
    test('empty file', async () => {
        const res = await parse(single(csvFile('e.csv', '')));
        assert.deepEqual(res.diagnostics, [{ fileName: 'e.csv', context: 'SINGLE', reason: 'empty-file', headersFound: [], missing: [] }]);
    });
    test('unclosed quote: players still read, damage reported with real findCsvQuoteProblem', async () => {
        const papaResult = {
            data: [['Rank', 'Player'], ['1', 'Josh Allen'], ['2', 'Lamar "Jackson\n3,Joe Burrow\n4,Jalen Hurts\n']],
            errors: [{ type: 'Quotes', code: 'MissingQuotes', row: 2 }],
            meta: {}
        };
        const res = await parse(single(csvFile('quote.csv', null, { papaResult })));
        assert.deepEqual(res.parsedData.map(p => p.cleanName), ['joshallen', 'lamarjacksonjoeburrowjalenhurts']);
        assert.deepEqual(res.diagnostics, [{ fileName: 'quote.csv', context: 'SINGLE', reason: 'unclosed-quote', row: 3, rowsLost: 2, headersFound: [], missing: [] }]);
    });
    test('non-xlsx extensions go through the CSV path', async () => {
        const res = await parse(single(csvFile('list.txt', 'Josh Allen\n')));
        assert.equal(res.parsedData[0].cleanName, 'joshallen');
    });
});

describe('xlsx workbooks', () => {
    test('notes tab skipped and reported; title rows and blank ",,," rows handled; empty tab ignored', async () => {
        const file = xlsxFile('Week 5 Rankings.XLSX', {
            'Read Me': 'Updated Tuesday,,,\nInjuries not reflected,,,\n',
            Rankings: 'Week 5 Rankings,,,\n,,,\nRank,Player,Team,Pos\n1,Josh Allen,BUF,QB\n,,,\n2,Bijan Robinson,ATL,RB\n',
            Sheet3: ''
        });
        const res = await parse(single(file));
        assert.deepEqual(res.parsedData.map(p => [p.cleanName, p.rank]), [['joshallen', 1], ['bijanrobinson', 2]]);
        assert.deepEqual(res.diagnostics, [{
            fileName: 'Week 5 Rankings.XLSX', context: 'SINGLE', reason: 'tab-without-header',
            headersFound: ['Updated Tuesday'], missing: [], sheetName: 'Read Me'
        }]);
        assert.deepEqual(env.toasts, []);
    });
    test('a workbook of headerless lists reads every tab', async () => {
        const file = xlsxFile('lists.xls', { QBs: 'Josh Allen\nJalen Hurts\n', RBs: 'Bijan Robinson\n' });
        const res = await parse(single(file));
        // Each tab restarts row-order ranks at 1.
        assert.deepEqual(res.parsedData.map(p => [p.cleanName, p.rank]), [['joshallen', 1], ['jalenhurts', 2], ['bijanrobinson', 1]]);
        assert.deepEqual(res.diagnostics, []);
    });
    test('no players anywhere: the file-level diagnostic names the first non-empty tab', async () => {
        const file = xlsxFile('bad.xlsx', { Blank: '', Data: 'Rank,Tm\n1,BUF\n' });
        const res = await parse(single(file));
        assert.deepEqual(res.diagnostics, [{
            fileName: 'bad.xlsx', context: 'SINGLE', reason: 'no-name-column', headersFound: ['Rank', 'Tm'],
            missing: ['player', 'name', 'player name', 'quarterback', 'running back', 'wide receiver', 'tight end', 'kicker', 'defense', 'flex'],
            sheetName: 'Data'
        }]);
    });
    test('single-tab workbook: no sheetName on the diagnostic', async () => {
        const res = await parse(single(xlsxFile('one.xlsx', { Sheet1: 'Rank,Player\n' })));
        assert.deepEqual(res.diagnostics, [{ fileName: 'one.xlsx', context: 'SINGLE', reason: 'no-rows', headersFound: ['Rank', 'Player'], missing: [] }]);
    });
});

describe('failures resolve as "unreadable" and toast', () => {
    const unreadable = (fileName) => [{ fileName, context: 'SINGLE', reason: 'unreadable', headersFound: [], missing: [] }];
    const quiet = async fn => {
        const orig = console.error;
        console.error = () => {};
        try { return await fn(); } finally { console.error = orig; }
    };

    test('corrupt xlsx', async () => {
        const res = await quiet(() => parse(single(xlsxFile('c.xlsx', {}, { corrupt: true }))));
        assert.deepEqual(res.diagnostics, unreadable('c.xlsx'));
        assert.equal(env.toasts.length, 1);
        assert.match(env.toasts[0].message, /Couldn't read "c\.xlsx"; it may be corrupted/);
        assert.deepEqual(env.toasts[0].options, { isError: true });
    });
    test('SheetJS fails to load', async () => {
        const res = await quiet(() => parse(single(xlsxFile('c.xlsx', { S: 'Player\nX\n' })), { loadSheetJS: loadSheetJSFails }));
        assert.deepEqual(res.diagnostics, unreadable('c.xlsx'));
        assert.match(env.toasts[0].message, /Couldn't load the Excel file reader/);
    });
    test('FileReader error', async () => {
        const file = { ...xlsxFile('c.xlsx', {}), readError: true };
        const res = await quiet(() => parse(single(file)));
        assert.deepEqual(res.diagnostics, unreadable('c.xlsx'));
        assert.match(env.toasts[0].message, /from disk/);
    });
    test('Papa error callback', async () => {
        const res = await quiet(() => parse(single(csvFile('gone.csv', null, { papaError: new Error('NotFound') }))));
        assert.deepEqual(res.diagnostics, unreadable('gone.csv'));
        assert.match(env.toasts[0].message, /Couldn't read "gone\.csv" from disk/);
    });
    test('one bad file does not stop the rest of the batch', async () => {
        const res = await quiet(() => parse([
            { file: csvFile('gone.csv', null, { papaError: new Error('NotFound') }), context: 'QB' },
            { file: csvFile('rb.csv', 'Player\nBijan Robinson\n'), context: 'RB' }
        ]));
        assert.deepEqual(res.parsedData.map(p => p.cleanName), ['bijanrobinson']);
        assert.deepEqual(res.diagnostics.map(d => [d.fileName, d.context, d.reason]), [['gone.csv', 'QB', 'unreadable']]);
    });
});

describe('batch plumbing', () => {
    test('onProgress reports 0..n of n', async () => {
        const calls = [];
        await parse([
            { file: csvFile('a.csv', 'Player\nA Player\n'), context: 'QB' },
            { file: csvFile('b.csv', 'Player\nB Player\n'), context: 'RB' }
        ], { onProgress: (done, total) => calls.push([done, total]) });
        assert.deepEqual(calls, [[0, 2], [1, 2], [2, 2]]);
    });
    test('empty batch', async () => {
        assert.deepEqual(await parse([]), { parsedData: [], hasNewSos: false, sosUpdates: {}, diagnostics: [] });
    });
    test('the first spelling seen is kept as name', async () => {
        const res = await parse([
            { file: csvFile('a.csv', 'Player\nKenny Gainwell\n'), context: 'RB' },
            { file: csvFile('b.csv', 'Player\nKenneth Gainwell\n'), context: 'FLEX' }
        ]);
        assert.deepEqual(res.parsedData.map(p => [p.name, p.cleanName, p.posRank, p.flexRank]), [['Kenny Gainwell', 'kennethgainwell', 1, 1]]);
    });
});

// Draft Strategist's title-line handling (refactor chunk 2C moved it here from js/mds/import.js).
// It is separate from MLS's dropTitleRows above on purpose: MDS only reads a Player / Name /
// Player Name column, so only those cells mark the header row, and the rows it gets keep their
// blank lines (SheetJS sheet_to_json with blankrows: true, or Papa without skipEmptyLines).
describe('MDS title lines: findHeaderRowIndex / stripTitleLines', () => {
    const rows = text => text.split('\n').map(line => line === '' ? [''] : line.split(','));

    test('a header in the first row stays at 0', () => {
        assert.equal(findHeaderRowIndex(rows('Rank,Player,Team\n1,Ja\'Marr Chase,CIN')), 0);
    });

    test('blank rows before the header are skipped', () => {
        assert.equal(findHeaderRowIndex([[''], ['', ''], [], ['Player', 'Team'], ['Chris Olave', 'NO']]), 3);
    });

    test('title, blank line and source credit above the header (the real-world export shape)', () => {
        const raw = rows('Week 3 PPR Rankings\n\nSource: Example Analyst (updated 9/22)\nRank,Player,Team,Pos\n1,Ja\'Marr Chase,CIN,WR');
        assert.equal(findHeaderRowIndex(raw), 3);
    });

    test('header cells are matched lowercased, trimmed and with quotes stripped', () => {
        assert.equal(findHeaderRowIndex([['Updated Tuesday'], ['RK', ' "PLAYER NAME" ', 'TEAM']]), 1);
        assert.equal(findHeaderRowIndex([['Updated Tuesday'], ["'Name'", 'Pos']]), 1);
    });

    test('only Player / Name / Player Name mark a header; a position-named column does not', () => {
        // MLS would take "Quarterback" as a name header. MDS can't read that column, so the
        // header row is the fallback: the first row with 2+ cells.
        assert.equal(findHeaderRowIndex(rows('Week 3\nRank,Quarterback,Team\n1,Josh Allen,BUF')), 1);
    });

    test('no name column anywhere: the first row with 2+ cells, so the error lists real columns', () => {
        assert.equal(findHeaderRowIndex(rows('Week 3 Rankings\nRank,Tm,Bye\n1,KC,6')), 1);
    });

    test('no name column and only one-cell rows: the first non-blank row', () => {
        assert.equal(findHeaderRowIndex(rows('\nJosh Allen\nLamar Jackson')), 1);
    });

    test('an empty sheet gives 0', () => {
        assert.equal(findHeaderRowIndex([]), 0);
        assert.equal(findHeaderRowIndex([[''], ['', '']]), 0);
    });

    test('non-array rows count as blank', () => {
        assert.equal(findHeaderRowIndex([undefined, null, ['Player']]), 2);
    });

    test('the header is searched for among the first 11 non-blank rows; blank rows do not count', () => {
        const titles = n => Array.from({ length: n }, (_, i) => [`Note ${i}`]);
        assert.equal(findHeaderRowIndex([...titles(10), ['Player', 'Rank']]), 10);
        // An 11th title row pushes the header out of reach. No row in reach has 2+ cells, so the
        // fallback is the first non-blank row.
        assert.equal(findHeaderRowIndex([...titles(11), ['Player', 'Rank']]), 0);
        const spaced = titles(10).flatMap(r => [r, ['']]);
        assert.equal(findHeaderRowIndex([...spaced, ['Player', 'Rank']]), 20);
    });

    test('stripTitleLines: text without title lines comes back as the same string', () => {
        const text = 'Rank,Player\n1,Chris Olave\n';
        assert.equal(stripTitleLines(text), text);
    });

    test('stripTitleLines: title lines and the blank line after them are cut', () => {
        const text = dedent(`
            Week 3 PPR Rankings

            Rank,Player,Team
            1,Ja'Marr Chase,CIN
            2,Bijan Robinson,ATL
        `);
        assert.equal(stripTitleLines(text), "Rank,Player,Team\r\n1,Ja'Marr Chase,CIN\r\n2,Bijan Robinson,ATL\r\n");
    });

    test('stripTitleLines: a header beyond the 21-row preview is not found and the text is kept', () => {
        // The preview is MAX_TITLE_ROWS * 2 + 1 = 21 rows, blank rows included.
        const text = 'Week 3\n' + '\n'.repeat(20) + 'Player,Rank\nChris Olave,1\n';
        assert.equal(stripTitleLines(text), text);
    });

    test('stripTitleLines: no name column, but a one-cell title line is still cut', () => {
        assert.equal(stripTitleLines('Week 3 Rankings\nRank,Tm,Bye\n1,KC,6\n'), 'Rank,Tm,Bye\r\n1,KC,6\r\n');
    });

    // The stub can't quote, so this one runs only when tests/node_modules has the real
    // PapaParse (cd tests && npm install). It is the case stripTitleLines re-serializes for.
    test('stripTitleLines with real PapaParse: quoted cells survive the cut', { skip: !realPapa && 'tests/node_modules/papaparse not installed' }, () => {
        const stub = globalThis.Papa;
        globalThis.Papa = realPapa;
        try {
            const out = stripTitleLines('Week 3\nPlayer,Team\n"Smith, Jr., John",KC\n');
            assert.equal(out, 'Player,Team\r\n"Smith, Jr., John",KC\r\n');
            assert.deepEqual(realPapa.parse(out, { header: true, skipEmptyLines: true }).data, [{ Player: 'Smith, Jr., John', Team: 'KC' }]);
        } finally {
            globalThis.Papa = stub;
        }
    });
});
