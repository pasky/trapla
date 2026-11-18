// The owner's D11 km 17.67 case (2026-11-18): the service road to a hamlet east of our road (the saved best design
// with its bend near km 17.6 moved 60 m east, so our road crosses the service road there). Auto keeps the hamlet's
// way across (an underpass; its traffic would go round more than 1.5 km, research/86); the player's "Cut it" cannot
// lead it to a crossing (a railway on the ground in the way), so it is closed and the card says how far round, which
// road each part still reaches, and the map lights each part to that road with a bar where it ends. Then a part's end
// (the hamlet's) dragged onto road I/16 south of the hamlet leads it there by a new road (north, a railway on the
// ground keeps every new road from the crossings there; the west part's ground is too steep for one).
// Then D35 full km 22.08: a farm's track that Auto buys out rather than carry it over the motorway on a bridge.
// node scripts/cut-card-shots.mjs   (writes docs/screenshots/530…537)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const T = (f, a) => page.evaluate(f, a);
const idle = (ms = 600) => game.idle(ms);
const SERVICE = 5531, ROAD = 2243;
const design = JSON.parse(readFileSync('scripts/best-design.json', 'utf8')).design;
design.pis[14].x += 60;
try {
  await game.open('scenario=d11'); await idle();
  await T((d) => window.trapla.setDesign(d), design); await idle(1500);
  const crossing = () => T((id) => { const c = window.trapla.result().crossings.find(c => c.roadId === id); return { s: c.s, type: c.type, cost: c.cost, length: c.linkLength, closure: c.closure && { ...c.closure, reach: c.closure.reach?.map(r => r && { cls: r.cls, n: r.path.length }) },
    endTo: c.endTo, far: c.farClosure, issues: (c.issues ?? []).map(v => v.title) }; }, SERVICE);
  const card = () => T(() => document.querySelector('#inspector')?.innerText ?? '');
  const auto = await crossing();
  console.log('auto', JSON.stringify(auto));
  assert.equal(auto.type, 'underpass');
  await T((id) => { window.trapla.setView({ photo: true, contours: false }); window.trapla.selectCrossing(id); window.trapla.lookAt(11540, 18330, 700, 0, 50); }, SERVICE);
  await idle(); await game.still();
  await page.screenshot({ path: `${out}/530-cut-hamlet-auto.png` });
  // the player's "Cut it"
  await page.locator('#inspector button', { hasText: 'Cut it' }).click(); await idle(1500); await game.still();
  const cut = await crossing(), text = await card();
  console.log('cut', JSON.stringify(cut)); console.log('card', text);
  assert.equal(cut.type, 'reconnection'); assert.equal(cut.far, true);
  // (the houses it serves left going round further: a problem, its fix what Auto builds)
  assert.deepEqual(cut.issues, ['Houses cut off from the road']); assert.match(text, /Back to Auto: an underpass, 25 M CZK/);
  assert.match(text, /Cut · no new road needed/); assert.match(text, /still reaches/); assert.match(text, /way round/);
  assert.doesNotMatch(text, /level today|Cut and reroute/);
  assert.equal(await page.locator('#inspector button.on', { hasText: 'Cut it' }).count(), 1);
  const lit = await T(() => [...document.querySelectorAll('svg.crossing-works path.piece')].filter(p => p.getAttribute('d')).length);
  const bars = await T(() => [...document.querySelectorAll('svg.crossing-works path.piece-end')].filter(p => p.getAttribute('d')).length);
  assert.equal(lit, 2); assert.equal(bars, 2);
  await game.park();
  await page.screenshot({ path: `${out}/531-cut-hamlet-closed.png` });
  // further out: where each part meets the road it still reaches
  await T(() => window.trapla.lookAt(11400, 18200, 1500, 0, 60)); await idle(); await game.still(); await game.park();
  await page.screenshot({ path: `${out}/532-cut-hamlet-parts.png` });
  // close up on the ends: nothing drawn into our slope
  await T(() => window.trapla.lookAt(11520, 18275, 180, 30, 45)); await idle(); await game.still(); await game.park();
  await page.screenshot({ path: `${out}/533-cut-hamlet-ends.png` });
  // drag the east part's end onto road I/16 south of the hamlet: led there by a new road
  await T(() => window.trapla.lookAt(11640, 18200, 800, 0, 55)); await idle(); await game.still();
  const box = await page.locator('#view').boundingBox();
  const ground = async (x, y) => { const p = await T(([x, y]) => window.trapla.groundScreen(x, y), [x, y]); return { x: box.x + p.sx, y: box.y + p.sy }; };
  const side = cut.closure.sides.indexOf('east');
  const hb = await page.locator(`.via.via-end[data-side="${side}"]`).boundingBox();
  assert(hb, 'the end handle of the east part');
  const h = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, to = await ground(11780, 18122);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let k = 1; k <= 16; k++) await page.mouse.move(h.x + (to.x - h.x) * k / 16, h.y + (to.y - h.y) * k / 16);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/534-cut-hamlet-end-drag.png` });
  await page.mouse.up(); await idle(1500); await game.still();
  const led = await crossing(), ov = await T((id) => window.trapla.getDesign().crossingOverrides.find(o => o.roadId === id), SERVICE);
  console.log('led', JSON.stringify(led), JSON.stringify(ov)); console.log('card', await card());
  assert.equal(ov.ends[side].way, ROAD); assert.equal(led.endTo?.[side]?.built, true); assert.deepEqual(led.issues, []);
  await game.park();
  await page.screenshot({ path: `${out}/535-cut-hamlet-end-led.png` });
  // D35 full km 22.08: the farm's track, its buildings bought out (cheaper than its bridge over the motorway)
  await game.open('scenario=d35-full'); await idle(2500);
  const FARM = 3946;
  const farm = await T((id) => { const c = window.trapla.result().crossings.find(c => c.roadId === id); return { s: c.s, x: c.x, y: c.y, type: c.type, cost: c.cost, buyout: c.buyout, houses: c.houses, issues: (c.issues ?? []).map(v => v.title) }; }, FARM);
  console.log('farm', JSON.stringify(farm));
  assert(farm.buyout?.instead, 'the farm bought out'); assert.deepEqual(farm.issues, []);
  await T(([id, x, y]) => { window.trapla.setView({ photo: true, contours: false }); window.trapla.selectCrossing(id); window.trapla.lookAt(x, y, 600, 0, 50); }, [FARM, farm.x, farm.y]);
  await idle(); await game.still(); await game.park();
  const farmCard = await card(); console.log('card', farmCard);
  assert.match(farmCard, /Cheaper to buy out than to keep its access/);
  await page.screenshot({ path: `${out}/536-cut-farm-bought-out.png` });
  // (the farm, 800 m east of the crossing: bought out, drawn as such)
  await T((j) => { window.trapla.selectBuilding(j); window.trapla.lookAt(24310, 7490, 450, 0, 50); }, farm.houses.at(-1)); await idle(); await game.still(); await game.park();
  const houseCard = await card(); console.log('building', houseCard);
  assert.match(houseCard, /buying it out costs less than keeping that way across/);
  await page.screenshot({ path: `${out}/537-cut-farm-building.png` });
  assert.deepEqual(errors, []);
} finally { await game.close(); }
