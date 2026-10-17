// Refactor chunk 6B renamed the localStorage keys (ds_* -> mds_*, mds_season_* -> mls_*,
// mds_handoff_roster -> shared_handoff_roster, mds_tscore_cache* -> tscore_cache*). Each page
// copies the old keys it uses to their new names on its first load (js/shared/storage/keyMigration.js),
// and since 6C deletes the old copies right after.
//
// tests/fixtures/pre-6b/storage.json is a browser's localStorage as main's code left it at 6B:
// the T-Score page refreshed, MLS synced with rankings uploaded and its guide banner dismissed,
// MDS seeded with five picks and its Lineup Strategist banner dismissed, and a roster handed
// off to MLS. These tests open the pages on that storage and check that every value is still
// there under its new name, the page's own old keys are gone (6C), and a page never touches the other
// app's keys.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab } from './helpers.mjs';

const PRE_6B = JSON.parse(readFileSync(new URL('./fixtures/pre-6b/storage.json', import.meta.url), 'utf8'));

// The rename, written out independently of keys.js.
const EXACT = { mds_handoff_roster: 'shared_handoff_roster', mds_tscore_cache: 'tscore_cache', mds_tscore_cache_updated: 'tscore_cache_updated' };
const renamed = (k) => EXACT[k] || (k.startsWith('ds_') ? 'm' + k : k.startsWith('mds_season_') ? 'mls_' + k.slice('mds_season_'.length) : k);
const OLD = Object.keys(PRE_6B).filter(k => renamed(k) !== k);
const isMlsKey = (k) => k.startsWith('mls_') || k.startsWith('mds_season_');
const isMdsKey = (k) => k.startsWith('ds_') || (k.startsWith('mds_') && !k.startsWith('mds_season_') && !(k in EXACT));

const dumpStorage = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
const pick = (obj, pred) => Object.fromEntries(Object.entries(obj).filter(([k]) => pred(k)));

// Seeds the snapshot once, before the first page of the test loads (sessionStorage survives the
// test's later navigations and reloads; localStorage would be re-seeded otherwise).
async function seedPre6b(page) {
    await page.addInitScript((data) => {
        if (sessionStorage.getItem('pre6b-seeded')) return;
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
        sessionStorage.setItem('pre6b-seeded', '1');
    }, PRE_6B);
}

