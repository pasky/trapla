// Player pass over model 21 (lowered underpasses, engineered reroutes): the straight start line a new
// player opens, its lowered boxes clicked on the map (real mouse), their cards, town-centre's lowered service
// road, an engineered reroute's card, and a player's unbuildable reroute.
// node scripts/lowered-underpass-shots.mjs [--out docs/screenshots] [--first 150]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out', 'docs/screenshots'); let number = Number(arg('--first', 150));
mkdirSync(out, { recursive: true });
const game = await startGame();
const { page, pageErrors: errors } = game;
const idle = (ms = 600) => game.idle(ms);
const shot = async (name) => { const path = `${out}/${number++}-${name}.png`; await game.park(); await page.screenshot({ path }); console.log('SHOT', path); };
const card = () => page.evaluate(() => document.getElementById('inspector')?.innerText ?? '');
const T = (f, a) => page.evaluate(f, a);
try {
  // a new player: nothing saved, the intro dismissed
  await game.open('scenario=d11'); await idle();
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
  // another lowered way of the start line, seen from the side (a track, if it has one)
  const other = start.lowered.find(c => c.cls === 'track') ?? start.lowered.find(c => c.roadId !== box.roadId);
  if (other) {
    await T(c => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 240, 210, 30); window.trapla.profileFocus(c.s - 250, c.s + 250); }, other); await idle();
    console.log('OTHER LOWERED', other.roadId, other.cls, other.lowered);
    await shot('lowered-way-oblique');
  } else { console.log('SKIPPED: the start line lowers one way only'); number++; }
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
  // a way our road crosses more than once (the first one the start line has), rerouted and shaped by the
  // player: the card describes the shaped crossing (its own new road), says how many times the way crosses
  // ours and that the price is for all of them
  await T(() => window.trapla.setDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] })); await idle();
  const shaped = await T(() => {
    const r = window.trapla.result(), times = (id) => r.crossings.filter(x => x.roadId === id).length;
    const c = r.crossings.find(x => (x.type === 'reconnection' || x.type === 'diversion') && !x.moved && times(x.roadId) > 1 && x.geometry?.links?.some(l => l.length > 2));
    if (!c) return null;
    const l = c.geometry.links.find(x => x.length > 2), k = c.geometry.links.indexOf(l), m = l[Math.floor(l.length / 2)], via = [[], []];
    // the bend point: 40 m further from our road than the middle of the automatic path
    let near = 0; for (let i = 0; i < r.n; i++) if (Math.hypot(r.x[i] - m.x, r.y[i] - m.y) < Math.hypot(r.x[near] - m.x, r.y[near] - m.y)) near = i;
    const off = Math.hypot(m.x - r.x[near], m.y - r.y[near]) || 1;
    via[k] = [{ x: m.x + 40 * (m.x - r.x[near]) / off, y: m.y + 40 * (m.y - r.y[near]) / off }];
    return { roadId: c.roadId, via, to: c.targetRoadId, times: times(c.roadId) };
  });
  assert.ok(shaped, 'the start line crosses some way more than once and reroutes it');
  await T((o) => { const d = window.trapla.getDesign(); d.crossingOverrides = [{ roadId: o.roadId, type: 'reconnection', via: o.via, to: o.to }]; window.trapla.setDesign(d); }, shaped); await idle(1500);
  await T((o) => window.trapla.selectCrossing(o.roadId), shaped); await idle();
  const text3 = (await card()).replace(/\s+/g, ' ');
  const own = await T((o) => window.trapla.result().crossings.find(x => x.roadId === o.roadId && x.via), shaped);
  console.log('SHAPED CARD', text3.slice(0, 400));
  assert.ok(text3.includes(`+${Math.round(own.linkLength).toLocaleString('en-US')} m`), 'the card gives the shaped new road\'s own length');
  assert.match(text3, new RegExp(`crosses our road ${shaped.times} times .*The price is for all of them`), `the card explains the ${shaped.times} crossings`);
  assert.doesNotMatch(text3, /⚠/, 'the shaped path is buildable');
  // a hover tip goes when the view moves, and when the design changes
  await T(() => { const r = window.trapla.result(), w = r.walls[0], i = Math.round((w.i0 + w.i1) / 2); window.trapla.lookAt(r.x[i], r.y[i], 600, 0, 60); }); await idle();
  const wallAt = await T(() => { const r = window.trapla.result(), w = r.walls[0], i = Math.round((w.i0 + w.i1) / 2), sgn = w.side === 'L' ? 1 : -1, off = 9;
    return window.trapla.project(r.x[i] - r.ty[i] * off * sgn, r.y[i] + r.tx[i] * off * sgn, r.grade[i] + 1); });
  const canvas = await page.locator('#view canvas').boundingBox();
  const tipShown = async () => page.evaluate(() => [...document.querySelectorAll('.map-tip')].some(e => e.style.display !== 'none' && e.textContent.includes('wall')));
  for (const dx of [0, 3, -3, 6, -6]) { await page.mouse.move(canvas.x + wallAt.sx + dx, canvas.y + wallAt.sy); await page.waitForTimeout(250); if (await tipShown()) break; }
  assert.ok(await tipShown(), 'a wall shows its tip under the pointer');
  await page.mouse.wheel(0, 600); await idle();
  assert.ok(!(await tipShown()), 'the tip goes when the view zooms away');
  for (const dx of [0, 3, -3]) { await page.mouse.move(canvas.x + wallAt.sx + dx, canvas.y + wallAt.sy + 1); await page.waitForTimeout(250); }
  await T(() => window.trapla.lookAt(...(() => { const r = window.trapla.result(), w = r.walls[0], i = Math.round((w.i0 + w.i1) / 2); return [r.x[i], r.y[i], 600, 0, 60]; })())); await idle();
  for (const dx of [0, 3, -3, 6, -6]) { await page.mouse.move(canvas.x + wallAt.sx + dx, canvas.y + wallAt.sy); await page.waitForTimeout(250); if (await tipShown()) break; }
  await T(() => window.trapla.setDesign({ category: 'S9.5', speed: 90, pis: [{ x: 8200, y: 9300, r: null }], profileMode: 'auto', vpis: [] })); await idle(1500);
  assert.ok(!(await tipShown()), 'the tip goes when the design changes');
  assert.deepEqual(errors, []);
} finally { await game.close(); }
