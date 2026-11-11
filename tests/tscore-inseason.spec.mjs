// T-Score page: the In-Season tab (improvements T1). It opens by default, fetches the four published CSVs of the
// "T-Score In-Season (public)" sheet on load (stubbed from tests/fixtures/tscore-inseason/, the real sheet's
// format), reads them by header name, saves a copy for the next visit and offline, and shows a plain message for a
// tab that lacks a column the table needs. Draft Strategist's T-Score cache is never written by it.
import { test, expect } from '@playwright/test';
import { openApp, stubInSeasonSheets, inSeasonFixture, IN_SEASON_SHEET_RE, expectClean } from './helpers.mjs';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const rows = (page) => page.locator('#inSeasonBody tr');
const cells = (row) => row.locator('td').allTextContents();

test('opens on In-Season and draws the sheet: WR, RB, TE, Move, Buy/Sell, the filter and the weights', async ({ page }) => {
    let requested;
    const state = await openApp(page, '/t-score/', { beforeGoto: async (p) => { requested = await stubInSeasonSheets(p); } });
    expect(requested.sort()).toEqual(['rb', 'te', 'weights', 'wr']);

    await expect(page.locator('#inSeasonTab')).toHaveClass(/\bactive\b/);
    await expect(page.locator('.tscore-nav-btn[data-tab="inSeasonTab"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#researchTab')).not.toHaveClass(/\bactive\b/);

    await expect(page.locator('#inSeasonStatus')).toHaveText('Updated today at 4:00 PM');
    await expect(page.locator('#inSeasonWeek')).toHaveText('Projected after week 9.');
    await expect(page.locator('#inSeasonMessage')).toBeHidden();

    await expect(rows(page)).toHaveCount(21);
    expect(await cells(rows(page).first())).toEqual(['1', 'Puka Nacua', 'LA', '22.14', '24.80', '36.1%', 'Up 1', '']);
    // Move: an arrow drawn as SVG, the number, and words for screen readers; 0 reads "No change".
    await expect(rows(page).nth(1).locator('.tscore-move.is-down svg[aria-hidden="true"]')).toHaveCount(1);
    expect(await cells(rows(page).nth(1))).toEqual(['2', 'Jaxon Smith-Njigba', 'SEA', '20.73', '25.78', '35.7%', 'Down 1', '']);
    await expect(rows(page).nth(2).locator('.tscore-move.is-flat')).toHaveText('No change–');
    const waddle = rows(page).filter({ hasText: 'Jaylen Waddle' });
    await expect(waddle.locator('.tscore-chip.tscore-chip-buy')).toHaveText('Buy');
    await expect(rows(page).filter({ hasText: 'DeMario Douglas' }).locator('.tscore-chip-sell')).toHaveText('Sell');

    // Buy & Sell only, then RB and TE (the filter stays on), then off again.
    const filter = page.getByRole('button', { name: 'Buy & Sell only' });
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(9);
    await page.locator('#inSeasonTab .pos-toggle-btn[data-pos="rb"]').click();
    await expect(page.locator('#inSeasonTab .pos-toggle-btn[data-pos="rb"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(6);
    await expect(rows(page).first()).toContainText('Omarion Hampton');
    await page.locator('#inSeasonTab .pos-toggle-btn[data-pos="te"]').click();
    await filter.click();
    await expect(rows(page)).toHaveCount(10);
    await expect(rows(page).first()).toContainText('Brock Bowers');

    // How it's projected: the formula, a row per position and the Buy/Sell lines.
    const panel = page.locator('#inSeasonTab details');
    await panel.locator('summary').click();
    await expect(panel).toContainText('The weights were fit after week 9.');
    expect(await page.locator('.tscore-weights-table tbody tr').first().locator('td').allInnerTexts())
        .toEqual(['WR', '0.8756', '0.6627', '0.4165', '0.2121', '1.9888', '0.54', '48']);
    await expect(panel).toContainText('Lines: WR 48, RB 36, TE 18.');
    await expect(page.locator('.tscore-credit')).toContainText('CC BY-SA 4.0');

    // Saved for the next visit; Draft Strategist's preseason T-Score cache is untouched.
    const saved = await page.evaluate(() => ({ inSeason: JSON.parse(localStorage.getItem('tscore_inseason_cache')), mds: localStorage.getItem('tscore_cache') }));
    expect(saved.mds).toBeNull();
    expect(saved.inSeason.wr).toHaveLength(21);
    expect(saved.inSeason.te[0]).toMatchObject({ rank: 1, name: 'Brock Bowers', team: 'LV', rosPpg: 17.45, move: 0, buySell: '' });
    expect(saved.inSeason.weights.fitWeek).toBe(9);
    await expectClean(page, state);
});

test('offline after a visit: the saved rankings, with a line saying they are the last that loaded', async ({ page }) => {
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
    await expect(rows(page)).toHaveCount(21);
    await page.unroute(IN_SEASON_SHEET_RE); // back to preparePage's abort: the sheet can't be reached
    await page.reload();
    await expect(page.locator('#inSeasonStatus')).toHaveText('Couldn’t reach the sheet, so these are the last rankings that loaded (Updated today at 4:00 PM).');
    await expect(rows(page)).toHaveCount(21);
    await expect(page.locator('#inSeasonMessage')).toBeHidden();
});

test('a first visit with no connection says so instead of an empty table', async ({ page }) => {
    const state = await openApp(page, '/t-score/'); // every outside request aborted
    await expect(page.locator('#inSeasonMessage')).toHaveText('The in-season rankings couldn’t load. Check your connection, then tap Sync with most recent data.');
    await expect(page.locator('#inSeasonTableWrap')).toBeHidden();
    await expect(page.locator('#inSeasonStatus')).toHaveText('');
    await expectClean(page, state); // no console.error for a sheet that can't be reached
});

test('columns are found by name: reordered, an extra column, and Move from YTD rank when Rank move is gone', async ({ page }) => {
    const wr = [
        'Notes,Buy/Sell,Team,Player,YTD rank,ros  rank,FP/G,ROS PPG,Target share',
        'x,Buy,DEN,Jaylen <b>Waddle</b>,56,41,9.11,9.71,20.1%',
        'x,,LA,Puka Nacua,2,1,24.80,22.14,36.1%',
        ',,,,,,,,',
    ].join('\n');
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p, { wr }) });
    await expect(rows(page)).toHaveCount(2);
    expect(await cells(rows(page).first())).toEqual(['1', 'Puka Nacua', 'LA', '22.14', '24.80', '36.1%', 'Up 1', '']);
    expect(await cells(rows(page).nth(1))).toEqual(['41', 'Jaylen <b>Waddle</b>', 'DEN', '9.71', '9.11', '20.1%', 'Up 15', 'Buy']);
});

