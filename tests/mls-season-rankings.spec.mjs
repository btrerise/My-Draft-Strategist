// In-Season rankings in dynasty and keeper leagues (improvements S23). A dynasty league's ROS slot holds its
// dynasty rankings; a second slot, In-Season, points at any saved ROS set for this season's questions: Power
// Rankings' Start (and the labels), the lineup with no Weekly set, the Waiver Wire's In-Season Rank and the
// Dashboard's ROS line. Future stays on the dynasty set; "I'm competing this year" moves Ovr and the rooms too.
//
// Setup: the synced Fixture League (two teams) marked dynasty, with two ROS sets uploaded through the card:
// "Dynasty SF" (tests/fixtures/rankings.csv, assigned) and "Redraft ROS" (the same 24 players with the other
// team's players ranked first, and George Kittle first of your TEs). No Weekly set, so the lineup reads ROS.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, expectClean, showTab, seedMls, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID, RANKINGS_CSV } from './helpers.mjs';

const THEIRS = ['Bijan Robinson', 'Jahmyr Gibbs', 'Saquon Barkley', 'Malik Nabers', 'Christian McCaffrey', 'Nico Collins',
    'Lamar Jackson', 'Drake London', 'Jalen Hurts', "De'Von Achane", 'Joe Burrow', 'Kyren Williams'];
const MINE = ['George Kittle', "Ja'Marr Chase", 'Justin Jefferson', 'CeeDee Lamb', 'Puka Nacua', 'Amon-Ra St. Brown',
    'Brock Bowers', 'Josh Allen', 'Derrick Henry', 'Trey McBride', 'A.J. Brown', 'Garrett Wilson'];
const rows = RANKINGS_CSV.trim().split('\n').slice(1).map(l => l.split(','));
const byName = Object.fromEntries(rows.map(r => [r[1], r]));
const SEASON_CSV = 'Rank,Player,Pos,Team\n' + [...THEIRS, ...MINE].map((n, i) => `${i + 1},${n},${byName[n][2]},${byName[n][3]}`).join('\n') + '\n';

const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
const storedLeagues = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues') || '[]'));
const fixture = async (page) => (await storedLeagues(page)).find(l => l.leagueId === FIXTURE_LEAGUE_ID);

