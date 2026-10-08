// Lineup Strategist: the Lineup and Roster tabs show the same position and FLEX ranks as the Waiver Wire
// Assistant (improvements F6). With a single rankings file that has no Pos Rank column (one overall list with a
// Pos column, the common upload), the parser stores each player's overall rank as his position and FLEX rank
// (its "Fallback" branch). The Waiver Wire re-derives them per position group (buildRankDisplayIndex), so
// Derrick Henry (overall #15) reads RB5 there, while the Roster and Lineup tabs printed "Pos: #15". They now take
// their numbers from js/mls/rankings/displayRanks.js. Display only: the optimizer still reads the raw ranks, so
// who starts is unchanged (STARTERS below was recorded on main before the fix). Files with their own position
// ranks (a Pos Rank column, per-position uploads) keep their numbers; a Pos Rank column's FLEX rank, which is
// still the overall one, is derived too. Trade Finder's Positional Rank basis
// compared the overall rank against the market's position rank; it now uses the same position ranks.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const rankBadge = (page, scope, name) =>
    page.locator(scope).locator('.mls-player-row-info').filter({ hasText: name }).locator('.mls-rank-badge');

// The same file with a Pos Rank column (as tests/mls-waiver-tiers.spec.mjs builds it).
const POSRANK_CSV = (() => {
    const seen = {};
    const [header, ...rows] = WAIVER_RANKINGS_CSV.trim().split('\n');
    return [header + ',Pos Rank', ...rows.map(l => { const pos = l.split(',')[2]; seen[pos] = (seen[pos] || 0) + 1; return `${l},${seen[pos]}`; })].join('\n');
})();

// Name -> position, from the CSV (the stored rankings don't carry positions).
const POS = Object.fromEntries(WAIVER_RANKINGS_CSV.trim().split('\n').slice(1).map(l => { const c = l.split(','); return [c[1], c[2]]; }));

// The fixture league's starters with rankings-waivers.csv as ROS and Weekly, slot by slot, recorded on main
// before this change: the fix must not move anyone.
const STARTERS = "QB1:Josh Allen, RB1:Derrick Henry, RB2:-, WR1:Ja'Marr Chase, WR2:Justin Jefferson, TE1:Brock Bowers, FLEX1:CeeDee Lamb, K1:Justin Tucker, DEF1:Baltimore Ravens";
const BENCH = 'Puka Nacua, Amon-Ra St. Brown, Trey McBride, A.J. Brown, Garrett Wilson, George Kittle';

// The saved lineup: slots, bench order, and the raw ranks the optimizer read for Derrick Henry.
async function savedLineup(page) {
    return page.evaluate(() => {
        const starters = JSON.parse(localStorage.getItem('mls_manual_starters'));
        const bench = JSON.parse(localStorage.getItem('mls_manual_bench'));
        const league = Object.keys(starters)[0];
        const all = [...starters[league].map(s => s.player), ...bench[league]];
        const henry = all.find(p => p && p.name === 'Derrick Henry');
        return {
            starters: starters[league].map(s => `${s.slot}:${s.player ? s.player.name : '-'}`).join(', '),
            bench: bench[league].map(p => p.name).join(', '),
            henry: { posRank: henry.posRank, flexRank: henry.flexRank }
        };
    });
}

// Uploads a CSV as one kind of rankings only ('ros' or 'weekly').
async function uploadOne(page, kind, csv, count) {
    await page.setInputFiles(`#${kind}FileInput`, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

// Rewrites both saved sets the way per-position uploads (no FLEX file) store them: each player's rank and
// position rank are his place in his position's file, and there's no FLEX rank. Every position rank is doubled,
// a stand-in for players in those files whose position the app can't look up: they must stay as the file says,
// not be renumbered 1..N the way a single file's are.
async function storePerPositionRanks(page) {
    await page.evaluate((POS) => {
        for (const key of ['mls_ranking_sets_ros', 'mls_ranking_sets_weekly']) {
            const sets = JSON.parse(localStorage.getItem(key));
            for (const set of sets) {
                const seen = {};
                for (const r of set.data.sort((a, b) => a.rank - b.rank)) {
                    const pos = POS[r.name];
                    seen[pos] = (seen[pos] || 0) + 1;
                    Object.assign(r, { rank: seen[pos] * 2, posRank: seen[pos] * 2, posTier: r.tier, flexRank: 999, flexTier: null });
                }
            }
            localStorage.setItem(key, JSON.stringify(sets));
        }
    }, POS);
    await page.reload();
}

// A FantasyCalc answer listing the file's players in `names` order (best first), with their positions.
function stubMarket(page, names) {
    return page.route(/^https:\/\/api\.fantasycalc\.com\//, (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(names.map((name, i) => ({ player: { name, position: POS[name] }, overallRank: i + 1 })))
    }));
}

