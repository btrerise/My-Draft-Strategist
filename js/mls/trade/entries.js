// --- TRADE ANALYZER: A SIDE'S ENTRIES (improvements S38) ---
// Each side of a trade is a list of entries, one per line of its hidden textarea (trade/picker.js). A player is
// one person, so he's on a side once (matched without regard to case). A draft pick can repeat: a trade for two
// 2027 1sts is two entries, and the second reads "2027 1st (2)" (owner's choice, 2026-11-11), so every entry has
// its own label, its own token and its own Remove. Everything downstream reads the labels as names: pickKey
// (leagues/picks.js) and isDraftPickName ignore the "(2)", so each entry gets the pick's value and counts once.
// Pure: no DOM, no State (tests/unit/tradeEntries.test.mjs).

const PICK_RE = /\b(19|20)\d{2}\b.*\b(1st|2nd|3rd|4th)\b/i;
const NUMBER_RE = /\s*\((\d+)\)\s*$/;

export const isPickEntry = (name) => PICK_RE.test(String(name || ''));

// A pick's label without its number: "2027 1st (2)" -> "2027 1st". "(Early)" and the like stay.
export const pickBase = (name) => String(name || '').replace(NUMBER_RE, '').trim();

// Which of a repeated pick this entry is: 1 for "2027 1st", 2 for "2027 1st (2)".
export function pickNumber(name) {
    const m = NUMBER_RE.exec(String(name || ''));
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

// The list with every repeated pick numbered in order ("2027 1st", "2027 1st (2)", "2027 1st (3)"), whatever
// numbers the labels came with: after one of two is removed, the one left is plain "2027 1st" again.
export function numberPicks(list) {
    const seen = new Map();
    return list.map(name => {
        if (!isPickEntry(name)) return name;
        const base = pickBase(name);
        const key = base.toLowerCase();
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        return n === 1 ? base : `${base} (${n})`;
    });
}

// list plus names: a pick is always added (as another entry), a player only when he isn't on the list yet.
export function addEntries(list, names) {
    const out = list.slice();
    const have = new Set(out.map(n => n.toLowerCase()));
    (names || []).map(n => String(n).trim()).filter(Boolean).forEach(n => {
        if (isPickEntry(n)) { out.push(pickBase(n)); return; }
        if (have.has(n.toLowerCase())) return;
        out.push(n);
        have.add(n.toLowerCase());
    });
    return numberPicks(out);
}

// list without the entry at index (a token's Remove).
export function removeEntryAt(list, index) {
    return numberPicks(list.filter((_, i) => i !== index));
}

// list without the named entries, one entry per name ("To make it fair"'s Remove): taking off "2027 1st (2)"
// leaves "2027 1st", and taking off "2027 1st" leaves the other one, renumbered.
export function removeEntries(list, names) {
    const out = list.slice();
    (names || []).forEach(n => {
        const want = String(n).trim().toLowerCase();
        const i = out.findIndex(x => x.toLowerCase() === want);
        if (i !== -1) out.splice(i, 1);
    });
    return numberPicks(out);
}
