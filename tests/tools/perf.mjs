#!/usr/bin/env node
// Load-speed measurements (improvements S17): Lighthouse 13.5 (the version PageSpeed Insights ran on
// 2026-10-12) against `/`, `/lineup/` and `/t-score/`, in the mobile setup PageSpeed uses (a Moto G Power
// sized screen, slow 4G: 150 ms round trips and 1.6 Mbps down, the CPU slowed 4x).
//
//   cd tests && npm run perf                          # working tree, both servers, 3 runs per page
//   npm run perf -- --ref origin/main                 # the same, serving a git ref instead
//   npm run perf -- --root ../some/copy               # or another folder (a prototype, a minified copy)
//   npm run perf -- --server cf --runs 5 --pages /lineup/
//   npm run perf -- --json out.json                   # also write every run's numbers
//
// Two servers, both in this process (no port is shared with Playwright's serve.mjs):
//   * plain: what tests/serve.mjs does (no compression, `Cache-Control: no-store`). The card's baseline.
//   * cf:    closer to Cloudflare Pages: brotli for text files, `public, max-age=0, must-revalidate` with an
//            ETag (Pages' default), and the repo's `_headers` file applied if there is one.
// Three visits per page and server:
//   * first:  empty cache, no service worker. Lighthouse's own simulated throttling ("simulate"), as
//             PageSpeed Insights does. This is the headline number. Its filmstrip is from the real,
//             unthrottled load, so it can't show a white first frame.
//   * cold:   the same first visit with Lighthouse's applied throttling ("devtools"): Chrome really slows the
//             network and CPU, so the filmstrip (and its white frames) is what a phone would show.
//   * repeat: the page loaded once first (service worker installed and in control), then measured with
//             Lighthouse's applied throttling ("devtools"), since the simulation can't model a warm cache.
// Third-party files are answered locally so every run sees the same bytes: Google Fonts (the CSS and woff2
// files, fetched once through the network into tests/tools/.perf-cache/, then reused), PapaParse from
// tests/node_modules (as the specs do). Ko-fi's image, MathJax and headshots are aborted, as in the specs.
// The printed table is the median of the runs. A run takes about 15 s.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zc } from 'node:zlib';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '../..');
const CACHE_DIR = join(HERE, '.perf-cache');
const CHROME = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webp': 'image/webp',
    '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml)|image\/svg)/;

// ---------------------------------------------------------------- options

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const REF = opt('ref', null);
const ROOT = resolve(opt('root', REPO));     // serve another folder (a minified copy, a prototype) instead
const RUNS = Number(opt('runs', 3));
const PAGES = opt('pages', '/,/lineup/,/t-score/').split(',');
const SERVERS = opt('server', 'plain,cf').split(',');
const VISITS = opt('visit', 'first,cold,repeat').split(',');
const JSON_OUT = opt('json', null);
const LHR_DIR = opt('lhr', null);           // keep each run's full Lighthouse report (JSON) here
if (!CHROME) { console.error('No Chromium found: set CHROME_PATH.'); process.exit(1); }

// ---------------------------------------------------------------- the files: working tree or a git ref

const gitType = (spec) => {
    try { return execFileSync('git', ['cat-file', '-t', spec], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { return null; }
};
const fileCache = new Map();
function readSite(pathname) {
    if (fileCache.has(pathname)) return fileCache.get(pathname);
    let out = null;
    if (REF) {
        let rel = pathname.replace(/^\/+/, '');
        if (rel === '' || gitType(`${REF}:${rel.replace(/\/$/, '')}`) === 'tree') rel = rel.replace(/\/?$/, rel ? '/index.html' : 'index.html');
        if (gitType(`${REF}:${rel}`) === 'blob') {
            out = { file: rel, body: execFileSync('git', ['show', `${REF}:${rel}`], { cwd: REPO, maxBuffer: 1 << 28 }) };
        }
    } else {
        let file = normalize(join(ROOT, pathname));
        if (file.startsWith(ROOT)) {
            if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
            if (existsSync(file)) out = { file, body: readFileSync(file) };
        }
    }
    fileCache.set(pathname, out);
    return out;
}

// Cloudflare Pages' `_headers`: "/path/*" lines, each followed by indented "Name: value" lines.
function headerRules() {
    const src = readSite('/_headers');
    if (!src) return [];
    const rules = [];
    for (const line of src.body.toString().split('\n')) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        if (!/^\s/.test(line)) { rules.push({ re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), headers: {} }); continue; }
        const m = line.trim().match(/^([^:]+):\s*(.*)$/);
        if (m && rules.length) rules.at(-1).headers[m[1].toLowerCase()] = m[2];
    }
    return rules;
}

