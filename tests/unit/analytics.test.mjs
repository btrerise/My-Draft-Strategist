// js/shared/analytics.js decides whether a page is counted (improvements A1). The browser side (the script tag,
// ?nocount=1 and ?nocount=0) is in tests/analytics.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCount, COUNTED_HOSTS } from '../../js/shared/analytics.js';
import { KEYS, isMdsOwnedKey, isMlsOwnedKey } from '../../js/shared/storage/keys.js';

test('counts only the production hostnames', () => {
    assert.equal(shouldCount('mydraftstrategist.com', false), true);
    assert.equal(shouldCount('www.mydraftstrategist.com', false), true);
    for (const host of ['localhost', '127.0.0.1', 'my-draft-strategist.pages.dev', 'a1-test.my-draft-strategist.pages.dev',
        'mydraftstrategist.com.evil.example', 'staging.mydraftstrategist.com', '']) {
        assert.equal(shouldCount(host, false), false, host);
    }
});

test('an opted-out browser is never counted', () => {
    for (const host of COUNTED_HOSTS) assert.equal(shouldCount(host, true), false, host);
});

test('the opt-out key is site-wide: in neither app\'s backup or reset', () => {
    const k = KEYS.shared.analyticsOptOut;
    assert.equal(k, 'shared_analytics_optout');
    assert.equal(isMdsOwnedKey(k), false);
    assert.equal(isMlsOwnedKey(k), false);
});
