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

// --- IMAGE EXPORTS: THE SAME IMAGE ON EVERY DEVICE (improvements M17) ---
// html2canvas draws from a clone of the page in an iframe as wide as the window, so on a phone the clone took the phone
// layout (css/base.css's ROOM ON PHONES: sections without frames, no side padding) and the image came out narrower and
// different from one made on a computer. Spread this into every export's html2canvas options: the clone is laid out at
// a computer's width, so the image always gets the framed card with flat rows, and each export's onclone pins the
// exported element to a fixed width (480px). An image made at 390px matches one made at 1280px pixel for pixel
// (tests/export-same-everywhere.spec.mjs).
export const EXPORT_WINDOW = Object.freeze({ windowWidth: 1280, windowHeight: 900 });

// html2canvas turns each ::before / ::after into a real element and copies its computed style from the live page,
// including its used width in px. A pseudo-element stretched between `left` and `right` (the list rows' dividers,
// css/mls.css) then keeps the live page's width: on a phone the image's dividers stopped at the phone's row width. Call
// this from an export's onclone, after EXPORT_WINDOW's wider clone is laid out: each such element gets its width from
// its two offsets again (improvements M17, round 6).
export function fitClonedPseudoElements(root) {
    if (!root) return;
    root.querySelectorAll('html2canvaspseudoelement').forEach(el => {
        const s = el.style;
        if (s.position === 'absolute' && s.left && s.right && s.left !== 'auto' && s.right !== 'auto') s.width = 'auto';
    });
}
