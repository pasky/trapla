// Shots of the sweep-3 P2s fixed together (PLAN.md "Portals, cones over houses, side roads of a rebuilt road"):
// the D3 0304 tunnel portal seen from the hill above (thin lines had poked out of it), a house under a bridge end's
// cone (now bought out), a road moved aside through a building (now bought out), road III/3012 dragged 23 m (the
// field track that joined it now joins the new line). docs/screenshots/450–453 are the before | after pairs of these.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/render-cones-shots.mjs [--out docs/screenshots] [--first 450]
//   [--root <older checkout> --before]: the same views on an older checkout, without the checks
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-render-cones-shots'), before = process.argv.includes('--before'), tag = before ? 'before' : 'after';
let number = Number(arg('--first', 450));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ root: arg('--root', process.cwd()), viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const check = (ok, what) => { if (!before) assert.ok(ok, what); };
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}-${tag}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
/** look at chainage s of the current result from `dist` m, bearing and elevation in degrees, `lat` m to its left */
const look = (s, dist, bearing, elev, lat = 0) => T(([s, d, b, e, lat]) => {
  const r = window.trapla.result(), i = Math.round(s / r.ds), l = Math.hypot(r.tx[i], r.ty[i]);
  window.trapla.lookAt(r.x[i] - r.ty[i] / l * lat, r.y[i] + r.tx[i] / l * lat, d, b, e);
}, [s, dist, bearing, elev, lat]);
try {
  // 1. D3 0304: the tunnel's far portal (km 1.59) from the hill above it, looking back at the approach cut
  await game.open('scenario=d3-0304'); await park();
  const tunnel = await T(() => window.trapla.result().runs.find(r => r.kind === 2));
  await look(tunnel.s1 - 10, 45, 180, 35);
  await shot('d3-0304-portal-from-the-hill');
  // 2. D11 straight start, km 4.07: the house beside the bridge end under its cone
  await game.open('scenario=d11'); await park();
  const cone = await T(() => window.trapla.result().demolished.find(d => d.j === 11400) ?? null);
  check(cone?.cone, 'the house under the km 4.07 cone is demolished');
  await T(() => window.trapla.selectBuilding(11400)); await game.idle();
  const card = await page.locator('#hud').innerText();
  console.log('CARD house 11400', card.slice(0, 300));
  check(/Under the fill in front of our bridge's end/.test(card), 'the card says why');
  await look(4060, 120, 300, 35, -25);
  await shot('d11-km-4-07-house-under-a-cone');
  // 3. the demo design: the service road moved aside at km 6.93 runs through a farm building
  await T(d => window.trapla.setDesign(d), JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design); await game.idle();
  check(await T(() => window.trapla.result().demolished.some(d => d.j === 22326 && d.in === 'reroute')), 'the building the moved road runs through is bought');
  await look(6935, 140, 200, 45, 20);
  await shot('d11-demo-km-6-93-road-moved-aside-through-a-building');
  // 4. road III/3012 rebuilt 23 m east of its old corner beside our road at km 2.3 (qa3/designs, as tests/qa3-sweep's
  //    drag): the field track that joined the old road there joins the new line (it had been cut with nowhere to go)
  await game.open('scenario=d11'); await park();
  await T(() => window.trapla.whenTransport());
  await T(d => window.trapla.setProject(d), JSON.parse(readFileSync('qa3/designs/d11-iii3012-dragged-23m.json', 'utf8'))); await game.idle();
  const r1 = await T(() => { const r = window.trapla.projectResult()?.routes['route:r1']?.legacy; return r && { valid: r.valid, track: r.crossings.find(c => c.cls === 'track')?.type, v: r.violations.map(v => v.title) }; });
  console.log('III/3012', JSON.stringify(r1));
  check(r1?.valid && r1.track === 'junction', 'the track joins the rebuilt road');
  await T(() => window.trapla.setActiveRoute('route:r1')); await game.idle(); await park();
  await T(() => window.trapla.lookAt(7660, 5430, 150, 250, 45));
  await shot('d11-iii3012-dragged-track-joins-it');
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
