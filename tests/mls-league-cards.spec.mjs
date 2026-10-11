// The League Command Center's league cards (improvements S12, js/mls/render/leagueCards.js). One card per league, in
// your league order, at every width (owner's choice: one Command Center, in place of the table, the "lineups need
// you" box and the Best Available card). Each card has its header (fold chevron, the name that switches to the
// league, format and sync age, ▲ ▼ ✕), its status chips (Weekly rankings, the lineup against Sleeper; the tooltip
// opens on a tap), "N to do" and "N upgrades", its to-dos with their buttons, its Sleeper changes (folded) and its
// best available. Every card folds to its header, remembered per league (mls_league_cards_collapsed), and one with
// nothing to do starts folded (round 4); ▲ ▼ ✕ show in Reorder mode (round 4). Fold all /
// Unfold all does every card.
//
// Two leagues from the one Sleeper fixture (the stub answers any league id), as in mls-lineup-needs.spec.mjs:
// "Fixture League", where Ja'Marr Chase (healthy, starting) is in your IR slot and the lineup on Sleeper differs
// from this one, and a second league with a long name, whose only starting QB, Lamar Jackson, is Doubtful (Jalen
// Hurts is on the bench). Both rosters get Bijan Robinson, so neither has an empty RB slot.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const SECOND_LEAGUE_ID = '1000000000000000002';
const SECOND = 'The Long-Named Dynasty League of Champions';
const CHASE = '4866', ALLEN = '4984', LAMAR = '4881', HURTS = '6904', BIJAN = '9509', HENRY = '3198';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const move = (from, to, id) => { from.players = from.players.filter(p => p !== id); to.players.push(id); };

const commandCenter = (page) => page.locator('#dashboardCommandCenter');
const cards = (page) => page.locator('#leagueCards > .mls-lc-card');
const card = (page, league) => cards(page).filter({ has: page.locator('.mls-lc-name', { hasText: league }) });
const cardNames = (page) => cards(page).locator('.mls-lc-name');
const chips = (page, league) => card(page, league).locator('.mls-lc-chip');
const chipTones = (page, league) => chips(page, league).evaluateAll(cs => cs.map(c => `${c.querySelector('.mls-lc-chip-label').textContent}:${[...c.classList].find(k => k.startsWith('is-')).slice(3)}`));
const todoItems = (page, league) => card(page, league).locator('.mls-lc-todo > .mls-needs-line .mls-needs-item');
const body = (page, league) => card(page, league).locator('.mls-lc-body');
const foldBtn = (page, league) => card(page, league).locator('[data-action="toggleLeagueCard"]');
const foldAll = (page) => page.locator('#foldAllLeagueCards');

