// Before/after views of typical crossing outcomes (overbridge ramps, long links, the service-road
// overbridge reported at km 8.64), with the crossing card open.
// CHROME=/usr/bin/chromium node scripts/crossing-sanity-shots.mjs --out /tmp/trapla-sanity-before
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const port = Number(process.env.PORT ?? 5199);
const outIndex = process.argv.indexOf('--out'), out = outIndex > 0 ? process.argv[outIndex + 1] : 'docs/screenshots/crossing-sanity';
mkdirSync(out, { recursive: true });
// [file, roadId, name, camera distance, bearing, elevation]
const shots = [
  ['tests/fixtures/service-overbridge-design.json', 4826, 'km847-service-overbridge', 520, 200, 32],
  ['scripts/best-design.json', 4174, 'best-km369-track-overbridge', 700, 30, 40],
  ['scripts/direct-80-design.json', 2182, 'direct80-km1597-street-overbridge', 800, 30, 40],
  ['scripts/demo-design.json', 5116, 'demo-km1217-track-reroute', 2600, 30, 58],
  ['scripts/best-design.json', 4742, 'best-km796-service-reconnection', 1800, 30, 58],
];
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const idle = async () => { await page.evaluate(() => window.trapla.whenIdle()); await page.waitForTimeout(500); };
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 }); await idle();
  for (const [file, roadId, name, size, bearing, elev] of shots) {
    await page.evaluate(d => window.trapla.setDesign(d), JSON.parse(readFileSync(file, 'utf8')).design); await idle();
    const info = await page.evaluate(({ roadId, size, bearing, elev }) => {
      const r = window.trapla.result(), c = r.crossings.find(c => c.roadId === roadId);
      if (!c) return null;
      window.trapla.selectCrossing(roadId);
      let x = c.x, y = c.y;
      if (c.geometry?.links?.[0]?.length) { const p = c.geometry.links[0]; x = (p[0].x + p.at(-1).x) / 2; y = (p[0].y + p.at(-1).y) / 2; }
      window.trapla.lookAt(x, y, size, bearing, elev);
      window.trapla.profileFocus(c.s - 300, c.s + 300);
      return { s: c.s, type: c.type, cost: c.cost, span: c.span, approach: c.approachLength, links: c.linkLength,
        violations: r.violations.filter(v => Math.abs(v.s0 - c.s) < 400).map(v => v.title) };
    }, { roadId, size, bearing, elev });
    await idle(); await page.mouse.move(5, 5);
    const path = `${out}/${name}.png`;
    await page.screenshot({ path }); console.log(path, JSON.stringify(info));
  }
  if (errors.length) console.log('page errors:', errors);
} finally { await browser.close(); await server.close(); }