async function openRosCard(page) {
    await showTab(page, 'roster');
    const toggle = page.locator('#rosRankingsCard .rankings-card-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(page.locator('#rosRankingSetSelect')).toBeVisible();
}

async function uploadRos(page, name, csv) {
    await openRosCard(page);
    await page.locator('#rosRankingSetSelect').selectOption('__new__');
    await page.fill('#rosNewSetName', name);
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

// Changes leagues in memory and in storage (by name), then re-shows the active league.
async function patchLeagues(page, patches) {
    await page.evaluate(async (patches) => {
        const { State } = await import('/js/mls/state.js');
        State.leagues.forEach(l => { if (patches[l.name]) Object.assign(l, patches[l.name]); });
        localStorage.setItem('mls_leagues', JSON.stringify(State.leagues));
    }, patches);
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
}

const setIdOf = (page, name) => page.evaluate((n) => JSON.parse(localStorage.getItem('mls_ranking_sets_ros')).find(s => s.name === n).id, name);

async function setUp(page, { dynasty = true } = {}) {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await uploadRos(page, 'Redraft ROS', SEASON_CSV);
    // Set ids are 'rset_' + Date.now(), and the test clock is fixed: move it so the two differ.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));
    await uploadRos(page, 'Dynasty SF', RANKINGS_CSV);
    const ids = { dynasty: await setIdOf(page, 'Dynasty SF'), season: await setIdOf(page, 'Redraft ROS') };
    if (dynasty) await patchLeagues(page, { 'Fixture League': { leagueType: 'dynasty', rosRankingSetId: ids.dynasty } });
    return { state, ids };
}

// The Power Rankings table: { owner: { start, ovr, future } } and the notes' text, once the Future column is there.
async function powerTable(page, { future = true } = {}) {
    await showTab(page, 'roster');
    const table = page.locator('#powerRankingsOutput .mls-power-table');
    await expect(table).toBeVisible();
    if (future) await expect(table.locator('thead th', { hasText: 'Future' })).toBeVisible();
    const data = await table.evaluate((t) => {
        const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
        const col = (name) => heads.indexOf(name);
        return Object.fromEntries([...t.querySelectorAll('tbody tr')].map(tr => {
            const cells = [...tr.children].map(td => td.querySelector('.mls-dotted-underline')?.textContent.trim());
            return [tr.querySelector('.mls-power-owner').textContent.trim(),
                { start: cells[col('Start')], ovr: cells[col('Ovr')], rb: cells[col('RB')], future: col('Future') >= 0 ? cells[col('Future')] : null }];
        }));
    });
    const notes = await page.locator('#powerRankingsOutput .mls-power-notes').innerText();
    const keyEl = page.locator('#powerRankingsOutput .mls-power-source-key');
    const key = (await keyEl.count()) ? await keyEl.innerText() : '';
    return { data, notes, key };
}

const lineupStarters = (page) => page.evaluate(async (id) => {
    const { State } = await import('/js/mls/state.js');
    return (State.manualStartersMap[id] || []).map(s => `${s.slot.replace(/\d+$/, '')}:${s.player ? s.player.name : '-'}`);
}, FIXTURE_LEAGUE_ID);

test.describe('In-Season rankings in a dynasty league', () => {
    test('Start and the labels follow the In-Season set, Future the dynasty set; "I\'m competing" moves the rooms', async ({ page }) => {
        const { state, ids } = await setUp(page);

        // No In-Season set: every column by the dynasty set, no In-Season note, no switch.
        const before = await powerTable(page);
        expect(before.key).toBe(''); // no key line without an In-Season set
        await expect(page.locator('#rosterPowerStrip')).not.toContainText('In-Season');
        await expect(page.locator('#powerCompetingWrap')).toBeHidden();

        // The Season set alone as the league's rankings, for comparison (then back to the dynasty set).
        await patchLeagues(page, { 'Fixture League': { rosRankingSetId: ids.season } });
        const seasonOnly = await powerTable(page);
        await patchLeagues(page, { 'Fixture League': { rosRankingSetId: ids.dynasty } });
        expect(seasonOnly.data.You.start).not.toBe(before.data.You.start); // the two sets disagree

        // The picker: dynasty label, "None" first, then every saved ROS set.
        await openRosCard(page);
        await expect(page.locator('#seasonRankingsRow')).toBeVisible();
        await expect(page.locator('#rosRankingSetLabel')).toHaveText('Dynasty rankings for this league');
        await expect(page.locator('#rosRankingsTitle')).toHaveText('Dynasty & In-Season Rankings');
        // Right under the dynasty picker, then a line saying the upload and Auto-Fetch below fill the dynasty set.
        expect(await page.evaluate(() => {
            const order = ['rosRankingSetSelect', 'seasonRankingsRow', 'rosUploadTarget', 'rosFileInput', 'autoFetchRosBtn']
                .map(id => document.getElementById(id));
            return order.every((el, i) => i === 0 || !!(order[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
        })).toBe(true);
        await expect(page.locator('#rosUploadTarget')).toHaveText('Upload or Auto-Fetch below to update your dynasty set, Dynasty SF.');
        await page.locator('#rosRankingSetSelect').selectOption('__new__');
        await expect(page.locator('#rosUploadTarget')).toHaveText('Upload or Auto-Fetch below to save a new dynasty set.');
        await page.locator('#rosRankingSetSelect').selectOption(ids.dynasty);
        await openRosCard(page);
        const select = page.locator('#seasonRankingSetSelect');
        await expect(select.locator('option').first()).toHaveText('None (use your dynasty rankings)');
        await expect(select).toHaveValue('');
        // The league's own dynasty set isn't offered, and a stored one counts as none.
        await expect(select.locator('option')).toHaveText(['None (use your dynasty rankings)', 'Redraft ROS (24 players)']);
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: ids.dynasty } });
        await openRosCard(page);
        await expect(select).toHaveValue('');
        expect((await powerTable(page)).key).toBe('');
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: null } });
        await openRosCard(page);
        await select.selectOption(ids.season);
        await expect(page.locator('#rosHeaderSetName')).toHaveText('Dynasty: Dynasty SFIn-Season: Redraft ROS');
        expect((await fixture(page)).seasonRankingSetId).toBe(ids.season);

        const after = await powerTable(page);
        for (const owner of ['You', 'Rival']) {
            expect(after.data[owner].start, `${owner} Start`).toBe(seasonOnly.data[owner].start);
            expect(after.data[owner].ovr, `${owner} Ovr`).toBe(before.data[owner].ovr);
            expect(after.data[owner].rb, `${owner} RB`).toBe(before.data[owner].rb);
            expect(after.data[owner].future, `${owner} Future`).toBe(before.data[owner].future);
        }
        expect(after.key).toBe('Start and labels by In-Season (Redraft ROS) · Ovr, positions and Future by dynasty (Dynasty SF)');
        expect(after.notes).toContain('its value from your dynasty rankings, adjusted for player age');
        await expect(page.locator('#rosterPowerStrip')).toContainText('out of 2 teams · Start by In-Season');

        // I'm competing: Ovr and the rooms by In-Season too, Future still dynasty. Saved on the league.
        await expect(page.locator('#powerCompetingWrap')).toBeVisible();
        await page.locator('#powerCompeting').check();
        const competing = await powerTable(page);
        for (const owner of ['You', 'Rival']) {
            expect(competing.data[owner].ovr, `${owner} Ovr`).toBe(seasonOnly.data[owner].ovr);
            expect(competing.data[owner].future, `${owner} Future`).toBe(before.data[owner].future);
        }
        expect(competing.key).toBe('Start, labels, Ovr and positions by In-Season (Redraft ROS) · Future by dynasty (Dynasty SF)');
        await expect(page.locator('#rosterPowerStrip')).toContainText('out of 2 teams · by In-Season, Future by dynasty');
        expect((await fixture(page)).powerCompeting).toBe(true);

        // Both survive a reload and a re-sync.
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'setup');
        await page.fill('#sleeperUsername', 'mds_test');
        await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE_ID);
        await page.click('#mainSyncBtn');
        await page.waitForLoadState('networkidle');
        await expect.poll(async () => (await fixture(page)).lastSyncedAt).toBeGreaterThan(0);
        const synced = await fixture(page);
        expect(synced.seasonRankingSetId).toBe(ids.season);
        expect(synced.powerCompeting).toBe(true);
        await openRosCard(page);
        await expect(page.locator('#seasonRankingSetSelect')).toHaveValue(ids.season);
        await expect(page.locator('#powerCompeting')).toBeChecked();

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('the lineup with no Weekly set reads the In-Season set, and In-Season Rank shows in the Waiver Wire', async ({ page }) => {
        const { state, ids } = await setUp(page);
        await showTab(page, 'lineup');
        await expect.poll(async () => (await lineupStarters(page)).filter(s => s.startsWith('TE:'))).toEqual(['TE:Brock Bowers']);
        await expect(page.locator('#lineupTab .mls-lineup-source')).toHaveCount(0);
        await expect(page.locator('#waiverScanBasis option[value="season"]')).toBeHidden();

        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: ids.season } });
        await showTab(page, 'lineup');
        // The rankings stamp includes the In-Season set, so the lineup re-optimizes by it.
        await expect.poll(async () => (await lineupStarters(page)).filter(s => s.startsWith('TE:'))).toEqual(['TE:George Kittle']);
        // It says so, since the Roster tab's rows show the dynasty set's ranks.
        await expect(page.locator('#lineupTab .mls-lineup-source')).toHaveText('Ranked by your In-Season rankings (Redraft ROS) until you upload Weekly rankings.');

        await showTab(page, 'scout');
        const basis = page.locator('#waiverScanBasis');
        await expect(basis.locator('option[value="season"]')).toHaveText('In-Season Rank');
        await expect(basis.locator('option[value="ros"]')).toHaveText('Dynasty Rank');
        await expect(page.locator('#waiverScanBasisGroup')).toHaveClass(/mls-rank-by-wide/);
        expect(await basis.locator('option[value="season"]').evaluate(o => o.hidden || o.disabled)).toBe(false);
        await basis.selectOption('season');
        const scan = await page.evaluate(async () => {
            const { resolveWaiverBasis } = await import('/js/mls/scout/waivers.js');
            const s = resolveWaiverBasis();
            return { name: s.name, season: s.season, first: s.rankings[0].name };
        });
        expect(scan).toEqual({ name: 'In-Season', season: true, first: 'Bijan Robinson' });

        // Auto-Find names the set the Would Start check uses, and calls the ROS slot "dynasty rankings".
        await page.locator('[data-action="setWaiverMode"][data-mode="auto"]').click();
        await page.locator('[data-action="autoFindWaiverUpgrades"]').first().click();
        const out = page.locator('#waiverOutput');
        await expect(out).toContainText('starting lineup using In-Season ranks');
        await expect(out).toContainText('the Would Start check uses In-Season ranks (same as the optimizer)');
        // The derived-ranks note is about the set the list is ranked by.
        await expect(out).toContainText('Your In-Season rankings ("Redraft ROS") don\'t include position ranks');
        await expect(out).not.toContainText('Your dynasty rankings ("Dynasty SF") don\'t include');
        // The Trade Analyzer's Power Rankings say which set gave what.
        await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson']);
        await callApp(page, 'setTradePlayers', 'give', ["Ja'Marr Chase"]);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('.mls-trade-impact-via').first()).toHaveText('Start by In-Season; value, Ovr, positions and Future by dynasty');

        // The Dashboard's best available: two choices; ROS reads a dynasty league's In-Season set and says so.
        await showTab(page, 'setup'); // the Dashboard
        await page.locator('[data-action="setBestAvailableBasis"][data-basis="ros"]').click();
        await expect(page.locator('[data-action="setBestAvailableBasis"]')).toHaveText(['Weekly', 'ROS']);
        await expect(page.locator('#mainApp')).toContainText('in its In-Season rankings');

        // Without an In-Season set, a saved In-Season Rank reads the ROS rankings and the drop-down shows ROS
        // (here "Dynasty Rank": the league is dynasty).
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: null } });
        await showTab(page, 'scout');
        await expect(basis).toHaveValue('ros');
        await expectClean(page, state);
    });

    test('the offer, one step for every dynasty league, the leagues dialog, rename and delete', async ({ page }) => {
        const { state, ids } = await setUp(page);
        // A redraft league on "Redraft ROS" (what the offer offers) and a keeper league with no In-Season set.
        for (const name of ['Bench League', 'Keeper League']) {
            await page.locator('#newLeagueName').evaluate((el, n) => { el.value = n; }, name);
            await callApp(page, 'createManualLeague');
        }
        await patchLeagues(page, { 'Bench League': { rosRankingSetId: ids.season }, 'Keeper League': { leagueType: 'keeper', rosRankingSetId: ids.dynasty } });

        await openRosCard(page);
        const offer = page.locator('#seasonOffer');
        await expect(offer).toBeVisible();
        await expect(offer).toContainText('Your redraft leagues use Redraft ROS.');
        await offer.getByRole('button', { name: 'Use it here' }).click();
        const confirm = page.locator('#mds-confirm-overlay');
        await expect(confirm).toContainText('Also use "Redraft ROS" in "Keeper League" too?');
        await confirm.getByRole('button', { name: 'Use in that one too' }).click();
        await expect(toast(page, '"Redraft ROS" is now the In-\u2060Season set in 2 leagues.')).toBeVisible();
        const leagues = await storedLeagues(page);
        expect(Object.fromEntries(leagues.map(l => [l.name, l.seasonRankingSetId || null])))
            .toEqual({ 'Fixture League': ids.season, 'Bench League': null, 'Keeper League': ids.season });
        await expect(offer).toBeHidden();
        await expect(page.locator('#seasonSetLeaguesSummary')).toHaveText('In all 2 dynasty leagues');
        await expect(page.locator('#rosSetLeaguesSummary')).toHaveText('Used in 2 of 3 leagues');

        // Choose leagues…: only the dynasty and keeper leagues; unchecking one sends it back to its dynasty set.
        await page.locator('#seasonSetLeaguesRow').getByRole('button', { name: 'Choose leagues' }).click();
        const dialog = page.locator('#rankingLeaguesOverlay');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('#rankingLeaguesTitle')).toHaveText('Use "Redraft ROS" as In-\u2060Season rankings in…');
        await expect(dialog.locator('.mls-league-picker-name')).toHaveText(['Fixture League', 'Keeper League']);
        // A checked row needs no note (the checkmark says it); the active league keeps "This league".
        await expect(dialog.locator('label', { hasText: 'Keeper League' }).locator('.mls-league-picker-note')).toHaveCount(0);
        await dialog.locator('label', { hasText: 'Keeper League' }).locator('input').uncheck();
        await dialog.locator('[data-league-picker="ok"]').click();
        await expect(toast(page, 'is now the In-\u2060Season set in 1 league.')).toBeVisible();
        expect((await storedLeagues(page)).find(l => l.name === 'Keeper League').seasonRankingSetId).toBeNull();
        await expect(page.locator('#seasonSetLeaguesSummary')).toHaveText('In 1 of 2 dynasty leagues');

        // Rename, from the redraft league that uses it: the dynasty league's picker and header show the new name.
        const bench = (await storedLeagues(page)).find(l => l.name === 'Bench League').leagueId;
        await callApp(page, 'switchActiveLeague', bench);
        await openRosCard(page);
        await expect(page.locator('#seasonRankingsRow')).toBeHidden(); // a redraft league has no Season slot
        await expect(page.locator('#rosSetLeaguesSummary')).toHaveText('Used in 2 of 3 (1 as In-\u2060Season)');
        await page.locator('#rosRenameSetBtn').click();
        await page.locator('#mds-prompt-input').fill('Redraft <b>Wk 7</b>');
        await page.locator('#mds-prompt-overlay').getByRole('button', { name: 'Rename' }).click();
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await openRosCard(page);
        await expect(page.locator('#seasonRankingSetSelect option:checked')).toHaveText('Redraft <b>Wk 7</b> (24 players)');
        await expect(page.locator('#rosHeaderSetName')).toHaveText('Dynasty: Dynasty SFIn-Season: Redraft <b>Wk 7</b>');
        expect((await powerTable(page)).key).toContain('In-Season (Redraft <b>Wk 7</b>)');

        // Delete it (from the redraft league): the confirm says so, and the In-Season slot is cleared.
        await callApp(page, 'switchActiveLeague', bench);
        await openRosCard(page);
        await page.locator('#rosDeleteSetBtn').click();
        await expect(confirm).toContainText('1 league using it as In-\u2060Season rankings will go back to their dynasty rankings.');
        await confirm.locator('[data-confirm-action="ok"]').click();
        expect((await fixture(page)).seasonRankingSetId).toBeNull();
        await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
        await openRosCard(page);
        await expect(page.locator('#seasonRankingSetSelect')).toHaveValue('');
        await expect(page.locator('#rosHeaderSetName')).toHaveText('Set: Dynasty SF');
        expect((await powerTable(page)).key).toBe('');
        await expectClean(page, state);
    });

    test('a Contender whose dynasty rankings are two weeks old gets the hint', async ({ page }) => {
        const { state, ids } = await setUp(page);
        // In-Season = whichever set makes you the Contender (1st in Start of 2): a copy of the dynasty set (the
        // dynasty set itself counts as no In-Season set), else Redraft ROS.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const dyn = State.rankingSets.ros.find(s => s.name === 'Dynasty SF');
            State.rankingSets.ros.push({ ...dyn, id: 'rset_copy', name: 'Dynasty copy' });
            localStorage.setItem('mls_ranking_sets_ros', JSON.stringify(State.rankingSets.ros));
        });
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: 'rset_copy' } });
        await powerTable(page);
        const label = page.locator('#powerRankingsOutput .mls-power-you .mls-power-label');
        if (!(await label.textContent()).startsWith('Contender')) { // textContent: the chip is upper-cased by CSS
            await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: ids.season } });
            await powerTable(page);
        }
        await expect(label).toHaveText(/^Contender/);
        let notes;
        expect((await powerTable(page)).notes).not.toContain('days old'); // fresh rankings: no hint

        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 15 * 86400000));
        await callApp(page, 'refreshPowerRankings');
        notes = (await powerTable(page)).notes;
        expect(notes).toMatch(/Your dynasty rankings are 1[45] days old\. If you're competing, turn on I'm competing this year\./);
        await page.locator('#powerCompeting').check();
        expect((await powerTable(page)).notes).not.toContain('days old');
        await expectClean(page, state);
    });

    test("the suggestion beside I'm competing: your label, moved by your record", async ({ page }) => {
        const { state, ids } = await setUp(page);
        // By Redraft ROS you're 2nd of 2 in Start: Rebuild.
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: ids.season } });
        await powerTable(page);
        const line = page.locator('#powerCompetingSuggestion');
        // The fixture's synced record has one game: too early, so the label alone.
        await expect(line).toHaveText('Suggested: Rebuilding · from your roster (too early in the season for your record).');

        // 6-1 and 1st in points for: the results move it one step, to Retool.
        await patchLeagues(page, { 'Fixture League': { record: { wins: 6, losses: 1, ties: 0, pf: 900, pa: 700, pfRank: 1, paRank: 2, of: 2 } } });
        await powerTable(page);
        await expect(line).toHaveText('Suggested: Retool (your call) · 6–1, 1st in points for, 2nd in Start. Your results beat your roster.');

        // 1-6, last in points for, the most points against: Rebuilding, with the bad luck named.
        await patchLeagues(page, { 'Fixture League': { record: { wins: 1, losses: 6, ties: 0, pf: 600, pa: 900, pfRank: 2, paRank: 1, of: 2 } } });
        await powerTable(page);
        await expect(line).toHaveText('Suggested: Rebuilding · 1–6 with the most points against, 2nd in points for, 2nd in Start.');

        // A league synced before the record existed.
        await patchLeagues(page, { 'Fixture League': { record: undefined } });
        await powerTable(page);
        await expect(line).toHaveText('Suggested: Rebuilding · from your roster; sync this league to add your record.');

        // No In-Season set: no switch, no suggestion.
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: null } });
        await powerTable(page);
        await expect(page.locator('#powerCompetingWrap')).toBeHidden();
        await expectClean(page, state);
    });

    test('Backup / Restore keeps the In-Season set and the switch', async ({ page }) => {
        const { state, ids } = await setUp(page);
        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: ids.season, powerCompeting: true } });
        await showTab(page, 'setup');
        await page.locator('summary', { hasText: 'Backup & Restore' }).click(); // collapsed accordion
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: 'Export Backup' }).click(),
        ]);
        const backupPath = await download.path();
        const saved = JSON.parse(JSON.parse(readFileSync(backupPath, 'utf8')).data.mls_leagues).find(l => l.leagueId === FIXTURE_LEAGUE_ID);
        expect(saved.seasonRankingSetId).toBe(ids.season);
        expect(saved.powerCompeting).toBe(true);

        await patchLeagues(page, { 'Fixture League': { seasonRankingSetId: null, powerCompeting: false } });
        await page.setInputFiles('#mlsImportFileInput', backupPath);
        await expect(page.locator('#mds-confirm-overlay')).toBeVisible();
        await Promise.all([
            page.waitForEvent('load'),
            page.locator('#mds-confirm-overlay [data-confirm-action="ok"]').click(),
        ]);
        await page.waitForLoadState('networkidle');
        const restored = await fixture(page);
        expect(restored.seasonRankingSetId).toBe(ids.season);
        expect(restored.powerCompeting).toBe(true);
        await openRosCard(page);
        await expect(page.locator('#seasonRankingSetSelect')).toHaveValue(ids.season);
        await expectClean(page, state);
    });
});

test('a redraft league shows no In-Season picker and no switch', async ({ page }) => {
    const { state } = await setUp(page, { dynasty: false });
    await openRosCard(page);
    await expect(page.locator('#seasonRankingsRow')).toBeHidden();
    await expect(page.locator('#rosRankingSetLabel')).toHaveText('Ranking Set for this League');
    await expect(page.locator('#rosRankingsTitle')).toHaveText('Rest-of-Season (ROS) Rankings');
    await expect(page.locator('#rosUploadTarget')).toBeHidden();
    await expect(page.locator('#rosHeaderSetName')).toHaveText('Set: Dynasty SF');
    const table = await powerTable(page, { future: false });
    expect(table.key).toBe('');
    await expect(page.locator('#powerCompetingWrap')).toBeHidden();
    await showTab(page, 'scout');
    expect(await page.locator('#waiverScanBasis option[value="season"]').evaluate(o => o.hidden && o.disabled)).toBe(true);
    await expect(page.locator('#waiverScanBasis option[value="ros"]')).toHaveText('ROS Rank');
    await expect(page.locator('#waiverScanBasisGroup')).not.toHaveClass(/mls-rank-by-wide/);
    await expectClean(page, state);
});
