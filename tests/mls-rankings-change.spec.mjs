// "What changed" after replacing a ranking set (improvements S3). Replace Set in the upload preview,
// or the ROS auto-fetch's "Replace saved set?", shows a card under that set's rankings card: counts,
// the top 5 risers and fallers, every move by position, the added and dropped players, your rostered
// players' changes, and (Weekly only) the active league's starters that changed. Saving a new set
// shows nothing. ✕ removes the card, and it isn't kept: a reload has none.
//
// Setup: the synced Fixture League with ROS and Weekly sets from rankings.csv (loadMlsRankings), then
// REPLACED below, a reordered copy. mds_test's roster (even rows of the fixture) holds Wilson, A.J.
// Brown and St. Brown; Barkley is the rival's. Position ranks are derived from the file's order, as
// the Waiver Wire Assistant derives them (rankings.csv has no Pos Rank column).
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID, RANKINGS_CSV } from './helpers.mjs';

// Against rankings.csv: Wilson WR10 -> WR2 (T4 -> T1) and A.J. Brown WR9 -> WR4 (T3 -> T2) rise;
// Barkley RB3 -> RB8 (T1 -> T4) and St. Brown WR6 -> WR10 (T2 -> T4) fall; everyone else moves 2
// spots or fewer. James Cook, Jayden Daniels and Chase Brown are added; Kyren Williams and Joe
// Burrow are dropped.
const REPLACED = `Rank,Player,Pos,Team,Tier,Bye
1,Ja'Marr Chase,WR,CIN,1,10
2,Bijan Robinson,RB,ATL,1,5
3,Garrett Wilson,WR,NYJ,1,9
4,Jahmyr Gibbs,RB,DET,1,8
5,Justin Jefferson,WR,MIN,1,6
6,James Cook,RB,BUF,2,7
7,A.J. Brown,WR,PHI,2,9
8,CeeDee Lamb,WR,DAL,2,10
9,Christian McCaffrey,RB,SF,2,14
10,Puka Nacua,WR,LAR,2,8
11,Brock Bowers,TE,LV,2,8
12,Malik Nabers,WR,NYG,2,14
13,Josh Allen,QB,BUF,3,7
14,Jayden Daniels,QB,WAS,3,12
15,Lamar Jackson,QB,BAL,3,7
16,De'Von Achane,RB,MIA,3,12
17,Nico Collins,WR,HOU,3,6
18,Derrick Henry,RB,BAL,3,7
19,Trey McBride,TE,ARI,3,8
20,Drake London,WR,ATL,3,5
21,Jalen Hurts,QB,PHI,4,9
22,Chase Brown,RB,CIN,4,10
23,Amon-Ra St. Brown,WR,DET,4,8
24,Saquon Barkley,RB,PHI,4,9
25,George Kittle,TE,SF,4,14
`;

const TYPES = {
    weekly: { tab: 'lineup', card: 'weeklyRankingsCard', input: '#weeklyFileInput', select: '#weeklyRankingSetSelect', change: '#weeklyRankingsChange', nameInput: '#weeklyNewSetName', label: 'Weekly' },
    ros: { tab: 'roster', card: 'rosRankingsCard', input: '#rosFileInput', select: '#rosRankingSetSelect', change: '#rosRankingsChange', nameInput: '#rosNewSetName', label: 'ROS' }
};
const SET_NAME = (label) => `${label} Rankings – 9/15/2026`;

const card = (page, t) => page.locator(`${t.change} .mls-change-card`);
const rowsText = (page, t, label) => card(page, t).getByRole('list', { name: label, exact: true }).locator('.mls-change-row');

async function openCard(page, t) {
    await showTab(page, t.tab);
    const toggle = page.locator(`#${t.card} .rankings-card-toggle`);
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(page.locator(t.select)).toBeVisible();
}

// Uploads `csv` on the type's card and saves it from the preview. `alsoLeague` ticks that league in
// the preview's "Also use this set in" list first.
async function upload(page, t, csv, { expectReplace, alsoLeague } = {}) {
    await page.setInputFiles(t.input, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const overlay = page.locator('#rankingsPreviewOverlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#rankingsPreviewConfirmBtn')).toHaveText(expectReplace ? 'Replace Set' : 'Looks Good, Save It');
    if (alsoLeague) await page.locator('#rankingsPreviewLeagues label').filter({ hasText: alsoLeague }).locator('input').check();
    await page.locator('#rankingsPreviewConfirmBtn').click();
    await expect(overlay).toBeHidden();
}

