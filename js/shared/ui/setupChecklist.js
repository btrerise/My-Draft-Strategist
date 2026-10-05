// The generic parts of Lineup Strategist's setup checklist, shared in refactor chunk 8A so Draft
// Strategist can build the same "Setup Progress" box. Taken from renderSetupStep and goToSetupStep
// in js/mls/init.js. Each app keeps its own step list, done conditions and pulse rules. The styles are
// in css/base.css (LIVE INDICATOR: .setup-checklist*, .setup-step-*). Pure: no load-time side effects.

// Fills one setup-checklist <li>. The ✓ / — mark is decorative; the sr-only prefix
// carries the done/not-done state for screen readers. `how` (a sentence of instructions)
// and the jump button only appear on unfinished steps the user can act on right now.
//   done     true once the step is finished
//   label    the step's text (appended as text, so no escaping needed)
//   how      a sentence of instructions, or null when the step can't be acted on yet
//   goLabel  the jump button's text, ending in an arrow (" ↓" / " →"), which its aria-label drops
//   goClass  extra classes for the jump button, before the shared ones (MLS: 'mls-btn-sm')
//   goData   data-* attributes for the jump button, e.g. { action: 'goToSetupStep', step: 'adp' }
//   onGo     a click handler for the jump button, for a page that doesn't delegate it
export function renderSetupStep(li, { done, label, how, goLabel, goClass = '', goData, onGo }) {
    li.classList.toggle('is-done', done);
    li.classList.toggle('is-actionable', !done && !!how);
    const mark = document.createElement('span');
    mark.className = 'setup-step-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = done ? '✓' : '—';
    const body = document.createElement('div');
    body.className = 'setup-step-body';
    const labelEl = document.createElement('div');
    labelEl.className = 'setup-step-label';
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.textContent = done ? 'Done: ' : 'Not done: ';
    labelEl.append(status, label);
    body.append(labelEl);

    if (!done && how) {
        const howEl = document.createElement('p');
        howEl.className = 'setup-step-how';
        howEl.textContent = how;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${goClass ? goClass + ' ' : ''}btn-link-inline setup-step-go`;
        btn.textContent = goLabel;
        btn.setAttribute('aria-label', `${btn.textContent.slice(0, -2)} for ${label}`);
        if (goData) Object.assign(btn.dataset, goData);
        if (onGo) btn.addEventListener('click', onGo);
        body.append(howEl, btn);
    }
    li.replaceChildren(mark, body);
}

// Scrolls a setup card into view and focuses its first control (when that control is visible).
// With reduced motion on, the scroll jumps instead of gliding.
export function scrollToCard(card, focusEl) {
    if (!card) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (focusEl && focusEl.offsetParent !== null) focusEl.focus({ preventScroll: true });
}
