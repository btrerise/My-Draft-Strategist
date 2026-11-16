// Moved verbatim from js/utils.js in refactor chunk 1A. An ES module: the code that uses it imports it.
// js/shared/globals.js also puts showToast on window for js/boot.js, a plain script.

// --- TOAST NOTIFICATIONS ---
// Batch operations (optimizeAllLineups, syncAllLeagues) call a per-league routine that toasts
// on its own, so firing N of them in a row is spam. Those callers suppress toasts for the
// length of the loop and report one summary at the end. They flip this flag rather than
// reassigning window.showToast to a no-op: a monkey-patch that never gets restored -- a throw
// mid-loop, an early return that skips the restore line -- silently kills every toast in the
// app for the rest of the session, including the error toast that would have explained why.
let toastsSuppressed = false;
export const setToastsSuppressed = function(suppressed) {
  toastsSuppressed = !!suppressed;
};

export const showToast = function(message, options = {}) {
  // options.force lets a batch caller surface something that genuinely matters (its summary,
  // or a failure) without having to unsuppress around the call.
  if (toastsSuppressed && !options.force) return;

  const isError = options.isError || false;
  // options.action, { label, onClick } (improvements S35): a button in the toast that does the thing it suggests ("Turn
  // on"); the toast closes after it runs. A toast with one stays longer, so there's time to reach the button.
  const action = options.action && options.action.label && typeof options.action.onClick === 'function' ? options.action : null;
  // Material 3's snackbar (improvements M18): an error stays until ✕ (it's what explains a failure, and a timed one is
  // easy to miss); a toast with an action gets 8s; anything else 4s plus 1s per 40 characters, at most 8s.
  const duration = options.duration || (isError ? Infinity : action ? 8000 : Math.min(8000, 4000 + 1000 * Math.floor(String(message).length / 40)));
  // Never over a dialog or a sheet: one that's open holds the toast until it closes (the latest toast wins).
  if (openModal()) { waitForModal(() => showToast(message, options)); return; }

  const toast = getToastElement();
  const messageEl = toast.querySelector('.toast-message');

  toast.classList.toggle('toast-error', isError);
  messageEl.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  // The message is plain text, never HTML. Toasts regularly carry names from outside the app:
  // league names set by other people on Sleeper, player names and file names from uploaded
  // files, draft names. Rendering them as HTML let markup in any of those run as script on
  // this site. \n still becomes a line break (as in the alert() messages this replaces),
  // added as <br> elements between text nodes rather than spliced into an HTML string.
  messageEl.textContent = '';
  String(message).split('\n').forEach((line, i) => {
    if (i > 0) messageEl.appendChild(document.createElement('br'));
    messageEl.appendChild(document.createTextNode(line));
  });

  const actionBtn = toast.querySelector('.toast-action-btn');
  actionBtn.hidden = !action;
  actionBtn.textContent = action ? action.label : '';
  toast.toastAction = action ? action.onClick : null;

  void toast.offsetWidth; // Force CSS reflow to ensure animation replays
  toast.classList.add('show');

  // A new message resets the countdown and any tap-to-hold from the previous one, but not
  // hover/focus -- if the pointer or focus is already on the toast, the new message waits too.
  toast.toastPinned = false;
  toast.toastRemaining = duration;
  resumeToastTimer(toast);
};

// Toast timing: the countdown pauses while the toast is hovered (mouse), holds focus (keyboard),
// or -- error toasts only -- has been tapped (touch: phones have no hover, so a tap holds it
// until ✕). Long, multi-line upload errors are the reason: they're easy to lose mid-read
// otherwise. Success toasts are click-through except for ✕ (see .mds-toast.show in css/base.css),
// so on those only hovering or focusing the ✕ pauses them, and taps pass through to the lineup
// underneath. toastRemaining carries the time left across a pause, so leaving the toast
// resumes rather than restarts the countdown.
// A dialog or sheet on screen: every one in the three apps says aria-modal="true" (sheet.js, confirm.js, prompt.js, the
// upload previews); hidden ones have no boxes.
const openModal = () => [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0);
let pendingToast = null;
function waitForModal(show) {
  const waiting = !!pendingToast;
  pendingToast = show;
  if (waiting) return;
  const check = () => {
    if (openModal()) { setTimeout(check, 250); return; }
    const run = pendingToast;
    pendingToast = null;
    run();
  };
  setTimeout(check, 250);
}

function getToastElement() {
  let toast = document.getElementById('mds-toast');
  if (toast) return toast;

  toast = document.createElement('div');
  toast.id = 'mds-toast';
  toast.className = 'mds-toast';
  // The live region is the message only, so the ✕ button's label isn't read out with every toast.
  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.setAttribute('role', 'status');
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast-dismiss-btn';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', () => hideToast(toast));
  // The optional action (showToast's options.action), hidden until a toast has one. Not inside the live region, like ✕.
  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = 'toast-action-btn';
  actionBtn.hidden = true;
  actionBtn.addEventListener('click', () => {
    const run = toast.toastAction;
    hideToast(toast);
    if (run) run();
  });
  toast.append(messageEl, actionBtn, dismiss);

  toast.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') { toast.toastHovered = true; pauseToastTimer(toast); }
  });
  toast.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') { toast.toastHovered = false; resumeToastTimer(toast); }
  });
  toast.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && toast.classList.contains('toast-error') && !dismiss.contains(e.target)) {
      toast.toastPinned = true;
      pauseToastTimer(toast);
    }
  });
  toast.addEventListener('focusin', () => { toast.toastFocused = true; pauseToastTimer(toast); });
  toast.addEventListener('focusout', (e) => {
    if (toast.contains(e.relatedTarget)) return;
    toast.toastFocused = false;
    resumeToastTimer(toast);
  });
  toast.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideToast(toast); });

  document.body.appendChild(toast);
  return toast;
}

function pauseToastTimer(toast) {
  if (!toast.hideTimeout) return;
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = null;
  toast.toastRemaining = Math.max(0, toast.toastRemaining - (Date.now() - toast.toastStartedAt));
}

function resumeToastTimer(toast) {
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = null;
  if (!toast.classList.contains('show') || toast.toastHovered || toast.toastFocused || toast.toastPinned) return;
  if (!Number.isFinite(toast.toastRemaining)) return; // an error: until ✕
  // Always leave a moment to finish reading after the pointer/focus moves off.
  const remaining = Math.max(toast.toastRemaining, 1500);
  toast.toastStartedAt = Date.now();
  toast.toastRemaining = remaining;
  toast.hideTimeout = setTimeout(() => hideToast(toast), remaining);
}

function hideToast(toast) {
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = null;
  // Hide before blurring: blur fires focusout, and resumeToastTimer must see the toast as
  // already hidden or it would start a fresh countdown.
  toast.classList.remove('show');
  // Don't strand keyboard focus on a button that's now hidden.
  if (toast.contains(document.activeElement)) document.activeElement.blur();
  // Reset all hold state. A hidden toast takes no pointer events, so pointerleave may never
  // fire after a mouse click on ✕ -- a stale hover flag would freeze the next toast open.
  toast.toastPinned = false;
  toast.toastFocused = false;
  toast.toastHovered = false;
}
