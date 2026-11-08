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

const visibleRows = (sheet) => sheet.locator('.rset-table tbody tr.rset-row:not([hidden])');
const visibleTierLines = (sheet) => sheet.locator('.rset-table tbody tr.rset-tier-row:not([hidden])');
const rowFor = (sheet, name) => sheet.locator('.rset-table tbody tr').filter({ has: sheet.page().locator('.rset-name', { hasText: name }) });

test('View opens the set read-only: name, when saved, ranks, positions, teams, tiers and who has him', async ({ page }) => {
    await setUp(page);
    // One league: no summary or Choose leagues…, only View.
    await expect(page.locator('#rosSetLeaguesSummary')).toBeHidden();
    await expect(page.locator('#rosSetLeaguesRow .mls-choose-leagues-btn')).toBeHidden();
    await expect(page.locator('#rosSetLeaguesRow .mls-view-set-btn')).toHaveAccessibleName('View the players in this ranking set');

    // An SoS grid entry for Baltimore's RBs, so Henry's row has the Roster tab's SoS badge.
    await page.evaluate(async () => { (await import('/js/mls/state.js')).State.sosMap.BAL = { RB: '5' }; });
    const sheet = await openView(page);
    await expect(sheet.locator('.rset-meta')).toHaveText(new RegExp(`^ROS rankings · ${TOTAL} players · Saved \\d\\d/\\d\\d/\\d\\d$`));
    // A table with column headers and a row header per player, for screen readers.
    await expect(sheet.locator('.rset-table thead th')).toHaveText(['#', 'Player', 'Pos', 'SoS']);
    await expect(sheet.getByRole('rowheader')).toHaveCount(TOTAL);
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);
    await expect(sheet.locator('.rset-count')).toHaveText(`${TOTAL} players`);

    // Rank, team and the position rank the Lineup and Roster tabs show: worked out from the file's order (F6), so
    // Derrick Henry (15th overall) is RB5, and on your roster.
    const henry = rowFor(sheet, 'Derrick Henry');
    await expect(henry.locator('.rset-rank')).toHaveText('15');
    await expect(henry.locator('.rset-player .badge').first()).toHaveText('BAL');
    await expect(henry.locator('.rset-pos .pos-badge.RB')).toHaveText('RB5');
    // Tiers are lines over the list (round 2), one where each starts: the file's tiers 1 to 5, and 6 (Zzyzx).
    await expect(visibleTierLines(sheet)).toHaveText(['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Tier 6']);
    expect(await henry.evaluate(tr => { let p = tr.previousElementSibling; while (p && !p.classList.contains('rset-tier-row')) p = p.previousElementSibling; return p && p.textContent; })).toBe('Tier 3');
    // Who has him (round 5): yours have their rank in a blue chip, and say "yours" to a screen reader; nobody else is
    // marked, so every row is one line.
    await expect(henry.locator('.rset-rank .rset-rank-chip.is-mine')).toHaveText('15');
    await expect(henry.locator('.rset-rank-chip')).toHaveAttribute('title', 'Yours');
    // The Yours chip above the list is the same blue, so the color explains itself (round 6).
    await expect(sheet.getByRole('group', { name: 'Who has him' }).getByRole('button', { name: /^Yours / })).toHaveClass(/status-mine/);
    await expect(henry.getByRole('rowheader')).toHaveAccessibleName(/Derrick Henry BAL\s*, yours/);
    const bijan = rowFor(sheet, 'Bijan Robinson');
    await expect(bijan.locator('.rset-rank-chip')).toHaveCount(0);
    await expect(bijan.locator('.rset-owner-name')).not.toBeInViewport({ ratio: 0.5 });
    await expect(bijan.getByRole('rowheader')).toHaveAccessibleName(/Bijan Robinson ATL\s*, on Rival/);
    const oneLine = async (row) => (await row.locator('.rset-player').boundingBox()).height;
    expect(await oneLine(bijan)).toBeLessThan(40);
    expect(await oneLine(henry)).toBeLessThan(40);
    // A ROS set's last column is the SoS badge, headed SoS.
    await expect(sheet.locator('.rset-table thead abbr')).toHaveAttribute('title', 'Strength of schedule');
    await expect(henry.locator('.rset-sos .sos-badge')).toHaveAccessibleName(/^Strength of schedule: 5 of 32 for RBs on BAL/);
    await expect(rowFor(sheet, 'Bijan Robinson').locator('.rset-sos .sos-badge')).toHaveCount(0);
    // A free agent carries no mark, and no team name even under Other teams.
    await expect(rowFor(sheet, 'James Cook').locator('.rset-rank-chip, .rset-owner-name')).toHaveCount(0);
    await expect(rowFor(sheet, 'James Cook').locator('.rset-pos')).toHaveText('RB8');
});

