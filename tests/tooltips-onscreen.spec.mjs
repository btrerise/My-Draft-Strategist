// Every tooltip stays on the screen when it opens, and every (i) icon reads as a lowercase i (bug found by the owner during improvements S19: on phones a tooltip
// opened off the left edge, unreadable). Each tooltip is 260px wide and opens leftward from its trigger, so a trigger
// near the left edge put it off-screen. This opens every tooltip the way a person does, a tap on its trigger, on each
// tab of both apps (folds opened, a trade analyzed so the Trade Analyzer's own tooltips exist), and checks its box.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMds, seedMls, loadMlsRankings, callApp } from './helpers.mjs';

// Opens each visible tooltip trigger on the page in turn; returns the ones whose tooltip crosses a screen edge.
async function offScreen(page) {
    return page.evaluate(async () => {
        const frame = () => new Promise(r => requestAnimationFrame(() => r()));
        document.querySelectorAll('.tab-content.active details, .tab-pane.active details, details').forEach(d => {
            const r = d.getBoundingClientRect();
            if (r.width) d.open = true;
        });
        await frame(); await frame(); // the MutationObserver enhances new triggers on the next frame
        const vw = document.documentElement.clientWidth;
        const bad = [];
        for (const trigger of document.querySelectorAll('[data-tt]')) {
            const t = trigger.getBoundingClientRect();
            if (!t.width || !t.height) continue; // not on screen (another tab, a closed fold)
            const text = trigger.classList.contains('tooltip-icon') ? trigger.nextElementSibling : trigger.querySelector(':scope > .tooltip-text');
            if (!text) continue;
            trigger.click();
            await frame();
            const r = text.getBoundingClientRect();
            // An (i) inside an uppercase label (the verdict's "BY YOUR RANKINGS") rendered as a capital I, and its
            // tooltip would be uppercase too (owner's report, S19 round 8). innerText applies text-transform.
            if (trigger.classList.contains('tooltip-icon') && trigger.innerText.trim() !== 'i') bad.push(`icon reads "${trigger.innerText.trim()}": ${text.textContent.trim().slice(0, 40)}`);
            if (getComputedStyle(text).textTransform !== 'none') bad.push(`tooltip text is ${getComputedStyle(text).textTransform}: ${text.textContent.trim().slice(0, 40)}`);
            if (r.left < -0.5 || r.right > vw + 0.5) bad.push(`${Math.round(r.left)}..${Math.round(r.right)} of ${vw}: ${text.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)}`);
            trigger.click(); // closes it again
            await frame();
        }
        return bad;
    });
}

const at375 = (page) => test.info().project.name === 'phone' ? page.setViewportSize({ width: 375, height: 844 }) : null;

test.describe('Tooltips stay on the screen', () => {
    test('Draft Strategist, every tab', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/');
        await seedMds(page);
        const bad = [];
        for (const tab of ['tracker', 'team', 'board', 'setup', 'guide']) {
            await showTab(page, tab);
            bad.push(...(await offScreen(page)).map(b => `${tab}: ${b}`));
        }
        expect(bad).toEqual([]);
        await expectClean(page, state);
    });

    test('Lineup Strategist, every tab, with a trade analyzed', async ({ page }) => {
        await at375(page);
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page);
        const bad = [];
        for (const tab of ['setup', 'roster', 'lineup', 'guide']) {
            await showTab(page, tab);
            bad.push(...(await offScreen(page)).map(b => `${tab}: ${b}`));
        }
        // The Trade Analyzer with a lopsided trade: the verdict's (i), "To make it fair", Power Rankings after the
        // trade (its cells and "How this is worked out"), and Value settings opened.
        await showTab(page, 'scout');
        await callApp(page, 'setTradePlayers', 'get', ['Bijan Robinson']);
        await callApp(page, 'setTradePlayers', 'give', ["Ja'Marr Chase", 'Justin Jefferson']);
        await page.locator('[data-action="runScout"][data-scout-type="trade"]').click();
        await expect(page.locator('#tradeOutput [data-trade-impact]')).toHaveCount(1);
        bad.push(...(await offScreen(page)).map(b => `scout: ${b}`));
        expect(bad).toEqual([]);
        await expectClean(page, state);
    });
});
