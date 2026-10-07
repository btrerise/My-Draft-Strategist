// Exported images draw the flex slots' blended colors (improvements F5). html2canvas 1.4.1, which both apps'
// image exports use, gets two of the site's blend styles wrong:
//   * Draft Strategist's Team tab: filled FLX, SFLX, W/T and W/R labels are gradient text (`background-clip: text`
//     in css/mds.css). html2canvas doesn't support that and painted each label's whole box with the gradient, so
//     Export Team showed color bars with no letters. js/mds/export.js now redraws them on canvases in its clone.
//     The same test checks the page's labels run through all their positions' colors: the gradient used to span
//     the label's 45px box, so the letters only showed its first half (fixed in the same round).
//   * Lineup Strategist's Lineup tab: the FLEX, SFLEX, W/T and W/R slot badges' blended border (a padding-box
//     fill over a border-box gradient, css/mls.css). html2canvas painted the fill over the border too, so Export
//     Lineup's FLEX badge lost its border. js/mls/trade/export.js now splits the two layers in its clone.
//
// html2canvas comes from cdnjs on first use (js/shared/ui/scriptLoader.js); helpers.mjs aborts that request, so
// this spec serves the same 1.4.1 build from tests/node_modules, with a small wrapper that records where things
// sit in the clone html2canvas draws from.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls, loadMlsRankings } from './helpers.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
// playwright-core's PNG codec, as tools/pxdiff.mjs loads it (its package.json doesn't export the path).
const { PNG } = createRequire(import.meta.url)(here('./node_modules/playwright-core/lib/utilsBundle.js'));

// After the app's own onclone has run, record the boxes of the Team tab's filled roster labels and the Lineup
// tab's slot badges relative to the captured container (the image's origin; html2canvas draws it at scale 2),
// and every element in the clone that still uses background-clip: text.
const RECORD_CLONE = `
;(() => {
    const original = window.html2canvas;
    window.html2canvas = (element, options = {}) => original(element, {
        ...options,
        onclone: async (doc) => {
            if (options.onclone) await options.onclone(doc);
            const container = doc.getElementById('exportableTeamContainer') || doc.getElementById('optimalLineupContainer');
            const origin = container.getBoundingClientRect();
            const view = doc.defaultView;
            const boxes = (selector) => [...container.querySelectorAll(selector)].map((el) => {
                const r = el.getBoundingClientRect();
                const label = el.textContent.trim() || el.querySelector('[aria-label]')?.getAttribute('aria-label');
                return { label, x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
            });
            window.__exportClone = {
                width: origin.width,
                labels: boxes('.roster-slot:not(.empty) .roster-label'),
                badges: boxes('.slot-badge'),
                clipText: [...container.querySelectorAll('*')]
                    .filter((el) => /text/.test(view.getComputedStyle(el).backgroundClip))
                    .map((el) => el.className || el.tagName),
            };
        },
    });
})();
`;
const HTML2CANVAS = readFileSync(here('./node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8') + RECORD_CLONE;

const SCALE = 2;

const distance = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);

// The pixels of a label's box (in CSS px, drawn at `scale`) that differ clearly from the background behind the
// letters, taken as the box's most common color.
function inkPixels(png, box, scale) {
    const px = (x, y) => { const i = (y * png.width + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    const x0 = Math.round(box.x * scale), x1 = Math.round((box.x + box.width) * scale);
    const y0 = Math.round(box.y * scale), y1 = Math.round((box.y + box.height) * scale);
    const counts = new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = px(x, y).join(); counts.set(k, (counts.get(k) || 0) + 1); }
    const bg = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0].split(',').map(Number);
    const ink = [];
    let total = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const color = px(x, y);
            if (distance(color, bg) > 60) ink.push({ x, color, strength: distance(color, bg) });
            total++;
        }
    }
    return { ink, total };
}

// Share of the label's box drawn in color. Readable text leaves most of it as background; the export bug filled it.
function inkCoverage(png, box, scale = SCALE) {
    const { ink, total } = inkPixels(png, box, scale);
    return ink.length / total;
}

// The colors at the two ends of the letters: the most solid pixel within `reach` CSS px of the first and the last
// ink column (edge pixels are blended with the background).
function letterEnds(png, box, scale, reach = 2) {
    const { ink } = inkPixels(png, box, scale);
    const xs = ink.map((p) => p.x);
    const first = Math.min(...xs), last = Math.max(...xs);
    const strongest = (pixels) => pixels.reduce((a, b) => (b.strength > a.strength ? b : a)).color;
    return {
        left: strongest(ink.filter((p) => p.x <= first + reach * scale)),
        right: strongest(ink.filter((p) => p.x >= last - reach * scale)),
    };
}

// --pos-*-border in css/base.css, and the positions each flex label's gradient runs through (--*-blend).
const POS = { QB: [239, 68, 68], RB: [16, 185, 129], WR: [59, 130, 246], TE: [245, 158, 11] };
const LABEL_POSITIONS = { 'W/R': ['RB', 'WR'], 'W/T': ['WR', 'TE'], FLX: ['RB', 'WR', 'TE'], SFLX: ['QB', 'RB', 'WR', 'TE'] };

// The first letter is closest to the first position's color and the last letter to the last's, among the label's
// positions (edge pixels are partly background, so it's the nearest color rather than an exact one).
function expectEnds(ends, label, where) {
    const positions = LABEL_POSITIONS[label];
    const nearest = (color) => positions.reduce((a, b) => (distance(color, POS[b]) < distance(color, POS[a]) ? b : a));
    expect(nearest(ends.left), `${where}: ${label} starts in ${positions[0]}'s color`).toBe(positions[0]);
    expect(nearest(ends.right), `${where}: ${label} ends in ${positions.at(-1)}'s color`).toBe(positions.at(-1));
}

