// Moved verbatim from js/utils.js in refactor chunk 1A. An ES module: the code that uses it imports it.

// Cache of raw name -> normalized result. normalizeName() is called repeatedly on the
// same player names during sorting/matching (roster syncs, rankings uploads, waiver
// scans), so this avoids re-running the Unicode normalize + regex chain on inputs
// we've already seen. Keyed on the raw input string, since that's what every caller
// actually has on hand.
const _normalizeNameCache = new Map();

// Known cross-platform name mismatches, mapping the variant spelling to the canonical one.
// Hoisted to module scope from inside normalizeName and isNameMatch, which each declared their
// own identical copy of this object literal -- meaning a fresh 11-key object was allocated on
// every cache miss and on every isNameMatch call. Building an index over Sleeper's ~11,000
// -player map (js/mls/ does this in several places) is thousands of those allocations for an
// object that never changes.
export const NAME_ALIASES = {
    'kennygainwell': 'kennethgainwell',
    'gabedavis': 'gabrieldavis',
    'joshpalmer': 'joshuapalmer',
    'mitchtrubisky': 'mitchelltrubisky',
    'tankdell': 'nathanieldell',
    'hollywoodbrown': 'marquisebrown',
    'scottymiller': 'scottmiller',
    'djchark': 'djcharkjr',
    'jeffwilson': 'jefferywilson',
    'nicholassingleton': 'nicksingleton',
    'kennethwalker': 'kenwalker'
};

export function normalizeName(name) {
    if (!name) return "";

    const cached = _normalizeNameCache.get(name);
    if (cached !== undefined) return cached;

    // A suffix (jr, sr, ii, iii, iv, v) is dropped only when it's a word of its own at the end.
    // Refactor 9A: it used to be cut after the spaces were already gone, so any name ending in
    // those letters lost them ("Skov" -> "sko", "Ivanov" -> "ivano"). Anything that isn't a letter
    // separates words here, so "Jr." and ",Jr" still count; the words are then joined as before.
    // Run over Sleeper's player map (11,879 names) this changed 3 keys, all retired non-fantasy
    // players, and none of the bundled T-Score keys (see the 9A entry in docs/refactor/LOG.md).
    let n = String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z]+/g, ' ')
        .trim()
        .replace(/ (jr|sr|iii|ii|iv|v)$/, '')
        .replace(/ /g, '');

    const result = NAME_ALIASES[n] || n;
    _normalizeNameCache.set(name, result);
    return result;
}

// NOTE: normalizeName already applies NAME_ALIASES, so by the time n1/n2 exist here they are
// both canonical -- and since no alias VALUE is also an alias KEY, NAME_ALIASES[n1] is always
// undefined at this point. The two lookups below are therefore unreachable in practice and the
// function is equivalent to comparing the two normalized names. They're kept because they cost
// nothing and would start mattering again the moment someone adds an alias whose value is
// itself another alias's key, which is an easy thing to do to the table above by accident.
export function isNameMatch(name1, name2) {
    if (!name1 || !name2) return false;
    let n1 = normalizeName(name1);
    let n2 = normalizeName(name2);
    // Two names with no letters ("123", "--") both normalize to "" and aren't the same player.
    // Refactor 9A: they used to match, since only the raw inputs were checked above.
    if (!n1 || !n2) return false;

    if (n1 === n2) return true;

    if (NAME_ALIASES[n1] === n2 || NAME_ALIASES[n2] === n1) return true;
    if (NAME_ALIASES[n1] && NAME_ALIASES[n1] === NAME_ALIASES[n2]) return true;

    return false;
}
