// The Replace Set dialog (improvements F10): the rankings upload preview on a phone with many leagues, and what its
// red box says about who uses the set.
//
// (1) The buttons. The preview grows with the red box and the "Also use this set in" list; it used to scroll as one
// block, so on a 375×667 phone with nine leagues Cancel and Replace Set sat below the fold. Now the middle scrolls and
// the button row stays pinned at the bottom of the dialog.
// (2) The count. Since S23 a ROS set can also be a dynasty or keeper league's In-Season set, and replacing it changes
// those leagues too. The red box, Auto-Fetch's confirm and the picker's rows now say so.
//
// Setup: the synced Fixture League (redraft) plus eight copies. Two ROS sets are uploaded through the card:
// "ROS Redraft" (the active league's) and "Dynasty SF". "Redraft 2" uses ROS Redraft too; "Dynasty 1" and "Dynasty 2"
// are dynasty leagues on Dynasty SF that use ROS Redraft as In-Season rankings; the other five use Dynasty SF or nothing.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, callApp, FIXED_NOW, RANKINGS_CSV } from './helpers.mjs';

const IN_SEASON = 'In-\u2060Season';

async function openRosCard(page) {
    await showTab(page, 'roster');
    const toggle = page.locator('#rosRankingsCard .rankings-card-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(page.locator('#rosRankingSetSelect')).toBeVisible();
}

async function uploadRos(page, name) {
    await openRosCard(page);
    await page.locator('#rosRankingSetSelect').selectOption('__new__');
    await page.fill('#rosNewSetName', name);
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
    await expect(page.locator('#rankingsPreviewOverlay')).toBeVisible();
    await expect(page.locator('#rankingsPreviewOverlay')).toContainText('24 players parsed');
    await callApp(page, 'confirmRankingsPreview');
    await expect(page.locator('#rankingsPreviewOverlay')).toBeHidden();
}

const setIdOf = (page, name) => page.evaluate((n) => JSON.parse(localStorage.getItem('mls_ranking_sets_ros')).find(s => s.name === n).id, name);

// Nine leagues; the active one (Fixture League) has ROS Redraft selected, so the next upload replaces it.
async function setUp(page) {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await uploadRos(page, 'Dynasty SF');
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 1000)); // set ids are 'rset_' + Date.now()
    await uploadRos(page, 'ROS Redraft');
    const ids = { redraft: await setIdOf(page, 'ROS Redraft'), dynasty: await setIdOf(page, 'Dynasty SF') };
    await page.evaluate(async (ids) => {
        const { State } = await import('/js/mls/state.js');
        const base = State.leagues[0];
        const copy = (n, name, extra) => ({ ...JSON.parse(JSON.stringify(base)), leagueId: `90000000000000000${n}`, name, rosRankingSetId: null, ...extra });
        State.leagues.push(
            copy(11, 'Redraft 2', { rosRankingSetId: ids.redraft }),
            copy(12, 'Dynasty 1', { leagueType: 'dynasty', rosRankingSetId: ids.dynasty, seasonRankingSetId: ids.redraft }),
            copy(13, 'Dynasty 2', { leagueType: 'dynasty', rosRankingSetId: ids.dynasty, seasonRankingSetId: ids.redraft }),
            copy(14, 'Dynasty 3', { leagueType: 'dynasty', rosRankingSetId: ids.dynasty }),
            copy(15, 'Redraft 3', { rosRankingSetId: ids.dynasty }),
            copy(16, 'Redraft 4', {}),
            copy(17, 'Redraft 5', {}),
            copy(18, 'Redraft 6', {}),
        );
        localStorage.setItem('mls_leagues', JSON.stringify(State.leagues));
    }, ids);
    return { state, ids };
}

async function openReplacePreview(page) {
    await openRosCard(page);
    await expect(page.locator('#rosRankingSetSelect option:checked')).toHaveText(/^ROS Redraft/);
    await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
    const overlay = page.locator('#rankingsPreviewOverlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#rankingsPreviewConfirmBtn')).toHaveText('Replace Set');
    return overlay;
}

// Whether an element's box is wholly inside the window and not covered (the point at its centre is the element).
const inView = (loc) => loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth && !!hit && el.contains(hit);
});

