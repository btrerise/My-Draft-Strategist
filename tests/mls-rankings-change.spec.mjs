// "What changed" after replacing a ranking set (improvements S3). Replace Set in the upload preview,
// or the ROS auto-fetch's "Replace saved set?", shows a card under that set's rankings card: your
// players' changes, (Weekly only) the active league's starters that changed,
// and a Details fold with the counts, top 5 risers and fallers, every move by position and the added
// and dropped players. Your moved players get a chip on their Lineup / Roster rows until the set's
// next upload. Saving a new set shows nothing; a Weekly set's first upload of a new rankings week
// (Tuesday morning to Tuesday morning) shows nothing either, with a note in the toast. ✕ removes the
// card, and it isn't kept: a reload has none (the chips stay).
//
// Setup: the synced Fixture League with ROS and Weekly sets from rankings.csv (loadMlsRankings), then
// REPLACED below, a reordered copy. mds_test's roster (even rows of the fixture) holds Wilson, A.J.
// Brown and St. Brown; Barkley is the rival's. Position ranks are derived from the file's order, as
// the Waiver Wire Assistant derives them (rankings.csv has no Pos Rank column).
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID, RANKINGS_CSV, WAIVER_RANKINGS_CSV } from './helpers.mjs';

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

// Dates show in the card and the chips ("Tue 9/15, 4:00 PM"), so pin them.
test.use({ timezoneId: 'UTC', locale: 'en-US' });
const TUE = 'Tue 9/15, 4:00 PM'; // FIXED_NOW, when setUp's first sets are saved

