// Draft Strategist's network features, against stubbed Sleeper and Fantasy Football Calculator
// endpoints (refactor chunk 2C, which moved them onto js/shared/api/*; 7A replaced LeagueLogs
// with FFC). Covers the Sleeper player map's IndexedDB cache, FFC Quick-Start and ADP sync, and
// a live Sleeper draft.
//
// The fixture Sleeper routes come from helpers.mjs. Routes added here are registered later, so
// Playwright tries them first: the draft endpoints, an unknown user, and /api/ffc/ (the
// Cloudflare Pages Function, which the static test server doesn't run).
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

/**
 * Answers /api/ffc/<format> (functions/api/ffc/[format].js) with a proxy reply built from
 * `players` (FFC's own row shape), or with `status` and `error` when status isn't 200.
 */
async function stubFfc(page, { players = [], source = 'live', short = false, savedAt = '2026-09-15T10:00:00.000Z', liveCount = null, status = 200, error = 'boom' } = {}) {
    const requests = [];
    await page.route(/^http:\/\/localhost:\d+\/api\/ffc\//, (route) => {
        requests.push(new URL(route.request().url()).pathname);
        if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            source, short, savedAt, liveCount: liveCount ?? players.length, meta: { type: 'PPR' }, players,
        }) });
    });
    return requests;
}

