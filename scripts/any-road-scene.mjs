// Real-mouse "edit any road" on a pack with road links (D3): one road → no road list; click a mapped
// road away from ours (card, highlighted stretch, no edit); drag it → the stretch becomes a project road
// bent under the pointer, with its profile and own price (one undo step); its traffic; the road list;
// undo/redo; reload; Build → Road with one end on a mapped road and one on open ground; then D11 without
// road links says so plainly. node scripts/any-road-scene.mjs [--gpu] [--docs]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const docs = process.argv.includes('--docs');
const out = docs ? 'docs/screenshots' : '/tmp/trapla-any-road';
const shot = (n, name) => `${out}/${docs ? `${n}-` : ''}${name}.png`;
const first = Number(process.env.SHOT ?? 100);
mkdirSync(out, { recursive: true });
const scenario = process.env.SCENARIO ?? 'd3';
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
  const box = await page.locator('#view').boundingBox();
  const screen = async (fn, ...args) => {
    const p = await page.evaluate(([fn, args]) => window.trapla[fn](...args), [fn, args]);
    assert(p?.vis, `${fn}(${args}) is on screen`);
    return { x: box.x + p.sx, y: box.y + p.sy };
  };
  const revision = () => page.evaluate(() => window.trapla.projectSnapshot().revision);
  const routes = () => page.evaluate(() => window.trapla.getProject().routes.map(r => r.id));

  // 0. one road: no road list, a Build button
  assert.equal(await page.locator('#active-route').isVisible(), false, 'no road list with a single road');
  assert.equal(await page.locator('#build-route').isVisible(), true);

  // a long rebuildable road well clear of our road
  const roads = await page.evaluate(() => window.trapla.baseRoads(700));
  const far = roads.filter(r => r.rebuildable && r.clear > 1200).sort((a, b) => b.length - a.length);
  assert(far.length, 'a rebuildable mapped road away from our road exists');
  const road = far[0], mid = road.length / 2;
  console.log(`mapped road ${road.name} ${Math.round(road.length)} m, ${Math.round(road.clear)} m from our road`);
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 900), [road.id, mid]);
  await idle();

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
  assert.equal(result.cost.total, null, 'not priced yet'); assert.equal(result.valid, false);
  assert(result.issues.some(i => i.code === 'traffic-unknown'), 'its traffic is asked for');
  assert.equal(await page.evaluate(() => window.trapla.profileHasRoad()), true, 'it has a profile');
  assert.equal(await page.locator('#cost-scope').textContent(), 'This road only');
  assert.equal(await page.locator('#active-route').isVisible(), true, 'two roads: the road list appears');
  await page.evaluate(() => window.trapla.select(null));
  await page.screenshot({ path: shot(first + 1, 'mapped-road-rebuilt') });

  // 3. one undo step removes it; redo restores it
  await page.locator('#undo').click(); await idle();
  assert.equal((await routes()).length, 1, 'one undo removes the whole first drag');
  await page.locator('#redo').click(); await idle();
  assert.equal((await routes()).length, 2);
  await page.evaluate(id => window.trapla.setActiveRoute(id), rebuilt); await idle();
  await page.evaluate(() => window.trapla.select(null));

  // 4. its traffic, typed into its card
  await page.fill('.route-traffic input[name=traffic]', '2500');
  await page.fill('.route-traffic input[name=heavy]', '10');
  await page.locator('.route-traffic input[name=heavy]').press('Enter'); await idle();
  const ops = (await page.evaluate(() => window.trapla.getProject())).routes[1].specification.operations;
  assert.equal(ops.aadt, 2500); assert.equal(ops.heavyShare, 0.1); assert.equal(ops.trafficUnknown, undefined);
  assert(!(await page.evaluate(() => window.trapla.projectResult())).issues.some(i => i.code === 'traffic-unknown'));

  // 5. reload keeps it
  await page.close(); page = await context.newPage(); watch(page);
  url = await open(scenario); await idle();
  assert.equal((await page.evaluate(() => window.trapla.getProject())).routes.length, 2);

  // 6. Build → Road: start on the mapped road beyond the rebuilt stretch, end on open ground
  await page.locator('#build-route').click();
  assert.deepEqual(await page.locator('.route-build-choices button').allTextContents(), ['Road'], 'only Road can be built yet');
  await page.locator('.route-build-choices button', { hasText: 'Road' }).click();
  assert.equal(await page.evaluate(() => window.trapla.building()), true);
  const sOn = stretch.s1 + 80 < road.length ? stretch.s1 + 60 : stretch.s0 - 60;
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 1400), [road.id, sOn]); await idle();
  point = await screen('sourceScreen', road.id, sOn); await page.mouse.click(point.x, point.y);
  assert.match(await page.locator('#inspector').textContent(), /Click where it ends/);
  await page.mouse.click(point.x + 220, point.y + 120); await idle();
  const built = await page.evaluate(() => window.trapla.getProject());
  assert.equal(built.routes.length, 3, 'Build made a third road');
  const fresh = built.routes[2];
  assert.equal(fresh.endpoints.a.anchor.kind, 'source'); assert.equal(fresh.endpoints.b.anchor.kind, 'free');
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), fresh.id);
  const r3 = await page.evaluate(() => window.trapla.projectResult());
  assert(r3.issues.some(i => i.code === 'road-ends-nowhere'), 'a free end is reported');
  // bend it like our road
  const s3 = await page.evaluate(id => window.trapla.projectResult().routes[id].legacy.length / 2, fresh.id);
  point = await screen('routeScreen', fresh.id, s3);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x - 40, point.y + 30, { steps: 10 }); await page.mouse.up(); await idle();
  assert.equal((await page.evaluate(() => window.trapla.getProject())).routes[2].alignment.pis.length, 1, 'the new road bent');
  await page.evaluate(() => window.trapla.select(null));
  await page.screenshot({ path: shot(first + 2, 'new-road-built') });
  assert.deepEqual(errors, []);

  // 7. a map without road links says so instead of doing nothing
  if (process.env.NO_LINKS !== '0') {
    await page.close(); page = await context.newPage(); watch(page);
    await open('d11'); await idle();
    const hasLinks = await page.evaluate(() => window.trapla.baseRoads(1).length > 0);
    if (!hasLinks) {
      const roadPoint = await page.evaluate(() => window.trapla.legacyRoadPoint());
      await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 700, 0, 60), [roadPoint.x, roadPoint.y]); await idle();
      const q = await page.evaluate(([x, y]) => window.trapla.project(x, y, window.trapla.groundHeight(x, y)), [roadPoint.x, roadPoint.y]);
      await page.mouse.click(box.x + q.sx, box.y + q.sy);
      assert.match(await page.locator('#inspector').textContent(), /road links are missing/);
      console.log('D11: no road links, said plainly');
    } else console.log('D11 has road links now: skipped the missing-links card');
  }
  assert.deepEqual(errors, []);
  console.log('PASS any road: click / drag-rebuild / one undo / traffic / road list / reload / Build → Road / bend');
} finally { await browser?.close(); await server.close(); }
