// Renaming a ranking set (improvements S2): a Rename button beside Delete for a saved Weekly set
// (Lineup tab) or ROS set (Roster tab) opens the shared text-input dialog (showPrompt in
// js/shared/ui/prompt.js). A rename changes only the set's name: its id stays, so every league
// using it keeps it, and the new name shows everywhere the set is named, after a reload too.
//
// Setup in each test: the synced Fixture League with ROS and Weekly sets (loadMlsRankings), plus a
// manual "Bench League" (so the "Choose leagues..." row shows) with nothing of its own.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID, RANKINGS_CSV } from './helpers.mjs';

const TYPES = {
    weekly: { tab: 'lineup', card: 'weeklyRankingsCard', select: '#weeklyRankingSetSelect', rename: '#weeklyRenameSetBtn', del: '#weeklyDeleteSetBtn', header: '#weeklyHeaderSetName', storage: 'mls_ranking_sets_weekly', setIdKey: 'weeklyRankingSetId', label: 'Weekly' },
    ros: { tab: 'roster', card: 'rosRankingsCard', select: '#rosRankingSetSelect', rename: '#rosRenameSetBtn', del: '#rosDeleteSetBtn', header: '#rosHeaderSetName', storage: 'mls_ranking_sets_ros', setIdKey: 'rosRankingSetId', label: 'ROS' }
};
const DEFAULT_NAME = (label) => `${label} Rankings – 9/15/2026`;
// A name that would break markup if it weren't escaped.
const ODD_NAME = 'Borischen <b>Wk 2</b> & "PPR"';

const dialog = (page) => page.locator('#mds-prompt-overlay');
const input = (page) => page.locator('#mds-prompt-input');
const message = (page) => page.locator('#mds-prompt-msg');
const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
const storedSets = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), key);
const storedLeagues = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues') || '[]'));

// Shows the type's tab with its rankings card open (the card collapses once rankings are loaded).
async function openCard(page, t) {
    await showTab(page, t.tab);
    const toggle = page.locator(`#${t.card} .rankings-card-toggle`);
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(page.locator(t.select)).toBeVisible();
}

async function setUp(page) {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));
    await page.locator('#newLeagueName').evaluate((el) => { el.value = 'Bench League'; });
    await callApp(page, 'createManualLeague');
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    return state;
}

async function rename(page, t, name) {
    await page.locator(t.rename).click();
    await expect(dialog(page)).toBeVisible();
    await input(page).fill(name);
    await dialog(page).getByRole('button', { name: 'Rename' }).click();
}

