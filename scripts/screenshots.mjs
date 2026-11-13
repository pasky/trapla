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

// close-up of a bridge (and nearby cut). Optional: take manual control of the profile and bridge a
// valley straight across (the designer's choice the official D11 makes at Poříčí).
if (designs.viaduct) {
  const [a, b] = designs.viaduct;
  await page.evaluate(([a, b]) => {
    const t = window.trapla, d = t.getDesign();
    d.vpis = t.result().vpis.filter((v) => v.s <= a || v.s >= b);
    d.profileMode = 'manual';
    t.setDesign(d);
  }, [a, b]);
  await idle();
  const v = await page.evaluate(() => window.trapla.summary());
  console.log('viaduct variant', JSON.stringify({ total: v.cost.total, valid: v.valid, violations: v.violations.map((x) => x.msg), runs: v.runs.map((r) => [r.kind, Math.round(r.s0), Math.round(r.length)]) }));
}
const r = await page.evaluate(() => {
  const res = window.trapla.result();
  // the highest bridge
  let best = null, bh = -1;
  for (const br of res.runs) {
    if (br.kind !== 1) continue;
    for (let i = br.i0; i <= br.i1; i++) { const h = res.grade[i] - res.ground[i]; if (h > bh) { bh = h; best = { br, i }; } }
  }
  if (!best) return null;
  const { br, i } = best;
  return { x: res.x[i], y: res.y[i], s0: br.s0, s1: br.s1, len: br.length, h: bh, tx: res.tx[i], ty: res.ty[i] };
});
if (r) {
  console.log('close-up bridge', JSON.stringify(r));
  const bearing = (Math.atan2(r.tx, r.ty) * 180) / Math.PI + 245;
  await page.evaluate(([x, y, b, d]) => window.trapla.lookAt(x, y, d, b, 22), [r.x, r.y, bearing, Math.min(700, Math.max(300, r.len * 1.3))]);
  await page.evaluate(([a, b]) => window.trapla.profileFocus(a, b), [r.s0, r.s1]);
  await page.waitForTimeout(1500);
  await shot('03-closeup-bridge-cut');
}

// close-up of the deepest cut
const c = await page.evaluate(() => {
  const res = window.trapla.result();
  let bi = -1, bd = 0;
  for (let i = 0; i < res.n; i++) { const d = res.ground[i] - res.grade[i]; if (res.kind[i] === 0 && d > bd) { bd = d; bi = i; } }
  return bi < 0 ? null : { x: res.x[bi], y: res.y[bi], s: res.s[bi], depth: bd, tx: res.tx[bi], ty: res.ty[bi] };
});
if (c) {
  console.log('close-up cut', JSON.stringify(c));
  const bearing = (Math.atan2(c.tx, c.ty) * 180) / Math.PI + 210;
  await page.evaluate(([x, y, b]) => window.trapla.lookAt(x, y, 420, b, 30), [c.x, c.y, bearing]);
  await page.evaluate(([a, b]) => window.trapla.profileFocus(a, b), [c.s - 150, c.s + 150]);
  await page.waitForTimeout(1500);
  await shot('04-closeup-cut');
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
