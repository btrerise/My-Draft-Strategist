// Added in improvements S2 (renaming a ranking set). An ES module: the code that uses it imports it.
import { createFocusTrap } from './focusTrap.js';

// --- SHARED IN-APP TEXT-INPUT DIALOG ---
// showPrompt() is showConfirm's (js/shared/ui/confirm.js) sibling for questions that need a
// typed answer, in place of window.prompt(): same overlay and card (.mds-modal-overlay /
// .mds-modal), same focus trap, same ways out (Cancel, Escape, a click on the backdrop). The
// markup is built here on first use, so any page that imports this gets the dialog.
//
// Every string goes in through textContent or .value, never innerHTML: the default value is
// usually something the user typed earlier (a ranking set's name), and the validator's messages
// often quote it back.
let promptDialogEls = null;
let promptDialogOpen = false;

function buildPromptDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'mds-prompt-overlay';
    overlay.className = 'mds-modal-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mds-prompt-title');
    overlay.innerHTML = `
        <form class="mds-modal mds-prompt-modal" novalidate>
            <h3 id="mds-prompt-title"></h3>
            <label for="mds-prompt-input" id="mds-prompt-label" class="mds-prompt-label"></label>
            <input type="text" id="mds-prompt-input" class="form-input" autocomplete="off" aria-describedby="mds-prompt-msg">
            <p id="mds-prompt-msg" class="mds-prompt-msg" aria-live="polite"></p>
            <div class="mds-modal-actions">
                <button type="button" class="btn btn-secondary" data-prompt-action="cancel"></button>
                <button type="submit" class="btn btn-primary" data-prompt-action="ok"></button>
            </div>
        </form>`;
    document.body.appendChild(overlay);
    return {
        overlay,
        form: overlay.querySelector('form'),
        titleEl: overlay.querySelector('#mds-prompt-title'),
        labelEl: overlay.querySelector('#mds-prompt-label'),
        inputEl: overlay.querySelector('#mds-prompt-input'),
        msgEl: overlay.querySelector('#mds-prompt-msg'),
        cancelBtn: overlay.querySelector('[data-prompt-action="cancel"]'),
        okBtn: overlay.querySelector('[data-prompt-action="ok"]')
    };
}

/**
 * In-app replacement for window.prompt(). Resolves the trimmed text when the person saves, or
 * null if they cancel, press Escape, or click the backdrop.
 *
 * @param {string} label - The input's visible label.
 * @param {{ title?: string, value?: string, placeholder?: string, maxLength?: number,
 *   confirmText?: string, cancelText?: string,
 *   validate?: (text: string) => ({ error?: string, warning?: string } | null) }} [options]
 *   validate gets the trimmed text on every keystroke and on Save. An `error` is shown and keeps
 *   the dialog open on Save; a `warning` is shown but doesn't stop it.
 * @returns {Promise<string|null>}
 */
export const showPrompt = function(label, options = {}) {
    // One dialog at a time, for the same reason as showConfirm: two stacked focus traps would
    // hand focus back into each other.
    if (promptDialogOpen) return Promise.resolve(null);
    if (!promptDialogEls) promptDialogEls = buildPromptDialog();

    const { overlay, form, titleEl, labelEl, inputEl, msgEl, cancelBtn, okBtn } = promptDialogEls;
    const validate = typeof options.validate === 'function' ? options.validate : () => null;
    titleEl.textContent = options.title || '';
    labelEl.textContent = label || '';
    inputEl.value = options.value || '';
    inputEl.placeholder = options.placeholder || '';
    if (options.maxLength) inputEl.maxLength = options.maxLength;
    else inputEl.removeAttribute('maxlength');
    cancelBtn.textContent = options.cancelText || 'Cancel';
    okBtn.textContent = options.confirmText || 'Save';

    // Returns true when the text can be saved.
    function showCheck() {
        const result = validate(inputEl.value.trim()) || {};
        const message = result.error || result.warning || '';
        msgEl.textContent = message;
        msgEl.className = 'mds-prompt-msg' + (result.error ? ' is-error' : result.warning ? ' is-warning' : '');
        if (result.error) inputEl.setAttribute('aria-invalid', 'true');
        else inputEl.removeAttribute('aria-invalid');
        return !result.error;
    }
    showCheck();

    promptDialogOpen = true;
    overlay.style.display = 'flex';

    return new Promise(resolve => {
        let trap = null;

        function settle(result) {
            if (!promptDialogOpen) return;
            promptDialogOpen = false;
            overlay.style.display = 'none';
            form.removeEventListener('submit', onSubmit);
            inputEl.removeEventListener('input', onInput);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('mousedown', onBackdrop);
            if (trap) trap.deactivate();
            resolve(result);
        }

        // Save button and Enter in the field both land here (the form's submit).
        function onSubmit(e) {
            e.preventDefault();
            if (!showCheck()) { inputEl.focus(); return; }
            settle(inputEl.value.trim());
        }
        function onInput() { showCheck(); }
        function onCancel() { settle(null); }
        // mousedown, as in showConfirm, so a text selection dragged out of the card isn't a dismissal.
        function onBackdrop(e) { if (e.target === overlay) settle(null); }

        form.addEventListener('submit', onSubmit);
        inputEl.addEventListener('input', onInput);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('mousedown', onBackdrop);

        // The input is first in the DOM, so the trap focuses it; select its text so typing replaces it.
        trap = createFocusTrap(overlay, { onEscape: () => settle(null) });
        trap.activate();
        inputEl.select();
    });
};
