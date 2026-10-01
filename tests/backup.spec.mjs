// Backup -> restore round trip for both apps (refactor chunk 1B, which moved the key filters
// behind Backup/Restore into js/shared/storage/keys.js).
//
// Each test seeds the app, plants keys that belong to the OTHER app (and the transient
// mds_handoff_roster hand-off), exports through the real Export Backup button, scrambles
// storage, restores through the real file input + confirm dialog, and checks after the reload:
//   * the backup held exactly this app's keys (so the prefix filter didn't change);
//   * restore put every backed-up value back and removed owned keys the backup didn't have;
//   * the other app's keys and the hand-off key were never touched;
//   * the restored data shows up in the UI.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls } from './helpers.mjs';

// Keys a backup must neither include nor touch on restore.
const FOREIGN = {
    mds: { mls_foreign_probe: 'mls', mds_season_foreign_probe: 'mls', shared_probe: 'x' },
    mls: { ds_foreign_probe: 'mds', mds_show_headshots: 'true', shared_probe: 'x' },
};
// The MDS -> MLS hand-off is planted in both apps and must stay out of both backups. MDS leaves
// it alone, but MLS consumes (and removes) it on page load, so after the restore's reload it's
// only checked on MDS.
const HANDOFF = 'mds_handoff_roster';
// Owned keys the seeded state doesn't write on its own but the filter has to cover:
// mds_show_headshots is the one MDS key outside the ds_ prefix ('true' is its default).
const OWNED_EXTRA = { mds: { mds_show_headshots: 'true' }, mls: {} };

// The app's own definition of "owned", written out independently of keys.js so a change to
// the shared filter fails here.
const OWNED = {
    mds: (k) => (k.startsWith('ds_') || k === 'mds_show_headshots') && k !== 'mds_handoff_roster',
    mls: (k) => (k.startsWith('mds_season_') || k.startsWith('mls_')) && k !== 'mds_handoff_roster',
};

const dumpStorage = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));

async function roundTrip(page, state, { app, inputId, junkKey, dropKey }) {
    await page.evaluate((keys) => { for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); },
        { ...FOREIGN[app], ...OWNED_EXTRA[app], [HANDOFF]: '{"probe":1}' });
    const before = await dumpStorage(page);
    const owned = OWNED[app];

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export Backup' }).click(),
    ]);
    const backupPath = await download.path();
    const payload = JSON.parse(readFileSync(backupPath, 'utf8'));

    expect(payload.app).toBe(app.toUpperCase());
    const expectedKeys = Object.keys(before).filter(owned).filter(k => k !== 'ds_drafts_premigration_backup').sort();
    expect(expectedKeys.length, 'seeded state has owned keys to back up').toBeGreaterThan(2);
    expect(Object.keys(payload.data).sort()).toEqual(expectedKeys);
    for (const k of expectedKeys) expect(payload.data[k], k).toBe(before[k]);
    expect(payload.data[dropKey], `${dropKey} is in the backup`).toBeDefined();
    for (const k of Object.keys(OWNED_EXTRA[app])) expect(payload.data[k], `${k} is in the backup`).toBeDefined();
    expect(payload.data[HANDOFF], `${HANDOFF} is not in the backup`).toBeUndefined();

    // Scramble: lose one owned key, add an owned key the backup doesn't have.
    await page.evaluate(({ dropKey, junkKey }) => {
        localStorage.removeItem(dropKey);
        localStorage.setItem(junkKey, 'junk');
    }, { dropKey, junkKey });

    await page.setInputFiles(`#${inputId}`, backupPath);
    await expect(page.locator('#mds-confirm-overlay')).toBeVisible();
    await Promise.all([
        page.waitForEvent('load'),
        page.locator('#mds-confirm-overlay [data-confirm-action="ok"]').click(),
    ]);
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);

    const after = await dumpStorage(page);
    for (const k of expectedKeys) expect(after[k], `restored ${k}`).toBe(payload.data[k]);
    expect(after[junkKey], 'owned key missing from the backup is cleared').toBeUndefined();
    for (const [k, v] of Object.entries(FOREIGN[app])) expect(after[k], `foreign key ${k} untouched`).toBe(v);
    if (app === 'mds') expect(after[HANDOFF], `${HANDOFF} untouched`).toBe('{"probe":1}');
}

test('MDS backup -> restore round trip', async ({ page }) => {
    const state = await openApp(page, '/');
    await seedMds(page);
    await showTab(page, 'setup');
    await roundTrip(page, state, { app: 'mds', inputId: 'mdsImportFileInput', junkKey: 'ds_junk_probe', dropKey: 'ds_active_draft_id' });
    await showTab(page, 'team');
    await expect(page.locator('#teamTab')).toContainText("Ja'Marr Chase");
    await expectClean(page, state);
});

test('MLS backup -> restore round trip', async ({ page }) => {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await showTab(page, 'setup');
    await page.locator('summary', { hasText: 'Backup & Restore' }).click(); // collapsed accordion
    await roundTrip(page, state, { app: 'mls', inputId: 'mlsImportFileInput', junkKey: 'mls_junk_probe', dropKey: 'mds_season_leagues' });
    await showTab(page, 'roster');
    await expect(page.locator('#rosterTab')).toContainText('Josh Allen');
    await expectClean(page, state);
});
