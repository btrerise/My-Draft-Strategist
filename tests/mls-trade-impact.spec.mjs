// The Trade Analyzer's "after the trade" section (improvements S14): Power Rankings before and after in a
// Sleeper league (yours, and the partner's in a fold), your starters before and after in a manual league,
// and the cases that show a note or nothing.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

async function runTrade(page, get, give) {
    // Each side is picked with a search (trade/picker.js); setTradePlayers sets a whole side at once.
    await callApp(page, 'setTradePlayers', 'get', get.split('\n').filter(Boolean));
    await callApp(page, 'setTradePlayers', 'give', give.split('\n').filter(Boolean));
    await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
    await expect(page.locator('#tradeOutput')).toContainText('You Receive');
}

// Makes the active league read as a manual one (only your roster known), in memory only.
async function asManualLeague(page, reqs) {
    await page.evaluate(async (reqs) => {
        const { State } = await import('/js/mls/state.js');
        const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
        league.username = 'Manual';
        league.globalRosterMap = Object.fromEntries(Object.entries(league.globalRosterMap).filter(([, o]) => o === 'You'));
        if (reqs) league.reqs = reqs;
    }, reqs);
}

// Export Trade: html2canvas 1.4.1 from tests/node_modules (helpers.mjs aborts the CDN), wrapped to record what the
// app's clone holds after its own onclone has run (as export-flex.spec.mjs does for the lineup).
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const { PNG } = createRequire(import.meta.url)(here('./node_modules/playwright-core/lib/utilsBundle.js'));
const HTML2CANVAS = readFileSync(here('./node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8') + `
;(() => {
    const original = window.html2canvas;
    window.html2canvas = (element, options = {}) => original(element, {
        ...options,
        onclone: async (doc) => {
            if (options.onclone) await options.onclone(doc);
            const area = doc.getElementById('tradeOutput');
            window.__tradeClone = {
                width: area.getBoundingClientRect().width,
                text: area.innerText,
                assets: [...area.querySelectorAll('.mls-trade-export-asset')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()),
                cards: area.querySelectorAll('.mls-trade-row').length,
                tooltips: area.querySelectorAll('.tooltip-text, .tooltip-icon').length,
                closedDetails: area.querySelectorAll('details:not([open])').length,
                summaries: area.querySelectorAll('summary').length,
            };
        },
    });
})();
`;

// Analyze Trade, scrolled to the middle first: at 375px the fixed bottom nav can cover it.
async function analyze(page) {
    const btn = page.locator('[data-action="runScout"][data-scout-type="trade"]');
    // A search's suggestion list closes when the field loses focus, as a tap elsewhere does on a phone.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await expect(page.locator('.autocomplete-dropdown:visible')).toHaveCount(0);
    await btn.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await btn.click();
}

const section = (page) => page.locator('#tradeOutput [data-trade-impact]');
const cellTexts = (row) => row.locator('td').evaluateAll(tds => tds.map(td => td.firstChild && td.querySelector('.mls-dotted-underline') ? td.querySelector('.mls-dotted-underline').textContent : td.textContent.trim()));

// The card's phone width is 375px; the phone project is 390.
const at375 = (page) => test.info().project.name === 'phone' ? page.setViewportSize({ width: 375, height: 844 }) : null;
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Trade Analyzer: how your team changes', () => {
    test('Sleeper league: Power Rankings before and after, the partner folded, players in the tooltips', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');

        // Your three best WRs for their three best RBs: the rooms swap places.
        await runTrade(page, 'Bijan Robinson\nJahmyr Gibbs\nSaquon Barkley\n2027 1st', "Ja'Marr Chase\nJustin Jefferson\nCeeDee Lamb");
        const s = section(page);
        await expect(s).toHaveCount(1);
        await expect(s).toContainText('Power Rankings after the trade');
        await expect(s).toContainText('by your ROS rankings');
        // Short labeled lines (improvements S24, round 5: every Sleeper league, as with In-Season rankings).
        await expect(s.locator('.mls-trade-impact-lines').first().locator('dt')).toHaveText(['Lineup', 'Rooms']);
        await expect(s.locator('.mls-trade-impact-lines').first().locator('dd').nth(1)).toHaveText('RB 2nd → 1st · WR 1st → 2nd');
        // The headline puts the value verdict (Fair, by your rankings) and the lineup change together; the key explains the ranks.
        await expect(s.locator('.mls-trade-impact-headline')).toHaveText(/^A fair trade by value (that makes your starting lineup stronger|, but your starting lineup gets weaker|that doesn't change your starting lineup)/);
        await expect(s.locator('.mls-trade-impact-key')).toHaveText('1 = strongest of 2. Green better, red worse.');
        await expect(s.locator('.mls-trade-impact-lines').first().locator('dd').first()).toHaveText(/^1st of 2(, (stronger|weaker))?$/); // the headline gives the percent
        // The source line is in "How this is worked out".
        await expect(s.locator('[data-about]').first()).toHaveText('Ranked by your ROS rankings.');
        const you = s.locator('table').first().locator('tr.mls-power-you');
        const cells = await cellTexts(you);
        expect(cells[0]).toBe('You');
        expect(cells[4]).toBe('2→1');  // RB
        expect(cells[5]).toBe('1→2');  // WR
        await expect(you.locator('td').nth(4)).toHaveClass(/mls-trade-rank-up/);
        await expect(you.locator('td').nth(5)).toHaveClass(/mls-trade-rank-down/);
        // The RB room after the trade, newcomers marked; the WR room names who leaves.
        const rbTip = you.locator('td').nth(4).locator('.tooltip-text');
        await expect(rbTip).toContainText('RB room after');
        await expect(rbTip.locator('.mls-trade-in')).toHaveCount(3);
        await expect(rbTip).toContainText('+ Bijan Robinson');
        await expect(you.locator('td').nth(5).locator('.tooltip-text')).toContainText("Leaving: Ja'Marr Chase, Justin Jefferson, CeeDee Lamb");
        // Tapping a number opens its room, as on the Roster tab.
        await you.locator('td').nth(4).locator('.tooltip-container').click();
        await expect(rbTip).toBeVisible();
        await page.locator('.mls-trade-impact-head').click();

        // Their team, folded: the other way round.
        const partner = s.locator('details.mls-trade-impact-partner');
        await expect(partner.locator('summary')).toHaveText('Their team: Rival');
        await expect(partner).not.toHaveAttribute('open', '');
        await partner.locator('summary').click();
        await expect(partner.locator('.mls-trade-impact-lines dd').nth(1)).toHaveText('RB 1st → 2nd · WR 2nd → 1st');
        await expect(s).toContainText('2027 1st is a draft pick: no lineup spot.');
        await expect(s).toContainText('Injuries and byes are left out');
        // Explanations like this one sit behind "How this is worked out" (i), not in the bullets (improvements S19, round 5).
        await expect(s.locator('.mls-trade-impact-notes')).not.toContainText('Injuries and byes');
        await expect(s.locator('.mls-trade-impact-about .tooltip-text')).toContainText('Injuries and byes are left out');
        // The verdict, then the player cards, then this, under "More analysis" (improvements S24, round 16: the cards
        // used to come last, over 1,000px below the verdict on a phone).
        await expect(page.locator('#tradeOutput .trade-verdict-banner').first()).toBeVisible();
        expect(await page.locator('#tradeOutput').evaluate(el => {
            const sec = el.querySelector('[data-trade-impact]'), more = el.querySelector('[data-trade-more]');
            const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
            return after(el.querySelector('.trade-verdict-banner'), el.querySelector('.mls-trade-row'))
                && after(el.querySelector('.mls-trade-row'), more) && after(more, sec);
        })).toBe(true);
        await expect(page.locator('#tradeOutput [data-trade-more] [data-action="setFairBasis"]')).toHaveCount(0); // one set: no switch
        expect(await noSideScroll(page)).toBe(true);
        expect(await s.locator('.mls-power-table-wrap').first().evaluate(w => w.scrollWidth <= w.clientWidth)).toBe(true);

        // A 2-for-1 that takes your only RB: both RB slots go empty.
        await runTrade(page, 'Malik Nabers', 'Derrick Henry\nGarrett Wilson');
        await expect(section(page)).toContainText('Leaves your RB empty.');
        await expect(section(page).locator('tr.mls-power-you td').nth(4).locator('.tooltip-text')).toContainText('Leaving: Derrick Henry');

        // Draft picks on one side only: no section.
        await runTrade(page, '2027 1st\n2028 2nd', 'Derrick Henry');
        await expect(section(page)).toHaveCount(0);
        await runTrade(page, 'Bijan Robinson', '2027 1st');
        await expect(section(page)).toHaveCount(0);

        // Names it can't match and players who aren't yours are named, not counted.
        await runTrade(page, 'Bijan Robinson\nNobody McFakename', 'Derrick Henry\nGibbs Jahmyr');
        await expect(section(page)).toContainText("Couldn't match Gibbs Jahmyr, Nobody McFakename to a player, so they take no spot.");
        await expect(section(page).locator('tr.mls-power-you')).toHaveCount(1);
        await runTrade(page, 'Bijan Robinson', 'Jahmyr Gibbs');
        await expect(section(page)).toContainText("Jahmyr Gibbs isn't on your roster, so he's left out.");
        await expect(section(page)).toContainText("nothing to compare");

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('dynasty league: the Future column, with ages in its tooltip', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        // Redraft first: no Future column.
        await runTrade(page, 'Bijan Robinson', 'Derrick Henry\nGarrett Wilson');
        await expect(section(page).locator('table').first().locator('th')).toHaveText(['Team', 'Start', 'Ovr', 'QB', 'RB', 'WR', 'TE']);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).leagueType = 'dynasty';
        });
        await runTrade(page, 'Bijan Robinson\nJahmyr Gibbs\nSaquon Barkley', "Ja'Marr Chase\nJustin Jefferson\nCeeDee Lamb\nPuka Nacua\nAmon-Ra St. Brown");
        const s = section(page);
        await expect(s.locator('table').first().locator('th')).toHaveText(['Team', 'Start', 'Ovr', 'QB', 'RB', 'WR', 'TE', 'Future']);
        await expect(s.locator('.mls-trade-impact-lines').first().locator('dt').last()).toHaveText('Future');
        await expect(s.locator('.mls-trade-impact-lines').first().locator('dd').last()).toHaveText('1st → 2nd');
        expect((await cellTexts(s.locator('tr.mls-power-you')))[7]).toBe('1→2');
        await expect(s.locator('tr.mls-power-you td').nth(7)).toHaveClass(/mls-trade-rank-down/);
        const tip = s.locator('tr.mls-power-you td').nth(7).locator('.tooltip-text');
        await expect(tip).toContainText('Future value after');
        await expect(tip).toContainText('+ Bijan Robinson');
        await expect(tip).toContainText('24 yrs');
        await expect(tip).toContainText("Leaving: Ja'Marr Chase, Justin Jefferson, CeeDee Lamb, Puka Nacua, Amon-Ra St. Brown");
        await expect(s).toContainText('adjusted for player age (from Sleeper), as on the Roster tab');
        await expect(s.locator('details.mls-trade-impact-partner th').last()).toHaveText('Future');
        expect(await noSideScroll(page)).toBe(true);
        expect(await s.locator('.mls-power-table-wrap').first().evaluate(w => w.scrollWidth <= w.clientWidth)).toBe(true);
        await expectClean(page, state);
    });

    test('Export Trade: each asset with its value and the verdict; Power Rankings only when switched on', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: HTML2CANVAS }));
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await runTrade(page, 'Bijan Robinson\nJahmyr Gibbs\nSaquon Barkley\n2027 1st', "Ja'Marr Chase\nJustin Jefferson\nCeeDee Lamb");
        const btn = page.locator('#exportTradeBtn');
        const toggle = page.locator('#tradeExportPower');
        await expect(btn).toHaveText('Export Trade');
        // At the bottom of the card, after the player cards; the switch is off by default.
        expect(await page.locator('#tradeOutput').evaluate(el => {
            const cards = el.querySelectorAll('.mls-trade-row');
            return !!(cards[cards.length - 1].compareDocumentPosition(el.querySelector('#exportTradeBtn')) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);
        await expect(toggle).not.toBeChecked();

        const exportOnce = async () => {
            const download = page.waitForEvent('download');
            await btn.click();
            const file = await download;
            expect(file.suggestedFilename()).toBe('My_Trade_Lineup_Strategist.png');
            expect(PNG.sync.read(readFileSync(await file.path())).width).toBe(960); // 480px at scale 2
            return page.evaluate(() => window.__tradeClone);
        };
        let clone = await exportOnce();
        expect(clone.text).toContain('Trade · Fixture League');
        // Each asset with its value by your rankings; the pick borrows the market's (none loaded here: a dash).
        expect(clone.assets).toHaveLength(7);
        expect(clone.assets[3]).toBe('Pick 2027 1st –');
        expect(clone.assets[0]).toMatch(/^RB Bijan Robinson [\d,]+$/);
        expect(clone.assets[4]).toMatch(/^WR Ja'Marr Chase [\d,]+$/);
        expect(clone.text).toMatch(/You get/i);
        expect(clone.text).toMatch(/You give/i);
        expect(clone.text).toMatch(/By Your Rankings/i);
        expect(clone.cards).toBe(0);
        expect(clone.text).not.toContain('Power Rankings after the trade');
        expect(clone.tooltips).toBe(0);

        // Switched on: the section comes too, the partner's part open, notes for you left out.
        await toggle.check();
        clone = await exportOnce();
        expect(clone.text).toMatch(/Power Rankings after the trade/i);
        expect(clone.text).toContain('RB 2nd → 1st · WR 1st → 2nd');
        expect(clone.text).toContain('Their team: Rival');
        expect(clone.closedDetails).toBe(0);
        expect(clone.summaries).toBe(0);
        expect(clone.tooltips).toBe(0);
        expect(clone.text).toContain('2027 1st is a draft pick');
        expect(clone.text).not.toContain('Injuries and byes');
        expect(clone.text).not.toContain('How this is worked out');
        // The page is unchanged, and the switch is remembered for the next trade.
        await expect(page.locator('#tradeOutput details')).not.toHaveAttribute('open', '');
        await expect(btn).toHaveText('Export Trade');
        await runTrade(page, 'Bijan Robinson', 'Derrick Henry');
        await expect(page.locator('#tradeExportPower')).toBeChecked();

        // A one-sided entry has no verdict, so no export.
        await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson']);
        await callApp(page, 'setTradePlayers', 'give', []);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#tradeOutput')).toContainText('only one side has players');
        await expect(page.locator('#exportTradeBtn')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('picking players: search, Enter, paste, draft picks, remove, Did you mean, Clear; Value settings folded', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        const getTokens = page.locator('#tradeGetTokens .mls-trade-token');
        const giveTokens = page.locator('#tradeGiveTokens .mls-trade-token');
        // The textareas are the hidden list runScout reads.
        await expect(page.locator('#buyInput')).toBeHidden();

        // Search and tap a suggestion: a token with position and team; the search clears.
        const getSearch = page.locator('#tradeGetSearch');
        await getSearch.fill('Bijan');
        await page.locator('.autocomplete-item', { hasText: 'Bijan Robinson' }).click();
        await expect(getTokens).toHaveCount(1);
        await expect(getTokens.first()).toContainText('Bijan Robinson');
        await expect(getTokens.first()).toContainText('RB · ATL');
        await expect(getSearch).toHaveValue('');
        // The same player again: no second token.
        await getSearch.fill('Bijan');
        await page.locator('.autocomplete-item', { hasText: 'Bijan Robinson' }).click();
        await expect(getTokens).toHaveCount(1);

        // Draft picks are for dynasty and keeper leagues: the fixture league is redraft, so no pick row until it's
        // marked dynasty (in memory) and the Scout tab shows again.
        await expect(page.locator('#tradeGetPickRow')).toBeHidden();
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).leagueType = 'dynasty';
        });
        await showTab(page, 'roster');
        await showTab(page, 'scout');
        await expect(page.locator('#tradeGetPickRow')).toBeVisible();
        // A draft pick from the year and round (the clock says 2026-09-15, so the next draft is 2027).
        await expect(page.locator('#tradeGetPickYear option')).toHaveText(['2027', '2028', '2029']);
        await page.selectOption('#tradeGetPickRound', '2nd');
        await page.locator('[data-action="addTradePick"][data-side="get"]').click();
        await expect(getTokens.nth(1)).toContainText('2027 2nd');
        await expect(getTokens.nth(1)).toContainText('Pick');

        // Give side: a pasted list becomes one token each; a name the search doesn't know is added as typed on Enter.
        const giveSearch = page.locator('#tradeGiveSearch');
        await giveSearch.focus();
        await giveSearch.evaluate((el) => {
            const data = new DataTransfer();
            data.setData('text', 'Derrick Henry, Garrett Wilson');
            el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        });
        await expect(giveTokens).toHaveCount(2);
        await giveSearch.fill('Jahmir Gibbz');
        await page.waitForTimeout(150); // the search finds nothing
        await giveSearch.press('Enter');
        await expect(giveTokens).toHaveCount(3);
        await expect(page.locator('#sellInput')).toHaveValue('Derrick Henry\nGarrett Wilson\nJahmir Gibbz');
        expect(await noSideScroll(page)).toBe(true);

        // Analyze: the misspelled name gets a "Did you mean"; taking it fixes the token too.
        await analyze(page);
        await page.locator('.scout-suggest-link', { hasText: 'Jahmyr Gibbs' }).click();
        await expect(giveTokens.nth(2)).toContainText('Jahmyr Gibbs');
        // Remove a token with its button.
        await giveTokens.nth(2).locator('.mls-trade-token-remove').click();
        await expect(giveTokens).toHaveCount(2);
        await expect(page.locator('#sellInput')).toHaveValue('Derrick Henry\nGarrett Wilson');

        // Each player is one compact row in the results: badge, name, ranks, who has him, his value.
        await analyze(page);
        const rows = page.locator('#tradeOutput .mls-trade-row');
        await expect(rows).toHaveCount(4);
        await expect(rows.first()).toContainText('Bijan Robinson');
        await expect(rows.first()).toContainText('ROS 2');
        await expect(rows.first()).toContainText('Rostered by Rival');
        await expect(rows.nth(1)).toContainText('2027 2nd');
        await expect(rows.nth(2)).toContainText('Yours');
        expect(await noSideScroll(page)).toBe(true);

        // Value settings (Waiver Adjustment) are folded under the button.
        const fold = page.locator('details.mls-trade-value-settings');
        await expect(fold).not.toHaveAttribute('open', '');
        await expect(page.locator('#tradeWaiverAdjustToggle')).toBeHidden();
        await fold.locator('summary').click();
        await expect(page.locator('#tradeWaiverAdjustValue')).toBeVisible();

        // Clear empties a side.
        await page.locator('[data-action="clearSellInput"]').click();
        await expect(giveTokens).toHaveCount(0);
        await expect(page.locator('#sellInput')).toHaveValue('');
        await expectClean(page, state);
    });

    test('the team drop-down, roster lists, owner tags, re-running a changed trade, and picks without a value', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        const team = page.locator('#tradeGetTeam');
        await expect(team.locator('option')).toHaveText(['Any team', 'Rival']);

        // Give: tapping the empty search lists your roster, best ROS rank first, each tagged "Yours".
        await page.locator('#tradeGiveSearch').click();
        let items = page.locator('[data-side="give"] .autocomplete-item');
        await expect(items.first()).toContainText("Ja'Marr Chase");
        await expect(items.first()).toContainText('Yours');
        expect(await items.count()).toBe(14);
        await items.filter({ hasText: 'Derrick Henry' }).click();

        // Get, Any team: typing finds anyone, tagged with who has him; picking Bijan sets the team to his manager.
        const getSearch = page.locator('#tradeGetSearch');
        items = page.locator('[data-side="get"] .autocomplete-item');
        await getSearch.fill('Bij');
        await expect(items.first()).toContainText('Rival');
        await items.first().click();
        await expect(team).toHaveValue('Rival');
        // With a team chosen, tapping the empty search lists that team's roster.
        await getSearch.click();
        await expect(items.first()).toContainText('Bijan Robinson');
        await expect(items.first()).toContainText('Rival');
        expect(await items.count()).toBe(14);
        await page.keyboard.press('Escape');

        // Analyze once; after that, changing the trade re-runs it where it is.
        await analyze(page);
        await expect(page.locator('#tradeOutput .mls-trade-row')).toHaveCount(2);
        await getSearch.fill('Gibbs');
        // Focusing the empty field shows Rival's roster first; wait for the search to settle on the one match.
        await expect(items).toHaveCount(1);
        await items.filter({ hasText: 'Jahmyr Gibbs' }).click();
        await expect(page.locator('#tradeOutput .mls-trade-row')).toHaveCount(3);
        await page.locator('#tradeGetTokens .mls-trade-token').nth(1).locator('.mls-trade-token-remove').click();
        await expect(page.locator('#tradeOutput .mls-trade-row')).toHaveCount(2);

        // A pick with no market data: a dash and why, not "not found" (marked dynasty so the pick row shows).
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).leagueType = 'dynasty';
        });
        await showTab(page, 'roster');
        await showTab(page, 'scout');
        await page.locator('[data-action="addTradePick"][data-side="get"]').click();
        const out = page.locator('#tradeOutput');
        await expect(out).toContainText('2027 1st has no value without Market Consensus data (Trade Finder below)');
        await expect(out).not.toContainText('player not found');
        const pickRow = out.locator('.mls-trade-row', { hasText: '2027 1st' });
        await expect(pickRow).toContainText('Needs market data');
        await expect(pickRow.locator('.mls-trade-row-value')).toHaveText('–');

        // Market data three days old: dated under the verdict, in amber.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.marketRankings = [{ name: 'Bijan Robinson', cleanName: 'bijan robinson', rank: 2, pos: 'RB' }];
            State.marketUpdatedAt = String(Date.now() - 3 * 24 * 3600 * 1000);
        });
        await analyze(page);
        await expect(out.locator('.mls-trade-market-age')).toHaveText('Market values: Updated 3 days ago. Refresh them in Trade Finder (below) before you trade.');
        await expect(out.locator('.mls-trade-market-age')).toHaveClass(/is-stale/);
        await expect(out).toContainText("2027 1st isn't in the Market Consensus data");
        // Fresh today: dated, not amber.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.marketUpdatedAt = String(Date.now());
        });
        await analyze(page);
        await expect(out.locator('.mls-trade-market-age')).toHaveText('Market values: Updated today.');
        await expect(out.locator('.mls-trade-market-age')).not.toHaveClass(/is-stale/);
        expect(await noSideScroll(page)).toBe(true);
        await expectClean(page, state);
    });

    test('switching the From team clears the players you would receive; Any team keeps them', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        // A third manager, in memory (the fixture league has two teams): Zay Flowers, a free agent, goes to "Third".
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).globalRosterMap['zay flowers'] = 'Third';
        });
        await showTab(page, 'scout');
        const team = page.locator('#tradeGetTeam');
        await expect(team.locator('option')).toHaveText(['Any team', 'Rival', 'Third']);
        const getTokens = page.locator('#tradeGetTokens .mls-trade-token');
        await callApp(page, 'setTradePlayers', 'give', ['Derrick Henry']);

        // Pick from Rival: the drop-down follows him.
        await page.locator('#tradeGetSearch').fill('Bijan');
        await page.locator('[data-side="get"] .autocomplete-item', { hasText: 'Bijan Robinson' }).click();
        await expect(team).toHaveValue('Rival');
        await expect(getTokens).toHaveCount(1);
        await analyze(page);
        await expect(page.locator('#tradeOutput .mls-trade-row')).toHaveCount(2);

        // "Any team" keeps them.
        await team.selectOption('');
        await expect(getTokens).toHaveCount(1);
        // Back to Rival (where they came from): kept too.
        await team.selectOption('Rival');
        await expect(getTokens).toHaveCount(1);
        // Another team: cleared, and the analyzed trade re-runs (now one-sided). Your side stays.
        await team.selectOption('Third');
        await expect(getTokens).toHaveCount(0);
        await expect(page.locator('#buyInput')).toHaveValue('');
        await expect(page.locator('#tradeGiveTokens .mls-trade-token')).toHaveCount(1);
        await expect(page.locator('#tradeOutput')).toContainText('only one side has players');
        await expectClean(page, state);
    });

    test('suggestions show your ROS rank; rows show injuries; the sides sit side by side on wider screens', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        // Bijan is questionable this week, in the session's Sleeper player map.
        await page.evaluate(async () => {
            const { getSleeperMetaByName } = await import('/js/mls/scout/waivers.js');
            const { normalizeName } = await import('/js/shared/names.js');
            (await getSleeperMetaByName())[normalizeName('Bijan Robinson')].inj = 'Q';
        });
        await page.locator('#tradeGetSearch').fill('Bijan');
        const item = page.locator('[data-side="get"] .autocomplete-item').first();
        await expect(item).toContainText('Rival · ROS 2');
        await item.click();
        await page.locator('#tradeGiveSearch').click();
        await expect(page.locator('[data-side="give"] .autocomplete-item').first()).toContainText('Yours · ROS 1');
        await page.locator('[data-side="give"] .autocomplete-item', { hasText: 'Derrick Henry' }).click();
        await analyze(page);
        const bijan = page.locator('#tradeOutput .mls-trade-row', { hasText: 'Bijan Robinson' });
        await expect(bijan.locator('.inj-badge')).toHaveText('Q');
        await expect(page.locator('#tradeOutput .mls-trade-row', { hasText: 'Derrick Henry' }).locator('.inj-badge')).toHaveCount(0);

        // Side by side from 768px (the desktop project), stacked on phones; in the form and in the results.
        const tops = (sel) => page.locator(sel).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
        const wide = test.info().project.name === 'desktop';
        for (const sel of ['.settings-card .mls-trade-sides:not(#tradeOutput *) > .mls-trade-side', '#tradeOutput .mls-trade-sides > .mls-trade-side']) {
            const [a, b] = await tops(sel);
            if (wide) expect(a).toBe(b); else expect(b).toBeGreaterThan(a);
        }
        expect(await noSideScroll(page)).toBe(true);
        await expectClean(page, state);
    });

    test('no rankings loaded: one line saying what to load', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scout');
        await runTrade(page, 'Bijan Robinson', 'Derrick Henry');
        await expect(section(page)).toHaveText(/Load your ROS rankings \(Roster tab\) or Market Consensus data \(Trade Finder below\) to see how this trade changes your Power Rankings\./);
        await expect(section(page).locator('table')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('manual league: your starters before and after, by the optimizer rules', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await asManualLeague(page);

        // Henry is your only RB: Bijan takes his slot and the second RB slot stays empty, as before.
        // Losing Wilson (your WR7) leaves the bench, so no other starter changes.
        await runTrade(page, 'Bijan Robinson', 'Derrick Henry\nGarrett Wilson');
        const s = section(page);
        await expect(s).toContainText('Your lineup after the trade');
        await expect(s).toContainText('by your ROS rankings');
        await expect(s.locator('.mls-trade-impact-summary')).toHaveText('Better at RB.');
        const rows = s.locator('.mls-trade-lineup-row');
        await expect(rows).toHaveCount(1);
        await expect(rows.first().locator('.mls-trade-lineup-slot')).toHaveText('RB');
        await expect(rows.first().locator('.mls-trade-out')).toHaveText(/Derrick Henry\s*RB5/);
        await expect(rows.first().locator('.mls-trade-in')).toHaveText(/Bijan Robinson\s*RB1/);
        expect(await noSideScroll(page)).toBe(true);
        // Slot, name and rank on one line.
        const oneLine = await rows.first().locator('.mls-trade-lineup-line').evaluateAll(lines => lines.every(l => {
            const kids = [...l.children].map(c => c.getBoundingClientRect());
            return kids.every(k => Math.abs(k.top - kids[0].top) < 12);
        }));
        expect(oneLine).toBe(true);

        // No lineup slots set: say where to set them.
        await asManualLeague(page, { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SFLEX: 0, K: 0, DEF: 0 });
        await runTrade(page, 'Bijan Robinson', 'Derrick Henry');
        await expect(s).toHaveText(/Set this league's lineup slots \(Active League Requirements, Settings tab\)/);
        await expectClean(page, state);
    });

    test('manual league: an unranked incoming starter can\'t be compared', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        // The fixture rankings without Bijan Robinson.
        const csv = readFileSync(new URL('./fixtures/rankings.csv', import.meta.url), 'utf8').split('\n').filter(l => !l.includes('Bijan')).join('\n');
        await loadMlsRankings(page, csv, 23);
        await showTab(page, 'scout');
        await asManualLeague(page);
        await runTrade(page, 'Bijan Robinson', 'Derrick Henry');
        const s = section(page);
        await expect(s.locator('.mls-trade-impact-summary')).toHaveText("Can't compare at RB (Bijan Robinson is unranked).");
        await expect(s.locator('.mls-trade-in')).toHaveText(/Bijan Robinson\s*UR/);
        await expect(s).toContainText("Bijan Robinson isn't in your ROS rankings, so he only starts when nobody else fits.");
        await expectClean(page, state);
    });
});