for (const [type, t] of Object.entries(TYPES)) {
    test.describe(`Renaming a ${t.label} set`, () => {
        test('the new name sticks after a reload, everywhere the set is named, and leagues keep the set', async ({ page }) => {
            const state = await setUp(page);
            await openCard(page, t);
            const setId = await page.locator(t.select).inputValue();
            await expect(page.locator(t.rename)).toBeVisible();
            await expect(page.locator(t.del)).toBeVisible();

            // The dialog opens on the current name, selected, labeled and titled.
            await page.locator(t.rename).click();
            await expect(dialog(page)).toBeVisible();
            await expect(dialog(page).locator('h3')).toHaveText(`Rename ${t.label} set`);
            await expect(input(page)).toBeFocused();
            await expect(input(page)).toHaveValue(DEFAULT_NAME(t.label));
            await expect(dialog(page).getByLabel('Set name', { exact: true })).toBeFocused();
            // Surrounding spaces are trimmed.
            await input(page).fill(`  ${ODD_NAME}  `);
            await input(page).press('Enter');
            await expect(dialog(page)).toBeHidden();
            await expect(toast(page, `Renamed to "${ODD_NAME}".`)).toBeVisible();
            await expect(page.locator(t.rename)).toBeFocused();

            // Right away: the dropdown and the card header.
            await expect(page.locator(`${t.select} option:checked`)).toHaveText(`${ODD_NAME} (24 players)`);
            await expect(page.locator(t.header)).toHaveText(`Set: ${ODD_NAME}`);
            await expect(page.locator(`${t.header} b`)).toHaveCount(0);

            // Stored: only the name changed.
            let sets = await storedSets(page, t.storage);
            expect(sets).toHaveLength(1);
            expect(sets[0]).toMatchObject({ id: setId, name: ODD_NAME });
            expect(sets[0].data).toHaveLength(24);

            // Give Bench League the set through the league picker, whose title names it.
            await page.locator(`#${t.card} [data-action="openRankingSetLeagues"]`).click();
            const picker = page.locator('#rankingLeaguesOverlay');
            await expect(picker).toBeVisible();
            await expect(picker.locator('#rankingLeaguesTitle')).toHaveText(`Leagues using "${ODD_NAME}"`);
            await picker.locator('label', { hasText: 'Bench League' }).locator('input').check();
            await picker.locator('[data-league-picker="ok"]').click();
            await expect(toast(page, `"${ODD_NAME}" is now used in 2 leagues.`)).toBeVisible();

            await page.reload();
            await page.waitForLoadState('networkidle');
            await openCard(page, t);
            await expect(page.locator(`${t.select} option:checked`)).toHaveText(`${ODD_NAME} (24 players)`);
            await expect(page.locator(t.header)).toHaveText(`Set: ${ODD_NAME}`);
            await expect(page.locator('#' + (type === 'ros' ? 'rosSetLeaguesSummary' : 'weeklySetLeaguesSummary'))).toHaveText('Used in 2 of 2 leagues');

            // Both leagues still point at the same set.
            const leagues = await storedLeagues(page);
            expect(leagues.map(l => l[t.setIdKey])).toEqual([setId, setId]);

            // The other league shows the new name too, and the upload preview names it as the set it replaces.
            const bench = leagues.find(l => l.name === 'Bench League').leagueId;
            await callApp(page, 'switchActiveLeague', bench);
            await openCard(page, t);
            await expect(page.locator(`${t.select} option:checked`)).toHaveText(`${ODD_NAME} (24 players)`);
            await page.setInputFiles(`#${type}FileInput`, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
            await expect(page.locator('#rankingsPreviewTarget')).toHaveText(`Replaces the saved set ${ODD_NAME} (24 players). Used by 2 leagues. This can't be undone.`);
            await page.locator('#rankingsPreviewOverlay').getByRole('button', { name: 'Cancel' }).click();
            await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();

            // The Dashboard's Best Available line names the set it ranks by (the Fixture League is synced).
            if (type === 'weekly') {
                await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
                await showTab(page, 'setup');
                const line = page.locator('#dashboardBestAvailable .mls-ba-line').filter({ hasText: 'Fixture League' });
                await expect(line.locator('.mls-ba-source')).toHaveText(`Weekly · ${ODD_NAME}`);
            }

            sets = await storedSets(page, t.storage);
            expect(sets).toHaveLength(1);
            expect(sets[0].id).toBe(setId);
            await expectClean(page, state);
        });

        test('Cancel, Escape and an unchanged name leave the set as it was', async ({ page }) => {
            const state = await setUp(page);
            await openCard(page, t);
            const before = await storedSets(page, t.storage);

            await page.locator(t.rename).click();
            await input(page).fill('Something else');
            await dialog(page).getByRole('button', { name: 'Cancel' }).click();
            await expect(dialog(page)).toBeHidden();

            await page.locator(t.rename).click();
            await input(page).fill('Something else');
            await input(page).press('Escape');
            await expect(dialog(page)).toBeHidden();

            await rename(page, t, DEFAULT_NAME(t.label));
            await expect(dialog(page)).toBeHidden();
            await expect(toast(page, 'No changes made.')).toBeVisible();

            await expect(page.locator(`${t.select} option:checked`)).toHaveText(`${DEFAULT_NAME(t.label)} (24 players)`);
            expect(await storedSets(page, t.storage)).toEqual(before);
            await expectClean(page, state);
        });

        test('an empty name is rejected and a long one is capped', async ({ page }) => {
            const state = await setUp(page);
            await openCard(page, t);
            const before = await storedSets(page, t.storage);

            await rename(page, t, '   ');
            await expect(dialog(page)).toBeVisible();
            await expect(message(page)).toHaveText('Enter a name for this set.');
            await expect(message(page)).toHaveClass(/\bis-error\b/);
            await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
            await expect(input(page)).toBeFocused();
            expect(await storedSets(page, t.storage)).toEqual(before);

            // Typing clears the error.
            await input(page).fill('W');
            await expect(message(page)).toHaveText('');
            await expect(input(page)).not.toHaveAttribute('aria-invalid', 'true');

            // The field takes at most 60 characters.
            await input(page).fill('');
            await input(page).pressSequentially('x'.repeat(70));
            await expect(input(page)).toHaveValue('x'.repeat(60));
            await dialog(page).getByRole('button', { name: 'Rename' }).click();
            await expect(dialog(page)).toBeHidden();
            expect((await storedSets(page, t.storage))[0].name).toBe('x'.repeat(60));
            await expectClean(page, state);
        });
    });
}

test.describe('Rename', () => {
    test('warns on a name another set of the same type has, but allows it', async ({ page }) => {
        const state = await setUp(page);
        const t = TYPES.ros;
        await openCard(page, t);
        // A second ROS set, saved as new from "+ Create New Set".
        await page.locator(t.select).selectOption('__new__');
        await expect(page.locator(t.rename)).toBeHidden();
        await expect(page.locator(t.del)).toBeHidden();
        await page.fill('#rosNewSetName', 'Second ROS');
        await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
        await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
        await openCard(page, t);
        await expect(page.locator(`${t.select} option:checked`)).toHaveText('Second ROS (24 players)');

        // The Weekly set's name is no clash (a different pool); the first ROS set's is, in any case.
        await page.locator(t.rename).click();
        await input(page).fill(DEFAULT_NAME('Weekly'));
        await expect(message(page)).toHaveText('');
        await input(page).fill(DEFAULT_NAME('ROS').toUpperCase());
        await expect(message(page)).toHaveText('Another ROS set already has this name. You can still use it.');
        await expect(message(page)).toHaveClass(/\bis-warning\b/);
        await dialog(page).getByRole('button', { name: 'Rename' }).click();
        await expect(dialog(page)).toBeHidden();

        const sets = await storedSets(page, t.storage);
        expect(sets.map(s => s.name)).toEqual([DEFAULT_NAME('ROS'), DEFAULT_NAME('ROS').toUpperCase()]);
        expect(new Set(sets.map(s => s.id)).size).toBe(2);
        await expectClean(page, state);
    });

    test('shows only for a saved set: not for "+ Create New Set" or legacy data', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        const t = TYPES.weekly;
        await openCard(page, t);
        await expect(page.locator(`${t.select} option:checked`)).toHaveText('+ Create New Set');
        await expect(page.locator(t.rename)).toBeHidden();

        // A legacy per-league upload (from before named sets), written straight into storage.
        await page.evaluate(() => {
            const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
            leagues[0].weeklyRankings = [{ name: 'Josh Allen', cleanName: 'joshallen', pos: 'QB', rank: 1 }];
            leagues[0].weeklyRankingsUpdatedAt = Date.now();
            localStorage.setItem('mls_leagues', JSON.stringify(leagues));
        });
        await page.reload();
        await page.waitForLoadState('networkidle');
        await openCard(page, t);
        await expect(page.locator(`${t.select} option:checked`)).toHaveText('Unassigned Upload (legacy) — 1 players');
        await expect(page.locator(t.rename)).toBeHidden();
        await expect(page.locator(t.del)).toBeHidden();
        await expectClean(page, state);
    });
});
