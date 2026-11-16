// Serialized GPU/browser slot required. Railway mission Trutnov hl.n. → Královec (preset d11-rail-kralovec):
// overview, the new line leaving the existing track at Trutnov, its longest bridge, joining at Královec.
// node scripts/railway-shots.mjs [--docs N]   (--docs N: save to docs/screenshots from number N)
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const id = 'd11', preset = 'd11-rail-kralovec';
const docsAt = process.argv.includes('--docs') ? Number(process.argv[process.argv.indexOf('--docs') + 1]) : null;
const out = `/tmp/trapla-railway`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5295, strictPort: true }, logLevel: 'warn' });
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

  await page.goto(`http://localhost:5295/?scenario=${id}&preset=${preset}`);
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await page.evaluate(() => localStorage.clear()); // start from the preset, not an earlier run's save
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await settle();
  console.log('start', JSON.stringify(await state()));
  await page.evaluate(() => window.trapla.resetCamera());
  await shot('overview', 'railway-overview');
  const runs = await page.evaluate(() => { const r = window.trapla.result(); return { n: r.n, runs: r.runs.map(q => ({ kind: q.kind, s0: q.s0, s1: q.s1 })), ds: r.ds }; });
  const look = (s, dist, tilt = 35, heading = 25) => page.evaluate(([s, dist, tilt, heading]) => {
    const r = window.trapla.result(), i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    window.trapla.lookAt(r.x[i], r.y[i], dist, heading, tilt);
  }, [s, dist, tilt, heading]);
  const longest = kind => runs.runs.filter(q => q.kind === kind).sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0))[0];
  const ends = [0, ...runs.runs.flatMap(q => [q.s0, q.s1]), runs.n * runs.ds];
  let earth = null;
  for (let k = 0; k + 1 < ends.length; k += 2) if (!earth || ends[k + 1] - ends[k] > earth.s1 - earth.s0) earth = { s0: ends[k], s1: ends[k + 1] };
  const bearingAt = s => page.evaluate(s => { const r = window.trapla.result(), i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds))); return Math.atan2(r.tx[i], r.ty[i]) * 180 / Math.PI; }, s);
  // the start: out of Trutnov hl.n. along the existing track, then away from it
  await look(250, 260, 45, await bearingAt(250)); await shot('trutnov', 'railway-trutnov');
  const bridge = longest(1);
  if (bridge) { await look((bridge.s0 + bridge.s1) / 2, Math.max(300, (bridge.s1 - bridge.s0) * 0.9), 30, (await bearingAt((bridge.s0 + bridge.s1) / 2)) + 70); await shot('bridge', 'railway-bridge'); }
  // the end: joining the existing line at Královec station
  const end = runs.n * runs.ds;
  await look(end - 250, 300, 45, (await bearingAt(end - 250)) + 180); await shot('kralovec', 'railway-kralovec');
  for (const [from, to] of docs) copyFileSync(from, to);
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  await server.close();
}
