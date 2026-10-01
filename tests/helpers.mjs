// Shared setup for the smoke and visual specs.
//
// Every request that leaves localhost is intercepted, so the tests run offline and render the
// same thing every time:
//   * PapaParse (cdnjs) is served from tests/node_modules, same pinned version as the pages.
//   * Sleeper API calls are answered from tests/fixtures/sleeper/ (see SLEEPER_FIXTURES);
//     any Sleeper URL without a fixture gets a 404 and is recorded in `unmocked`.
//   * Everything else (Google Fonts, MathJax, Ko-fi image, LeagueLogs, Google Sheets) is aborted.
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
 * "window.showTab is not a function" further down the test.
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

/** Shows a tab the way a user would on MDS or MLS: window.showTab, same as the nav buttons call. */
export async function showTab(page, tab) {
    await page.evaluate((t) => window.showTab(t), tab);
    await expect(page.locator(`#${tab}Tab`)).toHaveClass(/\bactive\b/);
}

export const RANKINGS_CSV = readFileSync(here('./fixtures/rankings.csv'), 'utf8');

export const FIXTURE_LEAGUE_ID = '1000000000000000001';

/** MDS: loads the 24-player fixture through the paste box, then makes five picks. */
export async function seedMds(page) {
    await page.fill('#csvPasteArea', RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
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

/** T-Score tabs use their own switchTab(tabId, skipHistory) from the page's inline script. */
export async function showTScoreTab(page, tab) {
    await page.evaluate((t) => window.switchTab(t), tab);
    await expect(page.locator(`#${tab}`)).toHaveClass(/\bactive\b/);
}
