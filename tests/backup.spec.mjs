// Backup -> restore round trip for both apps (refactor chunk 1B, which moved the key filters
// behind Backup/Restore into js/shared/storage/keys.js).
//
// Each test seeds the app, plants keys that belong to the OTHER app (and the transient
// hand-off, under its old and new names), exports through the real Export Backup button,
// scrambles storage, restores through the real file input + confirm dialog, and checks after
// the reload:
//   * the backup held exactly this app's keys (so the prefix filter didn't change);
//   * restore put every backed-up value back and removed owned keys the backup didn't have;
//   * the other app's keys and the hand-off key were never touched;
//   * the restored data shows up in the UI.
//
// Since 6B (which renamed the keys: ds_* -> mds_*, mds_season_* -> mls_*) it also plants this
// app's keys under their old names, which a backup must leave out and a restore must clear, and
// restores a backup file saved before 6B (tests/fixtures/pre-6b/, exported by main's code at 6B).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls } from './helpers.mjs';

// Keys a backup must neither include nor touch on restore: the other app's, under today's names
// and the pre-6B ones (MLS's old mds_season_* and the old T-Score cache names start with mds_
// too), and keys no app owns.
const FOREIGN = {
    mds: {
        mls_foreign_probe: 'mls', mds_season_foreign_probe: 'mls (old name)',
        mds_tscore_cache: '{"old":1}', tscore_cache: '{"new":1}', shared_probe: 'x',
    },
    mls: {
        mds_foreign_probe: 'mds', ds_foreign_probe: 'mds (old name)', mds_show_headshots: 'true',
        mds_season: 'look-alike', shared_probe: 'x',
    },
};
// The MDS -> MLS hand-off is planted in both apps and must stay out of both backups. MDS leaves
// it alone, but MLS consumes (and removes) it on page load, so after the restore's reload it's
// only checked on MDS. Its old name is checked on both: nothing reads it any more.
const HANDOFF = 'shared_handoff_roster';
const OLD_HANDOFF = 'mds_handoff_roster';
// Owned keys the seeded state doesn't write on its own but the filter has to cover.
const OWNED_EXTRA = { mds: { mds_show_headshots: 'true' }, mls: {} };
// This app's keys under their pre-6B names: never in a backup, cleared by restore.
const OWN_OLD = { mds: { ds_old_probe: 'old', ds_drafts: '[]' }, mls: { mds_season_old_probe: 'old', mds_season_leagues: '[]' } };

// The app's own definition of "owned", written out independently of keys.js so a change to
// the shared filter fails here.
const OLD_UNOWNED = ['mds_handoff_roster', 'mds_tscore_cache', 'mds_tscore_cache_updated'];
const OWNED = {
    mds: (k) => k.startsWith('mds_') && !k.startsWith('mds_season_') && !OLD_UNOWNED.includes(k),
    mls: (k) => k.startsWith('mls_'),
};
// The 6B rename, written out independently of keys.js.
const renamed = (k) => (k.startsWith('ds_') ? 'm' + k : k.startsWith('mds_season_') ? 'mls_' + k.slice('mds_season_'.length) : k);

const dumpStorage = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));

async function roundTrip(page, state, { app, inputId, junkKey, dropKey }) {
    await page.evaluate((keys) => { for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); },
        { ...FOREIGN[app], ...OWNED_EXTRA[app], ...OWN_OLD[app], [HANDOFF]: '{"probe":1}', [OLD_HANDOFF]: '{"probe":0}' });
    const before = await dumpStorage(page);
    const owned = OWNED[app];

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export Backup' }).click(),
    ]);
    const backupPath = await download.path();
    const payload = JSON.parse(readFileSync(backupPath, 'utf8'));

    expect(payload.app).toBe(app.toUpperCase());
    const expectedKeys = Object.keys(before).filter(owned).filter(k => k !== 'mds_drafts_premigration_backup').sort();
    expect(expectedKeys.length, 'seeded state has owned keys to back up').toBeGreaterThan(2);
    expect(Object.keys(payload.data).sort()).toEqual(expectedKeys);
    for (const k of expectedKeys) expect(payload.data[k], k).toBe(before[k]);
    expect(payload.data[dropKey], `${dropKey} is in the backup`).toBeDefined();
    for (const k of Object.keys(OWNED_EXTRA[app])) expect(payload.data[k], `${k} is in the backup`).toBeDefined();
    expect(payload.data[HANDOFF], `${HANDOFF} is not in the backup`).toBeUndefined();
    expect(payload.data[app === 'mds' ? 'mds_key_names_version' : 'mls_key_names_version'], 'the 6B rename ran').toBe('1');

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
    for (const k of Object.keys(OWN_OLD[app])) expect(after[k], `old name ${k} cleared`).toBeUndefined();
    for (const [k, v] of Object.entries(FOREIGN[app])) expect(after[k], `foreign key ${k} untouched`).toBe(v);
    if (app === 'mds') expect(after[HANDOFF], `${HANDOFF} untouched`).toBe('{"probe":1}');
    expect(after[OLD_HANDOFF], `${OLD_HANDOFF} untouched`).toBe('{"probe":0}');
}

