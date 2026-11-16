// Serialized GPU/browser slot required. Motorway mode end to end: picker, paired D3 motorway (two
// carriageways, twin decks, twin tunnels), one direction on its own over a stretch, joined again.
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
      score: document.querySelector('#score')?.textContent?.replace(/\s+/g, ' ').trim(), active: window.trapla.activeRoute(),
      apart: window.trapla.getProject().corridors[0]?.stretches?.map(t => `${Math.round(t.a)}–${Math.round(t.b)}`) ?? [] };
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
  // one direction on its own: choose it on the motorway's own card (nothing changes yet), then drag
  // that carriageway away from the other; only that stretch runs apart
  await page.keyboard.press('Escape');
  await settle();
  await page.locator('.motorway-head [data-dir="reverse"]').click();
  await settle();
  console.log('picked', JSON.stringify(await state()));
  const k = await page.evaluate(() => Math.floor(window.trapla.getDesign().pis.length / 2));
  const s = await page.evaluate(k => {
    const d = window.trapla.getDesign(), p = d.pis[k], q = d.pis[k + 1], r = window.trapla.result();
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    let best = 0, bd = Infinity;
    for (let i = 0; i < r.n; i++) { const dd = (r.x[i] - mx) ** 2 + (r.y[i] - my) ** 2; if (dd < bd) { bd = dd; best = i; } }
    window.trapla.lookAt(r.x[best], r.y[best], 1500, 20, 60);
    return r.s[best];
  }, k);
  await settle();
  const box = await page.locator('#view canvas').first().boundingBox();
  // grab the reverse carriageway (left of A→B) and pull it 120 m further left
  const [p, q] = await page.evaluate(s => {
    const r = window.trapla.result(), i = Math.round(s / r.ds), z = r.grade[i] + 1.5, nx = -r.ty[i], ny = r.tx[i];
    return [window.trapla.screenOf(r.x[i] + nx * 6.9, r.y[i] + ny * 6.9, z), window.trapla.screenOf(r.x[i] + nx * 127, r.y[i] + ny * 127, z)];
  }, s);
  await page.mouse.move(box.x + p.sx, box.y + p.sy); await page.mouse.down();
  for (let j = 1; j <= 20; j++) { await page.mouse.move(box.x + p.sx + (q.sx - p.sx) * j / 20, box.y + p.sy + (q.sy - p.sy) * j / 20); await page.waitForTimeout(30); }
  await page.mouse.up();
  await settle();
  console.log('apart', JSON.stringify(await state()));
  await page.evaluate(s => { const r = window.trapla.result(), i = Math.round(s / r.ds); window.trapla.lookAt(r.x[i], r.y[i], 1300, 25, 50); }, s);
  await page.keyboard.press('Escape');
  await shot('one-direction', 'motorway-one-direction');
  const join = page.locator('.motorway-head .apart-row button').first();
  if (await join.count()) await join.click();
  await settle();
  console.log('joined', JSON.stringify(await state()));
  await shot('joined');
  for (const [from, to] of docs) copyFileSync(from, to);
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  await server.close();
}
