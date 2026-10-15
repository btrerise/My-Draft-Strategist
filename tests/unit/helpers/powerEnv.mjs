// Loads js/mls/power/shared.js (computePositionalPower) in Node (improvements S14). shared.js imports
// ../helpers.js and ./futureValue.js, which pull in State and the whole Lineup Strategist page. A
// module-resolution hook answers those two imports, only when shared.js makes them, with stubs:
// rankingIndex as the real one builds it (first row per clean name), and an age factor of 1 (the
// tests don't ask for future value). Same pattern as playersEnv.mjs.
import { register } from 'node:module';

const stub = (code) => 'data:text/javascript,' + encodeURIComponent(code);
const STUBS = {
    '../helpers.js': stub(`export function rankingIndex(arr) {
        const idx = new Map();
        (arr || []).forEach(r => { if (r && r.cleanName && !idx.has(r.cleanName)) idx.set(r.cleanName, r); });
        return idx;
    }`),
    './futureValue.js': stub('export const powerAgeFactor = () => 1;'),
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
    if (context.parentURL && /\\/js\\/mls\\/power\\/shared\\.js(\\?.*)?$/.test(context.parentURL) && STUBS[specifier]) {
        return { url: STUBS[specifier], shortCircuit: true };
    }
    return next(specifier, context);
}
`;
register(stub(HOOKS));

export const loadPower = () => import('../../../js/mls/power/shared.js');