test.describe('Lineup Strategist: position ranks on the Lineup and Roster tabs', () => {
    test('a single file shows the Waiver Wire\'s position and FLEX ranks; who starts is unchanged', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);

        // Derrick Henry: overall #15 (tier 3), the 5th RB and the 13th RB/WR/TE in the file.
        await showTab(page, 'roster');
        await expect(rankBadge(page, '#rosterList', 'Derrick Henry')).toHaveText('Ovr: #15 (T3) | Pos: #5 (T3)');
        await expect(rankBadge(page, '#rosterList', 'Josh Allen')).toHaveText('Ovr: #13 (T3) | Pos: #1 (T3)');
        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        // Weekly is loaded, so the second number is the FLEX rank (RB/WR/TE only).
        await expect(rankBadge(page, '#lineupTab', 'Derrick Henry')).toHaveText('Pos: #5 (T3) | Flex: #13 (T3)');
        await expect(rankBadge(page, '#lineupTab', 'Josh Allen')).toHaveText('Pos: #1 (T3)');
        await expect(rankBadge(page, '#lineupTab', 'George Kittle')).toHaveText('Pos: #3 (T4) | Flex: #19 (T4)');
        await expect(rankBadge(page, '#lineupTab', 'A.J. Brown')).toHaveText('Pos: #9 (T3) | Flex: #16 (T3)');
        // The same numbers the Waiver Wire shows (tests/mls-waiver-tiers.spec.mjs: "Wk Flex #19 · T4" for Kittle).

        // Who starts, the bench order, and the optimizer's inputs are as on main.
        const lineup = await savedLineup(page);
        expect(lineup.starters).toBe(STARTERS);
        expect(lineup.bench).toBe(BENCH);
        expect(lineup.henry).toEqual({ posRank: 15, flexRank: 15 });

        await expectClean(page, state);
    });

    test('ROS only: the position rank is derived and the second number stays the Overall rank', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await uploadOne(page, 'ros', WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        await expect(rankBadge(page, '#lineupTab', 'Derrick Henry')).toHaveText('Pos: #5 (T3) | Overall: #15 (T3)');
        await expect(rankBadge(page, '#lineupTab', 'Josh Allen')).toHaveText('Pos: #1 (T3) | Overall: #13 (T3)');
        await showTab(page, 'roster');
        await expect(rankBadge(page, '#rosterList', 'Derrick Henry')).toHaveText('Ovr: #15 (T3) | Pos: #5 (T3)');
        expect((await savedLineup(page)).starters).toBe(STARTERS);
        await expectClean(page, state);
    });

    test('files with their own position ranks keep their numbers', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);

        // A Pos Rank column, with RB numbers a renumbering would change (every RB's doubled): shown as the column
        // says. Its FLEX rank is still the overall one, so Flex is derived as the Waiver Wire shows it (#13, not #15).
        const doubledRbs = POSRANK_CSV.split('\n').map(l => {
            const c = l.split(',');
            if (c[2] === 'RB') c[6] = String(Number(c[6]) * 2);
            return c.join(',');
        }).join('\n');
        await loadMlsRankings(page, doubledRbs, 30);
        await showTab(page, 'roster');
        await expect(rankBadge(page, '#rosterList', 'Derrick Henry')).toHaveText('Ovr: #15 (T3) | Pos: #10 (T3)');
        await expect(rankBadge(page, '#rosterList', 'Josh Allen')).toHaveText('Ovr: #13 (T3) | Pos: #1 (T3)');
        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        await expect(rankBadge(page, '#lineupTab', 'Derrick Henry')).toHaveText('Pos: #10 (T3) | Flex: #13 (T3)');

        // Per-position files, position ranks with gaps: shown as stored (Henry RB10, Allen QB2), not renumbered.
        await storePerPositionRanks(page);
        await showTab(page, 'roster');
        await expect(rankBadge(page, '#rosterList', 'Derrick Henry')).toHaveText('Ovr: #10 (T3) | Pos: #10 (T3)');
        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        await expect(rankBadge(page, '#lineupTab', 'Derrick Henry')).toHaveText('Pos: #10 (T3)');
        await expect(rankBadge(page, '#lineupTab', 'Josh Allen')).toHaveText('Pos: #2 (T3)');
        await expectClean(page, state);
    });

    test('Trade Finder\'s Positional Rank basis compares position ranks with a single file', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        const names = Object.keys(POS);
        // The market agrees with the file, except that it has Derrick Henry first: RB1 against your RB5.
        await stubMarket(page, ['Derrick Henry', ...names.filter(n => n !== 'Derrick Henry')]);
        await seedMls(page);
        await uploadOne(page, 'ros', WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'scout');
        await page.click('#scoutTab #fetchMarketValueBtn');
        await expect(page.locator('#marketSuccessMsg')).toContainText('Pulled Successfully');
        await page.selectOption('#disconnectRankBasis', 'positional');
        await page.fill('#disconnectThreshold', '2');
        await page.click('[data-action="runMarketDisconnectAnalysis"]');
        // Only Henry is 2+ position spots apart; with overall ranks as position ranks, most of the file was.
        const cards = page.locator('#marketDisconnectOutput .scout-result-card');
        await expect(cards).toHaveCount(1);
        await expect(cards.first()).toContainText('Derrick Henry');
        await expect(cards.first()).toContainText('Your Board: RB #5 (T3) · Ovr: #15 (T3)');
        await expect(cards.first()).toContainText('Market: RB #1');
        await expect(cards.first()).toContainText('-4 Edge');
        await expectClean(page, state);
    });
});

