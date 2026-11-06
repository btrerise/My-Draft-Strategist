// Lineup Strategist's "Updated today" labels on the rankings cards (the owner's report, 2026-11-06): days are calendar
// days in your own time zone, not 24-hour periods, the card's status line has the time, and the header's short
// label has the full date and time as its hover text. getFreshness itself: tests/unit/freshness.test.mjs.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, seedMls, loadMlsRankings, showTab, FIXED_NOW } from './helpers.mjs';

// Chicago, so the local day isn't the UTC day: FIXED_NOW (16:00 UTC) is 11:00 AM there.
test.use({ timezoneId: 'America/Chicago', locale: 'en-US' });

test('rankings uploaded yesterday morning read "yesterday" the next morning, with the time on the card', async ({ page }) => {
    const state = await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    await showTab(page, 'lineup');

    const header = page.locator('#weeklyHeaderFreshness');
    const meta = page.locator('#weeklyMetaDisplay');
    await expect(header).toHaveText('Updated today');
    await expect(header).toHaveAttribute('title', 'Updated Tuesday, September 15, 2026 at 11:00 AM');
    await expect(meta).toContainText('Updated today at 11:00 AM');

    // 8 AM the next day, 21 hours later: yesterday (it read "today" until 11 AM under 24-hour counting).
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 21 * 60 * 60 * 1000));
    await page.reload();
    await showTab(page, 'lineup');
    await expect(header).toHaveText('Updated yesterday');
    await expect(meta).toContainText('Updated yesterday at 11:00 AM');

    // Two days on, the age stays first and the date follows.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 45 * 60 * 60 * 1000));
    await page.reload();
    await showTab(page, 'lineup');
    await expect(header).toHaveText('Updated 2 days ago');
    await expect(meta).toContainText('Updated 2 days ago (Tue, Sep 15 at 11:00 AM)');
    await expect(page.locator('#rosHeaderFreshness')).toHaveAttribute('title', 'Updated Tuesday, September 15, 2026 at 11:00 AM');
    await expectClean(page, state);
});
