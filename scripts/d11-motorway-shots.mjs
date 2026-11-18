// Serialized GPU/browser slot required. The D11 motorway mission (preset d11-motorway): the Trutnov card in the
// picker, the starter's overview with the official line, its two ends' cards, the longest bridge, the bill.
// flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/d11-motorway-shots.mjs [--docs 570]
import { mkdirSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const COARSE = [{ x: 7720.3, y: 5623.7, r: null }, { x: 9912.8, y: 6574.3, r: null }, { x: 9893.6, y: 9022.9, r: null }, { x: 10554.5, y: 11386.4, r: null },
  { x: 10537.2, y: 13772.9, r: null }, { x: 10163.8, y: 16158.7, r: null }, { x: 11708.9, y: 18044.5, r: null }, { x: 12276.3, y: 20303.6, r: null }];
const docsAt = process.argv.includes('--docs') ? Number(process.argv[process.argv.indexOf('--docs') + 1]) : null;
const out = '/tmp/trapla-d11-motorway';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5294), strictPort: false }, logLevel: 'warn' });
let browser, n = 0;
const docs = [];
try {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const settle = async () => {
    if (!(await page.evaluate(() => !!window.trapla))) { await page.waitForTimeout(700); return; } // the picker
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise(resolve => {
      const tick = () => requestAnimationFrame(() => window.trapla.viewBusy() ? tick() : resolve());
      requestAnimationFrame(tick);
    }));
    await page.waitForTimeout(700);
  };
  const shot = async (name) => {
    await settle();
    const path = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path });
    if (docsAt !== null) docs.push([path, `docs/screenshots/${docsAt + docs.length}-d11-motorway-${name}.png`]);
    console.log('shot', path);
  };

  await page.goto(base);
  await page.waitForSelector('.scenario-picker-card');
  const trutnov = page.locator('.scenario-picker-card', { hasText: 'Trutnov → Polish border' }).first();
  await trutnov.scrollIntoViewIfNeeded();
  await trutnov.locator('.scenario-picker-section', { hasText: 'Motorway D11' }).click();
  await shot('picker');
  await page.goto(`${base}?scenario=d11&preset=d11-motorway`);
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await page.evaluate(() => localStorage.clear()); // the preset's starter, not an earlier run's save
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await settle();
  const state = await page.evaluate(() => {
    const p = window.trapla.projectResult();
    return { total: p?.cost.total, valid: p?.valid, issues: p?.issues.map(i => i.violation.title),
      score: document.querySelector('#score')?.textContent?.replace(/\s+/g, ' ').trim() };
  });
  console.log('starter', JSON.stringify(state));
  if (!state.valid) throw new Error('The starter is not VALID in the browser');
  await page.evaluate(() => window.trapla.resetCamera());
  await shot('overview');
  for (const end of ['a', 'b']) {
    await page.evaluate(end => { window.trapla.select({ kind: 'end', end }); const p = window.trapla[end.toUpperCase()]; window.trapla.lookAt(p.x, p.y, 1400, 20, 50); }, end);
    await shot(`end-${end}`);
  }
  await page.keyboard.press('Escape');
  const bridge = await page.evaluate(() => {
    const r = window.trapla.result(), b = r.runs.filter(q => q.kind === 1).sort((p, q) => (q.s1 - q.s0) - (p.s1 - p.s0))[0];
    const i = Math.round((b.s0 + b.s1) / 2 / r.ds);
    window.trapla.lookAt(r.x[i], r.y[i], 650, 70, 30);
    return { s0: Math.round(b.s0), s1: Math.round(b.s1) };
  });
  console.log('longest bridge', JSON.stringify(bridge));
  await shot('bridge');
  // a line of the player's own, a bend every 2.5 km: its viaduct along the stream at km 8.3–9.4 stands on frame piers,
  // two columns with a crossbeam over the stream between them
  await page.evaluate((pis) => { const d = window.trapla.getDesign(); d.pis = pis; window.trapla.setDesign(d); }, COARSE);
  await settle();
  const coarse = await page.evaluate(() => { const p = window.trapla.projectResult(); return { total: p?.cost.total, valid: p?.valid, issues: p?.issues.map(i => i.violation.title) }; });
  console.log('coarse', JSON.stringify(coarse));
  if (!coarse.valid) throw new Error('The coarse line is not VALID in the browser');
  const frameAt = await page.evaluate(() => {
    const r = window.trapla.result(), run = r.runs.filter(q => q.kind === 1).sort((p, q) => (q.framePiers?.length ?? 0) - (p.framePiers?.length ?? 0))[0], s = run.framePiers[Math.floor(run.framePiers.length / 2)];
    const i = Math.round(s / r.ds);
    // (from the side, low: the columns either side of the stream and the crossbeam under the decks)
    const heading = Math.atan2(r.tx[i], r.ty[i]) * 180 / Math.PI + Number(new URLSearchParams(location.search).get('h') ?? 60);
    window.trapla.lookAt(r.x[i], r.y[i], 130, heading, 10);
    return Math.round(s);
  });
  console.log('frame pier at', frameAt);
  await shot('frame-piers');
  if (errors.length) throw new Error(errors.join('\n'));
  for (const [from, to] of docs) copyFileSync(from, to);
} finally {
  if (browser) await browser.close();
  await server.close();
}
