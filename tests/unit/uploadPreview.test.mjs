// formatUnmatchedNames (js/shared/rankings/uploadPreview.js, moved from js/mls/scout/waivers.js in
// refactor 8C). Both apps' upload previews and MLS's Waiver Wire notes list unmatched names with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUnmatchedNames } from '../../js/shared/rankings/uploadPreview.js';

test('no names gives an empty string', () => {
    assert.equal(formatUnmatchedNames([]), '');
    assert.equal(formatUnmatchedNames(null), '');
    assert.equal(formatUnmatchedNames(undefined), '');
});

test('one name, two names, and a list up to the cap', () => {
    assert.equal(formatUnmatchedNames(['Gabe Davis']), 'Gabe Davis.');
    assert.equal(formatUnmatchedNames(['Gabe Davis', 'Marquise Brown']), 'Gabe Davis and Marquise Brown.');
    assert.equal(formatUnmatchedNames(['A', 'B', 'C'], 3), 'A, B and C.');
});

test('past the cap the rest are counted (default cap 6; previews pass 12)', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    assert.equal(formatUnmatchedNames(names), 'A, B, C, D, E, F and 2 more.');
    assert.equal(formatUnmatchedNames(names, 12), 'A, B, C, D, E, F, G and H.');
    assert.equal(formatUnmatchedNames(names, 2), 'A, B and 6 more.');
});

test('names are escaped: they come straight from the user\'s file', () => {
    assert.equal(formatUnmatchedNames(['<b>Bo</b> & "Co"']), '&lt;b&gt;Bo&lt;/b&gt; &amp; &quot;Co&quot;.');
});
