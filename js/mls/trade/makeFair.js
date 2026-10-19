// --- TRADE ANALYZER: WHAT WOULD MAKE IT FAIR (improvements S19) ---
// Pure logic behind the suggestions under a lopsided verdict (js/mls/trade/fairSection.js draws them). No
// DOM, no State: the caller passes each side's values, the candidates and the waiver setting, so
// tests/unit/makeFair.test.mjs runs all of it in Node.
//
// The owner's choices (S19's Asks you):
//   - Your Rankings decide (the first verdict); Market Consensus only when no ROS rankings are loaded.
//   - The side that has to add suggests from its own roster: a trade that favors them gets players from their
//     roster (added to what you get); one that favors you gets players from yours (added to what you give).
//     In dynasty and keeper leagues that team's own draft picks count too.
//   - Up to 3 single players, closest to even first; only when no single player fits, up to 3 pairs.
//   - The lineup is ignored: the Power Rankings section shows what an added player does to it.

// The verdict's numbers from each side's values (improvements S14's tradeVerdictNumbers, moved here unchanged so
// a suggestion is checked with the banner's own math). waiver: { on, perSpot }. getTotal/giveTotal include the
// waiver adjustment (bonusGet/bonusGive). verdict: 'fair' | 'you' | 'them'. null when nothing has a value.
export function verdictFromValues(getValues, giveValues, waiver) {
    let getTotal = getValues.reduce((sum, v) => sum + v, 0);
    let giveTotal = giveValues.reduce((sum, v) => sum + v, 0);
    if (getTotal === 0 && giveTotal === 0) return null;

    // --- WAIVER ADJUSTMENT ---
    // Credits whichever side of the trade includes FEWER total players. A straight sum of
    // player values overvalues the many-piece side of an uneven trade: consolidating value
    // into fewer roster spots is worth something on its own, since the newly-freed bench
    // spot(s) can be refilled off waivers. This mirrors the "waiver adjustment" concept sites
    // like FantasyCalc apply to their own trade calculators, though the credit amount here is
    // a flat, user-configurable estimate (see the Trade Analyzer's settings above) rather
    // than one derived from real trade data.
    let bonusGet = 0, bonusGive = 0;
    if (waiver && waiver.on) {
        let spotDiff = giveValues.length - getValues.length; // >0 = you're sending more pieces than you receive
        let perSpot = parseFloat(waiver.perSpot) || 0;
        if (spotDiff !== 0 && perSpot > 0) {
            let bonus = Math.abs(spotDiff) * perSpot;
            if (spotDiff > 0) { getTotal += bonus; bonusGet = bonus; }
            else { giveTotal += bonus; bonusGive = bonus; }
        }
    }

    let diff = getTotal - giveTotal;
    let biggerSide = Math.max(getTotal, giveTotal, 1); // avoid div-by-zero
    let swingPct = (Math.abs(diff) / biggerSide) * 100;

    // Within 10% of the larger side's value counts as a fair trade -- outside that, it
    // clearly favors whoever's receiving more value.
    const verdict = swingPct < 10 ? 'fair' : (diff > 0 ? 'you' : 'them');
    return { getTotal, giveTotal, bonusGet, bonusGive, diff, swingPct, verdict };
}

// The next three rookie drafts' years. A season's rookie draft is held before it starts, so from March on the
// next draft is next year's (the Trade Analyzer's "+ Draft pick" row uses the same years).
export function nextDraftYears(now = new Date()) {
    const first = now.getFullYear() + (now.getMonth() >= 2 ? 1 : 0);
    return [first, first + 1, first + 2];
}

// A team's own picks, as the picker names them ("2027 1st"): the next three drafts, rounds 1-4. Which picks a
// team has traded away isn't synced, so every team is assumed to hold its own (the list says so).
export function ownPickNames(now = new Date()) {
    return nextDraftYears(now).flatMap(y => ['1st', '2nd', '3rd', '4th'].map(r => `${y} ${r}`));
}

