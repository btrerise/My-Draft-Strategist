// Draft Strategist's freshness labels and processing / success lines (refactor chunk 8B), with the
// fixed test clock (2026-09-15T16:00Z, tests/helpers.mjs). The wording and thresholds are the ones
// the owner approved (docs/refactor/LOG.md, 8B):
//   Rankings (#metaDisplay)       "Loaded: 24 players • Updated 3 days ago", amber past 14 days
//                                 with " — consider refreshing"
//   ADP (#adpStatusDisplay)       "FFC: Redraft - 1QB (PPR) • Fetched today", amber past 3 days
//                                 with " — fetch again before you draft"
//   Meta saved before 8B has no updatedAt and keeps the old text ("Loaded: N players on <date>",
//   "Fetched: <format> on <date>").
// Imports show a spinner line under the status box while they run, then a green success line.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, FIXED_NOW, RANKINGS_CSV, confirmMdsPreview } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = FIXED_NOW.getTime();
const AMBER = 'rgb(245, 158, 11)';   // .freshness-stale
const MUTED = 'rgb(156, 163, 175)';  // .freshness-ok (--text-muted)
const OLD_DATE = '9/1/2026 at 10:00 AM';
const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });

/** Saves rankings / ADP meta (null removes it) and reloads, as a returning user would open the app. */
async function openWithMeta(page, { rankings, adp }) {
    await page.evaluate(([r, a]) => {
        if (r) localStorage.setItem('mds_meta', JSON.stringify(r)); else localStorage.removeItem('mds_meta');
        if (a) localStorage.setItem('mds_adp_meta', JSON.stringify(a)); else localStorage.removeItem('mds_adp_meta');
    }, [rankings, adp]);
    await page.reload();
    await page.waitForLoadState('networkidle');
}

/** The status box's text, and its age label's text, class and colour (null when it has none). */
async function readStatus(page, sel) {
    const box = page.locator(sel);
    await expect(box).toBeVisible();
    return box.evaluate(el => {
        const span = el.querySelector('span');
        return {
            text: el.textContent,
            label: span && { text: span.textContent, cls: span.className, color: getComputedStyle(span).color },
        };
    });
}

/** Holds requests until release() is called; hold() then hands them on to the earlier route (helpers.mjs). */
function gate() {
    let release;
    const open = new Promise(r => { release = r; });
    return { release, open, hold: async (route) => { await open; await route.fallback(); } };
}

test('saved rankings and ADP show their age, amber past 14 and 3 days; meta saved before 8B keeps its text', async ({ page }) => {
    const state = await openApp(page, '/');
    const fmt = 'FFC: Redraft - 1QB (PPR)';

    // Fresh, at each threshold's last day.
    await openWithMeta(page, {
        rankings: { count: 220, date: OLD_DATE, updatedAt: NOW - 3 * DAY },
        adp: { format: fmt, date: OLD_DATE, updatedAt: NOW },
    });
    expect(await readStatus(page, '#metaDisplay')).toEqual({
        text: 'Loaded: 220 players • Updated 3 days ago',
        label: { text: '• Updated 3 days ago', cls: 'freshness-ok', color: MUTED },
    });
    expect(await readStatus(page, '#adpStatusDisplay')).toEqual({
        text: `${fmt} • Fetched today`,
        label: { text: '• Fetched today', cls: 'freshness-ok', color: MUTED },
    });

    await openWithMeta(page, {
        rankings: { count: 220, date: OLD_DATE, updatedAt: NOW - 14 * DAY },
        adp: { format: fmt, date: OLD_DATE, updatedAt: NOW - 3 * DAY },
    });
    expect((await readStatus(page, '#metaDisplay')).label).toEqual({ text: '• Updated 14 days ago', cls: 'freshness-ok', color: MUTED });
    expect((await readStatus(page, '#adpStatusDisplay')).label).toEqual({ text: '• Fetched 3 days ago', cls: 'freshness-ok', color: MUTED });

    // Stale from the next day.
    await openWithMeta(page, {
        rankings: { count: 220, date: OLD_DATE, updatedAt: NOW - 15 * DAY },
        adp: { format: fmt, date: OLD_DATE, updatedAt: NOW - 4 * DAY },
    });
    expect(await readStatus(page, '#metaDisplay')).toEqual({
        text: 'Loaded: 220 players • Updated 15 days ago — consider refreshing',
        label: { text: '• Updated 15 days ago — consider refreshing', cls: 'freshness-stale', color: AMBER },
    });
    expect(await readStatus(page, '#adpStatusDisplay')).toEqual({
        text: `${fmt} • Fetched 4 days ago — fetch again before you draft`,
        label: { text: '• Fetched 4 days ago — fetch again before you draft', cls: 'freshness-stale', color: AMBER },
    });

    // Saved before 8B: no updatedAt, today's text and no label.
    await openWithMeta(page, {
        rankings: { count: 220, date: OLD_DATE },
        adp: { format: fmt, date: OLD_DATE },
    });
    expect(await readStatus(page, '#metaDisplay')).toEqual({ text: `Loaded: 220 players on ${OLD_DATE}`, label: null });
    expect(await readStatus(page, '#adpStatusDisplay')).toEqual({ text: `Fetched: ${fmt} on ${OLD_DATE}`, label: null });

    // The ADP format is saved text (a restored backup can hold anything): shown as text, not markup.
    await openWithMeta(page, { rankings: null, adp: { format: 'FFC: <b>Mock</b>', date: OLD_DATE, updatedAt: NOW } });
    await expect(page.locator('#metaDisplay')).toBeHidden();
    expect((await readStatus(page, '#adpStatusDisplay')).text).toBe('FFC: <b>Mock</b> • Fetched today');
    await expect(page.locator('#adpStatusDisplay b')).toHaveCount(0);

    await expectClean(page, state);
});