function startServer(kind) {
    const rules = kind === 'cf' ? headerRules() : [];
    const brCache = new Map();
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const hit = readSite(pathname);
        if (!hit) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
        const type = TYPES[extname(hit.file)] || 'application/octet-stream';
        if (kind === 'plain') {
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(hit.body);
            return;
        }
        const etag = '"' + createHash('sha1').update(hit.body).digest('hex').slice(0, 16) + '"';
        const headers = { 'Content-Type': type, 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag };
        for (const r of rules) if (r.re.test(pathname)) Object.assign(headers, Object.fromEntries(Object.entries(r.headers)));
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
        let body = hit.body;
        if (COMPRESSIBLE.test(type) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
            if (!brCache.has(hit.file)) brCache.set(hit.file, brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }));
            body = brCache.get(hit.file);
            headers['Content-Encoding'] = 'br';
            headers.Vary = 'Accept-Encoding';
        }
        res.writeHead(200, headers).end(body);
    });
    return new Promise(ok => server.listen(0, () => ok(server)));
}

// ---------------------------------------------------------------- third parties, answered locally

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const PAPA = readFileSync(join(HERE, '../node_modules/papaparse/papaparse.min.js'));

async function cachedFetch(url) {
    mkdirSync(CACHE_DIR, { recursive: true });
    const key = join(CACHE_DIR, createHash('sha1').update(url).digest('hex'));
    if (existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
    const res = await fetch(url, { headers: { 'User-Agent': MOBILE_UA } });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const out = { type: res.headers.get('content-type'), cacheControl: res.headers.get('cache-control'), body: Buffer.from(await res.arrayBuffer()).toString('base64') };
    writeFileSync(key, JSON.stringify(out));
    return out;
}

async function answerThirdParties(page) {
    const cdp = await page.createCDPSession();
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'http*://*' }] });
    cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
        const url = new URL(request.url);
        try {
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                await cdp.send('Fetch.continueRequest', { requestId }); return;
            }
            let reply = null;
            if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/PapaParse/')) {
                reply = { type: 'application/javascript; charset=utf-8', cacheControl: 'public, max-age=30672000', body: PAPA.toString('base64') };
            } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
                reply = await cachedFetch(request.url).catch(() => null);
            }
            if (!reply) { await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
            await cdp.send('Fetch.fulfillRequest', {
                requestId, responseCode: 200, body: reply.body,
                responseHeaders: [
                    { name: 'Content-Type', value: reply.type || 'application/octet-stream' },
                    { name: 'Cache-Control', value: reply.cacheControl || 'no-store' },
                    { name: 'Access-Control-Allow-Origin', value: '*' },
                ],
            });
        } catch { /* the page navigated away; nothing to answer */ }
    });
}

// ---------------------------------------------------------------- one Lighthouse run

const median = (xs) => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