// The candidates for the side that adds: its roster's players with their values, and, in dynasty and keeper leagues
// only, its picks (pickValue: the market's, since rankings have no picks). roster: [{ cleanName, name, pos }];
// valueOf: clean name -> value; pickValue: a pick's name -> value (0 = none). normalize: a pick's matching key. picks: the team's picks as synced from Sleeper
// ([{ name, from }], leagues/picks.js), or null to assume it holds its own picks for the next three drafts
// (assumed: true on those). Players and picks with no value are left out; a pick held twice is listed once.
export function fairCandidates({ roster, valueOf, dynasty = false, pickValue = null, picks = null, normalize = (n) => n, now = new Date() }) {
    const out = (roster || []).filter(p => p && p.cleanName && p.name)
        .map(p => ({ name: p.name, cleanName: p.cleanName, pos: p.pos || '', value: valueOf(p.cleanName) || 0, isPick: false }));
    if (dynasty && pickValue) {
        const list = picks ? picks.map(p => ({ name: p.name, from: p.from || null, assumed: false }))
            : ownPickNames(now).map(name => ({ name, from: null, assumed: true }));
        const seen = new Set();
        list.forEach(p => {
            const clean = normalize(p.name);
            if (seen.has(clean)) return;
            seen.add(clean);
            out.push({ name: p.name, cleanName: clean, pos: 'Pick', value: pickValue(p.name) || 0, isPick: true, from: p.from, assumed: p.assumed });
        });
    }
    return out.filter(c => c.value > 0);
}

// "about 4,400": the gap rounded to the nearest 100 (10 under 1,000), as a number.
export function roundGap(value) {
    const v = Math.abs(value);
    const step = v >= 1000 ? 100 : 10;
    return Math.max(step, Math.round(v / step) * step);
}

// Who has to add to a lopsided trade, and about how much: the value one added piece would need to even it
// exactly, waiver adjustment included (adding a piece moves it). null when the trade is fair or has no values.
// { adder: 'them' | 'you', side: 'get' | 'give', diff (the banner's), needed, gap (needed rounded), after(addedValues) }
export function gapToClose(getValues, giveValues, waiver) {
    const now = verdictFromValues(getValues, giveValues, waiver);
    if (!now || now.verdict === 'fair') return null;
    const adder = now.verdict === 'them' ? 'them' : 'you';
    const side = adder === 'them' ? 'get' : 'give';
    const after = (added) => side === 'get'
        ? verdictFromValues(getValues.concat(added), giveValues, waiver)
        : verdictFromValues(getValues, giveValues.concat(added), waiver);
    const zero = after([0]);
    const needed = side === 'get' ? -zero.diff : zero.diff;
    return { adder, side, diff: now.diff, needed, gap: roundGap(needed > 0 ? needed : now.diff), after,
        range: fairRange(after, needed) };
}

// The values one added piece could have and leave the trade fair (round 9: "about 3,000" next to a 1,950 suggestion
// read as a contradiction; anything inside the 10% band is fair, not just the even amount). after(addedValues) as in
// gapToClose; needed: the even amount, inside the range. Returns { low, high }, rounded outward to the nearest 10 (so
// every fair suggestion falls inside what's shown; rounding to 100 put a fair 1,950 pick under "2,000"), or null when
// needed isn't positive. Fairness is one interval in the added value, so each end is found by halving.
export function fairRange(after, needed) {
    if (!(needed > 0)) return null;
    const fair = (v) => { const r = after([v]); return !!r && r.verdict === 'fair'; };
    const edge = (inside, outside) => {
        for (let i = 0; i < 40; i++) {
            const mid = (inside + outside) / 2;
            if (fair(mid)) inside = mid; else outside = mid;
        }
        return inside;
    };
    const lowRaw = fair(0) ? 0 : edge(needed, 0);
    let hi = needed * 2 + 1000;
    while (fair(hi) && hi < 1e7) hi *= 2;
    const highRaw = edge(needed, hi);
    return { low: Math.floor(lowRaw / 10) * 10, high: Math.ceil(highRaw / 10) * 10 };
}

