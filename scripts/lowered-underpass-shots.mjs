// Player pass over model 21 (lowered underpasses, engineered reroutes): the straight start line a new
// player opens, its lowered boxes clicked on the map (real mouse), their cards, town-centre's lowered service
// road, an engineered reroute's card, and a player's unbuildable reroute.
// CHROME=/usr/bin/chromium PORT=5267 node scripts/lowered-underpass-shots.mjs [--out docs/screenshots] [--first 150]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const port = Number(process.env.PORT ?? 5198);
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out', 'docs/screenshots'); let number = Number(arg('--first', 150));
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const idle = async () => { await page.evaluate(() => window.trapla.whenIdle()); await page.waitForTimeout(600); };
const shot = async (name) => { const path = `${out}/${number++}-${name}.png`; await page.mouse.move(5, 5); await page.screenshot({ path }); console.log('SHOT', path); };
const card = () => page.evaluate(() => document.getElementById('inspector')?.innerText ?? '');
const T = (f, a) => page.evaluate(f, a);
try {
  // a new player: nothing saved, the intro dismissed
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('fresh')) { localStorage.clear(); localStorage.setItem('trapla.intro.v1', '1'); sessionStorage.setItem('fresh', '1'); } } catch { /* opaque */ } });
  await page.goto(`http://localhost:${port}/?scenario=d11`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 }); await idle();
  const start = await T(() => { const r = window.trapla.result(); return { valid: r.valid, violations: r.violations.map(v => v.title), pis: window.trapla.getDesign().pis.length,
    lowered: r.crossings.filter(c => c.type === 'underpass' && c.lowered).map(c => ({ roadId: c.roadId, s: c.s, x: c.x, y: c.y, i: c.i, lowered: c.lowered, cls: c.cls })) }; });
  console.log('START', JSON.stringify({ ...start, lowered: start.lowered.length }));
  assert.equal(start.pis, 0, 'the start line is straight'); assert.ok(start.valid, `the start line opens VALID (${start.violations})`);
  await shot('straight-start-valid');
  // the local road at km 16.58, lowered under its box: find it on the map and click it like a player
  const box = start.lowered.find(c => c.roadId === 2244) ?? start.lowered[0];
  await T(c => window.trapla.lookAt(c.x, c.y, 260, 35, 32), box); await idle();
  const view = await page.locator('#view canvas').boundingBox();
  const target = await T(c => { const r = window.trapla.result(), g = r.crossings.find(x => x.roadId === c.roadId).geometry;
    // a sample on the lowered ramp, away from our road
    const q = g.road[g.approaches[0].start + 1] ?? g.road[1]; return window.trapla.project(q.x, q.y, q.z); }, box);
  await page.mouse.move(view.x + target.sx, view.y + target.sy); await page.waitForTimeout(300);
  await page.mouse.click(view.x + target.sx, view.y + target.sy); await idle();
  const picked = await T(() => window.trapla.selection());
  console.log('PICKED', JSON.stringify(picked));
  const text = await card(); console.log('CARD', text.replace(/\s+/g, ' ').slice(0, 600));
  assert.match(text, /lowered by/, 'its card says the road is lowered');
  await shot('lowered-local-road-card');
  await T(c => { window.trapla.lookAt(c.x, c.y, 110, 125, 12); }, box); await idle();
  await shot('lowered-local-road-portal');
  const track = start.lowered.find(c => c.cls === 'track');
  if (track) {
    await T(c => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 240, 210, 30); window.trapla.profileFocus(c.s - 250, c.s + 250); }, track); await idle();
    await shot('lowered-track-oblique');
  }
  // the player overrides: cut and reroute the local road (a railway lies between it and the next crossing)
  await T(c => window.trapla.selectCrossing(c.roadId), box); await idle();
  await page.click('#crossing-choice [data-crossing="reconnection"]'); await idle();
  const reroute = await T(c => { const r = window.trapla.result(); return { valid: r.valid, v: r.violations.filter(v => v.kind === 'crossing').map(v => `${v.title} | ${v.fix} | ${v.detail}`) }; }, box);
  console.log('PLAYER REROUTE', JSON.stringify(reroute));
  await T(c => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 900, 35, 45); }, box); await idle();
  await shot('player-reroute-unbuildable');
  await page.click('#crossing-choice [data-crossing=""]'); await idle();
  assert.ok(await T(() => window.trapla.result().valid), 'Automatic again: valid');
  // town-centre: the service road lowered under its box at km 15.98
  await T(d => window.trapla.setDesign(d), JSON.parse(readFileSync('scripts/town-centre-design.json', 'utf8')).design); await idle();
  const service = await T(() => window.trapla.result().crossings.find(c => c.roadId === 5162));
  console.log('TOWN 5162', service.type, service.lowered, service.drainage);
  await T(c => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 300, 300, 30); window.trapla.profileFocus(c.s - 250, c.s + 250); }, service); await idle();
  await shot('town-centre-lowered-service-road');
  // an engineered reroute (culverts or houses) on a published design
  for (const file of ['best', 'demo', 'direct-80', 'direct-90']) {
    await T(d => window.trapla.setDesign(d), JSON.parse(readFileSync(`scripts/${file}-design.json`, 'utf8')).design); await idle();
    const link = await T(() => window.trapla.result().crossings.find(c => (c.type === 'reconnection' || c.type === 'diversion') && (c.culverts || c.houses?.length || c.linkGrade)));
    if (!link) continue;
    console.log('REROUTE', file, link.roadId, link.culverts, link.houses?.length, link.linkGrade);
    await T(c => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 900, 20, 50); window.trapla.profileFocus(c.s - 600, c.s + 600); }, link); await idle();
    console.log('CARD', (await card()).replace(/\s+/g, ' ').slice(0, 600));
    await shot(`engineered-reroute-${file}`);
    break;
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
