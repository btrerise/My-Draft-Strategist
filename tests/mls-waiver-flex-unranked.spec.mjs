// Auto-Find's FLEX comparison when a player has a position rank but no FLEX rank (improvements F8). The owner's case
// (week 6, Weekly, Auto-Find, Starting Lineup, FLEX): Treylon Burks was WR69 (T13) in the Weekly rankings but not in
// the file's FLEX list. DeMario Douglas (Wk Flex #98) read "Replaces Treylon Burks (your FLEX)" with "Wk Flex: Douglas
// #98, Burks unranked", and Jake Ferguson (TE19, T7, no FLEX rank) "Replaces Treylon Burks · 6 tiers up". The verdicts
// are right (a FLEX slot goes by FLEX rank, then any rank, then projections: js/mls/lineup/flexChoice.js); the words
// weren't. Burks is ranked, just not in that list, and "6 tiers up" was Ferguson's TE tier against Burks's WR tier:
// buildRankDisplayIndex filled a missing FLEX tier with the player's `tier`, which for a player outside the FLEX list
// is his position list's tier (js/shared/rankings/parse.js sets rank and tier from his position file).
//
// The fixture league with one RB slot and one FLEX slot. Weekly rankings shaped as per-position files plus a FLEX file
// (the FLEX file without tiers, as current exports have): the FLEX list holds Chase, Jefferson, Henry, Bowers and the
// free agent Jaxon Smith-Njigba (#5). CeeDee Lamb (WR30, T8) and the free agent Sam LaPorta (TE5, T2) aren't in it, and
// every other RB/WR/TE is unranked, so Lamb is your FLEX. Smith-Njigba replaces him by FLEX rank; LaPorta by projection
// (20 against 10; without projections, by position rank, the same answer).
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, FIXTURE_LEAGUE_ID } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));

// [name, posRank, posTier, flexRank or null]. Shaped as the parser stores per-position uploads with the FLEX file read
// first: a FLEX-list player's rank and tier are his FLEX rank and (empty) FLEX tier; anyone else's are his position's.
const RANKS = [
    ['Josh Allen', 1, 1, null], ['Derrick Henry', 5, 2, 3],
    ["Ja'Marr Chase", 1, 1, 1], ['Justin Jefferson', 2, 1, 2], ['Brock Bowers', 1, 1, 4],
    ['Jaxon Smith-Njigba', 20, 5, 5], ['CeeDee Lamb', 30, 8, null], ['Sam LaPorta', 5, 2, null],
];
// Sleeper ids: projected points this week (LaPorta, Lamb).
const PROJ = { 9480: 20, 6786: 10 };

const out = (page) => page.locator('#waiverOutput');
const scanCard = (page, name) => out(page).locator('.mls-scan-card').filter({ hasText: name });

async function setup(page) {
    await page.route(/sleeper\.app\/v1\/league\/\d+$/, route => {
        const league = fixture('league.json');
        return route.fulfill({ json: { ...league, roster_positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'] } });
    });
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/2$/, route => {
        const proj = fixture('projections-2026-2.json');
        Object.entries(PROJ).forEach(([id, pts]) => { proj[id] = { ...proj[id], pts_ppr: pts, pts_half_ppr: pts, pts_std: pts }; });
        return route.fulfill({ json: proj });
    });
    await seedMls(page);
    await page.evaluate(async ({ ranks, leagueId }) => {
        const { normalizeName } = await import('/js/shared/names.js');
        const data = ranks.map(([name, posRank, posTier, flexRank]) => ({
            name, cleanName: normalizeName(name), posRank, posTier,
            flexRank: flexRank ?? 999, flexTier: null,
            rank: flexRank ?? posRank, tier: flexRank ? null : posTier,
        }));
        const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
        const league = leagues.find(l => l.leagueId === leagueId);
        Object.assign(league, { weeklyRankingSetId: null, weeklyRankings: data, weeklyRankingsUpdatedAt: Date.now() });
        localStorage.setItem('mls_leagues', JSON.stringify(leagues));
    }, { ranks: RANKS, leagueId: FIXTURE_LEAGUE_ID });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await showTab(page, 'lineup');
    await expect.poll(() => page.evaluate(async () => {
        const { lineupProjectionsLoaded } = await import('/js/mls/lineup/gameInfo.js');
        return lineupProjectionsLoaded();
    })).toBe(true);
    await page.locator('#lineupTab [data-action="optimizeLineup"]').click();
}

async function runAutoFind(page, pos) {
    await showTab(page, 'scout');
    await page.locator('#waiverScanBasis').selectOption('weekly');
    await callApp(page, 'setWaiverPos', pos);
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', 'lineup');
    await out(page).evaluate(el => { el.innerHTML = ''; });
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    await expect(out(page).locator('.mls-scan-summary')).toBeVisible();
}

async function runCheckList(page, compare, names) {
    await showTab(page, 'scout');
    await page.locator('#waiverScanBasis').selectOption('weekly');
    await callApp(page, 'setWaiverMode', 'list');
    await callApp(page, 'setWaiverCompare', compare);
    await callApp(page, 'setWaiverPos', 'FLEX');
    await out(page).evaluate(el => { el.innerHTML = ''; });
    await page.fill('#waiverInput', names.join('\n'));
    await page.click('#waiverScanBtn');
    await expect(out(page).locator('.scout-result-card').first()).toBeVisible();
}

// Who's listed, in order, with each card's pill and verdict (the line without its numbers and tier gap): what F8 must
// not change. Pinned from main below.
const listed = (page) => out(page).locator('.scout-result-card').evaluateAll(cards => cards.map(c => {
    const copy = c.cloneNode(true);
    copy.querySelectorAll('.mls-verdict-nums, .mls-tier-gap').forEach(n => n.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
}));

// The new words stay inside the line's unbreakable pieces: every .mls-nowrap in the numbers line on one line.
const nowrapLines = (loc) => loc.locator('.mls-nowrap').evaluateAll(els => els.map(n => {
    const range = document.createRange();
    range.selectNodeContents(n);
    return new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.bottom))).size;
}));

