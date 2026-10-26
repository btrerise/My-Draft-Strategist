// --- THE MVPs & LVPs BOOM / BUST LINES (improvements S22) ---
// The Scoreboard's MVPs and LVPs (week/playerRecap.js) use the owner's lines by default; Advanced Settings on the
// Dashboard ("MVP / LVP lines") lets you change them (owner's choice in S22). One object under mls_recap_lines,
// { QB: { boom, bust }, RB, WR, TE, scale }; scale (round 8) is the format every player is judged on: 'half' (default),
// 'ppr' or 'std'. Separate from the Matchup Simulator's boom/bust chances (sim/stats.js).
import { KEYS } from '../../shared/storage/keys.js';
import { DEFAULT_LINES, DEFAULT_SCALE, RECAP_POSITIONS, normalizeLines, validateLines } from './playerRecap.js';

export function getRecapLines() {
    try {
        const raw = localStorage.getItem(KEYS.mls.recapLines);
        return normalizeLines(raw ? JSON.parse(raw) : null);
    } catch (e) {
        return normalizeLines(null);
    }
}

const inputId = (pos, field) => `recapLine${pos}${field === 'boom' ? 'Boom' : 'Bust'}`;
const isDefault = (lines) => lines.scale === DEFAULT_SCALE && RECAP_POSITIONS.every(p => lines[p].boom === DEFAULT_LINES[p].boom && lines[p].bust === DEFAULT_LINES[p].bust);

function setMessage(text, isError) {
    const el = document.getElementById('recapLinesMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
}

// Fills the Settings form from what's saved.
export function applyRecapLinesToUI() {
    const lines = getRecapLines();
    RECAP_POSITIONS.forEach(pos => ['boom', 'bust'].forEach(field => {
        const el = document.getElementById(inputId(pos, field));
        if (el) { el.value = String(lines[pos][field]); el.removeAttribute('aria-invalid'); }
    }));
    const scale = document.getElementById('recapLineScale');
    if (scale) scale.value = lines.scale;
}

// Save: true when the lines were valid and saved (the caller redraws the Scoreboard).
export function saveRecapLines() {
    const input = {};
    RECAP_POSITIONS.forEach(pos => {
        input[pos] = {};
        ['boom', 'bust'].forEach(field => {
            const el = document.getElementById(inputId(pos, field));
            input[pos][field] = el ? el.value : '';
        });
    });
    const scaleEl = document.getElementById('recapLineScale');
    input.scale = scaleEl ? scaleEl.value : DEFAULT_SCALE;
    const res = validateLines(input);
    RECAP_POSITIONS.forEach(pos => ['boom', 'bust'].forEach(field => {
        const el = document.getElementById(inputId(pos, field));
        if (!el) return;
        if (res.errors.some(e => e.pos === pos && e.field === field)) el.setAttribute('aria-invalid', 'true');
        else el.removeAttribute('aria-invalid');
    }));
    if (!res.ok) { setMessage(res.errors.map(e => e.message).join(' '), true); return false; }
    try {
        if (isDefault(res.lines)) localStorage.removeItem(KEYS.mls.recapLines);
        else localStorage.setItem(KEYS.mls.recapLines, JSON.stringify(res.lines));
    } catch (e) {
        setMessage('Couldn\'t save: this browser\'s storage is full or blocked.', true);
        return false;
    }
    setMessage('Saved. The Scoreboard\'s MVPs and LVPs use these lines.', false);
    return true;
}

export function resetRecapLines() {
    try { localStorage.removeItem(KEYS.mls.recapLines); } catch (e) { /* nothing saved to clear */ }
    applyRecapLinesToUI();
    setMessage('Back to the default lines.', false);
}
