// "To make it fair" in the Trade Analyzer (improvements S19): under a lopsided verdict, the gap in words and players
// from the roster of the side that has to add, each with Add; Add puts him on the trade, which re-runs in place.
// The picking itself is unit-tested (tests/unit/makeFair.test.mjs); this covers the screen on the fixture league.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

async function runTrade(page, get, give) {
    await callApp(page, 'setTradePlayers', 'get', get);
    await callApp(page, 'setTradePlayers', 'give', give);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const btn = page.locator('[data-action="runScout"][data-scout-type="trade"]');
    await btn.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await btn.click();
    await expect(page.locator('#tradeOutput')).toContainText(get.length && give.length ? 'You Receive' : 'only one side');
}

const fair = (page) => page.locator('#tradeOutput [data-trade-fair]');
const yourVerdict = (page) => page.locator('#tradeOutput .trade-verdict-banner').first();
const at375 = (page) => test.info().project.name === 'phone' ? page.setViewportSize({ width: 375, height: 844 }) : null;
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
// Who has each player in the active league (clean name -> owner, "You" for you).
const ownerMap = (page) => page.evaluate(async () => {
    const { State } = await import('/js/mls/state.js');
    return State.leagues.find(l => l.leagueId === State.activeLeagueId).globalRosterMap;
});
const clean = (n) => n.toLowerCase().replace(/[^a-z]/g, '');

async function setup(page) {
    await at375(page);
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await showTab(page, 'scout');
    return state;
}

// The fixture league as a dynasty league, synced, so the sync reads its traded picks (Rival's 2027 1st is yours, your
// 2027 2nd is Rival's: tests/fixtures/sleeper/make-fixtures.mjs), with two draft rounds.
async function setupDynasty(page) {
    await at375(page);
    const state = await openApp(page, '/lineup/');
    const league = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sleeper/league.json', import.meta.url)), 'utf8'));
    league.settings = { ...league.settings, type: 2, draft_rounds: 2 };
    await page.route(/^https:\/\/api\.sleeper\.app\/v1\/league\/\d+$/, (route) => route.fulfill({ json: league }));
    await seedMls(page);
    await loadMlsRankings(page);
    return state;
}

