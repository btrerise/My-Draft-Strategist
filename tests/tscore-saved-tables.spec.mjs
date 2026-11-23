// T-Score page: the preseason tables. Until improvements T3 a "Sync with most recent data" button fetched the preseason
// WR/RB sheets and saved what it drew (tscore_page_cache). The owner had the button removed: the page now never asks
// for the preseason sheets, a browser that synced before still draws its saved copy, and one that never did keeps the
// tables the page ships with. (The Refresh tests this replaces were written in refactor chunk 4B.)
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

// The preseason sheets only (the In-Season tab's sheet, 2PACX-1vRr7BzWe…, is left to preparePage's abort).
const SHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/(?!d\/e\/2PACX-1vRr7BzWe)/;

const BODY_IDS = ['top50WrBody', 'top50RbBody', 'valuesWrBody', 'valuesRbBody', 'sleepersWrBody', 'sleepersRbBody', 'avoidsWrBody', 'avoidsRbBody'];

async function bodies(page) {
    return page.evaluate((ids) => Object.fromEntries(ids.map(id => [id, document.getElementById(id).innerHTML])), BODY_IDS);
}

// What the Sync button saved, in its shape (the players of the old Refresh test).
const player = (o) => ({ cleanName: '', adp: '', expScore: '', diff: '', stat1: '', stat2: '', stat3: '', ...o });
const PAGE_CACHE = {
    wr: [
        player({ rank: 2, name: "Ja'Marr Chase", score: 91.5, label: 'Elite', cssClass: 'label-elite', adp: '3.2', expScore: '80.1', diff: '11.4', classification: 'Value', stat1: '98.1', stat2: '4.9', stat3: '22' }),
        player({ rank: 1, name: 'Puka <b>Nacua</b>', score: 95.25, label: 'High-End Starter', cssClass: 'label-high', adp: '5', expScore: '96', diff: '-0.75', classification: 'Avoid', stat1: '101.3', stat2: '5.2', stat3: '19' }),
        player({ rank: 3, name: 'Test Sleeper', score: 60, label: 'Mystery Label', cssClass: 'label-depth', diff: 'n/a', classification: 'Sleeper', stat1: '40', stat2: '2.1' }),
    ],
    rb: [
        player({ rank: 1, name: 'Bijan Robinson', score: 88.8, label: 'Strong Starter', cssClass: 'label-strong', classification: 'Value', stat1: '120.4', stat2: '6.1' }),
    ],
};

function watchSheets(page) {
    const requested = [];
    return page.route(SHEET_RE, (route) => { requested.push(route.request().url()); return route.abort(); }).then(() => requested);
}

test('a copy saved by the old Sync button still draws, and no preseason sheet is fetched', async ({ page }) => {
    let requested;
    await openApp(page, '/t-score/', {
        beforeGoto: async (p) => {
            requested = await watchSheets(p);
            await p.addInitScript((cache) => localStorage.setItem('tscore_page_cache', cache), JSON.stringify(PAGE_CACHE));
        },
    });
    const after = await bodies(page);
    // Top 50 sorted by rank; the name is escaped.
    expect(after.top50WrBody).toBe(
        '<tr><td>1</td><td><strong>Puka &lt;b&gt;Nacua&lt;/b&gt;</strong></td><td><span class="label-high">High-End Starter</span></td><td>95.25</td><td>101.3</td><td>5.2</td><td>19</td></tr>' +
        "<tr><td>2</td><td><strong>Ja'Marr Chase</strong></td><td><span class=\"label-elite\">Elite</span></td><td>91.50</td><td>98.1</td><td>4.9</td><td>22</td></tr>" +
        '<tr><td>3</td><td><strong>Test Sleeper</strong></td><td><span class="label-depth">Mystery Label</span></td><td>60.00</td><td>40</td><td>2.1</td><td></td></tr>');
    expect(after.valuesWrBody).toBe(
        "<tr><td>2</td><td><strong>Ja'Marr Chase</strong></td><td><span class=\"label-elite\">Elite</span></td><td>91.50</td><td>80.1</td><td><span class=\"val-badge val-fire\">+11.40</span></td><td>3.2</td><td>98.1</td><td>4.9</td><td>22</td></tr>");
    expect(after.sleepersWrBody).toBe(
        '<tr><td>3</td><td><strong>Test Sleeper</strong></td><td><span class="label-depth">Mystery Label</span></td><td>60.00</td><td></td><td><span class="val-badge val-warn">n/a</span></td><td></td><td>40</td><td>2.1</td><td></td></tr>');
    expect(after.avoidsWrBody).toContain('<span class="val-badge val-warn">-0.75</span>');
    expect(after.top50RbBody).toBe('<tr><td>1</td><td><strong>Bijan Robinson</strong></td><td><span class="label-strong">Strong Starter</span></td><td>88.80</td><td>120.4</td><td>6.1</td></tr>');
    expect(after.sleepersRbBody).toBe('');
    expect(requested).toEqual([]);
});

test('with no saved copy the tables the page ships with stay, and nothing is fetched or saved', async ({ page }) => {
    let requested;
    await openApp(page, '/t-score/', { beforeGoto: async (p) => { requested = await watchSheets(p); } });
    const shipped = await bodies(page);
    for (const id of BODY_IDS.filter(id => !id.startsWith('sleepersRb'))) expect(shipped[id], id).toContain('<tr>');
    expect(requested).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /^tscore_(page_)?cache/.test(k)))).toEqual([]);
});
