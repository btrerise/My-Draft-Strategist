// Viewing a saved ranking set (improvements S30): "View" beside "Choose leagues…" opens the set read-only in the shared
// sheet, with a search box and a position filter, its name and when it was saved; rank, player and NFL team, position
// and position rank, tier, and who has him in the open league; a name that didn't match a Sleeper player is flagged.
//
// Setup: the synced Fixture League (one league, so the row under the drop-down holds just "View") and a ROS set from
// rankings-waivers.csv (24 rostered players, 6 free agents) plus one name Sleeper doesn't know.
import { test, expect } from '@playwright/test';
import { openApp, seedMls, showTab, callApp, FIXED_NOW, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const CSV = WAIVER_RANKINGS_CSV.trimEnd() + '\n31,Zzyzx Notaplayer,WR,KC,6,10\n';
const TOTAL = 31;

async function openRosCard(page) {
    await showTab(page, 'roster');
    const toggle = page.locator('#rosRankingsCard .rankings-card-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(page.locator('#rosRankingSetSelect')).toBeVisible();
}

async function uploadRos(page, name, csv = CSV) {
    await openRosCard(page);
    await page.locator('#rosRankingSetSelect').selectOption('__new__');
    await page.fill('#rosNewSetName', name);
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
    await openRosCard(page);
}

async function setUp(page) {
    await openApp(page, '/lineup/');
    await seedMls(page);
    await uploadRos(page, 'ROS Redraft');
}

async function openView(page) {
    const link = page.locator('#rosSetLeaguesRow .mls-view-set-btn');
    await expect(link).toBeVisible();
    await link.click();
    const sheet = page.getByRole('dialog', { name: 'ROS Redraft' });
    await expect(sheet).toBeVisible();
    // Sleeper's player map is in (the upload preview loaded it), so the names are checked.
    await expect(sheet.locator('.rset-unmatched')).toBeVisible();
    return sheet;
}

const visibleRows = (sheet) => sheet.locator('.rset-table tbody tr:not([hidden])');
const rowFor = (sheet, name) => sheet.locator('.rset-table tbody tr').filter({ has: sheet.page().locator('.rset-name', { hasText: name }) });

test('View opens the set read-only: name, when saved, ranks, positions, teams, tiers and who has him', async ({ page }) => {
    await setUp(page);
    // One league: no summary or Choose leagues…, only View.
    await expect(page.locator('#rosSetLeaguesSummary')).toBeHidden();
    await expect(page.locator('#rosSetLeaguesRow .mls-choose-leagues-btn')).toBeHidden();
    await expect(page.locator('#rosSetLeaguesRow .mls-view-set-btn')).toHaveAccessibleName('View this ranking set');

    // An SoS grid entry for Baltimore's RBs, so Henry's row has the Roster tab's SoS badge.
    await page.evaluate(async () => { (await import('/js/mls/state.js')).State.sosMap.BAL = { RB: '5' }; });
    const sheet = await openView(page);
    await expect(sheet.locator('.rset-meta')).toHaveText(new RegExp(`^ROS rankings · ${TOTAL} players · Saved `));
    // A table with column headers and a row header per player, for screen readers.
    await expect(sheet.locator('.rset-table thead th')).toHaveText(['#', 'Player', 'Pos', 'Tier', 'SoS']);
    await expect(sheet.getByRole('rowheader')).toHaveCount(TOTAL);
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);
    await expect(sheet.locator('.rset-count')).toHaveText(`${TOTAL} players`);

    // Rank, team and the position rank the Lineup and Roster tabs show: worked out from the file's order (F6), so
    // Derrick Henry (15th overall) is RB5. Tier 3, and on your roster.
    const henry = rowFor(sheet, 'Derrick Henry');
    await expect(henry.locator('.rset-rank')).toHaveText('15');
    await expect(henry.locator('.rset-player .badge').first()).toHaveText('BAL');
    await expect(henry.locator('.rset-pos .pos-badge.RB')).toHaveText('RB5');
    await expect(henry.locator('.rset-tier')).toHaveText('(T3)');
    await expect(henry.locator('.status-mine')).toHaveText('Yours');
    await expect(henry.locator('.rset-sos .sos-badge')).toHaveAccessibleName(/^Strength of schedule: 5 of 32 for RBs on BAL/);
    await expect(rowFor(sheet, 'Bijan Robinson').locator('.rset-sos .sos-badge')).toHaveCount(0);
    // Another team's player names that team; a free agent carries no mark.
    await expect(rowFor(sheet, 'Bijan Robinson').locator('.status-owned')).toHaveText('Rival');
    await expect(rowFor(sheet, 'James Cook').locator('.scout-status')).toHaveCount(0);
    await expect(rowFor(sheet, 'James Cook').locator('.rset-pos')).toHaveText('RB8');
});

test('Search and the position filter hide rows; the empty state clears', async ({ page }) => {
    await setUp(page);
    const sheet = await openView(page);
    const search = sheet.getByRole('searchbox', { name: 'Search this set' });

    await search.fill('henry');
    await expect(visibleRows(sheet)).toHaveCount(1);
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText('Derrick Henry');
    await expect(sheet.locator('.rset-count')).toHaveText(`Showing 1 of ${TOTAL}`);
    // A team code finds its players too, and accents and punctuation don't matter ("amonra" finds Amon-Ra).
    await search.fill('amonra');
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText('Amon-Ra St. Brown');
    // Without an SoS grid the column isn't there.
    await expect(sheet.locator('.rset-table thead .rset-sos')).toBeHidden();
    await search.fill('');

    // TE only: Bowers, McBride, Kittle and LaPorta. The chip says how many, and only it stays lit.
    const te = sheet.getByRole('button', { name: 'TE 4' });
    await te.click();
    await expect(te).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: `All ${TOTAL}` })).toHaveAttribute('aria-pressed', 'false');
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Brock Bowers', 'Trey McBride', 'George Kittle', 'Sam LaPorta']);
    // Search within the filter.
    await search.fill('kit');
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['George Kittle']);

    // Yours, and Free agents (the six nobody rosters).
    await search.fill('');
    // Yours: the 12 of your 14 in the file (your K and DEF aren't in it).
    await sheet.getByRole('button', { name: 'Yours 12' }).click();
    await expect(visibleRows(sheet)).toHaveCount(12);
    await sheet.getByRole('button', { name: 'Free agents 6' }).click();
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Jayden Daniels', 'James Cook', 'Jaxon Smith-Njigba', 'Chase Brown', 'Zay Flowers', 'Sam LaPorta']);

    // Nothing matches: the table goes, a sentence says so, and one button clears both.
    await search.fill('zzzz');
    await expect(sheet.locator('.rset-table')).toBeHidden();
    await expect(sheet.locator('.rset-empty p')).toHaveText('No players match "zzzz" in free agents.');
    await sheet.getByRole('button', { name: 'Clear search and filter' }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);
    await expect(sheet.locator('.rset-empty')).toBeHidden();
});

