// Leading a reroute elsewhere with the mouse (real events), the owner's D35 case: the track cut at km 2.51, its north
// part led by Auto to the track under our bridge at km 2.70. Drag the end of its new track onto the class III road that
// crosses over us at km 2.29 (the road lit up while it snaps), release: built there; undo / redo; the middle of the
// link still bends it; a road across ours says why on the card and keeps the choice; "Automatic" takes it back; a
// track that does not cross us at all.
// node scripts/reroute-end-shots.mjs   (writes docs/screenshots/500…509)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const T = (f, a) => page.evaluate(f, a);
const idle = (ms = 600) => game.idle(ms);
const TRACK = 1327, ROAD = 1129;
// a point on a mapped way nearest to (x, y) (the pack's road overlay)
const net = JSON.parse(readFileSync('public/scenarios/d35-full/overlays.json', 'utf8')).net;
const onWay = (way, x, y) => {
  const w = net.ways[way];
  let best = null;
  for (let j = 1; j + 3 < w.length; j += 2) {
    const ax = w[j], ay = w[j + 1], dx = w[j + 2] - ax, dy = w[j + 3] - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const q = { x: ax + t * dx, y: ay + t * dy }, d = Math.hypot(q.x - x, q.y - y);
    if (!best || d < best.d) best = { ...q, d };
  }
  return best;
};
try {
  await game.open('scenario=d35-full'); await idle();
  // the starter with a bend on the planned line at its km 2.5 (tests/link-end.test.ts), the track cut and rerouted
  await T(() => {
    const d = window.trapla.getDesign();
    d.pis.splice(1, 0, { x: 4551, y: 9449, r: null });
    d.crossingOverrides = [{ roadId: 1327, type: 'reconnection' }];
    window.trapla.setDesign(d);
  });
  await idle();
  const crossing = () => T((id) => { const c = window.trapla.result().crossings.find(c => c.roadId === id); return { cost: c.cost, length: c.linkLength, type: c.type, endTo: c.endTo,
    issues: (c.issues ?? []).map(v => v.title), links: c.geometry.links.map(l => l.length ? [l[0], l.at(-1)].map(p => ({ x: p.x, y: p.y })) : null) }; }, TRACK);
  const card = () => T(() => document.querySelector('#inspector, .inspector, [data-inspector]')?.innerText ?? document.body.innerText.slice(0, 0));
  const auto = await crossing();
  console.log('auto', JSON.stringify(auto));
  assert.equal(auto.type, 'diversion');
  await T(() => { window.trapla.setView({ photo: true, contours: false }); window.trapla.selectCrossing(1327); window.trapla.lookAt(4360, 9470, 700, 0, 50); });
  await idle(); await game.still();
  const box = await page.locator('#view').boundingBox();
  const ground = async (x, y) => { const p = await T(([x, y]) => window.trapla.groundScreen(x, y), [x, y]); return { x: box.x + p.sx, y: box.y + p.sy }; };
  const handle = async (side) => { const b = await page.locator(`.via.via-end[data-side="${side}"]`).boundingBox(); assert(b, `end handle ${side}`); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  await page.screenshot({ path: `${out}/500-reroute-end-auto.png` });
  // drag the north part's end over open ground (nothing lit), then onto the class III road (lit up)
  const h = await handle(1), field = await ground(4360, 9560), road = await (async () => { const q = onWay(ROAD, 4200, 9455); return ground(q.x, q.y); })();
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(h.x + (field.x - h.x) * k / 12, h.y + (field.y - h.y) * k / 12);
  await page.waitForTimeout(80);
  assert.equal(await T(() => document.querySelector('.link-preview .end-snap').getAttribute('points')), '');
  await page.screenshot({ path: `${out}/501-reroute-end-drag-field.png` });
  for (let k = 1; k <= 8; k++) await page.mouse.move(field.x + (road.x - field.x) * k / 8, field.y + (road.y - field.y) * k / 8);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/502-reroute-end-snap.png` });
  assert.notEqual(await T(() => document.querySelector('.link-preview .end-snap').getAttribute('points')), '');
  await page.mouse.up(); await idle(800);
  const led = await crossing(), design = await T((id) => window.trapla.getDesign().crossingOverrides.find(o => o.roadId === id), TRACK);
  console.log('led', JSON.stringify(led), JSON.stringify(design));
  assert.equal(design.ends[1].way, ROAD); assert.equal(led.endTo[1].built, true); assert.deepEqual(led.issues, []);
  const labels = await T(() => window.trapla.undoLabels());
  console.log('undo', JSON.stringify(labels));
  assert.equal(labels.undo, 'where a reroute leads');
  await game.park();
  await page.screenshot({ path: `${out}/503-reroute-end-led.png` });
  // undo: back to Auto's target; redo: led again
  await page.keyboard.press('Control+z'); await idle(800);
  assert.equal((await crossing()).endTo, undefined);
  await page.screenshot({ path: `${out}/504-reroute-end-undo.png` });
  await page.keyboard.press('Control+y'); await idle(800);
  if ((await crossing()).endTo === undefined) { await page.keyboard.press('Control+Shift+z'); await idle(800); }
  assert.equal((await crossing()).endTo?.[1]?.built, true);
  // the middle of the new track still bends it (a bend point there); its end stays on the road chosen
  const mid = await T((id) => { const l = window.trapla.result().crossings.find(c => c.roadId === id).geometry.links[1]; return l[Math.floor(l.length / 2)]; }, TRACK);
  const m0 = await ground(mid.x, mid.y), m1 = await ground(mid.x + 10, mid.y + 45);
  await page.mouse.move(m0.x, m0.y); await page.waitForTimeout(200); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(m0.x + (m1.x - m0.x) * k / 10, m0.y + (m1.y - m0.y) * k / 10);
  await page.mouse.up(); await idle(800);
  const bent = await T((id) => window.trapla.getDesign().crossingOverrides.find(o => o.roadId === id), TRACK);
  console.log('bent', JSON.stringify(bent));
  assert(bent.via?.[1]?.length > 0); assert.equal(bent.ends[1].way, ROAD);
  await game.park();
  await page.screenshot({ path: `${out}/505-reroute-end-bent.png` });
  // the end dragged onto a street wholly south of our road: across ours, the card says so, the choice stays
  const h2 = await handle(1), across = await (async () => { const q = onWay(1498, 4600, 9195); return ground(q.x, q.y); })();
  await page.mouse.move(h2.x, h2.y); await page.mouse.down();
  for (let k = 1; k <= 14; k++) await page.mouse.move(h2.x + (across.x - h2.x) * k / 14, h2.y + (across.y - h2.y) * k / 14);
  await page.mouse.up(); await idle(800);
  const wrong = await crossing();
  console.log('across', JSON.stringify(wrong));
  assert.deepEqual(wrong.issues, ['The road you chose is across our road']); assert.equal(wrong.endTo[1].built, false);
  await game.park();
  await page.screenshot({ path: `${out}/506-reroute-end-across.png` });
  // "Automatic" (the problem's button) takes it back to where Auto leads it
  await page.locator('button[data-fix-crossing-end]').first().click(); await idle(800);
  const back = await crossing();
  assert.equal(back.endTo, undefined); assert.deepEqual(back.issues, []);
  await game.park();
  await page.screenshot({ path: `${out}/507-reroute-end-automatic.png` });
  // a track that does not cross our road at all, north of it
  await T(() => window.trapla.lookAt(4600, 9800, 1100, 0, 55)); await idle(); await game.still();
  const h3 = await handle(1), farm = await (async () => { const q = onWay(1497, 4745, 10185); return ground(q.x, q.y); })();
  await page.mouse.move(h3.x, h3.y); await page.mouse.down();
  for (let k = 1; k <= 16; k++) await page.mouse.move(h3.x + (farm.x - h3.x) * k / 16, h3.y + (farm.y - h3.y) * k / 16);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/508-reroute-end-snap-track.png` });
  await page.mouse.up(); await idle(800);
  const far = await crossing();
  console.log('track', JSON.stringify(far));
  assert.equal(far.endTo[1].built, true); assert.equal(far.endTo[1].s, undefined);
  await game.park();
  await page.screenshot({ path: `${out}/509-reroute-end-track.png` });
  console.log('card', (await card()).slice(0, 400));
  assert.deepEqual(errors, []);
} finally { await game.close(); }