test.describe('the Replace Set dialog', () => {
    test('on a 375×667 phone with nine leagues, Cancel and Replace Set show without scrolling', async ({ page }) => {
        const { state } = await setUp(page);
        await page.setViewportSize({ width: 375, height: 667 });
        const overlay = await openReplacePreview(page);
        const modal = overlay.locator('.preview-modal');
        // The previous upload's toast would sit over the buttons for a few seconds; it isn't what's being checked.
        await page.evaluate(() => document.querySelectorAll('.mds-toast').forEach(t => t.remove()));
        expect(await inView(page.locator('#rankingsPreviewConfirmBtn'))).toBe(true);
        expect(await inView(overlay.getByRole('button', { name: 'Cancel' }))).toBe(true);
        // The dialog is taller than the window would allow: its middle scrolls.
        const sizes = await modal.evaluate((m) => ({ scroll: m.querySelector('.preview-body').scrollHeight, client: m.querySelector('.preview-body').clientHeight }));
        expect(sizes.scroll).toBeGreaterThan(sizes.client);
        // The row is marked while content sits under it, and not once the list is scrolled to its end.
        const actions = overlay.locator('.preview-actions');
        await expect(actions).toHaveClass(/is-scrolled-under/);
        await modal.locator('.preview-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
        await expect(actions).not.toHaveClass(/is-scrolled-under/);
        // Still there after scrolling, and Replace Set works from where it is.
        expect(await inView(page.locator('#rankingsPreviewConfirmBtn'))).toBe(true);
        await page.locator('#rankingsPreviewConfirmBtn').click();
        await expect(overlay).toBeHidden();
        await expectClean(page, state);
    });

    test('the red box counts the leagues using the set as In-Season rankings, and the picker rows say so', async ({ page }) => {
        const { state } = await setUp(page);
        const overlay = await openReplacePreview(page);
        await expect(page.locator('#rankingsPreviewTarget')).toContainText(
            `Used by 2 leagues, and as ${IN_SEASON} rankings in 2 dynasty leagues. This can't be undone.`);
        // The dynasty leagues already reading this set as In-Season say so beside their dynasty set.
        const row = (name) => overlay.locator('.mls-league-picker-row', { hasText: name }).locator('.mls-league-picker-note');
        await expect(row('Dynasty 1')).toHaveText('In-Season already · dynasty: Dynasty SF');
        await expect(row('Dynasty 3')).toHaveText('Currently: Dynasty SF');
        await expect(row('Redraft 2')).toHaveText('Already using this set');
        await overlay.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay).toBeHidden();
        await expectClean(page, state);
    });

    test("Auto-Fetch's confirm says the same", async ({ page }) => {
        const { state } = await setUp(page);
        await page.route(/^https:\/\/api\.fantasycalc\.com\//, (route) => route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify([{ player: { name: "Ja'Marr Chase", position: 'WR' }, overallRank: 1 }, { player: { name: 'Josh Allen', position: 'QB' }, overallRank: 2 }]) }));
        await openRosCard(page);
        await page.locator('#autoFetchRosBtn').click();
        const dialog = page.locator('.mds-confirm-modal');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(`It is used by 2 leagues, and as ${IN_SEASON} rankings in 2 dynasty leagues. This can't be undone.`);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        await expectClean(page, state);
    });

    test("a dynasty league's dynasty set: the box says it's their dynasty rankings", async ({ page }) => {
        const { state } = await setUp(page);
        await callApp(page, 'switchActiveLeague', '9000000000000000012'); // Dynasty 1
        await openRosCard(page);
        await expect(page.locator('#rosRankingSetSelect option:checked')).toHaveText(/^Dynasty SF/);
        await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
        const overlay = page.locator('#rankingsPreviewOverlay');
        await expect(overlay).toBeVisible();
        await expect(page.locator('#rankingsPreviewTarget')).toContainText(
            "Replaces the saved set Dynasty SF (24 players). Used by 1 league, and as dynasty rankings in 3 dynasty leagues. This can't be undone.");
        await overlay.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay).toBeHidden();
        await expectClean(page, state);
    });
});

