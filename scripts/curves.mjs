// Long-curve check with real mouse events: a multi-point curve between two bends is valid, and the
// on-map radius handles (grips, wheel, + / −, max, auto) work and stay in sync with the HUD and undo.
// Bend positions are derived from scripts/demo-design.json, so the check follows the design file.
// Usage: node scripts/curves.mjs [--docs] [outdir]   (screenshots into outdir, default /tmp/trapla-curves;
// --docs writes docs/screenshots/18–23; starts its own Vite dev server)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const DOCS = process.argv.includes('--docs');
const OUT = DOCS ? 'docs/screenshots' : process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/tmp/trapla-curves';
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT ?? 5196); // set PORT when several checkouts run at once
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
const idle = async (ms = 300) => { await page.waitForTimeout(ms); await page.evaluate(() => window.trapla.whenIdle()); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const state = () => page.evaluate(() => ({ d: window.trapla.getDesign(), s: window.trapla.summary() }));
const horiz = (s) => s.violations.filter((v) => ['radius', 'transition', 'arcShort', 'compound'].includes(v.kind));
// wait until the land-cover textures for the current camera are drawn (and photos fetched)
const settle = async () => {
  await page.evaluate(() => new Promise((res) => {
    const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res()));
    requestAnimationFrame(() => requestAnimationFrame(f));
  }));
  await page.waitForTimeout(500); // contour labels are laid out once the camera rests
};
const shot = async (name) => { await settle(); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('saved', `${OUT}/${name}.png`); };
const view = (prefs) => page.evaluate((p) => window.trapla.setView({ contours: false, slope: false, exag: 1, photo: false, ...p }), prefs);
const centre = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

// ---- 1. the owner's case: one bend of the reference design replaced by six points ≈ 120–140 m apart
//         (placed by hand, ± 1 m) along a gentle curve between its neighbours. The bend: a 25–50° turn
//         with the longest legs; the six points lie on the circle tangent to both legs, 700 m of arc.
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const meta = JSON.parse(readFileSync('public/scenarios/d11/meta.json', 'utf8'));
const pts = [{ x: meta.A.xy[0], y: meta.A.xy[1] }, ...design.pis, { x: meta.B.xy[0], y: meta.B.xy[1] }];
const turn = (k) => { // deflection at design bend k (radians, signed) and the shorter leg
  const p = pts[k], q = pts[k + 1], r = pts[k + 2];
  const a = Math.atan2(q.y - p.y, q.x - p.x), b = Math.atan2(r.y - q.y, r.x - q.x);
  return { d: Math.atan2(Math.sin(b - a), Math.cos(b - a)), leg: Math.min(Math.hypot(q.x - p.x, q.y - p.y), Math.hypot(r.x - q.x, r.y - q.y)), a };
};
let K = -1;
for (let k = 0; k < design.pis.length; k++) {
  const t = turn(k);
  if (Math.abs(t.d) > 0.44 && Math.abs(t.d) < 0.87 && (K < 0 || t.leg > turn(K).leg)) K = k;
}
if (K < 0) throw new Error('the demo design has no 25–50° bend for the long-curve check');
const curvePts = (() => {
  const { d, a } = turn(K), c = pts[K + 1], arc = 700, R = arc / Math.abs(d), T = R * Math.tan(Math.abs(d) / 2), side = Math.sign(d);
  // start of the arc on the incoming leg, the centre to its left (d > 0) or right
  const sx = c.x - T * Math.cos(a), sy = c.y - T * Math.sin(a);
  const cx = sx - side * R * Math.sin(a), cy = sy + side * R * Math.cos(a);
  return [0.08, 0.248, 0.416, 0.584, 0.752, 0.92].map((f, j) => {
    const th = a - side * Math.PI / 2 + side * f * Math.abs(d), jitter = [1, -1, 0.5, 1, -0.5, -1][j];
    return [Math.round(cx + (R + jitter) * Math.cos(th)), Math.round(cy + (R + jitter) * Math.sin(th))];
  });
})();
const mid = { x: (curvePts[2][0] + curvePts[3][0]) / 2, y: (curvePts[2][1] + curvePts[3][1]) / 2 };
design.pis.splice(K, 1, ...curvePts.map(([x, y]) => ({ x, y, r: null })));
console.log(`long curve: bend ${K + 1} (${(turn(K).d * 180 / Math.PI).toFixed(0)}°) replaced by six points ${curvePts.map((p) => p.join(',')).join(' ')}`);
await view({});
await page.evaluate((d) => window.trapla.setDesign(d), design);
await idle();
await page.waitForLoadState('networkidle');
let s = await state();
ok(horiz(s.s).length === 0, `six points along a gentle curve: no horizontal violations (${horiz(s.s).map((v) => `${v.title} — ${v.fix}`).join(' | ')})`);
ok(s.s.valid, `design valid, ${(s.s.length / 1000).toFixed(2)} km, ${(s.s.cost.total / 1e9).toFixed(2)} bn CZK`);
const radii = await page.evaluate((K) => window.trapla.result().curves.slice(K, K + 6).map((c) => Math.round(c.rEff)), K);
const minRadius = await page.evaluate(() => Number(document.querySelector('#norms b').textContent.replace(/[^0-9]/g, ''))); // the speed's smallest radius
ok(radii.every((r) => r >= minRadius) && Math.max(...radii) / Math.min(...radii) <= 2, `joined radii ${radii.join(', ')} m`);
await page.evaluate((m) => window.trapla.lookAt(m.x, m.y, 2300, 0, 65), mid);
await idle(300);
await shot('18-long-curve');
await page.evaluate((K) => window.trapla.selectPi(K + 2), K);
await page.evaluate((m) => window.trapla.lookAt(m.x, m.y, 1100, 0, 65), mid);
await idle(300);
const sub = await page.locator('.rlabel small').textContent({ timeout: 5000 }).catch(() => '(no label)');
ok(/one curve with bends/.test(sub), `label of a joined bend: "${sub}"`);
// the profile's curve band shows the joined bends as one stretch; a click on it selects the whole curve
await page.evaluate(() => window.trapla.profileFit());
const chain = await page.evaluate((K) => {
  const r = window.trapla.result(), u = r.curves[K + 2].unit, m = r.curves.filter((c) => c.unit === u);
  return { n: m.length, s0: Math.min(...m.map((c) => c.sStart)), s1: Math.max(...m.map((c) => c.sEnd)), len: r.length, ds: r.ds };
}, K);
const cb = await page.locator('#profile-canvas').boundingBox();
const bandAt = (st) => page.evaluate((st) => window.trapla.profilePoint(st, undefined, true), st);
const bandP = await bandAt((chain.s0 + chain.s1) / 2), bandX = () => bandP.x, bandY = bandP.y;
await page.mouse.click(bandX((chain.s0 + chain.s1) / 2), bandY);
let rg = await page.evaluate(() => window.trapla.range());
ok(chain.n === 6 && rg && Math.abs(rg.s0 - chain.s0) <= 1.5 * chain.ds && Math.abs(rg.s1 - chain.s1) <= 1.5 * chain.ds,
  `clicking the curve band selects the whole compound curve (km ${rg && (rg.s0 / 1000).toFixed(2)}–${rg && (rg.s1 / 1000).toFixed(2)}, curve km ${(chain.s0 / 1000).toFixed(2)}–${(chain.s1 / 1000).toFixed(2)})`);
