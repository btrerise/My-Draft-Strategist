// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js; app modules may also import it directly.

// --- TOOLTIPS ---
// Shared by MDS, MLS and T-Score. Before this, tooltips only opened on mouse hover: their
// triggers were plain <div>/<span>s that couldn't take keyboard focus, and only MLS had a tap
// handler -- bound per icon at page load, so tooltips rendered later never got one.
// Two kinds of trigger:
//   1. An "i" icon (.tooltip-icon) whose tooltip is the next sibling.
//   2. A .tooltip-container with no icon, where the container itself is the trigger and the
//      tooltip is its direct child: League Command Center status icons and badges, Power
//      Rankings cells, the T-Score badge on Draft Tracker cards.
// Both behave the same:
//   Keyboard: Tab to it to show the tooltip (CSS, :focus-visible); Enter/Space toggles it;
//             Escape hides it.
//   Touch/mouse: tap to toggle; tap anywhere else to close. Taps inside an open tooltip
//             leave it open (Power Rankings tooltips are long enough to scroll or read).
// Everything is delegated from document, and a MutationObserver enhances triggers rendered
// after load. Triggers stay <div>/<span>s rather than becoming <button>s on purpose: several
// icons sit inside a <label>, where a button would become the label's control (tapping the
// label text would open the tooltip), and a <button> can't hold the block-level tooltip
// content the Power Rankings cells use.
(function initTooltips() {
  let tipSeq = 0;
  const TRIGGER = '.tooltip-icon, .tooltip-container[data-tt-self]';
  const noop = () => {};

  const textFor = trigger => {
    if (trigger.classList.contains('tooltip-icon')) {
      const next = trigger.nextElementSibling;
      return next && next.classList.contains('tooltip-text') ? next : null;
    }
    return trigger.querySelector(':scope > .tooltip-text');
  };

  // The trigger's own visible text, not counting its (hidden) tooltip.
  const ownText = el => {
    let t = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) t += n.textContent;
      else if (n.nodeType === 1 && !n.classList.contains('tooltip-text')) t += n.textContent;
    });
    return t.replace(/\s+/g, ' ').trim();
  };

  function enhance(trigger) {
    trigger.setAttribute('data-tt', '');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('role', 'button');
    // iOS Safari only delivers a tap to a document-level listener when the tapped element
    // (or an ancestor below <body>) has a click listener of its own.
    trigger.addEventListener('click', noop);
    const text = textFor(trigger);
    if (!text) return;
    if (!text.id) text.id = `mds-tip-${++tipSeq}`;
    text.setAttribute('role', 'tooltip');
    if (trigger.classList.contains('tooltip-icon')) {
      if (!trigger.hasAttribute('aria-label')) trigger.setAttribute('aria-label', 'More info');
      trigger.setAttribute('aria-describedby', text.id);
    } else if (ownText(trigger)) {
      // A badge or cell with its own visible text ("EARLY", "BB", a rank): that text names
      // it, and the tooltip describes it.
      trigger.setAttribute('aria-describedby', text.id);
    } else if (!trigger.hasAttribute('aria-label')) {
      // Icon-only status markers (a check mark, a warning triangle): the tooltip IS the
      // status, so it becomes the name ("Weekly Rankings Fresh").
      trigger.setAttribute('aria-label', text.textContent.replace(/\s+/g, ' ').trim());
    }
  }

  // Idempotent: data-tt marks triggers already done.
  function enhanceAll() {
    document.querySelectorAll('.tooltip-container:not([data-tt-self]):not([data-tt-skip])').forEach(c => {
      if (!c.querySelector('.tooltip-icon') && c.querySelector(':scope > .tooltip-text')) c.setAttribute('data-tt-self', '');
      else c.setAttribute('data-tt-skip', '');
    });
    document.querySelectorAll(`.tooltip-icon:not([data-tt]), .tooltip-container[data-tt-self]:not([data-tt])`).forEach(enhance);
  }

  function closeAll(except) {
    document.querySelectorAll('.tooltip-text.mobile-visible').forEach(t => {
      if (t !== except) t.classList.remove('mobile-visible');
    });
  }

  function toggle(trigger) {
    const text = textFor(trigger);
    if (!text) return;
    closeAll(text);
    // Open = tapped/pressed open, or keyboard-focused and not dismissed. Hover is deliberately
    // left out: phones keep :hover "stuck" after a tap, which would make every tap read as
    // "already open" and close it instead.
    const open = text.classList.contains('mobile-visible') ||
      (trigger.matches(':focus-visible') && !text.classList.contains('tt-dismissed'));
    text.classList.toggle('mobile-visible', !open);
    text.classList.toggle('tt-dismissed', open);
  }

  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    // A tap inside a tooltip that's open is someone reading it, not closing it.
    const insideText = e.target.closest('.tooltip-text');
    if (insideText && insideText.classList.contains('mobile-visible')) return;
    const trigger = e.target.closest(TRIGGER);
    if (trigger) {
      e.stopPropagation(); // e.g. an icon inside a clickable card header shouldn't also toggle it
      toggle(trigger);
    } else {
      closeAll(null);
    }
  }, true);

  document.addEventListener('keydown', e => {
    const trigger = e.target.closest && e.target.closest(TRIGGER);
    const onTrigger = trigger && e.target === trigger;
    if (onTrigger && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      toggle(trigger);
    } else if (e.key === 'Escape') {
      const open = document.querySelectorAll('.tooltip-text.mobile-visible');
      const focusedText = onTrigger ? textFor(trigger) : null;
      if (open.length === 0 && !(focusedText && !focusedText.classList.contains('tt-dismissed'))) return;
      closeAll(null);
      if (focusedText) focusedText.classList.add('tt-dismissed');
      // Only this Escape: keep it from also closing a menu or dialog behind the tooltip.
      e.stopPropagation();
    }
  }, true);

  // Leaving a trigger resets it, so the next visit (focus or tap) starts from "closed".
  document.addEventListener('focusout', e => {
    if (!e.target.matches || !e.target.matches(TRIGGER)) return;
    const text = textFor(e.target);
    if (text) text.classList.remove('tt-dismissed', 'mobile-visible');
  });

  const start = () => {
    enhanceAll();
    // Catch triggers rendered after load (verdict banners, the league table, Power Rankings,
    // re-rendered cards). Batched to one pass per frame, and the pass only touches triggers
    // not already enhanced.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; enhanceAll(); });
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
