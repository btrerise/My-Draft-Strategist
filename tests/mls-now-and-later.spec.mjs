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
// Derrick Henry (dynasty RB5) is left out of the In-Season set: he counts as far below it (Long-term > now).
const SEASON_CSV = csvOf([...THEIRS, ...MINE.filter(n => n !== 'Derrick Henry')], { "Ja'Marr Chase": 20, 'Garrett Wilson': 3 });

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

async function uploadRos(page, name, csv, count = 24) {
    await openRosCard(page);
    await page.locator('#rosRankingSetSelect').selectOption('__new__');
    await page.fill('#rosNewSetName', name);
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
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
    await uploadRos(page, 'Redraft ROS', SEASON_CSV, 23);
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
        // Two tiles, Now (In-Season) and Long-term (Dynasty), side by side at every width (round 4); they replace the
        // one-sentence headline, which stays as the group's label for screen readers.
        const card = out.locator('[data-trade-verdict-dual]');
        await expect(card).toHaveCount(1);
        await expect(card).toHaveAttribute('aria-label', `Wins now (+${fmt(nowDiff)}), costs long-term (\u2212${fmt(-laterDiff)})`);
        await expect(out.locator('[data-trade-dual-headline]')).toHaveCount(0);
        const tiles = card.locator('.mls-trade-tile');
        await expect(tiles).toHaveCount(2);
        await expect(tiles.nth(0)).toHaveClass(/verdict-favor-you/);
        await expect(tiles.nth(0).locator('.mls-trade-tile-label')).toContainText('Now');
        await expect(tiles.nth(0).locator('.mls-trade-tile-result')).toHaveText('Favors You');
        await expect(tiles.nth(0).locator('.mls-trade-tile-diff')).toContainText(`+${fmt(nowDiff)} pts`);
        await expect(tiles.nth(0).locator('.mls-trade-tile-totals')).toHaveText(`Get ${fmt(value(6))} · Give ${fmt(value(14))}`);
        await expect(tiles.nth(1)).toHaveClass(/verdict-favor-them/);
        await expect(tiles.nth(1).locator('.mls-trade-tile-label')).toContainText('Long-term');
        await expect(tiles.nth(1).locator('.mls-trade-tile-result')).toHaveText('Favors Them');
        await expect(tiles.nth(1).locator('.mls-trade-tile-diff')).toContainText(`\u2212${fmt(-laterDiff)} pts`);
        await expect(tiles.nth(1).locator('.mls-trade-tile-totals')).toHaveText(`Get ${fmt(value(12))} · Give ${fmt(value(1))}`);
        // Side by side from tablet width; on a phone one over the other (round 5), each short: verdict on the label's line.
        const [t0, t1] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()];
        if (test.info().project.name === 'phone') {
            expect(t1.y).toBeGreaterThan(t0.y + t0.height - 1);
            expect(t0.height).toBeLessThan(90);
            const [label, result] = [await tiles.nth(0).locator('.mls-trade-tile-label').boundingBox(), await tiles.nth(0).locator('.mls-trade-tile-result').boundingBox()];
            expect(result.x).toBeGreaterThan(label.x + label.width);
            expect(Math.abs((result.y + result.height / 2) - (label.y + label.height / 2))).toBeLessThan(8);
        } else {
            expect(Math.abs(t0.y - t1.y)).toBeLessThan(1);
            expect(t1.x).toBeGreaterThan(t0.x + t0.width - 1);
        }

        // Each row: dynasty and In-Season ranks, the dynasty value with the In-Season one under it.
        const collins = out.locator('.mls-trade-row').filter({ hasText: 'Nico Collins' });
        await expect(collins.locator('.mls-trade-row-meta')).toContainText('Dyn 12');
        await expect(collins.locator('.mls-trade-row-meta')).toContainText('Now 6');
        await expect(collins.locator('.mls-trade-row-value .mls-stat-value')).toHaveText(`Dyn${fmt(value(12))}`);
        await expect(collins.locator('.mls-trade-row-dyn')).toHaveText('Dyn');
        await expect(collins.locator('.mls-trade-row-now')).toHaveText(`Now ${fmt(value(6))}`);

        // "To make it fair" goes by the dynasty value, and says so.
        const fair = out.locator('[data-trade-fair]');
        await expect(fair).toHaveCount(1);
        await expect(fair).toContainText("they'd add");
        await expect(fair).toContainText(/by your dynasty rankings/);
        // Its switch (round 3): by In-Season this trade favors you, so you'd add; then back.
        const basis = fair.locator('[data-action="setFairBasis"]');
        await expect(basis).toHaveText(['Dynasty', 'In-Season']);
        await expect(basis.nth(0)).toHaveAttribute('aria-pressed', 'true');
        await basis.nth(1).click();
        await expect(fair.locator('[data-basis="season"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(fair).toContainText("you'd add");
        await expect(fair).toContainText(/by your In-Season rankings/);
        await expect(fair.locator('[data-basis="season"]')).toBeFocused();
        await fair.locator('[data-basis="dynasty"]').click();
        await expect(fair).toContainText("they'd add");

        // Power Rankings after the trade (round 4): no headline (the tiles have the value), short labeled lines, and the
        // source line in "How this is worked out".
        const impact = out.locator('[data-trade-impact]');
        await expect(impact.locator('.mls-trade-impact-headline, .mls-trade-impact-via')).toHaveCount(0);
        await expect(impact.locator('.mls-trade-impact-summary:not(details *)')).toHaveCount(0); // their team's fold keeps its own
        await expect(impact.locator('.mls-trade-impact-lines').first().locator('dt')).toHaveText(['Lineup', 'Rooms', 'Future']);
        await expect(impact.locator('.mls-trade-impact-lines dd').first()).toContainText(' of 2');
        await expect(impact.locator('[data-about]').first()).toHaveText('Which rankings: Start and value by In-Season; Ovr, position rooms and Future by dynasty.');

        // Phones: the rows and the verdicts fit 375px, and both banners' (i) tooltips open on screen (as
        // tooltips-onscreen.spec.mjs checks the others).
        expect(await noSideScroll(page)).toBe(true);
        for (const icon of await card.locator('.tooltip-icon').all()) {
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
        // The two tiles (round 4), as on screen.
        expect(text).toMatch(/Now[\s\S]*Favors You[\s\S]*Long-term[\s\S]*Favors Them/i);
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
            "Position ranks by your In-Season rankings (Redraft ROS) and your dynasty rankings (Dynasty SF). Tap or hover over a player's ranks for his overall ranks.");

        const chase = rowFor(page, "Ja'Marr Chase");
        // One badge, position ranks only (round 3); the overall ranks in its title.
        await expect(chase.locator('.mls-rank-dual')).toHaveText('In-Season WR20 | Dyn WR1');
        // The overall ranks are in the badge's tooltip, the site's own (round 4): tap on a phone, hover on a computer.
        await expect(chase.locator('.mls-rank-dual-tip')).toHaveAttribute('data-tt', '');
        await chase.locator('.mls-rank-dual-tip').evaluate(el => el.scrollIntoView({ block: 'center' })); // clear of the tab bar
        await chase.locator('.mls-rank-dual-tip').click();
        const tip = chase.locator('.mls-rank-dual-tip .tooltip-text');
        await expect(tip).toBeVisible();
        await expect(tip).toHaveText('In-Season: WR20, #14 overallDynasty: WR1, #1 overall');
        // Nothing clips or covers it (the row's info box clips; it lets the open tooltip out).
        // (Tooltips ignore the pointer, so it's switched on just to ask what's on top at its centre.)
        expect(await tip.evaluate(t => {
            t.style.pointerEvents = 'auto';
            const r = t.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            t.style.pointerEvents = '';
            return !!at && t.contains(at);
        })).toBe(true);
        const tipBox = await tip.boundingBox();
        expect(tipBox.x).toBeGreaterThanOrEqual(-0.5);
        expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 0.5);
        await chase.locator('.mls-rank-dual-tip').click();
        await expect(tip).toBeHidden();
        await expect(chase.locator('.mls-gap-chip')).toHaveText('Long-term > now');
        await expect(chase.locator('.mls-gap-chip')).toHaveClass(/is-later/);
        const wilson = rowFor(page, 'Garrett Wilson');
        await expect(wilson.locator('.mls-gap-chip')).toHaveText('Now > long-term');
        // Players whose two ranks are close get none.
        await expect(rowFor(page, 'Justin Jefferson').locator('.mls-gap-chip')).toHaveCount(0);
        // Missing from one set counts as far below it: Henry, dynasty RB5, isn't in the In-Season set.
        const henry = rowFor(page, 'Derrick Henry');
        await expect(henry.locator('.mls-rank-dual')).toHaveText('In-Season UR | Dyn RB5');
        await expect(henry.locator('.mls-gap-chip')).toHaveText('Long-term > now');
        await expect(henry.locator('.mls-gap-chip')).toHaveAttribute('data-tip', /have him at RB5 and your In-Season rankings leave him out/);
        await expect(page.locator('#rosterList .mls-gap-chip')).toHaveCount(3);
        await expect(page.locator('#rosterList [data-season-hint]')).toHaveCount(0);
        // No "Ovr | Pos" badge any more: the two-set one replaces it.
        await expect(page.locator('#rosterList .mls-rank-badge:not(.mls-rank-dual)')).toHaveCount(0);

        // The chip explains itself on tap.
        await wilson.locator('.mls-gap-chip').click();
        await expect(page.locator('.toast-message').filter({ hasText: 'In-Season WR3, dynasty WR30' })).toBeVisible();

        // Phones: the ranks fit a 375px row, and rows are at most two lines under the name (round 3: they were four).
        expect(await noSideScroll(page)).toBe(true);
        const overflow = await page.locator('#rosterList .roster-item').evaluateAll(items => items.flatMap(it => {
            const r = it.getBoundingClientRect();
            return [...it.querySelectorAll('.mls-player-row-meta > *')].filter(b => b.getBoundingClientRect().right > r.right + 0.5)
                .map(b => `${it.querySelector('.player-name-wrap').textContent.trim()}: ${b.textContent.trim()}`);
        }));
        expect(overflow).toEqual([]);
        // Every row the same shape: on phones team / chips / SoS, then the badge on a line of its own; on desktop one line.
        // A gap chip that doesn't fit beside the badge may take a third line on a phone.
        const shapes = await page.locator('#rosterList .roster-item .mls-player-row-meta').evaluateAll(els => els.map(e => {
            const team = e.querySelector(':scope > .badge').getBoundingClientRect(), badge = e.querySelector('.mls-rank-dual').getBoundingClientRect();
            return { below: badge.top >= team.bottom - 1, oneLine: e.querySelector('.mls-rank-parts.is-stacked') === null };
        }));
        const phone = test.info().project.name === 'phone';
        expect(shapes.every(sh => sh.below === phone), JSON.stringify(shapes)).toBe(true);

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
            await expect(out.locator('[data-trade-verdict-dual]')).toHaveCount(0);
            await expect(out.locator('.mls-trade-row-dyn, [data-action="setFairBasis"]')).toHaveCount(0);
            await expect(out.locator('.trade-verdict-banner')).toHaveCount(1);
            await expect(out.locator('.trade-verdict-banner')).toContainText('By Your Rankings');
            await expect(out.locator('.mls-trade-row-now')).toHaveCount(0);
            await expect(out.locator('.mls-trade-row').filter({ hasText: 'Nico Collins' }).locator('.mls-trade-row-meta')).toContainText('ROS 12');
            await expect(out.locator('[data-trade-fair]')).toContainText(/by Your Rankings/);
            // A dynasty league with no In-Season set says how to get the second verdict and both ranks (owner's report:
            // a restored backup opened on such a league, and S24 looked broken). A redraft league doesn't.
            const hint = kind === 'dynasty' ? 1 : 0;
            await expect(out.locator('[data-season-hint]')).toHaveCount(hint);
            if (hint) await expect(out.locator('[data-season-hint]')).toHaveText('Choose In-Season rankings for this league on the Roster tab to get a this-season verdict beside your dynasty one.');

            await showTab(page, 'roster');
            await expect(page.locator('#rosterSort')).toHaveCount(0);
            await expect(page.locator('#rosterList .mls-rank-dual')).toHaveCount(0);
            await expect(page.locator('#rosterList .mls-gap-chip')).toHaveCount(0);
            await expect(page.locator('#rosterList .mls-roster-source')).toHaveCount(0);
            await expect(page.locator('#rosterList [data-season-hint]')).toHaveCount(hint);
            if (hint) await expect(page.locator('#rosterList [data-season-hint]')).toHaveText("No In-Season rankings in this league, so these are your dynasty ranks alone. Choose In-Season rankings in the card above to see this season's ranks beside them.");
            await expect(rowFor(page, "Ja'Marr Chase").locator('.mls-rank-badge')).toHaveText('Ovr: #1 | Pos: #1');
            await expectClean(page, state);
        });
    }
});