test.describe('pre-6B storage', () => {
    test('opens all three pages with every value under its new name, own old keys deleted, other app untouched', async ({ page }) => {
        expect(OLD.length, 'the snapshot has old names to rename').toBeGreaterThan(15);
        await seedPre6b(page);

        // --- Draft Strategist ---
        let state = await openApp(page, '/');
        let s = await dumpStorage(page);
        const mdsOld = OLD.filter(k => k.startsWith('ds_') || k.startsWith('mds_tscore_cache'));
        expect(mdsOld.length).toBeGreaterThan(5);
        for (const k of mdsOld) {
            expect(s[renamed(k)], `${k} -> ${renamed(k)}`).toBe(PRE_6B[k]);
            expect(s[k], `${k} deleted`).toBeUndefined();
        }
        expect(Object.keys(s).filter(k => k.startsWith('ds_')), 'no ds_* left').toEqual([]);
        expect(s.mds_key_names_version).toBe('2');
        expect(pick(s, isMlsKey), "MLS's keys untouched").toEqual(pick(PRE_6B, isMlsKey));
        expect(s.mds_handoff_roster).toBe(PRE_6B.mds_handoff_roster);
        expect(s.shared_handoff_roster, 'the hand-off is MLS\'s to rename').toBeUndefined();
        await expect(page.locator('#mlsBanner')).toBeHidden(); // dismissed before the rename
        await showTab(page, 'team');
        await expect(page.locator('#teamTab')).toContainText("Ja'Marr Chase");
        await showTab(page, 'board');
        await expect(page.locator('#boardTab')).toContainText('Bijan Robinson');
        await expectClean(page, state);
        const afterMds = s;

        // --- Lineup Strategist ---
        state = await openApp(page, '/lineup/');
        s = await dumpStorage(page);
        for (const k of OLD.filter(k => k.startsWith('mds_season_'))) {
            expect(s[k], `${k} deleted`).toBeUndefined();
            expect(s[renamed(k)], `${k} -> ${renamed(k)}`).toBeDefined();
        }
        expect(Object.keys(s).filter(k => k.startsWith('mds_season_')), 'no mds_season_* left').toEqual([]);
        expect(s.mds_handoff_roster, 'old hand-off deleted').toBeUndefined();
        // Values MLS rewrites on load (the leagues it re-syncs) may change; the rest must match.
        for (const k of ['mds_season_active_league', 'mds_season_ros', 'mds_season_weekly', 'mds_season_ros_updated', 'mds_season_weekly_updated', 'mds_season_manual_bench', 'mds_season_manual_starters']) {
            expect(s[renamed(k)], `${k} -> ${renamed(k)}`).toBe(PRE_6B[k]);
        }
        expect(JSON.parse(s.mls_leagues).map(l => l.name)).toEqual(JSON.parse(PRE_6B.mds_season_leagues).map(l => l.name));
        expect(s.mls_key_names_version).toBe('2');
        expect(s.shared_handoff_roster).toBe(PRE_6B.mds_handoff_roster);
        expect(pick(s, isMdsKey), "MDS's keys untouched").toEqual(pick(afterMds, isMdsKey));
        await expect(page.locator('#handoffBanner')).toBeVisible();
        await expect(page.locator('#handoffBannerText')).toContainText('Fixture Draft');
        await expect(page.locator('#guideBanner')).toBeHidden(); // dismissed before the rename

        // MLS consumes the hand-off. The rename doesn't run again (and its old copy is gone), so it
        // isn't copied back.
        await page.locator('#handoffBanner').getByRole('button', { name: 'Dismiss' }).click();
        expect(await page.evaluate(() => localStorage.getItem('shared_handoff_roster'))).toBeNull();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#handoffBanner')).toBeHidden();
        expect(await page.evaluate(() => localStorage.getItem('shared_handoff_roster'))).toBeNull();
        await showTab(page, 'roster');
        await expect(page.locator('#rosterTab')).toContainText('Josh Allen');
        await expectClean(page, state);

        // --- T-Score ---
        state = await openApp(page, '/t-score/');
        await expect(page.locator('#tscoreFreshness')).toHaveText('Sheet data: Updated today');
        s = await dumpStorage(page);
        expect(s.tscore_cache).toBe(PRE_6B.mds_tscore_cache);
        expect(s.tscore_cache_updated).toBe(PRE_6B.mds_tscore_cache_updated);
        expect(s.tscore_key_names_version).toBe('2');
        // All three pages opened: no old name left anywhere.
        expect(Object.keys(s).filter(k => renamed(k) !== k), 'no old names left').toEqual([]);
        await expectClean(page, state);
    });

    test('T-Score opened first still shows its freshness label, and deletes only its old cache names', async ({ page }) => {
        await seedPre6b(page);
        let state = await openApp(page, '/t-score/');
        await expect(page.locator('#tscoreFreshness')).toHaveText('Sheet data: Updated today');
        const s = await dumpStorage(page);
        expect(s.tscore_cache).toBe(PRE_6B.mds_tscore_cache);
        expect(s.tscore_cache_updated).toBe(PRE_6B.mds_tscore_cache_updated);
        expect(s.tscore_key_names_version).toBe('2');
        const tscoreOld = (k) => k.startsWith('mds_tscore_cache');
        expect(Object.keys(s).filter(tscoreOld), 'old T-Score cache names deleted').toEqual([]);
        expect(pick(s, k => !k.startsWith('tscore_'))).toEqual(pick(PRE_6B, k => !k.startsWith('tscore_') && !tscoreOld(k)));
        await expectClean(page, state);

        // Draft Strategist opened next still has the T-Score cache, under its new name.
        state = await openApp(page, '/');
        const s2 = await dumpStorage(page);
        expect(s2.tscore_cache).toBe(PRE_6B.mds_tscore_cache);
        expect(Object.keys(s2).filter(k => k.startsWith('ds_'))).toEqual([]);
        await expectClean(page, state);
    });

    test('Hard Reset and Factory Reset clear their app\'s keys under both names, and nothing else', async ({ page }) => {
        await seedPre6b(page);
        let state = await openApp(page, '/');
        await page.goto('/lineup/');
        await page.waitForLoadState('networkidle');
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Each page has deleted its old keys by now (6C). Put both apps' old names back, as a stale
        // tab could, so the resets have both names to clear.
        await page.evaluate((data) => { for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v); },
            pick(PRE_6B, k => k.startsWith('ds_') || k.startsWith('mds_season_')));
        const before = await dumpStorage(page);
        expect(Object.keys(before).filter(k => k.startsWith('ds_')).length).toBeGreaterThan(3);

        await page.locator('[data-action="hardReset"]').dispatchEvent('click');
        await expect(page.locator('#mds-confirm-overlay')).toBeVisible();
        await Promise.all([page.waitForEvent('load'), page.locator('#mds-confirm-overlay [data-confirm-action="ok"]').click()]);
        await page.waitForLoadState('networkidle');
        await expectClean(page, state);
        let s = await dumpStorage(page);
        expect(Object.keys(s).filter(k => k.startsWith('ds_')), 'old MDS names cleared').toEqual([]);
        expect(pick(s, isMlsKey), "MLS's keys untouched").toEqual(pick(before, isMlsKey));
        for (const k of [...Object.keys(EXACT), ...Object.values(EXACT), 'tscore_page_cache']) expect(s[k], k).toBe(before[k]);
        expect(s.mds_key_names_version, 'the rename and deletion ran again after the reset').toBe('2');

        state = await openApp(page, '/lineup/');
        const beforeMls = await dumpStorage(page);
        await showTab(page, 'setup');
        await page.locator('[data-action="factoryReset"]').dispatchEvent('click');
        await expect(page.locator('#mds-confirm-overlay')).toBeVisible();
        await Promise.all([page.waitForEvent('load'), page.locator('#mds-confirm-overlay [data-confirm-action="ok"]').click()]);
        await page.waitForLoadState('networkidle');
        await expectClean(page, state);
        s = await dumpStorage(page);
        expect(Object.keys(s).filter(k => k.startsWith('mds_season_')), 'old MLS names cleared').toEqual([]);
        expect(beforeMls.mds_season_leagues, 'MLS kept the planted old names until its reset').toBe(PRE_6B.mds_season_leagues);
        expect(pick(s, isMdsKey), "MDS's keys untouched").toEqual(pick(beforeMls, isMdsKey));
        for (const k of ['mds_handoff_roster', 'mds_tscore_cache', 'mds_tscore_cache_updated', 'tscore_cache', 'tscore_page_cache']) expect(s[k], k).toBe(beforeMls[k]);
    });
});