test('a rankings import shows the processing line, then the success line and a fresh label', async ({ page }) => {
    const state = await openApp(page, '/');
    await openWithMeta(page, { rankings: { count: 220, date: OLD_DATE }, adp: null });

    // Hold the Sleeper player map (processData's first network step) so the line can be seen.
    const players = gate();
    await page.route(/api\.sleeper\.app\/v1\/players\/nfl/, players.hold);

    await page.fill('#csvPasteArea', RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    const processing = page.locator('#rankingsProcessingStatus');
    await expect(processing).toBeVisible();
    await expect(processing).toHaveText('Processing players and building database…');
    await expect(processing.locator('svg.sync-spinner')).toHaveCount(1);
    await expect(processing).toHaveAttribute('role', 'status');
    // The status box keeps what it said before the import.
    await expect(page.locator('#metaDisplay')).toHaveText(`Loaded: 220 players on ${OLD_DATE}`);

    players.release();
    // The spinner goes off when the upload preview opens (8C); the success line waits for Save.
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(processing).toBeHidden();
    await expect(page.locator('#rankingsSuccessMsg')).toBeHidden();
    await confirmMdsPreview(page);
    await expect(toast(page, 'Loaded 24 players')).toBeVisible();
    const success = page.locator('#rankingsSuccessMsg');
    await expect(success).toBeVisible();
    await expect(success).toHaveText('Rankings loaded successfully!');
    await expect(page.locator('#metaDisplay')).toHaveText('Loaded: 24 players • Updated today');

    const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('mds_meta')));
    expect(meta.count).toBe(24);
    expect(meta.updatedAt).toBe(NOW);
    expect(meta.date).toMatch(/2026/); // the formatted date stays, for older copies of the app

    await expect(success).toBeHidden({ timeout: 5000 }); // shown for 3s
    await expectClean(page, state);
});

test('Fetch Market Value shows the processing line, then the success line; a failed fetch clears it', async ({ page }) => {
    const state = await openApp(page, '/');
    await page.fill('#csvPasteArea', RANKINGS_CSV);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    await confirmMdsPreview(page);
    await expect(toast(page, 'Loaded 24 players')).toBeVisible();
    await expect(page.locator('#adpStatusDisplay')).toBeHidden();

    let status = 200;
    const ffc = gate();
    await page.route(/^http:\/\/localhost:\d+\/api\/ffc\//, async (route) => {
        await ffc.open;
        if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            source: 'live', short: false, savedAt: FIXED_NOW.toISOString(), liveCount: 1, meta: { type: 'PPR' },
            players: [{ player_id: 1, name: "Ja'Marr Chase", position: 'WR', team: 'CIN', adp: 2.2, adp_formatted: '', times_drafted: 10, high: 1, low: 2, stdev: 0.5, bye: 10 }],
        }) });
    });

    await page.selectOption('#adpFormatSelect', 'ffc|ppr');
    const fetchBtn = page.getByRole('button', { name: 'Fetch Market Value' });
    await fetchBtn.click();
    const processing = page.locator('#adpProcessingStatus');
    await expect(processing).toBeVisible();
    await expect(processing).toHaveText('Fetching market value…');
    await expect(processing.locator('svg.sync-spinner')).toHaveCount(1);

    ffc.release();
    await expect(toast(page, 'Market Value (ADP) updated')).toBeVisible();
    await expect(processing).toBeHidden();
    await expect(page.locator('#adpSuccessMsg')).toBeVisible();
    await expect(page.locator('#adpSuccessMsg')).toHaveText('Market value updated!');
    await expect(page.locator('#adpStatusDisplay')).toHaveText('FFC: Redraft - 1QB (PPR) • Fetched today');
    const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('mds_adp_meta')));
    expect(meta.updatedAt).toBe(NOW);
    await expect(page.locator('#adpSuccessMsg')).toBeHidden({ timeout: 5000 });

    // A failed fetch: the line goes away, no success line, and the label is unchanged.
    status = 500;
    await page.waitForTimeout(2600); // let the button's "Complete!" flash restore its text
    await fetchBtn.click();
    await expect(toast(page, 'Failed to fetch live Market Value.')).toBeVisible();
    await expect(processing).toBeHidden();
    await expect(page.locator('#adpSuccessMsg')).toBeHidden();
    await expect(page.locator('#adpStatusDisplay')).toHaveText('FFC: Redraft - 1QB (PPR) • Fetched today');

    // The failed fetch's HTTP 500 and console.error (fetchMarketValue's catch) are expected here.
    state.errors.splice(0, state.errors.length, ...state.errors.filter(e => !e.includes('Fantasy Football Calculator Error: boom') && !e.includes('/api/ffc/')));
    await expectClean(page, state);
});
