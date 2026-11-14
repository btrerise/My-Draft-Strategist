// Room on phones (improvements M17; U1 round 2's R1 and R2, docs/improvements/organization.md section 7).
//   * Under 600px each section runs to the screen's edges with 16px margins: a Lineup row's content is 343px wide at
//     375px (319px before), and a card has no side borders or corners.
//   * At every width nothing inside a card is boxed again: rows are list rows with dividers, nested blocks a lighter shade
//     with no border. Controls (buttons, fields, chips, badges) keep theirs; a coloured edge that carries meaning is a 3px
//     inset shadow, not a border.
//   * From 600px up the cards keep their frame.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, callApp, seedMls, loadMlsRankings, seedMds } from './helpers.mjs';

// Every visible block inside a card that draws a border on its sides, other than controls and small marks. A box is a
// block at least 40% as wide as its card whose left and right borders both show.
const BOXES_IN_CARDS = () => {
    const CONTROL = '.tooltip-text, .mls-segmented, button, input, select, textarea, a, summary, [role=button], .badge, [class*="badge"], [class*="chip"], [class*="pill"], table, th, td, tr, label';
    const out = [];
    for (const card of document.querySelectorAll('.settings-card')) {
        if (!card.checkVisibility()) continue;
        const cw = card.getBoundingClientRect().width;
        for (const el of card.querySelectorAll('*')) {
            if (el.matches(CONTROL) || el.closest(CONTROL) || !el.checkVisibility()) continue;
            const r = el.getBoundingClientRect();
            if (r.width < cw * 0.4 || r.height < 16) continue;
            const cs = getComputedStyle(el);
            const shows = (side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none'
                && !/rgba\(.*, 0\)$/.test(cs[`border${side}Color`]);
            if (shows('Left') && shows('Right')) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}`);
        }
    }
    return [...new Set(out)];
};

test.describe('room on phones', () => {
    test('at 375px a Lineup row is 343px wide, cards run to the edges, and nothing in a card is boxed', async ({ page }, info) => {
        test.skip(info.project.name !== 'phone', 'phone width');
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);

        await showTab(page, 'lineup');
        // The row reaches 12px into the card's padding (round 5) and pads its content back, so its content is at the
        // 16px margin and 343px wide.
        const content = (loc) => loc.evaluate((el) => {
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            return { x: Math.round(r.x + parseFloat(cs.paddingLeft)), width: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
        });
        const row = page.locator('#optimalLineupContainer .lineup-slot:not(.locked):not(.swapping)').first();
        expect(await content(row)).toEqual({ x: 16, width: 343 });
        // A locked row's 3px edge sits outside its content, so its name lines up with the rows around it (round 5).
        await page.locator('#optimalLineupContainer .lineup-slot .lock-btn').first().click();
        const locked = page.locator('#optimalLineupContainer .lineup-slot.locked').first();
        await expect(locked).toBeVisible();
        const nameX = (loc) => loc.locator('.player-name-wrap').first().evaluate((el) => Math.round(el.getBoundingClientRect().x));
        expect(await content(locked)).toEqual({ x: 16, width: 343 });
        expect(await nameX(locked)).toBe(await nameX(page.locator('#optimalLineupContainer .lineup-slot:not(.locked):not(.empty)').first()));
        const card = await page.locator('#lineupTab .settings-card').first().evaluate((el) => {
            const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
            return { x: r.x, width: r.width, left: cs.borderLeftWidth, radius: cs.borderTopLeftRadius, pad: cs.paddingLeft };
        });
        expect(card).toEqual({ x: 0, width: 375, left: '0px', radius: '0px', pad: '16px' });

        for (const tab of ['setup', 'roster', 'lineup', 'scout']) {
            await showTab(page, tab);
            expect(await page.evaluate(BOXES_IN_CARDS), `boxes inside cards on ${tab}`).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth), `${tab} scrolls sideways`).toBe(375);
        }
        // The Waiver Wire's results: rows with a divider, 343px wide (265px before, inside two boxes).
        await callApp(page, 'setWaiverMode', 'list');
        await callApp(page, 'setWaiverCompare', 'roster');
        await page.fill('#waiverInput', 'Zay Flowers\nChase Brown');
        await page.click('#waiverScanBtn');
        const result = page.locator('#scoutTab .scout-result-card').first();
        await expect(result).toBeVisible();
        expect((await content(result)).width).toBe(343);
        expect(await page.evaluate(BOXES_IN_CARDS), 'boxes inside cards with waiver results').toEqual([]);

        // A tool's results (round 6): an analysed trade (the verdict a tint, To make it fair and Power Rankings after the
        // trade a lighter shade) and a Matchup Simulator run.
        await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson']);
        await callApp(page, 'setTradePlayers', 'give', ['Derrick Henry']);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#tradeOutput .trade-verdict-banner, #tradeOutput .mls-trade-tile').first()).toBeVisible();
        await expect(page.locator('#tradeOutput [data-trade-impact]')).toBeVisible();
        expect(await page.evaluate(BOXES_IN_CARDS), 'boxes inside cards with a trade analysed').toEqual([]);
        await showTab(page, 'lineup');
        await page.click('#run-sim-btn');
        await expect(page.locator('#monte-carlo-results .simulation-card')).toBeVisible({ timeout: 20000 });
        expect(await page.evaluate(BOXES_IN_CARDS), 'boxes inside cards with a simulation').toEqual([]);
        await expectClean(page, state);
    });

    test('at 375px Draft Strategist\'s player cards are list rows across the screen, and the Board runs to the edges', async ({ page }, info) => {
        test.skip(info.project.name !== 'phone', 'phone width');
        await page.setViewportSize({ width: 375, height: 812 });
        const state = await openApp(page, '/');
        await seedMds(page);
        const cards = await page.locator('#playerPool .player-card').evaluateAll((els) => els.slice(0, 3).map((el) => {
            const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
            return { x: r.x, width: r.width, left: cs.borderLeftWidth, pad: cs.paddingLeft };
        }));
        for (const c of cards) expect(c).toEqual({ x: 0, width: 375, left: '0px', pad: '16px' });
        expect(await page.evaluate(BOXES_IN_CARDS)).toEqual([]);

        // The Draft Board's grid still runs to the screen's edges (its phone bleed), starting at the 16px margin, and
        // the page doesn't scroll sideways.
        await showTab(page, 'board');
        const board = await page.locator('#draftMatrixContainer').evaluate((el) => {
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            return { x: r.x, width: r.width, pad: cs.paddingLeft, scrolls: el.scrollWidth > el.clientWidth };
        });
        expect(board).toEqual({ x: 0, width: 375, pad: '16px', scrolls: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth), 'the Board scrolls the page sideways').toBe(375);
        await expectClean(page, state);
    });

    test('at 1280px cards keep their frame, with flat rows inside', async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'desktop width');
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        for (const tab of ['setup', 'roster', 'lineup', 'scout']) {
            await showTab(page, tab);
            const frame = await page.locator(`#${tab}Tab .settings-card`).first().evaluate((el) => {
                const cs = getComputedStyle(el);
                return { left: cs.borderLeftWidth, radius: cs.borderTopLeftRadius };
            });
            expect(frame, `${tab}'s first card`).toEqual({ left: '1px', radius: '12px' });
            expect(await page.evaluate(BOXES_IN_CARDS), `boxes inside cards on ${tab}`).toEqual([]);
        }
        await showTab(page, 'lineup');
        const rows = await page.locator('#optimalLineupContainer .lineup-slot').evaluateAll((els) => els.map((el) => {
            const cs = getComputedStyle(el);
            return { left: cs.borderLeftWidth, bg: cs.backgroundColor };
        }));
        expect(rows.length).toBeGreaterThan(5);
        for (const r of rows) expect(r.left).toBe('0px');
        await expectClean(page, state);
    });
});
