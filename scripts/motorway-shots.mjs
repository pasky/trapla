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
    if (!(await page.evaluate(() => !!window.trapla))) { await page.waitForTimeout(700); return; } // the picker
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
  const longest = kind => runs.runs.filter(q => q.kind === kind).sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0))[0];
  // runs list structures only: the longest stretch between two of them is on earthworks
  const ends = [0, ...runs.runs.flatMap(q => [q.s0, q.s1]), runs.n * runs.ds];
  let earth = null;
  for (let k = 0; k + 1 < ends.length; k += 2) if (!earth || ends[k + 1] - ends[k] > earth.s1 - earth.s0) earth = { s0: ends[k], s1: ends[k + 1] };
  if (earth) { await look((earth.s0 + earth.s1) / 2, 120, 55, 30); await shot('carriageways', 'motorway-carriageways'); }
  const bridge = longest(1);
  if (bridge) { await look(bridge.s0 + Math.min(250, (bridge.s1 - bridge.s0) / 3), 450, 40, 60); await shot('twin-bridge', 'motorway-twin-bridge'); }
  const tunnel = longest(2);
  if (tunnel) { await look(Math.max(0, tunnel.s0 - 15), 160, 30, 160); await shot('twin-tunnel', 'motorway-twin-tunnel'); }
  // the direction switch sits with the road settings
  await page.evaluate(() => { const b = document.querySelector('#sec-design .fold-h button'); if (b?.getAttribute('aria-expanded') === 'false') b.click(); });
  // Split: edit only the direction towards B, then bend it
  await page.click('#dir-forward');
  await settle();
  console.log('split', JSON.stringify(await state()));
  await page.evaluate(() => window.trapla.resetCamera());
  await shot('split');
  // bend it the way a player does: drag the middle bend's handle on the map
  const k = await page.evaluate(() => Math.floor(window.trapla.getDesign().pis.length / 2));
  const moved = await page.evaluate(k => window.trapla.getDesign().pis[k], k);
  await page.evaluate(m => window.trapla.lookAt(m.x, m.y, 2500, 20, 50), moved);
  await page.evaluate(k => window.trapla.selectPi(k), k);
  await settle();
  const box = await page.locator(`.pi[data-i="${k}"]`).filter({ visible: true }).first().boundingBox();
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let j = 1; j <= 20; j++) { await page.mouse.move(x0 - 4 * j, y0 + 1.5 * j); await page.waitForTimeout(30); }
  await page.mouse.up();
  await settle();
  console.log('bent', JSON.stringify(await state()));
  await page.evaluate(m => window.trapla.lookAt(m.x, m.y, 1400, 20, 50), moved); // around the moved bend
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