test('A name that didn\'t match a Sleeper player is flagged, as the upload preview flags it', async ({ page }) => {
    await setUp(page);
    const sheet = await openView(page);
    await expect(sheet.locator('.rset-unmatched .preview-unmatched-title')).toHaveText(`1 of ${TOTAL} names didn't match a Sleeper player`);
    const row = rowFor(sheet, 'Zzyzx Notaplayer');
    await expect(row.locator('.rset-nomatch-badge')).toHaveText('No Sleeper match');
    // The file said WR, but nothing the app reads knows him: no position, no team, not a free agent.
    await expect(row.locator('.rset-pos')).toHaveText('–');
    await expect(row.locator('.rset-player .badge:not(.rset-nomatch-badge)')).toHaveCount(0);
    await expect(sheet.locator('.rset-nomatch-badge')).toHaveCount(1);
    await sheet.getByRole('button', { name: 'No match 1' }).click();
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Zzyzx Notaplayer']);
});

test('Any saved set can be picked inside the view, without changing the league\'s set; an empty set says so', async ({ page }) => {
    await setUp(page);
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000)); // set ids are 'rset_' + Date.now()
    await uploadRos(page, 'Short List', 'Rank,Player,Pos,Team,Tier\n1,Josh Allen,QB,BUF,1\n2,Lamar Jackson,QB,BAL,1\n');
    // An empty set (an old upload, say) is listed too.
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        State.rankingSets.ros.push({ id: 'rset_empty', name: 'Empty Set', createdAt: 1, updatedAt: 1, data: [] });
    });
    await page.locator('#rosSetLeaguesRow .mls-view-set-btn').click();
    let sheet = page.getByRole('dialog', { name: 'Short List' });
    await expect(sheet).toBeVisible();
    await expect(visibleRows(sheet)).toHaveCount(2);

    const picker = page.getByRole('combobox', { name: 'Ranking set to view' }); // the dialog's name follows the set
    await picker.selectOption({ label: `ROS Redraft (${TOTAL} players)` });
    sheet = page.getByRole('dialog', { name: 'ROS Redraft' });
    await expect(sheet.locator('.rset-meta')).toContainText(`${TOTAL} players`);
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);

    await picker.selectOption({ label: 'Empty Set (0 players)' });
    sheet = page.getByRole('dialog', { name: 'Empty Set' });
    await expect(sheet.locator('.rset-empty p')).toHaveText('This set has no players.');
    await expect(sheet.getByRole('button', { name: 'Clear search and filter' })).toBeHidden();
    await expect(sheet.locator('.rset-table')).toHaveCount(0);

    // The league still uses the set picked in the card.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#rosRankingSetSelect option:checked')).toHaveText(/^Short List/);
});

