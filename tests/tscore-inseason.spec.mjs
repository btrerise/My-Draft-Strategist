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

    await expect(rows(page)).toHaveCount(22);
    // XFP/G and FPOE/G after FP/G (the fixture's are made up), FPOE/G signed with a real minus.
    await expect(page.locator('#inSeasonXfpTh')).toBeVisible();
    await expect(page.locator('#inSeasonFpoeTh')).toBeVisible();
    expect(await cells(rows(page).first())).toEqual(['1', 'Puka Nacua', 'Elite', 'LA', '22.14', '24.80', '23.30', '+1.50', '36.1%', 'Up 1', '']);
    // Move: an arrow drawn as SVG, the number, and words for screen readers; 0 reads "No change".
    await expect(rows(page).nth(1).locator('.tscore-move.is-down svg[aria-hidden="true"]')).toHaveCount(1);
    expect(await cells(rows(page).nth(1))).toEqual(['2', 'Jaxon Smith-Njigba', 'Elite', 'SEA', '20.73', '25.78', '26.78', '−1.00', '35.7%', 'Down 1', '']);
    await expect(rows(page).nth(2).locator('.tscore-move.is-flat')).toHaveText('No change–');
    const waddle = rows(page).filter({ hasText: 'Jaylen Waddle' });
    await expect(waddle.locator('.tscore-chip.tscore-chip-buy')).toHaveText('Buy');
    await expect(rows(page).filter({ hasText: 'DeMario Douglas' }).locator('.tscore-chip-sell')).toHaveText('Sell');

    // Labels by points: ROS PPG at or above Model Weights' cutoff (WR: Elite 15.9, High-End 14.3, Strong 12.2,
    // Quality 9.9, Flex Play 8.2), drawn with the preseason tabs' badges. Seven WRs reach Elite here, not a fixed five.
    const labelOf = (name) => rows(page).filter({ hasText: name }).locator('td').nth(2).locator('span');
    await expect(labelOf('Tee Higgins')).toHaveText('Elite'); // 15.96
    await expect(labelOf('Tee Higgins')).toHaveClass('label-elite');
    await expect(labelOf('Christian Watson')).toHaveText('High-End Starter'); // 15.79, just under 15.9
    await expect(labelOf('Christian Watson')).toHaveClass('label-high');
    await expect(labelOf('Matthew Golden')).toHaveText('High-End Starter'); // 14.47
    await expect(waddle.locator('.label-boom')).toHaveText('Flex Play'); // 9.71, under 9.9
    await expect(labelOf('DeMario Douglas')).toHaveText('Flex Play'); // 8.70
    await expect(labelOf('Dontayvion Wicks')).toHaveText('Depth Player'); // 8.01, under 8.2
    await expect(labelOf('Dontayvion Wicks')).toHaveClass('label-depth');
    expect(await page.locator('#inSeasonBody tr td:nth-child(3)').evaluateAll(tds => tds.filter(td => td.textContent === 'Elite').length)).toBe(7);

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
    // TE cutoffs: Elite 12.6, High-End 11.0, Strong 9.3, Quality 7.6. Kittle (13.74) is Elite; three High-End.
    expect(await page.locator('#inSeasonBody tr td:nth-child(3)').allTextContents()).toEqual([
        'Elite', 'Elite', 'Elite', 'High-End Starter', 'High-End Starter', 'High-End Starter',
        'Strong Starter', 'Quality Contributor', 'Quality Contributor', 'Quality Contributor']);

    // How it's projected: the formula, a row per position and the Buy/Sell lines.
    const panel = page.locator('#inSeasonTab details');
    await panel.locator('summary').click();
    await expect(panel).toContainText('The weights were fit after week 9.');
    expect(await page.locator('.tscore-weights-table tbody tr').first().locator('td').allInnerTexts())
        .toEqual(['WR', '0.8756', '0.6627', '0.4165', '0.2121', '1.9888', '0.54', '48']);
    await expect(panel).toContainText('Lines: WR 48, RB 36, TE 18.');
    const labelRows = page.locator('.tscore-labels-table tbody tr');
    expect(await labelRows.first().locator('td').allTextContents()).toEqual(['Elite', '15.9+', '17.1+', '12.6+']);
    expect(await labelRows.nth(4).locator('td').allTextContents()).toEqual(['Flex Play', '8.2+', '8.8+', '6.3+']);
    expect(await labelRows.nth(5).locator('td').allTextContents()).toEqual(['Depth Player', 'under 8.2', 'under 8.8', 'under 6.3']);
    await expect(panel).toContainText('(2016–2025 projections after week 9)');
    await expect(page.locator('.tscore-credit')).toContainText('CC BY-SA 4.0');

    // Saved for the next visit; Draft Strategist's preseason T-Score cache is untouched.
    const saved = await page.evaluate(() => ({ inSeason: JSON.parse(localStorage.getItem('tscore_inseason_cache')), mds: localStorage.getItem('tscore_cache') }));
    expect(saved.mds).toBeNull();
    expect(saved.inSeason.wr).toHaveLength(22);
    expect(saved.inSeason.te[0]).toMatchObject({ rank: 1, name: 'Brock Bowers', team: 'LV', rosPpg: 17.45, move: 0, buySell: '' });
    expect(saved.inSeason.weights.fitWeek).toBe(9);
    await expectClean(page, state);
});

