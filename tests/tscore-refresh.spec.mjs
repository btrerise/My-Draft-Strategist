// T-Score page: the "Refresh" button (refreshTScoreData) and the cached render on the next load.
// Added in refactor chunk 4B, before the page's inline script moved to js/tscore/main.js, and
// run against main first so the expectations below are main's behavior.
//
// Google Sheets is stubbed per test (helpers.mjs aborts it by default, which is the third test).
import { test, expect } from '@playwright/test';
import { openApp, FIXED_NOW } from './helpers.mjs';

const WR_CSV = [
    'Rank,Player,T-Score (A),Label,ADP,Exp T-Score,T-Score Diff,Classification,Yds/Gm,1st D/Gm,RZ Tgts',
    "2,Ja'Marr Chase,91.5,Elite,3.2,80.1,11.4,Value,98.1,4.9,22",
    '1,Puka <b>Nacua</b>,95.25,High-End Starter,5,96,-0.75,Avoid,101.3,5.2,19',
    '3,Test Sleeper,60,Mystery Label,,,n/a,Sleeper,40,2.1,',
    ',,,,,,,,,,',
    'Notes row,,,,,,,,,,',
].join('\n');

const RB_CSV = [
    'Rank,Player,T-Score,Label,ADP,Exp T-Score,T-Score Diff,Classification,Scrimmage Yds/Gm,HVT/Gm',
    '1,Bijan Robinson,88.8,Strong Starter,2.0,70,18.8,Value,120.4,6.1',
    '2,"Robinson, Jr. Brian",40.05,Boom/Bust,90,50.5,-10.45,Avoid,60.2,2.2',
].join('\n');

const SHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\//;

// Which sheet a URL is (the page's TSCORE_SHEET_URLS, matched by their distinct ids).
const sheetOf = (url) => (url.includes('2PACX-1vT9ckcq') ? 'wr' : url.includes('2PACX-1vQD7lel') ? 'rb' : null);

const BODY_IDS = ['top50WrBody', 'top50RbBody', 'valuesWrBody', 'valuesRbBody', 'sleepersWrBody', 'sleepersRbBody', 'avoidsWrBody', 'avoidsRbBody'];

async function bodies(page) {
    return page.evaluate((ids) => Object.fromEntries(ids.map(id => [id, document.getElementById(id).innerHTML])), BODY_IDS);
}

