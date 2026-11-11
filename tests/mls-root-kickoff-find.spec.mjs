// The Player Scoreboard's kickoff order and find field (improvements S33, js/mls/week/rootFor.js's kickoffOrder and
// week/thisWeek.js): while games are left, Root for, Against you and Both sides list players by kickoff, the earliest
// unfinished game first, under a divider per kickoff window; finished players fold into "N finished" at the bottom of
// their box; and a search field finds any starter in this week's matchups and shows his row and leagues under it.
//
// Fixtures: mls-root-for.spec.mjs's three leagues (Josh Allen and Lamar Jackson on both sides, your other seven
// starters Root for, Rival's other seven Against you), with a scoreboard whose BUF @ BAL game is on Thursday night:
// - Thursday evening: BUF @ BAL under way, everything else still to come.
// - Sunday: BUF @ BAL final, the 1:00 games under way, MIN @ CHI at night.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, transitionsDone, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID, FIXTURE_LEAGUE3_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const THURSDAY = new Date('2026-09-17T23:45:00Z');
const SUNDAY = new Date('2026-09-20T18:30:00Z');
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const GAMES = [['BUF', 'BAL'], ['CIN', 'DAL'], ['LV', 'ATL'], ['DET', 'NYG'], ['HOU', 'PHI'], ['KC', 'DEN'], ['MIN', 'CHI']];
const scoreboard = (sunday) => ({
    events: GAMES.map(([a, b]) => {
        const [date, state] = a === 'BUF' ? ['2026-09-17T23:15:00Z', sunday ? 'post' : 'in']
            : a === 'MIN' ? ['2026-09-21T00:20:00Z', 'pre'] : ['2026-09-20T17:00:00Z', sunday ? 'in' : 'pre'];
        return { date, status: { type: { state } }, competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }] };
    }),
});

const card = (page) => page.locator('#thisWeekCard');
const board = (page) => card(page).locator('.mls-week-fold[data-fold="root"]');
const group = (page, kind) => board(page).locator(`.mls-root-spot .mls-root-group.is-${kind}`);
// A box's list as drawn: a divider's text ("# Thu 11:15 PM · Live") or a row's team.
const listOf = (loc) => loc.locator('.mls-root-list').first().locator('> li').evaluateAll(els => els.map(li =>
    li.classList.contains('mls-root-kick') ? `# ${li.textContent.trim()}` : li.querySelector('.mls-root-meta').textContent.trim().split(' ')[0]));

async function addLeague(page, id, count) {
    await page.fill('#sleeperLeagueId', id);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(count);
}
async function setup(page, when) {
    const sunday = when === SUNDAY;
    await page.clock.setFixedTime(when);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(when);
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard(sunday) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: fixture('league-matchups-live.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: fixture('league2-matchups.json') }));
    await seedMls(page);
    await addLeague(page, FIXTURE_LEAGUE2_ID, 2);
    await addLeague(page, FIXTURE_LEAGUE3_ID, 3);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'scoreboard');
    await expect(board(page).locator('.mls-root-spot')).toBeVisible();
    return state;
}

