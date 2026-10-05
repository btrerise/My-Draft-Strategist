// Loads js/mls/players.js in Node (added in refactor 9C for getCleanNameToIdIndex). players.js imports
// js/mls/main.js and state.js, which pull in the whole Lineup Strategist page; entered from players.js
// they also hit the temporal dead zone (rule 5 in the runbook). A module-resolution hook (node:module
// register, no flag needed in Node 22) answers players.js's app imports with stubs instead:
//   main.js, state.js, ui/toast.js -- the names players.js imports, doing nothing;
//   api/sleeper.js                 -- getSleeperPlayerMap() resolves to the map passed to loadPlayers
//                                     and counts its calls in `fetches`.
// names.js and html.js are the real modules. Only imports made BY a players.js are redirected, so
// nothing else changes.
//
// loadPlayers(map, url) imports a fresh instance of players.js (a new query string each time), so each
// test gets its own session cache. `url` defaults to the working tree's file; scripts can point it
// at another checkout's players.js (an old version, for comparison). The sleeper stub is shared by
// every instance and reads the map of the latest loadPlayers call, so finish with one instance's
// first getCleanNameToIdIndex() call before loading the next.
import { register } from 'node:module';

const stub = (code) => 'data:text/javascript,' + encodeURIComponent(code);
const STUBS = {
    './main.js': stub('export const runScout = () => {};'),
    './state.js': stub('export const State = {};'),
    '../shared/ui/toast.js': stub('export const showToast = () => {};'),
    '../shared/api/sleeper.js': stub('export const getSleeperPlayerMap = () => globalThis.__playersEnv.getMap();'),
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
    if (context.parentURL && /\\/js\\/mls\\/players\\.js(\\?.*)?$/.test(context.parentURL) && STUBS[specifier]) {
        return { url: STUBS[specifier], shortCircuit: true };
    }
    return next(specifier, context);
}
`;
register(stub(HOOKS));

export const PLAYERS_URL = new URL('../../../js/mls/players.js', import.meta.url).href;

let instance = 0;
export async function loadPlayers(map, url = PLAYERS_URL) {
    const env = { fetches: 0, getMap: async () => { env.fetches++; return map; } };
    globalThis.__playersEnv = env;
    const mod = await import(`${url}?instance=${++instance}`);
    return { mod, env };
}
