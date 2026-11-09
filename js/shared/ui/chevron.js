// Chevrons that turn with their fold (improvements F11). The turn itself is CSS: the shared .chevron rule in
// css/base.css (CHEVRONS) sets each chevron's angle from its toggle's state ([open] on a <details>, or
// aria-expanded on a button) and eases between them at the Dashboard's speed (--vt-ms, --vt-ease), with no turn
// under Reduce Motion. That works whenever a fold flips its state in place.
//
// A few folds redraw their whole box on every click (the Lineup tab's "This lineup needs you" title, Draft
// Strategist's My Queue), so the chevron after the click is a new element with nothing to turn from.
// turnChevronAcrossRedraw reads the old chevron's angle, runs the redraw, and plays the turn on the new chevron
// from that angle, with the duration and curve the CSS rule gives it (so Reduce Motion's "transition: none"
// means no turn here either).
//
//   selector  finds the fold's chevron, before and after the redraw
//   redraw    the function that redraws it (synchronous)
export function turnChevronAcrossRedraw(selector, redraw) {
    const before = document.querySelector(selector);
    const from = before ? getComputedStyle(before).transform : null;
    redraw();
    const after = document.querySelector(selector);
    if (!after || after === before || from === null || typeof after.animate !== 'function') return;
    const style = getComputedStyle(after);
    const to = style.transform;
    // Computed durations are always in seconds ("0.275s"). The rule has one transition (transform), so the
    // timing function is a single value such as "cubic-bezier(0.2, 0, 0, 1)".
    const ms = parseFloat(style.transitionDuration) * 1000;
    if (!ms || from === to) return;
    after.animate([{ transform: from }, { transform: to }], { duration: ms, easing: style.transitionTimingFunction });
}