test('offline after a visit: the saved rankings, with a line saying they are the last that loaded', async ({ page }) => {
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
    await expect(rows(page)).toHaveCount(22);
    await page.unroute(IN_SEASON_SHEET_RE); // back to preparePage's abort: the sheet can't be reached
    await page.reload();
    await expect(page.locator('#inSeasonStatus')).toHaveText('Couldn’t reach the sheet, so these are the last rankings that loaded (Updated today at 4:00 PM).');
    await expect(rows(page)).toHaveCount(22);
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
    expect(await cells(rows(page).first())).toEqual(['1', 'Puka Nacua', 'Elite', 'LA', '22.14', '24.80', '36.1%', 'Up 1', '']);
    expect(await cells(rows(page).nth(1))).toEqual(['41', 'Jaylen <b>Waddle</b>', 'Flex Play', 'DEN', '9.71', '9.11', '20.1%', 'Up 15', 'Buy']);
});

test('a tab missing a column shows a plain message, and keeps the last good rankings when it has them', async ({ page }) => {
    const withoutColumn = (csv, name) => {
        const lines = csv.split('\n'); const at = lines[0].split(',').indexOf(name);
        return lines.map(l => l.split(',').filter((_, i) => i !== at).join(',')).join('\n');
    };
    const noTargetShare = withoutColumn(inSeasonFixture('wr'), 'Target share');
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
    await expect(rows(page)).toHaveCount(22);
    await page.unroute(IN_SEASON_SHEET_RE);
    await stubInSeasonSheets(page, { wr: 'Player,Team\nPuka Nacua,LA' });
    await page.reload();
    await expect(page.locator('#inSeasonMessage')).toHaveText('The WR sheet is missing columns this table needs: ROS rank, ROS PPG, FP/G, Target share, Buy/Sell, Rank move. Showing the last WR rankings that loaded.');
    await expect(rows(page)).toHaveCount(22);
});

test('Sync with most recent data fetches the In-Season sheet again', async ({ page }) => {
    let requested;
    await openApp(page, '/t-score/', { beforeGoto: async (p) => { requested = await stubInSeasonSheets(p); } });
    await expect(rows(page)).toHaveCount(22);
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

test('a Label column in the sheet overrides the computed label', async ({ page }) => {
    const wr = inSeasonFixture('wr').replace('Buy/Sell', 'Buy/Sell,Label').replace(/\n1,Puka Nacua,LA,22.14,24.80,23.30,1.50,36.1%,2,1,/, '\n1,Puka Nacua,LA,22.14,24.80,23.30,1.50,36.1%,2,1,,Strong Starter')
        .replace(/\n2,Jaxon Smith-Njigba,(.*)/, '\n2,Jaxon Smith-Njigba,$1,Not a label');
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p, { wr }) });
    await expect(rows(page).first().locator('td').nth(2)).toHaveText('Strong Starter');
    await expect(rows(page).nth(1).locator('td').nth(2)).toHaveText('Elite'); // an unknown name: the computed label
});

