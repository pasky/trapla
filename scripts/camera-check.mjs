// The map camera as a first-time player uses it (playtest-qa S1 #15, #19, and the Voletiny / empty-sky
// reports), with real mouse input on D11: wheel zoom low over the horizon, a zoom near Voletiny after
// panning over hills, a long pan, a turn, a profile click from a low view, panning off the map and
// "Whole route" back, and no overprinted place or wall labels.
// CHROME=/usr/bin/chromium PORT=5268 node scripts/camera-check.mjs [--shots dir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const port = Number(process.env.PORT ?? 5268);
const shotsAt = process.argv.indexOf('--shots'), shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failed++; };
const T = (f, a) => page.evaluate(f, a);
const idle = async (ms = 300) => { await T(() => window.trapla.whenIdle()); await page.waitForTimeout(ms); };
const pose = () => T(() => window.trapla.cameraPose());
/** wait until the camera has stopped (a flight takes a few frames; software rendering on a busy host draws
 * slowly, so a fixed pause measured it mid-flight) and a frame has been drawn since */
const still = async () => {
  let last = '', same = 0;
  for (let k = 0; k < 150 && same < 3; k++) {
    await page.waitForTimeout(150);
    const now = JSON.stringify(await T(() => { const p = window.trapla.cameraPose(), t = window.trapla.cameraTarget(); return [p.distance, p.pitch, t.x, t.y].map(v => Math.round(v * 100)); }));
    same = now === last ? same + 1 : 0; last = now;
  }
  await T(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
let n = 0;
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${String(n++).padStart(2, '0')}-${name}.png` }); };
try {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('fresh')) { localStorage.clear(); localStorage.setItem('trapla.intro.v1', '1'); sessionStorage.setItem('fresh', '1'); } } catch { /* opaque */ } });
  await page.goto(`http://localhost:${port}/?scenario=d11`);
  await page.waitForFunction(() => window.trapla, null, { timeout: 120000 }); await idle(800);
  const box = await page.locator('#view canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const pis = async () => (await T(() => window.trapla.getDesign())).pis.length;
  const pis0 = await pis();
  const drag = async (dx, dy, button = 'left', x = cx, y = cy) => {
    await page.mouse.move(x, y); await page.mouse.down({ button });
    for (let k = 1; k <= 12; k++) { await page.mouse.move(x + dx * k / 12, y + dy * k / 12); await page.waitForTimeout(16); }
    await page.mouse.up({ button }); await idle(200);
  };
  const wheel = async (dy, times, x = cx, y = cy) => { await page.mouse.move(x, y); for (let k = 0; k < times; k++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(30); } await idle(200); };
  // (drags start beside the road: they move the view, not the road)
  const offRoad = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.75 };

  // 1. Voletiny: pan over the hills, then zoom in as far as the wheel goes
  await T(() => window.trapla.lookAt(8679, 9786, 1500, 30, 35)); await idle();
  for (const [dx, dy] of [[0, -250], [-250, 0], [0, 250]]) await drag(dx, dy, 'left', offRoad.x, offRoad.y);
  await wheel(-300, 30);
  let p = await pose();
  ok(Math.abs(p.targetAboveGround) < 5, `after panning over hills the view centre is on the ground (target ${p.targetAboveGround.toFixed(0)} m above it)`);
  ok(p.distance < 120, `the wheel zooms in close to the ground near Voletiny (${p.distance.toFixed(0)} m from the view centre, camera ${p.aboveGround.toFixed(0)} m above the ground)`);
  await shot('voletiny-zoomed');

  // 2. low over the horizon: the wheel still zooms, a drag pans a sensible distance, a turn keeps the subject
  await T(() => window.trapla.lookAt(9500, 11000, 1500, 200, 8)); await idle();
  p = await pose();
  ok(p.pitch > 12, `the view cannot be tilted down to the horizon (looks down ${p.pitch.toFixed(0)}°)`);
  const t0 = await T(() => window.trapla.cameraTarget());
  await drag(0, 300, 'left', offRoad.x, offRoad.y);
  const t1 = await T(() => window.trapla.cameraTarget());
  const moved = Math.hypot(t1.x - t0.x, t1.y - t0.y);
  ok(moved > 20 && moved < 1500, `low view: a 300 px drag pans ${moved.toFixed(0)} m, not kilometres`);
  const d0 = p.distance;
  await wheel(-300, 5);
  p = await pose();
  ok(p.distance < d0 * 0.6, `low view: five wheel notches zoom in (${d0.toFixed(0)} → ${p.distance.toFixed(0)} m)`);
  await shot('low-zoomed');
  const subject = await T(() => { const t = window.trapla.cameraTarget(); return { x: t.x, y: t.y, z: window.trapla.groundHeight(t.x, t.y) }; });
  await drag(300, 0, 'right', offRoad.x, offRoad.y);
  const seen = await T((s) => window.trapla.project(s.x, s.y, s.z), subject);
  ok(seen.vis && Math.abs(seen.sx - box.width / 2) < 60 && Math.abs(seen.sy - box.height / 2) < 60, `a right-drag turn keeps the view centre in place (${seen.sx.toFixed(0)}, ${seen.sy.toFixed(0)} px)`);
  await shot('turned');

  // 3. a click in the profile from a low view: the place is looked down on, mid-screen
  await T(() => window.trapla.lookAt(9500, 11000, 1500, 200, 8)); await idle();
  await T(() => window.trapla.profileFit()); await page.waitForTimeout(100);
  const at = await T(() => window.trapla.profilePoint(12000));
  await page.mouse.click(at.x, at.y - 40);
  // (a flight takes a few frames; software rendering on a busy host draws slowly)
  await page.waitForFunction(() => window.trapla.cameraPose().pitch > 20, null, { timeout: 15000 }).catch(() => {});
  await idle(300); await still();
  p = await pose();
  ok(p.pitch >= 30, `a profile click from a low view looks down on the place (${p.pitch.toFixed(0)}°)`);
  const road = await T(() => { const r = window.trapla.range(); return r && window.trapla.roadScreen((r.s0 + r.s1) / 2); });
  ok(road && road.vis && road.sy > box.height * 0.2 && road.sy < box.height * 0.8, `the clicked place is mid-screen (${road?.sy.toFixed(0)} px of ${box.height})`);
  await shot('profile-fly');

  // 3b. from the whole-route overview: a click in the profile frames the piece picked (it was too small to see)
  await page.getByRole('button', { name: /Whole route/ }).click(); await idle(600);
  const far0 = (await pose()).distance;
  await T(() => window.trapla.profileFit()); await page.waitForTimeout(100);
  const at2 = await T(() => window.trapla.profilePoint(6000));
  await page.mouse.click(at2.x, at2.y - 40);
  await page.waitForFunction((d) => window.trapla.cameraPose().distance < d * 0.5, far0, { timeout: 15000 }).catch(() => {});
  await idle(300); await still();
  const piece = await T(() => { const r = window.trapla.range(); if (!r) return null; const a = window.trapla.roadScreen(r.s0), b = window.trapla.roadScreen(r.s1); return { a, b, len: r.s1 - r.s0 }; });
  const ext = piece ? Math.hypot(piece.a.sx - piece.b.sx, piece.a.sy - piece.b.sy) : 0;
  ok(!!piece && piece.a.vis && piece.b.vis && ext >= Math.min(box.width, box.height) / 6,
    `from the overview a profile click frames the piece picked (${piece?.len.toFixed(0)} m long, ${ext.toFixed(0)} px on screen; view ${far0.toFixed(0)} → ${(await pose()).distance.toFixed(0)} m)`);
  await shot('overview-profile-fly');

  // 4. pan away past the map's edge (and towards what is behind the camera): the view stays on the map
  await T(() => window.trapla.lookAt(9500, 11000, 3000, 0, 20)); await idle();
  for (let k = 0; k < 12; k++) await drag(0, 400, 'left', offRoad.x, box.y + box.height * 0.3);
  p = await pose();
  ok(Math.abs(p.targetAboveGround) < 5, `after panning off the map the view centre is still on the ground (${p.targetAboveGround.toFixed(0)} m)`);
  await shot('panned-away');
  await page.getByRole('button', { name: /Whole route/ }).click(); await idle(600);
  const ends = await T(() => { const r = window.trapla.result(); return [window.trapla.project(r.x[0], r.y[0], r.grade[0]), window.trapla.project(r.x[r.n - 1], r.y[r.n - 1], r.grade[r.n - 1])]; });
  ok(ends.every(e => e.vis && e.sx > 0 && e.sx < box.width && e.sy > 0 && e.sy < box.height), `"Whole route" brings both ends of the road into view (${ends.map(e => `${e.sx.toFixed(0)},${e.sy.toFixed(0)}`).join(' / ')})`);
  await shot('whole-route');

  // 5. labels: no two shown place names overlap; low over the horizon none pile up there
  const overlaps = (sel) => T((sel) => {
    const r = [...document.querySelectorAll(sel)].filter(e => e.style.display !== 'none' && e.offsetParent !== null).map(e => e.getBoundingClientRect());
    let k = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
      if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) k++;
    return { shown: r.length, overlaps: k };
  }, sel);
  // (and none under the map's own buttons and legends)
  const underUi = () => T(() => {
    const ui = [...document.querySelectorAll('#view > *:not(#overlay):not(canvas), .scenario-picker-return')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect());
    return [...document.querySelectorAll('.place, .official-label')].filter(e => e.style.display !== 'none' && e.offsetParent !== null)
      .map(e => e.getBoundingClientRect()).filter(r => ui.some(u => r.left < u.right && u.left < r.right && r.top < u.bottom && u.top < r.bottom)).length;
  });
  ok(await underUi() === 0, 'whole route: no place name or official-line label under the map\'s buttons or legend');
  let places = await overlaps('.place, .official-label, .endpoint');
  ok(places.shown > 3 && places.overlaps === 0, `whole route: ${places.shown} place names, none overprinted (${places.overlaps})`);
  await T(() => window.trapla.lookAt(9500, 11000, 1500, 200, 8)); await idle();
  places = await overlaps('.place, .official-label, .endpoint');
  ok(await underUi() === 0, 'low view: no place name or official-line label under the map\'s buttons or legend');
  ok(places.overlaps === 0, `low view: ${places.shown} place names, none overprinted (${places.overlaps})`);
  await shot('low-labels');
  // noise view: wall heights from afar
  await page.keyboard.press('n'); await idle(800);
  await T(() => { const r = window.trapla.result(); const w = r.walls[Math.floor(r.walls.length / 2)]; const i = Math.round((w.i0 + w.i1) / 2); window.trapla.lookAt(r.x[i], r.y[i], 3500, 0, 60); });
  await idle(300); await still();
  // (a label is hidden until a frame has placed it: wait for that frame, then they must not print over each other)
  await page.waitForFunction(() => [...document.querySelectorAll('.wall-label')].some(e => e.style.display !== 'none'), null, { timeout: 15000 }).catch(() => {});
  const walls = await overlaps('.wall-label');
  ok(walls.shown > 0 && walls.overlaps === 0, `noise view from afar: ${walls.shown} wall labels, none overprinted (${walls.overlaps})`);
  await shot('wall-labels');
  await page.keyboard.press('n'); await idle(300);
  ok(await pis() === pis0, 'none of these view moves bent the road');
  // a selected bend shows its two straights near it, solid (not a dashed line along the road like the official one)
  await T(() => window.trapla.setDesign({ category: 'S9.5', speed: 90, pis: [{ x: 8200, y: 9300, r: null }], profileMode: 'auto', vpis: [] })); await idle(1500);
  await T(() => window.trapla.selectPi(0)); await page.getByRole('button', { name: /Whole route/ }).click(); await idle(600);
  await shot('bend-selected');
  ok(errors.length === 0, `no browser errors ${errors.join(' | ')}`);
} finally { await browser.close(); await server.close(); }
if (failed) { console.log(`${failed} FAILED`); process.exitCode = 1; }
