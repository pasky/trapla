// Oblique views of Auto underpasses on the demo design (a track and a local street).
// CHROME=/usr/bin/chromium node scripts/underpass-shots.mjs [--out dir]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const port = Number(process.env.PORT ?? 5198);
const outIndex = process.argv.indexOf('--out'), out = outIndex > 0 ? process.argv[outIndex + 1] : 'docs/screenshots/underpass';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const idle = async () => { await page.evaluate(() => window.trapla.whenIdle()); await page.waitForTimeout(500); };
try {
  await page.goto(`http://localhost:${port}/?scenario=d11`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 }); await idle();
  await page.evaluate(d => window.trapla.setDesign(d), design); await idle();
  const boxes = await page.evaluate(() => window.trapla.result().crossings.filter(c => c.type === 'underpass' && !c.issues?.length)
    .map(c => ({ roadId: c.roadId, cls: c.cls, s: c.s, x: c.x, y: c.y, length: c.underpassLength, cost: c.cost })));
  assert(boxes.length > 0, 'demo has an Auto underpass');
  for (const c of boxes) {
    for (const [name, size, bearing, elev] of [['oblique', 260, 35, 32], ['portal', 110, 125, 14]]) {
      await page.evaluate(({ c, size, bearing, elev }) => {
        window.trapla.selectCrossing(c.roadId);
        window.trapla.lookAt(c.x, c.y, size, bearing, elev);
        window.trapla.profileFocus(c.s - 200, c.s + 200);
      }, { c, size, bearing, elev });
      await idle(); await page.mouse.move(5, 5);
      const path = `${out}/underpass-${c.cls}-${c.roadId}-${name}.png`;
      await page.screenshot({ path }); console.log(path, JSON.stringify(c));
    }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
