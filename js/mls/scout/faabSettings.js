// --- SUGGESTED FAAB BIDS: ON OR OFF, CONSERVATIVE OR AGGRESSIVE (improvements S35, round 6) ---
// The owner's call: the bids add text some will see as clutter, so they're off until turned on (Dashboard, Advanced
// Settings, "FAAB Bids"), and then Conservative (round 5's A: the cheapest bid likely to win) unless Aggressive is picked
// (B: for a player who'd start for you or fill an empty spot, the top end is raised to what winners paid when others
// bid). While off, no bid, no "Bid …" placeholder and no history requests. The group shows only when there's a FAAB
// league. One toast, once, offers to turn them on after Auto-Find or Check a List finds a player on waivers in a FAAB
// league. Stored in KEYS.mls.faabSettings (so Backup / Restore and Factory Reset have it).
// S45 (the Settings page) moves the group there, and drops "on the Dashboard" from the toast's text (HINT_TEXT).
import { KEYS } from '../../shared/storage/keys.js';
import { showToast } from '../../shared/ui/toast.js';

const DEFAULTS = { on: false, style: 'conservative', hintShown: false };
export const FAAB_STYLES = ['conservative', 'aggressive'];
// Round 7: "Advanced Settings", the section's name on the Dashboard (S45: "…in Settings.").
export const HINT_TEXT = 'Need help with FAAB bids? Turn on bid suggestions in Advanced Settings on the Dashboard.';

export function faabSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEYS.mls.faabSettings) || 'null'); } catch (e) { saved = null; }
    const s = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
    if (!FAAB_STYLES.includes(s.style)) s.style = DEFAULTS.style;
    s.on = s.on === true;
    return s;
}

function save(s) {
    try { localStorage.setItem(KEYS.mls.faabSettings, JSON.stringify(s)); } catch (e) { /* private window: this visit only */ }
}

export const faabBidsOn = () => faabSettings().on;
export const faabStyle = () => faabSettings().style;

export function setFaabBidsOn(on) {
    save({ ...faabSettings(), on: !!on });
    applyFaabSettingsToUI();
}

export function setFaabStyle(style) {
    if (!FAAB_STYLES.includes(style)) return;
    save({ ...faabSettings(), style });
    applyFaabSettingsToUI();
}

// The Advanced Settings group: shown only with a FAAB league (hasFaab), its title row's state ("Off", "On ·
// Conservative"), the switch, and the style choice (only while on).
export function applyFaabSettingsToUI(hasFaab) {
    const s = faabSettings();
    const group = document.getElementById('faabSettingsGroup');
    if (group && typeof hasFaab === 'boolean') group.hidden = !hasFaab;
    const state = document.getElementById('faabSettingsState');
    if (state) {
        state.textContent = s.on ? `On · ${s.style === 'aggressive' ? 'Aggressive' : 'Conservative'}` : 'Off';
        state.classList.toggle('is-on', s.on);
    }
    const toggle = document.getElementById('faabBidsToggle');
    if (toggle) toggle.checked = s.on;
    const options = document.getElementById('faabStyleOptions');
    if (options) options.hidden = !s.on;
    document.querySelectorAll('#faabStyleOptions [data-style]').forEach(b => {
        const active = b.dataset.style === s.style;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
    });
}

// The line under the switch while it's on (round 7): turning it on often changes little on the Dashboard (its bids are
// only on upgrades on waivers; on a real Saturday, 1 in 15 FAAB leagues), so it says how many it shows and where the rest
// are. shown: bids on the Dashboard now; loading: a league's history is still loading; failed / total: FAAB leagues whose
// history couldn't be read from Sleeper (round 8: it used to blame "no winning bid yet").
export function updateFaabStatus({ shown = 0, loading = false, failed = 0, total = 0 } = {}) {
    const el = document.getElementById('faabBidsStatus');
    if (!el) return;
    const rest = 'Auto-Find and Check a List show one for every player on waivers.';
    const failedText = failed > 0 && failed >= total ? 'Couldn\'t read your leagues\' bids from Sleeper; they\'ll load on your next visit.'
        : failed > 0 ? `Couldn't read ${failed} ${failed === 1 ? 'league\'s' : 'leagues\''} bids from Sleeper; they'll load on your next visit.` : '';
    el.textContent = failedText && failed >= total ? failedText
        : loading ? `Loading your leagues' bids… ${rest}`
        : shown > 0 ? `${shown} ${shown === 1 ? 'bid' : 'bids'} on the Dashboard now (upgrades on waivers only). ${rest}`
        : `No bids on the Dashboard now: they show only on upgrades on waivers, once a league has a winning bid. ${rest}`;
    if (failedText && failed < total && !loading) el.textContent += ` ${failedText}`;
}

// After Auto-Find or Check a List, once ever: when bids are off and the scan shows a player on waivers in a FAAB league.
// onEnable runs after "Turn on" (the caller re-runs its scan, so the bids appear).
export function maybeShowFaabHint({ faabLeague, anyWaivers, onEnable }) {
    const s = faabSettings();
    if (s.on || s.hintShown || !faabLeague || !anyWaivers) return false;
    save({ ...s, hintShown: true });
    showToast(HINT_TEXT, { action: { label: 'Turn on', onClick: () => { setFaabBidsOn(true); if (onEnable) onEnable(); } } });
    return true;
}
