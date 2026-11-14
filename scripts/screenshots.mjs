// Drive the real app headlessly (Chromium + SwiftShader WebGL) and save screenshots.
// Usage: node scripts/screenshots.mjs [designs.json]   (starts its own Vite dev server)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT ?? 5199); // set PORT when several checkouts run at once
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const url = `http://localhost:${PORT}/`;
// GPU=1: use the hardware GPU (Vulkan) instead of SwiftShader — much faster where one is available
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: process.env.GPU
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const idle = async () => {
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await page.evaluate(() => window.trapla.whenIdle());
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
};
// wait until the land-cover textures for the current camera are drawn (and photos fetched)
const settle = async () => {
  await page.evaluate(() => new Promise((res) => {
    const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
    requestAnimationFrame(() => requestAnimationFrame(f));
  }));
  await page.waitForTimeout(500); // contour labels are laid out once the camera rests
};
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
};
const view = (prefs) => page.evaluate((p) => window.trapla.setView({ contours: false, slope: false, exag: 1, photo: false, ...p }), prefs);
const look = (...a) => page.evaluate((a) => window.trapla.lookAt(...a), a);

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await idle();
console.log('start', JSON.stringify(await page.evaluate(() => {
  const s = window.trapla.summary();
  return { length: s.length, total: s.cost.total, violations: s.violations.length, timing: s.timing };
})));
await shot('01-overview-start');

// cost breakdown of a stretch: the most expensive kilometre of the given design, selected in the
// profile (highlighted on the map, HUD switched to the range) with the hover tooltip open
const stretchShot = async (name, dist, elev) => {
  const k = await page.evaluate(() => {
    const r = window.trapla.result();
    const per = Math.round(1000 / r.ds);
    let best = 0, bi = 0, acc = 0;
    const tot = new Float64Array(r.n);
    for (const key of Object.keys(r.parts)) for (let i = 0; i < r.n; i++) tot[i] += r.parts[key][i];
    for (let i = 0; i < r.n; i++) {
      acc += tot[i] - (i >= per ? tot[i - per] : 0);
      if (i >= per - 1 && acc > best) { best = acc; bi = i - per + 1; }
    }
    let hi = bi;
    for (let i = bi; i < bi + per; i++) if (tot[i] > tot[hi]) hi = i;
    const m = bi + Math.floor(per / 2);
    window.trapla.profileFit();
    window.trapla.selectRange(r.s[bi], r.s[bi + per - 1]);
    return { s0: r.s[bi], s1: r.s[bi + per - 1], sHover: r.s[hi], x: r.x[m], y: r.y[m], tx: r.tx[m], ty: r.ty[m], length: r.length, cost: best };
  });
  console.log(name, JSON.stringify(k));
  await page.evaluate(([x, y, b, d, e]) => window.trapla.lookAt(x, y, d, b, e), [k.x, k.y, (Math.atan2(k.tx, k.ty) * 180) / Math.PI + 300, dist, elev]);
  const cb = await page.locator('#profile-canvas').boundingBox();
  await page.mouse.move(cb.x + 52 + (k.sHover / k.length) * (cb.width - 66), cb.y + 70);
  await page.waitForTimeout(1500);
  await shot(name);
  await page.mouse.move(300, 300);
  await page.evaluate(() => { window.trapla.selectRange(null); window.trapla.resetCamera(); });
};
await stretchShot('06-town-stretch', 2600, 50);

const designs = JSON.parse(readFileSync(process.argv[2] ?? 'scripts/demo-design.json', 'utf8'));
await page.evaluate((d) => window.trapla.setDesign(d), designs.design);
await idle();
const summary = await page.evaluate(() => window.trapla.summary());
console.log('design', JSON.stringify({
  length: summary.length, travelMin: summary.travelMin, valid: summary.valid, total: summary.cost.total,
  cost: summary.cost, q: summary.quantities, runs: summary.runs, violations: summary.violations.map((v) => `${v.title} — ${v.fix}`), timing: summary.timing,
}, null, 1));
if (designs.overview) await page.evaluate((c) => window.trapla.lookAt(...c), designs.overview);
await page.waitForTimeout(800);
await shot('02-design');
await stretchShot('05-selected-range', 2600, 42);

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
  console.log('viaduct variant', JSON.stringify({ total: v.cost.total, valid: v.valid, violations: v.violations.map((x) => `${x.title} — ${x.fix}`), runs: v.runs.map((r) => [r.kind, Math.round(r.s0), Math.round(r.length)]) }));
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
  await view({ contours: true });
  await shot('09-bridge-contours');
  await view({});
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
  await view({ contours: true });
  await shot('10-cut-contours');
  await view({});
}

// terrain legibility and close-up quality: contours, slope tint, exaggeration, town, forest edge, photo
await page.evaluate(() => { window.trapla.resetCamera(); window.trapla.profileFit(); });
await view({ contours: true });
await shot('07-overview-contours');
await look(9700, 8591, 5000, 20, 45);
await shot('08-mid-contours');
await view({ slope: true });
await shot('14-mid-slope-tint');
await view({});
await look(6713, 7282, 700, 30, 28);
await shot('11-town-buildings');
await look(10500, 12500, 600, 200, 28);
await shot('12-forest-edge');
await view({ contours: true });
await shot('13-forest-edge-contours');
// 2× relief at the longest noise wall, with half of it selected: road, wall and highlight scale with the terrain
const wall = await page.evaluate(() => {
  const r = window.trapla.result();
  const w = [...r.walls].sort((a, b) => (b.i1 - b.i0) - (a.i1 - a.i0))[0];
  if (!w) return null;
  const m = Math.round((w.i0 + w.i1) / 2);
  window.trapla.selectRange(r.s[w.i0], r.s[m]);
  return { x: r.x[m], y: r.y[m], bearing: (Math.atan2(r.tx[m], r.ty[m]) * 180) / Math.PI + (w.side === 'L' ? 60 : -60) };
});
await view({ contours: true, exag: 2 });
if (wall) await look(wall.x, wall.y, 420, wall.bearing, 24); else await look(9400, 9300, 900, 40, 30);
await shot('15-relief-2x-noise-wall');
await page.evaluate(() => window.trapla.selectRange(null));
if (await page.evaluate(() => !!window.trapla.meta.orthophoto && navigator.onLine)) {
  await view({ photo: true, contours: true });
  await look(9400, 9300, 450, 40, 30);
  await shot('16-photo-contours');
}
await view({});
await page.evaluate((c) => (c ? window.trapla.lookAt(...c) : window.trapla.resetCamera()), designs.overview ?? null);

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
console.log(`round-trip ms per edit (${process.env.GPU ? 'hardware GPU' : 'SwiftShader'} page):`, perf?.map((x) => x.toFixed(0)).join(' '));
console.log('console errors/warnings:', errors.length ? errors : 'none');
await browser.close();
await server.close();
