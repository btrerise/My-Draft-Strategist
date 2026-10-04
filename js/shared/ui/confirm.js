// Moved verbatim from js/utils.js in refactor chunk 1A. An ES module: the code that uses it imports it.
import { createFocusTrap } from './focusTrap.js';

// --- SHARED IN-APP CONFIRM DIALOG ---
// showConfirm() replaces window.confirm() across all three pages. Native confirm()
// freezes the whole page, can't be styled to match the app, and on mobile browsers renders
// with the site's origin in its title bar, which reads like a security warning rather than
// a question the app is asking. This keeps the same "stop and answer" semantics but inside
// the app, reusing the same overlay treatment as the rankings preview modal.
//
// Returns a Promise<boolean>, so call sites become `if (!await showConfirm(...)) return;`
// and the enclosing function picks up an `async`. Every caller is an onclick handler whose
// return value is discarded, so nothing downstream had to change.
//
// The markup is built here on first use rather than written into index.html, lineup/index.html
// and t-score/index.html, so all three apps get the dialog from this one shared script - the
// same reason showToast further down builds its own element.
let confirmDialogEls = null;
let confirmDialogOpen = false;

function escapeForDialog(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// A blank line starts a new paragraph, a single newline is a line break - matching how the
// confirm() messages this replaces were already formatted. Escaped first: these messages
// interpolate names the user typed (ranking sets, leagues, filenames) and names that came
// back from Sleeper, and unlike confirm() an innerHTML sink would treat those as markup.
function dialogMessageHTML(message) {
    return String(message)
        .split(/\n{2,}/)
        .map(block => `<p>${escapeForDialog(block).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function buildConfirmDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'mds-confirm-overlay';
    overlay.className = 'mds-modal-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mds-confirm-title');
    overlay.setAttribute('aria-describedby', 'mds-confirm-body');
    overlay.innerHTML = `
        <div class="mds-modal mds-confirm-modal">
            <h3 id="mds-confirm-title"></h3>
            <div id="mds-confirm-body" class="mds-confirm-body"></div>
            <div class="mds-modal-actions">
                <button type="button" class="btn btn-secondary" data-confirm-action="cancel"></button>
                <button type="button" class="btn" data-confirm-action="ok"></button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return {
        overlay,
        titleEl: overlay.querySelector('#mds-confirm-title'),
        bodyEl: overlay.querySelector('#mds-confirm-body'),
        cancelBtn: overlay.querySelector('[data-confirm-action="cancel"]'),
        okBtn: overlay.querySelector('[data-confirm-action="ok"]')
    };
}

/**
 * In-app replacement for window.confirm(). Resolves true if the person confirms, false if
 * they cancel, press Escape, or click the backdrop.
 *
 * @param {string} message - Body text. Blank lines become separate paragraphs.
 * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 *   danger styles the confirm button red (.btn-danger) for anything that destroys data;
 *   everything else gets the normal green primary button.
 * @returns {Promise<boolean>}
 */
export const showConfirm = function(message, options = {}) {
    // Two open dialogs would stack two focus traps on each other, and the second one's
    // deactivate() would restore focus into the first. The overlay covers the page while it's
    // open so this should be unreachable - answer "no" rather than half-open a second copy.
    if (confirmDialogOpen) return Promise.resolve(false);
    if (!confirmDialogEls) confirmDialogEls = buildConfirmDialog();

    const { overlay, titleEl, bodyEl, cancelBtn, okBtn } = confirmDialogEls;
    titleEl.textContent = options.title || 'Are you sure?';
    bodyEl.innerHTML = dialogMessageHTML(message);
    cancelBtn.textContent = options.cancelText || 'Cancel';
    okBtn.textContent = options.confirmText || 'Confirm';
    okBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';

    confirmDialogOpen = true;
    overlay.style.display = 'flex';

    return new Promise(resolve => {
        let trap = null;

        function settle(result) {
            if (!confirmDialogOpen) return;
            confirmDialogOpen = false;
            overlay.style.display = 'none';
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            overlay.removeEventListener('mousedown', onBackdrop);
            if (trap) trap.deactivate();
            resolve(result);
        }

        function onCancel() { settle(false); }
        function onOk() { settle(true); }

        // Clicking the dimmed area outside the card cancels, same as Escape. mousedown rather
        // than click so a drag that starts on the card and ends on the backdrop (selecting the
        // message text, say) isn't read as a dismissal.
        function onBackdrop(e) { if (e.target === overlay) settle(false); }

        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        overlay.addEventListener('mousedown', onBackdrop);

        // Cancel is first in the DOM, so the trap lands initial focus there rather than on a
        // destructive confirm button - Enter on an unread dialog does the safe thing.
        trap = createFocusTrap(overlay, { onEscape: () => settle(false) });
        trap.activate();
    });
};
