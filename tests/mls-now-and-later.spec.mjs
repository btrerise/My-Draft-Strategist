// Now and long-term side by side (improvements S24). In a dynasty or keeper league with an In-Season set (S23) and
// its dynasty set loaded: the Trade Analyzer gives each player two values and two verdicts (In-Season and Dynasty)
// with a headline joining them, "To make it fair" goes by the dynasty value, Power Rankings after the trade pairs the
// In-Season value with the lineup, and Export Trade shows both; the Roster tab shows both ranks per row, a gap chip
// where they're far apart, and a Sort by: Dynasty | In-Season switch. A redraft league, and a dynasty league with no
// In-Season set, look exactly as before. The numbers themselves are unit-tested (tests/unit/nowAndLater.test.mjs).
//
// Setup: the synced Fixture League (two teams) with two ROS sets uploaded through the card, both with a Pos Rank
// column so the position ranks are exactly what's written: "Dynasty SF" (tests/fixtures/rankings.csv's order, Garrett
// Wilson WR30) and "Redraft ROS" (the other team's players first, then yours; Ja'Marr Chase WR20, Wilson WR3). So
// Chase gets "Long-term > now" (WR20 now, WR1 dynasty) and Wilson "Now > long-term" (WR3 now, WR30 dynasty).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openApp, expectClean, showTab, seedMls, callApp, FIXED_NOW, FIXTURE_LEAGUE_ID, RANKINGS_CSV } from './helpers.mjs';

const THEIRS = ['Bijan Robinson', 'Jahmyr Gibbs', 'Saquon Barkley', 'Malik Nabers', 'Christian McCaffrey', 'Nico Collins',
    'Lamar Jackson', 'Drake London', 'Jalen Hurts', "De'Von Achane", 'Joe Burrow', 'Kyren Williams'];
const MINE = ['George Kittle', "Ja'Marr Chase", 'Justin Jefferson', 'CeeDee Lamb', 'Puka Nacua', 'Amon-Ra St. Brown',
    'Brock Bowers', 'Josh Allen', 'Derrick Henry', 'Trey McBride', 'A.J. Brown', 'Garrett Wilson'];
const rows = RANKINGS_CSV.trim().split('\n').slice(1).map(l => l.split(','));
const byName = Object.fromEntries(rows.map(r => [r[1], r]));
// A CSV in this order, with each player's position rank counted in that order unless `override` names it.
const csvOf = (names, override = {}) => {
    const seen = {};
    return 'Rank,Player,Pos,Team,Pos Rank\n' + names.map((n, i) => {
        const pos = byName[n][2];
        seen[pos] = (seen[pos] || 0) + 1;
        return `${i + 1},${n},${pos},${byName[n][3]},${override[n] || seen[pos]}`;
    }).join('\n') + '\n';
};
const DYNASTY_CSV = csvOf(rows.map(r => r[1]), { 'Garrett Wilson': 30 });
const SEASON_CSV = csvOf([...THEIRS, ...MINE], { "Ja'Marr Chase": 20, 'Garrett Wilson': 3 });

