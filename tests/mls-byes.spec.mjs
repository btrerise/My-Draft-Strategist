// Lineup Strategist's bye weeks (refactor 7C): the BYE badge, the "(##)" bye suffix and the lineup
// optimizer read the shared table in js/shared/data/byes.js for Sleeper's current season. Until 7C
// MLS had the 2024 schedule, which in week 5 of 2026 put DET, LAC, PHI and TEN on bye instead of
// CAR and KC. Sleeper's NFL state is stubbed to week 5 of 2026 (the fixtures say week 2, when no
// team is on bye), with the fixed clock from helpers.mjs.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, showTab, seedMls, loadMlsRankings } from './helpers.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8');
const json = (body) => ({ status: 200, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });

// Ja'Marr Chase (a starter) moves to CAR, on bye in week 5. Justin Jefferson (also a starter) moves to
// DET, which the old 2024 table had on bye in week 5 but plays in 2026. Amon-Ra St. Brown (DET) and
// A.J. Brown (PHI) are on the same roster already.
const MOVES = { '4866': 'CAR', '6794': 'DET' };

async function openWeek5(page) {
    const state = await preparePage(page);
    const players = JSON.parse(fixture('players-nfl.json'));
    for (const [id, team] of Object.entries(MOVES)) players[id].team = team;
    // Routes added later win over preparePage's catch-all Sleeper route.
    await page.route(/sleeper\.app\/v1\/state\/nfl$/, r => r.fulfill(json({ ...JSON.parse(fixture('state-nfl.json')), week: 5, leg: 5, display_week: 5 })));
    await page.route(/sleeper\.app\/v1\/players\/nfl$/, r => r.fulfill(json(players)));
    await page.route(/sleeper\.app\/v1\/projections\/nfl\/regular\/2026\/5$/, r => r.fulfill(json(fixture('projections-2026-2.json'))));
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);
    return state;
}

test.describe('Lineup Strategist bye weeks (week 5 of 2026)', () => {
    test('BYE badges follow the 2026 schedule: CAR and KC, not DET, LAC, PHI or TEN', async ({ page }) => {
        const state = await openWeek5(page);
        const badges = await page.evaluate(async () => {
            const { getByeBadgeHTML } = await import('/js/mls/lineup/gameInfo.js');
            const { isUnavailableThisWeek } = await import('/js/mls/helpers.js');
            const { NFL_TEAMS } = await import('/js/mls/constants.js');
            return NFL_TEAMS.filter(t => getByeBadgeHTML(t) !== '' || isUnavailableThisWeek({ team: t }));
        });
        expect(badges).toEqual(['CAR', 'KC']);

        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'roster');
        const roster = page.locator('#rosterTab');
        await expect(roster.locator('.bye-badge')).toHaveCount(1);
        await expect(roster).toContainText("Ja'Marr Chase (5)");
        await expect(roster).toContainText('Justin Jefferson (6)');
        await expect(roster).toContainText('Amon-Ra St. Brown (6)');
        await expect(roster).toContainText('A.J. Brown (10)');
        await expect(roster).toContainText('Josh Allen (7)');
        await expectClean(page, state);
    });

    test('the optimizer benches the CAR starter and keeps the DET one', async ({ page }) => {
        const state = await openWeek5(page);
        await seedMls(page);
        await loadMlsRankings(page);
        await showTab(page, 'lineup');
        const lineup = page.locator('#optimalLineupContainer');
        const starters = await lineup.locator('.lineup-slot').allInnerTexts();
        const startsName = (name) => starters.some(t => t.includes(name));
        expect(startsName("Ja'Marr Chase"), 'Chase (CAR) is on bye in week 5').toBe(false);
        expect(startsName('Justin Jefferson'), 'Jefferson (DET) plays in week 5').toBe(true);
        expect(startsName('Puka Nacua'), "Nacua takes Chase's spot").toBe(true);
        await expect(lineup.locator('.bye-badge')).toHaveCount(0);
        const chaseOnBench = page.locator('#benchContainer .lineup-slot').filter({ hasText: "Ja'Marr Chase" });
        await expect(chaseOnBench.locator('.bye-badge')).toHaveText('BYE');
        await expect(page.locator('#benchContainer .bye-badge')).toHaveCount(1);
        await expectClean(page, state);
    });
});
