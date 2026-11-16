// Sync All and switches to the Dashboard, measured with a real backup on a 4x-slowed CPU (improvements F25). Opt-in:
//
//   cd tests && PERF_BACKUP=<backup.json> npx playwright test -c tools/playwright.config.mjs backup-perf --project phone
//   PERF_REF=<git ref> …      serves the site from that commit instead of the working tree (git show), for a bisect
//   PERF_PROFILE=1 …          also prints the functions that took the most time
//   PERF_NOW=<ISO time> …     the page's clock reads this time (timers still run), e.g. just before a kickoff
//
// The backup (Lineup Strategist's Backup & Restore file) is written straight into localStorage before the page loads.
// Every request that leaves localhost is answered from PERF_NET (default: perf-net.json next to the backup): recorded
// from the real service the first time, replayed after, so every commit measured sees the same Sleeper data.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const REF = process.env.PERF_REF || null;
const BACKUP = process.env.PERF_BACKUP;
const NET = process.env.PERF_NET || (BACKUP && join(dirname(BACKUP), 'perf-net.json'));
const ROUNDS = Number(process.env.PERF_ROUNDS || 3);
const SYNCS = Number(process.env.PERF_SYNCS || 2);
const PROFILE = !!process.env.PERF_PROFILE;
const AFTER_MS = Number(process.env.PERF_AFTER_MS || 4000);
const LOAD_S = Number(process.env.PERF_LOAD_S || 15);
const FROM_TABS = ['lineup', 'roster', 'scoreboard', 'scout'];
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

function addSelfTimes(into, profile) {
    const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dt = new Map();
    profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) || 0) + (profile.timeDeltas[i] || 0) / 1000));
    for (const [id, ms] of dt) {
        const f = byId.get(id).callFrame;
        const where = f.url ? `${f.url.replace(/^.*?\/\/[^/]+/, '')}:${f.lineNumber + 1}` : '';
        const key = `${f.functionName || '(anonymous)'} ${where}`.trim();
        into.set(key, (into.get(key) || 0) + ms);
    }
}

test.use({ serviceWorkers: 'block' });

