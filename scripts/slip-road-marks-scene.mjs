// A slip road off the D35 to road II/368 with the real mouse (owner report, 2026-11-21: "the start has a solid line on
// the motorway instead of a proper exit lane, the end is a roundabout but not drawn as one, and on Auto a view problem
// that makes no sense across open fields"): Build → Slip road from the carriageway towards Opatovec 300 m before the
// crossing to road II/368; VALID on Auto (model 64 said "No clear view … 145 m to the right" there); its exit lane drawn
// as TP 133 draws it (the dashed line from the taper's start, the gore hatched); its end set to Roundabout on its card,
// the ring drawn; set back to Auto, a T junction with a clear view.
// node scripts/slip-road-marks-scene.mjs [--gpu] [--docs]   (--docs: docs/screenshots/786–789)
import { mkdirSync } from 'node:fs';
import { checker, startGame } from './lib/browser.mjs';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-slip-marks';
mkdirSync(out, { recursive: true });
const { ok } = checker();
const game = await startGame();
const { page } = game;
const shot = async (name) => { await game.park(); await game.frames(3); await page.screenshot({ path: `${out}/${name}.png` }); };
const box = () => page.locator('#view').boundingBox();
const at = async (p) => { const b = await box(), q = await page.evaluate(([x, y, z]) => window.trapla.screenOf(x, y, z), [p.x, p.y, p.z]); return { x: b.x + q.sx, y: b.y + q.sy }; };
const clickAt = async (p) => { const q = await at(p); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.waitForTimeout(150); await page.mouse.click(q.x, q.y); await page.waitForTimeout(200); };
const hoverAt = async (p) => { const q = await at(p); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.waitForTimeout(200); return page.evaluate(() => window.trapla.buildHover()); };
const look = async (p, distance, heading, pitch) => { await page.evaluate(([x, y, d, h, t]) => window.trapla.lookAt(x, y, d, h, t), [p.x, p.y, distance, heading, pitch]); await game.idle(); await game.still(); };
const issues = () => page.evaluate(() => { const r = window.trapla.projectResult(); return { valid: r.valid, list: r.issues.map(i => i.violation.title) }; });
const meshCount = (name) => page.evaluate((name) => { let n = 0; window.trapla.debugView().world.traverse(o => { if (o.name === name) n += o.geometry?.attributes?.position?.count ?? 0; }); return n; }, name);

try {
  await game.open('scenario=d35&preset=d35-stage1-motorway');
  await page.evaluate(() => window.trapla.whenTransport());
  const site = await page.evaluate(() => { const t = window.trapla, r = t.projectResult().routes['route:motorway-forward'].legacy;
    const c = r.crossings.find(c => c.cls === 'secondary');
    let best = null; for (const id of t.sourceIds('secondary', 100)) for (let s = 0; ; s += 5) { const p = t.sourcePoint(id, s); if (!p) break; const d = Math.hypot(p.x - c.x, p.y - c.y); if (!best || d < best.d) best = { id, s, d }; }
    return { s: c.s, x: c.x, y: c.y, road: best.id, at: best.s }; });
  // (the gore of the carriageway towards Opatovec 13 m left of the line, its traffic against the line's stations; the
  // road's stations rise towards that side)
  const gore = (s) => page.evaluate((s) => { const r = window.trapla.projectResult().routes['route:motorway-forward'].legacy, k = Math.round(s / r.ds);
    return { x: r.x[k] - r.ty[k] * 13, y: r.y[k] + r.tx[k] * 13, z: r.grade[k] }; }, s);
  const a = await gore(site.s + 300), b = await page.evaluate(([id, s]) => window.trapla.sourcePoint(id, s), [site.road, site.at + 200]);
  await look(site, 1250, 0, 89);
  await page.locator('#build-route').click();
  await page.locator('.route-build-choices button', { hasText: /^Slip road$/ }).click();
  await page.waitForTimeout(200);
  const ha = await hoverAt(a); await clickAt(a);
  const hb = await hoverAt(b); await clickAt(b); await game.idle();
  ok(/motorway/.test(ha ?? '') && /joins road II\/368/.test(hb ?? ''), `Build → Slip road: ${ha} → ${hb}`);
  const auto = await issues();
  ok(auto.valid && !auto.list.length, `VALID on Auto, a T junction with a clear view (${auto.list.join('; ') || 'no problems'})`);
  // the lane's lines: the dashed one, its outer edge, its paving, then the gore's chevrons
  const lane = await page.evaluate(() => window.trapla.projectResult().works.items.filter(w => w.id.includes(':lane:')).map(w => w.surfaces.length));
  ok(lane.length === 1 && lane[0] > 10, `its exit lane drawn with its gore hatched (${lane[0] - 3} chevrons)`);
  ok(await meshCount('lane-marks') > 100, 'the lane marks are on the motorway');
  await look(await gore(site.s + 240), 90, 0, 89); await shot('786-exit-lane-gore-hatched');
  await look(await gore(site.s + 500), 120, 0, 89); await shot('787-exit-lane-taper-dashed');
  await page.locator('#inspector button', { hasText: /^Roundabout$/ }).first().click(); await game.idle();
  const ring = await issues();
  ok(ring.valid, `set to Roundabout on its card: VALID (${ring.list.join('; ') || 'no problems'})`);
  ok(await page.evaluate(() => window.trapla.projectResult().works.items.some(w => w.ring)), 'the ring is one of its works');
  ok(await meshCount('junction-marks') > 1000, 'the ring is drawn');
  await look(b, 110, 0, 89); await shot('788-slip-road-roundabout');
  await page.keyboard.press('o'); await page.waitForTimeout(500);
  await look(b, 120, 40, 45); await shot('789-slip-road-roundabout-photo');
  await page.keyboard.press('o'); await page.waitForTimeout(300);
  await page.locator('#inspector button', { hasText: /^Auto$/ }).first().click(); await game.idle();
  const back = await issues(), works = await page.evaluate(() => window.trapla.projectResult().works.items.filter(w => w.ring || w.dug).map(w => w.label));
  ok(!works.some(l => /Roundabout/.test(l)) && back.valid, `back on Auto: no ring, VALID (${back.list.join('; ') || 'no problems'}; ${works.join('; ') || 'nothing dug'})`);
  ok(!game.pageErrors.length, `no page errors${game.pageErrors.length ? `: ${game.pageErrors.join('; ')}` : ''}`);
} finally { await game.close(); }
