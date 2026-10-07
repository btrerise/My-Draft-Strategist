// Exported images draw the flex slots' blended colors (improvements F5). html2canvas 1.4.1, which both apps'
// image exports use, gets two of the site's blend styles wrong:
//   * Draft Strategist's Team tab: filled FLX, SFLX, W/T and W/R labels are gradient text (`background-clip: text`
//     in css/mds.css). html2canvas doesn't support that and painted each label's whole box with the gradient, so
//     Export Team showed color bars with no letters. js/mds/export.js now redraws them on canvases in its clone.
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

// Share of the pixels in a label's box that differ clearly from the card background behind it. Readable text
// leaves most of its box as background; the bug filled it all.
function inkCoverage(png, box) {
    const px = (x, y) => { const i = (y * png.width + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    // Background: just above the label, inside the slot's top padding.
    const bg = px(Math.round((box.x + 2) * SCALE), Math.round((box.y - 4) * SCALE));
    const x0 = Math.round(box.x * SCALE), x1 = Math.round((box.x + box.width) * SCALE);
    const y0 = Math.round(box.y * SCALE), y1 = Math.round((box.y + box.height) * SCALE);
    let ink = 0, total = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const [r, g, b] = px(x, y);
            if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 60) ink++;
            total++;
        }
    }
    return ink / total;
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
        // On the page they stay gradient text.
        const screenStyles = await labels.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundClip));
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
        }

        expect(clone.clipText, 'elements html2canvas would draw as a color block').toEqual([]);

        // The page itself is unchanged afterwards.
        expect(await labels.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundClip))).toEqual(screenStyles);
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
        const distance = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
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
