// View transitions (improvements S16, js/shared/ui/viewTransition.js). Tab switches in both apps, your own league
// switches and the League Command Center's folds and moves animate with document.startViewTransition; the DOM change
// lands a frame after the tap. What's checked here: a switch really starts a transition and ends on the right tab,
// several taps in a row end on the last one with each tap's work done once (one history entry and one announcement
// each), the tab bar's marker ends under the active tab, the cards' names come off afterwards, and with Reduce
// Motion or without the API nothing animates and the switch is immediate.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, seedMls, loadMlsRankings, transitionsDone, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));

// Counts the transitions the page starts and the updates they run, by kind (data-vt when it starts).
async function countTransitions(page) {
    await page.addInitScript(() => {
        window.__vt = { starts: 0, updates: 0, kinds: [] };
        if (typeof document.startViewTransition !== 'function') return;
        const start = document.startViewTransition.bind(document);
        document.startViewTransition = (update) => {
            window.__vt.starts++;
            window.__vt.kinds.push(document.documentElement.dataset.vt);
            return start(() => { window.__vt.updates++; return update(); });
        };
    });
}
const vt = (page) => page.evaluate(() => window.__vt);

const activeTabs = (page) => page.evaluate(() => [...document.querySelectorAll('.tab-content.active')].map(t => t.id));
const activeNav = (page) => page.evaluate(() => [...document.querySelectorAll('.nav-bar .nav-btn.active')].map(b => b.dataset.target));

// Taps tab-bar buttons in one go, inside a single task, so every tap after the first lands mid-transition.
const tapTabs = (page, tabs) => page.evaluate((ids) => {
    const before = history.length;
    ids.forEach(t => document.querySelector(`.nav-bar .nav-btn[data-target="${t}"]`).click());
    return before;
}, tabs);

// The marker's middle ends over the active tab's middle (it slides there, so this waits for it).
async function expectMarkerUnder(page, tab) {
    await expect.poll(() => page.evaluate((t) => {
        const marker = document.querySelector('.nav-bar .nav-marker');
        const m = marker.getBoundingClientRect();
        const b = document.querySelector(`.nav-bar .nav-btn[data-target="${t}"]`).getBoundingClientRect();
        return !marker.hidden && m.width > 0 && Math.abs((m.left + m.width / 2) - (b.left + b.width / 2)) < 2;
    }, tab)).toBe(true);
}

