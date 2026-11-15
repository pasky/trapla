// Map zoom with trusted wheel events (CDP): a trackpad pinch (ctrl + small pixel deltas) and a mouse wheel
// change the camera distance by a sane factor per event, the same zooming out as in, right after a
// violation click (camera close, the bend selected under the screen centre), after a profile click's glide
// (and a wheel during the glide stops it), anywhere on the screen, and close to the minimum distance.
// node scripts/zoom.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5201);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const T = (fn, arg) => page.evaluate(fn, arg);
const frames = () => T(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await T(() => window.trapla.whenIdle());
  // the demo route with hand-set 50 m radii: bend violations to click
  const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
  await T((d) => { for (const p of d.pis) p.r = 50; window.trapla.setDesign(d); }, design);
  await T(() => window.trapla.whenIdle());
  const cdp = await page.context().newCDPSession(page);
  const view = await page.locator('#view').boundingBox();
  const centre = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const dist = () => T(() => window.trapla.cameraDistance());
  const wheel = (at, dy, pinch) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: dy, modifiers: pinch ? 2 : 0 });
  /** geometric mean distance factor per event over n events */
  const factor = async (at, dy, pinch, n = 4) => {
    const d0 = await dist();
    for (let k = 0; k < n; k++) await wheel(at, dy, pinch);
    await frames();
    return ((await dist()) / d0) ** (1 / n);
  };
  // a pinch's fingers ≈ 3 % per event of deltaY 3, a wheel notch (100 px) 10–50 %; out as fast as in
  const sane = async (tag, at) => {
    // the ground under the cursor stays under it
    const q0 = await T(({ x, y }) => window.trapla.pick(x, y), at);
    await factor(at, -3, true, 8);
    const q1 = await T(({ x, y }) => window.trapla.pick(x, y), at);
    await factor(at, 3, true, 8);
    const slip = Math.hypot(q1.x - q0.x, q1.y - q0.y), d = await dist();
    ok(slip < d * 0.02, `${tag}: the ground under the cursor stays there (${slip.toFixed(1)} m off at ${d.toFixed(0)} m)`);
    const pin = await factor(at, -3, true), pout = await factor(at, 3, true);
    const win = await factor(at, -100, false), wout = await factor(at, 100, false);
    ok(pin > 0.94 && pin < 0.985 && pout > 1.015 && pout < 1.06 && Math.abs(pin * pout - 1) < 0.005,
      `${tag}: a pinch zooms in ×${pin.toFixed(3)} and out ×${pout.toFixed(3)} per event`);
    ok(win > 0.67 && win < 0.91 && wout > 1.1 && wout < 1.5 && Math.abs(win * wout - 1) < 0.005,
      `${tag}: a wheel notch zooms in ×${win.toFixed(3)} and out ×${wout.toFixed(3)}`);
  };

  // 1. right after a violation click: the camera is close and the selected bend sits under the centre
  await T(() => document.getElementById('chip-viol').click());
  const li = page.locator('#viol li[data-k]').first();
  await li.click();
  await frames();
  const d0 = await dist(), under = await T(([x, y]) => document.elementFromPoint(x, y)?.className ?? '', [centre.x, centre.y]);
  ok(d0 < 3000, `a violation click brings the camera close (${d0.toFixed(0)} m, "${under}" under the centre)`);
  await sane('after a violation click, cursor off-centre', { x: centre.x + 200, y: centre.y - 150 });
  await sane('cursor near the top of the map', { x: centre.x, y: view.y + 40 });
  const bend = await T(() => { const el = document.querySelector('.pi.sel'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ok(bend && /\bpi sel\b/.test(await T(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', bend ?? {})), 'the clicked violation selects its bend');
  if (bend) {
    const r0 = (await T(() => window.trapla.getDesign())).pis.map((p) => p.r).join();
    const f = await factor(bend, 3, true), w = await factor(bend, 100, false, 2);
    ok(f > 1.015 && w > 1.1 && (await T(() => window.trapla.getDesign())).pis.map((p) => p.r).join() === r0,
      `a pinch (×${f.toFixed(3)}) and a wheel notch (×${w.toFixed(3)}) over the selected bend zoom the map, the radius stays`);
  }

  // 2. a long zoom out from the minimum distance is as fast as the fingers move
  await li.click();
  await frames();
  for (let k = 0; k < 20; k++) await wheel({ x: centre.x + 150, y: centre.y + 100 }, -100, false);
  await frames();
  const near = await dist();
  let n = 0;
  while ((await dist()) < 20000 && n < 400) { await wheel({ x: centre.x + 150, y: centre.y + 100 }, 4, true); n++; }
  // Chrome reports a pinch as deltaY ≈ 100·ln(finger scale): the map follows the fingers when the deltas
  // sum to about 100·ln(20000 / near) (OrbitControls' own wheel zoom needed twice as many)
  const need = 100 * Math.log(20000 / near) / 4;
  ok(near < 100 && n < need * 1.15, `from ${near.toFixed(0)} m out to 20 km takes ${n} pinch events of deltaY 4 (fingers: ${need.toFixed(0)})`);

  // 3. after a profile click's glide; a wheel during the glide stops it
  const station = (s) => T((s) => { const r = window.trapla.result(), i = Math.round(s / r.ds); return { x: r.x[i], y: r.y[i] }; }, s);
  const target = () => T(() => window.trapla.cameraTarget());
  const profileClick = async (s) => {
    await T(() => window.trapla.profileFit());
    await T(() => window.trapla.whenIdle());
    const p = await T((s) => window.trapla.profilePoint(s), s);
    await page.mouse.click(p.x, p.y - 60);
  };
  await profileClick(16000);
  const at = await station(16000);
  let t1 = await target();
  for (let k = 0; k < 50 && Math.hypot(t1.x - at.x, t1.y - at.y) > 50; k++) { await page.waitForTimeout(100); t1 = await target(); }
  ok(Math.hypot(t1.x - at.x, t1.y - at.y) < 50, 'a profile click glides the map there');
  await sane('after a profile click', { x: centre.x - 250, y: centre.y + 120 });

  // the wheel lands in the same task as the click (software rendering may finish a timed glide before a
  // separately sent event arrives): the glide has only just started
  await T(() => window.addEventListener('pointerup', () => {
    document.querySelector('#view canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: innerWidth / 3, clientY: innerHeight / 2, bubbles: true, cancelable: true }));
  }, { once: true }));
  await profileClick(6000);
  const to = await station(6000);
  const g0 = { d: await dist(), t: await target() };
  await page.waitForTimeout(700);
  await frames();
  const g1 = { d: await dist(), t: await target() };
  const moved = Math.hypot(g1.t.x - g0.t.x, g1.t.y - g0.t.y), left = Math.hypot(g1.t.x - to.x, g1.t.y - to.y);
  ok(Math.hypot(t1.x - to.x, t1.y - to.y) > 1000 && left > 1000 && moved < 1 && Math.abs(g1.d / g0.d - 1) < 0.001,
    `a wheel during the glide stops it (target ${left.toFixed(0)} m short of the clicked spot, moves ${moved.toFixed(1)} m, distance ${g0.d.toFixed(0)} → ${g1.d.toFixed(0)} m)`);

  // 4. a ctrl-wheel (pinch) over the HUD does not zoom the page itself
  const pageZoom = await T(() => document.getElementById('hud').dispatchEvent(new WheelEvent('wheel', { deltaY: -3, ctrlKey: true, bubbles: true, cancelable: true })));
  ok(pageZoom === false, 'a pinch over the HUD is kept from zooming the page');
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