// What would bring a lopsided trade within the fair band.
//   getValues / giveValues: each side's values now (the cards' values by the chosen rankings).
//   candidates: [{ name, cleanName, pos, value, isPick }] that the side that adds actually has; anything with no
//     value (unranked, a pick the market doesn't price) and anything already in the trade is skipped here.
//   inTrade: clean names already on either side (players), and onAddingSide: clean names on the side that adds
//     (a pick name like "2027 1st" on the other side is the other team's pick, so only the same side counts).
//   waiver: { on, perSpot }, as the banner's.
// Returns null when the trade is already fair (or has no values). Otherwise:
//   { adder: 'them' | 'you', side: 'get' | 'give', gap, needed, range, singles: [fit], pairs: [fit], removals: [removal] }
//   fit: { players: [candidate], value, after: verdictFromValues(...) }.
// singles are spread across prices (round 5, after the owner's review: "closest to even" alone kept suggesting the
// other team's stars): the fit closest to even, the least valuable fit (the least they'd have to give), and in
// dynasty the pick closest to even, then the next closest; shown most valuable first. pairs (closest first) only
// when no single candidate fits. removals: the pieces on the other side whose removal alone makes it fair (round 5:
// "take Puka Nacua off"), closest to even first. Every fit is re-checked with the whole verdict, since a piece added
// or taken off also changes the waiver adjustment (it credits the side with fewer pieces).
export function fairSuggestions({ getValues, giveValues, candidates, inTrade = [], onAddingSide = [], waiver, limit = 3, pairLimit = 40 }) {
    const g = gapToClose(getValues, giveValues, waiver);
    if (!g) return null;
    const { adder, side, needed, gap, after, range } = g;

    const taken = new Set(inTrade);
    const sameSide = new Set(onAddingSide);
    const seen = new Set();
    const pool = (candidates || []).filter(c => {
        if (!c || !(c.value > 0) || !c.cleanName) return false;
        if (c.isPick ? sameSide.has(c.cleanName) : taken.has(c.cleanName)) return false;
        if (seen.has(c.cleanName)) return false;
        seen.add(c.cleanName);
        return true;
    });

    const byCloseness = (a, b) => Math.abs(a.after.diff) - Math.abs(b.after.diff) || b.value - a.value;
    const fit = (players) => {
        const values = players.map(p => p.value);
        const v = after(values);
        return v && v.verdict === 'fair' ? { players, value: values.reduce((s, x) => s + x, 0), after: v } : null;
    };

    const singles = spreadFits(pool.map(c => fit([c])).filter(Boolean).sort(byCloseness), limit);
    let pairs = [];
    if (singles.length === 0) {
        // Only players worth less than the gap can be half of a pair (anyone worth more already overshoots
        // alone, give or take the waiver credit a second piece moves); the most valuable of them first, capped
        // so a deep roster stays quick.
        const slack = waiver && waiver.on ? 2 * (parseFloat(waiver.perSpot) || 0) : 0;
        const small = pool.filter(c => c.value < needed + slack).sort((a, b) => b.value - a.value).slice(0, pairLimit);
        for (let i = 0; i < small.length; i++) {
            for (let j = i + 1; j < small.length; j++) {
                const f = fit([small[i], small[j]]);
                if (f) pairs.push(f);
            }
        }
        pairs = pairs.sort(byCloseness).slice(0, limit);
    }
    return { adder, side, gap, needed, range, singles, pairs, removals: fairRemovals({ getValues, giveValues, waiver }) };
}

// Up to limit of the fits (sorted closest to even first): the closest, the least valuable, the closest pick, then
// the next closest; returned most valuable first, so the list reads as a price ladder.
function spreadFits(sorted, limit) {
    if (sorted.length <= limit) return sorted.slice().sort((a, b) => b.value - a.value);
    const chosen = [];
    const take = (f) => { if (f && !chosen.includes(f) && chosen.length < limit) chosen.push(f); };
    take(sorted[0]);
    take(sorted.reduce((min, f) => (f.value < min.value ? f : min), sorted[0]));
    take(sorted.find(f => f.players.some(p => p.isPick)));
    sorted.forEach(take);
    return chosen.sort((a, b) => b.value - a.value);
}

// The pieces whose removal from the side that has too much makes a lopsided trade fair: from what you give when it
// favors them, from what you get when it favors you. Never the side's last piece (that's no longer a trade).
// Returns [{ side: 'get' | 'give', index, value, after }], closest to even first, at most limit; [] when fair.
export function fairRemovals({ getValues, giveValues, waiver, limit = 2 }) {
    const now = verdictFromValues(getValues, giveValues, waiver);
    if (!now || now.verdict === 'fair') return [];
    const side = now.verdict === 'them' ? 'give' : 'get';
    const values = side === 'give' ? giveValues : getValues;
    if (values.length < 2) return [];
    const out = [];
    values.forEach((value, index) => {
        const rest = values.filter((_, i) => i !== index);
        const after = side === 'give' ? verdictFromValues(getValues, rest, waiver) : verdictFromValues(rest, giveValues, waiver);
        if (after && after.verdict === 'fair') out.push({ side, index, value, after });
    });
    return out.sort((a, b) => Math.abs(a.after.diff) - Math.abs(b.after.diff)).slice(0, limit);
}

// Where a change would land the trade, for the suggestion's line: "even", or which way it leans and by how much.
// after: verdictFromValues' result. Returns 'even', '2% your way' or '3% their way'.
export function landing(after) {
    // Fair means under 10%, so a fair 9.6% reads "9%", never "Fair · 10%".
    const pct = Math.round(after.swingPct) >= 10 && after.verdict === 'fair' ? 9 : Math.round(after.swingPct);
    if (pct === 0) return 'even';
    return `${pct}% ${after.diff > 0 ? 'your' : 'their'} way`;
}