test.describe('Lineup Strategist', () => {
    test('a tab switch animates; rapid taps end on the last tab, each tap\'s work done once', async ({ page }) => {
        await countTransitions(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await transitionsDone(page);
        await page.evaluate(() => { window.__vt.starts = 0; window.__vt.updates = 0; window.__vt.kinds = []; });

        // One tap: the switch waits for the transition's update, then lands.
        await page.locator('.nav-bar .nav-btn[data-target="roster"]').click();
        await transitionsDone(page);
        expect(await activeTabs(page)).toEqual(['rosterTab']);
        expect(await vt(page)).toEqual({ starts: 1, updates: 1, kinds: ['tab'] });
        await expectMarkerUnder(page, 'roster');

        // Three taps before the first has drawn: each starts a transition (the earlier ones are skipped, their
        // updates still run, in order), and the page ends on the last tab tapped.
        const historyBefore = await tapTabs(page, ['lineup', 'scout', 'lineup']);
        await transitionsDone(page);
        expect(await activeTabs(page)).toEqual(['lineupTab']);
        expect(await activeNav(page)).toEqual(['lineup']);
        expect(await vt(page)).toMatchObject({ starts: 4, updates: 4 });
        // Each tap's work ran once: one history entry each, and the announcement names the last.
        expect(await page.evaluate(() => history.length)).toBe(historyBefore + 3);
        await expect(page).toHaveURL(/#lineup$/);
        await expect(page.locator('#tabChangeAnnouncer')).toHaveText('Lineup tab');
        await expect(page.locator('#optimalLineupContainer > *').first()).toBeAttached();
        await expectMarkerUnder(page, 'lineup');

        // Back runs through the same switch, animated.
        await page.goBack();
        await transitionsDone(page);
        expect(await activeTabs(page)).toEqual(['scoutTab']);
        expect((await vt(page)).starts).toBe(5);
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-vt'))).toBe(false);
        await expectClean(page, state);
    });

    test('your own league switch fades; Sync All and the like switch without one', async ({ page }) => {
        await countTransitions(page);
        const state = await openApp(page, '/lineup/');
        await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}$`), route =>
            route.fulfill({ json: { ...fixture('league.json'), league_id: SECOND_LEAGUE_ID, name: 'Second League' } }));
        await seedMls(page);
        await page.fill('#sleeperLeagueId', SECOND_LEAGUE_ID);
        await page.click('#mainSyncBtn');
        await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
        await transitionsDone(page);

        // A switch from code (as Sync All and Optimize All make): immediate, no transition.
        const before = (await vt(page)).starts;
        const active = await page.evaluate(async (id) => {
            const m = await import('/js/mls/main.js');
            m.switchActiveLeague(id);
            return document.getElementById('headerLeagueSelect').value;
        }, FIXTURE_LEAGUE_ID);
        expect(active).toBe(FIXTURE_LEAGUE_ID);
        expect((await vt(page)).starts).toBe(before);

        // The header's arrow: a "league" transition, ending on the next league.
        await page.locator('#nextLeagueBtn').click();
        await transitionsDone(page);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(SECOND_LEAGUE_ID);
        // The header's name is a label over the drop-down (so a long name can end in "…"); it follows the switch.
        await expect(page.locator('#headerLeagueLabel')).toHaveText('Second League');
        const after = await vt(page);
        expect(after.starts).toBe(before + 1);
        expect(after.kinds.at(-1)).toBe('league');

        // The drop-down: the same.
        await page.selectOption('#headerLeagueSelect', FIXTURE_LEAGUE_ID);
        await transitionsDone(page);
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        await expect(page.locator('#headerLeagueLabel')).toHaveText('Fixture League');
        expect((await vt(page)).kinds.at(-1)).toBe('league');
        await expectClean(page, state);
    });

    test('the header shows the whole league name when it fits, and ends a long one in "…"', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        const label = page.locator('#headerLeagueLabel');
        await expect(label).toHaveText('Fixture League');
        const fits = (l) => l.evaluate(e => e.scrollWidth <= e.clientWidth);
        expect(await fits(label)).toBe(true);
        expect(await label.evaluate(e => getComputedStyle(e).textOverflow)).toBe('ellipsis');
        // A long name: the label is cut with an ellipsis, inside the drop-down, and nothing runs past the screen.
        await page.evaluate(() => {
            const ls = JSON.parse(localStorage.getItem('mls_leagues'));
            ls[0].name = 'The Long-Named Dynasty League of Champions and Friends';
            localStorage.setItem('mls_leagues', JSON.stringify(ls));
        });
        await page.reload();
        await expect(label).toHaveText('The Long-Named Dynasty League of Champions and Friends');
        expect(await fits(label)).toBe(false);
        const box = await page.evaluate(() => {
            const r = (id) => document.getElementById(id).getBoundingClientRect();
            return { label: r('headerLeagueLabel'), select: r('headerLeagueSelect'), next: r('nextLeagueBtn'), page: document.documentElement.scrollWidth, vw: innerWidth };
        });
        expect(box.label.right).toBeLessThanOrEqual(box.select.right);
        expect(box.select.right).toBeLessThanOrEqual(box.next.left);
        expect(box.page).toBeLessThanOrEqual(box.vw);
        await expectClean(page, state);
    });

    test('a league card folds in a "cards" transition, and its name comes off afterwards', async ({ page }) => {
        await countTransitions(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await transitionsDone(page);
        const card = page.locator('#leagueCards > .mls-lc-card').first();
        const folded = await card.evaluate(c => c.classList.contains('is-collapsed'));
        const before = (await vt(page)).starts;

        // During the transition the card carries a name built from its league id.
        const nameDuring = await card.evaluate((c) => {
            c.querySelector('[data-action="toggleLeagueCard"]').click();
            return c.style.getPropertyValue('view-transition-name');
        });
        expect(nameDuring).toBe(`vt-lc-${FIXTURE_LEAGUE_ID}`);
        await transitionsDone(page);
        await expect(card).toHaveClass(folded ? /^(?!.*\bis-collapsed\b)/ : /\bis-collapsed\b/);
        const after = await vt(page);
        expect(after.starts).toBe(before + 1);
        expect(after.kinds.at(-1)).toBe('cards');
        expect(await card.evaluate(c => c.style.getPropertyValue('view-transition-name'))).toBe('');
        expect(await page.locator('#dashboardCommandCenter').evaluate(c => c.style.getPropertyValue('view-transition-name'))).toBe('');
        await expectClean(page, state);
    });

    // The Week Recap card (improvements S21) folds the way a league card does (owner, round 4): named like a card for
    // the transition, as is the toolbar under it, so its box grows or shrinks, its chevron turns, and what's below moves.
    test('the Week Recap folds in a "cards" transition like a league card, named until it ends', async ({ page }) => {
        await countTransitions(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await transitionsDone(page);
        const recap = page.locator('#thisWeekCard');
        await expect(recap.locator('.mls-week-head')).toBeVisible();
        const wasFolded = await recap.evaluate(c => c.classList.contains('is-collapsed')); // folded before kickoff
        const before = (await vt(page)).starts;
        const during = await recap.evaluate((c) => {
            c.querySelector('[data-action="toggleThisWeek"]').click();
            return [c.style.getPropertyValue('view-transition-name'), c.style.getPropertyValue('view-transition-class'),
                document.getElementById('leagueCardsToolbar').style.getPropertyValue('view-transition-name')];
        });
        expect(during).toEqual(['vt-lc-week', 'vt-card', 'vt-lc-toolbar']);
        await transitionsDone(page);
        await expect(recap).toHaveClass(wasFolded ? /^(?!.*\bis-collapsed\b)/ : /\bis-collapsed\b/);
        const after = await vt(page);
        expect(after.starts).toBe(before + 1);
        expect(after.kinds.at(-1)).toBe('cards');
        expect(await recap.evaluate(c => c.style.getPropertyValue('view-transition-name'))).toBe('');
        await expectClean(page, state);
    });

    test('with Reduce Motion nothing animates and a switch is immediate', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await countTransitions(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        // showTab's change is already there when it returns.
        const active = await page.evaluate(async () => {
            const m = await import('/js/mls/main.js');
            m.showTab('lineup');
            return document.querySelector('.tab-content.active').id;
        });
        expect(active).toBe('lineupTab');
        // A card's fold: immediate too.
        const folded = await page.evaluate(() => {
            const c = document.querySelector('#leagueCards > .mls-lc-card');
            const was = c.classList.contains('is-collapsed');
            c.querySelector('[data-action="toggleLeagueCard"]').click();
            return [was, c.classList.contains('is-collapsed')];
        });
        expect(folded[1]).toBe(!folded[0]);
        await tapTabs(page, ['roster', 'scout']);
        expect(await activeTabs(page)).toEqual(['scoutTab']);
        expect((await vt(page)).starts).toBe(0);
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-vt-busy'))).toBe(false);
        await expectClean(page, state);
    });

    test('a browser without View Transitions switches at once', async ({ page }) => {
        await page.addInitScript(() => { delete Document.prototype.startViewTransition; });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await tapTabs(page, ['roster', 'lineup']);
        expect(await activeTabs(page)).toEqual(['lineupTab']);
        await expectMarkerUnder(page, 'lineup');
        await expectClean(page, state);
    });
});

// Found with the owner's data (round 5): on a phone the Lineup tab was 8px wider than the screen (the Optimize / Copy /
// PNG row), so a mobile browser widened the page while it showed, and Chrome aborted every transition into it ("invalid
// state": the viewport changed size between the two pictures). With mobile emulation, each tab fits the screen and
// switching to it really animates.
test.describe('Lineup Strategist on a phone (mobile emulation)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test('every tab fits the screen, and switching to it animates instead of being skipped', async ({ page }, info) => {
        test.skip(info.project.name !== 'phone', 'one width is enough: the viewport is set here');
        await page.addInitScript(() => {
            window.__vtSkipped = [];
            const start = document.startViewTransition.bind(document);
            document.startViewTransition = (update) => {
                const t = start(update);
                const kind = document.documentElement.dataset.vt;
                t.ready.catch(e => window.__vtSkipped.push(`${kind}: ${e.message}`));
                return t;
            };
        });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        for (const tab of ['roster', 'lineup', 'scout', 'lineup', 'setup']) {
            await page.locator(`.nav-bar .nav-btn[data-target="${tab}"]`).tap();
            await transitionsDone(page);
            await expect(page.locator(`#${tab}Tab`)).toHaveClass(/\bactive\b/);
            const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth }));
            expect(widths.page, `${tab} tab is wider than the screen`).toBeLessThanOrEqual(widths.screen);
        }
        expect(await page.evaluate(() => window.__vtSkipped)).toEqual([]);
        await expectClean(page, state);
    });
});

test.describe('Draft Strategist', () => {
    test('tab switches animate and rapid taps end on the last tab', async ({ page }) => {
        await countTransitions(page);
        const state = await openApp(page, '/');
        // Setup isn't in Draft Strategist's tab bar, so no marker there.
        await expect(page.locator('.nav-bar .nav-marker')).toBeHidden();
        const historyBefore = await tapTabs(page, ['tracker', 'team', 'board']);
        await transitionsDone(page);
        expect(await activeTabs(page)).toEqual(['boardTab']);
        expect(await activeNav(page)).toEqual(['board']);
        expect(await vt(page)).toMatchObject({ starts: 3, updates: 3 });
        expect(await page.evaluate(() => history.length)).toBe(historyBefore + 3);
        await expectMarkerUnder(page, 'board');
        await expectClean(page, state);
    });

    test('with Reduce Motion nothing animates', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await countTransitions(page);
        const state = await openApp(page, '/');
        await tapTabs(page, ['team', 'tracker']);
        expect(await activeTabs(page)).toEqual(['trackerTab']);
        expect((await vt(page)).starts).toBe(0);
        await expectClean(page, state);
    });
});