// The Waiver Wire with per-position uploads (follow-up to F6, owner's request). Each position's file numbers its
// own players, so rank equals posRank and there's no FLEX rank. buildRankDisplayIndex took that for a single
// file's fallback and renumbered each position 1..N from the positions it could look up, so a player the app
// can't place (a name Sleeper doesn't match) dropped out and everyone below him moved up a spot.
const waiverOut = (page) => page.locator('#waiverOutput');
const waiverCard = (page, name) => waiverOut(page).locator('.mls-scan-card').filter({ hasText: name });

async function runAutoFindRoster(page, pos) {
    await showTab(page, 'scout');
    await page.locator('#waiverScanBasis').selectOption('ros');
    await callApp(page, 'setWaiverPos', pos);
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', 'roster');
    await waiverOut(page).evaluate(el => { el.innerHTML = ''; });
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    await expect(waiverOut(page).locator('.mls-scan-summary')).toBeVisible();
}

// Both saved sets as per-position uploads store them, untiered, with the RB file in `rbOrder` (names; anything
// not in the CSV is a player no position source knows). Other positions keep the CSV's order.
async function storePerPositionFiles(page, rbOrder) {
    await page.evaluate(({ POS, rbOrder }) => {
        for (const key of ['mls_ranking_sets_ros', 'mls_ranking_sets_weekly']) {
            const sets = JSON.parse(localStorage.getItem(key));
            for (const set of sets) {
                const rows = set.data.filter(r => POS[r.name] !== 'RB').sort((a, b) => a.rank - b.rank);
                const seen = {};
                for (const r of rows) seen[POS[r.name]] = r.posRank = r.rank = (seen[POS[r.name]] || 0) + 1;
                const byName = Object.fromEntries(set.data.map(r => [r.name, r]));
                const rbs = rbOrder.map((name, i) => Object.assign(
                    byName[name] || { name, cleanName: 'zz-unplaced-' + i },
                    { rank: i + 1, posRank: i + 1 }));
                set.data = [...rows, ...rbs].map(r => Object.assign(r, { tier: null, posTier: null, flexRank: 999, flexTier: null }));
            }
            localStorage.setItem(key, JSON.stringify(sets));
        }
    }, { POS, rbOrder });
    await page.reload();
}

test.describe('Lineup Strategist: the Waiver Wire with per-position uploads', () => {
    test('keeps the files\' position ranks when a player\'s position is unknown', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        // James Cook (a free agent) RB4 and Derrick Henry (your only RB) RB7: three spots, an upgrade without
        // tiers. "Unplaced Back" at RB5 is in no league, Sleeper or market data.
        await storePerPositionFiles(page, ['Bijan Robinson', 'Jahmyr Gibbs', 'Saquon Barkley', 'James Cook',
            'Unplaced Back', 'Christian McCaffrey', 'Derrick Henry', "De'Von Achane", 'Kyren Williams', 'Chase Brown']);

        await runAutoFindRoster(page, 'RB');
        await expect(waiverOut(page).locator('.mls-scan-benchmark')).toContainText('Your weakest RB is Derrick Henry (ROS RB7).');
        await expect(waiverCard(page, 'James Cook').locator('.mls-scan-verdict')).toContainText('Upgrade over Derrick Henry');
        await expect(waiverCard(page, 'James Cook').locator('.mls-verdict-nums')).toHaveText('ROS Pos: Cook RB4, Henry RB7');
        await callApp(page, 'setWaiverMode', 'top');
        await expect(waiverOut(page).locator('.mls-ta-row').filter({ hasText: 'James Cook' }).locator('.mls-ta-pos')).toHaveText('RB4');

        // The Roster tab shows the same number.
        await showTab(page, 'roster');
        await expect(rankBadge(page, '#rosterList', 'Derrick Henry')).toHaveText('Ovr: #7 | Pos: #7');
        await expectClean(page, state);
    });

    test('What changed\'s week baseline keeps the FLEX rank, so it is judged like the upload', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        // [name, cleanName, rank, posRank, posTier, tier, flexRank]: Henry is #15 overall, FLEX rank 15 as stored.
        const henry = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_ranking_sets_weekly'))[0]
            .weekBaseline.rows.find(r => r[0] === 'Derrick Henry'));
        expect(henry.slice(2)).toEqual([15, 15, 3, 3, 15]);
        await expectClean(page, state);
    });
});

