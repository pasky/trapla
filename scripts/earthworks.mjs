// Contours over the earthworks: close-ups of the deepest cut and the highest embankment of a design with
// contour lines on, at 1× and 2× relief.
// Usage: node scripts/earthworks.mjs [design.json] [outdir]   (starts its own Vite dev server); writes 24…27-*.png
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const design = JSON.parse(readFileSync(process.argv[2] ?? 'scripts/demo-design.json', 'utf8')).design;
const OUT = process.argv[3] ?? 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT ?? 5197); // set PORT when several checkouts run at once
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const args = process.env.GPU
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate((d) => window.trapla.setDesign(d), design);
await page.waitForTimeout(500);
await page.evaluate(() => window.trapla.whenIdle());
const settle = async () => {
  await page.evaluate(() => new Promise((res) => {
    const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
    requestAnimationFrame(() => requestAnimationFrame(f));
  }));
  await page.waitForTimeout(500); // contour labels are laid out once the camera rests
};
const shot = async (name) => { await settle(); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('saved', `${OUT}/${name}.png`); };
const view = (prefs) => page.evaluate((p) => window.trapla.setView({ contours: false, slope: false, exag: 1, photo: false, ...p }), prefs);

// deepest cut and highest embankment on earthworks (not bridges / tunnels)
const spots = await page.evaluate(() => {
  const r = window.trapla.result();
  let cut = -1, fill = -1, dc = 0, df = 0;
  for (let i = 0; i < r.n; i++) {
    if (r.kind[i] !== 0) continue;
    const d = r.ground[i] - r.grade[i];
    if (d > dc) { dc = d; cut = i; }
    if (-d > df) { df = -d; fill = i; }
  }
  const at = (i, h) => ({ x: r.x[i], y: r.y[i], s: r.s[i], h, bearing: (Math.atan2(r.tx[i], r.ty[i]) * 180) / Math.PI });
  return { cut: cut < 0 ? null : at(cut, dc), fill: fill < 0 ? null : at(fill, df) };
});
console.log(JSON.stringify(spots));
let k = 24;
for (const [name, p, turn, elev] of [['cut', spots.cut, 210, 32], ['embankment', spots.fill, 300, 45]]) {
  for (const exag of [1, 2]) {
    const file = `${k++}-${name}-contours${exag > 1 ? `-relief-${exag}x` : ''}`;
    if (!p) continue;
    await view({ contours: true, exag });
    await page.evaluate(([x, y, b, e]) => window.trapla.lookAt(x, y, 380, b, e), [p.x, p.y, p.bearing + turn, elev]);
    await page.evaluate(([a, b]) => window.trapla.profileFocus(a, b), [p.s - 150, p.s + 150]);
    await shot(file);
  }
}
if (errors.length) { console.log('errors', errors); process.exitCode = 1; }
await browser.close();
await server.close();