const storedLeagues = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues') || '[]'));
const fixture = async (page) => (await storedLeagues(page)).find(l => l.leagueId === FIXTURE_LEAGUE_ID);
const at375 = (page) => test.info().project.name === 'phone' ? page.setViewportSize({ width: 375, height: 844 }) : null;
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function openRosCard(page) {
    await showTab(page, 'roster');
    const toggle = page.locator('#rosRankingsCard .rankings-card-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(page.locator('#rosRankingSetSelect')).toBeVisible();
}

async function uploadRos(page, name, csv) {
    await openRosCard(page);
    await page.locator('#rosRankingSetSelect').selectOption('__new__');
    await page.fill('#rosNewSetName', name);
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

async function patchLeagues(page, patches) {
    await page.evaluate(async (patches) => {
        const { State } = await import('/js/mls/state.js');
        State.leagues.forEach(l => { if (patches[l.name]) Object.assign(l, patches[l.name]); });
        localStorage.setItem('mls_leagues', JSON.stringify(State.leagues));
    }, patches);
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
}

const setIdOf = (page, name) => page.evaluate((n) => JSON.parse(localStorage.getItem('mls_ranking_sets_ros')).find(s => s.name === n).id, name);

// kind: 'both' (dynasty with an In-Season set), 'dynasty' (no In-Season set), 'redraft'.
async function setUp(page, kind = 'both', { html2canvas = false } = {}) {
    await at375(page);
    const state = await openApp(page, '/lineup/');
    if (html2canvas) {
        const here = (p) => fileURLToPath(new URL(p, import.meta.url));
        const body = readFileSync(here('./node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8') + `
;(() => { const o = window.html2canvas; window.html2canvas = (el, opts = {}) => o(el, { ...opts, onclone: async (doc) => {
    if (opts.onclone) await opts.onclone(doc); window.__tradeCloneText = doc.getElementById('tradeOutput').innerText; } }); })();`;
        await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/,
            (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body }));
    }
    await seedMls(page);
    await uploadRos(page, 'Redraft ROS', SEASON_CSV);
    // Set ids are 'rset_' + Date.now(), and the test clock is fixed: move it so the two differ.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000));
    await uploadRos(page, 'Dynasty SF', DYNASTY_CSV);
    const ids = { dynasty: await setIdOf(page, 'Dynasty SF'), season: await setIdOf(page, 'Redraft ROS') };
    const patch = { rosRankingSetId: ids.dynasty };
    if (kind !== 'redraft') patch.leagueType = 'dynasty';
    if (kind === 'both') patch.seasonRankingSetId = ids.season;
    await patchLeagues(page, { 'Fixture League': patch });
    return { state, ids };
}

async function runTrade(page, get, give) {
    await showTab(page, 'scout');
    await callApp(page, 'setTradePlayers', 'get', get);
    await callApp(page, 'setTradePlayers', 'give', give);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const btn = page.locator('[data-action="runScout"][data-scout-type="trade"]');
    await btn.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await btn.click();
    await expect(page.locator('#tradeOutput')).toContainText('You Receive');
}

const value = (rank) => Math.round(10000 * Math.pow(0.982, rank - 1)); // rankToTradeValue
const fmt = (n) => n.toLocaleString('en-US');
const rowFor = (page, name) => page.locator('#rosterList .roster-item').filter({ hasText: name });
const rosterNames = (page) => page.locator('#rosterList .roster-item .player-name-wrap').evaluateAll(els => els.map(e => e.firstChild.textContent.replace(/\s*\(\d+\)\s*$/, '').trim()));

test.describe('Now and long-term side by side', () => {
    test('Trade Analyzer: two values per player, two verdicts and a headline; make it fair by dynasty; Power Rankings by In-Season', async ({ page }) => {
        const { state } = await setUp(page);
        // Nico Collins (In-Season #6, dynasty #12) for Ja'Marr Chase (In-Season #14, dynasty #1).
        await runTrade(page, ['Nico Collins'], ["Ja'Marr Chase"]);
        const out = page.locator('#tradeOutput');
        const nowDiff = value(6) - value(14), laterDiff = value(12) - value(1);
        await expect(out.locator('[data-trade-dual-headline]')).toHaveText(
            `Wins now (+${fmt(nowDiff)}), costs long-term (−${fmt(-laterDiff)})`);

        const banners = out.locator('.mls-trade-verdict-dual > .trade-verdict-banner');
        await expect(banners).toHaveCount(2);
        await expect(banners.nth(0)).toContainText(/By Your In-\u2060?Season Rankings/);
        await expect(banners.nth(0)).toContainText('Favors You');
        await expect(banners.nth(0)).toContainText(fmt(value(6)));
        await expect(banners.nth(1)).toContainText('By Your Dynasty Rankings');
        await expect(banners.nth(1)).toContainText('Favors Them');
        await expect(banners.nth(1)).toContainText(fmt(value(12)));
        // The headline sits above the verdicts.
        expect(await out.evaluate(o => {
            const h = o.querySelector('[data-trade-dual-headline]'), pair = o.querySelector('.mls-trade-verdict-dual');
            return !!(h.compareDocumentPosition(pair) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);

        // Each row: dynasty and In-Season ranks, the dynasty value with the In-Season one under it.
        const collins = out.locator('.mls-trade-row').filter({ hasText: 'Nico Collins' });
        await expect(collins.locator('.mls-trade-row-meta')).toContainText('Dyn 12');
        await expect(collins.locator('.mls-trade-row-meta')).toContainText('Now 6');
        await expect(collins.locator('.mls-trade-row-value .mls-stat-value')).toHaveText(fmt(value(12)));
        await expect(collins.locator('.mls-trade-row-now')).toHaveText(`Now ${fmt(value(6))}`);

        // "To make it fair" goes by the dynasty value, and says so.
        const fair = out.locator('[data-trade-fair]');
        await expect(fair).toHaveCount(1);
        await expect(fair).toContainText("they'd add");
        await expect(fair).toContainText(/by your dynasty rankings/);

        // Power Rankings after the trade: the headline's value is the In-Season one, and the source line says so.
        const impact = out.locator('[data-trade-impact]');
        await expect(impact.locator('.mls-trade-impact-via')).toHaveText('Start and value by In-Season; Ovr, position rooms and Future by dynasty');
        await expect(impact.locator('.mls-trade-impact-headline')).toContainText(`+${fmt(nowDiff)} pts`);

        // Phones: the rows and the verdicts fit 375px, and both banners' (i) tooltips open on screen (as
        // tooltips-onscreen.spec.mjs checks the others).
        expect(await noSideScroll(page)).toBe(true);
        for (const icon of await banners.locator('.tooltip-icon').all()) {
            await icon.click();
            const tip = icon.locator('xpath=following-sibling::*[contains(@class,"tooltip-text")]');
            await expect(tip).toBeVisible();
            const box = await tip.boundingBox();
            const vw = await page.evaluate(() => document.documentElement.clientWidth);
            expect(box.x).toBeGreaterThanOrEqual(-0.5);
            expect(box.x + box.width).toBeLessThanOrEqual(vw + 0.5);
            await icon.click();
        }
        await expectClean(page, state);
    });

    test('Export Trade shows both verdicts, the headline and both values', async ({ page }) => {
        const { state } = await setUp(page, 'both', { html2canvas: true });
        await runTrade(page, ['Nico Collins'], ["Ja'Marr Chase"]);
        const download = page.waitForEvent('download');
        await page.locator('#exportTradeBtn').click();
        await download;
        const text = await page.evaluate(() => window.__tradeCloneText);
        expect(text).toContain('Wins now');
        expect(text).toMatch(/By Your In-\u2060?Season Rankings/i);
        expect(text).toMatch(/By Your Dynasty Rankings/i);
        expect(text).toContain('Dyn: estimated from my dynasty rankings, Now: from my In-Season rankings');
        expect(text).toContain(fmt(value(6)));
        expect(text).toContain(fmt(value(12)));
        expect(text).not.toContain('To make it fair');
        await expectClean(page, state);
    });

    test('Roster tab: both ranks on each row, the gap chip, and Sort by Dynasty | In-Season', async ({ page }) => {
        const { state } = await setUp(page);
        await showTab(page, 'roster');
        await expect(page.locator('#rosterList .mls-roster-source')).toHaveText(
            'Ranks by your In-Season rankings (Redraft ROS) and your dynasty rankings (Dynasty SF).');

        const chase = rowFor(page, "Ja'Marr Chase");
        await expect(chase.locator('.mls-roster-dual .mls-rank-badge')).toHaveText(['In-Season WR20 · #14', 'Dyn WR1 · #1']);
        await expect(chase.locator('.mls-gap-chip')).toHaveText('Long-term > now');
        await expect(chase.locator('.mls-gap-chip')).toHaveClass(/is-later/);
        const wilson = rowFor(page, 'Garrett Wilson');
        await expect(wilson.locator('.mls-gap-chip')).toHaveText('Now > long-term');
        // Players whose two ranks are close get none.
        await expect(rowFor(page, 'Justin Jefferson').locator('.mls-gap-chip')).toHaveCount(0);
        await expect(page.locator('#rosterList .mls-gap-chip')).toHaveCount(2);
        // No single "Ovr | Pos" badge any more: the two replace it.
        await expect(page.locator('#rosterList .roster-item .mls-player-row-meta:not(.mls-roster-dual) .mls-rank-badge')).toHaveCount(0);

        // The chip explains itself on tap.
        await wilson.locator('.mls-gap-chip').click();
        await expect(page.locator('.toast-message').filter({ hasText: 'In-Season WR3, dynasty WR30' })).toBeVisible();

        // Phones: the two ranks fit a 375px row, on a line of their own.
        expect(await noSideScroll(page)).toBe(true);
        const overflow = await page.locator('#rosterList .roster-item').evaluateAll(items => items.flatMap(it => {
            const r = it.getBoundingClientRect();
            return [...it.querySelectorAll('.mls-roster-dual > *')].filter(b => b.getBoundingClientRect().right > r.right + 0.5)
                .map(b => `${it.querySelector('.player-name-wrap').textContent.trim()}: ${b.textContent.trim()}`);
        }));
        expect(overflow).toEqual([]);

        // Sort: Dynasty by default (Chase, your dynasty #1, first); In-Season puts George Kittle (your In-Season best) first.
        const sortBtns = page.locator('#rosterSort [data-action="setRosterSort"]');
        await expect(sortBtns).toHaveText(['Dynasty', 'In-Season']);
        await expect(sortBtns.nth(0)).toHaveAttribute('aria-pressed', 'true');
        expect((await rosterNames(page))[0]).toBe("Ja'Marr Chase");
        await sortBtns.nth(1).click();
        await expect(page.locator('#rosterSort [data-sort="season"]')).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(async () => (await rosterNames(page)).slice(0, 3)).toEqual(['George Kittle', "Ja'Marr Chase", 'Justin Jefferson']);
        await expect(page.locator('#rosterSort [data-sort="season"]')).toBeFocused();
        expect((await fixture(page)).rosterSortSeason).toBe(true);

        // Saved on the league: a reload and a re-sync keep it.
        await page.reload();
        await page.waitForLoadState('networkidle');
        await showTab(page, 'roster');
        await expect(page.locator('#rosterSort [data-sort="season"]')).toHaveAttribute('aria-pressed', 'true');
        const syncedAt = (await fixture(page)).lastSyncedAt || 0;
        await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 60000)); // so the new sync's time differs
        await showTab(page, 'setup');
        await page.fill('#sleeperUsername', 'mds_test');
        await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE_ID);
        await page.click('#mainSyncBtn');
        await page.waitForLoadState('networkidle');
        await expect.poll(async () => (await fixture(page)).lastSyncedAt).toBeGreaterThan(syncedAt);
        expect((await fixture(page)).rosterSortSeason).toBe(true);

        // Back to Dynasty.
        await patchLeagues(page, { 'Fixture League': { leagueType: 'dynasty' } });
        await showTab(page, 'roster');
        await page.locator('#rosterSort [data-sort="dynasty"]').click();
        await expect.poll(async () => (await rosterNames(page))[0]).toBe("Ja'Marr Chase");
        expect((await fixture(page)).rosterSortSeason).toBe(false);
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    for (const kind of ['redraft', 'dynasty']) {
        test(`a ${kind === 'redraft' ? 'redraft league' : 'dynasty league with no In-Season set'} looks as before`, async ({ page }) => {
            const { state } = await setUp(page, kind);
            await runTrade(page, ['Nico Collins'], ["Ja'Marr Chase"]);
            const out = page.locator('#tradeOutput');
            await expect(out.locator('[data-trade-dual-headline]')).toHaveCount(0);
            await expect(out.locator('.mls-trade-verdict-dual')).toHaveCount(0);
            await expect(out.locator('.trade-verdict-banner')).toHaveCount(1);
            await expect(out.locator('.trade-verdict-banner')).toContainText('By Your Rankings');
            await expect(out.locator('.mls-trade-row-now')).toHaveCount(0);
            await expect(out.locator('.mls-trade-row').filter({ hasText: 'Nico Collins' }).locator('.mls-trade-row-meta')).toContainText('ROS 12');
            await expect(out.locator('[data-trade-fair]')).toContainText(/by Your Rankings/);

            await showTab(page, 'roster');
            await expect(page.locator('#rosterSort')).toHaveCount(0);
            await expect(page.locator('#rosterList .mls-roster-dual')).toHaveCount(0);
            await expect(page.locator('#rosterList .mls-gap-chip')).toHaveCount(0);
            await expect(page.locator('#rosterList .mls-roster-source')).toHaveCount(0);
            await expect(rowFor(page, "Ja'Marr Chase").locator('.mls-rank-badge')).toHaveText('Ovr: #1 | Pos: #1');
            await expectClean(page, state);
        });
    }
});
