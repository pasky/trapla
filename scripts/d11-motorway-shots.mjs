// Serialized GPU/browser slot required. The D11 motorway mission (preset d11-motorway): the Trutnov card in the
// picker, the starter's overview with the official line, its two ends' cards, the longest bridge, the bill.
// flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/d11-motorway-shots.mjs [--docs 570]
import { mkdirSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

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
  await page.locator('.scenario-picker-group', { hasText: 'Trutnov' }).first().scrollIntoViewIfNeeded();
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
  if (errors.length) throw new Error(errors.join('\n'));
  for (const [from, to] of docs) copyFileSync(from, to);
} finally {
  if (browser) await browser.close();
  await server.close();
}