test('Refresh pulls both sheets, re-renders every table and caches them for the next load', async ({ page }) => {
    const state = await openApp(page, '/t-score/');
    const staticBodies = await bodies(page);
    const requested = [];
    await page.route(SHEET_RE, (route) => {
        const pos = sheetOf(route.request().url());
        requested.push(pos);
        return route.fulfill({ status: 200, contentType: 'text/csv', body: pos === 'wr' ? WR_CSV : RB_CSV });
    });

    const btn = page.locator('#tscoreRefreshBtn');
    const origHtml = await btn.innerHTML();
    await btn.click();
    await expect(page.locator('#mds-toast')).toContainText('T-Score data refreshed: 3 WRs, 2 RBs.');
    expect(requested.sort()).toEqual(['rb', 'wr']);
    await expect(btn).toBeEnabled();
    expect(await btn.innerHTML()).toBe(origHtml);
    await expect(page.locator('#tscoreFreshness')).toHaveText('Sheet data: Updated today');

    const after = await bodies(page);
    // Top 50 sorted by rank; the name is escaped; an unknown label falls back to label-depth.
    expect(after.top50WrBody).toBe(
        '<tr><td>1</td><td><strong>Puka &lt;b&gt;Nacua&lt;/b&gt;</strong></td><td><span class="label-high">High-End Starter</span></td><td>95.25</td><td>101.3</td><td>5.2</td><td>19</td></tr>' +
        "<tr><td>2</td><td><strong>Ja'Marr Chase</strong></td><td><span class=\"label-elite\">Elite</span></td><td>91.50</td><td>98.1</td><td>4.9</td><td>22</td></tr>" +
        '<tr><td>3</td><td><strong>Test Sleeper</strong></td><td><span class="label-depth">Mystery Label</span></td><td>60.00</td><td>40</td><td>2.1</td><td></td></tr>');
    expect(after.valuesWrBody).toBe(
        "<tr><td>2</td><td><strong>Ja'Marr Chase</strong></td><td><span class=\"label-elite\">Elite</span></td><td>91.50</td><td>80.1</td><td><span class=\"val-badge val-fire\">+11.40</span></td><td>3.2</td><td>98.1</td><td>4.9</td><td>22</td></tr>");
    expect(after.sleepersWrBody).toBe(
        '<tr><td>3</td><td><strong>Test Sleeper</strong></td><td><span class="label-depth">Mystery Label</span></td><td>60.00</td><td></td><td><span class="val-badge val-warn">n/a</span></td><td></td><td>40</td><td>2.1</td><td></td></tr>');
    expect(after.avoidsWrBody).toContain('<span class="val-badge val-warn">-0.75</span>');
    expect(after.top50RbBody).toBe(
        '<tr><td>1</td><td><strong>Bijan Robinson</strong></td><td><span class="label-strong">Strong Starter</span></td><td>88.80</td><td>120.4</td><td>6.1</td></tr>' +
        '<tr><td>2</td><td><strong>Robinson, Jr. Brian</strong></td><td><span class="label-boom">Boom/Bust</span></td><td>40.05</td><td>60.2</td><td>2.2</td></tr>');
    expect(after.sleepersRbBody).toBe('');
    for (const id of BODY_IDS) expect(after[id], id).not.toBe(staticBodies[id]);

    const stored = await page.evaluate(() => ({
        cache: JSON.parse(localStorage.getItem('tscore_cache')),
        updated: localStorage.getItem('tscore_cache_updated'),
        page: JSON.parse(localStorage.getItem('tscore_page_cache')),
    }));
    // The compact {cleanName: {s, l, c}} map MDS reads, keyed by the shared normalizeName.
    expect(stored.cache).toEqual({
        jamarrchase: { s: 91.5, l: 'Elite', c: 'label-elite' },
        pukabnacuab: { s: 95.25, l: 'High-End Starter', c: 'label-high' },
        testsleeper: { s: 60, l: 'Mystery Label', c: 'label-depth' },
        bijanrobinson: { s: 88.8, l: 'Strong Starter', c: 'label-strong' },
        robinsonjrbrian: { s: 40.05, l: 'Boom/Bust', c: 'label-boom' },
    });
    expect(stored.updated).toBe(String(FIXED_NOW.getTime()));
    expect(stored.page.wr).toHaveLength(3);
    expect(stored.page.rb).toHaveLength(2);
    expect(stored.page.wr[0]).toEqual({
        rank: 2, name: "Ja'Marr Chase", cleanName: 'jamarrchase', score: 91.5, label: 'Elite', cssClass: 'label-elite',
        adp: '3.2', expScore: '80.1', diff: '11.4', classification: 'Value', stat1: '98.1', stat2: '4.9', stat3: '22',
    });
    expect(Object.keys(stored.page.rb[0])).toEqual(
        ['rank', 'name', 'cleanName', 'score', 'label', 'cssClass', 'adp', 'expScore', 'diff', 'classification', 'stat1', 'stat2']);
    await expectNoErrors(state);

    // Next load renders from tscore_page_cache with no fetch at all.
    await page.unroute(SHEET_RE);
    requested.length = 0;
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(requested).toEqual([]);
    expect(await bodies(page)).toEqual(after);
    await expect(page.locator('#tscoreFreshness')).toHaveText('Sheet data: Updated today');
    await expectNoErrors(state);
});

async function expectRefreshError(page, state, expectedMessage, errorType = 'Error') {
    const btn = page.locator('#tscoreRefreshBtn');
    const origHtml = await btn.innerHTML();
    const staticBodies = await bodies(page);
    await btn.click();
    const toast = page.locator('#mds-toast');
    await expect(toast).toHaveClass(/toast-error/);
    await expect(toast).toContainText(`Could not refresh T-Score data:\n${expectedMessage}`, { useInnerText: true });
    await expect(btn).toBeEnabled();
    expect(await btn.innerHTML()).toBe(origHtml);
    expect(await bodies(page)).toEqual(staticBodies);
    await expect(page.locator('#tscoreFreshness')).toHaveText('');
    // Nothing cached. (The page writes one key on load since 6B: the marker of its storage-key rename.)
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('tscore')))).toEqual(['tscore_key_names_version']);
    // refreshTScoreData logs the error with console.error; that's the only error expected.
    // Only its first line is compared: the stack under it names the script's file and lines.
    expect(state.errors.map(e => e.split('\n')[0])).toEqual([`console.error: ${errorType}: ${expectedMessage}`]);
}

test('Refresh error: a sheet answers HTTP 500', async ({ page }) => {
    const state = await openApp(page, '/t-score/');
    await page.route(SHEET_RE, (route) => sheetOf(route.request().url()) === 'rb'
        ? route.fulfill({ status: 500, contentType: 'text/plain', body: 'nope' })
        : route.fulfill({ status: 200, contentType: 'text/csv', body: WR_CSV }));
    await expectRefreshError(page, state, 'Could not fetch RB sheet (HTTP 500)');
});

test('Refresh error: the sheet request fails (Google blocked)', async ({ page }) => {
    const state = await openApp(page, '/t-score/');
    await expectRefreshError(page, state, 'Failed to fetch', 'TypeError');
});

async function expectNoErrors(state) {
    expect(state.errors, 'page errors').toEqual([]);
}