const TYPES = {
    weekly: { tab: 'lineup', card: 'weeklyRankingsCard', input: '#weeklyFileInput', select: '#weeklyRankingSetSelect', change: '#weeklyRankingsChange', nameInput: '#weeklyNewSetName', label: 'Weekly', rows: '#lineupTab .mls-player-row-text' },
    ros: { tab: 'roster', card: 'rosRankingsCard', input: '#rosFileInput', select: '#rosRankingSetSelect', change: '#rosRankingsChange', nameInput: '#rosNewSetName', label: 'ROS', rows: '#rosterTab .roster-item' }
};
const SET_NAME = (label) => `${label} Rankings – 9/15/2026`;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const card = (page, t) => page.locator(`${t.change} .mls-change-card`);
const items = (page, t, label) => card(page, t).getByRole('list', { name: label, exact: true }).locator(':scope > li');
const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
// The chip on a player's row in the type's tab.
const chip = (page, t, name) => page.locator(t.rows).filter({ hasText: name }).locator('.mls-move-chip');

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
    await expect(c.locator('.mls-change-since')).toHaveText(t.label === 'Weekly'
        ? `Compared with this week's first upload, ${TUE}.` : `Compared with your previous upload, ${TUE}.`);

    // Your players first: mds_test's moves, biggest first. Henry (RB5 -> RB6) is below the
    // threshold; the adds, drops and Barkley aren't on his roster.
    await expect(items(page, t, 'Your players')).toHaveText([
        /Garrett Wilson\s*\+8/, /A\.J\. Brown\s*\+5/, /Amon-Ra St\. Brown\s*−4/
    ]);
    await expect(items(page, t, 'Your players').first()).toHaveAttribute('title', 'WR10 → WR2');
    // "Show all 3": each with its ranks and leagues.
    const yoursAll = card(page, t).locator('details.mls-change-yours-all');
    await expect(yoursAll.locator('summary')).toHaveText('Show all 3', { useInnerText: true });
    await expect(items(page, t, 'All your players')).toBeHidden();
    await yoursAll.locator('summary').click();
    await expect(yoursAll.locator('summary')).toHaveText('Hide', { useInnerText: true });
    await expect(items(page, t, 'All your players')).toHaveText([
        /Garrett Wilson\s*WR10 → WR2\s*\+8[\s\S]*Fixture League/,
        /A\.J\. Brown\s*WR9 → WR4\s*\+5[\s\S]*Fixture League/,
        /Amon-Ra St\. Brown\s*WR6 → WR10\s*−4[\s\S]*Fixture League/
    ]);
    await expect(c.getByText("Rank changes also show as chips on your player cards and in the Scout tab's Top Available (free agents) until the next upload of this set.")).toBeVisible();

    // No free-agent section (round 4): those chips are on the Scout tab's Top Available rows instead.
    await expect(c.locator('.mls-change-group-title', { hasText: 'Free agents' })).toHaveCount(0);

    // Details: folded, with the counts on its summary line.
    const details = c.locator('details.mls-change-details');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(details.locator('> summary .mls-change-when-closed')).toBeVisible();
    await expect(details.locator('> summary .mls-change-when-closed')).toHaveText('Details');
    await expect(details.locator('> summary .mls-change-counts')).toHaveText('4 moved · 3 added · 2 dropped');
    await expect(items(page, t, 'Risers')).toBeHidden();
    await details.locator('> summary').click();
    await expect(details.locator('.mls-change-note').first()).toHaveText('Moves of 3 or more spots in position rank, for players in the top 24 QB/TE, 48 RB/WR or 16 K/DEF before or after. 22 players in both versions.');
    await expect(items(page, t, 'Risers')).toHaveText([
        /Garrett Wilson\s*WR10 → WR2\s*\+8\s*T4 → T1/,
        /A\.J\. Brown\s*WR9 → WR4\s*\+5\s*T3 → T2/
    ]);
    await expect(items(page, t, 'Fallers')).toHaveText([
        /Saquon Barkley\s*RB3 → RB8\s*−5\s*T1 → T4/,
        /Amon-Ra St\. Brown\s*WR6 → WR10\s*−4\s*T2 → T4/
    ]);
    await expect(items(page, t, 'Added players')).toHaveText([/James Cook\s*new, RB3/, /Jayden Daniels\s*new, QB2/, /Chase Brown\s*new, RB7/]);
    await expect(items(page, t, 'Dropped players')).toHaveText([/Joe Burrow\s*was QB4/, /Kyren Williams\s*was RB7/]);

    // Every move, by position, behind "Show all 4 moves" inside Details.
    const all = c.locator('details.mls-change-all');
    await expect(all.locator('summary')).toHaveText('Show all 4 moves', { useInnerText: true });
    await expect(items(page, t, 'WR moves')).toBeHidden();
    await all.locator('summary').click();
    await expect(all.locator('summary')).toHaveText('Hide all moves', { useInnerText: true });
    await expect(items(page, t, 'RB moves')).toHaveText([/Saquon Barkley/]);
    await expect(items(page, t, 'WR moves')).toHaveText([/Garrett Wilson/, /A\.J\. Brown/, /Amon-Ra St\. Brown/]);
    // Icons are SVG.
    await expect(c.locator('.mls-change-icon svg[aria-hidden="true"]').first()).toBeAttached();
}

// The chips on the type's tab: Wilson and A.J. Brown up, St. Brown down, nobody else.
async function expectChips(page, t, since = TUE) {
    await showTab(page, t.tab);
    const text = `Up 8 spots in your ${t.label} rankings since ${since} (WR10 → WR2)`;
    await expect(chip(page, t, 'Garrett Wilson')).toHaveText(`Up 8 spots in your ${t.label} rankings since ${since}`, { useInnerText: false });
    await expect(chip(page, t, 'Garrett Wilson')).toHaveAttribute('title', text);
    await expect(chip(page, t, 'Garrett Wilson').locator('svg[aria-hidden="true"]')).toBeAttached();
    await expect(chip(page, t, 'A.J. Brown')).toHaveClass(/is-up/);
    await expect(chip(page, t, 'Amon-Ra St. Brown')).toHaveClass(/is-down/);
    await expect(chip(page, t, 'Amon-Ra St. Brown')).toHaveAttribute('title', `Down 4 spots in your ${t.label} rankings since ${since} (WR6 → WR10)`);
    await expect(page.locator(`${t.rows} .mls-move-chip`)).toHaveCount(3);
    // A tap explains it (phones have no hover).
    await chip(page, t, 'Garrett Wilson').click();
    await expect(toast(page, text)).toBeVisible();
}

