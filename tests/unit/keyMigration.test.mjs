// Refactor chunk 6B renamed the localStorage keys (ds_* -> mds_*, mds_season_* -> mls_*, the
// hand-off and T-Score cache keys out of mds_). This suite checks the old -> new table in
// js/shared/storage/keys.js against every pre-6B name (helpers/pre6bKeys.mjs), the ownership
// filters on old names, and js/shared/storage/keyMigration.js against an in-memory Storage:
// old keys in, new keys out, nothing lost, the other app's keys untouched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    KEYS, STORAGE_KEYS, mdsDraftPoolKey, renamedKey, isLegacyKey,
    isMdsOwnedKey, isMlsOwnedKey, isMdsOwnedOrLegacyKey, isMlsOwnedOrLegacyKey,
} from '../../js/shared/storage/keys.js';
import { migrateKeyNames, renameLegacyKeys } from '../../js/shared/storage/keyMigration.js';
import { PRE_6B_KEYS, PRE_6B_DRAFT_POOL_PREFIX } from './helpers/pre6bKeys.mjs';

const keyAt = (path) => path.split('.').reduce((o, p) => o[p], KEYS);
const POOL_IDS = ['draft_default', 'manual_1726400000000', '1180000000000000000'];
const OLD_POOL_KEYS = POOL_IDS.map(id => PRE_6B_DRAFT_POOL_PREFIX + id);
const OLD_NAMES = [...Object.keys(PRE_6B_KEYS), ...OLD_POOL_KEYS];
const CURRENT_NAMES = [...STORAGE_KEYS.mds.filter(k => !k.includes('<')), ...POOL_IDS.map(mdsDraftPoolKey), ...STORAGE_KEYS.mls, ...STORAGE_KEYS.unowned];

// The group ('mds', 'mls', 'shared', 'tscore') a pre-6B name belongs to.
const groupOf = (oldKey) => (oldKey.startsWith(PRE_6B_DRAFT_POOL_PREFIX) ? 'mds' : PRE_6B_KEYS[oldKey].split('.')[0]);
const newNameOf = (oldKey) => (oldKey.startsWith(PRE_6B_DRAFT_POOL_PREFIX)
    ? mdsDraftPoolKey(oldKey.slice(PRE_6B_DRAFT_POOL_PREFIX.length))
    : keyAt(PRE_6B_KEYS[oldKey]));
const renamedOldNames = OLD_NAMES.filter(k => newNameOf(k) !== k);

// localStorage stand-in: insertion-ordered, with an optional quota in characters (key + value),
// like browsers count it.
class MemoryStorage {
    constructor(entries = {}, quota = Infinity) {
        this.map = new Map(Object.entries(entries));
        this.quota = quota;
    }
    get length() { return this.map.size; }
    key(i) { return [...this.map.keys()][i] ?? null; }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) {
        v = String(v);
        const used = [...this.map].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0);
        if (used + k.length + v.length > this.quota) throw new Error('QuotaExceededError');
        this.map.set(k, v);
    }
    removeItem(k) { this.map.delete(k); }
    dump() { return Object.fromEntries(this.map); }
}

// Every pre-6B key with a distinct value, plus keys no rule touches.
const UNRELATED = { theme: 'dark', 'runbook-done': '["0A"]', mds_season: 'look-alike' };
function preRenameStorage(quota) {
    const entries = {};
    OLD_NAMES.forEach((k, i) => { entries[k] = `value ${i} of ${k}`; });
    return new MemoryStorage({ ...entries, ...UNRELATED }, quota);
}

// Old keys each page is expected to copy.
const COPIED_BY = {
    mds: (k) => groupOf(k) === 'mds' || newNameOf(k) === KEYS.tscore.cache || newNameOf(k) === KEYS.tscore.cacheUpdated,
    mls: (k) => groupOf(k) === 'mls' || newNameOf(k) === KEYS.shared.handoffRoster,
    tscore: (k) => newNameOf(k) === KEYS.tscore.cache || newNameOf(k) === KEYS.tscore.cacheUpdated,
};

describe('old -> new key table (keys.js)', () => {
    test('every pre-6B name maps to its KEYS entry, the draft pool keys included', () => {
        for (const k of OLD_NAMES) assert.equal(renamedKey(k), newNameOf(k), k);
    });

    test('every key the table renames is one of three kinds: ds_*, mds_season_*, or the hand-off / T-Score cache', () => {
        assert.deepEqual(renamedOldNames.filter(k => !k.startsWith('ds_') && !k.startsWith('mds_season_')).sort(),
            ['mds_handoff_roster', 'mds_tscore_cache', 'mds_tscore_cache_updated']);
        assert.equal(renamedOldNames.length, 25 + 3 + 13 + 3); // 25 static MDS keys, 3 pools, 13 MLS, 3 others
    });

    test('current names are left alone, and none of them is an old name', () => {
        for (const k of CURRENT_NAMES) {
            assert.equal(renamedKey(k), k, k);
            assert.equal(isLegacyKey(k), false, k);
        }
        for (const k of renamedOldNames) assert.ok(!CURRENT_NAMES.includes(k), k);
    });

    test('no two old names get the same new name', () => {
        const news = renamedOldNames.map(renamedKey);
        assert.equal(new Set(news).size, news.length);
    });
});

