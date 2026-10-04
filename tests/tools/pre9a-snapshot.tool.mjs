// Makes tests/fixtures/pre-9a/ (refactor 9A): a browser's localStorage and IndexedDB as the code
// BEFORE 9A's normalizeName change left them, with player names that carry suffixes. name-keys.spec.mjs
// opens the apps on that snapshot and checks the saved keys still match.
//
// Opt-in and run once, against the old code. It writes the snapshot of whatever checkout serves the
// pages, so run it from a worktree of the commit before 9A's #7:
//
//   git worktree add /tmp/pre9a <commit before "Refactor 9A #7">
//   cp tests/tools/pre9a-snapshot.tool.mjs /tmp/pre9a/tests/tools/
//   ln -s "$PWD/tests/node_modules" /tmp/pre9a/tests/node_modules
//   cd /tmp/pre9a/tests && MAKE_PRE9A_SNAPSHOT=1 npx playwright test -c tools/playwright.config.mjs pre9a-snapshot --project=desktop
//   cp -r /tmp/pre9a/tests/fixtures/pre-9a <this checkout>/tests/fixtures/
//
// Without MAKE_PRE9A_SNAPSHOT it skips, so `npm run compare-css` (same config) never runs it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, showTab, callApp, seedMls, loadMlsRankings, RANKINGS_CSV } from '../helpers.mjs';

// Names whose suffix the old and new normalizeName both strip, plus Shayne Skov, one of the three
// Sleeper names whose key 9A changes ('shaynesko' -> 'shayneskov'), to show what that case does.
export const SUFFIX_ROWS = [
    "25,Marvin Harrison Jr.,WR,ARI,5,8",
    "26,Brian Thomas Jr.,WR,JAX,5,8",
    "27,Kenneth Walker III,RB,SEA,5,8",
    "28,Travis Etienne Jr.,RB,JAX,6,8",
    "29,Patrick Mahomes II,QB,KC,6,10",
    "30,D.J. Chark Jr.,WR,LAC,7,5",
    "31,Shayne Skov,RB,FA,8,",
];
export const SNAPSHOT_RANKINGS_CSV = RANKINGS_CSV.trimEnd() + '\n' + SUFFIX_ROWS.join('\n') + '\n';

const WR_CSV = [
    'Rank,Player,T-Score (A),Label,ADP,Exp T-Score,T-Score Diff,Classification,Yds/Gm,1st D/Gm,RZ Tgts',
    "1,Ja'Marr Chase,91.5,Elite,3.2,80.1,11.4,Value,98.1,4.9,22",
    '2,Marvin Harrison Jr.,77.7,High-End Starter,20,70,7.7,Value,70.2,3.9,12',
    '3,Brian Thomas Jr.,66.6,Strong Starter,15,60,6.6,Value,80.4,4.1,10',
    '4,D.J. Chark Jr.,44.4,Boom/Bust,150,50,-5.6,Avoid,30.1,1.5,4',
].join('\n');
const RB_CSV = [
    'Rank,Player,T-Score,Label,ADP,Exp T-Score,T-Score Diff,Classification,Scrimmage Yds/Gm,HVT/Gm',
    '1,Bijan Robinson,88.8,Strong Starter,2.0,70,18.8,Value,120.4,6.1',
    '2,Kenneth Walker III,55.5,Quality Contributor,40,50,5.5,Value,90.2,3.2',
    '3,Travis Etienne Jr.,52.2,Quality Contributor,45,55,-2.8,Avoid,85.0,2.9',
    '4,Shayne Skov,33.3,Depth,,,n/a,Sleeper,10,0.5',
].join('\n');

test('write the pre-9A storage snapshot', async ({ page }) => {
    test.skip(!process.env.MAKE_PRE9A_SNAPSHOT, 'opt-in: set MAKE_PRE9A_SNAPSHOT=1 (see the header)');

    // --- T-Score page: refresh from stubbed sheets, so tscore_cache / tscore_page_cache hold these names.
    await openApp(page, '/t-score/');
    await page.route(/^https:\/\/docs\.google\.com\/spreadsheets\//, (route) =>
        route.fulfill({ status: 200, contentType: 'text/csv', body: route.request().url().includes('2PACX-1vT9ckcq') ? WR_CSV : RB_CSV }));
    await page.locator('#tscoreRefreshBtn').click();
    await expect(page.locator('#mds-toast')).toContainText('T-Score data refreshed: 4 WRs, 4 RBs.');

    // --- Draft Strategist: T-Score badges on, the 31 players pasted, five picks.
    await openApp(page, '/');
    await page.evaluate(() => localStorage.setItem('mds_tscore', 'true'));
    await page.fill('#csvPasteArea', SNAPSHOT_RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    await expect(page.locator('.toast-message').filter({ hasText: 'Loaded 31 players' })).toBeVisible();
    await showTab(page, 'tracker');
    for (const mine of [true, false, false, true, false]) {
        await page.locator(mine ? '#trackerTab .btn-mine' : '#trackerTab .btn-draft').first().click();
    }
    await page.waitForLoadState('networkidle');

    // --- Lineup Strategist: the fixture league, then the same 31 players as ROS and Weekly rankings.
    await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page, SNAPSHOT_RANKINGS_CSV, 31);
    await callApp(page, 'showTab', 'roster');
    await page.waitForLoadState('networkidle');

    const storage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
    const idb = await page.evaluate(async () => {
        const out = {};
        for (const { name } of await indexedDB.databases()) {
            const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
            out[name] = {};
            for (const store of db.objectStoreNames) {
                out[name][store] = await new Promise((res, rej) => {
                    const entries = [];
                    const req = db.transaction(store).objectStore(store).openCursor();
                    req.onsuccess = () => { const c = req.result; if (!c) return res(entries); entries.push([c.key, c.value]); c.continue(); };
                    req.onerror = () => rej(req.error);
                });
            }
            db.close();
        }
        return out;
    });

    const dir = new URL('../fixtures/pre-9a/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL('storage.json', dir), JSON.stringify(storage, null, 1) + '\n');
    writeFileSync(new URL('idb.json', dir), JSON.stringify(idb) + '\n');
});