test('a tab missing a column shows a plain message, and keeps the last good rankings when it has them', async ({ page }) => {
    const noTargetShare = inSeasonFixture('wr').split('\n').map(l => l.split(',').filter((_, i) => i !== 5).join(',')).join('\n');
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p, { wr: noTargetShare }) });
    await expect(page.locator('#inSeasonMessage')).toHaveText('The WR sheet is missing a column this table needs: Target share.');
    await expect(page.locator('#inSeasonTableWrap')).toBeHidden();
    await page.locator('#inSeasonTab .pos-toggle-btn[data-pos="rb"]').click(); // the other tabs still draw
    await expect(page.locator('#inSeasonMessage')).toBeHidden();
    await expect(rows(page)).toHaveCount(14);

    // With a good copy saved, the message says the table is that copy.
    await page.unroute(IN_SEASON_SHEET_RE);
    await stubInSeasonSheets(page);
    await page.reload();
    await expect(rows(page)).toHaveCount(21);
    await page.unroute(IN_SEASON_SHEET_RE);
    await stubInSeasonSheets(page, { wr: 'Player,Team\nPuka Nacua,LA' });
    await page.reload();
    await expect(page.locator('#inSeasonMessage')).toHaveText('The WR sheet is missing columns this table needs: ROS rank, ROS PPG, FP/G, Target share, Buy/Sell, Rank move. Showing the last WR rankings that loaded.');
    await expect(rows(page)).toHaveCount(21);
});

test('Sync with most recent data fetches the In-Season sheet again', async ({ page }) => {
    let requested;
    await openApp(page, '/t-score/', { beforeGoto: async (p) => { requested = await stubInSeasonSheets(p); } });
    await expect(rows(page)).toHaveCount(21);
    requested.length = 0;
    await page.locator('#tscoreRefreshBtn').click(); // the preseason sheets are aborted: its error toast is main.js's
    await expect.poll(() => requested.length).toBe(4);
    await expect(page.locator('#tscoreRefreshBtn')).toBeEnabled();
});

test('a #tab link still opens that tab, and Back returns to In-Season', async ({ page }) => {
    await openApp(page, '/t-score/#top50Tab', { beforeGoto: (p) => stubInSeasonSheets(p) });
    await expect(page.locator('#top50Tab')).toHaveClass(/\bactive\b/);
    await page.goto('/t-score/');
    await page.locator('.tscore-nav-btn[data-tab="researchTab"]').click();
    await page.goBack();
    await expect(page.locator('#inSeasonTab')).toHaveClass(/\bactive\b/);
});
