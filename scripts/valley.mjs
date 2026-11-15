// Comparable owner-view valley screenshot, no profile edits. PORT avoids concurrent checkout servers.
// node scripts/valley.mjs before|after [design.json]
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5204), strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // the first-run intro would cover the map in the screenshots
  await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
  await page.goto(`${server.resolvedUrls.local[0]}?scenario=d11`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 });
  const design = JSON.parse(readFileSync(process.argv[3] ?? 'scripts/best-design.json', 'utf8')).design;
  await page.evaluate(async (d) => { window.trapla.setDesign(d); await window.trapla.whenIdle(); }, design);
  const view = await page.evaluate((chainage) => {
    const t = window.trapla, r = t.result(), i = Math.round(chainage / r.ds);
    const camera = [r.x[i], r.y[i], 2200, 235, 30];
    t.setView({ contours: true, slope: false, exag: 1, photo: false });
    t.lookAt(...camera); t.profileFocus(chainage - 1000, chainage + 1000);
    return { camera, total: r.cost.total, maxFill: Math.max(...Array.from(r.grade, (z, k) => r.kind[k] === 0 ? z - r.ground[k] : 0)), bridges: r.quantities.bridgeLength, valid: r.valid };
  }, Number(process.env.CHAINAGE ?? 15000));
  await page.waitForTimeout(4000);
  await page.waitForFunction(() => !window.trapla.viewBusy(), null, { timeout: 120000 });
  mkdirSync('docs/screenshots', { recursive: true });
  const path = `docs/screenshots/valley-${process.argv[2] ?? 'current'}.png`;
  await page.screenshot({ path }); console.log(path, JSON.stringify(view));
} finally { await browser.close(); await server.close(); }
