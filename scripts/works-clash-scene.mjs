// One screen for every earthwork (owner report 2026-11-20, recurring: "we have embankment interfering with another road
// if we drag the crossing road"), played with the real mouse in Photo view:
//  1. D11 motorway km 8.39, a service road carried over us between two junctions 100 m apart: its ring slid back 40 m
//     rebuilds it there on a bridge over our road. Its ramps no longer rise from the junction nodes as fans round them:
//     each junction is raised with the ramps, the roads meeting there regraded down from it along their arms, the end's
//     fill a cone; within 30 m of each junction its grade is at most 6 %. Valid, nothing under its works.
//     `--base <checkout>`: the same slide from another checkout first (e.g. main before this change: the fans).
//  2. D11 km 15.53, road III/30022 bent (a saved edit): the link a cut track is led along keeps off our abutment's cone.
//  3. Whole I/35 km 23.13, way 5053 slid back 40 m: its fill beside the junction would bury the class I road there,
//     which nothing moves aside: a plain problem with its fix.
// node scripts/works-clash-scene.mjs [--gpu] [--docs] [--base <checkout>]   (--docs: docs/screenshots/770–776)
import { mkdirSync, readFileSync } from 'node:fs';
import { checker, startGame } from './lib/browser.mjs';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-works-clash';
const baseAt = process.argv.indexOf('--base'), baseRoot = baseAt > 0 ? process.argv[baseAt + 1] : null;
mkdirSync(out, { recursive: true });
const { ok } = checker();
const VIEW = { width: 1400, height: 900 };

