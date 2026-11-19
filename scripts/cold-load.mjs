// A first-time visitor's cold load of the built site on a slow line: no cache, the network throttled (20 Mbit/s,
// 40 ms round trip) and the page's main thread 4× slower (the evaluation workers are not throttled: Chromium
// throttles a page's main thread only). Times, from navigation:
//   paint        first contentful paint of the start screen
//   picker       the start screen can be used (a Start button enabled)
//   map          a mission opened straight by its link: the 3D map shows (the loading card is gone or, on
//                builds without one, the first frame with the terrain drawn)
//   playable     …and its first evaluation has settled (the score is up, a drag answers)
//
//   node scripts/cold-load.mjs [--dist dist] [--scenario d3-0302 --preset d3-0302-motorway] [--runs 3] [--gpu]
//                              [--mbit 20] [--rtt 40] [--cpu 4] [--picker]   (--picker: open the mission from the
//                              start screen's "Start here" instead of its link; the times then add up;
//                              --read MS: the visitor reads the start screen that long before the click)
// Timed: run under `flock -x /tmp/trapla-browser.lock` (AGENTS.md).
import { chromium } from 'playwright-core';
import { serveStatic } from './static-serve.mjs';
import { passTwists } from './lib/browser.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const dist = arg('--dist', 'dist'), runs = Number(arg('--runs', 3)), scenario = arg('--scenario', 'd3-0302');
const preset = arg('--preset', 'd3-0302-motorway'), mbit = Number(arg('--mbit', 20)), rtt = Number(arg('--rtt', 40)), cpu = Number(arg('--cpu', 4));
const viaPicker = process.argv.includes('--picker'), gpu = process.argv.includes('--gpu'), read = Number(arg('--read', 0));
const SOFTWARE = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];

const server = await serveStatic({ dir: dist, port: Number(arg('--port', 4400)), base: arg('--base', '/trapla/') });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: gpu ? GPU : SOFTWARE });
const rows = [];
const throttle = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: mbit * 1e6 / 8, uploadThroughput: 5e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  return () => bytes;
};
const fcp = (page) => page.evaluate(() => new Promise((r) => {
  const get = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
  if (get()) r(get()); else new PerformanceObserver(() => get() && r(get())).observe({ type: 'paint', buffered: true });
}));
const pickerUp = (page) => page.waitForFunction(() => !![...document.querySelectorAll('.scenario-picker button')].find((b) => !b.disabled && /Start|Continue/.test(b.textContent)), null, { timeout: 120000, polling: 50 });
const mapUp = (page) => page.waitForFunction(() => {
  const loading = document.getElementById('loading');
  if (loading) return loading.hidden || !loading.isConnected;
  return !!document.querySelector('#view canvas') && !!window.trapla; // older builds: no loading card
}, null, { timeout: 300000, polling: 50 });
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => { try { localStorage.setItem('trapla.intro.v2', '1'); } catch { /* */ } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const bytes = await throttle(page);
    const row = {};
    let t0 = Date.now();
    await page.goto(server.url, { waitUntil: 'commit' });
    row.paint = Math.round(await fcp(page));
    await pickerUp(page); row.picker = Date.now() - t0;
    if (viaPicker) {
      await page.waitForTimeout(read); row.click = Date.now() - t0;
      const start = page.locator('[data-start-here] button').first();
      await start.click();
      // (its twist screen, taken as it comes: the map downloads meanwhile)
      await passTwists(page);
    } else {
      const page2 = page; t0 = Date.now();
      await page2.goto(`${server.url}?scenario=${scenario}${preset ? `&preset=${preset}` : ''}`, { waitUntil: 'commit' });
      row.mapPaint = Math.round(await fcp(page2));
    }
    await mapUp(page); row.map = Date.now() - t0;
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 300000 });
    await page.evaluate(() => window.trapla.whenIdle()); row.playable = Date.now() - t0;
    row.MB = +(bytes() / 1e6).toFixed(1);
    // the startup's steps (src/app.ts marks), ms from navigation
    row.marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('trapla:')).map((m) => [m.name.slice(7), Math.round(m.startTime)])));
    row.longtasks = await page.evaluate(() => { try { return performance.getEntriesByType('longtask').length; } catch { return null; } });
    if (errors.length) row.errors = errors;
    rows.push(row);
    console.log(JSON.stringify(row));
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
const median = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log(JSON.stringify({ dist, scenario: `${scenario}${preset ? `/${preset}` : ''}`, viaPicker, mbit, rtt, cpu, gpu,
  read, median: Object.fromEntries(['paint', 'picker', 'click', 'mapPaint', 'map', 'playable', 'MB'].map((k) => [k, median(k)])) }));
