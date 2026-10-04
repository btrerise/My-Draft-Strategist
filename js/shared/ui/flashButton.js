// Moved verbatim from js/utils.js in refactor chunk 1A. An ES module: the code that uses it imports it.

// --- FLASH BUTTON FEEDBACK ---
// Shared by Draft Strategist and Lineup Strategist (previously two separate near-identical copies).
// Uses innerHTML rather than innerText: some buttons' resting state includes icon markup
// (callers capture btn.innerHTML beforehand as the fallback to restore), and plain-text
// flash messages render identically either way, so innerHTML is the safe common choice.
export const flashButton = function(btn, text, isError = false, fallbackContent = null, duration = 2500) {
    if (!btn) return;
    const originalContent = fallbackContent || btn.innerHTML;
    const originalBg = btn.style.backgroundColor;

    btn.innerHTML = text;
    btn.style.backgroundColor = isError ? "var(--error-color)" : "var(--success-color)";
    btn.style.color = isError ? "white" : "var(--bg-color)";

    clearTimeout(btn.flashTimeout);
    btn.flashTimeout = setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.style.backgroundColor = originalBg;
        btn.style.color = "";
    }, duration);
};
