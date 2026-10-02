// Moved from js/mds.js in refactor chunk 2A:
// toggleQueue and QUEUE REORDERING LOGIC.
import { getActiveDraft, saveActiveDraftState } from './state.js';
import { renderBoard } from './tracker.js';

    export const toggleQueue = function(id) {
        let draft = getActiveDraft();
        if (!draft) return;
        
        if (!draft.queue) draft.queue = [];

        if (draft.queue.includes(id)) {
            draft.queue = draft.queue.filter(qId => qId !== id);
        } else {
            draft.queue.push(id);
        }

        saveActiveDraftState();
        renderBoard();
    };

// --- QUEUE REORDERING LOGIC ---
    let draggedQueueIndex = null;

    export const handleQueueDragStart = function(e, index) {
        draggedQueueIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
    };

    export const handleQueueDragOver = function(e) {
        e.preventDefault(); // Required to allow drop
        e.dataTransfer.dropEffect = 'move';
    };

    export const handleQueueDragEnd = function(e) {
        e.currentTarget.style.opacity = '1';
        draggedQueueIndex = null;
    };

    export const handleQueueDrop = function(e, targetIndex) {
        e.preventDefault();
        if (draggedQueueIndex === null || draggedQueueIndex === targetIndex) return;

        let draft = getActiveDraft();
        if (!draft || !draft.queue) return;

        let draftedPlayers = draft.draftedPlayers || [];
        let activeQueue = draft.queue.filter(id => !draftedPlayers.includes(id));

        // Move the dragged item to the new index
        const [movedItem] = activeQueue.splice(draggedQueueIndex, 1);
        activeQueue.splice(targetIndex, 0, movedItem);

        // Combine back with any already-drafted queued items
        let draftedQueue = draft.queue.filter(id => draftedPlayers.includes(id));
        draft.queue = [...activeQueue, ...draftedQueue];

        saveActiveDraftState();
        renderBoard();
    };

    export const moveQueueItem = function(index, direction) {
        let draft = getActiveDraft();
        if (!draft || !draft.queue) return;

        let draftedPlayers = draft.draftedPlayers || [];
        let activeQueue = draft.queue.filter(id => !draftedPlayers.includes(id));

        let targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= activeQueue.length) return;

        const [movedItem] = activeQueue.splice(index, 1);
        activeQueue.splice(targetIndex, 0, movedItem);

        let draftedQueue = draft.queue.filter(id => draftedPlayers.includes(id));
        draft.queue = [...activeQueue, ...draftedQueue];

        saveActiveDraftState();
        renderBoard();
    };
