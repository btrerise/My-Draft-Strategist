// Loads js/utils.js -- a plain browser script, not a module -- into a node:vm context, the way
// a page's first <script> tag would run it, and returns the globals the unit tests need.
//
// utils.js touches the DOM at load time (load/DOMContentLoaded listeners, a MutationObserver
// for tooltips, a localStorage wrapper), so the context gets a permissive stub where any
// property read or call returns another stub. None of the functions under test touch it.
//
// Its top-level `function` declarations become properties of the context's global object.
// Its top-level `const`s (NAME_ALIASES) don't, but they live in the context's shared script
// scope, so a second runInContext can read them.
//
// When chunk 1A splits utils.js, update UTILS_PATH (or point this at the new names module).
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const UTILS_PATH = fileURLToPath(new URL('../../../js/utils.js', import.meta.url));

function anything() {
    const fn = function () {};
    return new Proxy(fn, {
        get(_t, key) {
            if (key === Symbol.toPrimitive) return () => '';
            if (key === Symbol.iterator) return function* () {};
            if (key === 'then') return undefined; // not a thenable
            return anything();
        },
        apply() { return anything(); },
        construct() { return anything(); },
        set() { return true; }
    });
}

export function loadUtils() {
    const ctx = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        document: anything(),
        navigator: anything(),
        localStorage: anything(),
        sessionStorage: anything(),
        MutationObserver: class { observe() {} disconnect() {} },
        addEventListener() {},
        removeEventListener() {}
    };
    ctx.window = ctx;
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(UTILS_PATH, 'utf8'), ctx, { filename: UTILS_PATH });

    return {
        context: ctx,
        normalizeName: ctx.normalizeName,
        isNameMatch: ctx.isNameMatch,
        findCsvQuoteProblem: ctx.findCsvQuoteProblem,
        // Copied out of the vm realm so deepEqual against a plain object literal works.
        NAME_ALIASES: JSON.parse(vm.runInContext('JSON.stringify(NAME_ALIASES)', ctx))
    };
}
