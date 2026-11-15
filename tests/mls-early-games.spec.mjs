// Early Games filled in from the week's kickoffs (improvements S50, js/mls/lineup/earlyGames.js). The rule itself
// (before Sunday 1:00 PM Eastern) is unit-tested in tests/unit/earlyRule.test.mjs; this covers the card, the switch,
// the lineup's EARLY badges and the reminder, adding and removing for the week, the new week clearing the list, an
// install from before S50, and kickoffs that never load.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings } from './helpers.mjs';

// Week 2 (the fixture's NFL state), from ESPN's scoreboard: Thursday night, a Saturday game, a 9:30 AM game abroad, the
// 1:00 and 4:25 PM games and Monday night. FIXED_NOW (Tuesday 9/15) is before all of them.
const GAMES = [
    ['BUF', 'BAL', '2026-09-18T00:15:00Z'], // Thu 8:15 PM ET
    ['DET', 'LAR', '2026-09-19T20:30:00Z'], // Sat 4:30 PM ET
    ['MIN', 'PIT', '2026-09-20T13:30:00Z'], // Sun 9:30 AM ET (Dublin)
    ['CIN', 'DAL', '2026-09-20T17:00:00Z'], // Sun 1:00 PM ET
    ['PHI', 'NYJ', '2026-09-20T17:00:00Z'],
    ['ARI', 'SF', '2026-09-20T20:25:00Z'],
    ['LV', 'KC', '2026-09-22T00:15:00Z'],   // Mon 8:15 PM ET
];
const EARLY = ['BAL', 'BUF', 'DET', 'LAR', 'MIN', 'PIT'];
const scoreboard = {
    events: GAMES.map(([a, b, date]) => ({ date, status: { type: { state: 'pre' } },
        competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }] })),
};
const SCOREBOARD_RE = /site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/;

// storage: localStorage to start from (once per test, not again on a reload). espn: false = the scoreboard fails.
async function open(page, { storage = null, espn = true } = {}) {
    if (storage) {
        await page.addInitScript((s) => {
            if (sessionStorage.getItem('s50-seeded')) return;
            sessionStorage.setItem('s50-seeded', '1');
            for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        }, storage);
    }
    const state = await openApp(page, '/lineup/', {
        beforeGoto: async (p) => {
            await p.route(SCOREBOARD_RE, route => (espn ? route.fulfill({ json: scoreboard }) : route.fulfill({ status: 503, body: '' })));
        },
    });
    if (espn) await waitForKickoffs(page);
    return state;
}
const waitForKickoffs = (page) => expect.poll(() => page.evaluate(async () =>
    Object.keys((await import('/js/mls/state.js')).State.gameTimesByTeam).length)).toBe(14);

const chips = (page) => page.locator('#earlyTeamChips .team-chip');
const chipTeams = (page) => chips(page).evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
const chip = (page, team) => chips(page).filter({ has: page.locator(`[data-team="${team}"]`) });
const toggle = (page) => page.locator('#earlyFromScheduleToggle');
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

