// Debug helper: render arbitrary camera views of a design.
// node scripts/views.mjs design.json '[[x,y,dist,bearing,elev,"name",{"contours":true}?],...]' [outdir]   (x = null: default camera)
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const design = JSON.parse(readFileSync(process.argv[2], 'utf8')).design;
const views = JSON.parse(process.argv[3]);
const out = process.argv[4] ?? '/tmp/views';
mkdirSync(out, { recursive: true });
// GPU=1 (or --gpu): the hardware GPU (Vulkan) instead of SwiftShader
const game = await startGame({ gpu: !!process.env.GPU || process.argv.includes('--gpu') });
const { page } = game;
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await game.open(`scenario=${encodeURIComponent(process.env.SCENARIO ?? 'd11')}`);
await page.evaluate((d) => window.trapla.setDesign(d), design);
await page.evaluate(() => window.trapla.whenIdle());
await page.waitForLoadState('networkidle');
// wait until the land-cover clip levels for the current camera are drawn
const settle = () => page.evaluate(() => new Promise((res) => {
  const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
  requestAnimationFrame(() => requestAnimationFrame(f));
}));
for (const [x, y, dist, bearing, elev, name, prefs] of views) {
  await page.evaluate((p) => window.trapla.setView({ contours: false, slope: false, exag: 1, photo: false, ...(p ?? {}) }), prefs);
  if (x === null) await page.evaluate(() => window.trapla.resetCamera());
  else await page.evaluate((a) => window.trapla.lookAt(...a), [x, y, dist, bearing, elev]);
  await settle();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
}
const s = await page.evaluate(() => { const r = window.trapla.result(); return r.curves.map((c) => [c.index, Math.round(c.x), Math.round(c.y), Math.round(c.r), Math.round(c.sStart)]); });
console.log(JSON.stringify(s));
await game.close();
