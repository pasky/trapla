// Real-mouse integration of two explicitly constructed road fixtures. This checks actual road bodies,
// active-route profile/selection, project undo and reload. It is NOT the source-road promotion playtest.
// node scripts/multi-road-scene.mjs [--gpu] [--docs]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-multi-road';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5243), strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}?scenario=d11`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('trapla.intro.v2', '1'); });
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 120000 });
  const idle = async () => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise(resolve => {
      const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
      requestAnimationFrame(() => requestAnimationFrame(frame));
    }));
  };
  await idle();
  const ids = await page.evaluate(() => {
    const t = window.trapla, project = t.getProject(), mission = project.routes[0];
    const road = structuredClone(mission); road.id = 'fixture-side-road'; road.name = 'Valley road'; road.role = 'auxiliary'; road.acousticSourceId = 'fixture-side-noise';
    const a = mission.endpoints.a.position;
    const endpoint = (x, y) => ({ position: { x, y, z: t.groundHeight(x, y) }, binding: 'resolved', anchor: { kind: 'free' } });
    road.endpoints = { a: endpoint(a.x + 2500, a.y + 1000), b: endpoint(a.x + 2700, a.y + 2000) };
    road.alignment = { kind: 'pi', pis: [], controls: {}, vertical: { kind: 'auto', pins: [] } };
    project.routes.push(road); t.setProject(project);
    t.lookAt(a.x + 1400, a.y + 1500, 6500, 0, 55);
    return { mission: mission.id, side: road.id };
  });
  await idle();
  const bodies = await page.evaluate(() => window.trapla.renderRoutes());
  assert.equal(bodies.length, 2); assert(bodies.every(r => r.ribbonTriangles > 20 && r.collars > 0), 'both roads have real bodies and ground collars');
  // a side road with free ends is not priced yet; our road keeps its own price, nothing is added up
  const score = await page.evaluate(() => window.trapla.projectResult());
  console.log('side road:', score.cost.total, score.cost.unpriced, score.issues.filter(i => i.blocking === 'incomplete').map(i => i.violation.title));
  assert.equal(score.complete, false); assert.equal(score.cost.total, null, 'no invented total');
  assert(score.cost.unpriced.some(u => u.routeId === ids.side)); assert(!score.cost.unpriced.some(u => u.routeId === ids.mission));
  assert(Number.isFinite(score.cost.alone[ids.mission]), 'our road has its own bill');
  assert.equal(await page.locator('#cost-scope').textContent(), 'Our road only');
  assert.equal(await page.locator('#valid').textContent(), '✗ NOT VALID', 'the side road has real violations');
  assert.match(await page.locator('#perkm').textContent(), /Valley road not priced yet/);
  assert.equal(await page.locator('#best').isVisible(), false, 'no best while not priced');
  const hit = async id => {
    const p = await page.evaluate(id => { const t = window.trapla, r = t.projectResult().routes[id].legacy; return t.routeScreen(id, r.length / 2); }, id);
    const box = await page.locator('#view').boundingBox(); assert(p?.vis, 'road is on screen');
    return { x: box.x + p.sx, y: box.y + p.sy };
  };
  const before = await page.evaluate(() => window.trapla.projectSnapshot().revision);
  let point = await hit(ids.side); await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), ids.side);
  assert.equal(await page.evaluate(() => window.trapla.projectSnapshot().revision), before, 'selection does not enter undo');
  assert.match(await page.locator('.profile-bar > b').textContent(), /Valley road/);
  assert.equal(await page.evaluate(() => window.trapla.projectSelection().routeId), ids.side);
  point = await hit(ids.side); await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 38, point.y - 24, { steps: 12 }); await page.mouse.up(); await idle();
  let project = await page.evaluate(() => window.trapla.getProject());
  assert.equal(project.routes.find(r => r.id === ids.side).alignment.pis.length, 1);
  assert.equal(project.routes.find(r => r.id === ids.mission).alignment.pis.length, 0, 'other road controls remain independent');
  await page.locator('#active-route').selectOption(ids.mission);
  await page.locator('#undo').click(); await idle();
  project = await page.evaluate(() => window.trapla.getProject());
  assert.equal(project.routes.find(r => r.id === ids.side).alignment.pis.length, 0);
  assert.equal(await page.evaluate(() => window.trapla.activeRoute()), ids.mission, 'undo does not switch the editor');
  await page.locator('#redo').click(); await idle();
  // reload in a new page of the same context (same storage)
  const next = await context.newPage(); next.on('pageerror', error => errors.push(error.message)); await page.close();
  await next.goto(`${server.resolvedUrls.local[0]}?scenario=d11`);
  await next.waitForFunction(() => !!window.trapla, null, { timeout: 120000 });
  await next.evaluate(() => window.trapla.whenIdle());
  assert.equal(await next.evaluate(() => window.trapla.getProject().routes.length), 2);
  assert.equal(await next.evaluate(id => window.trapla.getProject().routes.find(r => r.id === id).alignment.pis.length, ids.side), 1);
  await next.evaluate(id => {
    const t = window.trapla, road = t.getProject().routes.find(r => r.id === id), a = road.endpoints.a.position;
    t.lookAt(a.x - 1100, a.y + 500, 6500, 0, 55);
  }, ids.side);
  await next.locator('#active-route').selectOption(ids.mission);
  await next.waitForTimeout(500);
  await next.screenshot({ path: `${out}/79-our-road-priced-side-road-not.png` });
  // move the side road across ours: they now affect each other and cannot be priced together
  await next.evaluate(([mission, side]) => {
    const t = window.trapla, project = t.getProject(), r = t.projectResult().routes[mission].legacy, i = Math.floor(r.n / 2);
    const dx = r.x[i + 1] - r.x[i - 1], dy = r.y[i + 1] - r.y[i - 1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    const endpoint = (x, y) => ({ position: { x, y, z: t.groundHeight(x, y) }, binding: 'resolved', anchor: { kind: 'free' } });
    const road = project.routes.find(x => x.id === side);
    road.endpoints = { a: endpoint(r.x[i] - 500 * nx, r.y[i] - 500 * ny), b: endpoint(r.x[i] + 500 * nx, r.y[i] + 500 * ny) };
    road.alignment.pis = [];
    t.setProject(project); t.lookAt(r.x[i], r.y[i], 2600, 0, 55);
  }, [ids.mission, ids.side]);
  await next.evaluate(() => window.trapla.whenIdle());
  await next.evaluate(() => new Promise(resolve => {
    const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
    requestAnimationFrame(() => requestAnimationFrame(frame));
  }));
  const crossing = await next.evaluate(() => window.trapla.projectResult());
  assert.equal(crossing.cost.total, null, 'interacting roads have no invented total'); assert.equal(crossing.complete, false);
  assert(crossing.cost.unpriced.length >= 1);
  console.log('crossing roads:', crossing.cost.unpriced, crossing.issues.filter(i => i.blocking === 'incomplete').map(i => i.violation.title));
  assert.match(await next.locator('#valid').textContent(), /NOT VALID|NOT PRICED/);
  assert(crossing.issues.some(i => i.code === 'roads-cross' && i.check === 'not-checked' && i.at), 'core marks where the roads cross');
  assert.match(await next.locator('#viol li.not-checked').allTextContents().then(t => t.join(' ')), /Roads cross here/, 'shown as not checked yet, not as a violation');
  const crossK = await next.locator('#viol li.not-checked', { hasText: 'Roads cross here' }).first().getAttribute('data-k');
  await next.locator(`#viol li[data-k="${crossK}"] .vt`).click();
  const at = crossing.issues[Number(crossK)].at, target = await next.evaluate(() => new Promise(r => setTimeout(() => r(window.trapla.cameraTarget()), 700)));
  assert(Math.hypot(target.x - at.x, target.y - at.y) < 60, 'clicking it shows the place');
  assert.match(await next.locator('#cost-scope').textContent(), /road only/);
  assert.match(await next.locator('#perkm').textContent(), /^Valley road not priced yet$/);
  await next.screenshot({ path: `${out}/82-two-roads-not-priced.png` });
  await next.keyboard.press('n');
  assert.match(await next.locator('#noise-legend').textContent(), /Project noise check not finished/);
  assert.deepEqual(errors, []);
  console.log('PASS two engineered bodies, real-mouse selection/drag, profile, atomic undo, reload and honest network score/noise');
} finally { await browser?.close(); await server.close(); }