// The same pinned row in the other dialogs that share its rules: Draft Strategist's upload preview and the shared
// confirm and prompt dialogs. A short dialog is unchanged (no line, nothing scrolls).
test.describe('the pinned button row in the shared dialogs', () => {
    test("Draft Strategist's upload preview in a short window keeps its buttons in view", async ({ page }) => {
        const state = await openApp(page, '/');
        await page.setViewportSize({ width: 375, height: 480 });
        await page.fill('#csvPasteArea', RANKINGS_CSV);
        await page.getByRole('button', { name: 'Process Pasted Data' }).click();
        const overlay = page.locator('#rankingsPreviewOverlay');
        await expect(overlay).toBeVisible();
        expect(await inView(page.locator('#rankingsPreviewConfirmBtn'))).toBe(true);
        await expect(overlay.locator('.preview-actions')).toHaveClass(/is-scrolled-under/);
        await page.locator('#rankingsPreviewConfirmBtn').click();
        await expect(overlay).toBeHidden();
        await expectClean(page, state);
    });

    test('a long confirm scrolls its message, a short one looks as before', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await page.setViewportSize({ width: 375, height: 667 });
        const open = (message) => page.evaluate((m) => { import('/js/shared/ui/confirm.js').then(c => { window.__f10 = c.showConfirm(m, { title: 'Sure?' }); }); }, message);
        const dialog = page.locator('#mds-confirm-overlay');
        await open('One short line.');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.mds-modal-actions')).not.toHaveClass(/is-scrolled-under/);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        await open(Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} of a long message.`).join('\n\n'));
        await expect(dialog).toBeVisible();
        expect(await inView(dialog.getByRole('button', { name: 'Confirm' }))).toBe(true);
        await expect(dialog.locator('.mds-modal-actions')).toHaveClass(/is-scrolled-under/);
        await dialog.getByRole('button', { name: 'Confirm' }).click();
        expect(await page.evaluate(() => window.__f10)).toBe(true);
        await expectClean(page, state);
    });

    // An on-screen keyboard shrinks only the visual viewport (iOS Safari, Chrome on Android), so the page's own height
    // stays the same. A stand-in visualViewport plays the keyboard here: up, the overlay fits the band above it and the
    // field and both buttons show; down, the overlay goes back to its CSS size.
    test('the prompt with the on-screen keyboard up', async ({ page }) => {
        await page.addInitScript(() => {
            const vv = new EventTarget();
            Object.assign(vv, { height: 0, width: 0, offsetTop: 0, offsetLeft: 0, scale: 1 });
            window.__setKeyboard = (px) => { vv.height = window.innerHeight - px; vv.width = window.innerWidth; vv.dispatchEvent(new Event('resize')); };
            Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
            addEventListener('DOMContentLoaded', () => { vv.height = window.innerHeight; vv.width = window.innerWidth; });
        });
        const state = await openApp(page, '/lineup/');
        await page.setViewportSize({ width: 375, height: 667 });
        await page.evaluate(() => { window.__setKeyboard(0); import('/js/shared/ui/prompt.js').then(p => { window.__f10 = p.showPrompt('Set name', { title: 'Rename set', value: 'ROS Redraft' }); }); });
        const dialog = page.locator('#mds-prompt-overlay');
        await expect(dialog).toBeVisible();
        await page.evaluate(() => window.__setKeyboard(330)); // a phone keyboard with its suggestion bar
        await expect(dialog).toHaveCSS('height', '337px');
        for (const el of [page.locator('#mds-prompt-input'), dialog.getByRole('button', { name: 'Cancel' }), dialog.getByRole('button', { name: 'Save' })]) {
            const box = await el.boundingBox();
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.y + box.height).toBeLessThanOrEqual(337);
        }
        await page.evaluate(() => window.__setKeyboard(0));
        await expect(dialog).toHaveCSS('height', '667px');
        await dialog.getByRole('button', { name: 'Save' }).click();
        expect(await page.evaluate(() => window.__f10)).toBe('ROS Redraft');
        await expectClean(page, state);
    });
});