test.describe('Player Scoreboard: kickoff order', () => {
    test('Thursday evening: Thursday night\'s players on top of each box, then by kickoff', async ({ page }) => {
        const state = await setup(page, THURSDAY);
        // Root for: your BAL players (the game under way) first, though Show all hides the last two rows.
        const root = group(page, 'root');
        await expect(root.locator('.mls-root-group-title')).toContainText('Root for 7');
        await root.locator('[data-action="showAllRoot"]').click();
        await expect(root.locator('.mls-root-row')).toHaveCount(7);
        const rows = await listOf(root);
        expect(rows[0]).toMatch(/^# Thu .* · Live$/);
        const second = rows.findIndex((t, i) => i > 0 && t.startsWith('#'));
        expect(second).toBeGreaterThan(1);
        expect(rows.slice(1, second).every(t => t === 'BAL')).toBe(true);
        expect(rows[second]).toMatch(/^# Sun /);
        expect(rows[second]).not.toContain('Live');
        // Three kickoff windows, and Sunday night's Jefferson last.
        expect(rows.filter(t => t.startsWith('#'))).toHaveLength(3);
        expect(rows[rows.length - 1]).toBe('MIN');
        expect(rows[rows.length - 2]).toMatch(/^# /);
        // Under a divider the rows don't repeat the time or "Live".
        await expect(root.locator('.mls-root-row').first().locator('.mls-root-meta')).not.toContainText(/Live|PM|AM/);
        // Both sides: Allen and Lamar both play Thursday. Against you: everyone on Sunday at 1:00.
        const both = await listOf(group(page, 'both'));
        expect(both).toHaveLength(3);
        expect(both[0]).toMatch(/^# Thu .* · Live$/);
        expect(both.slice(1).sort()).toEqual(['BAL', 'BUF']);
        const against = await listOf(group(page, 'against'));
        expect(against.filter(t => t.startsWith('#'))).toHaveLength(1);
        expect(against[0]).toMatch(/^# Sun /);
        // Nothing has finished, so no box has a finished line.
        await expect(board(page).locator('.mls-root-fin-toggle')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('Sunday: Thursday is final, so its players fold into "N finished" at the bottom of each box', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        const root = group(page, 'root');
        const rows = await listOf(root);
        expect(rows[0]).toMatch(/^# Sun .* · Live$/);
        expect(rows).not.toContain('BAL');
        expect(rows[rows.length - 1]).toBe('MIN');
        expect(rows.filter(t => t.startsWith('#'))).toHaveLength(2);
        // Your BAL players are in the folded line, which opens in place and keeps focus.
        const fin = root.locator('.mls-root-fin-toggle');
        const n = await root.locator('.mls-root-fin-body .mls-root-row').count();
        expect(n).toBeGreaterThan(0);
        await expect(fin).toHaveText(`${n} finished`);
        await expect(fin).toHaveAttribute('aria-expanded', 'false');
        await expect(root.locator('.mls-root-fin-body')).toBeHidden();
        await fin.click();
        await expect(fin).toHaveAttribute('aria-expanded', 'true');
        await expect(root.locator('.mls-root-fin-body')).toBeVisible();
        await expect(root.locator('.mls-root-fin-body .mls-root-meta').first()).toContainText('BAL vs BUF · Final');
        await expect(fin).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(root.locator('.mls-root-fin-body')).toBeHidden();
        // The count in the title is who's still to play, as before.
        await expect(root.locator('.mls-root-group-title')).toContainText(`Root for ${7 - n}`);
        // Both sides: both finished. The box says so and holds them in its line.
        const both = group(page, 'both');
        await expect(both).toContainText('All 2 have finished.');
        await expect(both.locator('.mls-root-fin-toggle')).toHaveText('2 finished');
        await both.locator('.mls-root-fin-toggle').click();
        expect((await both.locator('.mls-root-fin-body .mls-root-name').allTextContents()).map(t => t.trim()).sort()).toEqual(['Josh Allen 2 of 3 yours', 'Lamar Jackson 1 of 3 yours']);
        // Against you: nobody has finished.
        await expect(group(page, 'against').locator('.mls-root-fin-toggle')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('a past week keeps the order by weight: no dividers, no finished line', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        await card(page).locator('.mls-week-step[data-step="-1"]').click();
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        await expect(group(page, 'root').locator('.mls-root-row')).toHaveCount(5);
        await expect(board(page).locator('.mls-root-kick')).toHaveCount(0);
        await expect(board(page).locator('.mls-root-fin-toggle')).toHaveCount(0);
        await expectClean(page, state);
    });
});

test.describe('Player Scoreboard: find a player', () => {
    const input = (page) => board(page).locator('.mls-root-find-input');
    const found = (page) => board(page).locator('.mls-root-found');

    test('finds a player on both sides: his row and leagues under the field; Escape clears', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        await expect(input(page)).toBeVisible();
        await expect(found(page)).toHaveCount(0);
        await expect(board(page).locator('.mls-root-find-clear')).toBeHidden();
        // The suggestions are this week's starters, each saying where he stands.
        await input(page).fill('all');
        const items = board(page).locator('.autocomplete-item');
        await expect(items).toHaveCount(1);
        await expect(items.first()).toContainText('Josh Allen');
        await expect(items.first()).toContainText('Both sides, 2 of 3 yours');
        // Enter picks the only match: his row under the field, in Both sides' color, leagues open, focus on it.
        await page.keyboard.press('Enter');
        await transitionsDone(page);
        await expect(found(page)).toHaveCount(1);
        await expect(found(page)).toHaveClass(/is-both/);
        await expect(found(page).locator('.mls-root-group-title')).toHaveText('Both sides');
        await expect(found(page).locator('.mls-root-count')).toHaveText('2 of 3 yours');
        await expect(found(page).locator('.mls-root-meta')).toContainText('BUF @ BAL · Final');
        const row = found(page).locator('.mls-root-player');
        await expect(row).toHaveAttribute('aria-expanded', 'true');
        await expect(row).toBeFocused();
        const detail = found(page).locator('.mls-root-detail');
        await expect(detail).toBeVisible();
        await expect(detail.locator('.mls-root-detail-side').first()).toContainText('Yours in');
        await expect(detail.locator('.mls-root-detail-side').first().locator('li')).toHaveCount(2);
        await expect(detail.locator('.mls-root-detail-side').nth(1)).toContainText('Against you in');
        await expect(detail.locator('.mls-root-detail-side').nth(1)).toContainText('Third Fixture League');
        await expect(input(page)).toHaveValue('Josh Allen');
        // The boxes didn't move: he's still only in Both sides' finished line.
        await expect(group(page, 'both').locator('.mls-root-fin-toggle')).toHaveText('2 finished');
        // His row folds and opens like any other.
        await page.keyboard.press('Enter');
        await expect(detail).toBeHidden();
        // Escape on the row clears and goes back to the field.
        await page.keyboard.press('Escape');
        await expect(found(page)).toHaveCount(0);
        await expect(input(page)).toHaveValue('');
        await expect(input(page)).toBeFocused();
        await expectClean(page, state);
    });

    test('a tap on a suggestion, a Root for player, the clear button, and text that survives a redraw', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        await input(page).fill('jeff');
        await board(page).locator('.autocomplete-item', { hasText: 'Justin Jefferson' }).click();
        await expect(found(page)).toHaveClass(/is-root/);
        await expect(found(page).locator('.mls-root-group-title')).toHaveText('Root for');
        await expect(found(page).locator('.mls-root-count')).toHaveText('in 3');
        await expect(found(page).locator('.mls-root-detail li')).toHaveCount(3);
        // A suggestion's position, team and standing sit under the name, so a long name has the row's width.
        await input(page).fill('ja');
        const item = board(page).locator('.autocomplete-item').first();
        const [nameBox, metaBox] = [await item.locator('span').first().boundingBox(), await item.locator('.autocomplete-meta').boundingBox()];
        expect(metaBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
        await input(page).fill('Justin Jefferson');
        await found(page).locator('.mls-root-player').focus();
        // Another pick replaces him: tapping the field selects the picked name, so typing starts a new search.
        await input(page).click();
        await page.keyboard.type('lamar');
        await expect(input(page)).toHaveValue('lamar');
        await expect(board(page).locator('.autocomplete-item')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(found(page).locator('.mls-root-name')).toContainText('Lamar Jackson');
        await expect(found(page)).toHaveCount(1);
        // A redraw (Refresh) keeps the field's text and the result.
        await card(page).locator('[data-action="refreshThisWeek"]').click();
        await page.waitForLoadState('networkidle');
        await expect(input(page)).toHaveValue('Lamar Jackson');
        await expect(found(page).locator('.mls-root-name')).toContainText('Lamar Jackson');
        // The clear button.
        const clear = board(page).locator('.mls-root-find-clear');
        await expect(clear).toBeVisible();
        await clear.click();
        await expect(found(page)).toHaveCount(0);
        await expect(input(page)).toHaveValue('');
        await expect(clear).toBeHidden();
        // Escape in the field clears what's typed.
        await input(page).fill('jo');
        await input(page).press('Escape');
        await expect(input(page)).toHaveValue('');
        await expectClean(page, state);
    });

    test('nobody matches: the field says so; another week starts empty', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        const none = board(page).locator('.mls-root-find-none');
        await expect(none).toBeHidden();
        await input(page).fill('kelce');
        await expect(none).toHaveText('No starter in this week\'s matchups matches "kelce".');
        // With a player picked, a name nobody matches still says so.
        await input(page).fill('allen');
        await page.keyboard.press('Enter');
        await expect(found(page)).toHaveCount(1);
        await input(page).fill('kelce');
        await expect(none).toHaveText('No starter in this week\'s matchups matches "kelce".');
        await board(page).locator('.mls-root-find-clear').click();
        await input(page).fill('kelce');
        await expect(board(page).locator('.autocomplete-item')).toHaveCount(0);
        await page.keyboard.press('Enter');
        await expect(found(page)).toHaveCount(0);
        // One letter isn't a search yet; a name that matches hides the line.
        await input(page).fill('k');
        await expect(none).toBeHidden();
        await input(page).fill('josh');
        await expect(none).toBeHidden();
        // Stepping to another week empties the field.
        await card(page).locator('.mls-week-step[data-step="-1"]').click();
        await expect(card(page).locator('.mls-week-head .mls-week-status')).toHaveText('Final');
        await expect(input(page)).toHaveValue('');
        await expectClean(page, state);
    });

    test('at 375px and 1280px the field and its result stay inside the card', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        for (const width of [375, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            await input(page).fill('allen');
            await page.keyboard.press('Enter');
            await expect(found(page)).toHaveCount(1);
            const over = await card(page).evaluate(el => {
                const box = el.getBoundingClientRect();
                return [...el.querySelectorAll('.mls-root-find, .mls-root-found, .mls-root-found *, .mls-root-kick, .mls-root-fin-toggle')].filter(e => {
                    const r = e.getBoundingClientRect();
                    return r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5);
                }).length;
            });
            expect(over, `width ${width}`).toBe(0);
            await page.keyboard.press('Escape');
        }
        await expectClean(page, state);
    });

    test('no starters: no field', async ({ page }) => {
        await page.clock.setFixedTime(SUNDAY);
        const state = await openApp(page, '/lineup/');
        await showTab(page, 'scoreboard');
        await expect(card(page).locator('.mls-root-find-input')).toHaveCount(0);
        await expectClean(page, state);
    });
});
