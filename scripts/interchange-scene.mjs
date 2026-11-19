// A hand-built interchange and a built road's ends, with the real mouse (owner request, 2026-11-19):
//  1. Šternberk: Build → Road from our road to a mapped road; its Start dragged along our road (it stays on it),
//     off it onto open ground, back onto our road; undo names it; a road not selected shows no handles.
//  2. D3 0304 at km 4.49, road II/114 under the motorway's bridge: Build → Slip road four times (two exits, two
//     entries, one on each side of the motorway before and after the bridge): VALID and priced; a gore dragged
//     along the motorway; a slip road put across the motorway is a problem; the mission end's interchange card.
// node scripts/interchange-scene.mjs [--gpu] [--docs]   (--docs: docs/screenshots/620–632)
import { mkdirSync } from 'node:fs';
import { checker, startGame } from './lib/browser.mjs';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-interchange';
mkdirSync(out, { recursive: true });
const { ok } = checker();
const game = await startGame();
const { page } = game;
const shot = async (name) => { await game.park(); await game.frames(3); await page.screenshot({ path: `${out}/${name}.png` }); };
const box = () => page.locator('#view').boundingBox();
const screen = (p) => page.evaluate(([x, y, z]) => window.trapla.screenOf(x, y, z), [p.x, p.y, p.z]);
const at = async (p) => { const b = await box(), q = await screen(p); return { x: b.x + q.sx, y: b.y + q.sy }; };
const clickAt = async (p) => { const q = await at(p); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.waitForTimeout(150); await page.mouse.click(q.x, q.y); await page.waitForTimeout(200); };
const hoverAt = async (p) => { const q = await at(p); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.waitForTimeout(200); return page.evaluate(() => window.trapla.buildHover()); };
const build = async (label) => {
  await page.locator('#build-route').click();
  await page.locator('.route-build-choices button', { hasText: new RegExp(`^${label}$`) }).click();
  await page.waitForTimeout(200);
};
const issues = () => page.evaluate(() => { const t = window.trapla, p = t.getProject(), r = t.projectResult(); const names = Object.fromEntries(p.routes.map(q => [q.id, q.name]));
  return { total: r.cost.total, valid: r.valid, list: r.issues.map(i => `${i.scope.routeIds.map(id => names[id]).join(' + ')}: ${i.violation.title}`) }; });
const ends = () => page.evaluate(() => window.trapla.routeEndpoints());
/** drag the active road's `end` handle so that the end itself goes to `target` (the grab's offset kept); the label
 *  the handle shows just before letting go */
const dragEnd = async (end, target, { shotName, steps = 14 } = {}) => {
  const handle = page.locator(`.road-end[data-end=${end}]`);
  const hb = await handle.boundingBox(); if (!hb) return null;
  const now = await page.evaluate((e) => { const t = window.trapla, r = t.projectResult().routes[t.activeRoute()].legacy; const i = e === 'a' ? 0 : r.n - 1; return { x: r.x[i], y: r.y[i], z: r.grade[i] }; }, end);
  const from = await at(now), to = await at(target), grab = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
  await page.mouse.move(grab.x, grab.y); await page.mouse.down();
  await page.mouse.move(to.x + grab.x - from.x, to.y + grab.y - from.y, { steps });
  await page.waitForTimeout(400);
  const text = await page.locator('.build-hover').first().textContent().catch(() => null);
  if (shotName) { await game.frames(3); await page.screenshot({ path: `${out}/${shotName}.png` }); }
  await page.mouse.up(); await game.idle();
  return text;
};
const routePoint = (id, s) => page.evaluate(([id, s]) => { const r = window.trapla.projectResult().routes[id].legacy, i = Math.round(s / r.ds); return { x: r.x[i], y: r.y[i], z: r.grade[i] }; }, [id, s]);