// Everyone else on your roster added to the FLEX list (after the free agents' #5), so Lamb, still outside it, is your
// weakest RB/WR/TE in Whole Roster.
async function flexRankTheRest(page) {
    await page.evaluate(async (leagueId) => {
        const { normalizeName } = await import('/js/shared/names.js');
        const leagues = JSON.parse(localStorage.getItem('mls_leagues'));
        const league = leagues.find(l => l.leagueId === leagueId);
        ['Puka Nacua', 'Amon-Ra St. Brown', 'A.J. Brown', 'Garrett Wilson', 'Trey McBride', 'George Kittle'].forEach((name, i) => {
            league.weeklyRankings.push({ name, cleanName: normalizeName(name), posRank: 999, posTier: null, flexRank: 6 + i, flexTier: null, rank: 6 + i, tier: null });
        });
        localStorage.setItem('mls_leagues', JSON.stringify(leagues));
    }, FIXTURE_LEAGUE_ID);
    await page.reload();
    await page.waitForLoadState('networkidle');
}

// Pinned from main before the fix: the same players, in the same order, with the same verdicts and pills.
const BEFORE = {
    autoLineup: [
        'WR Jaxon Smith-Njigba SEA Wk Pos: WR20 (T5)Wk Flex: #5ROS: UR Replaces CeeDee Lamb (your FLEX) Would Start',
        'TE Sam LaPorta DET Wk Pos: TE5 (T2)Wk Flex: URROS: UR Replaces CeeDee Lamb (your FLEX) Would Start',
    ],
    listLineup: [
        'TE Sam LaPorta Wk Pos: TE5 (T2)Wk Flex: URROS: UR Replaces CeeDee Lamb (your FLEX) Free AgentWould Start',
        'WR Jaxon Smith-Njigba Wk Pos: WR20 (T5)Wk Flex: #5ROS: UR Replaces CeeDee Lamb (your FLEX) Free AgentWould Start',
    ],
    autoRoster: [
        'WR Jaxon Smith-Njigba SEA Wk Pos: WR20 (T5)Wk Flex: #5ROS: UR Upgrade over CeeDee Lamb Would Start',
        'TE Sam LaPorta DET Wk Pos: TE5 (T2)Wk Flex: URROS: UR Upgrade over CeeDee Lamb Would Start',
    ],
};

test.describe('Lineup Strategist: Auto-Find with a player outside the FLEX list', () => {
    test('a position rank without a FLEX rank is "not in Flex list", and no tier gap crosses lists', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await setup(page);

        // Starting Lineup, FLEX: the owner's Douglas and Ferguson rows.
        await runAutoFind(page, 'FLEX');
        expect(await listed(page)).toEqual(BEFORE.autoLineup);
        const sn = scanCard(page, 'Jaxon Smith-Njigba');
        const laporta = scanCard(page, 'Sam LaPorta');
        await expect(sn.locator('.mls-verdict-nums')).toHaveText('Wk Flex: Smith-Njigba #5, Lamb not in Flex list (WR30 T8)');
        await expect(laporta.locator('.mls-verdict-nums')).toHaveText('Wk Flex: LaPorta not in Flex list (TE5 T2), Lamb not in Flex list (WR30 T8)');
        // Main read "6 tiers up": LaPorta's TE tier (2) against Lamb's WR tier (8), two different lists.
        await expect(out(page).locator('.mls-tier-gap')).toHaveCount(0);
        await expect(out(page).locator('.mls-verdict-nums')).not.toContainText(['unranked']);
        // The row's own cell keeps "UR" (owner's choice): his position rank sits beside it.
        await expect(laporta.locator('.mls-scan-ranks')).toContainText('Wk Flex: UR');
        // Each name and its words stay one unbreakable piece.
        expect(await nowrapLines(laporta.locator('.mls-verdict-nums'))).toEqual([1, 1, 1]);

        // Check a List says the same.
        await runCheckList(page, 'lineup', ['Sam LaPorta', 'Jaxon Smith-Njigba']);
        expect(await listed(page)).toEqual(BEFORE.listLineup);
        await expect(out(page).locator('.scout-result-card').filter({ hasText: 'Sam LaPorta' }).locator('.mls-verdict-nums'))
            .toHaveText('Wk Flex: LaPorta not in Flex list (TE5 T2), Lamb not in Flex list (WR30 T8)');
        await expect(out(page).locator('.mls-tier-gap')).toHaveCount(0);

        // Whole Roster, FLEX: Lamb is your weakest once everyone else has a FLEX rank. The header names the list.
        await flexRankTheRest(page);
        await runAutoFind(page, 'FLEX');
        await callApp(page, 'setWaiverCompare', 'roster');
        await out(page).evaluate(el => { el.innerHTML = ''; });
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await expect(out(page).locator('.mls-scan-summary')).toBeVisible();
        const header = out(page).locator('.mls-scan-benchmark');
        await expect(header).toContainText('Your weakest RB/WR/TE is CeeDee Lamb (Wk Flex: not in list · WR30 · T8).');
        await expect(header).not.toContainText('unranked');
        expect(await nowrapLines(header)).toEqual([1]);
        expect(await listed(page)).toEqual(BEFORE.autoRoster);
        await expect(scanCard(page, 'Jaxon Smith-Njigba').locator('.mls-verdict-nums')).toHaveText('Wk Flex: Smith-Njigba #5, Lamb not in Flex list (WR30 T8)');

        await expectClean(page, state);
    });
});