test.describe('What changed after Replace Set', () => {
    test('Weekly: your players, the lineup, free agents, details, chips; dismissed for good', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        // Saving the first sets (loadMlsRankings) showed nothing.
        await expect(page.locator(t.change)).toBeHidden();
        await expect(page.locator(TYPES.ros.change)).toBeHidden();
        await showTab(page, 'lineup');
        await expect(page.locator('.mls-move-chip')).toHaveCount(0);

        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true, alsoLeague: 'Bench League' });
        await expect(toast(page, 'Weekly Rankings loaded')).not.toContainText('New week');
        await expectSummary(page, t);
        // The card sits under the Weekly rankings card, which collapsed after the save.
        await expect(page.locator(`#${t.card}`)).not.toHaveClass(/\bexpanded\b/);
        await expect(page.locator(`#${t.card} + ${t.change}`)).toBeVisible();
        await expect(page.locator(TYPES.ros.change)).toBeHidden();

        // The lineup: the Lineup tab re-optimized Fixture League. Wilson starts now; Lamb (FLEX) sits.
        const starters = card(page, t).locator('.mls-change-group.is-starters');
        await expect(starters.locator('.mls-change-group-title')).toHaveText('Fixture League lineup, this update');
        await expect(items(page, t, 'Starters in and out')).toHaveText([/In: Garrett Wilson\s*WR/, /Out: CeeDee Lamb\s*FLEX/]);
        await expect(starters.locator('.mls-change-note')).toHaveText('Lineups in Bench League update when you open them.');
        await expect(page.locator('#optimalLineupContainer')).toContainText('Garrett Wilson');

        await expectChips(page, t);

        // ✕ removes the card, and a reload doesn't bring it back. The chips stay until the next upload.
        await card(page, t).getByRole('button', { name: 'Dismiss what changed' }).click();
        await expect(page.locator(t.change)).toBeHidden();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, t.tab);
        await expect(page.locator(t.change)).toBeHidden();
        await expect(page.locator('.mls-change-card')).toHaveCount(0);
        await expectChips(page, t);
        // Only the moves are stored, on the set itself (no new key, not the old rankings).
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_ranking_sets_weekly'))[0]);
        expect(Object.keys(stored.lastChanges)).toEqual(['at', 'since', 'moves', 'added']);
        // This week's baseline: Tuesday's 24 players, names and ranks only (the FLEX rank last, since
        // improvements F6 round 2).
        expect(stored.weekBaseline.at).toBe(FIXED_NOW.getTime());
        expect(stored.weekBaseline.rows).toHaveLength(24);
        expect(stored.weekBaseline.rows[0]).toEqual(["Ja'Marr Chase", 'jamarrchase', 1, 1, 1, 1, 1]);
        expect(stored.lastChanges.moves['garrettwilson']).toEqual({ d: 8, f: 'WR10', t: 'WR2' });
        expect(Object.keys(stored.lastChanges.added).sort()).toEqual(['chasebrown', 'jamescook', 'jaydendaniels']);
        expect(stored.data).toHaveLength(25);
        const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => /change/i.test(k)));
        expect(keys).toEqual([]);
        await expectClean(page, state);
    });

    test('Weekly: the first upload of a new week shows nothing and clears the chips; a mid-week update shows the card', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expect(card(page, t)).toBeVisible();
        await expect(chip(page, t, 'Garrett Wilson')).toHaveCount(1);

        // Next Tuesday afternoon: a new rankings week. Back to rankings.csv.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + WEEK_MS));
        await openCard(page, t);
        await upload(page, t, RANKINGS_CSV, { expectReplace: true });
        await expect(toast(page, 'Weekly Rankings loaded successfully!')).toContainText('New week: changes will show when you update these rankings.');
        await expect(page.locator(t.change)).toBeHidden();
        await expect(page.locator('.mls-move-chip')).toHaveCount(0);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_ranking_sets_weekly'))[0]);
        expect(stored.lastChanges).toBeUndefined();

        // Saturday of that week: an update is compared again.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + WEEK_MS + 4 * 24 * 60 * 60 * 1000));
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expect(toast(page, 'Weekly Rankings loaded successfully!').last()).not.toContainText('New week');
        await expect(items(page, t, 'Your players')).toHaveText([/Garrett Wilson\s*\+8/, /A\.J\. Brown\s*\+5/, /Amon-Ra St\. Brown\s*−4/]);
        await expect(card(page, t).locator('.mls-change-since')).toHaveText("Compared with this week's first upload, Tue 9/22, 4:00 PM.");
        await expect(chip(page, t, 'Garrett Wilson')).toHaveAttribute('title', /since Tue 9\/22, 4:00 PM/);
        await expectClean(page, state);
    });

    test("Weekly: later updates in the week are compared with the week's first upload", async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        // Wednesday: Wilson half way up (WR10 -> WR6, just ahead of St. Brown).
        const lines = RANKINGS_CSV.trim().split('\n');
        const w = lines.findIndex(l => l.includes('Garrett Wilson'));
        const sb = lines.findIndex(l => l.includes('Amon-Ra St. Brown'));
        const wed = lines.filter((_, i) => i !== w);
        wed.splice(sb, 0, lines[w]);
        const wedCsv = wed.map((l, i) => (i === 0 ? l : `${i},${l.split(',').slice(1).join(',')}`)).join('\n') + '\n';
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000));
        await openCard(page, t);
        await upload(page, t, wedCsv, { expectReplace: true });
        await expect(items(page, t, 'Your players')).toHaveText([/Garrett Wilson\s*\+4/]);

        // Friday: the full move. Compared with Tuesday, not Wednesday: +8, not +4.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 3 * 24 * 60 * 60 * 1000));
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expect(card(page, t).locator('.mls-change-since')).toHaveText(`Compared with this week's first upload, ${TUE}.`);
        await expect(items(page, t, 'Your players')).toHaveText([/Garrett Wilson\s*\+8/, /A\.J\. Brown\s*\+5/, /Amon-Ra St\. Brown\s*−4/]);
        await expectChips(page, t);
        await expectClean(page, state);
    });

    test('a Weekly set saved before week baselines: compared with its previous upload, which becomes the baseline', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        await page.evaluate(() => {
            const sets = JSON.parse(localStorage.getItem('mls_ranking_sets_weekly'));
            delete sets[0].weekBaseline;
            localStorage.setItem('mls_ranking_sets_weekly', JSON.stringify(sets));
        });
        await page.reload();
        await page.waitForLoadState('networkidle');
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expect(card(page, t).locator('.mls-change-since')).toHaveText(`Compared with your previous upload, ${TUE}.`);
        await expect(items(page, t, 'Your players')).toHaveText([/Garrett Wilson\s*\+8/, /A\.J\. Brown\s*\+5/, /Amon-Ra St\. Brown\s*−4/]);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_ranking_sets_weekly'))[0]);
        expect(stored.weekBaseline.at).toBe(FIXED_NOW.getTime());
        expect(stored.weekBaseline.rows).toHaveLength(24);
        // The next update that week is compared with it, now labeled as the week's first upload.
        await openCard(page, t);
        await upload(page, t, RANKINGS_CSV, { expectReplace: true });
        await expect(card(page, t).locator('.mls-change-since')).toHaveText(`Compared with this week's first upload, ${TUE}.`);
        await expect(card(page, t).locator('.mls-change-group.is-yours .mls-change-none')).toBeVisible();
        await expectClean(page, state);
    });

    test('chips go away on their own: Weekly when the week ends, ROS after 7 days', async ({ page }) => {
        const state = await setUp(page);
        for (const t of [TYPES.weekly, TYPES.ros]) {
            await openCard(page, t);
            await upload(page, t, REPLACED, { expectReplace: true });
            await expect(chip(page, t, 'Garrett Wilson')).toHaveCount(1);
        }
        // Next Monday night: Weekly still this week, ROS 6 days old.
        await page.clock.setFixedTime(new Date('2026-09-22T03:00:00Z'));
        await page.reload();
        await page.waitForLoadState('networkidle');
        for (const t of [TYPES.weekly, TYPES.ros]) {
            await showTab(page, t.tab);
            await expect(chip(page, t, 'Garrett Wilson')).toHaveCount(1);
        }
        // Tuesday afternoon: the Weekly chips' week is over; ROS is 7 days old (still shown).
        await page.clock.setFixedTime(new Date('2026-09-22T15:00:00Z'));
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'lineup');
        await expect(page.locator('#lineupTab .mls-move-chip')).toHaveCount(0);
        await showTab(page, 'roster');
        await expect(chip(page, TYPES.ros, 'Garrett Wilson')).toHaveCount(1);
        // A day later: past 7 days, so the ROS chips go too.
        await page.clock.setFixedTime(new Date('2026-09-23T17:00:00Z'));
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'roster');
        await expect(page.locator('#rosterTab .mls-move-chip')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('ROS: shown on the Roster tab, chips on the roster, no lineup part, no week rule', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.ros;
        // A week later still compares: the week rule is for Weekly sets only.
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + WEEK_MS));
        await openCard(page, t);
        await upload(page, t, REPLACED, { expectReplace: true });
        await expectSummary(page, t);
        await expect(page.locator(`#${t.card} + ${t.change}`)).toBeVisible();
        await expect(card(page, t).locator('.mls-change-group.is-starters')).toHaveCount(0);
        await expect(page.locator(TYPES.weekly.change)).toBeHidden();
        await expectChips(page, t);
        // The Lineup tab uses Weekly rankings, which didn't change: no chips there.
        await showTab(page, 'lineup');
        await expect(page.locator('#lineupTab .mls-move-chip')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('Your players: the 5 biggest changes, and Show all for the rest', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        // rankings.csv with the WRs and the QBs each in reverse order (every other row stays put):
        // seven of mds_test's players move 3 or more spots.
        const lines = RANKINGS_CSV.trim().split('\n');
        const reordered = [...lines];
        for (const pos of ['WR', 'QB']) {
            const at = lines.map((l, i) => (l.split(',')[2] === pos ? i : -1)).filter(i => i >= 0);
            const names = at.map(i => lines[i].split(',').slice(1).join(',')).reverse();
            at.forEach((i, k) => { reordered[i] = `${lines[i].split(',')[0]},${names[k]}`; });
        }
        await openCard(page, t);
        await upload(page, t, reordered.join('\n') + '\n', { expectReplace: true });

        const c = card(page, t);
        await expect(c.locator('.mls-change-group.is-yours .mls-change-group-title')).toHaveText('Your players 7');
        // Biggest first; equal moves by name.
        await expect(items(page, t, 'Your players')).toHaveText([
            /Garrett Wilson\s*\+9/, /Ja'Marr Chase\s*−9/, /A\.J\. Brown\s*\+7/, /Justin Jefferson\s*−7/, /CeeDee Lamb\s*−5/
        ]);
        const all = c.locator('details.mls-change-yours-all');
        await expect(all.locator('summary')).toHaveText('Show all 7', { useInnerText: true });
        await all.locator('summary').click();
        await expect(items(page, t, 'All your players')).toHaveText([
            /Garrett Wilson\s*WR10 → WR1\s*\+9/, /Ja'Marr Chase\s*WR1 → WR10\s*−9/, /A\.J\. Brown\s*WR9 → WR2\s*\+7/,
            /Justin Jefferson\s*WR2 → WR9\s*−7/, /CeeDee Lamb\s*WR3 → WR8\s*−5/, /Josh Allen\s*QB1 → QB4\s*−3/,
            /Puka Nacua\s*WR4 → WR7\s*−3/
        ]);
        // Every one of them has a chip.
        await expect(page.locator('#lineupTab .mls-move-chip')).toHaveCount(7);
        await expectClean(page, state);
    });

    test('Top Available: free agents who moved or are new get the same chips, by the Rank By rankings', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        const ta = page.locator('#waiverOutput');
        const taChip = (name) => ta.locator('.mls-ta-row').filter({ hasText: name }).locator('.mls-move-chip');
        // Weekly: rankings.csv -> rankings-waivers.csv adds the six free agents (25-30).
        await openCard(page, t);
        await upload(page, t, WAIVER_RANKINGS_CSV, { expectReplace: true });
        await showTab(page, 'scout');
        await expect(ta.locator('.mls-ta-row')).toHaveCount(6);
        await expect(taChip('James Cook')).toHaveText(`New in your Weekly rankings since ${TUE}`);
        await expect(taChip('James Cook')).toHaveAttribute('title', `New in your Weekly rankings since ${TUE} (RB8)`);
        await expect(ta.locator('.mls-move-chip.is-new')).toHaveCount(6);

        // Next week: Tuesday's first upload is rankings-waivers.csv again (no card, chips cleared), and
        // on Wednesday Chase Brown moves up to 3rd overall: RB9 -> RB2.
        const nextTue = FIXED_NOW.getTime() + WEEK_MS;
        await page.clock.setFixedTime(new Date(nextTue));
        await openCard(page, t);
        await upload(page, t, WAIVER_RANKINGS_CSV, { expectReplace: true });
        await showTab(page, 'scout');
        await expect(ta.locator('.mls-ta-row')).toHaveCount(6);
        await expect(ta.locator('.mls-move-chip')).toHaveCount(0);

        const lines = WAIVER_RANKINGS_CSV.trim().split('\n');
        const cb = lines.findIndex(l => l.includes('Chase Brown'));
        const moved = lines.filter((_, i) => i !== cb);
        moved.splice(3, 0, lines[cb]);
        const csv = moved.map((l, i) => (i === 0 ? l : `${i},${l.split(',').slice(1).join(',')}`)).join('\n') + '\n';
        await page.clock.setFixedTime(new Date(nextTue + 24 * 60 * 60 * 1000));
        await openCard(page, t);
        await upload(page, t, csv, { expectReplace: true });
        await showTab(page, 'scout');
        await expect(taChip('Chase Brown')).toHaveClass(/is-up/);
        await expect(taChip('Chase Brown')).toHaveAttribute('title', 'Up 7 spots in your Weekly rankings since Tue 9/22, 4:00 PM (RB9 → RB2)');
        await expect(taChip('Chase Brown').locator('svg[aria-hidden="true"]')).toBeAttached();
        // Nobody else free moved 3 or more spots, or is new.
        await expect(ta.locator('.mls-move-chip')).toHaveCount(1);
        // A tap explains it.
        await taChip('Chase Brown').click();
        await expect(toast(page, 'Up 7 spots in your Weekly rankings since Tue 9/22, 4:00 PM (RB9 → RB2)')).toBeVisible();

        // Rank By ROS: the ROS set wasn't replaced, so no chips.
        // (Its rankings.csv ranks no free agents, so the list is the "all rostered" note.)
        await page.locator('#waiverScanBasis').selectOption('ros');
        await expect(ta).toContainText('Every player in your ROS rankings');
        await expect(ta.locator('.mls-move-chip')).toHaveCount(0);
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
        // The league now uses the new set, which has no recent changes.
        await expect(page.locator('#lineupTab .mls-move-chip')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('replacing with the same rankings: says nothing moved', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.weekly;
        await openCard(page, t);
        await upload(page, t, RANKINGS_CSV, { expectReplace: true });
        const c = card(page, t);
        await expect(c.locator('.mls-change-group.is-yours .mls-change-none')).toHaveText('None of your players moved 3 or more spots, joined or left these rankings.');
        await expect(c.locator('.mls-change-group.is-starters .mls-change-none')).toHaveText('Same starters.');
        await expect(c.getByText('Rank changes also show')).toHaveCount(0);
        await expect(c.locator('details.mls-change-details > summary .mls-change-counts')).toHaveText('0 moved · 0 added · 0 dropped');
        await c.locator('details.mls-change-details > summary').click();
        await expect(c.locator('.mls-change-empty')).toHaveText('No player moved 3 or more spots, and no one was added or dropped.');
        await expect(c.locator('details.mls-change-all')).toHaveCount(0);
        await expect(page.locator('.mls-move-chip')).toHaveCount(0);
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
        await expect(items(page, t, 'Your players')).toHaveText([/Garrett Wilson\s*\+8/]);
        await expect(c.locator('details.mls-change-details > summary .mls-change-counts')).toHaveText('1 moved · 0 added · 0 dropped');
        await expect(c.locator('.mls-change-group.is-starters')).toHaveCount(0);
        await expect(chip(page, t, 'Garrett Wilson')).toHaveClass(/is-up/);
        await expectClean(page, state);
    });
});
