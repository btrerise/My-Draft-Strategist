// --- SOS SCALE (improvements S7, round 5) ---
// Pure helpers for which way round an SoS number reads. The app's convention is 1 = easiest schedule,
// 32 = hardest (the badge colors 1 green and 32 red, js/mls/sos.js). Some sources rank the other way
// (1 = toughest), so SoS files and SoS columns in rankings uploads can be flipped on the way in, and
// the SoS card warns when the numbers look like 1-5 ratings rather than 1-32 ranks. No imports and no
// load-time side effects, so tests/unit/sosScale.test.mjs loads it directly.

export const SOS_SCALE_TEXT = '1 = easiest, 32 = hardest';

// "1" -> "32", "32" -> "1", "4.5" -> "28.5". Anything that isn't a number from 1 to 32 ("", "-2",
// "40") is returned unchanged: it isn't a rank on this scale, so flipping it would mean nothing (and
// the badge ignores it either way).
export function reverseSosValue(value) {
    const s = String(value ?? '').trim();
    if (s === '') return value;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1 || n > 32) return value;
    return String(33 - n);
}

// True when a set of SoS values looks like ratings (stars, grades from 1 to 5) rather than 1-32 ranks:
// at least 8 numbers, none above 5. Fewer than 8 could be a deliberately short grid, so no warning.
export const RATINGS_MIN_VALUES = 8;
export function looksLikeRatings(values) {
    const nums = (values || []).map(v => Number(String(v ?? '').trim())).filter(n => Number.isFinite(n) && n > 0);
    return nums.length >= RATINGS_MIN_VALUES && Math.max(...nums) <= 5;
}

// Every value in a { TEAM: { POS: value } } map, for looksLikeRatings.
export function sosValues(map) {
    const out = [];
    Object.values(map || {}).forEach(posMap => Object.values(posMap || {}).forEach(v => {
        if (v !== '' && v !== null && v !== undefined) out.push(v);
    }));
    return out;
}
