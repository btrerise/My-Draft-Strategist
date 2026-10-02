// Draft Strategist's network features, against stubbed Sleeper and LeagueLogs endpoints
// (refactor chunk 2C, which moved them onto js/shared/api/*). Covers the Sleeper player map's
// IndexedDB cache, LeagueLogs Quick-Start and ADP sync, and a live Sleeper draft.
//
// The fixture Sleeper routes come from helpers.mjs. Routes added here are registered later, so
// Playwright tries them first: the draft endpoints, an unknown user, and LeagueLogs (which
// helpers.mjs otherwise aborts).
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, RANKINGS_CSV, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const DRAFT_ID = '1100000000000000001';
const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });

/** Counts requests whose URL matches `re`, from now on. */
function countRequests(page, re) {
    const hits = [];
    page.on('request', (req) => { if (re.test(req.url())) hits.push(req.url()); });
    return hits;
}

/** Answers LeagueLogs market requests with `rows`, or with `status` when it isn't 200. */
async function stubLeagueLogs(page, { rows = [], status = 200 } = {}) {
    const requests = [];
    await page.route(/^https:\/\/developer\.leaguelogs\.com\//, (route) => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        if (!url.pathname.startsWith('/v1/market/')) return route.abort();
        if (status !== 200) return route.fulfill({ status, contentType: 'text/plain', body: 'error' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: rows }) });
    });
    return requests;
}