const ffcRow = (name, position, team, adp, bye = 7) => ({ player_id: 1, name, position, team, adp, adp_formatted: '', times_drafted: 10, high: 1, low: 2, stdev: 0.5, bye });

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

    test('Quick-Start builds the pool from Fantasy Football Calculator through the upload path', async ({ page }) => {
        const state = await openApp(page, '/');
        const ffcRequests = await stubFfc(page, {
            players: [
                ffcRow("Ja'Marr Chase", 'WR', 'CIN', 2.2, 10),
                ffcRow('Bijan Robinson', 'RB', 'ATL', 1.4, 5),
                ffcRow('Baltimore Defense', 'DEF', 'BAL', 190.5, 7), // Sleeper names it "Baltimore Ravens"
                ffcRow('Justin Tucker', 'PK', 'BAL', 160, 7),         // FFC's "PK" is K
                ffcRow('Josh Allen', 'QB', 'BUF', 15, 7),
                ffcRow('Some Rookie', 'WR', 'FA', 120, 0),            // not in the Sleeper map: kept, no Sleeper ID
            ],
        });
        await page.selectOption('#adpFormatSelect', 'ffc|half-ppr');
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Quick-Start loaded 6 players from Fantasy Football Calculator (Half-PPR ADP).')).toBeVisible();

        expect(ffcRequests).toEqual(['/api/ffc/half-ppr']);
        const { pool } = await savedDraft(page);
        expect(pool.map(p => [p.rank, p.name, p.posDisplay, p.team, String(p.bye), p.adp, p.isRookie, p.sleeperId])).toEqual([
            [1, 'Bijan Robinson', 'RB1', 'ATL', '5', '1.4', false, '9509'],
            [2, "Ja'Marr Chase", 'WR1', 'CIN', '10', '2.2', false, '4866'],
            [3, 'Josh Allen', 'QB1', 'BUF', '7', '15.0', false, '4984'],
            [4, 'Some Rookie', 'WR2', 'FA', '-', '120.0', false, 'custom_3'],
            [5, 'Justin Tucker', 'K1', 'BAL', '7', '160.0', false, '17'],
            [6, 'Baltimore Ravens', 'DEF1', 'BAL', '7', '190.5', true, 'BAL'],
        ]);
        const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ds_adp_meta')));
        expect(meta.format).toBe('FFC: Redraft - 1QB (Half-PPR)');
        await expectClean(page, state);
    });

    test('Quick-Start replaces the pool even with the aggregate toggle on', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page);
        await page.evaluate(() => { document.getElementById('aggregateToggle').checked = true; });
        await stubFfc(page, { players: [ffcRow('Josh Allen', 'QB', 'BUF', 15)] });
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Quick-Start loaded 1 players')).toBeVisible();
        expect((await savedDraft(page)).pool.map(p => p.name)).toEqual(['Josh Allen']);
        await expectClean(page, state);
    });

    test('Quick-Start says when it used the last saved full list, and warns on a short one', async ({ page }) => {
        const state = await openApp(page, '/');
        await stubFfc(page, { source: 'saved', savedAt: '2026-09-12T10:00:00.000Z', liveCount: 29, players: [ffcRow('Josh Allen', 'QB', 'BUF', 15)] });
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        const saved = toast(page, 'Quick-Start loaded 1 players from Fantasy Football Calculator (PPR ADP).');
        await expect(saved).toContainText("last full PPR list, from Sep 12, 2026. Today's list only has 29 players");
        const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ds_adp_meta')));
        expect(meta.format).toBe('FFC: Redraft - 1QB (PPR) (list from Sep 12, 2026)');

        await page.unroute(/^http:\/\/localhost:\d+\/api\/ffc\//);
        await stubFfc(page, { short: true, players: [ffcRow('Josh Allen', 'QB', 'BUF', 15), ffcRow('Bijan Robinson', 'RB', 'ATL', 1.4)] });
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Quick-Start loaded only 2 players.')).toContainText("Fantasy Football Calculator's PPR list is short right now");
        await expect(page.locator('.toast-error').filter({ hasText: 'loaded only 2 players' }), 'a short list is shown as an error').toBeVisible();
        await expectClean(page, state);
    });

    test('Quick-Start reports an FFC error, and needs an FFC format', async ({ page }) => {
        const state = await openApp(page, '/');
        await stubFfc(page, { status: 502, error: "Fantasy Football Calculator couldn't be reached (HTTP 503)." });
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Failed to load Quick-Start.')).toContainText("Fantasy Football Calculator Error: Fantasy Football Calculator couldn't be reached (HTTP 503).");
        // The app logs the failure itself, and the stubbed 502 counts as a local error; both expected here.
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('HTTP 503') && !e.includes('/api/ffc/') && !e.includes('502')));

        await page.selectOption('#adpFormatSelect', 'sleeper|adp_ppr');
        await page.getByRole('button', { name: /Quick-Start/ }).first().click();
        await expect(toast(page, 'Quick-Start builds its player pool from Fantasy Football Calculator.')).toBeVisible();
        await expectClean(page, state);
    });

    test('ADP sync applies FFC ADP by name, and reports errors', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page);
        const ffcRequests = await stubFfc(page, {
            players: [
                ffcRow("Ja'Marr Chase", 'WR', 'CIN', 3.2),
                ffcRow('Bijan Robinson', 'RB', 'ATL', 1),
                ffcRow('AJ Brown', 'WR', 'PHI', 40.4), // the pool says "A.J. Brown"
            ],
        });
        await page.selectOption('#adpFormatSelect', 'ffc|2qb');
        await page.click('#fetchAdpBtn');
        await expect(toast(page, 'Market Value (ADP) updated')).toBeVisible();
        expect(ffcRequests).toEqual(['/api/ffc/2qb']);
        const players = byName((await savedDraft(page)).pool);
        expect([players["Ja'Marr Chase"].adp, players['Bijan Robinson'].adp, players['A.J. Brown'].adp, players['Josh Allen'].adp]).toEqual(['3.2', '1.0', '40.4', '-']);
        const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ds_adp_meta')));
        expect(meta.format).toBe('FFC: Redraft - 2QB/Superflex');

        await page.unroute(/^http:\/\/localhost:\d+\/api\/ffc\//);
        await stubFfc(page, { status: 500, error: 'boom' });
        await page.click('#fetchAdpBtn');
        await expect(toast(page, 'Failed to fetch live Market Value.')).toContainText('Fantasy Football Calculator Error: boom');
        state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Fantasy Football Calculator Error: boom') && !e.includes('/api/ffc/') && !e.includes('500')));
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