async function setUp(page) {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    // A second league with nothing of its own, which the replace below also points at the set.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));
    await page.locator('#newLeagueName').evaluate((el) => { el.value = 'Bench League'; });
    await callApp(page, 'createManualLeague');
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    return state;
}

// The parts every replace shows, Weekly or ROS alike.
async function expectSummary(page, t) {
    const c = card(page, t);
    await expect(c).toBeVisible();
    await expect(c.locator('h3')).toHaveText(`What changed: ${SET_NAME(t.label)}`);
    await expect(c.locator('.mls-change-counts')).toHaveText('4 moved · 3 added · 2 dropped');
    await expect(c.locator('.mls-change-note').first()).toHaveText('Moves of 3 or more spots in position rank. 22 players in both versions.');

    await expect(rowsText(page, t, 'Risers')).toHaveText([
        /Garrett Wilson\s*WR10 → WR2\s*\+8\s*T4 → T1/,
        /A\.J\. Brown\s*WR9 → WR4\s*\+5\s*T3 → T2/
    ]);
    await expect(rowsText(page, t, 'Fallers')).toHaveText([
        /Saquon Barkley\s*RB3 → RB8\s*−5\s*T1 → T4/,
        /Amon-Ra St\. Brown\s*WR6 → WR10\s*−4\s*T2 → T4/
    ]);
    await expect(rowsText(page, t, 'Added players')).toHaveText([/James Cook\s*RB3/, /Jayden Daniels\s*QB2/, /Chase Brown\s*RB7/]);
    await expect(rowsText(page, t, 'Dropped players')).toHaveText([/Joe Burrow\s*was QB4/, /Kyren Williams\s*was RB7/]);

    // Every move, by position, behind "Show all 4 moves".
    const all = c.locator('details.mls-change-all');
    await expect(all.locator('summary')).toHaveText('Show all 4 moves', { useInnerText: true });
    await expect(rowsText(page, t, 'WR moves')).toBeHidden();
    await all.locator('summary').click();
    await expect(all.locator('summary')).toHaveText('Hide all moves', { useInnerText: true });
    await expect(rowsText(page, t, 'RB moves')).toHaveText([/Saquon Barkley/]);
    await expect(rowsText(page, t, 'WR moves')).toHaveText([/Garrett Wilson/, /A\.J\. Brown/, /Amon-Ra St\. Brown/]);

    // Your players: the moves for mds_test's roster, each with the league. Henry (RB5 -> RB6) is
    // below the threshold; the adds, drops and Barkley aren't on his roster.
    await expect(rowsText(page, t, 'Your players')).toHaveText([
        /Garrett Wilson\s*WR10 → WR2\s*\+8.*Fixture League/,
        /A\.J\. Brown\s*WR9 → WR4\s*\+5.*Fixture League/,
        /Amon-Ra St\. Brown\s*WR6 → WR10\s*−4.*Fixture League/
    ]);
    // Icons are SVG.
    await expect(c.locator('.mls-change-icon svg[aria-hidden="true"]').first()).toBeAttached();
}

