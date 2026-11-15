// Real-mouse base-road Change road on a pack with transport metadata (D3): select a mapped road away from
// our road, choose its stretch with the visible handles, Cancel (nothing changes), Apply (one undo step,
// branches kept as connections), switch roads, profile label, undo/redo, reload. The proposal stays
// unscored: no total, no VALID. Screenshots 80 (handles) and 81 (proposal over the old road).
// node scripts/base-road-scene.mjs [--gpu] [--docs]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-base-road';
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
  const url = `${server.resolvedUrls.local[0]}?scenario=${scenario}`;
  await page.goto(url);
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

  // a long ground road well clear of our road, preferably with a side road joining it mid-way
  const roads = await page.evaluate(() => window.trapla.baseRoads(900));
  const far = roads.filter(r => r.clear > 1200).sort((a, b) => (b.branches.length > 0) - (a.branches.length > 0) || b.length - a.length);
  assert(far.length, 'a promotable base road away from our road exists');
  const road = far[0], branch = road.branches[0];
  // click well inside the way (its ends are shared with other ways), next to the side road if there is one
  const mid = Math.min(road.length - 400, Math.max(150, (branch ?? road.length / 2) + 200));
  console.log(`base road ${road.name} ${Math.round(road.length)} m, ${Math.round(road.clear)} m from our road, branch at ${mid}`);
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 900), [road.id, mid]);
  await idle();

  // 1. click the road: its card, no project change
  const before = await revision();
  const near = mid;
  let point = await screen('sourceScreen', road.id, near); await page.mouse.click(point.x, point.y);
  await page.locator('#inspector.k-source').waitFor({ timeout: 5000 });
  assert.equal(await revision(), before, 'inspecting a base road is not an edit');
  assert.equal(await page.locator('#change-source').isEnabled(), true);

  // 2. Change road: two visible handles; drag End further along the road
  await page.locator('#change-source').click();
  assert.equal(await page.locator('.source-endpoint:visible').count(), 2, 'Start and End handles are shown');
  const drag = async (handle, s) => {
    const el = page.locator(`.source-endpoint[data-end="${handle}"]`), b = await el.boundingBox(), to = await screen('sourceScreen', road.id, s);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 20 }); await page.mouse.up();
    return (await page.evaluate(() => window.trapla.sourceSelection())).interval;
  };
  const sel0 = (await page.evaluate(() => window.trapla.sourceSelection())).interval;
  assert.equal(sel0.sourceId, road.id, 'the clicked road is the selected one');
  const sel1 = await drag(1, Math.min(road.length - 5, sel0.s1 + 250));
  assert(sel1.s1 > sel0.s1 + 150, `End handle followed the road (${sel0.s1} → ${sel1.s1})`);
  if (branch !== undefined) {
    const sel2 = await drag(0, Math.max(0, branch - 30));
    assert(sel2.s0 < branch, `Start handle moved past the side road (${sel1.s0} → ${sel2.s0})`);
  }
  assert.equal(await revision(), before, 'moving handles is not an edit');
  await page.screenshot({ path: `${out}/80-base-road-handles.png` });

  // 3. Escape from a typed field, then Cancel, leave nothing changed
  await page.locator('.source-operations input[name=speed]').focus(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.source-endpoint').count(), 0, 'Escape closes Change road from its fields');
  assert.equal(await page.locator('#inspector.k-source').count(), 0);
  point = await screen('sourceScreen', road.id, near); await page.mouse.click(point.x, point.y);
  await page.locator('#change-source').click();
  await page.locator('#cancel-source').click();
  assert.equal(await page.locator('.source-endpoint').count(), 0);
  assert.equal(await revision(), before); assert.equal((await routes()).length, 1);

  // 4. again, and Apply with explicit traffic
  point = await screen('sourceScreen', road.id, near); await page.mouse.click(point.x, point.y);
  await page.locator('#change-source').click();
  if (branch !== undefined) await drag(0, Math.max(0, branch - 30));
  await page.fill('.source-operations input[name=speed]', '50');
  await page.fill('.source-operations input[name=traffic]', '1500');
  await page.fill('.source-operations input[name=heavy]', '10');
  await page.locator('#apply-source').click();
  await idle();
  const ids = await routes(); assert.equal(ids.length, 2, 'one promoted road');
  const mission = ids[0], proposal = ids[1];
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), proposal);
  const project = await page.evaluate(() => window.trapla.getProject());
  const ports = project.connections.filter(c => c.ports.some(p => p.kind === 'route' && p.routeId === proposal));
  assert(ports.length >= 2, 'both ends stay connected to the old road');
  if (road.branches.length) assert(ports.length >= 3 && ports.some(c => c.id.includes(':branch:')), 'the side road keeps its junction');
  assert.equal(await page.locator('#inspector.k-proposal').count(), 1, 'the proposal card is shown');
  assert.match(await page.locator('#inspector').textContent(), /not checked yet/);
  const score = await page.evaluate(() => window.trapla.projectResult());
  assert.equal(score.cost.total, null); assert.equal(score.valid, false);
  assert.equal(await page.locator('#valid').textContent(), 'NOT PRICED', 'only not-checked items: neutral');
  assert.match(await page.locator('#chip-viol').textContent(), /not checked yet/); assert.equal(await page.locator('#viol-count').textContent(), '0');
  assert.equal(await page.locator('#cost-scope').textContent(), 'Our road only');
  assert.match(await page.locator('#total').textContent(), /CZK|Kč|\d/, 'our road keeps its own price');
  assert.match(await page.locator('#perkm').textContent(), /Track not priced yet/);
  assert.equal(await page.evaluate(() => window.trapla.proposalLines()), 1, 'the proposal is drawn');
  assert.equal(await page.evaluate(() => window.trapla.renderRoutes().length), 1, 'no road body is invented for it');
  assert.match(await page.locator('.profile-bar > b').textContent(), new RegExp(road.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.equal(await page.evaluate(() => window.trapla.profileHasRoad()), false, 'the profile does not show another road');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${out}/81-base-road-proposal.png` });

  // 5. switch by clicking our road, then the proposal line; no undo entries
  const afterApply = await revision();
  await page.evaluate(id => { const t = window.trapla, r = t.projectResult().routes[id].legacy, i = Math.floor(r.n / 2); t.lookAt(r.x[i], r.y[i], 2500, 0, 55); }, mission);
  await idle();
  point = await screen('routeScreen', mission, await page.evaluate(id => window.trapla.projectResult().routes[id].legacy.length / 2, mission));
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), mission);
  assert.match(await page.locator('.profile-bar > b').textContent(), /Profile · /);
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 900), [road.id, mid]); await idle();
  point = await screen('routeScreen', proposal, 60); await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), proposal, 'the proposal is pickable');
  assert.equal(await revision(), afterApply, 'switching roads is not an edit');

  // 6. undo removes the change atomically (no stale proposal card), redo restores it
  await page.locator('#undo').click(); await idle();
  assert.equal((await routes()).length, 1);
  assert.equal(await page.locator('#inspector.k-proposal').count(), 0, 'no card of a removed change remains');
  assert.equal((await page.evaluate(() => window.trapla.getProject())).connections.length, 0);
  assert.equal(await page.evaluate(() => window.trapla.proposalLines()), 0);
  await page.locator('#redo').click(); await idle();
  assert.equal((await routes()).length, 2);

  // 7. reload keeps the proposal and its connections
  await page.close(); page = await context.newPage(); watch(page);
  await page.goto(url); await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }); await idle();
  const reloaded = await page.evaluate(() => window.trapla.getProject());
  assert.equal(reloaded.routes.length, 2); assert.equal(reloaded.connections.length, project.connections.length);
  assert.equal(await page.evaluate(() => window.trapla.proposalLines()), 1);

  // 8. with the photo on, the roads the game knows stay visible as a thin overlay (what is clickable)
  await page.evaluate(([id, s]) => window.trapla.lookAtSource(id, s, 1400), [road.id, mid]);
  await page.evaluate(() => window.trapla.setView({ photo: true }));
  await page.waitForFunction(() => !window.trapla.viewBusy(), null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.trapla.photoWithNetwork()), true, 'the photo arrived and the mapped roads are drawn over it');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${out}/83-photo-mapped-roads.png` });
  await page.evaluate(() => window.trapla.setView({ photo: false }));
  assert.deepEqual(errors, []);
  console.log('PASS base road select / Change road handles / cancel / apply (branches kept) / switch / undo / reload; unscored');
} finally { await browser?.close(); await server.close(); }
