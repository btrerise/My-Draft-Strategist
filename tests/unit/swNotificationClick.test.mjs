// sw.js's notificationclick listener (improvements N2): a tap on a notification focuses the page it names if a window
// has it open, else opens it. sw.js runs here in a vm context with a stubbed `self`, `clients` and `caches`; its install,
// activate and fetch listeners are registered but never fired.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');

function loadSw(windows) {
    const listeners = {};
    const calls = { focused: [], opened: [] };
    const clients = {
        matchAll: async (opts) => { calls.matchAll = opts; return windows.map(url => ({ url, focus: async () => { calls.focused.push(url); } })); },
        openWindow: async (url) => { calls.opened.push(url); },
        claim: async () => {},
    };
    const self = { addEventListener: (type, fn) => { listeners[type] = fn; }, clients, skipWaiting() {} };
    vm.runInNewContext(SW, { self, caches: {}, console, URL, Request: class {}, fetch: () => {} });
    const click = async (data) => {
        let closed = false;
        let wait = null;
        listeners.notificationclick({ notification: { data, close() { closed = true; } }, waitUntil(p) { wait = p; } });
        await wait;
        return { closed, ...calls };
    };
    return { listeners, click };
}

describe('notificationclick', () => {
    test('is registered', () => {
        assert.equal(typeof loadSw([]).listeners.notificationclick, 'function');
    });
    test('focuses an open /lineup/ and closes the notification', async () => {
        const r = await loadSw(['http://localhost/', 'http://localhost/lineup/?week=6']).click({ url: '/lineup/' });
        assert.equal(r.closed, true);
        assert.deepEqual(r.focused, ['http://localhost/lineup/?week=6']);
        assert.deepEqual(r.opened, []);
        assert.equal(r.matchAll.type, 'window');
        assert.equal(r.matchAll.includeUncontrolled, true);
    });
    test('opens /lineup/ when no window has it', async () => {
        const r = await loadSw(['http://localhost/t-score/']).click({ url: '/lineup/' });
        assert.deepEqual(r.focused, []);
        assert.deepEqual(r.opened, ['/lineup/']);
    });
    test('"/" is Draft Strategist only, never /lineup/', async () => {
        const r = await loadSw(['http://localhost/lineup/']).click({ url: '/' });
        assert.deepEqual(r.opened, ['/']);
        const r2 = await loadSw(['http://localhost/lineup/', 'http://localhost/index.html']).click({ url: '/' });
        assert.deepEqual(r2.focused, ['http://localhost/index.html']);
    });
    test('no url, or one off the site: the site root', async () => {
        assert.deepEqual((await loadSw([]).click(undefined)).opened, ['/']);
        assert.deepEqual((await loadSw([]).click({ url: 'https://example.com/' })).opened, ['/']);
    });
});
