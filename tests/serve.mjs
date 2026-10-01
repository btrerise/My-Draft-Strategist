// Minimal static file server for the repo root, used by playwright.config.mjs.
// No dependencies, no caching, real 404s -- a missing file must fail a test, not fall back
// to index.html the way some dev servers do.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webp': 'image/webp',
};

createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = normalize(join(ROOT, path));
        if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
