// Startup probe: navigation → app ready → first settled scene, with main-thread long tasks and JS
// heap, for one scenario. Used to check that lazy transport-graph loading does not regress startup.
//
//   node scripts/startup-perf.mjs [--gpu] [--scenario d11] [--runs 5] [--root DIR]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const root = arg('--root', process.cwd()), scenario = arg('--scenario', 'd11'), runs = Number(arg('--runs', 5));
const gpu = process.argv.includes('--gpu');
const server = await createServer({ root, server: { port: Number(arg('--port', 5199)), strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = `${server.resolvedUrls.local[0]}?scenario=${encodeURIComponent(scenario)}`;
const args = gpu
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-precise-memory-info']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const rows = [];
try {
  for (let run = 0; run <= runs; run++) { // run 0 warms Vite's transform cache and is discarded
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => {
      try { localStorage.setItem('trapla.intro.v1', '1'); localStorage.setItem('trapla.intro.v2', '1'); } catch { /* opaque */ }
      const S = window.__startup = { longtasks: [] };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.longtasks.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
    });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 180000 });
    const ready = Date.now() - t0;
    await page.evaluate(() => window.trapla.whenIdle());
    const idle = Date.now() - t0;
    await page.waitForTimeout(3000); // background (idle) work after the first settled frame
    const s = await page.evaluate(() => ({ longtasks: window.__startup.longtasks, heap: performance.memory?.usedJSHeapSize ?? null }));
    if (run) rows.push({ ready, idle, longtaskSum: Math.round(s.longtasks.reduce((a, b) => a + b, 0)),
      longest: Math.round(Math.max(0, ...s.longtasks)), heapMB: s.heap && +(s.heap / 1e6).toFixed(1) });
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
const median = (k) => { const v = rows.map(r => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log(JSON.stringify({ scenario, gpu, runs: rows, median: Object.fromEntries(['ready', 'idle', 'longtaskSum', 'longest', 'heapMB'].map(k => [k, median(k)])) }, null, 1));
