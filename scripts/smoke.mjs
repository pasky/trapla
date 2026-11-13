// Interaction smoke test with real mouse events: add a PI by clicking, drag it, take over the profile, undo.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5197/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.trapla.whenIdle());
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const st = () => page.evaluate(() => ({ d: window.trapla.getDesign(), s: window.trapla.summary() }));

// 1. click on terrain near the middle of the view → PI added, profile switches from naive to auto
await page.mouse.click(600, 420);
await page.waitForTimeout(300);
await page.evaluate(() => window.trapla.whenIdle());
let s = await st();
ok(s.d.pis.length === 1, `click adds a PI (${s.d.pis.length})`);
ok(s.d.profileMode === 'auto', `first horizontal edit switches the naive profile to auto (${s.d.profileMode})`);
// 2. drag the PI marker
const box = await page.locator('.pi').first().boundingBox();
const p0 = { ...s.d.pis[0] };
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let k = 1; k <= 8; k++) await page.mouse.move(box.x + box.width / 2 + 10 * k, box.y + box.height / 2 + 4 * k);
await page.mouse.up();
await page.waitForTimeout(300);
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(Math.hypot(s.d.pis[0].x - p0.x, s.d.pis[0].y - p0.y) > 20, `drag moves the PI (${(s.d.pis[0].x - p0.x).toFixed(0)}, ${(s.d.pis[0].y - p0.y).toFixed(0)})`);
// 3. profile: drag a VPI → manual
const cb = await page.locator('#profile-canvas').boundingBox();
await page.evaluate(() => window.trapla.profileFit());
const hit = await page.evaluate(() => {
  const r = window.trapla.result();
  const c = document.getElementById('profile-canvas');
  const W = c.clientWidth, H = c.clientHeight;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < r.n; i++) { lo = Math.min(lo, r.ground[i], r.grade[i]); hi = Math.max(hi, r.ground[i], r.grade[i]); }
  for (const v of r.vpis) { lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
  const m = Math.max(8, (hi - lo) * 0.08); lo -= m; hi += m;
  const k = Math.floor(r.vpis.length / 2), v = r.vpis[k];
  return { k, x: 52 + (v.s / r.length) * (W - 66), y: 26 + (1 - (v.z - lo) / (hi - lo)) * (H - 48) };
});
await page.mouse.move(cb.x + hit.x, cb.y + hit.y);
await page.mouse.down();
for (let k = 1; k <= 5; k++) await page.mouse.move(cb.x + hit.x, cb.y + hit.y - 6 * k);
await page.mouse.up();
await page.waitForTimeout(300);
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'manual', `dragging a VPI takes manual control (${s.d.profileMode})`);
// 4. auto button, undo
await page.click('#auto');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'auto', 'Auto profile button restores auto mode');
await page.keyboard.press('Control+z');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'manual', 'Ctrl+Z undoes');
// 5. right-click deletes the PI
const b2 = await page.locator('.pi').first().boundingBox();
await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2, { button: 'right' });
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.pis.length === 0, `right-click deletes a PI (${s.d.pis.length})`);
// 6. persistence
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
s = await st();
ok(s.d.pis.length === 0 && s.d.naive === false, 'design persisted across reload');
ok(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close(); await server.close();
