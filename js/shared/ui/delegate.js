// --- EVENT DELEGATION FOR data-action ATTRIBUTES ---
// Added in refactor chunk 5A to replace inline on*="..." handlers. Markup names an action and
// carries its arguments as data-* attributes instead of holding code:
//
//     <button data-action="showTab" data-tab="setup">
//
// and the page's entry module (js/mds/main.js) adds ONE listener per container and event type:
//
//     delegate(document.getElementById('main'), 'click', {
//         showTab() { showTab(this.dataset.tab); },
//     });
//
// On each event the listener walks the event's path from its target up to the container and
// calls every element's action that this table has, nearest first, the order the inline
// handlers fired in while the event bubbled. Each action is called with `this` set to its
// element (what `this` was in the inline handler) and gets (event, element). Note that
// event.currentTarget is the container, not the element: a handler that used to read
// event.currentTarget must take the element as an argument instead. If an action stops
// propagation, the walk stops too.
//
// Action names must be unique per page across event types: an element's data-action should
// appear only in the tables for the events it handles (a checkbox's change action must not
// also be a click action, or clicking it would run both).
//
// The listener runs in the capture phase, so it also sees events that don't bubble: an
// <img>'s `error`, or a script's `new Event('change')` without `bubbles: true`. An inline
// handler on the element saw those too. The walk still calls actions nearest first. One
// Two differences from inline handlers remain; check for both before reusing this elsewhere:
//   - A listener added with addEventListener on an element between the target and the container
//     now runs after the actions, not before (Draft Strategist has none).
//   - An event fired on an element an earlier handler detached never reaches the container. The
//     case that matters is `dragend` after a drop re-rendered the list; listen on the element
//     itself for it (js/mds/main.js does, for the queue cards).
export function delegate(container, type, actions) {
    if (!container) return;
    container.addEventListener(type, (event) => {
        // composedPath() is the propagation path fixed when the event was dispatched, so an
        // action that re-renders (and detaches) its own element doesn't cut the walk short.
        for (const el of event.composedPath()) {
            const name = el.dataset?.action;
            if (name !== undefined && Object.hasOwn(actions, name)) {
                actions[name].call(el, event, el);
                if (event.cancelBubble) return;
            }
            if (el === container) return;
        }
    }, true);
}
