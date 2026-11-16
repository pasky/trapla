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
// [file number, design, what the scene shows, the way that showed it when the scene was last looked at (it is
// taken while it still does, else the first crossing of the design that does; --before: that way as the older
// code builds it), distance, bearing, elevation, label]. The camera looks at the regraded side road / the wall.
const SHOWS = {
  'junction-tie': 'a side road regraded to meet a junction approach',
  'ramp-tie': 'a side road regraded to meet the ramp of a bridge over us',
  wall: 'a retaining wall beside a crossing\'s works',
};
const scenes = [
  [110, 'straight', 'junction-tie', 2180, 260, 200, 50, 'junction-street-tie'],
  [112, 'direct-80', 'ramp-tie', 1158, 200, 150, 35, 'ramp-wall'],
  [114, 'demo', 'wall', 2136, 170, 20, 45, 'junction-street-tie-demo'],
];
try {
  await game.open('scenario=d11'); await idle();
  for (const [number, name, shows, roadId, dist, bearing, elev, label] of scenes) {
    await page.evaluate(d => window.trapla.setDesign(d), load(name)); await idle();
    const c = await page.evaluate(([shows, id, before, dist, bearing, elev]) => {
      const r = window.trapla.result();
      const has = (c) => shows === 'wall' ? c.wallLength > 0 : c.tieLength > 0 && (c.type === 'junction') === (shows === 'junction-tie');
      const c = before ? r.crossings.find(c => c.roadId === id) : r.crossings.find(c => c.roadId === id && has(c)) ?? r.crossings.find(has);
      if (!c) return null;
      // the works to look at: the first walled point (of the rebuilt way, then of the regraded side roads), else
      // the middle of the first regraded side road, else the crossing
      const g = c.geometry, tie = g?.ties?.[0]?.path, walled = [...(g?.road ?? []), ...(g?.ties ?? []).flatMap(t => t.path)].find(p => p.wall?.some(h => h > 0));
      const at = (shows === 'wall' ? walled : undefined) ?? tie?.[tie.length >> 1] ?? c;
      window.trapla.select(null); window.trapla.setView({ contours: true });
      window.trapla.lookAt(at.x, at.y, dist, bearing, elev);
      return { roadId: c.roadId, s: c.s, type: c.type, cls: c.cls, cost: c.cost, tie: c.tieLength, wall: c.wallLength, ties: g?.ties?.length ?? 0 };
    }, [shows, roadId, BEFORE, dist, bearing, elev]);
    assert(c, BEFORE ? `${name} crosses way ${roadId}` : `${name} has ${SHOWS[shows]}`);
    await idle(); await game.park();
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
