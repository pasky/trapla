// The owner's D3 steps with a real mouse, on the D3 MOTORWAY preset: at km ≈ 11.8 our motorway bridges road
// III/1057. Click that road north of the bridge, drag it ≈ 40 m east. Then: its card names it the Czech way,
// its traffic is filled in and labelled (never asked for), the fields are reachable (also with a bend
// selected), our motorway is checked against the new line (no old-road crossing left), houses under the
// motorway stay off the map whatever is priced, the score says what holds the total back and keeps what is
// priced in view, and Build → Road refuses the motorway in plain words and shows where a click would put an end.
// node scripts/owner-d3-scene.mjs [--gpu] [--docs]   (screenshots 106–109 with --docs; own port 5245)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const docs = process.argv.includes('--docs');
const out = docs ? 'docs/screenshots' : '/tmp/trapla-owner-d3';
const shot = (n, name) => `${out}/${docs ? `${n}-` : ''}${name}.png`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5245), strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const url = `${server.resolvedUrls.local[0]}?scenario=d3&preset=d3-motorway`;
  await page.goto(url);
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('trapla.intro.v2', '1'); });
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  const idle = async () => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise(resolve => {
      const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
      requestAnimationFrame(() => requestAnimationFrame(frame));
    }));
  };
  await idle();
  assert.equal(await page.evaluate(() => window.trapla.whenTransport()), true, 'the road links load');
  const box = await page.locator('#view').boundingBox();
  const at = p => ({ x: box.x + p.sx, y: box.y + p.sy });
  const result = () => page.evaluate(() => window.trapla.projectResult());
  const text = sel => page.locator(sel).textContent();

  // 0. the motorway as it starts: priced, and it bridges III/1057 near km 11.8
  const start = await page.evaluate(() => {
    const t = window.trapla, p = t.getProject(), r = t.projectResult(), ours = p.routes.filter(q => q.role === 'mission').map(q => q.id);
    const legacy = r.routes[ours[0]].legacy;
    const crossings = legacy.crossings.filter(c => c.cls === 'tertiary' && c.type === 'bridge' && c.s > 11000 && c.s < 12600)
      .map(c => ({ s: c.s, x: c.x, y: c.y, roadId: c.roadId }));
    return { ours, total: r.cost.total, alone: r.cost.alone[ours[0]] ?? r.routes[ours[0]].legacy.cost.total, crossings,
      local: crossings.length ? t.localWorks(legacy, crossings[0].s) : null };
  });
  assert(start.total !== null, 'the motorway alone is priced');
  assert(start.crossings.length, 'our motorway bridges a class III road near km 11.8');
  const roads = (await page.evaluate(() => window.trapla.baseRoads(150))).filter(r => r.name === 'road III/1057' && r.rebuildable);
  assert(roads.length, 'road III/1057 is on the map, named the Czech way');
  // the stretch of III/1057 under our bridge, and a point on it ≈ 120 m north of the bridge
  const grab = await page.evaluate(([roads, crossings]) => {
    let best = null;
    for (const road of roads) for (let s = 0; s <= road.length; s += 5) {
      const p = window.trapla.sourcePoint(road.id, s); if (!p) continue;
      for (const c of crossings) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (!best || d < best.d) best = { d, id: road.id, s, length: road.length, km: c.s / 1000, roadId: c.roadId }; }
    }
    if (!best || best.d > 30) return null;
    const side = [best.s - 120, best.s + 120].filter(s => s > 20 && s < best.length - 20).map(s => ({ s, p: window.trapla.sourcePoint(best.id, s) })).filter(q => q.p);
    side.sort((a, b) => b.p.y - a.p.y); // local y grows to the north
    // and one 25 m from the bridge on the same side (the crossing's own stretch is drawn there)
    const near = side.length && window.trapla.sourcePoint(best.id, best.s + Math.sign(side[0].s - best.s) * 25);
    return side.length && near ? { ...best, s: side[0].s, x: side[0].p.x, y: side[0].p.y, z: side[0].p.z, near } : null;
  }, [roads, start.crossings]);
  assert(grab, 'III/1057 runs under our bridge');
  console.log(`our bridge over road III/1057 at km ${grab.km.toFixed(2)}; grabbing the road 120 m north of it`);

  // 0b. a fresh page, the crossing's card open, the road links not loaded yet: a drag on III/1057 next to
  // our bridge rebuilds it, never pans the map
  {
    const c = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await c.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
    const p = await c.newPage(); p.on('pageerror', error => errors.push(error.message));
    await p.goto(url); await p.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
    await p.evaluate(() => window.trapla.whenIdle());
    await p.evaluate(roadId => window.trapla.selectCrossing(roadId), grab.roadId);
    await p.evaluate(([x, y]) => window.trapla.lookAt(x, y, 200, 0, 62), [grab.near.x, grab.near.y]);
    await p.evaluate(() => window.trapla.whenIdle());
    await p.evaluate(() => new Promise(resolve => {
      const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
      requestAnimationFrame(() => requestAnimationFrame(frame));
    }));
    assert.equal(await p.evaluate(() => window.trapla.transportLoaded()), false, 'a fresh page has not loaded the road links');
    const q = at(await p.evaluate(([x, y]) => window.trapla.groundScreen(x, y), [grab.near.x, grab.near.y]));
    const pose = await p.evaluate(() => window.trapla.cameraTarget());
    await p.mouse.move(q.x, q.y); await p.mouse.down();
    const cold = !(await p.evaluate(() => window.trapla.transportLoaded()));
    await p.mouse.move(q.x + 40, q.y, { steps: 10 });
    await p.mouse.move(q.x + 42, q.y); await p.mouse.up();
    await p.evaluate(() => window.trapla.whenIdle());
    const after = await p.evaluate(() => window.trapla.cameraTarget());
    const rebuilt = (await p.evaluate(() => window.trapla.getProject())).routes.find(r => r.source);
    // (a road not selected is the map's: a click selects it first, the owner's review 2026-11-17)
    assert(Math.hypot(after.x - pose.x, after.y - pose.y) > 0.5, `a drag on a road not selected moves the map (${JSON.stringify([pose, after])}, early: ${cold})`);
    assert.equal(rebuilt, undefined, 'a drag on III/1057 not selected rebuilds nothing');
    console.log('fresh page, crossing card open: a drag on III/1057 25 m from our bridge moved the map, rebuilt nothing');
    await c.close();
  }
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 800, 0, 62), [grab.x, grab.y]); await idle();

  // 1. click it: its card
  let point = at(await page.evaluate(([id, s]) => window.trapla.sourceScreen(id, s), [grab.id, grab.s]));
  await page.mouse.move(point.x, point.y); await page.mouse.click(point.x, point.y);
  await page.locator('#inspector.k-source').waitFor({ timeout: 5000 });
  const header = await text('#inspector .ctx-h');
  assert.match(header, /^Road III\/1057/); assert(!/Class III road/.test(header), `the header does not repeat the class (${header})`);
  await page.screenshot({ path: shot(106, 'd3-road-1057-selected') });

  // 2. drag it ≈ 40 m east
  const east = at(await page.evaluate(([x, y, z]) => window.trapla.project(x + 40, y, z), [grab.x, grab.y, grab.z]));
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(east.x, east.y, { steps: 14 }); await page.mouse.up(); await idle();
  const project = await page.evaluate(() => window.trapla.getProject());
  const rebuilt = project.routes.find(r => r.source);
  assert(rebuilt, 'the drag rebuilt the stretch'); assert.equal(rebuilt.name, 'Road III/1057');
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), rebuilt.id);

  // 3. traffic: filled in, labelled, reachable; never asked for
  const ops = rebuilt.specification.operations;
  assert(ops.aadt > 0 && ops.trafficUnknown === undefined, 'traffic is filled in');
  const basis = await text('.route-traffic .traffic-basis');
  assert.match(basis, /Not counted in the traffic census: the average class III road is assumed|Counted in the \d{4} traffic census/);
  const reachable = () => page.evaluate(() => [...document.querySelectorAll('.route-traffic input')].map(input => {
    input.scrollIntoView({ block: 'nearest' });
    const b = input.getBoundingClientRect(), top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { name: input.name, label: input.getAttribute('aria-label'), onTop: top === input, value: input.value };
  }));
  let fields = await reachable();
  assert.equal(fields.length, 2); assert(fields.every(f => f.onTop && f.label && f.value !== ''), `both traffic fields are filled, labelled and not covered (${JSON.stringify(fields)})`);
  assert(!/Traffic not set/.test(await text('#hud')), 'nothing asks for traffic');
  console.log(`Road III/1057: ${ops.aadt} vehicles/day, ${Math.round(ops.heavyShare * 1000) / 10} % heavy. ${basis}`);

  // 4. our motorway is checked against the new line; the old stretch is off the map, priced or not
  const after = await result();
  const motorway = after.routes[start.ours[0]].legacy;
  assert.equal(motorway.crossings.some(c => c.roadId === grab.roadId), false, 'the old road is no crossing of our motorway any more');
  assert.deepEqual(motorway.violations.map(v => v.title).filter(t => /pier|class III/i.test(t)), [], 'no pier on, or crossing of, the old road');
  assert.equal(motorway.crossings.find(c => c.crossedRoute?.id === rebuilt.id)?.type, 'bridge', 'our bridge spans the rebuilt road');
  assert.deepEqual(after.acceptedReplacements.map(i => i.sourceId), [grab.id], 'the old stretch is gone from the map');
  assert(!after.issues.some(i => i.code === 'roads-cross'), 'no unchecked crossing');
  // our motorway's own bill: the rebuilt road is still under our bridge and our abutments keep clear of it
  // (walls, bridge length), so it never gets cheaper (QA re-test 2: it fell 38 M CZK when they ignored the
  // rebuilt road); a new line beside an abutment may cost it more
  // (judged around the crossing: the fill balance of the whole motorway may tip a marginal structure
  // choice kilometres away, either way)
  const billOf = id => after.cost.alone[id] ?? after.routes[id].legacy.cost.total;
  const moved = billOf(start.ours[0]) - start.alone;
  const local = await page.evaluate(([id, s]) => window.trapla.localWorks(window.trapla.projectResult().routes[id].legacy, s), [start.ours[0], start.crossings[0].s]);
  assert(local.bridge >= start.local.bridge - 0.5, `our bridge over it is no shorter (${start.local.bridge.toFixed(0)} → ${local.bridge.toFixed(0)} m)`);
  assert(local.walls >= start.local.walls, `our walls beside it stay (${start.local.walls} → ${local.walls})`);
  assert(local.wallLength >= start.local.wallLength - 10, `our walls beside it stay as long (${start.local.wallLength.toFixed(0)} → ${local.wallLength.toFixed(0)} m)`);
  assert(local.cost - start.local.cost > -2e6, `our works around it do not get cheaper (${((local.cost - start.local.cost) / 1e6).toFixed(1)} M CZK)`);
  console.log(`our motorway around the crossing: bridge ${start.local.bridge.toFixed(0)} → ${local.bridge.toFixed(0)} m, walls ${start.local.walls} → ${local.walls} (${start.local.wallLength.toFixed(0)} → ${local.wallLength.toFixed(0)} m), ${((local.cost - start.local.cost) / 1e6).toFixed(2)} M CZK; its whole bill moved ${(moved / 1e6).toFixed(2)} M CZK`);

  // 5. the score: a total, or which change holds it back and what is priced
  // houses that hear both roads are decided together (combined noise): never what holds the total back
  assert(!after.cost.unpriced.some(u => u.reason === 'shared-noise'), `houses heard by both roads are decided together (${after.cost.unpriced.map(u => u.reason)})`);
  const scope = await text('#cost-scope'), sub = await text('#perkm');
  if (after.cost.total === null) {
    assert.equal(scope, 'This road only');
    assert.match(sub, /^Road III\/1057 not priced yet\. Our motorway alone: [\d.]+ bn CZK$/, `one road change, our road's price in view (${sub})`);
    console.log(`no total: ${[...new Set(after.cost.unpriced.map(u => u.reason))].join(', ')}. "${scope} ${await text('#total')}" / "${sub}"`);
  } else { assert.equal(scope, 'Total cost'); console.log(`priced: ${(after.cost.total / 1e9).toFixed(3)} bn CZK`); }
  for (const i of after.issues) console.log(`  ${i.check === 'not-checked' ? 'not checked' : 'violation'}: ${i.violation.title} | ${i.violation.fix}`);
  for (const v of after.routes[rebuilt.id].legacy.inherited ?? []) console.log(`  note: ${v.title}`);
  for (const w of after.works.items.filter(w => w.label)) console.log(`  work: ${w.label} ${(w.cost / 1e6).toFixed(1)} M`);
  await page.evaluate(() => window.trapla.select(null));
  await page.screenshot({ path: shot(107, 'd3-road-1057-rebuilt') });

  // 6. houses under our motorway: drawn and said "Bought out", whatever is priced
  const own = motorway.demolished.map(b => b.j);
  assert.deepEqual(own.filter(j => !after.buildings.some(b => b.buildingIndex === j && b.action === 'demolish')), [], 'the result lists our demolitions');
  assert.deepEqual(await page.evaluate(list => list.filter(j => !window.trapla.buildingTaken(j)), own), [], 'every house on our motorway is drawn bought out');
  if (own.length) {
    await page.evaluate(j => window.trapla.selectBuilding(j), own[0]); await idle();
    const card = await text('#inspector');
    assert(/Bought out/.test(card) && !/not finished|Not checked yet/.test(card), `a house under our motorway says it is bought out (${card})`);
    await page.evaluate(() => window.trapla.select(null));
  }
  console.log(`${own.length} houses under our motorway stay bought out (project ${after.cost.total === null ? 'not priced' : 'priced'})`);

  // 7. a bend of the rebuilt road selected: its traffic is still on the card
  await page.evaluate(id => window.trapla.setActiveRoute(id), rebuilt.id); await idle();
  await page.evaluate(() => window.trapla.selectPi(0)); await idle();
  assert.equal(await page.locator('#inspector.k-bend').count(), 1, 'a bend card');
  fields = await reachable();
  assert(fields.length === 2 && fields.every(f => f.onTop), 'the traffic fields stay reachable above the bend card');
  await page.locator('#inspector').screenshot({ path: shot(108, 'd3-road-1057-card') });
  await page.evaluate(() => window.trapla.select(null));

  // 8. Build → Road: our motorway refuses in plain words; the pointer shows where an end would go
  await page.locator('#build-route').click();
  await page.locator('.route-build-choices button', { hasText: 'Road' }).click();
  const sm = await page.evaluate(id => { const r = window.trapla.projectResult().routes[id].legacy;
    for (const f of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) { const i = Math.round(r.n * f);
      if ([-40, -20, 0, 20, 40].every(d => r.kind[Math.max(0, Math.min(r.n - 1, i + Math.round(d / r.ds)))] === 0)) return { s: r.s[i], x: r.x[i], y: r.y[i] }; }
    return null; }, start.ours[0]);
  assert(sm, 'our motorway runs on the ground somewhere');
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 1500, 0, 60), [sm.x, sm.y]); await idle();
  point = at(await page.evaluate(([id, s]) => window.trapla.routeScreen(id, s), [start.ours[0], sm.s]));
  await page.mouse.move(point.x - 3, point.y); await page.mouse.move(point.x, point.y); await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.trapla.buildHover()), 'cannot start here');
  await page.mouse.click(point.x, point.y);
  assert.match(await text('#inspector'), /A motorway can only be joined at an interchange/);
  assert(!/not checked yet/.test(await text('#inspector')), 'not the "not checked yet" refusal');
  // on its earthworks beside the carriageway, priced or not: still our motorway, never "open ground"
  for (const side of [1, -1]) {
    const slope = at(await page.evaluate(([id, s, side]) => { const t = window.trapla, r = t.projectResult().routes[id].legacy, i = Math.round(s / r.ds);
      const off = (side > 0 ? r.dayL[i] : r.dayR[i]) - 2;
      return t.project(r.x[i] - r.ty[i] * off * side, r.y[i] + r.tx[i] * off * side, side > 0 ? r.zDayL[i] : r.zDayR[i]); }, [start.ours[0], sm.s, side]));
    const p = await page.evaluate(([x, y]) => window.trapla.placementAt(x, y), [slope.x, slope.y]);
    assert(p && !p.ok && /interchange/.test(p.why), `the motorway's slope is the motorway (${JSON.stringify(p)})`);
  }
  // open ground beside the motorway
  let free = null;
  for (const [dx, dy] of [[-260, -120], [260, -120], [-260, 120], [260, 120], [-340, 0], [340, 0]]) {
    const p = await page.evaluate(([x, y]) => window.trapla.placementAt(x, y), [point.x + dx, point.y + dy]);
    if (p?.ok && p.end.anchor.kind === 'free') { free = { x: point.x + dx, y: point.y + dy }; break; }
  }
  assert(free, 'open ground beside the motorway');
  await page.mouse.move(free.x - 3, free.y); await page.mouse.move(free.x, free.y); await page.waitForTimeout(80);
  assert.match(await page.evaluate(() => window.trapla.buildHover()), /^open ground/);
  await page.mouse.click(free.x, free.y);
  await page.mouse.move(free.x + 10, free.y + 2, { steps: 3 }); await page.waitForTimeout(80);
  assert.match(await page.evaluate(() => window.trapla.buildHover()), /^\d+ m: too short, at least 100 m$/);
  const away = { x: free.x + (free.x < point.x ? -220 : 220), y: free.y + 60 };
  await page.mouse.move(away.x, away.y, { steps: 8 }); await page.waitForTimeout(80);
  const hover = await page.evaluate(() => window.trapla.buildHover());
  assert.match(hover, /^(\d+ m|\d\.\d\d km) · /, `the hover says how long the road would be and what it joins (${hover})`);
  assert.equal(await page.locator('.build-band:visible').count(), 1, 'a line from the start to the pointer');
  await page.screenshot({ path: shot(109, 'build-road-placing') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.build-hover:visible, .build-band:visible').count(), 0, 'Escape clears the placing marks');
  assert.deepEqual(errors, []);
  console.log('PASS owner D3: III/1057 rebuilt under our motorway bridge / traffic filled in / houses / score / Build → Road placing');
} finally {
  await browser?.close();
  await server.close();
}