await page.mouse.move(cb.x + 300, cb.y - 200); // off the profile: no hover marker in the picture
await idle(200);
await shot('19-long-curve-selected');
await page.evaluate(() => { window.trapla.selectRange(null); window.trapla.profileFit(); });
// a point that only wiggles against the curve (3 m off the chord between the 3rd and 4th points, on
// the inside) is left out, and says so
const wig = JSON.parse(JSON.stringify(design));
{
  const p = wig.pis[K + 2], q = wig.pis[K + 3], L = Math.hypot(q.x - p.x, q.y - p.y), side = Math.sign(turn(K).d);
  wig.pis.splice(K + 3, 0, { x: (p.x + q.x) / 2 - side * 3 * (q.y - p.y) / L, y: (p.y + q.y) / 2 + side * 3 * (q.x - p.x) / L, r: null });
}
await page.evaluate(([d, i]) => { window.trapla.setDesign(d); window.trapla.selectPi(i); }, [wig, K + 3]);
await idle();
s = await state();
const left = await page.evaluate((i) => ({ unit: window.trapla.result().curves[i].unit, text: document.querySelector('.rlabel b').textContent, sub: document.querySelector('.rlabel small').textContent, grips: [...document.querySelectorAll('.rgrip')].filter((g) => g.style.display !== 'none').length }), K + 3);
ok(horiz(s.s).length === 0 && left.unit === -1 && left.text === 'left out' && left.grips === 0, `a wiggling point is left out without a violation: "${left.text} — ${left.sub}"`);
await page.mouse.click(bandX((chain.s0 + chain.s1) / 2), bandY);
rg = await page.evaluate(() => window.trapla.range());
ok(rg && Math.abs(rg.s1 - rg.s0 - (chain.s1 - chain.s0)) < 30, `the curve band still reads as one stretch around the left-out point (${rg && (rg.s1 - rg.s0).toFixed(0)} m)`);
await page.evaluate((d) => { window.trapla.selectRange(null); window.trapla.setDesign(d); }, design);
await idle();