test('Sync All and switches to the Dashboard, with a backup, 4x CPU', async ({ page }, testInfo) => {
    test.skip(!BACKUP, 'set PERF_BACKUP to a Lineup Strategist backup file');
    test.setTimeout(900_000);
    const data = JSON.parse(readFileSync(BACKUP, 'utf8')).data;
    const net = existsSync(NET) ? JSON.parse(readFileSync(NET, 'utf8')) : {};
    let recorded = 0;

    if (REF) {
        await page.route((url) => url.hostname === 'localhost', (route) => {
            let rel = new URL(route.request().url()).pathname.replace(/^\/+/, '');
            if (rel === '' || rel.endsWith('/')) rel += 'index.html';
            try {
                const body = execFileSync('git', ['show', `${REF}:${rel}`], { cwd: REPO, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
                return route.fulfill({ status: 200, body, contentType: TYPES[extname(rel)] || 'application/octet-stream' });
            } catch { return route.fulfill({ status: 404, body: 'Not found' }); }
        });
    }
    await page.route((url) => url.hostname !== 'localhost', async (route) => {
        const req = route.request();
        const key = `${req.method()} ${req.url()}`;
        if (/umami|googletagmanager|google-analytics/.test(req.url())) return route.fulfill({ status: 204, body: '' });
        if (net[key]) return route.fulfill({ status: net[key].status, body: Buffer.from(net[key].body, 'base64'), headers: { 'content-type': net[key].type || 'application/octet-stream', 'access-control-allow-origin': '*' } });
        try {
            const res = await route.fetch();
            const body = await res.body();
            net[key] = { status: res.status(), type: res.headers()['content-type'], body: body.toString('base64') };
            recorded++;
            return route.fulfill({ response: res, body });
        } catch { return route.abort(); }
    });
    await page.addInitScript((d) => {
        if (sessionStorage.getItem('__perfSeeded')) return;
        localStorage.clear();
        for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
        sessionStorage.setItem('__perfSeeded', '1');
    }, data);

    // A clock that starts at PERF_NOW and runs (timers fire as they would).
    if (process.env.PERF_NOW) await page.clock.install({ time: new Date(process.env.PERF_NOW) });
    // What opening the page does by itself, in its first LOAD_S seconds (unthrottled).
    let loadReqs = 0;
    const countLoad = (r) => { if (new URL(r.url()).hostname !== 'localhost') loadReqs++; };
    page.on('request', countLoad);
    await page.goto('/lineup/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(LOAD_S * 1000);
    page.off('request', countLoad);
    // The starter alert's plan (Advanced Settings' line under its switch), when it's on.
    const alertPlan = await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        const times = Object.values(State.gameTimesByTeam || {}).map(t => new Date(t).getTime()).filter(Number.isFinite);
        return { line: document.getElementById('starterAlertsNext')?.textContent || '', now: new Date().toISOString(), week: State.currentNflWeek, kickoffs: [...new Set(times)].sort().map(t => new Date(t).toISOString()) };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
        window.__longTasks = [];
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTasks.push(e.duration); })
            .observe({ type: 'longtask', buffered: false });
    });
    if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); }
    const profiles = new Map();
    await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const profiled = async (name, fn) => {
        if (PROFILE) await cdp.send('Profiler.start');
        const m0 = await metrics();
        const r0 = await fn();
        const m1 = await metrics();
        // Chrome's own accounting for the whole measurement (the 4s after included), ms of main-thread time.
        const d = (k) => (m1[k] - m0[k]) * 1000;
        const r = { ...r0, style: d('RecalcStyleDuration'), layout: d('LayoutDuration'), script: d('ScriptDuration'), styleCount: m1.RecalcStyleCount - m0.RecalcStyleCount };
        if (PROFILE) { if (!profiles.has(name)) profiles.set(name, new Map()); addSelfTimes(profiles.get(name), (await cdp.send('Profiler.stop')).profile); }
        return r;
    };

    const results = new Map();
    // Requests that leave localhost during each measurement, by kind (the path with numbers and ids folded).
    let reqs = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost') reqs.push(`${u.hostname}${u.pathname.replace(/\/\d+/g, '/N')}`); });
    const requests = new Map();
    const push = (name, r) => {
        if (!results.has(name)) results.set(name, []);
        results.get(name).push({ ...r, requests: reqs.length });
        if (!requests.has(name)) requests.set(name, reqs.slice());
        reqs = [];
    };
    const showTab = (tab) => page.evaluate(async ([to, AFTER_MS]) => {
        const mod = await import(document.querySelector('script[src*="mls/main.js"]').src);
        window.__longTasks.length = 0;
        const t0 = performance.now();
        await mod.showTab(to);
        const update = performance.now() - t0;
        while (document.documentElement.hasAttribute('data-vt-busy')) await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tasks = window.__longTasks;
        const total = performance.now() - t0;
        const first = { longest: Math.max(0, ...tasks), longSum: tasks.reduce((s, t) => s + t, 0) };
        // What runs after the switch has painted (deferred renders, timers): AFTER_MS more.
        window.__longTasks.length = 0;
        await new Promise(r => setTimeout(r, AFTER_MS));
        const after = window.__longTasks;
        return { update, total, ...first, afterSum: after.reduce((s, t) => s + t, 0), afterLongest: Math.max(0, ...after) };
    }, [tab, AFTER_MS]);

    for (let round = 0; round < ROUNDS; round++) {
        for (const from of FROM_TABS) {
            await showTab(from);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(500);
            reqs = [];
            push(`${from} → setup`, await profiled(`${from} → setup`, () => showTab('setup')));
        }
    }
    for (let i = 0; i < SYNCS; i++) {
        await showTab('setup');
        await page.waitForTimeout(500);
        reqs = [];
        push('Sync All', await profiled('Sync All', () => page.evaluate(async (AFTER_MS) => {
            const btn = document.getElementById('syncAllBtn');
            window.__longTasks.length = 0;
            const t0 = performance.now();
            btn.click();
            while (!btn.disabled && performance.now() - t0 < 2000) await new Promise(r => setTimeout(r, 10));
            while (btn.disabled) await new Promise(r => setTimeout(r, 25));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const tasks = window.__longTasks;
            const total = performance.now() - t0;
            const first = { longest: Math.max(0, ...tasks), longSum: tasks.reduce((s, t) => s + t, 0) };
            window.__longTasks.length = 0;
            await new Promise(r => setTimeout(r, AFTER_MS));
            const after = window.__longTasks;
            return { update: total, total, ...first, afterSum: after.reduce((s, t) => s + t, 0), afterLongest: Math.max(0, ...after) };
        }, AFTER_MS)));
        await page.waitForLoadState('networkidle');
    }
    // The same switches once a sync has run: the Dashboard then has new data to draw (Best Available re-reads each
    // league's transactions after its sync).
    if (SYNCS > 0) {
        for (let round = 0; round < ROUNDS; round++) {
            for (const from of FROM_TABS) {
                await showTab(from);
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(500);
                reqs = [];
                push(`${from} → setup, after`, await profiled(`${from} → setup, after`, () => showTab('setup')));
            }
        }
    }
    if (recorded) writeFileSync(NET, JSON.stringify(net));

    const lines = [`${REF || 'working tree'}, ${testInfo.project.name}, ${data.mls_leagues ? JSON.parse(data.mls_leagues).length : 0} leagues: median (ms)`,
        `opening the page: ${loadReqs} requests in its first ${LOAD_S} s; starter alert: ${JSON.stringify(alertPlan)}`,
        `what                 to done   longest task   long tasks total   to frame after   long tasks in the next ${AFTER_MS / 1000}s (longest)`];
    for (const [name, rs] of results) {
        lines.push(`${name.padEnd(20)}${String(Math.round(median(rs.map(r => r.update)))).padStart(9)}${String(Math.round(median(rs.map(r => r.longest)))).padStart(15)}${String(Math.round(median(rs.map(r => r.longSum)))).padStart(19)}${String(Math.round(median(rs.map(r => r.total)))).padStart(17)}${String(Math.round(median(rs.map(r => r.afterSum)))).padStart(20)} (${Math.round(median(rs.map(r => r.afterLongest)))})   ${median(rs.map(r => r.requests))} requests   style ${Math.round(median(rs.map(r => r.style)))} (${median(rs.map(r => r.styleCount))}×)  layout ${Math.round(median(rs.map(r => r.layout)))}  script ${Math.round(median(rs.map(r => r.script)))}`);
    }
    if (process.env.PERF_REQUESTS) {
        for (const [name, list] of requests) {
            const by = new Map(); for (const k of list) by.set(k, (by.get(k) || 0) + 1);
            lines.push(`\n${name}: requests (first run)`);
            for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) lines.push(`  ${String(n).padStart(4)}  ${k}`);
        }
    }
    if (PROFILE) {
        for (const [name, times] of profiles) {
            const n = results.get(name).length;
            lines.push(`\n${name}: self time per function, ms per run (top 15)`);
            for (const [fn, ms] of [...times].sort((a, b) => b[1] - a[1]).slice(0, 15)) lines.push(`  ${(ms / n).toFixed(1).padStart(7)}  ${fn}`);
        }
    }
    console.log(lines.join('\n'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
