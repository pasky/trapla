// Shaping a reroute with the mouse (real events): the shape line following the drag, the rebuilt road
// with its bend point and the card's "Automatic path", and a shape the game rejects.
// node scripts/link-shape-shots.mjs   (writes docs/screenshots/117…119)
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const T = (f, a) => page.evaluate(f, a);
const idle = (ms = 600) => game.idle(ms);
try {
  await game.open('scenario=d11'); await idle();
  await T(d => window.trapla.setDesign(d), JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design); await idle();
  // a road of the demo that is cut and reconnected along ours (not a track; the longest such new road)
  const link = await T(() => {
    const r = window.trapla.result(), c = r.crossings.filter(c => c.type === 'reconnection' && c.cls !== 'track' && !c.moved && c.geometry?.links?.some(l => l.length > 6))
      .sort((a, b) => (b.linkLength ?? 0) - (a.linkLength ?? 0))[0];
    if (!c) return null;
    const l = c.geometry.links.find(l => l.length > 6), q = l[Math.floor(l.length * 0.45)];
    window.trapla.setView({ contours: true }); window.trapla.lookAt(q.x, q.y, 520, 20, 55);
    // away from our road: from its nearest station towards the link
    let best = 0; for (let i = 0; i < r.n; i++) if (Math.hypot(r.x[i] - q.x, r.y[i] - q.y) < Math.hypot(r.x[best] - q.x, r.y[best] - q.y)) best = i;
    return { roadId: c.roadId, x: q.x, y: q.y, z: q.z, cost: c.cost, length: c.linkLength, road: { x: r.x[best], y: r.y[best], z: r.grade[best] }, path: l.map(p => ({ x: p.x, y: p.y })) };
  });
  await idle();
  const box = await page.locator('#view').boundingBox();
  const at = async (q) => { const p = await T(q => window.trapla.project(q.x, q.y, q.z), q); return { x: box.x + p.sx, y: box.y + p.sy }; };
  const p0 = await at(link), r0 = await at(link.road), len = Math.hypot(p0.x - r0.x, p0.y - r0.y) || 1;
  const ux = (p0.x - r0.x) / len, uy = (p0.y - r0.y) / len;
  await page.mouse.move(p0.x, p0.y); await page.waitForTimeout(300);
  assert.equal(await T(() => document.querySelector('#view canvas').style.cursor), 'grab');
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(p0.x + ux * 3.5 * k, p0.y + uy * 3.5 * k);
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${out}/117-link-shape-drag.png` });
  await page.mouse.up(); await idle(800);
  const shaped = await T((id) => { const d = window.trapla.getDesign(), c = window.trapla.result().crossings.find(c => c.roadId === id); return { via: d.crossingOverrides.find(o => o.roadId === id)?.via, cost: c.cost, length: c.linkLength, issues: (c.issues ?? []).map(v => v.title) }; }, link.roadId);
  assert(shaped.via.flat().length > 1); assert.deepEqual(shaped.issues, []);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${out}/118-link-shape-built.png` });
  console.log('shaped', JSON.stringify({ before: { cost: link.cost, length: link.length }, after: { cost: shaped.cost, length: shaped.length, bends: shaped.via.flat().length } }));
  // drag the bend point onto our road (the nearest place on its axis): the game says so, with the way back in the card
  // the bend point the drag made: the one farthest from the automatic path
  const off = (v) => Math.min(...link.path.slice(1).map((b, i) => { const a = link.path[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(v.x - a.x - t * dx, v.y - a.y - t * dy); }));
  const via = shaped.via.flat().reduce((a, v) => (off(v) > off(a) ? v : a)), h = await at({ ...via, z: await T(v => window.trapla.groundHeight(v.x, v.y), via) });
  const road = await T(v => { const r = window.trapla.result(); let near = 0; for (let i = 0; i < r.n; i++) if (Math.hypot(r.x[i] - v.x, r.y[i] - v.y) < Math.hypot(r.x[near] - v.x, r.y[near] - v.y)) near = i; return window.trapla.roadScreen(r.s[near]); }, via);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(h.x + (box.x + road.sx - h.x) * k / 10, h.y + (box.y + road.sy - h.y) * k / 10);
  await page.mouse.up(); await idle(800);
  const bad = await T((id) => (window.trapla.result().crossings.find(c => c.roadId === id).issues ?? []).map(v => v.title), link.roadId);
  console.log('rejected', JSON.stringify(bad));
  assert(bad.length > 0);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${out}/119-link-shape-rejected.png` });
  assert.deepEqual(errors, []);
} finally { await game.close(); }
