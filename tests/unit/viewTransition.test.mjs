// js/shared/ui/viewTransition.js's pure parts (improvements S16): the tab direction a transition slides in, and the
// view-transition-name built from a league id (a valid CSS identifier, unique per id).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabDirection, vtName } from '../../js/shared/ui/viewTransition.js';

const ORDER = ['setup', 'roster', 'lineup', 'scout', 'guide'];

test('tabDirection follows the tab bar order', () => {
    assert.equal(tabDirection(ORDER, 'roster', 'scout'), 'forward');
    assert.equal(tabDirection(ORDER, 'scout', 'setup'), 'back');
    assert.equal(tabDirection(ORDER, 'lineup', 'lineup'), '');
    assert.equal(tabDirection(ORDER, '', 'lineup'), '');
    assert.equal(tabDirection(ORDER, 'roster', 'nowhere'), '');
});

test('vtName keeps letters, digits and "-", and escapes everything else', () => {
    assert.equal(vtName('vt-lc-', '1000000000000000001'), 'vt-lc-1000000000000000001');
    assert.equal(vtName('vt-lc-', 'manual_1700000000000'), 'vt-lc-manual_005f1700000000000');
    assert.equal(vtName('vt-lc-', 'a b.c'), 'vt-lc-a_0020b_002ec');
});

test('vtName gives a valid identifier and never the same name for two ids', () => {
    const ids = ['manual_1', 'manual.1', 'manual_005f1', 'handoff_x', 'x y', 'x_0020y', '"quoted"', 'é', '1', '-1', ''];
    const names = ids.map(id => vtName('vt-lc-', id));
    assert.equal(new Set(names).size, ids.length);
    for (const n of names) assert.match(n, /^vt-lc-[A-Za-z0-9_-]*$/);
});