// ---- 2. radius handles on a single bend: a turn of ≥ 30° with the longest legs (room for large radii)
// (any original bend but the replaced one and its neighbours; indices after it moved by the five added points)
let I0 = -1;
for (let k = 0; k < pts.length - 2; k++) {
  if (Math.abs(k - K) <= 1) continue;
  const t = turn(k);
  if (Math.abs(t.d) > 0.52 && (I0 < 0 || t.leg > turn(I0).leg)) I0 = k;
}
const I = I0 < 0 ? -1 : I0 > K ? I0 + 5 : I0;
if (I < 0) throw new Error('no ≥ 30° bend away from the long curve');
const PI = design.pis[I];
const MIN_R = await page.evaluate((I) => Math.round(window.trapla.result().curves[I].r), I); // its automatic radius
console.log(`radius handles: bend ${I + 1} at ${PI.x}, ${PI.y} (${(turn(I0).d * 180 / Math.PI).toFixed(0)}°)`);
await page.evaluate(() => window.trapla.selectPi(null));
await page.evaluate((p) => window.trapla.lookAt(p.x, p.y, 1700, 0, 65), PI);
await idle(300);
// click the bend's marker to select it (a click without movement must not move it)
const before = (await state()).d.pis[I];
const pm = await page.locator('.pi').nth(I).boundingBox();
await page.mouse.click(pm.x + pm.width / 2, pm.y + pm.height / 2);
await idle(200);
s = await state();
ok(s.d.pis[I].x === before.x && s.d.pis[I].r === null, 'clicking a bend selects it without changing it');
ok(await page.locator('.rgrip').first().isVisible() && await page.locator('.rlabel').isVisible(), 'grips and radius label appear on the selected bend');
ok((await page.locator('.rlabel b').textContent()) === `R ${MIN_R.toLocaleString('en-US')} m`, `label shows the automatic radius (${await page.locator('.rlabel b').textContent()})`);
// drag the first grip away from the bend, along the leg
const piC = await centre('.pi.sel'), g0 = await centre('.rgrip');
const ux = (g0.x - piC.x) / Math.hypot(g0.x - piC.x, g0.y - piC.y), uy = (g0.y - piC.y) / Math.hypot(g0.x - piC.x, g0.y - piC.y);
await page.mouse.move(g0.x, g0.y);
await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(g0.x + ux * 9 * k, g0.y + uy * 9 * k);
await idle(200);
s = await state();
const rDrag = s.d.pis[I].r;
ok(rDrag > 400, `dragging a grip along the leg enlarges the radius (${rDrag} m)`);
ok((await page.locator('.rlabel b').textContent()) === `R ${rDrag.toLocaleString('en-US')} m`, 'label follows the drag');
ok(Number(await page.locator('#pi-r').inputValue()) === rDrag, 'HUD radius field in sync while dragging');
await shot('20-radius-handle');
await page.mouse.up();
await idle(200);
const g1 = await centre('.rgrip');
ok(Math.hypot(g1.x - (g0.x + ux * 90), g1.y - (g0.y + uy * 90)) < 12, 'the grip stays under the cursor');
await page.keyboard.press('Control+z');
await idle(200);
ok((await state()).d.pis[I].r === null, 'one undo step takes the whole drag back');
// wheel over the selected bend (a real wheel event, then a quick burst: one undo step)
await page.mouse.move(piC.x, piC.y);
await page.mouse.wheel(0, -100);
await idle(700);
s = await state();
const rWheel = s.d.pis[I].r;
ok(rWheel > MIN_R && rWheel < MIN_R * 1.15, `mouse wheel on the bend changes the radius instead of zooming (${rWheel} m)`);
await page.evaluate(() => {
  const el = document.querySelector('.pi.sel');
  for (let k = 0; k < 4; k++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
});
await idle(700);
s = await state();
const rBurst = s.d.pis[I].r;
ok(rBurst > rWheel * 1.15, `a burst of four notches (${rBurst} m)`);
await page.keyboard.press('+');
await idle(700);
s = await state();
ok(s.d.pis[I].r > rBurst, `+ key enlarges it (${s.d.pis[I].r} m)`);
await page.keyboard.press('Control+z');
await idle(100);
ok((await state()).d.pis[I].r === rBurst, 'undo takes the key step back');
await page.keyboard.press('Control+z');
await idle(100);
ok((await state()).d.pis[I].r === rWheel, 'the wheel burst is one undo step');
await page.keyboard.press('Control+z');
await idle(200);
ok((await state()).d.pis[I].r === null, 'and the first notch another');
// largest radius that fits, back to auto
await page.click('.rlabel .rmax');
await idle(300);
s = await state();
const rMax = s.d.pis[I].r;
ok(rMax > 1000 && horiz(s.s).length === 0, `"max" sets the largest radius that fits (${rMax} m), still no horizontal violations`);
const over = await page.evaluate(([i, r]) => { const t = window.trapla, d = t.getDesign(); d.pis[i].r = r; t.setDesign(d); return t.whenIdle().then(() => t.summary().violations.map((v) => `${v.title} — ${v.fix}`)); }, [I, Math.round(rMax * 1.03)]);
ok(over.some((m) => /bend/.test(m)), `3 % more does not fit: "${over[0]}"`);
await page.keyboard.press('Control+z');
await idle(300);
await page.evaluate((p) => window.trapla.lookAt(p.x, p.y, 3000, 0, 65), PI);
await idle(300);
await shot('21-radius-max');
await page.click('.rlabel .rauto');
await idle(300);
ok((await state()).d.pis[I].r === null, '"auto" returns to the automatic radius');

// ---- 3. history stays intact around uncommitted wheel steps, and a drag gives way to outside changes
await page.evaluate((p) => window.trapla.lookAt(p.x, p.y, 1700, 0, 65), PI);
await idle(300);
await page.keyboard.press('+');
await idle(700); // committed
const rPlus = (await state()).d.pis[I].r;
const notch = () => page.evaluate(() => document.querySelector('.pi.sel').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })));
await notch();
const rT = (await state()).d.pis[I].r;
await page.keyboard.press('Control+z'); // within the 500 ms debounce
ok((await state()).d.pis[I].r === rPlus, `undo right after a wheel step takes back just that step (${rT} → ${(await state()).d.pis[I].r} m)`);
await page.waitForTimeout(800);
await page.keyboard.press('Control+y');
ok((await state()).d.pis[I].r === rT, `… and redo still brings it back (${(await state()).d.pis[I].r} m)`);
await notch();
await page.evaluate((I) => { const t = window.trapla, d = t.getDesign(); d.pis[I].r = 600; t.setDesign(d); }, I); // replaced from outside
await page.waitForTimeout(800);
await page.keyboard.press('Control+z');
ok((await state()).d.pis[I].r === rT, 'a design replaced from outside is not committed a second time by the pending wheel step');
await page.keyboard.press('Control+y');
await idle(300);
const gA = await centre('.rgrip'), pA = await centre('.pi.sel');
const vx = (gA.x - pA.x) / Math.hypot(gA.x - pA.x, gA.y - pA.y), vy = (gA.y - pA.y) / Math.hypot(gA.x - pA.x, gA.y - pA.y);
await page.mouse.move(gA.x, gA.y);
await page.mouse.down();
await page.mouse.move(gA.x + vx * 20, gA.y + vy * 20);
await page.mouse.move(gA.x + vx * 40, gA.y + vy * 40);
ok((await state()).d.pis[I].r > 600, `grip drag in progress (${(await state()).d.pis[I].r} m)`);
await page.evaluate((I) => { const t = window.trapla, d = t.getDesign(); d.pis[I].r = 900; t.setDesign(d); }, I);
await page.mouse.move(gA.x + vx * 60, gA.y + vy * 60);
await page.mouse.move(gA.x + vx * 80, gA.y + vy * 80);
await page.mouse.up();
await idle(300);
ok((await state()).d.pis[I].r === 900, `a design replaced during the drag ends the drag (${(await state()).d.pis[I].r} m)`);
// Esc while dragging cancels the drag: the radius is back, nothing new to undo
const gB = await centre('.rgrip');
await page.mouse.move(gB.x, gB.y);
await page.mouse.down();
await page.mouse.move(gB.x + vx * 25, gB.y + vy * 25);
await page.mouse.move(gB.x + vx * 50, gB.y + vy * 50);
const rMid = (await state()).d.pis[I].r;
await page.keyboard.press('Escape');
await page.mouse.move(gB.x + vx * 70, gB.y + vy * 70);
await page.mouse.up();
await idle(300);
ok(rMid > 900 && (await state()).d.pis[I].r === 900 && await page.locator('.rlabel').isVisible(), `Esc during a drag restores the radius (${rMid} → ${(await state()).d.pis[I].r} m), the bend stays selected`);
await page.keyboard.press('Control+z');
await idle(200);
ok((await state()).d.pis[I].r === 600, 'the cancelled drag left no undo step behind (undo goes to the design before the replaced one)');
await page.keyboard.press('Control+y');
await idle(200);
await page.mouse.move(pA.x + 200, pA.y + 200);
await page.mouse.down();
await page.mouse.move(pA.x + 230, pA.y + 215);
await page.mouse.up();
await idle(300);
ok((await state()).d.pis[I].r === 900 && (await state()).d.pis.length === design.pis.length, 'map controls work again after the aborted drag (pan, no stray edit)');

