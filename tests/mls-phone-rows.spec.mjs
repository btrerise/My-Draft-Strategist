// Phone rows on the Lineup and Roster tabs (improvements S32, the owner's choices). Under 600px the slot (or position)
// badge sits on the lower edge of the player's photo, so the name gets the row's width. A Lineup row shows the slot, photo,
// name, position, team, rank badge, the kickoff with its opponent, the warnings that need you (injury, BYE, the IR slot,
// Bench / Starting in Sleeper), points and swap; LOCKED / AUTO-LOCKED, EARLY, TAXI and the rank-change chip wait behind a
// tap on the name ("+N" counts them), which opens the row's details in the shared sheet with each badge's legend sentence
// and a labelled lock button. The photo and slot badge lock the player; a padlock dot on the photo shows the state.
// Tablets and computers keep today's rows.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

const HENRY = '3198';
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const row = (page, name) => page.locator('#optimalLineupContainer .lineup-slot').filter({ has: page.locator('.player-name-wrap', { hasText: name }) });
const box = (loc) => loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });

// The fixture league with Derrick Henry questionable and Buffalo (Josh Allen) an early team.
async function setUp(page) {
    const state = await openApp(page, '/lineup/');
    // After openApp: its catch-all for Sleeper is registered first, and the last route registered wins.
    await page.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
        const players = fixture('players-nfl.json');
        players[HENRY].injury_status = 'Questionable';
        return route.fulfill({ json: players });
    });
    await seedMls(page);
    await loadMlsRankings(page);
    await page.evaluate(async () => {
        const { State } = await import('/js/mls/state.js');
        State.earlyTeams = ['BUF'];
    });
    await showTab(page, 'lineup');
    await callApp(page, 'renderLineupUI');
    return state;
}

