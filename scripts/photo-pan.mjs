// Aerial-photo panning check: with the photo on, pan the camera across an area and back again. Counts
// the image requests (a revisit must not refetch what was loaded) and screenshots mid-pan to $OUT.
// node scripts/photo-pan.mjs [--gpu]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5207);
const OUT = process.env.OUT ?? '/tmp/trapla-photo';
mkdirSync(OUT, { recursive: true });
const gpu = process.argv.includes('--gpu');
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const args = gpu
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
page.on('pageerror', (e) => { console.log('pageerror', e.message); process.exitCode = 1; });
page.on('console', (m) => { if (m.type() === 'error') { console.log('console error', m.text().slice(0, 300)); process.exitCode = 1; } });
let started = 0, done = 0, failed = 0;
const urls = new Map();
page.on('request', (r) => { if (r.url().includes('/export?')) { started++; urls.set(r.url(), (urls.get(r.url()) ?? 0) + 1); } });
page.on('requestfinished', (r) => { if (r.url().includes('/export?')) done++; });
page.on('requestfailed', (r) => { if (r.url().includes('/export?')) failed++; });
await page.goto(`http://localhost:${PORT}/?scenario=d11`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.trapla.whenIdle());
if (!(await page.evaluate(() => !!window.trapla.meta.orthophoto))) { console.log('no orthophoto source'); process.exit(0); }
const idle = async (ms = 60000) => {
  const t0 = Date.now();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  while (Date.now() - t0 < ms && (await page.evaluate(() => window.trapla.viewBusy()))) await page.waitForTimeout(200);
  return Date.now() - t0;
};
const stats = (tag) => {
  const dup = [...urls.values()].filter((n) => n > 1).length;
  console.log(`${tag.padEnd(34)} requests ${String(started).padStart(4)} (finished ${done}, failed/aborted ${failed}), distinct ${urls.size}, fetched more than once ${dup}`);
};
await page.evaluate(() => window.trapla.setView({ photo: true }));
const pose = (u) => [8800 + 1200 * u, 7300 + 300 * u, 700, 30, 35];
await page.evaluate((p) => window.trapla.lookAt(...p), pose(0));
console.log(`initial load: ${await idle()} ms`);
stats('loaded at the start');
await page.screenshot({ path: `${OUT}/0-start.png` });
// pan away in small steps, as a mouse drag would (not waiting for photos), then back
const pan = async (from, to, tag) => {
  const N = 30;
  for (let i = 0; i <= N; i++) {
    await page.evaluate((p) => window.trapla.lookAt(...p), pose(from + ((to - from) * i) / N));
    await page.waitForTimeout(80);
    if (i === N / 2) await page.screenshot({ path: `${OUT}/${tag}-mid.png` });
  }
  stats(`after panning ${tag}`);
};
await pan(0, 1, '1-away');
console.log(`settled: ${await idle()} ms`);
stats('settled away');
const before = started;
await pan(1, 0, '2-back');
await page.screenshot({ path: `${OUT}/2-back-end.png` });
console.log(`settled: ${await idle()} ms`);
stats('settled back at the start');
await pan(0, 1, '3-away-again');
console.log(`settled: ${await idle()} ms`);
stats('settled away again');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
ok(started === before, `no requests while revisiting loaded ground (${started - before})`);
// photo off and on again: redrawn from the cache
const n = started;
await page.evaluate(() => window.trapla.setView({ photo: false }));
await idle();
await page.evaluate(() => window.trapla.setView({ photo: true }));
await idle();
await page.screenshot({ path: `${OUT}/4-toggled.png` });
ok(started === n, `photo off and on again: no requests (${started - n})`);
await browser.close();
await server.close();
