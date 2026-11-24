// Tab, Tool and Section clicks (improvements A2): Umami counts a click on any element with data-umami-event, so the
// buttons only need the attributes. This checks they are there, on both apps, and carry nothing else.
import { test, expect } from '@playwright/test';
import { preparePage } from './helpers.mjs';

async function events(page, path) {
    await preparePage(page);
    await page.goto(path);
    return page.evaluate(() => [...document.querySelectorAll('[data-umami-event]')]
        .filter((el) => ['Tab', 'Tool', 'Section'].includes(el.dataset.umamiEvent))
        .map((el) => ({ e: el.dataset.umamiEvent, v: el.dataset.umamiEventTab || el.dataset.umamiEventTool || el.dataset.umamiEventSection, where: el.dataset.umamiEventWhere || '',
            extra: Object.keys(el.dataset).filter((k) => k.startsWith('umamiEvent') && !['umamiEvent', 'umamiEventTab', 'umamiEventTool', 'umamiEventSection', 'umamiEventWhere'].includes(k)) })));
}

test('Lineup Strategist: bar, rail and drawer tabs and the main tools carry Umami attributes', async ({ page }) => {
    const all = await events(page, '/lineup/');
    const tabs = all.filter((x) => x.e === 'Tab');
    for (const t of ['setup', 'roster', 'lineup', 'scoreboard', 'scout', 'guide']) {
        expect(tabs.some((x) => x.v === t && x.where === 'drawer'), `drawer ${t}`).toBe(true);
    }
    for (const t of ['setup', 'roster', 'lineup', 'scoreboard', 'scout']) {
        expect(tabs.some((x) => x.v === t && x.where === ''), `bar ${t}`).toBe(true);
    }
    const tools = all.filter((x) => x.e === 'Tool').map((x) => x.v);
    for (const t of ['sync-all', 'optimize-all', 'optimize', 'waiver-top', 'waiver-auto', 'waiver-list', 'analyze-trade', 'find-trade-targets', 'run-sim', 'export-lineup']) {
        expect(tools, t).toContain(t);
    }
    expect(all.every((x) => x.extra.length === 0)).toBe(true);
});

test('Draft Strategist: tabs and the main tools carry Umami attributes', async ({ page }) => {
    const all = await events(page, '/');
    const tabs = all.filter((x) => x.e === 'Tab');
    for (const t of ['setup', 'tracker', 'team', 'board', 'guide']) {
        expect(tabs.some((x) => x.v === t && x.where === 'drawer'), `drawer ${t}`).toBe(true);
    }
    for (const t of ['setup', 'tracker', 'team', 'board']) expect(tabs.some((x) => x.v === t && x.where === ''), `bar ${t}`).toBe(true);
    const tools = all.filter((x) => x.e === 'Tool').map((x) => x.v);
    expect(tools).toEqual(expect.arrayContaining(['live-sync', 'export-team']));
    expect(all.every((x) => x.extra.length === 0)).toBe(true);
});

test('the Scoreboard\'s fold toggles are source-marked as Section events', async ({ page }) => {
    const src = await (await page.request.get('/js/mls/week/thisWeek.js')).text();
    for (const s of ['player-scoreboard', 'root-for', 'mvps', 'still-in-play']) expect(src).toContain(`'${s}'`);
    expect(src).toContain('data-umami-event="Section"');
    expect(src).toContain('data-umami-event-tool="export-recap"');
    const tracker = await (await page.request.get('/js/mds/tracker.js')).text();
    expect(tracker).toContain('data-umami-event-tool="pick"');
});