test('a phone row shows the chosen set, with the rest in its details; wider screens keep today\'s rows', async ({ page }, info) => {
    const phone = info.project.name === 'phone';
    if (phone) await page.setViewportSize({ width: 375, height: 812 });
    const state = await setUp(page);
    const allen = row(page, 'Josh Allen');
    const henry = row(page, 'Derrick Henry');

    if (!phone) {
        // Today's row: the slot badge and photo side by side, every badge on the row, the lock at the right.
        await expect(allen.locator('.early-badge')).toBeVisible();
        await expect(allen.locator('.mls-row-more')).toBeHidden();
        await expect(allen.locator('.mls-lead-lock')).toBeHidden();
        await expect(allen.locator('.lock-btn')).toBeVisible();
        const [slot, photo] = await Promise.all([box(allen.locator('.slot-badge')), box(allen.locator('.mls-headshot'))]);
        expect(photo.x).toBeGreaterThanOrEqual(slot.right);
        await expectClean(page, state);
        return;
    }

    // The slot badge sits on the photo's lower edge, centred under it.
    const [slot, photo] = await Promise.all([box(allen.locator('.slot-badge')), box(allen.locator('.mls-headshot'))]);
    expect(slot.y).toBeLessThan(photo.bottom);
    expect(slot.bottom).toBeGreaterThan(photo.bottom);
    expect(Math.abs((slot.x + slot.w / 2) - (photo.x + photo.w / 2))).toBeLessThan(1.5);
    // Shown: the injury. Behind the tap: EARLY, counted after the name. No lock at the right.
    await expect(henry.locator('.inj-badge')).toBeVisible();
    await expect(henry.locator('.mls-row-more')).toHaveAttribute('aria-label', 'Details for Derrick Henry');
    await expect(allen.locator('.early-badge')).toBeHidden();
    await expect(allen.locator('.mls-row-more')).toHaveText('+1');
    await expect(allen.locator('.mls-row-lock')).toBeHidden();

    // The photo and slot badge lock him: the padlock dot turns green, LOCKED joins what's behind the tap.
    const lead = allen.getByRole('button', { name: 'Lock Josh Allen' });
    await expect(lead).toHaveAttribute('aria-pressed', 'false');
    await expect(lead.locator('.mls-lock-dot')).toHaveClass(/\bis-off\b/);
    await lead.click();
    await expect(allen).toHaveClass(/\blocked\b/);
    await expect(allen.getByRole('button', { name: 'Lock Josh Allen' })).toHaveAttribute('aria-pressed', 'true');
    await expect(allen.locator('.mls-lock-dot')).toHaveClass(/\bis-on\b/);
    await expect(allen.locator('.mls-lock-badge')).toBeHidden();
    await expect(allen.locator('.mls-row-more')).toHaveText('+2');
    await expect(allen.locator('.mls-row-more')).toHaveAttribute('aria-label', 'Details for Josh Allen, 2 more badges');

    // A tap on his name opens the details: every badge on his row with the legend's sentence, and the lock.
    // force: the click lands on the name's spot, where the details button's area lies over the name (the point of it).
    await allen.locator('.player-name-wrap').click({ force: true });
    const sheet = page.getByRole('dialog', { name: 'Josh Allen' });
    await expect(sheet).toBeVisible();
    const lines = sheet.locator('.badge-legend-row');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0).locator('.mls-lock-badge')).toHaveText('LOCKED');
    await expect(lines.nth(0).locator('.badge-legend-text')).toContainText('LOCKED: you locked him in that spot');
    await expect(lines.nth(1).locator('.early-badge')).toHaveText('EARLY');
    await expect(lines.nth(1).locator('.badge-legend-text')).toContainText('He plays before the main Sunday games');
    await expect(lines.nth(2).locator('.mls-rank-badge')).toHaveText('Pos: #1 (T3)');
    await expect(lines.nth(2).locator('.badge-legend-text')).toContainText('his rank at his position');
    // The copies are text, not controls.
    await expect(sheet.locator('.badge-legend-sample button')).toHaveCount(0);
    // Its lock button unlocks him, closes the sheet and puts focus back on his row.
    await sheet.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('.sheet-host')).toHaveCount(0);
    await expect(allen).not.toHaveClass(/\blocked\b/);
    await expect(allen.locator('.mls-row-more')).toBeFocused();
    await expect(allen.locator('.mls-row-more')).toHaveText('+1');

    // A row with nothing hidden: three quiet dots, and its details still list its badges.
    await henry.locator('.mls-row-more').click();
    const henrySheet = page.getByRole('dialog', { name: 'Derrick Henry' });
    await expect(henrySheet.locator('.inj-badge')).toHaveText('Q');
    await expect(henrySheet.getByRole('button', { name: 'Lock in this spot' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-host')).toHaveCount(0);
    await expect(henry.locator('.mls-row-more')).toBeFocused();

    await expectClean(page, state);
});

test('the details open and close from the keyboard', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'a phone row\'s details; wider screens show every badge on the row');
    await page.setViewportSize({ width: 375, height: 812 });
    const state = await setUp(page);
    const more = row(page, 'Josh Allen').locator('.mls-row-more');
    await more.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Josh Allen' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.sheet-title')).toBeFocused();
    // Tab stays in the sheet: the lock, the close button, the handle, and round again.
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('.sheet'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-host')).toHaveCount(0);
    await expect(more).toBeFocused();
    // The photo's lock from the keyboard.
    const lead = row(page, 'Josh Allen').getByRole('button', { name: 'Lock Josh Allen' });
    await lead.focus();
    await page.keyboard.press('Enter');
    await expect(row(page, 'Josh Allen')).toHaveClass(/\blocked\b/);
    await expectClean(page, state);
});

test('a Roster row puts its position badge on the photo on a phone, beside it on wider screens', async ({ page }, info) => {
    const phone = info.project.name === 'phone';
    if (phone) await page.setViewportSize({ width: 375, height: 812 });
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await showTab(page, 'roster');
    const allen = page.locator('#rosterList .roster-item').filter({ hasText: 'Josh Allen' });
    const [badge, photo] = await Promise.all([box(allen.locator('.pos-badge')), box(allen.locator('.mls-headshot'))]);
    if (phone) {
        expect(badge.y).toBeLessThan(photo.bottom);
        expect(badge.bottom).toBeGreaterThan(photo.bottom);
        expect(Math.abs((badge.x + badge.w / 2) - (photo.x + photo.w / 2))).toBeLessThan(1.5);
    } else {
        expect(photo.x).toBeGreaterThanOrEqual(badge.right);
    }
    await expectClean(page, state);
});
