// Shots of one look for every house the project takes (bought out: a magenta box with a ring on the map, a
// diamond far away), wherever it stands: the D11 house under the bridge end's cone at km 4.07 in the normal,
// noise, photo and plan views, a noise buyout, the Královec railway starter's houses under its works.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/buyout-look-shots.mjs [--out docs/screenshots] [--first 520]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-buyout-look-shots');
let number = Number(arg('--first', 520));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ root: process.cwd(), viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
const look = (s, dist, bearing, elev, lat = 0) => T(([s, d, b, e, lat]) => {
  const r = window.trapla.result(), i = Math.round(s / r.ds), l = Math.hypot(r.tx[i], r.ty[i]);
  window.trapla.lookAt(r.x[i] - r.ty[i] / l * lat, r.y[i] + r.tx[i] / l * lat, d, b, e);
}, [s, dist, bearing, elev, lat]);
const card = async () => (await page.locator('#inspector').innerText()).slice(0, 400).replace(/\n+/g, ' | ');
try {
  await game.open('scenario=d11'); await park();
  const legend = await page.locator('#legend').innerText();
  console.log('LEGEND', legend.replace(/\n/g, ' '));
  assert.ok(!/demolish/i.test(legend) && /bought out/.test(legend), 'one legend entry: bought out');
  // 1. the house under the cone in front of the bridge end, km 4.07
  const cone = await T(() => window.trapla.result().demolished.find(d => d.j === 11400) ?? null);
  assert.ok(cone?.cone, 'the house under the km 4.07 cone is taken');
  assert.ok(await T(() => window.trapla.buildingTaken(11400)), 'and drawn bought out');
  await T(() => window.trapla.selectBuilding(11400)); await game.idle();
  const c1 = await card(); console.log('CARD 11400', c1);
  assert.match(c1, /Bought out/); assert.match(c1, /Under the fill in front of our bridge's end/); assert.doesNotMatch(c1, /demolish/i);
  await look(4060, 120, 300, 35, -25);
  await shot('d11-km-4-07-house-under-a-cone-bought-out');
  await T(() => window.trapla.setView({ noise: true })); await shot('d11-km-4-07-noise-view');
  await T(() => window.trapla.setView({ noise: false, photo: true })); await shot('d11-km-4-07-photo');
  await T(() => window.trapla.setView({ photo: false })); await look(4060, 220, 0, 89, -25); await shot('d11-km-4-07-plan');
  // 2. a noise buyout
  const noise = await T(() => { const r = window.trapla.result(), b = r.boughtOut.find(p => p.reason !== 'manual'); return b ? { j: b.j, s: r.s[b.i] } : null; });
  assert.ok(noise, 'D11 has a noise buyout');
  await T(j => window.trapla.selectBuilding(j), noise.j); await game.idle();
  const c2 = await card(); console.log('CARD noise', noise.j, c2); assert.match(c2, /Bought out/);
  await look(noise.s, 200, 300, 40); await shot('d11-noise-buyout');
  // 3. the Královec railway starter: houses under its works and off them, one look; far away, diamonds
  await game.open('scenario=d11&preset=d11-rail-kralovec'); await park();
  const rail = await T(() => { const r = window.trapla.result(); return { under: r.demolished.map(b => ({ j: b.j, s: r.s[b.i] })), off: r.boughtOut.length }; });
  console.log('KRÁLOVEC', rail.under.length, 'under the works,', rail.off, 'off them');
  assert.ok(rail.under.length > 0, 'the railway takes houses');
  assert.deepEqual(await T(list => list.filter(j => !window.trapla.buildingTaken(j)), rail.under.map(b => b.j)), [], 'all drawn bought out');
  await T(j => window.trapla.selectBuilding(j), rail.under[0].j); await game.idle();
  const c3 = await card(); console.log('CARD rail', c3); assert.match(c3, /Bought out/);
  await look(rail.under[0].s, 220, 300, 40); await shot('kralovec-railway-houses-bought-out');
  await T(() => window.trapla.select(null)); await look(rail.under[0].s, 4000, 300, 60); await shot('kralovec-railway-far');
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
