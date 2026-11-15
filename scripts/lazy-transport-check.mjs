// Lazy transport graph: startup does not parse it, and a real first click on a base road before it is
// parsed still opens that road's card (the click waits for the parse). D3 by default.
// node scripts/lazy-transport-check.mjs [--gpu]
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const scenario = process.env.SCENARIO ?? 'd3';
const server = await createServer({ server: { port: 5246, strictPort: false }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => { localStorage.setItem('trapla.intro.v2', '1'); });
  const url = `${server.resolvedUrls.local[0]}?scenario=${scenario}`;
  const open = async () => {
    const page = await context.newPage();
    page.on('pageerror', e => console.log('pageerror', e.message));
    await page.goto(url);
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
    await page.evaluate(() => window.trapla.whenIdle());
    return page;
  };
  const settle = (page) => page.evaluate(() => new Promise(resolve => {
    const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
    window.trapla.whenIdle().then(() => requestAnimationFrame(frame));
  }));
  // 1. a reference page parses the graph to find a base road and where it is drawn
  const ref = await open();
  await ref.evaluate(() => window.trapla.whenTransport());
  const road = (await ref.evaluate(() => window.trapla.baseRoads(900))).filter(r => r.clear > 1200).sort((a, b) => b.length - a.length)[0];
  await ref.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 900), [road.id, road.length / 2]);
  await settle(ref);
  const target = await ref.evaluate(() => window.trapla.cameraTarget());
  const screen = await ref.evaluate(([id, s]) => window.trapla.sourceScreen(id, s), [road.id, road.length / 2]);
  await ref.close();
  // 2. a fresh page: the same view, nothing parsed; click the drawn road at once
  const page = await open();
  assert.equal(await page.evaluate(([id, s]) => window.trapla.sourceScreen(id, s), [road.id, road.length / 2]), null,
    'the transport graph is not parsed at startup');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 900, 0, 55), [target.x, target.y]);
  await settle(page);
  const box = await page.locator('#view').boundingBox();
  await page.mouse.click(box.x + screen.sx, box.y + screen.sy);
  await page.locator('#inspector.k-source').waitFor({ timeout: 10000 });
  console.log(`PASS first click on ${road.name} (${Math.round(road.length)} m) before the graph was parsed opens its card`);
  // 3. a failed download is retried on the next need, not cached as permanently unavailable
  await page.close(); // one tab per saved project
  const flaky = await context.newPage();
  let failures = 1, requests = 0;
  // The picker's HEAD check sees the file; only the lazy download (GET) fails once.
  await flaky.route('**/transport.json.gz', route => {
    if (route.request().method() !== 'GET') return route.continue();
    requests++; return failures-- > 0 ? route.fulfill({ status: 503, body: 'busy' }) : route.continue();
  });
  await flaky.goto(url);
  await flaky.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await flaky.evaluate(() => window.trapla.whenIdle());
  await flaky.waitForTimeout(1500); // idle prefetch: the first, failing request
  assert.equal(await flaky.evaluate(() => window.trapla.whenTransport()), true, 'a later need retries the graph after a failure');
  assert(requests >= 2, `the graph was requested again (${requests} requests)`);
  console.log(`PASS a failed graph download is retried (${requests} requests)`);
} finally { await browser.close(); await server.close(); }