test.describe('Exported images', () => {
    test('Draft Strategist Export Team: flex slot labels are readable', async ({ page }, testInfo) => {
        const state = await openApp(page, '/');
        // Registered after helpers.mjs's catch-all, so it runs first for this script.
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: HTML2CANVAS }));
        await seedMds(page); // my picks so far: Ja'Marr Chase (WR), Jahmyr Gibbs (RB)
        await showTab(page, 'tracker');
        for (let i = 0; i < 2; i++) await page.locator('#trackerTab .btn-mine').first().click(); // Barkley (RB), Nacua (WR)
        // Only flex-type starting slots, one of each, so the four picks fill W/R, W/T, FLX and SFLX.
        await page.evaluate(async () => {
            const { getActiveDraft } = await import('/js/mds/state.js');
            getActiveDraft().limits = { QB: 0, RB: 0, WR: 0, TE: 0, WRRB: 1, WT: 1, FLEX: 1, SFLEX: 1, K: 0, DEF: 0, BENCH: 5, TOTAL: 9 };
        });
        await showTab(page, 'team');

        const labels = page.locator('#exportableTeamContainer .roster-slot:not(.empty) .roster-label');
        await expect(labels).toHaveText(['W/R', 'W/T', 'FLX', 'SFLX']);
        // Each label runs through all its positions' colors, first letter to last (the gradient used to span the
        // label's 45px box, so the letters stopped about halfway: FLX never reached TE's yellow).
        await page.mouse.move(0, 0);
        for (const label of await labels.all()) {
            const r = await label.boundingBox();
            const shot = PNG.sync.read(await page.screenshot({ clip: r, animations: 'disabled' }));
            expectEnds(letterEnds(shot, { x: 0, y: 0, width: r.width, height: r.height }, 1), await label.innerText(), 'page');
        }

        // On the page they stay gradient text (on the label's inner span, which is as wide as the letters).
        const textStyles = (els) => els.map((el) => getComputedStyle(el.querySelector('.roster-label-text')).backgroundClip);
        const screenStyles = await labels.evaluateAll(textStyles);
        expect(screenStyles).toEqual(['text', 'text', 'text', 'text']);

        const download = page.waitForEvent('download');
        await page.click('#exportTeamBtn');
        const png = PNG.sync.read(readFileSync(await (await download).path()));
        await testInfo.attach('export.png', { body: PNG.sync.write(png), contentType: 'image/png' });

        const clone = await page.evaluate(() => window.__exportClone);
        expect(clone.labels.map((l) => l.label)).toEqual(['W/R', 'W/T', 'FLX', 'SFLX']);
        // 480px wide, or the screen's width on a phone (onclone's maxWidth: 100%).
        expect(png.width).toBe(Math.round(clone.width * SCALE));
        for (const box of clone.labels) {
            const coverage = inkCoverage(png, box);
            expect(coverage, `${box.label}: share of its box drawn in color`).toBeGreaterThan(0.05);
            expect(coverage, `${box.label}: share of its box drawn in color`).toBeLessThan(0.5);
            expectEnds(letterEnds(png, box, SCALE), box.label, 'export');
        }

        expect(clone.clipText, 'elements html2canvas would draw as a color block').toEqual([]);

        // The page itself is unchanged afterwards.
        expect(await labels.evaluateAll(textStyles)).toEqual(screenStyles);
        await expect(page.locator('#exportTeamBtn')).toContainText('Export');
        await expectClean(page, state);
    });

    test("Lineup Strategist Export Lineup: the FLEX slot badge keeps its blended border", async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: HTML2CANVAS }));
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');

        const badge = page.locator('#optimalLineupContainer .slot-badge.slot-FLEX');
        await expect(badge).toHaveText('FLEX');
        const screenClip = await badge.evaluate((el) => getComputedStyle(el).backgroundClip);
        expect(screenClip).toBe('padding-box, border-box');

        const download = page.waitForEvent('download');
        await page.click('#exportBtn');
        const png = PNG.sync.read(readFileSync(await (await download).path()));
        const clone = await page.evaluate(() => window.__exportClone);
        expect(png.width).toBe(Math.round(clone.width * SCALE));

        // The 1px border's middle, left and right: RB green (#10b981) and TE orange (#f59e0b), the ends of
        // --flex-blend. Before the fix it was the dark fill with a faint tint. html2canvas snaps edges to whole
        // pixels, so each side takes the closest of the few pixels around it.
        const box = clone.badges.find((b) => b.label === 'FLEX');
        const px = (x, y) => { const i = (y * png.width + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
        const midY = Math.round((box.y + box.height / 2) * SCALE);
        const closest = (x, color) => Math.min(...[-3, -2, -1, 0, 1, 2, 3].map((d) => distance(px(Math.round(x * SCALE) + d, midY), color)));
        expect(closest(box.x, [16, 185, 129]), 'left border is RB green').toBeLessThan(40);
        expect(closest(box.x + box.width, [245, 158, 11]), 'right border is TE orange').toBeLessThan(40);

        // The page itself is unchanged afterwards.
        expect(await badge.evaluate((el) => getComputedStyle(el).backgroundClip)).toBe(screenClip);
        await expect(badge).toHaveText('FLEX');
        await expectClean(page, state);
    });
});
