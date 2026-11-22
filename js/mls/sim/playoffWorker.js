// The playoff chances' simulation (improvements S55) off the main thread: one league per message.
// A module worker (sim/playoffOdds.js starts it with type: 'module'), so it shares sim/playoffs.js with the unit tests.
import { simulatePlayoffs } from './playoffs.js';

self.onmessage = (e) => {
    const { id, input } = e.data || {};
    try {
        self.postMessage({ id, result: simulatePlayoffs(input) });
    } catch (err) {
        self.postMessage({ id, error: String(err && err.message || err) });
    }
};
