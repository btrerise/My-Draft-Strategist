// Shared setup for the smoke and visual specs.
//
// Every request that leaves localhost is intercepted, so the tests run offline and render the
// same thing every time:
//   * PapaParse (cdnjs) is served from tests/node_modules, same pinned version as the pages.
//   * Sleeper API calls are answered from tests/fixtures/sleeper/ (see SLEEPER_FIXTURES);
//     any Sleeper URL without a fixture gets a 404 and is recorded in `unmocked`.
//   * Everything else (Google Fonts, MathJax, Ko-fi image, FantasyCalc, Google Sheets) is aborted.
//     /api/ffc/ (a Cloudflare Pages Function, not run by serve.mjs) 404s unless a spec stubs it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const PAPA = readFileSync(here('./node_modules/papaparse/papaparse.min.js'), 'utf8');

// Fixed clock for anything date-dependent (season week, "updated X ago" labels).
export const FIXED_NOW = new Date('2026-09-15T16:00:00Z');

// [regex on the URL path, fixture file name or (match) => name]. First match wins.
const SLEEPER_FIXTURES = [
    [/^\/v1\/state\/nfl$/, 'state-nfl.json'],
    [/^\/v1\/players\/nfl$/, 'players-nfl.json'],
    [/^\/v1\/players\/nfl\/trending\/add$/, 'trending-add.json'],
    [/^\/v1\/league\/\d+$/, 'league.json'],
    [/^\/v1\/league\/\d+\/users$/, 'league-users.json'],
    [/^\/v1\/league\/\d+\/rosters$/, 'league-rosters.json'],
    [/^\/v1\/league\/\d+\/matchups\/\d+$/, 'league-matchups.json'],
    [/^\/v1\/user\/\d+\/leagues\/nfl\/\d+$/, 'user-leagues.json'],
    [/^\/v1\/user\/[^/]+$/, 'user.json'],
    [/^\/v1\/projections\/nfl\/regular\/2026\/2$/, 'projections-2026-2.json'],
    [/^\/v1\/stats\/nfl\/regular\/(2025|2026)\/(\d+)$/, (m) => `stats-${m[1]}-${m[2]}.json`],
];

function sleeperFixture(pathname) {
    for (const [re, file] of SLEEPER_FIXTURES) {
        const m = pathname.match(re);
        if (!m) continue;
        const name = typeof file === 'function' ? file(m) : file;
        try { return readFileSync(here(`./fixtures/sleeper/${name}`), 'utf8'); } catch { return null; }
    }
    return null;
}

/**
 * Installs routing, a fixed clock and error collection on a page. Call before page.goto().
 * Returns { errors, unmocked } -- arrays filled in as the page runs. Use expectClean() to
 * assert on them.
 */
export async function preparePage(page) {
    const errors = [];
    const unmocked = [];

    await page.clock.setFixedTime(FIXED_NOW);

    await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/PapaParse/')) {
            return route.fulfill({ status: 200, contentType: 'text/javascript', body: PAPA });
        }
        if (/(^|\.)sleeper\.(app|com)$/.test(url.hostname)) {
            const body = sleeperFixture(url.pathname);
            if (body !== null) return route.fulfill({ status: 200, contentType: 'application/json', body });
            unmocked.push(url.href);
            return route.fulfill({ status: 404, contentType: 'application/json', body: 'null' });
        }
        return route.abort();
    });

    page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`));
    page.on('console', (msg) => {
        // Blocked external requests log "Failed to load resource"; local failures are caught
        // by the response listener below instead, with the URL attached.
        if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
            errors.push(`console.error: ${msg.text()}`);
        }
    });
    page.on('response', (res) => {
        const url = new URL(res.url());
        if (url.hostname === 'localhost' && res.status() >= 400) errors.push(`HTTP ${res.status()}: ${url.pathname}`);
    });

    return { errors, unmocked };
}

/**
 * Fails if the page logged an error, hit a local 404, or showed the fatal boot banner
 * (#mds-boot-error, from js/utils.js -- js/boot.js after refactor chunk 1A). Errors are
 * checked first because they name the cause; the banner is only the symptom.
 */
export async function expectClean(page, { errors }) {
    expect(errors, 'page errors').toEqual([]);
    await expect(page.locator('#mds-boot-error'), 'fatal boot banner is showing').toHaveCount(0);
}

/**
 * Opens a page, waits for the network to go quiet, and fails straight away if loading
 * produced errors -- so a broken import reports the 404 rather than a confusing
 * "showTab is not a function" further down the test.
 */
export async function openApp(page, path) {
    const state = await preparePage(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);
    return state;
}

// Tab ids per page, in nav order. Kept here so a renamed tab fails loudly in every spec.
export const MDS_TABS = ['setup', 'tracker', 'team', 'board', 'guide'];
export const MLS_TABS = ['setup', 'roster', 'lineup', 'scout', 'guide'];
export const TSCORE_TABS = ['researchTab', 'top50Tab', 'valuesTab', 'avoidsTab', 'sleepersTab', 'tab-2024'];

/**
 * Calls a function the page's app module exports (js/mds/main.js on /, js/mls/main.js on /lineup/)
 * and returns its result. import() of the same URL returns the page's own module instance, so this
 * runs exactly the function the app's buttons run. Since refactor 5D tests don't need app functions on
 * window, so `npm run compare-css` with a COMPARE_REF from before 5D no longer works.
 */
export async function callApp(page, name, ...args) {
    return page.evaluate(async ([fn, fnArgs]) => {
        const entry = location.pathname.startsWith('/lineup') ? '/js/mls/main.js' : '/js/mds/main.js';
        const f = (await import(entry))[fn];
        return f(...fnArgs);
    }, [name, args]);
}

/** Shows a tab the way a user would on MDS or MLS: showTab, same as the nav buttons call. */
export async function showTab(page, tab) {
    await callApp(page, 'showTab', tab);
    await expect(page.locator(`#${tab}Tab`)).toHaveClass(/\bactive\b/);
}

