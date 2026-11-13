// Drive the real app headlessly (Chromium + SwiftShader WebGL) and save screenshots.
// Usage: node scripts/screenshots.mjs [designs.json]   (starts its own Vite dev server)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'warn' });
await server.listen();
const url = 'http://localhost:5199/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const idle = async () => {
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await page.evaluate(() => window.trapla.whenIdle());
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
};
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
};

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await idle();
console.log('naive', JSON.stringify(await page.evaluate(() => {
  const s = window.trapla.summary();
  return { length: s.length, total: s.cost.total, violations: s.violations.length, timing: s.timing };
})));
await shot('01-overview-naive');

const designs = JSON.parse(readFileSync(process.argv[2] ?? 'scripts/demo-design.json', 'utf8'));
await page.evaluate((d) => window.trapla.setDesign(d), designs.design);
await idle();
const summary = await page.evaluate(() => window.trapla.summary());
console.log('design', JSON.stringify({
  length: summary.length, travelMin: summary.travelMin, valid: summary.valid, total: summary.cost.total,
  cost: summary.cost, q: summary.quantities, runs: summary.runs, violations: summary.violations.map((v) => v.msg), timing: summary.timing,
}, null, 1));
if (designs.overview) await page.evaluate((c) => window.trapla.lookAt(...c), designs.overview);
await page.waitForTimeout(800);
await shot('02-design');

// close-up of a bridge (and nearby cut)
const r = await page.evaluate(() => {
  const res = window.trapla.result();
  const br = res.runs.find((x) => x.kind === 1);
  if (!br) return null;
  const i = Math.round((br.i0 + br.i1) / 2);
  return { x: res.x[i], y: res.y[i], s0: br.s0, s1: br.s1, len: br.length, tx: res.tx[i], ty: res.ty[i] };
});
if (r) {
  const bearing = (Math.atan2(r.tx, r.ty) * 180) / Math.PI + 70;
  await page.evaluate(([x, y, b]) => window.trapla.lookAt(x, y, 900, b, 30), [r.x, r.y, bearing]);
  await page.evaluate(([a, b]) => window.trapla.profileFocus(a, b), [r.s0, r.s1]);
  await page.waitForTimeout(1500);
  await shot('03-closeup-bridge-cut');
}

// drag performance: move a PI repeatedly through the real worker path
const perf = await page.evaluate(async () => {
  const t = window.trapla;
  const d = t.getDesign();
  if (!d.pis.length) return null;
  const times = [];
  for (let k = 0; k < 10; k++) {
    d.pis[Math.floor(d.pis.length / 2)].x += 15;
    const t0 = performance.now();
    t.setDesign(d);
    await t.whenIdle();
    times.push(performance.now() - t0);
  }
  return times;
});
console.log('round-trip ms per edit (SwiftShader page):', perf?.map((x) => x.toFixed(0)).join(' '));
console.log('console errors/warnings:', errors.length ? errors : 'none');
await browser.close();
await server.close();