async function routeLeagues(page) {
    await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
        const players = fixture('players-nfl.json');
        players[LAMAR].injury_status = 'Doubtful';
        return route.fulfill({ json: players });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        move(rosters[1], rosters[0], BIJAN);
        move(rosters[0], rosters[1], '5859');
        rosters[0].reserve = [CHASE];
        // On Sleeper: Garrett Wilson where this lineup has someone else.
        rosters[0].starters = [ALLEN, HENRY, BIJAN, '6794', '6786', '4217', '7523', '17', 'BAL'];
        return route.fulfill({ json: rosters });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}/rosters$`), route => {
        const rosters = fixture('league-rosters.json');
        move(rosters[1], rosters[0], BIJAN);
        move(rosters[0], rosters[1], ALLEN);
        move(rosters[1], rosters[0], LAMAR);
        move(rosters[1], rosters[0], HURTS);
        return route.fulfill({ json: rosters });
    });
    await page.route(new RegExp(`sleeper\\.app/v1/league/${SECOND_LEAGUE_ID}$`), route =>
        route.fulfill({ json: { ...fixture('league.json'), league_id: SECOND_LEAGUE_ID, name: SECOND } }));
}

async function seedTwoLeagues(page) {
    await seedMls(page);
    await loadMlsRankings(page);
    await page.fill('#sleeperLeagueId', SECOND_LEAGUE_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#headerLeagueSelect option')).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    await loadMlsRankings(page);
    await showTab(page, 'setup');
}

// The rightmost edge of anything in the Command Center (tooltips that aren't open are display: none).
const rightmost = (page) => commandCenter(page).evaluate(cc => Math.max(...[cc, ...cc.querySelectorAll('*')]
    .filter(e => e.getClientRects().length > 0).map(e => e.getBoundingClientRect().right)));

test.describe('League Command Center: one card per league', () => {
    for (const width of [375, 390]) {
        test(`at ${width}px: each league once, as a card with its status, to-dos and buttons, nothing past the edge`, async ({ page }) => {
            await page.setViewportSize({ width, height: 812 });
            const state = await openApp(page, '/lineup/');
            await routeLeagues(page);
            await seedTwoLeagues(page);

            // One card per league, in league order; the old table, box lines and Best Available card are gone, so
            // each league's name shows once in the Command Center (the Requirements card below names the active one).
            await expect(cardNames(page)).toHaveText(['Fixture League', SECOND]);
            await expect(page.locator('#dashboardMatrixBody, #dashboardBestAvailable')).toHaveCount(0);
            for (const league of ['Fixture League', SECOND]) {
                const shown = await commandCenter(page).evaluate((tab, name) => {
                    const walker = document.createTreeWalker(tab, NodeFilter.SHOW_TEXT);
                    let n = 0;
                    while (walker.nextNode()) {
                        const el = walker.currentNode.parentElement;
                        if (walker.currentNode.textContent.includes(name) && el.getClientRects().length > 0) n++;
                    }
                    return n;
                }, league);
                expect(shown, `${league} in the Command Center`).toBe(1);
            }

            // The strip under the buttons counts them; the to-dos are in the cards.
            await expect(page.locator('#lineupNeedsBox .mls-needs-title')).toHaveText('2 lineups need you before kickoff · 1 to set on Sleeper');

            // Status: rankings fresh in both; the Fixture League's lineup differs from Sleeper (red), the second
            // league has no Sleeper lineup to compare yet (amber).
            expect(await chipTones(page, 'Fixture League')).toEqual(['Rankings:good', 'Lineup:danger']);
            expect(await chipTones(page, SECOND)).toEqual(['Rankings:good', 'Lineup:warn']);
            await expect(card(page, 'Fixture League').locator('.mls-lc-meta')).toHaveText('Redraft 1QB PPR');
            // The Fixture League: its activation ("1 to do", amber) and its Sleeper changes ("1 to set", neutral; round 5).
            await expect(card(page, 'Fixture League').locator('.mls-lc-count-todo')).toHaveText('1 to do');
            await expect(card(page, 'Fixture League').locator('.mls-lc-count-sleeper')).toHaveText('1 to set');
            await expect(card(page, SECOND).locator('.mls-lc-count-sleeper')).toHaveCount(0);
            // The strip's next step: set the lineup on Sleeper, then sync.
            await expect(page.locator('#lineupNeedsBox .mls-needs-check')).toHaveText('Set the lineup on Sleeper, then Sync All again to clear it.');
            await expect(card(page, SECOND).locator('.mls-lc-count-todo')).toHaveText('1 to do');
            // The active league (the second, synced last) has the green edge.
            await expect(card(page, SECOND)).toHaveClass(/\bis-active\b/);
            await expect(card(page, SECOND).locator('.mls-lc-name-btn')).toHaveAttribute('aria-current', 'true');

            // To-dos and their buttons; the Sleeper changes are one more item (round 4: not a fold), under one Open lineup.
            await expect(todoItems(page, 'Fixture League')).toHaveText(["Activate Ja'Marr Chase from IR on Sleeper", /^On Sleeper: Start .+ · Bench .+$/]);
            await expect(card(page, 'Fixture League').locator('.mls-needs-open')).toHaveCount(1);
            await expect(todoItems(page, SECOND)).toHaveText(['Lamar Jackson is Doubtful: start Jalen Hurts instead?']);
            await expect(card(page, SECOND).locator('.mls-needs-item.is-sleeper')).toHaveCount(0);
            // Best available in each (both synced, both ranked).
            await expect(card(page, 'Fixture League').locator('.mls-ba-fold')).toHaveCount(1);
            await expect(card(page, SECOND).locator('.mls-ba-fold')).toHaveCount(1);
            // In a card open for its to-dos, a best available with no upgrade isn't shown (round 6); with one, it is.
            const baShown = await cards(page).evaluateAll(cs => cs.map(c => {
                const f = c.querySelector('.mls-ba-fold');
                return { todo: !!c.querySelector('.mls-lc-todo'), upgrade: f.classList.contains('has-upgrade'), shown: f.getClientRects().length > 0 };
            }));
            baShown.forEach(b => expect(b.shown).toBe(!b.todo || b.upgrade));

            // Nothing past the edge, names whole, every button inside its card.
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            expect(await rightmost(page)).toBeLessThanOrEqual(width);
            for (const league of ['Fixture League', SECOND]) {
                const c = card(page, league);
                const box = await c.boundingBox();
                const name = c.locator('.mls-lc-name');
                await expect(name).toHaveText(league);
                expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
                for (const b of await c.locator('button:visible').all()) {
                    const r = await b.boundingBox();
                    expect(r.x).toBeGreaterThanOrEqual(box.x - 0.5);
                    expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
                }
            }
            // The Lineup chip's tooltip opens on a tap (phones have no hover) and stays on screen.
            const chip = chips(page, 'Fixture League').nth(1);
            await chip.click();
            const tip = chip.locator('.tooltip-text');
            await expect(tip).toBeVisible();
            await expect(tip).toHaveText('Differs from your Sleeper lineup: the changes are in this card');
            const tipBox = await tip.boundingBox();
            expect(tipBox.x).toBeGreaterThanOrEqual(0);
            expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(width);
            await page.locator('#leagueCards').click({ position: { x: 2, y: 2 } });
            await expect(tip).toBeHidden();

            // Every button works from the card: Open lineup opens that league's Lineup tab.
            await card(page, SECOND).getByRole('button', { name: `Open ${SECOND}'s lineup` }).click();
            await expect(page.locator('#lineupTab')).toHaveClass(/\bactive\b/);
            await expect(page.locator('#headerLeagueSelect')).toHaveValue(SECOND_LEAGUE_ID);
            await expectClean(page, state);
        });
    }

    test('reorder, switch, fold (remembered), Fold all, and delete', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        await expect(cardNames(page)).toHaveText(['Fixture League', SECOND]);
        // ▲ ▼ ✕ only in Reorder mode (round 4).
        await expect(page.locator('#leagueCards .mls-lc-controls')).toHaveCount(0);
        const reorder = page.locator('#reorderLeagueCards');
        await expect(reorder).toHaveText('Reorder');
        await reorder.click();
        await expect(reorder).toHaveText('Done');
        await expect(reorder).toHaveAttribute('aria-pressed', 'true');
        await expect(card(page, 'Fixture League').getByRole('button', { name: 'Move Fixture League up' })).toBeDisabled();

        // ▲ moves the second league to the top; focus stays on that league (its name, since ▲ is now disabled).
        await card(page, SECOND).getByRole('button', { name: `Move ${SECOND} up` }).click();
        await expect(cardNames(page)).toHaveText([SECOND, 'Fixture League']);
        await expect(page.locator(':focus')).toHaveAttribute('data-focus-key', `row:${SECOND_LEAGUE_ID}`);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues')).map(l => l.name))).toEqual([SECOND, 'Fixture League']);
        // ▼ moves it back.
        await card(page, SECOND).getByRole('button', { name: `Move ${SECOND} down` }).click();
        await expect(cardNames(page)).toHaveText(['Fixture League', SECOND]);
        // Done hides them again.
        await reorder.click();
        await expect(page.locator('#leagueCards .mls-lc-controls')).toHaveCount(0);

        // The name makes that league the active one.
        await card(page, 'Fixture League').locator('.mls-lc-name-btn').click();
        await expect(page.locator('#headerLeagueSelect')).toHaveValue(FIXTURE_LEAGUE_ID);
        await expect(card(page, 'Fixture League')).toHaveClass(/\bis-active\b/);
        await expect(card(page, SECOND)).not.toHaveClass(/\bis-active\b/);

        // Fold a card that has to-dos: its body hides, the header, chips and count stay; remembered after a reload.
        await foldBtn(page, 'Fixture League').click();
        await expect(foldBtn(page, 'Fixture League')).toHaveAttribute('aria-expanded', 'false');
        await expect(foldBtn(page, 'Fixture League')).toHaveAttribute('aria-label', 'Unfold Fixture League');
        await expect(body(page, 'Fixture League')).toBeHidden();
        await expect(chips(page, 'Fixture League')).toHaveCount(2);
        await expect(card(page, 'Fixture League').locator('.mls-lc-count-todo')).toBeVisible();
        await expect(body(page, SECOND)).toBeVisible();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'setup');
        await expect(body(page, 'Fixture League')).toBeHidden();
        await expect(body(page, SECOND)).toBeVisible();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mls_league_cards_collapsed')))).toEqual({ folded: [FIXTURE_LEAGUE_ID], open: [] });
        // A redraw (another tab and back) keeps it folded.
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(body(page, 'Fixture League')).toBeHidden();

        // Fold all, then Unfold all.
        await expect(foldAll(page)).toHaveText('Fold all');
        await foldAll(page).click();
        await expect(body(page, 'Fixture League')).toBeHidden();
        await expect(body(page, SECOND)).toBeHidden();
        await expect(foldAll(page)).toHaveText('Unfold all');
        await foldAll(page).click();
        await expect(body(page, 'Fixture League')).toBeVisible();
        await expect(body(page, SECOND)).toBeVisible();
        await expect(foldAll(page)).toHaveText('Fold all');
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mls_league_cards_collapsed')))).toEqual({ folded: [], open: [FIXTURE_LEAGUE_ID, SECOND_LEAGUE_ID] });

        // A manual league: not optimized yet (grey), no rankings (amber), and no best available, with the reason.
        await page.locator('#newLeagueName').evaluate(el => { el.value = 'Bench League'; });
        await callApp(page, 'createManualLeague');
        await showTab(page, 'setup');
        expect(await chipTones(page, 'Bench League')).toEqual(['Rankings:warn', 'Lineup:pending']);
        await expect(card(page, 'Bench League').locator('.mls-lc-meta')).toHaveCount(0);
        await expect(card(page, 'Bench League').locator('.mls-lc-ba')).toHaveText("No best available here: in a manual league the app only knows your own roster, not who's on the waiver wire.");
        // Nothing to do there, and you haven't opened it: it starts folded (round 4). Opening it is remembered.
        await expect(body(page, 'Bench League')).toBeHidden();
        await foldBtn(page, 'Bench League').click();
        await expect(body(page, 'Bench League')).toBeVisible();
        await showTab(page, 'lineup');
        await showTab(page, 'setup');
        await expect(body(page, 'Bench League')).toBeVisible();

        // ✕ (in Reorder mode) asks first, naming the league; Remove League deletes it and its card.
        await reorder.click();
        await card(page, SECOND).getByRole('button', { name: `Remove ${SECOND}` }).click();
        await expect(page.getByRole('dialog')).toContainText(`This removes "${SECOND}"`);
        await page.getByRole('button', { name: 'Remove League' }).click();
        await expect(cardNames(page)).toHaveText(['Fixture League', 'Bench League']);
        await expect(page.locator('#lineupNeedsBox .mls-needs-title')).toHaveText('1 lineup needs you before kickoff · 1 to set on Sleeper');
        await expectClean(page, state);
    });

    test('"Show" scrolls to each league that needs you, unfolding it; "Show next" steps through them', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        const jump = page.locator('#lineupNeedsBox [data-action="jumpToLeagueNeeds"]');
        await expect(jump).toHaveText('Show next');
        // Both folded first: each jump unfolds its card.
        await foldAll(page).click();
        // Just under the sticky header (html's scroll-padding-top, 5rem).
        const nearTop = (league) => expect.poll(() => card(page, league).evaluate(c => Math.round(c.getBoundingClientRect().top)))
            .toBeLessThan(120);
        await jump.click();
        await nearTop('Fixture League');
        await expect(body(page, 'Fixture League')).toBeVisible();
        await expect(page.locator(':focus')).toHaveAttribute('data-focus-key', `row:${FIXTURE_LEAGUE_ID}`);
        await expect(body(page, SECOND)).toBeHidden();
        await page.evaluate(() => window.scrollTo(0, 0));
        await jump.click();
        await nearTop(SECOND);
        await expect(body(page, SECOND)).toBeVisible();
        // And around again.
        await page.evaluate(() => window.scrollTo(0, 0));
        await jump.click();
        await nearTop('Fixture League');
        await expectClean(page, state);
    });

    test('on a wide screen the to-dos and best available sit side by side', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        const state = await openApp(page, '/lineup/');
        await routeLeagues(page);
        await seedTwoLeagues(page);
        const todo = await card(page, SECOND).locator('.mls-lc-todo').boundingBox();
        const ba = await card(page, SECOND).locator('.mls-lc-ba').boundingBox();
        expect(ba.x).toBeGreaterThan(todo.x + todo.width - 1);
        expect(Math.abs(ba.y - todo.y)).toBeLessThan(2);
        // And they stack on a phone.
        await page.setViewportSize({ width: 375, height: 812 });
        const todoPhone = await card(page, SECOND).locator('.mls-lc-todo').boundingBox();
        const baPhone = await card(page, SECOND).locator('.mls-lc-ba').boundingBox();
        expect(baPhone.y).toBeGreaterThanOrEqual(todoPhone.y + todoPhone.height - 1);
        await expectClean(page, state);
    });
});
