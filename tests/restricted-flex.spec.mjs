// Sleeper's restricted flex slots (improvements S1, found while styling flex badges): REC_FLEX takes
// WR/TE only ("W/T") and WRRB_FLEX takes WR/RB only ("W/R"). Before this, Lineup Strategist's sync
// counted both as a full FLEX, so the optimizer could start a TE in a W/R slot or an RB in a W/T
// slot, a lineup Sleeper won't accept; the Draft Strategist hand-off folded W/T into FLEX too; and
// Draft Strategist's own league sync looked for "W/T", which Sleeper's league data never uses.
// Each test serves the fixture league with its FLEX slot replaced.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, seedMds, loadMlsRankings, callApp, confirmMdsPreview, RANKINGS_CSV } from './helpers.mjs';

const LEAGUE = JSON.parse(readFileSync(new URL('./fixtures/sleeper/league.json', import.meta.url), 'utf8'));

/** Serves the fixture league with `positions` in place of its one FLEX slot. */
async function leagueWithFlexAs(page, positions) {
    const roster_positions = LEAGUE.roster_positions.flatMap(p => (p === 'FLEX' ? positions : [p]));
    await page.route(/api\.sleeper\.app\/v1\/league\/\d+$/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...LEAGUE, roster_positions }) }));
}

// mds_test's roster ranked so that TEs beat the spare WRs: with W/R and W/T counted as plain FLEX,
// the optimizer put Trey McBride (TE) in what Sleeper calls a W/R slot.
const RANKS = `Rank,Player,Pos,Team
1,Ja'Marr Chase,WR,CIN
2,George Kittle,TE,SF
3,Trey McBride,TE,ARI
4,Justin Jefferson,WR,MIN
5,CeeDee Lamb,WR,DAL
6,Derrick Henry,RB,BAL
7,Josh Allen,QB,BUF
8,Brock Bowers,TE,LV
9,Puka Nacua,WR,LAR
`;

const starterIn = (page, label) => page.locator('#optimalLineupContainer .lineup-slot')
    .filter({ has: page.locator('.slot-badge', { hasText: new RegExp(`^${label.replace('/', '\\/')}$`) }) });

test.describe('Restricted flex slots (W/T, W/R)', () => {
    test('Lineup Strategist syncs W/R and W/T and fills them only with eligible players', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await leagueWithFlexAs(page, ['WRRB_FLEX', 'REC_FLEX']);
        await seedMls(page);
        await expect(page.locator('#reqWRRB')).toHaveValue('1');
        await expect(page.locator('#reqWRTE')).toHaveValue('1');
        await expect(page.locator('#reqFLEX')).toHaveValue('0');

        await loadMlsRankings(page, RANKS, 9);
        await showTab(page, 'lineup');
        await callApp(page, 'optimizeLineup', true);
        // Strict slots: WR Chase and Jefferson, TE Kittle, RB Henry. The best player left is
        // McBride (TE), who can't play W/R, so W/R gets Lamb (WR) and W/T gets McBride.
        await expect(starterIn(page, 'W/R')).toHaveCount(1);
        await expect(starterIn(page, 'W/R')).toContainText('CeeDee Lamb');
        await expect(starterIn(page, 'W/T')).toContainText('Trey McBride');
        await expect(starterIn(page, 'FLEX')).toHaveCount(0);
        // The slot badge uses W/R's own RB/WR blend class.
        await expect(starterIn(page, 'W/R').locator('.slot-badge')).toHaveClass(/\bslot-WRRB\b/);

        await page.waitForLoadState('networkidle');
        expect(state.unmocked, 'Sleeper URLs with no fixture').toEqual([]);
        await expectClean(page, state);
    });

    test('a Draft Strategist W/T slot arrives in Lineup Strategist as W/T', async ({ page }) => {
        const state = await openApp(page, '/');
        await seedMds(page);
        // A league with one W/T slot, as Draft Strategist's sync records it (draft.limits.WT).
        await page.evaluate(async () => {
            const { getActiveDraft } = await import('/js/mds/state.js');
            getActiveDraft().limits = { QB: 1, RB: 2, WR: 2, TE: 1, WT: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1, BENCH: 5 };
        });
        await showTab(page, 'team');
        await page.click('#sendToLineupBtn');
        await page.waitForURL('**/lineup/**');
        await page.waitForLoadState('networkidle');
        await page.locator('#handoffBanner').getByRole('button', { name: 'Import as New League' }).click();
        await expect(page.locator('#handoffBanner')).toBeHidden();
        const reqs = await page.evaluate(() => JSON.parse(localStorage.getItem('mls_leagues')).at(-1).reqs);
        expect(reqs).toMatchObject({ WRTE: 1, FLEX: 1 });
        await expect(page.locator('#reqWRTE')).toHaveValue('1');
        await expectClean(page, state);
    });

    test("Draft Strategist's league sync counts Sleeper's REC_FLEX as a W/T slot", async ({ page }) => {
        const state = await openApp(page, '/');
        await page.fill('#csvPasteArea', RANKINGS_CSV);
        await page.getByRole('button', { name: 'Process Pasted Data' }).click();
        await confirmMdsPreview(page);
        await leagueWithFlexAs(page, ['REC_FLEX']);
        const DRAFT_ID = '1100000000000000001';
        await page.route(new RegExp(`api\\.sleeper\\.app/v1/draft/${DRAFT_ID}(/picks)?$`), (route) => {
            const body = route.request().url().endsWith('/picks') ? [] : {
                draft_id: DRAFT_ID, league_id: LEAGUE.league_id, status: 'drafting',
                settings: { teams: 2, rounds: 15 }, draft_order: { 900001: 1, 900002: 2 }, metadata: { name: 'Fixture Draft' },
            };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.fill('#sleeperUsername', 'mds_test');
        await page.fill('#sleeperDraftId', DRAFT_ID);
        await page.click('#syncBtn');
        await expect(page.locator('#syncBtn')).toContainText('Sync Complete!');
        const limits = await page.evaluate(() => {
            const active = localStorage.getItem('mds_active_draft_id');
            return JSON.parse(localStorage.getItem('mds_drafts')).find(d => d.draftId === active).limits;
        });
        expect(limits).toMatchObject({ WT: 1, FLEX: 0 });
        await page.waitForLoadState('networkidle');
        await expectClean(page, state);
    });
});
