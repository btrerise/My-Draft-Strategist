// --- IMAGE EXPORTS: PROPORTIONAL DIGITS (improvements S19, round 12) ---
// Every page sets font-variant-numeric: tabular-nums on body (css/base.css), so digits line up in columns. html2canvas
// 1.4.1, which all three image exports use (Draft Strategist's Export Team, Lineup Strategist's Export Lineup and
// Export Trade), places each word where the browser laid it out but draws it with the canvas's own text, which
// ignores that setting: a word with digits came out narrower than its slot and left a gap after it ("(0- 10,000 )",
// "(- 868 pts"). Call this from an export's onclone with the clone's root: the image's copy draws proportional
// digits, so what the browser lays out is what the canvas draws. The page itself is untouched.
// tests/export-numerals.spec.mjs checks all three exports.
export function useProportionalDigits(root) {
    if (!root || !root.ownerDocument) return;
    const doc = root.ownerDocument;
    if (!root.id) root.id = 'export-image-root';
    const style = doc.createElement('style');
    style.textContent = `#${root.id}, #${root.id} * { font-variant-numeric: normal !important; }`;
    doc.head.appendChild(style);
}
