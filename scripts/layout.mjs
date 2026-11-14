// Layout check: the profile panel keeps its size (viewport width − HUD × 300 px) through window resizes,
// range selection / Esc, view option toggles and hovering; its station range follows the route's
// length while fitted. Logs every step; screenshots into $OUT (default /tmp/trapla-layout).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5205);
const OUT = process.env.OUT ?? '/tmp/trapla-layout';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => { console.log('pageerror', e.message); process.exitCode = 1; });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.trapla.whenIdle());
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const HUD_W = 360, PROFILE_H = 300;
let vw = 1600, vh = 1000;
const measure = () => page.evaluate(() => {
  const b = (id) => document.getElementById(id).getBoundingClientRect();
  const v = window.trapla.profileView?.(), L = window.trapla.result()?.length ?? 0;
  return { profile: b('profile'), canvas: b('profile-canvas'), hud: b('hud'), view: v, length: L };
});
const step = async (tag) => {
  await page.waitForTimeout(200);
  const m = await measure();
  const pv = m.view ? ` · profile shows ${m.view.v0.toFixed(0)}–${m.view.v1.toFixed(0)} of ${m.length.toFixed(0)} m` : '';
  console.log(`  ${tag.padEnd(26)} profile ${Math.round(m.profile.width)}×${Math.round(m.profile.height)} canvas ${Math.round(m.canvas.width)}×${Math.round(m.canvas.height)} hud right edge ${Math.round(m.hud.right)}${pv}`);
  ok(Math.abs(m.profile.width - (vw - HUD_W)) < 1.5 && Math.abs(m.profile.height - PROFILE_H) < 1.5 && Math.abs(m.hud.right - vw) < 1.5,
    `${tag}: profile ${vw - HUD_W}×${PROFILE_H}, HUD inside the window`);
  return m;
};
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await step('initial'); await shot('01-initial');
const L = await page.evaluate(() => window.trapla.result().length);
await page.evaluate((L) => window.trapla.selectRange(L * 0.3, L * 0.45), L);
await step('range selected'); await shot('02-range');
const cb = await page.locator('#profile-canvas').boundingBox();
await page.mouse.move(cb.x + cb.width * 0.4, cb.y + cb.height * 0.85);
await step('hover cost strip');
await page.mouse.move(cb.x + cb.width * 0.4, cb.y - 200);
await page.keyboard.press('Escape');
await step('Esc'); await shot('03-esc');
for (const [w, h] of [[1000, 700], [700, 600], [1600, 1000], [1280, 800], [1600, 1000]]) {
  vw = w; vh = h;
  await page.setViewportSize({ width: w, height: h });
  await step(`resized to ${w}×${h}`); await shot(`04-${w}x${h}`);
}
for (const k of ['c', 's', 'e', 'e', 'e', 's', 'c']) { await page.keyboard.press(k); await page.waitForTimeout(100); }
await step('view options toggled');
await page.evaluate((L) => window.trapla.selectRange(L * 0.1, L * 0.9), L);
await step('long range selected');
await page.keyboard.press('Escape');
await step('Esc again'); await shot('05-end');

// the route's length jumps (a far bend): a fitted profile follows it, a zoomed one keeps its span
const [A, B] = await page.evaluate(() => [window.trapla.A, window.trapla.B]);
const off = (t, d) => { const dx = B.x - A.x, dy = B.y - A.y, n = Math.hypot(dx, dy); return { x: A.x + dx * t - (dy / n) * d, y: A.y + dy * t + (dx / n) * d }; };
const setPis = async (pis, tag) => {
  await page.evaluate((pis) => { const d = window.trapla.getDesign(); d.pis = pis; window.trapla.setDesign(d); }, pis);
  await page.evaluate(() => window.trapla.whenIdle());
  return step(tag);
};
const whole = (m) => m.view.v0 === 0 && Math.abs(m.view.v1 - m.length) < 0.5;
await page.evaluate(() => window.trapla.profileFit());
let m = await setPis([off(0.5, 300)], 'small bend');
ok(whole(m), 'fitted profile shows the whole route');
m = await setPis([off(0.5, 3000)], 'far bend (+5 % length)'); await shot('06-far-bend');
ok(whole(m), 'fitted profile follows the longer route');
m = await setPis([off(0.5, 300)], 'back to the small bend');
ok(whole(m), 'and the shorter one');
await page.evaluate(() => window.trapla.profileFocus(5000, 5200));
const z = await step('zoomed (violation click)');
m = await setPis([off(0.5, 3000)], 'far bend while zoomed');
ok(Math.abs(m.view.v1 - m.view.v0 - (z.view.v1 - z.view.v0)) < 0.5, 'a zoomed profile keeps its span');
await page.click('#fit');
m = await step('Fit');
ok(whole(m), 'Fit shows the whole route again');
await browser.close();
await server.close();