test.describe('Trade Analyzer: what would make it fair', () => {
    test('favors them: suggestions from Rival\'s roster; Add puts one on the trade and it turns Fair', async ({ page }) => {
        const state = await setup(page);
        // Bijan (Rival's) for your two best: Favors Them by Your Rankings.
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", 'Justin Jefferson']);
        await expect(yourVerdict(page)).toContainText('Favors Them');
        const box = fair(page);
        await expect(box).toHaveCount(1);
        await expect(box).toContainText(/To make it fair, they'd add about [\d,]+/);
        await expect(box).toContainText("By Your Rankings, from Rival's roster. Any one of these brings it within 10%.");
        // 1 for 2: one more player on your side ends the waiver credit, so the "about" figure is bigger than the gap.
        await expect(box).toContainText('Counts the waiver adjustment, which changes with one more player.');
        const items = box.locator('.mls-trade-fair-item');
        const count = await items.count();
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(3);

        // Every suggestion is Rival's, ranked, and not already in the trade.
        const owners = await ownerMap(page);
        const names = await box.locator('.mls-trade-fair-names').allInnerTexts();
        const byClean = Object.fromEntries(Object.entries(owners).map(([k, v]) => [clean(k), v]));
        names.forEach(n => {
            expect(byClean[clean(n)]).toBe('Rival');
            expect(n).not.toBe('Bijan Robinson');
        });
        await expect(items.first().locator('.mls-trade-fair-val')).toHaveText(/^[\d,]+$/);

        // Below the verdicts, above "Power Rankings after the trade".
        expect(await page.locator('#tradeOutput').evaluate(el => {
            const f = el.querySelector('[data-trade-fair]'), banners = el.querySelectorAll('.trade-verdict-banner');
            const after = !!(banners[banners.length - 1].compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
            const impact = el.querySelector('[data-trade-impact]');
            return after && !!(f.compareDocumentPosition(impact) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);

        // Phone width: one suggestion per line, names whole, Add inside the screen.
        if (test.info().project.name === 'phone') {
            const rows = await items.evaluateAll(lis => lis.map(li => {
                const r = li.getBoundingClientRect(), add = li.querySelector('button').getBoundingClientRect();
                const name = li.querySelector('.mls-trade-fair-player');
                const lh = parseFloat(getComputedStyle(name).lineHeight) || 20;
                return { left: r.left, width: r.width, addRight: add.right, nameOneLine: name.getBoundingClientRect().height < lh * 1.5 };
            }));
            const parentWidth = await box.locator('.mls-trade-fair-list').evaluate(ul => ul.getBoundingClientRect().width);
            rows.forEach(r => {
                expect(Math.round(r.width)).toBe(Math.round(parentWidth));
                expect(r.addRight).toBeLessThanOrEqual(375);
                expect(r.nameOneLine).toBe(true);
            });
            expect(await noSideScroll(page)).toBe(true);
        }

        // Add: the first suggestion becomes a token on what you get, and the trade re-runs where it is.
        const first = names[0];
        await items.first().locator('[data-action="addFairSuggestion"]').click();
        await expect(page.locator('#tradeGetTokens .mls-trade-token')).toHaveCount(2);
        await expect(page.locator('#tradeGetTokens')).toContainText(first);
        await expect(page.locator('#tradeOutput .mls-trade-row')).toHaveCount(4);
        await expect(yourVerdict(page)).toContainText('Fair Trade');
        await expect(fair(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    test('favors you: you\'d add, from your roster', async ({ page }) => {
        const state = await setup(page);
        await runTrade(page, ['Bijan Robinson', 'Jahmyr Gibbs'], ["Ja'Marr Chase"]);
        await expect(yourVerdict(page)).toContainText('Favors You');
        await expect(fair(page)).toContainText(/To make it fair, you'd add about [\d,]+/);
        await expect(fair(page)).toContainText('from your roster');
        const owners = await ownerMap(page);
        const byClean = Object.fromEntries(Object.entries(owners).map(([k, v]) => [clean(k), v]));
        const names = await fair(page).locator('.mls-trade-fair-names').allInnerTexts();
        expect(names.length).toBeGreaterThan(0);
        names.forEach(n => { expect(byClean[clean(n)]).toBe('You'); expect(n).not.toBe("Ja'Marr Chase"); });
        await fair(page).locator('[data-action="addFairSuggestion"]').first().click();
        await expect(page.locator('#tradeGiveTokens .mls-trade-token')).toHaveCount(2);
        await expect(yourVerdict(page)).toContainText('Fair Trade');
        await expect(fair(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    test('a fair trade, a one-sided entry and no rankings show none', async ({ page }) => {
        const state = await setup(page);
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase"]);
        await expect(yourVerdict(page)).toContainText('Fair Trade');
        await expect(fair(page)).toHaveCount(0);
        await runTrade(page, ['Bijan Robinson'], []);
        await expect(fair(page)).toHaveCount(0);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.rosRankings = []; State.marketRankings = [];
        });
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", 'Justin Jefferson']);
        await expect(page.locator('#tradeOutput')).toContainText('to get a value total and fairness verdict');
        await expect(fair(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    test('pairs when no single player fits; Add both puts both on the trade', async ({ page }) => {
        const state = await setup(page);
        await page.evaluate(async () => { (await import('/js/mls/state.js')).State.tradeSettings.waiverAdjustment = false; });
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", 'Justin Jefferson', 'CeeDee Lamb']);
        await expect(yourVerdict(page)).toContainText('Favors Them');
        await expect(fair(page)).toContainText(/No single player on Rival's roster closes a [\d,]+ gap\. By Your Rankings, these pairs would:/);
        const pair = fair(page).locator('.mls-trade-fair-item').first();
        await expect(pair.locator('.mls-trade-fair-player')).toHaveCount(2);
        await expect(pair.locator('.pos-badge')).toHaveCount(2);
        await expect(pair.locator('button')).toHaveText('Add both');
        await pair.locator('button').click();
        await expect(page.locator('#tradeGetTokens .mls-trade-token')).toHaveCount(3);
        await expect(yourVerdict(page)).toContainText('Fair Trade');
        await expect(fair(page)).toHaveCount(0);
        await expectClean(page, state);
    });

    test('nobody fits: a one-line note', async ({ page }) => {
        const state = await setup(page);
        // Rival keeps only two players: one too small alone, and nothing else to pair with. The waiver adjustment is
        // off: its auto value comes from the best free agents, which Rival's dropped players would become.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.tradeSettings.waiverAdjustment = false;
            const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
            const keep = new Set(['bijanrobinson', 'kyrenwilliams']);
            Object.keys(league.globalRosterMap).forEach(k => { if (league.globalRosterMap[k] === 'Rival' && !keep.has(k)) delete league.globalRosterMap[k]; });
        });
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", 'Justin Jefferson', 'CeeDee Lamb']);
        await expect(yourVerdict(page)).toContainText('Favors Them');
        await expect(fair(page)).toContainText(/No player or pair on Rival's roster closes a [\d,]+ gap by Your Rankings\./);
        await expect(fair(page).locator('.mls-trade-fair-item')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('manual league: suggests only when you\'re the one who adds, and says so otherwise', async ({ page }) => {
        const state = await setup(page);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
            State.tradeSettings.waiverAdjustment = false; // as above: the other teams' players read as free agents
            league.username = 'Manual';
            league.globalRosterMap = Object.fromEntries(Object.entries(league.globalRosterMap).filter(([, o]) => o === 'You'));
        });
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", 'Justin Jefferson']);
        await expect(fair(page)).toContainText("they'd add about");
        await expect(fair(page)).toContainText("This is a manual league: the app knows only your roster, so it can't suggest what they'd add.");
        await expect(fair(page).locator('.mls-trade-fair-item')).toHaveCount(0);
        await runTrade(page, ['Bijan Robinson', 'Jahmyr Gibbs'], ["Ja'Marr Chase"]);
        await expect(fair(page)).toContainText("you'd add about");
        expect(await fair(page).locator('.mls-trade-fair-item').count()).toBeGreaterThan(0);
        await expectClean(page, state);
    });

    test('Export Trade leaves the suggestions out', async ({ page }) => {
        const here = (p) => fileURLToPath(new URL(p, import.meta.url));
        const body = readFileSync(here('./node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8') + `
;(() => { const o = window.html2canvas; window.html2canvas = (el, opts = {}) => o(el, { ...opts, onclone: async (doc) => {
    if (opts.onclone) await opts.onclone(doc); window.__tradeCloneText = doc.getElementById('tradeOutput').innerText; } }); })();`;
        const state = await openApp(page, '/lineup/');
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body }));
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await runTrade(page, ['Bijan Robinson'], ["Ja'Marr Chase", 'Justin Jefferson']);
        await expect(fair(page)).toHaveCount(1);
        const download = page.waitForEvent('download');
        await page.locator('#exportTradeBtn').click();
        await download;
        const text = await page.evaluate(() => window.__tradeCloneText);
        expect(text).toContain('Favors Them');
        expect(text).not.toContain('To make it fair');
        await expect(fair(page)).toHaveCount(1);
        await expectClean(page, state);
    });

    test('dynasty league: picks synced from Sleeper decide which picks are suggested, and the rows say who holds them', async ({ page }) => {
        const state = await setupDynasty(page);
        const picks = await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
            return Object.fromEntries(Object.entries(league.picks).map(([o, l]) => [o, l.map(p => p.from ? `${p.name} (${p.from})` : p.name)]));
        });
        expect(picks.You).toEqual(['2027 1st', '2027 1st (Rival)', '2028 1st', '2028 2nd', '2029 1st', '2029 2nd']);
        expect(picks.Rival).toEqual(['2027 2nd (You)', '2027 2nd', '2028 1st', '2028 2nd', '2029 1st', '2029 2nd']);

        // Market values for two picks, the 1st worth a little more: both would close the gap, but Rival has no 1st.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const { normalizeName } = await import('/js/shared/names.js');
            State.marketRankings = [['2027 1st', 62], ['2027 2nd', 64]].map(([name, marketVal]) => ({ name, cleanName: normalizeName(name), marketVal, pos: '' }));
            State.tradeSettings.waiverAdjustment = false;
        });
        await showTab(page, 'scout');
        // 2 for 2, Favors Them by about 3,200; Rival's other players are all worth too much to add alone.
        await runTrade(page, ['Bijan Robinson', 'Kyren Williams'], ["Ja'Marr Chase", 'Justin Jefferson']);
        await expect(yourVerdict(page)).toContainText('Favors Them');
        const box = fair(page);
        await expect(box.locator('.mls-trade-fair-names')).toHaveText([/^2027 2nd\*/]);
        await expect(box).toContainText("* Draft pick: market value. Picks Rival holds as of this league's last sync.");
        await expect(box).not.toContainText('2027 1st');
        await box.locator('[data-action="addFairSuggestion"]').click();
        await expect(page.locator('#tradeGetTokens')).toContainText('2027 2nd');
        await expect(yourVerdict(page)).toContainText('Fair Trade');
        await expect(fair(page)).toHaveCount(0);

        // The rows: a pick you hold, one you traded away, and one Rival doesn't hold.
        await page.locator('#tradeGetTeam').selectOption('Rival');
        await runTrade(page, ['Bijan Robinson', '2027 1st'], ["Ja'Marr Chase", '2027 1st', '2027 2nd']);
        const row = (side, name) => page.locator(`#tradeOutput .mls-trade-side:has(.mls-trade-side-${side}) .mls-trade-row`, { hasText: name });
        await expect(row('give', '2027 1st')).toContainText('Yours');
        await expect(row('give', '2027 2nd')).toContainText("Not yours (you don't hold it)");
        await expect(row('get', '2027 1st')).toContainText("Rival doesn't hold it");
        await runTrade(page, ['Bijan Robinson', '2027 2nd'], ["Ja'Marr Chase"]);
        await expect(row('get', '2027 2nd')).toContainText("Rival's");
        await expectClean(page, state);
    });

    // Bug found in S19 round 2: names are matched with digits stripped, so every "20xx 1st" was the same pick to the
    // market lookup and got one value, whatever its year.
    test('each draft pick has its own market value', async ({ page }) => {
        const state = await setup(page);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const { normalizeName } = await import('/js/shared/names.js');
            State.marketRankings = [['2027 1st', 10], ['2029 1st', 40], ['2027 2nd', 30]].map(([name, marketVal]) => ({ name, cleanName: normalizeName(name), marketVal, pos: '' }));
        });
        await runTrade(page, ['Bijan Robinson', '2027 1st', '2029 1st'], ["Ja'Marr Chase", '2027 2nd']);
        const value = (rank) => Math.round(10000 * Math.pow(0.982, rank - 1)).toLocaleString('en-US');
        const row = (name) => page.locator('#tradeOutput .mls-trade-row', { hasText: name });
        await expect(row('2027 1st').locator('.mls-trade-row-mkt')).toHaveText(`Mkt ${value(10)}`);
        await expect(row('2029 1st').locator('.mls-trade-row-mkt')).toHaveText(`Mkt ${value(40)}`);
        await expect(row('2027 2nd').locator('.mls-trade-row-mkt')).toHaveText(`Mkt ${value(30)}`);
        await expectClean(page, state);
    });

    // Round 3 (owner's choice): the picks each team holds count toward the Power Rankings' Future column, by the market's
    // value when dynasty Market Consensus is loaded, else a set table (a 1st like the 48th player, a 2nd the 100th).
    test('dynasty league: picks count in the Future column, on the Roster tab and after a trade', async ({ page }) => {
        const state = await setupDynasty(page);
        await showTab(page, 'roster');
        const card = page.locator('#powerRankingsOutput');
        await expect(card.locator('.mls-power-table th', { hasText: 'Future' })).toHaveCount(1);
        await expect(card).toContainText('Draft picks each team holds (from Sleeper) count too, by a set table');
        // Your Future tooltip lists your picks, Rival's 1st marked as coming from Rival, each "like" a player rank.
        const youRow = card.locator('.mls-power-table tr.mls-power-you').first();
        const futureTip = youRow.locator('td').last().locator('.tooltip-text');
        const tipText = await futureTip.evaluate(el => el.textContent.replace(/\s+/g, ' '));
        // The fixture's players are all top-24, so the picks are past the top 8 rows: named on their own line.
        expect(tipText).toMatch(/\+ \d+ more players?\s*Picks: 2027 1st, 2027 1st \(via Rival\), 2028 1st/);

        // A trade of picks only now has a section: your two 2027 1sts for their two 2027 2nds turns the Future column.
        await showTab(page, 'scout');
        await page.locator('#tradeGetTeam').selectOption('Rival');
        await runTrade(page, ['2027 2nd'], ['2027 1st']);
        const impact = page.locator('#tradeOutput [data-trade-impact]');
        await expect(impact).toHaveCount(1);
        await expect(impact).toContainText('Draft picks each team holds (from Sleeper) count too');
        const futureCell = impact.locator('tr.mls-power-you td').last();
        const after = await futureCell.locator('.tooltip-text').evaluate(el => el.textContent.replace(/\s+/g, ' '));
        expect(after).toContain('+ 2027 2nd (via you)');
        expect(after).toContain('Leaving: 2027 1st');
        await expectClean(page, state);
    });
});