describe('ownership filters and old names', () => {
    test("no old name is in either app's backup (isMdsOwnedKey / isMlsOwnedKey)", () => {
        for (const k of renamedOldNames) {
            assert.equal(isMdsOwnedKey(k), false, k);
            assert.equal(isMlsOwnedKey(k), false, k);
        }
    });

    test('Restore and the resets clear exactly their own app\'s old names', () => {
        for (const k of renamedOldNames) {
            assert.equal(isMdsOwnedOrLegacyKey(k), groupOf(k) === 'mds', k);
            assert.equal(isMlsOwnedOrLegacyKey(k), groupOf(k) === 'mls', k);
        }
    });
});

describe('migrateKeyNames', () => {
    for (const page of ['mds', 'mls', 'tscore']) {
        test(`${page}: copies its old keys, keeps them, and touches nothing else`, () => {
            const storage = preRenameStorage();
            const before = storage.dump();
            migrateKeyNames(page, storage);
            const after = storage.dump();

            for (const [k, v] of Object.entries(before)) assert.equal(after[k], v, `${k} kept as it was`);
            const expectedNew = {};
            for (const k of renamedOldNames) if (COPIED_BY[page](k)) expectedNew[newNameOf(k)] = before[k];
            const marker = KEYS[page].keyNamesVersion;
            const added = Object.fromEntries(Object.entries(after).filter(([k]) => !(k in before)));
            assert.deepEqual(added, { ...expectedNew, [marker]: '1' });
            assert.ok(Object.keys(expectedNew).length > 0);
        });
    }

    test('mds and mls copy disjoint sets, and together with tscore cover every renamed key', () => {
        const storage = preRenameStorage();
        for (const page of ['mds', 'mls', 'tscore']) migrateKeyNames(page, storage);
        const after = storage.dump();
        for (const k of renamedOldNames) assert.equal(after[newNameOf(k)], after[k], k);
    });

    test('runs once: a key deleted under its new name is not copied back, and a newer value is not overwritten', () => {
        const storage = preRenameStorage();
        migrateKeyNames('mls', storage);
        storage.removeItem(KEYS.shared.handoffRoster); // MLS consumed the hand-off
        storage.setItem(KEYS.mls.leagues, 'newer');
        migrateKeyNames('mls', storage);
        assert.equal(storage.getItem(KEYS.shared.handoffRoster), null);
        assert.equal(storage.getItem(KEYS.mls.leagues), 'newer');

        const fresh = preRenameStorage();
        fresh.setItem(KEYS.mds.drafts, 'saved by new code');
        migrateKeyNames('mds', fresh);
        assert.equal(fresh.getItem(KEYS.mds.drafts), 'saved by new code');
        assert.equal(fresh.getItem(KEYS.mds.meta), fresh.getItem('ds_meta'));
    });

    test('storage nearly full: it switches to moving, and no value is lost', () => {
        const probe = preRenameStorage();
        const used = Object.entries(probe.dump()).reduce((n, [k, v]) => n + k.length + v.length, 0);
        const storage = preRenameStorage(used + 600); // room for a few copies, not all
        const before = storage.dump();
        migrateKeyNames('mds', storage);
        const after = storage.dump();

        assert.equal(after[KEYS.mds.keyNamesVersion], '1');
        for (const k of renamedOldNames.filter(COPIED_BY.mds)) {
            assert.equal(after[newNameOf(k)], before[k], `${k} reachable under its new name`);
            assert.equal(after[k], undefined, `${k} moved, not copied`);
        }
        for (const k of renamedOldNames.filter(k => !COPIED_BY.mds(k))) assert.equal(after[k], before[k], k);
        assert.equal(after.theme, 'dark');
    });

    test('storage that refuses every write: old keys untouched, marker unset, so it retries next load', () => {
        const storage = preRenameStorage();
        storage.setItem = () => { throw new Error('QuotaExceededError'); };
        const before = storage.dump();
        const errors = [];
        const origError = console.error;
        console.error = (...a) => errors.push(a.join(' '));
        try { migrateKeyNames('mds', storage); } finally { console.error = origError; }
        assert.deepEqual(storage.dump(), before);
        assert.equal(errors.length, 1);
    });
});

describe('renameLegacyKeys (Restore of a pre-6B backup file)', () => {
    test('renames every old key and keeps current names', () => {
        const data = { ds_drafts: '[1]', ds_players_draft_default: '[2]', mds_show_headshots: 'false', mds_season_leagues: '[3]', mls_sim_settings: '{}' };
        assert.deepEqual(renameLegacyKeys(data), {
            [KEYS.mds.drafts]: '[1]', [mdsDraftPoolKey('draft_default')]: '[2]', [KEYS.mds.showHeadshots]: 'false',
            [KEYS.mls.leagues]: '[3]', [KEYS.mls.simSettings]: '{}',
        });
    });

    test('a file with both names of a key keeps the new one (boot.js rescue backups take both)', () => {
        assert.deepEqual(renameLegacyKeys({ ds_drafts: 'old', [KEYS.mds.drafts]: 'new' }), { [KEYS.mds.drafts]: 'new' });
        assert.deepEqual(renameLegacyKeys({ [KEYS.mds.drafts]: 'new', ds_drafts: 'old' }), { [KEYS.mds.drafts]: 'new' });
    });
});
