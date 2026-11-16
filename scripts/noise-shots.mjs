// Before / after shots for cost model 21's noise changes and the pale-seam fix, at identical camera poses:
// walls in cuts (demo km 6.5 and km 10.1), the house that used to be bought out because of a junction gap
// (demo, its card and the noise view), the slope / ground boundary beside the best design's abutment, and
// demolished / bought-out buildings near and far.
// Usage: [ROOT=/path/to/checkout] [GPU=1] node scripts/noise-shots.mjs outdir [prefix]
// ROOT serves another checkout (e.g. a baseline worktree) with the same poses. Closes Chromium and Vite.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const out = process.argv[2] ?? '/tmp/noise-shots';
const prefix = process.argv[3] ?? '';
const root = process.env.ROOT ?? process.cwd();
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 5196);
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const args = process.env.GPU
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const design = (name) => JSON.parse(readFileSync(`${root}/scripts/${name}-design.json`, 'utf8')).design;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v2', '1'); } catch { /* opaque origin */ } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto(`http://localhost:${PORT}/?scenario=d11`);
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  const settle = async () => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise((res) => {
      const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
      requestAnimationFrame(() => requestAnimationFrame(f));
    }));
    await page.waitForTimeout(800);
  };
  const load = async (name) => { await page.evaluate((d) => window.trapla.setDesign(d), design(name)); await settle(); };
  const at = (i) => page.evaluate((i) => { const r = window.trapla.result(); return { x: r.x[i], y: r.y[i], b: Math.atan2(r.tx[i], r.ty[i]) * 180 / Math.PI }; }, i);
  const shot = async (name, i, dist, turn, elev, opts = {}) => {
    const p = await at(i);
    await page.evaluate((a) => window.trapla.lookAt(...a), [p.x, p.y, dist, p.b + turn, elev]);
    if (opts.select !== undefined) await page.evaluate((j) => window.trapla.select({ kind: 'building', j }), opts.select);
    await settle();
    await page.screenshot({ path: `${out}/${prefix}${name}.png` });
    console.log('saved', `${out}/${prefix}${name}.png`);
  };
  await load('demo');
  // a cut the old model walled inside its slope (the cut now screens by itself), and a deep cut walled on top
  await shot('cut-km6.5', 652, 160, 60, 28);
  await shot('cut-km10.1', 1013, 160, -60, 28);
  // the house beside the junction at km 6.74: card (plan, section) and the noise view
  await page.evaluate(() => window.trapla.setView({ noise: true }));
  await shot('gap-house-noise', 674, 420, 200, 45, { select: 22190 });
  await page.evaluate(() => window.trapla.setView({ noise: false }));
  await page.evaluate(() => window.trapla.select(null));
  // a house behind a wall standing on a cut's top edge: its card (plan, section)
  const inCut = await page.evaluate(() => { const r = window.trapla.result(), src = r.noise.source; if (!src) return null;
    const p = r.noise.receivers.find((q) => q.status === 'wall' && r.kind[q.i] === 0 && (q.side === 'L' ? src.L : src.R).edgeLane[q.i] === 0); return p ? [p.i, p.j] : null; });
  if (inCut) await shot('wall-in-cut-card', inCut[0], 350, 30, 40, { select: inCut[1] });
  await page.evaluate(() => window.trapla.select(null));
  // the slope / replacement ground boundary beside an abutment (best design), close
  await load('best');
  const abut = await page.evaluate(() => {
    const r = window.trapla.result();
    for (const u of r.runs) if (u.kind === 1) for (const i of [u.i0, u.i1]) if (r.ground[i] > r.grade[i]) return i;
    return null;
  });
  if (abut !== null) { await shot('seam-abutment', abut + 15, 80, 70, 22); await shot('seam-abutment-across', abut + 3, 80, -70, 22); }
  const wall = await page.evaluate(() => { const r = window.trapla.result(); const w = [...r.walls].sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0))[0]; return w ? Math.round((w.i0 + w.i1) / 2) : null; });
  if (wall !== null) await shot('seam-wall', wall, 110, 50, 30);
  // what the route takes: demolished buildings under a viaduct (cleared plots) and from far away (markers)
  const dem = await page.evaluate(() => { const r = window.trapla.result(); const d = r.demolished.find((p) => r.kind[p.i] === 1) ?? r.demolished[0]; return d ? d.i : null; });
  if (dem !== null) { await shot('demolished-near', dem, 230, 40, 35); await shot('demolished-far', dem, 5000, 40, 70); }
  // a bought-out house (direct-80): its colour, its ring, and far away
  await load('direct-80');
  const bo = await page.evaluate(() => window.trapla.result().boughtOut[0]?.i ?? null);
  if (bo !== null) { await shot('bought-near', bo, 200, 40, 35); await shot('bought-far', bo, 5000, 40, 70); }
  console.log('done');
} finally {
  await browser.close();
  await server.close();
}
