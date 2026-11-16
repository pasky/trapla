// Crossing works (model 19) close up: side roads regraded to meet a junction approach / a bridge ramp,
// a retaining wall beside a ramp, and picking a crossing by its works. Run once on the old code with
// --before (OUT=<dir>) for the comparison pairs.
// node scripts/crossing-works-shots.mjs [--before]   (writes docs/screenshots/110…)
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const BEFORE = process.argv.includes('--before');
const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const idle = (ms = 600) => game.idle(ms);
const load = (name) => name === 'straight' ? { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }
  : JSON.parse(readFileSync(`scripts/${name}-design.json`, 'utf8')).design;
// [file number, design, crossed way, camera centre (the same before and after: the regraded side road /
// the wall), distance, bearing, elevation, label]
const scenes = [
  [110, 'straight', 2180, [11880, 17823], 260, 200, 50, 'junction-street-tie'],
  [112, 'direct-80', 5189, [11998, 17159], 110, 150, 35, 'ramp-wall'],
  [114, 'demo', 1975, [9840, 8528], 170, 20, 45, 'junction-street-tie-demo'],
];
try {
  await game.open('scenario=d11'); await idle();
  for (const [number, name, roadId, [x, y], dist, bearing, elev, label] of scenes) {
    await page.evaluate(d => window.trapla.setDesign(d), load(name)); await idle();
    const c = await page.evaluate(([id, x, y, dist, bearing, elev]) => {
      const r = window.trapla.result(), c = r.crossings.find(c => c.roadId === id);
      if (!c) return null;
      window.trapla.select(null); window.trapla.setView({ contours: true });
      window.trapla.lookAt(x, y, dist, bearing, elev);
      return { type: c.type, cls: c.cls, cost: c.cost, tie: c.tieLength, wall: c.wallLength, ties: c.geometry?.ties?.length ?? 0 };
    }, [roadId, x, y, dist, bearing, elev]);
    assert(c, `${name} crosses way ${roadId}`);
    if (!BEFORE) assert(c.tie > 0, `${name} way ${roadId} regrades a side road`);
    await idle(); await page.mouse.move(5, 5);
    const path = `${out}/${number + (BEFORE ? 0 : 1)}-crossing-works-${BEFORE ? 'before' : 'after'}-${label}.png`;
    await page.screenshot({ path }); console.log(path, JSON.stringify(c));
  }
  if (!BEFORE) {
    // Picking: a click on a reroute link, far from where the road crossed ours, opens the crossing's card.
    await page.evaluate(d => window.trapla.setDesign(d), load('demo')); await idle();
    const target = await page.evaluate(() => {
      const r = window.trapla.result(), c = r.crossings.find(c => c.type === 'reconnection' && c.cls !== 'track' && (c.linkLength ?? 0) > 150);
      const link = c.geometry.links.find(l => l.length > 4), q = link[Math.floor(link.length * 0.7)];
      window.trapla.lookAt(q.x, q.y, 420, 30, 55);
      return { roadId: c.roadId, x: q.x, y: q.y, z: q.z };
    });
    await idle();
    const box = await page.locator('#view').boundingBox(), p = await page.evaluate(t => window.trapla.project(t.x, t.y, t.z), target);
    await page.mouse.move(box.x + p.sx, box.y + p.sy); await page.waitForTimeout(300);
    await page.mouse.click(box.x + p.sx, box.y + p.sy); await idle();
    const sel = await page.evaluate(() => window.trapla.selection());
    assert.equal(sel?.kind, 'crossing'); assert.equal(sel.roadId, target.roadId);
    await page.mouse.move(box.x + p.sx, box.y + p.sy); await page.waitForTimeout(300);
    const path = `${out}/116-crossing-pick-link.png`;
    await page.screenshot({ path }); console.log(path, JSON.stringify(target));
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