test('"How it differs from the preseason T-Score" opens The Research at its In-Season section', async ({ page }) => {
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
    await page.getByRole('link', { name: 'How it differs from the preseason T-Score' }).click();
    await expect(page.locator('#researchTab')).toHaveClass(/\bactive\b/);
    await expect(page).toHaveURL(/#researchTab$/);
    const heading = page.locator('#inSeasonModel');
    await expect(heading).toHaveText('The In-Season Model: Rest-of-Season Points per Game');
    await expect(heading).toBeInViewport();
    await expect(page.locator('#researchTab .tscore-compare-table')).toContainText('Points cutoffs, at the same percentiles of past projections');
});

test('the page never scrolls sideways: only the table does', async ({ page }) => {
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
    await expect(rows(page)).toHaveCount(22);
    // The Move column's screen-reader words are absolutely placed; held by .tscore-move, not the page (they widened
    // a phone's page to 612px before).
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test('The Research\'s "What Changed" table fits the screen, phones included', async ({ page }) => {
    await openApp(page, '/t-score/#researchTab', { beforeGoto: (p) => stubInSeasonSheets(p) });
    const box = page.locator('#researchTab .tscore-compare-table').locator('..');
    expect(await box.evaluate(e => e.scrollWidth - e.clientWidth)).toBe(0);
});

test('without the cutoffs block in Model Weights, labels fall back to ROS rank', async ({ page }) => {
    const weights = inSeasonFixture('weights').split('\n').slice(0, 6).join('\n'); // the weights and "Fit after week" only
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p, { weights }) });
    const labelOf = (name) => rows(page).filter({ hasText: name }).locator('td').nth(2);
    await expect(labelOf('Chris Olave')).toHaveText('High-End Starter'); // rank 6: High-End by rank (Elite by points)
    await expect(labelOf('Tyquan Thornton')).toHaveText('Depth Player'); // rank 49, past the WR line of 48
    await page.locator('#inSeasonTab details summary').click();
    expect(await page.locator('.tscore-labels-table tbody tr').first().locator('td').allTextContents()).toEqual(['Elite', '1–5', '1–4', '1–2']);
});

test('XFP/G and FPOE/G show only when the sheet has them; FPOE/G is worked out when only XFP/G is there', async ({ page }) => {
    const drop = (csv, names) => {
        const lines = csv.split('\n'); const at = names.map(n => lines[0].split(',').indexOf(n));
        return lines.map(l => l.split(',').filter((_, i) => !at.includes(i)).join(',')).join('\n');
    };
    const wr = drop(inSeasonFixture('wr'), ['XFP/G', 'FPOE/G']);
    const rb = drop(inSeasonFixture('rb'), ['FPOE/G']);
    await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p, { wr, rb }) });
    // WR without both: the columns are hidden and the rows have none.
    await expect(page.locator('#inSeasonXfpTh')).toBeHidden();
    await expect(page.locator('#inSeasonFpoeTh')).toBeHidden();
    expect(await cells(rows(page).first())).toEqual(['1', 'Puka Nacua', 'Elite', 'LA', '22.14', '24.80', '36.1%', 'Up 1', '']);
    // RB with XFP/G only: FPOE/G = FP/G − XFP/G (Gibbs 26.04 − 24.54).
    await page.locator('#inSeasonTab .pos-toggle-btn[data-pos="rb"]').click();
    await expect(page.locator('#inSeasonFpoeTh')).toBeVisible();
    expect((await cells(rows(page).first())).slice(5, 8)).toEqual(['26.04', '24.54', '+1.50']);
});