test.describe('Early Games from the schedule', () => {
    test('on by default: the week\'s early teams fill in, with kickoffs, the reminder and EARLY badges', async ({ page }) => {
        const state = await open(page);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        await expect(toggle(page)).toBeChecked();
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        for (const team of EARLY) await expect(chip(page, team)).toHaveAttribute('data-source', 'schedule');
        // Each one's kickoff, in the browser's time (UTC in the tests).
        await expect(chip(page, 'BUF').locator('.team-chip-note')).toHaveText(/^Fri 12:15/);
        await expect(chip(page, 'MIN').locator('.team-chip-note')).toHaveText(/^Sun 1:30/);
        await expect(page.locator('#earlyBanner')).toBeVisible();
        // Josh Allen (BUF), Derrick Henry and the Ravens (BAL), Justin Jefferson (MIN) and so on get EARLY;
        // Ja'Marr Chase (CIN, 1:00 PM) doesn't.
        const row = (name) => page.locator('#lineupTab .lineup-slot').filter({ has: page.locator('.player-name-wrap', { hasText: name }) });
        await expect(row('Josh Allen').locator('.early-badge')).toHaveCount(1);
        await expect(row('Justin Jefferson').locator('.early-badge')).toHaveCount(1);
        await expect(row("Ja'Marr Chase").locator('.early-badge')).toHaveCount(0);
        expect(await stored(page, 'mls_early_week')).toEqual({ week: '2026-2', schedule: EARLY, removed: [] });
        await expectClean(page, state);
    });

    test('with it on you can add a team and remove one for the week, and put it back; a reload keeps them', async ({ page }) => {
        const state = await open(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        await page.selectOption('#earlyTeamSelect', 'KC');
        await expect(chip(page, 'KC')).toHaveAttribute('data-source', 'added');
        await expect(chip(page, 'KC').locator('.team-chip-note')).toHaveText('Added');
        await chip(page, 'DET').locator('.close-chip').click();
        await expect.poll(() => chipTeams(page)).toEqual(['BAL', 'BUF', 'LAR', 'MIN', 'PIT', 'KC']);
        await expect(page.locator('#earlyRemoved')).toBeVisible();
        await expect(page.locator('#earlyRemoved')).toContainText('Removed this week: DET');

        await page.reload();
        await page.waitForLoadState('networkidle');
        await waitForKickoffs(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(['BAL', 'BUF', 'LAR', 'MIN', 'PIT', 'KC']);
        await page.locator('#earlyRemoved [data-action="restoreEarlyTeam"][data-team="DET"]').click();
        await expect.poll(() => chipTeams(page)).toEqual([...EARLY, 'KC']);
        await expect(page.locator('#earlyRemoved')).toBeHidden();
        // Removing one you added takes it off for good.
        await chip(page, 'KC').locator('.close-chip').click();
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        await expect(page.locator('#earlyRemoved')).toBeHidden();
        await expectClean(page, state);
    });

    test('switch off: you pick by hand, the schedule\'s teams aren\'t flagged, and it stays off after a reload', async ({ page }) => {
        const state = await open(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        await toggle(page).uncheck();
        await expect(chips(page)).toHaveCount(0);
        await expect(page.locator('#earlyTeamChips')).toHaveText('No teams selected.');
        await expect(page.locator('#earlyBanner')).toBeHidden();
        await expect(page.locator('#earlyFromScheduleDesc')).toContainText('pick the teams yourself');
        await page.selectOption('#earlyTeamSelect', 'CIN');
        expect(await chipTeams(page)).toEqual(['CIN']);
        await expect(chip(page, 'CIN').locator('.team-chip-note')).toHaveText('Added');
        await expect(page.locator('#earlyBanner')).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('mls_early_from_schedule'))).toBe('0');

        await page.reload();
        await page.waitForLoadState('networkidle');
        await waitForKickoffs(page);
        await showTab(page, 'lineup');
        await expect(toggle(page)).not.toBeChecked();
        expect(await chipTeams(page)).toEqual(['CIN']);
        // On again: the schedule's teams, then yours.
        await toggle(page).check();
        await expect.poll(() => chipTeams(page)).toEqual([...EARLY, 'CIN']);
        expect(await page.evaluate(() => localStorage.getItem('mls_early_from_schedule'))).toBeNull();
        await expectClean(page, state);
    });

    test('the next NFL week clears last week\'s teams, switch on or off', async ({ page }) => {
        const state = await open(page, { storage: {
            mls_early_teams: ['KC', 'SEA'],
            mls_early_week: { week: '2026-1', schedule: ['PHI', 'DAL'], removed: ['DAL'] },
            mls_early_from_schedule: '0',
        } });
        await showTab(page, 'lineup');
        await expect(toggle(page)).not.toBeChecked();
        await expect(page.locator('#earlyTeamChips')).toHaveText('No teams selected.');
        await expect(page.locator('#earlyBanner')).toBeHidden();
        expect(await stored(page, 'mls_early_teams')).toEqual([]);
        expect(await stored(page, 'mls_early_week')).toEqual({ week: '2026-2', schedule: EARLY, removed: [] });
        await toggle(page).check();
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        await expectClean(page, state);
    });

    test('an install from before this change keeps its picks for this week, as yours', async ({ page }) => {
        const state = await open(page, { storage: { mls_early_teams: ['KC', 'BUF'] } });
        await showTab(page, 'lineup');
        await expect(toggle(page)).toBeChecked();
        // BUF is the schedule's too, so it shows as the schedule's; KC is yours.
        await expect.poll(() => chipTeams(page)).toEqual([...EARLY, 'KC']);
        await expect(chip(page, 'KC')).toHaveAttribute('data-source', 'added');
        expect(await stored(page, 'mls_early_teams')).toEqual(['KC', 'BUF']);
        expect((await stored(page, 'mls_early_week')).week).toBe('2026-2');
        await expectClean(page, state);
    });

    test('kickoffs that don\'t load: what was saved for the week stays; with nothing saved, the card says so', async ({ page }) => {
        const state = await open(page, { espn: false, storage: {
            mls_early_week: { week: '2026-2', schedule: ['BAL', 'BUF'], removed: [] },
        } });
        await showTab(page, 'lineup');
        expect(await chipTeams(page)).toEqual(['BAL', 'BUF']);
        // No kickoff to show, so the chip says where it came from.
        await expect(chip(page, 'BUF').locator('.team-chip-note')).toHaveText('Schedule');
        await expect(page.locator('#earlyBanner')).toBeVisible();
        await chip(page, 'BAL').locator('.close-chip').click();
        await chip(page, 'BUF').locator('.close-chip').click();
        await expect(page.locator('#earlyTeamChips')).toHaveText('This week’s kickoff times haven’t loaded yet. You can add teams yourself.');
        await page.selectOption('#earlyTeamSelect', 'NE');
        expect(await chipTeams(page)).toEqual(['NE']);
        await expectClean(page, state);
    });
});
