// Characterization tests for normalizeName / isNameMatch in js/utils.js (refactor chunk 0B).
// utils.js is a plain script, so it's run in a node:vm context (see helpers/loadUtils.mjs).
// Oddities pinned here on purpose are listed in docs/refactor/LOG.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { loadUtils } from './helpers/loadUtils.mjs';

const { normalizeName, isNameMatch, NAME_ALIASES } = loadUtils();

// Every NAME_ALIASES entry, with a real-looking display name for each side. The first test
// below fails if an alias is added or removed without a matching row here.
const ALIAS_CASES = [
    // [variant key, canonical value, variant display name, canonical display name]
    ['kennygainwell', 'kennethgainwell', 'Kenny Gainwell', 'Kenneth Gainwell'],
    ['gabedavis', 'gabrieldavis', 'Gabe Davis', 'Gabriel Davis'],
    ['joshpalmer', 'joshuapalmer', 'Josh Palmer', 'Joshua Palmer'],
    ['mitchtrubisky', 'mitchelltrubisky', 'Mitch Trubisky', 'Mitchell Trubisky'],
    ['tankdell', 'nathanieldell', 'Tank Dell', 'Nathaniel Dell'],
    ['hollywoodbrown', 'marquisebrown', 'Hollywood Brown', 'Marquise Brown'],
    ['scottymiller', 'scottmiller', 'Scotty Miller', 'Scott Miller'],
    ['djchark', 'djcharkjr', 'DJ Chark', 'D.J. Chark Jr.'],
    ['jeffwilson', 'jefferywilson', 'Jeff Wilson', 'Jeffery Wilson Jr.'],
    ['nicholassingleton', 'nicksingleton', 'Nicholas Singleton', 'Nick Singleton'],
    ['kennethwalker', 'kenwalker', 'Kenneth Walker III', 'Ken Walker']
];

describe('NAME_ALIASES', () => {
    test('table is exactly the pairs covered below', () => {
        assert.deepEqual(NAME_ALIASES, Object.fromEntries(ALIAS_CASES.map(([k, v]) => [k, v])));
    });
    test('no alias value is also an alias key (isNameMatch relies on this, see its comment)', () => {
        for (const v of Object.values(NAME_ALIASES)) assert.equal(NAME_ALIASES[v], undefined, v);
    });
});

describe('every alias pair', () => {
    for (const [key, value, variantName, canonicalName] of ALIAS_CASES) {
        test(`${variantName} <-> ${canonicalName}`, () => {
            assert.equal(normalizeName(key), value);
            assert.equal(normalizeName(value), value);
            assert.equal(normalizeName(variantName), value);
            assert.equal(normalizeName(canonicalName), value);
            assert.equal(isNameMatch(variantName, canonicalName), true);
            assert.equal(isNameMatch(canonicalName, variantName), true);
            assert.equal(isNameMatch(key, value), true);
            assert.equal(isNameMatch(variantName.toUpperCase(), canonicalName), true);
        });
    }
    test('aliases do not leak across different players', () => {
        assert.equal(isNameMatch('Kenneth Walker', 'Kenneth Gainwell'), false);
        assert.equal(isNameMatch('Gabe Davis', 'Mike Davis'), false);
        assert.equal(isNameMatch('Tank Dell', 'Nathaniel Hackett'), false);
    });
});

describe('normalizeName', () => {
    test('lowercases and strips everything but a-z', () => {
        assert.equal(normalizeName('Amon-Ra St. Brown'), 'amonrastbrown');
        assert.equal(normalizeName("Ja'Marr Chase"), 'jamarrchase');
        assert.equal(normalizeName('D.K. Metcalf'), 'dkmetcalf');
        assert.equal(normalizeName('DK Metcalf'), 'dkmetcalf');
        assert.equal(normalizeName('  Zay   Flowers '), 'zayflowers');
    });
    test('strips accents via NFD', () => {
        assert.equal(normalizeName('Josué Pérez'), 'josueperez');
    });
    test('strips one trailing suffix: jr, sr, ii, iii, iv, v', () => {
        assert.equal(normalizeName('Marvin Harrison Jr.'), 'marvinharrison');
        assert.equal(normalizeName('Michael Pittman Jr'), 'michaelpittman');
        assert.equal(normalizeName('Kyle Pitts Sr.'), 'kylepitts');
        assert.equal(normalizeName('Patrick Mahomes II'), 'patrickmahomes');
        assert.equal(normalizeName('Ray-Ray McCloud III'), 'rayraymccloud');
        assert.equal(normalizeName('Henry Ruggs IV'), 'henryruggs');
        assert.equal(normalizeName('Some Player V'), 'someplayer');
    });
    test('CURRENT BEHAVIOR: suffix strip has no word boundary, so a surname ending in "v" loses it', () => {
        assert.equal(normalizeName('Ivanov'), 'ivano');
        assert.equal(normalizeName('Pete Ivanov'), 'peteivano');
    });
    test('empty-ish input', () => {
        assert.equal(normalizeName(''), '');
        assert.equal(normalizeName(null), '');
        assert.equal(normalizeName(undefined), '');
        assert.equal(normalizeName(0), '');
        assert.equal(normalizeName(12345), '');
        assert.equal(normalizeName('   '), '');
        assert.equal(normalizeName('Jr.'), '');
    });
    test('repeat calls return the cached value', () => {
        assert.equal(normalizeName('Brian Thomas Jr.'), 'brianthomas');
        assert.equal(normalizeName('Brian Thomas Jr.'), 'brianthomas');
    });
});

describe('isNameMatch', () => {
    test('matches across punctuation, case and suffixes', () => {
        assert.equal(isNameMatch('DK Metcalf', 'D.K. Metcalf'), true);
        assert.equal(isNameMatch('Marvin Harrison Jr.', 'marvin harrison'), true);
        assert.equal(isNameMatch('Josué Pérez', 'Josue Perez'), true);
        assert.equal(isNameMatch('Josh Allen', 'Josh Allen II'), true);
    });
    test('different players do not match', () => {
        assert.equal(isNameMatch('Josh Allen', 'Josh Allison'), false);
    });
    test('falsy input never matches', () => {
        assert.equal(isNameMatch('', ''), false);
        assert.equal(isNameMatch('Josh Allen', null), false);
        assert.equal(isNameMatch(undefined, 'Josh Allen'), false);
    });
    test('CURRENT BEHAVIOR: two non-empty names that both normalize to "" match', () => {
        assert.equal(isNameMatch('Jr.', 'Sr.'), true);
        assert.equal(isNameMatch('123', '456'), true);
    });
});
