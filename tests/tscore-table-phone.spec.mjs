// T-Score's In-Season table on phones, its header tooltips, and no Sync button (improvements T3).
// - Bug (owner's screenshot): a header tooltip opened inside the header row, over the TGT % / MOVE / BUY/SELL headers, and
//   the sticky header cells (the locked PLAYER one above all) drew over parts of it. Each tooltip must open below the
//   header row with nothing on top of it, at 360px and on the desktop.
// - At 360px the locked name column is narrow (short name; position rank and team on a second line), so the name and at
//   least three stat columns show; the rest scroll sideways inside the table.
// - The Buy/Sell tooltip says what decides it: the position's line from Model Weights (WR 48, RB 36, TE 18).
import { test, expect } from '@playwright/test';
import { openApp, stubInSeasonSheets, expectClean } from './helpers.mjs';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const isPhone = () => test.info().project.name === 'phone';

async function open(page) {
    if (isPhone()) await page.setViewportSize({ width: 360, height: 780 });
    const state = await openApp(page, '/t-score/', { beforeGoto: (p) => stubInSeasonSheets(p) });
    await expect(page.locator('#inSeasonBody tr')).toHaveCount(22);
    return state;
}

// Opens each visible header tooltip of the In-Season table in turn (a tap on a phone, the mouse on the desktop) and
// returns what's wrong with each: opening inside the header row, or something drawn on top of it.
async function headerTipProblems(page) {
    const problems = [];
    const triggers = page.locator('#inSeasonTableWrap thead .table-header-tooltip');
    const n = await triggers.count();
    for (let i = 0; i < n; i++) {
        const trigger = triggers.nth(i);
        if (!(await trigger.isVisible())) continue;
        // behavior 'instant': the page scrolls smoothly, which never finishes under the tests' fixed clock.
        await trigger.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
        // A tap, as tooltips-onscreen.spec.mjs does it: locator.tap() scrolls the page to its own idea of in view first.
        if (isPhone()) await trigger.evaluate(el => el.click()); else await trigger.hover();
        const tip = trigger.locator(':scope > .tooltip-text');
        await expect(tip).toBeVisible();
        await page.waitForTimeout(300); // the fade-in
        const found = await tip.evaluate((t) => {
            const name = t.parentElement.firstChild.textContent.trim();
            const out = [];
            const r = t.getBoundingClientRect();
            const head = t.closest('thead').getBoundingClientRect();
            if (r.top < head.bottom - 0.5) out.push(`${name}: opens ${Math.round(head.bottom - r.top)}px inside the header row`);
            // What's on top at points across the tooltip (inside the window and the table's visible box). The tooltip
            // takes no pointer events, so hit testing skips it; give it them while looking.
            const wrap = t.closest('.data-table-wrapper').getBoundingClientRect();
            const left = Math.max(r.left, wrap.left, 0) + 3, right = Math.min(r.right, wrap.right, innerWidth) - 3;
            const top = Math.max(r.top, 0) + 3, bottom = Math.min(r.bottom, innerHeight) - 3;
            t.style.pointerEvents = 'auto';
            const covered = new Set();
            for (let fx = 0; fx <= 4; fx++) for (let fy = 0; fy <= 2; fy++) {
                const x = left + (right - left) * fx / 4, y = top + (bottom - top) * fy / 2;
                const el = document.elementFromPoint(x, y);
                if (el && !t.contains(el)) covered.add((el.closest('th, td') || el).textContent.trim().split('\n')[0].slice(0, 20));
            }
            t.style.pointerEvents = '';
            if (covered.size) out.push(`${name}: covered by ${[...covered].join(', ')}`);
            return out;
        });
        problems.push(...found);
        // Close it: a tap elsewhere, or the mouse moving away (and its 1.5s linger ended by Escape).
        if (isPhone()) await page.locator('#inSeasonTab h2').evaluate(el => el.click());
        else { await page.mouse.move(0, 0); await page.keyboard.press('Escape'); }
        await expect(tip).toBeHidden();
    }
    return problems;
}

test('header tooltips open below the header row, with nothing drawn over them', async ({ page }) => {
    const state = await open(page);
    expect(await headerTipProblems(page)).toEqual([]);
    await expectClean(page, state);
});

test('the Buy/Sell tooltip names the line for the position on screen', async ({ page }) => {
    const state = await open(page);
    const tip = page.locator('#inSeasonBuySellTip');
    await expect(tip).toHaveText('Buy: ranked outside the top 48 WRs so far, projected inside them for the rest of the season. Sell: inside the top 48 now, projected to drop outside.');
    await page.locator('#inSeasonTab .pos-toggle-btn[data-pos="te"]').click();
    await expect(tip).toHaveText('Buy: ranked outside the top 18 TEs so far, projected inside them for the rest of the season. Sell: inside the top 18 now, projected to drop outside.');
    await expectClean(page, state);
});

test('no Sync button: the page loads its data by itself', async ({ page }) => {
    const state = await open(page);
    await expect(page.getByRole('button', { name: /Sync/ })).toHaveCount(0);
    await expect(page.locator('#tscoreRefreshBtn, #tscoreFreshness')).toHaveCount(0);
    await expectClean(page, state);
});

test.describe('phones', () => {
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'the phone layout'));

    test('at 360px the locked name column is narrow: the name and at least three stat columns show', async ({ page }) => {
        const state = await open(page);
        const first = page.locator('#inSeasonBody tr').first();
        // Short name, then position rank and team on a second line. The full name stays for screen readers.
        await expect(first.locator('.tscore-name-short')).toHaveText('P. Nacua');
        await expect(first.locator('.tscore-name-sub')).toHaveText('WR1 · LA');
        await expect(first.locator('.tscore-name-full')).toHaveText('Puka Nacua');
        await expect(page.locator('#inSeasonBody tr').filter({ hasText: 'A.J. Brown' }).locator('.tscore-name-short')).toHaveText('A.J. Brown');

        const wrap = await page.locator('#inSeasonTableWrap').boundingBox();
        const fullyShown = async (loc) => {
            const b = await loc.boundingBox();
            return !!b && b.width > 0 && b.x >= wrap.x - 0.5 && b.x + b.width <= wrap.x + wrap.width + 0.5;
        };
        const heads = page.locator('#inSeasonTableWrap thead th');
        const shown = [];
        for (let i = 0; i < await heads.count(); i++) {
            if (await heads.nth(i).isVisible() && await fullyShown(heads.nth(i))) shown.push((await heads.nth(i).innerText()).replace(/\s+/g, ' ').trim());
        }
        expect(shown.slice(0, 4)).toEqual(['PLAYER', 'ROS PPG', 'FP/G', 'XFP/G']);
        // The rest are there, a swipe away inside the table; the page itself doesn't scroll sideways.
        expect(await page.locator('#inSeasonTableWrap').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        // The label moves to the end of the row on phones.
        await expect(first.locator('td:last-child .label-elite')).toHaveText('Elite');
        await expectClean(page, state);
    });
});
