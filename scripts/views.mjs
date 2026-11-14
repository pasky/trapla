// Debug helper: render arbitrary camera views of a design.
// node scripts/views.mjs design.json '[[x,y,dist,bearing,elev,"name",{"contours":true}?],...]' [outdir]   (x = null: default camera)
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const design = JSON.parse(readFileSync(process.argv[2], 'utf8')).design;
const views = JSON.parse(process.argv[3]);
const out = process.argv[4] ?? '/tmp/views';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'warn' });
await server.listen();
// GPU=1: use the hardware GPU (Vulkan) instead of SwiftShader
const args = process.env.GPU
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto('http://localhost:5198/');
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate((d) => window.trapla.setDesign(d), design);
await page.evaluate(() => window.trapla.whenIdle());
await page.waitForLoadState('networkidle');
// wait until the land-cover clip levels for the current camera are drawn
const settle = () => page.evaluate(() => new Promise((res) => {
  const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
  requestAnimationFrame(() => requestAnimationFrame(f));
}));
for (const [x, y, dist, bearing, elev, name, prefs] of views) {
  await page.evaluate((p) => window.trapla.setView({ contours: false, slope: false, exag: 1, photo: false, ...(p ?? {}) }), prefs);
  if (x === null) await page.evaluate(() => window.trapla.resetCamera());
  else await page.evaluate((a) => window.trapla.lookAt(...a), [x, y, dist, bearing, elev]);
  await settle();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
}
const s = await page.evaluate(() => { const r = window.trapla.result(); return r.curves.map((c) => [c.index, Math.round(c.x), Math.round(c.y), Math.round(c.r), Math.round(c.sStart)]); });
console.log(JSON.stringify(s));
await browser.close(); await server.close();
