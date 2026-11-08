#!/usr/bin/env node
// Link-preview images (improvements K3): the 1200×630 PNGs that chat apps, Facebook, Slack, Discord and X show when
// someone shares a link to the site. Each page's <head> points at one through og:image and twitter:image.
//
//   cd tests && npm run og-images            # redraws images/og-draft-N.png, og-lineup-N.png, og-tscore-N.png
//   npm run og-images -- --out /some/dir     # draws them somewhere else instead (to look before replacing)
//
// The owner's choice (K1, option C): the colored hero logo as it is (images/logo.svg, images/mls-logo.svg) on the
// site's navy, one line under it, and "mydraftstrategist.com · free, no ads" at the foot. T-Score uses Draft
// Strategist's logo with its own title. The approved drafts are docs/improvements/support/og-*-hero.png.
//
// Chat apps cache a preview for days, keyed by the image's URL, so the files carry a version: to change a picture,
// bump VERSION here, run this, and change the three pages' og:image, twitter:image (and K3's spec) to the new names.
// Keep each file under ~100 KB. Not in sw.js's PRECACHE_ASSETS: only link crawlers fetch them.
//
// Opt-in, never part of `npm run check`. The page is drawn from local files only (the logos and the site's own
// Outfit font), so the output doesn't depend on the network.
import { mkdirSync, readFileSync, statSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { chromiumLaunchOptions } from '../browser.mjs';

export const VERSION = 1;
const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

const FOOT = 'mydraftstrategist.com · free, no ads';
export const IMAGES = [
    { name: 'og-draft', logo: 'images/logo.svg', logoWidth: 980,
      line: 'Draft with your own rankings. Live Sleeper sync, tiers, a board and a recap.' },
    { name: 'og-lineup', logo: 'images/mls-logo.svg', logoWidth: 980,
      line: 'Every league, one place: lineups, waivers, trades and the week’s scoreboard.' },
    { name: 'og-tscore', logo: 'images/logo.svg', logoWidth: 740, title: 'The T-Score Model',
      line: 'A regression model for WR and RB fantasy production.' },
];

// Local files go in as data: URLs: a file:// image would taint the canvas trimLogo reads.
const dataUrl = (rel, type) => `data:${type};base64,${readFileSync(join(REPO, rel)).toString('base64')}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html({ logo, logoWidth, title, line }) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Outfit; font-weight: 400 700; src: url(${dataUrl('fonts/outfit-latin.woff2', 'font/woff2')}) format('woff2'); }
html, body { margin: 0; }
body {
    width: 1200px; height: 630px; overflow: hidden; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center;
    font-family: Outfit, sans-serif; color: #e2e8f0;
    /* The site's navy (--bg-color), with a soft green light from the top, as in the drafts. A top-to-bottom gradient
       rather than the drafts' round glow: every row is one colour, so the PNG stays small (the glow made ~140 KB). */
    background: linear-gradient(to bottom, #0c2424 0%, #0a0e17 62%);
}
main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; padding: 40px 100px 0; }
/* The logo files carry empty space above and below the words (logo.svg a lot): .logo is trimmed to the drawn part. */
.logo { width: ${logoWidth}px; overflow: hidden; }
img { width: ${logoWidth}px; height: auto; display: block; }
h1 { margin: 0; font-size: 36px; font-weight: 700; color: #f8fafc; }
.text { display: flex; flex-direction: column; align-items: center; gap: 4px; }
p { margin: 0; font-size: 34px; font-weight: 400; line-height: 1.4; color: #9ca3af; text-align: center; max-width: 900px; text-wrap: balance; }
footer { padding-bottom: 38px; font-size: 24px; font-weight: 600; color: #10b981; }
</style></head><body>
<main>
  <div class="logo"><img src="${dataUrl(logo, 'image/svg+xml')}" alt=""></div>
  <div class="text">${title ? `<h1>${esc(title)}</h1>` : ''}<p>${esc(line)}</p></div>
</main>
<footer>${esc(FOOT)}</footer>
</body></html>`;
}

// Runs in the page: finds the logo's first and last rows with any ink and crops .logo to them.
function trimLogo() {
    const img = document.querySelector('.logo img');
    const w = img.clientWidth, h = img.clientHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const inked = (y) => { for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) return true; return false; };
    let top = 0, bottom = h - 1;
    while (top < bottom && !inked(top)) top++;
    while (bottom > top && !inked(bottom)) bottom--;
    img.style.marginTop = `-${top}px`;
    img.parentElement.style.height = `${bottom - top + 1}px`;
}

async function main() {
    const args = process.argv.slice(2);
    const outIdx = args.indexOf('--out');
    const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(REPO, 'images');
    mkdirSync(outDir, { recursive: true });

    const work = mkdtempSync(join(tmpdir(), 'og-images-'));
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
        for (const img of IMAGES) {
            const file = join(work, `${img.name}.html`);
            writeFileSync(file, html(img));
            await page.goto(pathToFileURL(file).href);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
            await page.evaluate(trimLogo);
            const out = join(outDir, `${img.name}-${VERSION}.png`);
            await page.screenshot({ path: out, type: 'png' });
            const kb = statSync(out).size / 1024;
            console.log(`${out}  ${kb.toFixed(1)} KB${kb > 100 ? '  (over 100 KB: simplify the background)' : ''}`);
        }
    } finally {
        await browser.close();
        rmSync(work, { recursive: true, force: true });
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
