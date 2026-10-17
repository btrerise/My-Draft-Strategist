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
});
