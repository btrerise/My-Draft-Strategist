// The Scoreboard's Final Window (improvements S36, js/mls/week/lastWindow.js and week/thisWeek.js's finalHTML): when every
// live player in your matchups is in the week's last night window, a section above League Scoreboard shows what's at
// stake, expected wins, the best case and a clean sweep, then what each matchup needs.
//
// Fixtures: mls-root-for.spec.mjs's three leagues. On Monday night every game is final but two, MIN @ CHI (7:15 PM ET)
// and KC @ DEN (8:15 PM ET): your Justin Jefferson (MIN) against their Harrison Butker (KC), in all three leagues.
// Butker's points are set to 0 (he hasn't played), so the scores are: Fixture League 98–104 (down 6), Second 130.4–88.2
// (up 42.2) and Third 100–102 (down 2).
// On Sunday afternoon the 1:00 games are under way: not the final window, so no section.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, FIXTURE_LEAGUE_ID, FIXTURE_LEAGUE2_ID, FIXTURE_LEAGUE3_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const MONDAY = new Date('2026-09-21T23:30:00Z'); // 7:30 PM ET, before both Monday kickoffs
const SUNDAY = new Date('2026-09-20T18:30:00Z');
const BUTKER = '5095';
const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
// Butker hasn't played yet: his points come off his team's total.
// lead: points added to the opponent's total (roster 2), to settle a matchup for the one- and none-at-stake cases.
const benchButker = (name, lead = 0) => JSON.stringify(JSON.parse(fixture(name)).map(e => {
    const pts = (e.players_points || {})[BUTKER];
    if (typeof pts !== 'number') return e;
    const extra = e.roster_id === 2 ? lead : 0;
    return { ...e, points: Math.round((e.points - pts + extra) * 100) / 100, players_points: { ...e.players_points, [BUTKER]: 0 } };
}));
const GAMES = [['BUF', 'BAL'], ['CIN', 'DAL'], ['LV', 'ATL'], ['DET', 'NYG'], ['HOU', 'PHI'], ['KC', 'DEN'], ['MIN', 'CHI']];
// live 'min': MIN @ CHI under way (3rd quarter, 10:00 left), KC @ DEN still to come. 'both': MIN @ CHI in the 2nd
// quarter and KC @ DEN in the 4th (5:00 left), so Jefferson has more to come than Butker.
const scoreboard = (monday, live = null) => ({
    events: GAMES.map(([a, b]) => {
        const [date, state] = monday
            ? (a === 'MIN' ? ['2026-09-22T00:15:00Z', live ? 'in' : 'pre'] : a === 'KC' ? ['2026-09-22T01:15:00Z', live === 'both' ? 'in' : 'pre'] : ['2026-09-20T17:00:00Z', 'post'])
            : (a === 'MIN' ? ['2026-09-21T00:20:00Z', 'pre'] : ['2026-09-20T17:00:00Z', 'in']);
        const clock = live === 'both' ? (a === 'MIN' ? { period: 2, clock: 900 } : { period: 4, clock: 300 }) : { period: 3, clock: 600 };
        const status = state === 'in' ? { type: { state }, ...clock } : { type: { state } };
        return { date, status, competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }] };
    }),
});
const LIVE = new Date('2026-09-22T01:00:00Z'); // MIN @ CHI in the 3rd quarter, before KC @ DEN
const BOTH_LIVE = new Date('2026-09-22T02:30:00Z'); // both games under way
// Copies of the third league under other ids, for the cap on cards (lead: its opponent's extra points).
const EXTRA = [['1000000000000000041', -1], ['1000000000000000042', 1], ['1000000000000000043', -3], ['1000000000000000044', 2]];

