// Throwaway (S16): the owner's backup, phone, Dashboard -> Lineup. Not committed.
import { test } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const B = JSON.parse(readFileSync(process.env.BACKUP, 'utf8'));
const SLOW = Number(process.env.VT_SLOW || 1);
test('owner lineup', async ({ browser }) => {
  const size = { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 1, recordVideo: { dir: `${process.env.OUT}/own-x${SLOW}`, size }, baseURL: 'http://localhost:4173' });
  const page = await ctx.newPage();
  const logs = []; page.on('console', m => logs.push(`${m.type()}: ${m.text()}`)); page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.clock.setFixedTime(new Date(B.exportedAt));
  await page.route(/^https?:\/\/(?!localhost[:/])/, r => r.abort());
  await page.addInitScript((data) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, B.data);
  await page.addInitScript(() => {
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (cb) => { const t = start(cb); const kind = document.documentElement.dataset.vt;
      t.ready.catch(e => console.log('VT-SKIPPED', kind, e.name, e.message)); return t; };
  });
  await page.goto('/lineup/#setup'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  if (SLOW !== 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW }); }
  const cdp2 = await ctx.newCDPSession(page);
  const frames = []; cdp2.on('Page.screencastFrame', f => { frames.push(f); cdp2.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp2.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  const t0 = Date.now();
  for (const t of ['lineup', 'setup', 'roster', 'lineup', 'scout', 'lineup']) {
    await page.evaluate(() => { window.__t = performance.now(); });
    await page.locator(`.nav-bar .nav-btn[data-target="${t}"]`).tap();
    const info = await page.evaluate(async () => { const t = window.__t; await new Promise(r => { const c = () => document.documentElement.hasAttribute('data-vt-busy') ? requestAnimationFrame(c) : r(); c(); }); return { ms: Math.round(performance.now() - t), active: document.querySelector('.tab-content.active')?.id, h: document.documentElement.scrollHeight, y: scrollY }; });
    console.log(t, JSON.stringify(info));
    await page.waitForTimeout(900 * SLOW);
  }
  await cdp2.send('Page.stopScreencast');
  const dir = `${process.env.OUT}/own-frames-x${SLOW}`; mkdirSync(dir, { recursive: true });
  frames.forEach((f, i) => writeFileSync(`${dir}/f${String(i).padStart(4, '0')}-${f.metadata.timestamp.toFixed(3)}.jpg`, Buffer.from(f.data, 'base64')));
  console.log('frames', frames.length, 'logs:', logs.filter(l => !/ERR_FAILED|net::|Failed to load/.test(l)).slice(0, 15).join(' | '));
  await ctx.close();
});
