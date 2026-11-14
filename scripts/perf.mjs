// Rendering performance probe: load time and frame times while orbiting / panning / zooming.
// node scripts/perf.mjs [--root DIR] [--gpu] [--photo] [--contours]   (--gpu: the hardware GPU instead of SwiftShader)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1] ?? true; };
const root = arg('--root') && arg('--root') !== true ? arg('--root') : process.cwd();
const gpu = process.argv.includes('--gpu');
const server = await createServer({ root, server: { port: 5196, strictPort: true }, logLevel: 'warn' });
await server.listen();
const args = gpu
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-gpu-vsync', '--disable-frame-rate-limit']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto('http://localhost:5196/');
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.trapla.whenIdle());
console.log(`load → first result: ${Date.now() - t0} ms (dev server, cold module graph)`);
const t1 = Date.now();
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.trapla.whenIdle());
console.log(`reload → first result: ${Date.now() - t1} ms`);
console.log('renderer:', await page.evaluate(() => {
  const gl = document.querySelector('#view canvas').getContext('webgl2');
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
}));
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
await page.evaluate((d) => window.trapla.setDesign(d), design);
await page.evaluate(() => window.trapla.whenIdle());
await page.waitForTimeout(1500);
if (process.argv.includes('--photo')) await page.evaluate(() => window.trapla.setView({ photo: true }));
if (process.argv.includes('--contours')) await page.evaluate(() => window.trapla.setView({ contours: true }));

// each test: a list of camera poses, one per frame; reports frame-time statistics
const run = (name, poses) => page.evaluate(async ([name, poses]) => {
  const t = window.trapla, times = [];
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const gl = document.querySelector('#view canvas').getContext('webgl2');
  const px = new Uint8Array(4);
  await frame();
  let last = performance.now();
  for (const p of poses) {
    t.lookAt(...p);
    await frame();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // wait for the GPU
    const now = performance.now();
    times.push(now - last); last = now;
  }
  times.sort((a, b) => a - b);
  const q = (f) => times[Math.min(times.length - 1, Math.floor(f * times.length))];
  return `${name}: median ${q(0.5).toFixed(1)} ms, p95 ${q(0.95).toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms (${poses.length} frames)`;
}, [name, poses]);
const N = gpu ? 240 : 40;
const seq = (f) => Array.from({ length: N }, (_, i) => f(i / N));
console.log(await run('orbit overview', seq((u) => [9000, 11000, 22000, 360 * u, 50])));
console.log(await run('orbit mid 4 km', seq((u) => [9700, 8591, 4000, 360 * u, 40])));
console.log(await run('orbit close 500 m (town)', seq((u) => [9900, 7300, 500, 360 * u, 28])));
console.log(await run('pan close 600 m, 3 km', seq((u) => [8500 + 3000 * u, 7300 + 800 * u, 600, 30, 35])));
console.log(await run('zoom 20 km → 300 m', seq((u) => [9900, 7300, 20000 * Math.pow(300 / 20000, u), 20, 40])));
console.log(await run('zoom 300 m → 20 km', seq((u) => [9900, 7300, 300 * Math.pow(20000 / 300, u), 20, 40])));
await browser.close();
await server.close();
