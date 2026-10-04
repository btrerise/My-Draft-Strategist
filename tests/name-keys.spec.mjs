// Refactor 9A changed normalizeName (js/shared/names.js): a suffix (jr, sr, ii, iii, iv, v) is only
// stripped when it's a word of its own. Both apps save keys made by normalizeName (player pools,
// ranking sets, rosters, the T-Score cache), so these tests open the apps on storage the code before
// 9A wrote and check those keys still match what the new code computes.
//
// tests/fixtures/pre-9a/ was written by tests/tools/pre9a-snapshot.tool.mjs, run against the commit
// before the change: T-Score refreshed from stubbed sheets, Draft Strategist with 31 players (the 24
// fixture players plus Marvin Harrison Jr., Brian Thomas Jr., Kenneth Walker III, Travis Etienne Jr.,
// Patrick Mahomes II, D.J. Chark Jr. and Shayne Skov) and five picks, Lineup Strategist synced with the
// same 31 players as its ROS and Weekly rankings. localStorage and IndexedDB both.
//
// Shayne Skov is the accepted case (owner's decision in 9A): one of three Sleeper names, all retired
// non-fantasy players, whose key changes ('shaynesko' -> 'shayneskov').
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { preparePage, expectClean, showTab } from './helpers.mjs';

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/pre-9a/${f}`, import.meta.url), 'utf8'));
const STORAGE = fixture('storage.json');
const IDB = fixture('idb.json');

// Loads the snapshot into localStorage and IndexedDB from a same-origin page that runs no app code.
async function seedPre9a(page) {
    const state = await preparePage(page);
    await page.goto('/lineup/manifest.json');
    await page.evaluate(async ({ storage, idb }) => {
        localStorage.clear();
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
        for (const [name, stores] of Object.entries(idb)) {
            const db = await new Promise((res, rej) => {
                const r = indexedDB.open(name, 1);
                r.onupgradeneeded = () => { for (const s of Object.keys(stores)) r.result.createObjectStore(s); };
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            for (const [store, entries] of Object.entries(stores)) {
                await new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite');
                    entries.forEach(([k, v]) => tx.objectStore(store).put(v, k));
                    tx.oncomplete = res;
                    tx.onerror = () => rej(tx.error);
                });
            }
            db.close();
        }
    }, { storage: STORAGE, idb: IDB });
    return state;
}

test('keys saved before 9A still match the new normalizeName', async ({ page }) => {
    const state = await seedPre9a(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);

    // Every saved {name, cleanName} record, in any localStorage value, against the page's own normalizeName.
    const { checked, mismatches } = await page.evaluate(async () => {
        const { normalizeName } = await import('/js/shared/names.js');
        let checked = 0;
        const mismatches = new Set();
        const walk = (v) => {
            if (Array.isArray(v)) return v.forEach(walk);
            if (!v || typeof v !== 'object') return;
            if (typeof v.name === 'string' && typeof v.cleanName === 'string') {
                checked++;
                if (normalizeName(v.name) !== v.cleanName) mismatches.add(JSON.stringify([v.name, v.cleanName, normalizeName(v.name)]));
            }
            Object.values(v).forEach(walk);
        };
        for (const k of Object.keys(localStorage)) {
            try { walk(JSON.parse(localStorage.getItem(k))); } catch { /* not JSON */ }
        }
        return { checked, mismatches: [...mismatches].map(s => JSON.parse(s)) };
    });
    expect(checked, 'saved records found (MDS pool, MLS ranking sets, T-Score page cache)').toBeGreaterThan(150);
    expect(mismatches).toEqual([['Shayne Skov', 'shaynesko', 'shayneskov']]);

    // The T-Score cache's keys are the old keys; every one but Skov's is still what the new code looks up.
    const cacheKeys = Object.keys(JSON.parse(STORAGE.tscore_cache)).sort();
    expect(cacheKeys).toEqual(['bijanrobinson', 'brianthomas', 'djcharkjr', 'jamarrchase', 'kenwalker', 'marvinharrison', 'shaynesko', 'travisetienne']);

    // --- Draft Strategist: the T-Score badges come from that saved cache, matched by the new normalizeName.
    await showTab(page, 'tracker');
    const tracker = await page.locator('#trackerTab').textContent();
    for (const [name, score] of [['Marvin Harrison Jr.', 77.7], ['Brian Thomas Jr.', 66.6], ['Kenneth Walker III', 55.5], ['Travis Etienne Jr.', 52.2], ['D.J. Chark Jr.', 44.4]]) {
        expect(tracker, name).toContain(name);
        expect(tracker, `${name}'s saved T-Score`).toContain(`T-Score: ${score} |`);
    }
    // The accepted mismatch: Skov is still in the pool, but his badge waits for the next T-Score refresh,
    // which saves the cache under the new key.
    expect(tracker).toContain('Shayne Skov');
    expect(tracker).not.toContain('T-Score: 33.3 |');
    await expectClean(page, state);

    // --- Lineup Strategist: the saved ranking sets answer lookups made by the new code, whichever way a
    // source spells the name, and every player on the synced roster still finds their rank.
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);
    const mls = await page.evaluate(async () => {
        const { normalizeName } = await import('/js/shared/names.js');
        const { State } = await import('/js/mls/state.js');
        const { rankingIndex } = await import('/js/mls/helpers.js');
        const rank = (list, n) => rankingIndex(list).get(normalizeName(n))?.rank ?? null;
        const names = ['Marvin Harrison Jr.', 'Marvin Harrison', 'Kenneth Walker III', 'Ken Walker', 'Patrick Mahomes II', 'Patrick Mahomes',
            'D.J. Chark Jr.', 'DJ Chark', 'Brian Thomas', 'Travis Etienne', "Ja'Marr Chase", 'Shayne Skov'];
        const league = State.leagues.find(l => l.leagueId === State.activeLeagueId);
        return {
            ros: Object.fromEntries(names.map(n => [n, rank(State.rosRankings, n)])),
            weekly: Object.fromEntries(names.map(n => [n, rank(State.weeklyRankings, n)])),
            rosterSize: league.roster.length,
            unrankedRoster: league.roster.filter(p => rank(State.rosRankings, p.name) === null).map(p => p.name),
        };
    });
    const expected = {
        'Marvin Harrison Jr.': 25, 'Marvin Harrison': 25, 'Kenneth Walker III': 27, 'Ken Walker': 27, 'Patrick Mahomes II': 29, 'Patrick Mahomes': 29,
        'D.J. Chark Jr.': 30, 'DJ Chark': 30, 'Brian Thomas': 26, 'Travis Etienne': 28, "Ja'Marr Chase": 1,
        'Shayne Skov': null, // the accepted mismatch: found again once the rankings are uploaded again
    };
    expect(mls.ros).toEqual(expected);
    expect(mls.weekly).toEqual(expected);
    expect(mls.rosterSize).toBeGreaterThan(5);
    // The fixture roster's K and DEF aren't in the rankings file at all (unranked before 9A too).
    expect(mls.unrankedRoster).toEqual(['Justin Tucker', 'Baltimore Ravens']);
    await showTab(page, 'roster');
    await expect(page.locator('#rosterTab')).toContainText("Ja'Marr Chase");
    await expectClean(page, state);

    // --- T-Score page renders from its saved page cache.
    await page.goto('/t-score/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#top50WrBody')).toContainText('Marvin Harrison Jr.');
    await expectClean(page, state);
});
