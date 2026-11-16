// Early Games filled in from the week's kickoffs (improvements S50, js/mls/lineup/earlyGames.js). The rule itself
// (before Sunday 1:00 PM Eastern) is unit-tested in tests/unit/earlyRule.test.mjs; this covers the card, the switch,
// the lineup's EARLY badges and the reminder, adding and removing for the week, the new week clearing the list, an
// install from before S50, and kickoffs that never load.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXTURE_LEAGUE_ID } from './helpers.mjs';

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

// Your lineup on Sleeper, for the reminder (round 3): QB RB RB WR WR TE FLEX K DEF, with Justin Jefferson (MIN, the
// Sunday 9:30 AM ET game) in FLEX and Ja'Marr Chase and CeeDee Lamb (1:00 PM) at WR.
const SLEEPER_STARTERS = ['4984', '3198', '0', '4866', '6786', '11604', '6794', '17', 'BAL'];
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
async function routeSleeperLineup(page, starters) {
    const rosters = fixture('league-rosters.json');
    rosters.find(r => r.owner_id === '900001').starters = starters;
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), route => route.fulfill({ json: rosters }));
}

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
// The row a team's chip is in: the day it plays (your time; UTC in the tests), "Schedule" or "Added" (round 2).
const dayOf = (page, team) => page.locator('#earlyTeamChips .early-day').filter({ has: page.locator(`[data-team="${team}"]`) }).locator('.early-day-label');
// The early-game swaps in "This lineup needs you" (round 4): a fold of the box, or its body when they're all it has.
const earlyNeeds = (page) => page.locator('#optimalLineupContainer .lineup-needs-early, #optimalLineupContainer .lineup-needs-early-body');
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
        // One row per kickoff, labelled with it in the browser's time (UTC in the tests; round 3).
        await expect(page.locator('#earlyTeamChips .early-day-label')).toHaveText(['Fri 12:15 AM', 'Sat 8:30 PM', 'Sun 1:30 PM']);
        await expect(dayOf(page, 'BUF')).toHaveText('Fri 12:15 AM');
        await expect(dayOf(page, 'MIN')).toHaveText('Sun 1:30 PM');
        // No Sleeper lineup here, and this app's lineup has nobody early in FLEX (FLEX Kickoff Optimization put
        // CeeDee Lamb's 1:00 PM game there): no early swap to suggest.
        await expect(earlyNeeds(page)).toHaveCount(0);
        // Josh Allen (BUF), Derrick Henry and the Ravens (BAL), Justin Jefferson (MIN) and so on get EARLY;
        // Ja'Marr Chase (CIN, 1:00 PM) doesn't.
        const row = (name) => page.locator('#lineupTab .lineup-slot').filter({ has: page.locator('.player-name-wrap', { hasText: name }) });
        await expect(row('Josh Allen').locator('.early-badge')).toHaveCount(1);
        await expect(row('Justin Jefferson').locator('.early-badge')).toHaveCount(1);
        await expect(row("Ja'Marr Chase").locator('.early-badge')).toHaveCount(0);
        expect(await stored(page, 'mls_early_week')).toEqual({ week: '2026-2', schedule: EARLY, removed: [] });

        // Round 2: once Thursday's game has started, Allen loses EARLY; Jefferson (Sunday morning) keeps it.
        await page.clock.setFixedTime(new Date('2026-09-18T01:00:00Z'));
        await callApp(page, 'renderLineupUI');
        await expect(row('Josh Allen').locator('.early-badge')).toHaveCount(0);
        await expect(row('Justin Jefferson').locator('.early-badge')).toHaveCount(1);
        await page.clock.setFixedTime(new Date('2026-09-20T14:00:00Z'));
        await callApp(page, 'renderLineupUI');
        await expect(page.locator('#lineupTab .early-badge')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('the reminder names the swap to make on Sleeper, from your Sleeper lineup, until his game starts', async ({ page }) => {
        const state = await open(page);
        await routeSleeperLineup(page, SLEEPER_STARTERS);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        const box = page.locator('#optimalLineupContainer .lineup-needs-box');
        const fold = box.locator('.lineup-needs-early');
        // This app's lineup has Lamb in FLEX; Sleeper's has Jefferson there, and that's the one that counts (owner).
        // Round 4: a fold of "This lineup needs you", closed, not a banner; it doesn't add to the box's count.
        await expect(fold).toBeVisible();
        await expect(fold.locator('summary')).toHaveText('Early games: 1 swap on Sleeper');
        await expect(fold).not.toHaveAttribute('open', '');
        const titleBefore = await box.locator('.lineup-needs-title').textContent();
        expect(titleBefore).toContain('This lineup needs you');
        await fold.locator('summary').click();
        await expect(fold).toContainText("Swap Justin Jefferson (FLEX, Sun 1:30 PM) with Ja'Marr Chase (WR, Sun 5:00 PM), so your FLEX holds the later game.");
        await expect(fold).toContainText('On Sleeper, as of your last sync, Tue 4:00 PM.');
        // Folded, the box's count leaves the suggestion out (F12's rule for "needs you").
        await box.locator('.lineup-needs-title').click();
        const folded = await box.locator('.lineup-needs-title').textContent();
        await box.locator('.lineup-needs-title').click();
        // Round 5: the same starters as Sleeper, but not a match while the swap is to make there.
        await expect(page.locator('#optimalLineupContainer')).toContainText('Same starters as your Sleeper lineup');
        await expect(page.locator('#optimalLineupContainer')).not.toContainText('Matches your active Sleeper lineup');
        // Round 5: the Dashboard's league card names it too, muted and not counted.
        await showTab(page, 'setup');
        const card = page.locator('.mls-lc-card').filter({ hasText: 'Fixture League' });
        await expect(card.locator('.mls-lc-early')).toHaveText("Early games: swap Justin Jefferson (FLEX) with Ja'Marr Chase (WR) on Sleeper");
        await expect(card.locator('.mls-lc-count-todo')).toHaveText('1 to fix');
        await showTab(page, 'lineup');
        // Once Jefferson's game has started there's nothing left to swap.
        await page.clock.setFixedTime(new Date('2026-09-20T14:00:00Z'));
        await callApp(page, 'renderLineupUI');
        await expect(earlyNeeds(page)).toHaveCount(0);
        expect(folded).toMatch(/^This lineup needs you/);
        expect(folded).not.toContain('Early');
        await expectClean(page, state);
    });

    test('Got it hides the swap for the week, after a reload too', async ({ page }) => {
        const state = await open(page);
        await routeSleeperLineup(page, SLEEPER_STARTERS);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        const fold = page.locator('#optimalLineupContainer .lineup-needs-early');
        await fold.locator('summary').click();
        await expect(fold.getByRole('button', { name: 'Got it: hide this early-game swap for the week' })).toBeVisible();
        // With the keyboard, as round 6 checked: focus stays in the box (its title) rather than the top of the page.
        await fold.getByRole('button', { name: 'Got it' }).focus();
        await page.keyboard.press('Enter');
        await expect(earlyNeeds(page)).toHaveCount(0);
        await expect(page.locator('#optimalLineupContainer .lineup-needs-title')).toBeFocused();
        await expect(page.locator('#optimalLineupContainer')).toContainText('Matches your active Sleeper lineup');
        expect(await stored(page, 'mls_early_dismissed')).toEqual({ week: '2026-2', keys: ['6794>4866'] });
        await page.reload();
        await page.waitForLoadState('networkidle');
        await waitForKickoffs(page);
        await showTab(page, 'lineup');
        await expect(page.locator('#lineupTab .early-badge').first()).toBeVisible();
        await expect(earlyNeeds(page)).toHaveCount(0);
        await showTab(page, 'setup');
        await expect(page.locator('.mls-lc-early')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('two swaps: one line leading the list, the slot plural', async ({ page }) => {
        const state = await open(page);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        // A league with two FLEX slots: Jefferson (Sun 9:30 AM ET) and Puka Nacua (Sat) in them, Chase and Lamb at WR.
        const html = await page.evaluate(async () => {
            const e = await import('/js/mls/lineup/earlyGames.js');
            const { getActiveLeague } = await import('/js/mls/helpers.js');
            const lg = getActiveLeague();
            const two = { ...lg, starterSlots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'],
                sleeperStarters: ['4984', '3198', '0', '4866', '6786', '11604', '6794', '9493', '17', 'BAL'] };
            return { needs: e.earlySwapNeeds(two), line: e.earlySwapCardLine(two) };
        });
        expect(html.needs.title).toBe('Early games: 2 swaps to consider');
        const decode = (h) => h.replace(/&#39;/g, "'");
        const text = decode(html.needs.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        expect(text).toContain("Swap these, so your FLEX slots hold the later games: Justin Jefferson (FLEX, Sun 1:30 PM) with Ja'Marr Chase (WR, Sun 5:00 PM) Puka Nacua (FLEX, Sat 8:30 PM) with CeeDee Lamb (WR, Sun 5:00 PM)");
        expect(html.needs.body).toContain('aria-label="Got it: hide these early-game swaps for the week"');
        expect(decode(html.line)).toBe("Early games: swap Justin Jefferson (FLEX) with Ja'Marr Chase (WR); Puka Nacua (FLEX) with CeeDee Lamb (WR) on Sleeper");
        await expectClean(page, state);
    });

    test('no reminder when Sleeper already has the early players in their own slots', async ({ page }) => {
        const state = await open(page);
        // Jefferson at WR, Lamb (1:00 PM) in FLEX.
        await routeSleeperLineup(page, ['4984', '3198', '0', '4866', '6794', '11604', '6786', '17', 'BAL']);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        await expect(page.locator('#lineupTab .early-badge').first()).toBeVisible();
        await expect(earlyNeeds(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    test('with it on you can add a team and remove one for the week, and put it back; a reload keeps them', async ({ page }) => {
        const state = await open(page);
        await showTab(page, 'lineup');
        await expect.poll(() => chipTeams(page)).toEqual(EARLY);
        await page.selectOption('#earlyTeamSelect', 'KC');
        await expect(chip(page, 'KC')).toHaveAttribute('data-source', 'added');
        await expect(dayOf(page, 'KC')).toHaveText('Added');
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
        await expect(page.locator('#earlyFromScheduleDesc')).toContainText('pick the teams yourself');
        await page.selectOption('#earlyTeamSelect', 'CIN');
        expect(await chipTeams(page)).toEqual(['CIN']);
        await expect(dayOf(page, 'CIN')).toHaveText('Added');
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
        // No kickoff to show, so the row says where they came from.
        await expect(dayOf(page, 'BUF')).toHaveText('Schedule');
        await chip(page, 'BAL').locator('.close-chip').click();
        await chip(page, 'BUF').locator('.close-chip').click();
        await expect(page.locator('#earlyTeamChips')).toHaveText('This week’s kickoff times haven’t loaded yet. You can add teams yourself.');
        await page.selectOption('#earlyTeamSelect', 'NE');
        expect(await chipTeams(page)).toEqual(['NE']);
        await expectClean(page, state);
    });
});
