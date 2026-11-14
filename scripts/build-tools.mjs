// Real HUD/map interaction checks and reproducible build-tool screenshots (30–35).
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const PORT = Number(process.env.PORT ?? 5198);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-build-tools';
mkdirSync(out, { recursive: true });
const idle = async () => { await page.evaluate(() => window.trapla.whenIdle()); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
const get = () => page.evaluate(() => window.trapla.getDesign());
const load = async () => { await page.evaluate((d) => { window.trapla.setDesign(d); window.trapla.selectRange(null); }, design); await idle(); };
const shot = async (name) => {
  await page.evaluate(() => { document.getElementById('hud').scrollTop = document.getElementById('build-tools').offsetTop - 12; });
  await page.mouse.move(15, 15); await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/${name}.png` }); console.log(`SHOT ${name}`);
};
try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await idle(); await load();
  const pin = await page.evaluate(() => {
    const r = window.trapla.result(), s = 17500, i = Math.round(s / r.ds);
    window.trapla.lookAt(r.x[i], r.y[i], 2400, 20, 50); window.trapla.profileFocus(s - 400, s + 400);
    return { s, z: Math.round((r.grade[i] + 1) * 10) / 10 };
  });
  await page.fill('#station-value', String(pin.s)); await page.click('#station-select');
  await page.fill('#pin-height', String(pin.z)); await page.click('#pin-set'); await idle();
  assert.equal((await get()).profileMode, 'auto'); assert.deepEqual((await get()).gradePins, [pin]);
  const pinError = await page.evaluate(({ s, z }) => {
    const r = window.trapla.result(), i = Math.floor(s / r.ds), t = (s - r.s[i]) / r.ds;
    return Math.abs(r.grade[i] + t * (r.grade[i + 1] - r.grade[i]) - z);
  }, pin);
  assert(pinError < 0.51, `pin error ${pinError}`);
  await shot('30-build-grade-pin');
  await page.click('#pin-clear'); await idle(); assert.equal((await get()).gradePins.length, 0);
  await page.keyboard.press('Control+z'); await idle(); assert.deepEqual((await get()).gradePins, [pin]);
  console.log('PASS typed station, Auto pin, realised height, clear and undo');

  await load();
  const roadId = await page.evaluate(() => {
    const r = window.trapla.result(), c = r.crossings.find((c) => c.type === 'reconnection' && c.linkLength > 100);
    if (!c) throw new Error('no demo reconnection');
    window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, Math.max(900, c.linkLength * 1.2), 15, 65);
    window.trapla.profileFocus(c.s - 200, c.s + 200); return c.roadId;
  });
  await page.selectOption('#crossing-choice', 'reconnection'); await page.locator('#crossing-choice').blur(); await idle();
  const links = await page.evaluate((id) => window.trapla.result().crossings.filter((c) => c.roadId === id), roadId);
  assert(links.every((c) => c.type === 'reconnection' && c.cost > 0 && c.geometry.links.length === 2));
  await shot('31-build-crossing-links');
  await page.selectOption('#crossing-choice', ''); await page.locator('#crossing-choice').blur(); await idle();
  assert.equal((await get()).crossingOverrides.length, 0);
  await page.keyboard.press('Control+z'); await idle();
  assert.equal((await get()).crossingOverrides[0].type, 'reconnection');
  console.log('PASS crossing selection, priced two-sided links, Auto clear and undo');

  await load();
  await page.evaluate(() => {
    const r = window.trapla.result(), c = r.crossings.find((c) => c.type === 'overbridge' && c.cls !== 'track');
    window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 700, 30, 55); window.trapla.profileFocus(c.s, c.s);
  });
  await page.selectOption('#crossing-choice', 'overbridge'); await page.locator('#crossing-choice').blur(); await idle();
  await shot('32-build-crossing-overbridge');

  await load();
  const building = await page.evaluate(() => {
    const r = window.trapla.result(), rec = r.noise.receivers.find((p) => p.status === 'wall');
    const p = window.trapla.buildingScreen(rec.j);
    window.trapla.lookAt(r.x[rec.i], r.y[rec.i], 600, 15, 65); window.trapla.profileFocus(r.s[rec.i], r.s[rec.i]);
    window.trapla.setView({ noise: true }); return rec.j;
  });
  await idle();
  const screen = await page.evaluate((j) => window.trapla.buildingScreen(j, 3), building);
  const vb = await page.locator('#view').boundingBox();
  await page.mouse.click(vb.x + screen.sx, vb.y + screen.sy); await page.waitForTimeout(100);
  assert.equal(await page.locator('#building-choice').count(), 1, 'actual building click opens its choices');
  const beforePi = (await get()).pis.length;
  // A modifier still places a bend at an object; undo returns to exactly the original plan.
  await page.keyboard.down('Shift'); await page.mouse.click(vb.x + screen.sx, vb.y + screen.sy); await page.keyboard.up('Shift'); await idle();
  assert.equal((await get()).pis.length, beforePi + 1); await page.keyboard.press('Control+z'); await idle();
  await page.selectOption('#building-choice', 'buy'); await page.locator('#building-choice').blur(); await idle();
  assert(await page.evaluate((j) => window.trapla.result().boughtOut.some((p) => p.j === j && p.reason === 'manual'), building));
  await page.selectOption('#building-choice', 'keep'); await page.locator('#building-choice').blur(); await idle();
  assert(await page.evaluate((j) => window.trapla.result().kept.some((p) => p.j === j), building));
  await shot('33-build-building-keep');
  console.log('PASS building ray pick, Shift+click bend, voluntary acquisition and Keep');

  await load();
  const wall = await page.evaluate(() => {
    const r = window.trapla.result(), rec = r.noise.receivers.find((p) => p.status === 'wall' && p.at >= 0);
    const w = r.walls.find((w) => w.side === rec.side && rec.at >= w.i0 && rec.at <= w.i1);
    window.trapla.selectRange(w.s0, w.s1); window.trapla.lookAt(r.x[rec.i], r.y[rec.i], 950, 20, 65);
    window.trapla.profileFocus(w.s0, w.s1); window.trapla.setView({ noise: true }); return { ...w, j: rec.j };
  });
  await page.selectOption('#wall-side', wall.side); await page.fill('#wall-height', '4'); await page.click('#wall-add'); await idle();
  assert((await get()).wallOverrides.some((w) => w.side === wall.side && w.height === 4));
  await shot('34-build-noise-wall');
  await page.click('#wall-remove'); await idle();
  const removed = await page.evaluate((j) => ({ bought: window.trapla.result().boughtOut.some((p) => p.j === j),
    issues: window.trapla.result().violations.filter((v) => v.kind === 'noise').length }), wall.j);
  assert.equal(removed.bought, false); assert(removed.issues > 0);
  await shot('35-build-no-wall-conflict');
  await page.keyboard.press('Control+z'); await idle(); assert((await get()).wallOverrides.some((w) => w.height === 4));
  await page.click('#wall-auto'); await idle(); assert.equal((await get()).wallOverrides.length, 0);
  console.log('PASS actual wall height, explicit removal => violation not buyout, undo and Auto');

  const combined = { ...design, gradePins: [pin], crossingOverrides: [{ roadId, type: 'reconnection' }],
    buildingOverrides: [{ j: building, action: 'keep' }], wallOverrides: [{ s0: wall.s0, s1: wall.s1, side: wall.side, height: 4 }] };
  await page.evaluate((d) => window.trapla.setDesign(d), combined); await idle();
  const saved = await get(); await page.reload(); await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 }); await idle();
  const reloaded = await get();
  for (const field of ['gradePins', 'crossingOverrides', 'buildingOverrides', 'wallOverrides']) assert.deepEqual(reloaded[field], saved[field]);
  assert.deepEqual(errors, []);
  console.log('PASS all four overrides survive reload; no browser errors');
} finally { await browser.close(); await server.close(); }