export const RANKINGS_CSV = readFileSync(here('./fixtures/rankings.csv'), 'utf8');

// Unrostered free agents for Waiver Insights (refactor 3G): rankings.csv plus six players the
// fixture league's player map has but no roster holds (FREE_AGENTS in fixtures/sleeper/make-fixtures.mjs).
export const WAIVER_RANKINGS_CSV = readFileSync(here('./fixtures/rankings-waivers.csv'), 'utf8');

export const FIXTURE_LEAGUE_ID = '1000000000000000001';

/**
 * MDS (refactor 8C): a rankings upload or paste opens the upload preview and loads nothing until
 * its confirm button. This waits for the preview and saves it.
 */
export async function confirmMdsPreview(page) {
    const overlay = page.locator('#rankingsPreviewOverlay');
    await expect(overlay).toBeVisible();
    await page.locator('#rankingsPreviewConfirmBtn').click();
    await expect(overlay).toBeHidden();
}

/** MDS: loads the 24-player fixture through the paste box (and its preview), then makes five picks. */
export async function seedMds(page) {
    await page.fill('#csvPasteArea', RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    await confirmMdsPreview(page);
    await expect(page.locator('.toast-message').filter({ hasText: 'Loaded 24 players' })).toBeVisible();
    await showTab(page, 'tracker');
    // Pick, Taken, Taken, Pick, Taken: two players on my team, three elsewhere.
    for (const mine of [true, false, false, true, false]) {
        await page.locator(mine ? '#trackerTab .btn-mine' : '#trackerTab .btn-draft').first().click();
    }
    await page.waitForLoadState('networkidle');
}

/** MLS: syncs the fixture Sleeper league (fixtures/sleeper/) as user mds_test. */
export async function seedMls(page) {
    await page.fill('#sleeperUsername', 'mds_test');
    await page.fill('#sleeperLeagueId', FIXTURE_LEAGUE_ID);
    await page.click('#mainSyncBtn');
    await expect(page.locator('#leagueSelect, select').filter({ hasText: 'Fixture League' }).first()).toBeAttached();
    await page.waitForLoadState('networkidle');
}

/**
 * T-Score: clicks the tab's nav button (its data-action="switchTab" runs through the page's
 * delegated listener, js/tscore/main.js). dispatchEvent rather than click(), because a real click
 * first scrolls the button into view, and the nav row scrolls sideways on phones.
 */
export async function showTScoreTab(page, tab) {
    await page.locator(`.tscore-nav-btn[data-tab="${tab}"]`).dispatchEvent('click');
    await expect(page.locator(`#${tab}`)).toHaveClass(/\bactive\b/);
}

/**
 * MLS: uploads a rankings CSV as both ROS and Weekly rankings through the real file inputs and the
 * preview's Save (added in 3C's mls-scout.spec.mjs; shared since 3G).
 */
export async function loadMlsRankings(page, csv = RANKINGS_CSV, count = 24) {
    for (const inputId of ['rosFileInput', 'weeklyFileInput']) {
        await page.setInputFiles('#' + inputId, { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
        await expect(page.locator('#rankingsPreviewOverlay')).toContainText(`${count} players parsed`);
        await callApp(page, 'confirmRankingsPreview');
        await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
    }
}

// Seeded Math.random for the matchup simulator (added in 3F's mls-sim.spec.mjs; shared since 3G).
export const SIM_SEED = `(() => { let a = 0x9E3779B9; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();\n`;

/**
 * Replaces Math.random with a seeded generator in the page (init script) and in the simulator's
 * Web Worker (the worker script is rewritten on its way in). Call before page.goto(). Returns the
 * list of worker script paths the page loads, filled in as it runs.
 */
export async function seedSimRandom(page) {
    const workerUrls = [];
    await page.addInitScript(SIM_SEED);
    await page.route(/\/worker\.js$/, async (route) => {
        workerUrls.push(new URL(route.request().url()).pathname);
        const res = await route.fetch();
        await route.fulfill({ response: res, body: SIM_SEED + await res.text() });
    });
    return workerUrls;
}
