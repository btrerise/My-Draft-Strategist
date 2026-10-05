// Pixel comparison of screenshot PNGs (refactor 0C; the method 7C used, kept as an opt-in tool).
//
// Counts the pixels whose RGB differs between two copies of each PNG and prints the bounding box of
// the changed area. It is stricter than toHaveScreenshot, which ignores faint colour changes
// (per-pixel `threshold`) and up to `maxDiffPixelRatio` of the pixels: here one changed pixel counts.
// Plain Node, not a spec, so `npx playwright test` never runs it.
//
//   cd tests
//   npm run pxdiff -- <dirA> <dirB>                    # compare every PNG under two folders
//   npm run pxdiff -- <dirA> <dirB> --crops <out>      # also write a side-by-side crop per changed PNG
//   npm run pxdiff -- --runs 5 [--out <dir>] [--crops <out>] [-- <playwright args>]
//
// --runs N renders visual.spec.mjs N times with --update-snapshots=all, copies baselines/linux/ to
// <out>/run-1 … run-N after each run (default out: a fresh folder in the OS temp dir), and puts the
// baselines back as they were before the first run (from a copy, so uncommitted baselines survive).
// Then it compares each run against run-1 (is the rendering repeatable?) and run-1 against the
// baselines as they were (what re-taking would change). Extra arguments after `--` go to Playwright,
// for example `-- --project phone -g "MDS"`.
//
// A crop is three panels side by side, A | B | changed pixels in red over a faded A, cut to the
// bounding box plus a margin. Exit code 1 when any PNG differs or is missing on one side.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = fileURLToPath(new URL('..', import.meta.url));
// playwright-core's package.json doesn't export this path, so it is loaded by file name.
const { PNG } = createRequire(import.meta.url)(join(TESTS, 'node_modules/playwright-core/lib/utilsBundle.js'));
const BASELINES = join(TESTS, 'baselines', 'linux');

function pngsUnder(dir) {
    const out = [];
    const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.png')) out.push(relative(dir, p));
        }
    };
    walk(dir);
    return out.sort();
}

/** { size: true } when the sizes differ, else { count, box: [x0, y0, x1, y1] | null }. */
export function diffPngs(a, b) {
    if (a.width !== b.width || a.height !== b.height) return { size: true };
    let count = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
            const i = (y * a.width + x) * 4;
            if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
                count++;
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
    }
    return { count, box: count ? [x0, y0, x1, y1] : null };
}

function writeCrop(a, b, box, file, margin = 24) {
    const cx0 = Math.max(0, box[0] - margin), cy0 = Math.max(0, box[1] - margin);
    const cx1 = Math.min(a.width - 1, box[2] + margin), cy1 = Math.min(a.height - 1, box[3] + margin);
    const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1, gap = 8;
    const out = new PNG({ width: w * 3 + gap * 2, height: h });
    out.data.fill(255);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const si = ((cy0 + y) * a.width + cx0 + x) * 4;
            const changed = a.data[si] !== b.data[si] || a.data[si + 1] !== b.data[si + 1] || a.data[si + 2] !== b.data[si + 2];
            for (let panel = 0; panel < 3; panel++) {
                const di = (y * out.width + panel * (w + gap) + x) * 4;
                const src = panel === 1 ? b : a;
                for (let c = 0; c < 3; c++) out.data[di + c] = src.data[si + c];
                if (panel === 2) {
                    if (changed) { out.data[di] = 255; out.data[di + 1] = 0; out.data[di + 2] = 0; }
                    else for (let c = 0; c < 3; c++) out.data[di + c] = 255 - ((255 - out.data[di + c]) >> 2);
                }
                out.data[di + 3] = 255;
            }
        }
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, PNG.sync.write(out));
}

/** Compares every PNG under dirA and dirB, prints one line per PNG that differs, returns the number that differ. */
export function compareDirs(dirA, dirB, { crops, label = `${dirA} vs ${dirB}` } = {}) {
    const names = [...new Set([...pngsUnder(dirA), ...pngsUnder(dirB)])].sort();
    let differing = 0;
    console.log(`\n${label}: ${names.length} PNGs`);
    for (const name of names) {
        const pa = join(dirA, name), pb = join(dirB, name);
        if (!existsSync(pa) || !existsSync(pb)) {
            differing++;
            console.log(`  ${name}: only in ${existsSync(pa) ? 'A' : 'B'}`);
            continue;
        }
        const bufA = readFileSync(pa), bufB = readFileSync(pb);
        if (bufA.equals(bufB)) continue;
        const a = PNG.sync.read(bufA), b = PNG.sync.read(bufB);
        const d = diffPngs(a, b);
        if (d.size) {
            differing++;
            console.log(`  ${name}: size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
            continue;
        }
        if (!d.count) continue; // same pixels, different encoding
        differing++;
        const [x0, y0, x1, y1] = d.box;
        console.log(`  ${name}: ${d.count.toLocaleString('en-US')} px, box x ${x0}–${x1}, y ${y0}–${y1} (of ${a.width}x${a.height})`);
        if (crops) writeCrop(a, b, d.box, join(crops, name));
    }
    if (!differing) console.log('  all pixel-identical');
    return differing;
}

function runs(n, { out, crops, pwArgs }) {
    out ??= mkdtempSync(join(tmpdir(), 'pxdiff-'));
    mkdirSync(out, { recursive: true });
    const before = join(out, 'before');
    rmSync(before, { recursive: true, force: true });
    cpSync(BASELINES, before, { recursive: true });
    try {
        for (let i = 1; i <= n; i++) {
            console.log(`run ${i}/${n} …`);
            try {
                execFileSync('npx', ['playwright', 'test', 'visual.spec.mjs', '--update-snapshots=all', '--reporter=dot', ...pwArgs],
                    { cwd: TESTS, stdio: 'inherit' });
            } catch {
                console.log(`run ${i}: Playwright exited non-zero (copied anyway)`);
            }
            const dest = join(out, `run-${i}`);
            rmSync(dest, { recursive: true, force: true });
            cpSync(BASELINES, dest, { recursive: true });
            rmSync(BASELINES, { recursive: true, force: true });
            cpSync(before, BASELINES, { recursive: true });
        }
    } finally {
        rmSync(BASELINES, { recursive: true, force: true });
        cpSync(before, BASELINES, { recursive: true });
    }
    let differing = 0;
    for (let i = 2; i <= n; i++) {
        differing += compareDirs(join(out, 'run-1'), join(out, `run-${i}`), {
            label: `run-1 vs run-${i}`, crops: crops && join(crops, `run-1-vs-${i}`),
        });
    }
    compareDirs(before, join(out, 'run-1'), { label: 'baselines before vs run-1', crops: crops && join(crops, 'before-vs-run-1') });
    console.log(`\nCopies are in ${out}`);
    return differing;
}

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const pwArgs = dash >= 0 ? argv.slice(dash + 1) : [];
const args = dash >= 0 ? argv.slice(0, dash) : argv;
const opt = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
};
const n = opt('--runs'), out = opt('--out'), crops = opt('--crops');

let differing;
if (n) differing = runs(Number(n), { out, crops, pwArgs });
else if (args.length === 2) differing = compareDirs(args[0], args[1], { crops });
else {
    console.error('usage: pxdiff.mjs <dirA> <dirB> [--crops <out>]\n       pxdiff.mjs --runs <n> [--out <dir>] [--crops <out>] [-- <playwright args>]');
    process.exit(2);
}
process.exit(differing ? 1 : 0);
