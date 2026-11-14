// Reproducible oblique crossing views; --before saves outside the tracked documentation.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const port = Number(process.env.PORT ?? 5197);
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const out = process.argv.includes('--before') ? '/tmp/trapla-crossings-before' : 'docs/screenshots';
mkdirSync(out, { recursive: true });
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const idle = async () => { await page.evaluate(() => window.trapla.whenIdle()); await page.waitForTimeout(500); };
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 }); await idle();
  for (const [k, type] of ['overbridge', 'bridge', 'reconnection', 'diversion', 'junction'].entries()) {
    await page.evaluate(d => window.trapla.setDesign(d), design); await idle();
    const selected = await page.evaluate(type => {
      const r = window.trapla.result();
      const candidates = r.crossings.filter(c => c.type === type && !c.issues?.length);
      const c = candidates.find(c => c.cls !== 'track' && (type !== 'overbridge' || c.approachLength > 5)) ?? candidates[0];
      if (!c) return null;
      window.trapla.selectCrossing(c.roadId);
      const size = type === 'reconnection' || type === 'diversion' ? Math.max(450, Math.min(2200, c.linkLength * .8)) : Math.max(400, Math.min(1000, (c.span ?? 50) * 3 + (c.approachLength ?? 0)));
      let x = c.x, y = c.y;
      if (c.geometry?.links) { const path = c.geometry.links[0]; x = (path[0].x + path.at(-1).x) / 2; y = (path[0].y + path.at(-1).y) / 2; }
      window.trapla.lookAt(x, y, size, 30, 58);
      window.trapla.profileFocus(c.s - 200, c.s + 200);
      window.trapla.setView({ contours: true });
      return { type, roadId: c.roadId, cls: c.cls, s: c.s, span: c.span, approaches: c.approachLength, links: c.linkLength };
    }, type);
    assert(selected, `demo has ${type}`); await idle();
    await page.mouse.move(5, 5);
    const path = `${out}/${36 + k}-crossing-${type}.png`;
    await page.screenshot({ path }); console.log(path, JSON.stringify(selected));
    if (type === 'overbridge') {
      await page.evaluate(id => { const c = window.trapla.result().crossings.find(c => c.roadId === id); window.trapla.lookAt(c.x, c.y, 180, 115, 24); }, selected.roadId);
      await idle(); await page.screenshot({ path: `${out}/41-crossing-overbridge-detail.png` });
    }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
