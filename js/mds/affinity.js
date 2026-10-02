// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// 5-COLOR AFFINITY SYSTEM (cycleAffinity).
import { State } from './state.js';
import { savePlayerPool } from './storage.js';
import { renderBoard } from './tracker.js';

    // --- 5-COLOR AFFINITY SYSTEM ---
    export const cycleAffinity = function(e, id) {
        e.preventDefault();
        e.stopPropagation();
        
        let p = State.players.find(x => x.id === id);
        if (p) {
            // Cycle 0 (Empty) -> 1 (Green) -> 2 (Yellow) -> 3 (Orange) -> 4 (Red) -> 5 (Purple)
            p.affinity = ((p.affinity || 0) + 1) % 6;
            
            savePlayerPool();
            renderBoard();
        }
    };
