// Tab-switch timing with 21 leagues on a 4x-slowed CPU (improvements S17; S16's method). Opt-in:
//
//   cd tests && npm run perf:tabs                       # the working tree
//   PERF_REF=origin/main npm run perf:tabs              # a git ref, for a before/after
//
// Lineup Strategist with the fixture league synced and ranked, then cloned 20 times in storage (21 leagues),
// reloaded, and the CPU slowed 4x through the DevTools protocol. Each switch below is made ROUNDS times with
// showTab (what the tab bar's buttons call); for each it records the time until the new tab's work has run
// (`showTab`'s promise: one frame plus the update), the longest main-thread task while it ran, and the total time in long
// tasks (over 50 ms) until the transition ended. The printed table is the median per switch.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, seedMls, loadMlsRankings, callApp, transitionsDone, FIXTURE_LEAGUE_ID } from '../helpers.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const REF = process.env.PERF_REF || null;
const ROUNDS = Number(process.env.PERF_ROUNDS || 5);
const LEAGUES = 21;
const SWITCHES = [['lineup', 'setup'], ['setup', 'lineup'], ['lineup', 'roster'], ['roster', 'setup'], ['setup', 'roster'], ['roster', 'lineup']];
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

// Serves local files from REF (when set) instead of serve.mjs.
async function routeRef(page) {
    if (!REF) return;
    await page.route((url) => url.hostname === 'localhost', (route) => {
        let rel = new URL(route.request().url()).pathname.replace(/^\/+/, '');
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        try {
            const body = execFileSync('git', ['show', `${REF}:${rel}`], { cwd: REPO, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
            return route.fulfill({ status: 200, body, contentType: TYPES[extname(rel)] || 'application/octet-stream' });
        } catch {
            return route.fulfill({ status: 404, body: 'Not found' });
        }
    });
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

test('tab switches with 21 leagues, 4x CPU', async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    await routeRef(page);
    await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await callApp(page, 'optimizeLineup', true);

    // Clone the league: every Lineup Strategist value keyed by the league's id gets 20 more copies.
    await page.evaluate(({ id, n }) => {
        const ids = Array.from({ length: n - 1 }, (_, i) => `${id.slice(0, -3)}${String(100 + i)}`);
        for (const key of Object.keys(localStorage).filter(k => k.startsWith('mls_'))) {
            let v; try { v = JSON.parse(localStorage.getItem(key)); } catch { continue; }
            if (key === 'mls_leagues' && Array.isArray(v)) {
                const base = v.find(l => l.leagueId === id);
                v.push(...ids.map((cid, i) => ({ ...structuredClone(base), leagueId: cid, name: `${base.name} ${i + 2}` })));
            } else if (v && typeof v === 'object' && !Array.isArray(v) && id in v) {
                for (const cid of ids) v[cid] = structuredClone(v[id]);
            } else if (Array.isArray(v) && v.some(x => x && Array.isArray(x.leagueIds) && x.leagueIds.includes(id))) {
                for (const set of v) if (set?.leagueIds?.includes(id)) set.leagueIds.push(...ids);
            } else continue;
            localStorage.setItem(key, JSON.stringify(v));
        }
    }, { id: FIXTURE_LEAGUE_ID, n: LEAGUES });
    await page.reload();
    await page.waitForLoadState('networkidle');
    const cards = await page.locator('#leagueCards .mls-lc-card').count();
    if (cards !== LEAGUES) throw new Error(`expected ${LEAGUES} league cards, found ${cards}`);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
        window.__longTasks = [];
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, dur: e.duration }); })
            .observe({ type: 'longtask', buffered: false });
    });

    const results = new Map(SWITCHES.map(s => [s.join(' → '), []]));
    for (let round = 0; round < ROUNDS; round++) {
        for (const [from, to] of SWITCHES) {
            await callApp(page, 'showTab', from, false, { instant: true });
            await transitionsDone(page);
            await page.waitForTimeout(300);
            const r = await page.evaluate(async (to) => {
                const mod = await import(document.querySelector('script[src*="mls/main.js"]').src);
                window.__longTasks.length = 0;
                const t0 = performance.now();
                await mod.showTab(to);   // what the tab bar's button calls
                const update = performance.now() - t0;
                // Wait for the transition to end (data-vt-busy cleared) and the frame after it.
                while (document.documentElement.hasAttribute('data-vt-busy')) await new Promise(r => requestAnimationFrame(r));
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                const total = performance.now() - t0;
                const tasks = window.__longTasks.filter(t => t.start >= t0);
                return { update, total, longest: Math.max(0, ...tasks.map(t => t.dur)), longSum: tasks.reduce((s, t) => s + t.dur, 0) };
            }, to);
            results.get(`${from} → ${to}`).push(r);
        }
    }
    const lines = [`${REF || 'working tree'}, ${testInfo.project.name}: median of ${ROUNDS} (ms)`, 'switch              tap to new tab   longest task   long tasks total   tap to transition end'];
    for (const [name, rs] of results) {
        lines.push(`${name.padEnd(20)}${String(Math.round(median(rs.map(r => r.update)))).padStart(14)}${String(Math.round(median(rs.map(r => r.longest)))).padStart(12)}${String(Math.round(median(rs.map(r => r.longSum)))).padStart(19)}${String(Math.round(median(rs.map(r => r.total)))).padStart(24)}`);
    }
    console.log(lines.join('\n'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
