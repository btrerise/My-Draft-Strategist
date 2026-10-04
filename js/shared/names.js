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

    let n = String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .replace(/(jr|sr|iii|ii|iv|v)$/, '');

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

    if (n1 === n2) return true;

    if (NAME_ALIASES[n1] === n2 || NAME_ALIASES[n2] === n1) return true;
    if (NAME_ALIASES[n1] && NAME_ALIASES[n1] === NAME_ALIASES[n2]) return true;

    return false;
}
