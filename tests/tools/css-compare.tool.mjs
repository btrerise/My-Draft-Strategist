// Computed-style comparison (refactor 4D; the method 4A used, rebuilt and kept as an opt-in tool).
//
// Each scenario runs twice in Chromium: once with every local file served from a git ref
// (COMPARE_REF, default origin/main) and once from the working tree (serve.mjs). After each step it
// records every element's full computed style, plus ::before/::after (when they render), ::marker,
// ::placeholder and ::file-selector-button, and the two runs must match exactly. Both widths
// (projects) and prefers-reduced-motion off and on. Use it for any change that must not be visible,
// such as moving or deleting CSS rules.
//
//   cd tests && npm run compare-css                        # working tree vs origin/main
//   COMPARE_REF=HEAD~1 npm run compare-css                 # vs another commit
//
// No need to commit first: the "after" side is the working tree as it is on disk. Takes about 7
// minutes (28 tests, 4 workers); `-g "MLS"` or `--project desktop` runs a subset.
// Two traps (4A): Chromium lists custom properties in stylesheet order, so property names are sorted
// before comparing; and each state has to settle (mouse parked, focus blurred, network idle, images
// (lazy ones too) and fonts loaded, transitions finished, endless animations paused at 0) or timing
// shows up as differences. Toasts are hidden before each snapshot (their timers make them timing-dependent),
// except in the steps that show one on purpose, and self-hiding messages are waited out. Elements
// are matched by position, not id (some ids are assigned at run time). Hover and focus states
// beyond those here aren't covered: check them by reasoning about the cascade.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import {
    preparePage, expectClean, showTab, showTScoreTab, seedMds, seedMls,
    MDS_TABS, MLS_TABS, TSCORE_TABS, SIM_SEED, RANKINGS_CSV,
} from '../helpers.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const REF = process.env.COMPARE_REF || 'origin/main';
const ORIGIN = 'http://localhost:4173';
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webp': 'image/webp',
};

// ---------------------------------------------------------------- serving a git ref

