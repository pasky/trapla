// Player pass over model 24 (crossing remedies as designers choose them): the D3 motorway starter's road
// running along the motorway moved beside it, a skewed track's box straightened, two field tracks on one
// bridge, the player keeping a skewed line and straightening it again; town-centre's skewed service road
// straightened; Nová Paka's neighbouring tracks joined to one box; best's service road moved aside.
// flock -s /tmp/trapla-browser.lock nice -n 10 env CHROME=/usr/bin/chromium PORT=5271 node scripts/crossing-economy-shots.mjs [--out docs/screenshots] [--first 170]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const port = Number(process.env.PORT ?? 5271);
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out', 'docs/screenshots'); let number = Number(arg('--first', 170));
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const idle = async () => { await page.evaluate(() => window.trapla.whenIdle()); await page.waitForTimeout(700); };
const shot = async (name) => { const path = `${out}/${number++}-${name}.png`; await page.mouse.move(5, 5); await page.screenshot({ path }); console.log('SHOT', path); };
const card = async () => (await page.evaluate(() => document.getElementById('inspector')?.innerText ?? '')).replace(/\s+/g, ' ');
const T = (f, a) => page.evaluate(f, a);
const design = (file) => JSON.parse(readFileSync(file, 'utf8')).design;
const crossingNear = (s, roadId) => T(([s, roadId]) => window.trapla.result().crossings
  .filter(c => roadId === undefined || c.roadId === roadId).reduce((a, c) => !a || Math.abs(c.s - s) < Math.abs(a.s - s) ? c : a, null), [s, roadId]);
const show = async (c, distance, azimuth, tilt, span = 300) => {
  await T(([c, d, az, t, span]) => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, d, az, t); window.trapla.profileFocus(c.s - span, c.s + span); }, [c, distance, azimuth, tilt, span]);
  await idle();
};
try {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('fresh')) { localStorage.clear(); localStorage.setItem('trapla.intro.v1', '1'); sessionStorage.setItem('fresh', '1'); } } catch { /* opaque */ } });
  // D3 motorway starter
  await page.goto(`http://localhost:${port}/?scenario=d3&preset=d3-motorway`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 180000 }); await idle();
  await T(d => window.trapla.setDesign(d), design('scripts/scenarios/d3/d3-motorway.json')); await idle();
  const total = await T(() => { const r = window.trapla.result(); return { total: r.cost.total, valid: r.valid, v: r.violations.map(v => v.title) }; });
  console.log('D3 MOTORWAY', JSON.stringify(total));
  assert.ok(total.valid, 'the D3 motorway starter is valid');
  const moved = await crossingNear(14180, undefined);
  assert.ok(moved.moved, 'the class III road along the motorway is moved beside it');
  await show(moved, 900, 30, 45, 600);
  let text = await card(); console.log('CARD 14.18', text.slice(0, 500));
  assert.match(text, /Moved beside our motorway/);
  await shot('d3-motorway-road-moved-beside');
  const box = await crossingNear(7940, undefined);
  assert.ok(box.type === 'underpass' && box.squared !== undefined, 'the skewed track at km 7.94 is straightened through a box');
  await show(box, 260, 200, 35);
  text = await card(); console.log('CARD 7.94', text.slice(0, 600));
  assert.match(text, /straightened to cross at a right angle/); assert.match(text, /Keep its line/);
  await shot('d3-motorway-track-straightened-box');
  // the player keeps the track on its own line: a box too long, said so; then straightens it again
  await page.click('[data-crossing-square="0"]'); await idle();
  const kept = await T(id => { const r = window.trapla.result(); return { valid: r.valid, v: r.violations.filter(v => v.kind === 'crossing').map(v => `${v.title} | ${v.fix}`) }; }, box.roadId);
  console.log('KEPT LINE', JSON.stringify(kept));
  await show(box, 260, 200, 35);
  await shot('d3-motorway-track-kept-line');
  await page.click('[data-crossing-square="1"]'); await idle();
  text = await card(); console.log('CARD 7.94 again', text.slice(0, 300));
  assert.match(text, /straightened/);
  await page.click('#crossing-choice [data-crossing=""]'); await idle(); // back to Automatic
  const pair = await crossingNear(3630, undefined);
  console.log('3.63', pair.type, pair.targetS, pair.linkLength);
  await show(pair, 900, 160, 50, 600);
  console.log('CARD 3.63', (await card()).slice(0, 400));
  await shot('d3-motorway-neighbouring-tracks');
  // town-centre: the skewed service road at km 15.98
  await page.goto(`http://localhost:${port}/?scenario=d11`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 180000 }); await idle();
  await T(d => window.trapla.setDesign(d), design('scripts/town-centre-design.json')); await idle();
  const service = await crossingNear(15980, 5162);
  console.log('TOWN 5162', service.type, service.squared, service.underpassLength, service.lowered);
  await show(service, 300, 300, 32);
  console.log('CARD 15.98', (await card()).slice(0, 500));
  await shot('town-centre-service-road-straightened');
  // best: a service road that runs into our earthworks and back out on the same side, moved aside
  await T(d => window.trapla.setDesign(d), design('scripts/best-design.json')); await idle();
  const aside = await T(() => window.trapla.result().crossings.find(c => c.moved));
  if (aside) {
    await show(aside, 400, 120, 45);
    console.log('CARD moved', (await card()).slice(0, 400));
    await shot('best-service-road-moved-aside');
  }
  // Nová Paka: the service road and the track beside the track's box, joined to it
  await page.goto(`http://localhost:${port}/?scenario=i16-nova-paka`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 180000 }); await idle();
  await T(d => window.trapla.setDesign(d), design('scripts/scenarios/i16-nova-paka/default.json')); await idle();
  const joined = await crossingNear(3480, undefined);
  console.log('NOVA PAKA 3.48', joined.type, joined.targetS, joined.linkLength);
  await show(joined, 260, 200, 38, 300);
  console.log('CARD 3.48', (await card()).slice(0, 400));
  await shot('nova-paka-roads-joined-to-one-box');
  assert.deepEqual(errors, [], `page errors: ${errors}`);
} finally {
  await browser.close();
  await server.close();
}