const card = (page) => page.locator('#thisWeekCard');
// Every win chance in a place, as [text, favored?, red?]: green at 50% or more, red under (round 5, owner's choice B).
async function chanceTones(loc) {
    return loc.locator('.mls-week-chance, .mls-week-tile-chance').evaluateAll(els => els.map(el => {
        const t = el.textContent.trim();
        const n = t.startsWith('<') ? 0 : (t.startsWith('>') ? 100 : parseFloat(t));
        return [t, n >= 50, el.classList.contains('is-dog') && getComputedStyle(el).color === 'rgb(239, 68, 68)'];
    }));
}
// A card's "What if…" table, opened if it's folded (only the first card's starts open, and which card is first depends
// on the runs).
async function openWhatIf(match) {
    const t = match.locator('.mls-fw-whatif-toggle');
    if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
    await expect(match.locator('.mls-fw-table')).toBeVisible();
}
const expectTones = async (loc, atLeast = 1) => {
    const tones = await chanceTones(loc);
    expect(tones.length).toBeGreaterThanOrEqual(atLeast);
    for (const [text, fav, red] of tones) expect(red, text).toBe(!fav);
};
const section = (page) => card(page).locator('.mls-week-fold[data-fold="final"]');

async function addLeague(page, id, count) {
    await page.fill('#sleeperLeagueId', id);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(count);
}
async function setup(page, when, { failWorker = false, lead = {}, extra = false } = {}) {
    const monday = when === MONDAY || when === LIVE || when === BOTH_LIVE;
    await page.clock.setFixedTime(when);
    const state = await openApp(page, '/lineup/');
    await page.clock.setFixedTime(when);
    await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard(monday, when === LIVE ? 'min' : (when === BOTH_LIVE ? 'both' : null)) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league-matchups-live.json', lead.first || 0) }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE2_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league2-matchups.json') }));
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE3_ID}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league3-matchups.json', lead.third || 0) }));
    if (extra) {
        for (const [id, d] of EXTRA) {
            const n = id.slice(-1);
            await page.route(new RegExp(`sleeper\\.app/v1/league/${id}$`), route => route.fulfill({ json: { ...JSON.parse(fixture('league3.json')), league_id: id, name: `Extra League ${n}` } }));
            await page.route(new RegExp(`sleeper\\.app/v1/league/${id}/rosters$`), route => route.fulfill({ contentType: 'application/json', body: fixture('league3-rosters.json') }));
            await page.route(new RegExp(`sleeper\\.app/v1/league/${id}/matchups/\\d+$`), route => route.fulfill({ contentType: 'application/json', body: benchButker('league3-matchups.json', d) }));
        }
    }
    if (failWorker) await page.route(/lastWindowWorker\.js$/, route => route.abort());
    await seedMls(page);
    await addLeague(page, FIXTURE_LEAGUE2_ID, 2);
    await addLeague(page, FIXTURE_LEAGUE3_ID, 3);
    if (extra) for (const [i, [id]] of EXTRA.entries()) await addLeague(page, id, 4 + i);
    await page.waitForLoadState('networkidle');
    await showTab(page, 'scoreboard');
    await expect(card(page).locator('.mls-week-fold[data-fold="league"]')).toBeVisible();
    return state;
}

