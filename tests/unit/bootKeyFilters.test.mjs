// js/boot.js keeps its own copy of the two storage-key ownership filters, because its rescue
// backup has to work when no module loaded, so it can't import js/shared/storage/keys.js.
// This suite (refactor chunk 6A) checks that copy against isMdsOwnedKey / isMlsOwnedKey for
// every key in the registry, so a rename in keys.js (6B) that misses boot.js fails here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    KEYS, STORAGE_KEYS, mdsDraftPoolKey, isMdsOwnedKey, isMlsOwnedKey,
} from '../../js/shared/storage/keys.js';

// The filter callback inside downloadRescueBackup(), taken from the source as written. It reads
// one free variable, `mls` (true on /lineup/), so it's rebuilt as a function of that.
const BOOT_SRC = readFileSync(new URL('../../js/boot.js', import.meta.url), 'utf8');
const FILTER_RE = /Object\.keys\(localStorage\)\.filter\((function \(k\) \{[\s\S]*?\n\s*\})\);/;
const filterMatch = BOOT_SRC.match(FILTER_RE);
const bootFilter = filterMatch
    ? (mls) => new Function('mls', `return ${filterMatch[1]};`)(mls)
    : null;

// Every registry key, with the dynamic pool key filled in with real-looking draft ids, plus
// keys that belong to neither app (or only look like they might).
const REGISTRY_KEYS = [
    ...STORAGE_KEYS.mds.filter(k => !k.includes('<')),
    mdsDraftPoolKey('draft_default'), mdsDraftPoolKey('manual_1726400000000'), mdsDraftPoolKey('1180000000000000000'),
    ...STORAGE_KEYS.mls,
    ...STORAGE_KEYS.unowned,
];
const OTHER_KEYS = ['runbook-done', 'theme', 'ds', 'mls', 'mds_', 'mds_season', 'shared_', 'tscore_page_cache_x'];

describe('js/boot.js rescue-backup key filters', () => {
    test('the filter is still where this test looks for it', () => {
        assert.ok(bootFilter, 'Object.keys(localStorage).filter(function (k) {...}) not found in js/boot.js');
    });

    test('MDS (/) filter matches isMdsOwnedKey for every registry key', () => {
        const boot = bootFilter(false);
        for (const k of [...REGISTRY_KEYS, ...OTHER_KEYS]) {
            assert.equal(boot(k), isMdsOwnedKey(k), k);
        }
    });

    test('MLS (/lineup/) filter matches isMlsOwnedKey for every registry key', () => {
        const boot = bootFilter(true);
        for (const k of [...REGISTRY_KEYS, ...OTHER_KEYS]) {
            assert.equal(boot(k), isMlsOwnedKey(k), k);
        }
    });
});

describe('storage-key registry', () => {
    test('each app owns exactly its own keys; unowned keys belong to neither', () => {
        for (const k of [...STORAGE_KEYS.mds.filter(k => !k.includes('<')), mdsDraftPoolKey('draft_default')]) {
            assert.ok(isMdsOwnedKey(k) && !isMlsOwnedKey(k), k);
        }
        for (const k of STORAGE_KEYS.mls) assert.ok(isMlsOwnedKey(k) && !isMdsOwnedKey(k), k);
        for (const k of STORAGE_KEYS.unowned) assert.ok(!isMdsOwnedKey(k) && !isMlsOwnedKey(k), k);
    });

    test('no key name is used twice', () => {
        const all = Object.values(KEYS).flatMap(g => Object.values(g));
        assert.equal(new Set(all).size, all.length);
    });
});