try {
  // ---- 1. a built road's ends (Šternberk) ----
  await game.open('scenario=i46-sternberk');
  await page.evaluate(() => window.trapla.whenTransport());
  const ours = await page.evaluate(() => window.trapla.getProject().routes.find(r => r.role === 'mission').id);
  const p0 = await routePoint(ours, 1500);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x + 200, y, 1100, 0, 60), [p0.x, p0.y]);
  await game.idle(); await game.still();
  // a track 300 m east of our road at km 1.5 (the one the Šternberk report used)
  const track = await page.evaluate(([x, y]) => { const t = window.trapla; let best = null;
    for (const id of t.sourceIds('track', 200)) for (let s = 0; ; s += 10) { const p = t.sourcePoint(id, s); if (!p) break; const d = Math.hypot(p.x - x - 290, p.y - y + 90); if (!best || d < best.d) best = { d, p }; }
    return best.p; }, [p0.x, p0.y]);
  await build('Road');
  ok(/joins our road/.test(await hoverAt(p0) ?? ''), 'Build → Road: the start joins our road');
  await clickAt(p0);
  ok(/joins track/.test(await hoverAt(track) ?? ''), 'Build → Road: the end joins the track');
  await clickAt(track); await game.idle();
  const built = await page.evaluate(() => window.trapla.activeRoute());
  ok(built !== ours && (await ends()).a.anchor.kind === 'route', 'a new road joins our road at its start');
  ok(await page.locator('.road-end').count() === 2 && await page.locator('.road-end[data-end=a]').isVisible(), 'its Start and End have handles while it is selected');
  await shot('620-built-road-end-handles');
  // along our road: it stays on it
  const along = await routePoint(ours, 1700);
  const t1 = await dragEnd('a', along, { shotName: '621-built-road-start-along-our-road' });
  ok(t1 === 'joins our road', `dragged along our road it stays on it (${t1})`);
  const e1 = (await ends()).a;
  ok(e1.anchor.kind === 'route' && Math.abs(e1.anchor.s - 1700) < 30, `…at km ${(e1.anchor.s / 1000).toFixed(2)}`);
  ok((await page.evaluate(() => window.trapla.undoLabels())).undo === 'moving the start (New road)', 'undo says "moving the start"');
  // off it onto open ground (well clear of every road), then back
  // (a spot of open ground 120–250 m from it: what a click while building would call open ground)
  const off = await page.evaluate(async ([x, y]) => { const t = window.trapla, b = document.getElementById('view').getBoundingClientRect();
    for (const d of [150, 200, 250, 120]) for (let k = 0; k < 16; k++) {
      const px = x + d * Math.cos(k * Math.PI / 8), py = y + d * Math.sin(k * Math.PI / 8), q = t.groundScreen(px, py);
      if (!q.vis) continue;
      // (free all round: no road within 20 px either)
      const free = [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]].every(([dx, dy]) => { const p = t.placementAt(b.left + q.sx + dx, b.top + q.sy + dy); return p?.ok && p.end.anchor.kind === 'free'; });
      if (free) return { x: px, y: py, z: t.groundHeight(px, py) };
    }
    return null; }, [along.x, along.y]);
  const t2 = await dragEnd('a', off, { shotName: '622-built-road-start-off-onto-open-ground' });
  ok(/open ground/.test(t2 ?? '') && (await ends()).a.anchor.kind === 'free', `pulled off it, the end is on open ground (${t2})`);
  ok((await issues()).list.some(t => /ends nowhere/.test(t)), 'a free end: "Road ends nowhere"');
  const t3 = await dragEnd('a', await routePoint(ours, 1600));
  ok(t3 === 'joins our road' && (await ends()).a.anchor.kind === 'route', 'dragged back onto our road, it joins it again');
  await page.locator('#undo').click(); await game.idle();
  ok((await ends()).a.anchor.kind === 'free', 'one undo takes the last move back');
  // select before drag: a road not selected shows no handles
  const far = await at(off); await page.mouse.click(far.x + 200, far.y + 150); await page.waitForTimeout(300);
  ok(!(await page.locator('.road-end[data-end=a]').isVisible()), 'a road not selected shows no end handles');

  // ---- 2. a diamond on D3 0304 ----
  await game.open('scenario=d3-0304');
  await page.evaluate(() => window.trapla.whenTransport());
  const base = await issues();
  ok(base.valid && base.total !== null, `the D3 0304 starter: ${(base.total / 1e9).toFixed(2)} bn, valid`);
  const site = await page.evaluate(() => { const t = window.trapla, r = t.projectResult().routes['route:motorway-forward'].legacy;
    const c = r.crossings.find(c => c.cls === 'secondary');
    let best = null; for (const id of t.sourceIds('secondary', 200)) for (let s = 0; ; s += 5) { const p = t.sourcePoint(id, s); if (!p) break; const d = Math.hypot(p.x - c.x, p.y - c.y); if (!best || d < best.d) best = { id, s, d }; }
    return { s: c.s, x: c.x, y: c.y, road: best.id, at: best.s }; });
  ok(Math.abs(site.s - 4487) < 30, `road II/114 under the motorway's bridge at km ${(site.s / 1000).toFixed(2)}`);
  const gore = (s, dir) => page.evaluate(([s, dir]) => { const r = window.trapla.projectResult().routes['route:motorway-forward'].legacy, k = Math.round(s / r.ds), o = 13;
    return { x: r.x[k] + dir * r.ty[k] * o, y: r.y[k] - dir * r.tx[k] * o, z: r.grade[k] }; }, [s, dir]);
  // (the road's stations rise to the west: on the forward carriageway's side)
  const road = (s) => page.evaluate(([id, s]) => window.trapla.sourcePoint(id, s), [site.road, s]);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1250, 0, 89), [site.x, site.y]);
  await game.idle(); await game.still();
  await page.locator('#build-route').click();
  ok((await page.locator('.route-build-choices button').allTextContents()).includes('Slip road'), 'Build offers a slip road');
  await page.locator('.route-build-choices button', { hasText: /^Slip road$/ }).click();
  ok(/start it beside a motorway to leave it/.test(await page.locator('.inspector.k-build').innerText()), 'its card says how the ends go');
  const slips = [
    { name: 'exit towards Voračice', a: await gore(site.s - 450, 1), b: await road(site.at + 100) },
    { name: 'entry towards Voračice', a: await road(site.at + 180), b: await gore(site.s + 450, 1) },
    { name: 'exit towards Václavice', a: await gore(site.s + 450, -1), b: await road(site.at - 100) },
    { name: 'entry towards Václavice', a: await road(site.at - 180), b: await gore(site.s - 450, -1) },
  ];
  for (const [k, slip] of slips.entries()) {
    if (k) await build('Slip road');
    const ha = await hoverAt(slip.a);
    if (k === 0) await shot('623-slip-road-start-on-the-motorway');
    await clickAt(slip.a);
    const hb = await hoverAt(slip.b);
    await clickAt(slip.b); await game.idle();
    ok(/motorway|joins road II\/114/.test(ha ?? '') && /motorway|joins road II\/114/.test(hb ?? ''), `${slip.name}: ${ha} → ${hb}`);
    if (k === 0) {
      const card = await page.locator('#inspector').innerText();
      ok(/Slip road, one way, from our motorway to road II\/114/.test(card) && /Exit lane on the motorway, 234 m/.test(card), 'its card: one way, its exit lane');
      ok(!/Start junction/.test(card), 'no junction choice where it leaves the motorway');
      await shot('624-first-slip-road-card');
    }
  }
  const done = await issues();
  ok(done.valid && done.total !== null && done.list.length === 0, `the diamond is VALID and priced: ${(done.total / 1e9).toFixed(4)} bn (${done.list.join('; ') || 'no problems'})`);
  ok(done.total - base.total > 100e6 && done.total - base.total < 400e6, `the interchange costs ${((done.total - base.total) / 1e6).toFixed(0)} M`);
  const marks = await page.evaluate(() => { const m = window.trapla.debugView().laneMarks; return m ? m.geometry.attributes.position.count : 0; });
  ok(marks > 100, 'its four speed-change lanes are drawn');
  await page.evaluate(() => window.trapla.setActiveRoute('route:motorway-forward')); await game.idle();
  await shot('625-diamond-valid-overview');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 560, 215, 42), [site.x, site.y]);
  await game.idle(); await game.still(); await shot('626-diamond-oblique');
  const g0 = await gore(site.s - 390, 1);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 200, 200, 35), [g0.x, g0.y]);
  await game.idle(); await game.still(); await shot('627-exit-lane-and-gore');
  const term = await road(site.at + 100);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 220, 150, 45), [term.x, term.y]);
  await game.idle(); await game.still(); await shot('628-slip-road-junction-on-road-ii-114');
  // a gore dragged along the motorway: its bend goes with it
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1300, 0, 89), [site.x, site.y]);
  await game.idle(); await game.still();
  const first = await page.evaluate(() => window.trapla.getProject().routes.find(r => r.name === 'Slip road').id);
  await page.evaluate((id) => window.trapla.setActiveRoute(id), first); await game.idle();
  const bend0 = await page.evaluate(() => window.trapla.getDesign().pis[0]);
  const t4 = await dragEnd('a', await gore(site.s - 400, 1), { shotName: '629-gore-dragged-along-the-motorway' });
  const bend1 = await page.evaluate(() => window.trapla.getDesign().pis[0]);
  ok(/the motorway, towards Voračice/.test(t4 ?? '') && Math.hypot(bend1.x - bend0.x, bend1.y - bend0.y) > 30, `the gore slides along the motorway (${t4}), its bend with it`);
  ok((await issues()).valid, '…and the diamond stays valid');
  await page.locator('#undo').click(); await game.idle();
  // onto the other carriageway: it would cross the motorway
  const t5 = await dragEnd('a', await gore(site.s - 450, -1));
  const crossing = await issues();
  ok(/towards Václavice/.test(t5 ?? '') && crossing.list.some(t => /crosses the motorway/.test(t)), `on the other carriageway (${t5}) it crosses the motorway: a problem`);
  await page.locator('#inspector').scrollIntoViewIfNeeded().catch(() => {});
  await shot('630-slip-road-across-the-motorway');
  await page.locator('#undo').click(); await game.idle();
  ok((await issues()).valid, 'undo: valid again');
  // the mission end's interchange: shown, not billed
  const a = await page.evaluate(() => window.trapla.getProject().routes[0].endpoints.a.position);
  await page.evaluate(() => window.trapla.setActiveRoute('route:motorway-forward')); await game.idle();
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 700, 0, 60), [a.x, a.y]);
  await game.idle(); await game.still();
  // (the marker's disc: the marker itself has no size)
  await page.locator('.endpoint.info b').first().click(); await page.waitForTimeout(300);
  const endCard = await page.locator('#inspector').innerText();
  ok(/Shown only: its slip roads are not built or billed here/.test(endCard), 'the mission end\'s interchange card says it is shown only');
  await shot('631-mission-end-interchange-card');
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally { await game.close(); }