async function pasteRankings(page) {
    await page.fill('#csvPasteArea', RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    await expect(toast(page, 'Loaded 24 players').last()).toBeVisible();
    await page.waitForLoadState('networkidle');
}

/** The active draft's player pool and record, as saved to localStorage. */
async function savedDraft(page) {
    return page.evaluate(() => {
        const active = localStorage.getItem('ds_active_draft_id');
        const drafts = JSON.parse(localStorage.getItem('ds_drafts') || '[]');
        const draft = drafts.find(d => d.draftId === active) || null;
        const pool = JSON.parse(localStorage.getItem('ds_players_' + active) || '[]');
        return { active, draft, pool };
    });
}

const byName = (pool) => Object.fromEntries(pool.map(p => [p.name, p]));

test.describe('Draft Strategist network features', () => {
    test('the Sleeper player map is downloaded once and kept in IndexedDB across reloads', async ({ page }) => {
        const state = await openApp(page, '/');
        const playerMapHits = countRequests(page, /api\.sleeper\.app\/v1\/players\/nfl$/);

        await pasteRankings(page);
        await pasteRankings(page);
        expect(playerMapHits, 'second upload in the same session reuses the map').toHaveLength(1);

        const cached = await page.evaluate(() => new Promise((resolve) => {
            const req = indexedDB.open('mls_sleeper_cache');
            req.onsuccess = () => {
                const get = req.result.transaction('players').objectStore('players').get('nfl_player_map');
                get.onsuccess = () => resolve(get.result ? Object.keys(get.result.data).length : 0);
            };
            req.onerror = () => resolve(-1);
        }));
        expect(cached, 'players in the IndexedDB cache').toBe(28);

        await page.reload();
        await page.waitForLoadState('networkidle');
        await pasteRankings(page);
        expect(playerMapHits, 'an upload after a reload reads IndexedDB').toHaveLength(1);

        // The map is still applied: Sleeper IDs and the injury/rookie fields come from it.
        const { pool } = await savedDraft(page);
        expect(byName(pool)["Ja'Marr Chase"].sleeperId).toBe('4866');
        await expectClean(page, state);
    });

    test('Quick-Start builds the pool from a LeagueLogs market profile', async ({ page }) => {
        const state = await openApp(page, '/');
        const llRequests = await stubLeagueLogs(page, {
            rows: [
                { sleeperPlayerId: '4866', overallRank: '2.2' },
                { sleeperPlayerId: '9509', overallRank: '1.4' },
                { sleeperPlayerId: 'BAL', overallRank: '190.5' },
                { sleeperPlayerId: '4984', overallRank: '15' },
                { sleeperPlayerId: '99999', overallRank: '3' }, // not in the Sleeper map: skipped
            ],
        });
        await page.selectOption('#adpFormatSelect', 'leaguelogs|redraft-1qb-12t-ppr0_5');
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Quick-Start market rankings loaded')).toBeVisible();

        expect(llRequests).toEqual(['/v1/market/redraft-1qb-12t-ppr0_5']);
        const { pool } = await savedDraft(page);
        expect(pool.map(p => [p.rank, p.name, p.posDisplay, p.team, p.adp, p.isRookie, p.sleeperId])).toEqual([
            [1, 'Bijan Robinson', 'RB1', 'ATL', '1.4', false, '9509'],
            [2, "Ja'Marr Chase", 'WR1', 'CIN', '2.2', false, '4866'],
            [3, 'Josh Allen', 'QB1', 'BUF', '15.0', false, '4984'],
            [4, 'Baltimore Ravens', 'DEF1', 'BAL', '190.5', true, 'BAL'],
        ]);
        const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ds_adp_meta')));
        expect(meta.format).toBe('LeagueLogs: Redraft - 1QB (Half-PPR)');
        await expectClean(page, state);
    });

    test('Quick-Start reports a LeagueLogs error with the existing wording', async ({ page }) => {
        const state = await openApp(page, '/');
        await stubLeagueLogs(page, { status: 503 });
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Failed to load Quick-Start.')).toContainText('Market Error: 503');
        // The app logs the failure itself; that is expected here.
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Market Error: 503')));
        await expectClean(page, state);
    });

    test('ADP sync applies LeagueLogs ranks by Sleeper ID, and reports errors', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page);
        const llRequests = await stubLeagueLogs(page, {
            rows: [
                { sleeperPlayerId: '4866', overallRank: '3.2' },
                { sleeperPlayerId: '9509', overallRank: '1' },
            ],
        });
        await page.selectOption('#adpFormatSelect', 'leaguelogs|dynasty-2qb-12t-ppr1');
        await page.click('#fetchAdpBtn');
        await expect(toast(page, 'Market Value (ADP) updated')).toBeVisible();
        expect(llRequests).toEqual(['/v1/market/dynasty-2qb-12t-ppr1']);
        const players = byName((await savedDraft(page)).pool);
        expect([players["Ja'Marr Chase"].adp, players['Bijan Robinson'].adp, players['Josh Allen'].adp]).toEqual(['3.2', '1.0', '-']);

        await page.unroute(/^https:\/\/developer\.leaguelogs\.com\//);
        await stubLeagueLogs(page, { status: 500 });
        await page.click('#fetchAdpBtn');
        await expect(toast(page, 'Failed to fetch live Market Value.')).toContainText('LeagueLogs Market Error: 500');
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('LeagueLogs Market Error: 500')));
        await expectClean(page, state);
    });

    test('ADP sync from Sleeper Native ADP applies stats.<key> by Sleeper ID, and reports errors', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page);
        const adpRequests = [];
        let adpStatus = 200;
        await page.route(/^https:\/\/api\.sleeper\.com\/projections\/nfl\/2026\?/, (route) => {
            adpRequests.push(route.request().url());
            if (adpStatus !== 200) return route.fulfill({ status: adpStatus, contentType: 'application/json', body: '{"error":"bad-request"}' });
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
                { player_id: '9509', stats: { adp_half_ppr: 1.94, adp_ppr: 2.1 } },
                { player_id: '4866', stats: { adp_half_ppr: 3.25, adp_ppr: 1.2 } },
                { player_id: '4984', stats: { adp_ppr: 20 } }, // no half-PPR figure: left as "-"
            ]) });
        });
        await page.selectOption('#adpFormatSelect', 'sleeper|adp_half_ppr');
        await page.click('#fetchAdpBtn');
        await expect(toast(page, 'Market Value (ADP) updated')).toBeVisible();
        expect(adpRequests).toEqual(['https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=adp_half_ppr']);
        const players = byName((await savedDraft(page)).pool);
        expect([players['Bijan Robinson'].adp, players["Ja'Marr Chase"].adp, players['Josh Allen'].adp]).toEqual(['1.9', '3.3', '-']);
        const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ds_adp_meta')));
        expect(meta.format).toBe('SLEEPER: Redraft - 1QB (Half-PPR)');

        adpStatus = 400;
        await page.click('#fetchAdpBtn');
        await expect(toast(page, 'Failed to fetch live Market Value.')).toContainText('Sleeper API Error: 400');
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Sleeper API Error: 400')));
        await expectClean(page, state);
    });

    test('live Sleeper draft: sync, poll picks every 3s without refetching draft metadata, stop', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page);

        // Shaped like Sleeper's /draft/<id>/picks rows; 2 teams, snake order.
        const pick = (pick_no, player_id, picked_by, first_name, last_name, position, team) => ({
            pick_no, round: Math.ceil(pick_no / 2), draft_slot: picked_by === '900001' ? 1 : 2,
            player_id, picked_by, metadata: { first_name, last_name, position, team },
        });
        const picks = [
            pick(1, '9509', '900001', 'Bijan', 'Robinson', 'RB', 'ATL'),
            pick(2, '4866', '900002', "Ja'Marr", 'Chase', 'WR', 'CIN'),
        ];
        const draft = {
            draft_id: DRAFT_ID, league_id: FIXTURE_LEAGUE_ID, status: 'drafting',
            settings: { teams: 2, rounds: 15 }, draft_order: { 900001: 1, 900002: 2 },
            metadata: { name: 'Fixture Draft' },
        };
        await page.route(new RegExp(`api\\.sleeper\\.app/v1/draft/${DRAFT_ID}(/picks)?$`), (route) => {
            const body = route.request().url().endsWith('/picks') ? picks : draft;
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        const metaHits = countRequests(page, /api\.sleeper\.app\/v1\/(user\/[^/]+|draft\/\d+|league\/\d+|league\/\d+\/users)$/);
        const pickHits = countRequests(page, /api\.sleeper\.app\/v1\/draft\/\d+\/picks$/);

        await page.fill('#sleeperUsername', 'mds_test');
        await page.fill('#sleeperDraftId', `https://sleeper.com/draft/nfl/${DRAFT_ID}`);
        await page.click('#syncBtn');
        await expect(page.locator('#syncBtn')).toContainText('Sync Complete!');
        let saved = await savedDraft(page);
        expect(saved.active).toBe(DRAFT_ID);
        expect(saved.draft.name).toBe('Fixture League');
        expect(saved.draft.draftedPlayers).toHaveLength(2);
        expect(saved.draft.myTeam).toHaveLength(1);
        expect(saved.draft.draftSlotNames).toEqual({ 1: 'mds_test Team', 2: 'Rival Team' });
        expect(metaHits).toHaveLength(4); // user, draft, league, league users

        // Live sync: the toggle forces one full sync, then the 3s poll is silent.
        await page.evaluate(() => {
            const el = document.getElementById('autoSyncToggle');
            el.checked = true;
            el.dispatchEvent(new Event('change'));
        });
        await expect(page.locator('#headerSyncBtn')).toHaveClass(/is-live/);
        await expect.poll(() => metaHits.length).toBe(8);

        // A pick for a player who isn't in the rankings arrives; the poll adds him unranked.
        picks.push(pick(3, '17', '900002', 'Justin', 'Tucker', 'K', 'BAL'));
        await expect.poll(async () => (await savedDraft(page)).draft.draftedPlayers.length, { timeout: 8000 }).toBe(3);
        saved = await savedDraft(page);
        expect(saved.draft.myTeam).toHaveLength(1);
        expect(byName(saved.pool)['Justin Tucker']).toMatchObject({ rank: 999, sleeperId: '17' });
        expect(metaHits, 'silent ticks reuse the cached user/draft/league').toHaveLength(8);

        await page.evaluate(() => {
            const el = document.getElementById('autoSyncToggle');
            el.checked = false;
            el.dispatchEvent(new Event('change'));
        });
        await expect(page.locator('#headerSyncBtn')).not.toHaveClass(/is-live/);
        const picksAtStop = pickHits.length;
        await page.waitForTimeout(4000);
        expect(pickHits, 'no polling after stop').toHaveLength(picksAtStop);

        await showTab(page, 'board');
        await expect(page.locator('#boardTab')).toContainText('Tucker');
        await expectClean(page, state);
    });

    test('an unknown Sleeper user gets the existing error toast', async ({ page }) => {
        const state = await openApp(page, '/');
        await page.route(/api\.sleeper\.app\/v1\/user\/nobody_here$/, (route) =>
            route.fulfill({ status: 404, contentType: 'application/json', body: 'null' }));
        await page.fill('#sleeperUsername', 'nobody_here');
        await page.fill('#sleeperDraftId', DRAFT_ID);
        await page.click('#syncBtn');
        await expect(toast(page, 'Sleeper Sync Error:')).toContainText('Could not find Sleeper User.');
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Could not find Sleeper User.')));
        await expectClean(page, state);
    });
});