test('Search, the position chips and the ownership chips combine; the empty state clears', async ({ page }) => {
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
    // Search within the list; the tier lines follow (only Kittle's tier 4 is left).
    await search.fill('kit');
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['George Kittle']);
    await expect(visibleTierLines(sheet)).toHaveText(['Tier 4']);
    await search.fill('');

    // The ownership row, its own line under the positions. It scrolls away until one of its filters is on. Its counts
    // are within the list on screen (round 4): the TEs are 3 of yours and 1 free agent.
    const owners = sheet.getByRole('group', { name: 'Who has him' });
    await expect(owners.getByRole('button')).toHaveText([/Everyone\s*4/, /Yours\s*3/, /Free agents\s*1/, /Other teams\s*0/]);
    await expect(owners).not.toHaveClass(/is-pinned/);
    // TE and Free agents together: the free-agent tight ends.
    await owners.getByRole('button', { name: 'Free agents 1' }).click();
    await expect(owners).toHaveClass(/is-pinned/);
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Sam LaPorta']);
    await sheet.getByRole('button', { name: `All ${TOTAL}` }).click();
    await expect(owners.getByRole('button')).toHaveText([/Everyone\s*31/, /Yours\s*12/, /Free agents\s*6/, /Other teams\s*12/]);
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Jayden Daniels', 'James Cook', 'Jaxon Smith-Njigba', 'Chase Brown', 'Zay Flowers', 'Sam LaPorta']);
    // Yours: the 12 of your 14 in the file (your K and DEF aren't in it).
    await owners.getByRole('button', { name: 'Yours 12' }).click();
    await expect(visibleRows(sheet)).toHaveCount(12);
    // Other teams: now each row shows who has him, in grey on a line under the name (every row has one).
    await owners.getByRole('button', { name: 'Other teams 12' }).click();
    await expect(visibleRows(sheet).locator('.rset-owner-name')).toHaveText(Array(12).fill(/Rival$/));
    await expect(visibleRows(sheet).first().locator('.rset-owner-name')).toBeVisible();
    const [nb, ob] = await Promise.all([visibleRows(sheet).first().locator('.rset-name').boundingBox(), visibleRows(sheet).first().locator('.rset-owner-name').boundingBox()]);
    expect(ob.y).toBeGreaterThanOrEqual(nb.y + nb.height - 1);
    await owners.getByRole('button', { name: 'Free agents 6' }).click();

    // Nothing matches: the table goes, a sentence says so, and one button clears both.
    await search.fill('zzzz');
    await expect(sheet.locator('.rset-table')).toBeHidden();
    await expect(sheet.locator('.rset-empty p')).toHaveText('No players match "zzzz" among free agents.');
    await sheet.getByRole('button', { name: 'Clear search and filter' }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);
    await expect(sheet.locator('.rset-empty')).toBeHidden();
    await expect(owners).not.toHaveClass(/is-pinned/);
});

