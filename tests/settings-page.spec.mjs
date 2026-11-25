// The Settings page in both apps (improvements S45): the set-once settings moved off each Dashboard to a Settings tab
// in the menu, above the Guide, at #settings. Settings that belong to one tool stay beside it, and Add Player Manually
// stays on Lineup Strategist's Dashboard, shown only while the open league is a manual one.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls } from './helpers.mjs';

// The drawer's labels in order (it's closed, so read the text, not what shows).
const navNames = (page) => page.locator('.hamburger-menu .menu-nav-links > .nav-btn').evaluateAll(els => els.map(e => e.textContent.trim()));

test.describe('Lineup Strategist: Settings', () => {
    test('the menu entry opens #settings with the set-once settings; the Dashboard no longer has them', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);

        // The entry sits just above the Guide in the drawer, with an icon.
        const names = await navNames(page);
        expect(names.indexOf('Settings')).toBeGreaterThan(-1);
        expect(names.indexOf('Settings') + 1).toBe(names.indexOf('Guide'));
        await expect(page.locator('.hamburger-menu [data-drawer-target="settings"] svg[aria-hidden="true"]')).toHaveCount(1);

        await page.evaluate(() => document.querySelector('.hamburger-menu [data-drawer-target="settings"]').click());
        await expect(page.locator('#settingsTab')).toHaveClass(/\bactive\b/);
        expect(await page.evaluate(() => location.hash)).toBe('#settings');
        await expect(page.locator('.hamburger-menu [data-drawer-target="settings"]')).toHaveAttribute('aria-current', 'page');

        // In order: Headshots, then the folds.
        const settings = page.locator('#settingsTab');
        await expect(settings.locator('#mlsHeadshotsToggle')).toBeAttached();
        // Open sections under headings; only the long MVP / LVP form and the erase button stay folded (owner, S45).
        const headings = await settings.locator('.settings-group-title').allInnerTexts();
        expect(headings).toEqual(['Lineup', 'Notifications', 'FAAB Bids', 'Backup & Restore']);
        for (const h of ['Lineup', 'Notifications', 'FAAB Bids', 'Backup & Restore']) await expect(settings.locator('.settings-group-title', { hasText: h })).toBeVisible();
        const folds = await settings.locator('details > summary').allInnerTexts();
        expect(folds.map(f => f.trim())).toEqual(['MVP / LVP Lines', 'Danger Zone']);
        await expect(settings.locator('#starterAlertsToggle')).toBeVisible();
        await expect(settings.locator('[data-action="exportMlsSettings"]')).toBeVisible();

        // None of them is on the Dashboard any more.
        const dash = page.locator('#setupTab');
        for (const sel of ['#mlsHeadshotsToggle', '.notify-settings', '#recapLineWRBoom', '[data-action="exportMlsSettings"]', '[data-action="factoryReset"]', '.lineup-switches']) {
            await expect(dash.locator(sel), sel).toHaveCount(0);
            await expect(settings.locator(sel), sel).toHaveCount(1);
        }
        // Tool settings stay with their tool.
        await expect(dash.locator('#reqQB')).toHaveCount(1);
        await expectClean(page, state);
    });

    test('a reload on #settings lands there', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await showTab(page, 'settings');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#settingsTab')).toHaveClass(/\bactive\b/);
        await expectClean(page, state);
    });

    test('Add Player Manually: hidden with no league and on a Sleeper league, shown on a manual one', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        const card = page.locator('#manualAddCard');
        await expect(card).toBeHidden(); // no league yet
        await seedMls(page); // the Fixture League is a Sleeper league
        await expect(card).toBeHidden();

        await page.fill('#newLeagueName', 'Typed League');
        await page.getByRole('button', { name: 'Create Manual' }).click();
        await expect(page.locator('#headerLeagueSelect option:checked')).toHaveText('Typed League');
        await expect(card).toBeVisible();
        await card.locator('summary').click();
        await page.fill('#manualName', 'James Cook');
        await page.selectOption('#manualPos', 'RB');
        await page.fill('#manualTeam', 'BUF');
        await page.getByRole('button', { name: 'Add Player to Active Roster' }).click();
        await expect(page.locator('#manualAddLog')).toContainText('James Cook');

        // Back to the Sleeper league: the card goes again.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const sleeper = State.leagues.find(l => !String(l.leagueId).startsWith('manual_'));
            (await import('/js/mls/main.js')).switchActiveLeague(sleeper.leagueId);
        });
        await expect(card).toBeHidden();
        await expectClean(page, state);
    });
});

test.describe('Draft Strategist: Settings', () => {
    test('the menu entry opens #settings; the switches, backup and reset moved; draft setup stays', async ({ page }) => {
        const state = await openApp(page, '/');
        await seedMds(page);

        const names = await navNames(page);
        expect(names.indexOf('Settings') + 1).toBe(names.indexOf('Guide'));

        await page.evaluate(() => document.querySelector('.hamburger-menu [data-tab="settings"]').click());
        await expect(page.locator('#settingsTab')).toHaveClass(/\bactive\b/);
        expect(await page.evaluate(() => location.hash)).toBe('#settings');

        const dash = page.locator('#setupTab');
        const settings = page.locator('#settingsTab');
        for (const sel of ['#stackToggle', '#byeWarningToggle', '#tscoreToggle', '#ds_mobile_collapse', '#toggleHeadshots', '[data-action="exportMdsSettings"]', '[data-action="hardReset"]', '[data-action="resetPicksOnly"]']) {
            await expect(dash.locator(sel), sel).toHaveCount(0);
            await expect(settings.locator(sel), sel).toHaveCount(1);
        }
        // Draft setup stays: the limits, teams, rounds, Third Round Reversal and Call Outs.
        for (const sel of ['#limitQB', '#leagueTeams', '#leagueRounds', '#thirdRoundReversalToggle', '#targetList']) await expect(dash.locator(sel), sel).toHaveCount(1);
        await expectClean(page, state);
    });

    test('Highlight Stacks and Bye Week Warnings save as they are flipped (there is no Save button on the page)', async ({ page }) => {
        const state = await openApp(page, '/');
        await seedMds(page);
        await showTab(page, 'settings');
        await page.locator('#stackToggle').check();
        await page.locator('#byeWarningToggle').check();
        expect(await page.evaluate(() => [localStorage.getItem('mds_stacks'), localStorage.getItem('mds_bye_warnings')])).toEqual(['true', 'true']);
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#stackToggle')).toBeChecked();
        await expect(page.locator('#byeWarningToggle')).toBeChecked();
        await expectClean(page, state);
    });
});