test('a dynasty league with no In-Season set offers the set your redraft leagues use, and one tap shows both ranks', async ({ page }) => {
    const { state, ids } = await setUp(page, 'dynasty');
    // A redraft league on "Redraft ROS", so the offer has a set to name.
    await page.evaluate(async (id) => {
        const { State } = await import('/js/mls/state.js');
        State.leagues.push({ leagueId: 'manual_redraft', name: 'Redraft Pals', roster: [], rosRankingSetId: id, leagueType: 'redraft' });
        localStorage.setItem('mls_leagues', JSON.stringify(State.leagues));
    }, ids.season);
    await callApp(page, 'switchActiveLeague', FIXTURE_LEAGUE_ID);
    await showTab(page, 'roster');
    const hint = page.locator('#rosterList [data-season-hint]');
    await expect(hint).toContainText('Your redraft leagues use Redraft ROS: Use it here to see this season\'s ranks beside them.');
    await hint.locator('[data-action="useSeasonOffer"]').click();
    await expect(page.locator('#rosterList .mls-rank-dual').first()).toBeVisible();
    await expect(page.locator('#rosterList [data-season-hint]')).toHaveCount(0);
    expect((await fixture(page)).seasonRankingSetId).toBe(ids.season);
    await expectClean(page, state);
});
