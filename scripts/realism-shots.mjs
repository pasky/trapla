// Close-up screenshots of earthworks (design realism, docs/design-realism-plan.md). Untimed: run under
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/realism-shots.mjs name:design.json:chainage[:dist:az:elev] …
// Writes docs/screenshots/<name>.png and prints what the engine built there.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5292), strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
  await page.goto(`${server.resolvedUrls.local[0]}?scenario=${process.env.SCENARIO ?? 'd11'}`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 });
  mkdirSync('docs/screenshots', { recursive: true });
  let loaded = '';
  for (const spec of process.argv.slice(2)) {
    const [name, file, chainage, dist = '350', az = '235', elev = '28'] = spec.split(':');
    if (file !== loaded) {
      const design = JSON.parse(readFileSync(file, 'utf8')).design;
      await page.evaluate(async (d) => { window.trapla.setDesign(d); await window.trapla.whenIdle(); }, design);
      loaded = file;
    }
    const info = await page.evaluate(([s, d, a, e]) => {
      const t = window.trapla, r = t.result(), i = Math.round(s / r.ds);
      t.setView({ contours: false, slope: false, exag: 1, photo: false });
      t.lookAt(r.x[i], r.y[i], d, a, e); t.profileFocus(s - 600, s + 600);
      return { s, h: +(r.grade[i] - r.ground[i]).toFixed(1), dayL: +r.dayL[i].toFixed(1), dayR: +r.dayR[i].toFixed(1), total: Math.round(r.cost.total / 1e6), valid: r.valid };
    }, [Number(chainage), Number(dist), Number(az), Number(elev)]);
    await page.waitForTimeout(3000);
    await page.waitForFunction(() => !window.trapla.viewBusy(), null, { timeout: 120000 });
    await page.screenshot({ path: `docs/screenshots/${name}.png` }); console.log(name, JSON.stringify(info));
  }
} finally { await browser.close(); await server.close(); }
