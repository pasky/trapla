// Screenshots of the road's look (carriageway and markings, noise walls, bridge, structure line, bend guide,
// official line) at close and medium zoom, for before / after comparisons of the renderer.
// Usage: node scripts/road-look-shots.mjs design.json outdir [prefix]   (GPU=1: hardware GPU)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const design = JSON.parse(readFileSync(process.argv[2], 'utf8')).design;
const out = process.argv[3] ?? '/tmp/road-look';
const prefix = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 5197);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const args = process.env.GPU
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v2', '1'); } catch { /* opaque origin */ } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await page.evaluate((d) => window.trapla.setDesign(d), design);
  await page.evaluate(() => window.trapla.whenIdle());
  await page.waitForLoadState('networkidle');
  const settle = async () => {
    await page.evaluate(() => new Promise((res) => {
      const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
      requestAnimationFrame(() => requestAnimationFrame(f));
    }));
    await page.waitForTimeout(500);
  };
  // targets: Libeč (the owner's screenshot), the longest noise wall, the longest bridge, the tightest curve
  const t = await page.evaluate(() => {
    const r = window.trapla.result();
    const near = (x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < r.n; i++) { const d = Math.hypot(r.x[i] - x, r.y[i] - y); if (d < bd) { bd = d; b = i; } } return b; };
    const wall = [...r.walls].sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0))[0];
    const bridge = r.runs.filter((u) => u.kind === 1).sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0))[0];
    const curve = [...r.curves].sort((a, b) => a.r - b.r)[0];
    const at = (i) => ({ x: r.x[i], y: r.y[i], i });
    const mid = (s0, s1) => at(Math.round((s0 + s1) / 2 / r.ds));
    return {
      libec: at(near(8565, 11583)),
      wall: wall && { ...mid(wall.s0, wall.s1), side: wall.side, h: wall.height },
      bridge: bridge && mid(bridge.s0, bridge.s1),
      curve: curve && { ...at(near(curve.x, curve.y)), index: curve.index },
    };
  });
  console.log(JSON.stringify(t));
  const shots = [];
  const bearingAt = async (i) => page.evaluate((i) => { const r = window.trapla.result(); return Math.atan2(r.tx[i], r.ty[i]) * 180 / Math.PI; }, i);
  for (const [name, p] of Object.entries(t)) {
    if (!p) continue;
    const b = await bearingAt(p.i);
    // looking across the road at 50° to its direction, close and medium
    shots.push([`${name}-close`, p.x, p.y, 110, b + 50, 30]);
    shots.push([`${name}-medium`, p.x, p.y, 450, b + 50, 40]);
  }
  for (const [name, x, y, dist, bearing, elev] of shots) {
    await page.evaluate((a) => window.trapla.lookAt(...a), [x, y, dist, bearing, elev]);
    await settle();
    await page.screenshot({ path: `${out}/${prefix}${name}.png` });
    console.log('saved', `${out}/${prefix}${name}.png`);
  }
  // the tightest curve with its bend selected (editing guide), and the overview (official line)
  if (t.curve) {
    await page.evaluate((i) => window.trapla.selectPi(i), t.curve.index);
    await page.evaluate((a) => window.trapla.lookAt(...a), [t.curve.x, t.curve.y, 1400, 20, 55]);
    await settle();
    await page.screenshot({ path: `${out}/${prefix}curve-selected.png` });
    await page.evaluate(() => window.trapla.selectPi(null));
  }
  await page.evaluate(() => window.trapla.resetCamera());
  await settle();
  await page.screenshot({ path: `${out}/${prefix}overview.png` });
  await page.evaluate((p) => window.trapla.lookAt(p.x, p.y, 3500, 0, 50), t.libec);
  await settle();
  await page.screenshot({ path: `${out}/${prefix}libec-far.png` });
  console.log('done');
} finally {
  await browser.close();
  await server.close();
}
