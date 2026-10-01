#!/usr/bin/env node
// Checks sw.js's PRECACHE_ASSETS against the files the precached pages actually load.
//
//   node scripts/check-precache.mjs
//
// Fails (exit 1) when:
//   * a precached path doesn't exist on disk -- cache.addAll is all-or-nothing, so one 404
//     means nothing gets precached, and sw.js swallows that error silently;
//   * a precached page loads a local script or stylesheet that isn't precached -- directly,
//     through a static `import`/`export ... from`, or via `new Worker(...)` -- which leaves
//     that page broken on a first offline load.
//   * a precached .js/.css file is loaded by none of the precached pages (stale entry).
//
// No dependencies; plain regex parsing, which is enough for this codebase's import style.
// Worker URLs are resolved against the page URL (that's how `new Worker('x.js')` behaves),
// not against the module that calls it.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function diskPath(urlPath) {
    let p = join(ROOT, decodeURIComponent(urlPath));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    return p;
}

function readPrecacheList() {
    const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    const m = sw.match(/const\s+PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!m) throw new Error('Could not find PRECACHE_ASSETS in sw.js');
    const body = m[1].replace(/\/\/.*$/gm, '');
    return [...body.matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]);
}

const isLocal = (u) => !/^(?:[a-z]+:)?\/\//i.test(u) && !u.startsWith('data:');
const stripQuery = (u) => u.split(/[?#]/)[0];
// Resolves a reference against the URL path of the file (or page) that contains it.
function resolveRef(ref, baseUrlPath) {
    const baseDir = baseUrlPath.endsWith('/') ? baseUrlPath : posix.dirname(baseUrlPath) + '/';
    return posix.normalize(ref.startsWith('/') ? ref : posix.join(baseDir, ref));
}

function pageAssets(pageUrl) {
    const html = readFileSync(diskPath(pageUrl), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const out = [];
    for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) out.push(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
        if (!/rel=["']stylesheet["']/i.test(m[0])) continue;
        const href = m[0].match(/href=["']([^"']+)["']/i);
        if (href) out.push(href[1]);
    }
    return out.filter(isLocal).map(u => resolveRef(stripQuery(u), pageUrl));
}

// Follows static imports from a JS file; Worker targets are resolved against the page.
function walkJs(fileUrl, pageUrl, seen) {
    if (seen.has(fileUrl)) return;
    seen.add(fileUrl);
    const p = diskPath(fileUrl);
    if (!existsSync(p)) return; // reported as missing by the caller
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/(?:^|[;\s])(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/gm)) {
        if (isLocal(m[1])) walkJs(resolveRef(m[1], fileUrl), pageUrl, seen);
    }
    for (const m of src.matchAll(/(?:^|[;\s])import\s*['"]([^'"]+)['"]/gm)) {
        if (isLocal(m[1])) walkJs(resolveRef(m[1], fileUrl), pageUrl, seen);
    }
    for (const m of src.matchAll(/new\s+Worker\(\s*['"]([^'"]+)['"]/g)) {
        if (isLocal(m[1])) walkJs(resolveRef(m[1], pageUrl), pageUrl, seen);
    }
}

const precache = readPrecacheList();
const precached = new Set(precache.map(u => posix.normalize(u)));
const problems = [];

for (const url of precache) {
    if (!existsSync(diskPath(url))) problems.push(`missing on disk: ${url} (cache.addAll would fail and precache nothing)`);
}

const pages = precache.filter(u => u.endsWith('/') || u.endsWith('.html'));
const needed = new Map(); // asset -> first page that loads it
for (const page of pages) {
    if (!existsSync(diskPath(page))) continue;
    for (const asset of pageAssets(page)) {
        const seen = new Set();
        if (asset.endsWith('.js') || asset.endsWith('.mjs')) walkJs(asset, page, seen);
        else seen.add(asset);
        for (const a of seen) if (!needed.has(a)) needed.set(a, page);
    }
}

for (const [asset, page] of needed) {
    if (!existsSync(diskPath(asset))) problems.push(`${page} loads ${asset}, which doesn't exist`);
    else if (!precached.has(asset)) problems.push(`not precached: ${asset} (loaded by ${page})`);
}
for (const url of precached) {
    if (/\.(js|mjs|css)$/.test(url) && !needed.has(url)) problems.push(`stale precache entry: ${url} (no precached page loads it)`);
}

if (problems.length) {
    console.error(`check-precache: ${problems.length} problem(s)\n  - ` + problems.join('\n  - '));
    process.exit(1);
}
console.log(`check-precache: OK (${precache.length} precached, ${pages.length} pages, ${needed.size} scripts/styles checked)`);