test('A name that didn\'t match a Sleeper player is flagged, listed from the banner, and can be fixed', async ({ page }) => {
    await setUp(page);
    const sheet = await openView(page);
    await expect(sheet.locator('.rset-unmatched .preview-unmatched-title')).toHaveText(`1 of ${TOTAL} names didn't match Sleeper`);
    // One line until opened: the explanation shows with the names (round 4).
    await expect(sheet.locator('.rset-unmatched .preview-unmatched-hint')).toBeHidden();
    const row = rowFor(sheet, 'Zzyzx Notaplayer');
    await expect(row.locator('.rset-nomatch-badge')).toHaveText('No Sleeper match');
    // The file said WR, but nothing the app reads knows him: no position, no team, not a free agent.
    await expect(row.locator('.rset-pos')).toHaveText('–');
    await expect(row.locator('.rset-player .badge:not(.rset-nomatch-badge)')).toHaveCount(0);
    await expect(sheet.locator('.rset-nomatch-badge')).toHaveCount(1);
    // The banner lists them (round 2), and switches back.
    await sheet.getByRole('button', { name: 'Show the names that didn\'t match' }).click();
    await expect(sheet.locator('.rset-unmatched .preview-unmatched-hint')).toBeVisible();
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Zzyzx Notaplayer']);
    await expect(sheet.getByRole('button', { name: 'Show all players' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.locator('.rset-owner-chips')).toBeHidden();

    // Fix name: the field says as you type whether the spelling matches; a name already in the set is refused.
    const fix = sheet.getByRole('button', { name: 'Fix the name Zzyzx Notaplayer' });
    await fix.click();
    const field = sheet.getByRole('textbox', { name: 'Name as Sleeper spells it' });
    await expect(field).toBeFocused();
    await field.fill('Josh Allen');
    await expect(sheet.locator('.rset-edit-hint')).toHaveText('Josh Allen (#13) already has that name in this set.');
    await sheet.getByRole('button', { name: 'Save name' }).click();
    await expect(field).toBeVisible();
    // Escape cancels the edit, not the sheet.
    await field.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(fix).toBeFocused();

    await fix.click();
    await field.fill('Justin Tuckr');
    await expect(sheet.locator('.rset-edit-hint')).toHaveText('No Sleeper player by that name yet.');
    await field.fill('Justin Tucker');
    await expect(sheet.locator('.rset-edit-hint')).toHaveText('Matches a Sleeper player: K, BAL.');
    await field.press('Enter');

    // Saved into the set: no unmatched names left, so the banner goes and the full list is back, with him as a
    // kicker on your roster; stored, and the league's rankings read it at once.
    await expect(sheet.locator('.rset-unmatched')).toHaveCount(0);
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);
    const tucker = rowFor(sheet, 'Justin Tucker');
    await expect(tucker.locator('.rset-pos .pos-badge.K')).toHaveText('K1');
    await expect(tucker.locator('.rset-rank-chip.is-mine')).toHaveText('31');
    const saved = await page.evaluate(async () => ({
        stored: JSON.parse(localStorage.getItem('mls_ranking_sets_ros'))[0].data.find(p => p.rank === 31),
        live: (await import('/js/mls/state.js')).State.rosRankings.find(p => p.rank === 31)
    }));
    expect(saved.stored).toMatchObject({ name: 'Justin Tucker', cleanName: 'justintucker' });
    expect(saved.live).toMatchObject({ name: 'Justin Tucker', cleanName: 'justintucker' });
});

// A weekly sheet in the owner's layout (round 2): one list per position side by side, and a FLEX list. Its ranks
// repeat (each list starts at 1), so there's no "All": each chip is its own list, ranked by its own number.
const WEEKLY = [
    '"QB Rank","QB Player","QB Team","QB Opponent","QB Matchup","QB Tier","RB Rank","RB Player","RB Team","RB Opponent","RB Tier","WR Rank","WR Player","WR Team","WR Opponent","WR Tier","FLEX Rank","FLEX Player","FLEX Team","FLEX Opponent","FLEX Pos"',
    `"1","Josh Allen","BUF","MIA","5","1","1","Bijan Robinson","ATL","NO","1","1","Ja'Marr Chase","CIN","PIT","1","1","Ja'Marr Chase","CIN","PIT","WR"`,
    '"2","Lamar Jackson","BAL","CLE","30","1","2","Jahmyr Gibbs","DET","GB","1","2","Justin Jefferson","MIN","CHI","2","2","Bijan Robinson","ATL","NO","RB"',
    '"3","Jalen Hurts","PHI","DAL","","2","3","Derrick Henry","BAL","CLE","2","3","Puka Nacua","LAR","SEA","2","3","Jahmyr Gibbs","DET","GB","RB"',
    '"","","","","","","","","","","","","","","","","4","Justin Jefferson","MIN","CHI","WR"',
    '"","","","","","","","","","","","","","","","","5","Derrick Henry","BAL","CLE","RB"',
    '"","","","","","","","","","","","","","","","","6","Puka Nacua","LAR","SEA","WR"',
].join('\n') + '\n';

test('A weekly sheet of separate lists shows each list on its own, FLEX first, with its tiers', async ({ page }) => {
    await openApp(page, '/lineup/');
    await seedMls(page);
    await showTab(page, 'lineup');
    const toggle = page.locator('#weeklyRankingsCard .rankings-card-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await page.locator('#weeklyRankingSetSelect').selectOption('__new__');
    await page.fill('#weeklyNewSetName', 'Week 10');
    await page.setInputFiles('#weeklyFileInput', { name: 'week.csv', mimeType: 'text/csv', buffer: Buffer.from(WEEKLY) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await callApp(page, 'confirmRankingsPreview');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await page.locator('#weeklySetLeaguesRow .mls-view-set-btn').click();
    const sheet = page.getByRole('dialog', { name: 'Week 10' });
    await expect(sheet.locator('.rset-meta')).toHaveText(/^Weekly rankings · 9 players/);

    const lists = sheet.getByRole('group', { name: 'List' });
    await expect(lists.getByRole('button')).toHaveText([/FLEX\s*6/, /QB\s*3/, /RB\s*3/, /WR\s*3/]);
    await expect(lists.getByRole('button', { name: 'FLEX 6' })).toHaveAttribute('aria-pressed', 'true');
    // FLEX: ranked by the FLEX list, each with his position rank; no tiers in that list, so no lines.
    await expect(visibleRows(sheet).locator('.rset-rank')).toHaveText(['1', '2', '3', '4', '5', '6']);
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(["Ja'Marr Chase", 'Bijan Robinson', 'Jahmyr Gibbs', 'Justin Jefferson', 'Derrick Henry', 'Puka Nacua']);
    await expect(visibleRows(sheet).locator('.rset-pos')).toHaveText(['WR1', 'RB1', 'RB2', 'WR2', 'RB3', 'WR3']);
    await expect(visibleTierLines(sheet)).toHaveCount(0);
    await expect(sheet.locator('.rset-count')).toHaveText('6 players');

    // A weekly file with opponents: the last column is this week's opponent, "Opp" for Strength of opponent (round 3),
    // the Lineup tab's colored badge where the file ranks the matchup, the plain opponent where it doesn't.
    await expect(sheet.locator('.rset-table thead th').last()).toHaveText('Opp');
    await expect(sheet.locator('.rset-table thead abbr')).toHaveAttribute('title', 'Strength of opponent');
    await expect(rowFor(sheet, 'Bijan Robinson').locator('.rset-sos')).toHaveText('NO');

    // QB: its own list, 1 to 3, with its tiers as lines.
    await lists.getByRole('button', { name: 'QB 3' }).click();
    await expect(visibleRows(sheet).locator('.rset-rank')).toHaveText(['1', '2', '3']);
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Josh Allen', 'Lamar Jackson', 'Jalen Hurts']);
    // The # is the QB rank, so the badge says only QB (round 6); FLEX above keeps "RB1" etc.
    await expect(visibleRows(sheet).locator('.rset-pos')).toHaveText(['QB', 'QB', 'QB']);
    await expect(visibleTierLines(sheet)).toHaveText(['Tier 1', 'Tier 2']);
    await expect(sheet.locator('.rset-count')).toHaveText('3 players');
    await expect(visibleRows(sheet).locator('.rset-sos')).toHaveText(['MIA 5', 'CLE 30', 'DAL']);
    await expect(rowFor(sheet, 'Josh Allen').locator('.opp-rank-badge')).toHaveAccessibleName(/^This week against MIA: one of the easiest matchups for QBs/);
    // RB, and the search within it.
    await lists.getByRole('button', { name: 'RB 3' }).click();
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Bijan Robinson', 'Jahmyr Gibbs', 'Derrick Henry']);
    await expect(sheet.getByRole('group', { name: 'Who has him' }).getByRole('button')).toHaveText([/Everyone\s*3/, /Yours\s*1/, /Free agents\s*0/, /Other teams\s*2/]);
    await sheet.getByRole('searchbox', { name: 'Search this set' }).fill('henry');
    await expect(visibleRows(sheet).locator('.rset-name')).toHaveText(['Derrick Henry']);
    await expect(visibleTierLines(sheet)).toHaveText(['Tier 2']);
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
    await picker.selectOption({ label: 'ROS Redraft' });
    sheet = page.getByRole('dialog', { name: 'ROS Redraft' });
    await expect(sheet.locator('.rset-meta')).toContainText(`${TOTAL} players`);
    await expect(visibleRows(sheet)).toHaveCount(TOTAL);

    await picker.selectOption({ label: 'Empty Set' });
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
    await expect(seasonView).toHaveAccessibleName('View the players in this In-Season set');
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
