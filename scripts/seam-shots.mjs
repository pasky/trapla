// Matched oblique evidence for footprint seams, links and crossing abutments.
// node scripts/seam-shots.mjs /tmp/trapla-seams-before
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const out = process.argv[2] ?? '/tmp/trapla-seams-after';
mkdirSync(out, { recursive: true });
const port = Number(process.env.PORT ?? 5198);
const server = await createServer({ root: process.env.ROOT ?? process.cwd(), server: { port, strictPort: true }, logLevel: 'warn' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 });
  await page.evaluate(d => window.trapla.setDesign(d), JSON.parse(readFileSync('scripts/best-design.json', 'utf8')).design);
  await page.evaluate(() => window.trapla.whenIdle());
  const spots = await page.evaluate(() => {
    const r = window.trapla.result();
    const at = (s, name, turn, distance = 450) => {
      let i = 0; while (i + 1 < r.n && r.s[i] < s) i++;
      return { name, x: r.x[i], y: r.y[i], s: r.s[i], bearing: Math.atan2(r.tx[i], r.ty[i]) * 180 / Math.PI + turn, distance };
    };
    const bridge = r.crossings.find(c => c.type === 'overbridge');
    return { views: [at(1300, 'bend', 210, 650), at(2200, 'cut', 300), at(2900, 'fill', 160), at(1500, 'cut-detail', 110, 160), at(2300, 'bridge-detail', 260, 140), ...(bridge ? [{ name: 'abutment', x: bridge.x, y: bridge.y, s: bridge.s, bearing: 115, distance: 230 }] : [])], crossings: r.crossings };
  });
  writeFileSync(`${out}/geometry.json`, JSON.stringify(spots, null, 2));
  console.log(spots.views);
  for (const spot of spots.views.filter(s => !process.env.SHOTS || process.env.SHOTS.split(',').includes(s.name))) for (const photo of [false, true]) for (const exag of [1, 2]) {
    await page.evaluate(({ spot, photo, exag }) => {
      window.trapla.setView({ photo, exag, contours: false, slope: false });
      window.trapla.lookAt(spot.x, spot.y, spot.distance, spot.bearing, spot.name === 'abutment' ? 24 : 32);
    }, { spot, photo, exag });
    await page.waitForFunction(() => !window.trapla.viewBusy(), null, { timeout: 120000 });
    await page.waitForTimeout(600);
    const file = `${out}/${spot.name}-${photo ? 'photo' : 'map'}-${exag}x.png`;
    await page.screenshot({ path: file }); console.log(file);
  }
  if (process.env.PERF) {
    const timing = await page.evaluate(async spot => {
      const t = window.trapla, times = [], gl = document.querySelector('#view canvas').getContext('webgl2'), pixel = new Uint8Array(4);
      t.setView({ photo: true, exag: 1 });
      let last = performance.now();
      for (let i = 0; i < 45; i++) {
        t.lookAt(spot.x,spot.y,450,spot.bearing+i,32);
        await new Promise(requestAnimationFrame);
        gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        const now = performance.now(); if (i >= 5) times.push(now-last); last = now;
      }
      times.sort((a,b) => a-b);
      return { median: times[20], p95: times[38], frames: times.length };
    }, spots.views[1]);
    writeFileSync(`${out}/frame-times.json`, JSON.stringify(timing)); console.log('frame times', timing);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser?.close(); await server.close(); }
