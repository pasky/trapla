// Serialized GPU/browser slot required. Motorway mode end to end: picker, paired D3 motorway (two
// carriageways, twin decks, twin tunnels), split one direction, bend it, join again.
// node scripts/motorway-shots.mjs [d3|d35] [--docs N]   (--docs N: save to docs/screenshots from number N)
import { mkdirSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const id = process.argv[2] ?? 'd3';
const preset = { d3: 'd3-motorway', d35: 'd35-stage1-motorway' }[id];
const docsAt = process.argv.includes('--docs') ? Number(process.argv[process.argv.indexOf('--docs') + 1]) : null;
const out = `/tmp/trapla-motorway/${id}`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5293, strictPort: true }, logLevel: 'warn' });
let browser, n = 0;
const docs = [];
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const settle = async () => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise(resolve => {
      const tick = () => requestAnimationFrame(() => window.trapla.viewBusy() ? tick() : resolve());
      requestAnimationFrame(tick);
    }));
    await page.waitForTimeout(700);
  };
  const shot = async (name, doc) => {
    await settle();
    const path = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path });
    if (doc && docsAt !== null) docs.push([path, `docs/screenshots/${docsAt + docs.length}-${doc}.png`]);
    console.log('shot', path);
  };
  const state = () => page.evaluate(() => {
    const p = window.trapla.projectResult();
    return { total: p?.cost.total, valid: p?.valid, complete: p?.complete, unpriced: p?.cost.unpriced,
      issues: p?.issues.map(i => `${i.locations[0]?.routeId ?? ''} ${Math.round(i.locations[0]?.s0 ?? 0)} ${i.violation.title} | ${i.violation.fix}`),
      score: document.querySelector('#score')?.textContent?.replace(/\s+/g, ' ').trim(), active: window.trapla.activeRoute() };
  });

  await page.goto('http://localhost:5293/');
  await page.waitForSelector('.scenario-picker-card');
  await page.waitForTimeout(800);
  await shot('picker', 'motorway-picker');
  await page.goto(`http://localhost:5293/?scenario=${id}&preset=${preset}`);
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await page.evaluate(() => localStorage.clear()); // start from the preset, not an earlier run's save
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await settle();
  console.log('paired', JSON.stringify(await state()));
  await page.evaluate(() => window.trapla.resetCamera());
  await shot('overview', 'motorway-overview');
  // a stretch on earthworks, then the first bridge and tunnel close up
  const runs = await page.evaluate(() => { const r = window.trapla.result(); return { n: r.n, runs: r.runs.map(q => ({ kind: q.kind, s0: q.s0, s1: q.s1 })), ds: r.ds }; });
  const look = (s, dist, tilt = 35, heading = 25) => page.evaluate(([s, dist, tilt, heading]) => {
    const r = window.trapla.result(), i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    window.trapla.lookAt(r.x[i], r.y[i], dist, heading, tilt);
  }, [s, dist, tilt, heading]);
  const earth = runs.runs.find(q => q.kind === 0 && q.s1 - q.s0 > 600);
  if (earth) { await look((earth.s0 + earth.s1) / 2, 160, 50); await shot('carriageways', 'motorway-carriageways'); }
  const bridge = runs.runs.find(q => q.kind === 1);
  if (bridge) { await look((bridge.s0 + bridge.s1) / 2, Math.max(260, (bridge.s1 - bridge.s0) * 0.8), 20, 70); await shot('twin-bridge', 'motorway-twin-bridge'); }
  const tunnel = runs.runs.find(q => q.kind === 2);
  if (tunnel) { await look(Math.max(0, tunnel.s0 - 40), 220, 25, 200); await shot('twin-tunnel', 'motorway-twin-tunnel'); }
  // Split: edit only the direction towards B, then bend it
  await page.click('#dir-forward');
  await settle();
  console.log('split', JSON.stringify(await state()));
  await page.evaluate(() => window.trapla.resetCamera());
  await shot('split');
  const moved = await page.evaluate(() => {
    const d = window.trapla.getDesign(), k = Math.floor(d.pis.length / 2), p = d.pis[k], q = d.pis[k + 1] ?? d.pis[k - 1];
    const l = Math.hypot(q.x - p.x, q.y - p.y), nx = -(q.y - p.y) / l, ny = (q.x - p.x) / l;
    d.pis[k] = { ...p, x: p.x - nx * 120, y: p.y - ny * 120 };
    window.trapla.setDesign(d); // the mission route = the direction towards B
    return { x: d.pis[k].x, y: d.pis[k].y };
  });
  await settle();
  console.log('bent', JSON.stringify(await state()));
  await page.evaluate(m => window.trapla.lookAt(m.x, m.y, 1400, 20, 50), moved);
  await shot('split-bent', 'motorway-split');
  await page.click('#dir-both');
  await settle();
  console.log('joined', JSON.stringify(await state()));
  await shot('joined');
  for (const [from, to] of docs) copyFileSync(from, to);
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  await server.close();
}
