// Characterization tests for normalizeName / isNameMatch in js/shared/names.js (refactor chunk
// 0B; the module was split out of js/utils.js in 1A).
// Oddities pinned here on purpose are listed in docs/refactor/LOG.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeName, isNameMatch, NAME_ALIASES, headshotInitials } from '../../js/shared/names.js';

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
    // Refactor 9A: the strip used to run after spaces were removed, so these lost their last letters
    // ('ivano', 'peteivano', 'shaynesko', 'ajpataial').
    test('a suffix is only stripped when it is its own word', () => {
        assert.equal(normalizeName('Ivanov'), 'ivanov');
        assert.equal(normalizeName('Pete Ivanov'), 'peteivanov');
        assert.equal(normalizeName('Shayne Skov'), 'shayneskov');
        assert.equal(normalizeName("AJ Pataiali'i"), 'ajpataialii');
        assert.equal(normalizeName('Tim Patrick Jr'), 'timpatrick');
        assert.equal(normalizeName('Odell Beckham'), 'odellbeckham');
        // Names that merely end in those letters keep them: -v, -ii, -jr, -sr.
        assert.equal(normalizeName('Igor Lebedev'), 'igorlebedev');
        assert.equal(normalizeName('Kalani Kahananuii'), 'kalanikahananuii');
        assert.equal(normalizeName('Mike Dojr'), 'mikedojr');
        assert.equal(normalizeName('Sam Gonsr'), 'samgonsr');
    });
    test('the suffix word can follow any separator and carry punctuation', () => {
        assert.equal(normalizeName('Harrison, Jr.'), 'harrison');
        assert.equal(normalizeName('Harrison,Jr'), 'harrison');
        assert.equal(normalizeName('Kenneth Walker-III'), 'kenwalker');
        assert.equal(normalizeName('Marvin Harrison Jr. '), 'marvinharrison');
        assert.equal(normalizeName('Marvin Harrison Jr.*'), 'marvinharrison');
        // Only one suffix, and only at the end.
        assert.equal(normalizeName('John Smith Jr. III'), 'johnsmithjr');
        assert.equal(normalizeName('Jr. Smith'), 'jrsmith');
    });
    test('empty-ish input', () => {
        assert.equal(normalizeName(''), '');
        assert.equal(normalizeName(null), '');
        assert.equal(normalizeName(undefined), '');
        assert.equal(normalizeName(0), '');
        assert.equal(normalizeName(12345), '');
        assert.equal(normalizeName('   '), '');
        // A suffix with no name in front of it isn't stripped (refactor 9A; it gave '' before).
        assert.equal(normalizeName('Jr.'), 'jr');
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
    // Refactor 9A: these matched before (only the raw inputs were checked for emptiness).
    test('names with no letters never match, each other or anything else', () => {
        assert.equal(isNameMatch('#', '--'), false);
        assert.equal(isNameMatch('123', '456'), false);
        assert.equal(isNameMatch('123', '123'), false);
        assert.equal(isNameMatch('Josh Allen', '...'), false);
        assert.equal(isNameMatch('...', 'Josh Allen'), false);
        // A lone suffix keeps its letters now (see normalizeName), so these compare as words.
        assert.equal(isNameMatch('Jr.', 'Sr.'), false);
        assert.equal(isNameMatch('Jr.', 'jr'), true);
    });
});

// Improvements F3: the letters in a headshot circle, shared by both apps (moved from js/mls/lineup/headshots.js).
describe('headshotInitials', () => {
    test('first and last initial, upper case', () => {
        assert.equal(headshotInitials('Josh Allen', 'QB', 'BUF'), 'JA');
        assert.equal(headshotInitials("Ja'Marr Chase", 'WR', 'CIN'), 'JC');
        assert.equal(headshotInitials('Amon-Ra St. Brown', 'WR', 'DET'), 'AB');
        assert.equal(headshotInitials('de\'von achane', 'RB', 'MIA'), 'DA');
    });
    test('a suffix is skipped', () => {
        assert.equal(headshotInitials('Kenneth Walker III', 'RB', 'SEA'), 'KW');
        assert.equal(headshotInitials('Marvin Harrison Jr.', 'WR', 'ARI'), 'MH');
    });
    test('one word gives one letter; no name gives none', () => {
        assert.equal(headshotInitials('Bijan', 'RB', 'ATL'), 'B');
        assert.equal(headshotInitials('', 'RB', 'ATL'), '');
        assert.equal(headshotInitials(undefined, 'K', null), '');
    });
    test('DEF shows the team code, or DEF without a team', () => {
        assert.equal(headshotInitials('Baltimore Ravens', 'DEF', 'BAL'), 'BAL');
        assert.equal(headshotInitials('Ravens', 'DEF', 'FA'), 'DEF');
        assert.equal(headshotInitials('Ravens', 'DEF', null), 'DEF');
    });
});
