// Exported images draw numbers without stray gaps (improvements S19, round 12: found in my review as a user of Export
// Trade, which showed "(0- 10,000 )" and "(- 868 pts, 9%)"). Every page sets font-variant-numeric: tabular-nums on
// body (css/base.css: digits line up in columns). html2canvas 1.4.1 places each word where the browser laid it out,
// but draws it with the canvas's own text, which ignores that setting, so a word with digits came out narrower than
// its slot and left a gap after it. All three image exports now draw from a clone with proportional digits
// (js/shared/ui/exportImage.js). This spec records the clone html2canvas draws from, after each export's own onclone,
// and checks no text in it still asks for tabular digits.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const HTML2CANVAS = readFileSync(here('./node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8') + `
;(() => {
    const original = window.html2canvas;
    window.html2canvas = (element, options = {}) => original(element, {
        ...options,
        onclone: async (doc) => {
            if (options.onclone) await options.onclone(doc);
            const root = doc.getElementById(element.id);
            const view = doc.defaultView;
            window.__tabular = [...root.querySelectorAll('*')].filter((el) => {
                const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
                return /\\d/.test(own) && /tabular/.test(view.getComputedStyle(el).fontVariantNumeric);
            }).map((el) => el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40));
        },
    });
})();
`;
const serveHtml2Canvas = (page) => page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
    (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: HTML2CANVAS }));

async function exportAndCheck(page, buttonSelector) {
    const download = page.waitForEvent('download');
    await page.locator(buttonSelector).click();
    await download;
    const tabular = await page.evaluate(() => window.__tabular);
    expect(tabular, 'text drawn with tabular digits (gaps after numbers in the image)').toEqual([]);
}

test.describe('Exported images use proportional digits', () => {
    test('Lineup Strategist: Export Trade and Export Lineup', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await serveHtml2Canvas(page); // after helpers.mjs's catch-all, so it answers this script
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await callApp(page, 'setTradePlayers', 'get', ['Saquon Barkley']);
        await callApp(page, 'setTradePlayers', 'give', ["Ja'Marr Chase"]);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#tradeOutput')).toContainText('You Receive');
        await exportAndCheck(page, '#exportTradeBtn');
        // The page itself keeps its tabular digits.
        expect(await page.locator('#tradeOutput .trade-verdict-amount').first().evaluate(el => getComputedStyle(el).fontVariantNumeric)).toContain('tabular');

        await showTab(page, 'lineup');
        await exportAndCheck(page, '#exportBtn');
        await expectClean(page, state);
    });

    test('Draft Strategist: Export Team', async ({ page }) => {
        const state = await openApp(page, '/');
        await serveHtml2Canvas(page);
        await seedMds(page);
        await showTab(page, 'team');
        await exportAndCheck(page, '#exportTeamBtn');
        await expectClean(page, state);
    });
});
