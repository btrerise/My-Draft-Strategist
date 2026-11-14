// The image exports look the same on every device (improvements M17). html2canvas draws from a clone of the page as wide
// as the window, so before M17 an Export Lineup made on a phone came out 348px wide in the phone layout and one made on a
// computer 480px in the card's: different files for the same lineup. Export Trade is checked too (round 6). Each export now lays its clone out at a computer's
// width (EXPORT_WINDOW, js/shared/ui/exportImage.js) and pins the exported element to 480px, so the framed card with
// flat rows is what every device saves. html2canvas is served from tests/node_modules (the 1.4.1 the pages load), as in
// export-flex.spec.mjs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, callApp, seedMds, seedMls, loadMlsRankings } from './helpers.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const { PNG } = createRequire(import.meta.url)(here('./node_modules/playwright-core/lib/utilsBundle.js'));
const HTML2CANVAS = readFileSync(here('./node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8');

async function serveHtml2canvas(page) {
    await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
        (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: HTML2CANVAS }));
}

// Clicks the export at each window width and returns the decoded PNGs.
async function exportAt(page, button, widths) {
    const images = [];
    for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const download = page.waitForEvent('download');
        await page.click(button);
        images.push(PNG.sync.read(readFileSync(await (await download).path())));
        await expect(page.locator(button)).not.toContainText('Capturing');
    }
    return images;
}

function expectSameImage(phone, computer) {
    expect(phone.width, 'image width (scale 2)').toBe(960);
    expect([phone.width, phone.height]).toEqual([computer.width, computer.height]);
    let differ = 0;
    for (let i = 0; i < phone.data.length; i += 4) {
        if (phone.data[i] !== computer.data[i] || phone.data[i + 1] !== computer.data[i + 1] || phone.data[i + 2] !== computer.data[i + 2]) differ++;
    }
    expect(differ, 'pixels that differ between the phone and computer images').toBe(0);
}

test.describe('image exports are the same at 390px and 1280px', () => {
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'resizes the window itself'));

    test('Export Lineup', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await serveHtml2canvas(page);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        const [phone, computer] = await exportAt(page, '#exportBtn', [390, 1280]);
        expectSameImage(phone, computer);
        await expectClean(page, state);
    });

    test('Export Trade', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await serveHtml2canvas(page);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson']);
        await callApp(page, 'setTradePlayers', 'give', ['Derrick Henry']);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#exportTradeBtn')).toBeVisible();
        const [phone, computer] = await exportAt(page, '#exportTradeBtn', [390, 1280]);
        expectSameImage(phone, computer);
        await expectClean(page, state);
    });

    test('Export Team', async ({ page }) => {
        const state = await openApp(page, '/');
        await serveHtml2canvas(page);
        await seedMds(page);
        await showTab(page, 'team');
        const [phone, computer] = await exportAt(page, '#exportTeamBtn', [390, 1280]);
        expectSameImage(phone, computer);
        await expectClean(page, state);
    });
});
