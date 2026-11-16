// Real-mouse "edit any road" on a pack with road links (D3): one road → no road list; click a mapped
// road away from ours (card, highlighted stretch, no edit); drag it → the stretch becomes a project road
// bent under the pointer, with its profile and own price (one undo step); its traffic; the road list;
// undo/redo; an end handle; reload; Build → Road with one end on a mapped road and one on open ground;
// the photo with the mapped roads. Run on D11 (default) and D3: SCENARIO=d3 node scripts/any-road-scene.mjs.
// NO_LINKS_SCENARIO=<id> also checks a pack without road links says so. [--gpu] [--docs]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const docs = process.argv.includes('--docs');
const out = docs ? 'docs/screenshots' : '/tmp/trapla-any-road';
const shot = (n, name) => `${out}/${docs ? `${n}-` : ''}${name}.png`;
const first = Number(process.env.SHOT ?? 100);
mkdirSync(out, { recursive: true });
const scenario = process.env.SCENARIO ?? 'd11';
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5244), strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  let page = await context.newPage();
  const errors = [], watch = p => p.on('pageerror', error => errors.push(error.message));
  watch(page);
  const open = async (id) => {
    const url = `${server.resolvedUrls.local[0]}?scenario=${id}`;
    await page.goto(url);
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
    return url;
  };
  let url = await open(scenario);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('trapla.intro.v2', '1'); });
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  const idle = async (p = page) => {
    await p.evaluate(() => window.trapla.whenIdle());
    await p.evaluate(() => new Promise(resolve => {
      const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
      requestAnimationFrame(() => requestAnimationFrame(frame));
    }));
  };
  await idle();
  assert.equal(await page.evaluate(() => window.trapla.whenTransport()), true, 'the road links load');
  const box = await page.locator('#view').boundingBox();
  const screen = async (fn, ...args) => {
    const p = await page.evaluate(([fn, args]) => window.trapla[fn](...args), [fn, args]);
    assert(p?.vis, `${fn}(${args}) is on screen`);
    return { x: box.x + p.sx, y: box.y + p.sy };
  };
  const revision = () => page.evaluate(() => window.trapla.projectSnapshot().revision);
  const routes = () => page.evaluate(() => window.trapla.getProject().routes.map(r => r.id));
  const initial = await page.evaluate(() => window.trapla.getProject());

  // 0. one road: no road list, a Build button
  assert.equal(await page.locator('#active-route').isVisible(), false, 'no road list with a single road');
  assert.equal(await page.locator('#build-route').isVisible(), true);

  // a long rebuildable road well clear of our road
  const roads = await page.evaluate(() => window.trapla.baseRoads(700));
  // far from our road first (its noise reaches ~3.6 km on D11, so a nearer change waits for combined noise)
  const far = roads.filter(r => r.rebuildable && ['I', 'II', 'III'].includes(r.legalClass) && r.clear > 800 && r.length < 3000).sort((a, b) => (b.clear > 4000) - (a.clear > 4000) || b.length - a.length);
  let road = null;
  for (const r of far) {
    await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 900), [r.id, r.length / 2]);
    if ((await page.evaluate(([id, s]) => window.trapla.sourceScreen(id, s), [r.id, r.length / 2]))?.vis) { road = r; break; }
  }
  assert(road, 'a rebuildable mapped road away from our road exists');
  const mid = road.length / 2;
  console.log(`mapped road ${road.name} ${Math.round(road.length)} m, ${Math.round(road.clear)} m from our road`);
  await idle();

  // 0b. cold start: a fresh page, before the road links are loaded. Hovering the road shows the grab cursor;
  // a click opens its card; a drag at once never pans the map and rebuilds the road once the links are in
  {
    const p0 = await page.evaluate(([id, s]) => window.trapla.sourcePoint(id, s), [road.id, mid]);
    const fresh = async () => {
      const c = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      await c.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
      const p = await c.newPage(); watch(p);
      await p.goto(url); await p.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }); await idle(p);
      await p.evaluate(([x, y]) => window.trapla.lookAt(x, y, 900, 0, 55), [p0.x, p0.y]); await idle(p);
      assert.equal(await p.evaluate(() => window.trapla.transportLoaded()), false, 'a fresh page has not loaded the road links');
      const q = await p.evaluate(([x, y]) => window.trapla.groundScreen(x, y), [p0.x, p0.y]); assert(q?.vis);
      return { c, p, at: { x: box.x + q.sx, y: box.y + q.sy } };
    };
    let { c, p, at } = await fresh();
    await p.mouse.move(at.x - 4, at.y); await p.mouse.move(at.x, at.y); await p.waitForTimeout(100);
    assert.equal(await p.evaluate(() => document.querySelector('#view canvas').style.cursor), 'grab', 'a mapped road shows the grab cursor at once');
    await p.mouse.click(at.x, at.y);
    await p.locator('#inspector.k-source').waitFor({ timeout: 20000 });
    assert.match(await p.locator('#inspector').textContent(), /Drag it to change its line/, 'the first click opens its card');
    await c.close();
    ({ c, p, at } = await fresh());
    const pose = await p.evaluate(() => window.trapla.cameraTarget());
    await p.mouse.move(at.x, at.y); await p.mouse.down();
    const cold = !(await p.evaluate(() => window.trapla.transportLoaded()));
    await p.mouse.move(at.x + 30, at.y - 30, { steps: 12 });
    await p.waitForFunction(() => window.trapla.transportLoaded(), null, { timeout: 20000 });
    await p.mouse.move(at.x + 32, at.y - 30); await p.mouse.up(); await idle(p);
    const after = await p.evaluate(() => window.trapla.cameraTarget());
    assert(Math.hypot(after.x - pose.x, after.y - pose.y) < 0.5, `the first drag does not pan the map (${JSON.stringify([pose, after])})`);
    const rebuiltCold = (await p.evaluate(() => window.trapla.getProject())).routes.find(r => r.source);
    assert(rebuiltCold?.source.intervals[0].sourceId === road.id, 'the first drag rebuilds the road');
    console.log(`cold start: grab cursor, card on the first click, the first drag rebuilt ${road.name}${cold ? ' (pressed before the links were in)' : ''}`);
    await c.close();
  }

  // 1. click: its card and highlighted stretch, no edit; Escape closes it
  const before = await revision();
  let point = await screen('sourceScreen', road.id, mid); await page.mouse.click(point.x, point.y);
  await page.locator('#inspector.k-source').waitFor({ timeout: 5000 });
  assert.match(await page.locator('#inspector').textContent(), /Drag it to change its line/);
  const stretch = (await page.evaluate(() => window.trapla.sourceSelection())).interval;
  assert.equal(stretch.sourceId, road.id); assert(stretch.s0 <= mid && stretch.s1 >= mid);
  assert.equal(await revision(), before, 'selecting a mapped road is not an edit');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspector.k-source').count(), 0, 'Escape closes the card');

  // 2. click again, then drag it sideways: the stretch becomes a project road, bent under the pointer
  point = await screen('sourceScreen', road.id, mid); await page.mouse.click(point.x, point.y);
  await page.locator('#inspector.k-source').waitFor({ timeout: 5000 });
  await page.screenshot({ path: shot(first, 'mapped-road-selected') });
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y - 30, { steps: 12 }); await page.mouse.up();
  await idle();
  const ids = await routes(); assert.equal(ids.length, 2, 'the drag rebuilt the stretch as a second road');
  const mission = ids[0], rebuilt = ids[1];
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), rebuilt, 'the rebuilt road is the active one');
  const project = await page.evaluate(() => window.trapla.getProject());
  const route = project.routes[1];
  assert.equal(route.alignment.kind, 'pi'); assert.equal(route.source.intervals[0].sourceId, road.id);
  assert(project.connections.filter(c => c.ports.some(p => p.kind === 'route' && p.routeId === rebuilt)).length >= 2, 'its ends stay joined to the old road');
  const result = await page.evaluate(() => window.trapla.projectResult());
  assert(result.routes[rebuilt].legacy, 'the rebuilt road is engineered');
  // its traffic is filled in (its census count, or the average of its class) and says where it comes from
  const ops0 = route.specification.operations;
  assert(ops0.aadt > 0 && ops0.trafficUnknown === undefined, 'its traffic is filled in');
  const basis = await page.locator('.route-traffic .traffic-basis').textContent();
  assert.match(basis, /Counted in the \d{4} traffic census|the average class I+ road is assumed/);
  assert(!result.issues.some(i => /traffic/.test(i.code)) && !/Traffic not set/.test(await page.locator('#inspector').textContent()), 'traffic is never asked for');
  assert.deepEqual(result.cost.unpriced.map(u => u.reason).filter(r => !/^shared-|too-many/.test(r)), [], 'priced from the first drag unless roads interact');
  console.log(`${route.name}: ${ops0.aadt} vehicles/day, ${Math.round(ops0.heavyShare * 1000) / 10} % heavy. ${basis}`);
  assert.equal(await page.evaluate(() => window.trapla.profileHasRoad()), true, 'it has a profile');
  assert.equal(await page.locator('#cost-scope').textContent(), result.cost.total === null ? 'This road only' : 'Total cost', 'a priced project shows its total, an unpriced one this road\'s own price');
  assert.equal(await page.locator('#active-route').isVisible(), true, 'two roads: the road list appears');
  await page.evaluate(() => window.trapla.select(null));
  await page.screenshot({ path: shot(first + 1, 'mapped-road-rebuilt') });

  // 3. one undo step restores the untouched mapped road exactly; redo brings the change back
  const untouched = await page.evaluate(() => window.trapla.getProject());
  await page.locator('#undo').click(); await idle();
  assert.equal((await routes()).length, 1, 'one undo removes the whole first drag');
  const restored = await page.evaluate(() => window.trapla.getProject());
  assert.deepEqual(restored.connections, [], 'no connection of the change survives');
  assert.deepEqual(restored.routes, [untouched.routes[0]], 'our road is exactly as before');
  assert.equal(await page.locator('.stretch-end').count(), 0, 'no stretch handles remain');
  await page.locator('#redo').click(); await idle();
  assert.equal((await routes()).length, 2);
  await page.evaluate(id => window.trapla.setActiveRoute(id), rebuilt); await idle();
  await page.evaluate(() => window.trapla.select(null));

  // 3b. drag its End handle further along the old road: one edit, the stretch grows, side roads stay joined
  assert.equal(await page.locator('.stretch-end:visible').count(), 2, 'a rebuilt stretch shows its two end handles');
  const iv0 = (await page.evaluate(() => window.trapla.getProject())).routes[1].source.intervals[0];
  if (iv0.s1 + 150 < road.length || iv0.s0 > 150) {
    const handle = iv0.s1 + 150 < road.length ? 1 : 0, target = handle ? iv0.s1 + 120 : iv0.s0 - 120;
    await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 900), [road.id, handle ? iv0.s1 : iv0.s0]); await idle();
    const h = await page.locator(`.stretch-end[data-end="${handle}"]`).boundingBox(), to = await screen('sourceScreen', road.id, target);
    const r0 = await revision();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 }); await page.mouse.up(); await idle();
    const iv1 = (await page.evaluate(() => window.trapla.getProject())).routes[1].source.intervals[0];
    assert(handle ? iv1.s1 > iv0.s1 + 60 : iv1.s0 < iv0.s0 - 60, `the ${handle ? 'End' : 'Start'} handle moved along the old road (${JSON.stringify(iv0)} → ${JSON.stringify(iv1)})`);
    assert(await revision() > r0, 'an edit');
    assert((await page.evaluate(() => window.trapla.projectResult())).routes[rebuilt].legacy, 'still engineered');
  }

  // 4. its traffic stays editable in its card
  await page.fill('.route-traffic input[name=traffic]', '2500');
  await page.fill('.route-traffic input[name=heavy]', '10');
  await page.locator('.route-traffic input[name=heavy]').press('Enter'); await idle();
  const ops = (await page.evaluate(() => window.trapla.getProject())).routes[1].specification.operations;
  assert.equal(ops.aadt, 2500); assert.equal(ops.heavyShare, 0.1);
  assert.equal(await page.locator('.route-traffic .traffic-basis').count(), 0, 'the player\'s own number carries no label');

  // 4b. the replacement stays priced: nothing but road interactions may keep it unpriced
  const priced = await page.evaluate(() => window.trapla.projectResult());
  const left = priced.cost.unpriced.map(u => u.reason).filter(r => !/^shared-|too-many/.test(r));
  assert.deepEqual(left, [], 'a rebuilt stretch with its traffic is priced (removal, side roads) unless roads interact');
  if (priced.cost.total !== null) {
    assert(priced.works.items.every(w => w.owner.id === rebuilt), 'its works are its own');
    assert.deepEqual(priced.acceptedReplacements.map(i => i.sourceId), [road.id], 'the old stretch is accepted off the map');
    console.log(`priced: ${(priced.cost.total / 1e9).toFixed(3)} bn CZK, works ${priced.works.items.map(w => w.label).join('; ')}`);
  } else console.log(`unpriced only because roads interact: ${priced.cost.unpriced.map(u => u.reason).join(', ')}`);
  await page.evaluate(() => window.trapla.select(null));
  await page.screenshot({ path: shot(first + 4, 'rebuilt-road-priced') });

  // 5. reload keeps it
  await page.close(); page = await context.newPage(); watch(page);
  url = await open(scenario); await idle();
  assert.equal(await page.evaluate(() => window.trapla.whenTransport()), true);
  assert.equal((await page.evaluate(() => window.trapla.getProject())).routes.length, 2);

  // 6. Build → Road: start on the mapped road beyond the rebuilt stretch, end on open ground
  await page.locator('#build-route').click();
  assert.deepEqual(await page.locator('.route-build-choices button').allTextContents(), ['Road'], 'only Road can be built yet');
  await page.locator('.route-build-choices button', { hasText: 'Road' }).click();
  assert.equal(await page.evaluate(() => window.trapla.building()), true);
  const now = (await page.evaluate(() => window.trapla.getProject())).routes[1].source.intervals[0];
  const sOn = now.s1 + 100 < road.length ? now.s1 + 70 : now.s0 - 70;
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 1400), [road.id, sOn]); await idle();
  point = await screen('sourceScreen', road.id, sOn); await page.mouse.click(point.x, point.y);
  assert.match(await page.locator('#inspector').textContent(), /Click where it ends/);
  // an end on open ground: the first nearby spot where a click joins no road
  let free = null;
  for (const [dx, dy] of [[-160, -90], [160, -90], [-160, 90], [160, 90], [-220, 0], [220, 0], [0, -160], [0, 160]]) {
    const p = await page.evaluate(([x, y]) => window.trapla.placementAt(x, y), [point.x + dx, point.y + dy]);
    if (p?.ok && p.end.anchor.kind === 'free') { free = { x: point.x + dx, y: point.y + dy }; break; }
  }
  assert(free, 'open ground near the road');
  await page.mouse.click(free.x, free.y); await idle();
  const built = await page.evaluate(() => window.trapla.getProject());
  if (built.routes.length !== 3) { console.log('inspector:', await page.locator('#inspector').textContent()); await page.screenshot({ path: `${out}/fail-build.png` }); }
  assert.equal(built.routes.length, 3, 'Build made a third road');
  const fresh = built.routes[2];
  assert.equal(fresh.endpoints.a.anchor.kind, 'source'); assert.equal(fresh.endpoints.b.anchor.kind, 'free');
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), fresh.id);
  const r3 = await page.evaluate(() => window.trapla.projectResult());
  assert(r3.issues.some(i => i.code === 'road-ends-nowhere'), 'a free end is reported');
  assert.equal(r3.cost.total, null, 'a road that ends nowhere is not priced');
  // not priced withholds the total only: houses under our road are gone from the map and say so
  {
    const result = r3, own = result.routes[mission].legacy.demolished.map(b => b.j);
    assert.deepEqual(own.filter(j => !result.buildings.some(b => b.buildingIndex === j && b.action === 'demolish')), [], 'the unpriced project still lists our demolitions');
    assert.deepEqual(await page.evaluate(list => list.filter(j => window.trapla.buildingShown(j)), own), [], 'no house stands on our road while the project is not priced');
    if (own.length) {
      await page.evaluate(j => window.trapla.selectBuilding(j), own[0]); await idle();
      const card = await page.locator('#inspector').textContent();
      assert(/Demolished/.test(card) && !/not finished|Not checked yet/.test(card), `a house under our road says it is demolished (${card})`);
      await page.evaluate(() => window.trapla.select(null));
      await page.evaluate(id => window.trapla.setActiveRoute(id), fresh.id); await idle();
      assert.equal(await page.evaluate(() => window.trapla.activeRoute()), fresh.id);
    }
    console.log(`unpriced project: ${own.length} houses under our road stay demolished`);
  }
  // bend it like our road
  const s3 = await page.evaluate(id => window.trapla.projectResult().routes[id].legacy.length / 2, fresh.id);
  point = await screen('routeScreen', fresh.id, s3);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x - 40, point.y + 30, { steps: 10 }); await page.mouse.up(); await idle();
  assert.equal((await page.evaluate(() => window.trapla.getProject())).routes[2].alignment.pis.length, 1, 'the new road bent');
  await page.evaluate(() => window.trapla.select(null));
  await page.screenshot({ path: shot(first + 2, 'new-road-built') });
  assert.deepEqual(errors, []);

  // 6b. Build → Road from our road to a mapped road: its junction with our road is built and billed
  const mission0 = (await page.evaluate(() => window.trapla.getProject())).routes[0];
  // a station where our road runs on the ground (a road cannot join on a bridge)
  const sm = await page.evaluate(id => { const r = window.trapla.projectResult().routes[id].legacy;
    for (const f of [0.45, 0.4, 0.5, 0.35, 0.55, 0.3, 0.6, 0.25, 0.65]) { const i = Math.round(r.n * f);
      if ([-30, -15, 0, 15, 30].every(d => r.kind[Math.max(0, Math.min(r.n - 1, i + Math.round(d / r.ds)))] === 0)) return r.s[i]; }
    return r.length * 0.45; }, mission0.id);
  await page.evaluate(([id, s]) => { const r = window.trapla.projectResult().routes[id].legacy, i = Math.round(s / r.ds); window.trapla.lookAt(r.x[i], r.y[i], 1600, 0, 60); }, [mission0.id, sm]);
  await idle();
  const target = await page.evaluate(([id, s]) => {
    const t = window.trapla, r = t.projectResult().routes[id].legacy, i = Math.round(s / r.ds);
    // a mapped road off to the side of ours (roughly square to it), not along it
    const o = t.project(r.x[i], r.y[i], r.grade[i]), ahead = t.project(r.x[Math.min(r.n - 1, i + 20)], r.y[Math.min(r.n - 1, i + 20)], r.grade[i]);
    const ux = ahead.sx - o.sx, uy = ahead.sy - o.sy, ul = Math.hypot(ux, uy) || 1;
    return t.baseRoads(150).map(b => ({ b, p: t.sourceScreen(b.id, b.length / 2) }))
      .filter(({ p }) => p?.vis).map(({ b, p }) => { const dx = p.sx - o.sx, dy = p.sy - o.sy, d = Math.hypot(dx, dy);
        return { id: b.id, s: b.length / 2, d, square: Math.abs(dx * uy - dy * ux) / (ul * (d || 1)) }; })
      .filter(c => c.d > 150 && c.d < 450 && c.square > 0.7).sort((a, b) => b.square - a.square || a.d - b.d)[0] ?? null;
  }, [mission0.id, sm]);
  if (target) {
    await page.locator('#build-route').click(); await page.locator('.route-build-choices button', { hasText: 'Road' }).click();
    point = await screen('routeScreen', mission0.id, sm); await page.mouse.click(point.x, point.y);
    assert.match(await page.locator('#inspector').textContent(), /joins our road/);
    point = await screen('sourceScreen', target.id, target.s); await page.mouse.click(point.x, point.y); await idle();
    const joined = (await page.evaluate(() => window.trapla.getProject())).routes.at(-1);
    assert.equal(joined.endpoints.a.anchor.kind, 'route'); assert.equal(joined.endpoints.b.anchor.kind, 'source');
    const pr = await page.evaluate(() => window.trapla.projectResult());
    assert(pr.works.items.some(w => w.owner.id === joined.id && w.label === 'Junction with our road'), 'its junction with our road is billed');
    assert(!pr.issues.some(i => i.code === 'connection-pending' && i.scope.routeIds.includes(joined.id)), 'no unbuilt junction');
    await page.evaluate(() => window.trapla.select(null));
    // the junction with our road: Auto (a T) or a roundabout, in the road's card
    await page.locator('.route-junctions button[data-end="a"]', { hasText: 'Roundabout' }).click(); await idle();
    const rb = await page.evaluate(() => window.trapla.projectResult());
    assert(rb.works.items.some(w => w.owner.id === joined.id && w.label === 'Roundabout on our road'), 'the roundabout replaces the T');
    assert.equal((await page.evaluate(() => window.trapla.getProject())).routes.at(-1).alignment.controls.junctionForms?.a, 'roundabout');
    await page.evaluate(() => window.trapla.select(null));
    await page.screenshot({ path: shot(first + 5, 'side-road-joins-ours') });
  } else console.log('no mapped road on screen near our road: join-ours step skipped');

  // 6c. a side road's crossing card speaks of "this road" ("our road" is the mission road)
  {
    const pr = await page.evaluate(() => window.trapla.projectResult()), p = await page.evaluate(() => window.trapla.getProject());
    const side = p.routes.filter(r => r.role !== 'mission').flatMap(r => (pr.routes[r.id]?.legacy?.crossings ?? []).filter(c => !c.crossedRoute).map(c => ({ route: r.id, c })));
    // the road an end is placed on is that end's junction, never a crossing a few metres on
    assert.deepEqual(side.filter(({ c }) => c.s < 5).map(({ c }) => c.cls), [], 'no crossing at a side road\'s start');
    if (side.length) {
      const { route, c } = side[0];
      await page.evaluate(id => window.trapla.setActiveRoute(id), route); await idle();
      await page.evaluate(id => window.trapla.selectCrossing(id), c.roadId); await idle();
      const card = await page.locator('#inspector').textContent();
      console.log(`a side road's crossing card: ${card.slice(card.indexOf('km ')).replace(/\s+/g, ' ')}`);
      assert(!/\b[Oo]ur road/.test(card), `a side road's crossing with a mapped road never calls the side road "our road" (${card})`);
      await page.evaluate(() => window.trapla.select(null));
    } else console.log('no side road crosses a mapped road: crossing-card wording not checked');
  }

  // 7. the photo keeps the mapped roads drawn (what is clickable)
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 1400), [road.id, mid]);
  await page.evaluate(() => window.trapla.setView({ photo: true }));
  await page.waitForFunction(() => !window.trapla.viewBusy(), null, { timeout: 90000 });
  if (await page.evaluate(() => window.trapla.photoWithNetwork())) await page.screenshot({ path: shot(first + 3, 'photo-mapped-roads') });
  else console.log('photo tiles did not arrive (external service): overlay not checked');
  await page.evaluate(() => window.trapla.setView({ photo: false }));

  // 7b. D11 villages: a street (Nový Rokytník) and a track (Lampertice) are rebuilt by a drag that starts on
  // them, unselected, under their own norms (ČSN 73 6110 local road, ČSN 73 6109 track); a drag on a mapped
  // motorway never pans the map: its card says it cannot be changed
  if (scenario === 'd11') {
    const dragOn = async (id, s, dx, dy) => {
      await page.keyboard.press('Escape'); await page.evaluate(() => window.trapla.select(null));
      await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 500), [id, s]); await idle();
      const p = await screen('sourceScreen', id, s);
      await page.mouse.move(p.x, p.y); await page.mouse.down();
      await page.mouse.move(p.x + dx, p.y + dy, { steps: 12 }); await page.mouse.up(); await idle();
      return p;
    };
    for (const [id, s, cs, cls, words] of [['osm:way:275065891', 1150, 'M7.5', 'local', /M 7\.5 \(local road\)/], ['osm:way:88594820', 620, 'P4', 'track', /P 4\.0 \(one-lane track\)/]]) {
      const n0 = (await routes()).length;
      await dragOn(id, s, 25, -25);
      const p = await page.evaluate(() => window.trapla.getProject()), r = p.routes.at(-1);
      assert.equal(p.routes.length, n0 + 1, `a drag on the ${cls} road ${id} rebuilt it`);
      assert.equal(r.source.intervals[0].sourceId, id);
      assert.deepEqual([r.specification.crossSection, r.specification.legalClass], [cs, cls]);
      const pr = await page.evaluate(() => window.trapla.projectResult()), own = pr.routes[r.id].legacy;
      assert(own, 'it is engineered');
      const rules = own.violations.filter(v => v.basis === 'norm').map(v => v.rule);
      assert(rules.every(t => !/6101/.test(t)), `its norm is its own, never ČSN 73 6101 (${rules.join(' | ')})`);
      // the street crosses our road's cutting on our bridge: it rides that deck, which is not its own bridge
      if (cls === 'local') {
        assert(pr.works.items.some(w => w.owner.id === r.id && /built with that bridge/.test(w.label)), 'the street rides our bridge over our road');
        assert(!own.violations.some(v => /Your bridge|on its bridge over/.test(v.title)), `on our bridge it is neither its own bridge nor off the deck (${own.violations.map(v => v.title).join('; ')})`);
      }
      assert.match(await page.locator('#norms').getAttribute('title'), cs === 'P4' ? /ČSN 73 6109/ : /ČSN 73 6110/);
      assert.match(await page.locator('#cat option:checked').textContent(), words);
      // the census counts class I–III roads only: its traffic is a guess, and says so
      assert.match(await page.locator('.route-traffic .traffic-basis').textContent(), /^Not counted: a guess/);
      console.log(`${cls} ${r.name} rebuilt as ${cs} at ${r.specification.designSpeed} km/h: ${Math.round(own.length)} m, ${(own.cost.total / 1e6).toFixed(1)} M CZK alone, ${own.violations.length} problems${own.violations.length ? ` (${own.violations.map(v => v.title).join('; ')})` : ''}`);
      await page.evaluate(() => window.trapla.select(null));
      await page.screenshot({ path: `${out}/rebuilt-${cls}.png` });
    }
    // A street bent 30 m off its old line across another street (D11 Hořice, osm:way:227688877): a crossroads at
    // that street's level, never a cut and a reroute (it used to be cut and rerouted for millions).
    {
      const id = 'osm:way:227688877', s = 122; // Topolová, 244 m
      await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 500), [id, s]); await idle();
      const [g, g2] = await page.evaluate(([id, s]) => [window.trapla.sourcePoint(id, s), window.trapla.sourcePoint(id, s + 5)], [id, s]);
      const l = Math.hypot(g2.x - g.x, g2.y - g.y), to = await page.evaluate(([x, y, z]) => window.trapla.project(x, y, z),
        [g.x - (g2.y - g.y) / l * 30, g.y + (g2.x - g.x) / l * 30, g.z]);
      const from = await screen('sourceScreen', id, s), n0 = (await routes()).length;
      await dragOn(id, s, box.x + to.sx - from.x, box.y + to.sy - from.y);
      const p = await page.evaluate(() => window.trapla.getProject()), r = p.routes.at(-1);
      assert.equal(p.routes.length, n0 + 1, 'the street is rebuilt');
      const own = (await page.evaluate(() => window.trapla.projectResult())).routes[r.id].legacy;
      const minor = own.crossings.filter(c => ['residential', 'unclassified', 'living_street', 'service', 'track'].includes(c.cls));
      assert(minor.length, 'its new line crosses another street');
      assert(minor.every(c => c.type === 'junction' && c.cost <= 1e6), `it meets them in crossroads (${minor.map(c => `${c.cls} ${c.type} ${(c.cost / 1e6).toFixed(2)} M`).join('; ')})`);
      await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 350), [minor[0].x, minor[0].y]); await idle();
      console.log(`a street bent 30 m across another street: ${minor.map(c => `${c.cls} ${c.type} ${(c.cost / 1e6).toFixed(2)} M CZK, ${c.h.toFixed(1)} m from its level`).join('; ')}`);
      await page.evaluate(() => window.trapla.select(null));
      await page.screenshot({ path: `${out}/rebuilt-crossroads.png` });
    }
    // A house heard by our road and a rebuilt street (Nový Rokytník, over our cutting), decided once for the
    // project: its card gives both roads' noise added together, each road's share and what was decided.
    {
      await page.evaluate(d => window.trapla.setProject(d), initial); await idle();
      await dragOn('osm:way:275065891', 1150, 25, -25);
      const pr = await page.evaluate(() => window.trapla.projectResult());
      assert(pr.complete, 'our road and the rebuilt street are priced together');
      const both = pr.receivers.find(q => q.together && q.contributions.length > 1);
      assert(both, 'a house hears both roads');
      await page.evaluate(j => window.trapla.selectBuilding(j), both.buildingIndex); await idle();
      const card = await page.locator('#inspector').textContent();
      assert.match(card, /both roads together \(limit \d+\): (our road|Street) [\d.]+ dB, (our road|Street) [\d.]+ dB\./, 'the house card gives both roads’ noise added together');
      const k = card.indexOf('roads together');
      console.log(`house ${both.buildingIndex} heard by both roads (${both.together.decision}): "…${card.slice(Math.max(0, k - 50), k + 110)}…"`);
      await page.screenshot({ path: `${out}/house-together.png` });
    }
    // The km 4.1 track our road runs over (and reroutes to the bridge at km 4.01): a drag on it north of us
    // rebuilds it from where our earthworks end; our reroute of what is left stays ours: one total
    {
      await page.evaluate(d => window.trapla.setProject(d), initial); await idle();
      const id = 'osm:way:1315656940', s = 405;
      await dragOn(id, s, 25, -25);
      const p = await page.evaluate(() => window.trapla.getProject()), r = p.routes.at(-1);
      assert.equal(r.source?.intervals[0].sourceId, id, 'the track is rebuilt');
      assert(r.source.intervals[0].s0 > 270, `it starts where our earthworks end (${Math.round(r.source.intervals[0].s0)} m)`);
      const pr = await page.evaluate(() => window.trapla.projectResult());
      if (process.env.DUMP_TRACK) console.log(JSON.stringify({ route: r, issues: pr.issues }));
      assert.deepEqual(pr.issues.filter(i => i.check === 'not-checked').map(i => i.violation.title), [], 'nothing keeps the project from its total');
      assert(pr.cost.total !== null, 'priced together');
      console.log(`the km 4.1 track rebuilt from ${Math.round(r.source.intervals[0].s0)} m (beyond our earthworks): total ${(pr.cost.total / 1e9).toFixed(3)} bn CZK`);
    }
    // One pull of road I/37 through the houses beside our road (QA re-test 2: 5× "Two roads take the same
    // house", no total): a house our road takes is gone, the other road's noise there is moot; a house both
    // roads take is taken once
    {
      await page.evaluate(d => window.trapla.setProject(d), initial); await idle();
      await dragOn('osm:way:234919601', 280, -45, 0);
      const p = await page.evaluate(() => window.trapla.getProject()), r = p.routes.at(-1);
      assert.equal(r.source?.intervals[0].sourceId, 'osm:way:234919601', 'road I/37 is rebuilt');
      const pr = await page.evaluate(() => window.trapla.projectResult());
      const shared = pr.issues.filter(i => i.code === 'shared-building' || i.code === 'shared-noise');
      assert.deepEqual(shared.map(i => i.violation.title), [], 'no house is left undecided between the two roads');
      console.log(`road I/37 pulled 45 px: ${pr.cost.total === null ? `not priced (${[...new Set(pr.cost.unpriced.map(u => u.reason))]})` : `total ${(pr.cost.total / 1e9).toFixed(3)} bn CZK`}`);
    }
    let motorway = null;
    for (const id of await page.evaluate(() => ['motorway', 'trunk', 'railway'].flatMap(h => window.trapla.sourceIds(h, 400)))) {
      await page.evaluate(id => window.trapla.lookAtSource(id, 200, 500), id); await idle();
      if ((await page.evaluate(id => window.trapla.sourceScreen(id, 200), id))?.vis) { motorway = id; break; }
    }
    if (motorway) {
      const n0 = (await routes()).length;
      const at = await dragOn(motorway, 200, 60, -40);
      assert.equal((await routes()).length, n0, 'a mapped motorway or railway is not rebuilt');
      const still = await screen('sourceScreen', motorway, 200);
      assert(Math.hypot(still.x - at.x, still.y - at.y) < 2, 'a drag on it does not pan the map');
      const card = await page.locator('#inspector').textContent();
      assert.match(card, /(Motorways and expressways|Railways) cannot be changed yet/);
      console.log(`a drag on a mapped motorway or railway: no pan, its card says "${card.match(/[^.]*cannot be changed yet\./)[0]}"`);
    } else console.log('no mapped motorway or railway on the map: refusal not checked');
    await page.keyboard.press('Escape');
  }

  // 8. a map without road links says so instead of doing nothing
  if (process.env.NO_LINKS_SCENARIO) {
    await page.close(); page = await context.newPage(); watch(page);
    await open(process.env.NO_LINKS_SCENARIO); await idle();
    const hasLinks = await page.evaluate(() => window.trapla.baseRoads(1).length > 0);
    if (!hasLinks) {
      const roadPoint = await page.evaluate(() => window.trapla.legacyRoadPoint());
      await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 700, 0, 60), [roadPoint.x, roadPoint.y]); await idle();
      const q = await page.evaluate(([x, y]) => window.trapla.project(x, y, window.trapla.groundHeight(x, y)), [roadPoint.x, roadPoint.y]);
      await page.mouse.click(box.x + q.sx, box.y + q.sy);
      assert.match(await page.locator('#inspector').textContent(), /road links are missing/);
      console.log('no road links: said plainly');
    } else console.log('that map has road links: missing-links card not checked');
  }
  assert.deepEqual(errors, []);
  console.log('PASS any road: click / drag-rebuild / one undo / traffic / road list / reload / Build → Road / bend');
} finally { await browser?.close(); await server.close(); }
