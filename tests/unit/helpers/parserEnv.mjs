// Browser stand-ins for js/shared/rankings/parse.js, which reads these globals at call time:
//   window.findCsvQuoteProblem, window.showToast  (js/shared/globals.js)
//   (window.normalizeName is still installed, but parse.js imports names.js directly since 1B)
//   Papa      (PapaParse, CDN script)
//   XLSX      (SheetJS, loaded on demand through the injected loadSheetJS)
//   FileReader
// normalizeName and findCsvQuoteProblem are the real ones, imported from js/shared/.
//
// The Papa stub is NOT PapaParse. It turns fixture text into rows the way Papa does for the
// simple, unquoted CSV the fixtures use (header: false, skipEmptyLines: true): split lines,
// drop lines that are exactly empty, split cells on commas. It refuses quoted input so a
// fixture can't silently depend on quoting rules the stub doesn't implement. For Papa output
// that plain splitting can't produce (quote errors), a fake file can carry `papaResult`,
// which is passed to `complete` verbatim. Real Papa is async for File input; this stub is
// synchronous, so multi-file batches finish in upload order here.
//
// The XLSX stub keeps each sheet as the CSV text SheetJS's sheet_to_csv would produce, so
// blank cells and blank rows come through as ",,," the way the real thing writes them.
import { normalizeName } from '../../../js/shared/names.js';
import { findCsvQuoteProblem } from '../../../js/shared/rankings/diagnostics.js';

const workbooks = new WeakMap(); // ArrayBuffer -> fake workbook

function splitCsv(text) {
    if (text.includes('"')) throw new Error('Papa stub: quoted CSV is not supported; use papaResult');
    return text.split(/\r\n|\n|\r/).filter(line => line !== '').map(line => line.split(','));
}

export function installParserEnv() {
    const utils = { normalizeName, findCsvQuoteProblem };
    const toasts = [];

    globalThis.window = {
        normalizeName: utils.normalizeName,
        findCsvQuoteProblem: utils.findCsvQuoteProblem,
        showToast: (message, options) => toasts.push({ message, options })
    };

    globalThis.Papa = {
        parse(input, config) {
            if (typeof input !== 'string' && input.papaError) {
                config.error(input.papaError);
                return;
            }
            if (typeof input !== 'string' && input.papaResult) {
                config.complete(input.papaResult);
                return;
            }
            const text = typeof input === 'string' ? input : input.text;
            config.complete({ data: splitCsv(text), errors: [], meta: {} });
        }
    };

    globalThis.XLSX = {
        read(data) {
            const wb = workbooks.get(data.buffer);
            if (!wb || wb.corrupt) throw new Error('XLSX stub: unreadable workbook');
            return { SheetNames: Object.keys(wb.sheets), Sheets: wb.sheets };
        },
        utils: { sheet_to_csv: sheet => sheet }
    };

    globalThis.FileReader = class {
        readAsArrayBuffer(file) {
            if (file.readError) { this.onerror(new Error('read failed')); return; }
            const buf = new ArrayBuffer(8);
            workbooks.set(buf, file.workbook);
            this.onload({ target: { result: buf } });
        }
    };

    return { toasts, utils };
}

// Fake File objects. Only `name` is read by the parser itself; the rest feeds the stubs.
export const csvFile = (name, text, extra = {}) => ({ name, text, ...extra });
export const xlsxFile = (name, sheets, extra = {}) => ({ name, workbook: { sheets, ...extra } });

export const loadSheetJSOk = (onSuccess) => onSuccess();
export const loadSheetJSFails = (_onSuccess, onError) => onError();

// Fixture text is written indented inside template literals; strip the common indent.
export function dedent(str) {
    const lines = str.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
    const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return lines.map(l => l.slice(indent)).join('\n') + '\n';
}
