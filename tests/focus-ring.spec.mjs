// One focus ring everywhere (improvements M2, Material 3's focus state): tab through every tab of both apps and T-Score
// with the fixture data, and every control that takes keyboard focus shows a solid outline at least 2px wide in a colour
// that isn't transparent (css/base.css, FOCUS: 2px green with a 2px gap; text fields and selects on their own border).
// Draft Strategist's draft-strength slider rings its thumb instead (css/mds.css), which an outline can't show here.
import { test, expect } from '@playwright/test';
import {
    openApp, showTab, showTScoreTab, seedMds, seedMls, loadMlsRankings,
    MDS_TABS, MLS_TABS, TSCORE_TABS,
} from './helpers.mjs';

// Keyboard focus is the same at every width; desktop has no drawer in the way.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'keyboard focus; runs under the desktop project only'));

const RING_ELSEWHERE = '.mds-slider';
const MAX_STOPS = 250;

// Presses Tab until focus comes back round (or MAX_STOPS), and returns each focused control whose ring is missing.
async function tabThrough(page) {
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); window.__focusSeen = new WeakSet(); });
    const bad = [];
    let count = 0;
    let stops = 0;
    for (; stops < MAX_STOPS; stops++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate((elsewhere) => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const id = el.id ? '#' + el.id : '';
            const cls = [...el.classList].slice(0, 3).map(c => '.' + c).join('');
            const text = (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 30);
            const key = `${el.tagName.toLowerCase()}${id}${cls} "${text}"`;
            if (window.__focusSeen.has(el)) return { again: true };
            window.__focusSeen.add(el);
            const cs = getComputedStyle(el);
            const width = parseFloat(cs.outlineWidth);
            const ok = el.matches(elsewhere) || (cs.outlineStyle !== 'none' && width >= 2 && cs.outlineColor !== 'rgba(0, 0, 0, 0)');
            if (!el.matches(':focus-visible')) return { key, ok: false, why: 'not :focus-visible' };
            return { key, ok, why: `outline ${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` };
        }, RING_ELSEWHERE);
        if (!info) continue;
        if (info.again) break; // back at the start
        count++;
        if (!info.ok) bad.push(`${info.key}: ${info.why}`);
    }
    return { bad, count };
}

async function check(page, where) {
    const { bad, count } = await tabThrough(page);
    expect.soft(count, `${where}: Tab reached some controls`).toBeGreaterThan(3);
    expect.soft(bad, `controls without the focus ring on ${where}`).toEqual([]);
}

test('Draft Strategist: every focused control shows the ring', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page, '/');
    await showTab(page, 'setup');
    await check(page, 'MDS empty setup');
    await seedMds(page);
    for (const tab of MDS_TABS) { await showTab(page, tab); await check(page, `MDS ${tab}`); }
});

test('Lineup Strategist: every focused control shows the ring', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page, '/lineup/');
    await seedMls(page);
    await loadMlsRankings(page);
    for (const tab of MLS_TABS) { await showTab(page, tab); await check(page, `MLS ${tab}`); }
});

test('T-Score: every focused control shows the ring', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, '/t-score/');
    for (const tab of TSCORE_TABS) { await showTScoreTab(page, tab); await check(page, `T-Score ${tab}`); }
});
