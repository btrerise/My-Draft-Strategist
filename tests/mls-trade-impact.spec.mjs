// The Trade Analyzer's "after the trade" section (improvements S14): Power Rankings before and after in a
// Sleeper league (yours, and the partner's in a fold), your starters before and after in a manual league,
// and the cases that show a note or nothing.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings } from './helpers.mjs';

async function runTrade(page, get, give) {
    await page.fill('#buyInput', get);
    await page.fill('#sellInput', give);
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
            const area = doc.getElementById('tradeExportArea');
            const head = area.querySelector('.mls-trade-export-head');
            window.__tradeClone = {
                width: area.getBoundingClientRect().width,
                head: head && !head.hidden ? head.innerText : null,
                text: area.innerText,
                tooltips: area.querySelectorAll('.tooltip-text, .tooltip-icon').length,
                closedDetails: area.querySelectorAll('details:not([open])').length,
                summaries: area.querySelectorAll('summary').length,
            };
        },
    });
})();
`;

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
        await expect(s.locator('.mls-trade-impact-summary').first()).toHaveText(/Stronger at RB \(2nd → 1st\); weaker at WR \(1st → 2nd\)\./);
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
        await expect(partner.locator('.mls-trade-impact-summary')).toHaveText(/Stronger at WR \(2nd → 1st\); weaker at RB \(1st → 2nd\)\./);
        await expect(s).toContainText('2027 1st is a draft pick: no lineup spot.');
        await expect(s).toContainText('Injuries and byes are left out');
        // The verdict is still above it, and the player cards below.
        await expect(page.locator('#tradeOutput .trade-verdict-banner').first()).toBeVisible();
        expect(await page.locator('#tradeOutput').evaluate(el => {
            const sec = el.querySelector('[data-trade-impact]');
            return !!(el.querySelector('.trade-verdict-banner').compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING)
                && !!(sec.compareDocumentPosition(el.querySelector('.scout-result-card')) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);
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
        await expect(s.locator('.mls-trade-impact-summary').first()).toHaveText(/ Future value 1st → 2nd\.$/);
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

    test('Export Trade saves the verdict and the section as an image', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: HTML2CANVAS }));
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await runTrade(page, 'Bijan Robinson\nJahmyr Gibbs\nSaquon Barkley\n2027 1st', "Ja'Marr Chase\nJustin Jefferson\nCeeDee Lamb");
        // The header is for the image only.
        await expect(page.locator('#tradeExportArea .mls-trade-export-head')).toBeHidden();
        const btn = page.locator('#exportTradeBtn');
        await expect(btn).toHaveText('Export Trade');
        const download = page.waitForEvent('download');
        await btn.click();
        const file = await download;
        expect(file.suggestedFilename()).toBe('My_Trade_Lineup_Strategist.png');
        const png = PNG.sync.read(readFileSync(await file.path()));
        expect(png.width).toBe(960); // 480px at scale 2
        const clone = await page.evaluate(() => window.__tradeClone);
        expect(clone.head).toContain('Trade · Fixture League');
        expect(clone.head).toContain('You get: Bijan Robinson, Jahmyr Gibbs, Saquon Barkley, 2027 1st');
        expect(clone.head).toContain("You give: Ja'Marr Chase, Justin Jefferson, CeeDee Lamb");
        expect(clone.text).toMatch(/By Your Rankings/i);
        expect(clone.text).toContain('Stronger at RB (2nd → 1st)');
        expect(clone.text).toContain('Their team: Rival');
        expect(clone.closedDetails).toBe(0);
        expect(clone.summaries).toBe(0);
        expect(clone.tooltips).toBe(0);
        // Notes for the league stay (the pick); notes for you go (injuries left out).
        expect(clone.text).toContain('2027 1st is a draft pick');
        expect(clone.text).not.toContain('Injuries and byes');
        // The page itself is unchanged: header hidden, fold closed, button label back.
        await expect(page.locator('#tradeExportArea .mls-trade-export-head')).toBeHidden();
        await expect(page.locator('#tradeExportArea details')).not.toHaveAttribute('open', '');
        await expect(btn).toHaveText('Export Trade');

        // A one-sided entry has no verdict, so no export.
        await page.fill('#buyInput', 'Bijan Robinson');
        await page.fill('#sellInput', '');
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#tradeOutput')).toContainText('only one side has players');
        await expect(page.locator('#exportTradeBtn')).toHaveCount(0);
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