function summarize(lhr) {
    const a = lhr.audits;
    const num = (id) => a[id]?.numericValue ?? null;
    const lcpEl = a['lcp-breakdown-insight']?.details?.items?.find(i => i.type === 'node');
    const blocking = a['render-blocking-insight'];
    const tree = a['network-dependency-tree-insight']?.details?.items?.[0];
    // Longest chain in the dependency tree, as "depth" (requests one after another).
    let depth = 0;
    const walk = (chains, d) => { for (const c of Object.values(chains || {})) { depth = Math.max(depth, d); walk(c.children, d + 1); } };
    walk(tree?.value?.chains, 1);
    const requests = a['network-requests']?.details?.items || [];
    return {
        score: Math.round((lhr.categories.performance.score ?? 0) * 100),
        fcp: num('first-contentful-paint'), lcp: num('largest-contentful-paint'), si: num('speed-index'),
        tbt: num('total-blocking-time'), cls: num('cumulative-layout-shift'), tti: num('interactive'),
        blockingMs: blocking?.metricSavings?.FCP ?? null,
        blockingUrls: (blocking?.details?.items || []).map(i => i.url?.replace(/^https?:\/\/(localhost|127\.0\.0\.1):\d+/, '')),
        chainDepth: depth || null,
        chainMs: tree?.value?.longestChain?.duration ?? null,
        requests: requests.length,
        transferKB: Math.round(requests.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
        lcpElement: lcpEl ? (lcpEl.snippet || lcpEl.selector || '').slice(0, 90) : null,
    };
}

async function run(browser, url, visit) {
    const page = await browser.newPage();
    await answerThirdParties(page);
    const flags = {
        logLevel: 'error', output: 'json', onlyCategories: ['performance'],
        throttlingMethod: visit === 'first' ? 'simulate' : 'devtools',
        disableStorageReset: visit === 'repeat',
    };
    if (visit === 'repeat') {
        // Install the service worker and let it take control, as a first visit would have.
        await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => navigator.serviceWorker?.ready);
        await page.reload({ waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1500));
    }
    const result = await lighthouse(url, flags, undefined, page);
    const s = summarize(result.lhr);
    if (LHR_DIR) {
        mkdirSync(LHR_DIR, { recursive: true });
        writeFileSync(join(LHR_DIR, `${visit}-${new URL(url).pathname.replace(/\W+/g, '_')}-${Date.now()}.json`), JSON.stringify(result.lhr));
    }
    // Is the first painted frame of the filmstrip (Lighthouse's screenshot thumbnails) white?
    const thumbs = result.lhr.audits['screenshot-thumbnails']?.details?.items || [];
    s.frames = thumbs.length;
    s.whiteFrames = await countWhite(thumbs.map(t => t.data));
    await page.close();
    return s;
}

// How many filmstrip frames are (nearly) all white: each thumbnail is drawn on a canvas in a spare page and
// averaged. The page is dark once its CSS applies, so a white frame is one painted before that.
let decoder = null;
async function countWhite(urls) {
    if (!urls.length) return 0;
    const means = await decoder.evaluate(async (urls) => Promise.all(urls.map(async (u) => {
        const img = new Image(); img.src = u; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        return sum / (d.length / 4) / 3;
    })), urls);
    return means.filter(m => m > 240).length;
}

// ---------------------------------------------------------------- main

const fmt = (ms) => ms == null ? '-' : (ms / 1000).toFixed(2) + ' s';
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
decoder = await browser.newPage();
const all = [];
console.log(`Measuring ${REF ? `git ref ${REF}` : ROOT === REPO ? 'the working tree' : ROOT}: ${RUNS} run(s) per page, servers ${SERVERS.join(' + ')}, visits ${VISITS.join(' + ')}`);
for (const kind of SERVERS) {
    const server = await startServer(kind);
    const origin = `http://localhost:${server.address().port}`;
    for (const visit of VISITS) {
        for (const path of PAGES) {
            const runs = [];
            for (let i = 0; i < RUNS; i++) {
                // A fresh browser context per run: nothing cached, no service worker, no storage.
                const ctx = await browser.createBrowserContext();
                const s = await run(ctx, origin + path, visit);
                await ctx.close();
                runs.push(s);
            }
            const m = {};
            for (const k of Object.keys(runs[0])) {
                m[k] = typeof runs[0][k] === 'number' ? median(runs.map(r => r[k])) : runs[0][k];
            }
            all.push({ server: kind, visit, page: path, median: m, runs });
            console.log(`${kind.padEnd(5)} ${visit.padEnd(6)} ${path.padEnd(10)} score ${String(m.score).padStart(3)}  FCP ${fmt(m.fcp)}  LCP ${fmt(m.lcp)}  SI ${fmt(m.si)}  TTI ${fmt(m.tti)}  TBT ${Math.round(m.tbt)} ms  CLS ${m.cls?.toFixed(3)}  `
                + `blocking ${m.blockingMs ?? '-'} ms  chain ${m.chainDepth ?? '-'} deep / ${m.chainMs != null ? Math.round(m.chainMs) + ' ms' : '-'}  ${m.requests} req ${m.transferKB} KB  white frames ${m.whiteFrames}/${m.frames}`);
            console.log(`      LCP element: ${m.lcpElement}`);
            if (m.blockingUrls?.length) console.log(`      render-blocking: ${m.blockingUrls.join(', ')}`);
        }
    }
    server.close();
}
await browser.close();
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
