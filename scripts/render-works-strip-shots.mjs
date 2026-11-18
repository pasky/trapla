// Shots of the two fixes in PLAN.md "Other ways' works keep the working strip; a lifted kept road on its old line":
// the houses 0.2–0.3 m from the toe of road II/2253's ramps on its bridge over the Královec railway (km 12.98), now bought
// out with the strip, and road III/3012's corner kept on its old road, lifted onto its bridge over us ("Its bridge over
// us"): the piece rebuilt for it was 5.7 m off the old road our road crossed. docs/screenshots/510–513 are the
// before | after pairs of these.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/render-works-strip-shots.mjs [--out docs/screenshots] [--first 510]
//   [--root <older checkout> --before]: the same views on an older checkout, without the checks
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-render-works-strip-shots'), before = process.argv.includes('--before'), tag = before ? 'before' : 'after';
let number = Number(arg('--first', 510));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ root: arg('--root', process.cwd()), viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const check = (ok, what) => { if (!before) assert.ok(ok, what); };
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}-${tag}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
try {
  // 1. Královec railway km 12.98: road II/2253 carried over us; the houses beside its ramps' toes
  await game.open('scenario=d11&preset=d11-rail-kralovec'); await park();
  const over = await T(() => { const r = window.trapla.result(), c = r.crossings.find(c => c.type === 'overbridge' && Math.abs(c.s - 12980) < 30);
    return c && { x: c.x, y: c.y, houses: c.houses ?? [], cost: c.cost, total: r.cost.total }; });
  console.log('km 12.98', JSON.stringify(over));
  check(over && [25298, 25311, 25315].every(j => over.houses.includes(j)), 'the houses within the strip of the ramps are bought out');
  await T(([x, y]) => window.trapla.lookAt(x, y, 170, 200, 40), [over.x, over.y]);
  await shot('rail-kralovec-km-12-98-ramps-keep-the-strip');
  await T(() => window.trapla.selectBuilding(25315)); await game.idle(); await park();
  const card = await page.locator('#hud').innerText();
  console.log('CARD house 25315', card.slice(0, 300));
  check(/within 3 m of them/.test(card), 'the card says why');
  await shot('rail-kralovec-km-12-98-house-card');
  // 2. III/3012's corner kept on the old road, our crossing chosen "Its bridge over us": the piece lifted onto it
  await game.open('scenario=d11'); await park();
  await T(() => window.trapla.whenTransport());
  const design = JSON.parse(readFileSync('qa3/designs/d11-iii3012-corner-kept-on-old-road.json', 'utf8'));
  const side = design.routes[1].id;
  design.routes[0].alignment.controls.crossings = [{ choice: 'overbridge', target: { kind: 'route', routeId: side, s0: 0, s1: 0 } }];
  await T(d => window.trapla.setProject(d), design); await game.idle();
  const gap = await T((id) => {
    const res = window.trapla.projectResult(), ours = res.routes['route:legacy-mission'].legacy, held = res.routes[id].legacy;
    const c = ours.crossings.find(c => c.designed);
    let best = Infinity;
    for (let k = 1; k < held.n; k++) {
      const ax = held.x[k - 1], ay = held.y[k - 1], dx = held.x[k] - ax, dy = held.y[k] - ay, t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.y - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(c.x - ax - t * dx, c.y - ay - t * dy));
    }
    return { gap: best, x: c.x, y: c.y };
  }, side);
  console.log('III/3012 lifted', JSON.stringify(gap));
  check(gap.gap < 0.1, 'the rebuilt piece passes through our crossing point');
  await T(id => window.trapla.setActiveRoute(id), side); await game.idle(); await park();
  await T(([x, y]) => window.trapla.lookAt(x, y, 120, 300, 60), [gap.x, gap.y]);
  await shot('d11-iii3012-kept-lifted-from-above');
  await T(([x, y]) => window.trapla.lookAt(x, y, 160, 120, 25), [gap.x, gap.y]);
  await shot('d11-iii3012-kept-lifted-under-our-viaduct');
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
