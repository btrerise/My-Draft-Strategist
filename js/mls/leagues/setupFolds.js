// The Dashboard's two set-once cards, Add/Sync League and Active League Requirements, fold to one line once any league
// exists (improvements U4, from U1's option 1). While there is no league both stay open and look as they always did:
// the empty Dashboard is where a new person sets up. Remembered in mls_setup_folds, which holds only the cards a
// person opened ({ sync?: true, reqs?: true }); closed is the default.
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { KEYS } from '../../shared/storage/keys.js';

const FOLDS = { sync: { card: 'setupSyncCard', body: 'setupSyncBody' }, reqs: { card: 'activeReqCard', body: 'activeReqBody' } };
// Shown on the Requirements line while the league has no saved slots yet (the same defaults loadActiveLeagueData fills in).
const DEFAULT_REQS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'WRTE', 'WRRB', 'SFLEX', 'K', 'DEF'];
const SLOT_LABEL = { WRTE: 'W/T', WRRB: 'W/R' };

function stored() {
    try {
        const o = JSON.parse(localStorage.getItem(KEYS.mls.setupFolds) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
}

export function isSetupFoldOpen(which) {
    return State.leagues.length === 0 || stored()[which] === true;
}

function summaryText(which) {
    if (which === 'sync') {
        const n = State.leagues.length;
        return `${n} league${n === 1 ? '' : 's'}`;
    }
    const reqs = (getActiveLeague() || {}).reqs || DEFAULT_REQS;
    return SLOT_ORDER.filter(k => reqs[k] > 0).map(k => `${SLOT_LABEL[k] || k} ${reqs[k]}`).join(' · ');
}

export function renderSetupFolds() {
    const hasLeagues = State.leagues.length > 0;
    Object.entries(FOLDS).forEach(([which, ids]) => {
        const card = document.getElementById(ids.card);
        const body = document.getElementById(ids.body);
        if (!card || !body) return;
        const open = isSetupFoldOpen(which);
        const toggle = card.querySelector('.setup-fold-toggle');
        card.classList.toggle('is-folded', !open);
        card.classList.toggle('has-fold', hasLeagues);
        body.hidden = !open;
        if (toggle) toggle.setAttribute('aria-expanded', String(open));
        const sum = card.querySelector('.setup-fold-summary');
        if (sum) sum.textContent = hasLeagues ? summaryText(which) : '';
    });
}

export function toggleSetupFold(which) {
    if (!FOLDS[which] || State.leagues.length === 0) return;
    const o = stored();
    if (isSetupFoldOpen(which)) delete o[which]; else o[which] = true;
    try {
        if (Object.keys(o).length) localStorage.setItem(KEYS.mls.setupFolds, JSON.stringify(o)); else localStorage.removeItem(KEYS.mls.setupFolds);
    } catch (e) { /* this visit only */ }
    renderSetupFolds();
}
