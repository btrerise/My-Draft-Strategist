import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const B = JSON.parse(readFileSync(process.env.BACKUP, 'utf8'));
test('names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date(B.exportedAt));
  await page.route(/^https?:\/\/(?!localhost[:/])/, r => r.abort());
  await page.addInitScript((data) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, B.data);
  await page.goto('/lineup/#lineup'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  const ov = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('#lineupTab *, body > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5); })
      .slice(0, 12).map(e => ({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 50), left: Math.round(e.getBoundingClientRect().left), right: Math.round(e.getBoundingClientRect().right), text: (e.textContent || '').trim().slice(0, 40) }));
    return { innerWidth, vw, scrollW: document.documentElement.scrollWidth, wide };
  });
  console.log('OVERFLOW', JSON.stringify(ov, null, 1));
  const r = await page.evaluate(() => {
    document.documentElement.dataset.vt = 'tab';
    const out = [];
    for (const el of document.querySelectorAll('*')) { const n = getComputedStyle(el).viewTransitionName; if (n && n !== 'none') out.push({ n, tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), shown: el.getClientRects().length > 0 }); }
    delete document.documentElement.dataset.vt;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
});
