// Noise view (N) check: a town-fringe stretch of a design with walls, and the town-centre design with
// buyouts; hovers a walled dwelling, a bought-out one and a wall. Prints what the tooltips say.
// Usage: node scripts/noise-view.mjs [--gpu] [--docs] [outdir=/tmp/trapla-noise]
// --docs also writes docs/screenshots/28-noise-view-fringe.png and 29-noise-view-town-centre.png
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const gpu = process.argv.includes('--gpu') || !!process.env.GPU;
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/tmp/trapla-noise';
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT ?? 5198);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const idle = async () => {
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await page.evaluate(() => window.trapla.whenIdle());
  await page.waitForTimeout(800);
};
const settle = async () => {
  await page.evaluate(() => new Promise((res) => {
    const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
    requestAnimationFrame(() => requestAnimationFrame(f));
  }));
  await page.waitForTimeout(400);
};
const DOCS = { 'fringe-close-hover': '28-noise-view-fringe', 'centre-close-hover': '29-noise-view-town-centre' };
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', `${OUT}/${name}.png`);
  if (process.argv.includes('--docs') && DOCS[name]) {
    // the map only: small enough to commit without quantising away the legend colours
    await page.screenshot({ path: `docs/screenshots/${DOCS[name]}.png`, clip: await page.locator('#view').boundingBox() });
    console.log('saved', `docs/screenshots/${DOCS[name]}.png`);
  }
};
const tip = () => page.evaluate(() => { const t = document.querySelector('.map-tip'); return t && t.style.display !== 'none' ? t.innerText : null; });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await idle();

for (const [file, tag] of [['scripts/direct-80-design.json', 'fringe'], ['scripts/town-centre-design.json', 'centre']]) {
  const design = JSON.parse(readFileSync(file, 'utf8')).design;
  await page.evaluate((d) => window.trapla.setDesign(d), design);
  await idle();
  // the wall stretch protecting most dwellings (fringe) / the first buyout (centre)
  const pick = await page.evaluate((tag) => {
    const r = window.trapla.result(), rec = r.noise.receivers;
    const counts = r.walls.map((w) => rec.filter((p) => p.status === 'wall' && p.side === w.side && p.at >= w.i0 && p.at <= w.i1).length);
    const stats = {};
    for (const p of rec) stats[p.status] = (stats[p.status] ?? 0) + 1;
    let i, focus;
    if (tag === 'centre' && r.boughtOut.length) { i = r.boughtOut[0].i; focus = r.boughtOut[0].j; }
    else {
      const k = counts.indexOf(Math.max(...counts)), w = r.walls[k];
      i = Math.round((w.i0 + w.i1) / 2);
      focus = rec.filter((p) => p.status === 'wall' && p.side === w.side && p.at >= w.i0 && p.at <= w.i1)
        .sort((a, b) => Math.abs(a.at - i) - Math.abs(b.at - i))[0]?.j;
    }
    return { i, x: r.x[i], y: r.y[i], tx: r.tx[i], ty: r.ty[i], s: r.s[i], focus, stats, walls: r.walls.length, timing: r.timing };
  }, tag);
  console.log(tag, JSON.stringify({ s: pick.s, stats: pick.stats, walls: pick.walls, focus: pick.focus }));
  const bearing = (Math.atan2(pick.tx, pick.ty) * 180) / Math.PI + 60;
  await page.evaluate(() => window.trapla.setView({ noise: false }));
  await page.evaluate(([x, y, b]) => window.trapla.lookAt(x, y, 1400, b, 42), [pick.x, pick.y, bearing]);
  await shot(`${tag}-off`);
  await page.evaluate(() => window.trapla.setView({ noise: true }));
  await shot(`${tag}-noise`);
  // hover the focus building: its centroid, projected
  const scr = await page.evaluate((j) => window.trapla.buildingScreen(j, 2), pick.focus);
  if (scr) {
    const box = await page.locator('#view canvas').boundingBox();
    await page.mouse.move(box.x + scr.sx, box.y + scr.sy);
    await page.waitForTimeout(300);
    console.log(`${tag} building tip:\n${await tip()}`);
    await shot(`${tag}-noise-hover`);
  }
  // closer, from the other side of the road
  await page.evaluate(([x, y, b]) => window.trapla.lookAt(x, y, 800, b, 38), [pick.x, pick.y, bearing - 120]);
  // hover the protected / bought-out dwelling drawn nearest the middle of the view (after a frame:
  // the projection uses the camera matrices of the last render)
  await settle();
  const scr2 = await page.evaluate((tag) => {
    const r = window.trapla.result(), el = document.querySelector('#view canvas');
    const cx = el.clientWidth * 0.5, cy = el.clientHeight * 0.4;
    let best = null, bd = Infinity;
    for (const p of r.noise.receivers) {
      if (p.status !== (tag === 'centre' ? 'bought' : 'wall')) continue;
      const s = window.trapla.buildingScreen(p.j, 2);
      const d = Math.hypot(s.sx - cx, s.sy - cy);
      if (s.vis && d < bd) { bd = d; best = s; }
    }
    return best;
  }, tag);
  if (scr2) {
    const box = await page.locator('#view canvas').boundingBox();
    await page.mouse.move(box.x + scr2.sx, box.y + scr2.sy);
    await page.waitForTimeout(300);
    console.log(`${tag} close tip at ${JSON.stringify(scr2)}: ${(await tip())?.split("\n")[0]}`);
  }
  await shot(`${tag}-close-hover`);
  // a wall from afar with the noise view off
  await page.evaluate(() => window.trapla.setView({ noise: false }));
  await page.evaluate(([x, y, b]) => window.trapla.lookAt(x, y, 5000, b, 50), [pick.x, pick.y, bearing]);
  await shot(`${tag}-far-walls`);
  // hover a wall symbol: scan the screen around the stretch centre for a wall tooltip
  const c = await page.evaluate(([x, y]) => window.trapla.project(x, y, 0), [pick.x, pick.y]);
  const box = await page.locator('#view canvas').boundingBox();
  let wallTip = null;
  for (let dy = -40; dy <= 40 && !wallTip; dy += 3) for (let dx = -40; dx <= 40 && !wallTip; dx += 6) {
    await page.mouse.move(box.x + c.sx + dx, box.y + c.sy + dy);
    await page.waitForTimeout(20);
    const t = await tip();
    if (t && t.startsWith('Noise wall')) wallTip = t;
  }
  console.log(`${tag} wall tip:\n${wallTip}`);
  if (wallTip) await shot(`${tag}-far-walls-hover`);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