const gitCache = new Map();
const gitType = (spec) => {
    try { return execFileSync('git', ['cat-file', '-t', spec], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { return null; }
};
/** The file at `pathname` in REF, resolved the way serve.mjs does (a directory serves its index.html). */
function refFile(pathname) {
    if (gitCache.has(pathname)) return gitCache.get(pathname);
    let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
    if (rel === '' || gitType(`${REF}:${rel}`) === 'tree') rel = rel.replace(/\/?$/, rel ? '/index.html' : 'index.html');
    const out = gitType(`${REF}:${rel}`) === 'blob'
        ? { rel, body: execFileSync('git', ['show', `${REF}:${rel}`], { cwd: REPO, maxBuffer: 1 << 28 }) }
        : null;
    gitCache.set(pathname, out);
    return out;
}

/**
 * Local requests: from REF when `fromRef`, otherwise from serve.mjs. The simulator's worker gets a
 * seeded Math.random either way (same seed as helpers.mjs), so its numbers match between runs.
 */
async function routeLocal(page, fromRef) {
    await page.route((url) => url.origin === ORIGIN, async (route) => {
        const { pathname } = new URL(route.request().url());
        let body, contentType;
        if (fromRef) {
            const f = refFile(pathname);
            if (!f) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
            body = f.body; contentType = TYPES[extname(f.rel)] || 'application/octet-stream';
        } else {
            if (!pathname.endsWith('/worker.js')) return route.continue();
            const res = await route.fetch();
            body = await res.body(); contentType = res.headers()['content-type'];
        }
        if (pathname.endsWith('/worker.js')) body = SIM_SEED + body.toString();
        return route.fulfill({ status: 200, contentType, body, headers: { 'Cache-Control': 'no-store' } });
    });
}

// ---------------------------------------------------------------- snapshots

async function settle(page, { keepToast = false } = {}) {
    await page.waitForLoadState('networkidle');
    await page.mouse.move(0, 0);
    await page.evaluate(async (keepToast) => {
        document.activeElement?.blur?.();
        if (!keepToast) for (const t of document.querySelectorAll('.mds-toast.show')) t.classList.remove('show');
        await document.fonts.ready;
        // Lazy images start (and, blocked in tests, fail and get swapped for initials) whenever they
        // near the viewport, so load them all now and wait: both runs then see the same DOM.
        for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
        const pending = [...document.images].filter((img) => !img.complete);
        await Promise.all(pending.map((img) => new Promise((r) => { img.addEventListener('load', r); img.addEventListener('error', r); })));
        for (let i = 0; i < 3; i++) {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            for (const a of document.getAnimations()) {
                const end = a.effect?.getComputedTiming?.().endTime;
                if (end !== undefined && end !== Infinity) a.finish();
                else { a.pause(); a.currentTime = 0; }
            }
        }
    }, keepToast);
}

/** Runs in the page: every element's computed style, deduplicated into a table of style strings. */
function collectStyles() {
    const styles = [];
    const index = new Map();
    const ser = (cs) => {
        const s = Array.from(cs).sort().map((n) => `${n}: ${cs.getPropertyValue(n)}`).join('\n');
        let i = index.get(s);
        if (i === undefined) { i = styles.length; styles.push(s); index.set(s, i); }
        return i;
    };
    const els = [];
    const labels = {};
    const walk = (el, path) => {
        const rec = [path, ser(getComputedStyle(el))];
        labels[path] = el.localName + (el.id ? `#${el.id}` : '') + (el.classList.length ? `.${[...el.classList].join('.')}` : '');
        const tag = el.localName;
        const pseudos = ['::before', '::after'];
        if (tag === 'li') pseudos.push('::marker');
        if ((tag === 'input' || tag === 'textarea') && el.hasAttribute('placeholder')) pseudos.push('::placeholder');
        if (tag === 'input' && el.type === 'file') pseudos.push('::file-selector-button');
        for (const p of pseudos) {
            const cs = getComputedStyle(el, p);
            if ((p === '::before' || p === '::after') && (cs.content === 'none' || cs.content === 'normal')) continue;
            rec.push(p, ser(cs));
        }
        els.push(rec);
        // Keyed by tag and position only: some ids are handed out at run time (tooltips get
        // mds-tip-N in whatever order they're set up), so they can't be part of the key.
        const seen = {};
        for (const c of el.children) {
            seen[c.localName] = (seen[c.localName] || 0) + 1;
            walk(c, `${path}>${c.localName}:${seen[c.localName]}`);
        }
    };
    walk(document.documentElement, 'html');
    return { styles, els, labels };
}

function toMap({ styles, els }) {
    const m = new Map();
    for (const [path, own, ...pseudo] of els) {
        m.set(path, styles[own]);
        for (let i = 0; i < pseudo.length; i += 2) m.set(path + pseudo[i], styles[pseudo[i + 1]]);
    }
    return m;
}

function propDiff(a, b) {
    const pa = new Map(a.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
    const pb = new Map(b.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
    const out = [];
    for (const k of new Set([...pa.keys(), ...pb.keys()])) {
        if (pa.get(k) !== pb.get(k)) out.push(`${k}: ${pa.get(k) ?? '(unset)'} -> ${pb.get(k) ?? '(unset)'}`);
    }
    return out;
}

function compare(state, before, after) {
    const a = toMap(before);
    const b = toMap(after);
    const diffs = [];
    for (const [k, v] of a) {
        if (!b.has(k)) diffs.push(`${state} | only in ${REF}: ${k}`);
        else if (b.get(k) !== v) diffs.push(`${state} | ${k} (${before.labels[k.replace(/::.*/, '')]}) | ${propDiff(v, b.get(k)).slice(0, 6).join('; ')}`);
    }
    for (const k of b.keys()) if (!a.has(k)) diffs.push(`${state} | only in working tree: ${k}`);
    return { diffs, elements: a.size };
}

// ---------------------------------------------------------------- scenarios
// Each gets (page, snap). snap(name, opts) settles the page and records a state. The same steps
// run on both sides, so anything that isn't CSS (data, timing of user actions) is identical.

const menu = async (page, snap) => {
    await page.click('.hamburger-btn');
    await expect(page.locator('.hamburger-menu.open')).toBeVisible();
    await snap('menu open');
    await page.locator('.hamburger-menu.open .close-menu-btn').click();
    await expect(page.locator('.hamburger-menu.open')).toHaveCount(0);
};

const toasts = async (page, snap) => {
    await page.evaluate(async () => (await import('/js/shared/ui/toast.js')).showToast('Saved to this device'));
    await snap('toast', { keepToast: true });
    await page.evaluate(async () => (await import('/js/shared/ui/toast.js')).showToast('Something went wrong', { isError: true }));
    await snap('error toast', { keepToast: true });
};

const confirmDialog = async (page, snap) => {
    await page.evaluate(async () => { window.__cssCompareConfirm = (await import('/js/shared/ui/confirm.js')).showConfirm('Reset everything?', { danger: true, confirmText: 'Reset' }); });
    await expect(page.locator('.mds-modal')).toBeVisible();
    await snap('confirm dialog');
    await page.locator('.mds-modal').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.mds-modal')).toBeHidden();
};

const dropHighlight = async (page, snap, selector) => {
    await page.evaluate((s) => document.querySelector(s).classList.add('mds-drop-active'), selector);
    await snap('drop highlight');
    await page.evaluate((s) => document.querySelector(s).classList.remove('mds-drop-active'), selector);
};

const autocomplete = async (page, snap, inputSel, name) => {
    await page.fill(inputSel, '');
    await page.locator(inputSel).pressSequentially('Ja', { delay: 20 });
    await expect(page.locator('.autocomplete-dropdown').filter({ visible: true }).first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await snap(name);
    await page.fill(inputSel, '');
    await page.keyboard.press('Escape');
};

/** Opens every <details> on the page, then snaps each tab, so collapsed sections are compared too. */
const allDetailsOpen = async (page, snap, tabs) => {
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    for (const tab of tabs) { await showTab(page, tab); await snap(`tab ${tab}, every <details> open`); }
};

const SCENARIOS = {
    'MDS empty': async (page, snap) => {
        await open(page, '/');
        for (const tab of MDS_TABS) { await showTab(page, tab); await snap(`tab ${tab}`); }
        await showTab(page, 'setup');
        await dropHighlight(page, snap, '#setupTab input[type="file"]');
        await menu(page, snap);
        await toasts(page, snap);
        await confirmDialog(page, snap);
    },
    'MDS mid-draft': async (page, snap) => {
        await open(page, '/');
        await seedMds(page);
        for (const tab of MDS_TABS) { await showTab(page, tab); await snap(`tab ${tab}`); }
        await allDetailsOpen(page, snap, MDS_TABS);
        // Phone-only "mobile collapse" setting, then one Tracker card expanded.
        await showTab(page, 'setup');
        await page.evaluate(() => {
            const c = document.getElementById('ds_mobile_collapse');
            c.checked = true;
            c.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await showTab(page, 'tracker');
        await snap('tracker, mobile collapse on');
        await page.evaluate(() => document.querySelector('#trackerTab .btn-expand')?.click());
        await snap('tracker, one card expanded');
    },
    'MLS empty': async (page, snap) => {
        await open(page, '/lineup/');
        for (const tab of MLS_TABS) { await showTab(page, tab); await snap(`tab ${tab}`); }
        await showTab(page, 'setup');
        await dropHighlight(page, snap, '#rosRankingsCard');
        await menu(page, snap);
        await toasts(page, snap);
        await confirmDialog(page, snap);
    },
    'MLS synced league': async (page, snap) => {
        await open(page, '/lineup/');
        await seedMls(page);
        for (const tab of MLS_TABS) { await showTab(page, tab); await snap(`tab ${tab}`); }
        await allDetailsOpen(page, snap, MLS_TABS);
        await showTab(page, 'setup');
        await autocomplete(page, snap, '#manualName', 'add-player autocomplete');
    },
    'MLS with rankings': async (page, snap) => {
        await page.addInitScript(SIM_SEED);
        await open(page, '/lineup/');
        await seedMls(page);
        for (const inputId of ['rosFileInput', 'weeklyFileInput']) {
            await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
            await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
            await snap(`${inputId} preview`);
            await page.evaluate(async () => ((await import('/js/mls/main.js')).confirmRankingsPreview ?? window.confirmRankingsPreview)());
            await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
            await snap(`${inputId} saved`);
            // The "Uploaded successfully" line hides itself on a timer; wait it out so later
            // states don't depend on how long the run took.
            // (Checked by inline style: Playwright calls the other tab's copy hidden even while it shows.)
            await page.waitForFunction(() => ['rosSuccessMsg', 'weeklySuccessMsg'].every((id) => document.getElementById(id).style.display !== 'block'), null, { timeout: 10_000 });
        }
        for (const tab of MLS_TABS) { await showTab(page, tab); await snap(`tab ${tab}`); }
        await allDetailsOpen(page, snap, MLS_TABS);
        // Scout: the same actions as mls-scout.spec.mjs.
        await showTab(page, 'scout');
        // Since improvements S1 the pasted list and Auto-Find are modes (no setWaiverMode before that).
        await page.evaluate(async () => (await import('/js/mls/main.js')).setWaiverMode?.('list'));
        await page.fill('#waiverInput', "Ja'Marr Chase\nJosh Allen\nNobody McFakename");
        await page.click('#waiverScanBtn');
        await page.waitForLoadState('networkidle');
        await snap('scout, pasted list scanned');
        await page.evaluate(async () => (await import('/js/mls/main.js')).setWaiverMode?.('auto'));
        await page.evaluate(async () => ((await import('/js/mls/main.js')).setWaiverCompare ?? window.setWaiverCompare)('roster'));
        await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
        await page.waitForLoadState('networkidle');
        await snap('scout, auto-find');
        await page.fill('#buyInput', "Ja'Marr Chase");
        await page.fill('#sellInput', 'Josh Allen\nBijan Robinson');
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await page.waitForLoadState('networkidle');
        await snap('scout, trade verdict');
        // Simulator results: same fixed teams as mls-sim.spec.mjs, seeded.
        await page.evaluate(async () => {
            const ui = await import('/js/mls/sim/ui.js');
            const mk = (name, pos, base, n, extra = {}) => ({
                name, pos, team: 'KC',
                weeklyScores: Array.from({ length: n }, (_, i) => base + ((i * 7) % 11) - 5),
                currentSeasonScores: Array.from({ length: Math.min(n, 2) }, (_, i) => base + i),
                ...extra,
            });
            const t1 = [mk('Alpha QB', 'QB', 22, 9), mk('Bravo RB', 'RB', 14, 6, { projectedMean: 16.5 }), mk('Charlie WR', 'WR', 12, 2), mk('Delta TE', 'TE', 8, 12, { actualScore: 11.2 })];
            const t2 = [mk('Echo QB', 'QB', 20, 8), mk('Fox RB', 'RB', 15, 10), mk('Golf WR', 'WR', 13, 1, { projectedMean: 9 }), mk('Hotel TE', 'TE', 7, 0)];
            ui.runMatchupSimulation(t1, t2, {
                lineupDiffersFromSleeper: true, currentWeek: 2,
                benchInsights: [{ benchName: 'Bench Guy', benchPos: 'WR', starterName: 'Charlie WR', starterPos: 'WR', benchWinPct: 0.55 }],
                waiverInsights: [{ faName: 'FA Guy', faPos: 'RB', starterName: 'Bravo RB', starterPos: 'RB', faWinPct: 0.61 }],
                waiverInsightsStatus: { checkedCount: 3, positions: ['RB', 'WR'], noRankings: false, failed: false },
            });
            const el = document.getElementById('monte-carlo-results');
            for (let i = 0; i < 200 && !el.querySelector('.simulation-card'); i++) await new Promise((r) => setTimeout(r, 50));
        });
        await snap('simulator results');
    },
    'MLS handoff banner': async (page, snap) => {
        await open(page, '/lineup/');
        await page.evaluate(() => localStorage.setItem('shared_handoff_roster', JSON.stringify({
            sourceLeagueName: 'Handoff Test', players: [{ name: 'Josh Allen', pos: 'QB', team: 'BUF' }], reqs: null,
        })));
        await page.reload();
        await expect(page.locator('#handoffBanner')).toBeVisible();
        await snap('handoff banner');
    },
    'T-Score': async (page, snap) => {
        await open(page, '/t-score/');
        for (const tab of TSCORE_TABS) { await showTScoreTab(page, tab); await snap(`tab ${tab}`); }
        await menu(page, snap);
    },
};

const pageState = new WeakMap();
async function open(page, path) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectClean(page, pageState.get(page));
}

// ---------------------------------------------------------------- tests

for (const reducedMotion of ['no-preference', 'reduce']) {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
        test(`${name} (motion: ${reducedMotion})`, async ({ browser }, testInfo) => {
            const { viewport, hasTouch } = testInfo.project.use;
            const runs = [];
            for (const fromRef of [true, false]) {
                const context = await browser.newContext({
                    viewport, hasTouch: !!hasTouch, reducedMotion, baseURL: ORIGIN, serviceWorkers: 'block', deviceScaleFactor: 1,
                });
                const page = await context.newPage();
                const state = await preparePage(page);
                pageState.set(page, state);
                await routeLocal(page, fromRef);
                const snaps = [];
                const t0 = Date.now();
                await scenario(page, async (label, opts) => {
                    await settle(page, opts);
                    snaps.push([label, await page.evaluate(collectStyles)]);
                });
                await expectClean(page, state);
                if (process.env.COMPARE_VERBOSE) console.log(`${fromRef ? REF : 'working tree'}: ${snaps.length} states in ${Date.now() - t0} ms`);
                runs.push(snaps);
                await context.close();
            }
            const [before, after] = runs;
            expect(after.map((s) => s[0]), 'both runs reach the same states').toEqual(before.map((s) => s[0]));
            const diffs = [];
            let elements = 0;
            before.forEach(([label, snap], i) => {
                const r = compare(label, snap, after[i][1]);
                diffs.push(...r.diffs);
                elements += r.elements;
            });
            console.log(`${testInfo.project.name} | ${name} | motion ${reducedMotion}: ${before.length} states, ${elements} elements/pseudo-elements, ${diffs.length} differences`);
            expect(diffs.slice(0, 60), `computed styles differ from ${REF} (${diffs.length} in all)`).toEqual([]);
        });
    }
}