// Phones: the Lineup tab's rank badge ("Pos: #5 (T3) | Flex: #13 (T3)") was one unbreakable piece, wider than the
// space beside the projection and buttons, and the row cut it off ("Flex: #13 (T"). It now splits onto two lines at
// the "|" when it doesn't fit (owner's choice A), each part kept whole, with no bar at a line's start or end, and
// its box shrinks to the text (owner's go-ahead after a review as a user).
test.describe('Lineup Strategist: the Lineup tab\'s rank badge fits its row', () => {
    test('nothing is cut off; one line on desktop, two parts on phones', async ({ page }, info) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);
        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        await expect(rankBadge(page, '#lineupTab', 'Derrick Henry')).toHaveText('Pos: #5 (T3) | Flex: #13 (T3)');
        const rows = await page.locator('#lineupTab .lineup-slot .mls-player-row-info').evaluateAll(infos => infos.map(info => {
            const badge = info.querySelector('.mls-rank-badge');
            const team = info.querySelector('.mls-player-row-meta .badge');
            const b = badge.getBoundingClientRect(), r = info.getBoundingClientRect();
            const parts = [...badge.querySelectorAll('.mls-rank-part')].map(p => p.getBoundingClientRect());
            const bars = [...badge.querySelectorAll('.mls-rank-bar')].map(bar => {
                const x = bar.getBoundingClientRect();
                // A bar is shown only between two parts on the same line.
                return { visible: getComputedStyle(bar).visibility !== 'hidden' && x.width > 0 && x.left >= b.left, top: x.top };
            });
            return {
                name: info.querySelector('.player-name-wrap').textContent.trim(), text: badge.textContent,
                cutOff: b.right > r.right + 0.5 || badge.scrollWidth > badge.clientWidth + 1,
                lines: parts.length ? new Set(parts.map(p => Math.round(p.top))).size : 1,
                // The rank badge has a border the team badge doesn't; two lines would be about twice its height.
                oneLineHeight: b.height < team.getBoundingClientRect().height * 1.6,
                parts: parts.length, bars, partTops: parts.map(p => Math.round(p.top))
            };
        }));
        for (const row of rows) expect(row.cutOff, `${row.name}: ${row.text}`).toBe(false);
        const henry = rows.find(r => r.name.startsWith('Derrick Henry'));
        expect(henry.parts).toBe(2);
        if (info.project.name === 'desktop') {
            for (const row of rows) expect(row.oneLineHeight, row.name).toBe(true);
            expect(henry.bars[0].visible).toBe(true);
        } else {
            // Henry's two parts sit on two lines, and the bar between them isn't shown at either line's edge.
            expect(henry.lines).toBe(2);
            expect(henry.bars[0].visible).toBe(false);
        }

        // A split badge's box hugs its text: no wider than its wider half plus the badge's own padding and border.
        // Widening the window puts it back on one line; narrowing it splits it again.
        const henryBadge = rankBadge(page, '#lineupTab', 'Derrick Henry');
        const fit = () => henryBadge.evaluate(badge => {
            const parts = [...badge.querySelectorAll('.mls-rank-part')].map(p => p.getBoundingClientRect());
            const cs = getComputedStyle(badge);
            const chrome = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, k) => sum + parseFloat(cs[k]), 0);
            return {
                lines: new Set(parts.map(p => Math.round(p.top))).size,
                slack: badge.getBoundingClientRect().width - chrome - Math.max(...parts.map(p => p.width))
            };
        });
        if (info.project.name === 'phone') {
            expect((await fit()).slack).toBeLessThanOrEqual(1);
            await page.setViewportSize({ width: 1280, height: 900 });
            await expect.poll(async () => (await fit()).lines).toBe(1);
            await page.setViewportSize({ width: 390, height: 844 });
            await expect.poll(async () => (await fit()).lines).toBe(2);
            // The refit runs a frame after the resize (fitRankBadges via the ResizeObserver), so wait for it.
            await expect.poll(async () => (await fit()).slack).toBeLessThanOrEqual(1);
        }
        await expectClean(page, state);
    });
});
