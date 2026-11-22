// A hand-built interchange and a built road's ends, with the real mouse (owner request, 2026-11-19):
//  1. Šternberk: Build → Road from our road to a mapped road; its Start dragged along our road (it stays on it),
//     off it onto open ground, back onto our road; undo names it; a road not selected shows no handles.
//  2. D3 0304 at km 4.49, road II/114 under the motorway's bridge: Build → Slip road four times (two exits, two
//     entries, one on each side of the motorway before and after the bridge): VALID and priced; a gore dragged
//     along the motorway; a slip road put across the motorway is a problem; the mission end's interchange card.
//     Each slip road is bent off the motorway and square onto the road; on each side the entry starts at the
//     exit's junction (one crossroads, billed once).
//  3. D3 0303 at km 3.06, road II/105 (saved from the game): VALID and priced where the motorway moves aside tracks
//     a slip road crosses.
//  4. The I/35 Turnov stage at km 0.98, road II/610 (Přepeřská) over the four-lane road S 21.5: Build → Slip road four
//     times, a diamond VALID and priced on the S 21.5's own lanes (110 km/h: exit 198 m, entry 295 m, its paved shoulder
//     2.5 m wider), the formation and paving drawn wider along each lane; a gore dragged along it.
//  5. The I/35 Turnov stage at km 1.67, Nudvojovická over the four-lane road, where our road cuts a local road at km 1.81
//     and leads it to Nudvojovická: a diamond built against the local road as our road leaves it (no "two roads change
//     the same old road"; the north-east exit, just past it, over its new link); the south-west entry dragged off
//     Nudvojovická, a bend too close to the north-east exit's end removed, the crossroads roundabouts on the cards: VALID.
// node scripts/interchange-scene.mjs [--gpu] [--docs] [--only i35|nudvojovicka] [--save-i35 <file>] [--save-nudvojovicka <file>]
//   (--docs: docs/screenshots/620–633, 710–719, 727–731 and 792; --save-i35 / --save-nudvojovicka: a diamond's project, tests/fixtures/interchange)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checker, startGame } from './lib/browser.mjs';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-interchange';
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1] ?? null; };
const only = arg('--only'), saveI35 = arg('--save-i35'), saveNud = arg('--save-nudvojovicka');
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
const groundAt = (x, y) => page.evaluate(([x, y]) => ({ x, y, z: window.trapla.groundHeight(x, y) }), [x, y]);
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
  if (!only) {
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
  ok(/start it beside a motorway or four-lane road to leave it/.test(await page.locator('.inspector.k-build').innerText()), 'its card says how the ends go');
  // (on each side the entry starts where the exit ends: one crossroads on road II/114)
  const slips = [
    { name: 'exit towards Voračice', a: await gore(site.s - 450, 1), b: await road(site.at + 140) },
    { name: 'entry towards Voračice', a: await road(site.at + 140), b: await gore(site.s + 450, 1), shared: true },
    { name: 'exit towards Václavice', a: await gore(site.s + 450, -1), b: await road(site.at - 140) },
    { name: 'entry towards Václavice', a: await road(site.at - 140), b: await gore(site.s - 450, -1), shared: true },
  ];
  for (const [k, slip] of slips.entries()) {
    if (k) await build('Slip road');
    const ha = await hoverAt(slip.a);
    if (k === 0) await shot('623-slip-road-start-on-the-motorway');
    await clickAt(slip.a);
    const hb = await hoverAt(slip.b);
    await clickAt(slip.b); await game.idle();
    ok(/motorway|joins road II\/114/.test(ha ?? '') && /motorway|joins road II\/114/.test(hb ?? ''), `${slip.name}: ${ha} → ${hb}`);
    if (slip.shared) ok(/at another slip road's junction/.test(ha ?? ''), `${slip.name} starts at the exit's junction (${ha})`);
    const pis = await page.evaluate(() => window.trapla.getDesign().pis.length);
    ok(pis === 2, `${slip.name}: Build bends it twice, off the motorway and square onto the road (${pis} bends)`);
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
  const shares = await page.evaluate(() => window.trapla.projectResult().works.items.filter(w => w.label?.startsWith('Shares its junction with')).length);
  ok(shares === 2, `two crossroads on road II/114, each built and billed once (${shares} shared)`);
  const marks = await page.evaluate(() => { const m = window.trapla.debugView().laneMarks; return m ? m.geometry.attributes.position.count : 0; });
  ok(marks > 100, 'its four speed-change lanes are drawn');
  await page.evaluate(() => window.trapla.setActiveRoute('route:motorway-forward')); await game.idle();
  await shot('625-diamond-valid-overview');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 560, 215, 42), [site.x, site.y]);
  await game.idle(); await game.still(); await shot('626-diamond-oblique');
  const g0 = await gore(site.s - 390, 1);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 200, 200, 35), [g0.x, g0.y]);
  await game.idle(); await game.still(); await shot('627-exit-lane-and-gore');
  const term = await road(site.at + 140);
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

  // ---- 3. a diamond on D3 0303, where the motorway moves aside tracks a slip road crosses (saved from the game) ----
  await game.open('scenario=d3-0303');
  await page.evaluate(() => window.trapla.whenTransport());
  const d0303 = JSON.parse(readFileSync(new URL('../tests/fixtures/interchange/d3-0303-diamond.json', import.meta.url), 'utf8'));
  await page.evaluate((d) => window.trapla.setProject(d), d0303); await game.idle();
  await page.evaluate(() => window.trapla.setActiveRoute('route:motorway-forward')); await game.idle();
  const r0303 = await issues();
  ok(r0303.valid && r0303.total !== null && r0303.list.length === 0, `the D3 0303 diamond is VALID and priced: ${(r0303.total / 1e9).toFixed(4)} bn`);
  await page.evaluate(() => window.trapla.lookAt(3510, 7790, 900, 0, 89)); await game.idle(); await game.still();
  await shot('632-d3-0303-diamond-overview');
  await page.evaluate(() => window.trapla.lookAt(3560, 7790, 330, 230, 40)); await game.idle(); await game.still();
  await shot('633-d3-0303-slip-road-over-moved-track');
  }

  if (!only || only === 'i35') {
  // ---- 4. a diamond on the I/35 Turnov stage: slip roads on the four-lane road S 21.5 ----
  await game.open('scenario=i35-turnov');
  await page.evaluate(() => window.trapla.whenTransport());
  const i35 = await issues();
  ok(i35.valid && i35.total !== null, `the I/35 Turnov starter: ${(i35.total / 1e9).toFixed(2)} bn, valid`);
  const four = await page.evaluate(() => { const r = window.trapla.projectResult().routes['route:motorway-forward'].legacy;
    const c = r.crossings.find(c => c.cls === 'secondary' && Math.abs(c.s - 983) < 60); return { s: c.s, x: c.x, y: c.y, type: c.type }; });
  ok(four.type === 'overbridge', `road II/610 over the four-lane road at km ${(four.s / 1000).toFixed(2)} (${four.type})`);
  // (its gores 350 m either side of the bridge, on the carriageway's paved shoulder: 10.75 m from the line; its
  // crossroads on road II/610 where the road is back on its ground past the bridge's ramps, as Build's checks say: the
  // south-west one 250 m along it from the four-lane road, past the ramp of its bridge (the line there 1 m higher than
  // before cost model 62, which carries the railway at km 0.47 over our cutting))
  const gore4 = (s, dir) => page.evaluate(([s, dir]) => { const r = window.trapla.projectResult().routes['route:motorway-forward'].legacy, k = Math.round(s / r.ds), o = 10.5;
    return { x: r.x[k] + dir * r.ty[k] * o, y: r.y[k] - dir * r.tx[k] * o, z: r.grade[k] }; }, [s, dir]);
  const ground = (x, y) => page.evaluate(([x, y]) => ({ x, y, z: window.trapla.groundHeight(x, y) }), [x, y]);
  const sw = await ground(2101, 3732), ne = await ground(2537, 3835);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1250, 0, 89), [four.x, four.y]);
  await game.idle(); await game.still();
  const slips4 = [
    { name: 'exit towards Valdštejnsko', a: await gore4(four.s - 350, 1), b: sw },
    { name: 'entry towards Valdštejnsko', a: sw, b: await gore4(four.s + 350, 1), shared: true },
    { name: 'exit towards Ohrazenice', a: await gore4(four.s + 350, -1), b: ne },
    { name: 'entry towards Ohrazenice', a: ne, b: await gore4(four.s - 350, -1), shared: true },
  ];
  for (const [k, slip] of slips4.entries()) {
    await build('Slip road');
    if (k === 0) ok(/start it beside a motorway or four-lane road/.test(await page.locator('.inspector.k-build').innerText()), 'Build → Slip road: its card names the four-lane road');
    const ha = await hoverAt(slip.a);
    if (k === 0) await shot('710-slip-road-start-on-the-four-lane-road');
    await clickAt(slip.a);
    const hb = await hoverAt(slip.b);
    await clickAt(slip.b); await game.idle();
    ok(/the four-lane road, towards|joins (road II\/610|Přepeřská)/.test(ha ?? '') && /the four-lane road, towards|joins (road II\/610|Přepeřská)/.test(hb ?? ''), `${slip.name}: ${ha} → ${hb}`);
    if (slip.shared) ok(/at another slip road's junction/.test(ha ?? ''), `${slip.name} starts at the exit's junction (${ha})`);
    if (k === 0) {
      const card = await page.locator('#inspector').innerText();
      ok(/Slip road, one way, from our road to road II\/610/.test(card), 'its card: one way, from our road');
      ok(/Exit lane on the four-lane road, 198 m \(its hard shoulder, paved 2.5 m wider; the railway's bridge over it 1 m longer\)/.test(card), 'its exit lane: the S 21.5 at 110 km/h, 198 m, paved 2.5 m wider, under the railway\'s bridge (1 m longer)');
      ok(!/not yet on a four-lane road/.test(card), 'no engine limit');
      await shot('711-first-slip-road-card-four-lane-road');
    }
  }
  // the south-west entry: Build's square bend at the crossroads comes too close to its start; dragged 8 m on along the
  // way it leaves the road, as a designer would
  const second4 = await page.evaluate(() => window.trapla.getProject().routes.find(r => r.name === 'Slip road 2').id);
  await page.evaluate((id) => window.trapla.setActiveRoute(id), second4); await game.idle();
  if ((await issues()).list.some(t => /Slip road 2: Bend 1 is too close to its start/.test(t))) {
    const bend = await page.evaluate(() => { const t = window.trapla, d = t.getDesign(), a = t.routeEndpoints().a.position, p = d.pis[0], L = Math.hypot(p.x - a.x, p.y - a.y);
      return { p, to: { x: p.x + (p.x - a.x) / L * 8, y: p.y + (p.y - a.y) / L * 8 } }; });
    const p = { ...bend.p, z: (await groundAt(bend.p.x, bend.p.y)).z }, to = await groundAt(bend.to.x, bend.to.y);
    await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 160, 0, 89), [p.x, p.y]); await game.idle(); await game.still();
    await page.evaluate(() => window.trapla.selectPi(0)); await game.idle();
    const marker = await page.locator('.pi[data-i="0"]').filter({ visible: true }).first().boundingBox();
    const from = await at(p), dest = await at(to), grab = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
    await page.mouse.move(grab.x, grab.y, { steps: 4 }); await page.waitForTimeout(200); await page.mouse.down();
    await page.mouse.move(dest.x + grab.x - from.x, dest.y + grab.y - from.y, { steps: 10 }); await page.waitForTimeout(300);
    await page.mouse.up(); await game.idle();
    await page.evaluate(() => window.trapla.selectPi(null)); await game.idle();
  }
  ok(!(await issues()).list.some(t => /Slip road 2: Bend/.test(t)), 'the south-west entry\'s bends fit');
  // (since cost model 65 a house's corner stands 0.2 m inside a crossroads' sight field: bought out, as its fix says)
  const inWay = await page.evaluate(() => Object.values(window.trapla.projectResult().routes).flatMap(r => (r.legacy?.violations ?? []).flatMap(v => /No clear view/.test(v.title) ? v.target?.buildings ?? [] : [])));
  if (inWay.length) { await page.evaluate((js) => { const t = window.trapla, d = t.getProject(); t.setProject({ ...d, buildingOverrides: [...d.buildingOverrides, ...js.map(j => ({ j, action: 'buy' }))] }); }, inWay); await game.idle(); }
  const done4 = await issues();
  ok(done4.valid && done4.total !== null && done4.list.length === 0, `the I/35 diamond is VALID and priced: ${(done4.total / 1e9).toFixed(4)} bn (${done4.list.join('; ') || 'no problems'})`);
  ok(done4.total - i35.total > 100e6 && done4.total - i35.total < 1.5e9, `the interchange costs ${((done4.total - i35.total) / 1e6).toFixed(0)} M`);
  const works4 = await page.evaluate(() => window.trapla.projectResult().works.items.map(w => w.label ?? ''));
  ok(works4.filter(l => /^(Exit|Entry) lane on the four-lane road/.test(l)).length === 4, 'four speed-change lanes on the four-lane road');
  ok(works4.some(l => /^Already in the four-lane road's price/.test(l)), 'the S 21.5\'s price per km already includes one interchange\'s earth-built slip roads: credited');
  const drawn = await page.evaluate(() => { const m = window.trapla.debugView().laneMarks; return m ? m.geometry.attributes.position.count : 0; });
  ok(drawn > 400, `its lanes' lines and the paving they add are drawn (${drawn} vertices)`);
  if (saveI35) { writeFileSync(saveI35, JSON.stringify(await page.evaluate(() => window.trapla.getProject()), null, 1) + '\n'); console.log(`saved ${saveI35}`); }
  await page.evaluate(() => window.trapla.setActiveRoute('route:motorway-forward')); await game.idle();
  await page.evaluate(([x, y]) => window.trapla.lookAt(x + 20, y, 1000, 0, 89), [four.x, four.y]);
  await game.idle(); await game.still(); await shot('712-i35-diamond-valid-overview');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 650, 200, 40), [four.x, four.y]);
  await game.idle(); await game.still(); await shot('713-i35-diamond-oblique');
  // (the exit lane and the entry lane of the other carriageway end at one pair of gores; the formation wider along them)
  const g4 = await gore4(four.s - 343, 1);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 45, 200, 30), [g4.x, g4.y]);
  await game.idle(); await game.still(); await shot('714-i35-exit-lane-and-gore');
  // (the lanes run under the railway's bridge 150 m before the gores: it spans our cutting that much wider)
  const b4 = await gore4(four.s - 513, 1);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 80, 300, 25), [b4.x, b4.y]);
  await game.idle(); await game.still(); await shot('715-i35-lanes-under-the-railway-bridge');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 240, 160, 45), [sw.x, sw.y]);
  await game.idle(); await game.still(); await shot('716-i35-junction-on-road-ii-610');
  // a gore dragged along the four-lane road: it stays on it, the diamond valid
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1250, 0, 89), [four.x, four.y]);
  await game.idle(); await game.still();
  const first4 = await page.evaluate(() => window.trapla.getProject().routes.find(r => r.name === 'Slip road').id);
  await page.evaluate((id) => window.trapla.setActiveRoute(id), first4); await game.idle();
  const t6 = await dragEnd('a', await gore4(four.s - 400, 1), { shotName: '717-i35-gore-dragged-along-the-four-lane-road' });
  ok(/the four-lane road, towards Valdštejnsko/.test(t6 ?? ''), `the gore slides along the four-lane road (${t6})`);
  const moved4 = await issues();
  ok(moved4.valid, `…and the diamond stays valid (${moved4.list.join('; ') || 'no problems'})`);
  await page.locator('#undo').click(); await game.idle();
  const ne4 = await gore4(four.s + 300, -1);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 420, 300, 40), [ne4.x, ne4.y]);
  await game.idle(); await game.still(); await shot('718-i35-north-east-slip-roads');
  const top4 = await gore4(four.s - 343, 0);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 90, 0, 89), [top4.x, top4.y]);
  await game.idle(); await game.still(); await shot('719-i35-gores-from-above');
  }

  if (!only || only === 'nudvojovicka') {
  // ---- 5. a diamond at Nudvojovická (I/35 km 1.67), where our road leads a local road it cuts to Nudvojovická ----
  await game.open('scenario=i35-turnov');
  await page.evaluate(() => window.trapla.whenTransport());
  const n0 = await issues();
  const nud = await page.evaluate(() => { const r = window.trapla.projectResult().routes['route:motorway-forward'].legacy;
    const c = r.crossings.find(c => c.cls === 'tertiary' && Math.abs(c.s - 1668) < 60), led = r.crossings.find(c => c.type === 'reconnection' && Math.abs(c.s - 1811) < 30);
    return { s: c.s, x: c.x, y: c.y, type: c.type, led: led && { way: led.roadId, to: led.targetRoadId, x: led.x, y: led.y } }; });
  ok(nud.type === 'overbridge' && !!nud.led, `Nudvojovická over our road at km ${(nud.s / 1000).toFixed(2)}; at km 1.81 a local road cut and led to it`);
  const goreN = (s, dir) => page.evaluate(([s, dir]) => { const r = window.trapla.projectResult().routes['route:motorway-forward'].legacy, k = Math.round(s / r.ds), o = 10.5;
    return { x: r.x[k] + dir * r.ty[k] * o, y: r.y[k] - dir * r.tx[k] * o, z: r.grade[k] }; }, [s, dir]);
  // (crossroads on Nudvojovická past its bridge's ramps: 290 m south-west of the bridge, 185 m north of it; the first
  // gore 20 m off our road's bend marker, which takes the click)
  const swN = await groundAt(2657.05, 3264.05), neN = await groundAt(2963.0, 3578.9);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1300, 0, 89), [nud.x, nud.y]);
  await game.idle(); await game.still();
  // (the north-east exit leaves the carriageway just past where our road cuts the local road: across what our road leaves of it)
  const slipsN = [[await goreN(nud.s - 430, 1), swN], [swN, await goreN(nud.s + 450, 1)], [await goreN(nud.s + 200, -1), neN], [neN, await goreN(nud.s - 430, -1)]];
  for (const [k, [a, b]] of slipsN.entries()) {
    await build('Slip road');
    const ha = await hoverAt(a); await clickAt(a);
    const hb = await hoverAt(b); await clickAt(b); await game.idle();
    ok(/the four-lane road, towards|joins Nudvojovická/.test(ha ?? '') && /the four-lane road, towards|joins Nudvojovická/.test(hb ?? ''), `slip road ${k + 1}: ${ha} → ${hb}`);
  }
  const n1 = await issues();
  ok(!n1.list.some(t => /Two roads change the same old road/.test(t)), `the slip roads are built against the local road as our road leads it: no "two roads change the same old road" (${n1.list.join('; ') || 'no problems'})`);
  // (where it crosses the local road: on our road's new link of it, not on the stretch our road takes out)
  const onLink = await page.evaluate(() => { const t = window.trapla, p = t.getProject(), r = t.projectResult(), s3 = p.routes.find(q => q.name === 'Slip road 3');
    const led = r.routes['route:motorway-forward'].legacy.crossings.find(c => c.type === 'reconnection' && Math.abs(c.s - 1811) < 30);
    const seg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy); };
    const near = (c, line) => line.slice(1).some((q, k) => seg(c, line[k], q) < 3);
    return r.routes[s3.id].legacy.crossings.filter(c => c.cls === led.cls).map(c => ({ type: c.type, link: (led.geometry.links ?? []).some(l => near(c, l)) })); });
  ok(onLink.length > 0 && onLink.every(c => c.link), `the north-east exit crosses the local road on our road's new link of it (${onLink.map(c => `${c.type}${c.link ? ' on the link' : ' elsewhere'}`).join(', ')})`);
  // the south-west entry: Nudvojovická runs nearly towards its gore, so Build leaves it square and turns towards the gore
  // (its bend ≈ 90 m out, through the village's southern streets); the bend dragged to the village's edge, as a designer would
  const second = await page.evaluate(() => window.trapla.getProject().routes.find(r => r.name === 'Slip road 2').id);
  await page.evaluate((id) => window.trapla.setActiveRoute(id), second); await game.idle();
  const built = await page.evaluate(() => { const t = window.trapla, d = t.getDesign(), r = t.projectResult().routes[t.activeRoute()].legacy, a = t.routeEndpoints().a.position;
    return { pis: d.pis, crosses: r.crossings.some(c => c.cls === 'tertiary'), a }; });
  const sideLeg = built.pis.length === 2 && Math.hypot(built.pis[0].x - built.a.x, built.pis[0].y - built.a.y);
  ok(built.pis.length === 2 && !built.crosses && sideLeg >= 80, `Build leaves Nudvojovická square, ${sideLeg?.toFixed(0)} m out to its bend, and crosses it no more (${built.pis.length} bends)`);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 520, 0, 89), [2730, 3230]); await game.idle(); await game.still();
  await page.evaluate(() => window.trapla.selectPi(0)); await game.idle();
  {
    const p = { ...built.pis[0], z: (await groundAt(built.pis[0].x, built.pis[0].y)).z }, to = await groundAt(2740, 3235);
    const marker = await page.locator('.pi[data-i="0"]').filter({ visible: true }).first().boundingBox();
    const from = await at(p), dest = await at(to), grab = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
    await page.mouse.move(grab.x, grab.y, { steps: 4 }); await page.waitForTimeout(200); await page.mouse.down();
    await page.mouse.move(dest.x + grab.x - from.x, dest.y + grab.y - from.y, { steps: 12 }); await page.waitForTimeout(400);
    await game.frames(3); await page.screenshot({ path: `${out}/727-nudvojovicka-entry-bend-dragged-to-the-village-edge.png` }); // (no park: the button is down)
    await page.mouse.up(); await game.idle();
    await page.evaluate(() => window.trapla.selectPi(null)); await game.idle();
  }
  const dragged = await page.evaluate(() => { const t = window.trapla, r = t.projectResult().routes[t.activeRoute()].legacy; return { pis: t.getDesign().pis.length, crosses: r.crossings.some(c => c.cls === 'tertiary') }; });
  ok(dragged.pis === 2 && !dragged.crosses, `dragged, it leaves Nudvojovická at the village's edge and crosses it no more (${dragged.pis} bends)`);
  // the north-east exit, short: Build's square bend comes too close to its end; removed on its card (the exit meets
  // Nudvojovická askew enough without it)
  const third = await page.evaluate(() => window.trapla.getProject().routes.find(r => r.name === 'Slip road 3').id);
  await page.evaluate((id) => window.trapla.setActiveRoute(id), third); await game.idle();
  if ((await issues()).list.some(t => /Slip road 3: Bend 2 is too close to its end/.test(t))) {
    await page.evaluate(() => window.trapla.selectPi(1)); await game.idle();
    await page.locator('#pi-del').click(); await game.idle();
  }
  ok(!(await issues()).list.some(t => /Slip road 3: Bend/.test(t)), 'the north-east exit\'s bends fit');
  // the crossroads as roundabouts (the sight lines along Nudvojovická are short): each slip road's card, Roundabout
  for (const [k, name] of ['Slip road', 'Slip road 2', 'Slip road 3', 'Slip road 4'].entries()) {
    const id = await page.evaluate((n) => window.trapla.getProject().routes.find(r => r.name === n).id, name);
    await page.evaluate((id) => window.trapla.setActiveRoute(id), id); await game.idle();
    await page.locator(`.route-junctions button[data-end="${k % 2 === 0 ? 'b' : 'a'}"]`, { hasText: 'Roundabout' }).click(); await game.idle();
    if (k === 0) await shot('728-nudvojovicka-roundabout-on-the-card');
  }
  const n2 = await issues();
  ok(n2.valid && n2.total !== null && n2.list.length === 0, `the Nudvojovická diamond is VALID and priced: ${(n2.total / 1e9).toFixed(4)} bn (${n2.list.join('; ') || 'no problems'})`);
  ok(n2.total - n0.total > 100e6, `the interchange costs ${((n2.total - n0.total) / 1e6).toFixed(0)} M`);
  if (saveNud) { writeFileSync(saveNud, JSON.stringify(await page.evaluate(() => window.trapla.getProject()), null, 1) + '\n'); console.log(`saved ${saveNud}`); }
  await page.evaluate(() => window.trapla.setActiveRoute('route:motorway-forward')); await game.idle();
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1000, 0, 89), [nud.x, nud.y]);
  await game.idle(); await game.still(); await shot('729-nudvojovicka-diamond-valid-overview');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 620, 150, 40), [nud.x, nud.y]);
  await game.idle(); await game.still(); await shot('730-nudvojovicka-diamond-oblique');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x + 60, y - 10, 380, 200, 50), [nud.led.x, nud.led.y]);
  await game.idle(); await game.still(); await shot('731-nudvojovicka-exit-over-the-local-road-s-new-link');
  // (the south-west crossroads' roundabout, on ground falling ≈ 4.7 m across its 40 m: laid on what is drawn there, its
  // splitter islands in Nudvojovická's arms)
  await page.evaluate(() => window.trapla.lookAt(2645, 3260, 55, 270, 40));
  await game.idle(); await game.still(); await shot('792-nudvojovicka-roundabout-on-the-slope');
  }
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally { await game.close(); }
