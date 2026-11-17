// Select before drag (the owner's review 2026-11-17: random presses while panning bent the road): a road not
// selected answers a hover with "click to select" and a drag on it moves the map; a click selects it (its bend
// handles show) and a drag then bends it; a mapped road the same. Real mouse; asserts what it shows.
//   node scripts/select-shots.mjs [--gpu] [--docs]   (--docs: docs/screenshots/380…385, else /tmp/trapla-select)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const docs = process.argv.includes('--docs'), out = docs ? 'docs/screenshots' : '/tmp/trapla-select';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1440, height: 900 } });
try {
  const { page, idle, still, errors } = game;
  const T = (f, a) => page.evaluate(f, a);
  const shot = (n, name) => page.screenshot({ path: `${out}/${n}-${name}.png` });
  const label = () => T(() => document.querySelector('.hover-dot')?.textContent ?? '');
  const cursor = () => T(() => document.querySelector('#view canvas').style.cursor);
  const camera = () => T(() => JSON.stringify(window.trapla.cameraTarget()));
  const hover = async (p) => { await page.mouse.move(p.x - 2, p.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(300); };
  const drag = async (p, dx, dy) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + dx, p.y + dy, { steps: 12 }); await page.mouse.up(); await idle(); };

  // 1. the intro: a first-time player finds our road selected; the intro says to click it, then drag it
  await game.open('scenario=d11', { intro: true });
  const view = await page.locator('#view').boundingBox();
  const roadAt = async (f) => { const q = await T((f) => window.trapla.roadScreen(window.trapla.result().length * f), f); return { x: view.x + q.sx, y: view.y + q.sy }; };
  assert.match(await page.locator('#intro').textContent(), /Click the orange road, then drag it to bend it/);
  assert.equal(await T(() => window.trapla.roadSelected()), true, 'with the intro up our road starts selected');
  await shot(380, 'select-intro');

  // 2. a returning player: our road not selected, no bend handles; over it "click to select"; a drag there moves the map
  await game.open('scenario=d11');
  let p = await roadAt(0.4);
  assert.equal(await T(() => window.trapla.roadSelected()), false);
  await hover(p);
  assert.equal(await cursor(), 'pointer'); assert.equal(await label(), 'click to select');
  await shot(381, 'select-road-not-selected');
  const cam = await camera();
  await drag(p, 120, 50);
  assert.notEqual(await camera(), cam, 'a drag on the road not selected moves the map');
  assert.equal((await T(() => window.trapla.getDesign())).pis.length, 0, 'and adds no bend');
  await T(() => window.trapla.resetCamera()); await still();

  // 3. a click selects it: its piece's card, "drag to bend"; a drag bends it, its bend handle shows
  p = await roadAt(0.4);
  await page.mouse.click(p.x, p.y); await idle();
  await hover(p);
  assert.equal(await cursor(), 'grab'); assert.equal(await label(), 'drag to bend');
  await shot(382, 'select-road-selected');
  await drag(p, 40, 15);
  assert.equal((await T(() => window.trapla.getDesign())).pis.length, 1, 'selected, a drag adds a bend');
  await game.park(); await idle();
  await shot(383, 'select-road-bent');
  // Esc lets go: the bend handle goes, the card says how to bend it again
  await page.keyboard.press('Escape'); await idle();
  assert.equal(await page.locator('.pi').first().isHidden(), true);
  assert.match(await page.locator('#inspector').textContent(), /Click the road, then drag it to bend it/);

  // 4. a mapped road: "click to select", a drag moves the map; selected, its stretch highlighted, "drag to change"
  await T(() => window.trapla.whenTransport());
  // a rebuildable road near ours, at a place on the map (its middle, else a bit off it)
  let road = null, s = 0;
  for (const b of (await T(() => window.trapla.baseRoads(400))).filter((b) => b.rebuildable && b.clear > 200 && b.clear < 2000)) {
    for (const f of [0.5, 0.4, 0.6, 0.3]) if (await T(([id, s]) => window.trapla.sourcePoint(id, s), [b.id, b.length * f])) { road = b; s = b.length * f; break; }
    if (road) break;
  }
  assert(road, 'a mapped road to select');
  const look = async () => { await T(([id, s]) => window.trapla.lookAtSource(id, s, 900), [road.id, s]); await still(); const q = await T(([id, s]) => window.trapla.sourceScreen(id, s), [road.id, s]); return { x: view.x + q.sx, y: view.y + q.sy }; };
  p = await look();
  await hover(p);
  assert.equal(await cursor(), 'pointer'); assert.equal(await label(), 'click to select');
  await shot(384, 'select-mapped-not-selected');
  const cam2 = await camera();
  await drag(p, 40, -30);
  assert.notEqual(await camera(), cam2, 'a drag on a mapped road not selected moves the map');
  assert.equal((await T(() => window.trapla.getProject())).routes.length, 1, 'and rebuilds nothing');
  p = await look();
  await page.mouse.click(p.x, p.y); await page.locator('#inspector.k-source').waitFor({ timeout: 5000 });
  await hover(p);
  assert.equal(await cursor(), 'grab'); assert.equal(await label(), 'drag to change');
  await shot(385, 'select-mapped-selected');
  await drag(p, 40, -30);
  assert.equal((await T(() => window.trapla.getProject())).routes.length, 2, 'selected, a drag rebuilds its stretch');
  assert.equal(await T(() => window.trapla.roadSelected()), true, 'the rebuilt road is selected');
  // Undo takes the rebuilt road away: our road is active again, but not selected (a drag on it moves the map)
  await page.locator('#undo').click(); await idle();
  assert.equal((await T(() => window.trapla.getProject())).routes.length, 1);
  assert.equal(await T(() => window.trapla.roadSelected()), false, 'after Undo removed the selected road, ours is not selected');
  await T(() => window.trapla.resetCamera()); await still();
  p = await roadAt(0.6);
  const pis = JSON.stringify((await T(() => window.trapla.getDesign())).pis), cam3 = await camera();
  await drag(p, 60, 30);
  assert.notEqual(await camera(), cam3, 'a drag on our road then moves the map');
  assert.equal(JSON.stringify((await T(() => window.trapla.getDesign())).pis), pis, 'and bends nothing');
  assert.deepEqual(errors, []);
  console.log(`select before drag: our road and ${road.name} — not selected a drag moves the map, a click selects, then a drag edits`);
} finally { await game.close(); }