test('Escape clears the search first, then closes; Back closes it; focus goes back to View', async ({ page }) => {
    await setUp(page);
    const sheet = await openView(page);
    const search = sheet.getByRole('searchbox', { name: 'Search this set' });
    await search.fill('allen');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(sheet).toBeVisible();
    await search.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('#rosSetLeaguesRow .mls-view-set-btn')).toBeFocused();

    // Tab stays inside while it's open.
    await openView(page);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.sheet.rset-view'))).toBe(true);

    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#rosterTab')).toBeVisible();
});

test('The Weekly card and the In-Season picker have View too', async ({ page }) => {
    await setUp(page);
    // A dynasty league with ROS Redraft as its In-Season set.
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        const l = State.leagues[0];
        const dyn = { id: 'rset_dyn', name: 'Dynasty SF', createdAt: 1, updatedAt: 1, data: State.rankingSets.ros[0].data.slice(0, 5) };
        State.rankingSets.ros.push(dyn);
        l.leagueType = 'dynasty';
        l.seasonRankingSetId = l.rosRankingSetId;
        l.rosRankingSetId = dyn.id;
    });
    await callApp(page, 'switchActiveLeague', await page.evaluate(async () => (await import('/js/mls/state.js')).State.activeLeagueId));
    await openRosCard(page);
    const seasonView = page.locator('#seasonSetLeaguesRow .mls-view-set-btn');
    await expect(seasonView).toHaveAccessibleName('View this In-Season set');
    await seasonView.click();
    const sheet = page.getByRole('dialog', { name: 'ROS Redraft' });
    await expect(sheet.locator('.rset-meta')).toHaveText(/^In-⁠Season rankings · /);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    // Weekly: upload a Weekly set on the Lineup tab, then View it.
    await showTab(page, 'lineup');
    const toggle = page.locator('#weeklyRankingsCard .rankings-card-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await page.locator('#weeklyRankingSetSelect').selectOption('__new__');
    await page.fill('#weeklyNewSetName', 'Week 10');
    await page.setInputFiles('#weeklyFileInput', { name: 'week.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await callApp(page, 'confirmRankingsPreview');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await page.locator('#weeklySetLeaguesRow .mls-view-set-btn').click();
    const weekly = page.getByRole('dialog', { name: 'Week 10' });
    await expect(weekly.locator('.rset-meta')).toHaveText(new RegExp(`^Weekly rankings · ${TOTAL} players`));
});

test('Phones get it at full height; computers a wider panel than the legend\'s', async ({ page }, testInfo) => {
    await setUp(page);
    const sheet = await openView(page);
    const box = await sheet.boundingBox();
    const vp = page.viewportSize();
    if (testInfo.project.name === 'phone') {
        expect(box.height).toBeGreaterThan(vp.height - 60);
        expect(box.width).toBe(vp.width);
    } else {
        expect(Math.round(box.width)).toBe(640);
        expect(Math.round(box.height)).toBe(vp.height);
    }
    // The search box and the chips stay in sight once the list has scrolled.
    await sheet.locator('.sheet-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(sheet.locator('.rset-search')).toBeInViewport();
});