// Restores a backup file exported before 6B (old key names) into a browser that already has
// this app's data under both names, and checks every value landed under its new name.
async function restoreOldBackup(page, state, { app, inputId }) {
    const file = new URL(`./fixtures/pre-6b/${app}-backup.json`, import.meta.url);
    const oldData = JSON.parse(readFileSync(file, 'utf8')).data;
    expect(Object.keys(oldData).some(k => k.startsWith(app === 'mds' ? 'ds_' : 'mds_season_')), 'fixture uses old names').toBe(true);

    await page.evaluate((keys) => { for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); },
        { ...FOREIGN[app], ...OWN_OLD[app], [app === 'mds' ? 'mds_junk_probe' : 'mls_junk_probe']: 'junk', [OLD_HANDOFF]: '{"probe":0}' });

    await page.setInputFiles(`#${inputId}`, file.pathname);
    await expect(page.locator('#mds-confirm-overlay')).toContainText(`${Object.keys(oldData).length} settings`);
    await Promise.all([
        page.waitForEvent('load'),
        page.locator('#mds-confirm-overlay [data-confirm-action="ok"]').click(),
    ]);
    await page.waitForLoadState('networkidle');
    await expectClean(page, state);

    const after = await dumpStorage(page);
    for (const [k, v] of Object.entries(oldData)) expect(after[renamed(k)], `${k} restored as ${renamed(k)}`).toBe(v);
    const owned = Object.keys(after).filter(OWNED[app]).sort();
    // Only the restored keys, plus the rename marker (the old file has none, so the rename ran
    // again on the reload and found no old keys to copy).
    const markerKey = app === 'mds' ? 'mds_key_names_version' : 'mls_key_names_version';
    expect(owned).toEqual([...Object.keys(oldData).map(renamed), markerKey].sort());
    // Restore writes new names only. (Writing the old ones would pass the checks above too: the
    // rename on the reload would copy them.)
    expect(Object.keys(after).filter(k => k.startsWith(app === 'mds' ? 'ds_' : 'mds_season_')), 'no old names left').toEqual([]);
    for (const [k, v] of Object.entries(FOREIGN[app])) expect(after[k], `foreign key ${k} untouched`).toBe(v);
    expect(after[OLD_HANDOFF], `${OLD_HANDOFF} untouched`).toBe('{"probe":0}');
}

test('MDS backup -> restore round trip', async ({ page }) => {
    const state = await openApp(page, '/');
    await seedMds(page);
    await showTab(page, 'setup');
    await roundTrip(page, state, { app: 'mds', inputId: 'mdsImportFileInput', junkKey: 'mds_junk_probe', dropKey: 'mds_active_draft_id' });
    await showTab(page, 'team');
    await expect(page.locator('#teamTab')).toContainText("Ja'Marr Chase");
    await expectClean(page, state);
});

test('MLS backup -> restore round trip', async ({ page }) => {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await showTab(page, 'setup');
    await page.locator('summary', { hasText: 'Backup & Restore' }).click(); // collapsed accordion
    await roundTrip(page, state, { app: 'mls', inputId: 'mlsImportFileInput', junkKey: 'mls_junk_probe', dropKey: 'mls_leagues' });
    await showTab(page, 'roster');
    await expect(page.locator('#rosterTab')).toContainText('Josh Allen');
    await expectClean(page, state);
});

test('MDS restores a backup file saved before the 6B key rename', async ({ page }) => {
    const state = await openApp(page, '/');
    await showTab(page, 'setup');
    await restoreOldBackup(page, state, { app: 'mds', inputId: 'mdsImportFileInput' });
    await showTab(page, 'team');
    await expect(page.locator('#teamTab')).toContainText("Ja'Marr Chase");
    await expect(page.locator('#mlsBanner')).toBeHidden(); // dismissed in the backup
    await expectClean(page, state);
});

test('MLS restores a backup file saved before the 6B key rename', async ({ page }) => {
    const state = await openApp(page, '/lineup/');
    await showTab(page, 'setup');
    await page.locator('summary', { hasText: 'Backup & Restore' }).click(); // collapsed accordion
    await restoreOldBackup(page, state, { app: 'mls', inputId: 'mlsImportFileInput' });
    await showTab(page, 'roster');
    await expect(page.locator('#rosterTab')).toContainText('Josh Allen');
    await expect(page.locator('#leagueSelect, select').filter({ hasText: 'Fixture League' }).first()).toBeAttached();
    await expectClean(page, state);
});