// Round 2 (the owner's review as a user): one scroll, the destination first, a short note, one-line buttons, a line
// under the title, a wider dialog on computers; and around it on the card: which set the league keeps while "+ Create
// New Set" is picked, an icon-only Rename on phones, and Auto-Fetch's settings folded.
test.describe('the upload preview and the rankings card, round 2', () => {
    test('one scroll, the destination right under the count, a short derived note, one-line buttons', async ({ page }) => {
        const { state } = await setUp(page);
        const phone = test.info().project.name === 'phone';
        if (phone) await page.setViewportSize({ width: 375, height: 667 });
        const overlay = await openReplacePreview(page);
        // The league list has no scroll of its own: the dialog's middle is the only one.
        const list = overlay.locator('.mls-league-picker-list');
        expect(await list.evaluate((l) => l.scrollHeight - l.clientHeight)).toBe(0);
        // What saving does comes first, under "24 players parsed".
        const order = await overlay.locator('.preview-body').evaluate((b) => [...b.children].filter(c => c.offsetParent).map(c => c.id || c.className));
        expect(order.slice(0, 3)).toEqual(['rankingsPreviewCount', 'rankingsPreviewTarget', 'rankingsPreviewList']);
        // The derived-ranks note is one line; the rest is behind "Why?".
        const derived = page.locator('#rankingsPreviewDerived');
        await expect(derived.locator('.preview-derived-body')).toHaveText("The app works out position ranks (WR1, RB2, …) from the file's order. Fine to save.");
        await expect(derived.locator('.preview-derived-detail')).toBeHidden();
        await derived.getByText('Why?').click();
        await expect(derived.locator('.preview-derived-detail')).toContainText('This file has no positional rank column');
        // Both buttons on one line, the same height.
        const [cancel, replace] = await Promise.all([overlay.getByRole('button', { name: 'Cancel' }).boundingBox(), page.locator('#rankingsPreviewConfirmBtn').boundingBox()]);
        expect(replace.height).toBe(cancel.height);
        expect(replace.height).toBeLessThan(50);
        // The line under the title shows once the middle is scrolled.
        const modal = overlay.locator('.preview-modal');
        await overlay.locator('.preview-body').evaluate((b) => { b.scrollTop = 0; b.dispatchEvent(new Event('scroll')); });
        await expect(modal).not.toHaveClass(/is-scrolled-down/);
        await overlay.locator('.preview-body').evaluate((b) => { b.scrollTop = 200; });
        await expect(modal).toHaveClass(/is-scrolled-down/);
        // 520px on a computer, the phone's width less the margins on a phone.
        expect((await modal.boundingBox()).width).toBe(phone ? 327 : 520);
        await overlay.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay).toBeHidden();
        // A new set: "Save Set".
        await openRosCard(page);
        await page.locator('#rosRankingSetSelect').selectOption('__new__');
        await page.setInputFiles('#rosFileInput', { name: 'rankings.csv', mimeType: 'text/csv', buffer: Buffer.from(RANKINGS_CSV) });
        await expect(overlay).toBeVisible();
        await expect(page.locator('#rankingsPreviewConfirmBtn')).toHaveText('Save Set');
        // Reopened, it starts at the top.
        expect(await overlay.locator('.preview-body').evaluate((b) => b.scrollTop)).toBe(0);
        await overlay.getByRole('button', { name: 'Cancel' }).click();
        await expectClean(page, state);
    });

    test('"+ Create New Set" says which set the league keeps until the upload', async ({ page }) => {
        const { state } = await setUp(page);
        await openRosCard(page);
        const hint = page.locator('#rosNewSetHint');
        await expect(hint).toBeHidden();
        await page.locator('#rosRankingSetSelect').selectOption('__new__');
        await expect(hint).toHaveText('Your next upload or Auto-Fetch saves a new set. This league stays on "ROS Redraft" until then.');
        await page.locator('#rosRankingSetSelect').selectOption({ label: 'ROS Redraft (24 players)' });
        await expect(hint).toBeHidden();
        await expectClean(page, state);
    });

    test("Rename is its pencil on a phone; Auto-Fetch's settings fold behind a summary", async ({ page }) => {
        const { state } = await setUp(page);
        const phone = test.info().project.name === 'phone';
        if (phone) await page.setViewportSize({ width: 375, height: 667 });
        await openRosCard(page);
        const rename = page.locator('#rosRenameSetBtn');
        await expect(rename).toHaveAccessibleName('Rename this ranking set');
        await expect(rename.locator('.mls-rename-label')).toBeVisible({ visible: !phone });
        const settings = page.locator('#rosAutoFetchSettings');
        await expect(page.locator('#rosMarketSummary')).toHaveText('FantasyCalc · Redraft · 1QB · Full PPR');
        await expect(page.locator('#rosMarketType')).toBeHidden();
        await settings.locator('summary').click();
        await page.locator('#rosMarketQbs').selectOption('2');
        await page.locator('#rosMarketTep').check();
        await expect(page.locator('#rosMarketSummary')).toHaveText('FantasyCalc · Redraft · Superflex · Full PPR · TEP');
        await expect(page.locator('#autoFetchRosBtn')).toBeVisible();
        await expectClean(page, state);
    });
});
