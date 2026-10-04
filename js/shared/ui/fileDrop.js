// Moved verbatim from js/utils.js in refactor chunk 1A. Has load-time side effects, so js/shared/globals.js
// imports it on every page (in the old utils.js order); code that uses its exports imports it too.
import { showToast } from './toast.js';

// --- DRAG-AND-DROP FILE UPLOAD ---
// Lets a file be dropped onto an upload area instead of going through the file picker. A
// dropped file is handed to the area's existing <input type="file"> and a 'change' event is
// fired, so everything downstream (parsing, the preview, every error message) runs exactly as
// if the file had been picked. Nothing about the upload paths themselves had to change.
//
// zone:      the element that accepts drops (usually the whole upload card, a big target).
// pickInput: (event) => the <input type="file"> this drop should go to, or null to refuse it.
//            A function rather than a fixed input so a zone can route by state (MLS: the
//            single-file input, or in multi-file mode the position box the file landed on).
// refuseMessage: (event) => text for a refused drop, when pickInput returned null.
//
// The dropped file is checked against the input's `accept` extensions. The file picker
// enforces those; a drop bypasses them, and the rankings parser would otherwise read a
// dropped PDF or image as CSV.
export const enableFileDrop = function(zone, { pickInput, refuseMessage } = {}) {
  if (!zone || typeof pickInput !== 'function') return;
  let depth = 0; // dragenter/dragleave fire for every child element crossed; count them
  const hasFiles = e => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  const clear = () => { depth = 0; zone.classList.remove('mds-drop-active'); };

  zone.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    zone.classList.add('mds-drop-active');
  });
  zone.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // required, or the browser never fires 'drop' here
    e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('mds-drop-active');
  });
  zone.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation(); // handled here; keeps the page-level guard below out of it
    clear();

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const input = pickInput(e);
    if (!input) {
      const msg = typeof refuseMessage === 'function' ? refuseMessage(e) : '';
      if (msg) showToast(msg, { isError: true });
      return;
    }
    if (input.disabled) {
      showToast('Wait for the current upload to finish, then drop the file again.', { isError: true });
      return;
    }
    if (files.length > 1) {
      showToast(`Drop one file at a time here (you dropped ${files.length}).`, { isError: true });
      return;
    }
    const file = files[0];
    const exts = String(input.accept || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s.startsWith('.'));
    if (exts.length && !exts.some(ext => file.name.toLowerCase().endsWith(ext))) {
      const list = exts.length > 1 ? `${exts.slice(0, -1).join(', ')} or ${exts[exts.length - 1]}` : exts[0];
      showToast(`"${file.name}" isn't a file this upload can read. Drop a ${list} file.`, { isError: true });
      return;
    }
    try {
      input.files = files; // shows the file's name in the input, same as picking it
    } catch (err) {
      console.error('Could not attach dropped file:', err);
      showToast("Your browser didn't accept the dropped file. Use the file picker instead.", { isError: true });
      return;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // A drag cancelled with Escape, or dropped elsewhere, never fires dragleave on the zone.
  document.addEventListener('dragend', clear);
  document.addEventListener('drop', clear);
};

// A file dropped anywhere OUTSIDE an upload area would make the browser open it in place of
// the app, leaving the page and throwing away anything unsaved. That's easy to do by missing
// the target by a few pixels, so the default is blocked page-wide for file drags. The cursor
// shows "not allowed" there, and drops on real upload areas are handled above. Text drags
// (e.g. into the paste box) aren't files and are left alone.
(function guardStrayFileDrops() {
  const isFileDrag = e => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragover', e => {
    if (!isFileDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  });
  window.addEventListener('drop', e => {
    if (isFileDrag(e)) e.preventDefault();
  });
})();
