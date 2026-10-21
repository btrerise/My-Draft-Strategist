// The Trade Analyzer's two sides line up side by side (improvements F9): Receive has a From drop-down in Sleeper
// leagues, so Give gets a matching "From  You (username)" row, and the two sides share rows (css/mls.css
// .mls-trade-form-sides), so search boxes, players and draft-pick rows sit level however many players each side has.
// Phones stay stacked, with no From row on Give.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const top = (page, sel) => page.locator(sel).evaluate(e => Math.round(e.getBoundingClientRect().top));
const bottom = (page, sel) => page.locator(sel).evaluate(e => Math.round(e.getBoundingClientRect().bottom));

async function setSides(page, get, give) {
    await callApp(page, 'setTradePlayers', 'get', get);
    await callApp(page, 'setTradePlayers', 'give', give);
}

// Search with search, the first players with the first players, and (when shown) picks with picks.
async function expectLevel(page, { picks = false } = {}) {
    expect(await top(page, '#tradeGiveSearch')).toBe(await top(page, '#tradeGetSearch'));
    const tokens = await page.locator('.mls-trade-tokens').evaluateAll(uls => uls.filter(u => u.children.length).map(u => Math.round(u.getBoundingClientRect().top)));
    if (tokens.length === 2) expect(tokens[1]).toBe(tokens[0]);
    if (picks) expect(await top(page, '#tradeGivePickRow')).toBe(await top(page, '#tradeGetPickRow'));
}

// Makes the active league read as a manual one (only your roster known), in memory, then redraws the picker.
async function asManualLeague(page) {
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
        league.username = 'Manual';
        league.globalRosterMap = Object.fromEntries(Object.entries(league.globalRosterMap).filter(([, o]) => o === 'You'));
    });
    await showTab(page, 'roster');
    await showTab(page, 'scout');
}

async function asDynasty(page) {
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        State.leagues.find(l => l.leagueId === State.activeLeagueId).leagueType = 'dynasty';
    });
    await showTab(page, 'roster');
    await showTab(page, 'scout');
}

test.describe('Trade Analyzer: the two sides line up', () => {
    test('desktop (1280px): Sleeper league, From on both sides; rows level with one, two and many players, picks shown', async ({ page }) => {
        test.skip(test.info().project.name !== 'desktop', 'side by side from 768px');
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');

        const you = page.locator('#tradeGiveTeam');
        await expect(you).toBeVisible();
        await expect(you).toContainText('From');
        await expect(page.locator('#tradeGiveTeamName')).toHaveText('You (mds_test)');
        // The From rows are level and the same height.
        expect(await top(page, '#tradeGiveTeam')).toBe(await top(page, '#tradeGetTeam'));
        expect(await bottom(page, '#tradeGiveTeam')).toBe(await bottom(page, '.mls-trade-team:has(#tradeGetTeam)'));

        await expectLevel(page);                                              // both sides empty
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry']);
        await expectLevel(page);                                              // one on each side
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry', 'Garrett Wilson']);
        await expectLevel(page);                                              // two on one side
        await setSides(page, [], ['Derrick Henry', 'Garrett Wilson']);
        await expectLevel(page);                                              // one side empty
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry', 'Garrett Wilson', 'Chase Brown', "Ja'Marr Chase", 'CeeDee Lamb']);
        expect(await page.locator('#tradeGiveTokens').evaluate(u => u.getBoundingClientRect().height))
            .toBeGreaterThan(await page.locator('#tradeGetTokens').evaluate(u => u.getBoundingClientRect().height) * 1.5);
        await expectLevel(page);                                              // Give's players wrap to two lines

        await asDynasty(page);
        await expect(page.locator('#tradeGivePickRow')).toBeVisible();
        await expectLevel(page, { picks: true });
        await setSides(page, ['Bijan Robinson', 'Saquon Barkley'], ['Derrick Henry']);
        await expectLevel(page, { picks: true });
        await expectClean(page, state);
    });

    test('desktop (1280px): a long username ends in "…" on one line', async ({ page }) => {
        test.skip(test.info().project.name !== 'desktop', 'side by side from 768px');
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues.find(l => l.leagueId === State.activeLeagueId).username = 'the_extremely_long_username_of_the_league_champions_<b>2026</b>';
        });
        await showTab(page, 'scout');
        const name = page.locator('#tradeGiveTeamName');
        // Text, not markup.
        await expect(name).toHaveText('You (the_extremely_long_username_of_the_league_champions_<b>2026</b>)');
        await expect(name.locator('b')).toHaveCount(0);
        const fit = await name.evaluate(e => ({ cut: e.scrollWidth > e.clientWidth, ellipsis: getComputedStyle(e).textOverflow, nowrap: getComputedStyle(e).whiteSpace }));
        expect(fit).toEqual({ cut: true, ellipsis: 'ellipsis', nowrap: 'nowrap' });
        expect(await bottom(page, '#tradeGiveTeam')).toBe(await bottom(page, '.mls-trade-team:has(#tradeGetTeam)'));
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry']);
        await expectLevel(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await expectClean(page, state);
    });

    test('desktop (1280px): manual league, no From on either side; rows level', async ({ page }) => {
        test.skip(test.info().project.name !== 'desktop', 'side by side from 768px');
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'scout');
        await asManualLeague(page);
        await expect(page.locator('.mls-trade-team:has(#tradeGetTeam)')).toBeHidden();
        await expect(page.locator('#tradeGiveTeam')).toBeHidden();
        // With no From row, players (or the search) start right under each side's title, as before.
        expect(await top(page, '#tradeGetSearch')).toBe(await top(page, '#tradeGiveSearch'));
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry']);
        await expectLevel(page);
        expect(await top(page, '#tradeGetTokens')).toBe(await top(page, '.mls-trade-picker[data-side="get"]'));
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry', 'Garrett Wilson', 'Chase Brown', "Ja'Marr Chase", 'CeeDee Lamb']);
        await expectLevel(page);
        await setSides(page, [], ['Derrick Henry']);
        await expectLevel(page);
        await expectClean(page, state);
    });

    test('phone (375px): stacked as before, no From row on Give', async ({ page }) => {
        test.skip(test.info().project.name !== 'phone', 'phone layout');
        await page.setViewportSize({ width: 375, height: 844 });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'scout');
        await expect(page.locator('#tradeGetTeam')).toBeVisible();
        await expect(page.locator('#tradeGiveTeam')).toBeHidden();
        await setSides(page, ['Bijan Robinson'], ['Derrick Henry', 'Garrett Wilson']);
        // Stacked: all of Receive above Give's title; Give's players directly under its own header, as on main.
        const getBottom = await bottom(page, '.mls-trade-picker[data-side="get"]');
        expect(await top(page, '.mls-trade-picker[data-side="give"]')).toBeGreaterThan(getBottom);
        expect(await top(page, '#tradeGiveTokens')).toBe(await top(page, '.mls-trade-picker[data-side="give"]'));
        expect(await page.locator('.mls-trade-form-sides > .mls-trade-side').evaluateAll(s => s.map(e => getComputedStyle(e).display))).toEqual(['block', 'block']);
        await expectClean(page, state);
    });
});
