// The Final Window's shared simulation (improvements S36), off the main thread: 10,000 runs over 15 matchups took about
// 34 ms on a fast machine, so well over 100 ms on a 4x-slower phone. A module worker, so the math is lastWindow.js's
// own and lives in one place. Maps don't survive postMessage, so the chances go back as [key, share] pairs.
import { simulateWindow } from './lastWindow.js';

self.onmessage = (e) => {
    const { id, matchups, runs } = e.data || {};
    try {
        const res = simulateWindow(matchups || [], { runs });
        self.postMessage({ id, chances: [...res.chances], tiles: res.tiles, runs: res.runs });
    } catch (err) {
        self.postMessage({ id, error: String(err && err.message || err) });
    }
};