test.describe('What changed after Replace Set', () => {
    test('Weekly: risers, fallers, your players and the starters that changed; dismissed for good', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        // Saving the first sets (loadMlsRankings) showed nothing.
        await expect(page.locator(t.change)).toBeHidden();
        await expect(page.locator(TYPES.ros.change)).toBeHidden();

        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true, alsoLeague: 'Bench League' });
        await expectSummary(page, t);
        // The card sits under the Weekly rankings card, which collapsed after the save.
        await expect(page.locator(`#${t.card}`)).not.toHaveClass(/\bexpanded\b/);
        await expect(page.locator(`#${t.card} + ${t.change}`)).toBeVisible();
        await expect(page.locator(TYPES.ros.change)).toBeHidden();

        // Starters: the Lineup tab re-optimized Fixture League. Wilson starts now; Lamb (FLEX) sits.
        const starters = card(page, t).locator('.mls-change-group.is-starters');
        await expect(starters.locator('.mls-change-group-title').first()).toHaveText('Starters changed in Fixture League');
        await expect(rowsText(page, t, 'Starters in')).toHaveText([/Garrett Wilson/]);
        await expect(rowsText(page, t, 'Starters out')).toHaveText([/CeeDee Lamb\s*FLEX/]);
        await expect(starters.locator('.mls-change-note')).toHaveText('Lineups in Bench League update when you open them.');
        // ...and the lineup on screen agrees.
        await expect(page.locator('#optimalLineupContainer')).toContainText('Garrett Wilson');

        // ✕ removes it, and a reload doesn't bring it back.
        await card(page, t).getByRole('button', { name: 'Dismiss what changed' }).click();
        await expect(page.locator(t.change)).toBeHidden();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, t.tab);
        await expect(page.locator(t.change)).toBeHidden();
        await expect(page.locator('.mls-change-card')).toHaveCount(0);
        // Nothing about it was stored.
        const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => /change/i.test(k)));
        expect(keys).toEqual([]);
        await expectClean(page, state);
    });

    test('ROS: shown on the Roster tab, with no starters part', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.ros;
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expectSummary(page, t);
        await expect(page.locator(`#${t.card} + ${t.change}`)).toBeVisible();
        await expect(card(page, t).locator('.mls-change-group.is-starters')).toHaveCount(0);
        await expect(page.locator(TYPES.weekly.change)).toBeHidden();
        await expectClean(page, state);
    });

    test('saving a new set shows nothing, and clears an earlier summary', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expect(card(page, t)).toBeVisible();

        await openCard(page, t);
        await page.locator(t.select).selectOption('__new__');
        await page.locator(t.nameInput).fill('Second Opinion');
        await upload(page, t, REPLACED, { expectReplace: false });
        await expect(page.locator(`${t.select} option:checked`)).toHaveText('Second Opinion (25 players)');
        await expect(page.locator(t.change)).toBeHidden();
        await expect(page.locator('.mls-change-card')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('replacing with the same rankings: says nothing moved', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        await openCard(page, t);
        await upload(page, t, RANKINGS_CSV, { expectReplace: true });
        const c = card(page, t);
        await expect(c.locator('.mls-change-counts')).toHaveText('0 moved · 0 added · 0 dropped');
        await expect(c.locator('.mls-change-empty')).toHaveText('No player moved 3 or more spots, and no one was added or dropped.');
        await expect(c.locator('details.mls-change-all')).toHaveCount(0);
        await expect(c.locator('.mls-change-group.is-yours .mls-change-none')).toHaveText('No player on your rosters in leagues using this set moved 3 or more spots, joined or left the list.');
        await expect(c.locator('.mls-change-group.is-starters .mls-change-none')).toHaveText('Same starters in Fixture League.');
        await expectClean(page, state);
    });

    test('ROS auto-fetch: replacing the saved set shows the card; cancelling shows nothing', async ({ page }) => {
        const state = await setUp(page);
        // FantasyCalc's order: rankings.csv's, with Garrett Wilson moved up to 3rd.
        const fc = ["Ja'Marr Chase", 'Bijan Robinson', 'Garrett Wilson', 'Justin Jefferson', 'Jahmyr Gibbs', 'CeeDee Lamb',
            'Saquon Barkley', 'Puka Nacua', 'Malik Nabers', 'Amon-Ra St. Brown', 'Christian McCaffrey', 'Brock Bowers',
            'Nico Collins', 'Josh Allen', 'Lamar Jackson', 'Derrick Henry', 'Drake London', 'Trey McBride', 'Jalen Hurts',
            'A.J. Brown', "De'Von Achane", 'Joe Burrow', 'George Kittle', 'Kyren Williams'];
        await page.route(/^https:\/\/api\.fantasycalc\.com\//, (route) => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(fc.map((name, i) => ({ player: { name, position: '' }, overallRank: i + 1 })))
        }));
        const t = TYPES.ros;
        await openCard(page, t);
        const confirm = page.locator('.mds-modal-overlay').filter({ hasText: 'Replace saved set?' });

        await page.locator('#autoFetchRosBtn').click();
        await expect(confirm).toBeVisible();
        await confirm.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.locator(t.change)).toBeHidden();

        await openCard(page, t);
        await page.locator('#autoFetchRosBtn').click();
        await expect(confirm).toBeVisible();
        await confirm.getByRole('button', { name: 'Replace Set' }).click();
        const c = card(page, t);
        await expect(c).toBeVisible();
        await expect(c.locator('.mls-change-counts')).toHaveText('1 moved · 0 added · 0 dropped');
        await expect(rowsText(page, t, 'Risers')).toHaveText([/Garrett Wilson\s*WR10 → WR2\s*\+8/]);
        await expect(rowsText(page, t, 'Your players')).toHaveText([/Garrett Wilson\s*WR10 → WR2\s*\+8\s*Fixture League/]);
        await expect(c.locator('.mls-change-group.is-starters')).toHaveCount(0);
        await expectClean(page, state);
    });
});