// ---- 4. relief exaggeration, contours, aerial photo: handles sit on the road, picking and dragging still agree
await page.evaluate(([d, I]) => { window.trapla.setDesign(d); window.trapla.selectPi(I); }, [(() => { const d = JSON.parse(JSON.stringify(design)); d.pis[I].r = 700; return d; })(), I]);
await idle();
for (const [exag, prefs] of [[1, {}], [2, { contours: true, photo: true }], [3, { contours: true }]]) {
  await view({ exag, ...prefs });
  await page.evaluate((p) => window.trapla.lookAt(p.x, p.y, 1700, 20, 55), PI);
  await idle(300);
  await settle();
  // the terrain point under each handle must be the handle's point on the road (to within the cut / fill there)
  const off = await page.evaluate((I) => {
    const t = window.trapla, r = t.result(), c = r.curves[I], d = t.getDesign();
    const at = (s) => { const k = Math.round(s / r.ds); return { x: r.x[k], y: r.y[k], h: Math.abs(r.grade[k] - r.ground[k]) }; };
    const under = (el) => { const b = el.getBoundingClientRect(); return t.pick(b.x + b.width / 2, b.y + b.height / 2); };
    const grips = [...document.querySelectorAll('.rgrip')].map((g, k) => { const p = under(g), q = at(k ? c.sEnd : c.sStart); return p ? [Math.hypot(p.x - q.x, p.y - q.y), q.h] : null; });
    const m = under(document.querySelector('.pi.sel'));
    return { grips, pi: m ? Math.hypot(m.x - d.pis[I].x, m.y - d.pis[I].y) : null };
  }, I);
  ok(off.pi !== null && off.pi < 6 && off.grips.every((g) => g && g[0] < 8 + 2.5 * exag * g[1]),
    `relief ${exag}×${prefs.contours ? ' + contours' : ''}${prefs.photo ? ' + photo' : ''}: bend marker ${off.pi?.toFixed(1)} m and grips ${off.grips.map((g) => g && `${g[0].toFixed(1)} m (road ${g[1].toFixed(1)} m off the ground)`).join(', ')} from the terrain under them`);
  // drag a grip 60 px along its leg: it stays under the cursor and the radius grows
  const p0 = await centre('.pi.sel'), q0 = await centre('.rgrip');
  const wx = (q0.x - p0.x) / Math.hypot(q0.x - p0.x, q0.y - p0.y), wy = (q0.y - p0.y) / Math.hypot(q0.x - p0.x, q0.y - p0.y);
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(q0.x + wx * 10 * k, q0.y + wy * 10 * k);
  await idle(200);
  if (exag === 3) await shot('22-radius-handle-relief-3x-contours');
  await page.mouse.up();
  await idle(200);
  const q1 = await centre('.rgrip');
  const rNow = (await state()).d.pis[I].r;
  // the grip is drawn on the road, the cursor ray hits the (exaggerated) terrain beside it: in a cut or on
  // an embankment the two part by a few pixels more per step of relief
  ok(rNow > 700 && Math.hypot(q1.x - (q0.x + wx * 60), q1.y - (q0.y + wy * 60)) < 12 + 4 * (exag - 1), `relief ${exag}×: the dragged grip stays under the cursor (R ${rNow} m, ${Math.hypot(q1.x - (q0.x + wx * 60), q1.y - (q0.y + wy * 60)).toFixed(1)} px off)`);
  if (exag === 2) {
    await page.evaluate((m) => window.trapla.lookAt(m.x, m.y, 1300, 0, 50), mid); await page.evaluate((i) => window.trapla.selectPi(i), K + 2);
    await idle(300); await shot('23-long-curve-relief-2x-photo'); await page.evaluate((I) => window.trapla.selectPi(I), I);
  }
  await page.keyboard.press('Control+z');
  await idle(200);
}
await view({});
ok(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close(); await server.close();