/** the game at `root`, its helpers */
async function play(root) {
  const game = await startGame({ root, viewport: VIEW });
  const { page } = game;
  const T = (f, a) => page.evaluate(f, a);
  const shot = async (name, park = true) => { if (park) await game.park(); await game.frames(3); await page.screenshot({ path: `${out}/${name}.png` }); };
  const view = () => page.locator('#view').boundingBox();
  const ring = async () => { const b = await page.locator('.selected-crossing').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const drag = async (p, dx, dy, steps = 12) => {
    await page.mouse.move(p.x - 4, p.y - 3); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.waitForTimeout(250);
    await page.mouse.down();
    for (let k = 1; k <= steps; k++) { await page.mouse.move(p.x + dx * k / steps, p.y + dy * k / steps); await page.waitForTimeout(30); }
    await page.mouse.up(); await game.idle(600);
  };
  const alongRoad = async (s, along) => { const q = await T(([s, a]) => [window.trapla.roadScreen(s), window.trapla.roadScreen(s + a)], [s, along]); return { dx: q[1].sx - q[0].sx, dy: q[1].sy - q[0].sy }; };
  const crossingOf = (route, pick) => T(([route, pick]) => window.trapla.projectResult().routes[route].legacy.crossings.filter(c => eval(pick)(c))
    .map(c => ({ roadId: c.roadId, s: c.s, x: c.x, y: c.y, type: c.type, designed: !!c.designed })), [route, pick]);
  const look = async (x, y, dist, yaw = 0, pitch = 50) => { await T(([x, y, d, yw, p]) => window.trapla.lookAt(x, y, d, yw, p), [x, y, dist, yaw, pitch]); await game.idle(); await game.still(); };
  const select = async (route, roadId) => { await T(([route, roadId]) => { window.trapla.setActiveRoute(route); window.trapla.selectCrossing(roadId); }, [route, roadId]); await game.idle(); };
  const open = async (q) => { await game.open(q); await T(() => window.trapla.whenTransport()); await T(() => window.trapla.setView({ photo: true, contours: false })); };
  /** slide the crossing of mapped way `roadId` on `route` by `along` m with the mouse; the rebuilt road's id */
  const slide = async (route, roadId, along, at) => {
    const [c] = await crossingOf(route, `c => c.roadId === ${roadId}`);
    await select(route, roadId); await look(c.x, c.y, at.dist, at.yaw, at.pitch);
    const d = await alongRoad(c.s, along), had = await T(() => window.trapla.getProject().routes.map(r => r.id));
    await drag(await ring(), d.dx, d.dy);
    return { before: c, id: await T((had) => window.trapla.getProject().routes.find(r => r.source && !had.includes(r.id))?.id, had) };
  };
  return { game, page, T, shot, view, look, select, open, slide, crossingOf };
}

// the owner's case: D11 motorway km 8.39, the service road (way 4828) slid back 40 m
const M = 'route:motorway-forward', NORTH = { x: 10013, y: 10200, d: 150, yaw: -30, pitch: 35 }, EAST = { x: 10087, y: 10130, d: 150, yaw: 150, pitch: 35 };
const OVER = { x: 10045, y: 10160, d: 300, yaw: 200, pitch: 32 };
const owners = async (g) => { await g.open('scenario=d11&preset=d11-motorway'); return g.slide(M, 4828, -40, { dist: 500, yaw: 0, pitch: 50 }); };
const at = (g, v) => g.look(v.x, v.y, v.d, v.yaw, v.pitch);

if (baseRoot) {
  const g = await play(baseRoot);
  try {
    const { id } = await owners(g);
    ok(!!id, `${baseRoot}: slid, the service road is rebuilt (${id})`);
    await at(g, EAST);
    await g.shot('770-slid-crossing-before');
  } finally { await g.game.close(); }
}

const g = await play(process.cwd());
const { page, T, shot } = g;
try {
  // ---- 1. the owner's case ----
  const { before, id } = await owners(g);
  ok(before.type === 'overbridge', `D11 km ${(before.s / 1000).toFixed(2)}: the service road carried over us (${before.type})`);
  ok(!!id, `slid back 40 m with the mouse: the service road rebuilt between its junctions (${id})`);
  const r = await T((id) => {
    const res = window.trapla.projectResult(), r = res.routes[id].legacy;
    const steep = (a, b) => { let g = 0; for (let k = 1; k < r.n; k++) if (r.s[k] > a && r.s[k - 1] < b) g = Math.max(g, Math.abs(r.grade[k] - r.grade[k - 1]) / (r.s[k] - r.s[k - 1])); return g; };
    return { valid: r.valid, issues: res.issues.filter(i => i.scope.routeIds.includes(id)).map(i => i.violation.title),
      junctions: r.footprintConflicts.filter(f => f.action === 'junction').map(j => ({ ties: j.geometry?.ties?.length ?? 0, cost: j.cost })),
      cones: (r.cones ?? []).filter(c => c.end).length, ends: [steep(0, 30), steep(r.length - 30, r.length)] };
  }, id);
  ok(r.valid && r.issues.length === 0, `valid, nothing under its works (${r.issues.join(' | ') || 'no problems'})`);
  ok(r.junctions.length === 2 && r.junctions.every(j => j.ties >= 2 && j.cost > 0),
    `both junctions raised with its ramps, the roads there regraded down along their arms (${r.junctions.map(j => `${j.ties} ties, ${(j.cost / 1e6).toFixed(2)} M`).join('; ')})`);
  ok(r.cones === 2, `the fill at each end a cone round it (${r.cones})`);
  ok(r.ends.every(x => x <= 0.06 + 1e-9), `within 30 m of each junction at most 6 % (${r.ends.map(x => (100 * x).toFixed(1) + ' %').join(', ')})`);
  await at(g, EAST);
  await shot('771-slid-crossing-east-junction');
  await at(g, NORTH);
  await shot('772-slid-crossing-north-junction');
  await at(g, OVER);
  await shot('773-slid-crossing-both-junctions');
  // our road's card of it
  const [slid] = await g.crossingOf(M, 'c => c.designed && c.s > 8200 && c.s < 8600');
  ok(!!slid, `it crosses at km ${(slid?.s / 1000).toFixed(2)} (${slid?.type})`);
  await g.select(M, slid.roadId); await g.look(slid.x, slid.y, 380, 20, 45);
  const card = await page.locator('.inspector').innerText();
  ok(/Service road/.test(card), `its card: ${card.split('\n').slice(0, 3).join(' · ')}`);
  await shot('774-slid-crossing-card');

  // ---- 2. a link walled off our abutment's cone (D11 km 15.53, road III/30022 bent: a saved edit) ----
  const bent = JSON.parse(readFileSync(new URL('../tests/fixtures/works-clash/d11-iii-30022-bent.json', import.meta.url), 'utf8'));
  await g.open('scenario=d11&preset=d11-motorway');
  await T((d) => window.trapla.setProject(d), bent); await g.game.idle();
  const w = await T(() => { const res = window.trapla.projectResult(), c = res.routes['route:motorway-forward'].legacy.crossings.find(c => c.roadId === 3730);
    return { clashes: res.issues.filter(i => i.code === 'works-clash').length, type: c?.type, walls: res.routes['route:motorway-forward'].legacy.footprintConflicts.filter(f => f.action === 'retaining-wall' && Math.hypot(f.x - 10830, f.y - 16903) < 60).map(f => f.length) }; });
  ok(w.type === 'diversion' && w.clashes === 0, `the track at km 15.53 diverted (${w.type}), nothing of its works under ours (${w.clashes} clashes)`);
  await g.select(M, 3730); await g.look(10845, 16885, 120, 210, 48);
  await shot('775-link-off-our-cone');

  // ---- 3. whole I/35 km 23.13: the class I road under the slid road's fill, a problem with its fix ----
  await g.open('scenario=i35-full&preset=i35-full-road');
  const F = await T(() => window.trapla.activeRoute());
  const i35 = await g.slide(F, 5053, -40, { dist: 500, yaw: 0, pitch: 50 });
  const p = await T((id) => { const res = window.trapla.projectResult(); return { valid: res.valid, issues: res.issues.filter(i => i.scope.routeIds.includes(id)).map(i => `${i.violation.title}: ${i.violation.fix}`) }; }, i35.id);
  ok(!!i35.id && !p.valid && p.issues.some(i => /cover 31 m of a class I road: Move the route/.test(i)) && !p.issues.some(i => /Two roads change/.test(i)),
    `slid, a problem with its fix: ${p.issues.join(' | ')}`);
  await T((id) => window.trapla.setActiveRoute(id), i35.id); await g.game.idle();
  // its problems listed, the first one's card: what it covers and its fix
  await page.locator('#chip-viol').click(); await g.game.idle(300);
  await g.look(15258, 6650, 190, 20, 42);
  await shot('776-i35-slid-problem');
  ok(g.game.pageErrors.length === 0, `no page errors (${g.game.pageErrors.join('; ')})`);
} finally { await g.game.close(); }