test.describe('Scoreboard: the Final Window', () => {
    test('Monday night with two games left: the stakes, expected wins, best case, sweep and what each matchup needs', async ({ page }) => {
        const state = await setup(page, MONDAY);
        const sec = section(page);
        await expect(sec).toBeVisible();
        // Above League Scoreboard.
        const order = await card(page).locator('.mls-week-fold.mls-week-section').evaluateAll(els => els.map(e => e.dataset.fold));
        expect(order).toEqual(['final', 'league', 'player']);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('Final Window');
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('MIN @ CHI, KC @ DEN');
        // Once the runs are in, the title counts what's at stake, and the settled one apart.
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('2 matchups ride on them · 1 settled');
        await expect(sec.locator('svg.mls-fw-icon')).toHaveAttribute('aria-hidden', 'true');

        // The tiles, once the simulation is in.
        const tiles = sec.locator('.mls-fw-tile');
        await expect(tiles).toHaveCount(2);
        await expect(sec.locator('.mls-fw-tiles')).not.toHaveAttribute('aria-busy', 'true');
        await expect(tiles.nth(0)).toContainText('At stake');
        await expect(tiles.nth(0)).toContainText('of 3 live matchups');
        await expect(tiles.nth(1)).toContainText(/Expected\s*\d\.\d W\s*on average/);
        // The bars (round 7): one per number of wins of the 2 at stake, labeled, with the whole spread in the label.
        const bars = sec.locator('.mls-fw-bars');
        await expect(bars.locator('.mls-fw-bars-head')).toHaveText('How many of the 2 you win (share of 10,000 runs)');
        await expect(bars.locator('.mls-fw-bars-col')).toHaveCount(3);
        await expect(bars.locator('.mls-fw-bars-w')).toHaveText(['0', '1', '2']);
        await expect(bars.locator('.mls-fw-bars-cols')).toHaveAttribute('aria-label', /^How many of the 2 at stake you win: 0 W \d+%, 1 W (\d+|<1)%, 2 W (\d+|<1)%$/);
        const pcts = (await bars.locator('.mls-fw-bars-pct').allTextContents()).map(t => t.startsWith('<') ? 0.5 : parseFloat(t));
        expect(Math.abs(pcts.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(2);
        // The tallest bar is the most common outcome.
        const heights = await bars.locator('.mls-fw-bars-bar').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
        expect(heights.indexOf(Math.max(...heights))).toBe(pcts.indexOf(Math.max(...pcts)));

        // What each matchup needs: a card per open matchup, each with its line (position badges in it), a bar, and the
        // one-on-one table; the settled one on a line under them.
        const items = sec.locator('.mls-fw-match');
        await expect(items).toHaveCount(2);
        const third = items.filter({ hasText: 'Third Fixture League' });
        await expect(third.locator('.mls-fw-need')).toHaveText('Down 2.0. Your WR Justin Jefferson needs 2.0+ more than their K Harrison Butker.');
        await expect(third.locator('.mls-fw-need .pos-badge')).toHaveText(['WR', 'K']);
        await expect(third.locator('.mls-fw-bar .mls-week-chance')).toContainText('to win');
        await expect(third.locator('.mls-fw-bar .mls-week-chance')).toHaveClass(/is-dog/);
        await expectTones(sec, 2);
        await expect(third.locator('.mls-fw-table tbody tr')).toHaveCount(3);
        await expect(third.locator('.mls-fw-table tbody tr').first()).toContainText('Quiet: 0.0');
        await expect(third.locator('.mls-fw-table thead')).toHaveText('If Jefferson scoresButker must score');
        await expect(third.locator('.mls-fw-table tbody tr').first()).toContainText('you lose either way');
        const first = items.filter({ hasText: 'Fixture League' }).filter({ hasNotText: 'Second' }).filter({ hasNotText: 'Third' });
        await expect(first.locator('.mls-fw-need')).toHaveText('Down 6.0. Your WR Justin Jefferson needs 6.0+ more than their K Harrison Butker.');
        // "What if…": open on the first card (Third Fixture League, the closest), folded on the rest; a tap opens it
        // in place, the chevron turning with aria-expanded, and it stays open across a redraw.
        await expect(third.locator('.mls-fw-whatif-toggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(first.locator('.mls-fw-whatif-toggle')).toHaveAttribute('aria-expanded', 'false');
        // Side by side on desktop, each card keeps its own height (round 9): the folded one isn't stretched to match.
        if ((page.viewportSize()?.width || 0) >= 900) {
            const h = async (loc) => (await loc.boundingBox()).height;
            expect(await h(first)).toBeLessThan(await h(third) - 40);
        }
        await expect(first.locator('.mls-fw-table')).toBeHidden();
        await first.locator('.mls-fw-whatif-toggle').click();
        await expect(first.locator('.mls-fw-table')).toBeVisible();
        await expect(first.locator('.mls-fw-whatif-toggle')).toBeFocused();
        await expect(first.locator('.mls-fw-whatif-toggle .chevron')).toHaveAttribute('aria-hidden', 'true');
        await third.locator('.mls-fw-whatif-toggle').click();
        await expect(third.locator('.mls-fw-table')).toBeHidden();
        await card(page).locator('.mls-week-refresh').click();
        await expect(card(page).locator('.mls-week-refresh')).not.toHaveAttribute('aria-busy', 'true');
        await expect(sec.locator('.mls-fw-match').filter({ hasText: 'Fixture League' }).filter({ hasNotText: 'Third' }).locator('.mls-fw-table')).toBeVisible();
        await expect(sec.locator('.mls-fw-match').filter({ hasText: 'Third Fixture League' }).locator('.mls-fw-table')).toBeHidden();
        await third.locator('.mls-fw-whatif-toggle').click();
        // Up 42.2 against a kicker: settled, not at stake, on one line under the cards.
        await expect(items.filter({ hasText: 'Second Fixture League' })).toHaveCount(0);
        await expect(sec.locator('.mls-fw-note').first()).toHaveText('Settled: Second Fixture League (W, +42.2).');
        await expect(tiles.nth(0)).toContainText('2 W');
        // How it's worked out is in the (i) beside the heading, not in plain view.
        await expect(sec.locator('.mls-fw-sub-row .tooltip-text')).toContainText('draws every live player once');
        await expect(sec.locator('.mls-fw-note')).toHaveCount(1);
        // Still in play points here instead of repeating the same two matchups.
        const league = card(page).locator('.mls-week-fold[data-fold="league"]');
        const player = card(page).locator('.mls-week-fold[data-fold="player"]');
        // Focus (round 8): while the window is open, League Scoreboard and Player Scoreboard start folded, to their
        // one-line summaries; nothing is written to your remembered folds.
        await expect(league.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(league.locator('> .mls-week-fold-toggle')).toContainText('League Scoreboard3 leagues · 2 still in play');
        await expect(player.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(player.locator('> .mls-week-fold-toggle')).toContainText('Root for 1');
        // A tap opens it for this window only: it stays open across a Refresh, and the remembered folds are untouched.
        await league.locator('> .mls-week-fold-toggle').click();
        await expect(league.locator('> .mls-week-fold-body')).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('mls_scoreboard_folds'))).toBeNull();
        await card(page).locator('.mls-week-refresh').click();
        await expect(card(page).locator('.mls-week-refresh')).not.toHaveAttribute('aria-busy', 'true');
        await expect(league.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(player.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(league.locator('.mls-fw-pointer')).toHaveText('Still in play: 2, in the Final Window above');
        await expect(league.locator('.mls-week-swings')).toHaveCount(0);

        // How fresh the scores are, with a Refresh beside it.
        await expect(sec.locator('.mls-fw-asof')).toHaveText(/^as of \d{1,2}:\d{2} (AM|PM)$/);
        await expect(sec.locator('.mls-fw-asof button')).toHaveCount(0);
        // Before kickoff, the window's time; the table speaks of whole games.
        await expect(sec.locator('.mls-week-fold-toggle')).not.toContainText('live');
        await expect(third.locator('.mls-fw-table thead')).toHaveText('If Jefferson scoresButker must score');
        // The Dashboard's week line points to it.
        await showTab(page, 'setup');
        await expect(page.locator('#weekSummaryLine')).toContainText('Final Window: 2 at stake');
        await showTab(page, 'scoreboard');
        // It folds, remembered.
        await sec.locator('.mls-week-fold-toggle').click();
        await expect(sec.locator('.mls-week-fold-body')).toBeHidden();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mls_scoreboard_folds')))).toEqual({ final: false });
        // With the window folded, both sections are as remembered (open, the default).
        await expect(league.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(player.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'true');
        // Folded, Still in play lists its matchups again.
        await expect(league.locator('.mls-fw-pointer')).toHaveCount(0);
        await expect(league.locator('.mls-week-swing')).toHaveCount(2);
        // Losing long shots read red there and on the tiles, as in the Final Window (26% and 3%).
        await expectTones(league.locator('.mls-week-swings'), 2);
        await expectTones(league.locator('.mls-week-tiles'), 2);
        // One matchup, one number (round 7): the tiles and Still in play show the Final Window's own chance.
        const fwChance = async (name) => (await sec.locator('.mls-fw-match').filter({ hasText: name }).locator('.mls-fw-bar .mls-week-chance').textContent()).trim();
        const fwThird = await fwChance('Third Fixture League');
        await expect(league.locator('.mls-week-tile').filter({ hasText: 'Third Fixture League' }).locator('.mls-week-tile-chance')).toHaveText(fwThird);
        await expect(league.locator('.mls-week-swing').filter({ hasText: 'Third Fixture League' }).locator('.mls-week-chance')).toHaveText(fwThird);
        await sec.locator('.mls-week-fold-toggle').click();
        await expect(sec.locator('.mls-week-fold-body')).toBeVisible();
        await expect(league.locator('.mls-fw-pointer')).toHaveCount(1);

        // Open again, focus is back: Player Scoreboard folded (League stays open: it was opened in this window).
        await expect(player.locator('> .mls-week-fold-toggle')).toHaveAttribute('aria-expanded', 'false');
        // The credit, one line for both under the card (round 8), and in the Guide (owner's choice).
        const credit = page.locator('.mls-scoreboard-credit');
        await expect(credit).toHaveCount(1);
        await expect(credit).toHaveText('Inspired by Sleepy, sleepy-football.vercel.app (the root-for board), and FF Historian, ffhistorian.com (the Final Window)');
        await expect(credit.locator('a').nth(1)).toHaveAttribute('href', 'https://ffhistorian.com/');
        // Nothing past the card's edges.
        const over = await card(page).evaluate(el => { const r = el.getBoundingClientRect(); return [...el.querySelectorAll('.mls-fw *:not(.tooltip-text)')].filter(c => { const b = c.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); }).map(c => c.className); });
        expect(over).toEqual([]);
        // The (i) opens on a tap and its box stays on the screen (tooltips-onscreen.spec.mjs's rule).
        const icon = sec.locator('.mls-fw-sub-row .tooltip-icon');
        await expect(icon).toHaveText('i');
        await icon.click();
        const box = await sec.locator('.mls-fw-sub-row .tooltip-text').boundingBox();
        const vw = await page.evaluate(() => document.documentElement.clientWidth);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vw);
        await expectClean(page, state);
    });

    test('during the game: "live" in the title, and the table speaks of what he adds from here', async ({ page }) => {
        const state = await setup(page, LIVE);
        const sec = section(page);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText(/MIN @ CHI live, KC @ DEN \S+ \d{1,2}:\d{2} (AM|PM) ·/);
        const third = sec.locator('.mls-fw-match').filter({ hasText: 'Third Fixture League' });
        // Jefferson is half through his game, so Butker has more to come and leads the table; Jefferson "must add".
        await openWhatIf(third);
        await expect(third.locator('.mls-fw-table thead')).toHaveText('If Butker scoresJefferson must add');
        await expect(third.locator('.mls-fw-table tbody tr').nth(1)).toContainText('Projection:');
        await expectClean(page, state);
    });

    test('both games under way: "live" for each, and "Projected from here" for the player mid-game', async ({ page }) => {
        const state = await setup(page, BOTH_LIVE);
        const sec = section(page);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('MIN @ CHI live, KC @ DEN live ·');
        // Every card is Jefferson against Butker; which are still open depends on the runs, so the first one.
        const open = sec.locator('.mls-fw-match').first();
        await openWhatIf(open);
        await expect(open.locator('.mls-fw-table thead')).toHaveText('If Jefferson addsButker must add');
        await expect(open.locator('.mls-fw-table tbody tr').nth(1)).toContainText('Projected from here:');
        await expectClean(page, state);
    });

    test('six at stake (and a seventh settled): five cards, then Show all 6 and Show less', async ({ page }) => {
        const state = await setup(page, MONDAY, { extra: true });
        const sec = section(page);
        await expect(sec.locator('.mls-fw-tile').nth(0)).toContainText('6 W');
        await expect(sec.locator('.mls-fw-match')).toHaveCount(5);
        const more = sec.locator('[data-action="showAllFinal"]');
        await expect(more).toHaveText('Show all 6');
        await more.click();
        await expect(sec.locator('.mls-fw-match')).toHaveCount(6);
        await expect(sec.locator('.mls-fw-bars-col')).toHaveCount(7);
        // Favored and not, side by side: each percent green or red by its own number.
        const tones = await chanceTones(sec);
        expect(tones.some(([, fav]) => fav) && tones.some(([, fav]) => !fav)).toBe(true);
        await expectTones(sec, 6);
        await expect(more).toHaveText('Show less');
        await expect(more).toBeFocused();
        await more.click();
        await expect(sec.locator('.mls-fw-match')).toHaveCount(5);
        await expectClean(page, state);
    });

    test('a card opens its league\'s Lineup tab, as the league tiles do', async ({ page }) => {
        const state = await setup(page, MONDAY);
        const third = section(page).locator('.mls-fw-match').filter({ hasText: 'Third Fixture League' });
        const chance = (await third.locator('.mls-fw-bar .mls-week-chance').textContent()).trim();
        await expect(third.locator('.mls-fw-match-open')).toHaveAttribute('aria-label', 'Third Fixture League: open its lineup');
        await third.locator('.mls-fw-match-open').click();
        await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE3_ID);
        // The Lineup tab's matchup strip colors its chance the same way.
        await expectTones(page.locator('#lineupMatchupStrip'), 1);
        // And the same number as the Final Window (round 7).
        await expect(page.locator('#lineupMatchupStrip .mls-week-chance')).toHaveText(chance);
        await expectClean(page, state);
    });

    test('one matchup at stake: one line names it, no tiles', async ({ page }) => {
        // Fixture League down 36: settled too, so only Third Fixture League is at stake.
        const state = await setup(page, MONDAY, { lead: { first: 30 } });
        const sec = section(page);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('1 matchup rides on them · 2 settled');
        await expect(sec.locator('.mls-fw-oneline')).toContainText(/^One matchup at stake: Third Fixture League, \d+% to win$/);
        await expect(sec.locator('.mls-fw-tiles')).toHaveCount(0);
        await expect(sec.locator('.mls-fw-match')).toHaveCount(1);
        await expectClean(page, state);
    });

    test('nothing at stake: one line says so, and the settled ones', async ({ page }) => {
        const state = await setup(page, MONDAY, { lead: { first: 30, third: 30 } });
        const sec = section(page);
        await expect(sec.locator('.mls-week-fold-toggle')).toContainText('nothing rides on them · 3 settled');
        await expect(sec.locator('.mls-fw-oneline')).toHaveText('Nothing rides on tonight: all 3 live matchups are settled (1 W, 2 L).');
        await expect(sec.locator('.mls-fw-tiles')).toHaveCount(0);
        await expect(sec.locator('.mls-fw-match')).toHaveCount(0);
        await expect(sec.locator('h4')).toHaveCount(0);
        await expect(sec.locator('.mls-fw-note')).toContainText('Settled: ');
        await expect(sec.locator('.mls-fw-asof')).toBeVisible();
        await expectClean(page, state);
    });

    test('the simulation runs on the page when the worker can\'t start', async ({ page }) => {
        const state = await setup(page, MONDAY, { failWorker: true });
        await expect(section(page).locator('.mls-fw-tiles')).not.toHaveAttribute('aria-busy', 'true');
        await expect(section(page).locator('.mls-fw-tile').nth(0)).toContainText('2 W');
        await expectClean(page, state);
    });

    test('Sunday afternoon, with the early games under way: no Final Window', async ({ page }) => {
        const state = await setup(page, SUNDAY);
        await expect(card(page).locator('.mls-week-fold[data-fold="player"]')).toBeVisible();
        await expect(section(page)).toHaveCount(0);
        await expectClean(page, state);
    });
});
